---
library: xcube-636ffa04b2
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 636ffa04b2 (image v1.7.45-636ffa04b2@sha256:103c61331b9e3b21cb233aeeaff606cf75e9d8112239b5a7a47eb79c8c33ab03); in every image since, 2e611eae61 included'
researched: 2026-10-08
sources:
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-07-2015-cube-store-refuse-router-joins.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/sql/runner.ts (at 636ffa04b2 and 2e611eae61: `joinsOnRouter`, `ROUTER_JOIN_REFUSAL`, `cubeStoreSession`)
  - git -C /Users/srajagopal/Work/bi/cube merge-base --is-ancestor 636ffa04b2 256d632371 (true) and 636ffa04b2 2e611eae61 (true), run 2026-10-08
  - e2e/security/sql-runner.spec.ts (T650's case, against compose's 2e611eae61, 2026-10-08)
  - docs/research/xcube-46ca0ce708.md (a router query's stop, which this refusal now prevents for joins)
---

# xcube 636ffa04b2: a Cube Store SQL run whose join its router would run is refused before it runs

This is T650's research doc (R64, "refusing router-join queries before they run is yes"). Each claim is checked against the fork's source.

**Short names:** **[answer]** `~/Work/xcube-exchange/to-wechart/2026-10-07-2015-cube-store-refuse-router-joins.md`; **[runner]** `xcube/src/sql/runner.ts`.

## Which images have it

- Built at `636ffa04b2`, image `v1.7.45-636ffa04b2@sha256:103c6133…`, with no new migration ([answer]).
- It is an ancestor of `256d632371` and `2e611eae61` (`git merge-base --is-ancestor`, 2026-10-08), so wechart's pinned image has it (T740).

## What is refused ([runner] `cubeStoreSession`, `joinsOnRouter`)

- Before a Cube Store run that isn't itself an `EXPLAIN`, xcube asks Cube Store for the statement's plan (`EXPLAIN <sql>`, its `logical plan` column).
- A `Join` or `CrossJoin` with no `ClusterSend` among its ancestors in the plan is work Cube Store's router does itself, and nothing stops it once it starts, not Cube Store's timeout either (see `xcube-46ca0ce708.md`). Such a run is refused: nothing runs, and no run is recorded as running ([answer] "What is refused").
- That covers a join of `VALUES`, of Cube Store's catalog or system tables (`information_schema.*`, `system.*`), or of one of its tables with either ([answer]).

## The refusal ([answer] "The refusal's exact shape"; [runner] `ROUTER_JOIN_REFUSAL`)

`POST …/models/{model}/cubestore/sql` answers `400`:

- `error`: "Cube Store's router would run this query's join itself, and nothing stops that work once it starts, not even Cube Store's own timeout: join Cube Store's tables, whose joins run on its select workers, or read one catalog or system table without a join" (straight apostrophes, as in the source);
- `code`: `not_read_only`;
- `reason`: `cubestore_router_join`, new, and only this refusal carries it. Match on `reason`, not on `error`'s text;
- `statement`: `select`; `redactedSql`: the statement, its literals redacted.

`GET …/sql/runs/{runId}` for that run reads `ended` straight after, and the refusal comes back as fast as Cube Store answers the `EXPLAIN` (xcube's test holds it under 2 s) ([answer]).

## What still runs ([answer] "What still runs")

- One catalog or system table read without a join (`SELECT * FROM information_schema.tables`). Stopped at its cap or cancelled, it is still answered with `stillRunning: true` and `endsBy: null`, as with `46ca0ce708`.
- Joins of Cube Store's tables, which run on its select workers under `ClusterSend`. Stopped, they are answered with `endsBy` set.
- A huge single expression (`repeat('x', 2000000000)`) isn't caught.
- **Changed:** an `EXPLAIN` Cube Store can't answer now fails the run, `422 query_failed` with Cube Store's message, where before the run went ahead unbounded.

## For wechart

- The SQL client reads `reason: "cubestore_router_join"` as a router join (`xcube/sql-runner.ts`, `routerJoin`), and the API and the page say it in their own words rather than as a statement that isn't a SELECT (T650).
- **Observed on compose's `2e611eae61`** (T650's e2e): the `VALUES` cross join that T548's and T549's e2e used to stop at 30 seconds is refused in about 2 s. So the image can no longer produce a router query stopped at its cap from a join. A stopped router read without a join would need a single catalog read longer than 30 s, which compose's Cube Store has none of.
