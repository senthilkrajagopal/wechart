import { XcubeError } from './client';

/**
 * xcube's read-only SQL runner (T532, R50; research `xcube-sql-runner.md`,
 * image `89628a0e88`, and from `6d9673ccda` a stopped run's rows,
 * `xcube-6d9673ccda.md`): three admin routes under one model, called only by
 * wechart's server, with its service credential (AC-327).
 *
 * - `POST …/connections/{name}/sql`: a stored connection by its name; a
 *   workspace overlay's own with `?overlay=<id>`, by its own name, as in
 *   every folder (T709; research `xcube-256d632371.md`, 1.1), never falling
 *   back to a landed one;
 * - `POST …/cubestore/sql`: Cube Store, SELECT and EXPLAIN only;
 * - `POST …/sql/cancel`: a run stopped by its id, on whichever instance runs it.
 *
 * xcube checks the statement, opens a connection of the run's own, runs it in
 * a read-only transaction where the database has one, and caps its rows,
 * bytes and time (research, "The check, and read-only per database").
 */

/** Where a run goes: a connection, an overlay's own, or Cube Store. */
export type SqlTarget =
  { readonly connection: string; readonly overlay?: string } | { readonly cubeStore: true };

/**
 * A `{{name}}`'s value, bound by xcube, never written into the SQL (T811,
 * AC-454; xcube bb188d8ada, research `xcube-bb188d8ada.md`): a number as a
 * decimal string, a date as `YYYY-MM-DD`, a Boolean as itself.
 */
export type SqlParameter =
  | { readonly type: 'text' | 'number' | 'date'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean };

/** One run: its SQL, its id (wechart's, one per run) and its caps. */
export interface SqlAsk {
  readonly sql: string;
  readonly runId: string;
  readonly maxRows: number;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  /** Its `{{name}}`s' values, by name; none sent where the SQL has none (T811). */
  readonly parameters?: Readonly<Record<string, SqlParameter>>;
}

/** A column: its name and its type as the database names it; `null` on Cube Store. */
export interface SqlColumn {
  readonly name: string;
  readonly type: string | null;
}

export type SqlStatement = 'select' | 'explain';

/** What xcube answered a run (research, "Refusals and failures"). */
export type SqlAnswer =
  /** It ran: its rows, cut at a cap where `truncated` says which. */
  | {
      readonly kind: 'ran';
      readonly columns: readonly SqlColumn[];
      readonly rows: readonly (readonly unknown[])[];
      readonly rowCount: number;
      readonly truncated: 'rows' | 'bytes' | null;
      readonly durationMs: number;
      readonly statement: SqlStatement;
      readonly redactedSql: string;
    }
  /** Refused before anything reached the database: not one SELECT or EXPLAIN, or not read. */
  | {
      readonly kind: 'refused';
      readonly code: string;
      /** xcube's words: the kind found, or what couldn't be read. */
      readonly reason: string;
      readonly statement: string | null;
      readonly redactedSql: string | null;
      /**
       * A Cube Store join its router would run itself, which nothing could
       * stop once it started (xcube 636ffa04b2, `reason:
       * "cubestore_router_join"`; T650, R64). Read by `reason`, never by
       * `error`'s text.
       */
      readonly routerJoin?: true;
      /**
       * Its parameters refused (T811; xcube bb188d8ada): a value missing,
       * unused or not of its type, a malformed `{{…}}`, a placeholder written
       * by hand, or a database that binds none. `reason` is xcube's words,
       * which name a parameter, never its value.
       */
      readonly parameters?: true;
    }
  /**
   * Stopped at its time cap, or cancelled, with the rows it read before the
   * stop, none where nothing arrived (`6d9673ccda`, T545; research
   * xcube-6d9673ccda.md). Its columns as far as the database described them.
   */
  | {
      readonly kind: 'stopped';
      readonly how: 'timeout' | 'cancelled';
      readonly statement: string | null;
      readonly redactedSql: string | null;
      readonly durationMs: number | null;
      readonly columns: readonly SqlColumn[];
      readonly rows: readonly (readonly unknown[])[];
      readonly rowCount: number;
      /**
       * Cube Store runs it on, for it can't stop a query (`2099b13f2d`,
       * T548): false where the stop is real, a data source's.
       */
      readonly stillRunning: boolean;
      /**
       * When Cube Store's own timeout ends it at the latest, where anything
       * does: null for a query its router runs, which runs to its end
       * (`46ca0ce708`, T549; research xcube-46ca0ce708.md), and where the
       * stop is real.
       */
      readonly endsBy: string | null;
    }
  /**
   * The database refused it, or couldn't be connected to. Its message may
   * quote a literal of the SQL (research, Gotcha 3): never for the audit trail.
   */
  | {
      readonly kind: 'failed';
      readonly code: 'query_failed' | 'connect_failed';
      readonly error: string;
      readonly statement: string | null;
      readonly redactedSql: string | null;
      readonly durationMs: number | null;
    }
  /** xcube runs at most 16 at once on an instance (research, Gotcha 2). */
  | { readonly kind: 'busy' }
  /** No such connection, overlay or model in xcube. */
  | {
      readonly kind: 'missing';
      readonly code: 'unknown_connection' | 'unknown_overlay' | 'unknown_model';
      readonly error: string;
    };

/**
 * A run's state on xcube (T548; `GET …/sql/runs/{runId}`, xcube 2099b13f2d):
 * `stopping` is a Cube Store query stopped but run on, until `endsBy` at the
 * latest, or with none to its end, its router's (T549, `46ca0ce708`);
 * `ended` is Cube Store having answered it, or a run that never was.
 */
export interface SqlRunState {
  readonly state: 'running' | 'stopping' | 'ended';
  readonly endsBy: string | null;
}

export interface XcubeSqlRunner {
  run(target: SqlTarget, ask: SqlAsk): Promise<SqlAnswer>;
  /** Whether the run was going: it then answers `cancelled`. */
  cancel(runId: string): Promise<boolean>;
  /** Its state, from any instance. */
  state(runId: string): Promise<SqlRunState>;
}

/**
 * How long a run's request may take: connecting (xcube waits up to 30 s), the
 * run's own cap, and xcube's clock, 2 s after the database's (research, "The
 * check, and read-only per database"), with room to answer.
 */
const CONNECT_AND_ANSWER_MS = 45_000;
const CANCEL_TIMEOUT_MS = 15_000;

const MISSING = new Set(['unknown_connection', 'unknown_overlay', 'unknown_model']);
/** A 400 of xcube's check: the SQL is no one SELECT or EXPLAIN. */
const SQL_REFUSALS = new Set(['not_read_only', 'several_statements']);
/** A 400 refusing a run's bound parameters (T811; research `xcube-bb188d8ada.md`). */
const PARAMETER_REFUSALS = new Set(['invalid_parameters', 'parameters_unsupported']);

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export function xcubeSqlRunner({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /** The service credential's token, minted for each call (T420); or a fixed one, as the stub takes. */
  readonly token: string | (() => Promise<string>);
  readonly fetch?: typeof fetch;
}): XcubeSqlRunner {
  const base = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}`;
  const credential = typeof token === 'string' ? async () => token : token;

  const post = async (path: string, body: unknown, waitMs: number) => {
    const response = await send(`${base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await credential()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(waitMs),
      body: JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, answer };
  };

  return {
    async run(target, ask) {
      const path =
        'cubeStore' in target
          ? '/cubestore/sql'
          : `/connections/${encodeURIComponent(target.connection)}/sql${
              target.overlay === undefined ? '' : `?overlay=${encodeURIComponent(target.overlay)}`
            }`;
      const { status, answer } = await post(path, ask, ask.timeoutMs + CONNECT_AND_ANSWER_MS);
      const code = text(answer['code']);
      const error = text(answer['error']) ?? code ?? `xcube answered ${String(status)}`;
      const statement = text(answer['statement']);
      const redactedSql = text(answer['redactedSql']);
      const columns = Array.isArray(answer['columns'])
        ? (answer['columns'] as Record<string, unknown>[]).map((column) => ({
            name: String(column['name']),
            type: text(column['type']),
          }))
        : [];
      const rows = Array.isArray(answer['rows']) ? (answer['rows'] as unknown[][]) : [];
      const rowCount = count(answer['rowCount']) ?? rows.length;
      if (status === 200)
        return {
          kind: 'ran',
          columns,
          rows,
          rowCount,
          truncated:
            answer['truncated'] === 'rows' || answer['truncated'] === 'bytes'
              ? answer['truncated']
              : null,
          durationMs: count(answer['durationMs']) ?? 0,
          statement: answer['statement'] === 'explain' ? 'explain' : 'select',
          redactedSql: redactedSql ?? '',
        };
      // The SQL refused; any other 400 refuses the request, and is thrown (T532's review).
      if (status === 400 && code !== null && SQL_REFUSALS.has(code))
        return {
          kind: 'refused',
          code,
          reason: error,
          statement,
          redactedSql,
          ...(answer['reason'] === 'cubestore_router_join' ? { routerJoin: true as const } : {}),
        };
      if (status === 400 && code !== null && PARAMETER_REFUSALS.has(code))
        return { kind: 'refused', code, reason: error, statement, redactedSql, parameters: true };
      if (status === 422 && (code === 'timeout' || code === 'cancelled'))
        return {
          kind: 'stopped',
          how: code,
          statement,
          redactedSql,
          durationMs: count(answer['durationMs']),
          columns,
          rows,
          rowCount,
          stillRunning: answer['stillRunning'] === true,
          endsBy: answer['stillRunning'] === true ? text(answer['endsBy']) : null,
        };
      if (
        (status === 422 && code === 'query_failed') ||
        (status === 502 && code === 'connect_failed')
      )
        return {
          kind: 'failed',
          code,
          error,
          statement,
          redactedSql,
          durationMs: count(answer['durationMs']),
        };
      if (status === 503 && code === 'busy') return { kind: 'busy' };
      if (status === 404 && code !== null && MISSING.has(code))
        return { kind: 'missing', code: code as 'unknown_connection', error };
      throw new XcubeError(status, code ?? undefined, `xcube answered ${String(status)}: ${error}`);
    },

    async cancel(runId) {
      const { status, answer } = await post('/sql/cancel', { runId }, CANCEL_TIMEOUT_MS);
      if (status !== 200)
        throw new XcubeError(
          status,
          text(answer['code']) ?? undefined,
          `xcube answered ${String(status)} to a cancel`,
        );
      return answer['found'] === true;
    },

    async state(runId) {
      const response = await send(`${base}/sql/runs/${encodeURIComponent(runId)}`, {
        headers: { authorization: `Bearer ${await credential()}` },
        signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
      });
      const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const state = answer['state'];
      if (
        response.status !== 200 ||
        (state !== 'running' && state !== 'stopping' && state !== 'ended')
      )
        throw new XcubeError(
          response.status,
          text(answer['code']) ?? undefined,
          `xcube answered ${String(response.status)} when asked a run's state`,
        );
      // A time it can't read is none: never shown as one (T549's review).
      const endsBy = state === 'stopping' ? text(answer['endsBy']) : null;
      return {
        state,
        endsBy: endsBy !== null && !Number.isNaN(Date.parse(endsBy)) ? endsBy : null,
      };
    },
  };
}
