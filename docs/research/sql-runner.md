---
library: SQL runner reference study (Cube Cloud SQL Runner, Apache Superset SQL Lab) and how it maps to xcube
packages: []
# Nothing is imported. wechart would call an xcube route over HTTP, and the database drivers named here run inside xcube's image (Cube 1.7.45).
version: 'Superset 6.1.0 (tag 6.1.0 = c83fb2bb1d; local image local/superset:6.1.0-pg); Cube docs at cube-js/cube master 935e094810 (changelog v0.14.0, 2026-09-23); Cube 1.7.45 drivers (fork files identical to tag v1.7.45); xcube feat/xcube 5a237aedf8'
researched: 2026-09-30
---

# SQL runner: what Cube Cloud's SQL Runner and Superset SQL Lab teach wechart, and how it maps to xcube

*Asked for 2026-09-30: "Build a SQL runner into wechart through xcube. This would be a guarded admin route that runs read-only SQL on a model's connection, like Cube Cloud's SQL Runner." Written by an integration-researcher agent; saved as it reported.*

## Summary

- **Both products run raw SQL on a stored connection, using that connection's own credentials.** Neither routes the SQL through the semantic layer's access rules.
  - Cube Cloud runs it "on your data source or Cube Store", and only Admins and Developers may use it [cc-runner; cc-roles L17].
  - In Superset it needs the `sql_lab` role plus access to the database [ss-sec L42-52, L215-226]. Row-level security is off in SQL Lab unless the testing flag `RLS_IN_SQLLAB` is on, and that flag's own comment says it "May break queries or allow RLS bypass" [ss-config L650-653].
- **Neither product's "read-only" is a guarantee made by the database.**
  - **Cube Cloud** has one deployment switch, "Enable DDL operations". Without it, "the SQL Runner will reject the DDL statements" [cc-sf-semviews]. Two things are undocumented (UNVERIFIED): how DDL is detected, and whether DML is refused.
  - **Superset** parses the SQL with sqlglot and refuses it when it finds a mutation and the database's `allow_dml` is off [ss-sqllab L429-430; ss-parse L670-720]. Its security guide says "Superset is Not a Database Firewall" and recommends read-only database users [ss-sec L166-185]. Two CVEs are titled as SQL Lab read-only bypasses, and a third as a parser edge case that bypasses data-access checks [ss-cves].
  - **Observed in the running 6.1.0 pod** (the parser only; nothing reached a database): Superset's parser does not flag `SELECT … INTO`, `COPY … FROM/TO PROGRAM`, `GRANT`, `CALL`, `VACUUM`, `SET ROLE`, `REFRESH MATERIALIZED VIEW`, `COMMENT ON`, `SET TRANSACTION READ WRITE` or `SELECT nextval(…)` as mutating.
- **Several Superset database settings are enforced only in its UI.** Through the REST API:
  - `runAsync: true` ran on a database with `allow_run_async` off;
  - a cost estimate came back while `ESTIMATE_QUERY_COST` was off and the database's extra had no `cost_estimate_enabled`;
  - by reading the source, `expose_in_sqllab` is only a listing filter.
- **In wechart the runner has to live in xcube**, because only xcube can open a data source's sealed secret [req §P2.4 L468-473].
  - **xcube already has most of the parts:** stored connections, throwaway drivers built with a pool of 1, secret redaction, 30-second timeouts, and introspection routes for a schema browser, which wechart already calls.
  - **Missing:** a route that runs SQL, per-driver read-only session setup, caps on rows, time and bytes, and a cancel that reaches whichever Cube instance is running the query.
- **Recommended safety model** (reasons in §5): the database's grants are the security boundary, through a read-only credential per data source.
  - Defence in depth on top: a read-only transaction or session where the driver has one, one statement per run, and a connection of the runner's own that never enters Cube's serving pool.
  - Parsing is only for early user feedback, never the guard.
- **The main decisions for the user are in §8:**
  - who may run SQL;
  - which credential runs it;
  - which targets it runs on: published data sources, workspace copies, Cube Store;
  - the caps;
  - export;
  - history;
  - what the audit trail keeps;
  - whether a semantic-SQL runner goes alongside it.
- **Scope note.** Part 1 deferred "the SQL API — a SQL runner in wechart" [req L177]. That item is Cube's semantic SQL API (`/v1/cubesql`) [research cube-capabilities.md L68]. A raw runner on the data source is a different, new scope item.

## 1. What was examined

- **Cube Cloud:** documentation only.
  - The public docs at docs.cube.dev, and the same MDX files in cube-js/cube `master` at `935e094810` (the changelog there is at `ab7408664c`).
  - No Cube Cloud account was used.
- **Superset 6.1.0:**
  - **Docs and source** at tag `6.1.0`. Every line number cited was read in the running pod and matches the tag. Spot-checked: `sql_lab.py` L168-169, L233, L406 and L429; `parse.py` L670-685; and seven `config.py` lines.
  - **Hands-on,** against http://localhost:8088 in namespace `superset`:
    - Signed in through `POST /api/v1/security/login`. The admin password was read from the `superset-config` Secret at run time inside a helper script, and was never printed or stored.
    - Read-only calls: listed databases, schemas, tables, query history, saved queries and the action log; read the SQL Lab bootstrap.
    - Ran 10 SELECTs on `examples` through `POST /api/v1/sqllab/execute/` (query-history rows 8–17, tab `analyst-probe`), one CSV export and one cost estimate.
    - **Side effects:** SQL Lab records every run in its query history and action log. That can't be avoided when running a query. Nothing else was created or changed.
  - **Parser checks** ran in Python inside the pod (`SQLScript(...).has_mutation()`), with no database contact.
  - Nothing in any other namespace was touched.
- **xcube:** read-only, at `feat/xcube` `5a237aedf8` (the fork is pushed), and wechart's existing research on it.
- **Cube 1.7.45 drivers:** read in the fork. `PostgresDriver.ts`, `BaseDriver.ts`, `PreAggregationLoader.ts`, `SnowflakeDriver.ts`, `OracleDriver.js`, `DremioDriver.js`, `MSSqlDriver.ts` and `env.ts` are byte-identical to upstream tag `v1.7.45` (`git diff v1.7.45 HEAD`), so they are cited upstream.

## 2. Cube Cloud's SQL Runner (docs only)

| Topic | Finding | Source |
|---|---|---|
| Purpose | Runs "SQL queries from Cube Cloud on your data source or Cube Store", to inform model development, for ad-hoc queries, and to debug the SQL Cube generates | [cc-runner] |
| What it runs against | **The data source itself**, with its raw tables, not the semantic layer. A data source appears only if at least one cube names it as its `data_source` | [cc-runner] |
| Cube Store | Its `cache` source can be picked, to test pre-aggregations. "That path only accepts read-only statements", so cache, queue and maintenance commands "are rejected before they reach Cube Store" | [cc-runner; cc-cubestore-sql] |
| Security context | Optional. Chosen from `scheduledRefreshContexts` or given as custom JSON; the default context is used otherwise. It chooses which data source `driver_factory` returns, and the Schema Explorer reloads for it. The docs don't say whether access policies apply to the SQL (UNVERIFIED) | [cc-runner] |
| Who may use it | Built-in roles: "Execute SQL queries against data sources" is ✅ for Admin and Developer, and ❌ for Explorer and Viewer | [cc-roles L17] |
| Custom roles | The API enum has `SqlRunnerRead` [cc-api L12048], but the custom-roles page lists no SQL Runner action among the deployment actions. How a custom role grants it is UNVERIFIED | [cc-custom-roles L248-261] |
| API tokens | Since v0.14.0 (2026-09-23), a minted token with scope `sql-runner` needs "SQL Runner read access". A caller-supplied `sql-runner-permissions:*` is never honoured; "the server appends the non-DDL qualifier itself when DDL is disabled". Tokens "expire within the hour" | [cc-changelog] |
| Read-only | The "Enable DDL operations" deployment setting. With it off, the runner rejects DDL. **UNVERIFIED:** whether INSERT, UPDATE and DELETE are refused, and whether enforcement is by parsing or by the database | [cc-sf-semviews] |
| Row, time and byte limits | None documented (UNVERIFIED) | [cc-runner] |
| Results | "The query results will be displayed under **Results**, along with the row count and query execution time" | [cc-runner] |
| Schema browser | The Schema Explorer shows tables, columns and types, "useful for ensuring that properties of data models match the underlying schema" | [cc-runner] |
| Saved queries, history | None documented for the runner itself (UNVERIFIED). Query History can send a query's SQL to the runner "by clicking ▶️" | [cc-qh L133-134] |
| Export | Not documented for the runner. The download controls ("Allow data downloads", and the `DownloadData` permission) list workbooks, Analytics Chat and published dashboards only | [cc-roles L31-38] |
| Audit | The Audit Log's event list has no SQL Runner or query-execution event | [cc-audit] |
| Credentials | Uses the deployment's configured data sources. Managing them, the test step included, is the "Manage secrets" permission | [cc-runner; cc-custom-roles L117] |

## 3. Apache Superset SQL Lab (6.1.0: docs, source and the live instance)

**The editor**
- A schema and table browser, table elements with columns, and a table preview. Frontend components: `SqlEditorLeftBar`, `TableElement`, `TablePreview` [ss-fe].
- Autocomplete of schemas, tables, columns and functions [ss-fe useKeywords.ts L185-229].
- Multiple tabs (`TabbedSqlEditors`), a query-limit dropdown whose steps go up to `SQL_MAX_ROW` [ss-fe QueryLimitSelect L51-60], and keyboard shortcuts.
- Tab state is kept on the server (`SQLLAB_BACKEND_PERSISTENCE` defaults to true [ss-config L769]). **Observed:** `GET /api/v1/sqllab/` returned the active tab, with its SQL and its latest query.

**Running a query**
- **Row limits** [ss-config L1304-1317]:
  - `DEFAULT_SQLLAB_LIMIT` is 1,000, `SQL_MAX_ROW` 100,000 and `DISPLAY_MAX_ROW` 10,000.
  - `apply_limit` rewrites each statement's LIMIT to limit + 1 [ss-sqllab L223-243], and the fetch takes limit + 1 rows [ss-sqllab L275-281].
  - **Observed:**
    - `LIMIT 10000` with the default dropdown ran as `LIMIT 1001`;
    - `count(*)` got `LIMIT 1001` appended;
    - a user `LIMIT 3` stayed, with `limitingFactor` `QUERY`;
    - a dropdown of 200,000 was capped at 100,000 (`LIMIT 100001`), and the 100,000 rows fetched were shown as 10,000 with `displayLimitReached: true`.
  - The UI explains which limit applied [ss-fe ResultSet L478-510].
- **Time limits:**
  - Synchronous queries: `SQLLAB_TIMEOUT` 30 s [ss-config L1439], applied with `utils.timeout` in the web process [ss-exec L118-128]. Whether the database statement is cancelled when it fires is UNVERIFIED.
  - Asynchronous queries: Celery with soft and hard limits of 21,600 s and 21,660 s [ss-sqllab L163-169; ss-config L1448].
  - Asynchronous runs need a results backend and workers. The docs say SQL Lab "will only run your queries asynchronously if you enable Asynchronous Query Execution" [ss-async L89-90].
  - **But** the server takes `runAsync` from the request, or from `SQLLAB_FORCE_RUN_ASYNC` [ss-ctx L80-82]. **Observed:** `runAsync: true` on `examples`, where `allow_run_async` is false, was queued and succeeded (query rows 14 and 15).
- **Cost estimation:**
  - The `ESTIMATE_QUERY_COST` feature flag is off by default, and also needs `cost_estimate_enabled` in the database's extra [ss-config L634-637; ss-model L236-244].
  - The estimate command checks only access to the database [ss-estimate L59-70]. **Observed:** `POST /api/v1/sqllab/estimate/` returned `{"Total cost":"1537.91"}` with neither setting on.
- **Stop and cancel:**
  - The UI shows "Stop" while a query runs [ss-fe RunQueryActionButton L55-76].
  - On PostgreSQL, the backend's PID is stored with the query (observed `extra.cancel_query`) and later killed with `pg_terminate_backend(pid)` [ss-pg L748-777]. So any web worker can cancel it.
  - `QueryDAO.stop_query` finds the query by `client_id` alone and doesn't check its owner [ss-querydao L60-79].
- **Several statements:** all of them run, one block each [ss-sqllab L456-466], and only the last statement's rows come back. **Observed:** `SELECT 1 AS a; SELECT 2 AS b` returned `b = 2`.

**Guards on statements**
- **DML:**
  - `if parsed_script.has_mutation() and not database.allow_dml: raise SupersetDMLNotAllowedException()` [ss-sqllab L429-430].
  - `is_mutating` looks for sqlglot `Insert`, `Update`, `Delete`, `Merge`, `Create`, `Drop`, `TruncateTable` and `Alter` nodes, a PostgreSQL `DO` block, and `EXPLAIN ANALYZE` of a mutation [ss-parse L670-720].
  - `allow_dml` defaults to false [ss-model L167].
- **Observed with the 6.1.0 parser** (engine `postgresql`, no database contact):
  - **Flagged:** a CTE containing a DELETE, `EXPLAIN ANALYZE DELETE`, `DO $$…$$`, `BEGIN; DELETE…; COMMIT` and `MERGE`.
  - **Not flagged:**
    - `SELECT * INTO new_t FROM t`, which creates a table;
    - `COPY t FROM '/tmp/x'` and `COPY t TO PROGRAM 'id'`;
    - `GRANT ALL ON t TO public`;
    - `CALL do_things()` and `VACUUM t`;
    - `SET ROLE admin` and `SET TRANSACTION READ WRITE`;
    - `SELECT nextval('s')` and `SELECT my_volatile_fn()`;
    - `SELECT … FOR UPDATE`;
    - `REFRESH MATERIALIZED VIEW` and `COMMENT ON TABLE`.
  - `LOCK TABLE t` failed to parse.
  - By reading `sql_lab.py`, the statement checks are the disallowed functions, the disallowed tables and this DML check [L406-430]. So the unflagged statements would reach the database, whose grants then decide. Not executed here.
- **Disallowed functions:** `DISALLOWED_SQL_FUNCTIONS` lists, for PostgreSQL:
  - `version`, `current_user`, `current_setting`, `pg_read_file`, `pg_ls_dir`, `query_to_xml`, `pg_sleep` and `pg_terminate_backend`, among others;
  - and similar sets for MySQL, SQLite and SQL Server [ss-config L1735-1800].
  - **Observed:** `SELECT version()` was refused with "SQL statement contains disallowed function(s)" (row 17, status failed).
- **What the docs say:**
  - "Superset is Not a Database Firewall … cannot guarantee complete security against all database-level threats or advanced bypass techniques".
  - They recommend "**Least Privilege**: Connecting Superset using dedicated database user accounts with the minimum permissions required … (typically read-only access to necessary schemas/tables)", and database-level auditing [ss-sec L166-185].
- **CVEs about SQL Lab or SQL checks** [ss-cves]:
  - CVE-2026-23984, "SQLLab Read-Only Bypass on PostgreSQL (DML execution)" (< 6.0.0);
  - CVE-2024-55633, "SQLLab Improper readonly query validation allows unauthorized write access" (< 4.1.0);
  - CVE-2024-53947, "parse for specific postgres functions" (< 4.1.0);
  - CVE-2023-32672, "SQL parser edge case bypasses data access authorization" (< 2.1.1);
  - CVE-2024-39887 and CVE-2024-24773, improper SQL authorization;
  - CVE-2023-49736 (SQL injection in the `where_in` Jinja macro) and CVE-2023-27523 (Jinja templates and data permissions);
  - CVE-2023-39265 (unauthorized registration of SQLite database connections);
  - CVE-2024-53948, "Error verbosity exposes metadata".

**Permissions per database**
- The `sql_lab` role grants SQL Lab. Admins reach every database; Alpha and Gamma need access per database. Cost estimation and SQL formatting are separate permissions [ss-sec L42-52].
- **SQL Lab needs one of** [ss-secmgr L591-603, L2485-2530]:
  - `database_access` on the database (or all-database or all-datasource access);
  - or, table by table, catalog, schema or datasource permission. **Those tables come from parsing the SQL.**
  - The code's own comment: "Getting the default schema for a query is hard … there's no guarantee that the query actually will run in that schema" [ss-secmgr L2498-2504].
- **Database settings:**
  - `expose_in_sqllab`, `allow_run_async`, `allow_ctas`, `allow_cvas`, `allow_dml`, `force_ctas_schema`, `impersonate_user`, and the password in an encrypted column [ss-model L155-185].
  - `expose_in_sqllab` is read only by the bootstrap and database listings, not by the execute path (a grep of `superset/` finds it only in models, schemas, the database API and `sqllab/utils.py` [ss-utils L28-42]).
  - **Observed:**
    - `examples` has `allow_dml`, `allow_ctas` and `allow_cvas` off; `Northwind` has all three on.
    - Credentials come back masked (`XXXXXXXXXX`) from `GET /api/v1/database/{id}/connection`.
    - `examples` connects as the role `superset`, the same role name as Superset's own metadata database (`DB_USER` in the `superset-env` Secret). That is a shared role that isn't read-only, with the parser as its only guard.
- **CTAS and CVAS:** SQL Lab can write results into a table or view when they're allowed. Such runs skip the row limit when `SQLLAB_CTAS_NO_LIMIT` is set [ss-sqllab L203-243; ss-config L1489-1512].
- **Row-level security:** `RLS_IN_SQLLAB` is false by default: "Apply RLS rules to SQL Lab queries. Requires query parsing/manipulation. May break queries or allow RLS bypass. Use with care!" [ss-config L650-653; ss-sqllab L432-435].

**Results**
- A grid with the row count and the limit message; "Copy to Clipboard"; "Download to CSV" when the user has `can_export_csv`; and "Create chart" [ss-fe ResultSet L365-445; ExploreResultsButton L47].
- A chart needs the query saved as a virtual dataset first ("Save or Overwrite Dataset") [ss-fe SaveDatasetModal L409-497].
- **CSV export:** it reads the cached result from the results backend when there is one; otherwise it **runs the query again** against the database [ss-export L88-135]. **Observed:** `GET /api/v1/sqllab/export/<client_id>/` returned the 5-row CSV with a UTF-8 BOM (`CSV_EXPORT` is `utf-8-sig` [ss-config L1195]).

**History, saved queries and sharing**
- `/api/v1/query/` lists only the caller's own queries, unless they hold `all_query_access` [ss-qfilter L27-37; ss-secmgr L563-570]. Each row keeps `sql`, `executed_sql` (the rendered and limited SQL), the user, the database, the start and end times, the row count, `limiting_factor` and `sql_tables` (observed).
- Saved queries have their own API (none on this instance). The share link goes through `/api/v1/sqllab/permalink` [ss-fe ShareSqlLabQuery L49].

**Templating**
- Jinja is off by default and needs `ENABLE_TEMPLATE_PROCESSING` [ss-config L741]; it is on in this instance's config.
- The docs warn: "this feature executes template code on the server … can be exploited as a Server-Side Template Injection (SSTI) vulnerability" when untrusted users can edit [ss-tmpl L16-23].
- **Observed:** `'{{ current_username() }}'` rendered as `admin`, and a `templateParams` value was substituted.

**Audit**
- Every execute, estimate, export and history read is written to the action log, with the full SQL text in its JSON (observed in `/api/v1/log/`).
- The query table keeps the SQL per user. `QUERY_LOGGER` is a hook for external logging [ss-config L1298; ss-sqllab L254-263].

## 4. Feature comparison

| Area | Cube Cloud SQL Runner | Superset SQL Lab 6.1.0 | What wechart should do | Why |
|---|---|---|---|---|
| Target | The data source, or Cube Store [cc-runner] | Any registered database with SQL Lab access [ss-secmgr L591-603] | A data source landed in xcube, run by xcube on that connection's driver. Cube Store is Q3 | AD 7: only xcube opens secrets [req L468-473] |
| Credential | The deployment's data source [cc-runner] | The connection's stored credential, encrypted and masked; optional impersonation [ss-model L155-185] | Never leaves xcube; only rows and redacted errors come back. Which credential is Q2 | The connection's own role may have to write (§5 S2) |
| Who | Admin and Developer [cc-roles L17] | `sql_lab` plus database access [ss-sec L42-52] | Q1 | Raw SQL bypasses the folder gate and model policies (§5 S3) |
| Read-only | "Enable DDL operations" switch; DML handling UNVERIFIED [cc-sf-semviews] | Parser plus `allow_dml`, which leaks (§3); the docs defer to database grants [ss-sec L166-185] | The database grant is the boundary; a per-driver read-only session and one statement per run on top; parsing only for UX | Parsing leaked in Superset's CVEs and in the 6.1.0 checks above; grants are enforced by the database |
| Several statements | Not documented | All run; the last one's rows are returned (observed) | One statement per run (Q4 covers BigQuery scripts) | A read-only transaction only holds when the user can't end it; one statement also makes the audit record exact (§5 S2) |
| Row cap | Not documented | Limit rewritten to N+1; 1,000 default, 100,000 maximum, 10,000 displayed [ss-config L1304-1317] | Take N+1 rows from the driver's stream and stop, without rewriting the SQL; say "limited to N". Values are Q5 | Rewriting needs a parser per dialect and changes the query (`count(*)` got a LIMIT, observed) |
| Time cap | Not documented | 30 s synchronous, 6 h asynchronous [ss-config L1439, L1448] | A server-side statement timeout per driver (§6), plus a wall clock in xcube. Values are Q5 | A timeout on the client leaves the statement running |
| Bytes and cost | Not documented | EXPLAIN estimate (gated only in the UI, observed); `SQLLAB_PAYLOAD_MAX_MB` [ss-config L1334] | A cap on response bytes in xcube; `maximumBytesBilled` on BigQuery [bq-disc] | Protects the Cube processes that serve dashboards, and warehouse spend |
| Cancel | Not documented | "Stop"; `pg_terminate_backend` by the stored PID; no owner check [ss-pg; ss-querydao] | The run's owner (or a Super-Admin) cancels by run id, reaching the instance that runs it (§5 S6) | Cube runs on 2 or more instances [req L527] |
| Async | Not documented | Celery plus a results backend; `allow_run_async` enforced only in the UI (observed) | Enforce every setting on the server, in xcube or wechart's API | Superset's UI-only gates are bypassable through its API (observed) |
| Result view | Row count and duration [cc-runner] | Grid, row count, limit message, copy, CSV, chart [ss-fe ResultSet] | Grid, row count, duration, truncation flag, column types | The same basics in both products |
| Schema browser | Schema Explorer [cc-runner] | Left bar plus autocomplete [ss-fe] | Reuse xcube's introspection routes, as the model editor already does [xgw L733-805; wechart `packages/api/src/model/introspection.ts` L66] | Already built and scoped to the service credential |
| Export | Not documented | CSV, from the cache or by running the query again [ss-export L88-135] | Q6 | Exporting raw data is a data-exfiltration decision |
| History and saved queries | Not documented; ▶ from Query History [cc-qh] | History per user, saved queries, share links, tabs kept on the server | Q7 | Useful, but stored SQL can hold sensitive literals |
| Templating | None documented | Jinja, with an SSTI warning [ss-tmpl] | None | No requirement asks for it, and templating runs code on the server |
| To a chart | None | "Create chart" through a virtual dataset | Q10 (charts in wechart bind to cubes) | wechart charts query Cube, not raw SQL |
| Semantic policies | The docs don't say (UNVERIFIED) | RLS off in SQL Lab by default [ss-config L650-653] | Show plainly that the runner bypasses folder groups and access policies | Users must not assume dashboard security applies |
| Audit | No runner event [cc-audit] | Action log plus query table, with SQL text | An AC-294-style event for each run (§5 S7); its content is Q8 | wechart's audit covers data-source changes [spec AC-294] |
| Debugging generated SQL | ▶ from Query History [cc-qh] | n/a | Q10: open "View SQL" in the runner | Mirrors Cube's own debugging flow |

## 5. The safety model: options and trade-offs

Decided on correctness, security and user value only.

### S1. Where it runs
- **It has to be xcube.** wechart stores only sealed envelopes and can never decrypt them [req L468-473]. The same constraint put the connection test in xcube [req L599; x6 "POST …/connections/test"].
- **Only wechart's server calls xcube** [req L526]. So the xcube route sits under admin auth (the service credential) [x6 "API surface"], and wechart's API decides who may call it and writes the audit record.

### S2. How read-only is enforced

| Option | What it is | Correctness and security | User value |
|---|---|---|---|
| **A. Parsing** (Superset) | Classify the statement and refuse writes | **Weak.** It missed the 10 statement types listed in §3 in 6.1.0 and has three read-only or parser CVEs [ss-cves]. Superset's own docs say not to rely on it [ss-sec L166-185]. It can't see what a function does (`nextval`, a volatile function). The dialect is per driver | Early, clear refusals |
| **B. Read-only transaction or session per driver** | Wrap the statement in `BEGIN READ ONLY` or its equivalent, one statement per run | **Partial and uneven** (§6). PostgreSQL blocks the listed writes, but it is "a high-level notion of read-only that does not prevent all writes to disk" [pg-settx]. MySQL still lets temporary tables change [my-commit]. On Oracle, DDL "implicitly commits the current transaction before and after" [ora-settx]. **Snowflake, SQL Server and Dremio have none in the sources read.** The wrapper only holds if the user can't send `COMMIT; …`: PostgreSQL's simple protocol runs several statements in one message [pg-proto], and Cube's PostgreSQL path uses it [cube-pg L427-442; pg-q L35-57] | Invisible to users |
| **C. A read-only credential per data source** | A second login or role, sealed like the first, holding only SELECT (and catalog) grants, used only by the runner | **Strongest, and the same on all eight drivers:** the database enforces it (BigQuery dataViewer plus jobUser [bq-iam]; Dremio SELECT-only [dr-priv]). It also stops the runner inheriting write grants the serving credential may need (original_sql pre-aggregations persist in the source [cc-origsql]). And it keeps the runner out of pg_stat_activity views of Cube's own sessions, which ordinary users see only for roles they belong to [pg-stats] | A DBA provisions it; the runner is off for a source until it exists |
| **D. Require the existing connection's role to be read-only** | Run on the serving credential; document that it must be read-only | **Can't be checked,** and it may be wrong by design (original_sql pre-aggregations write to the source [cc-origsql]). Cube's `readOnly()` is not a database guard: it only picks the pre-aggregation refresh strategy [cube-pal L476-488] | Nothing extra to set up |
| **E. Layered (recommended)** | C as the boundary, plus B where the driver has it, plus one statement per run, plus a dedicated connection, plus A only as a pre-check with a friendly message | Covers the gaps that A, B and D leave alone | Clear errors early; the database backs every refusal |

**Why E.** A (parsing) and D (trusting the serving role) both fail open on inputs the checks above found. B isn't available on three of the eight drivers. Only C is enforced by each database, and the others reduce what a mis-granted credential can do.

### S3. Who may run it, and what it bypasses
- **The runner bypasses every Cube-side control.** It calls the driver directly, so neither the folder gate (an access policy added in xcube's `CompilerApi` subclass [xgate L47-67]) nor authored row-level policies apply. Superset has the same property for its RLS [ss-config L650-653].
- **Anyone who may run SQL on a connection reads everything its credential can reach, whatever the folder groups.**
- **The visibility rules make this matter.** A folder's read-write members see the data sources in every **ancestor** folder, view-only [req §P2.2 L415-417]. If "can see the data source" meant "can run SQL on it", an admin of `/A/B` could read everything behind the root's `default`.
- **Security off:** single-user mode [req L457]. Whether the runner is offered there is Q12.

### S4. Which connections, and where the secret binds
- **A sealed secret is bound only to its driver's target keys** [x6; xdrv]:
  - PostgreSQL and Redshift: `host` and `port` plus TLS, so **not** `user` or `database` [xdrv L89-124];
  - Snowflake: `account`, `region` and `warehouse`, so **not** `role`, `database` or `username` [xdrv L146-157].
- **A workspace copy keeps its original's envelopes byte for byte** and can change non-target fields [req L603-606]. A runner allowed on workspace copies could therefore run the stored credential against another database on the same PostgreSQL host, or under another Snowflake role. Snowflake's `USE ROLE` already reaches any role granted to the user [sf-userole], so the database grants decide either way.
- **The route should take a connection name, never fields.** xcube's test route accepts caller `fields` plus `sealed` [x6 "POST …/connections/test"], and a runner must not copy that shape. Whether workspace or proposal data sources are allowed is Q3.

### S5. Hygiene of the connection itself ("injecting the connection")
- **A dedicated, throwaway driver, never Cube's serving pool.** Session state persists on a pooled connection:
  - `SET ROLE` lasts for the session [pg-setrole];
  - Cube's PostgreSQL driver re-applies only the time zone and `statement_timeout` on each acquire [cube-pg L343-348].
  - xcube already builds drivers with `maxPoolSize` and releases them after a test [xconn L314-335, L384-396, L598-640].
- **No per-request connection fields** (S4), and no file-path fields. File-reading options were already flagged for the test route [research connection-testing.md "Gotchas"].
- **Schema selection:**
  - either don't offer it (users write qualified names), or pass it as a quoted identifier through the driver, never by string interpolation.
  - Superset's own comment admits the chosen schema isn't guaranteed to hold [ss-secmgr L2498-2504].
- **Redact errors** with xcube's existing `redact`, which covers raw, JSON, URL and base64 forms and cuts errors to 2,000 characters [xconn L68-76; x6].
- **Client-side file reads:**
  - mysql2 refuses `LOAD DATA LOCAL INFILE` unless `infileStreamFactory` is set, and Cube doesn't set it [mysql2-query L153-161], so the Cube pod's files (xcube's credential keys among them) can't be read that way. The image's mysql2 version is UNVERIFIED; the fork's `node_modules` has 3.24.4.
  - Other server-side escape hatches depend on the credential's grants: `COPY … TO PROGRAM` on PostgreSQL, EXPORT_DATA on BigQuery [bq-disc], Dremio CTAS [dr-cmds]. That is another reason for C.

### S6. Limits
- **Rows:** read N+1 rows from `stream()` and stop.
  - Six of the eight drivers implement `stream()`: PostgreSQL [cube-pg L369-392], Redshift [cube-rs L323], MySQL [cube-my L331], Snowflake [cube-sf L862], BigQuery [cube-bq L335] and SQL Server [cube-ms L181].
  - **Oracle's driver has no stream and sets a process-wide `maxRows` of 100,000** [cube-ora L78-82].
  - **Dremio's `query()` fetches every result page** [cube-dr L196-230].
  - xcube would need its own paths for those two.
- **Time:** use the driver's server-side knob (§6), capped by a wall clock in xcube.
  - Cube's default `CUBEJS_DB_QUERY_TIMEOUT` is 10 minutes [cube-env L740-750], applied as PostgreSQL's `statement_timeout` [cube-pg L343-348] and Snowflake's `STATEMENT_TIMEOUT_IN_SECONDS` [cube-sf L484-497].
- **Bytes:** cap the serialized response in xcube. On BigQuery, `maximumBytesBilled` makes over-limit queries "fail (without incurring a charge)" [bq-disc].
- **Cancel:** by run id, from the run's owner or a Super-Admin (Superset has no owner check [ss-querydao L60-79]).
  - Cube runs on 2 or more instances [req L527], so the cancel must reach the right process. xcube already has a LISTEN/NOTIFY channel between instances [xrev L495; xlisten L136], and some databases cancel by id (Superset's PostgreSQL PID [ss-pg L748-777]; Snowflake statement cancel [cube-sf L975-1013]).
  - This is a design option, not an existing route.
- **Concurrency:** a cap per user and per source protects the Cube instances that serve dashboards. The caps' values are the user's call (Q5).

### S7. Audit (AC-294 style)
- AC-294 records sign-ins, permission changes, proposals, approvals, restores, data-source changes and builds, with who, what, which folder and when [spec L1111-1112]. Super-Admins browse it [spec L1113], and retention is one year by default [spec L1115].
- **A runner event** would add the data source, its folder, the outcome, the row count, whether it was truncated, and the duration. **Whether to keep the SQL text is Q8:**
  - Superset keeps it in full (observed);
  - Cube Cloud records no runner event [cc-audit];
  - Cube redacts SQL literals from its own logs in production [research supporting-utilities.md L54].

### S8. Secrets never shown
- xcube never returns plaintext or envelopes [x6 "PUT", "rewrap"].
- The runner's results can still hold database-side secrets that the credential can read, for example other sessions' SQL in pg_stat_activity for the same role [pg-stats]. That is another reason for a separate role (C).

## 6. The eight drivers: what Cube 1.7.45 and each database offer

| Driver | Statements per call on Cube's path | Read-only session mode | Classification on the server | Timeout Cube sets today | Streams rows in Cube |
|---|---|---|---|---|---|
| PostgreSQL | **Several.** `values: []` means pg uses the simple protocol, which runs several statements in one implicit transaction [cube-pg L427-442; pg-q L35-57; pg-proto]. `queryMode: 'extended'` forces one ("cannot include more than one SQL statement") [pg-q L36-38; pg-proto] | `SET TRANSACTION READ ONLY` / `BEGIN READ ONLY`; doesn't "prevent all writes to disk" [pg-settx] | None | `statement_timeout`, 10 min default [cube-pg L343-348; cube-env L740-750] | Yes [cube-pg L369-392] |
| Redshift | Same as PostgreSQL: `RedshiftDriver extends PostgresDriver` [cube-rs L57] | `BEGIN … READ ONLY` "Gives the transaction read-only permissions" [rs-begin]; what it blocks is UNVERIFIED | None | Inherits the PostgreSQL path; whether Redshift honours it is UNVERIFIED | Yes [cube-rs L323] |
| MySQL | **One.** mysql2's `multipleStatements` defaults to false [mysql2-cfg L150], and Cube doesn't set it | `START TRANSACTION READ ONLY` prevents changing or locking tables visible to other transactions; temporary tables can still change [my-commit] | None | None in Cube's driver (pool timeouts only) [cube-my L191-194]. `MAX_EXECUTION_TIME` covers only read-only SELECT [my-hints] | Yes [cube-my L331] |
| Snowflake | **One:** "By default, Snowflake returns an error for queries issued with multiple statements" [sf-node] | None in the sources read (UNVERIFIED) | None | `STATEMENT_TIMEOUT_IN_SECONDS` [cube-sf L484-497] | Yes [cube-sf L862]; cancel [cube-sf L975-1013] |
| BigQuery | **Scripts allowed** (statement type `SCRIPT`) [bq-disc] | None (IAM) [bq-iam] | **A dry run** returns `statementType` (SELECT, INSERT, …, EXPORT_DATA, SCRIPT) without running the query [bq-disc] | Cube's poll timeout [cube-bq L140-146]; `jobTimeoutMs` "attempts to stop the job" [bq-disc] | Yes [cube-bq L335] |
| SQL Server | **Batches:** `sp_executesql` takes "a Transact-SQL statement or batch" [ms-spexec]; Cube calls `request.query` [cube-ms L301-307] | None. `ApplicationIntent=ReadOnly` only routes to a readable secondary, and can fall back to the primary [ms-ror] | None | `requestTimeout` = the query timeout × 1000 [cube-ms L127] | Yes [cube-ms L181] |
| Oracle | One per execute; PL/SQL blocks are UNVERIFIED | `SET TRANSACTION READ ONLY`: only SELECT (without FOR UPDATE), LOCK TABLE, SET ROLE, ALTER SESSION and ALTER SYSTEM; not for SYS; DDL implicitly commits [ora-settx] | None | None in Cube's driver. `callTimeout` limits each round trip [ora-conn]; Thin mode is UNVERIFIED | **No**; `maxRows` 100,000 for the process [cube-ora L78-82] |
| Dremio | UNVERIFIED | None. Read-only means SELECT-only privileges [dr-priv]; DDL and DML commands exist (CREATE TABLE, CTAS, ALTER, GRANT) [dr-cmds] | None | Poll timeout [cube-dr L82-85, L218-241] | **No**; fetches every page [cube-dr L196-230] |

## 7. What xcube and Cube carry today, and what would be built

**What already exists**
- **Stored connections per model,** opened only in xcube: PUT, GET and DELETE routes, health, and the test route [xroutes L617-655; x6].
- **Throwaway drivers:** `create(connection, { maxPoolSize })` calls `CubejsServerCore.createDriver` [xconn L314-335], and connecting has a 30-second timeout [xconn L384-396].
- **The connection test** runs secrets, config, connect and schemas as checks [xconn L598-640].
- **Redaction of secrets** in errors [xconn L68-76].
- **Schema browsing:** `/v1/introspection/data-sources/:ds/{schemas,tables,columns}`, only for the service credential's scopes [xgw L137-143, L733-805]. wechart already calls it [`packages/api/src/model/introspection.ts` L66; research cube/introspection-api.md].
- **Cube's driver API:** `query(sql, params, options)` [cube-di L252], `stream()` on six drivers, and `downloadQueryResults` [cube-bd L299-307].
- **A channel between instances** (pg_notify / LISTEN) [xrev L495; xlisten L136].

**What doesn't carry a raw runner**
- `/v1/sql` returns the SQL Cube generates for a semantic query and runs nothing [research cube/data-apis.md L127]. With security on, the folder gate answers it with 403 [research xcube-bc18f82c01.md].
- `/v1/cubesql` runs SQL-API queries **over cubes** [research cube/data-apis.md L131], not raw tables. Whether xcube's folder gate covers it is UNVERIFIED: the gate is a `CompilerApi` subclass [xgate L47-67], and nobody has tested it.
- A driver's `readOnly()` flag, as §5 S2 explains [cube-pal L476-488].

**What would be built (a sketch for the Cube-expert agent, not a contract)**
- **An xcube admin route,** for example `POST …/models/{model}/connections/{name}/sql`:
  - request `{ sql, maxRows, timeoutMs, maxBytes, runId }`;
  - answer: column names and types, rows, `truncated`, `durationMs`, and a redacted error.
- **Per run,** it would:
  - build a dedicated driver from the stored connection, or from its runner credential (Q2);
  - apply the driver's read-only prologue and timeout (§6), and force one statement (PostgreSQL extended protocol; a BigQuery dry run first);
  - read the stream up to N+1 rows or the byte cap;
  - release the driver.
- **A cancel route by `runId`,** fanned out to every instance.
- **Per the standing process,** it is asked of xcube through `~/Work/xcube-exchange/to-xcube/` and the Cube-expert agent [req L562]. wechart builds against a published image.

## 8. Open questions for the user

1. **Who may run SQL on a data source?**
   - (a) Super-Admins only.
   - (b) Super-Admins and the read-write members of the data source's **own** folder; not members who see it only as an ancestor.
   - (c) As (b), but only for data sources a Super-Admin has switched the runner on for (off by default).
   - (d) As (c), plus a deployment-wide switch.
2. **Which credential runs it?**
   - (a) A separate read-only credential per data source, sealed like the first, with the runner off until it is set.
   - (b) The serving credential, with the admin attesting that it is read-only.
   - (c) The serving credential plus the read-only session where the driver has one, and no runner on Snowflake, SQL Server and Dremio.
3. **What can it target?**
   - (a) Published (landed) data sources only.
   - (b) Also data sources in the user's own workspace.
   - (c) Also Cube Store, read-only, to inspect rollups as Cube Cloud allows.
   - (d) (a) and (c).
4. **Which statements run?**
   - (a) Anything the credential permits, one statement at a time; the database decides.
   - (b) SELECT-class statements only, pre-checked by parsing, with the database backing it.
   - (c) As (a), plus BigQuery scripts where the dry run classifies every statement as SELECT.
   - (d) As (b), plus `EXPLAIN` (without ANALYZE).
5. **The caps.**
   - Row cap: Superset uses 1,000 by default and 100,000 at most (§3); or a setting per data source; or a deployment setting.
   - Time cap: Superset's 30 s synchronous, Cube's 10-minute `CUBEJS_DB_QUERY_TIMEOUT`, or a deployment setting.
   - Bytes and concurrency: a deployment setting or a per-source setting.
   - Each value is the user's call.
6. **Export and copy of results.**
   - (a) Neither.
   - (b) Copy to the clipboard only.
   - (c) CSV up to the row cap.
   - (d) CSV governed by a separate permission, as Cube Cloud's `DownloadData`.
7. **History and saved queries.**
   - (a) None.
   - (b) A per-user history of the user's own runs, kept in wechart.
   - (c) As (b), plus named saved queries in the workspace.
   - (d) As (c), plus sharing with the folder's read-write members.
8. **What the audit record keeps.**
   - (a) The event only: who, which data source and folder, when, outcome, rows and duration.
   - (b) As (a), plus the full SQL text.
   - (c) As (a), plus the SQL with its literals redacted.
   - (d) As (a), plus a hash of the SQL.
9. **A semantic-SQL runner as well** (`/v1/cubesql`, where access policies apply).
   - (a) No.
   - (b) Yes, for anyone who can build charts.
   - (c) Later, as a separate item.
10. **From results to the model.**
    - (a) Nothing.
    - (b) "Create cube from this query", made in My workspace and landing through a proposal.
    - (c) "Open in SQL runner" from a chart's "View SQL", on its bound data source.
    - (d) Both (b) and (c).
11. **Where it lives in the UI.**
    - (a) A tab on each data source in the Data sources workspace.
    - (b) A workspace of its own in the top bar.
    - (c) Inside the model editor, beside the schema browser.
12. **With security off (single-user mode).**
    - (a) Offered to the single user.
    - (b) Off.
    - (c) Off unless a deployment setting turns it on.

## Sources

**Cube Cloud** (docs.cube.dev; MDX files in cube-js/cube `master` at 935e0948104476631bbe15aa787065aa7ee45ba2)
- [cc-runner] https://docs.cube.dev/docs/data-modeling/sql-runner (source: https://github.com/cube-js/cube/blob/935e0948104476631bbe15aa787065aa7ee45ba2/docs-mintlify/docs/data-modeling/sql-runner.mdx)
- [cc-roles] https://docs.cube.dev/admin/users-and-permissions/roles-and-permissions (L17, L31-38)
- [cc-custom-roles] https://docs.cube.dev/admin/users-and-permissions/custom-roles (L117, L248-261)
- [cc-api] https://github.com/cube-js/cube/blob/935e0948104476631bbe15aa787065aa7ee45ba2/docs-mintlify/api-reference/api.yaml#L12048
- [cc-changelog] https://docs.cube.dev/api-reference/changelog (v0.14.0, 2026-09-23)
- [cc-sf-semviews] https://docs.cube.dev/docs/integrations/snowflake-semantic-views
- [cc-cubestore-sql] https://docs.cube.dev/reference/cubestore/sql-commands
- [cc-qh] https://docs.cube.dev/admin/monitoring/query-history (L133-134)
- [cc-audit] https://docs.cube.dev/admin/monitoring/audit-log
- [cc-origsql] https://docs.cube.dev/reference/data-modeling/pre-aggregations ("`original_sql`": "persists the results … in the data source")

**Superset** (tag 6.1.0; the lines match the running pod)
- [ss-sec] https://github.com/apache/superset/blob/6.1.0/docs/admin_docs/security/security.mdx (L42-52, L166-185, L215-226)
- [ss-cves] https://github.com/apache/superset/blob/6.1.0/docs/admin_docs/security/cves.mdx
- [ss-tmpl] https://github.com/apache/superset/blob/6.1.0/docs/admin_docs/configuration/sql-templating.mdx#L16-L23
- [ss-async] https://github.com/apache/superset/blob/6.1.0/docs/admin_docs/configuration/async-queries-celery.mdx#L89-L90
- [ss-config] https://github.com/apache/superset/blob/6.1.0/superset/config.py (L634-653, L741, L769-773, L1195, L1298-1334, L1439-1512, L1735-1800)
- [ss-sqllab] https://github.com/apache/superset/blob/6.1.0/superset/sql_lab.py (L163-169, L203-281, L406-466)
- [ss-parse] https://github.com/apache/superset/blob/6.1.0/superset/sql/parse.py#L670-L720
- [ss-model] https://github.com/apache/superset/blob/6.1.0/superset/models/core.py#L155-L185 and #L236-L244
- [ss-secmgr] https://github.com/apache/superset/blob/6.1.0/superset/security/manager.py (L563-570, L591-603, L2485-2530)
- [ss-ctx] https://github.com/apache/superset/blob/6.1.0/superset/sqllab/sqllab_execution_context.py#L80-L82
- [ss-exec] https://github.com/apache/superset/blob/6.1.0/superset/sqllab/sql_json_executer.py#L118-L128
- [ss-utils] https://github.com/apache/superset/blob/6.1.0/superset/sqllab/utils.py#L28-L42
- [ss-export] https://github.com/apache/superset/blob/6.1.0/superset/commands/sql_lab/export.py#L88-L135
- [ss-estimate] https://github.com/apache/superset/blob/6.1.0/superset/commands/sql_lab/estimate.py#L59-L70
- [ss-querydao] https://github.com/apache/superset/blob/6.1.0/superset/daos/query.py#L60-L79
- [ss-qfilter] https://github.com/apache/superset/blob/6.1.0/superset/queries/filters.py#L27-L37
- [ss-pg] https://github.com/apache/superset/blob/6.1.0/superset/db_engine_specs/postgres.py#L748-L777
- [ss-fe] https://github.com/apache/superset/tree/6.1.0/superset-frontend/src/SqlLab/components (ResultSet, ExploreResultsButton, SaveDatasetModal, RunQueryActionButton, QueryLimitSelect, ShareSqlLabQuery, EditorWrapper/useKeywords.ts)
- **Live instance,** 2026-09-30, `local/superset:6.1.0-pg`: `/api/v1/database/`, `/api/v1/sqllab/`, `/api/v1/sqllab/execute/` (query rows 8–17), `/api/v1/sqllab/export/…`, `/api/v1/sqllab/estimate/`, `/api/v1/query/`, `/api/v1/saved_query/` and `/api/v1/log/`; parser checks in the pod.

**Cube 1.7.45 drivers** (https://github.com/cube-js/cube/blob/v1.7.45/packages/…)
- [cube-di] cubejs-base-driver/src/driver.interface.ts#L252
- [cube-bd] cubejs-base-driver/src/BaseDriver.ts#L290-L311
- [cube-pal] cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L476-L488
- [cube-pg] cubejs-postgres-driver/src/PostgresDriver.ts (L225-232, L343-348, L369-392, L427-456)
- [cube-rs] cubejs-redshift-driver/src/RedshiftDriver.ts (L57, L323)
- [cube-my] cubejs-mysql-driver/src/MySqlDriver.ts (L191-194, L331)
- [cube-sf] cubejs-snowflake-driver/src/SnowflakeDriver.ts (L484-497, L862, L975-1013)
- [cube-bq] cubejs-bigquery-driver/src/BigQueryDriver.ts (L140-146, L335)
- [cube-ms] cubejs-mssql-driver/src/MSSqlDriver.ts (L127, L181, L301-307)
- [cube-ora] cubejs-oracle-driver/driver/OracleDriver.js#L78-L82
- [cube-dr] cubejs-dremio-driver/driver/DremioDriver.js (L82-85, L196-241)
- [cube-env] cubejs-backend-shared/src/env.ts#L740-L750

**Client libraries**
- [pg-q] https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg/lib/query.js#L35-L57 (pg 8.23.0 in xcube's node_modules)
- [mysql2-cfg] https://github.com/sidorares/node-mysql2/blob/v3.24.4/lib/connection_config.js#L150
- [mysql2-query] https://github.com/sidorares/node-mysql2/blob/v3.24.4/lib/commands/query.js#L153-L161 (3.24.4 in the fork's node_modules; the image's version is UNVERIFIED)

**xcube** (https://github.com/senthilkrajagopal/cube/blob/5a237aedf89190ff5a783f44c217007bc0f745ba/xcube/src/…)
- [xgw] gateway.ts (L137-143, L733-805)
- [xconn] connections/connections.ts (L68-76, L314-335, L384-396, L598-640)
- [xdrv] connections/drivers.ts (L89-124, L146-157)
- [xroutes] admin/routes.ts#L617-L655
- [xgate] security/gate.ts#L47-L67
- [xrev] store/revisions.ts#L495
- [xlisten] runtime/listener.ts#L136

**Databases**
- [pg-settx] https://www.postgresql.org/docs/current/sql-set-transaction.html
- [pg-proto] https://www.postgresql.org/docs/current/protocol-flow.html
- [pg-setrole] https://www.postgresql.org/docs/current/sql-set-role.html
- [pg-stats] https://www.postgresql.org/docs/current/monitoring-stats.html
- [rs-begin] https://docs.aws.amazon.com/redshift/latest/dg/r_BEGIN.html
- [my-commit] https://dev.mysql.com/doc/refman/8.4/en/commit.html
- [my-hints] https://dev.mysql.com/doc/refman/8.4/en/optimizer-hints.html
- [sf-node] https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-execute
- [sf-userole] https://docs.snowflake.com/en/sql-reference/sql/use-role
- [bq-disc] https://bigquery.googleapis.com/discovery/v1/apis/bigquery/v2/rest (revision 20260922: `JobStatistics2.statementType`, `JobConfiguration.dryRun` and `jobTimeoutMs`, `QueryRequest.dryRun`, `maximumBytesBilled`, `timeoutMs` and `maxResults`)
- [bq-iam] https://docs.cloud.google.com/bigquery/docs/access-control
- [ms-spexec] https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql
- [ms-ror] https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/configure-read-only-routing-for-an-availability-group-sql-server
- [ora-settx] https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/SET-TRANSACTION.html
- [ora-conn] https://node-oracledb.readthedocs.io/en/latest/api_manual/connection.html
- [dr-priv] https://docs.dremio.com/current/security/rbac/privileges/
- [dr-cmds] https://docs.dremio.com/current/reference/sql/commands/

**wechart**
- [req] docs/requirements.md (L177, L406-434, L457, L468-476, L526-527, L562, L591-607)
- [spec] docs/spec.md (AC-294–AC-296, L1111-1116)
- [x6] docs/research/xcube-slice-6.md
- docs/research/connection-testing.md, docs/research/cube/introspection-api.md, docs/research/cube/data-apis.md, docs/research/xcube-bc18f82c01.md, docs/research/supporting-utilities.md, docs/research/cube-capabilities.md
