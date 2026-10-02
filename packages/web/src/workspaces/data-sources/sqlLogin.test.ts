import { describe, expect, it } from 'vitest';

import { loginOf, readOnlyLayers } from './sqlLogin';

/**
 * T535 (AC-373, AC-374, AC-385; design 15's screen 1, pins 2 and 4, and
 * screen 2): where a data source's SQL runs and as whom, from its saved
 * settings, never a secret; and what wechart does on its driver to keep a
 * run read-only, as the turn-on dialog says it.
 */
describe('where a run goes, and as whom', () => {
  it('names the database, host and port, and the login', () => {
    expect(
      loginOf('postgres', {
        host: 'pg-replica-1.sales.internal',
        port: 5432,
        database: 'sales',
        user: 'cube_reader',
      }),
    ).toEqual({ as: 'cube_reader', database: 'sales', where: 'pg-replica-1.sales.internal:5432' });
  });

  it('names Snowflake’s user and role, account and warehouse', () => {
    expect(
      loginOf('snowflake', {
        account: 'acme-eu1',
        warehouse: 'BI_WH',
        role: 'REPORTING',
        database: 'FINANCE',
        username: 'CUBE_SVC',
      }),
    ).toEqual({
      as: 'CUBE_SVC, role REPORTING',
      database: 'FINANCE',
      where: 'account acme-eu1 · warehouse BI_WH',
    });
  });

  it('names BigQuery’s project, and a login it can’t name as none', () => {
    expect(loginOf('bigquery', { projectId: 'acme-analytics' })).toEqual({
      as: null,
      database: null,
      where: 'project acme-analytics',
    });
  });
});

describe('what wechart does on each driver (screen 2, G1)', () => {
  it('says a read-only transaction where the database has one', () => {
    expect(readOnlyLayers('postgres')).toEqual([
      'Runs one SELECT or EXPLAIN at a time, and refuses anything else before it reaches the database.',
      'Runs it in a read-only transaction, so a SELECT that calls a function that writes fails.',
      'Stops at 10,000 rows, 10 MB or 30 seconds, one run per person at a time.',
    ]);
  });

  it('says what it can’t enforce where there is none', () => {
    expect(readOnlyLayers('snowflake')[1]).toBe(
      'No read-only transaction: wechart has none to run it in on Snowflake. A SELECT that calls a function that writes passes wechart’s check, and only a login that can only read stops it.',
    );
    expect(readOnlyLayers('bigquery')[1]).toBe('Checks the statement with a dry run first.');
  });
});
