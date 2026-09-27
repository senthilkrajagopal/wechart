import { describe, expect, it } from 'vitest';

import { initialValues, type ConnectionValues } from './ConnectionForm';
import { changesSince, signsInOf, tlsOf, whereOf } from './connectionSummary';

/**
 * T471 (design 01, states C, G and L): what a test is of, said in a line
 * each — where it connects, how it signs in, whether over TLS — and what
 * changed since a test, so a missing Next is never a mystery.
 */
const postgres = (fields: Record<string, unknown>, authMethod = 'password'): ConnectionValues => ({
  ...initialValues('postgres'),
  authMethod,
  fields: { ...initialValues('postgres').fields, ...fields } as ConnectionValues['fields'],
});

describe('what will be tested', () => {
  it('says where PostgreSQL connects, how it signs in and whether over TLS', () => {
    const values = postgres({ host: 'db.internal', database: 'northwind', user: 'postgres' });
    expect(whereOf('postgres', values)).toBe('db.internal:5432 / northwind');
    expect(signsInOf('postgres', values)).toBe('Password, as postgres');
    expect(tlsOf('postgres', values)).toBe('On');
    expect(tlsOf('postgres', postgres({ ssl: false }))).toBe('Off');
    // A client certificate is sent only over TLS.
    expect(tlsOf('postgres', postgres({ ssl: false }, 'client-certificate'))).toBe('On');
  });

  it('says each shape and driver its own way', () => {
    expect(
      whereOf('oracle', {
        ...initialValues('oracle'),
        fields: { connectString: 'db.fin.internal:1521/FINPDB', port: 1521 },
      }),
    ).toBe('db.fin.internal:1521/FINPDB');
    expect(
      whereOf('dremio', {
        ...initialValues('dremio'),
        fields: { url: 'https://api.dremio.cloud/v0/projects/7f', port: 9047 },
      }),
    ).toBe('https://api.dremio.cloud/v0/projects/7f');
    expect(
      whereOf('snowflake', {
        ...initialValues('snowflake'),
        fields: { account: 'acme-xy12345', warehouse: 'ANALYTICS_WH', database: 'FINANCE' },
      }),
    ).toBe('acme-xy12345 · ANALYTICS_WH / FINANCE');
    expect(
      whereOf('bigquery', {
        ...initialValues('bigquery'),
        fields: { projectId: 'acme-analytics', location: 'EU' },
      }),
    ).toBe('acme-analytics (EU)');
    expect(
      signsInOf('mssql', {
        ...initialValues('mssql'),
        authMethod: 'ntlm',
        fields: { domain: 'CORP', user: 'svc_cube' },
      }),
    ).toBe('Windows (NTLM), as CORP\\svc_cube');
    // Drivers that take no TLS field say nothing of it.
    expect(tlsOf('snowflake', initialValues('snowflake'))).toBeUndefined();
    expect(tlsOf('mssql', initialValues('mssql'))).toBe('Off');
  });
});

describe('what changed since a test (state L)', () => {
  it('names each changed setting, with its old and new value, and a secret by its name alone', () => {
    const tested = postgres({ host: 'db.internal', database: 'sales', user: 'cube' });
    const now = postgres({ host: 'db.internal', database: 'sales', user: 'cube', port: 6432 });
    expect(
      changesSince(
        'postgres',
        { values: tested, secrets: { password: 'a' } },
        {
          ...now,
          secrets: { password: 'b' },
        },
      ),
    ).toEqual(['Port (5432 → 6432)', 'Password']);
    expect(
      changesSince('postgres', { values: tested, secrets: {} }, { ...tested, secrets: {} }),
    ).toEqual([]);
  });

  it('names a change of the way it signs in', () => {
    const tested = postgres({ host: 'db.internal', user: 'cube' });
    expect(
      changesSince(
        'postgres',
        { values: tested, secrets: {} },
        { ...tested, authMethod: 'client-certificate' },
      )[0],
    ).toBe('Sign in with (Password → Client certificate)');
  });
});
