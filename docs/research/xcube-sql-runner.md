---
library: xcube's read-only SQL runner (the user's Cube fork), as built for R50
packages: []
# Nothing is imported: wechart's server calls xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 89628a0e88; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-89628a0e88@sha256:155d204cf8405578c1667435c4518e4fb14e7b1f63af1bea66ebc263fb7a4d17 (amd64, arm64)'
researched: 2026-10-01
---

# xcube's SQL runner (R50, F40)

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-01-1200-sql-runner-built.md`, to wechart's request `~/Work/xcube-exchange/to-xcube/2026-10-01-0057-sql-runner.md`;
- xcube at 89628a0e88: `src/sql/classify.ts` (the check), `src/sql/runner.ts` (each database's session), `src/sql/runs.ts` (caps, clock, cancel), `src/admin/routes.ts` (the three routes), `src/store/migrations.ts` (migration 12, additive: one table, `sql_runs`), README "Serving models" → "SQL runner" and "Admin API", and its tests (`test/integration/sql-runner.test.ts`, `test/unit/sql-classify.test.ts`, `test/unit/sql-runner.test.ts`);
- the background study, `docs/research/sql-runner.md`.

Nothing below has yet been checked against compose's running xcube: the image isn't pinned yet. T532 checks it when it pins the image.

## The routes

All three are admin routes, under the service credential only [answer, "The routes"].

### `POST …/models/{model}/connections/{name}/sql`

- **A stored (landed) connection** is addressed by its name, as the test route's are.
- **A workspace overlay's own data source** is addressed with `?overlay=<id>`.
  - Its name is the one the overlay's previews use: `<folderId>__<name>`, or a root one's short name.
  - With `?overlay=`, only the overlay's own data sources are found; it never falls back to a landed one.
  - The overlay keeps the data sources its push brought, sealed, and the run reads them from there.
- **Request:** `{ "sql", "runId", "maxRows", "timeoutMs", "maxBytes" }`.
  - A cap left out takes R50's value: 10,000 rows, 30 s, 10 MB.
  - xcube's ceilings are 100,000 rows, 10 minutes and 100 MB.
  - `sql` is at most 100,000 characters.
  - `runId` is 1–64 of `A-Z a-z 0-9 _ -`.
  - BigQuery only: an optional `maxBytesBilled`, separate from `maxBytes` and off unless sent.
- **Answer `200`:** `{ columns: [{ name, type }], rows: [[…]], rowCount, truncated: 'rows' | 'bytes' | null, durationMs, statement: 'select' | 'explain', redactedSql }`.
  - `durationMs` is the statement's time, without connecting.

### `POST …/models/{model}/cubestore/sql`

The same request and answer, on Cube Store [answer, "The routes"; Q5]:
- **Only SELECT and EXPLAIN (without ANALYZE).** SHOW and DESCRIBE are refused: 1.7.45 has no `SHOW TABLES`, `SHOW SCHEMAS` or `DESCRIBE`, and its other SHOWs answer every row uncapped. The refusal points to `information_schema.tables`/`columns` and `system.tables`/`partitions`/`chunks`/`indexes` with a LIMIT.
- **Refused:** `system.cache`, `system.queue` and `system.queue_results`, and cache, queue, `SYS` and `DUMP` commands.
- **The row cap** is its own top-level `LIMIT`, added or lowered to the cap plus one.
- **No cancel:** at the clock, xcube answers `timeout` and drops its connection; Cube Store's own `CUBESTORE_QUERY_TIMEOUT` (120 s) stops the query.
- **Values come as strings, and `type` is `null`.** A SELECT with no rows has no columns.
- **The route is under a model,** but Cube Store holds every model's rollups.

### `POST …/models/{model}/sql/cancel`

`{ runId }` → `{ model, runId, found }`.
- `found` says it was running; the run's own request then answers `cancelled`.
- It reaches whichever instance runs it: runs are noted in `sql_runs` and the cancel goes over the notification channel. xcube tested this with two instances, and the statement was gone from `pg_stat_activity`.
- A run of another model isn't found.

### Refusals and failures

Each answers `{ error, code, statement, redactedSql, durationMs? }`, with `redactedSql` whenever the SQL was read [answer, "Refusals and failures"].

| Status | `code` | When |
|---|---|---|
| 400 | `not_read_only` | The check refused it. `statement` names its kind (`insert`, `create`, `set` …, or `select` for a SELECT holding a write or lock). Also SQL that can't be read |
| 400 | `several_statements` | |
| 404 | `unknown_connection`, `unknown_overlay`, `unknown_model` | |
| 409 | `run_in_progress` | A run of this `runId` is running |
| 422 | `timeout`, `cancelled` | Stopped |
| 422 | `query_failed` | The database's message |
| 502 | `connect_failed` | |
| 503 | `busy` | At most 16 runs at once per instance; `Retry-After: 5` |
| 400 | `bad_request`, `invalid_overlay_id`, `invalid_connection_name` | |

- **Redaction covers the connection's secrets only.** The database's message is not redacted of literals: PostgreSQL's "invalid input syntax for type integer: \"abc\"" quotes the value. So wechart's audit record must not keep it (AC-382 keeps only `redactedSql`).
- **xcube's own logs** name the model, target, run id, outcome, row count and duration, never the SQL or the database's message.

## The check, and read-only per database

- **xcube's own dialect-aware lexer,** with an allow-list on its tokens, not a grammar parser [answer, Q1].
  - It reads each database's strings, escapes, quoted names, comments and dollar quotes as that database does.
  - Where the reading depends on settings, a statement must pass every reading.
- **Refused anywhere:** `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `UPSERT`, `INTO`, `FOR SHARE`.
- **Refused functions, per database:**
  - PostgreSQL: `pg_terminate_backend`, `pg_cancel_backend`, `dblink*`, `set_config`, `pg_read_file`, `pg_ls_*`, `lo_*`, `query_to_xml` and the like;
  - MySQL: `LOAD_FILE`;
  - Snowflake: `SYSTEM$*`;
  - BigQuery: `EXTERNAL_QUERY`;
  - SQL Server: `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE`, `xp_*`, and the lock hints `UPDLOCK`, `XLOCK`, `TABLOCKX`;
  - Oracle: `UTL_*`, and `DBMS_*` but `DBMS_XPLAN`, `DBMS_LOB`, `DBMS_RANDOM`.
- **EXPLAIN** runs without `ANALYZE` on PostgreSQL, Redshift, MySQL, Snowflake, Dremio and Cube Store. SQL Server and BigQuery have none, and Oracle's `EXPLAIN PLAN` is refused, since it writes PLAN_TABLE.
- **May refuse what would have run:**
  - an unquoted column named as a refused word;
  - Oracle's `q'[…]'` strings;
  - on Redshift, a string ending in a backslash;
  - Snowflake's harmless `SYSTEM$TYPEOF`.

| | One statement | Transaction (always rolled back) | Time cap on the database |
|---|---|---|---|
| PostgreSQL | cursor (extended protocol) | `BEGIN READ ONLY` | `statement_timeout` |
| Redshift | cursor | `BEGIN READ ONLY` | `statement_timeout` |
| MySQL | mysql2's one per call | `START TRANSACTION READ ONLY` | `MAX_EXECUTION_TIME` (MariaDB `max_statement_time`) |
| Snowflake | `MULTI_STATEMENT_COUNT` 1 | none | `STATEMENT_TIMEOUT_IN_SECONDS` |
| BigQuery | dry run must say `SELECT` | none | `jobTimeoutMs` |
| SQL Server | the check (its batch included) | rolled back, not read-only | `requestTimeout` |
| Oracle | one per execute | `SET TRANSACTION READ ONLY` | `callTimeout` |
| Dremio | REST takes one | none | xcube's clock cancels the job |
| Cube Store | parses only the first | none | its own (120 s) |

- **Every run gets a connection of its own,** a pool of one, never one Cube serves with, and dropped afterwards.
- **xcube's clock** fires 2 s after the database's own timeout and cancels on the database.
- **Oracle and Dremio rows** are read only to the cap: Oracle through a result set, Dremio through its job API 500 rows at a time [answer, Q3].

## What wechart must handle

- **Cells are JSON:**
  - binary as `\x` and hex;
  - dates in ISO 8601;
  - PostgreSQL's `int8`/`numeric`, MySQL's `BIGINT`/`DECIMAL` (a bare `SELECT 1` is a BIGINT there), Snowflake's numbers and every SQL Server number come as **strings**.
- **Column types** are the database's own names (`int4`, `VAR_STRING`, `NUMBER`, `nvarchar`), and `null` on Cube Store.
- **Duplicate column names** are kept, since rows are arrays. They can't occur on Dremio or BigQuery.
- **What only a SELECT-only login closes (phase 3):** a SELECT calling a writing function on Snowflake, SQL Server and Dremio, and, on Oracle, a function with an autonomous transaction (xcube's integration test committed one). The attestation's wording matters most on these four.

## Gotchas for wechart

1. Send `runId` from wechart's server, one per run. It is the key for cancel (AC-379) and for xcube's `run_in_progress`.
2. `503 busy` is xcube's per-instance limit of 16, separate from wechart's one run per user (AC-379). Say it as "busy, try again".
3. Keep the database's error text out of the audit record (AC-382). It may hold literals.
4. A workspace data source runs on the overlay's copy, so its overlay must have been pushed (T347) before the run.
