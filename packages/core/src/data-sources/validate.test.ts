import { describe, expect, it } from 'vitest';

import { nameProblem } from '../names';
import { dataSourceProblems, targetChanges, type SealedV1 } from './validate';

/**
 * T335 (AC-312, AC-164, AC-298, AC-161): what a data source is, before it is
 * stored — the rules xcube checks a connection by (research
 * `xcube-overlay-data-sources.md`, "Connection checks"; `xcube-slice-6.md`),
 * so wechart never stores one xcube would refuse to land:
 * - only the driver's and its sign-in method's fields;
 * - no secret among the fields, where it would be stored in plain text: a
 *   secret is only ever a sealed envelope (AC-298, AC-325);
 * - the required fields and secrets present;
 * - each envelope `{ v: 1, kid, enc, ct }`.
 *
 * And what "the connection target changed" means (AC-312): a field of the
 * driver's target, compared as the sealing binds it, `String(v)` and `""`
 * when absent.
 */
/** Sized as a real envelope is: a 32-byte `enc`, and one 256-byte bucket plus its 16-byte tag. */
const b64 = (length: number, fill = 7) => Buffer.alloc(length, fill).toString('base64url');
const envelope: SealedV1 = { v: 1, kid: 'k1', enc: b64(32), ct: b64(272) };
const postgres = {
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
  sealed: { password: envelope },
};

describe('a data source’s problems', () => {
  it('has none when it is one xcube would land', () => {
    expect(dataSourceProblems(postgres)).toEqual([]);
  });

  it('refuses a secret among its fields, which would be stored in plain text (AC-298)', () => {
    expect(
      dataSourceProblems({ ...postgres, fields: { ...postgres.fields, password: 'x' } }),
    ).toEqual(['password is a secret: send it sealed, never as a field.']);
  });

  it('refuses a field or a secret the driver or its sign-in method doesn’t take', () => {
    expect(
      dataSourceProblems({
        ...postgres,
        fields: { ...postgres.fields, schema: 'public' },
        sealed: { password: envelope, token: envelope },
      }),
    ).toEqual([
      'schema isn’t a field of PostgreSQL with Password.',
      'token isn’t a secret of PostgreSQL with Password.',
    ]);
    expect(dataSourceProblems({ ...postgres, driver: 'databricks-jdbc' })).toEqual([
      'databricks-jdbc isn’t a driver wechart offers.',
    ]);
    expect(dataSourceProblems({ ...postgres, authMethod: 'token' })).toEqual([
      'token isn’t a way to sign in to PostgreSQL.',
    ]);
  });

  it('asks for every required field and secret', () => {
    expect(
      dataSourceProblems({ ...postgres, fields: { host: 'db', user: '' }, sealed: {} }),
    ).toEqual(['database is required.', 'user is required.', 'password is required.']);
  });

  it('counts a secret already stored as present, when it isn’t sent again', () => {
    expect(dataSourceProblems({ ...postgres, sealed: {} }, ['password'])).toEqual([]);
  });

  it('refuses an envelope that isn’t a sealed secret, as xcube would (T335’s review)', () => {
    // xcube's own check (`connections.ts`, `envelopeProblem`): exactly these
    // four keys; a kid of at most 128; `enc` 32 bytes; `ct` whole 256-byte
    // buckets plus a 16-byte tag, at most 64 KiB of them.
    for (const bad of [
      { ...envelope, v: 2 },
      { ...envelope, kid: '' },
      { ...envelope, kid: 'k'.repeat(129) },
      { ...envelope, enc: b64(31) },
      { ...envelope, ct: 'not base64url!' },
      // A password sent as the ciphertext is no ciphertext.
      { ...envelope, ct: Buffer.from('hunter2').toString('base64url') },
      { ...envelope, ct: b64(271) },
      { ...envelope, ct: b64(64 * 1024 + 16 + 256) },
      { ...envelope, extra: 1 },
      'plain text',
    ])
      expect(
        dataSourceProblems({ ...postgres, sealed: { password: bad as unknown as SealedV1 } }),
        JSON.stringify(bad).slice(0, 60),
      ).toEqual(['password isn’t a sealed secret: { v: 1, kid, enc, ct }.']);
    for (const good of [
      envelope,
      { ...envelope, ct: b64(528) },
      { ...envelope, ct: b64(64 * 1024 + 16) },
    ])
      expect(dataSourceProblems({ ...postgres, sealed: { password: good } })).toEqual([]);
  });

  it('refuses what xcube’s driver configs refuse: a port, a long field, and each driver’s own rules', () => {
    for (const port of [0, 65536, 5432.5, 'abc'])
      expect(
        dataSourceProblems({ ...postgres, fields: { ...postgres.fields, port } }),
        String(port),
      ).toEqual(['port must be a whole number from 1 to 65535.']);
    expect(
      dataSourceProblems({
        ...postgres,
        fields: { ...postgres.fields, sslCa: 'x'.repeat(64 * 1024 + 1) },
      }),
    ).toEqual(['sslCa is too long: at most 65536 characters.']);
    const oracle = { driver: 'oracle', authMethod: 'password', sealed: { password: envelope } };
    expect(dataSourceProblems({ ...oracle, fields: { user: 'u', host: 'h' } })).toEqual([
      'Oracle needs a connect string, or a host and a service name.',
    ]);
    expect(
      dataSourceProblems({ ...oracle, fields: { user: 'u', host: 'h', database: 'd' } }),
    ).toEqual([]);
    const dremio = { driver: 'dremio', authMethod: 'token', sealed: { token: envelope } };
    expect(dataSourceProblems({ ...dremio, fields: {} })).toEqual([
      'Dremio needs a Cloud project URL, or a Software host.',
    ]);
    expect(
      dataSourceProblems({
        driver: 'dremio',
        authMethod: 'password',
        fields: { url: 'https://api.dremio.cloud/v0/projects/p', user: 'u' },
        sealed: { password: envelope },
      }),
    ).toEqual(['Dremio Cloud takes a personal access token, not a password.']);
  });
});

describe('a data source’s name', () => {
  // T703 (AC-426): R72's grammar, upper case allowed; a folder's
  // `<folderId>__<name>` still can't be forged, as `__` is never in a name.
  it('is a name xcube takes: a letter, then letters, digits and single underscores', () => {
    for (const good of ['default', 'warehouse', 'sales_2', 'a', 'Warehouse'])
      expect(nameProblem(good, 'data-source'), good).toBe(undefined);
    for (const bad of ['2x', 'a__b', 'a_', '_a', 'a-b', 'f1__sales', ''])
      expect(nameProblem(bad, 'data-source'), bad).toBe(
        `“${bad}” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.`,
      );
  });
});

describe('a change of connection target (AC-312)', () => {
  it('names the target fields that changed, TLS included, as the sealing compares them', () => {
    const before = {
      host: 'db',
      port: 5432,
      database: 'sales',
      ssl: true,
      sslRejectUnauthorized: true,
    };

    expect(targetChanges('postgres', before, { ...before, host: 'db2' })).toEqual(['host']);
    expect(targetChanges('postgres', before, { ...before, sslRejectUnauthorized: false })).toEqual([
      'sslRejectUnauthorized',
    ]);
    // Not where it connects: the secret stays.
    expect(targetChanges('postgres', before, { ...before, database: 'other', user: 'x' })).toEqual(
      [],
    );
    // As the binding reads them: `5432` and `"5432"` are one; absent is `""`.
    expect(targetChanges('postgres', before, { ...before, port: '5432' })).toEqual([]);
    expect(targetChanges('postgres', { host: 'db' }, { host: 'db', sslCa: '' })).toEqual([]);
    expect(targetChanges('postgres', { host: 'db' }, { host: 'db', ssl: false })).toEqual(['ssl']);
  });
});
