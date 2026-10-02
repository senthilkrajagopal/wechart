import type { FastifyInstance } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import { refreshKeySqlOf } from '../model/refreshKeys';
import { filesInFolders, fileOf, pathsByName } from '../model/split';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile } from '../server';
import type { PublishedFolders } from '../xcube/folders';
import { EVERYTHING, NO_JOBS, placements, reaches, type JobsAccess, type Placement } from './scope';

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
  /** Its cube's folder, short name and path (T371): what people see. */
  readonly folderId?: string | null;
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  readonly cube: string;
  readonly name: string;
  readonly type: string;
  /** The model file its cube is in, for the link to Model. */
  readonly fileName?: string;
  /** That file's folder, where it isn't the root: the link opens it there (T530, AC-222). */
  readonly fileFolderId?: string;
  /** Whose schedule it is: Cube's refresh worker's, for now always. */
  readonly owner: 'cube';
  /** Whether Cube's refresh worker refreshes it at all. */
  readonly scheduled: boolean;
  /** When it is rebuilt, in words. */
  readonly when: string;
  /** Its key's `every` and `timezone`, as written, where it has them. */
  readonly every?: string;
  readonly timezone?: string;
  /** Its key's SQL, from the model file: checked, not rebuilt, each `every`. */
  readonly sql?: string;
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

function scheduleOf(
  cube: Value,
  each: Value,
  stored: ReadonlyMap<string, string>,
): Schedule | undefined {
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
    ...fileOf(stored, cubeName, cube['fileName']),
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

/**
 * Every pre-aggregation of every cube the metadata lists, in model order —
 * and, from the model's files, the SQL of a key that has one (T273's review),
 * which the metadata drops: such a key is checked on its interval and
 * rebuilds only when the SQL's value changes, not every interval.
 */
export function schedulesFrom(
  meta: unknown,
  files: readonly ModelFile[] = [],
  /** Each published folder's xcube id, by wechart's folder id: its cubes' prefix (T450's review). */
  folders: ReadonlyMap<string, string> = new Map(),
  /** Where each cube is published (T371); none, and rows name no folder. */
  placed?: (cube: Record<string, unknown>) => Placement,
): Schedule[] {
  const cubes = asValue(meta)?.['cubes'];
  if (!Array.isArray(cubes)) return [];
  const sqlOf = refreshKeySqlOf(files, folders);
  // The stored file declaring each cube, over Cube's `fileName` (T449): the
  // root's, which are the files Model opens.
  const stored = pathsByName(
    files.filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === ROOT_FOLDER_ID),
  );
  // A folder's cube is `<xcubeId>__<name>` (T450's review): its folder, and the name its file declares.
  const folderOfXcube = new Map([...folders].map(([folderId, xcubeId]) => [xcubeId, folderId]));
  const fileIn = filesInFolders(files);
  const homeOf = (name: string) => {
    const at = name.indexOf('__');
    const folderId = at > 0 ? folderOfXcube.get(name.slice(0, at)) : undefined;
    return folderId === undefined
      ? { folderId: ROOT_FOLDER_ID, shortName: name }
      : { folderId, shortName: name.slice(at + 2) };
  };
  return cubes.flatMap((cube: unknown) => {
    const value = asValue(cube);
    const all = value?.['preAggregations'];
    if (value === undefined || !Array.isArray(all)) return [];
    const where = placed === undefined ? {} : placed(value);
    // Its own folder's file, which that folder's model page opens (T530, AC-222).
    const home = homeOf(typeof value['name'] === 'string' ? value['name'] : '');
    const own = fileIn(home.folderId, home.shortName);
    return all.flatMap((each: unknown) => {
      const found = asValue(each);
      const unplaced = found === undefined ? undefined : scheduleOf(value, found, stored);
      if (unplaced === undefined) return [];
      // A folder's never takes the root's file, nor xcube's own file name.
      const { fileName: _cubes, ...rest } = unplaced;
      void _cubes;
      const schedule = {
        ...(home.folderId === ROOT_FOLDER_ID ? unplaced : rest),
        ...own,
        ...where,
      };
      const sql = sqlOf.get(schedule.id);
      if (sql === undefined || !schedule.scheduled) return [schedule];
      return [
        {
          ...schedule,
          sql,
          when:
            schedule.every === undefined
              ? 'When its SQL returns a new value, checked every 10 seconds'
              : `When its SQL returns a new value, checked every ${schedule.every}`,
        },
      ];
    });
  });
}

export function registerSchedules(
  app: FastifyInstance,
  client: CubeClient,
  modelFiles?: {
    list(): Promise<readonly ModelFile[]>;
    all?(): Promise<readonly ModelFile[]>;
  },
  /** Where each folder is published, when folders are (T452). */
  folders?: () => Promise<PublishedFolders>,
  /** Who may see which folders' schedules (T371, AC-297); none, and everyone sees all. */
  access?: JobsAccess,
): void {
  /**
   * The Schedules workspace's: a read-write member's own folders' (T371).
   * With `?seen=1`, a dashboard's Data as of's: the folders its viewer may
   * see, whoever they are (R40).
   */
  app.get('/api/schedules', USER, async (request, reply) => {
    const scope = access === undefined ? EVERYTHING : await access.scope(request);
    const forDataAsOf = (request.query as { seen?: unknown }).seen === '1';
    if (!scope.all && !forDataAsOf && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const rows = schedulesFrom(
      // The whole model's, xcube's own: the folder gate filters no own read (T436).
      await client.modelMeta(),
      // Every folder's files where the store has them: a folder's rollups too.
      modelFiles === undefined ? [] : await (modelFiles.all?.() ?? modelFiles.list()),
      folders === undefined ? new Map() : (await folders()).ids,
      access === undefined ? undefined : await placements(access),
    );
    if (!forDataAsOf) return rows.filter((row) => reaches(scope, row.folderId ?? null));
    // Data as of: of a folder the viewer may see but not write, only its
    // freshness, the schedule in words; never the model's file, key or SQL,
    // and no way into Jobs (R42.7; T371's review).
    return rows
      .filter((row) => reaches(scope, row.folderId ?? null, 'sees'))
      .map((row) => {
        if (reaches(scope, row.folderId ?? null)) return { ...row, mayOpen: true };
        return {
          id: row.id,
          ...(row.folderId === undefined ? {} : { folderId: row.folderId }),
          ...(row.shortName === undefined ? {} : { shortName: row.shortName }),
          ...(row.folderPath === undefined ? {} : { folderPath: row.folderPath }),
          cube: row.cube,
          name: row.name,
          type: row.type,
          owner: row.owner,
          scheduled: row.scheduled,
          when: row.when,
          mayOpen: false,
        };
      });
  });
}
