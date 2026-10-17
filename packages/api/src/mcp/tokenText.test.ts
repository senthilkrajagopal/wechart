import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { digestOf, mintToken, sameDigest, TOKEN_PREFIX, wellFormed } from './tokenText';

/**
 * T767 (AC-430): a personal access token's text, and the digest that is all
 * wechart keeps of it (`mcp-deployment-and-tokens.md` §4): `wct_`, 256
 * random bits as 64 hex digits, `_`, and the CRC32 of what comes before it
 * as 8 hex digits; kept as its SHA-256.
 */
describe('a token’s text (T767)', () => {
  it('is the prefix, 64 hex digits of secret and an 8-digit CRC32 of the rest', () => {
    const { text } = mintToken();
    expect(TOKEN_PREFIX).toBe('wct_');
    expect(text).toMatch(/^wct_[0-9a-f]{64}_[0-9a-f]{8}$/);
    const body = text.slice(0, -9);
    expect(text.slice(-8)).toBe(crc32(body).toString(16).padStart(8, '0'));
  });

  it('is new each time', () => {
    const texts = new Set(Array.from({ length: 50 }, () => mintToken().text));
    expect(texts.size).toBe(50);
  });

  it('is kept as its 32-byte SHA-256, never as itself', () => {
    const { text, digest } = mintToken();
    expect(digest).toHaveLength(32);
    expect(digest.equals(createHash('sha256').update(text).digest())).toBe(true);
    expect(digest.toString('utf8')).not.toContain(text.slice(4, 68));
    expect(digestOf(text).equals(digest)).toBe(true);
  });

  it('is told well formed by its checksum, without the database', () => {
    const { text } = mintToken();
    expect(wellFormed(text)).toBe(true);
    // One digit of the secret changed: the checksum no longer matches.
    const flipped = `${text.slice(0, 10)}${text[10] === 'a' ? 'b' : 'a'}${text.slice(11)}`;
    expect(wellFormed(flipped)).toBe(false);
    expect(wellFormed('')).toBe(false);
    expect(wellFormed('ghp_abc')).toBe(false);
    expect(wellFormed(`${text} `)).toBe(false);
  });

  it('matches its digest alone, in constant time over 32 bytes', () => {
    const one = mintToken();
    const two = mintToken();
    expect(sameDigest(one.digest, one.text)).toBe(true);
    expect(sameDigest(one.digest, two.text)).toBe(false);
    // Any length presented is hashed first, so nothing throws on it.
    expect(sameDigest(one.digest, 'x')).toBe(false);
    expect(sameDigest(one.digest, 'x'.repeat(10_000))).toBe(false);
  });
});
