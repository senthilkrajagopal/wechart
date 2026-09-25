---
library: Cube logger option (refresh-worker build events)
packages: []
version: 1.7.45
researched: 2026-09-24
sources:
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/config.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/agentCollect.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/index.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/log-redaction.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/logger.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/promises.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/request-parser.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
  - https://github.com/cube-js/cube/commit/42bfe75a5628b9a9f882362a63771239a0c6d1a9
  - https://github.com/cube-js/cube/commit/9070984043e57d79b82e70c0a5dbe7a20b8e0e66
  - https://github.com/cube-js/cube/commit/99cceac77f00c8c0a13c0f2c0f4b237b4d97460f
  - https://github.com/cube-js/cube/pull/11961
  - https://registry.npmjs.org/@cubejs-backend/server-core/1.7.45
  - https://nodejs.org/docs/latest-v24.x/api/process.html
  - https://docs.docker.com/reference/compose-file/merge/
---

# Cube logger option (refresh-worker build events) 1.7.45

## Summary

This doc covers the refresh worker's half of **AC-150** ([docs/spec.md L536-L537](/Users/srajagopal/Work/wechart/docs/spec.md)), which is task **T261** ([docs/tasks.md L2632-L2638](/Users/srajagopal/Work/wechart/docs/tasks.md)). Cube Core has no API that lists the builds its refresh worker runs. wechart would add a `logger` function to [infra/cube/cube.js](/Users/srajagopal/Work/wechart/infra/cube/cube.js), which both Cube containers mount ([docker-compose.yml L104-L106, L127](/Users/srajagopal/Work/wechart/docker-compose.yml)). The logger would forward build events to wechart's API.

The version is **v1.7.45**, which the caller relayed as the user's choice. Differences at v1.7.42 (running now), v1.7.43 and v1.7.44 are called out inline and in Gotchas 1.

Main findings:

- **The contract is thin.** Only `logger(message, params)` is documented ([doc-config]). Which messages Cube sends, and their params, is internal wording, readable only in source. This matches the spec's own caveat ([spec L518-L519](/Users/srajagopal/Work/wechart/docs/spec.md)).
- **How a build ends in the logs.** Each partition build ends with exactly one queue event, logged by the process that executed it:
  - `Performing query completed` means success.
  - `Error while querying` means failure.
  - From 1.7.44 on, `Orphaned execution result` carrying `cancellationError` means it was cancelled.
- **How to tell a build from an ordinary query.** A build carries `newVersionEntry`, and its `queuePrefix` is `SQL_PRE_AGGREGATIONS_<orchestratorId>_<dataSource>`. `preAggregationId` alone doesn't identify a build.
- **Who started it.** The request id tells you:
  - `scheduler-…` is the refresh worker.
  - A jobs build uses the jobs POST's `x-request-id`, else its `traceparent`, else `<uuid>-span-1`. wechart sends none of these today.
- **The logger must never throw.** A throwing logger turns successful builds into failures, can stop builds entirely, and a second throw can end the Cube process.
- **Routing to the right wechart.** Build events carry no security context. The worker's `Refresh Scheduler Run` event does.

**Verdict on the earlier analysis (not a source):**

| # | Earlier claim | Verdict |
|---|---|---|
| 1 | `logger` is documented; a custom logger replaces Cube's output and bypasses `CUBEJS_LOG_LEVEL` | **Correct.** Additions: when `CUBEJS_LOG_REDACTION` is on, the custom logger is wrapped by `withLogRedaction`. Cube's own output can be reproduced by calling `createLogger`. At the default level, production output doesn't include build events at all (§The logger option). |
| 2 | Event names and params | **Names right, meanings partly wrong.** `Refreshing pre-aggregation content` is not the worker's path. `Pre-aggregations build job error` does not mean a job's build failed. `preAggregationId` doesn't mark a build (use `newVersionEntry`). From 1.7.44, `Error while querying` is deferred and cancellations are logged differently (§Build events). |
| 3 | `scheduler-` vs `x-request-id` | **Correct**, plus the `traceparent` and `<uuid>-span-1` fallbacks and a dedupe caveat (§Telling who started it). |
| 4 | A logger that throws can fail a successful build | **Correct and understated.** There are more throw sites, and a crash path (§Never throwing). |
| 5 | The logger gets redacted params | **Correct** when `CUBEJS_LOG_REDACTION` is on (the production default). What it masks is in §The logger option. |
| 6 | Volume; does `* * * * *` rebuild every minute | **One terminal event per build.** A cron key rebuilds "at least once" per interval, noticed at the worker's 30 s heartbeat (§Volume). |
| 7 | Do events say the security context or app id | **Build events don't.** `Refresh Scheduler Run` does. Options are in §Routing. |
| 8 | A documented alternative hook | **None with a contract** (§Alternatives considered). |

## Install

- **Nothing to install.** The logger is a function in `cube.js` and runs inside Cube's own Node process, in both the API and refresh-worker containers ([docker-compose.yml L64-L127](/Users/srajagopal/Work/wechart/docker-compose.yml)).
- **Image.** `cubejs/cube:v1.7.45` runs `node:24.21.0-trixie-slim` with `NODE_ENV=production`. It sets `NODE_PATH=/cube/conf/node_modules:/cube/node_modules`, so `cube.js` can `require('@cubejs-backend/server-core')` ([dockerfile]; the same at v1.7.43).
- **Reaching `createLogger`.** `@cubejs-backend/server-core@1.7.45` is Apache-2.0, has `main: index.js` and no `exports` map ([npm-sc]). Its index re-exports `./core/logger`, which holds `createLogger` ([sc-index L5](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/index.ts#L5)). That makes Cube's default logger reachable from `cube.js`, but the export is not in the docs, so it is undocumented.
- **Global `fetch`.** Node 24 provides it, and `cube.js` already uses it ([cube.js L38-L45](/Users/srajagopal/Work/wechart/infra/cube/cube.js)).

## Init / auth pattern

### The logger option

**What the docs say.** `logger` is "A function to define a custom logger", taking `message` and `params`, with a JS example `logger: (message, params) => { console.log(...) }` ([doc-config], identical at v1.7.43). On redaction the docs say: "Filter values, SQL parameters, and string literals in SQL API statements in `params` arrive as `redacted` when `CUBEJS_LOG_REDACTION` is on (the default outside development mode); error messages from a data source arrive as returned" ([doc-config]).

**A custom logger replaces Cube's output.** At v1.7.45, [server.ts L195-L201](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L195-L201) builds the logger as follows (commit [99cceac]):

```ts
const logger = opts.logger || createLogger(process.env.NODE_ENV === 'production', getEnv('logLevel'));
// Wraps the log sink only: the agent and telemetry wrappers installed below sit outside it and forward the original params
this.logger = getEnv('logRedaction') ? withLogRedaction(logger) : logger;
```

- `CUBEJS_LOG_LEVEL` is read only here, as `createLogger`'s argument. A custom logger therefore receives every event at every level, and prints nothing unless it prints.
- The agent wrapper ([L416-L438](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L416-L438)) and the production telemetry wrapper ([L322-L344](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L322-L344)) wrap it from outside. Neither catches exceptions.
- Every orchestrator layer passes this same `this.logger` down to the queues without try/catch:
  - `createOrchestratorApi` passes `this.logger` in [server.ts].
  - QueryOrchestrator, QueryCache and PreAggregations hand it to each `QueryQueue` (`logger: this.logger`, [PreAggregations.ts L824](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L824)).
- At v1.7.42 the logger was the bare `opts.logger || createLogger(...)`, with no redaction ([99cceac] adds it; the server-core blobs are identical at v1.7.43 and v1.7.45 per the GitHub contents API).

**Cube's default output, to reproduce it** ([core-logger], unchanged since 2026-03-20):

- `createLogger(production, filterByLevel = 'info')` ([L168-L187](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L168-L187)) throws `Invalid log level` for unknown levels. It returns `prodLogger` when `NODE_ENV === 'production'` and `devLogger` otherwise.
  - `CUBEJS_LOG_LEVEL` has no default in env.ts (`get('CUBEJS_LOG_LEVEL').asString()`, [env]), so an unset level becomes `'info'` in source.
  - The docs table says `warn` ([doc-env]). This was already a known discrepancy ([configuration-deployment.md gotcha 11](/Users/srajagopal/Work/wechart/docs/research/cube/configuration-deployment.md)).
- **`prodLogger`** ([L111-L166](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L111-L166)):
  - Sets `params.level` to `error`, `warn` or `info` from `params.error` and `params.warning`. It **mutates `params`** to do so.
  - Prints `console.log(JSON.stringify({ timestamp, level, message, ...rest }))`. `timestamp` appears only if the params already carry one. In Cube only the agent wrapper sets it ([server.ts L416-L438](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L416-L438)), so wechart's compose lines have no timestamp.
  - Filtering is by level:

    | Level | What it prints |
    |---|---|
    | `trace` | everything |
    | `info` | only `REST API Request`, plus warnings and errors |
    | `warn` | warnings and errors |
    | `error` | errors |

  - So at the default level, **`Performing query completed` is not printed in production**. It is printed at `trace`.
- **`devLogger`** ([L53-L109](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L53-L109)) prints coloured text via `sqlstring` formatting. At `info` it prints a fixed list that includes `Performing query` and `Performing query completed` ([L81-L92](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L81-L92)). wechart's compose runs production, so this doesn't apply there.
- **The simplest exact reproduction** is to call Cube's own function from `cube.js` with the same arguments server.ts uses: `createLogger(process.env.NODE_ENV === 'production', process.env.CUBEJS_LOG_LEVEL)`. `getEnv('logLevel')` is the raw string or `undefined` ([env]). With redaction on, both Cube's default and the custom logger receive the same redacted copy, so the printed lines match.
  - The alternative is an inline copy of `prodLogger`, which is Apache-2.0 and ~55 lines.

**Redaction (claim 5)**, from [redact], added in [99cceac] and unchanged through v1.7.45:

- **It is on by default in production.** `logRedaction` defaults to `false` only when `NODE_ENV !== 'production'` or `CUBEJS_DEV_MODE` is true ([env], [doc-env]). wechart's compose sets `NODE_ENV: production` and `CUBEJS_DEV_MODE: 'false'`, so it is **on**.
- **The wrapper.** `withLogRedaction(logger)` calls `logger(msg, redactLogParams(params))`, which passes a new object and has no try/catch.
- **What it masks:**
  - values under the keys `values`, `params` and `query_values`, and `csvRows` next to `columns`;
  - the params of any `[sql, params, …]` tuple, element by element (the SQL text is kept);
  - `query` and `error`, which are swapped for `redactedQuery` and `redactedError` when those twins are present.
- **What it keeps.** Primitives and non-plain objects (such as `Error`) pass through unchanged. Kept intact, as they matter here: `newVersionEntry`, `requestId`, `duration`, `timeInQueue`, `preAggregationId`, `queuePrefix` and `error` strings.
  - The docs also say "Member names, numeric literals, date ranges, and the query shape are kept, as is the security context", and "error messages from a data source are logged as returned" ([doc-env]).
- **Effect on build events.** `preAggregation.loadSql`, `sql`, `invalidateKeyQueries` and the `loadSql` inside `queryKey` arrive with each param replaced by `redacted`. The fields Run history needs are untouched.
- **Agent events are not redacted.** Events sent to `CUBEJS_AGENT_ENDPOINT_URL` "keep the original values" ([doc-env]).

**Minimal correct setup (pattern, not T261's code):**

```js
// infra/cube/cube.js — reproduce Cube's own output, then look at the event; never throw.
let cubeLog = () => {};
try {
  const { createLogger } = require('@cubejs-backend/server-core'); // exported, undocumented (see Install)
  cubeLog = createLogger(process.env.NODE_ENV === 'production', process.env.CUBEJS_LOG_LEVEL);
} catch (e) {
  console.log(JSON.stringify({ level: 'error', message: 'wechart logger: no Cube logger', error: String(e) }));
}

module.exports = {
  // …existing options…
  logger: (message, params) => {
    try { cubeLog(message, params); } catch { /* never throw */ }
    try { /* filter and forward: see Never throwing */ } catch { /* never throw */ }
  },
};
```

## API surface we will use

**How line anchors were derived.** Anchors into files unchanged since a 2026-09-11 checkout are exact: logger.ts, OrchestratorApi.ts, agentCollect.ts, request-parser.ts, PreAggregationLoadCache.ts, promises.ts, and RefreshScheduler.ts up to line 450. For QueryQueue.ts, PreAggregationLoader.ts, PreAggregations.ts, server.ts and RefreshScheduler.ts after 450, I rebased the checkout's lines through the tag's patches:

- [e8c04fc] (blank lines only);
- [42bfe75] (#11629);
- [9070984] (#11759);
- [97282f0] and [99cceac] (server.ts).

Each hunk header's offset agreed with its neighbours, and the event names and params at each anchor were confirmed by fetching the file at the tag. The anchors themselves were not viewed at the tag (see Open questions).

### Build events

"Process" means where the call runs. The enqueuer is the process whose request or scheduler run asked for the build. The executor is the process that won the queue item: retrieval is atomic, and it "Returns `null` when another node is already running the query" ([QueryQueue L810-L842](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L810-L842)). The params come from the call sites.

| Event | Where (v1.7.45) | Process | Params | Meaning for Run history |
|---|---|---|---|---|
| `Refresh Scheduler Run` | [RefreshScheduler L281-L284](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L281-L284) | refresh worker, once per accepted context per heartbeat | `securityContext`, `requestId` | A worker run for one context starts. Links the run's `requestId` to its security context. |
| `Waiting for pre-aggregation renew` | [PreAggregationLoader L339-L345](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L339-L345) | enqueuer (the worker, for its builds) | `preAggregation`, `requestId`, `queryKey`, `newVersionEntry` | The content version changed (the refresh key turned over), so a rebuild is enqueued and awaited. This is the worker's path for a `* * * * *` key: it asks with `cacheMode: 'must-revalidate'` ([RefreshScheduler L595-L606](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L595-L606)), which sets `waitForRenew` ([PreAggregations.ts, `loadAllPreAggregationsIfNeeded`][pa]). |
| `Creating pre-aggregation from scratch` | [PreAggregationLoader L352-L358](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L352-L358) | enqueuer | same | No table with this structure exists yet. |
| `Invalidating pre-aggregation structure` | [PreAggregationLoader L329-L335](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L329-L335) | enqueuer | same | The structure version changed (the model changed). |
| `Refreshing pre-aggregation content` / `Error refreshing pre-aggregation` | [PreAggregationLoader L418-L433](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L418-L433) | a builder instance serving a query without `waitForRenew` | `preAggregation`, `requestId`, `queryKey`, `newVersionEntry`; the error event has `error`, `preAggregation`, `requestId` | A background rebuild. **Not the refresh worker's path**, and not reached in wechart's topology, where the API instance has `externalRefresh = !isPreAggsBuilder()` ([opts]) and serves or refuses without building ([PreAggregationLoader L135-L213][pal]). |
| `Force build pre-aggregation` | [PreAggregationLoader L293-L299](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L293-L299) | the process that received the jobs POST | `preAggregation`, `requestId`, `metadata`, `queryKey`, `newVersionEntry` | A job's build was asked for. |
| `Pre-aggregations build job error` | [PreAggregationLoader L300-L321](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L300-L321) | same | `preAggregation`, `requestId`, `newVersionEntry`, `error` | **Enqueuing the job failed.** It is not the build's own failure: for `isJob`, `executeInQueue` returns once the item is queued and never waits for the result ([QueryQueue L343-L353](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L343-L353)). |
| `Added to queue` | [QueryQueue L280-L296](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L280-L296) | enqueuer, only when a new item was added | `queueId`, `spanId`, `priority`, `queueSize`, `queryKey`, `queuePrefix`, `requestId`, `metadata`, `preAggregationId`, `newVersionEntry`, `forceBuild`, `preAggregation`, `addedToQueueTime`, `persistent`, `fastTrack` | The build is queued. `forceBuild: true` for jobs; unset for worker builds ([PreAggregations.ts `forceBuild: … forceBuildPreAggregations`][pa]). |
| `Performing query` | [QueryQueue L884-L896](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L884-L896) | executor | `queueId`, `queueSize`, `queryKey`, `queuePrefix`, `requestId`, `timeInQueue`, `metadata`, `preAggregationId`, `newVersionEntry`, `preAggregation`, `addedToQueueTime` | The build starts. |
| In-build steps: `Executing Load Pre Aggregation SQL`, `Downloading external pre-aggregation…`, `Uploading external pre-aggregation…` (with `completed` / `error` / `warning` variants), `Creating pre-aggregation index`, `Dropping source temp table`, `Dropping orphaned tables` (+ `completed`), `Dropping partially built external pre-aggregation` (+ `error`), `Error on saving pre-aggregation build status`, `Error on dropping pre-aggregation build status` | [PreAggregationLoader][pal]; names confirmed at v1.7.45 | executor, inside the build handler | mostly `queryOptions`: `queryKeyMd5`, `values` (redacted), `targetTableName`, `requestId`, `newVersionEntry`, `buildRangeEnd` ([L583-L592](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L583-L592)), plus `error` on error events | The steps of the build: material for AC-150's "log of what Cube reported". The last four names are new in 1.7.43 ([42bfe75]). |
| **`Performing query completed`** | [QueryQueue L1005-L1018](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L1005-L1018) | executor | the `Performing query` params + `duration` | **The partition built successfully.** Logged inside the try, after the handler resolved and before the result is stored. |
| **`Error while querying`** | defined in `logExecutionError` ([QueryQueue L858-L886](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L858-L886)), called at [L1019-L1074](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L1019-L1074) | executor | the `Performing query completed` params + `error` (`(e.stack \|\| e).toString()`) | **The build failed.** From 1.7.44 ([9070984]) it is logged after the result is stored, and only when the queue item was still active (or when storing threw). A `TimeoutError` is logged at once, followed by `Cancelling query due to timeout`. At v1.7.42 and v1.7.43 it was logged immediately in the catch. |
| `Orphaned execution result` | [QueryQueue L1053-L1074](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L1053-L1074) | executor | `queueId`, `warn`, `queryKey`, `queuePrefix`, `requestId`, `metadata`, `preAggregationId`, `newVersionEntry`, `preAggregation`, `addedToQueueTime`; from 1.7.44 also `warning` and `cancellationError` when the handler had thrown ([9070984]) | The result wasn't stored because the item was gone. **With `cancellationError`, the build was cancelled** (1.7.44+). Without it, the build succeeded but its item had already been removed. |
| `Removing orphaned query` | [QueryQueue L591-L601](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L591-L601) | any reconciling process | `queueId`, `queryKey`, `queuePrefix`, `requestId`, `metadata`, `preAggregationId`, `newVersionEntry`, `preAggregation`, `addedToQueueTime` | A stalled item was removed and its handler cancelled, for example after its executor died. |
| `Query started` / `Query completed` / `Continue wait` / `Error querying db` | [OrchestratorApi L73-L172](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts#L73-L172) | the waiter | `query`, `params`, `requestId`, and `duration` or `error` | The waiter's view. **Not a build end:** the worker waits at most `continueWaitTimeout` and then logs `Continue wait` ([L96-L136](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts#L96-L136)). |
| `Refresh Scheduler Error` | [RefreshScheduler L300-L312](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L300-L312) | refresh worker | `error`, `securityContext`, `requestId` | A worker run failed outside `Continue wait`, for example when a store's model can't be fetched. |

**Telling a build from an ordinary query in the same queue family:**

- **`newVersionEntry` is present only on build-queue items.** `PreAggregationLoader.executeInQueue` puts it in the queue item ([L435-L456](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L435-L456)). It has the shape `{ table_name, structure_version, content_version, last_updated_at, naming_version: 2 }` ([L266-L272](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts#L266-L272)).
- **`preAggregationId` alone is not enough.** The load-cache queue enqueues `{ preAggregation, requestId }` ([PreAggregationLoadCache L66-L80](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts#L66-L80)), so its events also carry a `preAggregationId`.
- **`queuePrefix` also tells them apart:**
  - builds: `SQL_PRE_AGGREGATIONS_${redisPrefix}_${dataSource}` ([PreAggregations L796](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L796));
  - the load cache: `SQL_PRE_AGGREGATIONS_CACHE_…` ([L847](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L847));
  - ordinary queries: `SQL_QUERY_…` ([QueryCache `getQueue`][qc]).
- **`redisPrefix` is the orchestrator id.** It defaults to `'STANDALONE'` ([server.ts L234](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L234); `redisPrefix: orchestratorId` in `getOrchestratorApi`). wechart sets no `contextToOrchestratorId` ([cube.js](/Users/srajagopal/Work/wechart/infra/cube/cube.js)), so its builds run in `SQL_PRE_AGGREGATIONS_STANDALONE_default`.

**Fields AC-150 needs, from the terminal event:**

- **Pre-aggregation:** `preAggregationId` (`cube.name`).
- **Partition:** `preAggregation.tableName` (equal to `newVersionEntry.table_name`), plus `preAggregation.buildRangeStart` and `buildRangeEnd` ([PreAggregations L207-L238](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L207-L238)).
- **Timing:** `duration` (ms of execution), `timeInQueue` (ms) and `addedToQueueTime` (epoch ms). Start is `addedToQueueTime + timeInQueue` ([QueryQueue L858-L886][qq]).
- **Error:** `error`, a stack string whose first line is the message. The jobs API's `failure: <msg>` uses `(e.message || e)` instead ([QueryQueue L1019-L1036][qq]; [PreAggregations `isPartitionExist`][pa]).
- **Target table:** `${table_name}_${content_version}_${structure_version}_${encodeTimeStamp(last_updated_at)}`, where `encodeTimeStamp = Math.floor(ms/1000).toString(32)` ([PreAggregations L20-L22](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L20-L22), [L882-L888](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L882-L888)). The in-build events carry it directly as `targetTableName`. It is the same value the jobs API returns as `table` ([refresh-jobs-caching.md §B](/Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md)).
- **Per-build log correlation:** `newVersionEntry`, which is on every queue and in-build event for that build. `requestId` is shared by all builds of one worker run.

### Telling who started it

- **The refresh worker.** `runScheduledRefresh` sets ``requestId: `scheduler-${ctx?.requestId || uuidv4()}` `` ([RefreshScheduler L263](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L263); confirmed at v1.7.43). The scheduler passes it on ([L603](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L595-L606)), and the loader puts it in the queue item ([PreAggregationLoader L435-L456][pal]), so every build event of a worker run carries `requestId` starting `scheduler-`.
- **Jobs.** The gateway's request id is `req.get('x-request-id') || req.get('traceparent') || `${uuidv4()}-span-1`` ([request-parser L14-L16](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/request-parser.ts#L14-L16), unchanged since 2025-12). `preAggregationsJobsPOST` builds `{ ...context, ...selectorContext }` ([gw], by name), and `postBuildJobs` runs with `requestId: context.requestId`, `forceBuildPreAggregations: true` and `isJob: true` ([RefreshScheduler L800-L811](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L800-L811)).
  - wechart's jobs POST sends no `x-request-id` today ([client.ts L126-L139](/Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts)), so Cube uses `<uuid>-span-1`.
  - To recognise its own builds, wechart should send an id of its own. It should not contain `-span-`, because `extractRequestUUID` splits on it (`lastIndexOf('-span-')`, [shared request-id.ts](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/request-id.ts)).
- **Rule.** `requestId.startsWith('scheduler-')` means Cube's refresh worker. wechart's own id prefix means Jobs. Anything else is another requester (none in wechart's topology).
  - Only an authenticated jobs call reaches `postBuildJobs`, so a spoofed `scheduler-` header needs a valid token.
- **Caveat: builds of the same partition are deduplicated.**
  - A forced (job) build whose queue key already has an item doesn't enqueue: `if (jobExists) return null` ([QueryQueue L259-L262](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L259-L262)).
  - A second requester of a queued key just waits (`added` is 0, [L266-L297](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L266-L297)).
  - So the terminal event names **whoever enqueued the item that ran**. A job posted while the worker's build of that partition is queued yields a job token (T156) and a worker-attributed build event (T261) for one underlying build. This is an inference from source; the spike can reproduce it.
- **Caveat: the executor may not be the enqueuer.**
  - `reconcileQueueImpl` picks any pending item that isn't pinned to another process ([QueryQueue L618-L633](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L582-L640)).
  - The API instance reconciles the shared build queue whenever it enqueues a job ([L305-L310](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L305-L310)) and after each build it runs ([L1095-L1096][qq]).
  - So a worker-enqueued build can be executed, and logged, by the API container. The logger must be in both containers, which it is, and "who started it" must come from `requestId`, not from which container logged. This is an inference from source.

### Never throwing

**Throw sites (claim 4, verified and broadened):**

| Where the logger throws | What happens | Source |
|---|---|---|
| `Performing query completed` | The inner catch stores `{ error: <the logger's message> }` as the build's result and then logs `Error while querying` for it. A successful build is reported failed to its waiters: the worker backs off, and history records a failure. The table exists, because rows already landed. | [QueryQueue L1005-L1074][qq]; backoff at [RefreshScheduler L651-L681](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L651-L681) |
| Any in-build step (`Executing Load Pre Aggregation SQL`, `Uploading…`) | The build handler rejects, so the build **really fails**: a failure build-status record (1.7.43+) and `Error while querying`. | [PreAggregationLoader `refresh`][pal] |
| `Added to queue` | Inside `executeInQueue`'s try, whose catch rethrows. The enqueuer gets an error although the item was queued. | [QueryQueue L244-L358](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L244-L358) |
| `Query started` (OrchestratorApi) | `executeQuery` fails, so the worker puts the pre-aggregation into backoff and **no build starts**. | [OrchestratorApi L77-L82](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts#L77-L82), [L163-L170](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts#L163-L170); [RefreshScheduler L651-L681][rs] |
| A second throw in `executeQuery`'s error path (`Error while querying`, then `Queue storage error`) | `executeQuery` rejects, but the default `sendProcessMessageFn` calls `this.executeQuery(...)` without awaiting it, so the rejection is **unhandled**. | [QueryQueue L130-L132](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L130-L132), [L1087-L1094](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts#L1087-L1094) |
| `Refresh Scheduler Run` | It sits before the try in `runScheduledRefresh`, so it rejects the heartbeat's async `setInterval` callback, whose wrapper has `try/finally` and no `catch`. The rejection is **unhandled**. | [RefreshScheduler L281-L286](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L281-L286); [promises.ts L137-L170](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/promises.ts#L137-L170) |

**Why an unhandled rejection matters.** Cube installs no `unhandledRejection` handler, and adds an `uncaughtException` handler only in dev-server mode ([server.ts][server]; a search of the 2026-09-11 checkout found no other handler). In Node, an unhandled rejection "will be raised as an uncaught exception", `throw` is the default mode, and Node then prints the stack and exits "with code 1" ([node-process]). wechart's compose sets no `restart:` policy ([docker-compose.yml](/Users/srajagopal/Work/wechart/docker-compose.yml)), so a crashed worker stays down.

**What "never throws" requires:**

1. **Make the logger a plain synchronous function, never `async`.** Cube calls it without `await` everywhere above, so a returned rejected promise is an unhandled rejection.
2. **Wrap the whole body in `try { … } catch {}`,** including the call to Cube's own `createLogger` output and any `JSON.stringify`, which can throw on odd values.
3. **Attach `.catch(() => {})` to every promise in the same tick.** In practice that is the `fetch(...)`. Give it a timeout so a hung wechart doesn't pile up requests. `AbortSignal.timeout` is a Node global; its source is not fetched here.
4. **Don't mutate `params`.** With redaction off, the same object also goes to the agent wrapper ([server.ts L416-L438][server]). Note that `prodLogger` itself sets `params.level` ([core-logger L111-L122](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L111-L122)).
5. **Filter first, by `message` (a `Set` lookup), before any other work.** The logger is on every hot path of both containers.
6. **Allow-list the forwarded fields** rather than sending `params`. `preAggregation` carries full SQL, and `error` carries data-source text as returned ([doc-env]).

### Routing to the right wechart

- **Build events carry no security context, app id or store.** Their params are listed in the table above. `metadata` is `undefined` for both worker builds (the scheduler never sets it, [RefreshScheduler L595-L606][rs]) and jobs (`metadata: undefined` in `postPreAggregationsBuildJobs`, [gw]).
- **`Refresh Scheduler Run` does carry `securityContext`** ([RefreshScheduler L281-L284][rs]), and it is not redacted ([doc-env]). For wechart's contexts that is `{}` (disk) or `{ wechartStore: 'http://host.docker.internal:4100' }` ([cube.js L134-L137](/Users/srajagopal/Work/wechart/infra/cube/cube.js)). The worker logs it before the builds of that run, and they share its `requestId`. A per-process, bounded map from `requestId` to store, filled from `Refresh Scheduler Run`, therefore routes the worker's own builds.
  - **Limit:** it misses when another process executes the build (§Telling who started it).
- **Shared tables limit attribution even with the map.** wechart sets neither `contextToOrchestratorId` nor a per-context `preAggregationsSchema`. All contexts share one build queue and the `prod_pre_aggregations` schema (`preAggregationsSchema` defaults to `prod_pre_aggregations` in production, [doc-config]). Two stores whose models define the same rollup with the same SQL resolve to the same table and version. The first context in `scheduledRefreshContexts` order that finds it stale builds it for all, and the disk context `{}` is first in wechart's list. This is an inference from source.
- **Options** (the design choice belongs to T261 and the user):
  1. **Map from `Refresh Scheduler Run` for worker builds, and wechart's own `x-request-id` for jobs.** Fall back to sending to every trusted store in `WECHART_MODEL_STORES` when the map misses. Each wechart then keeps the records whose `preAggregationId` it knows.
  2. **Documented: a per-context `preAggregationsSchema`.** It "allows to set the schema name dynamically depending on the security context". It is evaluated "once per app_id" and so needs `context_to_app_id`, which wechart has ([doc-config]). Each store's tables then live in their own schema, and `preAggregation.preAggregationsSchema` and `tableName` in every build event name the store deterministically.
     - Costs: builds are no longer shared between stores.
     - Existing tables in `prod_pre_aggregations` stop being used.
     - The docs warn "Cube will wipe out the contents of this database schema before use" ([doc-config]).
  3. **Undocumented: a `requestId` inside each `scheduledRefreshContexts` entry.** `migrateBackgroundContext` spreads the entry (`{ ...ctx, authInfo: ctx.securityContext }`, [server.ts `migrateBackgroundContext`][server]), so it would become `scheduler-<id>`. `UserBackgroundContext` declares only `securityContext` and `authInfo` ([gateway types][gw-types]), so this is not a contract.
- **Transport.** The logger in either container reaches a store the same way `fromStore` already does, at `host.docker.internal` with `x-wechart-model-key` ([cube.js L38-L45](/Users/srajagopal/Work/wechart/infra/cube/cube.js)). The route and its auth are T261 design.

### Volume

- **Forwarded events per build: one.** Each executed build item logs exactly one terminal event: `Performing query completed`, `Error while querying`, or from 1.7.44 `Orphaned execution result` with `cancellationError`.
  - A timeout's `Error while querying` is logged once, then `executionError` is cleared ([QueryQueue L1019-L1036][qq]).
  - One executor per item ([L810-L842][qq]).
  - The terminal event alone yields enqueue, start, duration, partition and error. Forwarding only terminal events with `newVersionEntry` is therefore one small POST per partition build.
  - Adding `Performing query` (start) doubles it. The per-build step log roughly adds the in-build events per build. The exact count depends on the refresh strategy and was not measured (spike step 6).
- **Everything else goes through the logger too:**
  - per heartbeat and context: `Refresh Scheduler Run`, refresh-key and partition-range queries with their `Query …` and queue events;
  - in the API container: every request's events.
  - The total was not measured. The filter must reject these by `message` first.
- **Does a `* * * * *` key rebuild every minute?** Yes: roughly once a minute per partition, detected within a heartbeat of the minute boundary.
  - The docs say `every` "guarantees that the refresh key will be executed **at least** once during the specified interval", not at most once ([doc-preagg-ref], v1.7.43 text).
  - The worker's heartbeat is 30 s when `scheduledRefreshTimer` is `true` ([opts] `getScheduledRefreshInterval`, confirmed at v1.7.43). That is the case for `CUBEJS_REFRESH_WORKER=true` ([env] `refreshWorkerMode`). The docs call it "merely a refresh worker's heartbeat" ([doc-config]).
  - A cron key without `sql` renews its cached value after `interval/10` s, capped at 300 s: 6 s for a 60 s cron (`refreshKeyRenewalThresholdForInterval`, [BaseQuery.js L5210-L5227 at the 2026-09-11 checkout][basequery]; not re-verified at the tag).
  - `docs/research/cube/refresh-key-schedule.md`, which should own these details, is not in the repo yet.
- **Latency.** The terminal event is logged the moment the build finishes, not at the next check. AC-150's "within one of Cube's check periods of finishing" is bounded by the forward's latency, not by Cube's schedule.
- **Failed builds back off.** The worker waits 1 s, then doubles each time up to `CUBEJS_PRE_AGGREGATIONS_BACKOFF_MAX_TIME` ([RefreshScheduler L651-L681][rs]; default 600 s per [refresh-jobs-caching.md §A](/Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md)). A rollup that keeps failing is therefore recorded at widening gaps, not every minute.
- **Retention arithmetic.** With 100 records per pre-aggregation and all N partitions of a non-incremental rollup rebuilt each minute, history covers about 100/N minutes. That all partitions rebuild is an inference; the sibling `refresh-key-schedule.md` should confirm it.

## Gotchas

1. **Version differences in this area:**

   | Area | v1.7.42 (running) | v1.7.43 | v1.7.44 | v1.7.45 (pinned) |
   |---|---|---|---|---|
   | Logger wiring, `createLogger`, redaction, RefreshScheduler, OrchestratorApi, agent | same: server-core `src/core` blobs identical at .42, .43 and .45 ([contents API](https://api.github.com/repos/cube-js/cube/contents/packages/cubejs-server-core/src/core?ref=v1.7.45)), and `log-redaction.ts` has one commit ([99cceac]) | same | same (inferred: identical at .43 and .45) | same |
   | PreAggregationLoader events | no build-status events | adds `Error on saving pre-aggregation build status`, `Error on dropping pre-aggregation build status`, `Dropping partially built external pre-aggregation` (+ `error`) ([42bfe75]) | same | same: blob identical to .43 |
   | Build-status record | none | `SQL_PRE_AGGREGATIONS_BUILD_STATUS` per target table: `building` / `failure`, 86400 s, removed when rows land, written for **every** build including the worker's ([42bfe75]) | same | same |
   | Terminal queue events | `Error while querying` logged in the catch at once | same | [9070984]: logged after the result is stored; a cancelled build logs `Orphaned execution result` with `warning` and `cancellationError`; a timeout logs at once | same |
   | `error` text for Cube Store create-table failures | full `CREATE TABLE` and metadata | same | [#11961]: "concise", with the table name and cause. Changes both the driver and Cube Store, so both images must be ≥1.7.44 | same |
   | 1.7.45's own changes (#11815, #11965, #11995) | — | — | — | none touch QueryQueue, PreAggregationLoader, server-core `src/core` or the logger ([changelog]; blob comparison) |

2. **Cube's default output doesn't show these events.** In production at the default level, `prodLogger` prints only `REST API Request`, warnings and errors ([core-logger L135-L165](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts#L135-L165)). To see them in stdout, use `CUBEJS_LOG_LEVEL=trace` or the probe below.
3. **`Query completed` is not a build end.** The worker's wait ends at `continueWaitTimeout` with `Continue wait`, while the build goes on ([OrchestratorApi L96-L136][oapi]).
4. **`Pre-aggregations build job error` is not a job's build failure** (Build events table). A job's build failure shows only as `Error while querying` in the executing container, and in the jobs API status.
5. **The executing container can differ from the enqueuing one** (§Telling who started it). Keep the same logger in both, which `*cube-volumes` already does.
6. **A crashed or killed executor leaves no terminal event.** The item later appears as `Removing orphaned query` from another process. A build with a start but no end should be treated as abandoned. The 1.7.43+ build-status record has an "abandoned" check for jobs ([42bfe75]).
7. **Data in `error`.** Data-source error messages are not redacted ([doc-config], [doc-env]) and can echo values. Store them as Cube's error (AC-150), knowing what they may contain.
8. **The `createLogger` import is undocumented.** Pin the image, which the caller has done. If a later version moves it, fall back to an inline `prodLogger` copy under Apache-2.0 ([npm-sc]).
9. **YAML:** in a model file, `every: * * * * *` must be quoted, as `every: "* * * * *"`. An unquoted leading `*` is YAML alias syntax. This is general YAML behaviour; no Cube source was fetched for it.

## Alternatives considered

The caller asked for documented alternatives (claim 8):

- **`CUBEJS_AGENT_ENDPOINT_URL`:**
  - The env-var docs mention it only inside `CUBEJS_LOG_REDACTION`, as "how Cube Cloud receives them for Query History", with original, unredacted values. None of the `CUBEJS_AGENT_*` variables has its own entry ([doc-env]).
  - From source ([agent L131-L166](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/agentCollect.ts#L131-L166), [L179-L230](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/agentCollect.ts#L179-L230)):
    - it batches **every** logger event as `{ msg, ...params, timestamp, id, instanceId }`;
    - it sends every `CUBEJS_AGENT_FLUSH_INTERVAL` ms (default 1000), in frames of `CUBEJS_AGENT_FRAME_SIZE` (200);
    - transport is deflated JSON over HTTP POST, or a WebSocket for non-`http` URLs, with 3 retries.
  - It carries the same internal event names with unredacted params, and has no documented contract. Compared with the `logger` option it adds batching and a wire format, but no stability.
- **OpenTelemetry:** no OTel variables are documented ([doc-env]). A search of the 2026-09-11 checkout finds OTel only in Cube Store's Rust crates (`rust/cubestore/cubestore/Cargo.toml`, `src/cluster/mod.rs`), used for Cube Store's internal tracing. Nothing in the Node refresh worker emits build spans.
- **Cube's JSON stdout at `CUBEJS_LOG_LEVEL=trace`:** the format is documented as "structured JSON — one JSON object per line" ([doc-env]). The event names are the same internal wording. It prints every event and needs log access from wechart.
- **The jobs API:** documented, but it reports only builds wechart started, for 24 h ([refresh-jobs-caching.md §B](/Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md)). That is T156's half.
- **Undocumented `/cubejs-system/*` routes and Cube Store's SQL interface:** the user deferred both on 2026-09-21 ([refresh-jobs-caching.md, Open questions](/Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md)).

## Spike to run locally

The goal is to see, on v1.7.45, one refresh-worker build, one jobs build and one failed build, with their exact params, which container logs each, and the event rate. Everything below lives in a scratch directory; nothing in the repo changes.

**1. Scratch copies.**

```sh
SCRATCH=$(mktemp -d); cp infra/cube/cube.js "$SCRATCH/"; cp -R infra/cube/model "$SCRATCH/model"
```

- In `$SCRATCH/model/cubes/monthly_orders.yml`, change `every: 1 hour` to `every: "* * * * *"` (quoted).
- Add `$SCRATCH/model/cubes/probe_fail.yml`, a rollup whose build must fail (a missing table). A cron key has no `sql` to fail first.

```yaml
cubes:
  - name: probe_fail
    sql_table: public.no_such_table
    dimensions:
      - name: at
        sql: now()
        type: time
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: fails
        measures: [count]
        time_dimension: at
        granularity: day
        refresh_key:
          every: "* * * * *"
```

**2. The probe logger.** Add this to `$SCRATCH/cube.js` above `module.exports`, and add `logger` to the exports:

```js
// ---- spike probe: prints build-related events, then Cube's own line; never throws ----
let cubeLog = () => {};
try {
  const { createLogger } = require('@cubejs-backend/server-core');
  cubeLog = createLogger(process.env.NODE_ENV === 'production', process.env.CUBEJS_LOG_LEVEL);
} catch (e) { console.log(`WECHART_PROBE no createLogger: ${e}`); }

const PROBED = new Set([
  'Refresh Scheduler Run', 'Refresh Scheduler Error',
  'Creating pre-aggregation from scratch', 'Invalidating pre-aggregation structure',
  'Waiting for pre-aggregation renew', 'Refreshing pre-aggregation content',
  'Error refreshing pre-aggregation', 'Force build pre-aggregation', 'Pre-aggregations build job error',
  'Added to queue', 'Performing query', 'Performing query completed', 'Error while querying',
  'Orphaned execution result', 'Cancelling query due to timeout', 'Removing orphaned query',
  'Error querying db',
]);
const counts = new Map();
setInterval(() => {
  try { console.log(`WECHART_PROBE_COUNTS ${JSON.stringify(Object.fromEntries(counts))}`); counts.clear(); } catch {}
}, 60000).unref();

function probe(message, params) {
  counts.set(message, (counts.get(message) || 0) + 1);
  if (!PROBED.has(message)) return;
  const p = params || {};
  const pa = p.preAggregation || {};
  const prefix = typeof p.queuePrefix === 'string' ? p.queuePrefix : undefined;
  if (prefix !== undefined && !prefix.startsWith('SQL_PRE_AGGREGATIONS_')) return; // ordinary queries
  if (message === 'Error querying db' && !String(p.requestId).startsWith('scheduler-')) return;
  const cut = (v) => (v === undefined ? undefined : String(v).slice(0, 500));
  console.log(`WECHART_PROBE ${JSON.stringify({
    at: new Date().toISOString(), worker: process.env.CUBEJS_REFRESH_WORKER === 'true', message,
    keys: Object.keys(p), requestId: p.requestId, queuePrefix: prefix, queueId: p.queueId,
    preAggregationId: p.preAggregationId ?? pa.preAggregationId, tableName: pa.tableName,
    buildRangeStart: pa.buildRangeStart, buildRangeEnd: pa.buildRangeEnd,
    newVersionEntry: p.newVersionEntry, targetTableName: p.targetTableName, forceBuild: p.forceBuild,
    duration: p.duration, timeInQueue: p.timeInQueue, addedToQueueTime: p.addedToQueueTime,
    error: cut(p.error), warn: p.warn, warning: p.warning, cancellationError: cut(p.cancellationError),
    securityContext: p.securityContext,
  })}`);
}
// in module.exports:
//   logger: (message, params) => {
//     try { probe(message, params); } catch {}
//     try { cubeLog(message, params); } catch {}
//   },
```

**3. The override.** Create `$SCRATCH/probe.compose.yml`. Compose merges service `volumes` by target path, so these replace the mounts ([compose-merge]). The throwaway Cube Store volume keeps dev data out of a v1.7.42→v1.7.45 metastore change.

```yaml
services:
  cubestore:
    image: cubejs/cubestore:v1.7.45-arm64v8
    volumes: ['probe-cubestore:/cube/data']
  cube:
    image: cubejs/cube:v1.7.45
    volumes: ['${SCRATCH}/cube.js:/cube/conf/cube.js:ro', '${SCRATCH}/model:/cube/conf/model:ro']
  cube-refresh-worker:
    image: cubejs/cube:v1.7.45
    volumes: ['${SCRATCH}/cube.js:/cube/conf/cube.js:ro', '${SCRATCH}/model:/cube/conf/model:ro']
volumes:
  probe-cubestore: {}
```

- Run `SCRATCH=$SCRATCH docker compose -f docker-compose.yml -f "$SCRATCH/probe.compose.yml" up -d --force-recreate cubestore cube cube-refresh-worker`.
- If wechart's API isn't running on 4100/4200, the store contexts will log `Refresh Scheduler Error`. Either run it, to also observe routing, or add `environment: { WECHART_MODEL_STORES: '' }` to both Cube services.

**4. One refresh-worker build.** Run `docker logs -f wechart-cube-refresh-worker 2>&1 | grep WECHART_PROBE` for about 3 minutes, and in parallel the same for `wechart-cube`. Record:

- for each minute, the message sequence for `monthly_orders.by_status_month` (expected: `Refresh Scheduler Run` → `Waiting for pre-aggregation renew` or `Creating … from scratch` → `Added to queue` → `Performing query` → `Performing query completed`);
- the `requestId` prefix and `queuePrefix` (expected `SQL_PRE_AGGREGATIONS_STANDALONE_default`);
- the full `keys` list;
- `duration` and `timeInQueue`;
- which container logged the terminal event;
- the seconds between the minute boundary and `Performing query completed`.

**5. One jobs build.** Mint a token with the compose secret, then post a job with a recognisable id:

```sh
TOKEN=$(node -e 'const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),n=Math.floor(Date.now()/1e3),h=b({alg:"HS256",typ:"JWT"}),p=b({iat:n,exp:n+3600});console.log(h+"."+p+"."+c.createHmac("sha256","dev-secret").update(h+"."+p).digest("base64url"))')
curl -s -X POST http://localhost:54000/cubejs-api/v1/pre-aggregations/jobs \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -H 'x-request-id: wechart-probe-job-1' \
  -d '{"action":"post","selector":{"contexts":[{"securityContext":{}}],"timezones":["UTC"],"preAggregations":["monthly_orders.by_status_month"]}}'
```

- `contextToApiScopes` grants `jobs` to non-draft tokens ([cube.js L123-L126](/Users/srajagopal/Work/wechart/infra/cube/cube.js)).
- In both containers' probe lines, find `requestId: "wechart-probe-job-1"`. Record which container logged `Force build pre-aggregation` and `Added to queue` (`forceBuild: true`), and which logged `Performing query` and `Performing query completed`.
- Post `{"action":"get","tokens":[…]}` with the returned token, and compare its `table` with the build's `targetTableName`.
- Post the job again while a worker build of the same partition is queued, to see the dedupe caveat.

**6. One failed build, and volume.**

- Watch for `probe_fail.fails`: `Error while querying` with `error` starting `relation "public.no_such_table" does not exist`, plus the gaps between attempts as the backoff grows.
- Read the `WECHART_PROBE_COUNTS` lines in each container: total events per minute, against the terminal build events per minute.

**7. (Optional) Confirm the throw hazard.** In a separate run, make `probe` throw on `Performing query completed`. Expect `Error while querying` carrying the probe's own error, and the worker backing off. Restore before step 8.

**8. Cleanup.**

```sh
docker compose up -d --force-recreate cubestore cube cube-refresh-worker
docker volume rm wechart_probe-cubestore   # name per `docker volume ls`
rm -rf "$SCRATCH"
```

## Open questions / unverified

- **UNVERIFIED: line anchors in files that changed after 2026-09-11.** These are QueryQueue.ts, PreAggregationLoader.ts, PreAggregations.ts, server.ts, and RefreshScheduler.ts after line 450.
  - I derived them by rebasing through the tag's hunk headers. Each file's offsets agreed with each other, and #11759's first hunk opens at 858 on `try {` / `let executionResult;` as predicted. Every cited event and param was confirmed at the tag.
  - RefreshScheduler's four blank-line insertion points after line 450 are inferred from the rule [e8c04fc] applied in QueryQueue: a blank line before `try`/`for` unless it is the first statement of a block.
  - The GitHub API was rate-limited, and the fetch tool won't reproduce whole files, so the anchors couldn't be read directly. Spot-check them before quoting line numbers in code comments.
- **UNVERIFIED at the tag:** `refreshKeyRenewalThresholdForInterval` (interval/10, capped at 300 s). `BaseQuery.js` was too large to fetch, so this was read at the 2026-09-11 checkout only.
- **UNVERIFIED: v1.7.44 blobs.** Its behaviour is inferred from the .43/.45 comparisons and the CHANGELOG.
- **UNVERIFIED:**
  - whether the API container really executes worker-enqueued builds in practice (spike step 5);
  - which in-build events wechart's Postgres → Cube Store strategy emits;
  - the total events per minute (step 6).
- **UNVERIFIED: whether all partitions of a non-incremental rollup rebuild on each cron turn.** This belongs to the sibling `refresh-key-schedule.md`, which is not in the repo yet.
- **UNVERIFIED:** Node's `AbortSignal.timeout` and the YAML alias rule (Gotcha 9) are stated without a fetched source.
- **Open, research gate.** If T261's `cube.js` requires `@cubejs-backend/server-core` for `createLogger`, the "no import without a research doc" hook may want that package in some doc's `packages:`. The caller set `packages: []` here. The alternative is an inline Apache-2.0 copy of `prodLogger`, which a wechart unit test can exercise without Cube's package.
- **Open, for T261 and the user:**
  - which routing option (§Routing);
  - whether to record starts as well as ends, to catch abandoned builds;
  - how to merge a job token's record (T156) with the worker-attributed event of a deduplicated build (§Telling who started it). Matching on target table name is available.
- **Open:** `Error querying db` and `Refresh Scheduler Error` report worker failures that never reach the build queue (a refresh-key query failing, for example). They carry `requestId` but no `preAggregationId`. Whether Run history should show them is a product question for the user's purpose ("why a rollup's data is stale or failing").

[doc-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[doc-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
[doc-preagg-ref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[changelog]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
[server]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[core-logger]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts
[rs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[oapi]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[sc-index]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/index.ts
[redact]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/log-redaction.ts
[env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[qq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[pa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[qc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[gw-types]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/types/gateway.ts
[basequery]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5210-L5227
[dockerfile]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
[npm-sc]: https://registry.npmjs.org/@cubejs-backend/server-core/1.7.45
[42bfe75]: https://github.com/cube-js/cube/commit/42bfe75a5628b9a9f882362a63771239a0c6d1a9
[9070984]: https://github.com/cube-js/cube/commit/9070984043e57d79b82e70c0a5dbe7a20b8e0e66
[99cceac]: https://github.com/cube-js/cube/commit/99cceac77f00c8c0a13c0f2c0f4b237b4d97460f
[97282f0]: https://github.com/cube-js/cube/commit/97282f0
[e8c04fc]: https://github.com/cube-js/cube/commit/e8c04fcc7f64948c43f4f59df7d53897102e115b
[#11961]: https://github.com/cube-js/cube/pull/11961
[node-process]: https://nodejs.org/docs/latest-v24.x/api/process.html
[compose-merge]: https://docs.docker.com/reference/compose-file/merge/
