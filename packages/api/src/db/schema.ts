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
  /** Who ran it (R42.6); none with sign-in off, or from before. */
  user_key: string | null;
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
  /** Its folder (T334): the shared root's, `root`, unless one is named. */
  folder_id: Generated<string>;
  path: string;
  content: string;
  updated_at: Generated<Date>;
  /** Its id, which a proposal names it by (T347, T350). */
  id: Generated<string>;
  /** Raised by each write over it (T347): what a proposal replaces is "version n". */
  version: Generated<number>;
  /** A workspace model's shared folder to go to (T347, AC-282); none elsewhere. */
  target_folder_id: Generated<string | null>;
  /** What a workspace copy was copied from: `{ id, folderId, path, version }` (T347). */
  origin: JSONColumnType<ModelOrigin | null, string | null | undefined, string | null>;
}

/** The shared model file a workspace copy was copied from (T347). */
export interface ModelOrigin {
  readonly id: string;
  readonly folderId: string;
  readonly path: string;
  readonly version: number;
  /**
   * A copy of a model in a folder its maker may only read (T543, AC-283):
   * to use, going to a folder they write as a new model, never proposed back.
   */
  readonly useOnly?: true;
}

/** A data source, a folder item (phase 2). Its secrets are in `data_source_secrets`. */
export interface DataSourceTable {
  id: string;
  folder_id: string;
  /** A short name, unique in its folder (T335, AC-270). */
  name: string;
  /** Its driver's type id (T454): never changed once stored (AC-161). */
  type: string;
  /** How it signs in: one of its driver's methods (T335). */
  auth_method: Generated<string>;
  /** Its fields without secrets, exactly as the browser sealed with them. */
  settings: JSONColumnType<Record<string, unknown>>;
  /** Where one made in a workspace is to go (T345, AC-282); none in a shared folder. */
  target_folder_id: Generated<string | null>;
  /** What a copy was copied from (T346, AC-280): `{ id, version, folderId }`. */
  origin: JSONColumnType<
    { id: string; version: number; folderId: string } | null,
    string | null | undefined,
    string | null
  >;
  /** What it is for, in its own words (T499); no part of the connection. */
  description: Generated<string | null>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * One sealed envelope per secret field (T335, AC-298): `{ v: 1, kid, enc, ct }`
 * as the browser sealed it to xcube's key, which wechart never opens.
 */
export interface DataSourceSecretTable {
  data_source_id: string;
  field: string;
  envelope: JSONColumnType<Record<string, unknown>>;
  revision: string;
  updated_at: Generated<Date>;
}

/** A connection test of a stored data source, as xcube ran it (T362, AC-163). */
export interface ConnectionTestTable {
  id: Generated<string>;
  seq: Generated<string>;
  /** None for the wizard's test of one not yet made, until one is made from it (T363). */
  data_source_id: string | null;
  ran_at: Generated<Date>;
  ok: boolean;
  as_stored: boolean;
  /** The print of what a test of one not yet made tested, envelopes included (T363). */
  shape: Generated<string | null>;
  /** The stored settings' print it tested; none for a trial of changes (T364's review). */
  settings: string | null;
  checks: JSONColumnType<unknown[]>;
  fields: JSONColumnType<Record<string, unknown>>;
  ran_by: JSONColumnType<{ key: string; name: string } | null, string | null, string | null>;
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
  connection_tests: ConnectionTestTable;
  model_publications: ModelPublicationTable;
  folder_xcube_ids: FolderXcubeIdTable;
  audit_records: AuditRecordTable;
  proposals: ProposalTable;
  proposal_items: ProposalItemTable;
  item_versions: ItemVersionTable;
  sql_runner_switches: SqlRunnerSwitchTable;
  sql_runs: SqlRunTable;
  build_runs: BuildRunTable;
  build_tokens: BuildTokenTable;
}

/** A build wechart started through Cube's jobs API (T372, AC-150): one row per start. */
export interface BuildRunTable {
  id: string;
  pre_aggregation: string;
  folder_id: string | null;
  /** The partitions asked for, by their starts; null for every partition. */
  partitions: JSONColumnType<string[] | null, string | null, string | null>;
  partition_granularity: string | null;
  via: string;
  starter_kind: string;
  starter_key: string | null;
  starter_name: string | null;
  schedule_id: string | null;
  schedule_name: string | null;
  request_id: string;
  started_at: Date;
  answered_at: Date;
  ended_at: Date | null;
  outcome: string | null;
  failed_count: number | null;
  error: string | null;
}

/** One job Cube made for a build, a partition's (T372): its states, as wechart saw them. */
export interface BuildTokenTable {
  run_id: string;
  token: string;
  position: number;
  status: string | null;
  target_table: string | null;
  finished: Generated<boolean>;
  finished_at: Date | null;
  log: JSONColumnType<{ at: string; status: string; table?: string }[], string | undefined, string>;
  lease_until: Date | null;
}

/** The SQL runner switched on for a target (T531, AC-374): a data source's id, or `cubestore`. */
export interface SqlRunnerSwitchTable {
  target: string;
  confirmed_by_key: string;
  confirmed_by_name: string;
  confirmed_at: Generated<Date>;
}

/** A user's SQL run (T533, AC-379): one unfinished per user at most. */
export interface SqlRunTable {
  id: string;
  user_key: string;
  /** None for Cube Store (T536). */
  data_source_id: string | null;
  started_at: Generated<Date>;
  finished_at: Date | null;
  outcome: string | null;
  /** As its user wrote it, for their history alone (T534, AC-381). */
  sql: Generated<string>;
  data_source_name: string | null;
  row_count: number | null;
  duration_ms: number | null;
  truncated: string | null;
  statement: string | null;
}

/** A version of a shared item wechart landed (T352, AC-288), a copy it holds. */
export interface ItemVersionTable {
  kind: string;
  item_id: string;
  version: number;
  content: JSONColumnType<Record<string, unknown>>;
  folder_id: string;
  title: string;
  author_key: string | null;
  author_name: string | null;
  approver_key: string | null;
  approver_name: string | null;
  at: Generated<Date>;
  description: string | null;
  proposal_id: string | null;
}

/** A workspace item proposed to its target folder (T349, AC-284), and its decision. */
export interface ProposalTable {
  id: string;
  kind: string;
  item_id: string;
  title: string;
  target_folder_id: string;
  author_key: string;
  author_name: string;
  description: string | null;
  proposed_at: Generated<Date>;
  status: Generated<string>;
  decided_by_key: string | null;
  decided_by_name: string | null;
  decided_at: Date | null;
  reason: string | null;
  /** A rejection's band dismissed by its author (T358, R42.1). */
  dismissed_at: Generated<Date | null>;
}

/** Each item a proposal would land, as it was when proposed, the item itself first. */
export interface ProposalItemTable {
  proposal_id: string;
  position: number;
  kind: string;
  item_id: string;
  title: string;
  version: number;
  snapshot: JSONColumnType<Record<string, unknown>>;
  /** The folder it lands in. */
  lands_in: string;
  replaces_id: string | null;
  replaces_version: number | null;
  /** While its proposal is open. */
  open: Generated<boolean>;
}

/** One audit record (T368, AC-294): who, what, which folder and when. Only ever added. */
export interface AuditRecordTable {
  id: string;
  at: Generated<Date>;
  actor_key: string | null;
  actor_name: string | null;
  actor_identity: string | null;
  event: string;
  folder_id: string | null;
  item_kind: string | null;
  item_id: string | null;
  item_title: string | null;
  summary: string;
  details: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
}

/** Each folder's id in xcube, stored and never reused (T425, AC-328). */
export interface FolderXcubeIdTable {
  folder_id: string;
  xcube_id: string;
  created_at: Generated<Date>;
}

/** What xcube last acknowledged of each model (T419, AC-333). */
export interface ModelPublicationTable {
  model_id: string;
  xcube_generation: string;
  xcube_revision: number;
  content_hash: string;
  synced_at: Generated<Date>;
}
