---
library: xcube's Cube Store SQL run followed to its end, and a run's state (the user's Cube fork)
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under xcube's service credential.
version: 'xcube feat/xcube 2099b13f2d; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-2099b13f2d@sha256:1e483afc30f1da9bcc58a0cc37e5ba96824c2f9fda709b2b2d699dcc768b2e12 (amd64, arm64)'
researched: 2026-10-04
---

# xcube 2099b13f2d: a stopped Cube Store run, said and followed to its end (T548)

An addition beside [`xcube-sql-runner.md`](./xcube-sql-runner.md), [`xcube-6d9673ccda.md`](./xcube-6d9673ccda.md) and [`xcube-93a5f7a73b.md`](./xcube-93a5f7a73b.md). It corrects `xcube-sql-runner.md`'s Cube Store cancel: that note has xcube stop waiting at the clock and nothing more.

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-04-1900-cube-store-cancel.md`, to wechart's request `~/Work/xcube-exchange/to-xcube/2026-10-04-0900-cube-store-cancel.md`;
- the fork at `2099b13f2d`, the one commit after `93a5f7a73b` (`git log 93a5f7a73b..2099b13f2d`): `xcube/src/sql/runs.ts` (`runOn`, `state`, `ENDS_GRACE_MS`), `src/runtime/settings.ts` (`XCUBE_CUBESTORE_QUERY_TIMEOUT`), and Cube Store's own `rust/cubestore/cubestore/src/config/mod.rs` (`CUBESTORE_QUERY_TIMEOUT`), unchanged in the fork;
- compose's running image, probed by T548 (below).

## Cube Store can't stop a query

[answer, "Cube Store has no way to stop a running query"]
- **A query runs in a task of its own,** on however its connection ends: closing the connection doesn't stop it.
- **Neither its protocol nor its SQL has a cancel.** `SET` is a no-op, and its one `KILL` (`SYS KILL ALL JOBS`) is for rollup builds.
- **Its one limit is process-wide:** `CUBESTORE_QUERY_TIMEOUT`, 120 s unset (`config/mod.rs`, `env_parse("CUBESTORE_QUERY_TIMEOUT", 120)` at `2099b13f2d`). It bounds every query, Cube's own included. There is no per-query limit.

## What xcube does instead

[answer, "What xcube does instead"; `runs.ts`]

**A stop answers at once,** as a data source's does: `422`, `code` `timeout` or `cancelled`, the rows read before (none on Cube Store, which answers every row at once), and two fields more:
- `stillRunning: true`;
- `endsBy`: the run's start plus `XCUBE_CUBESTORE_QUERY_TIMEOUT`, when Cube Store's own timeout ends it at the latest.

**`XCUBE_CUBESTORE_QUERY_TIMEOUT`** is a new xcube setting, in seconds, 120 unset (`settings.ts`: `number(env, 'XCUBE_CUBESTORE_QUERY_TIMEOUT', 120)`, from 1 to 86400). It must be what Cube Store's `CUBESTORE_QUERY_TIMEOUT` is: xcube can't read it from Cube Store.

**The cap's stop answers at about `timeoutMs` + 2 s,** on xcube's clock (`CLOCK_GRACE_MS`). A cancel answers at once.

**Until Cube Store answers, the run is `stopping`:**
- xcube keeps the connection open to hear Cube Store's own end, then marks the run `ended`. That is at most 5 s past `endsBy` if nothing comes back (`ENDS_GRACE_MS`).
- The state is noted in xcube's database before the 422 is sent, so every instance sees it.
- Its `runId` stays taken: a run with the same id answers `409 run_in_progress`.
- A cancel of a `stopping` run answers `{ found: true }`.

**A run's state, from any instance:** `GET …/models/{model}/sql/runs/{runId}` → `{ model, runId, state, endsBy? }`.
- `state` is `running`, `stopping` (with `endsBy`), or `ended`: it has ended, or never was.
- A data source's run is never `stopping`: its stop is real.
- Refusals: `400 bad_request` for an id that isn't 1 to 64 of `A-Z a-z 0-9 _ -`; `404 unknown_model`.

**Migration 13,** additive: two nullable columns on xcube's `sql_runs` [answer].

## Checked against compose's running image (T548, 2026-10-04)

compose's `wechart-cube` and `wechart-cube-refresh-worker` run the image, recreated from the main checkout's `docker-compose.yml` and project directory with only `CUBE_IMAGE` set: each container's `com.docker.compose.config-hash` equals `docker compose config --hash` for it.
- Neither `wechart-cube` nor `wechart-cubestore` has a query timeout in its environment, so both are 120 s.
- The host's and the Cube container's clocks agreed to the second.

Probed under the service credential, model `e2e-security`, with T548's scratch probe, which isn't kept:
- **A Cube Store run stopped at a 5 s cap,** started 19:08:38Z: a computed cross join over `information_schema.columns` (927 rows).
  - It answered at 7.0 s: `422`, `code: "timeout"`, `rows: []`, `truncated: "stopped"`, `stillRunning: true`, `endsBy: "2026-10-04T19:10:38.644Z"`, its start plus 120 s. The error reads "The statement ran past 5 s and was stopped; Cube Store can't stop a query, and runs it on until it ends, by 2026-10-04T19:10:38.644Z at the latest".
  - The same `runId` again: `409 run_in_progress`.
  - Its state, every 2 s: `stopping` with that `endsBy` until 123.3 s, then `ended` at 125.3 s, between `endsBy` and `endsBy` + 5 s.
- **A run that answers** (`SELECT 1`) is `ended` at once, and its id may be used again.
- **Cube Store plans away `count(*)` over a cross join of `VALUES`:** 10^7 rows counted in 4 ms. A computed sum over the same 10^7 rows took 1.7 s. On an idle Cube Store, after its restart, a computed sum over 16^6 rows took 1.9 s and over 17^6 2.0 s.

## Correction: Cube Store's timeout ends the wait, not the work (T548's e2e)

xcube's answer has a stopped query keep Cube Store busy "until Cube Store's own timeout, and was idle after". T548 found otherwise for a query Cube Store computes on its router.
- **The query:** a computed sum over a 10-way cross join of a 10-row `VALUES` (10^10 rows), run from the Cube Store page at 19:16:54Z. It was stopped at the 30 s cap, with `endsBy` 19:18:54.4Z, and xcube said it `ended` by 19:18:59Z.
- **After that, Cube Store was still computing it:**
  - At 19:19:36Z, `docker stats` had `wechart-cubestore` at 1,194 % CPU. It stayed between 365 % and 1,341 % in 15 s samples until `wechart-cubestore` was restarted at 19:56:07Z, 37 minutes after the timeout. Then it was idle.
  - The router process, pid 1 `cubestored`, was busy: its user ticks in `/proc/1/stat` rose by about 490 a second, about five cores.
  - Cube Store logged nothing about the timeout.
- **Other queries starve meanwhile:** a `SELECT 1` on Cube Store took 18.9 s at 19:21:01Z, and the e2e's own `SELECT 1` after the hold lifted hadn't answered in 5 s.
- **So "ended" in xcube's state means Cube Store answered** (its "Query execution timed out"), not that the query's work stopped. A user's next run can start while Cube Store still computes their last, and so can Cube's own queries.
- Which queries Cube Store stops at its timeout, and which it computes on, wasn't settled here. xcube's own test, a three-way cross join, went idle at the timeout [answer, "Tested"].
- *Settled by xcube's next answer, and corrected in `46ca0ce708`: see [`xcube-46ca0ce708.md`](./xcube-46ca0ce708.md).* The timeout ends only select workers' work. A query the router runs (`VALUES`, the catalog, a join above `ClusterSend`) runs to its end, and from `46ca0ce708` xcube says no `endsBy` for it and stays `stopping` until Cube Store answers.

## What wechart does with it (T548, R62)

*T549 changes the last three points, with `46ca0ce708`: where xcube can't be asked, the next run is held all the same and said so, with no time guessed; a run with no end, and one xcube didn't answer, are asked about for 24 hours, as long as xcube follows one (`xcube-46ca0ce708.md`).*

- A Cube Store run's answer with `stillRunning` is said as still finishing in Cube Store, until `endsBy`. Its row in wechart's `sql_runs` keeps `ends_by`.
- The user's next run, on Cube Store or a data source, waits while xcube says that run hasn't ended. Where xcube can't be asked, it waits until `endsBy`.
- A Cube Store run xcube didn't answer is held the same way, with its start + 120 s, Cube Store's unset timeout, as its `endsBy`. xcube says `ended` for a run it never saw.
- A row long past its `ends_by` (two minutes, as a lost run's) is no longer asked about.
