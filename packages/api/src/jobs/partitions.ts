import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import type { BuildHistory, Starter } from '../repos/build-history';
import type { ModelFileStore } from '../server';
import { PartitionsPending, type XcubePartitions } from '../xcube/partitions';
import type { XcubeQueue } from '../xcube/queue';
import { listedBuildables, type Buildable } from './build';
import { shownNameOf } from './history';
import { EVERYTHING, NO_JOBS, reaches, type JobsAccess } from './scope';

/**
 * A rollup's partitions (T375, AC-145; design 16, screen 1 and state A):
 * every partition Cube derives from its build range, in UTC, newest first,
 * each with its period, its state and when Cube last built it. Built and not
 * built come from xcube's partitions route; building, queued and stalled
 * from its queue (T376); failed only from a build wechart started — the
 * latest of the partition, failed, with no version made since — naming the
 * build it still serves (R41). A rollup that isn't partitioned is one
 * partition, the whole pre-aggregation; a lambda or a rollup join has none
 * of its own, and names the rollups it combines (A3).
 */
export type PartitionState = 'built' | 'not-built' | 'building' | 'queued' | 'stalled' | 'failed';

export interface PartitionRow {
  readonly tableName: string;
  /** Its period's start and end, wall-clock UTC; none for the whole pre-aggregation. */
  readonly start: string | null;
  readonly end: string | null;
  readonly state: PartitionState;
  /** When Cube made its newest version: when its newest build was started. */
  readonly lastBuiltAt: string | null;
  /** Who started its queued or running build, where wechart did. */
  readonly startedBy?: Starter;
  /** The failed build wechart started, and the version it still serves. */
  readonly failed?: {
    readonly runId: string;
    readonly at: string;
    readonly serving: string | null;
  };
}

const NOT_FOUND = { error: 'There’s no pre-aggregation by that name in your folders.' };
/**
 * A build of a partition Cube recorded as failed. Not `missing_partition`:
 * a job Cube's queue merged into a build already queued reads that while
 * that build makes the partition's version, stamped before wechart's start
 * (research cube/job-records.md, "Queue de-duplication makes a job report
 * `missing_partition`"), so it can't say the partition failed (T375's review).
 */
const FAILED = (status: string | null) => status !== null && status.startsWith('failure');

export function registerPartitions(
  app: FastifyInstance,
  {
    partitions,
    queue,
    history,
    client,
    modelFiles,
    access,
  }: {
    readonly partitions: XcubePartitions;
    readonly queue?: XcubeQueue;
    readonly history?: BuildHistory;
    readonly client: CubeClient;
    readonly modelFiles?: ModelFileStore;
    readonly access?: JobsAccess;
  },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);
  const nameOf = (row: Buildable | undefined, id: string) =>
    row?.shortName === undefined
      ? shownNameOf(id)
      : `${row.shortName}.${id.slice(id.lastIndexOf('.') + 1)}`;

  app.get('/api/jobs/partitions', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const id = (request.query as { preagg?: unknown }).preagg;
    if (typeof id !== 'string' || id === '') return reply.status(404).send(NOT_FOUND);
    const rows = await listedBuildables(client, modelFiles, access);
    const row = rows.find((each) => each.id === id);
    // Out of scope reads as missing (design 16, G6).
    if (row === undefined || !reaches(scope, row.folderId ?? null))
      return reply.status(404).send(NOT_FOUND);
    const name = nameOf(row, id);

    if (row.buildable === false)
      return {
        id,
        name,
        kind: 'combined',
        granularity: null,
        partitions: [],
        builtFrom: (row.builtFrom ?? []).map((each) => {
          const from = rows.find((other) => other.id === each);
          return { id: each, name: nameOf(from, each), folderPath: from?.folderPath ?? null };
        }),
      };

    let listed;
    try {
      listed = await partitions.of(id);
    } catch (error) {
      // Never shown as none: still being worked out, to be asked again (A4).
      if (error instanceof PartitionsPending)
        return reply.status(503).send({ error: error.message, pending: true });
      throw error;
    }
    const entries =
      queue === undefined ? [] : (await queue.list()).filter((e) => e.preAggregation === id);
    const starts =
      history === undefined || entries.length === 0
        ? []
        : await history.startsFor({
            requestIds: entries.flatMap((each) =>
              each.requestId === null ? [] : [each.requestId],
            ),
            tokens: entries.flatMap((each) => (each.job === null ? [] : [each.job])),
          });
    const jobs = history === undefined ? [] : await history.jobsOf(id);

    const parts = listed.partitions.map((partition): PartitionRow => {
      const newest = partition.versions[0];
      const lastBuiltAt = newest === undefined ? null : new Date(newest).toISOString();
      const base = {
        tableName: partition.tableName,
        start: partition.start,
        end: partition.end,
        lastBuiltAt,
      };
      const entry = entries.find((each) => each.table === partition.tableName);
      if (entry !== undefined) {
        const start = starts.find(
          (each) =>
            (entry.job !== null && each.tokens.some((t) => t.token === entry.job)) ||
            (entry.requestId !== null && each.requestId === entry.requestId),
        );
        return {
          ...base,
          state: entry.stalled ? 'stalled' : entry.status === 'processing' ? 'building' : 'queued',
          ...(start === undefined ? {} : { startedBy: start.starter }),
        };
      }
      // The latest build of this partition wechart started: failed, with no
      // version made since, it reads failed (AC-145).
      const latest = jobs.find(
        (job) => job.table !== null && job.table.startsWith(`${partition.tableName}_`),
      );
      if (
        latest?.finished === true &&
        FAILED(latest.status) &&
        (newest ?? 0) < latest.startedAt.getTime()
      )
        return {
          ...base,
          state: 'failed',
          failed: {
            runId: latest.runId,
            at: (latest.finishedAt ?? latest.startedAt).toISOString(),
            serving: lastBuiltAt,
          },
        };
      return { ...base, state: newest === undefined ? 'not-built' : 'built' };
    });
    const whole = parts.length === 1 && parts[0]?.start === null;
    return {
      id,
      name,
      kind: whole ? 'whole' : 'partitioned',
      granularity: listed.partitionGranularity ?? row.partitionGranularity ?? null,
      // Newest first (design 16, pin 11).
      partitions: [...parts].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '')),
    };
  });
}
