---
library: Cube Core (configuration, deployment, multitenancy, Core operations)
packages: [@cubejs-backend/server-core, cubejs-cli]
version: 1.7.42
researched: 2026-09-19
sources: [
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/config.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/cli.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/architecture.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/deployment.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/getting-started/create-a-project.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/dev-mode.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/explore-analyze/playground.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/embedding/multitenancy.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/configuration/custom-data-model-per-tenant.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx,
  https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx,
  https://github.com/cube-js/cube/tree/v1.7.42/docs-mintlify/docs/integrations,
  https://github.com/cube-js/cube/blob/v1.7.42/DEPRECATION.md,
  https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md,
  https://github.com/cube-js/cube/releases/tag/v1.7.42,
  https://hub.docker.com/r/cubejs/cube,
  https://hub.docker.com/r/cubejs/cubestore
]
---

# Cube Core 1.7.42: configuration, deployment, multitenancy, and Core operations

## Summary

This doc covers how Cube Core 1.7.42 is configured, deployed, split into tenants, and observed. It also marks which neighbouring capabilities are Cloud-only. The tag `v1.7.42` points to tag object `68eeb0e78a4392ac25d6a1b88398516f5502a0ec`, published 2026-09-18 and not a prerelease ([release]).

**Why wechart needs it.** wechart has no spec yet, so there are no AC or feature IDs to cite. This doc feeds product-direction input §1 in `docs/inputs/2026-09-19-product-direction.md`: surface nearly all Cube capabilities, "security, pre aggregations, jobs if any, connection management …". It also sets up the decided local stack (docker-compose with Cube API, Cube Store, sample Postgres, and wechart's metadata DB).

**Findings that shape wechart's design:**

1. **Almost all deployment config is static.** Env vars and `cube.js`/`cube.py` options are read when the process starts. Core has one in-process reload path, `resetInstanceState()`, and the only route that reaches it is `POST /playground/env`. That route exists only in dev mode and has no authentication ([src-devserver], [src-core]). In production, changing env or static options means restarting the container.
2. **Runtime-dynamic behaviour comes from function-valued options.** Some run on every request, some once per ID, some on every refresh tick; the full matrix is in API surface §3. A hook can read state that wechart's server owns, such as tenants, connections, API scopes, or model files. This is the supported way to change behaviour without a restart ([cfg], [src-core]).
3. **In production mode, model file changes are not picked up by default.** The compiler version is the constant `'default_schema_version'` unless you define `schemaVersion`, or set `devServer`/`fastReload`, which hash the model files ([src-compiler]).
4. **Core's runtime HTTP surface for operations is small:**
   - `/readyz` and `/livez`
   - the pre-aggregation Jobs API
   - query cancellation
   - `/cubejs-system/*` pre-aggregation endpoints, which are undocumented and only registered when a secret is set
   - Cube Store's `/readyz` and `/livez` on status port 3031, which are only visible in source

   Sources: [rest-ref], [src-gw], [src-cs-status].

5. **Cloud-only:**
   - query history, performance insights, the pre-aggregations console, audit log, monitoring integrations
   - autoscaling
   - the new `cube` CLI
   - Semantic Layer Sync, the MCP server, dbt pull
   - the Excel and Sheets add-ins, the DAX API
   - the Snowflake Semantic Views, Slack, and agent-skills integrations

   Core connects BI tools through the Postgres-protocol SQL API. Sources are in the Capability inventory.

## Install

**Docker images for v1.7.42, confirmed on Docker Hub ([hub-cube], [hub-cs]):**

| Image:tag                          | Platforms                | Per-platform digest(s)                                                                                                                                           |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cubejs/cube:v1.7.42`              | linux/amd64, linux/arm64 | amd64 `sha256:418fbc7cc5b05dad4838497a8b8703c9e676da637aa76e1008fa86b9b9634edc`; arm64 `sha256:cffa7c8a515e667dac9fc1b5ccbb3d5ce172e4db79d1ebc0676b9721e42b38ca` |
| `cubejs/cube:v1.7.42-jdk`          | linux/amd64 only         | `sha256:61db792f1a0d3f71b4351925430d870ededcceaff27dcf72535f2d200993933f`                                                                                        |
| `cubejs/cubestore:v1.7.42`         | **linux/amd64 only**     | `sha256:77aa592d7aad6a225170e330bf1d736959c1113744c765d9126e8210bbcb80e9`                                                                                        |
| `cubejs/cubestore:v1.7.42-arm64v8` | linux/arm64              | `sha256:817ee78fbdd3bccebfe9bb5fd8b637f8ea8e88dec284a38a39b5469729b6177c`                                                                                        |
| `cubejs/cubestore:v1.7.42-non-avx` | linux/amd64 (no AVX)     | `sha256:65409382a70830305e54be71fdcd071e81839b016e4d742d8de68d681b71449b`                                                                                        |

```bash
docker pull cubejs/cube:v1.7.42
docker pull cubejs/cubestore:v1.7.42          # amd64 hosts
docker pull cubejs/cubestore:v1.7.42-arm64v8  # arm64 hosts (e.g., Apple Silicon)
```

- Cube's own deployment guidance says to use specific locked versions instead of `latest` in production ([deploy]). It also says Apple Silicon users should use the `arm64v8` Cube Store tag ([deploy]).

**What is inside `cubejs/cube:v1.7.42` ([src-dockerfile]):**

- Base image `node:24.21.0-trixie-slim`, with `python3.13` and `libpython3.13-dev`.
- `ENV NODE_ENV=production` and `NODE_PATH=/cube/conf/node_modules:/cube/node_modules`.
- The `cubejs` CLI is symlinked to `/usr/local/bin/cubejs`.
- `WORKDIR /cube/conf`, `EXPOSE 4000`, `CMD ["cubejs", "server"]`.
- The Dockerfile installs no `curl` or `wget`.
- v1.7.0 changes: Node 24, Debian Trixie, Python 3.13, and Java 21 in `-jdk`. "Users who install custom Python packages into the Cube image must target Python 3.13" ([chlog]). v1.7.42 itself only bumps Node from 24.18.0 to 24.21.0 ([release]).

**What is inside `cubejs/cubestore:v1.7.42` ([src-cs-dockerfile]):**

- Base image `debian:trixie-slim` with only `libssl3t64` and `ca-certificates` installed.
- `WORKDIR /cube`, `EXPOSE 3306`, `CMD ["./cubestored"]`.
- No `HEALTHCHECK` and no `VOLUME`.

**npm packages, only if wechart code imports them:**

- `@cubejs-backend/server-core@1.7.42`: Apache-2.0, `engines.node >=20.0.0`, types at `dist/src/index.d.ts`, no `exports` map ([npm-core]). It depends on `@cubejs-backend/native@1.7.42`, a Rust/Neon module built with the `napi-1`, `napi-4`, and `napi-6` features ([src-native-cargo]). Its prebuilt binaries are downloaded from the GitHub release on postinstall ([src-native-pkg]). v1.7.42 ships native builds for darwin-arm64, darwin-x64, linux-glibc arm64/x64, and win32-x64, and **none for linux-musl** ([release]).
- `cubejs-cli@1.7.42`: bin `cubejs`, `engines.node >=20.0.0` ([npm-cli]).

```bash
pnpm add -D cubejs-cli@1.7.42          # optional: validate/token/typegen from wechart tooling
# pnpm add @cubejs-backend/server-core@1.7.42   # only if a Node process outside the Cube image needs FileRepository etc.
```

**The new `cube` CLI is Cloud-only.** It installs via `curl -fsSL https://raw.githubusercontent.com/cube-js/cube/master/install-cli.sh | sh`. It "works with the Cube cloud platform. It is not required for running Cube Core locally" ([cli-doc]).

## Init / auth pattern

**Runtime split.** Cube runs as its own service from the official image, on Node 24.21 inside the container. wechart's Node 26 server and Vite/React UI talk to Cube over HTTP.

- Embedding Cube into an Express app "is deprecated due to performance and reliability considerations"; Cube should be deployed as a microservice ([dep]).
- Cube never states support for Node 26. This only matters if wechart embeds Cube packages, which the deprecation note advises against.

**Project layout mounted at `/cube/conf`:**

- `cube.js` or `cube.py`. A `cube.ts` config has not been supported since v1.7.34 ([cfg], [chlog]).
- `model/`: the default `schemaPath` is `model` ([cfg]). The image's working directory is `/cube/conf` ([src-dockerfile]).

Minimal `cube.js` (CommonJS, as in every example in the reference; option functions may be sync or async) ([cfg]):

```js
// cube/cube.js — mounted at /cube/conf/cube.js
module.exports = {
  // Example only: restrict CORS to the wechart UI origin if the browser calls Cube directly.
  // http: { cors: { origin: 'http://localhost:5173' } },
};
```

**Production-mode prerequisites** for both the API and the refresh worker:

- `CUBEJS_DEV_MODE=false` ([deploy]).
- `CUBEJS_API_SECRET` must be set, or an equivalent way to verify tokens. Without it the server throws `"... is required option(s)"` ([src-opts]).
- `CUBEJS_CUBESTORE_HOST` must point at the Cube Store router. The cache/queue driver defaults to `cubestore` in production ([cfg], [deploy]).

**Auth, briefly.** The details belong in the auth research doc.

- REST requests carry a JWT verified with `CUBEJS_API_SECRET`.
- `CUBEJS_API_SECRETS` holds a comma-separated list of secrets accepted during rotation.
- You can use `jwt.*` / `CUBEJS_JWK_URL` / `CUBEJS_JWT_*` or a custom `checkAuth` instead ([env], [cfg]).
- Because the secret signs any security context, token minting belongs on wechart's server, not in the browser.
- For local smoke tests, the CLI inside the image can mint a token: `docker compose exec cube_api cubejs token -p tenant_id=demo`. The default expiry is `'30 days'`, and the secret comes from `-s` or `CUBEJS_API_SECRET` ([src-cli-token], [src-dockerfile]).

**CORS, if the browser calls Cube directly:**

- Cube merges `{ allowedHeaders: 'authorization,content-type,x-request-id' }` with the user's `http.cors` ([src-server]).
- It passes the result to the Express `cors` middleware, whose default is `"origin": "*"` ([cors]).
- If wechart proxies Cube through its own server, CORS on Cube does not apply.

**Verify:** `GET http://localhost:4000/readyz` returns `200 {"health":"HEALTH"}` or `500 {"health":"DOWN"}`. It is not prefixed by the base path and needs no auth ([rest], [rest-ref]).

## API surface we will use

### 1. Config file options (`cube.js` camelCase / `cube.py` snake_case), documented at v1.7.42

Every option below comes from [cfg] unless another source is cited. "Called" says when a function-valued option runs.

**Data model**

| Option                                     | Type / default / env                                                                                                                       | Called          | Controls                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| `schemaPath` / `schema_path`               | string, `model`, `CUBEJS_SCHEMA_PATH`                                                                                                      | startup         | Path to the data model files.                                                       |
| `contextToAppId` / `context_to_app_id`     | fn(ctx) → string                                                                                                                           | every request   | Cache key for the compiled data model. Multitenancy **for model compilation only**. |
| `repositoryFactory` / `repository_factory` | fn(ctx) → `FileRepository` or `{ dataSchemaFiles: async () => [{ fileName, content }] }` (Python: `file_repository(path)` or `list[dict]`) | once per app ID | Where model files come from: disk per tenant, or any external store.                |
| `schemaVersion` / `schema_version`         | fn(ctx) → string                                                                                                                           | every request   | Recompiles the model when the returned string changes. Do not return random values. |
| `compilerCacheSize`                        | int, 250, `CUBEJS_COMPILER_CACHE_SIZE`                                                                                                     | startup         | Max compiled models in the LRU cache. The cache cannot be disabled.                 |
| `maxCompilerCacheKeepAlive`                | ms, no expiry                                                                                                                              | startup         | TTL for compiled models.                                                            |
| `updateCompilerCacheKeepAlive`             | bool, false                                                                                                                                | startup         | Resets the TTL on each access.                                                      |
| `allowJsDuplicatePropsInSchema`            | bool, false                                                                                                                                | startup         | Disables the duplicate-property check.                                              |

**Query cache and queue**

| Option                       | Type / default / env                                                                    | Called                                   | Controls                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheAndQueueDriver`        | `memory` in dev, `cubestore` in prod; `CUBEJS_CACHE_AND_QUEUE_DRIVER`                   | startup                                  | Cache and queue backend.                                                                                                                                             |
| `contextToOrchestratorId`    | fn(ctx) → string                                                                        | every request                            | Cache key for the query orchestrator: DB connections and pools, queues, result cache, pre-aggregation table caches ([mt]).                                           |
| `contextToCubeStoreRouterId` | fn(ctx) → string                                                                        | every request                            | Routes a request to a specific Cube Store router. Requires `contextToOrchestratorId`.                                                                                |
| `driverFactory`              | fn({ securityContext, dataSource }) → DriverConfig `{ type, ... }` or a driver instance | once per data source per orchestrator ID | Dynamic data-source connections. Takes precedence over `CUBEJS_PRE_AGGREGATIONS_*` for every data source and logs `Pre-aggregation driver conflict` if both are set. |
| `orchestratorOptions`        | object, or fn(ctx) ([src-types])                                                        | startup, or per orchestrator             | Tuning, see the next table. Cube says: "We **strongly** recommend leaving these options set to the defaults."                                                        |

`orchestratorOptions` keys ([cfg]):

| Key                                            | Default           | Meaning                                                     |
| ---------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| `continueWaitTimeout`                          | 10 s (max 90)     | Long-poll interval.                                         |
| `rollupOnlyMode`                               | false             | Error if the query cannot use pre-aggregations.             |
| `queryCacheOptions.refreshKeyRenewalThreshold` | dialect-dependent | How long a refresh_key result is cached.                    |
| `queryCacheOptions.backgroundRenew`            | false             | Return cached data immediately and renew in the background. |
| `queryCacheOptions.queueOptions`               | {}                | Queue options, see below.                                   |
| `preAggregationsOptions.maxPartitions`         | 10000             | Max partitions per pre-aggregation.                         |
| `preAggregationsOptions.queueOptions`          | {}                | Queue options, see below.                                   |
| `preAggregationsOptions.externalRefresh`       | false             | Disables pre-aggregation building on API instances.         |
| `queueOptions.concurrency`                     | 2                 | Simultaneous queries. Keep `CUBEJS_DB_MAX_POOL` above this. |
| `queueOptions.executionTimeout`                | 600 s             | Total query timeout.                                        |
| `queueOptions.orphanedTimeout`                 | 120 s             | Cancel if no client polls.                                  |
| `queueOptions.heartBeatInterval`               | 30 s              | Cancel after 4 missed heartbeats.                           |

The schema also accepts `redisPrefix`, `skipExternalCacheAndQueue`, and `testConnectionTimeout`, none of which are documented ([src-validate]).

**Pre-aggregations**

| Option                      | Type / default / env                                                                                           | Called                                          | Controls                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `preAggregationsSchema`     | string or fn; `dev_pre_aggregations` in dev, `prod_pre_aggregations` in prod; `CUBEJS_PRE_AGGREGATIONS_SCHEMA` | once per app ID                                 | Schema for pre-aggregation tables. "Cube will wipe out the contents of this database schema before use."                          |
| `scheduledRefreshTimer`     | seconds, or bool ([src-validate])                                                                              | startup                                         | Refresh-worker heartbeat. Setting it enables refresh-worker mode. Do not set a constant value across a cluster (race conditions). |
| `scheduledRefreshTimeZones` | string[] or fn(ctx); `['UTC']`; `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`                                           | per context per refresh tick ([src-core])       | Time zones pre-aggregations are built for.                                                                                        |
| `scheduledRefreshContexts`  | fn() → `[{ securityContext }]`                                                                                 | **every refresh tick**, not cached ([src-core]) | Security contexts the refresh worker iterates. **Required** if the app or orchestrator ID depends on the security context.        |

**Querying**

| Option                            | Type / default / env                                      | Called        | Controls                                                                                        |
| --------------------------------- | --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `queryRewrite`                    | fn(query, ctx) → query                                    | every request | Validates or rewrites queries; the row-level-security hook. Throwing blocks the query.          |
| `allowUngroupedWithoutPrimaryKey` | bool, false, `CUBEJS_ALLOW_UNGROUPED_WITHOUT_PRIMARY_KEY` | startup       | Skips the primary-key check for ungrouped queries. Enabled automatically with SQL API pushdown. |

**APIs and auth**

| Option                         | Type / default / env                                                                                                                                                                                                                  | Called                                                               | Controls                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `basePath`                     | `/cubejs-api`                                                                                                                                                                                                                         | startup                                                              | REST/GraphQL prefix.                                               |
| `http.cors`                    | Express `cors` options                                                                                                                                                                                                                | startup                                                              | CORS for REST.                                                     |
| `webSocketsBasePath`           | `/`                                                                                                                                                                                                                                   | startup                                                              | WebSocket path.                                                    |
| `processSubscriptionsInterval` | ms, 5000                                                                                                                                                                                                                              | startup                                                              | WebSocket subscription refresh interval.                           |
| `contextToApiScopes`           | fn(securityContext, defaultScopes) → string[]                                                                                                                                                                                         | every request                                                        | Per-context API scopes (`meta`, `data`, `graphql`, `sql`, `jobs`). |
| `extendContext`                | fn(req) → object                                                                                                                                                                                                                      | every request, but not in the refresh worker                         | Adds data to the request context.                                  |
| `checkAuth`                    | fn(ctx, token)                                                                                                                                                                                                                        | every request                                                        | Replaces JWT verification. Must set `securityContext`.             |
| `jwt`                          | `{ jwkUrl, key, algorithms, issuer, audience, subject, claimsNamespace }`; env `CUBEJS_JWK_URL`, `CUBEJS_JWT_KEY`, `CUBEJS_JWT_ALGS`, `CUBEJS_JWT_ISSUER`, `CUBEJS_JWT_AUDIENCE`, `CUBEJS_JWT_SUBJECT`, `CUBEJS_JWT_CLAIMS_NAMESPACE` | startup                                                              | JWT/JWK verification.                                              |
| `checkSqlAuth`                 | fn(req, user, password) → `{ password, securityContext }`                                                                                                                                                                             | new SQL connection, `SET USER`, and every `CUBESQL_AUTH_EXPIRE_SECS` | SQL API authentication.                                            |
| `canSwitchSqlUser`             | fn(current, new) → bool                                                                                                                                                                                                               | on user switch                                                       | SQL API user switching.                                            |
| `contextToGroups`              | fn(ctx) → string[]                                                                                                                                                                                                                    | every request                                                        | Groups used by data access policies.                               |

**Utility**

| Option      | Type / default / env     | Called          | Controls                                                                                                                                                                |
| ----------- | ------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logger`    | fn(message, params)      | every log event | Custom log sink. Values are redacted when `CUBEJS_LOG_REDACTION` is on.                                                                                                 |
| `telemetry` | bool, `CUBEJS_TELEMETRY` | startup         | "Cube collects high-level anonymous usage statistics for servers started in development mode. It doesn't track any credentials, data model contents or queries issued." |

### 2. Options accepted by the options schema but not in the v1.7.42 reference

These come from `optionsValidate.ts` and `types.ts` ([src-validate], [src-types]). Treat them as internal and unstable.

- `webSockets`, `gracefulShutdown`, `serverHeadersTimeout`, `serverKeepAliveTimeout`
- `devServer`, `apiSecret`, `apiSecrets`
- `dialectFactory`, `externalDialectFactory`, `externalDriverFactory`, `externalDbType` (external pre-aggregation DBs are deprecated in favour of Cube Store, [dep])
- `scheduledRefreshConcurrency`, `scheduledRefreshBatchSize`
- `dashboardAppPath`, `dashboardAppPort`, `livePreview`, `sqlCache`
- `sqlPort`, `pgSqlPort`, `gatewayPort`, `sqlUser`, `sqlPassword`, `sqlSuperUser`
- `semanticLayerSync`, documented only on the Semantic Layer Sync page ([sls])
- `serverless` (serverless deployments were removed in v0.35.0, [dep]), `allowNodeRequire`, `fastReload`
- `queryTransformer`, marked `@deprecated`; use `queryRewrite`

Removed options:

- `dbType` throws: "CreateOptions.dbType was removed in v1.7.0. Use driverFactory instead (return a DriverConfig `{ type, ... }`)" ([src-opts], [dep]).
- `contextToDataSourceId` throws in favour of `contextToOrchestratorId` ([src-core]).
- `contextToRoles` was removed in v1.7.0; use `contextToGroups` ([dep]).
- `checkAuthMiddleware` and `initApp` were removed ([dep]).

### 3. What changes at runtime and what needs a restart

| Mechanism                                                                                                                                                                         | When it is re-evaluated                                                                   | Can wechart change it without restarting Cube?                                                                                                     | Source                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `checkAuth`, `extendContext`, `queryRewrite`, `contextToApiScopes`, `contextToGroups`, `contextToAppId`, `contextToOrchestratorId`, `contextToCubeStoreRouterId`, `schemaVersion` | every request                                                                             | Yes, if the hook reads wechart-owned state                                                                                                         | [cfg]                       |
| `scheduledRefreshContexts`                                                                                                                                                        | every refresh tick                                                                        | Yes                                                                                                                                                | [src-core]                  |
| `scheduledRefreshTimeZones` (fn)                                                                                                                                                  | per context per tick                                                                      | Yes                                                                                                                                                | [src-core]                  |
| `repositoryFactory`, `preAggregationsSchema` (fn)                                                                                                                                 | once per app ID                                                                           | Only by producing a new app ID. File content re-reads are driven by `schemaVersion`.                                                               | [cfg], [src-compiler]       |
| `driverFactory`                                                                                                                                                                   | once per data source per orchestrator ID                                                  | Only by producing a new orchestrator ID; the orchestrator is cached in `orchestratorStorage`                                                       | [cfg], [src-core]           |
| Model files on disk in production mode                                                                                                                                            | never, unless `schemaVersion` changes or `fastReload`/`CUBEJS_FAST_RELOAD_ENABLED` is set | With `schemaVersion`                                                                                                                               | [src-compiler], [src-env]   |
| Model files in dev mode                                                                                                                                                           | every request (MD5 of all files)                                                          | Yes                                                                                                                                                | [src-compiler]              |
| All env vars and static options                                                                                                                                                   | process start                                                                             | **No. Restart the container.** The only in-process reload, `resetInstanceState()`, is reachable only through the dev-mode route `/playground/env`. | [src-core], [src-devserver] |

### 4. Environment variables

Defaults come from [env] unless another source is cited. "dev/prod" means the default in development vs production mode.

**Deployment-critical variables**

| Variable                          | Default (dev/prod)                           | Meaning                                                                                                                           |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CUBEJS_DEV_MODE`                 | true / false                                 | Development mode, which bypasses auth (see §6).                                                                                   |
| `CUBEJS_API_SECRET`               | none                                         | JWT secret.                                                                                                                       |
| `CUBEJS_API_SECRETS`              | none                                         | Comma-separated secrets accepted during rotation.                                                                                 |
| `CUBEJS_APP`                      | `cubejs`                                     | Application ID.                                                                                                                   |
| `CUBEJS_REFRESH_WORKER`           | false / false                                | "this instance of Cube will **only** refresh pre-aggregations".                                                                   |
| `CUBEJS_PRE_AGGREGATIONS_BUILDER` | true / false                                 | Build pre-aggregations even on an API instance.                                                                                   |
| `CUBEJS_CACHE_AND_QUEUE_DRIVER`   | memory / cubestore                           | Cache and queue backend.                                                                                                          |
| `CUBEJS_CUBESTORE_HOST`           | localhost / none                             | Cube Store router host.                                                                                                           |
| `CUBEJS_CUBESTORE_PORT`           | 3030                                         | Cube Store router port.                                                                                                           |
| `CUBEJS_PRE_AGGREGATIONS_SCHEMA`  | dev_pre_aggregations / prod_pre_aggregations | Pre-aggregation schema.                                                                                                           |
| `CUBEJS_PG_SQL_PORT`              | none                                         | Enables the SQL API. Source: the port is 15432 in dev mode when the native module is supported ([src-env]).                       |
| `CUBEJS_DEFAULT_API_SCOPES`       | `meta,data,graphql,sql`                      | Default API scopes. **`jobs` is not included.**                                                                                   |
| `CUBEJS_LOG_LEVEL`                | doc: `warn`                                  | `error`, `info`, `trace`, `warn`. Source: when unset, `createLogger` defaults to `'info'` ([src-logger], [src-env]); see Gotchas. |
| `CUBEJS_LOG_REDACTION`            | false / true                                 | Redacts values in logs.                                                                                                           |
| `CUBEJS_TELEMETRY`                | true / true                                  | Anonymous telemetry.                                                                                                              |
| `CUBEJS_ROLLUP_ONLY`              | false                                        | Serve queries only from pre-aggregations.                                                                                         |
| `CUBEJS_SCHEMA_PATH`              | model                                        | Model directory.                                                                                                                  |
| `CUBEJS_DEFAULT_TIMEZONE`         | UTC                                          | Default query time zone.                                                                                                          |
| `CUBEJS_TESSERACT_SQL_PLANNER`    | true                                         | Tesseract SQL planner.                                                                                                            |

**All documented variables, grouped** ([env]):

- **Auth:** `CUBEJS_API_SECRET(S)`, `CUBEJS_APP`, `CUBEJS_JWK_URL`, `CUBEJS_JWT_{ALGS,AUDIENCE,CLAIMS_NAMESPACE,ISSUER,KEY,SUBJECT}`, `CUBEJS_DEFAULT_API_SCOPES`.
- **Mode and runtime:** `CUBEJS_DEV_MODE`, `CUBEJS_SCHEMA_PATH`, `CUBEJS_DEFAULT_TIMEZONE`, `CUBEJS_LOG_LEVEL`, `CUBEJS_LOG_REDACTION`, `CUBEJS_TELEMETRY`, `CUBEJS_AUTO_RUN_MODE`, `CUBEJS_COMPILER_CACHE_SIZE`, `CUBEJS_TESSERACT_SQL_PLANNER`, `CUBEJS_NESTED_FOLDERS_DELIMITER`, `CUBEJS_GH_API_TOKEN`.
- **HTTP server:** `CUBEJS_SERVER_HEADERS_TIMEOUT`, `CUBEJS_SERVER_KEEP_ALIVE_TIMEOUT`, `CUBEJS_MAX_REQUEST_SIZE` (default 50mb), `CUBEJS_WEB_SOCKETS`.
- **Generic data source:**
  - Connection: `CUBEJS_DB_{TYPE,HOST,PORT,NAME,USER,PASS,URL,SOCKET_PATH,SCHEMA,DOMAIN}`.
  - SSL: `CUBEJS_DB_SSL{,_CA,_CERT,_KEY,_SERVERNAME}`.
  - Limits: `CUBEJS_DB_MAX_POOL`, `CUBEJS_DB_QUERY_TIMEOUT` (10m), `CUBEJS_DB_QUERY_DEFAULT_LIMIT` (10000), `CUBEJS_DB_QUERY_LIMIT` (50000), `CUBEJS_DB_FETCH_COLUMNS_BY_ORDINAL_POSITION`.
  - Multiple sources: `CUBEJS_DATASOURCES` with the `CUBEJS_DS_<NAME>_*` decorated forms ([mds]).
- **Driver-specific:**
  - Cloud warehouses and AWS: `CUBEJS_AWS_*` (Athena), `CUBEJS_DB_BQ_*`, `CUBEJS_DB_SNOWFLAKE_*`, `CUBEJS_DB_REDSHIFT_*`, `CUBEJS_DB_DATABRICKS_*`, `CUBEJS_FIREBOLT_*`.
  - Other engines: `CUBEJS_DB_CLICKHOUSE_*`, `CUBEJS_DB_DUCKDB_*`, `CUBEJS_DB_HIVE_*`, `CUBEJS_DB_KAFKA_*`, `CUBEJS_DB_MATERIALIZE_CLUSTER`, `CUBEJS_DB_PINOT_*`, `CUBEJS_DB_PRESTO_*`.
  - Time-zone flags: `CUBEJS_DB_MYSQL_USE_NAMED_TIMEZONES`, `CUBEJS_DB_MSSQL_USE_NAMED_TIMEZONES`.
  - Export bucket: `CUBEJS_DB_EXPORT_BUCKET*`, `CUBEJS_DB_EXPORT_GCS_CREDENTIALS`, `CUBEJS_DB_EXPORT_INTEGRATION`.
- **Queue and refresh:** `CUBEJS_CACHE_AND_QUEUE_DRIVER`, `CUBEJS_CONCURRENCY`, `CUBEJS_REFRESH_WORKER`, `CUBEJS_REFRESH_WORKER_CONCURRENCY`, `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID` (10), `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`, `CUBEJS_REFRESH_KEY_LOCAL_TIME`, `CUBEJS_QUEUE_FAST_TRACK`, `CUBEJS_ROLLUP_ONLY`.
- **Pre-aggregations:** `CUBEJS_PRE_AGGREGATIONS_{SCHEMA,BUILDER,DB_*,ALLOW_NON_STRICT_DATE_RANGE_MATCH,BACKOFF_MAX_TIME}`, `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH`, `CUBEJS_TOUCH_PRE_AGG_TIMEOUT` (86400), `CUBEJS_MAX_PARTITIONS_PER_CUBE`, `CUBEJS_DB_PRECISE_DECIMAL_IN_CUBESTORE`.
- **Cube Store client:** `CUBEJS_CUBESTORE_{HOST,PORT,MAX_MESSAGE_SIZE}`.
- **SQL API:**
  - Access: `CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_{USER,PASSWORD,SUPER_USER}`, `CUBEJS_MAX_SESSIONS`, `CUBESQL_AUTH_EXPIRE_SECS`.
  - Tuning: `CUBESQL_{SQL_PUSH_DOWN,STREAM_MODE,FAIL_ON_LIMITLESS_POST_PROCESSING,CUBE_SCAN_MAX_BATCH_ROWS,NON_STREAMING_QUERY_MAX_ROW_LIMIT,SQL_NO_IMPLICIT_ORDER,REWRITE_MAX_NODES,REWRITE_MAX_ITERATIONS,REWRITE_TIMEOUT}`.
- **DAX/MDX:** `CUBEJS_DAX_CREATE_DATE_HIERARCHIES`, `CUBEJS_DAX_SINGLE_PERSPECTIVE`, `CUBE_XMLA_LANGUAGE`, `CUBE_MDX_CREATE_DATE_HIERARCHIES`.
- **Cube Store server:**
  - Network: `CUBESTORE_{BIND_ADDR,PORT(3306),HTTP_BIND_ADDR,HTTP_PORT(3030),META_ADDR,META_PORT}`.
  - Storage and runtime: `CUBESTORE_{LOG_LEVEL,DATA_DIR,REMOTE_DIR,CACHE_MAX_ENTRY_SIZE,NO_UPLOAD,QUERY_TIMEOUT,QUERY_CACHE_STALE_WHILE_REVALIDATE,JOB_RUNNERS,MAX_WS_CONNECTIONS_PER_USER}`.
  - Metrics: `CUBESTORE_METRICS_{FORMAT,ADDRESS,PORT}` (StatsD).
  - Cloud storage: `CUBESTORE_S3_*`, `CUBESTORE_GCS_*`, `CUBESTORE_GCP_*`, `CUBESTORE_MINIO_*`, `CUBESTORE_AWS_*`.
- **Cube Store cluster:** `CUBESTORE_SERVER_NAME`, `CUBESTORE_WORKERS`, `CUBESTORE_WORKER_PORT`. These are documented in the production guide, not in the env reference ([prod]).

**Variables found only in source.** They are undocumented, so treat them as unstable.

- Cube ([src-env]):
  - Ports and secrets: `PORT` (default 4000), `CUBEJS_SQL_PORT`, `CUBEJS_PLAYGROUND_AUTH_SECRET`.
  - Refresh scheduling: `CUBEJS_SCHEDULED_REFRESH`, `CUBEJS_SCHEDULED_REFRESH_TIMER`, `CUBEJS_SCHEDULED_REFRESH_BATCH_SIZE`.
  - Server and dev behaviour: `CUBEJS_GRACEFUL_SHUTDOWN`, `CUBEJS_LIVE_PREVIEW`, `CUBEJS_FAST_RELOAD_ENABLED`, `CUBEJS_PREVIEW_FEATURES`, `CUBEJS_INSTANCE_ID`.
  - Event agent: `CUBEJS_AGENT_{ENDPOINT_URL,FRAME_SIZE,FLUSH_INTERVAL,MAX_SOCKETS}`.
  - Access-policy masking: `CUBEJS_ACCESS_POLICY_MASK_{STRING,TIME,BOOLEAN,NUMBER}`.
  - Transpilation: `CUBEJS_TRANSPILATION_*`.
  - Cube Store client: `CUBEJS_CUBESTORE_{USER,PASS,MAX_CONNECT_RETRIES,NO_HEART_BEAT_TIMEOUT,ROLLING_WINDOW_JOIN}`.
  - Deprecated, and Redis support has been removed: `CUBEJS_EXTERNAL_DEFAULT`, `CUBEJS_SCHEDULED_REFRESH_DEFAULT`, `CUBEJS_REDIS_URL` ([dep]).
- Cube Store ([src-cs-config]):
  - Status server: `CUBESTORE_STATUS_PORT` (default 3031), `CUBESTORE_STATUS_BIND_ADDR`.
  - Bind addresses and dumps: `CUBESTORE_WORKER_BIND_ADDR`, `CUBESTORE_META_BIND_ADDR`, `CUBESTORE_DUMP_DIR`.
  - Cache and query planning: `CUBESTORE_CACHE_MAX_SIZE` (4096 MB), `CUBESTORE_CACHE_POLICY`, `CUBESTORE_MAX_CONCURRENT_QUERY_PLANS`, `CUBESTORE_MAX_QUEUED_QUERY_PLANS` (5000), `CUBESTORE_TOPK_STRATEGY`.
  - Default `CUBESTORE_SERVER_NAME` is `localhost`.

**Role resolution.** In source, the refresh-worker flag resolves in this order: `CUBEJS_REFRESH_WORKER`, then `CUBEJS_SCHEDULED_REFRESH`, then `CUBEJS_SCHEDULED_REFRESH_TIMER`, then `NODE_ENV !== 'production'` ([src-env]). The image sets `NODE_ENV=production` ([src-dockerfile]), so an API container does not run the scheduler unless told to. Pre-aggregation builders are dev mode, the refresh worker, or an API worker with `CUBEJS_PRE_AGGREGATIONS_BUILDER` set ([src-opts]).

**Where env vars go.** In Core, env vars go into `docker-compose.yml`. `process.env` is not available inside JS model files, so values must be imported from a separate JS file. YAML/Jinja models use `env_var()` ([r-env]).

### 5. Runtime HTTP endpoints in Core

Route list from `gateway.ts` ([src-gw]); endpoint docs from [rest] and [rest-ref].

| Route                                                                                                                                                                                            | Auth / scope                                                                                                    | Purpose                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /readyz`                                                                                                                                                                                    | none, no base path                                                                                              | Tests the connection to the **default** data source. Returns 200 `{"health":"HEALTH"}` or 500 `{"health":"DOWN"}`.                                                                                                                                                 |
| `GET /livez`                                                                                                                                                                                     | none                                                                                                            | Tests existing data-source connections.                                                                                                                                                                                                                            |
| `GET/POST {base}/v1/load`, `/v1/sql`, `/v1/dry-run`, `/v1/subscribe`; `POST /v1/convert-query`, `/v1/cubesql`, `/v1/graphql-to-json`, `/v1/pre-aggregations/can-use`; `/graphql`; `GET /v1/meta` | JWT, scope per endpoint                                                                                         | Data and metadata APIs, covered in other research docs.                                                                                                                                                                                                            |
| `POST {base}/v1/pre-aggregations/jobs`                                                                                                                                                           | JWT, **`jobs` scope, off by default**                                                                           | `action: "post"` with `selector` `{ contexts (required), timezones (required), dataSources?, cubes?, preAggregations?, dateRange? }` returns job tokens. `action: "get"` with `tokens` returns statuses `scheduled`, `processing`, `missing_partition`, or `done`. |
| `DELETE {base}/v1/running-query/{requestId}`                                                                                                                                                     | JWT                                                                                                             | "Cancel a running query by its request ID … across all query queues."                                                                                                                                                                                              |
| `GET /cubejs-system/v1/context`, `GET /cubejs-system/v1/pre-aggregations{,/security-contexts,/timezones}`, `POST /cubejs-system/v1/pre-aggregations/{partitions,preview,build,queue,cancel}`     | JWT signed HS256 with `CUBEJS_PLAYGROUND_AUTH_SECRET`. **Registered only if that secret is set. Undocumented.** | Pre-aggregation inspection, build, queue, and cancel.                                                                                                                                                                                                              |
| `{base}/v1/data-sources`, `{base}/v1/entities`                                                                                                                                                   | n/a                                                                                                             | **Cube Cloud only** ([rest-ref]). These routes are not registered in Core's gateway ([src-gw]).                                                                                                                                                                    |
| Cube Store `GET :3031/livez`, `GET :3031/readyz`                                                                                                                                                 | none                                                                                                            | Liveness runs `SELECT 1`; readiness checks that the metastore is reachable. Returns 200 or 500. Source only ([src-cs-status]).                                                                                                                                     |

### 6. Dev mode and the Core Playground

- **Where it runs.** "Playground is available in Cube Core at localhost:4000 when it's run in the development mode" ([playground]). In production mode the root path returns a basic HTML page instead ([src-core]).
- **Playground features** ([playground]):
  - query builder: measures, dimensions, segments, and filters with boolean logic
  - generated SQL
  - copyable REST JSON and GraphQL queries
  - chart and pivot results
  - a **Security Context** switcher
  - query tabs stored in browser local storage
  - search across cubes, views, and members
  - a pre-aggregation suggestion from the query timing
- **Getting-started flow** ([gs-create], [gs-preagg]):
  - A database connection wizard runs when no `.env` exists and writes `.env` with the credentials.
  - "Generate Data Model" produces YAML (recommended) or JS files.
  - "Add to the Data Model" writes a suggested pre-aggregation into the model.
- **Routes behind these features** ([src-devserver]):
  - Model files: `/playground/files`, `/playground/db-schema`, `/playground/generate-schema` (writes `model/cubes/*`), `/playground/schema/pre-aggregation` (writes model files).
  - Connections: `/playground/test-connection` and `/playground/env`. The env route writes `.env` in `process.cwd()` and then calls `resetInstanceState()`.
  - Drivers: `/playground/driver`, which runs `npm install` limited to an allow-list of known driver packages.
  - Tokens: `/playground/token`, which signs any payload with the API secret.
  - Also `/playground/context`, the legacy dashboard-app routes, and the live-preview routes.
  - The code says "Authentication checks are disabled in developer mode".
- **Security.** The docs call `CUBEJS_DEV_MODE=true` an "authentication bypass":
  - JWT verification is off.
  - Playground endpoints have "no authentication at all".
  - Anyone can "mint an API token carrying any security context".
  - The SQL API accepts any credentials unless `CUBEJS_SQL_PASSWORD` is set.

  Source: [devmode]. The same page mostly documents Cube Cloud's unrelated "development mode" (branch-scoped APIs) ([devmode]).

### 7. CLIs

**Legacy `cubejs-cli@1.7.42`, Core-capable.** It is also available as `cubejs` inside the image ([src-dockerfile]).

| Command                | Flags                                                                                                                                        | Behaviour                                                                                                                                    | Source             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `cubejs create <name>` | `-d, --db-type` (postgres, mysql, mongobi, athena, redshift, bigquery, mssql, clickhouse, snowflake, presto, questdb, materialize, firebolt) | Scaffolds a project from the `docker` template.                                                                                              | [src-cli-create]   |
| `cubejs generate`      | `-t, --tables` (required), `-d, --dataSource` (default `default`)                                                                            | Introspects the DB configured by env (`driver.tablesSchema()`) and writes files to `<schemaPath>/cubes/`. Requires `@cubejs-backend/server`. | [src-cli-generate] |
| `cubejs validate`      | `-p, --schema-path` (default `schema`)                                                                                                       | Compiles the model locally with `@cubejs-backend/schema-compiler`.                                                                           | [src-cli-validate] |
| `cubejs token`         | `-e, --expiry` (default 30 days; 0 means none), `-s, --secret`, `-p, --payload k=v`                                                          | Mints a JWT.                                                                                                                                 | [src-cli-token]    |
| `cubejs typegen`       | `--token`                                                                                                                                    | Reads `{apiUrl}/meta` and writes `generated.d.ts` into `@cubejs-client/dx`.                                                                  | [src-cli-typegen]  |
| `cubejs server`        | none                                                                                                                                         | Proxies to the `@cubejs-backend/server` bin.                                                                                                 | [src-cli-server]   |
| `cubejs deploy`        | `--upload-env`, `--replace-env`, `--token`, `--directory`                                                                                    | "Deploy project to Cube Cloud". **Cloud.**                                                                                                   | [src-cli-deploy]   |

**New `cube` CLI, Cloud-only.** Commands include `login`, `deployments …`, `deploy`, `validate` (asks the branch's Cube API), `data-model …`, `dbt sync|generate|…`, `logs`, `variables set`, `deployments token`, `users/groups/policies`, and `spec` ([cli-doc]).

### 8. Deployment topology and production guidance

**Components** ([deploy], [arch]):

- One or more API instances, stateless and horizontally scalable behind a load balancer.
- One refresh worker (`CUBEJS_REFRESH_WORKER=true`, same image). It eagerly builds pre-aggregations and refreshes the cache.
- One Cube Store router: connections, metadata, query planning, and the MySQL-protocol interface.
- One or more Cube Store workers. They run subqueries over Parquet files and never talk to each other.

**Cube Store cluster env matrix** ([prod]):

| Variable                | Router | Worker |
| ----------------------- | ------ | ------ |
| `CUBESTORE_SERVER_NAME` | yes    | yes    |
| `CUBESTORE_META_PORT`   | yes    | no     |
| `CUBESTORE_WORKERS`     | yes    | yes    |
| `CUBESTORE_WORKER_PORT` | no     | yes    |
| `CUBESTORE_META_ADDR`   | no     | yes    |

- Cube talks to the router on HTTP port 3030. If you change `CUBESTORE_HTTP_PORT`, update `CUBEJS_CUBESTORE_PORT` on the API and refresh worker to match ([arch]).
- Use stable DNS names for all nodes ([prod]).

**Production checklist:**

- **Dev mode and workers:** dev mode off on the API and the refresh worker; run a separate refresh worker; Cube Store is required ([deploy]).
- **Sizing:**
  - API: at least 3 GB RAM and 2 CPU.
  - Refresh worker: at least 6 GB RAM with `NODE_OPTIONS="--max-old-space-size=6144"`.
  - Router: at least 6 GB RAM and 4 CPU.
  - Each worker: at least 8 GB RAM and 4 CPU.

  Source: [deploy].

- **Proxy and TLS:** put a reverse proxy (NGINX) in front, with TLS ([admin-core]). `CUBEJS_ENABLE_TLS` was removed and now throws ([src-server], [dep]).
- **Health checks:** `/readyz` and `/livez` ([deploy]).
- **Scaling:**
  - "Single-instance deployments are unsuitable for production"; run Cube Store in cluster mode ([prod]).
  - Performance is best when the number of partitions is at most the number of workers; check with `EXPLAIN ANALYZE` ([prod]).
  - Autoscaling, worker hibernation, and the sizing rules of thumb are Cloud-only ([scal]).
- **High availability.** Core does **not** support node replication. Each router or worker should run as a single instance, and "any node failure" means a full cluster outage. Cube points to Cloud for HA ([prod]).
- **Storage:**
  - Persistent storage can be S3, GCS, Azure Blob, or a local path. Local paths are for single-machine deployments only. Strong consistency is required; MinIO is community-supported and can fail with "File can't be listed after upload".
  - Use separate buckets for export and persistence.
  - Scratch space is `CUBESTORE_DATA_DIR`; local SSD is recommended.
  - Garbage collection uses a one-day TTL by default, and XFS lacks the creation time it relies on.

  Source: [prod].

- **Security.** Cube Store has **no built-in authentication**. Restrict network access to the Cube deployment only. Parquet encryption and CMK are Enterprise/Cloud features ([prod]).
- **Custom images.** Extend `cubejs/cube` with a Dockerfile for native Python or npm dependencies. Mounting `.:/cube/conf` can hide the `node_modules` directory ([deploy]).

### 9. Multitenancy

**The building blocks** ([mt], [cfg]):

- `contextToAppId` isolates the compiled model per tenant.
- `contextToOrchestratorId` isolates connections, pools, queues, the result cache, and pre-aggregation caches.
- `driverFactory` picks the per-tenant connection.
- `repositoryFactory` or `COMPILE_CONTEXT` gives per-tenant models.
- `preAggregationsSchema` gives per-tenant pre-aggregation tables.
- `queryRewrite` does row-level filtering within shared data.
- `scheduledRefreshContexts` and `scheduledRefreshTimeZones` tell the refresh worker which tenants exist.

Omitting the IDs causes "the data model or data of one tenant being used for another" ([mt]).

**Patterns in [mt]:**

1. **Row-level security only.** `queryRewrite` pushes a tenant filter. Connections, queues, and pre-aggregations stay shared.
2. **Per-tenant model, shared resources.** `contextToAppId` alone. "Everything below the data model remains shared across all tenants."
3. **Multiple databases, same model.** App ID, orchestrator ID, and a `driverFactory` that returns a `database` per tenant.
4. **Per-tenant pre-aggregations in a shared DB.** App ID plus a `preAggregationsSchema` function.
5. **Multiple drivers and models.** App ID, orchestrator ID, a `driverFactory` that can return different `type`s (for example `mongobi` vs `postgres`), and `repositoryFactory: ({ securityContext }) => new FileRepository(\`model/${securityContext.appId}\`)`.

**Recipes:**

- Custom model per tenant ([r-model]): `public`, `sql_table`, `data_source`, or `extends` driven by `COMPILE_CONTEXT.securityContext`; per-tenant folders through `FileRepository`; or an external `repositoryFactory` (S3, DB, API).
- Per-tenant data source ([r-ds]): `driverFactory` throws for an unknown tenant.

**Constraints:**

- `scheduledRefreshContexts` must be defined, or the security context is `undefined` in the refresh worker ([mt]).
- A `default` data source "**must** exist and be configured" ([mt]).
- Every unique app ID gets its own model and SQL compile caches, and every orchestrator ID gets its own orchestrator. That costs from "single-digit MBs" to "dozens of MBs" per ID. Cube's scaling strategies are bucketing tenants or pinning tenants to nodes with coordinated `scheduledRefreshContexts` ([mt]).

**Multiple data sources, distinct from multitenancy** ([mds]):

- `CUBEJS_DATASOURCES=default,analytics`, with `default` first and names lowercased.
- Named sources use `CUBEJS_DS_<NAME>_*`; the default uses bare `CUBEJS_DB_*`.
- Names must not end in `_db`, `_aws`, or `_jdbc`.
- Cubes select a source with `data_source`, and a single query can span sources.

### 10. Observability in Core

- **Logs:**
  - In production, `prodLogger` writes JSON lines with `timestamp`, `level`, `message`, and params through `console.log`. Dev mode uses a colourised formatter ([src-logger]).
  - Level is set by `CUBEJS_LOG_LEVEL`; redaction by `CUBEJS_LOG_REDACTION` (on by default in production) ([env]).
  - The `logger(message, params)` hook replaces the sink ([cfg]).
  - Cube Store's own level is `CUBESTORE_LOG_LEVEL`, default `error` ([env]).
- **Health:** `/readyz` and `/livez` on API and Cube instances ([rest-ref]); Cube Store status port 3031 ([src-cs-status]).
- **Metrics:** only Cube Store emits them, as StatsD or DogStatsD via `CUBESTORE_METRICS_*` ([env]). The API and refresh worker have no metrics endpoint; issue #11613, open, asks for StatsD there ([i11613]).
- **Event forwarding, undocumented:** when `CUBEJS_AGENT_ENDPOINT_URL` is set, every logger call is also batched and sent over HTTP POST (deflate JSON) or WebSocket to that URL ([src-core], [src-agent]).
- **Telemetry:** anonymous, sent only from dev-mode servers; opt out with `CUBEJS_TELEMETRY=false` ([cfg]).
- **Cube Store SQL diagnostics** over MySQL protocol on port 3306 (`mysql -h … --user=cubestore -pcubestore --protocol=TCP`) ([cs-sql]):
  - Read-only: `SELECT * FROM information_schema.tables`, `EXPLAIN`, `EXPLAIN ANALYZE [DETAILED]`, `QUEUE LIST/PENDING/ACTIVE`, `CACHE KEYS`, `SYS METASTORE HEALTHCHECK`, `SYS CACHESTORE HEALTHCHECK|INFO`.
  - Destructive: `SYS METASTORE TRUNCATE`, `SYS CACHESTORE WIPE`, `SYS KILL ALL JOBS`, `SYS DROP CACHE`, `QUEUE CLEAR`, `CACHE CLEAR`.
  - `DUMP` writes to the router's disk and never cleans up.
  - Cloud does not expose this port.

### 11. Integrations: Core or Cloud

| Integration              | What it is                                                                                                                                                                                                            | Core / Cloud                                                                                                                                                                                                                                     | Source                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Semantic Layer Sync      | Pushes the Cube model to Superset, Preset, or Tableau as BI data sources. Configured with `semanticLayerSync: (ctx) => [{ type, name, config }]`. Runs "every time a new build is deployed" or manually from the IDE. | **Cloud.** Superset and Preset on all plans, Tableau on Enterprise. Core's options schema accepts the option, but no Core execution path was found (see Open questions).                                                                         | [sls], [src-types]       |
| MCP server               | Hosted remote endpoint `https://cubecloud.dev/mcp`, OAuth (PKCE), 30 tools.                                                                                                                                           | **Cloud**, Premium and Enterprise.                                                                                                                                                                                                               | [mcp]                    |
| dbt                      | "dbt pull" converts dbt models into cubes from Git or `target/manifest.json`, triggered by `cube dbt sync`.                                                                                                           | **Cloud**, Premium and above. The separate MIT `cube_dbt` 0.6.3 Python package (`Dbt.from_file/from_url().filter(...)`, `model.as_cube()`) works inside model files ([pypi-cube-dbt], [cube-dbt-readme]), but the v1.7.42 docs don't mention it. | [dbt]                    |
| Tableau                  | Cloud: through Semantic Layer Sync. Core: the Postgres connector against the SQL API, which is disabled by default in Core.                                                                                           | Both; SLS is Cloud Enterprise.                                                                                                                                                                                                                   | [tableau], [viz-tableau] |
| Power BI                 | The DAX API (live connection, Kerberos or NTLM) is Cloud. The SQL API "is the only option when using Cube Core", with "much more limited functionality".                                                              | DAX: Cloud. SQL API: Core.                                                                                                                                                                                                                       | [pbi]                    |
| Microsoft Excel          | "Cube for Excel" add-in, which uses the SQL API.                                                                                                                                                                      | **Cloud**, Enterprise plan.                                                                                                                                                                                                                      | [excel], [pricing]       |
| Google Sheets            | "Cube for Sheets" add-on, which uses the SQL API.                                                                                                                                                                     | **Cloud**, Premium and above.                                                                                                                                                                                                                    | [sheets], [pricing]      |
| Snowflake Semantic Views | Pulls Snowflake semantic views into Cube and pushes Cube views out.                                                                                                                                                   | **Cloud**, Enterprise.                                                                                                                                                                                                                           | [snow]                   |
| Slack                    | Dashboard screenshots and an AI agent in Slack.                                                                                                                                                                       | **Cloud**, Premium and above.                                                                                                                                                                                                                    | [slack], [pricing]       |
| Agent skills             | Instruction packs that teach coding agents the Cloud `cube` CLI.                                                                                                                                                      | Effectively **Cloud**, since the CLI is Cloud-only.                                                                                                                                                                                              | [skills], [cli-doc]      |

`cube.dev/pricing` lists only Cube Cloud plans (Free, Starter, Premium, Enterprise) ([pricing]).

### 12. docker-compose: local stack (Cube API, refresh worker, Cube Store router and worker, Postgres)

This layout is adapted from Cube's own compose examples ([deploy], [prod]). It adds a Postgres source and healthchecks. wechart's metadata DB and app services are separate and not wired into Cube.

```yaml
services:
  sample_db:
    image: postgres:18.6 # tag exists on Docker Hub (hub-pg)
    environment:
      POSTGRES_USER: cube
      POSTGRES_PASSWORD: local_only_change_me # required by the image
      POSTGRES_DB: sample
    volumes:
      - sample_db_data:/var/lib/postgresql # PG 18+: mount here, not .../data
      - ./infra/sample-db:/docker-entrypoint-initdb.d:ro # seed scripts (placeholder path)
    healthcheck:
      test: ['CMD', 'pg_isready', '-h', 'localhost', '-U', 'cube', '-d', 'sample']
      interval: 5s
      timeout: 5s
      retries: 20

  cubestore_router:
    image: cubejs/cubestore:v1.7.42 # arm64 host: cubejs/cubestore:v1.7.42-arm64v8
    restart: always
    environment:
      - CUBESTORE_SERVER_NAME=cubestore_router:9999
      - CUBESTORE_META_PORT=9999
      - CUBESTORE_WORKERS=cubestore_worker_1:9001
      - CUBESTORE_REMOTE_DIR=/cube/data
    volumes:
      - ./.cubestore:/cube/data # local path = single-machine only

  cubestore_worker_1:
    image: cubejs/cubestore:v1.7.42 # arm64 host: cubejs/cubestore:v1.7.42-arm64v8
    restart: always
    environment:
      - CUBESTORE_SERVER_NAME=cubestore_worker_1:9001
      - CUBESTORE_WORKER_PORT=9001
      - CUBESTORE_META_ADDR=cubestore_router:9999
      - CUBESTORE_WORKERS=cubestore_worker_1:9001
      - CUBESTORE_REMOTE_DIR=/cube/data
    volumes:
      - ./.cubestore:/cube/data
    depends_on:
      - cubestore_router

  cube_api:
    image: cubejs/cube:v1.7.42
    restart: always
    ports:
      - '4000:4000' # REST/GraphQL + /readyz,/livez
      - '15432:15432' # SQL API, only because CUBEJS_PG_SQL_PORT is set
    environment:
      - CUBEJS_DEV_MODE=false
      - CUBEJS_API_SECRET=local_only_change_me
      - CUBEJS_DB_TYPE=postgres
      - CUBEJS_DB_HOST=sample_db
      - CUBEJS_DB_PORT=5432
      - CUBEJS_DB_NAME=sample
      - CUBEJS_DB_USER=cube
      - CUBEJS_DB_PASS=local_only_change_me
      - CUBEJS_CUBESTORE_HOST=cubestore_router
      - CUBEJS_CUBESTORE_PORT=3030
      - CUBEJS_PG_SQL_PORT=15432
      - CUBEJS_SQL_USER=cube_sql
      - CUBEJS_SQL_PASSWORD=local_only_change_me
      - CUBEJS_TELEMETRY=false
    volumes:
      - ./cube:/cube/conf # cube.js + model/
    depends_on:
      sample_db:
        condition: service_healthy
      cubestore_router:
        condition: service_started
      cubestore_worker_1:
        condition: service_started
    healthcheck:
      # image has node but no curl; global fetch is stable in Node >= 21
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://localhost:4000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
        ]
      interval: 10s
      timeout: 5s
      retries: 30

  cube_refresh_worker:
    image: cubejs/cube:v1.7.42
    restart: always
    environment:
      - CUBEJS_DEV_MODE=false
      - CUBEJS_REFRESH_WORKER=true
      - CUBEJS_API_SECRET=local_only_change_me
      - CUBEJS_DB_TYPE=postgres
      - CUBEJS_DB_HOST=sample_db
      - CUBEJS_DB_PORT=5432
      - CUBEJS_DB_NAME=sample
      - CUBEJS_DB_USER=cube
      - CUBEJS_DB_PASS=local_only_change_me
      - CUBEJS_CUBESTORE_HOST=cubestore_router
      - CUBEJS_CUBESTORE_PORT=3030
      - CUBEJS_TELEMETRY=false
      # Production sizing guidance (>= 6 GB RAM): NODE_OPTIONS=--max-old-space-size=6144
    volumes:
      - ./cube:/cube/conf
    depends_on:
      sample_db:
        condition: service_healthy
      cubestore_router:
        condition: service_started
      cubestore_worker_1:
        condition: service_started

volumes:
  sample_db_data:
```

Why each piece is there:

- **Services, env vars, and volumes:**
  - Service roles, the Cube Store env vars, and the shared `/cube/data` remote dir follow [deploy] and [prod].
  - `CUBEJS_CUBESTORE_HOST` must point at the router ([deploy]).
  - Postgres env vars follow [ds-pg].
  - The SQL API is enabled by `CUBEJS_PG_SQL_PORT` with `CUBEJS_SQL_USER`/`PASSWORD` ([sql-api]).
- **Postgres image:**
  - `POSTGRES_PASSWORD` is required, and `/docker-entrypoint-initdb.d` scripts run only on an empty data dir ([pg-image]).
  - For PostgreSQL 18+ the volume mounts at `/var/lib/postgresql` ([pg-image]).
  - `pg_isready` exits 0 when the server accepts connections ([pg-isready]).
- **Compose syntax:** `depends_on.condition: service_healthy` and the `healthcheck` fields follow the Compose spec ([compose]).
- **Healthchecks:**
  - The API's `/readyz` checks the default data source, so its health depends on `sample_db` ([rest-ref]).
  - The `cubejs/cube` image has `node`; the Dockerfile installs no curl ([src-dockerfile]). Global `fetch` has been stable since Node v21 ([node-fetch]).
  - Cube Store has no in-image healthcheck and no curl ([src-cs-dockerfile]). wechart's server can poll `http://cubestore_router:3031/readyz` instead ([src-cs-status]).
- **Dev mode is off** in this layout. That keeps topology and auth faithful to production, but model edits then need `schemaVersion` (§3). Whether local dev should use dev mode is an open question below.
- **Secrets.** The secret and password values above are inline placeholders.

### 13. What wechart's own server would need to own

These are technical consequences of the Core surface above. They are not decisions.

- **JWT minting.** Keep `CUBEJS_API_SECRET` or JWK signing server-side ([env], [devmode]).
- **Runtime-editable config.** Store tenants, connections, scopes, groups, and model files in wechart's metadata DB. Expose them to the per-request and per-tick hooks in `cube.js`, which run inside the Cube container. Use `schemaVersion` to publish model changes, and change orchestrator IDs to make `driverFactory` pick up connection changes (§3).
- **Static config.** Env vars and static options can only change by restarting containers (§3). Restarting from the UI requires wechart to control containers, for example through the Docker API. That has security implications (see Open questions).
- **Connection testing and schema introspection.** Core only provides these on unauthenticated dev-mode routes ([src-devserver]). In production mode, `/readyz` tests only the default source ([rest-ref]). The CLI `generate` writes files and does not return JSON ([src-cli-generate]).
- **Model validation before publish.** Core's gateway has no REST validate endpoint ([src-gw]). `cubejs validate` compiles locally ([src-cli-validate]).
- **Query history, activity, and metrics.** These are Cloud features ([mon-qh], [mon-perf]). In Core they must come from wechart's own query path, the `logger` hook, or the undocumented agent endpoint ([cfg], [src-agent]), plus Cube Store StatsD ([env]).
- **Health aggregation** across the API, refresh worker, and each Cube Store node ([rest-ref], [src-cs-status]).

## Capability inventory

| Capability                                                                 | Core or Cloud-only                                         | API/config surface to drive it                                                                                                    | Candidate wechart UI surface                                                    | Source                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Deployment topology (API, refresh worker, Cube Store router and workers)   | Core                                                       | Per-container env (`CUBEJS_REFRESH_WORKER`, `CUBESTORE_SERVER_NAME/WORKERS/META_ADDR/WORKER_PORT`). No Cube API reports topology. | Admin › Deployment topology (read-only, from wechart's deploy config)           | [deploy], [prod]                             |
| Cube API and refresh-worker health                                         | Core                                                       | `GET /readyz`, `GET /livez` (no auth)                                                                                             | Admin › Health panel                                                            | [rest], [rest-ref]                           |
| Cube Store node health                                                     | Core (undocumented)                                        | `GET :3031/readyz`, `:3031/livez`; `CUBESTORE_STATUS_PORT`                                                                        | Admin › Health panel                                                            | [src-cs-status], [src-cs-config]             |
| Cube Store diagnostics (tables, plans, queue/cache, SYS)                   | Core (Cloud doesn't expose the port)                       | MySQL protocol on 3306; SQL commands                                                                                              | Admin › Cube Store inspector (read-only by default, destructive commands gated) | [cs-sql]                                     |
| Static config visibility (options and env)                                 | Core                                                       | `cube.js`/`cube.py` and env; restart to change                                                                                    | Admin › Configuration viewer                                                    | [cfg], [env]                                 |
| Runtime model publish                                                      | Core                                                       | `schemaVersion` + `repositoryFactory` (`dataSchemaFiles`)                                                                         | Model editor › Publish                                                          | [cfg], [src-compiler]                        |
| Compile-cache tuning                                                       | Core                                                       | `compilerCacheSize`/`CUBEJS_COMPILER_CACHE_SIZE`, `maxCompilerCacheKeepAlive`, `updateCompilerCacheKeepAlive`                     | Admin › Advanced config                                                         | [cfg]                                        |
| Tenant model isolation                                                     | Core                                                       | `contextToAppId` + `repositoryFactory` / `COMPILE_CONTEXT`                                                                        | Admin › Tenants                                                                 | [mt], [r-model]                              |
| Tenant data and connection isolation                                       | Core                                                       | `contextToOrchestratorId` + `driverFactory` (+ `preAggregationsSchema`)                                                           | Admin › Tenants › Connection mapping                                            | [mt], [r-ds]                                 |
| Tenant routing to Cube Store routers                                       | Core                                                       | `contextToCubeStoreRouterId`                                                                                                      | Admin › Tenants (advanced)                                                      | [cfg]                                        |
| Scheduled refresh contexts and time zones                                  | Core                                                       | `scheduledRefreshContexts` (every tick), `scheduledRefreshTimeZones` / `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`                       | Pre-aggregations › Refresh settings                                             | [cfg], [src-core]                            |
| Refresh-worker tuning                                                      | Core                                                       | `CUBEJS_REFRESH_WORKER_CONCURRENCY`, `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID`, `scheduledRefreshTimer` (restart)             | Admin › Configuration viewer                                                    | [env], [cfg]                                 |
| Pre-aggregation build jobs                                                 | Core                                                       | `POST {base}/v1/pre-aggregations/jobs` (`jobs` scope)                                                                             | Pre-aggregations › Jobs (trigger, poll)                                         | [rest-ref], [rest]                           |
| Pre-aggregation partitions, preview, queue, cancel                         | Core (undocumented; needs `CUBEJS_PLAYGROUND_AUTH_SECRET`) | `/cubejs-system/v1/pre-aggregations/*`                                                                                            | Pre-aggregations › Console                                                      | [src-gw]; Cloud equivalent [mon-pa]          |
| Query cancellation                                                         | Core                                                       | `DELETE {base}/v1/running-query/{requestId}`                                                                                      | Chart › Cancel running query                                                    | [rest-ref], [src-gw]                         |
| Data-source connections (single or multiple)                               | Core                                                       | `CUBEJS_DB_*`, `CUBEJS_DATASOURCES` + `CUBEJS_DS_<NAME>_*` (restart), or `driverFactory` (runtime)                                | Admin › Connections                                                             | [mds], [cfg]                                 |
| Connection test and table introspection                                    | Core, dev mode only (unauthenticated)                      | `/playground/test-connection`, `/playground/db-schema`. In production only `/readyz` (default source).                            | Admin › Connections › Test / Browse (wechart server implements)                 | [src-devserver], [rest-ref]                  |
| Data-model generation from tables                                          | Core: dev-mode Playground or CLI                           | `/playground/generate-schema`; `cubejs generate -t`                                                                               | Model editor › Generate from tables (wechart server implements)                 | [gs-create], [src-cli-generate]              |
| Data-source and entity listing endpoints                                   | Cloud-only                                                 | `{base}/v1/data-sources`, `/v1/entities`                                                                                          | n/a                                                                             | [rest-ref]                                   |
| Pre-aggregation storage schema and GC                                      | Core                                                       | `preAggregationsSchema`, `CUBEJS_PRE_AGGREGATIONS_*`, `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH`, `CUBEJS_TOUCH_PRE_AGG_TIMEOUT`         | Admin › Configuration viewer                                                    | [cfg], [env], [prod]                         |
| Cache and queue driver                                                     | Core                                                       | `cacheAndQueueDriver` / `CUBEJS_CACHE_AND_QUEUE_DRIVER`                                                                           | Admin › Configuration viewer                                                    | [cfg]                                        |
| Orchestrator tuning                                                        | Core                                                       | `orchestratorOptions` (object or fn); discouraged                                                                                 | Admin › Advanced config (read-only)                                             | [cfg], [src-types]                           |
| Concurrency and pool                                                       | Core                                                       | `CUBEJS_CONCURRENCY`, `CUBEJS_DB_MAX_POOL`                                                                                        | Admin › Connections › Advanced                                                  | [conc], [ds-pg]                              |
| Query limits and timeouts                                                  | Core                                                       | `CUBEJS_DB_QUERY_TIMEOUT`, `_DEFAULT_LIMIT`, `_LIMIT`, `CUBESTORE_QUERY_TIMEOUT`                                                  | Admin › Configuration viewer                                                    | [env]                                        |
| Rollup-only mode                                                           | Core                                                       | `CUBEJS_ROLLUP_ONLY` / `rollupOnlyMode`                                                                                           | Admin › Configuration viewer                                                    | [env], [cfg]                                 |
| Base path, CORS, WebSockets                                                | Core                                                       | `basePath`, `http.cors`, `webSocketsBasePath`, `processSubscriptionsInterval`, `CUBEJS_WEB_SOCKETS`                               | Admin › Configuration viewer                                                    | [cfg], [env], [src-server]                   |
| API scopes                                                                 | Core                                                       | `CUBEJS_DEFAULT_API_SCOPES`, `contextToApiScopes` (every request)                                                                 | Security › API access by role                                                   | [env], [cfg], [rest]                         |
| JWT auth and secret rotation                                               | Core                                                       | `CUBEJS_API_SECRET(S)`, `jwt.*` / `CUBEJS_JWK_URL`, `checkAuth`                                                                   | Security › Authentication                                                       | [env], [cfg]                                 |
| Context enrichment, RLS, groups                                            | Core                                                       | `extendContext`, `queryRewrite`, `contextToGroups` (every request)                                                                | Security › Policies                                                             | [cfg]                                        |
| SQL API endpoint and credentials                                           | Core (off by default)                                      | `CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_*`, `checkSqlAuth`, `canSwitchSqlUser`, `CUBESQL_*`                                             | Admin › SQL API / BI connections                                                | [sql-api], [env], [cfg]                      |
| DAX API (Power BI native)                                                  | Cloud-only                                                 | n/a (Core has `CUBEJS_DAX_*` env names, but the API is Cloud)                                                                     | n/a                                                                             | [pbi], [env]                                 |
| Ungrouped queries without a primary key                                    | Core                                                       | `allowUngroupedWithoutPrimaryKey` / env                                                                                           | Admin › Configuration viewer                                                    | [cfg]                                        |
| Default time zone and planner flag                                         | Core                                                       | `CUBEJS_DEFAULT_TIMEZONE`, `CUBEJS_TESSERACT_SQL_PLANNER`                                                                         | Admin › Configuration viewer                                                    | [env]                                        |
| Logging                                                                    | Core                                                       | `CUBEJS_LOG_LEVEL`, `CUBEJS_LOG_REDACTION`, `logger` hook; JSON to stdout                                                         | Admin › Logs (needs a wechart log pipeline)                                     | [cfg], [env], [src-logger]                   |
| Event forwarding                                                           | Core (undocumented)                                        | `CUBEJS_AGENT_ENDPOINT_URL` (+ `_FRAME_SIZE`, `_FLUSH_INTERVAL`, `_MAX_SOCKETS`)                                                  | Admin › Query activity                                                          | [src-agent], [src-core]                      |
| Metrics                                                                    | Core: Cube Store only                                      | `CUBESTORE_METRICS_FORMAT/ADDRESS/PORT` (StatsD)                                                                                  | Admin › Metrics (needs a StatsD collector)                                      | [env], [i11613]                              |
| Telemetry opt-out                                                          | Core                                                       | `CUBEJS_TELEMETRY` / `telemetry`                                                                                                  | Admin › Configuration viewer                                                    | [cfg], [env]                                 |
| Dev mode and Playground                                                    | Core (dev mode only, unauthenticated)                      | `CUBEJS_DEV_MODE=true`; `/playground/*`                                                                                           | None: wechart provides its own explorer; do not expose                          | [playground], [devmode], [src-devserver]     |
| Pre-aggregation suggestion ("Add to the Data Model")                       | Core (dev mode only)                                       | `/playground/schema/pre-aggregation`                                                                                              | Pre-aggregations › Designer (wechart implements)                                | [gs-preagg], [src-devserver]                 |
| Runtime env reload                                                         | Core (dev mode only)                                       | `/playground/env` → `resetInstanceState()`; otherwise restart                                                                     | Admin › Apply config (wechart orchestrates a restart)                           | [src-devserver], [src-core]                  |
| Legacy CLI (create, generate, validate, token, typegen)                    | Core                                                       | `cubejs-cli@1.7.42` / `cubejs` in the image                                                                                       | wechart server tooling and CI (for example validate before publish)             | [src-cli-validate], [src-cli-token]          |
| New `cube` CLI                                                             | Cloud-only                                                 | n/a                                                                                                                               | n/a                                                                             | [cli-doc]                                    |
| Cube Store persistent storage                                              | Core                                                       | `CUBESTORE_S3_*`, `GCS`, `MINIO`, `REMOTE_DIR`                                                                                    | Admin › Configuration viewer                                                    | [prod], [env]                                |
| HTTP server tuning                                                         | Core                                                       | `CUBEJS_SERVER_HEADERS_TIMEOUT`, `CUBEJS_SERVER_KEEP_ALIVE_TIMEOUT`, `CUBEJS_MAX_REQUEST_SIZE`                                    | Admin › Configuration viewer                                                    | [env]                                        |
| HA, replication, autoscaling, hibernation                                  | Cloud-only (Core has no replication)                       | n/a                                                                                                                               | Topology view shows single-instance nodes                                       | [prod], [scal]                               |
| Parquet encryption and CMK                                                 | Cloud-only (Enterprise)                                    | n/a                                                                                                                               | n/a                                                                             | [prod]                                       |
| Query History, Performance Insights, Pre-aggregations page, Audit Log      | Cloud-only                                                 | n/a                                                                                                                               | wechart-owned equivalents built from its own data                               | [mon-qh], [mon-perf], [mon-pa], [mon-audit]  |
| Monitoring integrations (Datadog, Grafana, etc.)                           | Cloud-only (Enterprise add-on)                             | n/a                                                                                                                               | n/a                                                                             | [mon-int]                                    |
| Semantic Layer Sync                                                        | Cloud                                                      | `semanticLayerSync` (no Core runtime found)                                                                                       | n/a                                                                             | [sls], [src-types]                           |
| MCP server                                                                 | Cloud-only (Premium+)                                      | n/a                                                                                                                               | n/a                                                                             | [mcp]                                        |
| dbt pull                                                                   | Cloud-only (Premium+); `cube_dbt` package separate         | `cube dbt sync`; `cube_dbt` in model files                                                                                        | Possible "Import from dbt" through `cube_dbt` (unverified)                      | [dbt], [pypi-cube-dbt]                       |
| Tableau / Power BI via SQL API                                             | Core                                                       | SQL API (Postgres protocol)                                                                                                       | Admin › BI connections (show host, port, credentials)                           | [viz-tableau], [pbi]                         |
| Excel add-in, Sheets add-on, Snowflake Semantic Views, Slack, Agent skills | Cloud-only                                                 | n/a                                                                                                                               | n/a                                                                             | [excel], [sheets], [snow], [slack], [skills] |

## Gotchas

1. **Model edits in production mode.** Without `schemaVersion`, the compiler version stays `'default_schema_version'`, so edited model files are ignored until restart ([src-compiler]). `fastReload`/`CUBEJS_FAST_RELOAD_ENABLED` hashes every model file on every request, and it is undocumented ([src-compiler], [src-env]).
2. **`driverFactory` results are cached per orchestrator ID** ([cfg]). A changed connection takes effect only under a new orchestrator ID or after a restart. It also overrides `CUBEJS_PRE_AGGREGATIONS_*` for **all** data sources ([cfg]).
3. **Multitenancy footguns** ([mt], [r-model]):
   - `contextToAppId` alone isolates only the model.
   - Leaving out `scheduledRefreshContexts` gives an `undefined` security context in the refresh worker.
   - A `default` data source must exist.
   - Memory grows with every app ID and orchestrator ID.
4. **Dev mode is an authentication bypass** ([devmode], [src-devserver]). It serves unauthenticated routes that write `.env`, write model files, `npm install` allow-listed drivers, and mint tokens for any security context. Never expose port 4000 beyond localhost in dev mode.
5. **Breaking changes in the 1.7 line** ([chlog], [dep]):
   - `dbType` throws.
   - `contextToRoles`, `renewQuery`, `running_total`, the Elasticsearch driver, and `CUBEJS_SCHEDULED_REFRESH_CONCURRENCY` are removed; use `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID`.
   - `continueWaitTimeout` now defaults to 10 s.
   - "All numeric values in query results are now serialized as JSON strings", which affects chart data parsing.
   - `cube.ts` has been removed since 1.7.34.
6. **Cube Store image platforms.** `cubejs/cubestore:v1.7.42` is amd64-only. arm64 hosts need `v1.7.42-arm64v8` ([hub-cs], [deploy]).
7. **Cube Store in Core has no authentication and no replication.** Any node failure takes down the cluster. Local-path storage is for single-machine use only, and MinIO may break consistency ([prod]).
8. **No curl in either image** ([src-dockerfile], [src-cs-dockerfile]). Use `node -e fetch(...)` for the Cube healthcheck. Cube Store's health port 3031 is source-only.
9. **Node versions.**
   - The image runs Node 24.21.0 ([src-dockerfile]).
   - npm `engines` still says `>=20`, while DEPRECATION.md says Node 20 was removed in v1.7.0 and Node 22 is deprecated ([npm-core], [dep]).
   - Node 26 is not mentioned anywhere.
   - `@cubejs-backend/native` has no linux-musl build, so Alpine-based custom images won't get the native module ([release]). In dev mode the SQL API port is then disabled with "Native module not supported on platform" ([src-env]).
10. **`cubejs validate` pitfalls.** It defaults to `--schema-path schema` rather than `model`, so pass `-p model` ([src-cli-validate]). Since 1.7.34 it can hang after success when the model has Python files (open issue #11908) ([i11908]).
11. **`CUBEJS_LOG_LEVEL` default is inconsistent.** The docs say `warn` ([env]), but the source falls back to `'info'` when unset ([src-logger], [src-env]). Set it explicitly.
12. **The Jobs API needs the `jobs` scope,** which is off by default ([rest]). Granting it widely lets any holder trigger builds; `contextToApiScopes` can grant it per context ([cfg]). Open issue #11609 reports two problems: "done" can hide zero-row (ghost) partitions, and jobs-API builds run in-process on API instances ([i11609]).
13. **Refresh-worker memory.** Open issue #11860 reports heap growth to OOM when a partitioned pre-aggregation's build range moves with time. The workaround is to align range bounds so they change rarely ([i11860]). Cube's sizing guidance is at least 6 GB with `--max-old-space-size=6144` ([deploy]).
14. **Dev-mode meta hang.** Open issue #11623 reports `/v1/meta` hanging after a query followed by a model edit, across the 1.7 line; it was reproduced with `databricks-jdbc` ([i11623]).
15. **The Core Playground cannot edit generated models in the UI,** per open issue #11338 ([i11338]).
16. **Scheduler settings.** Don't set `scheduledRefreshTimer` to a constant value across a cluster ([cfg]). `orchestratorOptions` changes are "strongly" discouraged ([cfg]).
17. **The SQL API is disabled by default in Core.** It must be enabled with `CUBEJS_PG_SQL_PORT` and credentials ([sql-api]).
18. **Telemetry defaults to on** (`CUBEJS_TELEMETRY=true`) ([env]). Collection happens for dev-mode servers ([cfg]).
19. **Model files can't read `process.env`.** Import values from a separate JS file, or use `env_var()` in YAML/Jinja ([r-env]).
20. **Undocumented surfaces can change without notice:** `/cubejs-system/*`, `CUBEJS_PLAYGROUND_AUTH_SECRET`, `CUBEJS_AGENT_ENDPOINT_URL`, `fastReload`, and the Cube Store status port. They are cited from source only ([src-gw], [src-agent], [src-env], [src-cs-status]).

## Alternatives considered

Not requested.

## Open questions / unverified

- **Semantic Layer Sync in Core.** UNVERIFIED whether Core runs `semanticLayerSync` at all. The option is in Core's options schema and types ([src-validate], [src-types]), but `server.ts` never references it and no sync module exists in `server-core/src/core` ([src-core]). The docs describe triggers (deploys, the IDE) that only exist in Cloud ([sls]). A web search for the identifier found nothing.
- **`cube_dbt` with Core at v1.7.42.** UNVERIFIED. The package exists (0.6.3, MIT, Python ≥3.8, uploaded 2025-10-22) ([pypi-cube-dbt]), but the v1.7.42 dbt page documents only the Cloud flow ([dbt]).
- **Node 26 for embedded Cube packages.** UNVERIFIED. `@cubejs-backend/native` builds against N-API (`napi-6`), which is ABI-stable across Node majors ([src-native-cargo]), but Cube states no Node 26 support. This only matters if wechart runs Cube packages outside the image.
- **Orchestrator eviction.** UNVERIFIED whether orchestrators are evicted when orchestrator IDs rotate. Compilers use an LRU (`compilerCacheSize`, `maxCompilerCacheKeepAlive`) ([src-core]); I found no eviction for `orchestratorStorage`. This matters if wechart rotates IDs to apply connection changes.
- **Refresh-worker endpoints.** No doc says the refresh-worker container serves `/readyz` and `/livez` the same way as the API, though it runs the same `cubejs server` image and command ([deploy], [src-dockerfile]). **Since observed locally (2026-09-22):** it does, answering `200 {"health":"HEALTH"}` on both. See `refresh-jobs-caching.md` §F, "Observed locally".
- **Payload shapes** of the `/cubejs-system/v1/*` endpoints and of `CUBEJS_AGENT_ENDPOINT_URL` events are not documented. They were only seen in source ([src-gw], [src-agent]).
- **Image digests.** I have per-platform digests only ([hub-cube], [hub-cs]). Multi-arch index digests for digest pinning were not retrieved.
- **The `/readyz` "standalone" branch.** The readiness handler tests connections only when `this.standalone` is true ([src-gw]). I did not verify which deployments set that flag.
- **Product decisions for the user** (not researchable):
  - (a) Should local compose run with dev mode on (hot reload, Playground, no auth) or off (production-faithful, model reload through `schemaVersion`)?
  - (b) Should the browser call Cube directly (needs CORS and wechart-minted tokens) or go through wechart's server?
  - (c) Should wechart's UI be able to restart Cube containers for env-level changes? That needs Docker API access, which carries security risk. The alternative is to generate config and have an operator restart.
  - (d) Which undocumented Core surfaces, if any, is wechart allowed to depend on?
- **Method caveat.** Most docs and source files were read through a summarizing fetch tool. Code blocks and quoted strings were requested verbatim, and the compose YAML from [deploy] came back verbatim. The fetch tool's first Playground summary included a "Not offered" list that the source does not contain. That list was discarded, and §6 relies on [gs-create] and [src-devserver] instead.

[cfg]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[env]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[cli-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/cli.mdx
[arch]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/architecture.mdx
[deploy]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/deployment.mdx
[prod]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx
[gs-create]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/getting-started/create-a-project.mdx
[gs-preagg]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/cube-core/getting-started/add-a-pre-aggregation.mdx
[devmode]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/dev-mode.mdx
[playground]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/explore-analyze/playground.mdx
[mt]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/embedding/multitenancy.mdx
[r-model]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/configuration/custom-data-model-per-tenant.mdx
[r-ds]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx
[r-env]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/configuration/environment-variables.mdx
[mds]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx
[conc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/connect-to-data/concurrency.mdx
[ds-pg]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
[rest]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[rest-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[sql-api]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[cs-sql]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx
[admin-core]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/deployment/core.mdx
[scal]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/deployment/scalability.mdx
[mon-int]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/monitoring/monitoring-integrations/index.mdx
[mon-qh]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/monitoring/query-history.mdx
[mon-perf]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/monitoring/performance.mdx
[mon-pa]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx
[mon-audit]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/monitoring/audit-log.mdx
[sls]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/semantic-layer-sync/index.mdx
[mcp]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/mcp-server.mdx
[dbt]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/dbt.mdx
[tableau]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/tableau.mdx
[viz-tableau]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/admin/connect-to-data/visualization-tools/tableau.mdx
[pbi]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/power-bi/index.mdx
[excel]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/microsoft-excel.mdx
[sheets]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/google-sheets.mdx
[snow]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/snowflake-semantic-views.mdx
[slack]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/slack.mdx
[skills]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/integrations/agent-skills.mdx
[dep]: https://github.com/cube-js/cube/blob/v1.7.42/DEPRECATION.md
[chlog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[release]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[src-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/types.ts
[src-validate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/optionsValidate.ts
[src-opts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts
[src-core]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[src-compiler]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts
[src-devserver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DevServer.ts
[src-logger]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/logger.ts
[src-agent]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/agentCollect.ts
[src-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[src-gw]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server/src/server.ts
[src-dockerfile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-docker/latest.Dockerfile
[src-cs-dockerfile]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/Dockerfile
[src-cs-config]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/config/mod.rs
[src-cs-status]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/http/status.rs
[src-native-pkg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-native/package.json
[src-native-cargo]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-native/Cargo.toml
[src-cli-token]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/token.ts
[src-cli-validate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/validate.ts
[src-cli-create]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/create.ts
[src-cli-generate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/generate.ts
[src-cli-typegen]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/typegen.ts
[src-cli-deploy]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/deploy.ts
[src-cli-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/server.ts
[hub-cube]: https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=50&name=v1.7.42
[hub-cs]: https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=50&name=v1.7.42
[hub-pg]: https://hub.docker.com/v2/repositories/library/postgres/tags?page_size=25&name=18
[npm-core]: https://registry.npmjs.org/@cubejs-backend/server-core/1.7.42
[npm-cli]: https://registry.npmjs.org/cubejs-cli/1.7.42
[pypi-cube-dbt]: https://pypi.org/pypi/cube-dbt/json
[cube-dbt-readme]: https://github.com/cube-js/cube_dbt/blob/main/README.md
[pricing]: https://cube.dev/pricing
[pg-image]: https://github.com/docker-library/docs/blob/master/postgres/content.md
[pg-isready]: https://www.postgresql.org/docs/18/app-pg-isready.html
[compose]: https://docs.docker.com/reference/compose-file/services/
[node-fetch]: https://nodejs.org/docs/latest-v24.x/api/globals.html#fetch
[cors]: https://github.com/expressjs/cors/blob/master/README.md
[i11338]: https://github.com/cube-js/cube/issues/11338
[i11609]: https://github.com/cube-js/cube/issues/11609
[i11613]: https://github.com/cube-js/cube/issues/11613
[i11623]: https://github.com/cube-js/cube/issues/11623
[i11860]: https://github.com/cube-js/cube/issues/11860
[i11908]: https://github.com/cube-js/cube/issues/11908
