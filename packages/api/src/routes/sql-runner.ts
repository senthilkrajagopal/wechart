import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import type { AuditStore } from '../repos/audit';
import type { DataSource, DataSourceStore } from '../repos/data-sources';
import type { SqlRunnerSwitchStore } from '../repos/sql-runner-switches';
import type { GoingRun, LostRun, SqlRunStore } from '../repos/sql-runs';
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

/** A run's answer, its status and body: built first, sent once its row is done (T533's review). */
interface RunReply {
  readonly status: number;
  readonly body: { readonly outcome: string } & Record<string, unknown>;
  readonly retryAfter?: string;
}

/** A run's answer, as the browser is given it: never its redacted SQL, which history keeps (T534). */
function replyOf(answer: SqlAnswer): RunReply {
  switch (answer.kind) {
    case 'ran':
      return {
        status: 200,
        body: {
          outcome: 'finished',
          columns: answer.columns,
          rows: answer.rows,
          rowCount: answer.rowCount,
          truncated: answer.truncated,
          durationMs: answer.durationMs,
          statement: answer.statement,
        },
      };
    case 'refused':
      return {
        status: 400,
        body: {
          outcome: 'refused',
          error: ONLY_READS,
          reason: answer.reason,
          statement: answer.statement,
        },
      };
    case 'stopped':
      return {
        status: 422,
        body: {
          outcome: answer.how,
          error: answer.how === 'timeout' ? STOPPED : CANCELLED,
          durationMs: answer.durationMs,
        },
      };
    case 'failed':
      return {
        status: answer.code === 'connect_failed' ? 502 : 422,
        body: {
          outcome: 'failed',
          error:
            answer.code === 'connect_failed'
              ? `Couldn’t connect to the database: ${answer.error}`
              : answer.error,
          durationMs: answer.durationMs,
        },
      };
    case 'busy':
      return { status: 503, body: { outcome: 'busy', error: BUSY }, retryAfter: '5' };
    case 'missing':
      return {
        status: 409,
        body: {
          outcome: 'unavailable',
          error:
            answer.code === 'unknown_overlay'
              ? 'xcube no longer holds your workspace’s preview. Run it again.'
              : 'xcube doesn’t hold this data source’s connection yet. Try again in a moment.',
        },
      };
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
    runs,
    audit,
    paths,
  }: {
    /** Where each run is recorded (T534, AC-382). */
    readonly audit: Pick<AuditStore, 'record'> | undefined;
    /** Each folder's path from the root, for a run's data source (T534). */
    readonly paths: () => Promise<
      (folderId: string) => readonly { readonly id: string; readonly title: string }[]
    >;
    /** Unset where xcube isn't run: a run then says so. */
    readonly runner: SqlRunnerOptions | undefined;
    /** Each user's runs, one going at a time (T533); unset, none is held back. */
    readonly runs: SqlRunStore | undefined;
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
        outcome: 'unavailable',
        error: 'This data source’s folder isn’t in xcube yet, so SQL can’t run on it.',
      });
      return undefined;
    }
    // In its workspace's overlay, a copy stands in its original's folder, a
    // new one in its target's (T347), under its own name.
    const placed = ids.get(source.origin?.folderId ?? source.targetFolderId ?? '');
    if (options.overlayOf === undefined || placed === undefined) {
      await reply.status(409).send({
        outcome: 'unavailable',
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
        outcome: 'unavailable',
        error: `Your workspace can’t be previewed as it is, so SQL can’t run on it: ${
          overlay === undefined ? 'it holds nothing to preview' : overlay.problem
        }`,
      });
      return undefined;
    }
    return { connection: connectionNameOf(placed, source.name), overlay: overlay.id };
  };

  /** A run its instance never finished, recorded once it is counted lost (T534's review). */
  const recordLost = async (request: FastifyRequest, lost: LostRun) => {
    const source = lost.dataSourceId === null ? undefined : await store.get(lost.dataSourceId);
    const workspace =
      source === undefined ? null : ((await workspaceOf?.(source.folderId)) ?? null);
    await recordIn(
      audit,
      {
        at: lost.startedAt,
        actor: actorOf(request.wechartUser),
        event: 'sql-run',
        folderId:
          source === undefined
            ? null
            : workspace === null
              ? source.folderId
              : (source.origin?.folderId ?? source.targetFolderId ?? source.folderId),
        item:
          lost.dataSourceId === null
            ? { kind: 'cube-store', id: 'cubestore', title: 'Cube Store' }
            : {
                kind: 'data-source',
                id: lost.dataSourceId,
                title: source?.name ?? lost.dataSourceName ?? lost.dataSourceId,
              },
        summary: 'Not finished · its server stopped mid-run',
        details: {
          outcome: 'lost',
          rowCount: null,
          durationMs: null,
          truncated: null,
          statement: null,
          sql: null,
          inWorkspace: workspace !== null,
        },
      },
      request.log,
    );
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

    // One run going at a time for its user, across every API instance (T533, AC-379).
    const runId = randomUUID();
    if (runs !== undefined) {
      // Their runs an instance stopped mid-run never finished: recorded now (T534's review).
      for (const lost of await runs.markLost(userKeyOf(request))) await recordLost(request, lost);
      const started = await runs.start({
        runId,
        userKey: userKeyOf(request),
        dataSourceId: source.id,
        sql,
        dataSourceName: source.name,
      });
      if (!started.started) {
        const going = await goingView(started.going);
        return reply.status(409).send({
          outcome: 'going',
          error: `You have a run going on ${going.dataSource?.name ?? 'a data source'}. One run at a time: cancel it, or wait for it to finish.`,
          going,
        });
      }
    }
    let answer: SqlAnswer | undefined;
    let said: RunReply;
    /** Why there is no answer of xcube's: it refused the request, didn't answer in time, or wasn't reached. */
    let unanswered: 'refused' | 'late' | 'away' | undefined;
    try {
      answer = await runner.xcube.run(target, { sql, runId, ...SQL_CAPS });
      said = replyOf(answer);
    } catch (error) {
      unanswered =
        error instanceof XcubeError
          ? 'refused'
          : (error as { name?: unknown } | null)?.name === 'TimeoutError'
            ? 'late'
            : 'away';
      if (unanswered !== 'refused')
        request.log.warn({ err: error }, 'could not ask xcube to run SQL');
      said =
        unanswered === 'refused'
          ? {
              status: 502,
              body: {
                outcome: 'unavailable',
                error: `xcube refused the run: ${(error as Error).message}`,
              },
            }
          : {
              status: unanswered === 'late' ? 504 : 503,
              body: {
                outcome: 'unavailable',
                error:
                  unanswered === 'late'
                    ? 'xcube didn’t answer in time, so whether it ran isn’t known. Try again.'
                    : 'xcube can’t be reached to run the SQL. Try again once it’s back.',
              },
            };
    }
    const outcome = said.body.outcome;
    const ran = answer?.kind === 'ran' ? answer : undefined;
    const done = {
      outcome,
      rowCount: ran?.rowCount ?? null,
      durationMs:
        answer !== undefined && 'durationMs' in answer ? (answer.durationMs ?? null) : null,
      truncated: ran?.truncated ?? null,
      statement: answer !== undefined && 'statement' in answer ? answer.statement : null,
    };
    // Done before it is answered, so the next run never overlaps it (T533's review).
    await runs?.finish(runId, done).catch((error: unknown) => {
      request.log.warn({ err: error }, 'could not note a SQL run as done');
    });
    /**
     * Every run, an audit event (T534, AC-382; design 15's J): who, the data
     * source and its folder, when, the outcome, the rows and the time, and
     * the SQL with every literal replaced, by xcube. Never the SQL as
     * written, nor the database's words, which may quote a literal.
     */
    await recordIn(
      audit,
      {
        actor: actorOf(request.wechartUser),
        event: 'sql-run',
        // A copy's where its original is, as its other records are (T368's review).
        folderId:
          workspace === null
            ? source.folderId
            : (source.origin?.folderId ?? source.targetFolderId ?? source.folderId),
        item: { kind: 'data-source', id: source.id, title: source.name },
        summary: summaryOf(answer, done, unanswered),
        details: {
          ...done,
          sql: answer !== undefined && 'redactedSql' in answer ? answer.redactedSql : null,
          inWorkspace: workspace !== null,
        },
      },
      request.log,
    );
    if (said.retryAfter !== undefined) void reply.header('retry-after', said.retryAfter);
    return reply.status(said.status).send(said.body);
  });

  /**
   * A user's own past runs (T534, AC-381; design 15's F and Q2): theirs
   * alone, newest first, 50 at a time; one data source's with `?dataSource=`,
   * else all. Each names its data source, with its folder where they still
   * see it.
   */
  app.get('/api/sql-runs', USER, async (request, reply) => {
    if (runs === undefined) return { runs: [] };
    const { dataSource, after } = request.query as { dataSource?: unknown; after?: unknown };
    if (
      (dataSource !== undefined && typeof dataSource !== 'string') ||
      (after !== undefined && typeof after !== 'string')
    )
      return reply.status(400).send({ error: 'Name one data source, and one page to follow.' });
    const page = await runs.list({
      userKey: userKeyOf(request),
      ...(dataSource === undefined ? {} : { dataSourceId: dataSource }),
      ...(after === undefined ? {} : { after }),
    });
    const pathOf = await paths();
    const sourceView = async (id: string, name: string | null) => {
      const source = await store.get(id);
      const seen =
        source !== undefined && (await access(request, source.folderId, 'read')) === undefined;
      const inWorkspace = source !== undefined && (await workspaceOf?.(source.folderId)) != null;
      return {
        id,
        // Its name now only to one who still sees it; else the name it had (T534's review).
        name: (seen ? source?.name : undefined) ?? name ?? id,
        folderPath: seen && !inWorkspace ? pathOf(source.folderId) : null,
        inWorkspace,
      };
    };
    const viewed = new Map<string, Awaited<ReturnType<typeof sourceView>>>();
    const out = [];
    for (const run of page.runs) {
      let view = null;
      if (run.dataSourceId !== null) {
        view = viewed.get(run.dataSourceId);
        if (view === undefined) {
          view = await sourceView(run.dataSourceId, run.dataSourceName);
          viewed.set(run.dataSourceId, view);
        }
      }
      out.push({
        id: run.id,
        sql: run.sql,
        dataSource: view,
        startedAt: run.startedAt.toISOString(),
        outcome: run.outcome,
        rowCount: run.rowCount,
        durationMs: run.durationMs,
        truncated: run.truncated,
        statement: run.statement,
      });
    }
    return page.next === undefined ? { runs: out } : { runs: out, next: page.next };
  });

  /** The run going, as its user is shown it: on which data source, since when. */
  const goingView = async (going: GoingRun) => {
    const source = going.dataSourceId === null ? undefined : await store.get(going.dataSourceId);
    return {
      dataSource: source === undefined ? null : { id: source.id, name: source.name },
      startedAt: going.startedAt.toISOString(),
    };
  };

  /** The user's run going, if any (T533; design 15, D2): any of their pages may ask. */
  app.get('/api/sql-runs/going', USER, async (request) => {
    const going = await runs?.going(userKeyOf(request));
    return { going: going === undefined ? null : await goingView(going) };
  });

  /**
   * Cancel (T533, AC-379): the user's own run going, stopped on the database
   * by xcube, on whichever instance runs it. Its own request then answers
   * that it was cancelled.
   */
  app.post('/api/sql-runs/cancel', USER, async (request, reply) => {
    const going = await runs?.going(userKeyOf(request));
    if (going === undefined) return reply.status(404).send({ error: 'You have no run going.' });
    if (runner === undefined)
      return reply
        .status(503)
        .send({ error: 'SQL runs on xcube, which this deployment doesn’t run.' });
    try {
      // Asked again while its row still goes: a cancel can come before xcube
      // knows the run, which it does once its request arrives (T533's review).
      for (let tries = 1; ; tries += 1) {
        if (await runner.xcube.cancel(going.runId)) return { cancelled: true };
        if (tries >= CANCEL_TRIES) return { cancelled: false };
        await new Promise((resolve) => setTimeout(resolve, CANCEL_AGAIN_MS));
        const still = await runs?.going(userKeyOf(request));
        if (still?.runId !== going.runId) return { cancelled: false };
      }
    } catch (error) {
      request.log.warn({ err: error }, 'could not ask xcube to cancel a SQL run');
      return reply.status(503).send({
        error: 'xcube can’t be reached to cancel the run. Try again once it’s back.',
      });
    }
  });
}

/** Whose runs: the signed-in user's, or with sign-in off its one user's. */
const userKeyOf = (request: FastifyRequest) => request.wechartUser?.key ?? 'single-user';

const rowsText = (n: number) => (n === 1 ? '1 row' : `${n.toLocaleString('en')} rows`);
const secondsText = (ms: number) =>
  `${(ms / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} s`;
const article = (word: string) => (/^[AEIOU]/.test(word) ? 'an' : 'a');

/**
 * A run's line in the audit trail, as design 15's state J words it: never a
 * literal, nor the database's words.
 */
function summaryOf(
  answer: SqlAnswer | undefined,
  done: {
    readonly outcome: string;
    readonly rowCount: number | null;
    readonly durationMs: number | null;
    readonly truncated: 'rows' | 'bytes' | null;
  },
  unanswered?: 'refused' | 'late' | 'away',
): string {
  switch (answer?.kind) {
    case 'ran': {
      const head =
        done.truncated === 'rows'
          ? 'Limited to 10,000 rows'
          : done.truncated === 'bytes'
            ? 'Limited to 10 MB'
            : 'Finished';
      return `${head} · ${rowsText(answer.rowCount)} · ${secondsText(answer.durationMs)}`;
    }
    case 'refused': {
      const kind = answer.statement;
      if (kind === null)
        return answer.code === 'several_statements'
          ? 'Not run · more than one statement'
          : 'Not run · couldn’t be read as SQL';
      if (kind === 'select') return 'Not run · a SELECT that writes or locks';
      if (kind === 'explain') return 'Not run · EXPLAIN ANALYZE';
      return `Not run · ${article(kind.toUpperCase())} ${kind.toUpperCase()}`;
    }
    case 'stopped':
      return answer.how === 'timeout' ? 'Stopped at 30 seconds' : 'Cancelled';
    case 'failed':
      return answer.code === 'connect_failed' ? 'Not run · couldn’t connect' : 'Database error';
    case 'busy':
      return 'Not run · xcube was busy';
    case 'missing':
      return 'Not run · xcube doesn’t hold its connection';
    default:
      // No answer of xcube's (T534's review).
      return unanswered === 'refused'
        ? 'Not run · xcube refused it'
        : unanswered === 'late'
          ? 'No answer from xcube in time · it may have run'
          : 'Not run · xcube couldn’t be reached';
  }
}

/** A cancel asked again while xcube doesn't know the run yet: up to 5 s. */
const CANCEL_TRIES = 20;
const CANCEL_AGAIN_MS = 250;
