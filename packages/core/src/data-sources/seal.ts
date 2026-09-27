import * as HPKE from 'hpke';

import { INFO_V1, padV1, secretAadV1 } from './aad';
import type { DriverType } from './drivers';
import type { SealedV1 } from './validate';

/**
 * Sealing a typed secret to xcube's public key, in the browser (T441, AC-325,
 * AC-298): HPKE base mode with DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and
 * AES-128-GCM, as xcube opens it (research `credential-sealing.md`,
 * "Browser: sealing"; `hpke` 1.1.7). wechart's API only ever sees the
 * envelope, and holds no key that opens it.
 *
 * Seal at submit, not on typing: an envelope sealed for one target opens for
 * no other (research Gotcha 9; AC-312). Send `fields` exactly as they were
 * sealed with (research `xcube-overlay-data-sources.md`, Gotcha 14).
 */

/** xcube's public key, as the deployment gives it: an X25519 JWK's `x`, and its `kid`. */
export interface XcubeKey {
  readonly kid: string;
  readonly x: string;
}

const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_X25519_HKDF_SHA256,
  HPKE.KDF_HKDF_SHA256,
  HPKE.AEAD_AES_128_GCM,
);

const fromBase64url = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const toBase64url = (bytes: Uint8Array): string => {
  // In chunks: a certificate's ciphertext is too long to spread as arguments.
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function sealSecretV1(
  key: XcubeKey,
  driver: DriverType,
  field: string,
  fields: Readonly<Record<string, unknown>>,
  secret: string,
): Promise<SealedV1> {
  // Throws where the browser lacks X25519: nothing is sent unsealed.
  const publicKey = await suite.DeserializePublicKey(fromBase64url(key.x));
  const padded = padV1(secret);
  try {
    const { encapsulatedSecret, ciphertext } = await suite.Seal(publicKey, padded, {
      info: INFO_V1,
      aad: secretAadV1(driver, field, fields),
    });
    return {
      v: 1,
      kid: key.kid,
      enc: toBase64url(new Uint8Array(encapsulatedSecret)),
      ct: toBase64url(new Uint8Array(ciphertext)),
    };
  } finally {
    padded.fill(0);
  }
}
