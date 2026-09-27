import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, databaseUrl, getDb } from '../db/client';
import { dataSourceStore } from './data-sources';

const run = promisify(execFile);

/**
 * T332, T335 (AC-298): THE SYSTEM SHALL store data-source credentials in the
 * metadata database encrypted to xcube's public key, so neither the database
 * nor anything wechart holds can reveal them. Fails when: a credential can be
 * read from a dump of the metadata database, or from anything wechart holds,
 * without xcube's private key.
 *
 * So this dumps the real test database with pg_dump (plain format, which is
 * uncompressed, research/credential-encryption.md § Testing) and looks for the
 * secret in every encoding a dump could show it in.
 *
 * T335 replaced T332's AES store: wechart now keeps each secret as the
 * envelope the browser sealed to xcube's key, and never opens one. A secret
 * sent in plain text, as a field, is refused, and so never stored. That a
 * stored envelope opens with xcube's key alone is T441's, which seals one.
 */
const folder = `folder-${randomUUID()}`;
afterAll(async () => {
  // Its secrets go with it.
  await getDb().deleteFrom('data_sources').where('folder_id', '=', folder).execute();
  await closeDb();
});

async function dump(): Promise<string> {
  const database = new URL(databaseUrl()).pathname.replace(/^\//, '');
  const { stdout } = await run(
    'docker',
    ['exec', 'wechart-meta', 'pg_dump', '-U', 'wechart', '-d', database, '--format=plain'],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return stdout;
}

describe('data-source credentials at rest (T332, T335, AC-298)', () => {
  it('leave no readable secret in a dump of the metadata database, only the envelope', async () => {
    // Only [A-Za-z0-9-], so its JSON and URL encodings equal its raw form.
    const canary = `wcanary-${randomUUID()}`;
    const store = dataSourceStore(getDb());
    const envelope = {
      v: 1 as const,
      kid: 'kid-1',
      // Sized as xcube takes one: a 32-byte `enc`, one 256-byte bucket and its tag.
      enc: randomBytes(32).toString('base64url'),
      ct: randomBytes(272).toString('base64url'),
    };
    const fields = { host: 'db', database: 'sales', user: 'cube' };

    // The secret sent as a field, in plain text: refused, never stored.
    await expect(
      store.create({
        folderId: folder,
        name: 'leaky',
        driver: 'postgres',
        authMethod: 'password',
        fields: { ...fields, password: canary },
        sealed: {},
      }),
    ).rejects.toThrow('password is a secret: send it sealed, never as a field.');
    // Sealed, as the browser sends it: stored as it came.
    const kept = await store.create({
      folderId: folder,
      name: 'sealed',
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: envelope },
    });
    expect((await store.inFolder(folder)).map((each) => each.name)).toEqual(['sealed']);
    expect((await store.sealedOf(kept.id)).sealed).toEqual({ password: envelope });
    expect(await store.sealedOf(`ds-${randomUUID()}`)).toEqual({ sealed: {}, revisions: {} });

    const text = await dump();
    const forms = [
      canary,
      Buffer.from(canary).toString('hex'),
      Buffer.from(canary).toString('base64'),
      Buffer.from(canary).toString('base64url'),
    ];
    for (const form of forms) expect(text.includes(form), form).toBe(false);
    // Not an empty table passing by accident: the envelope itself is there.
    expect(text).toContain(envelope.ct);
    expect(text).toContain(envelope.enc);
  });
});
