---
library: xcube's Jobs and Schedules admin routes (the user's Cube fork) — the build queue and cancel, hidden cubes on the admin meta, the refresh worker's status
packages: []
# Nothing is imported: wechart's server calls xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 84aaad4a9f; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-84aaad4a9f@sha256:2daac956da60e66cd572da7ddfe36647f0c1cf3a74dafba9e094930752e268cd (and every later image, 89628a0e88 included)'
researched: 2026-10-01
---

# xcube's Jobs and Schedules routes (R41; T376, T377, AC-151, AC-154, AC-156)

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-09-28-1300-jobs-schedules-routes.md`, to `to-xcube/2026-09-28-1200-jobs-schedules-routes.md`;
- xcube at 84aaad4a9f:
  - `src/gateway.ts`: `ownQueue`, `ownCancel`, `recordJobTokens`, `allMembersOf`;
  - `src/admin/routes.ts`;
  - `src/server.ts`: `runScheduledRefresh`;
  - `src/runtime/runtime.ts`: `noteRefreshRun`, `refreshWorkers`;
  - `src/store/ops.ts`;
  - `src/store/migrations.ts`: migration 10, additive, two tables;
  - the README's "Admin API";
  - `test/integration/ops.test.ts`.
- wechart's input `docs/inputs/2026-09-28-jobs-schedules-analysis.md`.

Not yet checked against compose's running xcube: the routes come with compose's pin of `89628a0e88` (T532). The task that first uses each route checks it there.

**All three routes are admin routes:** the service credential for its model, or an admin token. A user's token gets `401`. None filters by folder, so wechart scopes them by `meta.xcube.folderId` (AC-297) [answer, intro].

## 1. The build queue (AC-151)

### `GET …/models/{model}/pre-aggregations/queue`

The model's builds queued or running in its served epoch, oldest first [answer §1]:

```json
{ "model": "dev", "queue": [{ "key", "dataSource", "preAggregation": "fsales__orders.main", "table", "targetTable",
  "partition": null | { "start", "end" }, "status": "queued" | "processing", "stalled": false, "addedAt",
  "requestId", "startedBy": "scheduler" | "jobs" | "query", "job": null | "<jobs token>" }] }
```

- **Covers** every data source the model is served over, and only this model's entries; a model without connections is picked by its rollup schema.
- **`preAggregation`** is the published name. **`partition`** comes from Cube's own build range.
- **`stalled: true`** means Cube found it stalled or orphaned; it goes at the queue's next reconcile.
- **`job`** is the jobs request's token, recorded by xcube from Cube's job records. It is `null` for the refresh worker's builds. An `x-request-id` sent on the jobs `post` shows as `requestId`.
- **With Cube Store as the queue** (compose and Helm), it lists every instance's builds.

### `POST …/models/{model}/pre-aggregations/queue/cancel`

`{ "keys": [...], "processing": false }` → `{ "cancelled": [{ key, preAggregation, status }], "notCancelled": [{ key, reason }] }` [answer §1].
- **A queued entry** is taken out of the queue.
- **A processing entry** is refused with `reason: "processing"`, unless `"processing": true`. Then the instance stops it at the queue's next heartbeat (8 s).
- **A key not in this model's queue** answers `reason: "gone"`.
- **A cancelled refresh-worker build comes back,** under the same key, at the worker's next run (every 30 s), while its refresh key hasn't turned over (`ops.test.ts`; `RefreshScheduler.ts` L614-680). **A jobs build doesn't:** a job is one-shot.
- **A sticking cancel is possible but not built.** xcube could hold the cancelled key until the refresh key turns over, and the worker would back that rollup off (1 s doubling to 10 min). The alternative needs nothing from xcube: cancel only builds wechart started, and show the worker's read-only. **This is a user decision** (backlog §6).

## 2. Hidden cubes on the admin meta (AC-154)

`GET …/meta?hidden=true` (with or without `extended=true`) lists every cube and member, `public: false` ones included, each marked `"public": true | false` [answer §2].
- A cube set `public: false` marks all its members not public.
- Without `hidden=true`, the meta is as before. Schedules asks `?extended=true&hidden=true`.

## 3. The refresh worker's status (AC-156)

`GET …/models/{model}/refresh-worker` [answer §3]:

```json
{ "model": "dev", "revision": 12, "workers": [{ "instance", "revision", "servedKey", "lastTickAt",
  "modules": [{ "module", "revision", "lastTickAt", "finished", "lastOkAt", "lastError": null | { "message", "at" } }] }] }
```

- **Revisions:** the top-level `revision` is the model's current one; each worker's is the one it last refreshed.
- **`finished`:** the run ended, rather than stopped waiting on builds still running.
- **Recovery:** a module recovered if `lastOkAt` is later than `lastError.at`. `lastError` is Cube's "Refresh Scheduler Error": a compile, or a refresh key's query.
- **`module`** is `all` for a model served whole.
- **A rollup's failed build isn't a failed run.** Cube backs it off and carries on. Build failures belong to the deferred build history (R41).
- **Workers:** a stopped worker stays listed for a day. Each restart is another `instance`. A model no worker has refreshed has no workers.
- **Recording:** in `XcubeServerCore.runScheduledRefresh`, written within 5 s.

## Gotchas

1. **Cube's `/cubejs-system` queue routes read only the `default` data source.** Use xcube's, which reads every one the model is served over [answer, note].
2. **A new model's first builds can race to create its rollup schema** ("duplicate key … pg_namespace_nspname_index"). Built again, they pass. This is Cube's own behaviour [answer, note].
3. **Send your own `x-request-id` on a jobs `post`** to find its queue entries by `requestId`, besides `job`.
4. **The refresh worker's build history is deferred (R41).** Nothing here says a worker build failed or how long it took.
