import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, databaseUrl, getDb } from '../db/client';
import { keyringOf, open, seal } from '../secrets/crypto';
import { dataSourceSecrets } from './data-source-secrets';

const run = promisify(execFile);

/**
 * T332 (AC-298): THE SYSTEM SHALL store data-source credentials in the
 * metadata database encrypted with a key from the deployment's Secret, so the
 * database alone can't reveal them. Fails when: a credential can be read from
 * a dump of the metadata database without the key.
 *
 * So this dumps the real test database with pg_dump (plain format, which is
 * uncompressed, research/credential-encryption.md § Testing) and looks for the
 * secret in every encoding a dump could show it in.
 */
afterAll(async () => {
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

describe('data-source credentials at rest (T332, AC-298)', () => {
  it('leave no readable secret, and no key, in a dump of the metadata database', async () => {
    const key = randomBytes(32);
    const keys = keyringOf({ k1: key }, 'k1');
    // Only [A-Za-z0-9-], so its JSON and URL encodings equal its raw form.
    const canary = `wcanary-${randomUUID()}`;
    const id = `ds-${randomUUID()}`;
    const db = getDb();

    await db
      .insertInto('data_sources')
      .values({
        id,
        folder_id: 'root',
        name: id,
        type: 'postgres',
        settings: JSON.stringify({ host: 'db' }),
      })
      .execute();
    const envelope = seal(keys, id, { password: canary });
    await dataSourceSecrets(db).put(id, envelope);

    const text = await dump();
    const forms = [
      canary,
      Buffer.from(canary).toString('hex'),
      Buffer.from(canary).toString('base64'),
      Buffer.from(canary).toString('base64url'),
      key.toString('base64'),
      key.toString('hex'),
    ];
    for (const form of forms) expect(text.includes(form), form).toBe(false);
    // Not an empty table passing by accident: the envelope itself is there.
    expect(text).toContain(envelope.ciphertext.toString('hex'));

    // What the dump holds opens with the key, and with nothing else.
    const stored = await dataSourceSecrets(db).get(id);
    expect(stored).toBeDefined();
    expect(open(keys, id, stored!)).toEqual({ password: canary });
    expect(() => open(keyringOf({ k1: randomBytes(32) }, 'k1'), id, stored!)).toThrow();
  });

  it('keeps one envelope per data source, replaced when the secrets change', async () => {
    const keys = keyringOf({ k1: randomBytes(32) }, 'k1');
    const id = `ds-${randomUUID()}`;
    const db = getDb();
    await db
      .insertInto('data_sources')
      .values({ id, folder_id: 'root', name: id, type: 'postgres', settings: JSON.stringify({}) })
      .execute();

    await dataSourceSecrets(db).put(id, seal(keys, id, { password: 'first' }));
    await dataSourceSecrets(db).put(id, seal(keys, id, { password: 'second' }));

    expect(open(keys, id, (await dataSourceSecrets(db).get(id))!)).toEqual({ password: 'second' });
    expect(await dataSourceSecrets(db).get(`ds-${randomUUID()}`)).toBeUndefined();
  });
});
