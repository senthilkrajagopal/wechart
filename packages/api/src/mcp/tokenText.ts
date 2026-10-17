import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { crc32 } from 'node:zlib';

/**
 * A personal access token's text, and its digest, all wechart keeps of it
 * (T767, AC-430; research `mcp-deployment-and-tokens.md` §4, after GitHub's
 * format): a fixed prefix that secret scanning can match, 256 random bits
 * as 64 hex digits, `_`, and the CRC32 of what comes before it as 8 hex
 * digits, so a mistyped or made-up token is told apart without the
 * database. Only its SHA-256 is stored, with no pepper: 256 random bits meet
 * NIST 800-63B §3.1.2.2's 112-bit bar for look-up secrets stored hashed (the
 * coordinator's call, overturnable).
 */
export const TOKEN_PREFIX = 'wct_';

const SHAPE = /^wct_[0-9a-f]{64}_[0-9a-f]{8}$/;

const checksumOf = (body: string) => crc32(body).toString(16).padStart(8, '0');

/** The 32-byte SHA-256 of a token's text. */
export const digestOf = (text: string): Buffer => createHash('sha256').update(text).digest();

/** A new token: its text, to be shown once, and its digest, to be kept. */
export function mintToken(): { text: string; digest: Buffer } {
  const body = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
  const text = `${body}_${checksumOf(body)}`;
  return { text, digest: digestOf(text) };
}

/** Whether text has a token's shape and its checksum matches. */
export function wellFormed(text: string): boolean {
  if (!SHAPE.test(text)) return false;
  return checksumOf(text.slice(0, -9)) === text.slice(-8);
}

/** Whether presented text is the token a stored digest is of: two 32-byte digests, compared in constant time. */
export function sameDigest(stored: Buffer, presented: string): boolean {
  const digest = digestOf(presented);
  return stored.length === digest.length && timingSafeEqual(stored, digest);
}
