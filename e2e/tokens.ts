import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { CUBE, serviceToken } from './api-process';

/**
 * A query token as wechart's API signs one (T437, AC-326): RS256 under its
 * development signing key (`infra/xcube/dev-signing-key.pem`), which the API
 * pushes to xcube at start, with the key's RFC 7638 thumbprint as its `kid`.
 * xcube reads the groups, the model and the revision, and nothing else
 * (research `xcube-slice-4.md`, "User tokens"). Once any model holds keys,
 * xcube refuses an HS256 token, so no e2e helper signs one.
 */
const PEM = readFileSync(new URL('../infra/xcube/dev-signing-key.pem', import.meta.url), 'utf8');
const KEY = createPrivateKey(PEM);
const { n, e } = createPublicKey(PEM).export({ format: 'jwk' }) as { n: string; e: string };
/** The key's id, as the API computes it: RFC 7638, members in order, no whitespace. */
export const DEV_SIGNING_KID = createHash('sha256')
  .update(JSON.stringify({ e, kty: 'RSA', n }))
  .digest('base64url');

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function queryToken(
  claims: {
    readonly groups?: readonly string[];
    readonly wechartModel?: string;
    readonly wechartRevision?: number;
  },
  ttlSeconds = 300,
): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'RS256', kid: DEV_SIGNING_KID, typ: 'JWT' })}.${part({
    aud: 'xcube',
    iss: 'wechart',
    role: 'user',
    groups: [],
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  })}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), KEY).toString('base64url')}`;
}

/**
 * The development signing key pushed to a model this spec made itself, as
 * an API serving it pushes it at start (T437; research `xcube-slice-4.md`,
 * "PUT …/keys"): its query tokens verify from then on, and the model takes
 * no HS256 token. The same set an API would push, so one started on the
 * model later finds it held and pushes nothing.
 */
export async function pushDevSigningKey(model: string): Promise<void> {
  const response = await fetch(`${CUBE}/v1/semantic/models/${encodeURIComponent(model)}/keys`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      issuer: 'wechart',
      keys: [{ kty: 'RSA', kid: DEV_SIGNING_KID, n, e, alg: 'RS256', use: 'sig' }],
    }),
  });
  if (response.status !== 200)
    throw new Error(`xcube refused the development key for ${model}: ${await response.text()}`);
}
