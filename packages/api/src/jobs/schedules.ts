import type { FastifyInstance } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import { refreshKeySqlOf } from '../model/refreshKeys';
import { filesInFolders, fileOf, pathsByName } from '../model/split';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile } from '../server';
import type { PublishedFolders } from '../xcube/folders';
import type { Buildable } from './build';
import type { RowState } from './partitions';
import { modelKeysOf, refreshWordsOf, type ModelKeys, type RefreshWords } from './refreshWords';
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
  /** What kind of schedule it is, for its icon (refreshWords.ts). */
  readonly kind: RefreshWords['kind'];
  /** Whether Cube's refresh worker refreshes it at all. */
  readonly scheduled: boolean;
  /** When it is rebuilt, in words (T551: design 16, screen 2 pin 6). */
  readonly when: string;
  /** Its key as the model writes it. */
  readonly written: string;
  /** The key Cube turns over on, where one says when: its next runs come from it. */
  readonly runs?: RefreshWords['runs'];
  /** Its key's `every` and `timezone`, as written, where it has them. */
  readonly every?: string;
  readonly timezone?: string;
  /** Its key's SQL, from the model file: checked, not rebuilt, each `every`. */
  readonly sql?: string;
  /** False for a cube marked `public: false`, which xcube's admin meta lists with hidden=true. */
  readonly public?: false;
  /** When Cube made its newest version, from the partitions route (T375); none, never built. */
  readonly lastBuiltAt?: string | null;
}

type Value = Record<string, unknown>;
const asValue = (value: unknown): Value | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Value)
    : undefined;

function scheduleOf(
  cube: Value,
  each: Value,
  stored: ReadonlyMap<string, string>,
  model: ModelKeys,
  home: { readonly folderId: string; readonly shortName: string },
): Schedule | undefined {
  const cubeName = cube['name'];
  const name = each['name'];
  if (typeof cubeName !== 'string' || typeof name !== 'string') return undefined;
  const type = typeof each['type'] === 'string' ? each['type'] : 'rollup';
  const key = asValue(each['refreshKey']);
  // In words and as written, as Jobs' Trigger says it (T551; refreshWords.ts).
  const { kind, scheduled, words, written, runs } = refreshWordsOf(each, cube, model, home);
  return {
    id: `${cubeName}.${name}`,
    cube: cubeName,
    name,
    type,
    ...fileOf(stored, cubeName, cube['fileName']),
    owner: 'cube' as const,
    kind,
    scheduled,
    when: words,
    written,
    ...(runs === undefined ? {} : { runs }),
    ...(scheduled && typeof key?.['every'] === 'string' ? { every: key['every'] } : {}),
    ...(scheduled && typeof key?.['timezone'] === 'string' ? { timezone: key['timezone'] } : {}),
    ...(cube['public'] === false ? { public: false as const } : {}),
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
  const model = modelKeysOf(files);
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
      const unplaced =
        found === undefined ? undefined : scheduleOf(value, found, stored, model, home);
      if (unplaced === undefined) return [];
      // A folder's never takes the root's file, nor xcube's own file name.
      const { fileName: _cubes, ...rest } = unplaced;
      void _cubes;
      const schedule = {
        ...(home.folderId === ROOT_FOLDER_ID ? unplaced : rest),
        ...own,
        ...where,
      };
      // Its key's SQL, for Data as of's "as written" (T273's review).
      const sql = sqlOf.get(schedule.id);
      return [sql === undefined || !schedule.scheduled ? schedule : { ...schedule, sql }];
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
  /** When Cube last built each, where xcube's partitions route is there (T551; T375). */
  states?: (rows: readonly Buildable[]) => Promise<Map<string, RowState>>,
): void {
  /** Each row with when Cube last built it: none for a lambda or join, which has no table. */
  const withLastBuilt = async (rows: readonly Schedule[]): Promise<Schedule[]> => {
    if (states === undefined) return [...rows];
    const known = await states(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        trigger: row.when,
        ...(row.type === 'rollupLambda' || row.type === 'rollupJoin'
          ? { buildable: false as const }
          : {}),
      })),
    );
    return rows.map((row) => {
      const state = known.get(row.id);
      return state?.lastBuiltAt === undefined ? row : { ...row, lastBuiltAt: state.lastBuiltAt };
    });
  };
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
      // The whole model's, xcube's own: the folder gate filters no own read
      // (T436); `public: false` cubes too (T551; research
      // xcube-jobs-schedules-routes.md §2).
      // Data as of's only what queries reach (T551's review).
      await client.modelMeta({ hidden: !forDataAsOf }),
      // Every folder's files where the store has them: a folder's rollups too.
      modelFiles === undefined ? [] : await (modelFiles.all?.() ?? modelFiles.list()),
      folders === undefined ? new Map() : (await folders()).ids,
      access === undefined ? undefined : await placements(access),
    );
    if (!forDataAsOf)
      return withLastBuilt(rows.filter((row) => reaches(scope, row.folderId ?? null)));
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
