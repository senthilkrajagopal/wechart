---
library: HA query path — Cube 1.7.45 (2+ API instances, one refresh worker, single-node Cube Store as the queue) and wechart's API on 2+ replicas
packages: []
version: 1.7.45
researched: 2026-09-25
sources:
  - https://github.com/cube-js/cube/tree/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator
  - https://github.com/cube-js/cube/tree/v1.7.45/packages/cubejs-server-core/src/core
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/tree/v1.7.45/packages/cubejs-server/src
  - https://github.com/cube-js/cube/tree/v1.7.45/packages/cubejs-cubestore-driver/src
  - https://github.com/cube-js/cube/tree/v1.7.45/rust/cubestore/cubestore/src/cachestore
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/architecture.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/deployment.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://api.github.com/repos/cube-js/cube/compare/v1.7.45...senthilkrajagopal:feat/xcube
  - /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance (local spike, fork branch spike/xcube-feasibility, commit db087e0)
  - https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
  - https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
  - https://kubernetes.io/docs/concepts/services-networking/service/
  - https://kubernetes.io/docs/tasks/run-application/force-delete-stateful-set-pod/
  - https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Server.md
  - https://github.com/mcollina/close-with-grace/blob/v2.5.0/README.md
  - https://github.com/salsita/node-pg-migrate/blob/v9.0.0/src/runner.ts
  - https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream
  - https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
  - https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2
  - https://www.postgresql.org/docs/18/sql-notify.html
---

# HA query path: Cube 1.7.45 × 2+ and wechart API × 2+

> **Note, 2026-09-26.** This fits the final integration plan's decision 9 ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md)). The researcher's text below is kept as written.
> - **Heartbeat:** this doc's open question on `heartBeatInterval` is decided by the plan's "Runtime settings": 5–10 s, with the Cube Store queue, 4 transpile threads (2 if memory is tight) and 4 GB or more of heap ([the plan's snapshot](../../inputs/2026-09-26-integration-plan.md)).
> - **wechart's in-memory state (§4):**
>   - Row 1, the publish drafts, moves to the database in slice 2 (T418), and goes with the callbacks in slice 3 (T431).
>   - Row 3, the metadata caches, is keyed by xcube's revision (T421, this doc's option b).
>   - Row 6, the migrations, waits for the lock (T421).
>   - The web app's retries are T422, and the stop-one test is T423.

## Summary

This doc feeds **AC-319**, and **AD 1, AD 8 and AD 11**. It also touches AC-161, AC-156, AC-150 and AC-248.
- AC-319 (`docs/spec.md:1127-1128`) is the HA test: stopping one Cube instance and one API replica loses no signed-in session and fails no query the web app retries. It also requires that "Any API replica SHALL serve any request, keeping no work of its own in memory".
- AD 11 is the HA decision itself. AD 1 says no callbacks from Cube and no drafts in memory. AD 8 is about overlays (`docs/inputs/2026-09-25-architecture-decisions.md:4,11,14`).
- AC-161 asks for "every running Cube instance" (`spec.md:656-657`). AC-156 is health (`spec.md:612-613`), AC-150 is build history (`spec.md:596-597`), and AC-248 is the chart (`spec.md:891-892`).

**Findings:**
1. **Cube's side of HA works as designed, if the web app retries.** Every API instance and the refresh worker share one queue per data source in Cube Store. A query's queue key is a hash of the query, and adding one is an atomic insert-if-absent, so a retry through any instance joins the same item ([d-csarch] L863-905).
   - **What the caller sees today.** When an instance stops while it is *executing* a query:
     - The request in flight fails at the socket (`fetch failed: UND_ERR_SOCKET`).
     - Polls to the surviving instance answer `Continue wait` until the dead item is declared stalled, after 4 × `heartBeatInterval`, which is 120 s by default.
     - The query then runs again. The local spike measured **127.6 s** with defaults, and **29.0 s** with `heartBeatInterval: 5`. Postgres ran it twice both times ([spk-t3-def], [spk-t3-hb5]).
2. **wechart's web app does not retry today.**
   - `retry: false` is set globally and on tiles (`packages/web/src/main.tsx:16-25`, `packages/web/src/query/useTileData.ts:26-33`).
   - `loadTile` re-polls only on `200 {"error":"Continue wait"}` (`packages/web/src/query/loadTile.ts:93-142`).
   - The API turns a Cube socket failure into `500 {"error":"Internal error"}` (`packages/api/src/server.ts:1442-1480`).
   - So **AC-319 fails today** for the request that is in flight when a pod stops.
3. **wechart's API has one in-memory state that breaks with 2 replicas, and one that goes stale.**
   - **Breaks: publish drafts.** Drafts are held in a per-process `Map`, and Cube reads them back through a callback that can land on the other replica (`packages/api/src/model/publish.ts:143-177`). The chart pins the API to `replicas: 1` with `Recreate` for exactly this reason (`deploy/helm/wechart/templates/api.yaml:26-32`). AD 1 removes both the drafts and the callbacks.
   - **Stale: the metadata caches.** `MetaCache` and `MetaCachesByGroups` are invalidated only on the replica that handled the publish (`server.ts:325-336`). The other replica can serve pre-publish metadata for up to 60 s.
   - **Safe: sessions.** They live in Postgres, and every pod reads the same signing secret from the chart's Secret.
4. **Refresh worker: exactly one.** Cube has no leader election for the refresh scheduler. Coordination is only the queue's atomic claim ([d-csarch] L910-932). The docs describe "A Refresh Worker" and warn against refresh on every instance ([d-arch] L15-16, [d-config] L754-763).
5. **Cube Store single-node.** The queue and cache sit in RocksDB on the data PVC and survive a restart ([d-csarch] L829-832). While it is down, the whole query path is down, because the queue lives there. AD 11 accepts that.

**Evidence caveats:**
- **Local checkout vs upstream.** Cube line numbers below are from the local checkout at `/Users/srajagopal/Work/bi/cube` (branch `spike/xcube-feasibility`, one commit on `feat/xcube`). GitHub's compare shows `feat/xcube` = v1.7.45 (`f2c28b8`) plus changes only under `cube-introspection/` ([cmp]). I spot-checked the cited functions against the v1.7.45 tag (QueryQueue constructor and reconcile, server.ts caches, PreAggregations build status, WebSocketConnection retry, the cube-store-architecture doc), and they match.
- **The spike.** "Spike" means `cube-introspection/spikes/c-multi-instance`. It is local and unreviewed: compose, Cube 1.7.45, and `docker kill` (SIGKILL). It is not documentation.

## Cube

### 1. Several API instances

**The cache and queue driver.**
- `CUBEJS_CACHE_AND_QUEUE_DRIVER` accepts `cubestore` or `memory`. The default is `cubestore` in production ([d-env] L152-161).
- In source, the resolution order is: the explicit option, then the env var, then `cubestore` when `NODE_ENV === 'production'`, else `memory` ([qo] `QueryOrchestrator.ts:41-60`).
- The chart sets `NODE_ENV=production` (`deploy/helm/wechart/templates/_helpers.tpl:136-137`), so Cube Store is already in use. Setting `CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore` explicitly removes the dependence on `NODE_ENV`.
- The docs warn: "Replicating Cube instances without Cube Store can lead to source database degraded performance, various race conditions and cached data inconsistencies" ([d-deploy] L433-440).
- Spike contrast: two clients on two instances ran the slow query **once** with `cubestore` ([spk-t1b-cs]) and **twice** with `memory` ([spk-t1b-mem]).

**The queue is shared only if the orchestrator id matches.**
- The queue prefix is `SQL_QUERY_${cachePrefix}_${dataSource}` ([qc] `QueryCache.ts:670`). The cache prefix is the orchestrator id (`redisPrefix: orchestratorId`, [core] `server.ts:749`), which defaults to `'STANDALONE'` ([core] `server.ts:234`).
- wechart's `infra/cube/cube.js` sets no `contextToOrchestratorId` (`/Users/srajagopal/Work/wechart/infra/cube/cube.js:71-150`). So every instance and the worker share one queue per data source.
- If xcube adds a `contextToOrchestratorId`, it must be a pure function of the context, so every instance computes the same prefix. (Derived from the lines above.)

**What each instance keeps in its own memory.** Losing any of this costs time, not correctness:

| State | Where | Lost on stop means |
|---|---|---|
| Compiled models, one `CompilerApi` per app id | LRU of `compilerCacheSize` (250), TTL `maxCompilerCacheKeepAlive` ([core] `server.ts:148, 215-221, 533-567`). wechart sets a 10-min keep-alive with reset on use (`infra/cube/cube.js:76-77`). | The first request on a fresh instance compiles. In the spike, a 3,000-cube flat model took ~7.4 s and ~3.5 GB RSS (in-process on macOS) ([spk-a-200x15]). |
| Orchestrators (driver pools, queues, caches), one per orchestrator id | `orchestratorStorage` and `buildingOrchestratorApis` ([core] `server.ts:132-139, 587-616, 618-759`) | Pools are reopened. |
| In-memory result LRU in front of Cube Store | `QueryCache.memoryCache`, max 10,000 entries ([qc] `QueryCache.ts:230-232, 1189-1222`) | Cache misses only. Cube Store keeps the shared cache. |
| Throttles for pre-aggregation used/touch writes | `usedCache` and `touchCache` LRUs ([pa] `PreAggregations.ts:348-359`) | Extra writes only. |
| Heartbeat timers for queries this instance is executing | `setInterval` per claimed item ([qq] `QueryQueue.ts:899-953`) | Those items stall (below). |
| Process id, used only for "persistent" (streaming) queue keys | `getProcessUid()` ([proc] `process.ts:6-13`, [csqd] `CubeStoreQueueDriver.ts:23-31`) | n/a for `/v1/load` |
| Cube Store WebSocket and its unanswered messages | [wsc] `WebSocketConnection.ts:269-377` | Re-sent on a new connection after reconnect. |

**How reconciliation works.**
- Every instance runs the same reconciliation:
  - after adding an item ([qq] `QueryQueue.ts:305-310`)
  - after finishing one ([qq] L1094)
  - on the refresh worker's tick, through `forceReconcile` for each data source its model uses ([rs] `RefreshScheduler.ts:296, 319-336`; [qo] `QueryOrchestrator.ts:149-161`)
- Reconciliation cancels stalled and orphaned items and claims pending ones ([qq] L582-640).
- Concurrency is a cluster-wide cap per queue, not per node ([qq] L609-616; [d-csarch] L939-952).

**How a query in flight on a stopped instance fails, and what the client sees.**

| Situation | What happens | Source |
|---|---|---|
| The stopped instance was only *waiting* (another instance runs the query) | wechart's request to it dies at the socket. A retry through the survivor joins the same item and gets the one result. | [d-csarch] L890-905. Spike: first poll on api1, then api2 only, one execution ([spk-t1-then2]) |
| The stopped instance was *executing* (item Active) | The heartbeat stops. The survivor answers `200 {"error":"Continue wait"}` every `continueWaitTimeout` (10 s default) until the item's heartbeat is older than 4 × `heartBeatInterval` (30 s → 120 s). Then any reconciler cancels it and fires the cancel handler, which kills the warehouse query. The next poll adds it again and runs it. | [qq] L125-128, L145 (`heartBeatTimeout: heartBeatInterval * 4`); [crs] `cache_rocksstore.rs:696-707`; [d-csarch] L975-997; [d-config] L607 |
| The same, observed | The killed instance's own request: `fetch failed: UND_ERR_SOCKET`. The survivor answered **127.6 s** after the kill with defaults (51 polls), and **29.0 s** with `heartBeatInterval: 5`. Postgres ran the query twice. | [spk-t3-def], [spk-t3-hb5], [spk-t3-script] |
| An item still Pending (not claimed) when an instance stops | Nothing is lost. Pending items belong to the queue, not the instance, and any reconciler claims them. | [qq] L618-633; [d-csarch] L910-932 |

- **Cube's HTTP answers.** `Continue wait` is **HTTP 200** `{error:"Continue wait"}`. A query error is 400, and an internal error is 500 ([gw] `gateway.ts:2525-2588`, the Continue-wait branch at L2545-2552).
- **Graceful stop of a Cube instance.**
  - Without `CUBEJS_GRACEFUL_SHUTDOWN`, SIGTERM runs `process.exit(0)` at once ([container] `container.ts:402-404`), so every in-flight HTTP request dies at the socket.
  - With it set to N seconds:
    - New requests, `/readyz` included, get `503` with `Retry-After` and "Server unavailable, no new requests accepted during shutdown". The middleware is mounted before every route ([srv] `server.ts:94-102`; [gm] `graceful-middleware.ts:4-19`).
    - In-flight requests may finish for N s ([gh] `gracefull-http.ts:51-73`). A request blocked in `RESULT_BLOCKING` returns a result or `Continue wait` within `continueWaitTimeout`.
    - A timer force-exits at N+1 s ([srv] `server.ts:222-234`).
    - The env var reads `CUBEJS_GRACEFUL_SHUTDOWN` as a positive integer ([env] `env.ts:305-306`). It is undocumented: no match in `docs-mintlify`.
  - A query still *executing* when the process exits stalls as above (derived). See Open questions for what `core.shutdown()` does to it.
- **Pending items can be cancelled and re-added.** A Pending item is cancelled once its orphaned deadline passes: creation + `orphanedTimeout` (120 s), set when the item is created ([qi] `queue_item.rs:147-168`; [crs] L679-693). A re-add of an existing key does not move that deadline ([crs] L1380-1386).
  - So a query that waits in the queue longer than 120 s, for example behind a dead instance's stalled slots, is cancelled and re-added by the next poll (derived).
  - The web app must keep polling. `loadTile` allows 240 polls (`loadTile.ts:20`).

**Tuning.**
- **Timeouts.** `heartBeatInterval` and `orphanedTimeout` are `orchestratorOptions.queryCacheOptions.queueOptions` and `preAggregationsOptions.queueOptions` ([d-config] L583, L586, L600-607).
  - Cube "**strongly** recommend[s] leaving these options set to the defaults" ([d-config] L567-572).
  - A lower heartbeat interval shortens recovery ([spk-t3-hb5]). It also means any pause over 4 × interval (event-loop stall, Cube Store hiccup) cancels a live query, and its later ack is dropped as "Orphaned execution result" ([qq] L1056-1089). That is a correctness-versus-recovery trade-off for the user.
- **`continueWaitTimeout`.** It has no env var and is set only through `orchestratorOptions` (spike config comment, [spk-conf] L108-112; [d-config] L578).

**Readiness and liveness with several instances.**
- **`/readyz` answers 200 as soon as HTTP is up.** wechart sets `contextToAppId`, which makes Cube non-standalone ([core] `server.ts:223-226`; [gw] L3045-3063; see `docs/research/cube/kubernetes.md` §Summary 1). So a new instance takes traffic before its model compiles.
- **`/livez` tests every cached orchestrator's data sources and the Cube Store connection** ([gw] L3065-3078). A Cube Store outage turns `/livez` DOWN on **all** instances at once, so using it as a liveness probe restarts the whole tier together (derived; `kubernetes.md` Gotcha 2). The chart already uses `/readyz` for both probes (`cube.yaml:70-89`).
- **Both probes are cached for 1 s** (`kubernetes.md` API surface).

**Kubernetes pod termination.**
- Endpoint removal runs **at the same time** as the preStop hook and SIGTERM: "the control plane evaluates whether to remove that shutting-down Pod from EndpointSlice objects" in parallel with the kubelet's shutdown ([k8s-lifecycle], Pod Termination Flow steps 2-3).
- Terminating endpoints are marked `ready: false` ([k8s-ep-term]).
- A `preStop` sleep delays SIGTERM so new connections stop arriving first. `lifecycle.preStop.sleep` is GA from 1.34 ([k8s-sleep]), and Docker Desktop runs v1.34.1 (`docs/research/helm.md`).

**Rolling upgrade.**
- **Surge and unavailability.** With `replicas: 2` and the default RollingUpdate, maxSurge 25% rounds **up** to 1 and maxUnavailable 25% rounds **down** to 0 ([k8s-deploy]). One new pod is added and must be Ready before an old one stops.
- **Readiness gates nothing.** `/readyz` is always 200 here, so the new pod is cold: it compiles on its first request (see the table above).
- **Mixed versions share the queue.** During a rollout, two Cube versions share one Cube Store queue. The driver checks Cube Store capabilities before using newer commands (`hasCapability('queueAddAndRetrieve' | 'queueExternalId' | 'queueExclusive')`, [csqd] L71-85, L128). Whether queue payloads are compatible across Cube versions is **UNVERIFIED**.
- **Model version propagation, observed in the spike.**
  - `schemaVersion` driven by Postgres `LISTEN/NOTIFY` switched 2 API instances and the worker within 227-407 ms, with a 29 ms skew.
  - With the 5 s re-sync poll alone, it took up to 4.7 s.
  - It recovered after a Postgres restart and a 10 s outage ([spk-t5], [spk-t5w], [spk-conf] L6-83).
  - This bears on how xcube propagates a publish to every instance (AD 1, AD 6).

### 2. The refresh worker: exactly one

- **The docs describe one worker.**
  - Topology is "One or multiple API instances, A Refresh Worker" ([d-arch] L15-16). The production checklist says to run "a separate Cube Refresh Worker instance" ([d-deploy] L419-424).
  - `scheduled_refresh_timer` warning: setting it everywhere "will lead to the instantiation of Refresh Worker on every Cube instance of your cluster, including API ones. This will usually lead to refreshing race conditions and to out of memory errors" ([d-config] L754-763).
  - Several workers are described only as a split by tenant, each with its own `scheduledRefreshContexts` ([d-mt] L218-224).
- **"Several with Cube Store's queue locks" is not a Cube mechanism.**
  - There is no scheduler lock or leader: "Coordination requires no locks, no leader election, and no scheduler — the queue itself is the synchronization point" ([d-csarch] L924-932).
  - Two workers would each run the whole refresh loop. Identical builds collapse, because the build's queue key is `[loadSql, invalidationKeys]`, which leaves out the version entry ([pal] `PreAggregationLoader.ts:435-462`). But refresh-key checks and reconciliation would run twice (derived).
  - `EXCLUSIVE` queue items exist only for persistent (streaming) keys ([csqd] L128).
- **Recommendation (derived): keep 1 replica with at-most-one semantics.**
  - A Deployment's `Recreate` only guarantees termination before creation *for upgrades*. "If you manually delete a Pod … the replacement will be created immediately (even if the old Pod is still in a Terminating state). If you need an 'at most' guarantee for your Pods, you should consider using a StatefulSet" ([k8s-deploy], Recreate).
  - A StatefulSet "ensures that, at any time, there is at most one Pod with a given identity" ([k8s-sts-force]).
  - The chart today runs the worker as a Deployment with 1 replica and RollingUpdate (`cube.yaml:26-34`), which overlaps two workers during a rollout (derived from [k8s-deploy] surge rounding).
- **What a worker restart costs.**
  - The worker ticks every 30 s by default ([opts] `OptsHandler.ts:574-586`). The timer, compiled models and orchestrators are rebuilt on start ([core] L245).
  - Builds that were executing on the old worker stall and are cancelled after 4 × `heartBeatInterval` by any reconciler, which includes the new worker's per-tick `forceReconcile` (derived from the reconcile sources above). The next tick enqueues them again. `Continue wait` inside the scheduler is swallowed ([rs] L300-307).
  - For a jobs-API token, a build whose process died reads `processing` until 2 × `executionTimeout` passes (default 10 min, so 20 min). After that it reads `failure: the build has not completed` ([pa] L171, L408-417, L556-573).
  - Pre-aggregations are not dropped because of the gap. The first drop waits until the worker "is able to check freshness for every `scheduledRefresh: true` pre-aggregation" ([d-env] L1230-1239).
  - API instances keep serving the latest built version. They do not build, because `externalRefresh = !isPreAggsBuilder()` ([opts] L518-524, L627-630; [pal] L171-185).
  - Spike: rollups built by the worker were served by both API instances, with no reads of the source ([spk-t6]).

### 3. Cube Store single-node as queue and cache

**What survives a restart.**
- "The cache and queue store lives on the router node and is backed by its own RocksDB instance … the disk backing means the cache and any in-flight queue state survive a router restart" ([d-csarch] L829-832). The same page repeats it: "in-flight queue state survives restarts" (L1052-1053).
- The chart persists the whole data dir: a PVC at `/cube/.cubestore/data` with `CUBESTORE_DATA_DIR` set to it (`cubestore.yaml:55-57, 89-108`).
- Without that volume, everything is lost: metastore, cachestore and Parquet (`kubernetes.md` Gotcha 5).

**How Cube instances behave meanwhile** (derived from the driver source):
- **Connection retries.** In-flight Cube Store messages are re-sent on a new connection after reconnect ([wsc] L269-377). Connect retries back off linearly, `1000 × (try+1)` ms, up to `CUBEJS_CUBESTORE_MAX_CONNECT_RETRIES` (default 20) ([wsc] L239-257, L414-416; [env] L1933-1935). That is roughly 209 s before the driver gives up.
- **Every data query needs the queue**, so `/v1/load` requests block or fail during the outage. An outage past 60 s hits nginx's `proxy_read_timeout` default of 60 s (`docs/research/nginx.md`).
- **Heartbeat failures are logged but not fatal** ([qq] L911-921). If the outage lasts longer than 4 × `heartBeatInterval`, live Active items look stalled when Cube Store returns. They are cancelled and run again, and the late ack becomes "Orphaned execution result" ([qq] L1056-1089).
- **`/livez` goes DOWN on every instance** ([gw] L3065-3078).

**Shutdown and the single point of failure.**
- Cube Store ignores SIGTERM as PID 1. The chart's `preStop: kill -INT 1` covers that (`cubestore.yaml:81-86`; `kubernetes.md` Gotcha 3).
- Core has no replication: "any node failure" is an outage (`configuration-deployment.md` §8). Only one replica is allowed (`kubernetes.md` Gotcha 8).

## wechart API

### 4. In-memory state that 2 replicas would break, and what replaces it

`@wechart/api` has no pg-boss dependency. Its dependencies are `@fastify/cookie`, `@fastify/session`, `close-with-grace`, `fastify`, `kysely`, `node-pg-migrate`, `openid-client`, `pg` and `yaml` (`packages/api/package.json:22-33`). pg-boss 12.33.2 is researched in `docs/research/scheduler.md` but not installed.

| # | State | File:lines | Breaks with 2 replicas? | Replacement (options; choice open) |
|---|---|---|---|---|
| 1 | **Publish drafts** `Map<id,{files,read}>`, read back by Cube through `/api/cube-model/drafts/:id` | `packages/api/src/model/publish.ts:143-177, 230-266, 318-320` | **Yes.** Cube's callback goes through the API Service and can reach the other replica. That gives a 404, then `held.read` stays false, then `502 "Cube answered without reading the change"` (L233-237, L266). The chart pins `replicas: 1` + `Recreate` for this (`api.yaml:26-32`). | **AD 1:** no drafts in API memory and no callbacks. xcube compiles publishes and overlays. There is no interim replacement in this repo. |
| 2 | **Model callbacks on every Cube request** (`schemaVersion` → `/api/cube-model/version`, `repositoryFactory` → `/files`) | `/Users/srajagopal/Work/wechart/infra/cube/cube.js:38-45, 86-104`; `publish.ts:159-169` | The routes read Postgres, so either replica answers (comment at L166-167). But **Cube's query path now depends on API availability.** A callback that hits a closing replica gets Fastify's 503 ([fst] return503OnClosing), and `fromStore` then throws (cube.js L42-43), failing that Cube request (derived). | **AD 1:** "Cube never calls wechart at runtime". |
| 3 | **`MetaCache`** (one entry, 60 s bound) and **`MetaCachesByGroups`** (up to 256 group sets) | `packages/api/src/cube/meta-cache.ts:16, 30-85, 88-123`; `server.ts:248, 260-264, 325-336` | **Stale, not broken.** `invalidate()` runs only on the replica that took the publish. The other serves the old model for up to 60 s. AC-009's 60 s bound still holds (`spec.md:89-90`). **AC-137 does not:** its Fails-when is "a published member is missing … while Cube reports the new schema version" (`spec.md:472-473`). | (a) Postgres `NOTIFY` on publish plus `LISTEN` on a dedicated `pg` client in each replica. NOTIFY is delivered only to sessions already listening, and only after commit ([pg-notify]). So add a periodic resync, as the spike's config does ([spk-conf] L29-37, L82). (b) Key the cache on the published model version, read per request (under AD 1, xcube's version). This needs no delivery guarantee. (c) Drop the cache and ask Cube each time. |
| 4 | **Introspection "Continue wait" loop** | `packages/api/src/model/introspection.ts:31, 69-111` | No cross-request state: it is scoped to one request. But one request can stay open for up to 30 × (Cube's wait + 1 s). A replica stop cuts it, and nginx's `proxy_read_timeout` (60 s default) can cut it first (`docs/research/nginx.md` L219, L376). | The web app retries the GET. The loop restarts on any replica. |
| 5 | **Build-token following** | `packages/api/src/jobs/build.ts:127-168`; browser: `packages/web/src/workspaces/jobs/BuildPanel.tsx:57-70` | **No.** The browser holds the tokens. Job records live in Cube Store's cache as `PRE_AGG_JOB_<token>` for 86400 s ([rs] L832-837, L845-857), so any Cube instance answers. | None needed. AC-150's future "record builds while no browser has Jobs open" needs a server-side follower. With 2 replicas that must be a singleton: pg-boss `singleton` queue policy and DB-coordinated cron (`docs/research/scheduler.md` L66, L80-84), or an advisory lock. Upserts must be idempotent. |
| 6 | **Migrations at start** | `packages/api/src/main.ts:25`; `packages/api/src/db/migrate.ts:34-42` | **Yes, at start.** node-pg-migrate 9.0.0 defaults to `advisoryLockMode: 'fail'`. A second replica starting at the same time throws "Another migration is already running…" ([npm-runner] `lock()`), `main()` rejects, and the pod restarts (derived). | `advisoryLockMode: 'wait'` ([npm-runner]), or a separate migration step before the API starts, as `db-access.md` already intends (`migrate.ts:28-33`). On a rolling upgrade, migrations must also work with the old replica still running (derived). |
| 7 | **Dev seed** `WECHART_SEED=1`; `WECHART_RESET_DATA=1` | `packages/api/src/seed.ts:18-39`; `main.ts:28` | The seed is check-then-insert with fixed ids, so two replicas can race to a PK conflict. `WECHART_RESET_DATA=1` **deletes all documents, the query log and model files on every replica start**. | Never set `RESET_DATA` with replicas. The chart sets only `WECHART_SEED` (`api.yaml:103-107`). |
| 8 | OIDC discovery cache `pending` | `packages/api/src/auth/oidc.ts:11-24` | No. It is re-derivable per replica. | None. |
| 9 | Session sweeper `setInterval` | `main.ts:55-63`; `session-store.ts:19-25` | No. It is an idempotent `DELETE … expires_at <= now()`. | None. |
| 10 | Model-file seed at start | `main.ts:35-36`; `packages/api/src/repos/model-files.ts:24-31` | No. It uses `ON CONFLICT DO NOTHING`. | None. |
| 11 | DB pool, `max: 10` per process | `packages/api/src/db/client.ts:22` | No. 2 replicas means 20 connections to the metadata DB. | None. |
| 12 | Route-access registry `WeakMap` | `packages/api/src/auth/guard.ts:43` | No. It is static and built per app. | None. |
| Future | **JWKS push to xcube on start and rotation (AD 12)**; **overlay push (AD 8)** | not built | Both replicas push at start. The key pair must come from a shared Secret. xcube must store keys and overlays where **every Cube instance** sees them, not only the instance that received the push (derived). | Belongs to the xcube research. See Open questions. |

**Sessions: no per-replica secret found.**
- Sessions are `@fastify/session` 11.1.3 rows in Postgres (`packages/api/src/auth/session-store.ts:17-66`; plugin registered at `packages/api/src/auth/routes.ts:160-169`).
- The cookie is signed with `WECHART_SESSION_SECRET` (`packages/api/src/config.ts:187-190`). The chart generates that once, keeps it across upgrades through `lookup` (`deploy/helm/wechart/templates/secrets.yaml:11-22, 37`), and injects it into the API Deployment through `secretKeyRef` (`api.yaml:117-121`), so every replica has the same value.
- A cookie whose signature fails verification is treated as a **new empty session**. With per-replica secrets the user would look signed out and get 401s (`node_modules/.pnpm/@fastify+session@11.1.3/…/index.js:39-54`).
- A store error other than `ENOENT` fails the request instead of creating a new session (same file, L56-70).
- The sign-in attempt (`oidcTx`: PKCE verifier, nonce, return address) lives in the session row, so `/api/auth/callback` can land on the other replica (`routes.ts:189-198, 213-220`).
- `packages/api/src/**` generates no secret or key at startup. `randomBytes` appears only as a per-seal IV (`packages/api/src/secrets/crypto.ts:63`).

**Sticky sessions are not wanted, and nothing needs them once #1 and #2 are gone.**
- Service `sessionAffinity` defaults to `None` ([k8s-svc-spec]). The chart sets none (`api.yaml:1-15`).
- nginx proxies to the API's ClusterIP (`web-config.yaml:70-80`).

**Shutdown of an API replica.**
- tini forwards SIGTERM to Node (`deploy/Dockerfile:36-48`). `close-with-grace` calls `app.close()` with `delay: 5000` (`main.ts:65-69`). The delay is "the numbers of milliseconds before abruptly close the process" ([cwg]).
- Fastify's `close()`:
  - marks the server closing, so new requests get `503` with `Connection: close` (`return503OnClosing` defaults to true)
  - closes idle keep-alive sockets (`forceCloseConnections` defaults to `"idle"`)
  - "waits for all in-flight requests to complete" ([fst])
- A `/api/load` waiting on Cube can take up to `continueWaitTimeout` (10 s), which exceeds the 5 s delay, so it is cut (derived).

### 5. Web-app retries for AC-319

**What retries today.** Only Cube's `Continue wait`:
- `loadTile` re-issues `/api/load` with the same `x-request-id` every 500 ms, for up to 240 polls (`loadTile.ts:18-20, 93-142`).
- A rejected fetch becomes `TileLoadError("Could not reach the server…")` with no retry (L110-123).
- A non-OK response becomes `TileLoadError` with no retry (L125-129).
- TanStack Query retry is off everywhere (`main.tsx:16-25`; `useTileData.ts:26-33`). The library default would be 3 retries, `Math.min(1000·2^n, 30000)` ms apart (`@tanstack/query-core@5.103.1/src/retryer.ts:49-51, 196-205`).

**What the web app sees during a stop** (derived from the cited behaviours):

| Event | Browser gets |
|---|---|
| Cube instance dies while wechart's request is on it | API: undici `fetch failed`, which is not a `CubeError`, so `500 {"error":"Internal error"}` (`server.ts:1457-1480`). The spike saw `UND_ERR_SOCKET` ([spk-t3-def]). |
| Cube instance shutting down gracefully | Cube `503`, which the API passes through as `503 {error, source:"cube"}` (`server.ts:1457-1462`; [gm]). |
| API replica closing | Fastify `503` + `Connection: close` ([fst]). |
| API replica gone mid-request | nginx 502 (nginx trac #2212, a ticket, not docs: [ngx-2212]). nginx won't retry: the Service is one address, and non-idempotent methods "are not passed to the next server if a request has been sent" ([ngx-proxy]). |
| Page load while the gating subrequest fails | `auth_request`: "Any other response code returned by the subrequest is considered an error" ([ngx-auth]). The page errors but does **not** ask for sign-in (`web-config.yaml:42-57`). |
| The polls after that | `Continue wait` until the stalled item is cancelled, then data (Cube §1). |

**Which requests are idempotent.**
- RFC 9110: PUT, DELETE and the safe methods are idempotent. POST is not. "A client SHOULD NOT automatically retry a request with a non-idempotent method unless it has some means of knowing that the request semantics are actually idempotent" ([rfc9110]).
- **Safe to retry automatically (read-only):**
  - All the `GET /api/*` routes wechart serves (`server.ts` routes).
  - `POST /api/load`. Cube dedupes by query key ([d-csarch] L890-905). Each attempt writes one query-log row (`server.ts:426-441`).
  - `POST /api/sql`, `/api/acceleration`, `/api/builds/status`, `/api/jobs/queries/find` and `/api/model/references`.
  - `POST /api/introspection/sources/:s/{columns,scaffold}`, which read the catalog and return YAML without writing (`introspection.ts:145-164`).
- **Not safe to replay blindly:**
  - `POST /api/documents` mints a new id per call (`server.ts:766-773`), so a replay duplicates.
  - `POST …/images` and `…/bookmarks` create a new row each time (`server.ts:1290-1292`; `packages/api/src/repos/bookmarks.ts:77`).
  - `PUT /api/documents/:kind/:id` and `PUT /api/dashboards/:id` are version-checked. A replay after a committed but unacknowledged write gets a false 409 (`server.ts:906-918, 1120-1124`).
  - `POST /api/builds` starts new Cube jobs.
  - `DELETE` replays answer 404 after success (`server.ts:1237-1240`).
- **The minimum AC-319 needs:**
  - Retry the idempotent requests above on network error, 502, 503 and 504, and on the API's Cube-transport 500. That last one is better re-labelled by the API as 502 or 503, because a plain 500 cannot be told apart from a bug.
  - The retry budget must cover 4 × `heartBeatInterval` + `continueWaitTimeout` + nginx and endpoint propagation. That is about 130 s with defaults ([spk-t3-def]).
  - There is no central fetch wrapper today. About 30 direct `fetch('/api/…')` call sites exist in `packages/web/src`, and `AuthGate` already wraps `window.fetch` (`packages/web/src/shell/AuthGate.tsx:56-77`).

## Helm

### 6. Replicas, PDB, anti-affinity, and the stop-one test

**Current chart.** Everything runs at one replica:
- `api`: `replicas: 1` with `Recreate` (`api.yaml:30-32`)
- `cube` and `cube-refresh-worker`: one Deployment each, `replicas: 1` (`cube.yaml:26-34`)
- `web`: `web.yaml:28`
- `meta` and `cubestore`: StatefulSets (`meta.yaml:29`, `cubestore.yaml:33`)

There is no PDB, no affinity, no `terminationGracePeriodSeconds`, no preStop on api or cube, and no `CUBEJS_GRACEFUL_SHUTDOWN`.

**Changes this research supports.** Values and numbers are the user's to choose.
- **`api.replicas` ≥ 2 with RollingUpdate,** once #1 and #2 above are gone (AD 1). With 2 replicas, the default maxSurge rounds to 1 and maxUnavailable to 0 ([k8s-deploy]). `Recreate` "kill[s] all existing Pods before new ones are created" ([k8s-deploy]), which is an outage.
- **`cube.replicas` ≥ 2** as a separate Deployment from the worker. Add `CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore` explicitly (§1).
- **Refresh worker fixed at 1,** as a StatefulSet for at-most-one, or accept the overlap on rollout (§2).
- **Graceful shutdown timings.** Set `CUBEJS_GRACEFUL_SHUTDOWN` above `continueWaitTimeout` so long-polls drain. The process is killed at N+1 s ([srv] L222-234). Set Cube's `terminationGracePeriodSeconds` above preStop + N + 1, which must stay below the default grace of 30 s or be raised ([k8s-lifecycle]).
  - For the API, raise the close-with-grace `delay` above `continueWaitTimeout`, with `terminationGracePeriodSeconds` above it (derived from [cwg] and [fst]).
  - Add a `preStop` sleep on both, so endpoint removal lands before SIGTERM ([k8s-lifecycle]; [k8s-sleep]).
- **PodDisruptionBudget** (`policy/v1`) for `api` and `cube` with `minAvailable: 1` or `maxUnavailable: 1`.
  - It guards evictions such as `kubectl drain`, but "deleting deployments or pods bypasses Pod Disruption Budgets" ([k8s-pdb]). So it does not affect the stop-one test's `kubectl delete pod`.
  - The docs recommend `unhealthyPodEvictionPolicy: AlwaysAllow` ([k8s-pdb]).
  - Render it only when replicas ≥ 2: with 1 replica and `minAvailable: 1`, no eviction is ever allowed (derived).
- **Anti-affinity.** Use `preferredDuringSchedulingIgnoredDuringExecution` on `kubernetes.io/hostname`, or `topologySpreadConstraints` with `whenUnsatisfiable: ScheduleAnyway`.
  - Docker Desktop's kubeadm provisioner is a **single node** (`docs/research/helm.md` §4). A *required* rule leaves the second replica unscheduled: "the pod will not be scheduled onto the node" ([k8s-affinity]).
  - A *preferred* rule "may choose a node that violates" it ([k8s-affinity]). `ScheduleAnyway` "schedule[s] the pod even if constraints are not satisfied" ([k8s-affinity], TopologySpreadConstraint).
  - The stop-one test therefore covers process loss, not node loss.
- **Per-instance addressing for AC-156 and AC-161.**
  - Through the ClusterIP Service, `/api/cube-health` probes whichever ready instance kube-proxy picks (`packages/api/src/cube/health.ts:33-53`; `server.ts:217-225`).
  - A headless Service resolves "directly to the set of IP addresses for all Pods selected by the Service" ([k8s-svc]). `publishNotReadyAddresses` includes not-ready ones ([k8s-svc-spec]). That lets the API probe, and later ask xcube, each instance.

**The stop-one test in `deploy/helm/verify.sh`.**
- Today's step 2 already accepts `readyReplicas == replicas ≥ 1` (`verify.sh:102-114`).
- **Step 5 publishes through `/api/model/publish`** (`verify.sh:268-322`). With 2 API replicas that goes through the draft callback (#1) and fails intermittently until AD 1 lands.

A new step, with sign-in on (`EXTRA_VALUES=…docker-desktop-security.yaml`):
1. Sign in with the existing `sign_in` helper (`verify.sh:143-158`). Record `/api/me`.
2. Make a query that runs longer than the stop takes. For example, a probe cube whose `sql` calls `pg_sleep(n)`, published before replicas are scaled up, or by xcube after AD 1.
3. Start it through `/api/load` the way `loadTile` does: one `x-request-id`, re-post on `Continue wait`.
4. Find the Cube pod **executing** it:
   - Cube's production logger prints `Performing query` only at `CUBEJS_LOG_LEVEL=trace` ([logger] `logger.ts:111-166`; the event is at [qq] L884-896).
   - Or map `pg_stat_activity.client_addr` to a pod IP. UNVERIFIED on northwind's role.
5. `kubectl delete pod` that Cube pod and one API pod.
6. Keep polling with retry on network error, 502, 503 and 504, within a budget of at least 4 × `heartBeatInterval` + `continueWaitTimeout` plus margin.
7. **Assert:**
   - every `/api/me` answered 200 for the same user, never 401
   - the query returned data
   - both Deployments return to `readyReplicas == replicas`
   - the PDBs exist with `ALLOWED DISRUPTIONS` ≥ 1
8. A second pass stops the non-executing Cube pod. Expect the answer without the stall delay ([spk-t1-then2]).

## Gotchas

1. **An Active item on a dead instance blocks its concurrency slot** for 4 × `heartBeatInterval` (120 s by default). The cap is cluster-wide per queue, so other queries on that data source queue behind it ([qq] L609-616; [d-csarch] L939-952; [crs] L696-707).
2. **The query runs twice after a stall** (the spike's Postgres counts: [spk-t3-def]). The cancel handler kills the dead node's warehouse query ([d-csarch] L990-993). Size the warehouse and its pool for that.
3. **`/readyz` does not wait for the model to compile** (`kubernetes.md` §Summary 1). At 3,000 cubes the first query paid ~7.4 s in the spike ([spk-a-200x15]). A rolling upgrade sends traffic to cold instances.
4. **Don't use `/livez` for liveness on the Cube tier.** One Cube Store outage takes every instance's `/livez` DOWN together ([gw] L3065-3078). The chart is right as it stands (`cube.yaml:70-89`).
5. **Without `CUBEJS_GRACEFUL_SHUTDOWN`, SIGTERM exits at once** ([container] L402-404). The variable is undocumented ([env] L305-306; no match in docs-mintlify).
6. **Fastify drains, but close-with-grace exits at 5 s** (`main.ts:65`; [cwg]), which is shorter than a Cube long-poll.
7. **`CubeClient.#request` has no timeout** (`packages/api/src/cube/client.ts:245-271`). undici's default `headersTimeout` is 300 s ([undici-client], main docs, not pinned to Node 26's bundled undici). A Cube instance that stops answering without closing the socket holds the API request that long (derived).
8. **Deleting a pod ignores PDBs** ([k8s-pdb]). A Deployment replaces a deleted pod at once, even under `Recreate` ([k8s-deploy]).
9. **node-pg-migrate's lock fails fast by default** ([npm-runner]). Two replicas starting together can crash-loop once.
10. **`WECHART_RESET_DATA=1` wipes the metadata DB on every replica start** (`seed.ts:24-30`).
11. **The metadata Postgres, nginx (`web`) and Cube Store are single replicas** (`meta.yaml:29`, `web.yaml:28`, `cubestore.yaml:33`). AD 11 names only Cube and the API. The session store, page serving and the queue are all single points of failure outside the test.

## Open questions / unverified

- **Overlays and JWKS under 2+ Cube instances (AD 8, AD 12).** Both are pushed to "xcube". With ≥2 instances, each instance must be able to resolve an overlay or key pushed through any one of them, or the push must reach every instance. Pushing through the ClusterIP reaches only one. This is for the xcube research. Note that AC-319's Fails-when includes "work begun through one replica (a workspace edit, a proposal) can't be carried on through the other" (`spec.md:1128`).
- **UNVERIFIED: what `core.shutdown()` → `orchestratorStorage.releaseConnections()` ([core] L994-1008) does to a query this instance is still executing during graceful shutdown.** It could wait, fail it (acking an error result to every waiter), or be cut by the N+1 s kill. Test it on docker-desktop.
- **UNVERIFIED: queue payload compatibility between two Cube versions** sharing one Cube Store queue during a rolling upgrade.
- **UNVERIFIED: whether nginx 1.30.5 keeps upstream keep-alive for a bare `proxy_pass`** (`docs/research/nginx.md` L346-347, L382). That decides whether an API pod's death breaks pooled nginx connections (one 502 each).
- **For the user:**
  - Whether to lower `heartBeatInterval` against Cube's "strongly recommend" defaults ([d-config] L567-572). It trades recovery time (spike: 127.6 s → 29.0 s) against false stalls.
  - Which mutations, if any, get idempotency keys or auto-retry. RFC 9110 permits auto-retry of POST only when its semantics are known to be idempotent.
  - How AC-156 reads with several instances: all healthy, or any healthy.
  - Whether the refresh worker becomes a StatefulSet (strict at-most-one) or stays a Deployment that briefly overlaps.
- **AC-161's "every running Cube instance uses the new settings"** needs a per-instance report of the applied connection settings. No Cube Core route provides one (`configuration-deployment.md` §5). It would be an xcube route (AD 1, R15) plus the headless-Service enumeration above.
- **Spike provenance.** The spike is on the fork's local branch `spike/xcube-feasibility` (commit `db087e0`, "spike(xcube): feasibility spikes for the flat model, connection swaps and HA"). Only `feat/xcube` was checked against upstream on GitHub ([cmp]). I did not verify that `db087e0` itself touches no Cube package, but the cited Cube functions match the v1.7.45 tag.

[qq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[qo]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[qc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[pa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[csqd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/CubeStoreQueueDriver.ts
[wsc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/WebSocketConnection.ts
[core]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[rs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[logger]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts
[gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[srv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
[gm]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/graceful-middleware.ts
[gh]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/gracefull-http.ts
[container]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/container.ts
[env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[proc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/process.ts
[crs]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/cachestore/cache_rocksstore.rs
[qi]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/cachestore/queue_item.rs
[d-csarch]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx
[d-arch]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/architecture.mdx
[d-deploy]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/deployment.mdx
[d-config]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[d-env]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
[d-mt]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
[cmp]: https://api.github.com/repos/cube-js/cube/compare/v1.7.45...senthilkrajagopal:feat/xcube
[spk-conf]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/conf/cube.js
[spk-t3-script]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/scripts/t3-kill.mjs
[spk-t3-def]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t3-kill-defaults.txt
[spk-t3-hb5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t3-kill-heartbeat5.txt
[spk-t1-then2]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t1-cubestore-then-api2.txt
[spk-t1b-cs]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t1b-cubestore.txt
[spk-t1b-mem]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t1b-memory.txt
[spk-t5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version.txt
[spk-t5w]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version-with-worker.txt
[spk-t6]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t6-preagg.txt
[spk-a-200x15]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x15.json
[k8s-lifecycle]: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
[k8s-ep-term]: https://kubernetes.io/docs/tutorials/services/pods-and-endpoint-termination-flow/
[k8s-deploy]: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
[k8s-pdb]: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
[k8s-affinity]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
[k8s-svc]: https://kubernetes.io/docs/concepts/services-networking/service/
[k8s-svc-spec]: https://kubernetes.io/docs/reference/kubernetes-api/service-resources/service-v1/
[k8s-sts-force]: https://kubernetes.io/docs/tasks/run-application/force-delete-stateful-set-pod/
[k8s-sleep]: https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/
[fst]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Server.md
[cwg]: https://github.com/mcollina/close-with-grace/blob/v2.5.0/README.md
[npm-runner]: https://github.com/salsita/node-pg-migrate/blob/v9.0.0/src/runner.ts
[ngx-proxy]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream
[ngx-auth]: https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
[ngx-2212]: https://trac.nginx.org/nginx/ticket/2212
[rfc9110]: https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2
[pg-notify]: https://www.postgresql.org/docs/18/sql-notify.html
[undici-client]: https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md
