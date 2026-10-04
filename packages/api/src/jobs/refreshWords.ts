import { refreshEveryRefusal, refreshLagSeconds, refreshPeriodOf } from '@wechart/core';
import { parse as parseYaml } from 'yaml';

import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile } from '../server';

/**
 * A pre-aggregation's refresh schedule in words and as written (T551,
 * AC-154; T160's review): one function for Schedules and for Jobs' Trigger.
 * The words are the research's "honest description" of each kind of key
 * (research/cube/refresh-key-schedule.md, "What /v1/meta?extended shows",
 * "For Schedules"), as design 16 says them (screen 2, pin 6; state D5).
 *
 * `/v1/meta?extended` shows a key as written, camelCased, but drops its SQL,
 * a function: a key of SQL is read from the model's own file, as are the
 * cubes a rollup reads, on which a default key depends.
 */
export interface RefreshWords {
  /** For its icon: what kind of schedule it is. */
  readonly kind: 'key' | 'sql' | 'default' | 'cube-keys' | 'not-scheduled' | 'unrunnable';
  /** Whether Cube's refresh worker rebuilds it at all. */
  readonly scheduled: boolean;
  readonly words: string;
  /** The key as the model writes it, in the code face. */
  readonly written: string;
  /** The key Cube turns over on, where one schedule says when: its next runs come from it. */
  readonly runs?: { readonly every: string; readonly timezone?: string };
  /** At most how late after a turn-over the worker starts it, before the build (research, "Refresh worker cadence"). */
  readonly lagSeconds?: number;
  /** Why Cube's refresh worker can't run it, where it can't. */
  readonly problem?: string;
}

/** The hourly fallback's own threshold, and the worker's tick (research, "Refresh worker cadence"). */
const FALLBACK_THRESHOLD_SECONDS = 10;
const TICK_SECONDS = 30;

type Value = Record<string, unknown>;
const asValue = (value: unknown): Value | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Value)
    : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** A cube's keys as its file writes them: its own refresh key, and each rollup's, with the cubes it reads. */
interface CubeKeys {
  readonly refreshKey?: Value;
  readonly rollups: ReadonlyMap<string, { readonly refreshKey?: Value; readonly cubes: string[] }>;
}
/** By folder and cube name, as its file declares it. */
export type ModelKeys = ReadonlyMap<string, CubeKeys>;
const keyOf = (folderId: string, cube: string) => `${folderId}\u0000${cube}`;

/**
 * The cubes a member reference reads: its own for `CUBE.x` or `x`, and each
 * cube a join path names on its way, `CUBE.customers.city` reading customers
 * (research cube/rollup-join-paths.md; T551's review).
 */
const cubesOfReference = (reference: unknown, own: string): string[] => {
  if (typeof reference !== 'string') return [];
  const path = reference.split('.').slice(0, -1);
  if (path.length === 0) return [own];
  return path.map((cube) => (cube === 'CUBE' ? own : cube));
};

/** Every model file's cubes' keys, through YAML aliases and merges (as Cube reads them). */
export function modelKeysOf(files: readonly ModelFile[]): ModelKeys {
  const found = new Map<string, CubeKeys>();
  for (const file of files) {
    if (!/\.ya?ml$/.test(file.path) || /{%|%}|{{|}}/.test(file.content)) continue;
    let parsed: unknown;
    try {
      parsed = parseYaml(file.content, { merge: true });
    } catch {
      continue;
    }
    const cubes = asValue(parsed)?.['cubes'];
    if (!Array.isArray(cubes)) continue;
    for (const each of cubes) {
      const cube = asValue(each);
      const name = text(cube?.['name']);
      if (cube === undefined || name === undefined) continue;
      const rollups = new Map<string, { refreshKey?: Value; cubes: string[] }>();
      const declared = cube['pre_aggregations'] ?? cube['preAggregations'];
      for (const one of Array.isArray(declared) ? declared : []) {
        const rollup = asValue(one);
        const rollupName = text(rollup?.['name']);
        if (rollup === undefined || rollupName === undefined) continue;
        const references = [
          ...(Array.isArray(rollup['measures']) ? rollup['measures'] : []),
          ...(Array.isArray(rollup['dimensions']) ? rollup['dimensions'] : []),
          ...(Array.isArray(rollup['segments']) ? rollup['segments'] : []),
          rollup['time_dimension'] ?? rollup['timeDimension'],
        ];
        const read = new Set(references.flatMap((reference) => cubesOfReference(reference, name)));
        const key = asValue(rollup['refresh_key'] ?? rollup['refreshKey']);
        rollups.set(rollupName, {
          ...(key === undefined ? {} : { refreshKey: key }),
          cubes: [...read],
        });
      }
      const key = asValue(cube['refresh_key'] ?? cube['refreshKey']);
      found.set(keyOf(file.folderId ?? ROOT_FOLDER_ID, name), {
        ...(key === undefined ? {} : { refreshKey: key }),
        rollups,
      });
    }
  }
  return found;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INTERVAL = /^(\d+) (second|minute|hour|day|week)s?$/;
const SECONDS: Readonly<Record<string, number>> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
};
const two = (field: string) => field.padStart(2, '0');

/** A zone as people name it: "Los Angeles", "Berlin"; "UTC" for UTC. */
const placeOf = (zone: string) =>
  zone === 'UTC' ? 'UTC' : (zone.slice(zone.lastIndexOf('/') + 1) || zone).replaceAll('_', ' ');

/** An `every` Cube runs, in words: a cron in its zone (UTC with none), an interval from the epoch in UTC. */
function everyInWords(every: string, timezone: string | undefined): string {
  const interval = INTERVAL.exec(every);
  if (interval !== null) {
    const count = Number(interval[1]);
    const unit = interval[2] ?? '';
    const seconds = count * (SECONDS[unit] ?? 0);
    const said = count === 1 ? `Every ${unit}` : `Every ${String(count)} ${unit}s`;
    // research, "Turn-over formula": counted from the epoch in UTC, where wechart builds.
    if (3600 % seconds === 0) return said;
    if (86400 % seconds === 0) return `${said}, from 00:00 UTC`;
    if (seconds === 604800) return `${said}, from Thursday 00:00 UTC`;
    return `${said}, counted from 1 Jan 1970, 00:00 UTC`;
  }
  // A cron Cube runs: `[S ]M H * * D`, each a number or * (core's refreshEveryRefusal).
  const fields = every.replace(/ +/g, ' ').replace(/^ | $/g, '').split(' ');
  const [second, minute, hour] = fields.length === 6 ? fields : ['0', ...fields];
  const day = fields[fields.length - 1] ?? '*';
  if (minute === '*') return second === '*' ? 'Every second' : 'Every minute';
  if (hour === '*') return `Hourly at :${two(minute ?? '0')}`;
  const time = `${two(hour ?? '0')}:${two(minute ?? '0')}${second === '0' ? '' : `:${two(second ?? '0')}`}`;
  const zone = timezone === undefined || timezone === 'UTC' ? ' UTC' : `, ${placeOf(timezone)}`;
  if (day === '*') return `Daily at ${time}${zone}`;
  return `At ${time} every ${DAYS[Number(day) % 7] ?? day}${zone}`;
}

/** An `every` as the model writes it: a cron quoted, as YAML needs it. */
const everyWritten = (every: string) =>
  INTERVAL.test(every) ? `every: ${every}` : `every: "${every}"`;

/** What incremental rebuilds (research, "For Schedules"). */
const incrementalWords = (key: Value) =>
  key['incremental'] !== true
    ? ''
    : typeof key['updateWindow'] === 'string'
      ? `, rebuilding only partitions ending in the last ${key['updateWindow']}`
      : ', rebuilding only the current partition';

const lowerFirst = (said: string) => `${said.charAt(0).toLowerCase()}${said.slice(1)}`;

/** A declared key, from the metadata, with its SQL from the file where it has one. */
function keyWords(meta: Value, own: Value | undefined): RefreshWords {
  const every = text(meta['every']);
  const timezone = text(meta['timezone']);
  const sql = text(own?.['sql']);
  // A key of SQL: the metadata keeps only its `every`, or nothing (research,
  // probe d). Checked once the cached value is `every` old: not aligned to a
  // clock, so no anchor is said (research, "For Schedules"; T551's review).
  if (sql !== undefined || every === undefined) {
    const interval = every === undefined ? undefined : INTERVAL.exec(every);
    const checked =
      every === undefined
        ? '10 seconds'
        : interval === null || interval === undefined
          ? every
          : Number(interval[1]) === 1
            ? (interval[2] ?? '')
            : `${interval[1] ?? ''} ${interval[2] ?? ''}s`;
    return {
      kind: 'sql',
      scheduled: true,
      words: `When its SQL returns a new value, checked every ${checked}`,
      written: [
        sql === undefined ? 'sql: (in the model)' : `sql: ${sql}`,
        ...(every === undefined ? [] : [everyWritten(every)]),
      ].join(' · '),
    };
  }
  const written = [
    everyWritten(every),
    ...(timezone === undefined ? [] : [`timezone: ${timezone}`]),
    ...(meta['incremental'] === true ? ['incremental: true'] : []),
    ...(typeof meta['updateWindow'] === 'string' ? [`update_window: ${meta['updateWindow']}`] : []),
  ].join(' · ');
  const refusal = refreshEveryRefusal(every);
  if (refusal !== undefined || refreshPeriodOf(every) === undefined)
    return {
      kind: 'unrunnable',
      scheduled: true,
      words: `"${every}", which Cube’s refresh worker can’t run`,
      written,
      // Why, in the words the editor and the publish use (T551's review).
      ...(refusal === undefined ? {} : { problem: refusal }),
    };
  const lag = refreshLagSeconds(every);
  return {
    kind: 'key',
    scheduled: true,
    words: `${everyInWords(every, timezone)}${incrementalWords(meta)}`,
    written,
    runs: { every, ...(timezone === undefined ? {} : { timezone }) },
    ...(lag === undefined ? {} : { lagSeconds: lag }),
  };
}

/**
 * A pre-aggregation's schedule: `rollup` and `cube` as the extended metadata
 * gives them; `model` the model's files' keys; `where` its cube's folder and
 * the name its file declares.
 */
export function refreshWordsOf(
  rollup: Value,
  cube: Value,
  model: ModelKeys | undefined,
  where: { readonly folderId: string; readonly shortName: string },
): RefreshWords {
  const type = text(rollup['type']) ?? 'rollup';
  // A lambda or a rollup join has no table of its own to refresh (research, "For Schedules").
  if (type === 'rollupLambda' || type === 'rollupJoin')
    return {
      kind: 'not-scheduled',
      scheduled: false,
      words: 'Not scheduled',
      written: `type: ${type === 'rollupLambda' ? 'rollup_lambda' : 'rollup_join'}`,
    };
  if (rollup['scheduledRefresh'] === false)
    return {
      kind: 'not-scheduled',
      scheduled: false,
      words: 'Not scheduled',
      written: 'scheduled_refresh: false',
    };
  const inFile = model?.get(keyOf(where.folderId, where.shortName));
  const ownInFile = inFile?.rollups.get(text(rollup['name']) ?? '');
  const declared = asValue(rollup['refreshKey']);
  if (declared !== undefined) return keyWords(declared, ownInFile?.refreshKey);

  // None declared (research, "The effective key when none is declared").
  const cubeKey = asValue(cube['refreshKey']);
  const original = type === 'originalSql';
  const others = (ownInFile?.cubes ?? []).filter((name) => name !== where.shortName);
  const anySql = others.some(
    (name) => text(model?.get(keyOf(where.folderId, name))?.refreshKey?.['sql']) !== undefined,
  );
  if (!original && others.length > 0 && (cubeKey !== undefined || anySql))
    return {
      kind: 'cube-keys',
      scheduled: true,
      words: 'Each of its cubes’ own refresh key',
      written: 'no refresh_key declared',
    };
  if (cubeKey !== undefined) {
    const its = keyWords(cubeKey, inFile?.refreshKey);
    return {
      ...its,
      kind: its.kind === 'key' ? 'default' : its.kind,
      words: `Its cube’s refresh key: ${lowerFirst(its.words)}`,
      written: `no refresh_key declared · its cube’s: ${its.written}`,
    };
  }
  if (original)
    return {
      kind: 'default',
      scheduled: true,
      words: 'Cube’s default for its database',
      written: 'no refresh_key declared · original_sql',
    };
  return {
    kind: 'default',
    scheduled: true,
    words: 'Cube’s default: every hour',
    written: 'no refresh_key declared',
    runs: { every: '1 hour' },
    // The hourly fallback's threshold is 10 s, plus the 30 s tick (research, "Refresh worker cadence").
    lagSeconds: FALLBACK_THRESHOLD_SECONDS + TICK_SECONDS,
  };
}
