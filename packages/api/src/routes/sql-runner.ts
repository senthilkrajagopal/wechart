import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { DataSource, DataSourceStore } from '../repos/data-sources';
import type { SqlRunnerSwitchStore } from '../repos/sql-runner-switches';
import { XcubeError } from '../xcube/client';
import { connectionNameOf } from '../xcube/connections';
import type { SqlAnswer, SqlTarget, XcubeSqlRunner } from '../xcube/sql-runner';
import type { DataSourceAccess } from './data-sources';
import { copyRepointed } from './sql-runner-switch';

/**
 * The SQL runner (T532, F40; R50, R51): read-only SQL on a data source's own
 * connection, run by xcube, which alone opens its secret (AD 7), at the
 * request of wechart's server, which decides who may (AD 10).
 *
 * - A shared folder's data source: Super-Admins and the read-write members of
 *   its own folder, once a Super-Admin has switched its runner on (T531);
 *   nobody while it is off (AC-373, R50-1). A member who sees it only as an
 *   ancestor's has no right to write its folder, so none to run SQL there.
 * - A data source in My workspace: its owner, the only one who sees it, with
 *   no switch (AC-383, R50-6); except a copy pointed at another database,
 *   user or role than its original's, which needs the switch (Q8).
 *
 * Each run goes with R50's caps (AC-377, AC-378), and xcube checks it is one
 * SELECT or EXPLAIN (AC-375) and runs it read-only where the database can
 * (AC-376).
 */

/** R50-7, R50-8, R50-10: per run. */
export const SQL_CAPS = { maxRows: 10_000, timeoutMs: 30_000, maxBytes: 10 * 1024 * 1024 } as const;
/** xcube's own limit on a run's SQL (research `xcube-sql-runner.md`). */
const MAX_SQL = 100_000;

const OFF = 'The SQL runner is off for this data source: a Super-Admin turns it on.';
const NOT_YOURS = 'Only Super-Admins and read-write members of its own folder run SQL on it.';
const UNTIL_LANDED =
  'No Super-Admin can see your workspace, so propose it: once it’s approved and landed, a Super-Admin can turn it on there.';
const NEEDS_SWITCH = {
  repointed: `This copy signs in to another database, or as another user or role, than its original, so it needs a Super-Admin to turn the SQL runner on, as a shared data source does. ${UNTIL_LANDED}`,
  gone: `This copy’s original is gone, so whether it signs in as its original did can’t be told: it needs a Super-Admin to turn the SQL runner on, as a shared data source does. ${UNTIL_LANDED}`,
} as const;
const ONLY_READS = 'Only SELECT and EXPLAIN run here, one statement at a time.';
const STOPPED =
  'Stopped at 30 seconds: the run hadn’t finished, so it was stopped on the database.';
const CANCELLED = 'Cancelled: the run was stopped on the database.';
const BUSY = 'xcube is running as many SQL runs as it takes at once. Try again in a moment.';

/** What xcube needs to run SQL here: its routes, and where each data source is in it. */
export interface SqlRunnerOptions {
  readonly xcube: XcubeSqlRunner;
  /** The folders xcube's tree holds: each one's xcube id, by wechart's. */
  readonly folders: () => Promise<ReadonlyMap<string, string>>;
  /**
   * A workspace's overlay, made sure of in xcube (T347): its id, or what
   * xcube said of it; none where the workspace has nothing to overlay. Unset
   * where workspaces have no previews: sign-in off, or no xcube.
   */
  readonly overlayOf?: (
    workspaceId: string,
  ) => Promise<{ readonly id: string } | { readonly problem: string } | undefined>;
}

/** Why a user may not run SQL on a data source, said as an answer; none where they may. */
export type RunRefusal = { readonly status: number; readonly error: string } | undefined;

/**
 * Whether the request's user may run SQL on this data source, which they may
 * already see (`reached`): R50-1 and AC-383, as one rule for the run and the tab.
 */
export async function mayRunSql(
  request: FastifyRequest,
  source: DataSource,
  {
    workspace,
    access,
    switches,
    store,
  }: {
    /** The workspace it is in; null for a shared folder's. */
    readonly workspace: string | null;
    readonly access: DataSourceAccess;
    readonly switches: SqlRunnerSwitchStore | undefined;
    readonly store: Pick<DataSourceStore, 'get'>;
  },
): Promise<RunRefusal> {
  const on = async () => (await switches?.of(source.id)) !== undefined;
  if (workspace !== null) {
    // Its owner's alone: no one else sees it (AC-276), so `reached` refused them.
    const why = await whyNeedsSwitch(source, store);
    if (why === undefined) return undefined;
    return (await on()) ? undefined : { status: 403, error: NEEDS_SWITCH[why] };
  }
  if ((await access(request, source.folderId, 'write')) !== undefined)
    return { status: 403, error: NOT_YOURS };
  return (await on()) ? undefined : { status: 403, error: OFF };
}

/**
 * A workspace's data source needs the switch only as a copy pointed elsewhere
 * than its original (Q8). One whose original is gone can't be compared, and
 * so needs it too (Claude's call, overturnable).
 */
export async function whyNeedsSwitch(
  source: DataSource,
  store: Pick<DataSourceStore, 'get'>,
): Promise<'repointed' | 'gone' | undefined> {
  if (source.origin === null) return undefined;
  const original = await store.get(source.origin.id);
  if (original === undefined) return 'gone';
  return copyRepointed(source.driver, original, source) ? 'repointed' : undefined;
}

export const needsSwitch = async (
  source: DataSource,
  store: Pick<DataSourceStore, 'get'>,
): Promise<boolean> => (await whyNeedsSwitch(source, store)) !== undefined;

/** A run's answer, as the browser is given it: never its redacted SQL, which history keeps (T534). */
function answered(reply: FastifyReply, answer: SqlAnswer) {
  switch (answer.kind) {
    case 'ran':
      return {
        outcome: 'finished',
        columns: answer.columns,
        rows: answer.rows,
        rowCount: answer.rowCount,
        truncated: answer.truncated,
        durationMs: answer.durationMs,
        statement: answer.statement,
      };
    case 'refused':
      return reply.status(400).send({
        outcome: 'refused',
        error: ONLY_READS,
        reason: answer.reason,
        statement: answer.statement,
      });
    case 'stopped':
      return reply.status(422).send({
        outcome: answer.how,
        error: answer.how === 'timeout' ? STOPPED : CANCELLED,
        durationMs: answer.durationMs,
      });
    case 'failed':
      return reply.status(answer.code === 'connect_failed' ? 502 : 422).send({
        outcome: 'failed',
        error:
          answer.code === 'connect_failed'
            ? `Couldn’t connect to the database: ${answer.error}`
            : answer.error,
        durationMs: answer.durationMs,
      });
    case 'busy':
      return reply.status(503).header('retry-after', '5').send({ outcome: 'busy', error: BUSY });
    case 'missing':
      return reply.status(409).send({
        outcome: 'unavailable',
        error:
          answer.code === 'unknown_overlay'
            ? 'xcube no longer holds your workspace’s preview. Run it again.'
            : 'xcube doesn’t hold this data source’s connection yet. Try again in a moment.',
      });
  }
}

export function registerSqlRunner(
  app: FastifyInstance,
  {
    runner,
    store,
    switches,
    access,
    reached,
    workspaceOf,
  }: {
    /** Unset where xcube isn't run: a run then says so. */
    readonly runner: SqlRunnerOptions | undefined;
    readonly store: Pick<DataSourceStore, 'get'>;
    readonly switches: SqlRunnerSwitchStore | undefined;
    readonly access: DataSourceAccess;
    /** The data source, where the user may see it; else the answer already sent. */
    readonly reached: (
      request: FastifyRequest,
      reply: FastifyReply,
      want: 'read',
    ) => Promise<DataSource | undefined>;
    /** The workspace a folder is in, or null for a shared one. */
    readonly workspaceOf: ((folderId: string) => Promise<string | null>) | undefined;
  },
): void {
  /** Where in xcube a data source runs, or why it can't. */
  const targetOf = async (
    reply: FastifyReply,
    source: DataSource,
    workspace: string | null,
    options: SqlRunnerOptions,
  ): Promise<SqlTarget | undefined> => {
    const ids = await options.folders();
    if (workspace === null) {
      const xcubeId = ids.get(source.folderId);
      if (xcubeId !== undefined) return { connection: connectionNameOf(xcubeId, source.name) };
      await reply.status(409).send({
        error: 'This data source’s folder isn’t in xcube yet, so SQL can’t run on it.',
      });
      return undefined;
    }
    // In its workspace's overlay, a copy stands in its original's folder, a
    // new one in its target's (T347), under its own name.
    const placed = ids.get(source.origin?.folderId ?? source.targetFolderId ?? '');
    if (options.overlayOf === undefined || placed === undefined) {
      await reply.status(409).send({
        error:
          options.overlayOf === undefined
            ? 'SQL on a workspace’s data source runs in its workspace’s preview, which this deployment doesn’t have.'
            : 'Choose the folder it is to go to first: SQL runs on it in your workspace’s preview, which places it there.',
      });
      return undefined;
    }
    const overlay = await options.overlayOf(workspace);
    if (overlay === undefined || 'problem' in overlay) {
      await reply.status(409).send({
        error: `Your workspace can’t be previewed as it is, so SQL can’t run on it: ${
          overlay === undefined ? 'it holds nothing to preview' : overlay.problem
        }`,
      });
      return undefined;
    }
    return { connection: connectionNameOf(placed, source.name), overlay: overlay.id };
  };

  app.post('/api/data-sources/:id/sql', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    const workspace = (await workspaceOf?.(source.folderId)) ?? null;
    const refusal = await mayRunSql(request, source, { workspace, access, switches, store });
    if (refusal !== undefined) return reply.status(refusal.status).send({ error: refusal.error });

    const sql = (request.body as { sql?: unknown } | undefined)?.sql;
    if (typeof sql !== 'string' || sql.trim() === '')
      return reply.status(400).send({ error: 'Send the SQL to run: { sql }.' });
    if (sql.length > MAX_SQL)
      return reply
        .status(400)
        .send({ error: `SQL runs at most ${MAX_SQL.toLocaleString('en')} characters long.` });
    if (runner === undefined)
      return reply.status(503).send({
        error: 'SQL runs on xcube, which this deployment doesn’t run.',
      });

    const target = await targetOf(reply, source, workspace, runner);
    if (target === undefined) return reply;
    try {
      return answered(
        reply,
        await runner.xcube.run(target, { sql, runId: randomUUID(), ...SQL_CAPS }),
      );
    } catch (error) {
      if (error instanceof XcubeError)
        return reply
          .status(502)
          .send({ outcome: 'failed', error: `xcube refused the run: ${error.message}` });
      request.log.warn({ err: error }, 'could not ask xcube to run SQL');
      return reply.status(503).send({
        outcome: 'unavailable',
        error: 'xcube can’t be reached to run the SQL. Try again once it’s back.',
      });
    }
  });
}
