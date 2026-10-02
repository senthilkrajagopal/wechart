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

**Checked 2026-10-02 (T376), against compose's running xcube** (then `v1.7.45-6d9673ccda`, a later image than the pin), model `e2e`, with the service credential:
- `GET …/pre-aggregations/queue` answered `{ "model": "e2e", "queue": [] }`, and, right after a jobs post with `x-request-id: wechart-probe-t376`, one entry `{ key, dataSource: "default", preAggregation: "monthly_orders.by_status_month", table, targetTable, partition: { start: "2026-01-01T00:00:00.000", end: "2026-08-29T00:00:00.000" }, status: "processing", stalled: false, addedAt: "2026-10-02T09:54:26.066Z", requestId: "wechart-probe-t376", startedBy: "jobs", job: "<the post's token>" }`, as §1 has it.
- `POST …/queue/cancel` with a key no longer queued answered `200 { "model": "e2e", "cancelled": [], "notCancelled": [{ key, reason: "gone" }] }`.
- `GET …/refresh-worker` answered §3's shape, a stopped instance at an older revision still listed.
- **An inference wechart acts on (T376's review):** once an entry is taken out of the queue, Cube's jobs `get` works the job's status out afresh: no table and no build record read `missing_partition` (`cube/job-records.md`, "Status values"). So a follower can end a cancelled job as `missing_partition` before wechart records the cancel; wechart lets the cancel win over such an end seen after it was asked.

**Checked 2026-10-02 (T550), against the same xcube**, model `e2e`, with the service credential:
- `POST …/pre-aggregations/partitions` with three ids in `preAggregations` answered one item for each id the model has, and none for an id it doesn't, in one `200`. So Jobs' list asks for every rollup in one request (`xcube-slice-6.md` says the route takes Cube's partitions query; Cube's query takes a list). A missing item can't be told from one Gotcha 11 dropped, so it is asked for once more, and then read as "still being worked out", never as not built.
- A jobs `get` answered `table: "prod_pre_aggregations_e2e_6d8749c4fe00.monthly_orders_by_status_month20260101_nd4keglk_inzfhwft_1lbv9ov"`, and Cube's log gave that build's `newVersionEntry.last_updated_at` as `1790945055652`. Its last part, `1lbv9ov`, read as base-32 seconds is `1790945055`. That is that version's `last_updated_at` to the second, as `cube/system-partitions.md` ("Build state and versions") says Cube names versions. The partitions route lists each version's `last_updated_at` in whole seconds (`1790946091000`, `1790942830000`, …), as it reads them back from the table names. wechart finds the build that made a version this way: the job whose table starts with the partition's name and whose last part, in base-32 seconds, is that version's time.
- **Two builds of one partition in the same second collide.** Cube's log showed `Unique constraint violation` from Cube Store creating the second's table. Both builds had the same name, which has one-second resolution (`cube/job-records.md`, "Queue de-duplication…"). The job then read `failure: …`. Two e2e tests building the seed rollup at once hit this, so each e2e test that builds for real now builds a rollup of its own.

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
