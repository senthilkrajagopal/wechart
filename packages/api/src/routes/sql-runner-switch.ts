import { isDeepStrictEqual } from 'node:util';

import { DRIVER_TYPES, DRIVERS, targetKeysOf, type DriverType, type SealedV1 } from '@wechart/core';

/** How a data source signs in: what a Super-Admin's read-only confirmation was about (AC-374). */
export interface Login {
  readonly authMethod?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly sealed?: Readonly<Record<string, SealedV1>>;
}

/**
 * Beside each driver's own: the database its grants are of (per database on
 * PostgreSQL, so a login read-only on one may own another), and the role it
 * takes where a driver has one (T531's review).
 */
const ALSO = ['database', 'role'];

const isDriver = (driver: string): driver is DriverType =>
  (DRIVER_TYPES as readonly string[]).includes(driver);

/** The fields a way of signing in takes, its user among them: none for one the driver hasn't. */
const authFieldsOf = (driver: DriverType, method: string | undefined) =>
  DRIVERS[driver].auth.find((each) => each.id === method)?.fields.map((field) => field.key) ?? [];

/**
 * Whether a change makes a data source sign in otherwise (T531, AC-374;
 * design 15's Q4): its way of signing in; a field of that way, its user
 * among them; where it connects (its driver's target keys, AC-312); its
 * database or role; or a secret replaced. A secret sent again as it was is
 * no replacement. A `sealed` not given is no change; one given against none
 * known is a replacement.
 */
export function signsInOtherwise(driver: string, before: Login, after: Login): boolean {
  if (after.authMethod !== undefined && after.authMethod !== before.authMethod) return true;
  for (const [key, envelope] of Object.entries(after.sealed ?? {})) {
    const was = before.sealed?.[key];
    if (was === undefined || was.ct !== envelope.ct || was.enc !== envelope.enc) return true;
  }
  if (after.fields === undefined) return false;
  const keys = isDriver(driver)
    ? [
        ...targetKeysOf(driver),
        ...authFieldsOf(driver, before.authMethod),
        ...authFieldsOf(driver, after.authMethod),
        ...ALSO,
      ]
    : ['user', 'username', ...ALSO];
  return keys.some((key) => !isDeepStrictEqual(before.fields?.[key], after.fields?.[key]));
}
