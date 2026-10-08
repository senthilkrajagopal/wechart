import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { DataSourceRefused, dataSourceStore } from './data-sources';

/**
 * T335: data sources as folder items, their secrets kept sealed.
 * - AC-269: a folder's data sources are listed with their driver.
 * - AC-164, AC-298: a stored secret is never returned, only named as stored;
 *   what is stored is the envelope the browser sealed to xcube's key.
 * - AC-312: changing a field of the connection's target clears its secrets,
 *   and a save then asks for them again; any other change keeps them.
 * - AC-161: a data source's type never changes.
 * - AC-270: a name is unique in its folder.
 * Against the real Postgres, as the other repos are.
 */
const store = () => dataSourceStore(getDb());
/** Every folder a test made one in: emptied after, their secrets with them. */
const folders: string[] = [];
afterAll(async () => {
  if (folders.length > 0)
    await getDb().deleteFrom('data_sources').where('folder_id', 'in', folders).execute();
  await closeDb();
});

/** Sized as a real envelope, as xcube takes one: a 32-byte `enc`, a bucket and a tag of `ct`. */
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}`).toString('base64url'),
});
const folderId = () => {
  const id = `folder-${randomUUID()}`;
  folders.push(id);
  return id;
};
const postgres = (folder: string, name = 'warehouse') => ({
  folderId: folder,
  name,
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
  sealed: { password: sealed('one') },
});

describe('a folder’s data sources (AC-269, AC-164)', () => {
  it('are stored in their folder with their driver, and name their secrets without holding them out', async () => {
    const folder = folderId();
    const made = await store().create(postgres(folder));

    const listed = await store().inFolder(folder);
    expect(listed).toEqual([made]);
    expect(made).toMatchObject({
      folderId: folder,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      secrets: ['password'],
    });
    // Nothing of the envelope in what a listing or a read gives back.
    const said = JSON.stringify([listed, await store().get(made.id)]);
    expect(said).not.toContain(sealed('one').ct);
    expect(said).not.toContain(sealed('one').enc);
  });

  it('keep each envelope exactly as sealed, with a revision, for landing in xcube (T442) alone', async () => {
    const made = await store().create(postgres(folderId()));

    const kept = await store().sealedOf(made.id);
    expect(kept.sealed).toEqual({ password: sealed('one') });
    expect(Object.keys(kept.revisions)).toEqual(['password']);
    expect(kept.revisions['password']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuse a secret sent as a field, storing nothing of it (AC-298)', async () => {
    const folder = folderId();
    const canary = `wcanary-${randomUUID()}`;

    await expect(
      store().create({
        ...postgres(folder),
        fields: { ...postgres(folder).fields, password: canary },
      }),
    ).rejects.toThrow(DataSourceRefused);
    expect(await store().inFolder(folder)).toEqual([]);
    const rows = await getDb()
      .selectFrom('data_sources')
      .selectAll()
      .where('folder_id', '=', folder)
      .execute();
    expect(JSON.stringify(rows)).not.toContain(canary);
  });

  it('refuse a secret sealed to any key but the one wechart gives the browser', async () => {
    // research credential-sealing.md, "Input checks": the kid is the configured one.
    const keyed = dataSourceStore(getDb(), { kid: 'kid-1' });

    await expect(
      keyed.create({
        ...postgres(folderId()),
        sealed: { password: { ...sealed('x'), kid: 'kid-2' } },
      }),
    ).rejects.toThrow('password is sealed to key kid-2, not xcube’s kid-1: seal it again.');
    await expect(keyed.create(postgres(folderId()))).resolves.toMatchObject({
      secrets: ['password'],
    });
  });

  it('refuse a name xcube wouldn’t take, or one the folder already holds (AC-270)', async () => {
    const folder = folderId();
    await store().create(postgres(folder));

    // R72's grammar, upper case allowed, at most 40 (T703, AC-426).
    for (const name of ['order-items', 'a__b', 'x'.repeat(41)])
      await expect(store().create(postgres(folder, name)), name).rejects.toThrow(/name/);
    // Said only as in use, never where (T726, AC-424).
    await expect(store().create(postgres(folder))).rejects.toThrow(
      'The name “warehouse” is already in use.',
    );
    // Another folder may.
    await expect(store().create(postgres(folderId()))).resolves.toMatchObject({
      name: 'warehouse',
    });
  });
});

/**
 * T442: a data source lands in xcube before it is stored, from inside the
 * store's transaction: xcube's refusal, or xcube away, stores nothing.
 */
describe('landing in xcube before it is stored (T442)', () => {
  const refusing = async () => {
    throw new DataSourceRefused(503, 'xcube can’t be reached');
  };

  it('lands a new one whole, with every envelope and its revision, and stores nothing when refused', async () => {
    const folder = folderId();
    const seen: unknown[] = [];
    const made = await store().create(postgres(folder), {
      land: async (source, landed) => {
        seen.push({ source, landed });
      },
    });
    const kept = await store().sealedOf(made.id);
    expect(seen).toEqual([{ source: made, landed: kept }]);

    await expect(store().create(postgres(folder, 'refused'), { land: refusing })).rejects.toThrow(
      'xcube can’t be reached',
    );
    expect((await store().inFolder(folder)).map((each) => each.name)).toEqual(['warehouse']);
  });

  it('lands a change with the envelopes it keeps and the new ones, and changes nothing when refused', async () => {
    const made = await store().create({
      ...postgres(folderId()),
      authMethod: 'client-certificate',
      fields: { ...postgres('x').fields, sslCert: 'PEM' },
      sealed: { sslKey: sealed('key'), sslPassphrase: sealed('pass') },
    });

    const seen: { sealed: Record<string, SealedV1> }[] = [];
    await store().update(
      made.id,
      { fields: { ...made.fields, database: 'other' }, sealed: { sslPassphrase: sealed('pass2') } },
      {
        land: async (_source, landed) => {
          seen.push({ sealed: { ...landed.sealed } });
        },
      },
    );
    expect(seen).toEqual([{ sealed: { sslKey: sealed('key'), sslPassphrase: sealed('pass2') } }]);

    const before = await store().get(made.id);
    await expect(
      store().update(
        made.id,
        { fields: { ...made.fields, database: 'third' } },
        { land: refusing },
      ),
    ).rejects.toThrow('xcube can’t be reached');
    expect(await store().get(made.id)).toEqual(before);
  });

  it('renamed, leaves its old name in xcube first, and keeps it where cubes use it or the save fails (T442’s review)', async () => {
    const folder = folderId();
    const made = await store().create(postgres(folder, 'old_name'));
    const said: string[] = [];
    const tracking = {
      land: async (source: { name: string }) => {
        said.push(`land ${source.name}`);
      },
      unland: async (source: { name: string }) => {
        said.push(`unland ${source.name}`);
      },
    };

    const renamed = await store().update(made.id, { name: 'new_name' }, tracking);
    expect(renamed.name).toBe('new_name');
    expect(said).toEqual(['unland old_name', 'land new_name']);

    // Cubes use it: refused before anything changes.
    said.length = 0;
    await expect(
      store().update(made.id, { name: 'third' }, { ...tracking, unland: refusing }),
    ).rejects.toThrow('xcube can’t be reached');
    expect((await store().get(made.id))?.name).toBe('new_name');

    // The new name refused: the old name's connection is put back.
    await store().create(postgres(folder, 'taken'));
    said.length = 0;
    await expect(store().update(made.id, { name: 'taken' }, tracking)).rejects.toThrow(
      'The name “taken” is already in use.',
    );
    expect(said).toEqual(['unland new_name', 'land new_name']);
    expect((await store().get(made.id))?.name).toBe('new_name');
  });

  it('is removed from xcube first, and kept when xcube refuses', async () => {
    const made = await store().create(postgres(folderId()));

    await expect(store().remove(made.id, { unland: refusing })).rejects.toThrow(
      'xcube can’t be reached',
    );
    expect(await store().get(made.id)).toEqual(made);

    const unlanded: string[] = [];
    expect(
      await store().remove(made.id, {
        unland: async (source) => {
          unlanded.push(source.id);
        },
      }),
    ).toBe(true);
    expect(unlanded).toEqual([made.id]);
    expect(await store().get(made.id)).toBeUndefined();
  });
});

describe('a change to a data source', () => {
  it('asks for its secrets again when where it connects changes, TLS included (AC-312)', async () => {
    const made = await store().create(postgres(folderId()));

    for (const change of [{ host: 'db2' }, { sslRejectUnauthorized: false }]) {
      const refused = await store()
        .update(made.id, { fields: { ...made.fields, ...change } })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(refused).toBeInstanceOf(DataSourceRefused);
      expect((refused as DataSourceRefused).status).toBe(422);
      expect((refused as DataSourceRefused).message).toMatch(/Enter password again/);
    }
    // Refused, nothing changed: the old secret still stands for the old target.
    expect(await store().get(made.id)).toEqual(made);

    // Sealed again for the new target: taken, the envelope and its revision new.
    const before = await store().sealedOf(made.id);
    const moved = await store().update(made.id, {
      fields: { ...made.fields, host: 'db2' },
      sealed: { password: sealed('two') },
    });
    expect(moved.fields['host']).toBe('db2');
    const after = await store().sealedOf(made.id);
    expect(after.sealed).toEqual({ password: sealed('two') });
    expect(after.revisions['password']).not.toBe(before.revisions['password']);
  });

  it('asks for every stored secret again after a move, an optional one too (T335’s review)', async () => {
    const certified = await store().create({
      ...postgres(folderId()),
      authMethod: 'client-certificate',
      fields: { ...postgres('x').fields, sslCert: 'PEM' },
      sealed: { sslKey: sealed('key'), sslPassphrase: sealed('pass') },
    });

    // The key sealed again, the passphrase not: it wouldn't open for the new host.
    await expect(
      store().update(certified.id, {
        fields: { ...certified.fields, host: 'db2' },
        sealed: { sslKey: sealed('key2') },
      }),
    ).rejects.toThrow('Enter sslPassphrase again: host changed where it connects.');
    expect((await store().get(certified.id))?.secrets).toEqual(['sslKey', 'sslPassphrase']);
  });

  it('refuses a secret sent as a field in a change too (AC-298)', async () => {
    const made = await store().create(postgres(folderId()));

    await expect(
      store().update(made.id, { fields: { ...made.fields, password: 'hunter2' } }),
    ).rejects.toThrow('password is a secret: send it sealed, never as a field.');
    expect(JSON.stringify(await store().get(made.id))).not.toContain('hunter2');
  });

  it('keeps its secrets when nothing of where it connects changes', async () => {
    const made = await store().create(postgres(folderId()));

    const renamed = await store().update(made.id, {
      fields: { ...made.fields, database: 'other', user: 'reader' },
    });
    expect(renamed.fields).toMatchObject({ database: 'other', user: 'reader' });
    expect(renamed.secrets).toEqual(['password']);
    expect((await store().sealedOf(made.id)).sealed).toEqual({ password: sealed('one') });
  });

  it('never changes its type (AC-161)', async () => {
    const made = await store().create(postgres(folderId()));

    await expect(store().update(made.id, { driver: 'mysql' })).rejects.toThrow(
      'A data source’s type never changes: make a new data source for MySQL.',
    );
    expect((await store().get(made.id))?.driver).toBe('postgres');
  });

  it('takes the secrets of a new way to sign in, and drops the old one’s', async () => {
    const made = await store().create(postgres(folderId()));

    const certified = await store().update(made.id, {
      authMethod: 'client-certificate',
      fields: { ...made.fields, sslCert: 'PEM' },
      sealed: { sslKey: sealed('key') },
    });
    expect(certified.authMethod).toBe('client-certificate');
    expect(certified.secrets).toEqual(['sslKey']);
  });

  it('removes it, its secrets with it', async () => {
    const made = await store().create(postgres(folderId()));

    expect(await store().remove(made.id)).toBe(true);
    expect(await store().get(made.id)).toBeUndefined();
    expect(
      await getDb()
        .selectFrom('data_source_secrets')
        .select('field')
        .where('data_source_id', '=', made.id)
        .execute(),
    ).toEqual([]);
  });
});
