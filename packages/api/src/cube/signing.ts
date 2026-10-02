import { createPrivateKey, createPublicKey } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, SignJWT, type JWK } from 'jose';

/**
 * The query tokens wechart signs for Cube (T437; AC-326, AC-008): RS256 under
 * a key whose public half is pushed to xcube (`xcube/keys.ts`), with its
 * `kid` in the header, security on or off, since once a model has keys xcube
 * takes no other token (research `xcube-slice-4.md`, "User tokens").
 *
 * A token carries what xcube reads and nothing else of the user's: its kind
 * (`role: user`), audience (`xcube`), issuer, when it was issued and when it
 * expires (an hour on at most, which xcube checks without tolerance), the
 * groups some policy names, and the model and revision it is for. No subject:
 * xcube drops every other claim, and wechart sends none.
 */
export interface QuerySigner {
  /** The key's id: the public key's RFC 7638 thumbprint. */
  readonly kid: string;
  /** The public half, as pushed to xcube: never a private member. */
  readonly publicJwk: JWK;
  sign(claims: QueryClaims, ttlSeconds: number): Promise<string>;
}

export interface QueryClaims {
  readonly groups: readonly string[];
  readonly wechartModel?: string;
  readonly wechartRevision?: number;
  /**
   * The overlay a workspace's or proposal's preview is answered from (T347,
   * AC-323; research `xcube-slice-5.md`, "Query tokens"): named only in the
   * tokens of those it allows.
   */
  readonly wechartOverlay?: string;
}

/** xcube takes RSA keys of 2048 bits or more. */
const MIN_BITS = 2048;
/** xcube refuses a token whose `exp - iat` is over an hour, with no tolerance. */
const MAX_TTL_SECONDS = 3600;

export async function querySigner({
  privateKeyPem,
  issuer,
  now = Date.now,
}: {
  /** PKCS#8, or the PKCS#1 a Helm chart's `genPrivateKey` gives. */
  readonly privateKeyPem: string;
  /** Pushed with the key set; xcube then requires it on every token. */
  readonly issuer: string;
  readonly now?: () => number;
}): Promise<QuerySigner> {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'rsa')
    throw new Error('The signing key must be an RSA key: xcube verifies query tokens as RS256.');
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_BITS)
    throw new Error(
      `The signing key has ${String(bits)} bits: xcube takes RSA keys of ${String(MIN_BITS)} bits or more.`,
    );
  const { n, e } = await exportJWK(createPublicKey(privateKeyPem));
  if (n === undefined || e === undefined)
    throw new Error('The signing key has no RSA public half.');
  const kid = await calculateJwkThumbprint({ kty: 'RSA', n, e });
  return {
    kid,
    publicJwk: { kty: 'RSA', n, e, kid, alg: 'RS256', use: 'sig' },
    async sign({ groups, wechartModel, wechartRevision, wechartOverlay }, ttlSeconds) {
      const at = Math.floor(now() / 1000);
      return new SignJWT({
        role: 'user',
        groups: [...groups],
        ...(wechartModel === undefined ? {} : { wechartModel }),
        ...(wechartRevision === undefined ? {} : { wechartRevision }),
        ...(wechartOverlay === undefined ? {} : { wechartOverlay }),
      })
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .setAudience('xcube')
        .setIssuer(issuer)
        .setIssuedAt(at)
        .setExpirationTime(at + Math.min(ttlSeconds, MAX_TTL_SECONDS))
        .sign(privateKey);
    },
  };
}
