import { DRIVERS, type DriverField, type DriverType, type FieldValue } from '@wechart/core';

import {
  fieldLabel,
  fieldsToSend,
  methodLabel,
  methodsOf,
  type ConnectionValues,
} from './ConnectionForm';

/**
 * What a connection test is of, said in a line each (T471; design 01, states
 * C and G): where it connects, how it signs in, and whether over TLS — and
 * what has changed since a test (state L). Secrets are named, never shown.
 */

const text = (value: FieldValue | undefined) =>
  value === undefined || value === null || value === '' ? undefined : String(value);

/** Where it connects: a host and port with its database, or the driver's own. */
export function whereOf(driver: DriverType, values: ConnectionValues): string {
  const sent = fieldsToSend(driver, values);
  const at = (key: string) => text(sent[key]);
  const database = at('database');
  switch (driver) {
    case 'snowflake':
      return `${at('account') ?? '—'} · ${at('warehouse') ?? '—'} / ${database ?? '—'}`;
    case 'bigquery':
      return at('location') === undefined
        ? (at('projectId') ?? '—')
        : `${at('projectId') ?? '—'} (${at('location') ?? ''})`;
    default: {
      const start = at('connectString') ?? at('url');
      if (start !== undefined) return database === undefined ? start : `${start} / ${database}`;
      const host = `${at('host') ?? '—'}${at('port') === undefined ? '' : `:${at('port') ?? ''}`}`;
      return database === undefined ? host : `${host} / ${database}`;
    }
  }
}

/** How it signs in, and as whom where a name is asked. */
export function signsInOf(driver: DriverType, values: ConnectionValues): string {
  const offered = methodsOf(driver, values);
  const method = offered.find((each) => each.id === values.authMethod) ?? offered[0]!;
  const sent = fieldsToSend(driver, values);
  const user = text(sent['user'] ?? sent['username'] ?? sent['clientId']);
  const domain = text(sent['domain']);
  const who = user === undefined ? undefined : domain === undefined ? user : `${domain}\\${user}`;
  return who === undefined
    ? methodLabel(driver, method)
    : `${methodLabel(driver, method)}, as ${who}`;
}

/** Whether it connects over TLS; nothing for a driver that takes no TLS field. */
export function tlsOf(driver: DriverType, values: ConnectionValues): 'On' | 'Off' | undefined {
  const keys = DRIVERS[driver].connection.map((field) => field.key);
  if (keys.includes('ssl')) {
    if (values.authMethod === 'client-certificate') return 'On';
    // Dremio Cloud's TLS is its URL's scheme, not a setting.
    if (driver === 'dremio' && values.shape === 'cloud') return undefined;
    return values.fields['ssl'] === true ? 'On' : 'Off';
  }
  if (keys.includes('encrypt')) return values.fields['encrypt'] === true ? 'On' : 'Off';
  return undefined;
}

/** A test's values, with the secrets it sealed as they were typed, in this form only. */
export interface TestedValues {
  readonly values: ConnectionValues;
  readonly secrets: Readonly<Record<string, string>>;
}

const shown = (value: FieldValue | undefined) =>
  value === true ? 'on' : value === false ? 'off' : (text(value) ?? '—');

/**
 * What changed since a test: each setting with its old and new value, a
 * change of the way it signs in, and each secret by its name alone.
 */
export function changesSince(
  driver: DriverType,
  tested: TestedValues,
  now: ConnectionValues,
): string[] {
  const spec = DRIVERS[driver];
  const every: DriverField[] = [
    ...spec.connection,
    ...spec.auth.flatMap((method) => method.fields),
  ].filter((field, at, all) => all.findIndex((each) => each.key === field.key) === at);
  const labelOf = (key: string) => {
    const field = every.find((each) => each.key === key);
    return field === undefined ? key : fieldLabel(driver, field);
  };
  const changes: string[] = [];

  if (tested.values.authMethod !== now.authMethod) {
    const name = (id: string) => {
      const method = spec.auth.find((each) => each.id === id);
      return method === undefined ? id : methodLabel(driver, method);
    };
    changes.push(`Sign in with (${name(tested.values.authMethod)} → ${name(now.authMethod)})`);
  }

  const before = fieldsToSend(driver, tested.values);
  const after = fieldsToSend(driver, now);
  for (const field of every) {
    if (field.secret) continue;
    const [was, is] = [before[field.key], after[field.key]];
    if (text(was) !== text(is))
      changes.push(`${labelOf(field.key)} (${shown(was)} → ${shown(is)})`);
  }

  for (const field of every.filter((each) => each.secret)) {
    if ((tested.secrets[field.key] ?? '') !== (now.secrets[field.key] ?? ''))
      changes.push(labelOf(field.key));
  }
  return changes;
}
