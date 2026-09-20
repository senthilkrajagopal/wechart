---
library: wechart metadata-DB access layer (pg vs kysely vs drizzle-orm, with node-pg-migrate / kysely Migrator / drizzle-kit)
packages: [pg, "@types/pg", kysely, kysely-ctl, kysely-codegen, node-pg-migrate, drizzle-orm, drizzle-kit]
version: pg 8.23.0, @types/pg 8.23.1, kysely 0.29.6, kysely-ctl 0.21.0, kysely-codegen 0.20.0, node-pg-migrate 9.0.0 (evaluated but not selected: drizzle-orm 0.45.2, drizzle-kit 0.31.10)
researched: 2026-09-19
sources: [https://node-postgres.com/apis/pool, https://kysely.dev/docs/migrations, https://orm.drizzle.team/docs/migrations, https://www.postgresql.org/docs/17/datatype-json.html, https://www.postgresql.org/docs/17/pgcrypto.html, https://salsita.github.io/node-pg-migrate/cli]
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
