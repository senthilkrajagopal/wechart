import { randomUUID } from 'node:crypto';

import { parameterNames, parameterNamesOn } from '@wechart/core/sql-parameters';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { ADMIN, USER } from '../auth/guard';
import type { AuditStore } from '../repos/audit';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { DataSource, DataSourceStore } from '../repos/data-sources';
import {
  CUBE_STORE_TARGET,
  type SqlRunnerSwitch,
  type SqlRunnerSwitchStore,
} from '../repos/sql-runner-switches';
import type { GoingRun, LostRun, SqlRunStore, StoppingRun } from '../repos/sql-runs';
import { XcubeError } from '../xcube/client';
import type { SavedParameter } from '../db/schema';
import type {
  SqlAnswer,
  SqlParameter,
  SqlRunState,
  SqlTarget,
  XcubeSqlRunner,
} from '../xcube/sql-runner';
import { queryOf, tablesOf, type Catalog } from '../model/introspection';
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

/**
 * A run's parameters as xcube takes them (T811, AC-454; research
 * `xcube-bb188d8ada.md`, "The request"): at most 100, each named by the
 * parameter grammar, at most 64 characters, its value text of at most
 * 100,000; a Boolean's `true` or `false`, sent as itself.
 */
const MAX_PARAMETERS = 100;
const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const PARAMETER_TYPES: ReadonlySet<unknown> = new Set(['text', 'number', 'date', 'boolean']);
const MAX_VALUE = 100_000;
const BAD_PARAMETERS =
  'Each parameter is { name, type, value }, named once: a name of letters, digits and underscores, Text, Number, Date or Boolean, and its value as text (a Boolean’s true or false).';

/** The body's parameters, checked; `undefined` where they aren't any. */
export function runParametersOf(body: unknown): SavedParameter[] | undefined {
  const given = (body as { parameters?: unknown } | undefined)?.parameters ?? [];
  if (!Array.isArray(given) || given.length > MAX_PARAMETERS) return undefined;
  const names = new Set<string>();
  const out: SavedParameter[] = [];
  for (const each of given as unknown[]) {
    if (typeof each !== 'object' || each === null) return undefined;
    const { name, type, value } = each as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      !PARAMETER_NAME.test(name) ||
      names.has(name) ||
      !PARAMETER_TYPES.has(type) ||
      typeof value !== 'string' ||
      value.length > MAX_VALUE ||
      (type === 'boolean' && value !== 'true' && value !== 'false')
    )
      return undefined;
    names.add(name);
    out.push({ name, type: type as SavedParameter['type'], value });
  }
  return out;
}

/** Them as xcube's `parameters`, by name: a Boolean as itself. */
function boundOf(parameters: readonly SavedParameter[]): Record<string, SqlParameter> {
  return Object.fromEntries(
    parameters.map(({ name, type, value }): [string, SqlParameter] => [
      name,
      type === 'boolean' ? { type, value: value === 'true' } : { type, value },
    ]),
  );
}

/**
 * The SQL of a bound run as the audit trail keeps it (T811, AC-454): xcube's
 * `redactedSql`, the statement as it ran with its placeholders and no
 * literal, each placeholder its `{{name}}` again. xcube numbers them by each
 * name's first place in the statement, as `parameterNamesOn` lists them
 * (research `xcube-bb188d8ada.md`, "The checks", 4):
 *
 * - PostgreSQL and Redshift: ` $1::text `, its cast and the spaces xcube
 *   wrote around it gone;
 * - SQL Server and BigQuery: `@p1`; Oracle: `:p1`, inside any cast xcube
 *   wrote, whose literals it redacted.
 *
 * A hand-written one of these can't be there: xcube refuses it while
 * `parameters` is sent. MySQL's and Snowflake's `?` can't be told from a
 * redacted literal, so they stay `?`: no value either way (decision T811-2).
 */
export function auditSqlOf(redactedSql: string, driver: string | null, names: readonly string[]): string {
  const named = (n: string) => {
    const name = names[Number(n) - 1];
    return name === undefined ? null : `{{${name}}}`;
  };
  switch (driver) {
    case 'postgres':
    case 'redshift':
      return redactedSql.replace(
        /(?:^| )\$(\d+)::(?:text|numeric|date|boolean)(?: |(?=\r?\n)|$)/gm,
        (whole, n: string) => named(n) ?? whole,
      );
    case 'mssql':
    case 'bigquery':
      return redactedSql.replace(/(?<![\w@$])@p(\d+)\b/g, (whole, n: string) => named(n) ?? whole);
    case 'oracle':
      return redactedSql.replace(/(?<![\w:$]):p(\d+)\b/g, (whole, n: string) => named(n) ?? whole);
    default:
      return redactedSql;
  }
}

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
  /** Cube's introspection of a data source, for the schema browser beside the editor (T539). */
  readonly catalog?: Catalog;
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

/**
 * A user's last run, stopped but running on in Cube Store, which holds their
 * next (T548): until when at the latest, as xcube says, if anything bounds
 * it; and whether xcube could be asked (T549).
 */
interface Finishing {
  readonly run: StoppingRun;
  readonly endsBy: string | null;
  readonly confirmed: boolean;
}

/** Where a run goes, and what its row and its audit event say of it. */
interface RunAt {
  readonly target: SqlTarget;
  /** Its data source; none for Cube Store. */
  readonly dataSourceId: string | null;
  readonly dataSourceName: string;
  readonly folderId: string | null;
  readonly item: { readonly kind: string; readonly id: string; readonly title: string };
  readonly inWorkspace: boolean;
  /** Its driver, whose placeholders the audit's SQL names again (T811); none for Cube Store. */
  readonly driver: string | null;
  /** Its `{{name}}`s' values, bound (T811, AC-454); none on Cube Store or Dremio. */
  readonly parameters: readonly SavedParameter[];
}

/**
 * Cube Store in the audit trail, at the root, as "Shared" (design 15's J):
 * as a run its server stopped mid-way recorded it (T534).
 */
const CUBE_STORE_ITEM = { kind: 'cube-store', id: CUBE_STORE_TARGET, title: 'Cube Store' };
const CUBE_STORE_ONLY_READS =
  'On Cube Store, only SELECT and EXPLAIN run, one statement at a time.';
/**
 * A join Cube Store's router would run itself: nothing could stop it once it
 * started, not even Cube Store's timeout, so xcube refuses it before it runs
 * (T650, R64; research xcube-636ffa04b2.md).
 */
const CUBE_STORE_ROUTER_JOIN =
  'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout.';
/**
 * Cube Store can't stop a query: a run stopped at its cap, or cancelled, runs
 * on in it until its own timeout at the latest, `endsBy` (T548, AC-378; R62;
 * xcube 2099b13f2d, research `xcube-2099b13f2d.md`).
 */
const CUBE_STORE_RUNS_ON = 'Cube Store can’t stop a query, so it is still finishing this one.';
/**
 * A query Cube Store's router runs, which its timeout can't end: nothing
 * bounds it, and xcube says no end (T549; xcube 46ca0ce708, research
 * `xcube-46ca0ce708.md`).
 */
const CUBE_STORE_RUNS_TO_END = 'Cube Store runs this query to its end; it can’t be stopped.';
/** A stop from an xcube that says nothing of its run on: an image before 2099b13f2d (T548's review). */
const CUBE_STORE_MAY_RUN_ON =
  'Cube Store can’t stop a query, so it may still be finishing this one.';
/**
 * How long xcube follows a Cube Store run its router runs on, to its end at
 * the latest: 24 hours from its stop, after which it reads `ended` (research
 * `xcube-46ca0ce708.md`). wechart asks about such a run, and one xcube
 * didn't answer, as long, counted from the run's start with a margin for
 * the stop, up to a minute after it (connecting, then the 30 s cap), and
 * for clocks (T549's review).
 */
const CUBE_STORE_FOLLOWED_MS = 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
/** Its user's next run waits until it has ended (T548, AC-378, AC-379; R62). */
const CUBE_STORE_FINISHING =
  'Cube Store is still finishing your last query. One run at a time: your next one runs once it has ended.';
/** The same, where xcube can't be asked: held, and said so, with no time guessed (T549). */
const CUBE_STORE_MAYBE_FINISHING =
  'xcube can’t say whether Cube Store has finished your last query. One run at a time: your next one runs once it has ended.';
const CUBE_STORE_OFF =
  'The SQL runner is off for Cube Store: a Super-Admin turns it on in Data sources.';
const NO_CUBE_STORE = 'There’s no such data source, or it isn’t yours to see.';

/**
 * When a stopped run that runs on ends at the latest, as xcube says; none
 * where its stop is real, where nothing bounds it (its router's, T549), or
 * where xcube's time can't be read, which is held as one with no end (T548).
 */
function endOf(answer: Extract<SqlAnswer, { kind: 'stopped' }>): Date | null {
  if (!answer.stillRunning || answer.endsBy === null) return null;
  const endsBy = new Date(answer.endsBy);
  return Number.isNaN(endsBy.getTime()) ? null : endsBy;
}

/** A run's answer, as the browser is given it: never its redacted SQL, which history keeps (T534). */
function replyOf(answer: SqlAnswer, onCubeStore = false): RunReply {
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
          error:
            answer.routerJoin === true
              ? CUBE_STORE_ROUTER_JOIN
              : // xcube's words, naming a parameter, never its value (T811).
                answer.parameters === true
                ? answer.reason
                : onCubeStore
                ? CUBE_STORE_ONLY_READS
                : ONLY_READS,
          reason: answer.reason,
          statement: answer.statement,
          ...(answer.routerJoin === true ? { routerJoin: true } : {}),
        },
      };
    case 'stopped': {
      // Cube Store runs it on: until when at the latest (T548), or with no
      // end, its router's (T549). An older xcube says neither.
      const runsOn = onCubeStore && answer.stillRunning;
      const endsBy = runsOn ? endOf(answer) : null;
      return {
        status: 422,
        body: {
          outcome: answer.how,
          error: onCubeStore
            ? `${answer.how === 'timeout' ? 'Stopped at 30 seconds' : 'Cancelled'}: ${
                !runsOn
                  ? CUBE_STORE_MAY_RUN_ON
                  : endsBy !== null
                    ? CUBE_STORE_RUNS_ON
                    : CUBE_STORE_RUNS_TO_END
              }`
            : answer.how === 'timeout'
              ? STOPPED
              : CANCELLED,
          durationMs: answer.durationMs,
          // The rows read before the stop, marked so (T545, AC-378, AC-379; Q6).
          columns: answer.columns,
          rows: answer.rows,
          rowCount: answer.rowCount,
          truncated: 'stopped',
          statement: answer.statement,
          // Still running in Cube Store, until when at the latest (T548), if anything bounds it (T549).
          ...(runsOn ? { stillRunning: true, endsBy: endsBy?.toISOString() ?? null } : {}),
        },
      };
    }
    case 'failed':
      return {
        status: answer.code === 'connect_failed' ? 502 : 422,
        body: {
          outcome: 'failed',
          error:
            answer.code === 'connect_failed'
              ? `Couldn’t connect to ${onCubeStore ? 'Cube Store' : 'the database'}: ${answer.error}`
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
              : onCubeStore
                ? 'xcube doesn’t hold this model yet, so Cube Store can’t be asked. Try again in a moment.'
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
      // By its own name in any folder (T701; research `xcube-256d632371.md`, 1.1).
      if (ids.has(source.folderId)) return { connection: source.name };
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
    return { connection: source.name, overlay: overlay.id };
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
          lost.dataSourceId === null
            ? ROOT_FOLDER_ID
            : source === undefined
              ? null
              : workspace === null
                ? source.folderId
                : (source.origin?.folderId ?? source.targetFolderId ?? source.folderId),
        item:
          lost.dataSourceId === null
            ? CUBE_STORE_ITEM
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

  /**
   * A run holding a `{{ name }}` where no value can be bound (T810, AC-482;
   * research/sql-parameter-binding.md §1–2): Dremio's driver and Cube Store
   * write values into the SQL text, so such a run is refused before xcube is
   * asked, and no value is ever written in. Found as the browser finds them,
   * outside strings and comments, read as standard SQL.
   */
  const unbound = (where: string) => ({
    outcome: 'refused',
    error: `Parameters aren’t available on ${where}. Write the value into the SQL to run it here.`,
  });

  /** The SQL a run was asked for, or why it isn't one: said here. */
  const sqlOf = async (request: FastifyRequest, reply: FastifyReply) => {
    const sql = (request.body as { sql?: unknown } | undefined)?.sql;
    if (typeof sql !== 'string' || sql.trim() === '') {
      await reply.status(400).send({ error: 'Send the SQL to run: { sql }.' });
      return undefined;
    }
    if (sql.length > MAX_SQL) {
      await reply
        .status(400)
        .send({ error: `SQL runs at most ${MAX_SQL.toLocaleString('en')} characters long.` });
      return undefined;
    }
    return sql;
  };

  app.post('/api/data-sources/:id/sql', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    const workspace = (await workspaceOf?.(source.folderId)) ?? null;
    const refusal = await mayRunSql(request, source, { workspace, access, switches, store });
    if (refusal !== undefined) return reply.status(refusal.status).send({ error: refusal.error });

    const sql = await sqlOf(request, reply);
    if (sql === undefined) return reply;
    const parameters = runParametersOf(request.body);
    if (parameters === undefined) return reply.status(400).send({ error: BAD_PARAMETERS });
    if (source.driver === 'dremio' && (parameterNames(sql).length > 0 || parameters.length > 0))
      return reply.status(400).send(unbound('Dremio'));
    if (runner === undefined)
      return reply.status(503).send({
        error: 'SQL runs on xcube, which this deployment doesn’t run.',
      });

    const target = await targetOf(reply, source, workspace, runner);
    if (target === undefined) return reply;
    return runOn(request, reply, runner, sql, {
      target,
      dataSourceId: source.id,
      dataSourceName: source.name,
      // A copy's where its original is, as its other records are (T368's review).
      folderId:
        workspace === null
          ? source.folderId
          : (source.origin?.folderId ?? source.targetFolderId ?? source.folderId),
      item: { kind: 'data-source', id: source.id, title: source.name },
      inWorkspace: workspace !== null,
      driver: source.driver,
      parameters,
    });
  });

  /**
   * A run, once the user may make it and its target is known (T532–T534):
   * one going at a time for its user, its row done before it is answered,
   * and every run an audit event. A data source's run, or Cube Store's.
   */
  const runOn = async (
    request: FastifyRequest,
    reply: FastifyReply,
    options: SqlRunnerOptions,
    sql: string,
    at: RunAt,
  ) => {
    const onCubeStore = 'cubeStore' in at.target;
    // One run going at a time for its user, across every API instance (T533, AC-379).
    const runId = randomUUID();
    if (runs !== undefined) {
      // Their runs an instance stopped mid-run never finished: recorded now (T534's review).
      for (const lost of await runs.markLost(userKeyOf(request))) await recordLost(request, lost);
      const started = await runs.start({
        runId,
        userKey: userKeyOf(request),
        dataSourceId: at.dataSourceId,
        sql,
        dataSourceName: at.dataSourceName,
        parameters: at.parameters,
      });
      if (!started.started) {
        const going = await goingView(started.going);
        return reply.status(409).send({
          outcome: 'going',
          error: `You have a run going on ${going.dataSource?.name ?? (going.cubeStore ? 'Cube Store' : 'a data source')}. One run at a time: cancel it, or wait for it to finish.`,
          going,
        });
      }
      // Their last, stopped, still running in Cube Store: this one waits
      // (T548, AC-378, AC-379; R62). Asked once this one is taken, so a stop
      // that finished their last as it started is seen.
      let finishing: Finishing | undefined;
      try {
        finishing = await stillFinishing(request, options.xcube);
      } catch (error) {
        // Not left taken: it never ran (T548's review).
        await runs.release(runId).catch(() => undefined);
        throw error;
      }
      if (finishing !== undefined) {
        await runs.release(runId);
        return reply.status(409).send({
          outcome: 'going',
          error: finishing.confirmed ? CUBE_STORE_FINISHING : CUBE_STORE_MAYBE_FINISHING,
          going: await stoppingView(finishing),
        });
      }
    }
    const startedAt = Date.now();
    let answer: SqlAnswer | undefined;
    let said: RunReply;
    /** Why there is no answer of xcube's: it refused the request, didn't answer in time, or wasn't reached. */
    let unanswered: 'refused' | 'late' | 'away' | undefined;
    try {
      // Its values bound, never written into the SQL (T811, AC-454).
      answer = await options.xcube.run(at.target, {
        sql,
        runId,
        ...SQL_CAPS,
        ...(at.parameters.length > 0 ? { parameters: boundOf(at.parameters) } : {}),
      });
      said = replyOf(answer, onCubeStore);
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
    // A stopped run Cube Store runs on: until when at the latest (T548), or
    // with no end, its router's (T549).
    const stopped = answer?.kind === 'stopped' ? answer : undefined;
    const runsOn = stopped !== undefined && onCubeStore && stopped.stillRunning;
    const endsBy = runsOn ? endOf(stopped) : null;
    // Until when xcube is asked whether it has ended, its user's next run
    // waiting meanwhile: its end at the latest, or, with none, as long as
    // xcube follows it. One xcube didn't answer may run on too: xcube says
    // `ended` of one it never saw (T548's review, T549).
    const askUntil =
      runsOn || (onCubeStore && (unanswered === 'late' || unanswered === 'away'))
        ? (endsBy ?? new Date(startedAt + CUBE_STORE_FOLLOWED_MS))
        : null;
    const done = {
      outcome,
      // A stopped run's too: the rows it read before its stop (T545).
      rowCount: ran?.rowCount ?? (answer?.kind === 'stopped' ? answer.rowCount : null),
      durationMs:
        answer !== undefined && 'durationMs' in answer ? (answer.durationMs ?? null) : null,
      truncated: ran?.truncated ?? null,
      statement: answer !== undefined && 'statement' in answer ? answer.statement : null,
      ...(runsOn ? { stillRunning: true as const, endsBy } : {}),
    };
    // Done before it is answered, so the next run never overlaps it (T533's review).
    await runs?.finish(runId, { ...done, endsBy: askUntil }).catch((error: unknown) => {
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
        folderId: at.folderId,
        item: at.item,
        summary: summaryOf(answer, done, unanswered),
        details: {
          ...done,
          sql:
            answer === undefined || !('redactedSql' in answer) || answer.redactedSql === null
              ? null
              : // A bound run's placeholders as its `{{name}}`s, never a value
                // (T811, AC-454), a write refused once bound included; a run
                // whose parameters were refused is said as sent already.
                at.parameters.length > 0 && !(answer.kind === 'refused' && answer.parameters === true)
                ? auditSqlOf(answer.redactedSql, at.driver, parameterNamesOn(sql, at.driver))
                : answer.redactedSql,
          inWorkspace: at.inWorkspace,
        },
      },
      request.log,
    );
    if (said.retryAfter !== undefined) void reply.header('retry-after', said.retryAfter);
    return reply.status(said.status).send(said.body);
  };

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
      // Cube Store's by its page's id, `cubestore`: its runs have no data source (T536).
      ...(dataSource === undefined
        ? {}
        : { dataSourceId: dataSource === CUBE_STORE_TARGET ? null : dataSource }),
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
        // Cube Store's has no data source (T536).
        cubeStore: run.dataSourceId === null,
        startedAt: run.startedAt.toISOString(),
        outcome: run.outcome,
        rowCount: run.rowCount,
        durationMs: run.durationMs,
        truncated: run.truncated,
        statement: run.statement,
        // Its values, to its owner alone: the list is theirs (T811, AC-454).
        parameters: run.parameters,
      });
    }
    return page.next === undefined ? { runs: out } : { runs: out, next: page.next };
  });

  /**
   * Cube Store as this user is to see it (T536; AC-384, AC-374; design 15's
   * state H, Q7, P5): a Super-Admin's to switch, and once on, for
   * Super-Admins and for those allowed on a data source in a folder a
   * Super-Admin switched on. One in My workspace doesn't count (Q7): its
   * owner may run SQL on it with no switch, and nearly every read-write
   * member could otherwise read every folder's rollups. None to anyone else,
   * nor without xcube's runner.
   */
  const cubeStoreFor = async (
    request: FastifyRequest,
  ): Promise<{ readonly on: SqlRunnerSwitch | undefined; readonly runs: boolean } | undefined> => {
    if (runner === undefined || switches === undefined) return undefined;
    const on = await switches.of(CUBE_STORE_TARGET);
    if (request.wechartUser?.superAdmin === true) return { on, runs: on !== undefined };
    if (on === undefined) return undefined;
    return (await allowedOnASwitchedFolder(request)) ? { on, runs: true } : undefined;
  };
  /** Whether the user may run SQL on some data source in a folder, its runner switched on (Q7). */
  const allowedOnASwitchedFolder = async (request: FastifyRequest) => {
    for (const target of (await switches?.targets()) ?? []) {
      if (target === CUBE_STORE_TARGET) continue;
      const source = await store.get(target);
      if (source === undefined || (await workspaceOf?.(source.folderId)) != null) continue;
      if ((await access(request, source.folderId, 'write')) === undefined) return true;
    }
    return false;
  };
  /** Its switch as anyone it is shown to may see it: by name, never a key (AC-374). */
  const switchView = (on: SqlRunnerSwitch | undefined) =>
    on === undefined
      ? { on: false as const }
      : {
          on: true as const,
          confirmedBy: { name: on.confirmedBy.name },
          confirmedAt: on.confirmedAt.toISOString(),
        };

  app.get('/api/cube-store', USER, async (request, reply) => {
    const seen = await cubeStoreFor(request);
    if (seen === undefined) return reply.status(404).send({ error: NO_CUBE_STORE });
    return { ...switchView(seen.on), runs: seen.runs };
  });

  /**
   * Cube Store's switch (T536, AC-374; design 15's Q9 and P4): a
   * Super-Admin's alone, applied at once, and on only once they confirm that
   * what wechart reaches it with can only read, and that everyone allowed may
   * read every folder's rollups, with wechart's check the only guard. Either
   * way an audit event, at the root.
   */
  app.put('/api/cube-store/sql-runner', ADMIN, async (request, reply) => {
    if (switches === undefined || runner === undefined)
      return reply.status(503).send({ error: 'The SQL runner isn’t set up here.' });
    const value = (request.body ?? {}) as { on?: unknown; readOnlyConfirmed?: unknown };
    if (typeof value.on !== 'boolean')
      return reply.status(400).send({ error: 'Say whether to turn it on: { on: true | false }.' });
    const record = (summary: string, sqlRunner: 'on' | 'off') =>
      recordIn(
        audit,
        {
          actor: actorOf(request.wechartUser),
          event: 'data-source-change',
          folderId: ROOT_FOLDER_ID,
          item: CUBE_STORE_ITEM,
          summary,
          details: { sqlRunner },
        },
        request.log,
      );
    if (!value.on) {
      // A change only where there is one to record (T531's review).
      if ((await switches.of(CUBE_STORE_TARGET)) !== undefined) {
        await switches.off(CUBE_STORE_TARGET);
        await record('Turned the SQL runner off for Cube Store', 'off');
      }
      return { on: false };
    }
    if (value.readOnlyConfirmed !== true)
      return reply.status(400).send({
        error:
          'Confirm that what wechart reaches Cube Store with can only read, and that everyone allowed may read every folder’s rollups, before turning the SQL runner on.',
      });
    const user = request.wechartUser;
    const on = await switches.on(CUBE_STORE_TARGET, {
      key: user?.key ?? 'single-user',
      name: user?.name ?? 'You',
    });
    await record(
      'Turned the SQL runner on for Cube Store, confirming everyone allowed may read every folder’s rollups',
      'on',
    );
    return switchView(on);
  });

  /**
   * Read-only SQL on Cube Store (T536, AC-384; R50-3, R50-5): SELECT and
   * EXPLAIN alone, as xcube checks, with R50's caps. Its runs are kept and
   * audited as a data source's are, at the root.
   */
  app.post('/api/cube-store/sql', USER, async (request, reply) => {
    const seen = await cubeStoreFor(request);
    if (seen === undefined) return reply.status(404).send({ error: NO_CUBE_STORE });
    if (!seen.runs) return reply.status(403).send({ error: CUBE_STORE_OFF });
    const sql = await sqlOf(request, reply);
    if (sql === undefined || runner === undefined) return reply;
    const parameters = runParametersOf(request.body);
    if (parameters === undefined) return reply.status(400).send({ error: BAD_PARAMETERS });
    if (parameterNames(sql).length > 0 || parameters.length > 0)
      return reply.status(400).send(unbound('Cube Store'));
    return runOn(request, reply, runner, sql, {
      target: { cubeStore: true },
      dataSourceId: null,
      dataSourceName: 'Cube Store',
      folderId: ROOT_FOLDER_ID,
      item: CUBE_STORE_ITEM,
      inWorkspace: false,
      driver: null,
      parameters: [],
    });
  });

  /**
   * The schema browser beside the editor (T539, AC-386; design 15's P3): the
   * data source's schemas, a schema's tables and a table's columns with their
   * types, as Cube's introspection lists them, by the name xcube serves it
   * under; only to those who may run SQL on it, by the run's own rule.
   *
   * A workspace's data source is read as its SQL runs, in its workspace's
   * overlay: xcube's introspection of an overlay's own data source,
   * `?overlay=` under wechart's service credential (T547; xcube 93a5f7a73b,
   * research xcube-93a5f7a73b.md). So a copy, a copy pointed elsewhere and
   * one made new there each list their own catalog, never a landed one's.
   * Only wechart names the overlay: `queryOf` drops any the browser sends.
   */
  const browse = async (
    request: FastifyRequest,
    reply: FastifyReply,
    read: (
      catalog: Catalog,
      name: string,
      overlay: string | undefined,
    ) => Promise<{ status: number; body: unknown }>,
  ) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    const workspace = (await workspaceOf?.(source.folderId)) ?? null;
    const refusal = await mayRunSql(request, source, { workspace, access, switches, store });
    if (refusal !== undefined) return reply.status(refusal.status).send({ error: refusal.error });
    if (runner?.catalog === undefined)
      return reply.status(503).send({
        error:
          'Its tables are read through Cube’s introspection, which this deployment doesn’t offer.',
      });
    const ids = await runner.folders();
    if (workspace === null) {
      if (!ids.has(source.folderId))
        return reply.status(409).send({
          error: 'This data source’s folder isn’t in xcube yet, so its tables can’t be read.',
        });
      // By its own name in any folder (T701).
      const { status, body } = await read(runner.catalog, source.name, undefined);
      return reply.status(status).send(body);
    }
    // In its workspace's overlay, a copy stands in its original's folder, a
    // new one in its target's (T347), under its own name: as its SQL runs.
    const placed = ids.get(source.origin?.folderId ?? source.targetFolderId ?? '');
    if (runner.overlayOf === undefined || placed === undefined)
      return reply.status(409).send({
        error:
          runner.overlayOf === undefined
            ? 'Its tables are read in your workspace’s preview, which this deployment doesn’t have.'
            : 'Choose the folder it is to go to first: its tables are read in your workspace’s preview, which places it there.',
      });
    const overlay = await runner.overlayOf(workspace);
    if (overlay === undefined || 'problem' in overlay)
      return reply.status(409).send({
        error: `Your workspace can’t be previewed as it is, so its tables can’t be read: ${
          overlay === undefined ? 'it holds nothing to preview' : overlay.problem
        }`,
      });
    const { status, body } = await read(runner.catalog, source.name, overlay.id);
    // xcube's 404 here is the overlay, or its data source in it, gone since it
    // was made sure of: said as a run says it, never with its id (T547's review).
    if (status === 404)
      return reply
        .status(404)
        .send({ error: 'xcube no longer holds your workspace’s preview. Open the SQL tab again.' });
    return reply.status(status).send(body);
  };
  app.get('/api/data-sources/:id/catalog/schemas', USER, (request, reply) =>
    browse(request, reply, (catalog, name, overlay) =>
      catalog.schemas(name, queryOf(request.url), overlay),
    ),
  );
  app.get('/api/data-sources/:id/catalog/tables', USER, (request, reply) =>
    browse(request, reply, (catalog, name, overlay) =>
      catalog.tables(name, queryOf(request.url), overlay),
    ),
  );
  // Its body read once the user may browse, as introspection's own route does.
  app.post('/api/data-sources/:id/catalog/columns', USER, (request, reply) =>
    browse(request, reply, async (catalog, name, overlay) => {
      const tables = tablesOf(request.body);
      return tables === undefined
        ? {
            status: 400,
            body: { error: 'Name the tables as a list, each with its schema and table.' },
          }
        : catalog.columns(name, tables, overlay);
    }),
  );

  /** The run going, as its user is shown it: on which data source, since when. */
  const goingView = async (going: GoingRun) => {
    const source = going.dataSourceId === null ? undefined : await store.get(going.dataSourceId);
    return {
      dataSource: source === undefined ? null : { id: source.id, name: source.name },
      // Cube Store's has no data source (T536).
      cubeStore: going.dataSourceId === null,
      startedAt: going.startedAt.toISOString(),
    };
  };

  /**
   * Their last, stopped but still running in Cube Store, as the user is
   * shown it (T548): until when at the latest, as xcube says, or none, its
   * router's (T549); and where xcube can't be asked, said so, with no time.
   */
  const stoppingView = async (finishing: Finishing) => ({
    ...(await goingView(finishing.run)),
    stopping: true as const,
    endsBy: finishing.endsBy,
    ...(finishing.confirmed ? {} : { unconfirmed: true as const }),
  });

  /**
   * The user's last run, stopped but still running in Cube Store (T548,
   * AC-378, AC-379; R62): while xcube says it hasn't ended. Where xcube
   * can't say, it is held all the same, and said so, until its row is long
   * past what it was asked about until: no time is guessed (T549). One xcube
   * says ended holds no one up again.
   */
  const stillFinishing = async (
    request: FastifyRequest,
    xcube: XcubeSqlRunner | undefined,
  ): Promise<Finishing | undefined> => {
    if (runs === undefined) return undefined;
    for (const stopping of await runs.stopping(userKeyOf(request))) {
      let state: SqlRunState | undefined;
      try {
        state = await xcube?.state(stopping.runId);
      } catch (error) {
        request.log.warn({ err: error }, 'could not ask xcube whether a Cube Store run has ended');
      }
      if (state?.state === 'ended') {
        await runs.ended(stopping.runId);
        continue;
      }
      return state === undefined
        ? { run: stopping, endsBy: null, confirmed: false }
        : { run: stopping, endsBy: state.endsBy, confirmed: true };
    }
    return undefined;
  };

  /**
   * The user's run going, if any (T533; design 15, D2): any of their pages
   * may ask. Else their last, stopped but still running in Cube Store, which
   * holds their next (T548).
   */
  app.get('/api/sql-runs/going', USER, async (request) => {
    const going = await runs?.going(userKeyOf(request));
    if (going !== undefined) return { going: await goingView(going) };
    const finishing = await stillFinishing(request, runner?.xcube);
    return { going: finishing === undefined ? null : await stoppingView(finishing) };
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
    /** Cube Store runs it on (T548), to an end or none (T549). */
    readonly stillRunning?: true;
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
      if (answer.routerJoin === true) return 'Not run · a join Cube Store’s router would run';
      if (answer.parameters === true) return 'Not run · its parameters were refused';
      const kind = answer.statement;
      if (kind === null)
        return answer.code === 'several_statements'
          ? 'Not run · more than one statement'
          : 'Not run · couldn’t be read as SQL';
      if (kind === 'select') return 'Not run · a SELECT that writes or locks';
      if (kind === 'explain') return 'Not run · EXPLAIN ANALYZE';
      return `Not run · ${article(kind.toUpperCase())} ${kind.toUpperCase()}`;
    }
    case 'stopped': {
      const head = answer.how === 'timeout' ? 'Stopped at 30 seconds' : 'Cancelled';
      // With the rows read before the stop, where any were (T545), and
      // whether Cube Store runs it on (T548).
      return [
        head,
        ...(answer.rowCount > 0 ? [rowsText(answer.rowCount)] : []),
        ...(done.stillRunning === true ? ['Cube Store runs it on'] : []),
      ].join(' · ');
    }
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
