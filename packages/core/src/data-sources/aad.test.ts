import { describe, expect, it } from 'vitest';

import { INFO_V1, isSealedDriver, padV1, secretAadV1 } from './aad';

/**
 * T441 (AC-325, AC-298): a typed secret is sealed in the browser to xcube's
 * key, scheme v1, bound to where it connects (research `credential-sealing.md`;
 * `xcube-overlay-data-sources.md`, "The TLS binding"). wechart's binding must be
 * xcube's byte for byte, or nothing it seals opens: these are xcube's own
 * golden strings (`xcube/test/unit/credentials.test.ts` at `ed08180c37`).
 */
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const target = { host: 'db.example.com', port: 5432, database: 'sales' };

describe('the binding a secret is sealed to (scheme v1)', () => {
  it('is xcube’s: driver, field, and the target’s keys sorted, as strings, from the values as sent', () => {
    expect(text(secretAadV1('postgres', 'password', target))).toBe(
      '["wechart/data-source-secret/v1","postgres","password",[["host","db.example.com"],["port","5432"],["ssl",""],["sslCa",""],["sslRejectUnauthorized",""]]]',
    );
    expect(
      text(
        secretAadV1('mysql', 'password', {
          host: 'h',
          port: 3306,
          ssl: true,
          sslRejectUnauthorized: false,
          sslCa: 'PEM',
        }),
      ),
    ).toBe(
      '["wechart/data-source-secret/v1","mysql","password",[["host","h"],["port","3306"],["ssl","true"],["sslCa","PEM"],["sslRejectUnauthorized","false"]]]',
    );
    expect(text(secretAadV1('mssql', 'password', { host: 'h', encrypt: true }))).toBe(
      '["wechart/data-source-secret/v1","mssql","password",[["encrypt","true"],["host","h"],["port",""],["trustServerCertificate",""]]]',
    );
    expect(text(secretAadV1('oracle', 'password', { host: 'h' }))).toBe(
      '["wechart/data-source-secret/v1","oracle","password",[["connectString",""],["database",""],["host","h"],["port",""]]]',
    );
    expect(
      text(secretAadV1('dremio', 'token', { url: 'https://api.dremio.cloud/v0/projects/p' })),
    ).toBe(
      '["wechart/data-source-secret/v1","dremio","token",[["host",""],["port",""],["ssl",""],["url","https://api.dremio.cloud/v0/projects/p"]]]',
    );
  });

  it('names the scheme in its info', () => {
    expect(text(INFO_V1)).toBe('wechart/data-source-secret/v1');
  });
});

describe('the drivers a secret is sealed for', () => {
  it('are the eight, and never a name every object has (T441’s review)', () => {
    expect(['postgres', 'bigquery', 'dremio'].map(isSealedDriver)).toEqual([true, true, true]);
    expect(['constructor', 'toString', '__proto__', 'databricks'].map(isSealedDriver)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('the padding that hides a secret’s length', () => {
  it('is 0x01, its length in four bytes, the text, then zeros, to a multiple of 256 bytes', () => {
    const padded = padV1('s3cret');
    expect(padded.length).toBe(256);
    expect([...padded.slice(0, 11)]).toEqual([1, 0, 0, 0, 6, 115, 51, 99, 114, 101, 116]);
    expect(padded.slice(11).every((byte) => byte === 0)).toBe(true);
    // Past a bucket, the next: 5 + 252 bytes need 512.
    expect(padV1('x'.repeat(252)).length).toBe(512);
    expect(padV1('x'.repeat(251)).length).toBe(256);
    // UTF-8, counted in bytes.
    expect([...padV1('é').slice(0, 7)]).toEqual([1, 0, 0, 0, 2, 0xc3, 0xa9]);
  });
});
