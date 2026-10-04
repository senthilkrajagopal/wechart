import {
  DRIVERS,
  periodOf,
  periodsOf,
  type DriverType,
  type FieldValue,
  type FolderAccessSetting,
} from '@wechart/core';
import type { FastifyBaseLogger } from 'fastify';

import type { WechartUser } from '../auth/user';
import { shownNameOf } from '../jobs/history';
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

/**
 * A pre-aggregation as the trail names it (T505; design 16, state I): its
 * cube's short name and its own, as Jobs and Run history show it.
 */
export const preAggregationItem = (preAggregation: string) => ({
  kind: 'pre-aggregation',
  id: preAggregation,
  title: shownNameOf(preAggregation),
});

/**
 * A build started from Jobs in one line (T505, AC-294; design 16, I1):
 * "Build now · whole" for a rollup that isn't partitioned, "Build all ·
 * every partition", "Rebuild selected · Sep, Aug 2026".
 */
export function buildStartedSummary(
  partitions: readonly string[] | null,
  granularity: string | null,
): string {
  if (partitions !== null) return `Rebuild selected · ${periodsOf(partitions, granularity)}`;
  return granularity === null ? 'Build now · whole' : 'Build all · every partition';
}

/** A cancel in the queue in one line, with the partition's state then: "Queued · Aug 2026" (I1). */
export function buildCancelledSummary(
  state: string,
  partition: string | null,
  granularity: string | null,
): string {
  return `${capital(state)} · ${partition === null ? 'whole' : periodOf(partition, granularity)}`;
}

/** wechart's own scheduler, as the trail names it when it suspends a schedule (Q12). */
export const WECHART_SCHEDULER: AuditActor = {
  key: 'wechart:scheduler',
  name: 'wechart’s scheduler',
};

/** A wechart schedule's settings as a record keeps them, before and after a change. */
export interface ScheduleSettings {
  readonly name: string;
  readonly preAggregation: string;
  readonly cron: string;
  readonly timezone: string;
  readonly missed: 'once' | 'skip';
  readonly suspendAfter: number;
}

export const scheduleSettingsOf = (schedule: ScheduleSettings): ScheduleSettings => ({
  name: schedule.name,
  preAggregation: schedule.preAggregation,
  cron: schedule.cron,
  timezone: schedule.timezone,
  missed: schedule.missed,
  suspendAfter: schedule.suspendAfter,
});

/** Each setting by its label, its word in a summary, and its value as the trail shows it. */
const SCHEDULE_SETTINGS: readonly {
  readonly key: keyof ScheduleSettings;
  readonly label: string;
  readonly word: string;
  readonly shown: (settings: ScheduleSettings) => string;
}[] = [
  { key: 'name', label: 'Name', word: 'name', shown: (each) => each.name },
  {
    key: 'preAggregation',
    label: 'Pre-aggregation',
    word: 'pre-aggregation',
    shown: (each) => shownNameOf(each.preAggregation),
  },
  { key: 'cron', label: 'Cron', word: 'cron', shown: (each) => each.cron },
  { key: 'timezone', label: 'Time zone', word: 'time zone', shown: (each) => each.timezone },
  {
    key: 'missed',
    label: 'A missed run',
    word: 'missed run',
    shown: (each) => (each.missed === 'skip' ? 'Skipped' : 'Run once'),
  },
  {
    key: 'suspendAfter',
    label: 'Suspend after',
    word: 'suspend after',
    shown: (each) => String(each.suspendAfter),
  },
];

/**
 * A wechart schedule made, changed or deleted (T505, AC-294; design 16,
 * state I): each of its settings before and after as the inspector's "What
 * changed" shows them, none before it was made or after it was deleted.
 */
export function scheduleSettingRows(
  before: ScheduleSettings | null,
  after: ScheduleSettings | null,
): { setting: string; before: string | null; after: string | null }[] {
  return SCHEDULE_SETTINGS.map((each) => ({
    setting: each.label,
    before: before === null ? null : each.shown(before),
    after: after === null ? null : each.shown(after),
  }));
}

/** A schedule's change in one line: "Changed · cron", by the settings that changed. */
export function scheduleChangeSummary(before: ScheduleSettings, after: ScheduleSettings): string {
  const changed = SCHEDULE_SETTINGS.filter((each) => before[each.key] !== after[each.key]);
  return changed.length === 0
    ? 'Saved unchanged'
    : `Changed · ${changed.map((each) => each.word).join(', ')}`;
}

/** What was done to a wechart schedule, with what the record keeps of it. */
export type ScheduleChange =
  | { readonly change: 'made'; readonly after: ScheduleSettings }
  | {
      readonly change: 'changed';
      readonly before: ScheduleSettings;
      readonly after: ScheduleSettings;
    }
  | { readonly change: 'deleted'; readonly before: ScheduleSettings }
  /** By wechart's scheduler, after how many failures, with Cube's last words (Q12). */
  | { readonly change: 'suspended'; readonly failures: number; readonly error: string | null }
  /** From its suspension: since when, and with Cube's error then (T505's review). */
  | { readonly change: 'resumed'; readonly suspendedAt: Date; readonly error: string | null };

/**
 * A wechart schedule's change as the trail records it (T505, AC-294; design
 * 16, state I): in its pre-aggregation's folder, with what it builds, its
 * settings before and after where they changed, and the line the trail shows.
 */
export function scheduleChangeEntry(
  actor: AuditActor | null,
  schedule: {
    readonly id: string;
    readonly name: string;
    readonly folderId: string | null;
    readonly preAggregation: string;
  },
  done: ScheduleChange,
): AuditEntry {
  const settings = (before: ScheduleSettings | null, after: ScheduleSettings | null) => ({
    before,
    after,
    settings: scheduleSettingRows(before, after),
  });
  const [summary, kept] =
    done.change === 'made'
      ? [`Made · ${done.after.cron}`, settings(null, done.after)]
      : done.change === 'changed'
        ? [scheduleChangeSummary(done.before, done.after), settings(done.before, done.after)]
        : done.change === 'deleted'
          ? ['Deleted', settings(done.before, null)]
          : done.change === 'suspended'
            ? [
                `Suspended after ${String(done.failures)} ${done.failures === 1 ? 'failure' : 'failures'}`,
                { failures: done.failures, error: done.error },
              ]
            : ['Resumed', { suspendedAt: done.suspendedAt.toISOString(), error: done.error }];
  return {
    actor,
    event: 'schedule-change',
    folderId: schedule.folderId,
    item: { kind: 'schedule', id: schedule.id, title: schedule.name },
    summary,
    details: {
      change: done.change,
      preAggregation: schedule.preAggregation,
      shownName: shownNameOf(schedule.preAggregation),
      ...kept,
    },
  };
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
