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
  /**
   * Generated from `body` by the database, so they are readable and indexable
   * but never written directly — see the 1758240002000 migration.
   */
  title: Generated<string | null>;
  folder_id: Generated<string | null>;
  owner: Generated<string | null>;
  local_to_dashboard_id: Generated<string | null>;
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

/** Image tiles' images (AC-063), written once, never updated. */
export interface ImageTable {
  id: string;
  dashboard_id: string;
  content_type: string;
  bytes: Buffer;
  size: number;
  created_at: Generated<Date>;
}

/** The Cube model's files (T137, AC-131), one row a file, by its path. */
export interface ModelFileTable {
  path: string;
  content: string;
  updated_at: Generated<Date>;
}

/** A data source, a folder item (phase 2). Its secrets are in `data_source_secrets`. */
export interface DataSourceTable {
  id: string;
  folder_id: string;
  name: string;
  type: string;
  settings: JSONColumnType<Record<string, unknown>>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One sealed envelope per data source (T332, AC-298). */
export interface DataSourceSecretTable {
  data_source_id: string;
  scheme: number;
  key_id: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
  updated_at: Generated<Date>;
}

/** A publish's draft while Cube compiles it (T418): see its migration. */
export interface PublishDraftTable {
  id: string;
  files: JSONColumnType<{ path: string; content: string }[]>;
  read: Generated<boolean>;
  created_at: Generated<Date>;
}

/** A signed-in session (T316): the session as @fastify/session serialises it. */
export interface SessionTable {
  id: string;
  session: JSONColumnType<Record<string, unknown>>;
  expires_at: Date | null;
}

export interface Database {
  sessions: SessionTable;
  documents: DocumentTable;
  query_log: QueryLogTable;
  images: ImageTable;
  model_files: ModelFileTable;
  data_sources: DataSourceTable;
  data_source_secrets: DataSourceSecretTable;
  publish_drafts: PublishDraftTable;
}
