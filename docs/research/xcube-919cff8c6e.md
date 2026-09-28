---
library: xcube-919cff8c6e
packages: []
version: 'xcube v1.7.45-919cff8c6e (ghcr.io/senthilkrajagopal/xcube:v1.7.45-919cff8c6e@sha256:cb04cb9ba8e3b7db58ae8297a986f2deeaaf12497c853ab6d5c25c88797c5596)'
researched: 2026-09-28
sources:
  - https://github.com/senthilkrajagopal/cube/commit/919cff8c6ea5bef64892cc58311058a75772ae31
  - https://github.com/senthilkrajagopal/cube/commit/2d5ac86f24526dcf7fd0f5557091d7ddfa59d8d7
  - https://github.com/senthilkrajagopal/cube/commit/acc7c40c2402bb92a03483cffe98dc5fa6a3bc94
  - https://api.github.com/repos/senthilkrajagopal/cube/compare/2d5ac86f24526dcf7fd0f5557091d7ddfa59d8d7...919cff8c6ea5bef64892cc58311058a75772ae31
  - https://api.github.com/repos/senthilkrajagopal/cube/branches/feat/xcube
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/919cff8c6ea5bef64892cc58311058a75772ae31/check-runs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36454207198
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/jobs/109036284845/logs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/jobs/109037908749/logs
  - https://ghcr.io/v2/senthilkrajagopal/xcube/manifests/v1.7.45-919cff8c6e
  - docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-919cff8c6e (and --format '{{json .Image}}')
  - git -C /Users/srajagopal/Work/bi/cube log --oneline 8d08fac20c..919cff8c6e; merge-base; merge-base --is-ancestor; diff --stat 2d5ac86f24 919cff8c6e
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-28-0800-alias-only-after-a-change.md
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-28-0700-alias-only-after-a-change.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/aliases.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/package.json
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/environment-bases.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/store.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/connections.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/config.test.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-backend-shared/src/env.ts
  - /Users/srajagopal/Work/wechart/docs/research/xcube-2d5ac86f24.md
  - /Users/srajagopal/Work/wechart/docs/requirements.md
  - /Users/srajagopal/Work/wechart/docs/spec.md
  - /Users/srajagopal/Work/wechart/docs/deploy.md
  - /Users/srajagopal/Work/wechart/docs/tasks.md
  - /Users/srajagopal/Work/wechart/docker-compose.yml
  - /Users/srajagopal/Work/wechart/infra/cube/cube.js
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/_helpers.tpl
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/cube.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/seed-default.yaml
  - /Users/srajagopal/Work/wechart/packages/api/src/seed-default.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/seed.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/main.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/connections.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
  - /Users/srajagopal/Work/wechart/playwright.security.config.ts
  - /Users/srajagopal/Work/wechart/playwright.config.ts
  - /Users/srajagopal/Work/wechart/e2e/security/root-default.spec.ts
  - /Users/srajagopal/Work/wechart/e2e/security/isolation.spec.ts
  - /Users/srajagopal/Work/wechart/e2e/security/changed-in-place.spec.ts
  - docker ps; kubectl -n wechart get deploy, pods, jobs; helm -n wechart history wechart (the images compose and the Helm release run)
  - psql, read-only, against compose's and the Helm release's wechart_meta (xcube.schema_migrations, xcube.connections, to_regclass('xcube.connection_bases'))
  - kubectl -n wechart get deploy wechart-cube -o jsonpath (the rendered CUBEJS_DB_* values)
---
# xcube v1.7.45-919cff8c6e: Cube's environment has a base too, so a `default` stored after the environment served keeps its cubes' names only if it reaches the same host, port, database and user

> **Status in wechart (2026-09-28): the image to pin. It supersedes `2d5ac86f24` (`xcube-2d5ac86f24.md`).**
> - This doc covers `2d5ac86f24` → `919cff8c6e`. `xcube-2d5ac86f24.md` still applies where this doc doesn't say otherwise, and so do the docs it defers to (`xcube-bc18f82c01.md`, `xcube-4754c2c960.md`).
> - wechart's committed pin is still `e53cf2a8b8` (`git show HEAD:docker-compose.yml`, both Helm values files).
> - Compose and the Helm release run `bc18f82c01` from uncommitted edits. The Helm release (namespace `wechart`) moved to it at revision 46, 2026-09-28 09:59. `xcube-2d5ac86f24.md` says the release runs `e53cf2a8b8`. That no longer holds.
> - Don't pin `2d5ac86f24`. It has the hole this image fixes. `acc7c40c24` has no image.

This doc checks xcube's answer (`to-wechart/2026-09-28-0800-…`, as updated for `919cff8c6e`) against wechart's ask (`to-xcube/2026-09-28-0700-…`). It checks the answer against the fork's code, tests and CI at `919cff8c6e`, and against wechart's compose, Helm chart and e2e.
- Fork paths are under `xcube/`, with line numbers at `919cff8c6e`.
- wechart line numbers are at its working tree on 2026-09-28. Another session was editing that tree, so re-check them before you edit.
- Cube's own packages are still unmodified `v1.7.45`. `git diff --stat 2d5ac86f24 919cff8c6e -- packages/` is empty.

## Headline findings

1. **The image exists at the stated digest, is public, and names its commit.**
   - `docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-919cff8c6e` answers the index `sha256:cb04cb9ba8e3b7db58ae8297a986f2deeaaf12497c853ab6d5c25c88797c5596`.
   - The index holds `linux/amd64` (`sha256:e58c01bc…`), `linux/arm64` (`sha256:a8664808…`) and two attestation manifests.
   - An anonymous `HEAD` of `ghcr.io/v2/senthilkrajagopal/xcube/manifests/v1.7.45-919cff8c6e` answers `200` with `docker-content-digest: sha256:cb04cb9b…`. So does a `HEAD` by the digest itself.
   - Both platforms carry `org.opencontainers.image.revision: 919cff8c6ea5bef64892cc58311058a75772ae31` (`imagetools inspect --format '{{json .Image}}'`).
   - The labels `created` (`2026-09-25T05:22:31Z`), `title` (`cube`), `url` (`https://github.com/cube-js/cube`) and `version` (`v1.7.45`) are still Cube's base image's.
2. **CI passed.**
   - The check-runs for `919cff8c6e…` are `test` (success) and `image` (success), both in run `36454207198`. That is the `xcube` workflow, run on a push to `feat/xcube`.
   - The test job reports 35 suites passed, and 408 tests passed with 2 skipped (410 total). `PASS test/integration/environment-bases.test.ts` is in its log. The log doesn't name the skipped tests.
   - The image job ran every image check against `xcube:ci`, the image built for the runner with `REVISION=919cff8c…` (log: "Serving check passed", "Items check passed", "Security check passed", "Overlay check passed", "Connection check passed", and `ok` for 12 driver environments).
   - It then built and pushed the two-platform image. Its log shows "exporting manifest list sha256:cb04cb9b… done", pushed as `v1.7.45-919cff8c6e` and `v1.7.45-feat-xcube`.
   - The branch head is `919cff8c6e` (branches API; local `fork/feat/xcube`). The compare from `2d5ac86f24` shows `ahead_by: 1`, `behind_by: 0` and 12 files.
3. **`919cff8c6e` is `2d5ac86f24`'s child, so it carries everything `xcube-2d5ac86f24.md` relies on.**
   - `git log --oneline 8d08fac20c..919cff8c6e` lists `acc7c40c24` (the base identity), `2d5ac86f24` (the README correction) and `919cff8c6e`.
   - `git merge-base 2d5ac86f24 919cff8c6e` is `2d5ac86f24`, and `merge-base --is-ancestor` exits 0. It is not a sibling built on `8d08fac20c`.
   - `git diff --stat 2d5ac86f24 919cff8c6e` touches 12 files: `README.md`, `package.json`, `package-lock.json`, `src/config.ts`, `src/connections/aliases.ts`, `src/runtime/runtime.ts`, `src/store/revisions.ts`, and five test files, one of them new (`environment-bases.test.ts`).
   - It doesn't touch `gateway.ts` (the 503), `names/publish.ts` (the snapshot fix), `store/migrations.ts` or `store/migrate.ts` (migration 8), `server.ts`, `connections/connections.ts`, `connections/drivers.ts`, the Dockerfile or the CI workflow. `git diff --stat` over those paths is empty.
   - The README correction of `2d5ac86f24` is still there (README L487-493).
4. **The hole's fix matches the answer, by the code.** A data source that cubes use with no connection now gets Cube's environment's target as its base. A connection stored later under that name takes the base over only if its host, port, database and user, as its driver reads them, equal the environment's. Otherwise it is a move, and its cubes are aliased (details below).
   - The integration test covers both outcomes against real Postgres (`environment-bases.test.ts` L166-186).
   - No integration test covers a port left out, another driver, a `driverFactory`, or more than one instance. Unit tests cover the target comparison, a port left out, other drivers having no target, and the `driverFactory` case.
5. **Something new: while no connection serves a data source whose base is a connection's identity, Cube's environment serving it is a move.**
   - The base is a connection's identity once a connection has been stored under that name, whether it took the environment's base over or recorded its own.
   - Cube's environment then serves the data source's cubes under aliases of the environment's target, `x<hash of name@<data source>@env:…>` (`runtime.ts` L2520-2531).
   - This is so even when the environment reaches the same place as that connection did. Nothing records the connection's target with its base.
   - The commit message says so. The 0800 answer and the README don't.
   - No test covers it.
6. **Compose and the `docker-desktop` release match exactly, so a seeded root `default` keeps the root cubes' names.** In both, the host, port, database and user that `CUBEJS_DB_*` give Cube equal the stored `default`'s fields (details under "wechart's case").
7. **The security e2e loses the root `default` at every run's start. Under this image, the root cubes are aliased until `root-default.spec.ts` stores it again (by reading; not run).**
   - The suite's API runs with `WECHART_RESET_DATA=1`. That deletes wechart's data sources (`seed.ts` L24-33).
   - At start, the API removes every xcube connection wechart lacks, the root `default` among them (`xcube/connections.ts` L409-417).
   - The root cubes are then served from Cube's environment. By finding 5, that is a move.
   - `isolation.spec.ts` checks the root's rollup table is `…iso_sales_by_status` (L250), and doesn't seed `default` itself. The suite is `fullyParallel` with 4 workers locally. So that check depends on `root-default.spec.ts` having run first.
   - Under `2d5ac86f24` the root cubes kept their names in that window. That was the hole.
8. **Nothing new to configure.**
   - No route, response shape, environment variable or admin route changes.
   - No migration is added. The fix writes `connection_bases` rows of a new kind (`env:<hash>`) and updates a row once when a connection takes an environment's base over (`revisions.ts` L738-746).
   - `xcube/package.json` goes from `1.7.45-20` to `1.7.45-21`.

## API surface (only what changed)

### What Cube's environment serves a data source as

- `createConfig` gives the runtime `environmentTarget(dataSource)` (`config.ts` L109-124).
  - With a `driverFactory` in cube.js, it is `env:cube.js`. No connection's target equals that.
  - Otherwise it reads `CUBEJS_DB_TYPE`, `_HOST`, `_PORT`, `_NAME` and `_USER` through Cube's `getEnv`. The port is read as an integer (`env.ts` L425-428, L485-490, L559-564, L579-584, L599-617).
  - Without `CUBEJS_DB_TYPE`, or when `assertDataSource` throws (a name missing from `CUBEJS_DATASOURCES`), it is `undefined`. Then nothing is recorded.
  - Without `CUBEJS_DATASOURCES`, every data source name reads the same unprefixed variables (`keyByDataSource`, `env.ts` L106-126). So any name gets `default`'s target.
- xcube's own `driverFactory` is unchanged. In a model with connections, only `default` may fall back to Cube's environment. Any other name with no connection is refused (`config.ts` L227-230).

### A target, and how the environment's is compared

- `targetOf(driver, fields)` is `env:<hash>` of the driver's Cube type and the `host`, `port`, `database` and `user` its `config` makes of the fields (`aliases.ts` L57-76).
  - Only `postgres`, `redshift` and `mysql` have one. Any other driver's is `undefined`.
  - It reads the fields through the `password` sign-in. So a port left out is the driver's default (5432, 5439, 3306; `drivers.ts` L100, L116, L137), and `'5432'` equals `5432`.
  - The host, database and user are compared as strings (`str`, `drivers.ts` L43). So `sample-db` and its IP address are different targets, as the answer says.
  - `ssl` and every other field don't count.
- `environmentTargetOf(cubeType, fields)` is `targetOf` for those three drivers. For any other type it is `env:<type>:<hash of the fields>`, which no connection's target equals (`aliases.ts` L78-86).
- The unit test checks these (`test/unit/connections.test.ts` L231-242):
  - the same host, port, database and user match;
  - a port left out matches `'5432'`;
  - `ssl` and `schema` don't count;
  - another user doesn't match, and `mysql` doesn't match `postgres`;
  - `snowflake` has no target.
- `config.test.ts` L44-58 checks the environment's target with no port set, and `env:cube.js` with a `driverFactory`.

### Recorded before cubes are served from the environment

- `recordEnvironmentBases` runs in `activate`, after `identitiesOf` and before `servedRevision` (`runtime.ts` L2758-2765).
  - It takes each data source the revision's cubes use (`dataSourcesOf`, `aliases.ts` L154-170): each YAML cube's `data_source`, else its parent's through `extends`, else `default`. A file that isn't YAML adds `default` (unit test L244-254).
  - It skips a name that has a connection now, and a name this process already knows a base for (`runtime.ts` L2473-2487).
  - It records the environment's target as the base with the same first-insert-wins `INSERT … ON CONFLICT DO NOTHING` as before (`revisions.ts` L732-737). A row already there, such as an earlier connection's identity, is kept.
- `activate` returns before it when the served key is unchanged (`runtime.ts` L2759-2762). So it runs for a new revision, or when the model's connections change.
- It isn't called for a preview. A preview is still served over `base.identities`, and its own connections still never reach `identitiesOf` (`runtime.ts` L1388-1399).
- **By reading:** it records the environment's target for any name the cubes use, `default` or not. In a model with connections, Cube's environment serves only `default` (see above). So a non-default data source whose cubes were published before its connection was stored gets the environment's target as its base. That connection is then a move unless it reaches the same place.

### Taken over by a connection reaching the same place

- `identitiesOf` now passes each settled connection's target along with its identity (`runtime.ts` L2455-2463).
- `recordBases` asks the store again for a name whose known base differs from its identity but equals its target (L2505-2506).
- The store then runs `UPDATE … SET identity = <the connection's identity> … WHERE identity = <its target>` (`revisions.ts` L738-746). It reads back in a third statement (L747-751).
  - So only a base that is the environment's target, reaching where the connection does, is taken over. From then on the base is the connection's identity.
  - Once taken, it stays that connection's. Another connection reaching the same target is a move (`store.test.ts` L255-260).
- A connection whose target differs, or has none, leaves the environment's base in place. Its identity differs from the base, so it is a move. Its cubes are aliased, and their rollups are built anew under new names. The environment's tables are never read over it.

### What a revision is served as

- `movedIdentities` now also covers data sources with no connection (`runtime.ts` L2520-2531).
  - For each recorded base whose data source has no connection, it asks `environmentTarget`. If that differs from the base, its cubes are aliased by the environment's target: `x<hash of name@<data source>@env:…>`.
  - So cubes served from the environment keep their names only while their base is the environment's target.
  - Once a connection has recorded or taken over the base, the environment serving that data source is a move, even when it reaches the same place. The base holds the connection's identity, not its target.
- The epoch still hashes only the connections' identities (`servedRevision`, unchanged). So a data source served from the environment adds nothing to the orchestrator id.
- From the review: `recordBases` now puts the process's map of bases in place before its first `await` (L2499-2503). Two concurrent syncs no longer lose each other's entries. No answer changes.

### The tests that changed

- `environment-bases.test.ts` (new) sets `CUBEJS_DB_*` to the test database (L43-50, L72). It publishes a cube with a rollup, reads it from the environment, then stores `default` and waits for it (L150-164).
  - "Reaching where the environment did" (the same host, port, database and user): the rollup table stays `…orders_by_all`, and the cube answers (L166-175).
  - "Aimed elsewhere" (the database `template1`): the table name changes (L177-186).
  - Both store `port` as a number and `ssl: false`. Neither leaves the port out.
- `connections.test.ts` L730-731 now retires what served before the second move, so the alias is worked out afresh. The assertion is unchanged.
- `store.test.ts` L246-251 now stores the connection before it drops it, and checks that the drop answers `true`. L255-260 add the take-over checks.

### Unchanged from `xcube-2d5ac86f24.md`

- The "changed to new settings" 503 (`gateway.ts` L120-134), the whole-snapshot deletes (`names/publish.ts` L345-351), migration 8 (`store/migrations.ts` L242-261), the pinned-epoch 503 and Cube's clean-up of other epochs' tables.
- `identityOf` and `epochOf` are unchanged (`aliases.ts` L44-54, L89-91). So an upgrade from `bc18f82c01` or `2d5ac86f24` keeps each model's epoch and orchestrator id. From `e53cf2a8b8` the orchestrator id still gains `_<epoch>`, as `xcube-2d5ac86f24.md` says.
- `runtime.ts` line numbers after L77 moved by 6, and more after L2446. The older "try again" 503s are now at L821, L1768, L1915, L2008 and L2024.

## wechart's case

### Compose

- `CUBEJS_DB_*` (`docker-compose.yml` L11-16): type `postgres`, host `sample-db`, port `'5432'`, database `sample`, user `sample`.
- `e2e/security/root-default.spec.ts` L26-31 seeds `default` with host `sample-db`, port `'5432'`, database `sample`, user `sample` and ssl `false`. The seeder turns the port into the number 5432 (`seed-default.ts` L90-95).
- xcube holds `e2e-security/default` as `{"ssl": false, "host": "sample-db", "port": 5432, "user": "sample", "database": "sample"}` (read-only `psql` on compose's `wechart_meta`).
- **They match.** Both give the target `postgres`, `sample-db`, 5432, `sample`, `sample`. So the root cubes keep their names while `default` is stored.
- `infra/cube/cube.js` defines no `driverFactory` (L17-66), and compose sets no `CUBEJS_DATASOURCES`. So the environment's target comes from `CUBEJS_DB_*`.
- Compose's other models (`demo`, `e2e`, `e2e-cutover-*`, `e2e-no-callbacks-*`, `probe_t420`) hold no connection. They get the environment's base, and are never aliased unless one stores a connection.

### The Helm chart

- Cube's `CUBEJS_DB_HOST`, `_PORT`, `_NAME` and `_USER` come from `cube.dataSource.host`, `port`, `database` and `user`. Each is rendered `toString | quote`, and left out when empty (`_helpers.tpl` L124-134, used by `cube.yaml` L97).
- The seed Job sends the same four values as `WECHART_DEFAULT_DB_HOST`, `_PORT`, `_DATABASE` and `_USER` (`seed-default.yaml` L79-86).
  - The seeder leaves out an empty value (`seed-default.ts` L89). An empty port is then unset for Cube too, and both take 5432.
- **So they match by construction.** Two ways they could still differ, by reading:
  - The seeder trims each value (`seed-default.ts` L40). Whether Cube's `getEnv` trims is not checked (UNVERIFIED). A value with surrounding spaces could differ.
  - A `seedFields` entry named `host`, `port`, `database` or `user` renders a second `WECHART_DEFAULT_DB_<FIELD>` (`seed-default.yaml` L89-92). So does a `cube.dataSource.env` entry naming `CUBEJS_DB_HOST` and the like (`_helpers.tpl` L143-146). Which of two entries the container gets is not checked (UNVERIFIED).
- **`docker-desktop`** (`values/docker-desktop.yaml` L22-27): `postgres`, `superset-postgresql.superset.svc.cluster.local`, 5432, `northwind`, `postgres`.
  - The running `wechart-cube` Deployment has `CUBEJS_DB_HOST=superset-postgresql.superset.svc.cluster.local`, `CUBEJS_DB_PORT=5432`, `CUBEJS_DB_NAME=northwind` and `CUBEJS_DB_USER=postgres` (`kubectl … -o jsonpath`).
  - xcube holds `wechart/default` with the same four and `ssl: false` (read-only `psql` in `wechart-meta-0`).
  - **They match.**

### At the upgrade, and at a fresh install

- **The upgrade.** In compose's `e2e-security` model and the release's `wechart` model, `default` is already stored. At the first activation `identitiesOf` records its identity as the base, and `recordEnvironmentBases` skips a name that has a connection. So the environment's base plays no part.
  - Neither database has `connection_bases` yet: both are at migration 7 (read-only `psql`). So no base recorded by `2d5ac86f24` brings the hole into them.
- **A fresh Helm install.** The API sends the model at start (`main.ts` L223-237). The seed Job waits for the API, then stores `default`.
  - If Cube serves the root before the seed, the root's base is the environment's target, and the seed takes it over.
  - If after, the seed's identity is the base.
  - Either way the root cubes keep their names, for Postgres, Redshift and MySQL. The order is not checked (UNVERIFIED).
- **Where they differ**, the stored `default` is a move from the start. Every root cube is aliased by the connection's identity. Its SQL and rollup table names change, and its rollups are built anew. The same holds for any other driver, whatever the values, if Cube served the root before the seed ran.

## Gotchas for wechart

1. **Once a connection has held a data source's base, Cube's environment serving that data source is a move.**
   - With no connection under the name, its cubes are aliased by the environment's target. This holds even when the environment reaches the same place.
   - So removing the root `default` from xcube renames every root cube's SQL and rollup tables. Rollup-served tiles answer "not built yet" until the worker builds them under the alias.
   - Storing a `default` with the same identity again restores the names. The seeder sends the same fields every time, so re-seeding does.
   - wechart's API removes the root `default` from xcube whenever its own store lacks it (`xcube/connections.ts` L409-417). That happens after a data reset. Both e2e suites reset (`playwright.config.ts` L97, `playwright.security.config.ts` L84), but only the security suite's model holds a `default`.
2. **The security e2e's isolation check depends on the order the specs run in (by reading; not run).**
   - Each run's reset removes `e2e-security/default` (headline 7). Until `root-default.spec.ts` stores it again, the root's `iso_sales` is served from the environment under an alias.
   - `isolation.spec.ts` doesn't seed `default` itself. Its rollup table check (L250) then fails, since the root's table is named by the alias.
   - Its SQL check (L252-262) fails too if the seed lands between the build and the SQL read, since the names change back mid-test.
   - The suite is `fullyParallel`, with 4 workers locally (`playwright.security.config.ts` L44-45). `isolation.spec.ts` sorts before `root-default.spec.ts`.
   - Under `2d5ac86f24` the root kept its names in that window, because of the hole. So the check passed either way there.
   - The `/api/meta` names check (L204) is unaffected: an alias changes SQL and table names, not cube names.
3. **The match is on exact strings.** A host name and its IP address differ. So do a short name and its fully qualified name, and letters in another case.
   - In the chart, `cube.dataSource` is the one source for both sides. Keep it so: don't name `CUBEJS_DB_HOST`, `_PORT`, `_NAME` or `_USER` in `cube.dataSource.env`, or `host`, `port`, `database` or `user` in `seedFields`.
4. **Other warehouses can't match.** For Snowflake, BigQuery, SQL Server, Oracle and Dremio, xcube can't compare the environment with a connection. A root `default` stored after Cube served the root from its environment is always a move. At a fresh install, that depends on whether the API's first send reaches Cube before the seed Job does (UNVERIFIED).
5. **Only the first connection takes the environment's base over.** Afterwards the base is that connection's identity.
   - A new password keeps the identity, so it changes nothing.
   - Moved to another host and back, the identity is the base's again, so the names come back.
   - The identity hashes the raw fields, and the target the driver's reading of them. So a `default` stored again with the same target but other raw fields has another identity, and is a move. An example is the port left out where it was 5432 before.
6. **A data source whose cubes are published before its connection is stored gets the environment's target as its base (by reading).** This holds for any name, not only `default`.
   - wechart stores a data source before it binds a cube to it, so normal flows don't hit this.
   - If a connection fails to land while its cubes are published, and it later lands aimed elsewhere than `CUBEJS_DB_*`, its cubes are aliased from the start. That costs a rename and a rebuild. It never serves the wrong data.
7. **`connection_bases` also gains a row for every data source any model's cubes use from Cube's environment.** It is still never pruned.
8. **Still true from `xcube-2d5ac86f24.md`:** Gotchas 1-10.
   - Gotcha 1 (a connection's first identity is special) now also covers the environment's target as that first identity.
   - Gotcha 5 (a one-off rebuild coming from `bc18f82c01`) now covers the `docker-desktop` release too, since it runs `bc18f82c01`.
   - Gotcha 4 (the upgrade from `e53cf2a8b8`) now covers only deployments on the committed pin.

## Open questions

1. **For xcube:** once a connection has held a data source's base, Cube's environment serving the same host, port, database and user is a move. Could the base keep the connection's target for Postgres, Redshift and MySQL, so the environment reaching that place is at base again? That would keep the root's names through wechart's e2e reset. Either way, please say it in the README. The commit message says it; the README and the 0800 answer don't.
2. **For xcube:** `recordEnvironmentBases` records the environment's target for any data source a revision's cubes use. In a model with connections, only `default` may be Cube's (`config.ts` L227-230). Is recording a base for other names intended?
3. **For the user:** how should `isolation.spec.ts` get its root `default` before it publishes? Options include:
   - seeding it in the spec, as `root-default.spec.ts` does (a second seeding answers 409 and changes nothing);
   - running `root-default.spec.ts` in a setup project the others depend on;
   - asking xcube for open question 1.
4. **For the user:** for a warehouse other than Postgres, Redshift or MySQL, a fresh install may alias every root cube when the seed Job lands (Gotcha 4). Is that acceptable, or should the seed land before Cube first serves the root?
5. **Still open from `xcube-2d5ac86f24.md`:**
   - Q1 (compose's "not built yet" window from `bc18f82c01`) now also covers the `docker-desktop` release.
   - Q2 (a re-entered key or token moves the connection off its base for good).
   - Q3: the README still says "a connection moved back to its base usually finds its cubes' tables still there" (README L487-493). Cube's default drops them.
   - Q4: the README still doesn't document the "changed to new settings" 503. `grep "changed to new settings"` finds nothing in it.
   - Q5: the image's `created`, `title`, `url` and `version` labels are still Cube's.
6. **UNVERIFIED:**
   - that Cube's environment serving a data source after its connection is dropped is aliased (by reading `movedIdentities`; no test covers it);
   - the security e2e's isolation check failing under this image (by reading; not run);
   - a port left out, end to end (unit test only);
   - more than one instance taking an environment's base over at once (by reading the `UPDATE`; no test);
   - whether Cube's `getEnv` trims values, as wechart's seeder does;
   - which of two duplicate environment entries a Kubernetes container gets;
   - the order of the API's first send and the seed Job at a fresh install;
   - the answer's "without the change, tests 1 and 2 fail", and "test 3's second case fails without the environment's base";
   - which 2 tests CI skipped;
   - the image run locally (only its manifests, labels and CI logs were inspected);
   - everything `xcube-2d5ac86f24.md` lists as UNVERIFIED.

## What wechart must change to pin it

- **The image** replaces `bc18f82c01` at the places `xcube-2d5ac86f24.md` lists:
  - `docker-compose.yml` L170 and L205 (`cube` and `cube-refresh-worker`), with the history comment (L149-168);
  - `deploy/helm/wechart/values.yaml` L69, with its comment (L61-68);
  - `deploy/helm/values/docker-desktop.yaml` L21, with its comment (L13-20);
  - `packages/api/src/deploy/cube-image.test.ts`: `IMAGE` (L37-38), the docblock (L32-35), and the regex (L68), where `(?!bc18f82c01@|…)` becomes `(?!919cff8c6e@|…)`;
  - `docs/deploy.md`: the table's short digest (L12, `cb04cb9b…`) and `docker pull` (L46).
  - The regex refuses any other `xcube:v1.7.45-<tag>` in `docs/deploy.md`. So name older images by bare commit.
- **`docs/deploy.md`, the history paragraph (L39):** add the base identity (R38): a cube keeps its names while its data source reaches the target it was first served with.
- **`docs/deploy.md`, the upgrade paragraph (L41).** Its text is `bc18f82c01`'s. By this research:
  - Compose and the `docker-desktop` release run `bc18f82c01`. There, cubes on stored data sources (the root's `default` among them) go back to their published names, and their rollups are built once more. Rollup-served tiles answer "not built yet" until the worker has built them. The README advises upgrading the refresh worker first. The chart and compose give both one image value.
  - From `e53cf2a8b8` (the committed pin), nothing is renamed or rebuilt at first start, as `xcube-2d5ac86f24.md` says. Migration 8 runs at start, Cube's result cache starts empty once per model with data sources, and `4754c2c960`'s due items take new aliases at each model's next publish.
  - Where Cube served the root before the seed Job stored `default`, the root keeps its names only if `cube.dataSource`'s host, port, database and user reach the same place, for Postgres, Redshift or MySQL. Otherwise, and for any other driver, the seeding renames the root's cubes and rebuilds their rollups once.
  - After that, a new host, database, user or key holder aliases a data source's cubes and rebuilds their rollups. Moving back restores the names. A new password changes nothing. A re-entered BigQuery key or Snowflake or Dremio token counts as a change.
  - If the root's `default` is removed from xcube, as a data reset does, the root cubes are aliased until it is stored again.
- **`docs/tasks.md` T501 (L7814-7820):** the title names `bc18f82c01`. The research should list `xcube-2d5ac86f24.md` and this doc. "Rollup-served tiles answer 'not built yet' until the worker's next run" now applies to both compose and the `docker-desktop` release.
- **`e2e/security/isolation.spec.ts`:** its root checks (L243-262) hold only once the root `default` is stored. It needs a way to have it first (open question 3). Its comment at L247-249 is right for a stored `default`.
- **`e2e/security/changed-in-place.spec.ts`:** unchanged from `xcube-2d5ac86f24.md`. It stores its data source before it publishes its cube (L198-214), so the environment's base plays no part. Its docblock cites `xcube-bc18f82c01.md`.
- **`e2e/security/root-default.spec.ts`:** nothing needs to change. Nothing yet checks that seeding keeps the root's names. A rollup-table stem check after the seed would test this image's fix.
- **`packages/api/src/cube/client.ts`:** no change. The 503 and its body are unchanged.
- **`docs/requirements.md` L564** still records `e53cf2a8b8` as "the one built last" (R31). Change it only with the user.
- No environment variable, Helm template, `XCUBE_MIGRATE` or image-check change is needed. The chart already seeds `default` from the values Cube reads.

## Corrections

- **Against the 0800 answer (as updated for `919cff8c6e`):**
  - "The full suite passes: 405 passed, 5 skipped." CI run `36454207198` reports 35 suites, 408 passed and 2 skipped (410 total).
  - "The published image passes the image checks." CI ran them on `xcube:ci`, the runner's own build. The published two-platform image is a separate build of the same commit.
  - "For wechart: … the cubes keep their names, even for a model published before the seed ran." That holds only for Postgres, Redshift and MySQL. For any other driver it is a move, as the answer's own list says.
  - "Isolation e2e: the root's cubes on the stored `default` are at its base, so `iso_sales` keeps its name." True while `default` is stored. The suite's reset removes it at every run's start. Until `root-default.spec.ts` stores it again, the root cubes are served from the environment as a move, under aliases.
  - "It is kept when the connection is dropped … So a connection dropped and stored again, aimed elsewhere, is served as moved." True, but incomplete. While it is dropped, Cube's environment serving the data source is also a move, unless the base is the environment's (`runtime.ts` L2520-2531; the commit message).
  - "Their original tables are usually still there, and serve at once. Cube's rollup clean-up keeps the newest table of each name." As `xcube-2d5ac86f24.md` says, that holds only with `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH` off. Cube's default is on.
  - "Tables the earlier images named by identity … Cube leaves them unless `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH` is on." It is on by default, so they go once their touch records expire.
  - "8 concurrent first records agree on one base": from one process's pool, as before (`store.test.ts` L233-245).
  - "Records no base until it opens": on that instance, `unopened` is cached for the connection's version, as before.
  - "It is 8d08fac20c plus this change, nothing else": consistent. The range holds `acc7c40c24`, `2d5ac86f24` (README only) and `919cff8c6e`.
- **Against `xcube-2d5ac86f24.md`:**
  - Status: "wechart's committed pin and its Helm release (namespace `wechart`) run `e53cf2a8b8`." The committed pin does. The release runs `bc18f82c01` since Helm revision 46 (2026-09-28 09:59; `kubectl -n wechart get deploy`, `helm history`).
  - "Which record wins. The first insert wins. There is no `UPDATE` or `DELETE` of `connection_bases` anywhere." There is now one `UPDATE`: a connection reaching the environment's target takes that base over, once (`revisions.ts` L738-746).
  - "Dropped connection or model … At the same target, it is at base again." True for a connection stored again with the same identity. While none is stored, Cube's environment serving the data source is a move.
  - "What wechart must change": `isolation.spec.ts`'s root assertion "holds by reading while compose's `e2e-security` `default` is at its base". Under `2d5ac86f24` it also held while `default` was removed, because of the hole. Under `919cff8c6e` it doesn't.
  - Headline 5, Gotcha 5 and Open question 1 name compose only. They now cover the `docker-desktop` release too.
  - "Upgrading from `e53cf2a8b8`", item 7 ("Upgrading the worker first isn't needed"): true from `e53cf2a8b8` only. Both of wechart's running deployments now come from `bc18f82c01`.
  - Its `runtime.ts` line numbers are `2d5ac86f24`'s. At `919cff8c6e`, lines after L77 move by 6, and more after L2446.
