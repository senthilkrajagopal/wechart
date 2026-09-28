import { DRIVERS, type DriverType, type FieldValue, type FolderAccessSetting } from '@wechart/core';
import type { FastifyBaseLogger } from 'fastify';

import type { WechartUser } from '../auth/user';
import type { AuditActor, AuditEntry, AuditStore } from '../repos/audit';

/**
 * Writing the audit trail's records (T368, AC-294), each the moment what it
 * records is done. A record that can't be kept doesn't undo what was done:
 * it is logged as a warning, never lost in silence.
 */

/** Who did it, as the request's user (with sign-in off, its one user); none for a request no one made as a user. */
export function actorOf(user: WechartUser | null): AuditActor | null {
  if (user === null) return null;
  return {
    key: user.key,
    name: user.name,
    ...(user.identity === undefined ? {} : { identity: user.identity }),
  };
}

/** Kept, or said in the log: what was done stands either way. */
export async function recordIn(
  audit: Pick<AuditStore, 'record'> | undefined,
  entry: AuditEntry,
  log: FastifyBaseLogger,
): Promise<void> {
  if (audit === undefined) return;
  await audit.record(entry).catch((error: unknown) => {
    log.warn({ err: error, event: entry.event }, 'could not keep an audit record');
  });
}

const listed = (names: readonly string[]) =>
  names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/** A label mid-sentence: its first letter lowered, unless it begins an acronym ("TLS"). */
const lower = (label: string) =>
  /^[A-Z][A-Z]/.test(label) ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`;

/**
 * A folder's access change in one line (design 08, pin 6): each group added
 * or removed, read-write and read-only. `null` inherits the parent's.
 */
export function accessChangeSummary(
  before: FolderAccessSetting,
  after: FolderAccessSetting,
): string {
  const parts: string[] = [];
  for (const [key, label] of [
    ['readWrite', 'read-write'],
    ['readOnly', 'read-only'],
  ] as const) {
    const [was, is] = [before[key], after[key]];
    const named = (names: readonly string[]) => (names.length === 0 ? 'none' : listed([...names]));
    // Set here where it was inherited, or inherited again: said as that, as
    // the parent's groups may grant the same (T368's review).
    if (was === null && is !== null) {
      parts.push(`set ${label} groups here, no longer inherited: ${named(is)}`);
      continue;
    }
    if (was !== null && is === null) {
      parts.push(`${label} groups inherited again, instead of ${named(was)}`);
      continue;
    }
    if (was === null || is === null) continue;
    const added = is.filter((group) => !was.includes(group));
    const removed = was.filter((group) => !is.includes(group));
    const groups = (names: string[]) =>
      `${label} group${names.length === 1 ? '' : 's'} ${listed(names)}`;
    if (added.length > 0) parts.push(`added ${groups(added)}`);
    if (removed.length > 0) parts.push(`removed ${groups(removed)}`);
  }
  return parts.length === 0 ? 'No change' : capital(parts.join('; '));
}

/** A setting's value as the trail shows it. */
const shown = (value: FieldValue | undefined): string | null =>
  value === undefined || value === null || value === ''
    ? null
    : value === true
      ? 'on'
      : value === false
        ? 'off'
        : String(value);

export interface DataSourceChangeRecord {
  readonly summary: string;
  readonly changes: readonly {
    readonly setting: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
}

/**
 * A data source's change (design 08, state A): each setting with its value
 * before and after; a secret only "replaced", never its value (rule 83,
 * AC-298); a new name or description said so.
 */
export function dataSourceChange(
  driver: DriverType,
  before: {
    readonly name: string;
    readonly description: string | null;
    readonly authMethod: string;
    readonly fields: Readonly<Record<string, FieldValue>>;
  },
  after: {
    readonly name: string;
    readonly description: string | null;
    readonly authMethod: string;
    readonly fields: Readonly<Record<string, FieldValue>>;
  },
  replaced: readonly string[],
): DataSourceChangeRecord {
  // Never throws: it runs once the change is saved, which it mustn't undo (T368's review).
  const spec = Object.hasOwn(DRIVERS, driver) ? DRIVERS[driver] : { connection: [], auth: [] };
  const every = [...spec.connection, ...spec.auth.flatMap((method) => method.fields)].filter(
    (field, at, all) => all.findIndex((each) => each.key === field.key) === at,
  );
  const labelOf = (key: string) => every.find((field) => field.key === key)?.label ?? key;
  const changes: { setting: string; before: string | null; after: string | null }[] = [];
  if (before.name !== after.name)
    changes.push({ setting: 'Name', before: before.name, after: after.name });
  if ((before.description ?? '') !== (after.description ?? ''))
    changes.push({ setting: 'Description', before: before.description, after: after.description });
  if (before.authMethod !== after.authMethod) {
    const method = (id: string) => spec.auth.find((each) => each.id === id)?.label ?? id;
    changes.push({
      setting: 'Sign in with',
      before: method(before.authMethod),
      after: method(after.authMethod),
    });
  }
  const keys = [...new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])].sort(
    (a, b) =>
      every.findIndex((field) => field.key === a) - every.findIndex((field) => field.key === b),
  );
  const settings: string[] = [];
  for (const key of keys) {
    const [was, is] = [shown(before.fields[key]), shown(after.fields[key])];
    if (was === is) continue;
    changes.push({ setting: labelOf(key), before: was, after: is });
    settings.push(labelOf(key));
  }
  const secrets = replaced.map(labelOf);
  for (const secret of secrets) changes.push({ setting: secret, before: null, after: 'replaced' });

  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`renamed from ${before.name}`);
  if ((before.description ?? '') !== (after.description ?? '')) parts.push('description changed');
  if (before.authMethod !== after.authMethod) parts.push('sign-in changed');
  // Lowered mid-sentence, the summary's first letter raised once at the end.
  if (settings.length > 0) parts.push(`${listed(settings.map(lower))} changed`);
  if (secrets.length > 0) parts.push(`${listed(secrets.map(lower))} replaced`);
  return { summary: parts.length === 0 ? 'Saved unchanged' : capital(parts.join('; ')), changes };
}
