---
library: Cube (Cube Core), data sources and connection management
packages: ['@cubejs-backend/postgres-driver', '@cubejs-backend/base-driver']
version: 1.7.42
researched: 2026-09-19
sources:
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/concurrency.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/oauth-authentication.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/configuration/data-sources.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/configuration/overview.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/using-ssl-connections-to-data-source.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/custom-data-model-per-tenant.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/environment-variables.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/DEPRECATION.md
  - https://github.com/cube-js/cube/tree/v1.7.42/packages
---

# Cube data sources and connection management 1.7.42

> **Superseded in part, 2026-09-25**, by the user's architecture decisions 1 and 7 ([docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)).
> - **Superseded:**
>   - wechart's server importing Cube drivers and testing connections (:38, :52–56, :141–176, :370);
>   - wechart-owned `loadConnection` and `connectionsVersion` lookups (:101–131).
> - **Now:** xcube owns the connection lookup, decryption and tests.
> - **Still holds:** Cube's driver reference.
> - **See:** [xcube-runtime.md](./xcube-runtime.md) and [credential-sealing.md](../credential-sealing.md).

## Summary

This doc covers how Cube Core v1.7.42 connects to data sources: the supported drivers, how connections are configured (env vars, `driverFactory`), multiple and per-tenant sources, TLS, OAuth, pooling and concurrency, how connections are validated, and what happens when credentials change at runtime. It contrasts Core with the Cube Cloud UI flows and briefly covers connecting external BI tools. The tag `v1.7.42` points at commit `919434f4`, and that commit matches the npm `gitHead` of the 1.7.42 driver packages ([tag ref][tagref], [commit][commit], [npm postgres-driver][npmpg]).

**Why wechart needs it.** The user named "connection management" as a Cube capability to surface in the UI (`docs/inputs/2026-09-19-product-direction.md`, section 1). No AC or feature IDs exist yet because `docs/spec.md` hasn't been written. wechart runs on Cube Core with a local Postgres (see CLAUDE.md), so Postgres is covered in depth.

**Key findings for the spec:**

1. **Core has no runtime API for managing connections.** Connections are defined by `CUBEJS_DB_*` / `CUBEJS_DS_<NAME>_*` env vars, plus an optional `driverFactory` in the `cube.js`/`cube.py` config file ([config overview][cfgov], [env var reference][envref], [config reference][config]). Cube's REST API has no endpoint to add, edit, test or remove a connection ([REST reference][rest], [gateway source][gateway]). The documented Core path for changing a connection is to change the env vars on the API instances and the refresh worker and restart them. Cube Cloud's own UI also restarts after saving ([multiple data sources][multi], [Core deployment][coredeploy]).
2. **Connections can be made dynamic through `driverFactory`.** It can be async, and it runs once per data source per orchestrator ID ([types.ts][types], [config reference][config]). Drivers are cached per orchestrator, so a credential edit takes effect only when a new orchestrator ID is produced, the orchestrator is evicted from its LRU cache, or the process restarts ([server.ts][server], [OrchestratorStorage.ts][orchstore]). The mechanics are in "Connection lifecycle" below.
3. **The only built-in "test connection" is in dev mode.** It is the unauthenticated `POST /playground/test-connection` route, registered only when the dev server is enabled ([DevServer.ts][devserver], [server.ts][server]). For a production test-connection feature, wechart's server can import the Cube driver package and call `BaseDriver.testConnection()` / `release()` ([BaseDriver.ts][basedriver], [PostgresDriver.ts][pgdriver]). That is why `packages:` lists the Postgres driver and the base driver.
4. **TLS doesn't verify certificates by default.** With `CUBEJS_DB_SSL=true` alone, Cube builds TLS options with `rejectUnauthorized=false`, because `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED` defaults to `false` ([env.ts][envts], [BaseDriver.ts][basedriver], [Node TLS][nodetls]). See Gotchas.

## Install

**Cube runtime (docker-compose).**

- Use `cubejs/cube:v1.7.42`, published for amd64 and arm64 on 2026-09-18 ([Docker Hub][hub]).
- The image is based on `node:24.21.0-trixie-slim` and sets `NODE_ENV=production` ([latest.Dockerfile][dockerfile]).
- JDBC and Databricks need a JDK. The `cubejs/cube:v1.7.42-jdk` variant exists ([Docker Hub][hubjdk]) and installs `openjdk-21-jre-headless` ([latest-debian-jdk.Dockerfile][dockerjdk]).
- Drivers bundled in the image (all at 1.7.42): athena, bigquery, clickhouse, crate, databricks-jdbc, dremio, druid, duckdb, firebolt, hive, ksql, materialize, mongobi, mssql, mysql, oracle, pinot, postgres, prestodb, questdb, redshift, snowflake, sqlite, trino, vertica ([cubejs-docker package.json][dockerpkg]).
- Other drivers (community drivers, `jdbc`, `mysql-aurora-serverless`) need a custom image. The docs say to build one when you need npm packages with native extensions ([Core deployment][admincore]).
- Set the data-source env vars on both the API instances and the refresh worker ([Cube Core deployment][coredeploy]).

**wechart server (optional, for test-connection only):**

```sh
pnpm add @cubejs-backend/postgres-driver@1.7.42 @cubejs-backend/base-driver@1.7.42
```

- **Engines:** `node >=20.0.0`. **License:** Apache-2.0. **Peer dependencies:** none ([npm postgres-driver][npmpg], [npm base-driver][npmbase]).
- **Runtime dependencies:** `pg ^8.18.0`, `pg-query-stream ^4.1.0`, `@cubejs-backend/base-driver`, `@cubejs-backend/shared` ([npm postgres-driver][npmpg]).
- **Transitive dependencies:** `@cubejs-backend/base-driver` pulls in `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@azure/identity`, `@azure/storage-blob` and `@google-cloud/storage`, which serve export buckets ([npm base-driver][npmbase]).
- **Module format:** there is no `"type"` field (CommonJS). The `exports` map is `{"types": "./dist/src/index.d.ts", "import": "./dist/src/index.js", "require": "./index.js"}` ([package.json][pgpkg]). Version 1.7.37 added "Support named ESM exports across all drivers" ([postgres-driver CHANGELOG][pgchangelog]).
- **Server only.** These packages open TCP connections and read `process.env` ([PostgresDriver.ts][pgdriver]). They must never be bundled into the Vite web app, and credentials must never reach the browser.
- **Node 26:** the `engines` range allows it ([npm postgres-driver][npmpg]), but Cube's own image runs Node 24.21.0 ([latest.Dockerfile][dockerfile]). UNVERIFIED: Node 26 is untested by Cube as far as I found.

## Init / auth pattern

### A. Default source through env vars (documented Core path; Postgres)

```dotenv
CUBEJS_DB_TYPE=postgres
CUBEJS_DB_HOST=postgres        # compose service name
CUBEJS_DB_PORT=5432
CUBEJS_DB_NAME=sample
CUBEJS_DB_USER=cube_readonly
CUBEJS_DB_PASS=********
# TLS (see Gotchas: verification needs REJECT_UNAUTHORIZED=true)
# CUBEJS_DB_SSL=true
# CUBEJS_DB_SSL_CA=/cube/conf/ssl/ca.pem
# CUBEJS_DB_SSL_REJECT_UNAUTHORIZED=true
```

The required and optional variables come from the Postgres page ([Postgres][d-pg]). If neither `CUBEJS_DB_TYPE` nor `driverFactory` is set, Cube throws "Either CUBEJS_DB_TYPE or CreateOptions.driverFactory must be specified" ([OptsHandler.ts][opts]). With the Postgres batching build strategy (the default), a read-only user works ([Postgres][d-pg]).

### B. Multiple named sources through env vars

```dotenv
CUBEJS_DATASOURCES=default,analytics
CUBEJS_DB_TYPE=postgres
CUBEJS_DB_HOST=...
CUBEJS_DS_ANALYTICS_DB_TYPE=postgres
CUBEJS_DS_ANALYTICS_DB_HOST=...
CUBEJS_DS_ANALYTICS_DB_NAME=...
CUBEJS_DS_ANALYTICS_DB_USER=...
CUBEJS_DS_ANALYTICS_DB_PASS=...
```

- `CUBEJS_DATASOURCES` is a comma-separated list of names used to "decorate" `CUBEJS_DB_*` variables, for example `CUBEJS_DS_DATASOURCE1_DB_TYPE` ([env var reference][envref]).
- Cube builds the decorated name as `CUBEJS_DS_${dataSource.toUpperCase()}_...`, and the `default` source keeps the bare name ([env.ts][envts]).
- A cube picks its source with `data_source: analytics`. The default is `"default"` ([cube reference][cuberef]).

### C. Dynamic connections through `driverFactory`

This pattern is assembled from documented options ([config reference][config], [same-schema recipe][same], [concurrency][conc]). `loadConnection` and `connectionsVersion` are hypothetical wechart-owned lookups, not Cube APIs.

```js
// cube.js (Cube Core config file)
module.exports = {
  contextToAppId: ({ securityContext }) => `APP_${securityContext.tenant}`,
  // Required when driverFactory yields different connections per context (see Concurrency doc warning).
  contextToOrchestratorId: async ({ securityContext }) =>
    `ORCH_${securityContext.tenant}_v${await connectionsVersion(securityContext.tenant)}`,
  driverFactory: async ({ dataSource, securityContext }) => {
    const c = await loadConnection(securityContext.tenant, dataSource);
    if (!c) throw new Error(`Unknown data source: ${dataSource}`);
    // Return a DriverConfig ({ type, ...options }), not a driver instance (see Gotchas: dialect).
    return {
      type: c.type,
      host: c.host,
      port: c.port,
      database: c.database,
      user: c.user,
      password: c.password,
      ssl: c.ssl,
      maxPoolSize: c.maxPool,
    };
  },
  preAggregationsSchema: ({ securityContext }) => `pre_aggregations_${securityContext.tenant}`,
};
```

Signatures:

- `DriverFactoryFn = (context: DriverContext) => Promise<BaseDriver | DriverConfig> | BaseDriver | DriverConfig`
- `DriverContext extends RequestContext { dataSource: string; preAggregations?: boolean }`
- `ContextToOrchestratorIdFn = (context: RequestContext) => string | Promise<string>`

([types.ts][types])

The docs warn that when you override `context_to_orchestrator_id` you must also override `pre_aggregations_schema`, "Otherwise, you end up with table name clashes" ([config reference][config]). They also say that pre-aggregation refreshes which depend on `securityContext` need `scheduled_refresh_contexts` ([config reference][config]).

### D. Test-connection from the wechart server (TypeScript, ESM)

```ts
import { PostgresDriver } from '@cubejs-backend/postgres-driver';

export async function testPostgres(c: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  caPem?: string;
}): Promise<void> {
  const driver = new PostgresDriver({
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password,
    ssl: c.caPem ? { ca: c.caPem, rejectUnauthorized: true } : undefined,
    maxPoolSize: 1,
    connectionTimeoutMillis: 10_000, // pg ClientConfig field; see note
  });
  try {
    await driver.testConnection(); // opens a fresh connection and runs SELECT $1::int AS number
  } finally {
    await driver.release(); // drains and clears the pool
  }
}
```

- `PostgresDriverConfiguration = PgClientConfig & PoolUserOptions & { storeTimezone?, executionTimeout?, readOnly?, exportBucketCsvEscapeSymbol? }`. The constructor also accepts `dataSource`, `preAggregations`, `maxPoolSize`, `minPoolSize` and `testConnectionTimeout` ([PostgresDriver.ts][pgdriver]).
- Explicit config wins over env vars: the pool config is `{ host: getEnv('dbHost'), ..., ssl: this.getSslOptions(...), ...config }` ([PostgresDriver.ts][pgdriver]). Passing every field, including `ssl`, isolates the test from any `CUBEJS_*` vars in wechart's process.
- `testConnection()` calls `this.pool._factory.create()` and runs `SELECT $1::int AS number` ([PostgresDriver.ts][pgdriver]). node-postgres's `connectionTimeoutMillis` defaults to "no timeout" ([node-postgres Client][pgclient]). Passing it through the `...config` spread is source-derived and unverified by test; wechart should also wrap the call in its own timeout.

## API surface we will use

### Common connection env vars (Core and Cloud)

| Variable                                                 | Meaning                                                                             | Default                                      | Per-source decoration                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| `CUBEJS_DB_TYPE`                                         | Driver type                                                                         | none                                         | `CUBEJS_DS_<NAME>_DB_TYPE`               |
| `CUBEJS_DATASOURCES`                                     | Comma-separated source names                                                        | none                                         | n/a                                      |
| `CUBEJS_DB_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASS` | Connection                                                                          | none                                         | yes                                      |
| `CUBEJS_DB_URL`                                          | Database URL (Druid, ksqlDB)                                                        | none                                         | yes                                      |
| `CUBEJS_DB_SOCKET_PATH`                                  | Unix socket (e.g. MySQL)                                                            | none                                         | yes                                      |
| `CUBEJS_DB_SCHEMA`                                       | `information_schema` filter for model generation                                    | none                                         | yes                                      |
| `CUBEJS_DB_SSL`                                          | Enable TLS                                                                          | `false`                                      | yes                                      |
| `CUBEJS_DB_SSL_CA` / `_CERT` / `_KEY`                    | PEM contents or file path                                                           | none                                         | yes, in source                           |
| `CUBEJS_DB_SSL_SERVERNAME`                               | SNI host name                                                                       | none                                         | yes, in source                           |
| `CUBEJS_DB_SSL_CIPHERS`, `CUBEJS_DB_SSL_PASSPHRASE`      | Read in source; not in the env var reference                                        | none                                         | yes, in source                           |
| `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED`                      | Verify the server certificate; not in the env var reference                         | `false`                                      | yes, in source                           |
| `CUBEJS_DB_MAX_POOL`                                     | Max pooled connections                                                              | per driver                                   | yes                                      |
| `CUBEJS_DB_MIN_POOL`                                     | Min pool; in source only                                                            | none                                         | yes                                      |
| `CUBEJS_CONCURRENCY`                                     | Concurrent queries per queue                                                        | per driver                                   | yes                                      |
| `CUBEJS_REFRESH_WORKER_CONCURRENCY`                      | Pre-aggregation query concurrency                                                   | same as `CUBEJS_CONCURRENCY`                 | n/a                                      |
| `CUBEJS_DB_QUERY_TIMEOUT`                                | Query timeout                                                                       | `10m` (hard 20 min for Cube Store ingestion) | yes                                      |
| `CUBEJS_PRE_AGGREGATIONS_DB_*`                           | Dedicated connection for building and storing the default source's pre-aggregations | none                                         | `CUBEJS_DS_<NAME>_PRE_AGGREGATIONS_DB_*` |
| `CUBEJS_DB_EXPORT_BUCKET*`                               | Export bucket (type `gcp` or `s3`)                                                  | none                                         | yes                                      |

Sources: [env var reference][envref], [env.ts][envts], [BaseDriver.ts][basedriver], [SSL recipe][ssl], [multiple data sources][multi].

- `hasPreAggregationsEnvVars()` treats any `CUBEJS_PRE_AGGREGATIONS_*` key as a separate pre-aggregation connection, except `_SCHEMA`, `_BUILDER`, `_BACKOFF_MAX_TIME` and `_ALLOW_NON_STRICT_DATE_RANGE_MATCH`. For a named source it checks `CUBEJS_DS_<NAME>_PRE_AGGREGATIONS_*` ([env.ts][envts]).
- A custom `driver_factory` "takes precedence over" the `CUBEJS_PRE_AGGREGATIONS_*` variables ([config reference][config]).

### Postgres in depth

- **Type:** `CUBEJS_DB_TYPE=postgres`. HOST, NAME, USER and PASS are required. PORT, SSL, MAX_POOL (default `8`) and CONCURRENCY are optional ([Postgres][d-pg]).
- **Pool defaults:**
  - Pool size resolves as `max = config.maxPoolSize || config.max || CUBEJS_DB_MAX_POOL || 8` and `min = config.minPoolSize || config.min || CUBEJS_DB_MIN_POOL || 0`.
  - Other pool settings: `idleTimeoutMillis 30000`, `softIdleTimeoutMillis 30000`, `evictionRunIntervalMillis 10000`, `acquireTimeoutMillis 20000`, `testOnBorrow true`.
  - Source: [PostgresDriver.ts][pgdriver].
- **Default concurrency:** `getDefaultConcurrency()` returns `2` ([PostgresDriver.ts][pgdriver]). The concurrency doc gives "5 or less, if specified in the driver" for sources it doesn't list ([concurrency][conc]).
- **Per-connection session setup:** `SET TIME ZONE '<storeTimezone || UTC>'` and `SET statement_timeout TO <executionTimeout>`, where the timeout comes from `CUBEJS_DB_QUERY_TIMEOUT` ([PostgresDriver.ts][pgdriver]).
- **Errors:** connection failures are wrapped in `ConnectionError`. A "no pg_hba.conf entry" failure raises a `PostgresError` that suggests enabling SSL ([PostgresDriver.ts][pgdriver]).
- **Capabilities:** `{ incrementalSchemaLoading: true }`. `readOnly()` returns `!!config.readOnly`, and streaming goes through `stream()` ([PostgresDriver.ts][pgdriver]).
- **Pre-aggregations:** batching is the default and works in read-only mode. Postgres doesn't support export buckets. `count_distinct_approx` needs the HLL extension ([Postgres][d-pg]).
- **TLS:**
  - AWS RDS: set `CUBEJS_DB_SSL=true` and put the CA in `CUBEJS_DB_SSL_CA`. Google Cloud SQL may need `CUBEJS_DB_SSL_SERVERNAME`.
  - Heroku: "does not currently support verifiable certificates". The workaround is a `driverFactory` returning `new PostgresDriver({ ssl: { rejectUnauthorized: false } })`.
  - Source: [Postgres][d-pg].
- RisingWave connects with `CUBEJS_DB_TYPE=postgres` ([RisingWave][d-rw]). The Crate driver package depends on the Postgres driver ([npm crate][npmcrate]).

### Config options (`cube.js` / `cube.py`)

- **`driverFactory`:**
  - Returns a DriverConfig (`{ type, ...options }`) or a driver instance ([config reference][config], [types.ts][types]). Any other return value throws "Unexpected return type, driverFactory must return driver (dataSource: ...)" ([server.ts][server]).
  - It is "Called once per `data_source` for every orchestrator id" ([config reference][config]).
  - If it returns only `{ type }`, Cube adds `maxPoolSize = 2 * (query queue concurrency + pre-aggregation queue concurrency)` and `testConnectionTimeout`. If it returns extra keys, those keys are passed through unchanged ([server.ts][server], [DriverResolvers.ts][resolvers]).
- **`dbType`:** removed in v1.7.0; passing it throws. Use `driverFactory` or `CUBEJS_DB_TYPE` instead ([DEPRECATION.md][deprec]).
- **`contextToOrchestratorId`:** the caching key for the orchestrator, which holds the connections and queues. It is called on every request ([config reference][config]). Configuring multiple connections through `driver_factory` makes it mandatory ([concurrency][conc]). Without it, "all tenants would share a single connection to whichever data source was resolved first" ([same-schema recipe][same]).
- **`contextToAppId`:** the caching key for the compiled data model ([config reference][config]).
- **`orchestratorOptions`:** includes `testConnectionTimeout` (integer ≥ 0) and `queryCacheOptions` / `preAggregationsOptions.queueOptions.concurrency` (integer ≥ 1) ([optionsValidate.ts][optsval]). The docs "strongly recommend leaving these options set to the defaults" ([config reference][config]).
- **`preAggregationsSchema`:** defaults to `dev_pre_aggregations` or `prod_pre_aggregations`. "Cube will wipe out the contents of this database schema before use" ([config reference][config]).
- **Env vars in config and models:** use `process.env` in `cube.js`, `os.getenv` in `cube.py`, and `env_var()` in YAML Jinja. JavaScript model files can't read `process.env` directly ([env var recipe][envrecipe]).

### Driver methods (on every driver, via `BaseDriver`)

- **Connectivity:** `testConnection(): Promise<void>` (abstract) and `release(): Promise<void>`. `testConnectionTimeout(): number` defaults to `10000` ([BaseDriver.ts][basedriver]).
- **Schema browsing:** `getSchemas()`, `getTablesForSpecificSchemas(schemas)`, `getColumnsForSpecificTables(tables)`, `tablesSchema()` (an `information_schema.columns` query) and `tablesSchemaV2()` ([BaseDriver.ts][basedriver]).
- **Other:** `readOnly()`, `capabilities()`, `setLogger()`, `query()` ([BaseDriver.ts][basedriver]).
- **Driver lookup:** `driverDependencies(type)` maps a type to an npm package. For unmapped types it falls back to `@cubejs-backend/${type}-driver`, then `${type}-cubejs-driver`, and otherwise throws `Unsupported db type` ([DriverResolvers.ts][resolvers]).

### HTTP endpoints relevant to connections (Core)

| Endpoint           | Behavior                                                                                                                                                                                                           | Auth                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `GET /readyz`      | In standalone mode, tests the default source's connection plus the orchestrator connections. Returns 200 `{"health":"HEALTH"}` or 500 `{"health":"DOWN"}`                                                          | None (guest middlewares) |
| `GET /livez`       | Tests existing data-source connections. Same response shape                                                                                                                                                        | None                     |
| `GET/POST /v1/sql` | Response includes `dataSource`, the source the generated query targets                                                                                                                                             | JWT                      |
| `GET /v1/meta`     | Cube fields documented: name, type, title, meta, measures, dimensions, hierarchies, segments, folders, connectedComponent. `dataSource` is not documented. `?extended` adds joins, pre-aggregations, sql, fileName | JWT, `meta` scope        |

Sources: [gateway.ts][gateway], [REST reference][rest], [transform-meta-extended.ts][metaext]. Probe errors are logged with `driverType` ([gateway.ts][gateway]).

**Dev-server-only routes (Playground).** Do not rely on these. They are registered only when `devServer` is true, which is the default when `NODE_ENV !== 'production'` or `CUBEJS_DEV_MODE` is set ([OptsHandler.ts][opts], [server.ts][server]). They have no auth ([DevServer.ts][devserver]).

- `POST /playground/test-connection` takes `{ dataSource?, variables }`, temporarily mutates `process.env`, creates a driver, and calls `testConnection()`. It returns `'ok'` or 400 `{ error }`.
- `POST /playground/env` writes `.env` and calls `resetInstanceState()`.
- `GET /playground/db-schema` runs schema introspection.

The Core getting-started wizard writes the `.env` file this way ([create a project][corecreate]).

### Connection lifecycle: what needs a restart

- **Env vars are read at driver construction.** `getEnv` reads `process.env` on every call with no memoization ([env.ts][envts]), but drivers read those values only in their constructors ([PostgresDriver.ts][pgdriver]).
- **Drivers are cached per orchestrator.** Each orchestrator caches drivers in `driverPromise[dataSource]`, or `[dataSource@pre_agg]` for pre-aggregations. Creating a driver runs `resolveDriver` and then `testConnection()`. On failure the entry is cleared and the driver released, so the next request retries ([server.ts][server]).
- **Orchestrators live in an LRU cache.** The cache is constructed with defaults (`max: 100`, no TTL), and evicted orchestrators are released through `disposeAfter` ([OrchestratorStorage.ts][orchstore], [server.ts][server]). Release-on-evict landed in 1.7.29. A duplicate-orchestrator race was fixed in 1.7.38 ([server-core CHANGELOG][corechangelog], [PR #11834][pr11834]).
- **Resetting everything:** `resetInstanceState()` releases all connections, clears the caches and reloads env ([server.ts][server]). The only route I found that calls it is the dev-only `/playground/env` ([DevServer.ts][devserver]).
- **Conclusion (source-derived):**
  - **Env-var configuration:** add, edit and remove all need an env change and a restart of the API and refresh-worker containers. None of the docs I read (configuration overview, Core deployment) documents a hot-reload path ([config overview][cfgov], [Core deployment][coredeploy]).
  - **`driverFactory` configuration:**
    - Adding a source is picked up on first use, without a restart, as long as `CUBEJS_DATASOURCES` is unset: `assertDataSource` then accepts any name ([env.ts][envts]).
    - Editing a source takes effect only for a new orchestrator ID, for example one that includes a config version, or after eviction or a restart.
    - Removing a source means `driverFactory` throws for that name. Already-open pools stay open until eviction or restart.

### Supported drivers at v1.7.42

Every row also accepts the common vars where the docs list them. "Max pool" and "Concurrency" are the defaults stated in the docs; "≤5" means "5 or less, if specified in the driver" ([concurrency][conc]).

| Data source                                                  | `CUBEJS_DB_TYPE`        | npm package                              | Support tier (per docs)                                                 | In image                   | Source-specific env vars                                                                                                                                                                                                                                  | Max pool   | Concurrency |
| ------------------------------------------------------------ | ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| Postgres ([doc][d-pg])                                       | `postgres`              | `@cubejs-backend/postgres-driver`        | Official                                                                | yes                        | none                                                                                                                                                                                                                                                      | 8          | 2 (driver)  |
| Amazon Redshift ([doc][d-redshift])                          | `redshift`              | `@cubejs-backend/redshift-driver`        | Official                                                                | yes                        | `CUBEJS_DB_REDSHIFT_CLUSTER_IDENTIFIER`, `_AWS_REGION`, `_ASSUME_ROLE_ARN`, `_ASSUME_ROLE_EXTERNAL_ID`, `CUBEJS_DB_EXPORT_BUCKET_REDSHIFT_ARN`; IAM auth                                                                                                  | 16         | 5           |
| Google BigQuery ([doc][d-bq])                                | `bigquery`              | `@cubejs-backend/bigquery-driver`        | Official                                                                | yes                        | `CUBEJS_DB_BQ_PROJECT_ID`, `_KEY_FILE`, `_CREDENTIALS` (base64), `_LOCATION`; GCS export bucket                                                                                                                                                           | 40         | 10          |
| Snowflake ([doc][d-sf])                                      | `snowflake`             | `@cubejs-backend/snowflake-driver`       | Official                                                                | yes                        | `CUBEJS_DB_SNOWFLAKE_ACCOUNT`, `_WAREHOUSE`, `_REGION`, `_ROLE`, `_CLIENT_SESSION_KEEP_ALIVE`, `_AUTHENTICATOR` (`SNOWFLAKE` / `SNOWFLAKE_JWT` / `OAUTH`), `_PRIVATE_KEY[_PATH/_PASS]`, `_OAUTH_TOKEN[_PATH]`, `_HOST`, `_QUOTED_IDENTIFIERS_IGNORE_CASE` | 20         | 8           |
| Databricks ([doc][d-dbx])                                    | `databricks-jdbc`       | `@cubejs-backend/databricks-jdbc-driver` | Official; needs JDK                                                     | yes (use the `-jdk` image) | `CUBEJS_DB_DATABRICKS_URL`, `_ACCEPT_POLICY` (required), `_TOKEN`, `_OAUTH_CLIENT_ID`, `_OAUTH_CLIENT_SECRET`, `_CATALOG`, `CUBEJS_DB_EXPORT_BUCKET_MOUNT_DIR`                                                                                            | 8          | 10          |
| ClickHouse ([doc][d-ch])                                     | `clickhouse`            | `@cubejs-backend/clickhouse-driver`      | Official                                                                | yes                        | `CUBEJS_DB_CLICKHOUSE_READONLY`, `_COMPRESSION`; S3-only export bucket                                                                                                                                                                                    | 20         | 10          |
| Amazon Athena ([doc][d-athena])                              | `athena`                | `@cubejs-backend/athena-driver`          | Official                                                                | yes                        | `CUBEJS_AWS_KEY`, `_SECRET`, `_REGION`, `_S3_OUTPUT_LOCATION`, `_ATHENA_WORKGROUP`, `_ATHENA_CATALOG`, `_ATHENA_ASSUME_ROLE_ARN`, `_ATHENA_ASSUME_ROLE_EXTERNAL_ID`                                                                                       | not stated | 10          |
| Apache Pinot ([doc][d-pinot])                                | `pinot`                 | `@cubejs-backend/pinot-driver`           | Official; hidden from the Cloud UI list                                 | yes                        | `CUBEJS_DB_PINOT_NULL_HANDLING`, `_AUTH_TOKEN`                                                                                                                                                                                                            | not stated | 10          |
| Firebolt ([doc][d-fb])                                       | `firebolt`              | `@cubejs-backend/firebolt-driver`        | Vendor-supported                                                        | yes                        | `CUBEJS_FIREBOLT_ACCOUNT`, `_ENGINE_NAME`, `_API_ENDPOINT`                                                                                                                                                                                                | 20         | 10          |
| Vertica ([doc][d-vertica])                                   | `vertica`               | `@cubejs-backend/vertica-driver`         | Official (no support note)                                              | yes                        | `CUBEJS_DB_SCHEMA` (required)                                                                                                                                                                                                                             | 8          | ≤5          |
| DuckDB / MotherDuck; also Parquet, CSV, JSON ([doc][d-duck]) | `duckdb`                | `@cubejs-backend/duckdb-driver`          | Official                                                                | yes                        | `CUBEJS_DB_DUCKDB_MEMORY_LIMIT`, `_SCHEMA`, `_MOTHERDUCK_TOKEN`, `_DATABASE_PATH`, `_S3_*`, `_EXTENSIONS`, `_COMMUNITY_EXTENSIONS`                                                                                                                        | not stated | ≤5          |
| Presto ([doc][d-presto])                                     | `prestodb`              | `@cubejs-backend/prestodb-driver`        | Official                                                                | yes                        | `CUBEJS_DB_PRESTO_CATALOG` and `CUBEJS_DB_SCHEMA` (required), `CUBEJS_DB_PRESTO_AUTH_TOKEN`; S3/GCS export bucket                                                                                                                                         | 8          | ≤5          |
| Trino ([doc][d-trino])                                       | `trino`                 | `@cubejs-backend/trino-driver`           | Official                                                                | yes                        | Same as Presto                                                                                                                                                                                                                                            | 8          | ≤5          |
| MS SQL Server ([doc][d-mssql])                               | `mssql`                 | `@cubejs-backend/mssql-driver`           | Official                                                                | yes                        | `CUBEJS_DB_DOMAIN`, `CUBEJS_DB_MSSQL_USE_NAMED_TIMEZONES`; Windows auth via `trustedConnection` in config                                                                                                                                                 | 8          | ≤5          |
| MySQL ([doc][d-mysql])                                       | `mysql`                 | `@cubejs-backend/mysql-driver`           | Official                                                                | yes                        | `CUBEJS_DB_SOCKET_PATH`, `CUBEJS_DB_MYSQL_USE_NAMED_TIMEZONES`                                                                                                                                                                                            | 8          | ≤5          |
| RisingWave ([doc][d-rw])                                     | `postgres`              | `@cubejs-backend/postgres-driver`        | Official (no support note)                                              | yes                        | none                                                                                                                                                                                                                                                      | 8          | ≤5          |
| QuestDB ([doc][d-quest])                                     | `questdb`               | `@cubejs-backend/questdb-driver`         | Vendor-supported                                                        | yes                        | PORT required                                                                                                                                                                                                                                             | 8          | ≤5          |
| Materialize ([doc][d-mz])                                    | `materialize`           | `@cubejs-backend/materialize-driver`     | Vendor-supported                                                        | yes                        | `CUBEJS_DB_MATERIALIZE_CLUSTER`                                                                                                                                                                                                                           | 8          | ≤5          |
| ksqlDB ([doc][d-ksql])                                       | `ksql`                  | `@cubejs-backend/ksql-driver`            | Marked "Enterprise plan", but the doc gives a `.env` setup              | yes                        | `CUBEJS_DB_URL`, `CUBEJS_DB_KAFKA_HOST`, `_USER`, `_PASS`, `_USE_SSL`; streaming pre-aggregations only                                                                                                                                                    | not stated | ≤5          |
| Oracle ([doc][d-oracle])                                     | `oracle`                | `@cubejs-backend/oracle-driver`          | Community-supported; 12.1+                                              | yes                        | none                                                                                                                                                                                                                                                      | 8          | ≤5          |
| SQLite ([doc][d-sqlite])                                     | `sqlite`                | `@cubejs-backend/sqlite-driver`          | Community-supported                                                     | yes                        | NAME only                                                                                                                                                                                                                                                 | 8          | ≤5          |
| Druid ([doc][d-druid])                                       | `druid`                 | `@cubejs-backend/druid-driver`           | Community-supported                                                     | yes                        | `CUBEJS_DB_URL`                                                                                                                                                                                                                                           | 8          | ≤5          |
| MongoDB via BI Connector ([doc][d-mongo])                    | `mongobi`               | `@cubejs-backend/mongobi-driver`         | Community-supported; SSL required; Atlas BI Connector EOL June 2025     | yes                        | none                                                                                                                                                                                                                                                      | 8          | ≤5          |
| Hive / SparkSQL ([doc][d-hive])                              | `hive`                  | `@cubejs-backend/hive-driver`            | Community-supported; deprecated in 1.7.25                               | yes                        | `CUBEJS_DB_HIVE_TYPE`, `_VER`, `_THRIFT_VER`, `_CDH_VER`                                                                                                                                                                                                  | 8          | ≤5          |
| Microsoft Fabric ([doc][d-fabric])                           | not documented for Core | none found                               | Cube Cloud only, Enterprise plan (JDBC URL entered in the Cloud wizard) | n/a                        | n/a                                                                                                                                                                                                                                                       | n/a        | n/a         |
| SingleStore ([doc][d-s2])                                    | not documented for Core | none found                               | Cube Cloud only, Enterprise plan                                        | n/a                        | n/a                                                                                                                                                                                                                                                       | n/a        | n/a         |

- **Tier wording.** "Community-supported and is not maintained by Cube or the database vendor" appears on the Oracle, SQLite, Druid, MongoDB and Hive pages. "Supported by its vendor" appears on the Firebolt, QuestDB and Materialize pages (see each row's doc link).
- **In the repo and on npm at 1.7.42, but with no docs page:**
  - `crate` → `@cubejs-backend/crate-driver`
  - `dremio` → `@cubejs-backend/dremio-driver`
  - `jdbc` → `@cubejs-backend/jdbc-driver`, which needs Java through optional deps. DEPRECATION.md suggests it as the Hive replacement.
  - `mysqlauroraserverless` → `@cubejs-backend/mysql-aurora-serverless-driver`
  - Sources: [DriverDependencies.ts][deps], [npm dremio][npmdremio], [npm jdbc][npmjdbc], [npm aurora][npmaurora], [DEPRECATION.md][deprec].
- **Type union.** The full `DatabaseType` union has 28 literals, including `cubestore` ([types.ts][types]).
- **Removed:** the Elasticsearch driver, in v1.7.0 ([DEPRECATION.md][deprec]).
- **Third-party community packages** listed in the docs: `arangodb-cubejs-driver`, `cosmosdb-cubejs-driver`, `cratedb-cubejs-driver`, `mydremio-cubejs-driver`, `dremio-odbc-cubejs-driver`, `opendistro-cubejs-driver`, `cubejs-hana-driver`, `trino-cubejs-driver`, `@knowitall/vertica-driver` ([data sources index][dsidx]).
- **Out of scope for Cube:** "Cube is not designed to access data files directly or fetch data from REST, or GraphQL, or any other API." Files are read through DuckDB ([data sources index][dsidx]).

### SSL/TLS

- `CUBEJS_DB_SSL_CA`, `_CERT` and `_KEY` accept PEM contents or a path to one ([SSL recipe][ssl], [env var reference][envref]). Paths are detected and read with `fs.readFileSync` ([BaseDriver.ts][basedriver]).
- The TLS object is built only when `CUBEJS_DB_SSL` or `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED` is true. It includes `ca`, `cert`, `key`, `ciphers`, `passphrase`, `servername` and `rejectUnauthorized` ([BaseDriver.ts][basedriver]).
- `driverFactory` can pass Node TLS options directly ([Postgres][d-pg], [SSL recipe][ssl]).
- In Cloud, custom certificates go in Settings → Configuration ([SSL recipe][ssl]).

### OAuth and credential types

- **Core, through env vars:**
  - Snowflake: `CUBEJS_DB_SNOWFLAKE_AUTHENTICATOR=OAUTH` with `_OAUTH_TOKEN` or `_OAUTH_TOKEN_PATH`, or `SNOWFLAKE_JWT` with a private key ([Snowflake][d-sf]).
  - Databricks: OAuth M2M through `_OAUTH_CLIENT_ID` and `_OAUTH_CLIENT_SECRET` ([Databricks][d-dbx]).
  - Redshift and Athena: IAM or assume-role ([Redshift][d-redshift], [Athena][d-athena]).
- **Cube Cloud only, beta:** per-user OAuth reads `securityContext.cubeCloud.userCredentials.<source>.{status, accessToken}` in `driver_factory` and uses `context_to_orchestrator_id` to isolate each user. The service-account credential "is used only as a fallback for Cube's internal liveness checks and background operations" ([OAuth][oauth]).

### Cross-source querying

- A single SQL API query can UNION cubes from different sources. "A query that joins two cubes on different data sources is rejected" ([cross-data-source queries][crossds]).
- `rollup_join` joins two rollups from different sources through Cube Store ([pre-aggregations reference][preaggref]).

### Visualization tools (brief)

- **SQL API.** External tools connect through the SQL API, which speaks the Postgres wire protocol. In Core it is disabled by default. Enable it with `CUBEJS_PG_SQL_PORT` plus `CUBEJS_SQL_USER` / `CUBEJS_SQL_PASSWORD`, or with `checkSqlAuth` / `canSwitchSqlUser` ([SQL API][sqlapi], [env var reference][envref]).
- **Listed tools:** QuickSight, Metabase, Superset, Tableau, Power BI, Excel, Google Sheets, Hex, Jupyter, Retool and others ([visualization tools][viz]).
- **Semantic Layer Sync** pushes the data model to Superset, Preset or Tableau (Tableau on the Enterprise plan). The docs describe it running on deploy, on a schedule, or from IDE → Integrations ([Semantic Layer Sync][sls]). Superset's page recommends it for Cloud and manual SQL API setup for Core ([Superset][vizsuperset]).
- **DAX API** (Power BI) and **MDX API** (Excel, preview) are on the Enterprise plan ([DAX][dax], [MDX][mdx]).

### Cube Cloud connect-to-data flows (for contrast)

- **Deployment wizard:** the new-deployment wizard has a "Set up a database connection" step ([Fabric][d-fabric], [SingleStore][d-s2]).
- **Settings → Data Sources:**
  - **Add:** "+ Add data source", then driver, name and form. "Cube Cloud tests the connection before saving; on success it persists the env vars and restarts the development environment, on failure it surfaces the driver's error and saves nothing."
  - **Edit and delete:** Edit updates credentials. Delete works for named sources only; to remove the default, clear the bare `CUBEJS_DB_*` vars by hand. `CUBEJS_DATASOURCES` is auto-maintained. "The UI is a friendlier surface over the deployment's environment variables."
  - Source: [multiple data sources][multi].
- **Cloud-only extras:**
  - OIDC workload identity (Enterprise) for AWS, GCP, Azure and Snowflake ([OIDC][oidc])
  - PrivateLink on Dedicated Infrastructure ([PrivateLink][plink])
  - Metadata API `GET /v1/data-sources` ([REST reference][rest])
  - Sources appear in Workbooks' Source SQL tabs ([multiple data sources][multi])
- **Control Plane API:** it documents no endpoints for data sources or env vars ([Control Plane API][cpapi]).

## Capability inventory

| Capability                                            | Core or Cloud-only                                             | API/config surface to drive it                                                                                                      | Candidate wechart UI surface                                   | Source                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Configure the default source (type and credentials)   | Core                                                           | `CUBEJS_DB_TYPE` + `CUBEJS_DB_*` on API and refresh worker, then restart; or `driverFactory`                                        | Connections list, connection editor                            | [env ref][envref], [Postgres][d-pg], [config][config]                  |
| Add a named source                                    | Core                                                           | `CUBEJS_DATASOURCES` + `CUBEJS_DS_<NAME>_*`, then restart; or `driverFactory` keyed on `dataSource` with `CUBEJS_DATASOURCES` unset | "Add connection" with name validation                          | [env ref][envref], [env.ts][envts]                                     |
| Edit credentials                                      | Core, with a restart or a new orchestrator ID (source-derived) | Env change + restart; or `driverFactory` + versioned `contextToOrchestratorId`                                                      | Edit form with an "apply" state and restart/propagation notice | [server.ts][server], [OrchestratorStorage.ts][orchstore]               |
| Remove a source                                       | Core                                                           | Remove env vars + restart, or `driverFactory` throws; cubes still referencing it fail                                               | Delete dialog listing dependent cubes                          | [env.ts][envts], [cube ref][cuberef]                                   |
| Test connection before saving                         | No production API in Core; built in on Cloud                   | wechart server: `new <Driver>(cfg).testConnection()` then `release()`; Core dev-only `POST /playground/test-connection`             | "Test connection" button                                       | [BaseDriver.ts][basedriver], [DevServer.ts][devserver], [multi][multi] |
| Health of live connections                            | Core                                                           | `GET /readyz` (default source), `GET /livez` (existing connections); no per-source detail                                           | Global status badge                                            | [gateway.ts][gateway], [REST ref][rest]                                |
| Assign a cube to a source                             | Core                                                           | `data_source` in cube YAML/JS; read back through `/v1/sql` `dataSource`                                                             | Data-source dropdown in the cube editor                        | [cube ref][cuberef], [REST ref][rest]                                  |
| Per-tenant sources                                    | Core                                                           | `driverFactory` + `contextToOrchestratorId` + `contextToAppId` + `preAggregationsSchema` + `scheduledRefreshContexts`               | Tenant → connection mapping                                    | [same-schema][same], [config][config]                                  |
| Per-user OAuth passthrough                            | Cloud-only (beta)                                              | `securityContext.cubeCloud.userCredentials` in `driver_factory`                                                                     | n/a for Core                                                   | [OAuth][oauth]                                                         |
| Driver auth methods (key pair, OAuth token, M2M, IAM) | Core                                                           | Per-driver env vars (Snowflake, Databricks, Redshift, Athena)                                                                       | Auth-method selector per driver                                | [Snowflake][d-sf], [Databricks][d-dbx], [Redshift][d-redshift]         |
| TLS: CA, client cert, SNI, verification               | Core                                                           | `CUBEJS_DB_SSL*`, `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED`, or `ssl` in `driverFactory`                                                  | TLS section with PEM upload and "verify certificate" toggle    | [SSL recipe][ssl], [BaseDriver.ts][basedriver]                         |
| Query concurrency                                     | Core                                                           | `CUBEJS_CONCURRENCY` (per source), `CUBEJS_REFRESH_WORKER_CONCURRENCY`, `orchestratorOptions`                                       | Advanced settings                                              | [concurrency][conc], [env ref][envref]                                 |
| Connection pool                                       | Core                                                           | `CUBEJS_DB_MAX_POOL`, `CUBEJS_DB_MIN_POOL`, `maxPoolSize` in `driverFactory`                                                        | Advanced settings                                              | [concurrency][conc], [PostgresDriver.ts][pgdriver]                     |
| Query timeout                                         | Core                                                           | `CUBEJS_DB_QUERY_TIMEOUT`                                                                                                           | Advanced settings                                              | [env ref][envref]                                                      |
| Separate pre-aggregation build connection             | Core                                                           | `CUBEJS_[DS_<NAME>_]PRE_AGGREGATIONS_DB_*`                                                                                          | "Pre-aggregation build credentials" section                    | [env ref][envref], [env.ts][envts]                                     |
| Export bucket                                         | Core (not Postgres)                                            | `CUBEJS_DB_EXPORT_BUCKET*`                                                                                                          | Per-driver advanced section                                    | [env ref][envref], [Postgres][d-pg]                                    |
| Schema and table browsing                             | Core (driver API); dev-only route                              | `getSchemas` / `getTablesForSpecificSchemas` / `getColumnsForSpecificTables`; `CUBEJS_DB_SCHEMA`                                    | Table browser for model generation                             | [BaseDriver.ts][basedriver], [DevServer.ts][devserver]                 |
| Cross-source queries                                  | Core                                                           | SQL API UNION; `rollup_join`                                                                                                        | Query builder rule: no cross-source joins                      | [cross-ds][crossds], [pre-agg ref][preaggref]                          |
| Community or custom drivers                           | Core                                                           | Custom Docker image; `<type>-cubejs-driver` naming or a `driverFactory` instance                                                    | Driver catalog limited to installed drivers                    | [DriverResolvers.ts][resolvers], [Core deployment][admincore]          |
| Connection wizard                                     | Core dev-mode only (writes `.env`); Cloud wizard               | `/playground/env`; Cloud "Set up a database connection"                                                                             | Do not reuse the Core route                                    | [DevServer.ts][devserver], [Fabric][d-fabric]                          |
| Env-var management UI                                 | Cloud-only                                                     | Settings → Environment Variables                                                                                                    | n/a                                                            | [multi][multi]                                                         |
| Data-source listing API                               | Cloud-only                                                     | Metadata API `GET /v1/data-sources`                                                                                                 | n/a; wechart keeps its own registry                            | [REST ref][rest]                                                       |
| Keyless cloud auth                                    | Cloud-only (Enterprise)                                        | OIDC workload identity                                                                                                              | n/a                                                            | [OIDC][oidc]                                                           |
| Private connectivity                                  | Cloud Dedicated                                                | AWS PrivateLink and equivalents                                                                                                     | n/a                                                            | [PrivateLink][plink]                                                   |
| BI tool access                                        | Core                                                           | SQL API (`CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_USER` / `_PASSWORD`, `checkSqlAuth`)                                                     | "Connect a BI tool" info page                                  | [SQL API][sqlapi]                                                      |
| Semantic Layer Sync                                   | Cloud-documented; Core UNVERIFIED                              | `semantic_layer_sync` config                                                                                                        | n/a pending verification                                       | [SLS][sls], [types.ts][types]                                          |
| DAX / MDX APIs                                        | Enterprise plan                                                | DAX API, MDX API                                                                                                                    | n/a                                                            | [DAX][dax], [MDX][mdx]                                                 |

## Gotchas

- **TLS without verification by default.**
  - `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED` defaults to `'false'`, and Cube assigns it to `ssl.rejectUnauthorized` ([env.ts][envts], [BaseDriver.ts][basedriver]). With `rejectUnauthorized: false`, Node skips certificate verification (the Node default is `true`) ([Node TLS][nodetls]).
  - The Postgres RDS guidance only says to set `CUBEJS_DB_SSL=true` and `CUBEJS_DB_SSL_CA` ([Postgres][d-pg]). `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED` is absent from the env var reference ([env var reference][envref]).
  - wechart should set it to `true` whenever TLS is on, and treat "verify off" as an explicit, visible choice.
- **`dbType` is gone.** It was removed in 1.7.0 ([DEPRECATION.md][deprec]).
- **Return a DriverConfig, not a driver instance, when sources have different types.** If `driverFactory` returns a driver instance, the SQL dialect type comes from the global `process.env.CUBEJS_DB_TYPE`, not from the source ([OptsHandler.ts][opts]).
- **`driverFactory` is also called to resolve dialects.** Keep it side-effect-free and cheap, and don't open connections inside it ([OptsHandler.ts][opts]).
- **Pool size precedence (source-derived; needs a test).** When `driverFactory` returns only `{ type }` (the env-var path), Cube passes `maxPoolSize = 2 × (query concurrency + pre-aggregation concurrency)`. The Postgres driver prefers `config.maxPoolSize` over `CUBEJS_DB_MAX_POOL` ([DriverResolvers.ts][resolvers], [server.ts][server], [PostgresDriver.ts][pgdriver]). So `CUBEJS_DB_MAX_POOL` may have no effect on that path. The concurrency doc says the pool must be larger than the queues' concurrent connections ([concurrency][conc]).
- **Postgres default concurrency is 2**, not the 5 given for unlisted sources ([PostgresDriver.ts][pgdriver], [concurrency][conc]).
- **No connect timeout on Postgres tests.** The Postgres driver sets no `connectionTimeoutMillis` ([PostgresDriver.ts][pgdriver]), and pg's default is no timeout ([node-postgres Client][pgclient]). `testConnectionTimeout` is stored in `BaseDriver` but not applied inside the Postgres driver ([BaseDriver.ts][basedriver], [PostgresDriver.ts][pgdriver]).
- **Credential edits don't propagate to cached drivers.** Cached drivers keep the old credentials, and old orchestrators keep their pools open until LRU eviction (max 100) or restart ([OrchestratorStorage.ts][orchstore]). Issue #6374 reports `driverFactory` appearing "static" across contexts (closed, with no visible maintainer answer) ([issue 6374][i6374]).
- **`CUBEJS_DATASOURCES` gating.** When it is set, any name not in the list throws "The X data source is missing in the declared CUBEJS_DATASOURCES", and that includes `default` ([env.ts][envts]). The docs example lists `default` explicitly ([env var reference][envref]).
- **Source naming.** Cloud requires letters, digits and underscores, starting with a letter. `default` is reserved, and names ending `_db`, `_aws` or `_jdbc` can collide with the env parser ([multiple data sources][multi]). In Core the name is only uppercased into the env key ([env.ts][envts]). wechart should apply Cloud's rules.
- **Orchestrator overrides need companions.** Overriding `contextToOrchestratorId` requires overriding `preAggregationsSchema`, and security-context-dependent refresh requires `scheduledRefreshContexts` ([config reference][config]).
- **`/v1/meta` doesn't document a cube's `dataSource`.** The feature request was closed as not planned ([REST reference][rest], [issue 8620][i8620]). wechart should own the cube → source mapping in the model files it edits.
- **Dev mode is a security hole for connection management.**
  - `/playground/env` and `/playground/test-connection` are unauthenticated and can rewrite `.env` or mutate `process.env` ([DevServer.ts][devserver]).
  - The gateway enforces JWT checks only when `NODE_ENV === 'production'` or `enforceSecurityChecks` is set ([gateway.ts][gateway]).
  - The official image sets `NODE_ENV=production` ([latest.Dockerfile][dockerfile]). The docs say dev mode must be off in production ([Core deployment][admincore]).
- **Health probes are coarse.** `/readyz` and `/livez` are unauthenticated and return only HEALTH or DOWN; details go to logs ([gateway.ts][gateway]). Version 1.7.39 redacts query values in log events ([server-core CHANGELOG][corechangelog]).
- **Least privilege.** Postgres batching works read-only ([Postgres][d-pg]). `preAggregationsSchema` contents are wiped by Cube ([config reference][config]). Never commit credential env vars ([config overview][cfgov]).
- **Cloud-only and deprecated drivers.** MS Fabric and SingleStore are Cloud-only (Enterprise) ([Fabric][d-fabric], [SingleStore][d-s2]). Hive is deprecated ([DEPRECATION.md][deprec]). The MongoDB Atlas BI Connector reached end of life in June 2025 ([MongoDB][d-mongo]).
- **Node versions.** Node 22 has been deprecated since 1.7.0, and Cube advises Node 24+ ([DEPRECATION.md][deprec]).
- **Network path.** A test run from wechart's server checks wechart's network path to the database, not Cube's. That is a design consequence of testing outside Cube, not a Cube behavior.

## Open questions / unverified

1. Context7 tools weren't available in this session. Every claim comes from the pinned docs and source at `v1.7.42`, npm and Docker Hub.
2. UNVERIFIED (source-derived): whether `CUBEJS_DB_MAX_POOL` is overridden by the computed `maxPoolSize` on the env-var path. Confirm with an integration test that inspects the pool size.
3. UNVERIFIED: whether `connectionTimeoutMillis` passed to `new PostgresDriver({...})` reaches `pg`. It is inferred from the `...config` spread.
4. UNVERIFIED: which component uses `BaseDriver.testConnectionTimeout()`. I didn't trace it past `BaseDriver`.
5. UNVERIFIED: whether `/v1/meta?extended` includes `dataSource` on cubes. `transformCube` spreads the input cube, whose fields I didn't trace.
6. UNVERIFIED: whether two orchestrator IDs that differ only by a config version can safely share one `preAggregationsSchema`. The docs don't cover it.
7. UNVERIFIED: whether Semantic Layer Sync runs in Core. `semanticLayerSync` exists in `CreateOptions` ([types.ts][types]), but the docs describe Cloud triggers only. DAX and MDX availability in Core is also unverified.
8. UNVERIFIED: Node 26 compatibility of the driver packages. Cube builds and ships on Node 24.21.0.
9. Constructor option types for drivers other than Postgres weren't researched. Add those packages to `packages:` only after their configs are verified.
10. UNVERIFIED: which driver Cube Cloud uses for MS Fabric and SingleStore. The docs show only the Cloud wizard.
11. The `docs/inputs/` file makes no third-party claims about data sources. Its only relevant content is the user's request to surface "connection management".

[tagref]: https://api.github.com/repos/cube-js/cube/git/ref/tags/v1.7.42
[commit]: https://api.github.com/repos/cube-js/cube/commits/v1.7.42
[release]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[ctd]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/index.mdx
[multi]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx
[conc]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/concurrency.mdx
[oauth]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/oauth-authentication.mdx
[dsidx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/index.mdx
[cfgds]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/configuration/data-sources.mdx
[cfgov]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/configuration/overview.mdx
[ssl]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/using-ssl-connections-to-data-source.mdx
[same]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx
[tenantmodel]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/custom-data-model-per-tenant.mdx
[envrecipe]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/environment-variables.mdx
[config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[envref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[cuberef]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[preaggref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[crossds]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/data-modeling/cross-data-source-queries.mdx
[rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[sqlapi]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[dax]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/dax-api/index.mdx
[mdx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/mdx-api.mdx
[viz]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/visualization-tools/index.mdx
[vizsuperset]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/visualization-tools/superset.mdx
[sls]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/index.mdx
[cpapi]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/control-plane-api.mdx
[oidc]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/oidc/index.mdx
[plink]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/dedicated/aws/private-link.mdx
[admincore]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/core.mdx
[coredeploy]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/deployment.mdx
[corecreate]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/getting-started/create-a-project.mdx
[d-pg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
[d-athena]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/aws-athena.mdx
[d-redshift]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/aws-redshift.mdx
[d-bq]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/google-bigquery.mdx
[d-sf]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/snowflake.mdx
[d-dbx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/databricks-jdbc.mdx
[d-ch]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/clickhouse.mdx
[d-fabric]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/ms-fabric.mdx
[d-s2]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/singlestore.mdx
[d-pinot]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/pinot.mdx
[d-fb]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/firebolt.mdx
[d-vertica]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/vertica.mdx
[d-duck]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/duckdb.mdx
[d-presto]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/presto.mdx
[d-trino]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/trino.mdx
[d-mssql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/ms-sql.mdx
[d-mysql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/mysql.mdx
[d-rw]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/risingwave.mdx
[d-quest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/questdb.mdx
[d-mz]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/materialize.mdx
[d-ksql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/ksqldb.mdx
[d-oracle]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/oracle.mdx
[d-sqlite]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/sqlite.mdx
[d-druid]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/druid.mdx
[d-mongo]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/mongodb.mdx
[d-hive]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/hive.mdx
[deprec]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/DEPRECATION.md
[types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/types.ts
[server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[opts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts
[optsval]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/optionsValidate.ts
[orchstore]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OrchestratorStorage.ts
[resolvers]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DriverResolvers.ts
[deps]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DriverDependencies.ts
[devserver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DevServer.ts
[envts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[basedriver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-base-driver/src/BaseDriver.ts
[pgdriver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[pgpkg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-postgres-driver/package.json
[pgchangelog]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-postgres-driver/CHANGELOG.md
[corechangelog]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/CHANGELOG.md
[gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[metaext]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts
[dockerpkg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-docker/package.json
[dockerfile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-docker/latest.Dockerfile
[dockerjdk]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-docker/latest-debian-jdk.Dockerfile
[hub]: https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.42
[hubjdk]: https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.42-jdk
[npmpg]: https://registry.npmjs.org/@cubejs-backend/postgres-driver/latest
[npmbase]: https://registry.npmjs.org/@cubejs-backend/base-driver/latest
[npmjdbc]: https://registry.npmjs.org/@cubejs-backend/jdbc-driver/latest
[npmdremio]: https://registry.npmjs.org/@cubejs-backend/dremio-driver/latest
[npmcrate]: https://registry.npmjs.org/@cubejs-backend/crate-driver/latest
[npmaurora]: https://registry.npmjs.org/@cubejs-backend/mysql-aurora-serverless-driver/latest
[pr11834]: https://github.com/cube-js/cube/pull/11834
[i8620]: https://github.com/cube-js/cube/issues/8620
[i6374]: https://github.com/cube-js/cube/issues/6374
[pgclient]: https://node-postgres.com/apis/client
[nodetls]: https://nodejs.org/api/tls.html
