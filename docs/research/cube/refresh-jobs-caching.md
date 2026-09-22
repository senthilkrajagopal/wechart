---
library: Cube (Cube Core): refresh worker, pre-aggregation jobs, query orchestration and caching
packages: [@cubejs-client/core]
version: 1.7.42
researched: 2026-09-19
sources:
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/refreshing-pre-aggregations.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/airflow.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/dagster.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/prefect.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/concurrency.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/warm-up.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-refreshes.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-tasks.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/performance.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/alerts.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/monitoring-integrations/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/architecture.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/deployment.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/index.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts
---

# Cube 1.7.42: refresh worker, jobs, orchestration and caching

## Summary

This document covers the part of Cube Core that builds and refreshes pre-aggregations (the **refresh worker**), triggers and tracks builds on demand (the **Orchestration API**, `POST /v1/pre-aggregations/jobs`), queues and caches queries (the **query orchestrator**, with the in-memory or Cube Store cache and queue), and reports health (`/readyz`, `/livez`). It also separates these from the Cube Cloud features with similar names: Query History, Performance Insights, the Pre-Aggregations console, Alerts, Monitoring Integrations, deployment warm-up, Scheduled Refreshes and Scheduled Tasks.

The need comes from the user's product direction, which asks to surface "jobs if any" along with nearly all other Cube capabilities ([docs/inputs/2026-09-19-product-direction.md §1](/Users/srajagopal/Work/wechart/docs/inputs/2026-09-19-product-direction.md)). The caller did not supply any AC or feature IDs, and `docs/spec.md` does not exist yet, so this document cites none. The capability inventory below is meant to feed the interview and spec.

The main finding: Core does ship a documented, scoped HTTP API to **trigger and poll pre-aggregation builds**. It also exposes per-query **freshness** metadata (`lastRefreshTime`, `usedPreAggregations`), a **query cancel** endpoint and **health probes**. Core ships **no** query history, performance dashboards, alerts, build history, dashboard refresh scheduling or public "list jobs" endpoint. wechart would have to build those from Cube's `logger` hook, its own metadata DB and its own scheduler. A second, **undocumented** route family `/cubejs-system/v1/pre-aggregations/*` exists in the 1.7.42 source. It can list pre-aggregations and partitions, preview data, build selected partitions, view the build queue and cancel queued builds. It is only mounted when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set ([src-gateway][]).

## Install

**Cube server side (Docker, in wechart's docker-compose)**

- Images: `cubejs/cube:v1.7.42` (pushed 2026-09-18) ([docker-cube][]) and `cubejs/cubestore:v1.7.42` (pushed 2026-09-18) ([docker-cubestore][]). The 1.7.42 release upgraded the Docker image to Node.js 24.21.0 ([changelog][]). wechart's Node 26 requirement applies to wechart's own packages, not to the Cube container.
- The refresh worker uses the same `cubejs/cube` image with `CUBEJS_REFRESH_WORKER=true` ([doc-deploy][], [doc-arch][]).
- Cube Store must run as a separate process in production and backs the cache, the queue and pre-aggregations ([doc-rip][], [doc-deploy][]).

**wechart client side (browser or Node)**

- `pnpm add @cubejs-client/core@1.7.42`. The latest npm version is 1.7.42, the license is MIT and `engines.node` is `>=20.0.0`. Runtime deps: `uuid`, `dayjs`, `ramda`, `core-js`, `d3-format`, `d3-time-format`, `url-search-params-polyfill` ([npm-client-core][]).
- `@cubejs-client/core` has **no** methods for the jobs endpoint, running-query cancellation or health probes. Its public methods are `load`, `subscribe`, `sql`, `meta`, `dryRun`, `cubeSql` and `cubeSqlStream` ([src-client-index][]). Its transport's `method` type is `'GET' | 'PUT' | 'POST' | 'PATCH'` with no `DELETE` ([src-client-http][]). Those endpoints therefore need plain `fetch`.

**Orchestrator integrations (Python; wechart does not import them)**

| Package                         | Latest | License    | Last upload | Wraps                                                                                                                   |
| ------------------------------- | ------ | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `airflow-provider-cube`         | 0.0.1  | Apache-2.0 | 2023-09-20  | `CubeQueryOperator` → `/v1/load`, `CubeBuildOperator` → `/v1/pre-aggregations/jobs` ([pypi-airflow][], [doc-airflow][]) |
| `dagster-cube` (`dagster_cube`) | 0.1.0  | not stated | 2023-09-20  | `CubeResource.make_request(...)` ([pypi-dagster][], [doc-dagster][])                                                    |
| `prefect-cubejs`                | 0.1.8  | Apache-2.0 | 2023-03-09  | `run_query`, `build_pre_aggregations(..., wait_for_job_run_completion=True)` ([pypi-prefect][], [doc-prefect][])        |

## Init / auth pattern

### 1. Topology: API instance(s), one refresh worker, Cube Store

The following compose file is adapted from the Core deployment docs ([doc-deploy][], [doc-rip][]). The service names and the choice of a single Cube Store node for local dev are illustrative.

```yaml
services:
  cube_api:
    image: cubejs/cube:v1.7.42
    ports: ['4000:4000']
    environment:
      - CUBEJS_API_SECRET=${CUBEJS_API_SECRET}
      - CUBEJS_CUBESTORE_HOST=cubestore
      - CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore # dev default is `memory`
      # Either grant `jobs` globally (keep `sql` if the SQL endpoint is used)...
      # - CUBEJS_DEFAULT_API_SCOPES=meta,data,graphql,sql,jobs
      # ...or grant it per token with contextToApiScopes (see cube.js below)
    volumes: ['.:/cube/conf']
    depends_on: [cubestore, cube_refresh_worker]
  cube_refresh_worker:
    image: cubejs/cube:v1.7.42
    environment:
      - CUBEJS_API_SECRET=${CUBEJS_API_SECRET}
      - CUBEJS_CUBESTORE_HOST=cubestore
      - CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore
      - CUBEJS_REFRESH_WORKER=true
    volumes: ['.:/cube/conf']
  cubestore:
    image: cubejs/cubestore:v1.7.42
    environment:
      - CUBESTORE_REMOTE_DIR=/cube/data
    volumes: ['.cubestore:/cube/data']
```

Why the explicit settings:

- `CUBEJS_CACHE_AND_QUEUE_DRIVER` defaults to `memory` in development and `cubestore` in production ([doc-env][]). The docs warn that replicating Cube instances without Cube Store causes race conditions and cache inconsistencies ([doc-deploy][]).
- `CUBEJS_REFRESH_WORKER` makes an instance "only refresh pre-aggregations" ([doc-env][]). The worker should get at least 6GB RAM ([doc-deploy][]).
- The `jobs` scope is **not** accessible by default. The default scopes are `meta,data,graphql,sql` ([doc-rest][], [doc-env][]).

### 2. `cube.js` configuration for this area

```js
// cube.js: option names are from the config reference; values are illustrative only.
module.exports = {
  // Grant `jobs` only to privileged tokens. The claim name is a placeholder, not a decided requirement.
  contextToApiScopes: async (securityContext, defaultScopes) =>
    securityContext?.canRunJobs ? [...defaultScopes, 'jobs'] : defaultScopes,

  // Required when securityContext drives contextToAppId / contextToOrchestratorId.
  scheduledRefreshContexts: async () => [{ securityContext: { tenant_id: 'demo' } }],

  // Time zones pre-aggregations are built for (default: ['UTC']).
  scheduledRefreshTimeZones: ['UTC'],

  // Documented hook: the only Core source for query-history-like data.
  logger: (message, params) => {
    console.log(JSON.stringify({ message, ...params }));
    // forward selected events to wechart's collector (design pending)
  },
};
```

Sources for the options:

- `contextToApiScopes(securityContext, defaultScopes)` is called on each request ([doc-config][]). If `CUBEJS_DEFAULT_API_SCOPES` is unset, the default list is `['graphql','meta','data','sql']` ([src-gateway][]).
- `scheduledRefreshContexts` must be set when the security context drives `context_to_app_id` or `context_to_orchestrator_id`. Otherwise the security context is `undefined` ([doc-config][]).
- `scheduledRefreshTimeZones` takes an array or a function of the security context. The default is `UTC` ([doc-config][]).
- `logger(message, params)` is documented ([doc-config][]).

### 3. Calling the jobs API from wechart (server side)

This is TypeScript with plain `fetch`. Request and response shapes come from the REST reference ([doc-rest-ref][]) and the Joi schema ([src-query][]). Status strings come from the gateway and orchestrator source ([src-gateway][], [src-pa][]).

```ts
type PreAggsSelector = {
  contexts: { securityContext: unknown }[]; // required, min 1
  timezones: string[]; // required, min 1, IANA names
  dataSources?: string[];
  cubes?: string[];
  preAggregations?: string[]; // e.g. "orders.main"
  dateRange?: [string, string]; // local time, no TZ; 'Z' also accepted
};
type JobStatus =
  | 'scheduled'
  | 'processing'
  | 'done'
  | 'missing_partition'
  | 'not_found'
  | 'pre_agg_not_found'
  | `failure: ${string}`
  | (string & {});
type JobStatusItem = {
  token: string;
  status: JobStatus;
  table?: string;
  selector?: Required<Pick<PreAggsSelector, 'contexts' | 'timezones'>> & {
    cubes: string[];
    preAggregations: string[];
    dataSources: (string | undefined)[];
  };
};

const base = 'http://cube_api:4000/cubejs-api/v1';

export async function postJobs(token: string, selector: PreAggsSelector): Promise<string[]> {
  const r = await fetch(`${base}/pre-aggregations/jobs`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'post', selector }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json(); // string[] of job tokens
}

export async function getJobs(token: string, tokens: string[]): Promise<JobStatusItem[]> {
  const r = await fetch(`${base}/pre-aggregations/jobs`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get', tokens }), // add resType:'object' for a map
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
```

### 4. Querying with cache control, freshness and cancellation (client-core)

```ts
import cube from '@cubejs-client/core';
const cubeApi = cube(async () => getJwt(), { apiUrl: `${origin}/cubejs-api/v1`, pollInterval: 5 });
const baseRequestId = crypto.randomUUID();
const rs = await cubeApi.load(query, { cache: 'stale-if-slow', baseRequestId, signal });
const [first] = rs.serialize().loadResponse.results;
first.lastRefreshTime; // ISO string
first.usedPreAggregations; // { [table]: { preAggregationId, lastUpdatedAt, type } } | undefined
```

Sources: the default export is `(apiToken: string | (() => Promise<string>), options: CubeApiOptions) => new CubeApi(...)`. `LoadMethodOptions` includes `cache`, `signal`, `baseRequestId` and `progressCallback` ([src-client-index][]). `serialize()` returns `{ loadResponse }` and `LoadResponseResult` carries `lastRefreshTime` and `usedPreAggregations` ([src-client-types][]).

## API surface we will use

### A. Refresh worker (config and env; no HTTP API)

| Knob                                                                                                                                                      | Meaning / default                                                                                                                                                                                                                                                           | Source                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `CUBEJS_REFRESH_WORKER`                                                                                                                                   | `true` means the instance only refreshes pre-aggregations. The docs table lists the default as `false`. In source, when unset (and the legacy vars below are unset) it resolves to `NODE_ENV !== 'production'`, so dev instances run scheduled refresh themselves.          | [doc-env][], [src-env][]                                  |
| `CUBEJS_SCHEDULED_REFRESH` / `CUBEJS_SCHEDULED_REFRESH_TIMER`                                                                                             | Legacy fallbacks read by `refreshWorkerMode`. The timer accepts a bool or a time. Neither appears in the env-var docs.                                                                                                                                                      | [src-env][]                                               |
| `scheduledRefreshTimer` (`boolean \| number`)                                                                                                             | Heartbeat only: refresh keys are _checked_ this often. It does not set data freshness. A number is seconds; `true` means 30 s. Setting a constant on every instance of a cluster turns each one, API instances included, into a refresh worker, which causes races and OOM. | [doc-config][], [src-opts][], [src-types][]               |
| `scheduledRefreshContexts: () => Promise<{securityContext}[]>`                                                                                            | Default `async () => [null]`. The scheduler logs `Refresh Scheduler Error` if it returns an empty list.                                                                                                                                                                     | [src-opts][], [src-server][]                              |
| `scheduledRefreshTimeZones` / `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`                                                                                        | IANA names only. An invalid value fails at startup, and offsets such as `+05:00` are rejected.                                                                                                                                                                              | [doc-config][], [doc-env][], [src-env][]                  |
| `CUBEJS_REFRESH_WORKER_CONCURRENCY`                                                                                                                       | Concurrency of the **pre-aggs queue** against the source DB. Defaults to `CUBEJS_CONCURRENCY`. In source it applies only when `queueType === 'pre-aggs'`.                                                                                                                   | [doc-env][], [src-opts][]                                 |
| `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID` (option `scheduledRefreshConcurrency`)                                                                      | Pre-aggregations built in parallel per app id; default 10. It replaced `CUBEJS_SCHEDULED_REFRESH_CONCURRENCY`, which was removed in 1.7.0. `scheduledRefreshConcurrency` exists in `CreateOptions` but is not in the config docs.                                           | [doc-env][], [deprecation][], [src-types][], [src-opts][] |
| `CUBEJS_SCHEDULED_REFRESH_BATCH_SIZE` (option `scheduledRefreshBatchSize`)                                                                                | How many refresh contexts are processed concurrently (`pLimit`); default `1`. Undocumented.                                                                                                                                                                                 | [src-env][], [src-server][]                               |
| `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH` / `CUBEJS_TOUCH_PRE_AGG_TIMEOUT`                                                                                      | Drop pre-aggregations the worker has not touched within the timeout; defaults `true` / 86400 s.                                                                                                                                                                             | [doc-env][]                                               |
| `CUBEJS_PRE_AGGREGATIONS_BACKOFF_MAX_TIME`                                                                                                                | Maximum exponential backoff for failed builds; default 600 s.                                                                                                                                                                                                               | [doc-env][]                                               |
| `CUBEJS_PRE_AGGREGATIONS_BUILDER`                                                                                                                         | Lets an API instance build pre-aggregations; default `true` in dev, `false` in prod. `externalRefresh` defaults to `!isPreAggsBuilder()`.                                                                                                                                   | [doc-env][], [src-opts][]                                 |
| `CUBEJS_ROLLUP_ONLY` / `rollupOnlyMode`                                                                                                                   | API serves only from pre-aggregations. Otherwise it throws "No pre-aggregation table has been built for this query yet…".                                                                                                                                                   | [doc-env][], [src-qo][]                                   |
| `CUBEJS_PRE_AGGREGATIONS_DB_*` / `CUBEJS_DS_<NAME>_PRE_AGGREGATIONS_DB_*`                                                                                 | Dedicated build connection. Unset values fall back to the driver default, **not** to `CUBEJS_DB_*`.                                                                                                                                                                         | [doc-refresh][]                                           |
| Data model `scheduled_refresh` (default `true`), `refresh_key` (`every` default `1 hour`; `sql`; `incremental`; `update_window`), `build_range_start/end` | Controls what the worker refreshes. `scheduled_refresh: false` pre-aggregations built on demand are eventually treated as orphaned and dropped.                                                                                                                             | [doc-preagg-ref][]                                        |

Worker behavior:

- Each interval, for each accepted context, the worker calls `runScheduledRefresh(context, { concurrency, timezones })` ([src-server][]).
- The worker refreshes cube refresh keys and pre-aggregations, then reconciles. `Continue wait` errors are swallowed; other errors are logged as `Refresh Scheduler Error` ([src-refresh-scheduler][]).
- Overlapping runs log `Refresh Scheduler Interval` with "Previous interval #N was not finished…". The docs treat that as an overloaded worker ([src-server][], [doc-refresh][]).
- The refresh worker only **invalidates** the in-memory cache. The cache is filled lazily by queries ([doc-arch][]).

### B. `POST {base}/v1/pre-aggregations/jobs` (Orchestration API)

- **Auth and scope:** needs a normal API JWT plus the `jobs` scope. Without it the endpoint returns 403 `API scope is missing: jobs` ([src-gateway][], [doc-rest][]). Only POST is registered; both actions use POST ([src-gateway][]).
- **Request schema** (Joi, [src-query][]):
  - `action`: `'post' | 'get'` (required).
  - `selector` (only with `post`): `contexts` (array of `{securityContext}`, min 1, required), `timezones` (IANA, min 1, required), `dataSources?`, `cubes?`, `preAggregations?` (`"cube.preAgg"` ids), `dateRange?` (exactly 2 strings).
  - `tokens` (only with `get`, min 1, required) and `resType?: 'object'` (only with `get`).
- **`post` behavior:** runs once per `selector.contexts[i]`, merging that context over the caller's request context. It resolves matching pre-aggregations, expands partitions (filtered by `dateRange` intersection), and enqueues one build per partition with `forceBuildPreAggregations: true`, `cacheMode: 'stale-if-slow'` and `isJob: true`. It returns `string[]` tokens, one per built partition entry. Each token is the md5 of the job record ([src-gateway][], [src-refresh-scheduler][]).
  - If nothing matches, it returns an error: "A user's selector doesn't match any of the pre-aggregations defined in the data model." ([src-gateway][])
  - `dateRange` is parsed as local time without a time zone; `Z` timestamps are accepted ([src-gateway][]).
- **`get` behavior:** returns `[{ token, table, status, selector: { cubes, preAggregations, contexts, timezones, dataSources } }]`, or with `resType:'object'` a map keyed by token ([doc-rest-ref][], [src-gateway][]).
- **Status values:**
  - `scheduled`: queue state `toProcess` ([src-gateway][])
  - `processing`: queue state `active` ([src-gateway][])
  - `done`: target table exists in the pre-aggregation schema ([src-pa][])
  - `missing_partition`: table absent and no error result. The docs describe it as "the job has failed" ([doc-rest-ref][], [src-pa][]).
  - `failure: <error>`: the queue result carried an error ([src-pa][])
  - `not_found`: token not in the cache. Job records are stored under `PRE_AGG_JOB_<token>` with a TTL of 86400 s ([src-gateway][], [src-refresh-scheduler][])
  - `pre_agg_not_found`: the pre-aggregation is no longer in the compiled model ([src-gateway][])
  - Any other raw queue status string is passed through unchanged ([src-gateway][]).
- **Example request** ([doc-rest-ref][]):
  ```json
  {
    "action": "post",
    "selector": {
      "contexts": [{ "securityContext": { "tenantId": "tenant1" } }],
      "timezones": ["America/Los_Angeles"],
      "preAggregations": ["orders.main"],
      "dateRange": ["2020-01-01", "2020-02-01"]
    }
  }
  ```

### C. Other `/v1/pre-aggregations/*` and system routes present at the tag

| Route                                                                        | Auth                                                                                                | Documented? | Purpose / shape                                                                                                                                                                                                                                                                                                    | Source                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `POST {base}/v1/pre-aggregations/can-use`                                    | user JWT + `meta` scope                                                                             | No          | Body `{ transformedQuery, references }` → `{ canUsePreAggregationForTransformedQuery }`                                                                                                                                                                                                                            | [src-gateway][]                              |
| `GET /cubejs-system/v1/pre-aggregations?cacheOnly&metaOnly`                  | JWT (HS256) signed with `CUBEJS_PLAYGROUND_AUTH_SECRET`; routes mounted only if that env var is set | No          | `{ preAggregations: [...] }`                                                                                                                                                                                                                                                                                       | [src-gateway][], [src-server][], [src-env][] |
| `POST /cubejs-system/v1/pre-aggregations/partitions`                         | same                                                                                                | No          | Body `{ query: { timezones?, preAggregations?: [{id, partitions?, refreshRange?}], expand?: ['partitions.details','partitions.meta','partitions.versions'] } }` → `{ preAggregationPartitions: [{ errors, preAggregation, timezones, invalidateKeyQueries, partitions: [...versionEntries, structureVersion] }] }` | [src-gateway][], [src-query][]               |
| `POST /cubejs-system/v1/pre-aggregations/preview`                            | same                                                                                                | No          | `{ query: { preAggregationId, versionEntry: { table_name }, timezone } }` → `{ preview }`                                                                                                                                                                                                                          | [src-gateway][]                              |
| `POST /cubejs-system/v1/pre-aggregations/build`                              | same                                                                                                | No          | Normalized `{ query: { preAggregations: [{ id, partitions?, refreshRange? }], timezones? } }` → `{ result }`                                                                                                                                                                                                       | [src-gateway][], [src-query][]               |
| `POST /cubejs-system/v1/pre-aggregations/queue`                              | same                                                                                                | No          | → `{ result: <pre-agg queue states> }`                                                                                                                                                                                                                                                                             | [src-gateway][]                              |
| `POST /cubejs-system/v1/pre-aggregations/cancel`                             | same                                                                                                | No          | `{ query: { queryKeys: string[], dataSource } }` → `{ result }`                                                                                                                                                                                                                                                    | [src-gateway][]                              |
| `GET /cubejs-system/v1/pre-aggregations/security-contexts` / `.../timezones` | same                                                                                                | No          | Output of `scheduledRefreshContexts` / `scheduledRefreshTimeZones`                                                                                                                                                                                                                                                 | [src-gateway][]                              |
| `GET /cubejs-system/v1/context`                                              | same                                                                                                | No          | `{ basePath, dockerVersion, serverCoreVersion }`                                                                                                                                                                                                                                                                   | [src-gateway][]                              |

`/v1/run-scheduled-refresh` is **not** registered in `gateway.ts` at the tag ([src-gateway][]).

### D. Query orchestration and caching

- **Cache and queue driver:** `cacheAndQueueDriver` / `CUBEJS_CACHE_AND_QUEUE_DRIVER` accepts only `memory` or `cubestore`; anything else throws ([doc-config][], [src-qo][]). Redis support was removed in v0.36.0 ([deprecation][]).
- **Cube Store cache and queue store:** runs on the router with its own RocksDB, persisted across restarts. Relevant settings are `CUBESTORE_CACHE_MAX_SIZE` (default 4 GiB), `CUBESTORE_CACHE_MAX_KEYS` (default 100,000) and `CUBESTORE_CACHE_MAX_ENTRY_SIZE` (default 63 MiB). Queue items move Pending → Active → Finished, with a separate queue per data source and for pre-aggregation builds ([doc-cs-arch][], [doc-env][]).
- **Result cache key:** the generated SQL plus query-dependent pre-aggregations. The cached value is returned while the query's `refresh_key` is unchanged ([doc-caching][]).
- **Default cube `refresh_key`:** `every: '2 minute'` for BigQuery, Athena, Snowflake, Presto and Firebolt, and `every: '10 second'` for other databases. A query's refresh key concatenates the refresh keys of the cubes involved ([doc-cube-ref][]).
- **Refresh key checks:** `CUBEJS_REFRESH_KEY_LOCAL_TIME=true` checks `every`-based keys against Cube's own clock instead of querying the DB ([doc-env][]). `queryCacheOptions.refreshKeyRenewalThreshold` and `backgroundRenew` are tuning knobs ([doc-config][]).
- **Per-request cache control:** the `cache` parameter on `/v1/load` (GET query or POST body) and `/v1/cubesql`. Values are `stale-if-slow` (default), `stale-while-revalidate`, `must-revalidate` and `no-cache` ([doc-rest][], [doc-rest-ref][], [src-gateway][]). In client-core it is `LoadMethodOptions.cache: CacheMode` ([src-client-types][]).
  - `renewQuery` was removed in 1.7.0. `cache: 'must-revalidate'` replaces `renewQuery: true` ([deprecation][], [changelog][]).
  - **What each value does** (added 2026-09-21 for T154, quoted from the REST API page's cache control section, [docs.cube.dev/reference/core-data-apis/rest-api](https://docs.cube.dev/reference/core-data-apis/rest-api)):
    - `stale-if-slow`: "If refresh keys are up-to-date, returns cached value. If expired, tries to return fresh value from the data source. If the data source query is slow (hits `Continue wait`), returns stale value from cache."
    - `stale-while-revalidate`: "If refresh keys are up-to-date, returns cached value. If expired, returns stale data from cache and updates cache in background."
    - `must-revalidate`: "If refresh keys are up-to-date, returns cached value. If expired, always waits for fresh value from the data source, even if slow."
    - `no-cache`: "Skips refresh key checks. Always returns fresh data from the data source, regardless of cache or query performance."
  - **So "refresh now" is `no-cache`.** `must-revalidate` still returns the cached result while the refresh key holds, which is 10 s by default for Postgres. The browser tests saw the same `lastRefreshTime` come back.
- **Freshness in `/v1/load` responses:**
  - Always present: `lastRefreshTime` (ISO), `external` (served from Cube Store), `dataSource`, `dbType`, `extDbType`, `slowQuery`, `total`.
  - `usedPreAggregations` is keyed by table and limited to `{ preAggregationId, lastUpdatedAt, type }`. It is absent when no pre-aggregation was used ([doc-rest-ref][], [src-gateway][]).
  - `refreshKeyValues`, `transformedQuery`, `requestId` and the full `usedPreAggregations` are added only in dev mode or for playground-secret-signed requests ([src-gateway][]).
  - `usedPreAggregations` was exposed on data responses in 1.7.33 ([changelog][]).
- **"Continue wait" long polling:**
  - When a request outlasts `continueWaitTimeout`, the REST API returns HTTP 200 `{ "error": "Continue wait" }`. The database query keeps running, and the client should retry the same query until it gets a result ([doc-rest][]).
  - The default timeout is 10 s (changed from 5 s in 1.7.0) with a documented maximum of 90 ([doc-config][], [changelog][]).
  - Under `stale-if-slow` or `stale-while-revalidate`, a cached stale value is returned with `slowQuery: true` instead of `Continue wait` ([src-orch-api][]).
  - The HTTP body is exactly `{ error, requestId }`, and `requestId` appears only in dev or playground-signed mode ([src-gateway][]).
  - client-core retries automatically every `pollInterval` seconds (default 5) and calls `progressCallback(new ProgressResult(body))` ([src-client-index][], [src-client-progress][]).
- **Queue options:** `orchestratorOptions.queryCacheOptions.queueOptions` and `preAggregationsOptions.queueOptions` set `concurrency` (doc default 2), `executionTimeout` (600, or `CUBEJS_DB_QUERY_TIMEOUT`, default `10m`), `orphanedTimeout` (120) and `heartBeatInterval` (30) ([doc-config][], [src-qq][], [doc-env][]).
  - Concurrency resolution order in source: explicit option, then `CUBEJS_REFRESH_WORKER_CONCURRENCY` (pre-aggs queue only), then `CUBEJS_CONCURRENCY` / `CUBEJS_DS_<NAME>_CONCURRENCY`, then the driver default, then 5 ([src-opts][], [src-env][]).
  - `CUBEJS_QUEUE_FAST_TRACK` is an experimental Cube Store fast path, off by default and needing Cube and Cube Store ≥ 1.7.26 ([doc-env][]).
- **Queue position ("stage"):** the orchestrator computes `Executing query`, `#N in queue` or `Building pre-aggregation i/n…` ([src-qq][], [src-qo][]). `OrchestratorApi` attaches `stage` to the thrown `Continue wait`, but the HTTP handler does not forward it ([src-orch-api][], [src-gateway][]).
- **Cancel a query:** `DELETE {base}/v1/running-query/{requestId}` → `{ result: QueryDef[] }` (an empty array if nothing matched). It uses the `x-request-id` of the original request and applies across all query and pre-aggregation queues of the caller's orchestrator ([doc-rest-ref][], [src-qo][]).
  - Matching compares `extractRequestUUID(...)` of both IDs ([src-qq][]).
  - client-core sends `x-request-id: ${baseRequestId}-span-${n}` ([src-client-http][]).
  - The handler makes no `assertApiScope` call ([src-gateway][]).
- **Tenant isolation:** `contextToOrchestratorId` gives each tenant its own connections, queues and result cache. It is required with a multi-connection `driver_factory`, and `pre_aggregations_schema` must be overridden alongside it ([doc-config][], [doc-concurrency][]).

### E. Data source concurrency

- Default concurrency by source: Athena 10, Redshift 5, Pinot 10, ClickHouse 10, Databricks 10, Firebolt 10, BigQuery 10, Snowflake 8, and 5 or less for others (Postgres falls in this group) ([doc-concurrency][]).
- `CUBEJS_DB_MAX_POOL` must exceed the total concurrency of the query queues plus the refresh worker ([doc-concurrency][]). The `driver_factory` docs say pool size is "typically … at least twice of total concurrency among all queues" ([doc-config][]).
- By default a **single** queue serves all API instances and the refresh worker ([doc-concurrency][]).

### F. Health and monitoring in Core

- `GET /readyz` and `GET /livez` take no auth. They return 200 `{"health":"HEALTH"}` or 500 `{"health":"DOWN"}` ([doc-rest-ref][], [src-gateway][]).
  - Readiness (when `standalone`) tests the default data source and the orchestrator connections. Liveness tests existing data source and orchestrator connections ([src-gateway][]).
  - Both are wrapped in `cachedHandler` with a 1000 ms lifetime ([src-cached][]).
- **Logs:** in production Cube writes structured JSON logs, one object per line with a `level` field. `CUBEJS_LOG_LEVEL` accepts `error|info|trace|warn` (default `warn`) and `CUBESTORE_LOG_LEVEL` defaults to `error` ([doc-env][]).
  - Gateway event types include `Load Request`, `Load Request Success` (`duration`, `apiType`, `queries`, `queriesWithPreAggregations`, `dbType[]`, `lastRefreshTime`), `Continue wait`, `Orchestrator error`, `Internal Server Error` and `Auth Error` ([src-gateway][]).
  - Queue events include `Added to queue`, `Performing query`, `Performing query completed` (`queueSize`, `duration`, `timeInQueue`, `requestId`, `preAggregationId`, `newVersionEntry`), `Cancelling query due to timeout` and `Removing orphaned query` ([src-qq][]).
- **Metrics:** Cube Store can emit statsd or dogstatsd metrics (`CUBESTORE_METRICS_FORMAT/ADDRESS/PORT`) ([doc-env][]). The Cube API gateway registers **no** `/metrics` route ([src-gateway][]).
- **Cube Store SQL interface** (MySQL protocol, port 3306): offers `information_schema.tables`, `EXPLAIN [ANALYZE [DETAILED]]`, `CACHE …`, `QUEUE LIST|PENDING|ACTIVE|STALLED|ORPHANED|CANCEL…` and destructive `SYS …` commands. It is available only when you run Cube Store yourself; Cube Cloud does not expose the port ([doc-cs-sql][]). Cube Store has no built-in authentication ([doc-rip][]).

## Capability inventory

| Capability                                                                          | Core or Cloud-only                                                                                                           | API/config surface to drive it                                                                                                                                          | Candidate wechart UI surface                                                                                                                           | Source                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Background refresh worker                                                           | Core                                                                                                                         | `CUBEJS_REFRESH_WORKER`, `scheduledRefreshTimer` (no HTTP API)                                                                                                          | Read-only "Refresh worker" settings/status panel                                                                                                       | [doc-env][], [doc-config][], [doc-arch][]                            |
| Refresh contexts (tenants)                                                          | Core                                                                                                                         | `scheduledRefreshContexts`; undocumented `GET /cubejs-system/v1/pre-aggregations/security-contexts`                                                                     | Tenant picker in "Build" dialog; list of refreshed tenants                                                                                             | [doc-config][], [src-gateway][]                                      |
| Refresh time zones                                                                  | Core                                                                                                                         | `scheduledRefreshTimeZones` / `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`; undocumented `.../timezones`                                                                        | Time zone chips in "Build" dialog                                                                                                                      | [doc-config][], [doc-env][], [src-gateway][]                         |
| Refresh concurrency and batching                                                    | Core                                                                                                                         | `CUBEJS_REFRESH_WORKER_CONCURRENCY`, `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID`, `scheduledRefreshConcurrency`, `CUBEJS_SCHEDULED_REFRESH_BATCH_SIZE` (undocumented) | Deployment settings display                                                                                                                            | [doc-env][], [src-env][], [src-server][]                             |
| Orphan cleanup and build backoff                                                    | Core                                                                                                                         | `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH`, `CUBEJS_TOUCH_PRE_AGG_TIMEOUT`, `CUBEJS_PRE_AGGREGATIONS_BACKOFF_MAX_TIME`                                                         | Deployment settings display                                                                                                                            | [doc-env][]                                                          |
| Rollup-only mode                                                                    | Core                                                                                                                         | `CUBEJS_ROLLUP_ONLY` / `rollupOnlyMode`                                                                                                                                 | Explain "not built yet" errors on charts                                                                                                               | [doc-env][], [src-qo][]                                              |
| Trigger pre-aggregation builds (all / by pre-agg / cube / data source / date range) | Core                                                                                                                         | `POST /v1/pre-aggregations/jobs` `action:'post'` + `jobs` scope                                                                                                         | "Build now" on pre-agg, cube and data-source pages; date-range rebuild                                                                                 | [doc-orch][], [doc-rest-ref][], [src-query][]                        |
| Job status polling                                                                  | Core                                                                                                                         | Same endpoint, `action:'get'` (TTL 24 h)                                                                                                                                | Jobs panel with live status per partition                                                                                                              | [doc-rest-ref][], [src-gateway][], [src-refresh-scheduler][]         |
| Job list and history beyond 24 h                                                    | **Not in Core API**; Cloud console shows 24 h Build History                                                                  | None (no list endpoint; records expire after 86400 s)                                                                                                                   | Jobs history page. **wechart must persist tokens, selectors and final statuses in its metadata DB**                                                    | [src-refresh-scheduler][], [doc-mon-preaggs][]                       |
| Build selected partitions                                                           | Core via date range (documented); by partition name only via undocumented `/cubejs-system/.../build`; Cloud "Build Selected" | `selector.dateRange`; `{preAggregations:[{id, partitions, refreshRange}]}`                                                                                              | Partition table with "Rebuild selected"                                                                                                                | [doc-rest-ref][], [src-query][], [doc-mon-preaggs][]                 |
| Pre-aggregation catalog, partitions, last build time                                | Cloud console; Core only via undocumented `/cubejs-system/.../partitions` or Cube Store `information_schema.tables`          | See §C; MySQL 3306                                                                                                                                                      | Pre-aggregation catalog with freshness per partition                                                                                                   | [doc-mon-preaggs][], [src-gateway][], [doc-cs-sql][]                 |
| Pre-aggregation data preview                                                        | Cloud console; Core via undocumented `/cubejs-system/.../preview`                                                            | `{preAggregationId, versionEntry, timezone}`                                                                                                                            | "Preview" tab                                                                                                                                          | [doc-mon-preaggs][], [src-gateway][]                                 |
| Build queue view and cancel queued builds                                           | Core via undocumented `/cubejs-system/.../queue` and `/cancel`; Cube Store `QUEUE` commands                                  | See §C                                                                                                                                                                  | Live "Build queue" with cancel                                                                                                                         | [src-gateway][], [doc-cs-sql][]                                      |
| Can a query use a pre-aggregation                                                   | Core (undocumented)                                                                                                          | `POST /v1/pre-aggregations/can-use` (`meta` scope)                                                                                                                      | Hint in chart builder                                                                                                                                  | [src-gateway][]                                                      |
| Airflow / Dagster / Prefect integrations                                            | Core (they call the jobs endpoint)                                                                                           | Python packages §Install                                                                                                                                                | Help page showing selector JSON to paste into DAGs. wechart cannot list jobs these tools post                                                          | [doc-airflow][], [doc-dagster][], [doc-prefect][]                    |
| Result cache (in-memory or Cube Store)                                              | Core                                                                                                                         | `cacheAndQueueDriver`, `CUBESTORE_CACHE_*`                                                                                                                              | Deployment settings display                                                                                                                            | [doc-config][], [doc-cs-arch][]                                      |
| Per-request cache policy                                                            | Core                                                                                                                         | `cache` on `/v1/load` and `/v1/cubesql`; `LoadMethodOptions.cache`                                                                                                      | "Refresh" button (`must-revalidate`/`no-cache`); default `stale-if-slow`                                                                               | [doc-rest][], [src-client-types][]                                   |
| Freshness and acceleration indicator                                                | Core                                                                                                                         | `lastRefreshTime`, `usedPreAggregations`, `external`, `slowQuery` in `/v1/load`                                                                                         | "Data as of …" and "served from pre-aggregation X" badges per chart                                                                                    | [doc-rest-ref][], [src-gateway][]                                    |
| Refresh keys (cube and pre-agg)                                                     | Core (data model)                                                                                                            | `refresh_key {every, sql, incremental, update_window}`, `CUBEJS_REFRESH_KEY_LOCAL_TIME`                                                                                 | Model editor fields (see data-model research)                                                                                                          | [doc-cube-ref][], [doc-preagg-ref][], [doc-env][]                    |
| Long polling ("Continue wait")                                                      | Core                                                                                                                         | HTTP 200 `{error:'Continue wait'}`, `continueWaitTimeout`                                                                                                               | Chart loading state (client-core retries automatically)                                                                                                | [doc-rest][], [doc-config][], [src-client-index][]                   |
| Cancel a running query                                                              | Core                                                                                                                         | `DELETE /v1/running-query/{requestId}`                                                                                                                                  | "Cancel" on slow charts / query runner                                                                                                                 | [doc-rest-ref][], [src-gateway][]                                    |
| Query queue concurrency                                                             | Core                                                                                                                         | `orchestratorOptions.*.queueOptions`, `CUBEJS_CONCURRENCY`, `CUBEJS_DS_<NAME>_CONCURRENCY`, `CUBEJS_DB_MAX_POOL`                                                        | Data-source settings display                                                                                                                           | [doc-config][], [doc-concurrency][], [src-env][]                     |
| Live query queue view                                                               | Cloud (Queue Graph in Query History); Core has no documented endpoint                                                        | Queue log events via `logger`; raw Cube Store `QUEUE LIST` (key prefixes undocumented)                                                                                  | Live queue panel. **wechart must build it from logger events**                                                                                         | [doc-qh][], [src-qq][], [doc-cs-sql][]                               |
| Per-tenant queues and caches                                                        | Core                                                                                                                         | `contextToOrchestratorId`, `contextToAppId`, `pre_aggregations_schema`                                                                                                  | Tenant settings display                                                                                                                                | [doc-config][]                                                       |
| Query History                                                                       | **Cloud-only** (tiered)                                                                                                      | Core: none. Documented hook is `logger(message, params)`; production logs are JSON lines                                                                                | Query history page. **wechart must collect events (e.g. `Load Request Success`, `Performing query completed`, errors) and persist them in its own DB** | [doc-qh][], [doc-config][], [doc-env][], [src-gateway][], [src-qq][] |
| Performance Insights                                                                | **Cloud-only** (Premium+)                                                                                                    | Core: none                                                                                                                                                              | Perf dashboard. **wechart must derive it from its own collected events**                                                                               | [doc-perf][]                                                         |
| Alerts (API down, DB timeout, build failure, build completed)                       | **Cloud-only** (Premium+)                                                                                                    | Core: `/readyz`, `/livez`, job statuses, logs                                                                                                                           | Alert rules. **wechart must build its own evaluator and notifier**                                                                                     | [doc-alerts][], [doc-rest-ref][]                                     |
| Monitoring integrations and Query History export                                    | **Cloud-only** (Enterprise add-on, Vector)                                                                                   | Core: JSON stdout logs; Cube Store statsd; no `/metrics`                                                                                                                | Out of UI scope, or document log shipping                                                                                                              | [doc-mon-int][], [doc-qh-export][], [doc-env][], [src-gateway][]     |
| Health probes                                                                       | Core                                                                                                                         | `GET /readyz`, `GET /livez` (no auth, 1 s cache)                                                                                                                        | Status indicator and health page                                                                                                                       | [doc-rest-ref][], [src-cached][]                                     |
| Deployment warm-up (model and pre-aggs)                                             | **Cloud-only** (Starter+, Dedicated or Multi-cluster)                                                                        | Core: none built in; jobs API can be called after deploy                                                                                                                | Optional "warm up after deploy" action (design decision)                                                                                               | [doc-warmup][]                                                       |
| Scheduled Refreshes of dashboards (warm cache, notify)                              | **Cloud-only** (Premium/Enterprise, Cube workbooks)                                                                          | Core: none                                                                                                                                                              | Dashboard schedule sidebar. **wechart must build a scheduler that runs dashboard queries**; the worker does not populate the in-memory cache           | [doc-sched-refresh][], [doc-arch][]                                  |
| Scheduled Tasks (agent prompts on a schedule)                                       | **Cloud-only** (Cube agent / Analytics Chat; plan not stated in doc)                                                         | Core: none                                                                                                                                                              | Not applicable to phase 1 unless the user scopes chat                                                                                                  | [doc-sched-tasks][]                                                  |
| Cube Store diagnostics                                                              | Core only (Cloud does not expose the port)                                                                                   | MySQL protocol 3306; `EXPLAIN`, `information_schema.tables`, `QUEUE`/`CACHE`, destructive `SYS`                                                                         | Admin diagnostics limited to read-only commands (decision needed)                                                                                      | [doc-cs-sql][], [doc-rip][]                                          |
| Log redaction                                                                       | Core                                                                                                                         | `CUBEJS_LOG_REDACTION` (default `true` in prod)                                                                                                                         | Show that history values are redacted                                                                                                                  | [doc-env][]                                                          |

**What wechart would have to build itself on Core:**

1. Persistent job history and a job list. Core has no list endpoint, and job records expire after 24 h.
2. Query history and a performance view built from the `logger` hook or JSON logs, stored in wechart's metadata DB.
3. Alerting.
4. Dashboard refresh schedules that warm the cache.
5. A live query-queue view.
6. A pre-aggregation catalog, partition freshness view, preview and queue view. The only Core sources are the undocumented `/cubejs-system/*` routes or raw Cube Store SQL; which to use needs a user decision.

## Gotchas

1. **The `jobs` scope is off by default.** The Orchestration API docs suggest `CUBEJS_DEFAULT_API_SCOPES=meta,data,graphql,jobs`, which drops `sql` and so blocks `/v1/sql` ([doc-orch][], [doc-rest][]).
2. **The jobs selector overrides the caller's security context.** `preAggregationsJobsPOST` builds `ctx = { ...callerContext, ...selector.contexts[i] }` ([src-gateway][]), so any holder of the `jobs` scope can build under any tenant's security context. Grant `jobs` narrowly (via `contextToApiScopes`) and keep the token server-side. This is an inference from the source.
3. **A failed build can report `done` in 1.7.42.** At the tag, `isPartitionExist` returns `done` whenever the target table exists ([src-pa][]). PR #11629 ("don't report failed pre-agg build jobs as done") explains that a failed import leaves an empty versioned table behind, so the job reports `done` and the table shadows good data. The PR was merged 2026-09-18 but is **not** in the 1.7.42 changelog or tag source ([pr-11629][], [changelog][]). The UI should not treat `done` as proof of a successful build on this version.
4. **Undocumented job statuses.** The docs list 4 statuses ([doc-rest-ref][]). The source also returns `not_found`, `pre_agg_not_found`, `failure: <msg>` and raw queue states ([src-gateway][], [src-pa][]). The meaning of `missing_partition` was never explained in the tracker (issue closed without an answer) ([issue-9016][]).
5. **Where job records live.** Records sit in the cache driver for 86400 s ([src-refresh-scheduler][]):
   - With the `memory` driver (the dev default), status is only on the instance that received the POST ([doc-env][]).
   - With per-tenant `contextToOrchestratorId`, `get` reads from the caller's orchestrator while `post` writes to the orchestrator of the selector's context ([src-gateway][]). The status call may need a token for the same tenant. This is an inference and needs an integration test.
6. **One token per partition, context and time zone.** A partitioned pre-aggregation can return many tokens ([doc-rest-ref][], [src-refresh-scheduler][]).
7. **`scheduledRefreshTimer` is a heartbeat, not a freshness setting.** Setting it on every instance turns API instances into refresh workers ([doc-config][]). The `CUBEJS_REFRESH_WORKER` default is `false` in the docs, but when unset the code enables it whenever `NODE_ENV !== 'production'` ([doc-env][], [src-env][]).
8. **1.7.0 removals:** `renewQuery` (use `cache: 'must-revalidate'`) and `CUBEJS_SCHEDULED_REFRESH_CONCURRENCY` (use `..._QUERIES_PER_APP_ID`). The `continueWaitTimeout` default also changed from 5 to 10 s ([deprecation][], [changelog][]). A third-party project reported that 1.7 rejects `renewQuery` as an illegal query field ([thirdparty-synmetrix][], third-party).
9. **No queue stage over HTTP.** The HTTP `Continue wait` body has no `stage` ([src-gateway][]), so client-core's `ProgressResult.stage()` will be undefined over HTTP. This is an inference from the source; the WebSocket transport was not checked.
10. **The refresh worker does not populate the in-memory cache.** It only invalidates it ([doc-arch][]). Dashboards without pre-aggregations pay the DB cost on their first load after invalidation.
11. **The running-query cancel endpoint has no scope check** and matches on the request UUID ([src-gateway][], [src-qq][]). Use unguessable IDs (for example `crypto.randomUUID()`). client-core's transport cannot issue `DELETE` ([src-client-http][]).
12. **`/cubejs-system/*` routes are undocumented internal APIs.** They are mounted only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set and are authenticated with that separate HS256 secret ([src-gateway][], [src-server][]). They grant build, cancel and preview power, and they are not in the env-var docs ([doc-env][]). Expect shape changes between releases; pin the version and add contract tests if they are used. A third-party Core "cockpit" project uses them plus Cube Store SQL and a custom logger for query history ([blog-cockpit][], third-party).
13. **The health probes are coarse.** They report only `HEALTH` or `DOWN`, take no auth, are cached for 1 s, and do not report refresh-worker health ([src-gateway][], [src-cached][]).
14. **Production responses hide debug fields.** `refreshKeyValues`, `requestId` and `transformedQuery` are returned only in dev mode or for playground-signed tokens ([src-gateway][]).
15. **Log redaction.** `CUBEJS_LOG_REDACTION` defaults to `true` in production, so `logger` params arrive redacted. Events sent to `CUBEJS_AGENT_ENDPOINT_URL` (Cube Cloud's Query History channel) keep the original values ([doc-env][]). That agent channel is undocumented: deflate-compressed JSON over HTTP or WebSocket ([src-agent][]).
16. **Cube Store SQL port.** It has no authentication, and `SYS METASTORE TRUNCATE`, `SYS CACHESTORE WIPE` and `SYS KILL ALL JOBS` destroy data irreversibly ([doc-rip][], [doc-cs-sql][]).
17. **`CUBEJS_REFRESH_KEY_LOCAL_TIME`** must be identical on all instances with NTP-synchronized clocks, or pre-aggregations can be built twice ([doc-env][]).
18. **The Python orchestrator integrations are stale.** The last uploads were in 2023 ([pypi-airflow][], [pypi-dagster][], [pypi-prefect][]). They are thin wrappers over the same endpoint.
19. **`/v1/data-sources` may not exist in Core.** It is documented in the REST reference with a Cube Cloud example host ([doc-rest-ref][]), but no such route is registered in Core `gateway.ts` at the tag ([src-gateway][]). Treat it as not available in Core until verified.

## Alternatives considered

The caller did not ask for a comparison.

## Open questions / unverified

- **Decision for the user:** may wechart depend on the undocumented `/cubejs-system/v1/pre-aggregations/*` routes, or on the raw Cube Store MySQL interface, for the pre-aggregation catalog, partitions, preview, build queue and cancel? Both are the only Core sources for these features. The first is an unstable API; the second has no authentication and exposes destructive commands.
- UNVERIFIED: the HTTP status code of the `UserError` returned for a non-matching selector or an invalid job payload. I read the handler but not the `UserError` status mapping.
- UNVERIFIED: whether `action:'post'` without `selector` passes validation (the schema marks it `.optional()`) and then fails in the handler, which dereferences `selector.contexts` ([src-query][], [src-gateway][]). Needs a runtime test.
- UNVERIFIED: whether job status `get` works across per-tenant orchestrators (Gotcha 5). Needs an integration test.
- UNVERIFIED: the exact `extractRequestUUID` parsing, and so whether cancelling with `${baseRequestId}-span-1` matches every span of a request. I did not read the implementation.
- UNVERIFIED: whether a custom `logger` replaces Cube's default stdout logging. The example above logs to stdout as well.
- UNVERIFIED: whether the WebSocket (`subscribe`) transport sends `stage` progress for Continue wait. I did not inspect the subscription server.
- UNVERIFIED: the Cube Store queue and cache key prefixes, which `QUEUE LIST <prefix>` would need to show regular (non-pre-aggregation) queries. They are not documented in [doc-cs-sql][].
- UNVERIFIED: the Cube Cloud plan for Scheduled Tasks. The doc states none ([doc-sched-tasks][]).
- The caller supplied no AC or feature IDs, so none are cited here.

[doc-refresh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/refreshing-pre-aggregations.mdx
[doc-orch]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/index.mdx
[doc-airflow]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/airflow.mdx
[doc-dagster]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/dagster.mdx
[doc-prefect]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/orchestration-api/prefect.mdx
[doc-rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[doc-rest-ref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[doc-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[doc-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[doc-concurrency]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/concurrency.mdx
[doc-warmup]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/warm-up.mdx
[doc-sched-refresh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-refreshes.mdx
[doc-sched-tasks]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/explore-analyze/scheduled-tasks.mdx
[doc-qh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history.mdx
[doc-perf]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/performance.mdx
[doc-mon-preaggs]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx
[doc-alerts]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/alerts.mdx
[doc-mon-int]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/monitoring-integrations/index.mdx
[doc-qh-export]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history-export.mdx
[doc-arch]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/architecture.mdx
[doc-deploy]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/deployment.mdx
[doc-rip]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx
[doc-caching]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/index.mdx
[doc-cs-arch]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx
[doc-cs-sql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx
[doc-cube-ref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[doc-preagg-ref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[deprecation]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/DEPRECATION.md
[changelog]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/CHANGELOG.md
[src-gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-query]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js
[src-cached]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/cached-handler.ts
[src-refresh-scheduler]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[src-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[src-opts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts
[src-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/types.ts
[src-orch-api]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[src-agent]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/agentCollect.ts
[src-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[src-qo]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[src-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[src-qq]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[src-client-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[src-client-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/types.ts
[src-client-http]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/HttpTransport.ts
[src-client-progress]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/ProgressResult.ts
[npm-client-core]: https://registry.npmjs.org/@cubejs-client/core/latest
[docker-cube]: https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.42
[docker-cubestore]: https://hub.docker.com/v2/repositories/cubejs/cubestore/tags/v1.7.42
[pypi-airflow]: https://pypi.org/pypi/airflow-provider-cube/json
[pypi-dagster]: https://pypi.org/pypi/dagster-cube/json
[pypi-prefect]: https://pypi.org/pypi/prefect-cubejs/json
[pr-11629]: https://github.com/cube-js/cube/pull/11629
[issue-9016]: https://github.com/cube-js/cube/issues/9016
[blog-cockpit]: https://github.com/Guik/cubejs-cockpit
[thirdparty-synmetrix]: https://github.com/smartdataHQ/synmetrix/pull/86
