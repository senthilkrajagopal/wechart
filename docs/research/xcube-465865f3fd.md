---
library: xcube-465865f3fd
packages: []
version: 'xcube v1.7.45-465865f3fd (ghcr.io/senthilkrajagopal/xcube:v1.7.45-465865f3fd@sha256:e276d7a224156663dbfaf9b17df2b5fe2685538d574694de9f4d7ce53f71e00c)'
researched: 2026-09-28
sources:
  - https://github.com/senthilkrajagopal/cube/commit/465865f3fda0c8048343b2ae8ba8ff42c826dc21
  - https://api.github.com/repos/senthilkrajagopal/cube/compare/919cff8c6ea5bef64892cc58311058a75772ae31...465865f3fda0c8048343b2ae8ba8ff42c826dc21
  - https://api.github.com/repos/senthilkrajagopal/cube/branches/feat/xcube
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/465865f3fda0c8048343b2ae8ba8ff42c826dc21/check-runs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36460494938
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/jobs/109057514495/logs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/jobs/109058817390/logs
  - https://ghcr.io/v2/senthilkrajagopal/xcube/manifests/v1.7.45-465865f3fd
  - docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-465865f3fd (and --format '{{json .Image}}')
  - git -C /Users/srajagopal/Work/bi/cube log --oneline 919cff8c6e..465865f3fd; merge-base; merge-base --is-ancestor; diff --stat 919cff8c6e 465865f3fd
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-28-0900-919cff8c6e-follow-ups.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-28-1000-919cff8c6e-follow-ups.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/aliases.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/package.json
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/environment-bases.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/store.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/runtime.test.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-backend-shared/src/env.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
  - /Users/srajagopal/Work/wechart/docs/research/xcube-919cff8c6e.md
  - /Users/srajagopal/Work/wechart/docs/deploy.md
  - /Users/srajagopal/Work/wechart/docs/tasks.md
  - /Users/srajagopal/Work/wechart/docker-compose.yml
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
  - /Users/srajagopal/Work/wechart/packages/api/src/main.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/seed.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/connections.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
  - /Users/srajagopal/Work/wechart/e2e/security/root-default.ts
  - /Users/srajagopal/Work/wechart/e2e/security/isolation.spec.ts
  - /Users/srajagopal/Work/wechart/e2e/security/changed-in-place.spec.ts
  - docker ps; docker logs wechart-cube (compose's Cube, started 2026-09-28T17:33:19Z); kubectl -n wechart get deploy, pods, jobs; helm -n wechart history wechart
  - psql, read-only, against compose's and the Helm release's wechart_meta (xcube.schema_migrations, xcube.connection_bases, xcube.connections, xcube.revisions)
  - kubectl -n wechart get deploy wechart-cube -o jsonpath (CUBEJS_DB_TYPE, _HOST, _PORT, _NAME, _USER, CUBEJS_DATASOURCES, CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH only)
  - node, replicating aliases.ts `identityOf` and `targetOf` over the stored `default`s' fields
---
# xcube v1.7.45-465865f3fd: a base keeps where it reaches, so once a connection is dropped, Cube's environment reaching the same host, port, database and user serves its cubes under their own names

> **Status in wechart (2026-09-28): the image to pin. It supersedes `919cff8c6e` (`xcube-919cff8c6e.md`).**
> - This doc covers `919cff8c6e` → `465865f3fd`. `xcube-919cff8c6e.md` still applies where this doc doesn't say otherwise, and so do the docs it defers to (`xcube-2d5ac86f24.md`, `xcube-bc18f82c01.md`, `xcube-4754c2c960.md`).
> - wechart's committed pin is `919cff8c6e` (T501, commit `1f7dcae`; `git show HEAD:docker-compose.yml` L173, L208).
> - Compose runs `919cff8c6e` (`docker ps`). Its Cube started at 2026-09-28 17:33:19 UTC and ran migration 8 then (its log).
> - The Helm release (namespace `wechart`) runs `919cff8c6e` since revision 47, 2026-09-28 11:02 local time. Both Cube Deployments name it by digest, and the pods' image ID is `sha256:cb04cb9b…`.
> - Both stores are at migration 8 (read-only `psql`).

This doc checks xcube's answer (`to-wechart/2026-09-28-1000-…`) against wechart's follow-ups (`to-xcube/2026-09-28-0900-…`). It checks the answer against the fork's code, tests and CI at `465865f3fd`, and against wechart's compose, Helm release and e2e.
- Fork paths are under `xcube/`, with line numbers at `465865f3fd`.
- wechart line numbers are at its working tree on 2026-09-28. The files cited are unchanged from `HEAD` (`git status`).
- Cube's own packages are still unmodified `v1.7.45`. `git diff --stat 919cff8c6e 465865f3fd -- packages/ rust/` is empty.

## Headline findings

1. **The image exists at the stated digest, is public, and its labels are xcube's own.**
   - `docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-465865f3fd` answers the index `sha256:e276d7a224156663dbfaf9b17df2b5fe2685538d574694de9f4d7ce53f71e00c`.
   - The index holds `linux/amd64` (`sha256:6cd02ee3…`), `linux/arm64` (`sha256:c9450c87…`) and two attestation manifests.
   - Anonymous `HEAD`s of the tag, of the digest and of `v1.7.45-feat-xcube` each answer `200` with `docker-content-digest: sha256:e276d7a2…`. The token came from `ghcr.io/token` with no credentials.
   - Both platforms carry the same labels (`imagetools inspect --format '{{json .Image}}'`):
     - `revision`: `465865f3fda0c8048343b2ae8ba8ff42c826dc21`;
     - `title`: `xcube`;
     - `version`: `v1.7.45-465865f3fd`;
     - `created`: `2026-09-28T17:49:59Z`;
     - `url`: `https://github.com/senthilkrajagopal/cube/tree/feat/xcube/xcube`;
     - `source`, `description` and `licenses`: xcube's, as before.
2. **CI passed.**
   - The check-runs for `465865f3fd…` are `test` (success) and `image` (success). Both are in run `36460494938`, the `xcube` workflow, run on a push to `feat/xcube`.
   - The test job reports 35 suites passed, and 409 tests passed with 2 skipped (411 total). `PASS test/integration/environment-bases.test.ts` and `PASS test/integration/store.test.ts` are in its log. The log doesn't name the skipped tests.
   - The image job built `xcube:ci` with `REVISION=465865f3fd…`, `VERSION=v1.7.45-465865f3fd` and `CREATED=2026-09-28T17:49:59Z`. Against it, the log shows "Serving check passed", "Items check passed", "Security check passed", "Overlay check passed", "Connection check passed", and `ok` for 12 driver environments.
   - It then built the two-platform image with the same three build arguments. Its log shows "exporting manifest list sha256:e276d7a2… done", pushed as `v1.7.45-465865f3fd` and `v1.7.45-feat-xcube`.
3. **`465865f3fd` is `919cff8c6e`'s child, and nothing else changed.**
   - `git merge-base --is-ancestor 919cff8c6e 465865f3fd` exits 0. `git log --oneline 919cff8c6e..465865f3fd` lists only `465865f3fd`.
   - The branch head is `465865f3fd` (branches API; local `fork/feat/xcube`). The compare shows `ahead_by: 1`, `behind_by: 0` and 12 files.
   - `git diff --stat` touches `.github/workflows/xcube.yml`, `Dockerfile`, `README.md`, `package.json`, `package-lock.json` (the version only), `src/runtime/runtime.ts`, `src/store/migrations.ts`, `src/store/revisions.ts`, and four test files.
   - It doesn't touch `aliases.ts`, `config.ts`, `drivers.ts`, `connections/connections.ts`, `gateway.ts`, `names/publish.ts`, `store/migrate.ts`, `server.ts` or `admin/routes.ts`.
   - `xcube/package.json` goes from `1.7.45-21` to `1.7.45-22`.
4. **Migration 9 is additive, and `919cff8c6e` still runs on a schema at 9.**
   - It runs `ALTER TABLE connection_bases ADD COLUMN target text`: nullable, with no default (`migrations.ts` L262-273).
   - Its `minReader` is 2, as migration 8's is.
   - `migrate` refuses to start only when the highest `min_reader` exceeds the code's newest version (`migrate.ts` L95-100). `919cff8c6e`'s newest is 8, and 2 ≤ 8. So it starts, and logs "the schema has migrations newer than this xcube; running on" (L101-107).
   - `919cff8c6e`'s SQL names only `model`, `name`, `identity` and `recorded_at`. So it leaves `target` null on the rows it inserts, and unchanged on the rows it updates.
   - Existing rows get `target` null. Nothing fills them at migration time. A running `465865f3fd` gives a row its target the first time it sees that data source's connection settled at the row's identity (details under "API surface").
   - `XCUBE_MIGRATE` defaults to true (`settings.ts` L165). Neither compose nor the chart sets it. So the first `465865f3fd` instance to start applies migration 9, under the migration lock.
5. **A base keeps where it reaches, as the answer says, by the code.**
   - Each base now holds its identity and its target (`ConnectionBase`, `revisions.ts` L194-198).
   - `movedIdentities` no longer aliases a data source served from Cube's environment when the environment's target equals the base's target (`runtime.ts` L2528-2539).
   - This works only for PostgreSQL, Redshift and MySQL. For any other driver, `targetOf` is `undefined` (`aliases.ts` L57-76), so the base's target stays null.
   - The integration test covers both outcomes against real Postgres (`environment-bases.test.ts` L203-217). It covers a base taken over from the environment, then dropped. It doesn't cover a connection stored first at the environment's target, then dropped. It doesn't cover a row given its target after migration 9.
6. **In a model with connections, only `default` now gets an environment base, as the answer says.**
   - `recordEnvironmentBases` records a name only when the model has no connections, or the name is `default` (`runtime.ts` L2482-2484).
   - No test covers this change. `runtime.test.ts` changed only a type.
   - Rows that `919cff8c6e` recorded for other names stay. None exist in compose's or the release's store (read-only `psql`: every `env:` row is a `default`).
7. **Both README corrections are in.**
   - The drop-without-touch behaviour: README L498-504 and L519-525. Cube's default is `true` (`env.ts` L835-837). With it on and the refresh end reached, `dropOrphanedTables` keeps only the tables used, the tables touched, and the table just built (`PreAggregationLoader.ts` L1135-1147).
   - The touch records' keys carry `QueryCache`'s `cachePrefix` (`PreAggregations.ts` L367-370, L470-473; `QueryCache.ts` L266-267). So they are per orchestrator. That an orchestrator's prefix carries the epoch is per `xcube-2d5ac86f24.md`.
   - The "changed to new settings" 503: README L492-497. The message is `Connections.CHANGING` (`connections.ts` L186). `gateway.ts` is unchanged.
   - The environment's base in both directions: README L464-472.
8. **wechart's security reset doesn't remove the root `default` from xcube. xcube refuses it.**
   - At start, wechart's API pushes the tree, then reconciles connections, then sends the items (`main.ts` L219-237). The reconcile asks xcube to remove each connection wechart lacks (`xcube/connections.ts` L409-416). After a reset, wechart lacks the root `default`.
   - xcube refuses to drop a connection that a published cube is bound to. It answers `409` with the code `in_use` (`runtime.ts` L1882-1917; `admin/routes.ts` L306-308). A cube with no `data_source` and no `extends` is bound to `default` (`overlays/connections.ts` L10-16).
   - At the reconcile, the previous run's revision is still current, and its root cubes use `default`.
   - Compose's Cube log since 17:33:19 shows six refusals for `e2e-security`: `409`, "Connection \"default\" is used by what is published" (17:33:35, 17:35:21, 17:35:39, 17:57:24, 17:58:14, 17:59:48). It shows no drop of `default`.
   - The last run's refusal (17:57:24.51) falls between the tree push (revision 1087, 17:57:22) and the start send (revision 1088, 17:57:24.75).
   - `e2e-security/default` is still stored (version 761, updated 18:00:05). Its base is `15b9ca00bf8c`, recorded at 17:33:20 when `919cff8c6e` first started.
   - So `xcube-919cff8c6e.md` headline 7 and Gotchas 1-2 didn't hold in these runs. The root cubes stayed on the stored `default`, at its base.
9. **If the root `default` were removed, compose's root cubes would now keep their names (by reading, and by replicating the hashes).**
   - The stored `default`'s fields are `sample-db`, 5432, `sample`, `sample`, with `ssl: false`. Replicating `identityOf` gives `15b9ca00bf8c`, the base's identity.
   - Replicating `targetOf` gives `env:7c853c5ba32b`. That is the base compose's models without connections hold (`demo`, `e2e`, `probe_t420` and others). That base is what Cube's environment serves them as, from `CUBEJS_DB_*` (`docker-compose.yml` L11-15).
   - The base gets that target once `465865f3fd` has seen `default` settled at `15b9ca00bf8c`. It is stored now, and at start `attach` syncs every model with a current revision (`runtime.ts` L685-689). So an upgrade with `default` stored gives it its target at the first start.
   - After that, Cube's environment serving the root has the base's target, so `movedIdentities` doesn't alias it.
   - **So `isolation.spec.ts` doesn't need to seed `default` first for the root's names.** Under `919cff8c6e` it didn't in practice either, because the removal is refused. The seed is harmless: a second seeding answers 409 and changes nothing. Whether the spec needs wechart's own record of the root `default` for anything else was not checked (UNVERIFIED).
10. **The Helm release's upgrade from `919cff8c6e` renames and rebuilds nothing (by reading).**
    - The first `465865f3fd` pod to start applies migration 9. Pods still on `919cff8c6e` keep running on it (finding 4).
    - The release holds one base, `wechart/default` = `9554e78029f8`, recorded at 18:02:34 UTC (read-only `psql`). Replicating `identityOf` over the stored fields gives `9554e78029f8`.
    - At its first start, `465865f3fd` gives it the target `env:270dc94e4833` (by replicating `targetOf`). The running `wechart-cube` has `CUBEJS_DB_TYPE=postgres`, `_HOST=superset-postgresql.superset.svc.cluster.local`, `_PORT=5432`, `_NAME=northwind` and `_USER=postgres`, with no `CUBEJS_DATASOURCES` (`kubectl … -o jsonpath`). These are the stored `default`'s four, so the environment's target is the same.
    - `identityOf`, `epochOf` and `servedKeyOf` are unchanged. So each model keeps its served key and orchestrator id. Its result cache and rollup tables are kept, and no cube's names change.
    - xcube's worker-first advice concerns upgrades from `c561077b94`-`8d08fac20c`. It doesn't apply here.
    - Compose upgrades the same way. Its `env:` bases get their target when the environment next serves them. For those rows, the target equals the identity (`runtime.ts` L2489).
11. **Nothing new to configure.** No route, response shape, environment variable or admin route changes. The migration runs at start.

## API surface (only what changed)

### `connection_bases.target` (migration 9)

- It holds where a base reaches, as `env:<hash>` of the driver's Cube type, host, port, database and user (`targetOf`, unchanged). It is null for a driver with no target, and for rows no `465865f3fd` has yet given one.
- For an environment base, the target is the environment's target, which is also its identity (`recordBases(model, served, served)`, `runtime.ts` L2489).
- For a connection's base, it is the connection's target when the base is recorded, taken over, or later given one.

### What `connectionBases` records now

- It inserts `(model, name, identity, target)`, first insert wins, as before (`revisions.ts` L739-744). A connection's first record now carries its target.
- One `UPDATE` now does two things (`revisions.ts` L745-754). It runs only for rows where a target was sent (`t.target IS NOT NULL`).
  - **Take-over:** where the base's identity is the connection's target, it sets the identity to the connection's and the target to the connection's target. This is `919cff8c6e`'s take-over, now also storing the target.
  - **Given a target:** where the base's identity is the connection's identity and the base has no target, it sets the target.
- It no longer sets `recorded_at` on a take-over. `919cff8c6e` did.
- It returns `{ identity, target }` per name (`revisions.ts` L755-759).
- The store test checks these (`store.test.ts` L260-264, L266-273):
  - a row is given its target only by the identity it has, never by another;
  - an environment base taken over keeps the environment's target;
  - one not taken over keeps its own;
  - once taken, another connection reaching the same target is a move, as before.

### When a running instance asks the store again

- `recordBases` asks for a name when this process knows no base for it (`runtime.ts` L2509-2514). It also asks again in two cases:
  - the known base's identity differs from the connection's, but equals the connection's target (the take-over, as before);
  - the known base's identity is the connection's and its target is null, and the connection has a target (new).
- `identitiesOf` passes only settled connections, with the targets of those that have one (`runtime.ts` L2455-2464). A connection whose key-holder secret didn't open isn't settled (`connections.ts` L179-183).
- **By reading:** a base is given its target only while its connection is stored, settled and at that base's identity. A base whose connection had moved, or was dropped, before any `465865f3fd` saw it at its base keeps a null target.

### Environment bases, in a model with connections

- `recordEnvironmentBases` now skips every name but `default` when the model has connections (`runtime.ts` L2482-2484). A model with no connections records every name its cubes use, as before.
- It passes the environment's target as both identity and target (L2489).

### What a revision is served as

- `movedIdentities` compares a connection's identity with `base.identity`, as before (`runtime.ts` L2530).
- For a data source with no connection, it aliases by the environment's target only when that target differs from both the base's identity and the base's target (L2532-2537).
- So Cube's environment serving a dropped connection's data source is at base when it reaches the base's target. Elsewhere, and with a null target, it is a move, as under `919cff8c6e`.
- The epoch still hashes only the connections' identities. So a data source served from the environment adds nothing to the served key. Moving between a stored `default` and the environment still changes the model's epoch, and so its orchestrator.

### The image's labels

- The Dockerfile takes `VERSION` and `CREATED` build arguments beside `REVISION`. It sets `title`, `url`, `version` and `created` over Cube's base image's (`Dockerfile` L30-43).
- The workflow's `Labels` step computes `version` as `v<peerDependencies['@cubejs-backend/server-core']>-<first 10 of the SHA>` and `created` as the UTC time. It passes both builds the same three arguments (`xcube.yml` L108-113, L121-124, L173-176).

### The tests that changed

- `environment-bases.test.ts` L192-217 (new test): "served by the environment again once its connection goes".
  - `same` (its `default` took the environment's base over in the earlier test): the cube is deleted, `default` is dropped, and the cube is published again. The planned rollup table stays `…orders_by_all`, and the cube answers.
  - `third` (`default` stored first, at database `template1`): the same steps give a table name without `…orders_by_all`.
  - `rollupOf` reads the table name `GET /v1/sql` plans (L132-135). It shows names, not whether an existing table is reused.
- `store.test.ts` L233-273: `shown` prints each base's identity and target. L260-264 add the given-a-target checks.
- `connections.test.ts` L727 and `runtime.test.ts` L10, L123: type changes only.

### Unchanged from `xcube-919cff8c6e.md`

- The environment's target (`config.ts`), `targetOf` and `environmentTargetOf` (`aliases.ts`), and the driver defaults (`drivers.ts`).
- The first-insert-wins rule, the take-over by the first connection reaching the environment's target, and `connection_bases` never pruned.
- The "changed to new settings" 503, the whole-snapshot deletes, migration 8, the pinned-epoch 503 and Cube's clean-up of other epochs' tables.
- `runtime.ts` line numbers after L43 moved by 1, and more after L2478 (by 8 after L2526). `activate` is now L2759-2773, `recordEnvironmentBases` L2474-2490, `recordBases` L2502-2518 and `movedIdentities` L2528-2539.

## Gotchas for wechart

1. **A base learns its target only from its connection, stored, settled and at that base.**
   - A row from `919cff8c6e` whose connection moved or was dropped before `465865f3fd` saw it keeps a null target. Cube's environment serving that data source is then still a move.
   - For wechart's root `default`, this means: upgrade while it is stored. It is stored in compose and in the release now.
2. **xcube refuses to drop a connection that published cubes use.** So in wechart, the new "at base again" path arises only where no published cube used the data source when it was dropped. Cubes published later from Cube's environment then keep their names, where it reaches the base's target.
   - The security reset's removal of the root `default` fails with `409 in_use` on every run whose previous revision has root cubes. wechart reports it in the reconcile's `failed` list. Within that run, wechart lacks the root `default` while xcube holds it, until a spec seeds it.
3. **Names kept aren't tables kept.** Moving between a stored connection and Cube's environment changes the model's epoch, so its orchestrator. With Cube's default clean-up, the other epoch's tables go once the current one's refresh cycle ends (finding 7). Whether the root's existing tables serve at once after such a switch is not checked (UNVERIFIED). Rollup-served tiles may answer "not built yet" until the worker rebuilds them under the same names.
4. **Only PostgreSQL, Redshift and MySQL keep a target.** For Snowflake, BigQuery, SQL Server, Oracle and Dremio, a base's target is null. Cube's environment serving a dropped connection's data source is always a move there. This is `xcube-919cff8c6e.md` Gotcha 4, now in both directions.
5. **During a rolling upgrade, the two images can disagree.** For a data source served from Cube's environment whose base is a connection's, `919cff8c6e` aliases its cubes and `465865f3fd` doesn't. No such data source exists in compose's or the release's store today. Don't remove a data source whose cubes are published from the environment while the release is rolling.
6. **The match is still on exact strings** (`xcube-919cff8c6e.md` Gotcha 3). It now also decides whether Cube's environment is at base after a drop. In the chart, keep `cube.dataSource` the one source for both sides.
7. **Still true from `xcube-919cff8c6e.md`:** Gotchas 3-7, with these changes.
   - Gotcha 1 (the environment serving a data source a connection once held is a move) now holds only where the environment reaches elsewhere than the base's target, or the target is null.
   - Gotcha 2 (the isolation check depends on spec order) no longer holds for names. Its premise, that each reset removes the root `default`, didn't hold either (finding 8).
   - Gotcha 6 (an environment base for any name) now covers, in a model with connections, only `default`.
   - Gotcha 8's list from `xcube-2d5ac86f24.md` still holds. Its Gotcha 5 (a one-off rebuild coming from `bc18f82c01`) is behind both deployments now.

## Open questions

1. **For the user:** should `isolation.spec.ts` keep seeding the root `default` first?
   - For names it isn't needed under `465865f3fd` (finding 9). It wasn't in practice under `919cff8c6e` either (finding 8).
   - Its comment (L190-193) and `root-default.ts`'s docblock (L13-17) rest on the reset removing `default`. That didn't happen.
2. **For the user:** each security run's reconcile fails to remove the root `default` (`409 in_use`) and logs it as a warning. Is that acceptable, or should a reset leave xcube's copy alone, or unpublish first? This is wechart's behaviour, not xcube's.
3. **Still open from `xcube-919cff8c6e.md`:**
   - Q1 (for xcube) is answered: yes, for PostgreSQL, Redshift and MySQL, and the README says both directions.
   - Q2 (for xcube) is answered: in a model with connections, only `default` is recorded now.
   - Q3 (for the user; how `isolation.spec.ts` gets its root `default`) became question 1 above. T501 chose to seed it in the spec.
   - Q4 (for the user; a fresh install on another warehouse may alias every root cube when the seed Job lands) is still open. Nothing here changes it.
   - From `xcube-2d5ac86f24.md`:
     - Q1 (the "not built yet" window from `bc18f82c01`) is moot. Both deployments now run `919cff8c6e`.
     - Q2 (a re-entered key or token moves the connection off its base for good) is still open (`docs/phase-2/backlog.md` §6).
     - Q3 (README on tables after a move back) is corrected.
     - Q4 (README on the "changed to new settings" 503) is corrected.
     - Q5 (the image's labels) is corrected.
4. **UNVERIFIED:**
   - the image run locally (only its manifests, labels and CI logs were inspected);
   - that the published two-platform image passes the image checks (CI ran them on `xcube:ci`, a separate build of the same commit with the same build arguments);
   - a row given its target after migration 9, end to end (store test only; no runtime or integration test);
   - a connection stored first at the environment's target, then dropped, end to end (only the take-over path is tested);
   - that only `default` gets an environment base in a model with connections (by reading; no test);
   - the answer's "without the target comparison, the first case fails" (consistent by reading: `same`'s base identity is its connection's, which differs from the environment's target; not run);
   - whether the root's existing rollup tables serve at once after a switch between a stored `default` and Cube's environment;
   - that tables from before `c561077b94` are gone in any given deployment;
   - which 2 tests CI skipped, and which 5 the answer's local run skipped;
   - whether `isolation.spec.ts` needs wechart's own record of the root `default` for anything but names;
   - everything `xcube-919cff8c6e.md` lists as UNVERIFIED that this doc doesn't settle. Its first item, the environment serving a dropped connection's data source being aliased, is now tested for a connection aimed elsewhere (`third`).

## What wechart must change to pin it

- **The image** replaces `919cff8c6e` at every place that names it (`grep -rn 919cff8c6e`, excluding `docs/research` and `docs/inputs`):
  - `docker-compose.yml` L173 (`cube`) and L208 (`cube-refresh-worker`), with the history comment L149-168. Its L166-167 ("The stored root `default` matches CUBEJS_DB_* above exactly, so the root's cubes keep their names") still holds. Under `465865f3fd` it holds also while `default` is removed.
  - `deploy/helm/wechart/values.yaml` L73, with its comment L61-70.
  - `deploy/helm/values/docker-desktop.yaml` L23, with its comment L13-22.
  - `packages/api/src/deploy/cube-image.test.ts`:
    - `IMAGE` (L39-40);
    - the docblock (L32-37): add `465865f3fd`;
    - the regex (L70): `(?!919cff8c6e@|83cb9f0888|feat-xcube|\$|<)` becomes `(?!465865f3fd@|83cb9f0888|feat-xcube|\$|<)`. It refuses any other `xcube:v1.7.45-<tag>` in `docs/deploy.md`, so name older images there by bare commit.
  - `docs/deploy.md`: the table's image (L12, `e276d7a2…`) and `docker pull` (L54).
- **`docs/deploy.md`, the history paragraph (L39):** add `465865f3fd`. A base keeps where it reaches: once a data source's connection is dropped, Cube's own settings reaching the same host, port, database and user serve its cubes under their own names (PostgreSQL, Redshift, MySQL). The image's labels are xcube's own.
- **`docs/deploy.md`, the upgrade paragraph (L41-47):**
  - The heading becomes "Upgrading to `465865f3fd`".
  - From `919cff8c6e` (compose and the docker-desktop release): migration 9 runs at the first start, and nothing is renamed or rebuilt. Each data source's base is given its target the first time an instance sees its connection there. So upgrade with the root `default` stored.
  - From `bc18f82c01` and `e53cf2a8b8`: as the current bullets say, with migrations 8 and 9 both running.
  - L44 (no target change while rolling) still holds. Add: don't remove a data source whose cubes are published from Cube's own settings while rolling.
  - L45: "after `default` is removed" no longer renames the root where Cube's settings reach where `default` did.
  - L47 ("If the root's `default` is removed from xcube, as a data reset does, the root's cubes are aliased until it is stored again") is wrong twice. A data reset doesn't remove it while root cubes are published: xcube refuses. If it is removed, the root keeps its names where `CUBEJS_DB_*` reaches where it did.
- **`docs/tasks.md`:**
  - T503 (L7876) says "the reset no longer renames the root's cubes". The reset never removed it in these runs (finding 8).
  - T501's small decision (L7866) rests on the same premise. It is checked, so change it only with the user.
- **`e2e/security/isolation.spec.ts`:** the seed (L194) can stay or go (open question 1). Its comment (L190-193) cites `xcube-919cff8c6e.md` and the reset removing `default`; correct it either way. The AC-328 comment (L254-256) still holds.
- **`e2e/security/root-default.ts`:** its docblock (L6-17) cites `919cff8c6e`. It says each reset removes `default` and the root is aliased until it is back. Neither holds under `465865f3fd`.
- **`e2e/security/changed-in-place.spec.ts`:** no change. On the way back it builds the rollup anew before it checks the name (L258-263). So xcube's corrected clean-up (a rebuild on the way back) doesn't affect it.
- **`packages/api/src/cube/client.ts`:** no change. The 503s and their bodies are unchanged.
- **`docs/requirements.md` L564** still records `e53cf2a8b8` as "the one built last" (R31). Change it only with the user.
- No environment variable, Helm template, `XCUBE_MIGRATE` or image-check change is needed.
- No wechart flow reaches the new behaviour directly, since xcube refuses to drop a connection published cubes use. `cube-image.test.ts` is the test that fails before the pin.

## Corrections

- **Against the 1000 answer:**
  - "The full suite passes …: 406 passed, 5 skipped." CI run `36460494938` reports 35 suites, 409 passed and 2 skipped (411 total). The totals agree. The answer's run was local and in band.
  - "The published image passes the image checks." CI ran them on `xcube:ci`, the runner's own build. The published two-platform image is a separate build of the same commit, with the same `REVISION`, `VERSION` and `CREATED`.
  - "Once the reset has removed the root's `default`, the root's cubes are served from the environment under their own names … So the seed-first ordering in your specs is no longer needed for names." True by reading, once the base has its target. But the reset doesn't remove it: xcube answers `409 in_use` while the root's cubes are published (finding 8). And a base recorded before migration 9 gets its target only once an instance sees `default` stored at it.
  - "Its cubes keep their original names and tables." The names are tested. The tables are not: the test reads the planned table name only. The switch also changes the model's epoch, so its orchestrator.
  - "Existing bases … are given their target the next time an instance sees their connection at its base identity." True, if the connection is settled and its driver has a target. A base whose connection is gone or moved never gets one.
  - "Now only `default` is recorded there." True for new rows. Rows recorded before stay. No test covers it.
  - "Touch records are keyed by its prefix, so per epoch." The keys carry `QueryCache`'s `cachePrefix`, so they are per orchestrator. The orchestrator's id carrying the epoch is from `xcube-2d5ac86f24.md`, not re-checked here.
  - "It is 919cff8c6e plus these five, nothing else." Consistent: one commit, 12 files, nothing under `packages/`.
- **Against `xcube-919cff8c6e.md`:**
  - Status: "Compose and the Helm release run `bc18f82c01`." Both now run `919cff8c6e` (compose since 17:33:19 UTC; the release since Helm revision 47, 11:02).
  - "Neither database has `connection_bases` yet: both are at migration 7." Both are at migration 8 now, with bases recorded.
  - Headline 7, Gotcha 1's last bullet, Gotcha 2 and open question 3: "The security e2e loses the root `default` at every run's start" and "At start, the API removes every xcube connection wechart lacks, the root `default` among them". The API asks. xcube refuses with `409 in_use` while published cubes use `default`, and they do at that point (`runtime.ts` L1882-1917; `main.ts` L219-237; compose's Cube log: six refusals, no drop).
  - Headline 8: "No migration is added." True for `919cff8c6e`. `465865f3fd` adds migration 9.
  - Its `runtime.ts` line numbers are `919cff8c6e`'s. At `465865f3fd`, lines after L43 move by 1, and more after L2478.
  - Its `isolation.spec.ts` line numbers are from before T501. The seed is now L194, the rollup-table check L257 and the SQL check L259-270.
- **Against wechart's docs:** `docs/deploy.md` L47, `docs/tasks.md` L7866 and L7876, `isolation.spec.ts` L190-193 and `root-default.ts` L13-17 carry the same premise ("What wechart must change").
