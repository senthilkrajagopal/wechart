import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { parse as parseYaml } from 'yaml';

import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { CubeClient } from '../cube/client';
import { filesInFolders, fileOf } from '../model/split';
import type { BuildHistory } from '../repos/build-history';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile, ModelFileStore } from '../server';
import { EVERYTHING, NO_JOBS, placements, reaches, type JobsAccess, type Placement } from './scope';

/**
 * Pre-aggregation builds (T155, AC-149), through Cube's documented jobs API:
 * start one, then follow its tokens — one per partition Cube builds — until
 * each reports a state it will not leave (research/cube/
 * refresh-jobs-caching.md §B, and "Observed locally").
 */

/**
 * Whether a job has finished: done, missing its partition, failed (`failure:
 * <message>`), or unknown to Cube (`not_found` — its record kept for 24 h —
 * and `pre_agg_not_found`, its pre-aggregation gone from the model). Anything
 * else is still in Cube's queue: `scheduled`, `processing`, or a raw queue
 * state it passes through.
 */
export function isFinished(status: string): boolean {
  return (
    status === 'done' ||
    status === 'missing_partition' ||
    status === 'not_found' ||
    status === 'pre_agg_not_found' ||
    status.startsWith('failure')
  );
}

export interface JobStatus {
  readonly token: string;
  readonly status: string;
  /** Whether it has reached a state it will not leave (`isFinished`). */
  readonly finished: boolean;
  /** The Cube Store table the partition is built into. */
  readonly table?: string;
}

/**
 * The types offered to build: rollups, and original-SQL pre-aggregations.
 * A lambda or a join is made of rollups listed in their own right, and its
 * build through the jobs API is not researched; both are authoring Non-goals.
 */
const BUILDABLE_TYPES = ['rollup', 'originalSql'];
/**
 * Made of other rollups (research cube/data-apis.md, `type`), listed but not
 * built (T375, AC-145; design 16, A3): Cube answers them from the rollups
 * they combine, which the model names in their `rollups`
 * (research cube/data-modeling.md).
 */
const COMBINED_TYPES = ['rollupLambda', 'rollupJoin'];

/** `cube.pre_aggregation`, and nothing a selector could be made of. */
const PRE_AGGREGATION = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A partition's start as the partitions route gives it: wall-clock, with no
 * zone, to the millisecond (or the microsecond, BigQuery's); Cube takes it as
 * written (research cube/system-partitions.md, "Jobs-API rebuild", 1).
 */
const PARTITION_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})$/;

export interface Buildable {
  /** `cube.name`, as the jobs API's selector names it. */
  readonly id: string;
  /** Its cube's folder, short name and path (T371): what people see. */
  readonly folderId?: string | null;
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  readonly type: string;
  readonly partitionGranularity?: string;
  /** What rebuilds it, in words: its refresh key (AC-229). */
  readonly trigger: string;
  /** The model file its cube is defined in, for the link to Model (AC-229). */
  readonly fileName?: string;
  /** That file's folder, where it isn't the root: the link opens it there (T530, AC-222). */
  readonly fileFolderId?: string;
  /** A lambda's or a rollup join's: not built itself (T375, design 16 A3). */
  readonly buildable?: false;
  /** The rollups it combines, by their published names, as its model file names them. */
  readonly builtFrom?: readonly string[];
}

/**
 * The rollups a lambda or rollup join combines, as its file declares them
 * (`rollups`, research cube/data-modeling.md): each `cube.pre_aggregation`,
 * `CUBE` its own cube, named as published — a folder's with its folder's
 * prefix, as its own cube's.
 */
function rollupsIn(
  content: string | undefined,
  cube: { readonly name: string; readonly shortName: string },
  preAggregation: string,
): string[] {
  if (content === undefined) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return [];
  }
  const cubes = (parsed as { cubes?: unknown } | null)?.cubes;
  const declared = (Array.isArray(cubes) ? (cubes as Record<string, unknown>[]) : []).find(
    (each) => each['name'] === cube.shortName,
  );
  const entries = Array.isArray(declared?.['pre_aggregations'])
    ? (declared['pre_aggregations'] as Record<string, unknown>[])
    : [];
  const rollups = entries.find((each) => each['name'] === preAggregation)?.['rollups'];
  const prefix = cube.name.endsWith(cube.shortName)
    ? cube.name.slice(0, cube.name.length - cube.shortName.length)
    : '';
  return (Array.isArray(rollups) ? rollups : [])
    .filter((each): each is string => typeof each === 'string' && each.includes('.'))
    .map((each) => {
      const [owner = '', name = ''] = each.split('.');
      return owner === 'CUBE' ? `${cube.name}.${name}` : `${prefix}${owner}.${name}`;
    });
}

/**
 * A pre-aggregation's refresh key in words (AC-229). Its `every`, or the SQL
 * whose answer changing rebuilds it; with `incremental` and `updateWindow`
 * said as such. None declared is Cube's default, `every: 1 hour`
 * (research/cube/refresh-jobs-caching.md: "`refresh_key` (`every` default
 * `1 hour`…)"), said as the default. `scheduled_refresh: false` means the
 * refresh worker leaves it alone, which is said too.
 */
export function triggerOf(each: Record<string, unknown>): string {
  const key = each['refreshKey'];
  const declared =
    typeof key === 'object' && key !== null ? (key as Record<string, unknown>) : undefined;
  let text: string;
  if (key === undefined || key === null) {
    // None declared: Cube's default, and only then (T239's review).
    text = 'Every 1 hour (Cube’s default)';
  } else if (declared !== undefined && typeof declared['sql'] === 'string') {
    // The SQL is the trigger; an `every` beside it is how often it is asked.
    text = `When ${declared['sql']} changes`;
    if (typeof declared['every'] === 'string') text += `, checked every ${declared['every']}`;
  } else if (declared !== undefined && typeof declared['every'] === 'string') {
    text = `Every ${declared['every']}`;
    if (declared['incremental'] === true) text += ', incrementally';
    if (typeof declared['updateWindow'] === 'string')
      text += `, updating the last ${declared['updateWindow']}`;
  } else {
    // Declared, in a shape this build does not read: not claimed to be the
    // default, which it is not.
    text = 'As its refresh key in the model says';
  }
  return each['scheduledRefresh'] === false ? `${text} · not scheduled` : text;
}

/**
 * The pre-aggregations wechart offers to build, in model order: the rollups
 * and original-SQL ones of the cubes Cube's extended metadata lists. That
 * leaves out a cube marked `public: false`, which the metadata does not list
 * outside dev mode (research/cube/access-control.md) — its rollups are built
 * by the refresh worker, and cannot be started from here.
 */
export function buildablesFrom(
  meta: unknown,
  files: readonly ModelFile[] = [],
  /** Where each cube is published (T371); none, and rows name no folder. */
  placed?: (cube: Record<string, unknown>) => Placement,
): Buildable[] {
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes)) return [];
  /**
   * The stored file declaring each cube, over Cube's `fileName` (T449): in
   * its own folder, by the name its file declares (T530, AC-222), so a
   * folder's opens there, and a root cube never takes a folder's file of the
   * same name. A root cube no stored file declares keeps Cube's name.
   */
  const fileIn = filesInFolders(files);
  const fileFor = (cube: { name: string; fileName?: unknown }, where: Placement | undefined) => {
    if (where?.folderId != null && where.folderId !== ROOT_FOLDER_ID)
      return fileIn(where.folderId, where.shortName);
    const own = fileIn(ROOT_FOLDER_ID, cube.name);
    return 'fileName' in own ? own : fileOf(new Map(), cube.name, cube.fileName);
  };
  const contentOf = (file: { fileName?: string; fileFolderId?: string }) =>
    files.find(
      (each) =>
        each.path === file.fileName &&
        (each.folderId ?? ROOT_FOLDER_ID) === (file.fileFolderId ?? ROOT_FOLDER_ID),
    )?.content;
  return (cubes as { name?: unknown; fileName?: unknown; preAggregations?: unknown }[]).flatMap(
    (cube) =>
      typeof cube.name === 'string' && Array.isArray(cube.preAggregations)
        ? (cube.preAggregations as Record<string, unknown>[])
            .filter((each) => {
              const type = typeof each['type'] === 'string' ? each['type'] : 'rollup';
              return (
                typeof each['name'] === 'string' &&
                (BUILDABLE_TYPES.includes(type) || COMBINED_TYPES.includes(type))
              );
            })
            .map((each): Buildable => {
              const where = placed?.(cube as Record<string, unknown>);
              const type = typeof each['type'] === 'string' ? each['type'] : 'rollup';
              const file = fileFor({ name: String(cube.name), fileName: cube.fileName }, where);
              return {
                id: `${String(cube.name)}.${String(each['name'])}`,
                ...(where ?? {}),
                type,
                ...(typeof each['partitionGranularity'] === 'string'
                  ? { partitionGranularity: each['partitionGranularity'] }
                  : {}),
                trigger: triggerOf(each),
                ...file,
                ...(COMBINED_TYPES.includes(type)
                  ? {
                      buildable: false as const,
                      builtFrom: rollupsIn(
                        contentOf(file),
                        {
                          name: String(cube.name),
                          shortName: where?.shortName ?? String(cube.name),
                        },
                        String(each['name']),
                      ),
                    }
                  : {}),
              };
            })
        : [],
  );
}

/**
 * The pre-aggregations wechart offers to build, each with its folder: the
 * whole model's, xcube's own, whose folder gate filters no own read (T436),
 * with every folder's files, so a folder's rollup finds its own (T530's
 * review). Jobs' list, and the queue's entries' folders (T376).
 */
export async function listedBuildables(
  client: CubeClient,
  modelFiles: ModelFileStore | undefined,
  access: JobsAccess | undefined,
  /** Cubes marked `public: false` too: the queue's, which the refresh worker builds (T376's review). */
  { hidden = false }: { readonly hidden?: boolean } = {},
): Promise<Buildable[]> {
  return buildablesFrom(
    await client.modelMeta({ hidden }),
    modelFiles === undefined ? [] : await (modelFiles.all?.() ?? modelFiles.list()),
    access === undefined ? undefined : await placements(access),
  );
}

export function registerBuilds(
  app: FastifyInstance,
  client: CubeClient,
  modelFiles?: ModelFileStore,
  /** Who may build what (T371, AC-297); none, and everything is everyone's (sign-in off). */
  access?: JobsAccess,
  /** Where each start is recorded, and the clock it is recorded by (T372, AC-150). */
  history?: { readonly store: BuildHistory; readonly now: () => Date },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);
  const listed = () => listedBuildables(client, modelFiles, access);

  // A read-write member's own folders' only (T371).
  app.get('/api/preaggregations', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    return (await listed()).filter((row) => reaches(scope, row.folderId ?? null));
  });

  app.post('/api/builds', USER, async (request, reply) => {
    const body = request.body as { preAggregation?: unknown; partitions?: unknown } | undefined;
    const preAggregation = body?.preAggregation;
    if (typeof preAggregation !== 'string' || !PRE_AGGREGATION.test(preAggregation))
      return reply.status(400).send({ error: 'Name the pre-aggregation as cube.name.' });
    // Rebuild selected (T375): each partition by its start, a wall-clock UTC
    // string as the partitions route gives it, one or more; none for all.
    // Each asked for once, however often it's named.
    const named = body?.partitions;
    if (
      named !== undefined &&
      (!Array.isArray(named) ||
        named.length === 0 ||
        !named.every((each) => typeof each === 'string' && PARTITION_START.test(each)))
    )
      return reply.status(400).send({
        error: 'Name each partition by its start, as Jobs lists it.',
      });
    const partitions = named === undefined ? undefined : [...new Set(named as string[])];
    // Another folder's is refused before Cube is asked (T371, AC-297).
    const scope = await scopeOf(request);
    let row: Buildable | undefined;
    if (!scope.all) {
      if (!scope.writesAny) return reply.status(403).send(NO_JOBS);
      row = (await listed()).find((each) => each.id === preAggregation);
      if (row === undefined)
        return reply.status(404).send({ error: 'There is no such pre-aggregation.' });
      if (!reaches(scope, row.folderId ?? null))
        return reply.status(403).send({
          error:
            'You can build only the pre-aggregations of folders you have read-write access to.',
        });
    }
    // Its folder found before Cube is asked, so nothing that fails after the
    // post can leave a build running unrecorded (T372's review).
    if (history !== undefined || partitions !== undefined)
      row ??= (await listed()).find((each) => each.id === preAggregation);
    // Made of other rollups: built through them, never itself (T375, A3).
    if (row?.buildable === false)
      return reply.status(400).send({
        error: 'It has no partitions of its own: build the rollups it combines.',
      });
    // wechart's own request id (T372): xcube's queue gives it back on each
    // entry the post made (research xcube-jobs-schedules-routes.md, Gotcha 3).
    // One across a start, so every entry it made names it.
    const requestId = `wechart-${randomUUID()}`;
    const startedAt = history?.now() ?? new Date();
    const asked = partitions ?? [undefined];
    const tokens: string[] = [];
    /** The partitions Cube was asked for and took, and those it refused, with its words. */
    const took: string[] = [];
    const notStarted: { start: string; error: unknown }[] = [];
    // One jobs request per partition, at its start, which is that partition
    // alone (research cube/system-partitions.md, "Jobs-API rebuild of one
    // partition"); one for every partition otherwise.
    for (const start of asked) {
      let answered: unknown;
      try {
        answered = await client.buildPreAggregations([preAggregation], {
          requestId,
          ...(start === undefined ? {} : { dateRange: [start, start] as const }),
        });
      } catch (error) {
        // Build all refused: refused as a whole, as Cube said.
        if (start === undefined) throw error;
        // One no partition meets any more, say, since the list was read
        // (research cube/system-partitions.md, "What comes back"): the others
        // are still asked for, and what started is recorded, never left
        // running unrecorded (T375's review).
        notStarted.push({ start, error });
        continue;
      }
      if (start !== undefined) took.push(start);
      if (Array.isArray(answered))
        tokens.push(...answered.filter((each): each is string => typeof each === 'string'));
    }
    // Every one refused: nothing started, and Cube's refusal is the answer.
    if (notStarted.length === asked.length) throw notStarted[0]!.error;
    const refused =
      notStarted.length === 0
        ? {}
        : {
            notStarted: notStarted.map(({ start, error }) => ({
              start,
              error: error instanceof Error ? error.message : String(error),
            })),
          };
    // A start that made no job built nothing, and is said so, not recorded.
    if (history === undefined || tokens.length === 0) return { tokens, ...refused };
    // One record for the start, followed to its end on the server (T372, AC-150).
    const user = userOf(request);
    const runId = await history.store.start({
      preAggregation,
      folderId: row?.folderId ?? null,
      partitions: partitions === undefined ? null : took,
      granularity: row?.partitionGranularity ?? null,
      via: partitions === undefined ? 'build-all' : 'rebuild-selected',
      starter: { kind: 'person', key: user.key, name: user.name },
      requestId,
      tokens,
      startedAt,
      answeredAt: history.now(),
    });
    return { tokens, runId, ...refused };
  });

  app.post('/api/builds/status', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const tokens = (request.body as { tokens?: unknown } | undefined)?.tokens;
    if (
      !Array.isArray(tokens) ||
      tokens.length === 0 ||
      !tokens.every((token) => typeof token === 'string' && token !== '')
    )
      return reply.status(400).send({ error: 'Name the jobs by their tokens.' });
    const everything = await client.jobStatuses(tokens as string[]);
    // A member's own folders' builds only, by the pre-aggregation Cube kept
    // for each token (T371's review).
    const writable = scope.all
      ? undefined
      : new Set(
          (await listed())
            .filter((row) => reaches(scope, row.folderId ?? null))
            .map((row) => row.id),
        );
    const answered =
      writable === undefined || !Array.isArray(everything)
        ? everything
        : (everything as Record<string, unknown>[]).filter((each) => {
            const named = (each['selector'] as { preAggregations?: unknown } | undefined)
              ?.preAggregations;
            return (
              Array.isArray(named) &&
              named.length > 0 &&
              named.every((id) => typeof id === 'string' && writable.has(id))
            );
          });
    // Each token's state, whether it has finished, and its table — not the
    // selector, which echoes the security context the build ran for. An
    // answer naming no token or no state is left out, not made up: its token
    // then reads as not yet answered, and is asked again.
    return (Array.isArray(answered) ? (answered as Record<string, unknown>[]) : []).flatMap(
      (each): JobStatus[] => {
        const { token, status, table } = each;
        if (typeof token !== 'string' || typeof status !== 'string') return [];
        return [
          {
            token,
            status,
            finished: isFinished(status),
            ...(typeof table === 'string' ? { table } : {}),
          },
        ];
      },
    );
  });
}
