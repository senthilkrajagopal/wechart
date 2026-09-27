import { createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT, type JWK } from 'jose';

/**
 * wechart's service credential (T420, AC-326, AC-250): what it calls Cube and
 * xcube with on its own behalf — every xcube admin route, the jobs API,
 * introspection, a rollup's partitions and the unfiltered field list — and
 * never a user's token, nor a user's for these.
 *
 * xcube's slice 4 (`docs/research/xcube-slice-4.md`, "The service token"):
 * an RS256 token under a key of its own, with its `kid` in the header;
 * `aud: xcube-admin`, `role: service`, `iat`, and `exp` at most an hour on.
 * Naming the model confines it to that model's admin routes and builds. xcube
 * is given the public half by configuration (`XCUBE_SERVICE_KEYS`), never
 * pushed, so the private half is the API's alone.
 */
export interface ServiceCredential {
  /** A token to send now: kept while it has a minute left, then signed afresh. */
  token(): Promise<string>;
  /** Its key's id: the public key's RFC 7638 thumbprint, as xcube computes one for a PEM. */
  readonly kid: string;
  /** The public half, for `XCUBE_SERVICE_KEYS`: never a private member. */
  readonly publicJwk: JWK;
}

/** xcube takes RSA keys of 2048 bits or more (research, "Keys and tokens"). */
const MIN_BITS = 2048;
/** Short: a token that leaks is good for two minutes, well inside xcube's hour. */
const TTL_SECONDS = 120;
/** A token with less than this left is not sent: a call can take a while. */
const MARGIN_SECONDS = 60;

export async function serviceCredential({
  privateKeyPem,
  model,
  ttlSeconds = TTL_SECONDS,
  now = Date.now,
}: {
  /** PKCS#8, or the PKCS#1 a Helm chart's `genSelfSignedCert` gives. */
  readonly privateKeyPem: string;
  readonly model: string;
  readonly ttlSeconds?: number;
  readonly now?: () => number;
}): Promise<ServiceCredential> {
  // `node:crypto` rather than jose's `importPKCS8`, which takes PKCS#8 only
  // (research `cube/tokens-and-service-credential.md`, "Kubernetes").
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'rsa')
    throw new Error('The service key must be an RSA key: xcube verifies service tokens as RS256.');
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_BITS)
    throw new Error(
      `The service key has ${String(bits)} bits: xcube takes RSA keys of ${String(MIN_BITS)} bits or more.`,
    );

  const { n, e } = await exportJWK(createPublicKey(privateKeyPem));
  if (n === undefined || e === undefined)
    throw new Error('The service key has no RSA public half.');
  const kid = await calculateJwkThumbprint({ kty: 'RSA', n, e });
  const publicJwk: JWK = { kty: 'RSA', n, e, kid, alg: 'RS256', use: 'sig' };

  let held: { readonly token: string; readonly exp: number } | undefined;
  return {
    kid,
    publicJwk,
    async token() {
      const at = Math.floor(now() / 1000);
      if (held !== undefined && held.exp - at > MARGIN_SECONDS) return held.token;
      const exp = at + ttlSeconds;
      const token = await new SignJWT({ role: 'service', wechartModel: model })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setAudience('xcube-admin')
        .setIssuedAt(at)
        .setExpirationTime(exp)
        .sign(privateKey);
      held = { token, exp };
      return token;
    },
  };
}
