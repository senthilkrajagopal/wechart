import type { FastifyInstance } from 'fastify';

import type { CubeClient } from '../cube/client';

/**
 * Every pre-aggregation's refresh schedule, for the Schedules workspace (T160,
 * AC-154). Each is Cube's refresh worker's: its refresh key, in the model.
 * wechart's own scheduler is deferred (AC-234), so there is no other owner yet.
 *
 * Read from `/v1/meta?extended`, which shows a key as written, not as SQL, and
 * shows none where the model declares none. The words are the research's
 * "honest description" of each kind of key
 * (research/cube/refresh-key-schedule.md, "What /v1/meta?extended shows").
 */
export interface Schedule {
  /** `cube.name`. */
  readonly id: string;
  readonly cube: string;
  readonly name: string;
  readonly type: string;
  /** The model file its cube is in, for the link to Model. */
  readonly fileName?: string;
  /** Whose schedule it is: Cube's refresh worker's, for now always. */
  readonly owner: 'cube';
  /** Whether Cube's refresh worker refreshes it at all. */
  readonly scheduled: boolean;
  /** When it is rebuilt, in words. */
  readonly when: string;
  /** Its key's `every` and `timezone`, as written, where it has them. */
  readonly every?: string;
  readonly timezone?: string;
}

/** Cube's interval test (research, "Syntax"): anything else is a cron. */
const INTERVAL = /^(\d+) (second|minute|hour|day|week)s?$/;

type Value = Record<string, unknown>;
const asValue = (value: unknown): Value | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Value)
    : undefined;

/** A declared key in words; undefined for none. */
function keyInWords(key: Value): string {
  const every = typeof key['every'] === 'string' ? key['every'] : undefined;
  if (every === undefined)
    // A key of SQL alone: the metadata drops its SQL (a function), leaving
    // no `every`; Cube checks it every 10 seconds (research, "Refresh worker cadence").
    return 'When its SQL returns a new value, checked every 10 seconds';
  if (!INTERVAL.test(every)) {
    // A cron runs in its own zone, or in UTC with none — not the query's
    // (research, "Turn-over formula").
    const zone = typeof key['timezone'] === 'string' ? key['timezone'] : 'UTC';
    return `At "${every}" in ${zone}`;
  }
  let text = `Every ${every}`;
  if (key['incremental'] === true) text += ', incrementally';
  if (typeof key['updateWindow'] === 'string')
    text += `, rebuilding the last ${key['updateWindow']}`;
  return text;
}

function scheduleOf(cube: Value, each: Value): Schedule | undefined {
  const cubeName = cube['name'];
  const name = each['name'];
  if (typeof cubeName !== 'string' || typeof name !== 'string') return undefined;
  const type = typeof each['type'] === 'string' ? each['type'] : 'rollup';
  const key = asValue(each['refreshKey']);
  const base = {
    id: `${cubeName}.${name}`,
    cube: cubeName,
    name,
    type,
    ...(typeof cube['fileName'] === 'string' ? { fileName: cube['fileName'] } : {}),
    owner: 'cube' as const,
  };
  // A lambda or a rollup join has no table of its own to refresh (research, "For Schedules").
  if (type === 'rollupLambda' || type === 'rollupJoin')
    return { ...base, scheduled: false, when: 'Not scheduled: it reads the rollups it joins' };
  if (each['scheduledRefresh'] === false)
    return {
      ...base,
      scheduled: false,
      when: 'Not scheduled: built only when asked for, from Jobs',
    };
  const written = {
    ...(typeof key?.['every'] === 'string' ? { every: key['every'] } : {}),
    ...(typeof key?.['timezone'] === 'string' ? { timezone: key['timezone'] } : {}),
  };
  if (key !== undefined) return { ...base, ...written, scheduled: true, when: keyInWords(key) };
  // None declared: its cube's key where it has one, else Cube's hourly default
  // (research, "The effective key when none is declared").
  const cubeKey = asValue(cube['refreshKey']);
  if (cubeKey === undefined)
    return { ...base, scheduled: true, when: 'Every 1 hour (Cube’s default)' };
  const said = keyInWords(cubeKey);
  return {
    ...base,
    scheduled: true,
    when: `As its cube’s refresh key: ${said.charAt(0).toLowerCase()}${said.slice(1)}`,
  };
}

/** Every pre-aggregation of every cube the metadata lists, in model order. */
export function schedulesFrom(meta: unknown): Schedule[] {
  const cubes = asValue(meta)?.['cubes'];
  if (!Array.isArray(cubes)) return [];
  return cubes.flatMap((cube: unknown) => {
    const value = asValue(cube);
    const all = value?.['preAggregations'];
    if (value === undefined || !Array.isArray(all)) return [];
    return all.flatMap((each: unknown) => {
      const found = asValue(each);
      const schedule = found === undefined ? undefined : scheduleOf(value, found);
      return schedule === undefined ? [] : [schedule];
    });
  });
}

export function registerSchedules(app: FastifyInstance, client: CubeClient): void {
  app.get('/api/schedules', async () => schedulesFrom(await client.metaExtended()));
}
