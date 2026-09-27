import { DRIVERS, targetKeysOf, type DriverType } from './drivers';

/**
 * Credential sealing, scheme v1 (T441, AC-325, AC-298): the binding and the
 * padding of a secret sealed in the browser to xcube's public key, exactly as
 * xcube opens it (research `credential-sealing.md`; xcube's
 * `credentials.ts`: `secretAadV1`, `padV1`, `INFO_V1`). The golden strings in
 * `aad.test.ts` are xcube's own, so the two can't drift apart.
 *
 * Browser and Node alike: bytes are `Uint8Array`, text is UTF-8.
 */

const encoder = new TextEncoder();

/** HPKE's `info` for a data source's secret. */
export const INFO_V1 = encoder.encode('wechart/data-source-secret/v1');

/**
 * What a secret is bound to: its driver, its field, and its driver's target
 * (T454, TLS included), each value as sent — `String(v)`, `""` when absent —
 * in sorted key order. A secret sealed for one target opens for no other
 * (AC-312).
 */
export function secretAadV1(
  driver: DriverType,
  field: string,
  fields: Readonly<Record<string, unknown>>,
): Uint8Array {
  const pairs = [...targetKeysOf(driver)].sort().map((key) => {
    const value = fields[key];
    return [key, value === undefined || value === null ? '' : String(value)];
  });
  return encoder.encode(JSON.stringify(['wechart/data-source-secret/v1', driver, field, pairs]));
}

const BUCKET = 256;

/** `0x01 ‖ uint32be(length) ‖ UTF-8 ‖ zeros`, to a multiple of 256 bytes: a length is hidden to its bucket. */
export function padV1(secret: string): Uint8Array {
  const body = encoder.encode(secret);
  const out = new Uint8Array(Math.ceil((5 + body.length) / BUCKET) * BUCKET);
  out[0] = 1;
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, 5);
  body.fill(0);
  return out;
}

/** Whether a driver is one xcube seals for: its type id among the eight. */
export const isSealedDriver = (driver: string): driver is DriverType =>
  // Its own keys only: `in` finds `constructor` too (T441's review).
  Object.hasOwn(DRIVERS, driver);
