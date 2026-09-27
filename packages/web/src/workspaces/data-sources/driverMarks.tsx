import type { DriverType } from '@wechart/core';

/**
 * Each driver's mark and its ways to sign in, as the new data source
 * wizard's type tiles show them (T471; design 01, state A).
 *
 * A vendor's logo only where its licence terms, recorded in `docs/research/`,
 * allow it, and otherwise a monogram of the name (T472, AC-338). As of
 * `driver-logos.md` (2026-09-27) no vendor's published terms allow it, so
 * every driver has its monogram, drawn in wechart's own neutral palette,
 * never a vendor's colours or shapes (the research's trade-dress gotcha).
 */

/**
 * The logos cleared for the picker, each by the research doc that records
 * the vendor's permission. None: a logo goes here only with its sibling doc
 * in `docs/research/`.
 */
export const CLEARED_LOGOS: Partial<
  Readonly<Record<DriverType, { readonly src: string; readonly research: string }>>
> = {};
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

/**
 * A driver's mark: decorative, its name said beside it. Its monogram while
 * no logo is cleared; drawing a cleared one comes with the first clearance,
 * and its test (T472's review).
 */
export function DriverMark({ type }: { readonly type: DriverType }) {
  return (
    <span className="driver-mark" aria-hidden="true">
      {MONOGRAMS[type]}
    </span>
  );
}
