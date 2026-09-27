import { createHash, createPublicKey, diffieHellman, generateKeyPairSync } from 'node:crypto';

import { ConfigError } from '../config';

/**
 * xcube's public key, which the browser encrypts data-source credentials to
 * (T333; AC-298, AC-324; research `credential-sealing.md`, "Key management").
 *
 * wechart is given the public half only, as a JWK in
 * `WECHART_XCUBE_PUBLIC_KEY`, and never a key that decrypts: only xcube holds
 * that. The API refuses to start without one it can use, naming the setting:
 * - an X25519 key (`kty` "OKP", `crv` "X25519"), the scheme's KEM;
 * - `x` is 32 bytes of base64url;
 * - `kid` is its RFC 7638 thumbprint, the id envelopes name it by;
 * - a key agreement with it isn't all zeros, which HPKE would refuse;
 * - and it holds no private part (`d`).
 */
export const XCUBE_PUBLIC_KEY = 'WECHART_XCUBE_PUBLIC_KEY';

export interface XcubePublicKey {
  /** The key's RFC 7638 thumbprint. */
  readonly kid: string;
  /** The X25519 public key, base64url. */
  readonly x: string;
}

/** RFC 7638's thumbprint of an X25519 key: its required members in RFC 8037's order. */
function thumbprintOf(x: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ crv: 'X25519', kty: 'OKP', x }))
    .digest('base64url');
}

function refused(problem: string): ConfigError {
  return new ConfigError(
    `${XCUBE_PUBLIC_KEY} ${problem} wechart needs xcube's public key, as a JWK, to take ` +
      'data-source credentials: see docs/deploy.md, “xcube’s public key”.',
  );
}

export function xcubePublicKeyOf(env: NodeJS.ProcessEnv): XcubePublicKey {
  const raw = env[XCUBE_PUBLIC_KEY];
  if (!raw) throw refused('is not set.');

  let jwk: unknown;
  try {
    jwk = JSON.parse(raw);
  } catch {
    throw refused('isn’t a JSON Web Key.');
  }
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) {
    throw refused('isn’t a JSON Web Key.');
  }
  const { kty, crv, x, kid, d } = jwk as Record<string, unknown>;

  // Never repeated in the message: it is the one thing wechart must not hold.
  if (d !== undefined) {
    throw refused(
      'holds a private key ("d"). Give wechart the public key only; xcube keeps the private key.',
    );
  }
  if (kty !== 'OKP' || crv !== 'X25519') {
    throw refused('isn’t an X25519 public key (kty "OKP", crv "X25519").');
  }
  if (
    typeof x !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(x) ||
    Buffer.from(x, 'base64url').toString('base64url') !== x
  ) {
    throw refused('has an "x" that isn’t 32 bytes of base64url.');
  }
  const thumbprint = thumbprintOf(x);
  if (kid !== thumbprint) {
    throw refused(`has a "kid" that isn’t the key’s RFC 7638 thumbprint, ${thumbprint}.`);
  }

  // A low-order point agrees an all-zero secret with every key, and HPKE
  // refuses to seal to it (RFC 9180 §7.1.4). OpenSSL throws for it, others
  // may answer zeros: either is refused (research x25519-public-key-checks.md).
  let agreed: Buffer;
  try {
    agreed = diffieHellman({
      privateKey: generateKeyPairSync('x25519').privateKey,
      publicKey: createPublicKey({ key: { kty, crv, x }, format: 'jwk' }),
    });
  } catch {
    throw refused('is a point no key can be agreed with, so HPKE can’t seal to it.');
  }
  if (agreed.every((byte) => byte === 0)) {
    throw refused('is a point no key can be agreed with, so HPKE can’t seal to it.');
  }

  return { kid: thumbprint, x };
}

/**
 * Whether xcube holds the credential key wechart seals to (T455, AC-324):
 * asked at start, before the API serves anything, of
 * `GET /v1/semantic/credential-keys`, with a service token naming no model
 * (research `xcube-slice-6.md`, "wechart's API: the order of calls"). A
 * secret sealed to a key xcube doesn't hold would be stored and never open.
 *
 * It waits while xcube can't be reached, or answers 5xx while it starts, as
 * the first push does. Any other answer without wechart's key is a refusal to
 * start, naming the key id.
 */
export async function checkXcubeHoldsKey({
  cubeApiUrl,
  key,
  token,
  fetch: send = fetch,
  waitMs = 2_000,
  onWait,
}: {
  readonly cubeApiUrl: string;
  readonly key: XcubePublicKey;
  /** A service token naming no model: this route no model owns. */
  readonly token: () => Promise<string>;
  readonly fetch?: typeof fetch;
  readonly waitMs?: number;
  readonly onWait?: (why: string) => void;
}): Promise<void> {
  const url = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/credential-keys`;
  for (;;) {
    let response: Response;
    try {
      response = await send(url, { headers: { authorization: `Bearer ${await token()}` } });
    } catch (failure) {
      onWait?.(`xcube can’t be reached: ${String((failure as Error).message ?? failure)}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (response.status >= 500) {
      onWait?.(`xcube answered ${String(response.status)} while starting`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (response.status !== 200)
      throw new ConfigError(
        `xcube answered ${String(response.status)} when asked for its credential keys: its admin routes must take wechart's service credential (XCUBE_SERVICE_KEYS).`,
      );
    const body = (await response.json().catch(() => ({}))) as {
      keys?: { kid?: unknown; active?: unknown }[];
    };
    const held = (body.keys ?? []).map((each) => each.kid);
    const ours = (body.keys ?? []).find((each) => each.kid === key.kid);
    // Held and active: the key xcube re-wraps to (research, "the order of calls").
    if (ours?.active === true) return;
    if (ours !== undefined) {
      const active = (body.keys ?? []).find((each) => each.active === true)?.kid;
      throw new ConfigError(
        `xcube holds the credential key ${key.kid}, which ${XCUBE_PUBLIC_KEY} names, but seals new credentials to ${String(active)}: give wechart ${String(active)}’s public key.`,
      );
    }
    throw new ConfigError(
      `xcube holds no credential key with the id ${key.kid}, which ${XCUBE_PUBLIC_KEY} names: secrets sealed to it would never open. ` +
        (held.length === 0
          ? 'xcube holds no key at all: set XCUBE_CREDENTIAL_KEY_IDS on its processes (docs/deploy.md).'
          : `It holds ${held.map(String).join(', ')}.`),
    );
  }
}
