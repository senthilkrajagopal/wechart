---
library: Cube pre-aggregation job records (jobs API)
packages: []
version: 1.7.45
researched: 2026-09-24
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/request-parser.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/pull/11629
  - https://github.com/cube-js/cube/pull/11961
  - https://github.com/cube-js/cube/pull/11759
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
---

# Cube pre-aggregation job records (jobs API) 1.7.45

## Summary

This doc covers the records Cube Core keeps for builds started through `POST /cubejs-api/v1/pre-aggregations/jobs`. It says what `action: get` reports about them, how long they last, what the `table` string encodes, and how an `x-request-id` travels from the request into Cube's build log events. It serves the half of **AC-150** (docs/spec.md) that covers builds wechart starts, which is task **T156** (docs/tasks.md): wechart's API posts a build, stores the tokens, and follows each token with `action: get` until it finishes, even across its own restarts.

The pin is **v1.7.45**, the user's choice as relayed by the coordinator. Where v1.7.42, v1.7.43 or v1.7.44 behave differently, the doc says so. Tag v1.7.45 is commit `f2c28b8`, the same `gitHead` as npm `@cubejs-backend/api-gateway@1.7.45` ([tags API](https://api.github.com/repos/cube-js/cube/tags?per_page=15), [npm](https://registry.npmjs.org/@cubejs-backend/api-gateway/latest)).

Main findings:

1. **`get` returns four fields per token: `token`, `table`, `status` and `selector`.** An unknown or expired token returns only `token` and `status`. No timing, row count or log is included, and the only error text is inside `status` as `failure: <message>` ([gateway.ts L1195–L1285](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1195-L1285)).
2. **Each job is stored as `PRE_AGG_JOB_<token>` with a TTL of 86400 s.** Since v1.7.43 the record is rewritten, and its TTL restarted, only when a status read computes a *different* status. In practice it expires about 24 h after the first `get` that saw `done` or `failure`, and 24 h after the post if nobody reads it to the end. It is not simply "24 h from the post" ([RefreshScheduler.ts L833–L837](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L833-L837), [PreAggregations.ts L575–L595](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L575-L595)).
3. **`table` is `<schema>.<cube>_<preagg><partition start>_<content>_<structure>_<base-32 seconds>`.** The last segment is when Cube created the version entry while handling the **post** (`Date.now()` in the Cube process). It is **not** the build's start time (see "Table names").
4. **The `x-request-id` on the post becomes the job's request id** and every build log event's `requestId`. `get` never returns it, so wechart must store its own copy (see "Request ids").
5. **On v1.7.42 a failed import could report `done`. #11629 (released in 1.7.43) fixed that** by recording a per-table build outcome that outranks the table's existence ([PR #11629](https://github.com/cube-js/cube/pull/11629)).
6. **A post returns one token per context × time zone × partition entry.** The post response is a bare `string[]`, so only `get`'s `selector` maps a token back to its pre-aggregation.
7. **Any Cube API instance can follow a token, under any context that holds the `jobs` scope.** With the Cube Store driver the record key has no tenant or app prefix, so a restarted wechart API can resume following.
8. **Cube does not throttle `get`, and `tokens` has no maximum.** A `get` for an unfinished token lists the pre-aggregation schema's tables in Cube Store on every call.

**How the line numbers were obtained.** The code text was re-read at the tag with raw fetches. Line numbers come from a local clone at commit [`8368f2a`](https://github.com/cube-js/cube/commit/8368f2af49be2ee4926bc97c10d7174c7fa16297) (master, 2026-09-11), shifted by the hunk headers of each later commit that touched the file: e8c04fcc (#11872), 99cceac (#11854), 42bfe75 (#11629), f566e35 (#11939) and #11759. Where a shift could not be pinned, the link names the method at the tag or points at the clone's commit, and says so. Links to `8368f2a` are marked **(checkout)**.

## Install

- **Cube images:** `cubejs/cube:v1.7.45` (pushed 2026-09-25T05:31:55Z) and `cubejs/cubestore:v1.7.45-arm64v8` (pushed 2026-09-25T05:13:06Z; the plain `v1.7.45` tag is amd64 only) ([Docker Hub, cube](https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=8&name=v1.7.4), [Docker Hub, cubestore](https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=10&name=v1.7.45)). wechart's compose still names v1.7.42 (/Users/srajagopal/Work/wechart/docker-compose.yml L57, L65, L114). T263 moves it.
- **Changelog entries that touch this area** ([CHANGELOG v1.7.45](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md)):
  - 1.7.43 (2026-09-21): "don't report failed pre-agg build jobs as done (#11629)".
  - 1.7.44 (2026-09-24): "keep create table error messages concise (#11961)", "don't report a cancelled query as a query error (#11759)", "Bound cached pre-aggregation partition plans (#11896)".
  - 1.7.45 (2026-09-25): nothing in this area.
- **No npm package.** wechart calls the endpoint with `fetch` from /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts (`buildPreAggregations` L126–L139, `jobStatuses` L142–L148).

## Init / auth pattern

- **Scope.** The handler calls `assertApiScope('jobs', …)` first ([gateway.ts L1068](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1068)). wechart grants `jobs` to every token except a draft's (/Users/srajagopal/Work/wechart/infra/cube/cube.js L123–L126). A `get` therefore has to use wechart's configured context, not a draft context.
- **Token.** An HS256 JWT whose payload is the security context. wechart signs a fresh one per request (client.ts `#token`, L219–L240). In local dev the context is `{ wechartStore: "http://host.docker.internal:4100" }` (/Users/srajagopal/Work/wechart/playwright.config.ts L85; server.ts L188–L191).
- **Body schema.** Defined in Joi ([query.js L232–L260](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L232-L260)):
  - Each `selector.contexts` item may hold only `securityContext` (L237–L241).
  - `tokens` is `min(1)` with no maximum (L250–L254).
  - `resType` accepts only `'object'` (L255–L259).
- **Request id.** Cube reads `x-request-id`, falls back to `traceparent`, and otherwise generates `${uuid}-span-1` ([request-parser.ts L14–L16](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/request-parser.ts#L14-L16)). wechart's `#request` sends no `x-request-id` today (client.ts L186–L212).

A minimal post that carries wechart's own request id, as a sketch based on the sources above:

```ts
const requestId = `${crypto.randomUUID()}-span-1`; // shape Cube itself generates (request-parser.ts L15)
const res = await fetch(`${apiUrl}/v1/pre-aggregations/jobs`, {
  method: 'POST',
  headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ action: 'post', selector: { contexts: [{ securityContext }], timezones: ['UTC'], preAggregations: [id] } }),
});
// 200 → string[] of tokens; 400 → { error: "A user's selector doesn't match any of the pre-aggregations defined in the data model." }
```

## API surface we will use

### `action: post`

- **Contexts.** The handler runs once per `selector.contexts[i]`, with `ctx = { ...callerContext, ...config }` ([gateway.ts L1135–L1138](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1135-L1138)). The Joi schema allows only `securityContext` in `config`, so the caller's `requestId` is kept.
- **Empty result.** If nothing matches, the handler throws `UserError("A user's selector doesn't match any of the pre-aggregations defined in the data model.")` ([gateway.ts L1085–L1090](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1085-L1090)). The sibling doc observed HTTP 400 for this on 1.7.42 (refresh-jobs-caching.md §B).
- **How builds are enqueued** ([RefreshScheduler.ts L743–L840](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L743-L840)):
  - Partitions are filtered by `dateRange` (L749–L786), and pre-aggregations left with no partitions are dropped (L792).
  - Each partition gets `executeQuery({ …, cacheMode: 'stale-if-slow', forceBuildPreAggregations: true, orphanedTimeout: 3600, requestId: context.requestId, isJob: true })` (L800–L811).
- **Job record and token.** Each result entry becomes a record `{ request, context: { securityContext }, preagg, table, target, structure, content, updated, key, status: 'posted', timezone, dataSource }` ([RefreshScheduler.ts L68–L81, L98–L125](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L68-L125)). Its token is the md5 of that record's JSON (L130–L135), and it is stored under `PRE_AGG_JOB_<token>` (L832–L838).
- **The post does not wait for the build.** For a job, the loader calls `executeInQueue` without `await` and immediately returns the target table name ([PreAggregationLoader.ts L300–L320](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L300-L320)). The queue does not block on a job's result either ([QueryQueue.ts L343–L351](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L343-L351)).
- **Where the build runs.** "Builds run in the process that receives the request, even on an instance that never builds pre-aggregations while serving queries. Restarting that instance interrupts any build it is running; such a build is reported as `failure`, so re-trigger the job for those partitions." ([reference.mdx at v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx)) For wechart that process is the `cube` API container, not `cube-refresh-worker`.

### `action: get`

Source: [gateway.ts L1195–L1285](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1195-L1285).

- **Record lookup.** Records are read with `CACHE GET PRE_AGG_JOB_<token>` through the caller's orchestrator ([RefreshScheduler.ts L845–L867](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L845-L867)).
- **Missing record.** The answer is `{ token, status: 'not_found' }`, with no `table` and no `selector` (L1206–L1211).
- **Found record.** Cube compiles and checks under `ctx = { ...callerContext, ...job.context }` (L1213–L1215), i.e. under the **job's** stored security context. It then returns `{ token, table: job.target, status, selector }`, where `selector = { cubes: [preagg.split('.')[0]], preAggregations: [job.preagg], contexts: [job.context], timezones: [job.timezone], dataSources: [dataSource] }` (L1219–L1225).
- **`resType: 'object'`.** The response becomes a map keyed by token, and each item's `token` is set to `undefined`, which JSON drops (L1274–L1282).
- **All tokens resolve together.** The per-token work runs inside one `Promise.all` (L1204–L1272). A token whose context fails to compile therefore fails the whole request. This is an inference from the code.

### Status values (v1.7.45)

| Status | Where it comes from | Documented meaning | Does Cube keep returning it? |
| --- | --- | --- | --- |
| `scheduled` | A queue item matched on `requestId` and all four `newVersionEntry` fields, with `status[0] === 'toProcess'` ([gateway.ts L1290–L1324](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1290-L1324)) | "The job hasn't run yet" | No; not written to the record |
| `processing` | A matching queue item that is `active` (same lines), **or** (v1.7.43+) a `building` build record for the target table that isn't yet abandoned ([PreAggregations.ts L563–L566](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L563-L566)) | "The job is currently running" | No |
| `orphaned`, `stalled` | Raw `item.status[0]` passed through (gateway.ts L1317–L1319). `getQueries` builds each item's status array in the order orphaned, stalled, active, toProcess ([QueryQueue.ts L507–L512, L514–L526](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L507-L526)) | Not documented | No |
| `done` | No build record, and the target table exists ([PreAggregations.ts L567–L568](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L567-L568)). Once stored, it is served from the record ([gateway.ts L1226–L1237](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1226-L1237)) | "The build has completed and its data has landed in the pre-aggregation storage". Zero rows can still be `done` | Yes, sticky |
| `failure: <error>` | A `failure` build record (PreAggregations.ts L561–L562), or a queue-result error with no table (L569–L570) | "The build has failed; the error message is appended" | Yes, sticky (gateway.ts L1226–L1237) |
| `failure: the build has not completed` | A `building` record older than `executionTimeout × 2` (L563–L566; `isBuildAbandoned` [L408–L417](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L408-L417)). The execution timeout falls back to `CUBEJS_DB_QUERY_TIMEOUT`, default `10m` ([env docs](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx)), so about 20 min by default | "the instance running the build stopped before it finished" | Yes, sticky, even if the build lands later ([PR #11629 review](https://github.com/cube-js/cube/pull/11629)) |
| `missing_partition` | None of the above (PreAggregations.ts L571–L572) | "No table exists for this partition and no build outcome is recorded for it. Trigger the job again" | Recomputed on every `get` (gateway.ts L1238–L1269) |
| `not_found` | No record (gateway.ts L1206–L1211) | "The token is unknown, or the job record has expired. Job records are kept for 24 hours" | n/a |
| `pre_agg_not_found` | The job's pre-aggregation id is missing from the model compiled for the job's context ([gateway.ts L1329–L1355](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1329-L1355)) | "no longer defined in the data model" | Recomputed on every `get` |
| `posted` | The initial stored value ([RefreshScheduler.ts L116](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L116)) | n/a | **Never returned.** Any stored status that doesn't start with `done` or `failure` is recomputed (gateway.ts L1226–L1269) |

The documented meanings are quoted from [reference.mdx at v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx).

### Retention

- **Write at post time.** `CACHE SET TTL 86400 PRE_AGG_JOB_<token>` ([RefreshScheduler.ts L833–L837](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L833-L837)). The set is **not awaited** before the tokens are returned.
- **Rewrites, v1.7.43 through v1.7.45.** `isPartitionExist` rewrites the record with TTL 86400 only `if (preAggJob && preAggJob.status !== status)` ([PreAggregations.ts L575–L595](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L575-L595)). The code comment explains why: rewriting an unchanged status would "keep pushing the record's expiry forward".
  - A `get` answered from the queue listing (`scheduled`, `processing`, `orphaned`, `stalled`) writes nothing (gateway.ts L1238–L1252).
  - Once `done` or `failure…` is stored, Cube serves it from the record and never writes again (L1226–L1237).
  - So the record expires 86400 s after the last status change, usually the first `get` that saw the finished state.
- **Rewrites, v1.7.42.** The record was rewritten only `if (result)`, i.e. when `conn.getResult(key)` returned the build's queue result ([v1.7.42 PreAggregations.ts L505–L523](https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L505-L523)). Cube Store marks a queue result deleted the first time it is read by key, so that happens at most once ([cache_rocksstore.rs L657–L664, checkout](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/rust/cubestore/cubestore/src/cachestore/cache_rocksstore.rs#L657-L664); the function text was re-read unchanged at v1.7.45). The v1.7.45 comment says the same: "The queue result is readable only once."
- **How each write sets the TTL.** Every `CACHE SET TTL` replaces the whole item, including `expire = now + ttl` ([cache_item.rs L45–L59](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/rust/cubestore/cubestore/src/cachestore/cache_item.rs#L45-L59) and [cache_rocksstore.rs L1163–L1169](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/rust/cubestore/cubestore/src/cachestore/cache_rocksstore.rs#L1163-L1169), both checkout; `new()` re-read unchanged at v1.7.45).
- **Early loss.**
  - Cube Store's cache store evicts before inserting. Its policy (`CUBESTORE_CACHE_POLICY`) defaults to LRU across all keys, with at most 100,000 keys (`CUBESTORE_CACHE_MAX_KEYS`) and 4096 MiB ([config/mod.rs L1631–L1638, L1853–L1857, checkout](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/rust/cubestore/cubestore/src/config/mod.rs#L1853-L1857)). A record can therefore disappear before 24 h.
  - With the `memory` driver the store is one module-level object per Cube process ([LocalCacheDriver.ts L9–L16, checkout](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-query-orchestrator/src/orchestrator/LocalCacheDriver.ts#L9-L16)), so it is lost on restart. Production defaults to `cubestore` ([env docs](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx)), and wechart's compose runs Cube with `NODE_ENV: production` (docker-compose.yml L89–L90).
- **What an expired token returns.** `[{ "token": "<token>", "status": "not_found" }]` with HTTP 200 (gateway.ts L1206–L1211 and L1105). This is the same answer as for an unknown token, which the sibling doc observed on 1.7.42.
- **Build-status records (v1.7.43+).** They live under `getKey('SQL_PRE_AGGREGATIONS_BUILD_STATUS', table)` with TTL 86400 ([PreAggregations.ts L382–L401](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L382-L401), constant at L163). They are removed when rows land ([PreAggregationLoader.ts L547–L557, L626](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L547-L557)).

### Table names

The full rule is `table = <schema>.<name><suffix>_<content_version>_<structure_version>_<updated>`, built by `targetTableName` (text re-read at v1.7.45; [checkout L810–L816](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L810-L816)). Part by part:

- **`<schema>`:** `CUBEJS_PRE_AGGREGATIONS_SCHEMA`. It defaults to `prod_pre_aggregations` in production and `dev_pre_aggregations` in development ([env docs](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx)).
- **`<name>`:** `inflection.underscore("<cube>.<preAgg>")` with `.` replaced by `_`. The cube's `sql_alias` replaces the cube name, and the pre-aggregation's `sqlAlias` replaces its name ([BaseQuery.js L4222–L4240, L4386–L4389](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4222-L4240) and [schema-compiler PreAggregations.ts L450–L452](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L450-L452), both checkout; not re-read at the tag). For the seed this gives `monthly_orders_by_status_month`.
- **`<suffix>`:** `partitionTableName` concatenates it with **no separator**: `dateRange[0].substring(0, cut).replace(/[-T:]/g, '')`, where `cut` is 13 for `hour`, 16 for `minute` and 10 otherwise (`partitionTableName` in [PreAggregationPartitionRangeLoader.ts](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts), text re-read at v1.7.45; checkout L554–L574). `dateRange[0]` is the partition start from `TIME_SERIES` ([time.ts](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/time.ts), re-read at v1.7.45). The documented `partition_granularity` values are `hour`, `day`, `week`, `month`, `quarter` and `year` ([pre-aggregations reference](https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/data-modeling/pre-aggregations.mdx)):

  | Granularity | Partition start | Suffix | Example |
  | --- | --- | --- | --- |
  | `year` | `YYYY-01-01T00:00:00.000` | `YYYY0101` (8 digits) | `20260101` |
  | `quarter` | first day of the quarter | `YYYY{01,04,07,10}01` (8) | `20260701` |
  | `month` | `YYYY-MM-01T00:00:00.000` | `YYYYMM01` (8) | `20260301` |
  | `week` | the ISO week's Monday (`startOf('isoWeek')`) | `YYYYMMDD` (8) | `20260105` |
  | `day` | `YYYY-MM-DDT00:00:00.000` | `YYYYMMDD` (8) | `20260117` |
  | `hour` | `YYYY-MM-DDTHH:00:00.000` | `YYYYMMDDHH` (10) | `2026011705` |
  | `minute` (handled in code, not documented) | `YYYY-MM-DDTHH:mm:00.000` | `YYYYMMDDHHmm` (12) | `202601170530` |
  | none | n/a | no suffix | n/a |

  The partition start is in the local time of the job's time zone. That is an inference: the ranges are local timestamps from `extractDate(…, timezone)` and `TIME_SERIES`, and it has not been traced end to end (probe P6).
- **`<content_version>`, `<structure_version>`:** each is `version()`, 5 md5 bytes encoded in the alphabet `abcdefghijklmnopqrstuvwxyz012345`, giving 8 characters and never an underscore ([PreAggregations.ts L28–L60](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L28-L60)). Cube itself reads them back by splitting on `_` from the right ([RefreshScheduler.ts L87–L93](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L87-L93)).
- **`<updated>`:** `Math.floor(last_updated_at / 1000).toString(32)` ([PreAggregations.ts L20–L22](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L20-L22)). A segment shorter than 13 characters is read as base-32 (`tablesToVersionEntries`, L240–L268).
  - `last_updated_at` is `nowTimestamp(client)`, i.e. `client.nowTimestamp?.() ?? Date.now()` ([PreAggregationLoader.ts L48–L50, L266–L272](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L266-L272)), and `BaseDriver.nowTimestamp()` returns `Date.now()` ([BaseDriver.ts L634–L636, checkout](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-base-driver/src/BaseDriver.ts#L634-L636)).
  - The loader computes it while handling the **post**, and the queue later builds that same `newVersionEntry` (`getQueue` → `loader.refresh(newVersionEntry, …)`, [checkout L726–L748](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L726-L748)). So it is the post time to the second, on Cube's clock. It does **not** include the queue wait and is not the build's start.
  - Worked example from the docs: `…_1hop3hn` decodes to 1670155831 s, i.e. 2022-12-04T12:10:31Z ([reference.mdx example](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx)).
- **How wechart can read the partition.**
  1. Split `table` on `_` from the right: `updated`, `structure`, `content`.
  2. The remainder is `<schema>.<name><suffix>`. Take its last 8, 10 or 12 characters according to the pre-aggregation's `partitionGranularity`, which `/v1/meta?extended` provides (meta-extended-pre-aggregations.md).
  3. Take the pre-aggregation itself from `selector.preAggregations[0]`, not from the name, because `sql_alias` and `inflection.underscore` make the name lossy.

  Stripping trailing digits blindly would be wrong for pre-aggregations whose names end in digits. This is a derivation from the rule above.

### Request ids

- **How the id travels, at v1.7.45:**
  1. `requestContextMiddleware` runs in `userMiddlewares` ([gateway.ts L316–L322](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L316-L322)). It calls `contextByReq(req, …, getRequestIdFromRequest(req))` ([checkout L2884–L2886](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/src/gateway.ts#L2884-L2886); not pinned at the tag), which sets `context.requestId` ([gateway.ts L2481–L2494](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2481-L2494)).
  2. The job record stores it as `request: context.requestId` ([RefreshScheduler.ts L108](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L108)).
  3. The build gets it through `executeQuery({ requestId: context.requestId, … })` (L805), then the loader's log `'Force build pre-aggregation'` ([PreAggregationLoader.ts L293–L299](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L293-L299)), and then `executeInQueue(…, { requestId })` (L435–L456).
  4. The queue item and its events carry it. `'Added to queue'` has `requestId`, `preAggregationId` and `newVersionEntry` ([QueryQueue.ts L280–L296](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L280-L296)). `'Performing query'`, `'Performing query completed'` (with `duration` and `timeInQueue`) and `'Error while querying'` carry `requestId: query.requestId` ([checkout L862–L874, L981–L1013](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L981-L994); #11759 moved these lines in 1.7.44).
- **The claim holds, with these caveats:**
  - `get` never returns the request id, so wechart must store the id it sent. All tokens of one post share it; the events tell partitions apart by `newVersionEntry.table_name`.
  - If the post has no `x-request-id` but carries a `traceparent` (for example from OpenTelemetry instrumentation), the `traceparent` value becomes the id (request-parser.ts L15).
  - The refresh worker's builds use `scheduler-${ctx?.requestId || uuid}` ([RefreshScheduler.ts L258–L264](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L258-L264)), so the two sources can be told apart.
  - When the queue de-duplicates a job (see Gotchas), no build runs under wechart's id at all.
  - Cube's default production logger prints non-error events only at `CUBEJS_LOG_LEVEL=trace`. At `info` it prints only `REST API Request`, and the default is `warn` ([logger.ts L111–L166](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L111-L166)). Capturing these events through the `logger` option is `logger-build-events.md`'s subject.
  - Since 1.7.44, a cancelled build is no longer logged as `Error while querying`. It rides on `Orphaned execution result` as `cancellationError` ([PR #11759](https://github.com/cube-js/cube/pull/11759)).

### Following tokens from the API

These are facts for T156's follow loop. Choices that need a decision are listed under Open questions.

- **Resuming after a wechart restart works.** The record's key is the raw string `PRE_AGG_JOB_<token>`, passed straight to `CACHE SET`/`CACHE GET` ([CubeStoreCacheDriver.ts L66–L91](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/CubeStoreCacheDriver.ts#L66-L91)). `QueryCache.getCacheDriver()` returns the bare driver, and only `getKey` adds a prefix, which this key doesn't use ([QueryCache.ts L262–L268](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts#L262-L268)). So any Cube instance that shares the Cube Store sees it, under any orchestrator or app id.
- **What the `get`'s own security context needs.** Only the `jobs` scope. Status checks run under the job's stored context (gateway.ts L1213). For wechart that is its configured context, and never a draft token, which gets 403.
- **Every `get` compiles the model under the job's context.** Before any status check it calls `getCompilerApi` (gateway.ts L1213–L1218). wechart's `cube.js` asks wechart's model store for its `version` on every request (/Users/srajagopal/Work/wechart/infra/cube/cube.js L58–L67). So each `get` calls back into wechart's API, for finished tokens too.
- **What persisting the tokens protects against.** Cube has no endpoint that lists jobs (refresh-jobs-caching.md). Tokens that are lost between the post's response and wechart's write cannot be recovered from the jobs API. The build still runs under wechart's `x-request-id`, which is how the logger events could still find it (inference).
- **Statuses that can flip in the first moments after a post** (inference from source; probe P1b):
  - The record write (RefreshScheduler.ts L833–L837) and the enqueue (PreAggregationLoader.ts L303–L312) are both unawaited. A `get` issued immediately can race them and see `not_found`, or see `missing_partition` before the item is queued. On v1.7.43+ that `missing_partition` is written to the record, but the next `get` recomputes it from the queue (gateway.ts L1238–L1252).
  - wechart's `isFinished` (/Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts L19–L27) treats both as final.
- **Duration.** Cube's `get` has no timing fields. What is available:
  - the post time on Cube's clock, to the second, from `table`'s last segment;
  - wechart's own clock at each poll;
  - `duration` and `timeInQueue` on `'Performing query completed'`, matched by request id and `newVersionEntry.table_name` (sources above).
- **Error text.**
  - The error is whatever the loader caught, `(e.message || e).toString()` ([PreAggregationLoader.ts L505–L514](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L505-L514)), or the queue result's `error`.
  - Before 1.7.44 a Cube Store create-table failure "was several screens long", including full `CREATE TABLE` statements and presigned S3 URLs. From 1.7.44 it reads `Error during create table <schema.table>: <error>` ([PR #11961](https://github.com/cube-js/cube/pull/11961)).
  - Treat it as untrusted text wherever it is displayed.
- **Polling cost and cadence.**
  - The gateway has no rate limit or throttle: no match for `rateLimit` or `throttle` in `packages/cubejs-api-gateway/src` (checkout). `tokens` has no maximum (query.js L252).
  - For each token that isn't finished, a `get` lists the queue's four queues, reading each item's definition ([QueryQueue.ts L484–L530](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L484-L530)).
  - If the job isn't queued, `isPartitionExist` then runs an uncached table listing of the schema and writes it back to the cache ([PreAggregationLoadCache.ts L82–L106](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts#L82-L106)). It also reads the queue result, the build record and the job record.
  - A finished token costs one cache read plus the compile.
  - The only cadence Cube publishes is Airflow's `CubeBuildOperator` `wait`, "Interval between API calls in seconds", default 10 ([airflow.mdx](https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/orchestration-api/airflow.mdx)). v1.7.45's own code comment assumes "clients poll in a loop" (PreAggregations.ts L581–L582). wechart's browser polls every 1.5 s today (tasks.md T155).
- **Security.** The record stores the security context in plain JSON (RefreshScheduler.ts L109). Anyone who can reach Cube Store's port 3306 can read it through `system.cache`, and Cube Store has no authentication (refresh-jobs-caching.md gotcha 16). `get` also echoes the context back in `selector.contexts`.

## Gotchas

### v1.7.42 vs v1.7.43 vs v1.7.44/1.7.45

| Area | v1.7.42 | v1.7.43 (#11629) | v1.7.44 / v1.7.45 |
| --- | --- | --- | --- |
| How the status is derived | `tables.length === 1 → 'done'`, else `failure: <result.error>` or `missing_partition` ([v1.7.42 L495–L503](https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L495-L503)) | The build record wins: `failure` → `failure: <error>`; `building` → `processing`, or `failure: the build has not completed` past 2× the execution timeout; then table → `done`; then result error → `failure:`; else `missing_partition` ([L556–L573](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L556-L573)) | Same as v1.7.43 (PreAggregations.ts and PreAggregationLoader.ts have no commits after #11629 through v1.7.45, per GitHub's history pages) |
| Record rewrite (TTL restart) | `if (result)`: when the queue result is first read | `if (preAggJob && preAggJob.status !== status)` (L583) | Same |
| Build outcome record | none | Set to `building` when a build starts, `failure` when it throws before rows land, and removed when rows land (PreAggregationLoader.ts L493–L496, L505–L514, L547–L574, L626) | Same |
| Failed external upload | The partial table stays and can shadow good data | Dropped by `dropPartiallyBuiltTable` ([PR #11629 diff](https://github.com/cube-js/cube/pull/11629)) | Same |
| Docs status table | 4 statuses; `missing_partition` described as "The job has failed" | 7 statuses; "Job records are kept for 24 hours" | Same ([v1.7.45 reference](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx)) |
| `failure:` text for Cube Store create-table errors | Could be several screens long | Same | Concise (#11961, 1.7.44) |
| Cancelled build in logs | `Error while querying` | Same | `Orphaned execution result` + `cancellationError` (#11759, 1.7.44) |

**Verifying claim 5 (a failed import could report `done` on v1.7.42).** The PR's own words: "A pre-aggregation build triggered through the jobs API whose client-side import failed was indistinguishable from a successful one. The empty versioned table stayed in Cube Store as the newest version of the partition, shadowing the previous correct one, while the job reported `done`" ([PR #11629](https://github.com/cube-js/cube/pull/11629)). The PR merged on 2026-09-18 and shipped in 1.7.43 ([CHANGELOG](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md)). The v1.7.42 source has no `getPreAggregationBuildStatus` (raw file checked).

**Findings the PR's review left open at merge** (from the PR page; only the first was confirmed in source here):

- **De-duplicated jobs get no benefit** because their target names diverge. Confirmed below.
- **An abandoned-build `failure` stays cached** even if the build lands later. Consistent with gateway.ts L1226–L1237.
- **A process killed mid-import still leaves an empty newest table** that queries can hit.
- **`dropPartiallyBuiltTable` is unconditional** and can drop a concurrent build's table.

### Queue de-duplication makes a job report `missing_partition`

A force build, which every job is, is not enqueued when an item with the same query key is already queued: `if (query.forceBuild) { const jobExists = await queueConnection.getQueryDef(queryKeyHash, null); if (jobExists) return null; }` ([QueryQueue.ts L259–L262](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L259-L262); the query key is `[loadSql, (indexesSql,) invalidationKeys]`, PreAggregationLoader.ts L458–L462).

The job's own target, whose timestamp comes from its own post, is then never built. The queue-status check doesn't match it, because it compares `requestId` and `last_updated_at` (gateway.ts L1299–L1308). So the job reports `missing_partition`, even while or after another build (another post, or the refresh worker) builds that partition. The PR review said the same: "deduped jobs compute fresh `newVersionEntry` timestamps … so target table names diverge" ([PR #11629](https://github.com/cube-js/cube/pull/11629)).

Two posts in the same second get the same target name, because `<updated>` has one-second resolution. Whether the refresh worker and the API share one pre-aggregation queue is UNVERIFIED. Probe P6b tests the de-duplication.

### Other gotchas

1. **One token per entry, not strictly per partition.** `executeQuery` returns one entry per pre-aggregation in `dependencies.concat([partition])` ([QueryOrchestrator.ts `fetchQuery` isJob branch, checkout L255–L260](https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts#L255-L260)). Every entry becomes a token, flattened over pre-aggregations, dependency groups, partitions and entries (RefreshScheduler.ts L98–L125), and the whole set repeats per selector context (gateway.ts L1133–L1149) and per time zone. For wechart's rollups, which have no dependencies, that is one token per context × time zone × partition. The order of tokens is not documented.
2. **A pre-aggregation removed from the model reports `pre_agg_not_found`**, judged under the job's stored context (gateway.ts L1329–L1355). A publish that renames or removes a rollup mid-build does this.
3. **A failure that is final in Cube isn't always final in practice.** On v1.7.45, `failure: the build has not completed` stays cached for 24 h even if a slow build later lands ([PR #11629 review](https://github.com/cube-js/cube/pull/11629)).
4. **A zero-row partition is `done`** ([v1.7.45 docs note](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx)).
5. **Building under other time zones creates tables the refresh worker doesn't touch.** Cube drops untouched pre-aggregations after `CUBEJS_TOUCH_PRE_AGG_TIMEOUT` (86400 s) when `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH=true`, the default ([env docs](https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx)).

### Corrections to sibling docs and the brief

- **refresh-jobs-caching.md §B, status values.**
  - At 1.7.43+, `done` no longer means just "target table exists". A recorded build outcome outranks the table.
  - `missing_partition`'s documented meaning changed. The docs no longer say "The job has failed"; they say "No table exists … no build outcome is recorded … Trigger the job again".
  - Add `failure: the build has not completed`, and `processing` coming from the build record.
  - The "raw queue status" pass-through is `orphaned` or `stalled`.
- **refresh-jobs-caching.md §B and gotcha 5, "TTL of 86400 s".** The TTL restarts on each status change (1.7.43+), or on the first read of the queue result (1.7.42).
- **refresh-jobs-caching.md gotcha 5, tenants.** The guess that a status call "may need a token for the same tenant" is wrong for the Cube Store driver: the key has no prefix (CubeStoreCacheDriver.ts L66–L91), and status checks use the job's stored context. With the memory driver the store is shared by every orchestrator in one process and lost on restart.
- **refresh-jobs-caching.md gotcha 3** (failed build reports `done`). Fixed in 1.7.43; the residual issues are listed above.
- **refresh-jobs-caching.md gotcha 4.** From 1.7.43 the docs list 7 statuses.
- **refresh-jobs-caching.md gotcha 6.** Tokens are per context × time zone × partition, plus any dependency entries.
- **refresh-jobs-caching.md §B, "`post` behavior".** Add that a force build is skipped when the same query key is already queued (QueryQueue.ts L259–L262).
- **meta-extended-pre-aggregations.md, "two builds of one rollup at once".** The likelier cause of the `missing_partition` it observed is queue de-duplication, not "a table another build is replacing". This is an inference, and probe P6b tests it.
- **scheduler.md, AC-150 section.** The status list lacks `pre_agg_not_found` and `failure: the build has not completed`. "Cube's own window is 24 hours" should read: 24 h after the record's last status change.
- **Code comment in /Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts L13–L18.** "`not_found` — its record kept for 24 h": the 24 h runs from the last status change. Also, `not_found` and `missing_partition` can be transient right after a post (inference).
- **The brief.**
  - Local Cube REST is at `http://localhost:54000/cubejs-api` (docker-compose.yml L102–L103; playwright.config.ts L76), not port 4000.
  - Claim 3's last segment is the post time, not the build's start time.
  - The table-name rule spans three files (PreAggregations.ts, PreAggregationPartitionRangeLoader.ts, BaseQuery.js), not only PreAggregations.ts.
  - The pin is now v1.7.45.

## Alternatives considered

The caller did not ask for a comparison.

## Open questions / unverified

### Decisions for the user or the implementer (not requirements)

- **When to treat `not_found` or `missing_partition` as final**, given the race right after a post.
- **Which duration AC-150 records:** wechart's observed post-to-`done` window, or Cube's `duration`/`timeInQueue` from the logger events.
- **Whether to cap or trim stored `failure:` text** on Cube versions before 1.7.44.
- **Poll interval.** Cube sets no limit. The only published default is Airflow's 10 s.

### Probes to run locally

Setup: Cube runs on `:54000` (compose), and the JWT is HS256 with `dev-secret`, as client.ts builds it. The context `{"wechartStore":"http://host.docker.internal:4100"}` needs the wechart API running on :4100; `{}` reads Cube's mounted model instead.

```sh
export CUBE=http://localhost:54000/cubejs-api/v1
export CTX='{"wechartStore":"http://host.docker.internal:4100"}'   # or '{}'
jwt() { CTX="$CTX" node -e '
  const { createHmac } = require("node:crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const u = b({ alg: "HS256", typ: "JWT" }) + "." + b({ ...JSON.parse(process.env.CTX), iat: now, exp: now + 3600 });
  process.stdout.write(u + "." + createHmac("sha256", "dev-secret").update(u).digest("base64url"));'; }
export TOKEN=$(jwt)
jobs() { curl -sS -X POST "$CUBE/pre-aggregations/jobs" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }
POST='{"action":"post","selector":{"contexts":[{"securityContext":'"$CTX"'}],"timezones":["UTC"],"preAggregations":["monthly_orders.by_status_month"]}}'
```

**P1: claims 1 and 6, the `get` shape and one token per partition.** Expect one token, since the seed's orders span 2026 only (infra/sample-db/init.sql L46–L47). Every item's keys should be exactly `["selector","status","table","token"]`, going through `scheduled`/`processing` to `done`.

```sh
export RID="$(node -e 'process.stdout.write(crypto.randomUUID())')-span-1"; date -u +%s
TOKENS=$(jobs -H "x-request-id: $RID" -d "$POST"); echo "$TOKENS"
for i in $(seq 1 15); do jobs -d "{\"action\":\"get\",\"tokens\":$TOKENS}" | jq -c '.[] | {k: keys, status, table}'; sleep 1; done
jobs -d "{\"action\":\"get\",\"tokens\":$TOKENS,\"resType\":\"object\"}" | jq .          # map keyed by token, no inner token
jobs -d '{"action":"get","tokens":["00000000000000000000000000000000"]}' -w '\n%{http_code}\n'   # [{token,status:"not_found"}] 200
```

**P1b: the race right after a post.** Record whether the first answer is `not_found` or `missing_partition`.

```sh
T=$(jobs -d "$POST"); jobs -d "{\"action\":\"get\",\"tokens\":$T}" | jq -c '.[].status'
```

**P6: claim 6, per-time-zone tokens and `dateRange` filtering.** Expect 2 tokens, one per time zone, and HTTP 400 for a range with no partitions. The Los Angeles table is left untouched by the worker and gets dropped within about 24 h (gotcha 5).

```sh
TZ2=$(jobs -d '{"action":"post","selector":{"contexts":[{"securityContext":'"$CTX"'}],"timezones":["UTC","America/Los_Angeles"],"preAggregations":["monthly_orders.by_status_month"]}}')
echo "$TZ2" | jq length
sleep 5; jobs -d "{\"action\":\"get\",\"tokens\":$TZ2}" | jq -c '.[] | {tz: .selector.timezones[0], pa: .selector.preAggregations[0], table}'
jobs -d '{"action":"post","selector":{"contexts":[{"securityContext":'"$CTX"'}],"timezones":["UTC"],"preAggregations":["monthly_orders.by_status_month"],"dateRange":["2020-01-01","2020-12-31"]}}' -w '\n%{http_code}\n'
```

**P6b: queue de-duplication.** If B was posted while A was still queued or active, expect A `done` and B `missing_partition`, with a different last segment. A build takes about 1.5 s here, so try a few times.

```sh
A=$(jobs -d "$POST"); sleep 1.1; B=$(jobs -d "$POST"); sleep 10
jobs -d "{\"action\":\"get\",\"tokens\":$(jq -cn --argjson a "$A" --argjson b "$B" '$a+$b')}" | jq -c '.[] | {status, table}'
```

**P3: claim 3, the table name.** Expect `rest` to end in `monthly_orders_by_status_month20260101`, `partition` to be `20260101`, and `updated` to fall within a second or two of the `date -u +%s` printed in P1, not at the build's end.

```sh
TABLE=$(jobs -d "{\"action\":\"get\",\"tokens\":$TOKENS}" | jq -r '.[0].table')
node -e 'const s=process.argv[1].split("_"); const u=s.pop(), st=s.pop(), c=s.pop(), rest=s.join("_");
  console.log({ rest, partition: rest.slice(-8), content: c, structure: st, updated: new Date(parseInt(u,32)*1000).toISOString() })' "$TABLE"
```

**P2: claim 2, the TTL, through Cube Store's `system.cache`.** Cube Store's port 3306 isn't published in compose, so this runs a throwaway MySQL client on the compose network. The connection flags come from the [Cube Store SQL docs](https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/cubestore/sql-commands.mdx); the `id`/`prefix`/`expire`/`value` columns come from [system_cache.rs](https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/queryplanner/info_schema/system_cache.rs). Expected:
1. After the post, before any `get`: `expire` is about post + 24 h, and `value` has `"status":"posted"`.
2. After the first `get` that returns `done`: `expire` is about that moment + 24 h, and the status is `done`.
3. After more `get`s: `expire` is unchanged. On 1.7.42, step 2 happens instead when the result is first read.
4. The last line (local only) removes the record to simulate expiry. The next `get` should return `not_found`.

```sh
NET=$(docker inspect wechart-cubestore -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
cs() { docker run --rm --network "$NET" mysql:8.4 mysql -h cubestore -P 3306 --protocol=TCP -u cubestore -pcubestore -e "$1"; }
K="PRE_AGG_JOB_$(echo "$TOKENS" | jq -r '.[0]')"
cs "SELECT id, expire, value FROM system.cache WHERE id = '$K'"
cs "CACHE REMOVE '$K'"
```

**P4: claim 4, request ids in build log events.** This needs trace logging on the API container. The override file goes outside the repo. Expect `Added to queue`, `Performing query` and `Performing query completed` from `wechart-cube` (the API instance, not the worker), each with `requestId == $RID`, `preAggregationId: "monthly_orders.by_status_month"` and `newVersionEntry.table_name` ending in `…20260101`. Worker builds should show `scheduler-…` ids once the worker also runs at trace level.

```sh
printf 'services:\n  cube:\n    environment:\n      CUBEJS_LOG_LEVEL: trace\n' > "$TMPDIR/cube-trace.yml"
docker compose -f docker-compose.yml -f "$TMPDIR/cube-trace.yml" up -d cube
# re-run P1 with a fresh RID, then:
docker logs wechart-cube 2>&1 | grep "\"requestId\":\"$RID\"" | jq -c '{message, requestId, preAggregationId, t: .newVersionEntry.table_name, duration, timeInQueue}'
docker compose up -d cube   # restore the default log level
```

### UNVERIFIED items

- **Partition suffix time zone.** That the suffix is the partition start in the job's time zone is an inference from `extractDate`/`TIME_SERIES`, not traced end to end. P6 checks it.
- **Races and de-duplication.** The `not_found`/`missing_partition` race after a post, and de-duplication as the cause of `missing_partition`, are inferences from source (the latter backed by the PR review). P1b and P6b check them. Whether the refresh worker and the API share one pre-aggregation queue (same prefix) was not traced.
- **Queue lifecycle.** What follows an `orphaned` or `stalled` job item was not traced. Jobs set `orphanedTimeout: 3600` (RefreshScheduler.ts L804).
- **Cross-process pickup.** Whether another process can pick up a job's queued build was not traced. The docs say builds run in the process that receives the request.
- **Batch failure.** That one bad token fails a whole `get` batch is an inference from `Promise.all` (gateway.ts L1204–L1272).
- **`Continue wait` on a post.** A post whose refresh-key queries exceed `continueWaitTimeout` would, as I read the code, get HTTP 200 `{ "error": "Continue wait" }` instead of tokens. I did not trace `keyQueryResult`.
- **Queue-result matching.** Whether `job.key` (built from `getInvalidationKeyValues`) always matches the queue key (built from `getPartitionInvalidationKeyValues`) for rollups with partition-level invalidation keys was not traced. It affects only the `failure: <queue error>` path.
- **Line numbers only from the 2026-09-11 checkout.** These were not re-pinned at the tag: `BaseQuery.js` (the file is too large to fetch at the tag), `LocalCacheDriver.ts`, `BaseDriver.ts`, `QueryOrchestrator.ts`, the Cube Store Rust config and eviction code, `requestContextMiddleware`, and the queue log events. `PreAggregations.ts` lines after L599 (`getQueue`, `targetTableName`) are linked by name because #11629's later hunks were not seen.
- **Probe mechanics.** Whether `mysql:8.4` works against Cube Store and whether `WHERE` filters on `system.cache` are untested. The docs only say "Only Linux and Mac OS versions of MySQL client are supported". The exact `CACHE REMOVE` quoting is also untested.
- **Log redaction.** Whether `CUBEJS_LOG_REDACTION` (default `true` in production) alters `requestId` or `newVersionEntry` in events is unverified.
- **Out of scope here.** How to make an import fail on purpose, for T263's failing test, belongs to `upgrade-1.7.43.md`.

Relevant local files: /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts, /Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts, /Users/srajagopal/Work/wechart/infra/cube/cube.js, /Users/srajagopal/Work/wechart/docker-compose.yml, /Users/srajagopal/Work/wechart/playwright.config.ts, /Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md, /Users/srajagopal/Work/wechart/docs/research/cube/meta-extended-pre-aggregations.md, /Users/srajagopal/Work/wechart/docs/research/scheduler.md. Local Cube source used for line mapping: /Users/srajagopal/Work/bi/cube (checkout 8368f2a).
