import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { EVERYTHING, NO_JOBS, type JobsAccess, type JobsScope } from './scope';

/**
 * Jobs' header summary (T558, AC-398; design 16, P5): over the user's
 * folders, how many builds are building and how many are queued, how many
 * pre-aggregations read failed by AC-391's rule, and how many wechart
 * schedules are suspended. Each count is of the very rows the list it links
 * to holds for the same user: the queue's tab, the Pre-aggregations tab,
 * Schedules. A count whose list can't be read, or isn't there, is none.
 */
export interface JobsSummary {
  readonly building: number | null;
  readonly queued: number | null;
  readonly failed: number | null;
  readonly suspended: number | null;
}

export function registerJobsSummary(
  app: FastifyInstance,
  {
    access,
    queue,
    preAggregations,
    schedules,
  }: {
    /** Who may use Jobs, over which folders (T371); none, and everyone everywhere (sign-in off). */
    readonly access?: JobsAccess;
    /** The queue tab's entries in a scope (T376); none without xcube's queue route. */
    readonly queue?: (scope: JobsScope) => Promise<readonly { readonly state: string }[]>;
    /** The Pre-aggregations tab's rows in a scope, with their states (T550); none without them. */
    readonly preAggregations?: (
      scope: JobsScope,
    ) => Promise<readonly { readonly state?: string | null; readonly unreadable?: string }[]>;
    /** Schedules' wechart schedules in a scope (T379); none without wechart's scheduler. */
    readonly schedules?: (
      scope: JobsScope,
    ) => Promise<readonly { readonly suspendedAt: Date | null }[]>;
  },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);
  /** How many of a list's rows `counts`; none where the list isn't there or can't be read. */
  const counted = async <Row>(
    list: Promise<readonly Row[]> | undefined,
    counts: (row: Row) => boolean,
    onError: (error: unknown) => void,
  ): Promise<number | null> => {
    if (list === undefined) return null;
    try {
      return (await list).filter(counts).length;
    } catch (error) {
      onError(error);
      return null;
    }
  };

  app.get('/api/jobs/summary', USER, async (request, reply): Promise<JobsSummary> => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const said = (error: unknown) => {
      request.log.warn({ err: error }, 'a count of Jobs’ summary could not be read');
    };
    // The queue read once, for both its counts.
    const entries = queue?.(scope);
    entries?.catch(() => undefined);
    const [building, queued, failed, suspended] = await Promise.all([
      counted(entries, (entry) => entry.state === 'building', said),
      counted(
        entries,
        (entry) => entry.state === 'queued',
        () => undefined,
      ),
      counted(
        preAggregations?.(scope).then((rows) => {
          // A row whose state xcube couldn't say may be failed: no count, not 0 (T558's review).
          const unread = rows.find((row) => row.unreadable !== undefined);
          if (unread !== undefined) throw new Error(unread.unreadable);
          return rows;
        }),
        (row) => row.state === 'failed',
        said,
      ),
      counted(schedules?.(scope), (schedule) => schedule.suspendedAt !== null, said),
    ]);
    return { building, queued, failed, suspended };
  });
}
