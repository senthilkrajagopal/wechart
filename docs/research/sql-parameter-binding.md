---
library: Bound SQL parameters for wechart's SQL runner (xcube's run route on Cube 1.7.45 drivers, Cube Store, Cube's SQL API) and finding `{{name}}` with @codemirror/lang-sql
packages: ["@codemirror/lang-sql", "@lezer/common"]
# Only these two would be imported by wechart, to find `{{name}}` in the browser (and on the server if wanted). The database client libraries run inside xcube's image; wechart never imports them.
version: '@codemirror/lang-sql 6.10.0; @lezer/common 1.5.2; Cube 1.7.45 (drivers, api-gateway, backend-native, cubestore); xcube feat/xcube 407622a6b8 (image xcube:v1.7.45-407622a6b8, the one compose and Helm pin)'
researched: 2026-10-17
sources: [https://github.com/cube-js/cube/tree/v1.7.45/packages, https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/sql/parser.rs, https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts, https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-native/src/node_export.rs, https://node-postgres.com/features/queries, https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements, https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-execute, https://docs.cloud.google.com/bigquery/docs/parameterized-queries, https://github.com/tediousjs/node-mssql/blob/v11.0.1/README.md, https://node-oracledb.readthedocs.io/en/latest/user_guide/bind.html, https://docs.dremio.com/current/reference/api/sql/, https://registry.npmjs.org/@codemirror/lang-sql/latest]
---
# Bound SQL parameters for the SQL runner (Cube 1.7.45, xcube 407622a6b8)

## Summary

This doc covers F42's typed parameters: AC-453 (finding `{{name}}`), AC-454 (sending values bound, never as text) and AC-482 (parameters on Cube Store and in the "Cube" group only where binding is shown to work). It also covers the run path for the "Cube" group (AC-467, AC-481). Each finding names its source.

**Findings:**
1. **xcube's runner does not use Cube's driver `query(sql, values)`.** For each database it opens its own session on the client library underneath the driver. Every session sends no values today: `new Cursor(sql, [], …)`, `conn.query({ sql, … })`, `conn.execute({ sqlText, … })` with no `binds`, `createQueryJob({ query })`, `request.query(sql)`, `conn.execute(sql, [], …)`, `driver.executeQuery(sql)` and `driver.query(sql, [])` ([x-runner] L195–696).
2. **xcube's run route rejects a values array today.** `sqlSchema` is a Joi object with exactly `sql`, `runId`, `maxRows`, `timeoutMs`, `maxBytes` and `maxBytesBilled` ([x-routes] L195–206). It is validated with no `allowUnknown` option, and a failure answers `400 bad_request` ([x-routes] L249–255). So xcube needs a change before AC-454 can be met anywhere (see "The xcube change").
3. **"Cube's driver takes a values array" does not mean it binds them.** This corrects the design study's build note ([design] L434).
   - **Bound by the database:** PostgreSQL, Redshift, Snowflake, BigQuery, SQL Server and Oracle.
   - **MySQL:** Cube's `query()` binds through `conn.execute`, but its stream and download paths call mysql2 `conn.query(sql, values)`, and that substitutes the values into the text on the client ([my-drv]; [mysql2-conn]).
   - **Dremio:** Cube's driver writes the values into the SQL text with `formatAnsi`, and Dremio's REST `/api/v3/sql` has no field for values ([dr-drv]; [escape]; [dremio-sql]).
   - **Cube Store:** Cube's driver formats values into the text with `sqlstring` unless `sendParameters` is set ([cs-drv]). When the values are sent, Cube Store's parser uses them only in its own commands (CACHE, QUEUE, identifiers, integers), never in a SELECT ([cs-parser]).
4. **Cube Store: no binding for a SELECT.** By AC-482, Run is held when a `{{name}}` is present.
5. **Cube's `/v1/cubesql`: no binding.** Its request schema is exactly `{ query, timezone, cache, throwContinueWait }` ([gwq]), and the native `execSql` takes no values ([native]). The Postgres-wire SQL API does bind, but it signs in through `checkSqlAuth` with a user name and password, not the user's JWT, and xcube says to keep that port off ([sqlsrv] L145–165; [x-readme] L369–371). By AC-482, Run is held in the "Cube" group.
6. **Dremio is a spec gap.** AC-454 can't be met on Dremio through xcube as built, and AC-482 doesn't name Dremio. This needs a decision (Open questions, item 1).
7. **lang-sql 6.10.0 can find `{{name}}` well enough to list parameters (AC-453), but not to decide the rewrite.**
   - Its tokenizer gives strings, comments and quoted names their own nodes ([lang-sql-js] L184–351).
   - Its built-in dialects differ from the databases in ways that matter. For example, its MySQL dialect has no backslash escapes, while the run's MySQL session does read backslashes ([lang-sql-js] L742–754; [x-runner] L283–286).
   - The rewrite should use xcube's own dialect lexer, which the read-only check already trusts ([x-classify] L1–15).

## Install

```
# web (already installed and pinned, docs/research/code-editor.md)
pnpm --filter @wechart/web add @codemirror/lang-sql@6.10.0
# only if packages/api also finds parameters itself (Option A below)
pnpm --filter @wechart/api add @codemirror/lang-sql@6.10.0 @lezer/common@1.5.2
```

- **@codemirror/lang-sql 6.10.0** is the registry's latest. It depends on `@lezer/lr ^1.0.0`, `@lezer/common ^1.2.0`, `@lezer/highlight`, `@codemirror/state`, `@codemirror/language` and `@codemirror/autocomplete` ([lang-sql-npm]).
  - `packages/web/package.json` pins 6.10.0 (L15).
  - The store holds `@lezer/common` 1.5.2 and `@lezer/lr` 1.4.10 (`node_modules/.pnpm`).
- **Nothing to install for binding itself.** The client libraries run in xcube's image. Their versions:
  - In xcube's lockfile: `pg` 8.23.0, `pg-cursor` 2.22.0, `mysql2` 3.24.4, `mssql` 11.0.2 (`tedious` 18.6.2), `oracledb` 6.10.0 and `sqlstring` 2.3.3 (`~/Work/bi/cube/xcube/package-lock.json` L9658–11563).
  - In the fork's root `yarn.lock`: `snowflake-sdk` 3.3.0 and `@google-cloud/bigquery` 7.7.0 (L17879, L3224).
  - Which versions the image actually carries is UNVERIFIED (not read from the image).

## Init / auth pattern

**Data sources and Cube Store go through xcube.** wechart's server calls xcube's admin routes under the service credential, as it does today ([xcube-sql-runner.md](./xcube-sql-runner.md) "The routes"). Bound values need the xcube change below.

**The "Cube" group.** wechart's server calls Cube's `POST {base}/cubejs-api/v1/cubesql` itself, as the user:
- **Token:** the same per-user query token that `/v1/load` carries ([wechart-client] L9–49). `/v1/cubesql` needs the `data` scope ([tokens-and-service-credential.md](./cube/tokens-and-service-credential.md) L296).
- **Request:** the body is `{ query, timezone?, cache?, throwContinueWait? }`. Any other key, such as `params`, fails validation ([gwq]). Validation errors are thrown as `UserError("Invalid query format: …")` ([gw]).
- **Response:** NDJSON lines separated by `\n` ([native]; fork `node_export.rs` L211):
  1. The first line is `{ schema: [{ name, column_type, format? }], lastRefreshTime?, external?, usedPreAggregations? }` ([native]; [client-core] L138–168).
  2. Then one or more `{ data: [[…], …] }` lines, and `{ data: [] }` when there are no rows ([native]).
- **Errors** come back two ways:
  - **Before execution** (scope, validation, auth): `handleError` answers with JSON. A `UserError` gets `400 { type, error, … }`, and a `CubejsHandlerError` gets its own status ([gw]). Observed earlier: `{}` answered `400 {"error":"Invalid query format: \"query\" is required"}` ([api-scope-probes.md](./cube/api-scope-probes.md) L53).
  - **During execution:** the native side ends the stream with one more line, `{"error": "<message>", "requestId"?: "…"}` ([native]). That line arrives after the `Content-Type: application/json` and `Transfer-Encoding: chunked` headers have been sent ([gw]). The HTTP status in this case is UNVERIFIED (not observed). Treat a final `error` line as a failure whatever the status.
- **Stopping a run:** when the client disconnects, the native `tokio::select!` drops the query future (`ClientDisconnected`), and writes wait on backpressure ([native]). Whether that also stops the query on the data source is UNVERIFIED. So wechart enforces AC-481's 10,000 rows and 30 s by counting rows across the `data` lines and aborting the request (an `AbortController`) at 10,001 rows or 30 s.

```ts
// packages/api (sketch): the "Cube" group's run; no parameters (AC-482)
const res = await fetch(`${cubeBase}/cubejs-api/v1/cubesql`, {
  method: 'POST',
  headers: { Authorization: userToken, 'Content-Type': 'application/json', 'x-request-id': runId },
  body: JSON.stringify({ query: sql }),
  signal, // aborted at 30 s, or once 10,001 rows have been read
});
// read res.body line by line: `schema` first, then `data` lines, maybe a final `error`
```

## API surface we will use

### 1. The eight drivers: placeholders, values and binding

**How to read the table.** "Cube's placeholder" is the one Cube's SQL generator writes for each dialect:
- the base `ParamAllocator.paramPlaceHolder` returns `?` ([pal]);
- PostgreSQL overrides it with `$${i+1}`, and `RedshiftQuery extends PostgresQuery` ([pgq]; fork `RedshiftQuery.ts` L4);
- SQL Server overrides it with `@_${i+1}` ([msq]);
- Oracle's driver rewrites `?` to named binds `:cb_param_N` ([ora-drv]).

"xcube's session today" is what the SQL runner calls ([x-runner]).

| Driver | Cube's placeholder | Cube driver `query(sql, values)` | Client library: how values bind | Date | Boolean | xcube's session today |
|---|---|---|---|---|---|---|
| PostgreSQL | `$1` [pgq] | **Binds.** `conn.query({ text, values, types })`. Stream: `new QueryStream(query, values, …)`. Refuses ≥ 65,536 values [pg-drv] | pg sends the text unaltered and the values separately [pg-docs]. pg-cursor uses Parse, then Bind with `values` [pg-cursor] | `prepareValue`: a JS `Date` becomes `YYYY-MM-DDTHH:mm:ss.sss±hh:mm` in local time, or in UTC with `parseInputDatesAsUTC` [pg-utils]. An untyped parameter's type is "inferred from the context in which the parameter is first referenced" [pg-prepare] | `val.toString()`, so `'true'`/`'false'` [pg-utils] | `new Cursor(sql, [], …)` (L214), in `BEGIN READ ONLY` |
| Redshift | `$1` (extends PostgreSQL) | Same as PostgreSQL: `RedshiftDriver extends PostgresDriver` (fork `RedshiftDriver.ts` L57) | Same pg path. That Redshift accepts extended-protocol binds through pg-cursor is UNVERIFIED (not run) | as PostgreSQL | as PostgreSQL | as PostgreSQL |
| MySQL | `?` [pal] | **`query()` binds:** `conn.execute(query, values)`. **`stream()` and `downloadQueryResults()` don't:** `conn.query(query, values)` [my-drv] | `execute` is a server-side prepared statement [mysql2-ps]. `query` with values runs `SqlString.format(...)` on the client [mysql2-conn]. `execute` throws on `undefined` [mysql2-conn] | `Date` → `DATETIME` [mysql2-enc] | `TINY` (0/1) [mysql2-ps; mysql2-enc] | `conn.query({ sql, rowsAsArray, … })`, streaming `result` events (L307–321) |
| Snowflake | `?` [pal] | **Binds:** `execute({ sqlText, binds: values, … })`, the stream too [sf-drv] | `binds` with `?` or `:1` placeholders [sf-bind] | `buildBindsMap`: a `Date` is sent as `value.toJSON()`. Its bind type depends on the order of the type checks; whether a `Date` is typed `VARIANT` or `TEXT` is UNVERIFIED [sf-stmt] | `BOOLEAN` [sf-stmt] | `conn.execute({ sqlText, streamResult, rowMode, parameters: { MULTI_STATEMENT_COUNT: 1 }, … })` (L351–373) |
| BigQuery | `?` [pal] | **Binds:** `params: values, parameterMode: 'positional'`, no `types` [bq-drv] | `?` positional or `@name` named, "not both" [bq-params]. Inferred types: boolean → `BOOL`, integer → `INT64`, other number → `FLOAT64`, string → `STRING`, `BigQueryDate` → `DATE`. `null` needs `types` [bq-src] | A plain JS `Date` isn't in the inference list. Use `BigQuery.date()` or `types` [bq-src] | `BOOL` [bq-src] | dry run, then `createQueryJob({ query, … })` with no params (L402–413) |
| SQL Server | `@_1` [msq] | **Binds:** `request.input('_' + (i+1), v)`, then `request.query(query)`; the stream too [ms-drv] | `input(name, [type], value)`, referenced as `@name`. With no type: String → NVarChar, Number → **Int**, Boolean → Bit, Date → DateTime, Buffer → VarBinary [mssql-readme] | `DateTime` when no type is given [mssql-readme] | `Bit` [mssql-readme] | `transaction.request(); request.query(sql)` with no inputs (L457–486) |
| Oracle | `?`, which the driver rewrites to `:cb_param_N` [ora-drv] | **Binds:** `conn.execute(sql, binds)` with named binds; equal values share one bind name [ora-drv] | Bind by name (`:name` with an object) or by position (an array) [ora-bind] | "by default the bind `type` is equivalent to TIMESTAMP" [ora-bind]. The driver sets session NLS formats to `YYYY-MM-DD` [ora-drv] | `DB_TYPE_BOOLEAN` is "PL/SQL BOOLEAN" [ora-api]. Binding a boolean into plain SQL, and from which database version, is UNVERIFIED | `conn.execute(sql, [], { resultSet: true, … })` (L520–532) |
| Dremio | `?` [pal] | **Does not bind:** `formatAnsi(query, values)` writes escaped literals into the text, then `POST /sql { sql }` [dr-drv; escape] | REST `/api/v3/sql` takes `sql`, `context` and `references`, and no values [dremio-sql]. Arrow Flight SQL prepared statements are UNVERIFIED | n/a | n/a | `driver.executeQuery(sql)` (L568) |

**Cube Store** ([cs-drv]; [cs-parser]; [cs-mod]):
- `query(query, values, { sendParameters })`. Without `sendParameters` it calls `formatSql(query, values)` from `sqlstring`, which is client-side text.
- With it, the values go as flatbuffer parameters (null, boolean, number, string or Buffer; other objects throw) (fork `WebSocketConnection.ts` L54, L459–605). Cube sends them only when `CUBEJS_CUBESTORE_SENDABLE_PARAMETERS` is on (default `true`) and Cube Store is at least 1.6.38 (fork `env.ts` L2076–2078; [cs-drv] `CubeStoreCapabilityMinVersion`), and only for its cache and queue commands (fork `CubeStoreCacheDriver.ts` L71–96).
- On Cube Store's side, `unwrap_placeholder` runs only inside `parse_queue_key`, `parse_literal_string`, `parse_identifier` and `parse_integer`. A `$`-named placeholder is refused: "Named placeholder are not supported, please use ?". A SELECT goes to `Statement::Statement(self.parser.parse_statement()?)` with no substitution ([cs-parser]). `exec_query_with_context` sends a query's AST to the planner without the parameters (fork `sql/mod.rs` L795–798, L1323–1334).
- **So a SELECT with `?` on Cube Store doesn't bind.** What error it gives is UNVERIFIED; a probe would be `POST …/cubestore/sql {"sql":"SELECT ? AS a"}`.
- xcube today calls `driver.query(sql, [])`, and plans first with `EXPLAIN ${sql}` ([x-runner] L655–682).

**Common to every database** ([pg-docs]; [bq-params]; [ora-bind]): a bound value cannot stand for a table or column name. That gives AC-454's Fails-when its "fails at the database" half:
- PostgreSQL "does not support parameters for identifiers" [pg-docs];
- BigQuery parameters "cannot be used as substitutes for identifiers, column names, table names" [bq-params];
- Oracle binds "cannot be used for direct substitution of column or table names" [ora-bind].

### 2. Cube Store, and the "Cube" group (AC-482)

| Target | Binds parameter values? | Source | What AC-482 asks of wechart |
|---|---|---|---|
| Cube Store (xcube `…/cubestore/sql`) | **No** for SELECT and EXPLAIN | [cs-parser], [cs-mod], [cs-drv] | Hold Run whenever a `{{name}}` is present, saying parameters aren't available on Cube Store |
| "Cube" group (`/v1/cubesql`) | **No.** The schema has no values field, and `execSql`'s arguments are the SQL, the stream, the security context, the cache, the time zone, `throwContinueWait` and the request id | [gwq], [gw], [native], fork `backend-native/js/index.ts` L452–456 | Hold Run whenever a `{{name}}` is present |
| Postgres-wire SQL API (not used) | Yes: `PostgresStatementParamsBinder` puts each bound value into the parsed statement as a literal node | fork `rust/cubesql/cubesql/src/sql/statement.rs` L730–795 | Not usable as the user: it signs in with `checkSqlAuth` (user name and password) [sqlsrv]; xcube holds it to HS256 rules and says to keep the port off [x-readme] |

### 3. xcube's run route today, and the change it needs

**Today:**
- `POST …/models/{model}/connections/{name}/sql[?overlay=]` and `POST …/models/{model}/cubestore/sql` both validate `sqlSchema` ([x-routes] L195–206, L724–779).
- Unknown keys fail with `400 bad_request "Invalid request: …"` ([x-routes] L249–255).
- `runs.ts` passes the classified `sql` to `session.run(sql, rows)` ([x-runs] L188–206).

**The xcube change** (for the coordinator to send to the Cube-expert session; a contract proposal, not decided):

1. **Request.** Add an optional `parameters` field. Two shapes:
   - **Option B (recommended): xcube rewrites.** `sql` keeps the user's `{{name}}` text, and `parameters: { [name]: { type: 'text'|'number'|'date'|'boolean', value: string|boolean } }`.
     - xcube finds each `{{name}}` with its own dialect lexer, which already reads "strings, quoted names, comments and dollar quotes" as each database does, and reads the statement every way its settings could make it ([x-classify] L1–15, L289–363).
     - It then replaces each `{{name}}` with the driver's placeholder.
   - **Option A: wechart rewrites.** wechart sends the SQL with placeholders already in, plus `values: [{ type, value }]` in placeholder order. The risks are under "Rewriting `{{name}}`" below.
2. **Value types** (proposed, to be checked by xcube's integration tests on each database):
   - **Text:** a JS string on every driver.
   - **Number:** sent as a decimal string, bound with a numeric type where the library takes one. Plain JS numbers are risky:
     - mssql types a number as `Int` [mssql-readme];
     - mysql2 sends `DOUBLE` [mysql2-enc];
     - Snowflake picks `FIXED` or `REAL` [sf-stmt];
     - BigQuery picks `INT64` or `FLOAT64` [bq-src].
   - **Date:** `YYYY-MM-DD`, typed `DATE` where the library takes a type: BigQuery `types` or `BigQuery.date()` [bq-src]; mssql `input(name, sql.Date, …)` [mssql-readme]. On pg, send it as text and let the server infer the type [pg-prepare].
   - **Boolean:** a JS boolean (pg `'true'`, mysql2 `TINY`, Snowflake `BOOLEAN`, BigQuery `BOOL`, mssql `Bit`). Oracle is UNVERIFIED.
3. **Each session binds:**

   | Session | Change |
   |---|---|
   | PostgreSQL, Redshift | `new Cursor(sql, values, …)`, `$n`, one `$n` per distinct name (a repeat reuses it) |
   | MySQL | Switch from `conn.query` to `conn.execute({ sql, values, rowsAsArray })`, `?` per occurrence. mysql2's `Execute` shares `Query.prototype.row` (from mysql2's `lib/commands/execute.js`); whether it emits the same `result` events for streaming is UNVERIFIED. MySQL can't prepare `EXPLAIN` ("Other statements are not supported") [my-ps], so an EXPLAIN with parameters fails on MySQL |
   | Snowflake | `binds`, `?` per occurrence [sf-bind] |
   | BigQuery | `params` plus `types`, on the dry run as well as the job: the dry run parses the same SQL. That the dry run fails without them is UNVERIFIED |
   | SQL Server | `request.input('p1', type, value)` and `@p1` [mssql-readme] |
   | Oracle | `conn.execute(sql, { p1: … }, …)` and `:p1` [ora-bind] |
   | Dremio, Cube Store | A new refusal, e.g. `400 parameters_unsupported`, so a `{{name}}` never reaches the database and no value is written into text |

4. **Checks before running (Option B):**
   - every `{{name}}` found has a value, and every value is used;
   - a `{{`…`}}` in code that doesn't match the name grammar is refused;
   - placeholder syntax the user wrote directly in code (`$1` on PostgreSQL, `?` on MySQL, Snowflake and BigQuery, `@x` on BigQuery and SQL Server, `:x` on Oracle) is refused while parameters are present, so it can't take wechart's values.
5. **Generated placeholder names, never the user's.** The check refuses unquoted words such as `INSERT` and `INTO`, and on SQL Server `SET`, `GET`, `ADD` and others ([x-classify] L97–111). `{{into}}` rewritten to `:into` would therefore be refused. Use `:p1`, `@p1`, `$1` or `?`.
6. **Put spaces around each placeholder.** `$` is part of a word in PostgreSQL identifiers, as xcube's lexer reads them (`WORD_PART` includes `$`, [x-classify] L241–242). So `x{{a}}` would become the identifier `x$1`, and `{{a}}0` would become `$10`.
7. **Logging and answers.** Never log the values. xcube's logs already carry no SQL ([x-routes] L719–747). `redactedSql` is taken from the rewritten SQL, so it has placeholders and no values; xcube's lexer reads `$1` as an operator and a number, so it is redacted as `$?` ([x-classify] L388–401). Database errors are passed on with only secrets redacted ([x-runs] L214–217), so a bound value can appear in a `query_failed` message, as a literal does today ([xcube-sql-runner.md](./xcube-sql-runner.md) "Refusals and failures"). wechart's audit keeps its own `{{name}}` SQL (AC-454).

### 4. Rewriting and finding `{{name}}` safely

**What lang-sql 6.10.0 offers** (installed `dist/index.d.ts` and `dist/index.js`) ([lang-sql-dts]; [lang-sql-js]):
- `SQLDialect.define(spec)` with these options: `backslashEscapes`, `hashComments`, `slashComments`, `spaceAfterDashes`, `doubleDollarQuotedStrings`, `doubleQuotedStrings`, `charSetCasts`, `plsqlQuotingMechanism`, `operatorChars`, `specialVar`, `identifierQuotes` and others ([lang-sql-dts] L9–89).
- `dialect.language` is an `LRLanguage`, whose `readonly parser: LRParser` can parse without an editor ([lang-sql-dts] L93–116; `@codemirror/language` 6.12.4 `index.d.ts` L143–144).
- Node names include `LineComment`, `BlockComment`, `String`, `QuotedIdentifier`, `Braces` and `SpecialVar`. `{` and `}` are tokens of their own (`BraceL` and `BraceR`) ([lang-sql-js] L279–284, L361).
- `Tree.iterate({ enter(node) })` walks the tree ([lezer-common] `index.d.ts` L670–674).

```ts
import { PostgreSQL, type SQLDialect } from '@codemirror/lang-sql';
const SKIP = new Set(['String', 'LineComment', 'BlockComment', 'QuotedIdentifier']);
/** Code ranges outside strings, comments and quoted names: where a `{{name}}` is a parameter (AC-453). */
export function parameterNames(sql: string, dialect: SQLDialect = PostgreSQL): string[] {
  const skipped: [number, number][] = [];
  dialect.language.parser.parse(sql).iterate({
    enter: (n) => { if (SKIP.has(n.name)) { skipped.push([n.from, n.to]); return false; } },
  });
  const names = new Set<string>();
  for (const m of sql.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) // name grammar: open question
    if (!skipped.some(([a, b]) => m.index! >= a && m.index! < b)) names.add(m[1]!);
  return [...names];
}
```

**Where lang-sql's lexing differs from the databases** (read in `dist/index.js` 6.10.0):

| Difference | lang-sql 6.10.0 | The databases, and xcube's lexer |
|---|---|---|
| MySQL backslash escapes | The `MySQL` dialect doesn't set `backslashEscapes`, and the default is `false` ([lang-sql-js] L159–175, L742–754). So `'it\'s {{x}}'` ends the string early, and `{{x}}` is listed by mistake | xcube removes `NO_BACKSLASH_ESCAPES` from the session's `sql_mode`, so backslashes escape when the statement runs ([x-runner] L283–286) |
| Nested block comments | Always nested, in every dialect ([lang-sql-js] L216–235) | xcube reads both ways where the database's setting allows either (`readings`) ([x-classify] L53–59, L305–317) |
| `E'…'` strings | Recognised in every dialect ([lang-sql-js] L236–240) | Only on PostgreSQL in xcube (`eStrings`, [x-classify] L75–76) |
| MySQL `--` | A comment only before a space (`input.peek(1) == 32`) ([lang-sql-js] L211–212) | Before a space or any control character ([x-classify] L294) |
| Dialects | Standard, PostgreSQL, MySQL, MariaDB, MSSQL, SQLite, Cassandra, PLSQL ([lang-sql-dts] L188–223). None for Redshift, Snowflake, BigQuery or Dremio. PLSQL reads `"…"` as a string ([lang-sql-js] L869–877) | xcube has one rule set per database, including BigQuery's `'''`/`"""` strings and `$tag$` ([x-classify] L61–91) |

**Recommendation** (on correctness grounds):
- Use lang-sql only to **list** parameters in the strip (AC-453). Give each driver a `SQLDialect.define` spec matching the database where an option exists, for example MySQL with `backslashEscapes: true`.
- Let xcube's lexer decide the **rewrite** (Option B). The bytes the check reads are then the same bytes that are rewritten and run.
- If the two disagree, xcube refuses and names the parameter. A value is never written into the text.

## Gotchas

1. **mysql2 `query()` with values is client-side substitution.** The binding path must be `execute()` [mysql2-conn]. Cube's own MySQL stream path uses `query()` [my-drv], so "Cube binds on MySQL" holds only for `driver.query`.
2. **Cube Store's driver formats values into the text by default** [cs-drv]. Calling `driver.query(sql, values)` from xcube would break AC-454.
3. **Dremio's driver always formats values into the text** (`formatAnsi`) [dr-drv]. `SqlEscaper.format` replaces every `?` run without regard to string literals [escape].
4. **The Postgres-wire binder (not used here) puts a string value into a number-typed placeholder as a `Number` AST node holding the string**, marked "FIXME: this workaround is needed as we don't know types on Bind" (fork `statement.rs` L763–768). If that path is ever taken up, treat this as a risk to study.
5. **BigQuery can't mix `?` and `@name`** [bq-params]. A `null` needs `types` [bq-src].
6. **Number precision.** A JS number above 2^53 loses precision. Number values should travel as strings until the library's typed bind (see the xcube change, item 2).
7. **SQL Server types a JS number as `Int`** when no type is given [mssql-readme]. Pass explicit types.
8. **PostgreSQL infers an untyped parameter's type from its first use** [pg-prepare]. `SELECT {{x}}` alone gives a text column, which is the expected result for an untyped value.
9. **A pg `Date` object is sent in the API process's local time** unless `parseInputDatesAsUTC` is set [pg-utils]. Send dates as `YYYY-MM-DD` strings, not `Date` objects.
10. **AC-462 writes the run's values into the cube draft as literals.** That needs each dialect's literal escaping (MySQL backslashes, [escape] `MySqlDialect`) and is separate from binding. It is not covered here.
11. **lang-sql reads an unclosed string to the end of the text** (`readLiteral` stops at end of input, [lang-sql-js] L39–50). A `{{x}}` after an unclosed quote isn't listed, which matches what the database would do.

## Alternatives considered

- **Who rewrites `{{name}}`:**
  - **xcube (Option B):** one lexer, the same one the read-only check trusts, faithful to each dialect.
  - **wechart's server with lang-sql (Option A):** carries the differences in the table above.
  - **xcube's lexer for the listing as well,** through a new route: exact, but a request per edit. The listing tolerates the lang-sql differences, because xcube still refuses a mismatch.
- **The "Cube" group over the Postgres wire:** binds, but needs `checkSqlAuth` credentials rather than the user's JWT, and an open SQL port [sqlsrv; x-readme]. Not recommended.

## Open questions / unverified

1. **Dremio (spec gap, needs a user decision).** Its REST API takes no values [dremio-sql], and Cube's driver writes them into the text [dr-drv]. AC-454 can't be met on Dremio. Should AC-482's "hold Run, say why" be extended to Dremio? Flight SQL parameter binding is UNVERIFIED.
2. **The `{{name}}` name grammar is undecided** (characters, case, inner spaces such as `{{ name }}`). The spec says only `{{name}}`.
3. **Oracle Boolean.** `DB_TYPE_BOOLEAN` is "PL/SQL BOOLEAN" [ora-api]. Binding it into plain SQL, and from which database version, is UNVERIFIED. Should Boolean be offered on Oracle?
4. **Redshift through pg-cursor's extended protocol with values:** UNVERIFIED (not run).
5. **mysql2 `execute()` streaming** with `result` events and `rowsAsArray`: UNVERIFIED.
6. **Snowflake's bind type for a JS `Date`:** UNVERIFIED. Send a string instead.
7. **Cube Store's error for `SELECT ?`:** UNVERIFIED. Probe it once xcube passes values.
8. **`/v1/cubesql`:**
   - the HTTP status when the error arrives on the stream: UNVERIFIED;
   - whether a client disconnect stops the data source's query: UNVERIFIED;
   - whether `DELETE /v1/running-query/{requestId}` cancels SQL API runs: UNVERIFIED.
9. **Versions in the image:** `snowflake-sdk`, `@google-cloud/bigquery` and `mysql2` as built: UNVERIFIED.
10. **The design study's build note** ([design] L434) should be corrected. Cube's driver interface "takes" values, but xcube's runner doesn't use it, and on Dremio and Cube Store the driver writes the values into the text.

---
[x-runner]: /Users/srajagopal/Work/bi/cube/xcube/src/sql/runner.ts (feat/xcube 407622a6b8)
[x-routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (407622a6b8)
[x-runs]: /Users/srajagopal/Work/bi/cube/xcube/src/sql/runs.ts (407622a6b8)
[x-classify]: /Users/srajagopal/Work/bi/cube/xcube/src/sql/classify.ts (407622a6b8)
[x-readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md L369-371
[pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/ParamAllocator.ts
[pgq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PostgresQuery.ts
[msq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/MssqlQuery.ts
[pg-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[my-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[sf-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-snowflake-driver/src/SnowflakeDriver.ts
[bq-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts
[ms-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mssql-driver/src/MSSqlDriver.ts
[ora-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-oracle-driver/driver/OracleDriver.js
[dr-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-dremio-driver/driver/DremioDriver.js
[escape]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/sql-escape.ts
[cs-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/CubeStoreDriver.ts
[cs-parser]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/sql/parser.rs
[cs-mod]: /Users/srajagopal/Work/bi/cube/rust/cubestore/cubestore/src/sql/mod.rs L780-800, L1323-1334 (fork 407622a6b8)
[gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[gwq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js
[sqlsrv]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/sql-server.ts (fork 407622a6b8)
[native]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-native/src/node_export.rs
[client-core]: /Users/srajagopal/Work/bi/cube/packages/cubejs-client-core/src/index.ts L125-195 (fork 407622a6b8)
[pg-docs]: https://node-postgres.com/features/queries
[pg-utils]: https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg/lib/utils.js
[pg-cursor]: https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg-cursor/index.js
[pg-prepare]: https://www.postgresql.org/docs/current/sql-prepare.html
[mysql2-ps]: https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements
[mysql2-conn]: https://github.com/sidorares/node-mysql2/blob/v3.24.4/lib/base/connection.js
[mysql2-enc]: https://github.com/sidorares/node-mysql2/blob/v3.24.4/lib/packets/encode_parameter.js
[my-ps]: https://dev.mysql.com/doc/refman/8.4/en/sql-prepared-statements.html
[sf-bind]: https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-execute
[sf-stmt]: https://github.com/snowflakedb/snowflake-connector-nodejs/blob/v3.3.0/lib/connection/statement.js
[bq-src]: https://github.com/googleapis/nodejs-bigquery/blob/v7.7.0/src/bigquery.ts
[bq-params]: https://docs.cloud.google.com/bigquery/docs/parameterized-queries
[mssql-readme]: https://github.com/tediousjs/node-mssql/blob/v11.0.1/README.md
[ora-bind]: https://node-oracledb.readthedocs.io/en/latest/user_guide/bind.html
[ora-api]: https://node-oracledb.readthedocs.io/en/latest/api_manual/oracledb.html
[dremio-sql]: https://docs.dremio.com/current/reference/api/sql/
[lang-sql-npm]: https://registry.npmjs.org/@codemirror/lang-sql/latest
[lang-sql-dts]: /Users/srajagopal/Work/wechart/node_modules/.pnpm/@codemirror+lang-sql@6.10.0/node_modules/@codemirror/lang-sql/dist/index.d.ts
[lang-sql-js]: /Users/srajagopal/Work/wechart/node_modules/.pnpm/@codemirror+lang-sql@6.10.0/node_modules/@codemirror/lang-sql/dist/index.js
[lezer-common]: /Users/srajagopal/Work/wechart/node_modules/.pnpm/@lezer+common@1.5.2/node_modules/@lezer/common/dist/index.d.ts
[wechart-client]: /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
[design]: /Users/srajagopal/Work/wechart/docs/design/references-sql-runner.md

**How these sources were read.**
- Fork paths were read at `feat/xcube` 407622a6b8 (`.git/refs/heads/feat/xcube`), the revision of the pinned image (`docker-compose.yml` L195).
- Upstream v1.7.45 was checked by fetching the tag's raw files for these: the Oracle, Dremio, MySQL, BigQuery, PostgreSQL, Snowflake and Cube Store drivers, `sql-escape.ts`, `query.js`, `gateway.ts`, `node_export.rs` and Cube Store's `parser.rs`.
- The Cube Store `sql/mod.rs` paths, `statement.rs`, `sql-server.ts`, `WebSocketConnection.ts`, `env.ts` and `client-core` were read in the fork only. Their identity with the tag is UNVERIFIED, though the image runs the fork.
