import { DRIVERS, type DriverType, type FieldValue } from '@wechart/core';

/**
 * Where a data source's SQL runs, and as whom (T535; design 15's screen 1,
 * pins 2 and 4, and screen 2): read from its saved settings, never a secret.
 * And what wechart does on its driver to keep a run read-only, as the
 * turn-on dialog says it (§P2.6 J; research `xcube-sql-runner.md`, "Read-only,
 * as each database has it").
 */

const text = (value: FieldValue | undefined): string | null =>
  value === undefined || value === null || value === '' ? null : String(value);

export interface Login {
  /** The login it runs as, and the role where it takes one; none it can name. */
  readonly as: string | null;
  readonly database: string | null;
  /** Where it connects: a host and port, an account, a project. */
  readonly where: string;
}

export function loginOf(driver: DriverType, fields: Readonly<Record<string, FieldValue>>): Login {
  const user = text(fields['user']) ?? text(fields['username']) ?? text(fields['clientId']);
  const role = text(fields['role']);
  const as = user === null ? null : role === null ? user : `${user}, role ${role}`;
  const database = text(fields['database']);
  const port = text(fields['port']);
  const host = text(fields['host']);
  const where =
    driver === 'snowflake'
      ? [
          text(fields['account']) === null ? null : `account ${text(fields['account'])!}`,
          text(fields['warehouse']) === null ? null : `warehouse ${text(fields['warehouse'])!}`,
        ]
          .filter((part) => part !== null)
          .join(' · ')
      : driver === 'bigquery'
        ? `project ${text(fields['projectId']) ?? '—'}`
        : (text(fields['url']) ??
          text(fields['connectString']) ??
          (host === null ? '—' : port === null ? host : `${host}:${port}`));
  return { as, database: driver === 'bigquery' ? null : database, where };
}

/** The drivers whose runs xcube wraps in a read-only transaction (research, "Read-only"). */
const READ_ONLY_TRANSACTION: ReadonlySet<DriverType> = new Set([
  'postgres',
  'redshift',
  'mysql',
  'oracle',
]);

/** What wechart does on this driver, in the dialog's words (screen 2, G1). */
export function readOnlyLayers(driver: DriverType): string[] {
  return [
    'Runs one SELECT or EXPLAIN at a time, and refuses anything else before it reaches the database.',
    READ_ONLY_TRANSACTION.has(driver)
      ? 'Runs it in a read-only transaction, so a SELECT that calls a function that writes fails.'
      : driver === 'bigquery'
        ? 'Checks the statement with a dry run first.'
        : `No read-only transaction: wechart has none to run it in on ${DRIVERS[driver].label}. A SELECT that calls a function that writes passes wechart’s check, and only a login that can only read stops it.`,
    'Stops at 10,000 rows, 10 MB or 30 seconds, one run per person at a time.',
  ];
}
