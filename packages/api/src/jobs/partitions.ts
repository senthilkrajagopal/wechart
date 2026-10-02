import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import type { BuildHistory, Starter } from '../repos/build-history';
import type { ModelFileStore } from '../server';
import { PartitionsPending, type PartitionsOf, type XcubePartitions } from '../xcube/partitions';
import type { QueueEntry, XcubeQueue } from '../xcube/queue';
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

type Job = Awaited<ReturnType<BuildHistory['jobsOf']>>[number];
type Start = Awaited<ReturnType<BuildHistory['startsFor']>>[number];

/**
 * Each partition's state (AC-145): built or not from its versions; building,
 * queued or stalled from the queue, with who started it where wechart did;
 * failed when the latest build of it wechart started failed and no version
 * has been made since, naming the version it still serves.
 */
function partitionRowsOf(
  listed: PartitionsOf,
  entries: readonly QueueEntry[],
  jobs: readonly Job[],
  starts: readonly Start[] = [],
): PartitionRow[] {
  return listed.partitions.map((partition): PartitionRow => {
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
}

/** A pre-aggregation's row in Jobs (T550, AC-391; design 16, screen 1 pins 5–7). */
export interface RowState {
  /** The state of its partitions that most needs attention; none for a lambda, or one still being worked out. */
  readonly state:
    'failed' | 'building' | 'queued' | 'stalled' | 'partly' | 'not-built' | 'built' | null;
  /** The partition in that state, by its start; none for one not partitioned. */
  readonly stateAt?: string | null;
  /** Partly built: how many are. */
  readonly built?: number;
  /** How many partitions it has; none for one not partitioned, or a lambda. */
  readonly partitions?: number | null;
  /** When Cube made its newest version of any partition. */
  readonly lastBuiltAt?: string | null;
  /** Who started that build from wechart; none when wechart didn't. */
  readonly startedBy?: Starter | null;
  /** Cube is still working its partitions out: asked again at the next read (A4). */
  readonly pending?: true;
  /** xcube couldn't say its state: its words (T550's review). */
  readonly unreadable?: string;
}

/** Most needing attention first (AC-391). */
const ATTENTION = ['failed', 'building', 'queued', 'stalled'] as const;

/**
 * The version a job made, by its table's last part: base-32 seconds, as Cube
 * names a version (research cube/system-partitions.md, "Build state and
 * versions"); none for a table not named so.
 */
const versionOf = (table: string): number | undefined => {
  const last = table.slice(table.lastIndexOf('_') + 1);
  const seconds = /^[0-9a-v]+$/.test(last) ? parseInt(last, 32) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
};

function rowStateOf(
  listed: PartitionsOf,
  rows: readonly PartitionRow[],
  jobs: readonly Job[],
): RowState {
  const whole = rows.length === 1 && rows[0]?.start === null;
  // The newest partition in that state, as the pane lists them (pin 11).
  const newestFirst = [...rows].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const needing = ATTENTION.flatMap((state) => {
    const found = newestFirst.find((row) => row.state === state);
    return found === undefined ? [] : [{ state, at: found.start }];
  })[0];
  // The newest version of any partition, and the partition it is of.
  let newest: { at: number; tableName: string } | undefined;
  for (const partition of listed.partitions) {
    const at = partition.versions[0];
    if (at !== undefined && (newest === undefined || at > newest.at))
      newest = { at, tableName: partition.tableName };
  }
  // The build of wechart's that made it: its table that version's name, and
  // not failed. Another build in the same second takes the same name and
  // fails (research xcube-jobs-schedules-routes.md, "Checked 2026-10-02
  // (T550)"). One not yet seen to end counts: the version is there, and
  // wechart's follower sees its end a little later (T372).
  const maker =
    newest === undefined
      ? undefined
      : jobs.find(
          (job) =>
            !(job.status ?? '').startsWith('failure') &&
            job.status !== 'missing_partition' &&
            job.status !== 'cancelled' &&
            job.table !== null &&
            job.table.startsWith(`${newest.tableName}_`) &&
            versionOf(job.table) === newest.at,
        );
  const built = listed.partitions.filter((partition) => partition.versions.length > 0).length;
  return {
    state:
      needing?.state ??
      (built === 0 ? 'not-built' : built < listed.partitions.length ? 'partly' : 'built'),
    ...(needing === undefined ? {} : { stateAt: needing.at }),
    ...(needing === undefined && built > 0 && built < listed.partitions.length ? { built } : {}),
    partitions: whole ? null : listed.partitions.length,
    lastBuiltAt: newest === undefined ? null : new Date(newest.at).toISOString(),
    startedBy: maker?.starter ?? null,
  };
}

/**
 * Each pre-aggregation's row state (T550, AC-391), from AC-145's sources:
 * every rollup's partitions in one ask, the queue once, and wechart's
 * history once.
 */
export function rowStates({
  partitions,
  queue,
  history,
}: {
  readonly partitions: XcubePartitions;
  readonly queue?: XcubeQueue;
  readonly history?: BuildHistory;
}) {
  return async (rows: readonly Buildable[]): Promise<Map<string, RowState>> => {
    const own = rows.filter((row) => row.buildable !== false).map((row) => row.id);
    const states = new Map<string, RowState>();
    let listed, entries, jobs;
    try {
      [listed, entries, jobs] = await Promise.all([
        partitions.ofEach(own),
        queue === undefined ? Promise.resolve([]) : queue.list(),
        history === undefined ? Promise.resolve([]) : history.jobsOf(own),
      ]);
    } catch (error) {
      // No state can be said, but the list and its Build stay (T550's review).
      const said = error instanceof Error ? error.message : String(error);
      for (const row of rows)
        states.set(
          row.id,
          row.buildable === false ? { state: null } : { state: null, unreadable: said },
        );
      return states;
    }
    for (const row of rows) {
      if (row.buildable === false) {
        states.set(row.id, { state: null });
        continue;
      }
      const refused = listed.failed.get(row.id);
      if (refused !== undefined) {
        states.set(row.id, { state: null, unreadable: refused });
        continue;
      }
      const found = listed.found.get(row.id);
      if (found === undefined) {
        states.set(row.id, { state: null, pending: true });
        continue;
      }
      const its = jobs.filter((job) => job.preAggregation === row.id);
      const parts = partitionRowsOf(
        found,
        entries.filter((entry) => entry.preAggregation === row.id),
        its,
      );
      states.set(row.id, rowStateOf(found, parts, its));
    }
    return states;
  };
}

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

    const parts = partitionRowsOf(listed, entries, jobs, starts);
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
