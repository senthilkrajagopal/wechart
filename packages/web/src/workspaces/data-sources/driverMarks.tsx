import type { DriverType } from '@wechart/core';

/**
 * Each driver's mark and its ways to sign in, as the new data source
 * wizard's type tiles show them (T471; design 01, state A). The marks are
 * monograms: vendors' logos wait on their licence terms (T472, AC-338).
 */
const MONOGRAMS: Readonly<Record<DriverType, string>> = {
  postgres: 'Pg',
  redshift: 'Rs',
  mysql: 'My',
  snowflake: 'Sf',
  bigquery: 'BQ',
  mssql: 'SS',
  oracle: 'Or',
  dremio: 'Dr',
};

/** How each driver signs in, in a line (core's `DRIVERS`, and Oracle's and Dremio's shapes). */
export const WAYS_TO_SIGN_IN: Readonly<Record<DriverType, string>> = {
  postgres: 'Password or client certificate',
  redshift: 'User and password',
  mysql: 'Password or client certificate',
  snowflake: 'Key pair, OAuth token or password',
  bigquery: 'Service-account key',
  mssql: 'SQL login, Windows or Entra ID',
  oracle: 'Connect string or host · password',
  dremio: 'Cloud or Software · token or password',
};

/** Said beside the chosen type: its TLS default, where it has one. */
export const TLS_DEFAULT: Partial<Readonly<Record<DriverType, string>>> = {
  postgres: 'TLS on by default',
  redshift: 'TLS on by default',
  mysql: 'TLS off by default',
};

/** A driver's mark: decorative, its name said beside it. */
export function DriverMark({ type }: { readonly type: DriverType }) {
  return (
    <span className="driver-mark" aria-hidden="true">
      {MONOGRAMS[type]}
    </span>
  );
}
