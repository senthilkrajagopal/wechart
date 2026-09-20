import type { Generated, JSONColumnType } from 'kysely';

/**
 * The metadata database, as Kysely sees it.
 *
 * Everything wechart saves lives in one versioned document table. AC-014 names
 * five kinds — dashboard, chart, folder, bookmark, setting — and asks only that
 * each is stored and comes back unchanged; AC-015 asks that a save over a newer
 * version is refused. Neither needs per-kind columns, and inventing a relational
 * shape for behaviour no criterion describes would be guesswork. Later tasks
 * add columns and indexes in their own migrations as their ACs call for them
 * (the folder tree at T016, title search at T017, references at T019).
 */
export interface DocumentTable {
  kind: string;
  id: string;
  body: JSONColumnType<Record<string, unknown>>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * A log, not a versioned object: rows are appended and read by recency, never
 * updated (AC-016).
 */
export interface QueryLogTable {
  id: Generated<number>;
  request_id: string;
  query: JSONColumnType<Record<string, unknown>>;
  duration_ms: number;
  accelerated: boolean;
  pre_aggregation: string | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface Database {
  documents: DocumentTable;
  query_log: QueryLogTable;
}
