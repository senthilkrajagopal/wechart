---
library: wechart metadata-DB access layer (pg vs kysely vs drizzle-orm, with node-pg-migrate / kysely Migrator / drizzle-kit)
packages: [pg, "@types/pg", kysely, kysely-ctl, kysely-codegen, node-pg-migrate, drizzle-orm, drizzle-kit]
version: pg 8.23.0, @types/pg 8.23.1, kysely 0.29.6, kysely-ctl 0.21.0, kysely-codegen 0.20.0, node-pg-migrate 9.0.0 (evaluated but not selected: drizzle-orm 0.45.2, drizzle-kit 0.31.10)
researched: 2026-09-21
sources: [https://node-postgres.com/apis/pool, https://node-postgres.com/features/transactions, https://kysely.dev/docs/examples/transactions/simple-transaction, https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts, https://www.postgresql.org/docs/18/transaction-iso.html, https://www.postgresql.org/docs/18/explicit-locking.html, https://kysely.dev/docs/migrations, https://orm.drizzle.team/docs/migrations, https://www.postgresql.org/docs/17/datatype-json.html, https://www.postgresql.org/docs/17/pgcrypto.html, https://salsita.github.io/node-pg-migrate/cli]
---

# wechart metadata DB access: pg / kysely / drizzle-orm

## Summary

wechart's own Postgres holds dashboards and layout trees, chart specs, folders, bookmarks, settings, marking definitions, data-source settings with secrets, schedules, job history and query logs (AC-014, AC-015, AC-016, AC-150, AC-163, AC-164). All three candidates run on the same driver: Kysely's Postgres dialect takes a `pg` Pool and calls `pool.connect()` / `client.release()` ([postgres-driver.ts](https://github.com/kysely-org/kysely/blob/master/src/dialect/postgres/postgres-driver.ts)), and Drizzle's node-postgres migrator/driver is likewise `pg`-based ([migrator.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/node-postgres/migrator.ts)). So the decision is (a) the typing layer over SQL and (b) the migration tool.

**Recommendation: `pg` 8.23.0 Pool + `kysely` 0.29.6 for queries + `node-pg-migrate` 9.0.0 for migrations.** Reasons in [Alternatives considered](#alternatives-considered); the two decisive ones are per-migration transaction control (needed for `CREATE INDEX CONCURRENTLY` on the AC-016 log table) and the fact that our schema wants Postgres features (range partitioning, BRIN, `bytea` secret columns) that are expressed as SQL DDL rather than derived from TS models.

## Install

```
pnpm add pg kysely
pnpm add -D @types/pg node-pg-migrate kysely-codegen
```

- `pg` 8.23.0, MIT, `engines: node >= 16` ([npm](https://registry.npmjs.org/pg/latest)), published 2026-08-08 ([registry search](https://registry.npmjs.org/-/v1/search?text=pg)). Ships no bundled types; `@types/pg` 8.23.1 (MIT, requires TypeScript >= 5.6) supplies them ([npm](https://registry.npmjs.org/@types/pg/latest)).
- `kysely` 0.29.6, MIT, `engines: node >= 22`, **zero runtime dependencies**, types via `exports` ([npm](https://registry.npmjs.org/kysely/latest)), published 2026-09-16 ([registry search](https://registry.npmjs.org/-/v1/search?text=kysely)). dist-tags: `latest 0.29.6`, `next 0.30.0-beta.2` ([dist-tags](https://registry.npmjs.org/-/package/kysely/dist-tags)).
- `node-pg-migrate` 9.0.0, MIT, `engines: node >= 20.11.0`, peer `pg >=4.3.0 <9.0.0` and optional peer `@types/pg`; bin `node-pg-migrate` ([npm](https://registry.npmjs.org/node-pg-migrate/latest)), published 2026-07-17 ([registry search](https://registry.npmjs.org/-/v1/search?text=node-pg-migrate)). Node 26 and pg 8.23.0 both satisfy these ranges.
- Optional: `kysely-codegen` 0.20.0 (MIT) "generates Kysely type definitions from your database" ([registry search](https://registry.npmjs.org/-/v1/search?text=kysely-codegen)); `kysely-ctl` 0.21.0 (MIT, bin `kysely`, peer `kysely >=0.18.1 <0.30.0`) if we ever want Kysely's own migration CLI ([npm](https://registry.npmjs.org/kysely-ctl/latest)).

## Init / auth pattern

Pool (single instance per API process), with the mandatory idle-client error handler:

```ts
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

const pool = new Pool({ connectionString: process.env.WECHART_DB_URL, max: 10 });
pool.on('error', (err) => {
  /* log; consider process exit */
});
export const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
```

- Pool options and defaults (`max` 10, `idleTimeoutMillis` 10000, `connectionTimeoutMillis` 0 = no timeout, plus `min`, `maxUses`, `maxLifetimeSeconds`, `allowExitOnIdle`) ([node-postgres Pool](https://node-postgres.com/apis/pool)).
- The pool "will emit an error on behalf of any idle clients it contains if a backend error or network partition happens"; the docs' own example attaches `pool.on('error', …)` and exits, and an unhandled one becomes an uncaught exception ([pooling](https://node-postgres.com/features/pooling), [Pool API](https://node-postgres.com/apis/pool)).
- Migrations at container start: run `node-pg-migrate` as a Kubernetes init container / Job, not inside the API process. CLI `node-pg-migrate up`, or the programmatic `runner({ databaseUrl, dir, direction: 'up' })` ([API](https://salsita.github.io/node-pg-migrate/api)).

## API surface we will use

### Document-shaped columns (dashboard layout trees, chart specs) — AC-014

- Use `jsonb`: Postgres stores it decomposed, it is faster to query and it is the only JSON type that can be indexed; "Most applications should prefer to store JSON data as `jsonb`" ([PG 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html)).
- Typing in Kysely: `JSONColumnType<Select, Insert, Update>` — "A shortcut for defining JSON columns, which are by default inserted/updated as stringified JSON strings", i.e. select type is the object, insert/update types default to `string` ([apidoc](https://kysely-org.github.io/kysely-apidoc/types/JSONColumnType.html)). So layout trees are typed on read and must be `JSON.stringify`-ed (or cast) on write; the docs' cast recipe is ``sql`CAST(${JSON.stringify(value)} AS JSONB)` `` ([extending Kysely](https://kysely.dev/docs/recipes/extending-kysely)).
- Reading nested rows as JSON without N+1: `import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres'` wraps `JSON_AGG`/`TO_JSON` ([relations recipe](https://kysely.dev/docs/recipes/relations)).
- Partial updates: Postgres subscripting, e.g. `UPDATE t SET jsonb_field['a']['b'] = '1'` ([PG 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html)). Note the same page's warning: "any update acquires a row-level lock on the whole row… Consider limiting JSON documents to a manageable size". For a whole-dashboard save we replace the document anyway; for AC-015 that is also the safer semantic.
- Indexing: GIN `jsonb_ops` (default; supports `?`, `?|`, `?&`, `@>`, `@?`, `@@`) vs `jsonb_path_ops` ("usually much smaller", faster, but no key-exists operators), plus expression indexes such as `CREATE INDEX … USING GIN ((jdoc -> 'tags'))` ([PG 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html)).
- **Finding a value at any depth: `jsonb_path_exists` with the `.**` accessor** ([PG 18 JSON functions](https://www.postgresql.org/docs/18/functions-json.html), §9.16.1 Table 9.51 and §9.16.2).
  - `jsonb_path_exists(target, path [, vars [, silent]])` "Checks whether the JSON path returns any item". `vars` "must be a JSON object, and its fields provide named values to be substituted into the jsonpath expression". `silent` true "suppresses the same errors as the `@?` and `@@` operators do".
  - A filter `? (condition)`, with `@` for the item considered, keeps only the items that satisfy it.
  - The `.**` accessor selects every level of the hierarchy. The docs "recommend using the `.**` accessor only in strict mode", because lax mode's array unwrapping selects some items twice.
  - **Observed locally (2026-09-22, PostgreSQL 18.6):** `jsonb_path_exists(body, 'strict $.** ? (@.chartId == $id)', jsonb_build_object('id', 'seed-chart-status'), true)` found the seed dashboard whose tile shows that chart. `body -> 'charts' @> '["seed-chart-status"]'` found none, because tiles in pages hold the chart id and the old `charts` list doesn't.

### Optimistic concurrency — AC-015

Pattern: `version integer not null`, and the save does
`UPDATE dashboard SET …, version = version + 1 WHERE id = $1 AND version = $2`, then refuses if zero rows matched.

- Kysely: `await db.updateTable('dashboard').set(...).where('id','=',id).where('version','=',v).executeTakeFirst()` returns an `UpdateResult` whose `numUpdatedRows: bigint` is "The number of rows the update query updated (even if not changed)" ([update-result.ts](https://github.com/kysely-org/kysely/blob/master/src/query-builder/update-result.ts)). `numUpdatedRows === 0n` ⇒ reject with "dashboard changed". Note it is a `bigint`, so compare against `0n` under strict TS.
- `pg` alone: `result.rowCount` is typed `number | null` in `@types/pg` ([index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/pg/index.d.ts)) — the null case must be handled explicitly rather than `!== 0`.
- Drizzle: the update docs show `.set().where().returning()` / partial `returning({ updatedId: users.id })` and "do not mention `rowCount`" ([drizzle update](https://orm.drizzle.team/docs/update)), so the conflict check is "returned zero rows".

### Append-heavy query/job/connection-test logs — AC-016, AC-150, AC-163

- Batch inserts: Kysely accepts an array in `.values([...])` for dialects that support it, PostgreSQL included ([multiple rows](https://kysely.dev/docs/examples/insert/multiple-rows)).
- Time-range reads + retention: declarative range partitioning gives partition pruning for `WHERE logdate >= …`, and "Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`"; indexes created on the partitioned table propagate to all partitions ([PG 17 partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html)). This is how AC-150 keeps build history "beyond Cube's 24-hour window" without an unbounded table.
- BRIN on the timestamp column: designed for exactly this shape — "a table storing a store's sale orders might have a date column… entries for earlier orders will appear earlier in the table" — and "Because a BRIN index is very small, scanning the index adds little overhead compared to a sequential scan, but may avoid scanning large parts of the table" ([PG 17 BRIN](https://www.postgresql.org/docs/17/brin.html)). BRIN indexes are lossy and require a recheck.
- Prepared statements for the hot insert path: `pg` caches plans when a query config has a `name`, "on a per connection basis" ([node-postgres queries](https://node-postgres.com/features/queries)). **Kysely's Postgres driver passes only `sql` and `parameters` to `client.query` — no `name`** ([postgres-driver.ts](https://github.com/kysely-org/kysely/blob/master/src/dialect/postgres/postgres-driver.ts)), so if we want named prepared statements on the log insert we issue it through `pool.query({ name, text, values })` directly. Drizzle exposes `.prepare("p1")` + `sql.placeholder('id')` + `.execute({ id: 10 })` ([drizzle perf](https://orm.drizzle.team/docs/perf-queries)).

### Migrations — node-pg-migrate 9.0.0

- Files export `up` and `down`, receiving a `MigrationBuilder` (`pgm`); "The down migration can be omitted" (reversal is inferred for supported operations) or set to `export const down = false` for irreversible ones; `pgm.noTransaction()` disables the transaction **for that one migration** ([writing migrations](https://salsita.github.io/node-pg-migrate/migrations/)). Arbitrary SQL (partitions, BRIN, extensions) goes through `pgm.sql`.
- CLI: `create`, `up`, `down`, `redo`; `--single-transaction` defaults to `true` — "Combines all pending migrations into a single transaction so that if any migration fails, all will be rolled back"; there is a `--no-lock` flag and an `advisory-lock-mode` option ("fail, wait") for when another process holds the migration advisory lock; the migrations table defaults to `pgmigrations` ([CLI](https://salsita.github.io/node-pg-migrate/cli)). The `wait` mode matters when several wechart pods start at once.
- Rollback is a real `down` run (`node-pg-migrate down`), unlike drizzle-kit (below).

### Secrets — AC-164

- Do **not** use `pgcrypto` for the source credentials. Its documented Security Limitations say: "All `pgcrypto` functions run inside the database server. That means that all the data and passwords move between `pgcrypto` and client applications in clear text… If you cannot [connect locally / use SSL / trust both admins], then better do crypto inside client application" ([PG 17 pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html)). Keys passed as SQL literals also land in statement logs.
- Credentials for a data source must stay _decryptable_ by the API (they are replayed to Postgres/Cube), so hashing (`crypt()`/`gen_salt()`, also pgcrypto) is wrong for them: hashing only fits things we merely verify.
- Application-level authenticated encryption in Node: `crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })`, `cipher.setAAD(...)`, `cipher.getAuthTag()` after `final()`, and `decipher.setAuthTag()` before `final()` ([Node crypto](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options)). Store `bytea` (ciphertext, iv, tag, key id); the key comes from a Kubernetes Secret / KMS, never from the same database. AAD should bind the ciphertext to the source id so a row cannot be swapped between sources.
- AC-164's "never show in plain text" is an API-shape rule, not a storage rule: the source read model must not contain the secret field at all (write-only field, `has_password: boolean`). No library enforces this; it is enforced by the row-to-DTO mapper and a test.

## Gotchas

- **Kysely is pre-1.0** (`latest` 0.29.6, `next` 0.30.0-beta.2) ([dist-tags](https://registry.npmjs.org/-/package/kysely/dist-tags)); pin the exact version and read release notes before any bump.
- **Kysely's own Migrator has only a global `disableTransactions` switch** — the source documents it as "When true, don't run migrations in transactions even if the dialect supports transactional DDL", and with transactional DDL "if any later migrations failed AND the dialect supports transactional DDL, even successful migrations were rolled back" ([migrator.ts](https://github.com/kysely-org/kysely/blob/master/src/migration/migrator.ts)). Per-migration transaction configuration is listed as a 0.30.0-beta feature ([releases](https://github.com/kysely-org/kysely/releases)), i.e. not in the pinned stable. This is why migrations use node-pg-migrate, whose `pgm.noTransaction()` is per file.
- **Drizzle has a major version in flight**: `latest` is 0.45.2 (published 2026-03-27) while the `rc` dist-tag points at `1.0.0-rc.4` ([dist-tags](https://registry.npmjs.org/-/package/drizzle-orm/dist-tags), [registry search](https://registry.npmjs.org/-/v1/search?text=drizzle-orm)). Adopting 0.45.x means a known major migration ahead.
- **drizzle-kit generates forward-only migrations**: `generate` produces a `.sql` file plus a `snapshot.json` per migration, and the documentation describes no down/rollback generation ([drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)); `migrate` tracks applied migrations in `__drizzle_migrations` in a `drizzle` schema ([drizzle-kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)). `push` applies schema changes with no migration file at all ([migrations](https://orm.drizzle.team/docs/migrations)) — unsuitable for a reviewed, k8s-deployed schema.
- `pg` 8.23.0 has **no bundled types**; `@types/pg` must be kept in step and needs TypeScript >= 5.6 ([npm](https://registry.npmjs.org/@types/pg/latest), [npm](https://registry.npmjs.org/pg/latest)).
- **Postgres restart**: all idle clients emit errors at once through the pool's `error` event, and an unhandled one is an uncaught exception ([Pool API](https://node-postgres.com/apis/pool)). In-flight queries fail and must be retried by the caller; the pool reconnects lazily on the next checkout. Named prepared statements are per connection ([queries](https://node-postgres.com/features/queries)), so a restart invalidates them transparently.
- Large jsonb layout trees: every update takes a row lock on the whole row and rewrites the whole value; the docs advise keeping documents "a manageable size" and atomic ([PG 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html)).

## Alternatives considered

|                          | `pg` + hand SQL                                                                                                                                                     | `kysely` 0.29.6                                                                                                  | `drizzle-orm` 0.45.2                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Licence                  | MIT ([npm](https://registry.npmjs.org/pg/latest))                                                                                                                   | MIT ([npm](https://registry.npmjs.org/kysely/latest))                                                            | Apache-2.0 ([package.json](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/package.json))        |
| Types                    | external `@types/pg`, results unchecked (`QueryResult<R = any>`) ([index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/pg/index.d.ts)) | bundled, no runtime deps ([npm](https://registry.npmjs.org/kysely/latest))                                       | bundled ([npm](https://registry.npmjs.org/drizzle-orm/latest))                                                     |
| jsonb typing             | manual                                                                                                                                                              | `JSONColumnType` ([apidoc](https://kysely-org.github.io/kysely-apidoc/types/JSONColumnType.html))                | `jsonb().$type<{foo:string}>()`, compile-time only ([column types](https://orm.drizzle.team/docs/column-types/pg)) |
| Rows-affected for AC-015 | `rowCount: number \| null`                                                                                                                                          | `numUpdatedRows: bigint`                                                                                         | `.returning()` rows                                                                                                |
| Migrations               | node-pg-migrate 9.0.0: up/down, per-migration `noTransaction()`, advisory lock with `wait`, `redo`                                                                  | own Migrator: all-or-nothing transaction, lock, `migrateDown`/`migrateTo`, but global `disableTransactions` only | drizzle-kit `generate`/`migrate`, snapshot-diffed, forward-only                                                    |
| Schema source of truth   | SQL                                                                                                                                                                 | SQL (types hand-written or generated by kysely-codegen)                                                          | TypeScript models                                                                                                  |

Rejected `drizzle-orm` because the stable line is about to be superseded by 1.0, because generated diff migrations are forward-only, and because a TS-model source of truth is a poor fit for a schema whose correctness depends on partitioned tables, BRIN indexes and `bytea` secret columns that we must write as DDL regardless. Rejected `pg` + hand-written SQL as the primary query layer because AC-015/AC-016 read paths return wide row shapes that would be type-asserted rather than type-checked (`QueryResult<R = any>`); we still use `pg` directly for named prepared statements and any `COPY`-style bulk path. Kysely keeps SQL explicit, adds compile-time row types, and adds no runtime dependency to the API image.

## Open questions / unverified

- Whether Kysely's Postgres adapter takes a session or transaction-scoped advisory lock is documented only as `acquireMigrationLock`/`releaseMigrationLock` in [migrator.ts](https://github.com/kysely-org/kysely/blob/master/src/migration/migrator.ts); not verified further, and not load-bearing since migrations run via node-pg-migrate.
- UNVERIFIED: whether `node-pg-migrate` 9.0.0 contains breaking changes vs 8.x — I could not reach a 9.0.0 changelog/release-notes page (the docs site's getting-started and CLI pages do not carry one, and the GitHub releases page was not fetched). Check before pinning in `package.json`.
- UNVERIFIED: exact release dates on the Kysely and Drizzle GitHub release pages; the fetched page rendered dates inconsistently with npm publish times, so only npm publish timestamps are cited above.
- Open for the user: retention window for the AC-016 query log and AC-150 build history (drives partition granularity), and whether the encryption key for AC-164 comes from a Kubernetes Secret or an external KMS.

## Query-time transactions (AC-183)

*Added 2026-09-21 by an integration-researcher for T192 (writing a dashboard and the charts edited from its tiles all-or-nothing). Recorded verbatim.*

**Versions and scope.** kysely 0.29.6 and pg 8.23.0, as pinned in `packages/api/package.json`. pnpm resolves pg-pool 3.14.0 and pg-protocol 1.16.0 under them, and those installed copies were read too. **The PostgreSQL major is 18, not 17.** The metadata DB service `wechart-meta` runs `image: postgres:18-alpine` (`docker-compose.yml`, line 10), and `infra/` pins no Postgres image. So the Postgres citations below point at the `/docs/18/` pages. The Read Committed paragraph in §3 was checked to be word-for-word the same in the [PG 17 docs](https://www.postgresql.org/docs/17/transaction-iso.html); every other PG section was checked on 18 only.

### 1. Kysely 0.29.6 transaction API

**Signatures** (from [kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts), and the installed `dist/kysely.d.ts`):
```ts
db.transaction(): TransactionBuilder<DB>
TransactionBuilder<DB>.setIsolationLevel(isolationLevel: IsolationLevel): TransactionBuilder<DB>
TransactionBuilder<DB>.setAccessMode(accessMode: AccessMode): TransactionBuilder<DB>
TransactionBuilder<DB>.execute<T>(callback: (trx: Transaction<DB>) => Promise<T>): Promise<T>
```

**Commit and rollback semantics.**
- The docs say: "If an exception is thrown inside the callback passed to the `execute` method, the exception is caught, the transaction is rolled back, and the exception is thrown again. Otherwise the transaction is committed." ([simple transaction](https://kysely.dev/docs/examples/transactions/simple-transaction))
- The source matches. `execute` runs `beginTransaction`, then `callback(transaction)`, then `commitTransaction`, and returns the callback's result. On error, it runs `rollbackTransaction` only if BEGIN succeeded (the `transactionBegun` flag), then `throw error` ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).
- It rethrows the *same* error object. So a `StaleDocumentError` thrown inside the callback comes out of `execute()` with its class intact.
- One exception: the catch block awaits ROLLBACK before `throw error`. If ROLLBACK itself rejects (for example, the connection died), that error propagates instead of the original ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).

**`trx` can be used where a `Kysely<DB>` is expected.**
- `Transaction<DB> extends Kysely<DB>`. The source comment on `isTransaction` says: "The return type is `true` instead of `boolean` to make Kysely<DB> unassignable to Transaction<DB> while allowing assignment the other way around." ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts))
- The JSDoc on `transaction()` also says the transaction "is of type Transaction which inherits Kysely. Any query started through the transaction object is executed inside the transaction" (same file).
- So `documents(trx)`, using the existing factory `documents(db: Kysely<Database>)` in `packages/api/src/repos/documents.ts`, type-checks, and every query it runs goes through the transaction.

**Isolation level and access mode.**
- `IsolationLevel` is `'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' | 'snapshot'`. `AccessMode` is `'read only' | 'read write'`. Any other value makes `execute` throw `invalid transaction isolation level …` ([driver.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/driver/driver.ts)).
- The Postgres driver sends a plain `begin` when neither is set. Otherwise it sends `start transaction isolation level <level> [<access mode>]` ([postgres-driver.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/dialect/postgres/postgres-driver.ts)).
- PostgreSQL's grammar accepts only `SERIALIZABLE | REPEATABLE READ | READ COMMITTED | READ UNCOMMITTED` ([PG 18 START TRANSACTION](https://www.postgresql.org/docs/18/sql-start-transaction.html)). So `'snapshot'`, which is in Kysely's list, is not valid on Postgres. UNVERIFIED: the exact server error; not run.
- With a plain `begin`, the level comes from `default_transaction_isolation`: "The default is 'read committed'" ([PG 18 client config](https://www.postgresql.org/docs/18/runtime-config-client.html)).
- PostgreSQL's Read Uncommitted "behaves like Read Committed" ([PG 18 §13.2](https://www.postgresql.org/docs/18/transaction-iso.html)).

**No nested transactions.**
- On a `Transaction`, the methods `transaction()`, `startTransaction()`, `connection()` and `destroy()` are typed `never`, marked `@deprecated`, and throw at runtime. For example: `'calling the transaction method for a Transaction is not supported'` ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).
- Nested-transaction support is an open feature request ([#1498](https://github.com/kysely-org/kysely/issues/1498)).
- Consequence: a helper typed `(db: Kysely<Database>)` that opens its own `db.transaction()` compiles when handed `trx`, but throws at runtime. `db.isTransaction` exists for telling the two apart ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).

**Controlled transactions exist in 0.29.6.**
- `db.startTransaction(): ControlledTransactionBuilder<DB>`, and its `.execute(): Promise<ControlledTransaction<DB>>`.
- It has `commit()`, `rollback()`, `savepoint(name)`, `rollbackToSavepoint(name)` and `releaseSavepoint(name)`. Each returns a `Command` run with `.execute()`. After commit or rollback, any query throws `Transaction is already committed` or `Transaction is already rolled back` ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts), [docs](https://kysely.dev/docs/examples/transactions/controlled-transaction)).
- The pool client is released only inside `commit()` and `rollback()` (same source). The caller owns that, unlike the callback form, which releases in a `finally` (see §2).

**Pitfall: using `db` instead of `trx` inside the callback.**
- A query built from `db` goes through `DefaultConnectionProvider`, which checks out a *separate* pool client ([default-connection-provider.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/driver/default-connection-provider.ts), [postgres-driver.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/dialect/postgres/postgres-driver.ts)). So it runs outside the transaction and is neither rolled back nor isolated ([node-postgres transactions](https://node-postgres.com/features/transactions)).
- *Inference from the sources, not reproduced:* if that outside statement touches a row the transaction already updated, it waits on the transaction's row lock, while the transaction waits on the app. Postgres sees a lock wait, not a cycle. The docs say "So long as no deadlock situation is detected, a transaction seeking either a table-level or row-level lock will wait indefinitely" ([PG 18 §13.3.4](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-DEADLOCKS)), and `lock_timeout` defaults to 0, which disables it ([PG 18 client config](https://www.postgresql.org/docs/18/runtime-config-client.html)).
- Pool exhaustion is the same shape. When the pool is full, `pool.connect()` waits in a FIFO queue, and `connectionTimeoutMillis` defaults to 0, meaning no timeout ([node-postgres Pool](https://node-postgres.com/apis/pool)).

**Pitfall: `Promise.all` over `trx`.**
- Issue [#1604](https://github.com/kysely-org/kysely/issues/1604): with `Promise.all` inside a transaction, rows persisted after one promise threw, while a sequential `for`/`await` rolled back correctly. [#899](https://github.com/kysely-org/kysely/issues/899) is the same shape and was closed as invalid. [#1711](https://github.com/kysely-org/kysely/issues/1711) asked the docs to say parallel use is unsupported; it is closed.
- PR [#1694](https://github.com/kysely-org/kysely/pull/1694), "Prevent re-use of finished trx outside callback", was merged 2026-01-30. Its guard (`NotCommittedOrRolledBackAssertingExecutor` wrapping the executor in `TransactionBuilder.execute`) is present in the v0.29.6 tag and in the installed dist ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).
- UNVERIFIED (from reading the source; not reproduced): the guard checks state when a query *starts*. `SingleConnectionProvider` queues concurrent queries on the one connection ([single-connection-provider.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/driver/single-connection-provider.ts)), but ROLLBACK is sent straight to the connection, bypassing that queue. So a statement already started and queued could still reach the connection after ROLLBACK.
- `Promise.all` gains no parallelism here anyway, because that provider serializes the queries (same source).

**No `signal` option on the callback form.** 0.29.0 added query cancellation via `signal` ([v0.29.0 release](https://github.com/kysely-org/kysely/releases/tag/v0.29.0)). But `TransactionBuilder.execute` in 0.29.6 takes only the callback; `ConnectionBuilder.execute` is the one that takes `options` ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).

### 2. pg Pool + transactions

**One pool client for the whole transaction.**
- `TransactionBuilder.execute` calls `executor.provideConnection(...)`. With `PostgresDialect`, that is `DefaultConnectionProvider`: it acquires a connection, runs the consumer, and releases the connection in a `finally` ([default-connection-provider.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/driver/default-connection-provider.ts)).
- Acquire is `await this.#pool.connect()`, and release is `this.#client.release()` ([postgres-driver.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/dialect/postgres/postgres-driver.ts)).
- Inside the callback, `trx` is bound to `new SingleConnectionProvider(connection)`, and BEGIN, COMMIT and ROLLBACK run on that same connection ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)). So the whole transaction runs on one pool client, from checkout until the callback settles.

**node-postgres requires this.** "You **must** use the _same_ client instance for all statements within a transaction. PostgreSQL isolates a transaction to individual clients", and "Do not use transactions with the pool.query method" ([node-postgres transactions](https://node-postgres.com/features/transactions)).

**Broken clients are not reused.**
- Kysely calls `release()` with no argument. pg-pool still discards the client instead of reusing it when `err || this.ending || !client._queryable || client._ending || …maxUses` ([pg-pool index.js](https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js); same condition in installed pg-pool 3.14.0).
- pg's `Client` sets `_queryable = false` on a connection error ([client.js](https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js); installed pg 8.23.0 `lib/client.js`, line 420).
- `release(true)` explicitly destroys a client ([node-postgres Pool](https://node-postgres.com/apis/pool)); Kysely does not pass that.

**Capacity.** While open, each transaction holds one of `max: 10` clients (`packages/api/src/db/client.ts`, line 22). Further `pool.connect()` calls wait FIFO ([node-postgres Pool](https://node-postgres.com/apis/pool)).

### 3. READ COMMITTED and a concurrent `UPDATE … WHERE version = $expected`

**What PostgreSQL 18 §13.2.1 says** ([PG 18](https://www.postgresql.org/docs/18/transaction-iso.html); identical in [PG 17](https://www.postgresql.org/docs/17/transaction-iso.html)):
> "`UPDATE`, `DELETE`, `SELECT FOR UPDATE`, and `SELECT FOR SHARE` commands … will only find target rows that were committed as of the command start time. However, such a target row might have already been updated … by another concurrent transaction by the time it is found. In this case, the would-be updater will wait for the first updating transaction to commit or roll back … If the first updater rolls back, then its effects are negated and the second updater can proceed with updating the originally found row. If the first updater commits, the second updater will ignore the row if the first updater deleted it, otherwise it will attempt to apply its operation to the updated version of the row. The search condition of the command (the `WHERE` clause) is re-evaluated to see if the updated version of the row still matches the search condition."

**The mechanism.** The executor README calls this EvalPlanQual. In READ COMMITTED it re-checks the query's conditions against the concurrently updated tuple and ignores the tuple if they no longer pass; in serializable mode an error is raised instead ([executor README, REL_18_STABLE](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/executor/README)).

**Why the two updates block each other.**
- An `UPDATE` that does not change key columns takes `FOR NO KEY UPDATE` ([PG 18 §13.3.2](https://www.postgresql.org/docs/18/explicit-locking.html)). Our UPDATE never changes `kind` or `id`, the primary key.
- Table 13.3 marks `FOR NO KEY UPDATE` as conflicting with `FOR NO KEY UPDATE` (same page), so two such UPDATEs on one row serialize.
- "Row-level locks are released at transaction end or during savepoint rollback" (same page).

**Applied to `documents.update`.** Two saves, T1 and T2, both expect version 5:
- **T1 already committed before T2's UPDATE starts.** T2's statement sees version 6, the `WHERE` fails, T2 gets zero rows and does not wait.
- **T1 updated but has not committed.** T2 waits. When T1 commits, T2 re-evaluates the `WHERE` against version 6, ignores the row, and returns zero rows. `executeTakeFirst()` gives `undefined`.
  - The repo's follow-up `SELECT version` then runs in the same transaction.
  - In Read Committed, "a `SELECT` query sees a snapshot of the database as of the instant the query begins to run" ([PG 18 §13.2.1](https://www.postgresql.org/docs/18/transaction-iso.html)). So it reads 6, and the repo throws `StaleDocumentError(expected 5, current 6)`.
- **T1 rolls back.** T2 proceeds on the original row and succeeds.
- **T1 deleted the row.** T2 "will ignore the row", the SELECT finds nothing, and the repo throws `DocumentNotFoundError`.

**The existing SET value is equivalent to `version = version + 1`.** The code writes `version: expectedVersion + 1` rather than `version = version + 1`. The SET applies only to a row whose re-evaluated `WHERE` still has `version = expected`, so both forms write the same value.

**Conclusion.** Version-checked UPDATEs inside a READ COMMITTED transaction still detect a lost race correctly. Each row's compare-and-set is decided against that row's latest committed version once its row lock is held, and the lock is held until the transaction ends. REPEATABLE READ or SERIALIZABLE are not needed for detection.

**What READ COMMITTED does not give.** Each statement sees its own snapshot: "it is possible for an updating command to see an inconsistent snapshot" ([PG 18 §13.2.1](https://www.postgresql.org/docs/18/transaction-iso.html)). So a *read* inside the transaction that feeds a write is not protected unless that write carries its own version predicate. `attachChart` and `relocate` read and then write with a version predicate, so they are covered.

**Why a higher level would break the repo's error mapping.**
- Under REPEATABLE READ, if the concurrent writer commits after our snapshot, the UPDATE fails with "could not serialize access due to concurrent update", and the application "should abort the current transaction and retry the whole transaction from the beginning" ([PG 18 §13.2.2](https://www.postgresql.org/docs/18/transaction-iso.html)).
- That error is SQLSTATE `40001 serialization_failure` ([PG 18 error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)).
- So the repo's "zero rows → `StaleDocumentError`" path would not run for that case. The lost race would arrive as a raw database error instead.

### 4. Failure partway through is all-or-nothing

**Walkthrough.** The third of four `repo.update` calls returns zero rows, and the repo throws `StaleDocumentError`. Kysely catches it, sends `rollback` on the same connection, and rethrows ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).

**What PostgreSQL guarantees.**
- A transaction "bundles multiple steps into a single, all-or-nothing operation… If some failure occurs that prevents the transaction from completing, then none of the steps affect the database at all" ([PG 18 tutorial §3.4](https://www.postgresql.org/docs/18/tutorial-transactions.html)).
- On ROLLBACK, "all our updates so far will be canceled" (same page).
- The row locks taken by updates 1 and 2 are released at transaction end ([PG 18 §13.3.2](https://www.postgresql.org/docs/18/explicit-locking.html)).
- So updates 1 and 2 are undone.

**The throw is what rolls back.** A zero-row UPDATE is not a database error, and the transaction stays healthy. The *throw* is what triggers rollback. If code inside the callback catches `StaleDocumentError` and returns normally, Kysely commits updates 1 and 2 ([kysely.ts @ v0.29.6](https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts)).

**Catching a database error inside the callback does not recover the transaction.** Once a *database* error occurs (for example a deadlock), the transaction block is "put in aborted state by the system due to an error", and only `ROLLBACK TO` a savepoint or a full rollback recovers it ([PG 18 tutorial §3.4](https://www.postgresql.org/docs/18/tutorial-transactions.html)). The matching SQLSTATE is `25P02 in_failed_sql_transaction` ([PG 18 error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)).

### 5. Deadlocks between overlapping saves

**Two saves can deadlock.** PostgreSQL 18 §13.3.4 ([docs](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-DEADLOCKS)):
- It shows exactly this case: two transactions each `UPDATE accounts … WHERE acctnum = …` on two rows in opposite order. "Transaction one is blocked on transaction two, and transaction two is blocked on transaction one: a deadlock condition. PostgreSQL will detect this situation and abort one of the transactions."
- "Exactly which transaction will be aborted is difficult to predict and should not be relied upon."

**Consistent order is the documented mitigation.** Same section: "The best defense against deadlocks is generally to avoid them by being certain that all applications using a database acquire locks on multiple objects in a consistent order. In the example above, if both transactions had updated the rows in the same order, no deadlock would have occurred." It adds that deadlocks "can be handled on-the-fly by retrying transactions that abort due to deadlocks".

**When and how a deadlock surfaces.**
- Detection runs after `deadlock_timeout`, which defaults to `1s`: "the amount of time to wait on a lock before checking to see if there is a deadlock condition" ([PG 18 lock config](https://www.postgresql.org/docs/18/runtime-config-locks.html)).
- The aborted transaction gets SQLSTATE `40P01 deadlock_detected` ([PG 18 error codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)).
- In node-postgres that arrives as a `DatabaseError` with `code: string | undefined` ([pg-protocol messages.ts](https://github.com/brianc/node-postgres/blob/master/packages/pg-protocol/src/messages.ts); installed pg-protocol 1.16.0 `dist/messages.d.ts`).

**A retry cannot overwrite.** After a deadlock, the surviving transaction has committed new versions. So a retried version-checked save matches zero rows and ends in `StaleDocumentError`. A retry cannot silently overwrite the winner's changes; this follows from §3.

**Sorting.**
- Sort by the primary key `(kind, id)`, using the same comparator in every code path that writes more than one document in a transaction.
- Plain `<` compares strings "based on the values of the UTF-16 code units", with no locale involved ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Less_than)).

**Keep the transaction short.** "It is a bad idea for applications to hold transactions open for long periods of time" ([PG 18 §13.3.4](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-DEADLOCKS)). Every row a save touches stays locked until it commits.

**Timeouts are available but all off by default.** `lock_timeout`, `statement_timeout`, `transaction_timeout` and `idle_in_transaction_session_timeout` all default to 0, meaning disabled ([PG 18 client config](https://www.postgresql.org/docs/18/runtime-config-client.html)). Whether to set any of them is open; nothing here decides it.

### What this means for wechart

- **Transaction shape.** Run the AC-183 save as one `db.transaction().execute(...)`. Build the repo from `trx` (`documents(trx)`), and never reference `db` inside the callback. Await the updates one at a time; no `Promise.all`.
- **Lock order.** Sort the documents in a save by `(kind, id)` before updating, and use that same order everywhere a transaction writes more than one document. This is the documented deadlock mitigation. Reject or merge duplicate `(kind, id)` entries: a second update of the same document inside one save would be stale against the first.
- **Isolation level.** Stay on READ COMMITTED (the default, or pinned explicitly with `.setIsolationLevel('read committed')`). The existing zero-rows → `StaleDocumentError` path is correct there. REPEATABLE READ would turn some lost races into `40001` errors that bypass that path. Never pass `'snapshot'`.
- **Let stale errors out.** Let `StaleDocumentError` and `DocumentNotFoundError` propagate out of the callback. Kysely rethrows the same object, so the existing 409 mapping keeps working. Catching one inside the callback and returning normally would commit a partial save.
- **Decide the deadlock response.** Decide how `40P01` (`err.code === '40P01'`) reaches the user: retry, or report it as the same conflict. A retry cannot overwrite the winner's changes, because the version check will then fail.
- **Error class differences.** `attachChart` and `relocate` use `executeTakeFirstOrThrow`. On a lost race that throws Kysely's `NoResultError`, not `StaleDocumentError`. Inside the save transaction it still rolls back, but the error class differs.
- **No nesting.** Nothing the repo calls may open its own transaction (`trx.transaction()` throws at runtime). If a helper must work both inside and outside a transaction, it should take `Kysely<Database>` and leave transaction boundaries to the caller.
- **Nothing slow inside.** No Cube calls or other network I/O inside the callback. The transaction holds one of the pool's 10 clients and every touched row lock until it commits.
- **Tests that would demonstrate AC-183.** Partial failure: seed four documents, make the third stale, run the save, and assert that the first two are unchanged. Race: open two transactions against the test DB, have both update the same row at the same expected version, and assert that the second throws `StaleDocumentError` once the first commits.

### Open questions / unverified (query-time transactions)

- **PG 17 vs 18.** The metadata DB runs `postgres:18-alpine`, but this doc cites `/docs/17/` elsewhere. The one passage compared (the Read Committed paragraph) is identical in both; the other sections were not diffed.
- **UNVERIFIED:** after an early rejection under `Promise.all`, a statement already started and queued could still reach the connection after ROLLBACK. From reading the source only; avoided by not using `Promise.all`.
- **UNVERIFIED:** the exact server error for `START TRANSACTION ISOLATION LEVEL snapshot`.
- **UNVERIFIED:** the self-deadlock and hang when `db` is used inside the callback. Inferred from the cited pool and lock-wait docs, not reproduced.
- **Open for the user:** whether a deadlock (`40P01`) on save is retried automatically or shown as a save conflict, and whether to set `lock_timeout`, `statement_timeout` or `transaction_timeout` for the metadata DB role.
