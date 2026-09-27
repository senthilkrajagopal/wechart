import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

import * as HPKE from 'hpke';
import { describe, expect, it } from 'vitest';

import { INFO_V1, secretAadV1 } from './aad';
import { DRIVER_TYPES, type DriverType } from './drivers';
import { sealSecretV1, type XcubeKey } from './seal';

/**
 * T441 (AC-325, AC-298): WHEN a user types a data source's secret, THE SYSTEM
 * SHALL encrypt it in the browser, to xcube's public key, before sending it.
 *
 * Sealed as xcube opens it (research `credential-sealing.md`): HPKE base mode,
 * DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM; `info`
 * `wechart/data-source-secret/v1`; bound to its driver, field and target;
 * padded to 256 bytes. Opened here with the development key pair's private
 * half (`infra/xcube/`), as xcube opens it.
 */
const root = new URL('../../../../', import.meta.url);
const KEY = JSON.parse(
  readFileSync(new URL('infra/xcube/dev-credential-key.pub.jwk', root), 'utf8'),
) as XcubeKey;
const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_X25519_HKDF_SHA256,
  HPKE.KDF_HKDF_SHA256,
  HPKE.AEAD_AES_128_GCM,
);
const bytes = (base64url: string) => new Uint8Array(Buffer.from(base64url, 'base64url'));

/** Opens as xcube does, with the development private key: the secret, or a throw. */
async function open(
  envelope: { enc: string; ct: string },
  driver: DriverType,
  field: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const pem = readFileSync(new URL('infra/xcube/dev-credential-key.pem', root), 'utf8');
  const { d, x } = createPrivateKey(pem).export({ format: 'jwk' }) as { d: string; x: string };
  const pair = {
    privateKey: await suite.DeserializePrivateKey(bytes(d), false),
    publicKey: await suite.DeserializePublicKey(bytes(x)),
  };
  const padded = await suite.Open(pair, bytes(envelope.enc), bytes(envelope.ct), {
    info: INFO_V1,
    aad: secretAadV1(driver, field, fields),
  });
  const length = new DataView(padded.buffer, padded.byteOffset).getUint32(1);
  return new TextDecoder().decode(padded.subarray(5, 5 + length));
}

const fields = { host: 'db.example.com', port: 5432, database: 'sales', ssl: true };

describe('a secret sealed in the browser (T441, AC-325)', () => {
  it('is an envelope for xcube’s key that its private half opens, for its target', async () => {
    const sealed = await sealSecretV1(KEY, 'postgres', 'password', fields, 'hunter2');

    expect(sealed).toEqual({
      v: 1,
      kid: KEY.kid,
      enc: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      ct: expect.stringMatching(/^[A-Za-z0-9_-]+$/) as string,
    });
    expect(JSON.stringify(sealed)).not.toContain('hunter2');
    expect(await open(sealed, 'postgres', 'password', fields)).toBe('hunter2');
    // The same target written otherwise, `"5432"` for `5432`: the same binding.
    expect(await open(sealed, 'postgres', 'password', { ...fields, port: '5432' })).toBe('hunter2');
  });

  it('opens for no other target, field or driver (AC-312)', async () => {
    const sealed = await sealSecretV1(KEY, 'postgres', 'password', fields, 'hunter2');

    for (const [driver, field, other] of [
      ['postgres', 'password', { ...fields, host: 'evil.example.com' }],
      ['postgres', 'password', { ...fields, sslRejectUnauthorized: false }],
      ['postgres', 'sslPassphrase', fields],
      ['mysql', 'password', fields],
    ] as const)
      await expect(open(sealed, driver, field, other), `${driver}.${field}`).rejects.toThrow();
  });

  it('seals a long secret, a client key’s PEM, whole', async () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(60_000)}\n-----END PRIVATE KEY-----`;
    const sealed = await sealSecretV1(KEY, 'postgres', 'sslKey', fields, pem);

    expect(await open(sealed, 'postgres', 'sslKey', fields)).toBe(pem);
  });

  it('matches the golden vectors xcube’s tests open (golden-v1.json)', async () => {
    const golden = JSON.parse(
      readFileSync(new URL('./golden-v1.json', import.meta.url), 'utf8'),
    ) as {
      aad: { driver: DriverType; field: string; fields: Record<string, unknown>; aad: string }[];
      envelopes: {
        driver: DriverType;
        field: string;
        fields: Record<string, unknown>;
        secret: string;
        envelope: { enc: string; ct: string; kid: string };
      }[];
    };

    for (const each of golden.aad)
      expect(new TextDecoder().decode(secretAadV1(each.driver, each.field, each.fields))).toBe(
        each.aad,
      );
    // Every driver's binding, so xcube's copy of each can't drift (T441's review).
    expect(golden.aad.map((each) => each.driver).sort()).toEqual([...DRIVER_TYPES].sort());
    expect(golden.envelopes.map((each) => each.driver)).toEqual([
      'postgres',
      'mysql',
      'dremio',
      'mssql',
      'redshift',
      'snowflake',
      'bigquery',
    ]);
    for (const each of golden.envelopes) {
      expect(each.envelope.kid).toBe(KEY.kid);
      expect(await open(each.envelope, each.driver, each.field, each.fields)).toBe(each.secret);
    }
  });

  it('hides a secret’s length to its 256-byte bucket', async () => {
    const short = await sealSecretV1(KEY, 'postgres', 'password', fields, 'a');
    const longer = await sealSecretV1(KEY, 'postgres', 'password', fields, 'a'.repeat(200));

    expect(bytes(short.ct).length).toBe(bytes(longer.ct).length);
  });
});
