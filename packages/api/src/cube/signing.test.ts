import { generateKeyPairSync } from 'node:crypto';

import { decodeProtectedHeader, jwtVerify, importJWK } from 'jose';
import { describe, expect, it } from 'vitest';

import { querySigner } from './signing';

/**
 * T437 (AC-326, AC-008): every query token is RS256 under a key whose public
 * half is pushed to xcube, with its `kid` in the header, security on or off.
 * It carries the kind, audience and issuer xcube checks, an hour at most,
 * the groups some policy names, and the model and revision, and nothing else
 * of the user's: no subject (research `xcube-slice-4.md`, "User tokens").
 */
const pem = (bits: number) =>
  generateKeyPairSync('rsa', { modulusLength: bits }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
const KEY = pem(2048);

describe('the query signer (T437, AC-326)', () => {
  it('signs RS256 with its kid, and only what xcube reads', async () => {
    const signer = await querySigner({ privateKeyPem: KEY, issuer: 'wechart' });
    const token = await signer.sign(
      { groups: ['g-sales'], wechartModel: 'dev', wechartRevision: 12 },
      300,
    );
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'RS256', kid: signer.kid, typ: 'JWT' });
    const { payload } = await jwtVerify(token, await importJWK(signer.publicJwk, 'RS256'), {
      audience: 'xcube',
      issuer: 'wechart',
    });
    const { iat, exp, ...rest } = payload;
    expect(rest).toEqual({
      aud: 'xcube',
      iss: 'wechart',
      role: 'user',
      groups: ['g-sales'],
      wechartModel: 'dev',
      wechartRevision: 12,
    });
    expect(exp! - iat!).toBe(300);
  });

  it('never outlives an hour, and gives the public half only', async () => {
    const signer = await querySigner({ privateKeyPem: KEY, issuer: 'wechart' });
    const { payload } = await jwtVerify(
      await signer.sign({ groups: [] }, 7200),
      await importJWK(signer.publicJwk, 'RS256'),
    );
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(Object.keys(signer.publicJwk).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
    expect(signer.publicJwk).toMatchObject({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid: signer.kid,
    });
  });

  it('refuses a key xcube wouldn’t take', async () => {
    await expect(querySigner({ privateKeyPem: pem(1024), issuer: 'wechart' })).rejects.toThrow(
      'The signing key has 1024 bits: xcube takes RSA keys of 2048 bits or more.',
    );
  });
});
