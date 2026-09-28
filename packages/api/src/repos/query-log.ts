import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * AC-016: a record of every query wechart issues — the Cube request, the
 * duration, and whether it was accelerated — exposed in the Jobs workspace.
 *
 * Failures are recorded too. A query that took four seconds and then errored is
 * exactly what someone opens this list to find, and dropping it would make the
 * log a record of successes rather than of what the system did.
 */
export interface QueryLogEntry {
  readonly requestId: string;
  readonly query: Record<string, unknown>;
  readonly durationMs: number;
  readonly accelerated: boolean;
  readonly preAggregation?: string | null;
  readonly error?: string | null;
  /** Who ran it (R42.6, T371): their Jobs shows a read-write member their own. */
  readonly userKey?: string | null;
}

export interface QueryLogRecord extends QueryLogEntry {
  readonly id: number;
  readonly createdAt: Date;
}

/** What a page of the log is asked for (AC-230); each part absent asks for all. */
export interface QueryLogPageAsk {
  readonly outcome?: 'succeeded' | 'failed';
  readonly source?: 'live' | 'accelerated';
  /** Only records made within this many seconds. */
  readonly withinSeconds?: number;
  /** By when (the default) or by how long. */
  readonly sort?: 'when' | 'duration';
  /** Largest first, the default. */
  readonly descending?: boolean;
  readonly offset?: number;
  readonly limit?: number;
  /** Only this user's (R42.6); absent, everyone's. */
  readonly userKey?: string;
}

export interface QueryLogPage {
  readonly records: QueryLogRecord[];
  /** How many records match, over the whole log. */
  readonly total: number;
}

export function queryLog(db: Kysely<Database>) {
  return {
    async record(entry: QueryLogEntry): Promise<QueryLogRecord> {
      const row = await db
        .insertInto('query_log')
        .values({
          request_id: entry.requestId,
          query: JSON.stringify(entry.query),
          duration_ms: Math.round(entry.durationMs),
          accelerated: entry.accelerated,
          pre_aggregation: entry.preAggregation ?? null,
          error: entry.error ?? null,
          user_key: entry.userKey ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toRecord(row);
    },

    /** Newest first: the Jobs workspace is read from the top. */
    async recent(limit = 100, userKey?: string): Promise<QueryLogRecord[]> {
      let rows = db.selectFrom('query_log').selectAll();
      if (userKey !== undefined) rows = rows.where('user_key', '=', userKey);
      return (
        await rows.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).execute()
      ).map(toRecord);
    },

    /**
     * A page of the log, narrowed and sorted over all of it (AC-230), with how
     * many records match in all. The time range is counted back from the
     * database's clock, which stamped the records, not the browser's.
     * Ties fall newest first, so a page follows on from the one before it.
     */
    async page(ask: QueryLogPageAsk = {}): Promise<QueryLogPage> {
      let matching = db.selectFrom('query_log');
      if (ask.userKey !== undefined) matching = matching.where('user_key', '=', ask.userKey);
      if (ask.outcome !== undefined)
        matching = matching.where('error', ask.outcome === 'failed' ? 'is not' : 'is', null);
      if (ask.source !== undefined)
        matching = matching.where('accelerated', '=', ask.source === 'accelerated');
      if (ask.withinSeconds !== undefined)
        matching = matching.where(
          'created_at',
          '>=',
          sql<Date>`now() - make_interval(secs => ${ask.withinSeconds})`,
        );

      const direction = ask.descending === false ? 'asc' : 'desc';
      const [rows, counted] = await Promise.all([
        matching
          .selectAll()
          .orderBy(ask.sort === 'duration' ? 'duration_ms' : 'created_at', direction)
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .offset(ask.offset ?? 0)
          .limit(ask.limit ?? 25)
          .execute(),
        matching.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
      ]);

      return { records: rows.map(toRecord), total: Number(counted.total) };
    },

    /**
     * The records of these request ids, whatever else was logged since —
     * a dashboard's own queries, as its page sent them (T180, AC-174).
     */
    async byRequestIds(requestIds: readonly string[]): Promise<QueryLogRecord[]> {
      if (requestIds.length === 0) return [];
      const rows = await db
        .selectFrom('query_log')
        .selectAll()
        .where('request_id', 'in', [...requestIds])
        .orderBy('id', 'asc')
        .execute();

      return rows.map(toRecord);
    },
  };
}

interface Row {
  id: number;
  request_id: string;
  query: unknown;
  duration_ms: number;
  accelerated: boolean;
  pre_aggregation: string | null;
  error: string | null;
  created_at: Date;
}

function toRecord(row: Row): QueryLogRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    query: row.query as Record<string, unknown>,
    durationMs: row.duration_ms,
    accelerated: row.accelerated,
    preAggregation: row.pre_aggregation,
    error: row.error,
    createdAt: row.created_at,
  };
}
