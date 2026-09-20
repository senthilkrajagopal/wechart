import type { Kysely } from 'kysely';

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
}

export interface QueryLogRecord extends QueryLogEntry {
  readonly id: number;
  readonly createdAt: Date;
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
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toRecord(row);
    },

    /** Newest first: the Jobs workspace is read from the top. */
    async recent(limit = 100): Promise<QueryLogRecord[]> {
      const rows = await db
        .selectFrom('query_log')
        .selectAll()
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
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
