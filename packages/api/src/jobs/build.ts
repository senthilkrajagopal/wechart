import type { FastifyInstance } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import { fileOf, pathsByName } from '../model/split';
import type { ModelFile, ModelFileStore } from '../server';

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

/** `cube.pre_aggregation`, and nothing a selector could be made of. */
const PRE_AGGREGATION = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

export interface Buildable {
  /** `cube.name`, as the jobs API's selector names it. */
  readonly id: string;
  readonly type: string;
  readonly partitionGranularity?: string;
  /** What rebuilds it, in words: its refresh key (AC-229). */
  readonly trigger: string;
  /** The model file its cube is defined in, for the link to Model (AC-229). */
  readonly fileName?: string;
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
export function buildablesFrom(meta: unknown, files: readonly ModelFile[] = []): Buildable[] {
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes)) return [];
  // The stored file declaring each cube, over Cube's `fileName` (T449).
  const stored = pathsByName(files);
  return (cubes as { name?: unknown; fileName?: unknown; preAggregations?: unknown }[]).flatMap(
    (cube) =>
      typeof cube.name === 'string' && Array.isArray(cube.preAggregations)
        ? (cube.preAggregations as Record<string, unknown>[])
            .filter(
              (each) =>
                typeof each['name'] === 'string' &&
                BUILDABLE_TYPES.includes(
                  typeof each['type'] === 'string' ? each['type'] : 'rollup',
                ),
            )
            .map((each) => ({
              id: `${String(cube.name)}.${String(each['name'])}`,
              type: typeof each['type'] === 'string' ? each['type'] : 'rollup',
              ...(typeof each['partitionGranularity'] === 'string'
                ? { partitionGranularity: each['partitionGranularity'] }
                : {}),
              trigger: triggerOf(each),
              ...fileOf(stored, String(cube.name), cube.fileName),
            }))
        : [],
  );
}

export function registerBuilds(
  app: FastifyInstance,
  client: CubeClient,
  modelFiles?: ModelFileStore,
): void {
  app.get('/api/preaggregations', USER, async () =>
    buildablesFrom(await client.metaExtended(), modelFiles ? await modelFiles.list() : []),
  );

  app.post('/api/builds', USER, async (request, reply) => {
    const preAggregation = (request.body as { preAggregation?: unknown } | undefined)
      ?.preAggregation;
    if (typeof preAggregation !== 'string' || !PRE_AGGREGATION.test(preAggregation))
      return reply.status(400).send({ error: 'Name the pre-aggregation as cube.name.' });
    const tokens = await client.buildPreAggregations([preAggregation]);
    return {
      tokens: Array.isArray(tokens) ? tokens.filter((each) => typeof each === 'string') : [],
    };
  });

  app.post('/api/builds/status', USER, async (request, reply) => {
    const tokens = (request.body as { tokens?: unknown } | undefined)?.tokens;
    if (
      !Array.isArray(tokens) ||
      tokens.length === 0 ||
      !tokens.every((token) => typeof token === 'string' && token !== '')
    )
      return reply.status(400).send({ error: 'Name the jobs by their tokens.' });
    const answered = await client.jobStatuses(tokens as string[]);
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
