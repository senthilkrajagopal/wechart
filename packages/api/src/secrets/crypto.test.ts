import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { keyringOf, open, seal, type Envelope } from './crypto';

/**
 * T332 (AC-298): data-source credentials are sealed with AES-256-GCM under the
 * deployment's key, bound to the data source they serve
 * (research/credential-encryption.md, scheme v1).
 */
const keys = keyringOf({ k1: randomBytes(32) }, 'k1');
const SECRETS = {
  password: 'p@ss w0rd',
  privateKey: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
};

const flip = (buffer: Buffer, at = 0): Buffer => {
  const copy = Buffer.from(buffer);
  copy[at] = (copy[at] ?? 0) ^ 0x01;
  return copy;
};

describe('sealing a data source’s credentials (T332)', () => {
  it('opens to exactly the secrets sealed', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(open(keys, 'ds-1', envelope)).toEqual(SECRETS);
  });

  it('keeps no plaintext in the envelope, and records the key, a 12-byte IV and a 16-byte tag', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(envelope.scheme).toBe(1);
    expect(envelope.keyId).toBe('k1');
    expect(envelope.iv).toHaveLength(12);
    expect(envelope.tag).toHaveLength(16);
    expect(envelope.ciphertext.toString('utf8')).not.toContain('p@ss w0rd');
  });

  it('refuses to open credentials sealed for another data source (no swapping rows)', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(() => open(keys, 'ds-2', envelope)).toThrow();
  });

  it('refuses a tampered IV, ciphertext or tag', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(() => open(keys, 'ds-1', { ...envelope, iv: flip(envelope.iv) })).toThrow();
    expect(() =>
      open(keys, 'ds-1', { ...envelope, ciphertext: flip(envelope.ciphertext) }),
    ).toThrow();
    expect(() => open(keys, 'ds-1', { ...envelope, tag: flip(envelope.tag) })).toThrow();
  });

  it('refuses a short tag rather than accepting a weaker check', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(() => open(keys, 'ds-1', { ...envelope, tag: envelope.tag.subarray(0, 12) })).toThrow(
      /malformed/,
    );
  });

  it('cannot be opened with another key, and says which key id it needs when that key isn’t loaded', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    const other = keyringOf({ k1: randomBytes(32) }, 'k1');
    expect(() => open(other, 'ds-1', envelope)).toThrow();
    const without = keyringOf({ k2: randomBytes(32) }, 'k2');
    expect(() => open(without, 'ds-1', envelope)).toThrow(/k1/);
  });

  it('uses a fresh IV every time, so the same secrets never seal the same way twice', () => {
    const ivs = new Set<string>();
    const ciphertexts = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const envelope: Envelope = seal(keys, 'ds-1', SECRETS);
      ivs.add(envelope.iv.toString('hex'));
      ciphertexts.add(envelope.ciphertext.toString('hex'));
    }
    expect(ivs.size).toBe(1000);
    expect(ciphertexts.size).toBe(1000);
  });

  it('refuses an envelope of a scheme it doesn’t know', () => {
    const envelope = seal(keys, 'ds-1', SECRETS);
    expect(() => open(keys, 'ds-1', { ...envelope, scheme: 2 as never })).toThrow(/scheme/);
  });

  it('refuses a key that isn’t 32 bytes, and an active key it wasn’t given', () => {
    expect(() => keyringOf({ k1: randomBytes(31) }, 'k1')).toThrow(/32 bytes/);
    expect(() => keyringOf({ k1: randomBytes(32) }, 'k2')).toThrow(/k2/);
  });
});
