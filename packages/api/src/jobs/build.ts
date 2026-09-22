import type { FastifyInstance } from 'fastify';

import type { CubeClient } from '../cube/client';

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
}

/**
 * The pre-aggregations wechart offers to build, in model order: the rollups
 * and original-SQL ones of the cubes Cube's extended metadata lists. That
 * leaves out a cube marked `public: false`, which the metadata does not list
 * outside dev mode (research/cube/access-control.md) — its rollups are built
 * by the refresh worker, and cannot be started from here.
 */
export function buildablesFrom(meta: unknown): Buildable[] {
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes)) return [];
  return (cubes as { name?: unknown; preAggregations?: unknown }[]).flatMap((cube) =>
    typeof cube.name === 'string' && Array.isArray(cube.preAggregations)
      ? (cube.preAggregations as Record<string, unknown>[])
          .filter(
            (each) =>
              typeof each['name'] === 'string' &&
              BUILDABLE_TYPES.includes(typeof each['type'] === 'string' ? each['type'] : 'rollup'),
          )
          .map((each) => ({
            id: `${String(cube.name)}.${String(each['name'])}`,
            type: typeof each['type'] === 'string' ? each['type'] : 'rollup',
            ...(typeof each['partitionGranularity'] === 'string'
              ? { partitionGranularity: each['partitionGranularity'] }
              : {}),
          }))
      : [],
  );
}

export function registerBuilds(app: FastifyInstance, client: CubeClient): void {
  app.get('/api/preaggregations', async () => buildablesFrom(await client.metaExtended()));

  app.post('/api/builds', async (request, reply) => {
    const preAggregation = (request.body as { preAggregation?: unknown } | undefined)
      ?.preAggregation;
    if (typeof preAggregation !== 'string' || !PRE_AGGREGATION.test(preAggregation))
      return reply.status(400).send({ error: 'Name the pre-aggregation as cube.name.' });
    const tokens = await client.buildPreAggregations([preAggregation]);
    return {
      tokens: Array.isArray(tokens) ? tokens.filter((each) => typeof each === 'string') : [],
    };
  });

  app.post('/api/builds/status', async (request, reply) => {
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
