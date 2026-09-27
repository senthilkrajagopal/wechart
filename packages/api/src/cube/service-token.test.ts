import { createHash, generateKeyPairSync } from 'node:crypto';

import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import { serviceCredential } from './service-token';

/**
 * T420 / AC-326, AC-250: WHEN wechart calls Cube or xcube on its own behalf
 * (introspection, builds and jobs, system partitions, health, every xcube
 * admin call), THE SYSTEM SHALL use the service credential, never a user's
 * token.
 *
 * xcube's slice 4 (`docs/research/xcube-slice-4.md`, "The service token"):
 * RS256 under a key of its own, its `kid` in the header; `aud: xcube-admin`,
 * `role: service`, `iat`, `exp` at most an hour on, and the model it is for.
 * xcube is given the public half by configuration, never pushed: a JWK set,
 * or a PEM public key or certificate whose `kid` is the RFC 7638 thumbprint.
 */
const pair = (bits = 2048) =>
  generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

/** RFC 7638: SHA-256 of the required members, in lexical order, base64url. */
const thumbprint = (jwk: { e: string; n: string }) =>
  createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n }))
    .digest('base64url');

describe('the service credential', () => {
  it('signs RS256 tokens xcube takes as a service’s, for the deployment’s model', async () => {
    const { privateKey } = pair();
    const service = await serviceCredential({ privateKeyPem: privateKey, model: 'e2e' });

    const token = await service.token();
    const header = decodeProtectedHeader(token);
    const claims = decodeJwt(token);

    expect(header).toEqual({ alg: 'RS256', kid: service.kid });
    expect(service.kid).toBe(thumbprint(service.publicJwk as { e: string; n: string }));
    expect(claims).toEqual({
      aud: 'xcube-admin',
      role: 'service',
      wechartModel: 'e2e',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    // Within xcube's hour, and verified by the public half alone.
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(3600);
    const verified = await jwtVerify(token, await importJWK(service.publicJwk, 'RS256'), {
      audience: 'xcube-admin',
    });
    expect(verified.payload['role']).toBe('service');
  });

  it('carries no user’s groups, nor anything else of anyone’s', async () => {
    const service = await serviceCredential({ privateKeyPem: pair().privateKey, model: 'e2e' });

    expect(Object.keys(decodeJwt(await service.token())).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'role',
      'wechartModel',
    ]);
  });

  it('takes the PKCS#1 key a Helm chart generates, and hands xcube its public half', async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    const service = await serviceCredential({ privateKeyPem: privateKey, model: 'wechart' });

    expect(privateKey).toContain('BEGIN RSA PRIVATE KEY');
    expect(service.publicJwk).toEqual({
      kty: 'RSA',
      n: expect.any(String) as string,
      e: 'AQAB',
      kid: service.kid,
      alg: 'RS256',
      use: 'sig',
    });
    expect(JSON.stringify(service.publicJwk)).not.toMatch(/"d"|"p"|"q"/);
  });

  it('refuses a key xcube would refuse: under 2048 bits, or not RSA', async () => {
    await expect(
      serviceCredential({ privateKeyPem: pair(1024).privateKey, model: 'e2e' }),
    ).rejects.toThrow(/2048/);
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    await expect(serviceCredential({ privateKeyPem: privateKey, model: 'e2e' })).rejects.toThrow(
      /RSA/,
    );
  });

  it('signs a token naming no model, for xcube’s routes that no model owns (T455)', async () => {
    // `GET /v1/semantic/credential-keys` refuses a service token that names a
    // model (research xcube-slice-6.md, "credential-keys (not per model)").
    const service = await serviceCredential({ privateKeyPem: pair().privateKey, model: 'e2e' });

    const claims = decodeJwt(await service.anyModelToken());
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'role']);
    expect(claims).toMatchObject({ aud: 'xcube-admin', role: 'service' });
    // Its model's token still names it.
    expect(decodeJwt(await service.token())['wechartModel']).toBe('e2e');
  });

  it('keeps a token while it has time left, and signs a new one before it expires', async () => {
    let now = 1_790_000_000_000;
    const service = await serviceCredential({
      privateKeyPem: pair().privateKey,
      model: 'e2e',
      now: () => now,
    });

    const first = await service.token();
    now += 30_000;
    expect(await service.token()).toBe(first);
    now += 120_000;
    const later = await service.token();
    expect(later).not.toBe(first);
    expect(decodeJwt(later).iat).toBe(Math.floor(now / 1000));
  });
});
