import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { CubeClient } from '../cube/client';
import type { BuildHistory, StartFound, Starter } from '../repos/build-history';
import type { ModelFileStore } from '../server';
import type { QueueEntry, XcubeQueue } from '../xcube/queue';
import { listedBuildables, type Buildable } from './build';
import { shownNameOf } from './history';
import { EVERYTHING, NO_JOBS, reaches, type JobsAccess } from './scope';

/**
 * The build queue (T376, AC-151; design 16, state C): every build waiting or
 * running in the user's folders, oldest first, from xcube's queue route,
 * each with who started it — the person or wechart schedule wechart's history
 * names by the entry's request id or job token, else Cube's refresh worker or
 * a query — and its token where wechart started it (Q5). A queued build
 * wechart started can be cancelled by its key; the refresh worker's would be
 * queued again at its next run, and a query's is Cube's own, so neither may
 * be (Q1), and that is refused before xcube is asked.
 */
export type QueueStarter =
  | Starter
  | { readonly kind: 'refresh-worker' }
  | { readonly kind: 'query' }
  /** A jobs post wechart has no record of. */
  | { readonly kind: 'jobs' };

export interface QueueRow {
  readonly key: string;
  readonly preAggregation: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly folderPath: readonly string[];
  readonly partition: QueueEntry['partition'];
  readonly granularity: string | null;
  readonly state: 'queued' | 'building' | 'stalled';
  readonly addedAt: string;
  readonly starter: QueueStarter;
  readonly token: string | null;
  readonly runId: string | null;
  readonly cancellable: boolean;
}

const REFUSED_BY_XCUBE: Record<string, string> = {
  processing: 'Not cancelled: it had started building.',
  gone: 'Not cancelled: it had already left the queue.',
};
const NOT_WECHARTS = {
  error: 'Only queued builds wechart started, from Jobs or a schedule, can be cancelled here.',
};
const NOT_YOURS = {
  error: 'You can cancel only the builds of folders you have read-write access to.',
};

/** The start an entry came from: by the job's token, else the post's request id. */
function startOf(entry: QueueEntry, starts: readonly StartFound[]): StartFound | undefined {
  return (
    starts.find((start) => entry.job !== null && start.tokens.some((t) => t.token === entry.job)) ??
    starts.find((start) => entry.requestId !== null && start.requestId === entry.requestId)
  );
}

/** Which of a start's jobs an entry is: its token, its table, or the start's only one. */
function jobOf(entry: QueueEntry, start: StartFound): string | undefined {
  return (
    start.tokens.find((each) => entry.job !== null && each.token === entry.job)?.token ??
    start.tokens.find((each) => each.table !== null && each.table === entry.targetTable)?.token ??
    (start.tokens.length === 1 ? start.tokens[0]?.token : undefined)
  );
}

export function registerQueue(
  app: FastifyInstance,
  {
    queue,
    history,
    client,
    modelFiles,
    access,
    now,
  }: {
    readonly queue: XcubeQueue;
    readonly history?: BuildHistory;
    readonly client: CubeClient;
    readonly modelFiles?: ModelFileStore;
    readonly access?: JobsAccess;
    readonly now: () => Date;
  },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);

  /** The queue as xcube has it, each entry with its pre-aggregation's row and start. */
  const read = async () => {
    const [entries, rows] = await Promise.all([
      queue.list(),
      // Hidden cubes' too: their builds are queued like any (T376's review).
      listedBuildables(client, modelFiles, access, { hidden: true }),
    ]);
    const byId = new Map<string, Buildable>(rows.map((row) => [row.id, row]));
    const starts =
      history === undefined
        ? []
        : await history.startsFor({
            requestIds: entries.flatMap((each) =>
              each.requestId === null ? [] : [each.requestId],
            ),
            tokens: entries.flatMap((each) => (each.job === null ? [] : [each.job])),
          });
    return entries.map((entry) => ({
      entry,
      row: byId.get(entry.preAggregation),
      start: startOf(entry, starts),
    }));
  };

  const rowOf = ({
    entry,
    row,
    start,
  }: {
    entry: QueueEntry;
    row: Buildable | undefined;
    start: StartFound | undefined;
  }): QueueRow => {
    const own = entry.preAggregation.slice(entry.preAggregation.lastIndexOf('.') + 1);
    return {
      key: entry.key,
      preAggregation: entry.preAggregation,
      name:
        row?.shortName === undefined
          ? shownNameOf(entry.preAggregation)
          : `${row.shortName}.${own}`,
      folderId: row?.folderId ?? null,
      folderPath: row?.folderPath ?? ['Shared', 'A folder no longer there'],
      partition: entry.partition,
      granularity: row?.partitionGranularity ?? null,
      state: entry.stalled ? 'stalled' : entry.status === 'processing' ? 'building' : 'queued',
      addedAt: entry.addedAt,
      starter:
        start !== undefined
          ? start.starter
          : entry.startedBy === 'scheduler'
            ? { kind: 'refresh-worker' }
            : entry.startedBy === 'query'
              ? { kind: 'query' }
              : { kind: 'jobs' },
      // A token only for a build wechart started (Q5): xcube's, else the one
      // wechart's history has for it, when xcube knows only the request id.
      token: start === undefined ? null : (entry.job ?? jobOf(entry, start) ?? null),
      runId: start?.runId ?? null,
      cancellable: start !== undefined && entry.status === 'queued',
    };
  };

  app.get('/api/jobs/queue', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const rows = (await read())
      .filter(({ row }) => reaches(scope, row?.folderId ?? null))
      .map(rowOf)
      // Oldest first, as the queue runs them.
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    return { entries: rows, everyFolder: scope.all };
  });

  app.post('/api/jobs/queue/cancel', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const key = (request.body as { key?: unknown } | undefined)?.key;
    if (typeof key !== 'string' || key === '')
      return reply.status(400).send({ error: 'Name the queue entry by its key.' });
    const found = (await read()).find(({ entry }) => entry.key === key);
    // No longer queued at all: said so without asking xcube.
    if (found === undefined)
      return { cancelled: false, reason: 'gone', message: REFUSED_BY_XCUBE['gone'] };
    if (!reaches(scope, found.row?.folderId ?? null)) return reply.status(403).send(NOT_YOURS);
    if (found.start === undefined) return reply.status(403).send(NOT_WECHARTS);

    // When the cancel was asked: a job the follower ends after it, its
    // partition missing, was this cancel's (T376's review).
    const askedAt = now();
    const answer = await queue.cancel([key]);
    if (!answer.cancelled.includes(key)) {
      const reason = answer.notCancelled.find((each) => each.key === key)?.reason ?? 'gone';
      return {
        cancelled: false,
        reason,
        message: REFUSED_BY_XCUBE[reason] ?? `Not cancelled: ${reason}.`,
      };
    }
    // Recorded as cancelled, by whom (AC-150).
    const token = jobOf(found.entry, found.start);
    const user = userOf(request);
    const recorded =
      token !== undefined &&
      history !== undefined &&
      (await history.cancelled({
        runId: found.start.runId,
        token,
        by: { key: user.key, name: user.name },
        at: now(),
        askedAt,
      }));
    // xcube cancelled it either way: said so, and the miss logged.
    if (!recorded)
      request.log.warn({ key, runId: found.start.runId }, 'a cancel xcube made was not recorded');
    return { cancelled: true };
  });
}
