---
library: xcube's Cube Store SQL run its router runs, followed to its real end (the user's Cube fork)
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under xcube's service credential.
version: 'xcube feat/xcube 46ca0ce708; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-46ca0ce708@sha256:340f97c193e0bf3f745301f62bfe84764ded70e93a80aed87e160d68d0287382 (amd64, arm64)'
researched: 2026-10-04
---

# xcube 46ca0ce708: a stopped query Cube Store's router runs, followed to its end (T549)

An addition beside [`xcube-2099b13f2d.md`](./xcube-2099b13f2d.md), whose "Correction" it answers, and [`xcube-sql-runner.md`](./xcube-sql-runner.md).

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-04-2100-cube-store-work-past-timeout.md`, to wechart's `~/Work/xcube-exchange/to-xcube/2026-10-04-1300-cube-store-work-past-timeout.md`;
- the fork's two commits after `2099b13f2d` (`git log 2099b13f2d..46ca0ce708`): `4f8e68715e` and `46ca0ce708`, a fix to the image test only. Read there: `xcube/src/sql/runner.ts` (`endsAtCubeStoreTimeout`, which reads the plan of `EXPLAIN`), `src/sql/runs.ts` (the stop's wording, `RUN_ON_MAX_MS`, the note kept while followed) and `src/admin/routes.ts:742` (`stillRunning`, `endsBy … ?? null`);
- compose's running image, probed by T549 (below).

## What Cube Store's timeout ends

[answer, question 1; Cube Store 1.7.45's `sql/mod.rs`, `cluster/worker_pool.rs`, `queryplanner/query_executor.rs`]

| The query | Where it runs | At Cube Store's timeout |
|---|---|---|
| Over Cube Store's tables, its work under `ClusterSend` | A select worker | Ended: the worker's process is killed |
| Over `VALUES` alone, or any plan without `ClusterSend` | The router, Cube Store's own process | Not ended: it runs to its end, then answers |
| Over `information_schema` or system tables | The router, as a catalog query | Not ended: no timeout at all |
| A join above `ClusterSend` | The router, for the join's part | Not ended |

- **Nothing in Cube Store 1.7.45 stops the router's work:** no setting, no per-connection or per-query kill, and no pool to restart. Only restarting Cube Store stops it [answer, question 3].
- **Lowering `CUBESTORE_QUERY_TIMEOUT` doesn't help:** it doesn't reach the router's work [answer].

## What xcube does now

[answer, questions 3 and 4; `runner.ts`, `runs.ts`, `routes.ts`]

- **xcube explains each Cube Store SELECT before running it.** Only a plan whose joins all sit under a `ClusterSend` counts as bounded by the timeout; anything else is the router's.
- **A stopped run of the router's** answers `422`, `code` `timeout` or `cancelled`, with `stillRunning: true` and **`endsBy: null`**. The error ends "…runs this one, which its router runs, to its end: nothing bounds it".
- **It stays `stopping` until Cube Store answers it,** however long; xcube follows it for up to 24 hours (`RUN_ON_MAX_MS`). `GET …/sql/runs/{runId}` then answers `stopping` with no `endsBy`.
- **A stopped run on select workers** keeps its `endsBy`, the run's start plus `XCUBE_CUBESTORE_QUERY_TIMEOUT`, and is `stopping` until Cube Store answers or 5 s past `endsBy`, as on `2099b13f2d`.
- **`ended` means Cube Store answered the query.** A select worker answers once its process is killed; the router answers only once its work is done.
- **If its instance stops,** the run's note in xcube's database, kept every minute while it is followed, lapses within minutes. The run then reads `ended`, though nothing then knows whether Cube Store has finished it.
- **One caution, in theory, from xcube:** a router query whose top waits on partitions that never yield could let the timeout answer while they compute on, so `ended` would come early. xcube didn't see it.
- **No migration:** the latest is still 13.

## Checked against compose's running image (T549, 2026-10-04)

compose's `wechart-cube` and `wechart-cube-refresh-worker` run the image, recreated under the e2e lock from the main checkout's `docker-compose.yml` and project directory with only `CUBE_IMAGE` set. Each container's `com.docker.compose.config-hash` equals `docker compose config --hash` for it, and both came up healthy. Its `revision` label is `46ca0ce708321883d0a7944df7d729961bdf6a18`.

Probed under the service credential, model `e2e-security`, with T548's scratch probe, which isn't kept:
- **A router query stopped at a 3 s cap,** started 21:17:21Z: a computed sum over a 7-way cross join of a 15-row `VALUES` (15^7 rows).
  - It answered at 5.1 s: `422 timeout`, `stillRunning: true`, `endsBy: null`, and the error "…runs this one, which its router runs, to its end: nothing bounds it".
  - The same `runId` again: `409 run_in_progress`.
  - Its state, every 2 s: `stopping`, with no `endsBy`, until 19.2 s; `ended` at 21.2 s.
  - Cube Store's CPU was idle after.
- **A stopped run on select workers wasn't probed here.** compose's Cube Store holds only the e2e suites' small rollup tables. The bounded case rests on xcube's integration test: a cross join over a Cube Store table answered "Query execution timed out" at its 10 s timeout, and the CPU fell to idle [answer, "Tested"].

## What wechart does with it (T549)

- A stop with `stillRunning` and no `endsBy` is said as "Cube Store runs this query to its end; it can't be stopped", with no time.
- The user's next run waits while xcube says the run hasn't ended. wechart asks about such a run, and a Cube Store run xcube didn't answer, for as long as xcube follows one: 24 hours, counted from the run's start, with 5 minutes' margin for the stop coming after it and for clocks (Claude's call).
- Where xcube can't be asked, the next run waits all the same, and the page says xcube can't say whether Cube Store has finished: no time of wechart's is put to the run.
  - The hold lapses only when its row is two minutes past what it was asked about until, as a lost run's does: `endsBy` for a run on select workers, the 24 hours for any other. That is no earlier than xcube itself would read `ended`.
- If xcube's own `EXPLAIN` fails, xcube treats the run as its router's, with no end: the safe direction (`runner.ts`, `.catch(() => null)`).
- Cube Store's page offers no Cancel, and says so (AC-379 as R64 amends it).
- R64: refusing a router-join query before it runs is asked of xcube (`to-xcube/2026-10-04-2200-cube-store-refuse-router-joins.md`; T650).
