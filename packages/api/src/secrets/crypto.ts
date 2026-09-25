import {
  createCipheriv,
  createDecipheriv,
  createSecretKey,
  randomBytes,
  type KeyObject,
} from 'node:crypto';

/**
 * Data-source credentials, sealed with AES-256-GCM under the deployment's key
 * (T332, AC-298; research/credential-encryption.md, scheme v1).
 *
 * - One envelope per data source: its secret fields as UTF-8 JSON.
 * - A random 12-byte IV for every seal, a 16-byte tag, and the key's id.
 * - The AAD binds the envelope to the data source it serves, so a ciphertext
 *   copied into another row fails to open. The AAD is derived from the row
 *   being read, never stored beside the ciphertext.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface Keyring {
  /** The key new envelopes are sealed with. */
  readonly activeId: string;
  get(id: string): KeyObject | undefined;
}

export interface Envelope {
  readonly scheme: 1;
  readonly keyId: string;
  readonly iv: Buffer;
  readonly ciphertext: Buffer;
  readonly tag: Buffer;
}

export type Secrets = Readonly<Record<string, string>>;

/** A keyring from raw 32-byte keys by id. Loading them from the Secret is `key.ts`'s. */
export function keyringOf(raw: Readonly<Record<string, Buffer>>, activeId: string): Keyring {
  const keys = new Map<string, KeyObject>();
  for (const [id, bytes] of Object.entries(raw)) {
    if (bytes.length !== KEY_BYTES) {
      throw new Error(
        `credential key ${id} must be ${String(KEY_BYTES)} bytes, not ${String(bytes.length)}`,
      );
    }
    keys.set(id, createSecretKey(bytes));
  }
  if (!keys.has(activeId)) throw new Error(`the active credential key ${activeId} is not loaded`);
  return { activeId, get: (id) => keys.get(id) };
}

const aad = (scheme: number, dataSourceId: string): Buffer =>
  Buffer.from(`wechart/data-source-credentials/v${String(scheme)}\u0000${dataSourceId}`, 'utf8');

/** Seals a data source's secrets under the active key. */
export function seal(keys: Keyring, dataSourceId: string, secrets: Secrets): Envelope {
  const key = keys.get(keys.activeId);
  if (key === undefined) throw new Error('the active credential key is not loaded');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(1, dataSourceId));
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { scheme: 1, keyId: keys.activeId, iv, ciphertext, tag: cipher.getAuthTag() };
  } finally {
    plaintext.fill(0);
  }
}

/**
 * Opens an envelope sealed for this data source. Throws on a wrong key, another
 * data source's envelope, or any tampering: the result is never partial.
 */
export function open(
  keys: Keyring,
  dataSourceId: string,
  envelope: Envelope,
): Record<string, string> {
  if (envelope.scheme !== 1)
    throw new Error(`unknown credential scheme ${String(envelope.scheme)}`);
  if (envelope.iv.length !== IV_BYTES || envelope.tag.length !== TAG_BYTES) {
    throw new Error('malformed credential envelope');
  }
  const key = keys.get(envelope.keyId);
  if (key === undefined) throw new Error(`credential key ${envelope.keyId} is not loaded`);
  const decipher = createDecipheriv(ALGORITHM, key, envelope.iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(envelope.scheme, dataSourceId));
  decipher.setAuthTag(envelope.tag);
  const head = decipher.update(envelope.ciphertext);
  try {
    // final() authenticates: nothing is returned before it succeeds.
    const plaintext = Buffer.concat([head, decipher.final()]);
    try {
      return JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
    } finally {
      plaintext.fill(0);
    }
  } finally {
    head.fill(0);
  }
}
