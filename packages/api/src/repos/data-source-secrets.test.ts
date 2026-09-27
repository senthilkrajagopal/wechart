import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { sealSecretV1, type XcubeKey } from '@wechart/core';
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
 * sent in plain text, as a field, is refused, and so never stored. T441 seals
 * the canary as the browser does; that such an envelope opens with xcube's
 * private key, and so with nothing wechart holds, is core's `seal.test.ts`.
 */
const folder = `folder-${randomUUID()}`;
/** xcube's development public key: all wechart is given. */
const DEV_KEY = JSON.parse(
  readFileSync(
    new URL('../../../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
    'utf8',
  ),
) as XcubeKey;
afterAll(async () => {
  // Its secrets go with it, and its copy's (T346).
  await getDb()
    .deleteFrom('data_sources')
    .where('folder_id', 'in', [folder, `${folder}-workspace`])
    .execute();
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
    const store = dataSourceStore(getDb(), { kid: DEV_KEY.kid });
    const fields = { host: 'db', database: 'sales', user: 'cube' };
    // Sealed as the browser seals it (T441), to xcube's development key.
    const envelope = await sealSecretV1(DEV_KEY, 'postgres', 'password', fields, canary);

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
    // Copied into a workspace (T346): the envelope as it is, never opened.
    const copied = await store.copy(kept.id, `${folder}-workspace`);
    expect((await store.sealedOf(copied.id)).sealed).toEqual({ password: envelope });

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
