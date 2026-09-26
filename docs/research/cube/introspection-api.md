---
library: Cube data-source introspection API (fork senthilkrajagopal/cube, branch feat/introspection-package, package directory cube-introspection/)
packages: []
# Upstream Cube v1.7.45, unmodified, plus the standalone package cube-introspection 1.7.45-1 at the fork's commit 0b6eef90a9. The version is that commit's full SHA. wechart calls the API over HTTP and imports nothing, so no import names are listed.
version: 1.7.45+0b6eef90a969167b5dcd1ccaec3283567a1f914a
researched: 2026-09-25
sources:
  - https://github.com/senthilkrajagopal/cube/tree/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/README.md
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/Dockerfile
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/NOTICE
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package.json
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/requests.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/types.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/introspection.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/bin/server.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/catalog/queue.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/catalog/views.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/ScaffoldingSchema.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/formatters/BaseSchemaFormatter.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/gateway.test.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-base-driver/src/BaseDriver.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/dimensions.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/joins.mdx
  - https://www.postgresql.org/docs/current/infoschema-tables.html
  - https://www.postgresql.org/docs/current/infoschema-table-constraints.html
  - https://www.postgresql.org/docs/current/infoschema-constraint-column-usage.html
  - https://www.postgresql.org/docs/current/infoschema-key-column-usage.html
  - https://www.postgresql.org/docs/current/view-pg-matviews.html
---

# Cube data-source introspection API (fork package `cube-introspection`) 1.7.45 + 0b6eef90a9

**This revision.** This doc used to be pinned to fork commit `95ea166012` on branch `feat/data-source-introspection-api`. That branch edited Cube's own packages and overlaid them on `cubejs/cube:v1.7.45`. It now describes branch `feat/introspection-package` at `0b6eef90a969167b5dcd1ccaec3283567a1f914a` (`~/Work/bi/cube/.git/refs/heads/feat/introspection-package`). On that branch the API is a standalone package, `cube-introspection/`, on top of an unmodified Cube v1.7.45 (`docs/inputs/2026-09-25-cube-introspection-package.md` §1).

- **Fixes folded in.** The fixes that `docs/research/cube/introspection-api-f6355de982.md` records at `f6355de982` are carried by the package and are part of this text: member numbering, a reserved `count`, time-typed keys, schema-bound joins, and "Continue wait" as 200 ([NOTICE][p-notice] L9–13; [queue.ts][p-queue] L82–88).
- **Old image record.** `introspection-api-f6355de982.md` remains the record of the old image, `cube:v1.7.45-introspection-f6355de982`. That is the image wechart's compose and docker-desktop Helm values run today (`docker-compose.yml` L79, L129; `deploy/helm/values/docker-desktop.yaml` L18). This doc's `95ea166012` text is in its git history.

**Line numbers.**

- **Package files** are at `0b6eef90a9`, read in the local checkout `/Users/srajagopal/Work/bi/cube/cube-introspection`.
- **Upstream Cube files** are cited at `cube-js/cube` **v1.7.45**. They were read in the same checkout's `packages/` and `docs-mintlify/`, which the input note says are unchanged from v1.7.45 (§1). I could not run `git diff`. Three spot checks agree:
  - GitHub's v1.7.45 `gateway.ts` has the same scope list, "Continue wait" branch and default scopes as the local file (WebFetch).
  - No Cube package source mentions the introspection API (Grep of `packages/*/src`).
  - The local `env.ts` has no `CUBEJS_INTROSPECTION_MAX_TABLES`.

**What "observed" means.** I built nothing, ran no tests and sent no requests. "Observed" refers to one of two things:

- the caller's side-by-side run of the new image (section C of "Observed locally");
- the earlier probes of the `e01fd079d7` and `95ea166012` images (sections A and B).

Each observation names its source.

## Summary

**What it is.** `cube-introspection` 1.7.45-1 is a private package at the root of the user's Cube fork ([package.json][p-pkg] L2–6).

- **Five routes.** It subclasses Cube's server container, server, server core and API gateway through their protected factory methods. That adds five routes under `{basePath}/v1/introspection/data-sources` in a new `introspection` API scope ([README][p-readme] L8–20; [server.ts][p-srv] L18–83; [gateway.ts][p-gw] L60–192).
- **What they do.** They list the data sources that can be browsed, list a data source's schemas and the tables in them, and read the columns of up to `CUBEJS_INTROSPECTION_MAX_TABLES` tables (default 100). They also **scaffold** a cube per table as YAML or JS, which is returned and not written anywhere ([README][p-readme] L54–55, L77–189).
- **Scope.** `introspection` is not among Cube's default scopes ([gateway.ts][p-gw] L35, L209; [upstream gateway.ts][u-gw] L240–241; [test][p-t-gw] L128–134).
- **Catalog reads.** `DataSourceIntrospection` reads the catalog through the data source's own driver instance. The driver is seen through a proxy that swaps in the package's catalog queries. Reads go through a queue of the package's own, beside Cube's ([introspection.ts][p-intro] L85–101; [server.ts][p-srv] L47–66; [queue.ts][p-queue] L46–145; [views.ts][p-views] L11–22, L318–384).
- **Generation.** Cubes are generated with a copy of Cube 1.7.45's Playground scaffolder that includes the fork's changes ([NOTICE][p-notice] L6–13; [introspection.ts][p-intro] L194–256; upstream [DevServer.ts][u-devserver] L185–189).
- **The image.** It is the published `cubejs/cube:v1.7.45` with the package's build copied into `/cube/node_modules/cube-introspection`. That build starts instead of `cubejs server` ([Dockerfile][p-df] L1–3, L26–31).

**Why wechart uses it.**

- **AC-139** (F15, T145) says: "WHEN the user generates cubes from a data source, THE SYSTEM SHALL browse that connection's schemas and tables and create a cube per selected table with its columns mapped to dimensions and a count measure." It fails when "a selected table produces no cube, or a column is dropped without saying so" (`docs/spec.md` L465–468).
- **AC-250** grants the `introspection` scope only to the API's short-lived introspection tokens. **AC-249** refuses generated cubes that clash with the target folder (`docs/spec.md` L469–472).
- **The gap it fills.** Core's own browsing and generation routes are dev-only and unauthenticated (`docs/research/cube/data-sources.md` L255–259, L382; `docs/research/cube/configuration-deployment.md` L686, L711–712). With this image, wechart's server browses, previews and generates through Cube in production mode. It then saves the YAML to its model store and publishes it through validate-then-publish (AC-136, AC-137).
- **Existing references.** wechart's working tree already cites this doc as T275 / AC-250 (`infra/cube/cube.js` L124–138; `packages/api/src/cube/client.ts` L197–223; `packages/api/src/model/introspection.ts` L7–27).

**Where the cited code lives now.** Each row was checked in the source.

| Behaviour | Previous image (`f6355de982`) | Now (`0b6eef90a9`) | Checked |
| --- | --- | --- | --- |
| Routes, scope, data source list | Fork edit of `packages/cubejs-api-gateway/src/gateway.ts` | `cube-introspection/src/gateway.ts`, class `IntrospectionApiGateway extends ApiGateway` | Same routes, middlewares, order of checks and messages ([gateway.ts][p-gw] L110–271; [previous gateway.ts][f6-gw]) |
| Validation and paging | `packages/cubejs-api-gateway/src/data-sources.ts` | `src/requests.ts` | Same Joi schemas and paging. The max-tables parser differs (see "Differences", item 3) |
| Wire types | `packages/cubejs-api-gateway/src/types/data-sources.ts` | `src/types.ts` | Same shapes ([types.ts][p-types] L12–95) |
| Introspection | `packages/cubejs-server-core/src/core/DataSourceIntrospection.ts` | `src/introspection.ts` | Same logic. Catalog reads go through a `CatalogReader` instead of orchestrator methods ([introspection.ts][p-intro] L34–35; [previous DataSourceIntrospection.ts][f6-dsi]) |
| Scaffolding | Cube's own `packages/cubejs-schema-compiler/src/scaffolding`, edited in place | `src/scaffolding/*`: a copy of 1.7.45 with `numeric` typing, `cubeNameFor` and schema-aware joins, time-typed keys, and numbered members ([NOTICE][p-notice] L6–13) | See "Generation rules" |
| Driver catalog queries | Edited into eleven drivers and the base driver | `src/catalog/views.ts`, applied to the driver through a `Proxy` | The Postgres SQL matches the previous image's ([previous PostgresDriver.ts][f6-pg]). So does Redshift's external-table typing ([previous RedshiftDriver.ts][f6-rs]) |
| Orchestrator `METADATA` fix | Edits to `QueryCache.ts` / `QueryOrchestrator.ts` | Not needed. `src/catalog/queue.ts` runs the reads in its own queue through the queue's `query` handler, with its own function | [queue.ts][p-queue] L116–145; [upstream QueryCache.ts][u-qc] L759–797 |
| `CUBEJS_INTROSPECTION_MAX_TABLES` | `packages/cubejs-backend-shared/src/env.ts` (env-var `asIntPositive()`) | `src/requests.ts` `maxTablesPerRequest()` | The parser differs (see "Differences", item 3) |
| Image build | `packages/cubejs-docker/overlay.Dockerfile` | `cube-introspection/Dockerfile` | No overlay Dockerfile exists in `packages/cubejs-docker/` (Glob) |
| API reference | `docs-mintlify/reference/core-data-apis/rest-api/reference.mdx` | `cube-introspection/README.md` | It says "Continue wait" is 200, lists all three unmapped reasons, and gives the naming and join rules ([README][p-readme] L63–66, L147–175) |
| Tests | In Cube's packages | `test/unit/*` and `test/integration/*` (Postgres, MySQL, Trino, DuckDB, and the whole server in process) | Read, not run ([README][p-readme] L191–204) |

**Key findings:**

1. **The HTTP API is unchanged from the previous image.**
   - **Observed:** the caller sent 38 requests to both images, and every status and body matched byte for byte (section C).
   - **Source:** the routes, middleware list, order of checks, Joi schemas, messages and error handling match the previous gateway ([gateway.ts][p-gw] L110–229; [previous gateway.ts][f6-gw]; [requests.ts][p-req] L23–104).
2. **The differences are all below the HTTP surface.** Catalog reads run in their own queue and are no longer written to Cube's cache. The max-tables variable is parsed differently. Cube's own code is stock. The start command, the version check and the refresh-worker constraint are new. See "Differences from the previous image".
3. **"Continue wait" is now 200, as documented,** not the 500 that `95ea166012` produced.
   - The package's queue converts `ContinueWaitError` to `{ error: 'Continue wait' }` ([queue.ts][p-queue] L82–88), and the gateway answers that with 200 ([upstream gateway.ts][u-gw] L2545–2552).
   - Unit tests show it ([catalog-queue.test.ts][p-t-queue] L75–82; [gateway.test.ts][p-t-gw] L360–369). It was not observed over HTTP.
4. **On Postgres, primary and foreign keys still need a role that owns the tables.**
   - Primary keys come from Cube's unchanged query over `table_constraints` and `constraint_column_usage` ([upstream PostgresDriver.ts][u-pg] L189–199). Foreign keys come from the package's query over `table_constraints`, `key_column_usage` and `constraint_column_usage` ([views.ts][p-views] L164–185).
   - The PostgreSQL docs filter all three views by ownership or privilege ([PG docs][pg-tc]; [PG docs][pg-ccu]; [PG docs][pg-kcu]).
5. **The scaffold no longer drops columns without saying so.**
   - Clashing member names are numbered, `count` is reserved for the count measure, and a time-typed key stays one key dimension ([BaseSchemaFormatter.ts][p-bsf] L105–132; [ScaffoldingSchema.ts][p-ss] L326–346).
   - Two losses remain, and they concern joins, not columns: two joins to the same target cube keep only the last, and a self-referencing foreign key joins the cube to itself (see Gotchas).
6. **Generated cube names still depend on the batch.** `public.orders` alone is `orders`; requested alongside `sales.orders` it is `public_orders` ([introspection.ts][p-intro] L278–307). Nothing checks names against wechart's model; wechart does that itself (`packages/api/src/model/clashes.ts` L6–17).
7. **The scope stays on a dedicated short-lived token, and both hardening steps are now in wechart's working tree.**
   - The token lives 60 s and carries `wechartIntrospection: true` (`packages/api/src/cube/client.ts` L207–223, L306–307).
   - `cube.js` returns `['introspection']` alone for that token and filters `introspection` out of the defaults (`infra/cube/cube.js` L133–138).
8. **Two claims in the input note don't match the source.**
   - **The user.** "The image starts as uid 1000" is not what the Dockerfiles say: neither sets `USER`. The Helm chart is what sets uid 1000 ([Dockerfile][p-df]; [upstream latest.Dockerfile][u-df]; `deploy/helm/wechart/templates/cube.yaml` L47–54).
   - **The refresh worker.** "It serves no introspection routes": on this image the worker registers the routes too. This is source-derived; see Gotchas.

## Differences from the previous image

"The previous image" is `cube:v1.7.45-introspection-f6355de982`, which wechart runs today. It is documented by `introspection-api-f6355de982.md` on top of this doc's earlier `95ea166012` text.

**Observed: none.** The caller's 38 requests got identical status and body from both images (section C).

**In the source: seven differences.** None was observed. Each follows from reading both sources.

1. **Catalog reads no longer share Cube's query queue.**
   - **Previous:** `DataSourceIntrospection` called the orchestrator's `queryDataSourceSchemas`, `queryTablesForSchemas` and `queryColumnsForTables` with `{ requestId }` ([previous DataSourceIntrospection.ts][f6-dsi]). Those run in Cube's SQL query queue for the data source, the queue `/v1/load` uses (this doc's `95ea166012` text).
   - **Now:** each data source gets a queue named `INTROSPECTION_<cachePrefix>_<dataSource>`, built with `QueryCache.createQueue`. It uses the same driver factory, the same `queueOptions(dataSource)` (so the same concurrency) and the same `continueWaitTimeout` as Cube's queue for that data source ([queue.ts][p-queue] L116–145; [server.ts][p-srv] L47–66; compare [upstream QueryCache.ts][u-qc] L665–692).
   - **Effect:** catalog reads no longer take slots from `/v1/load` queries, and don't wait behind them. The catalog queue's concurrency now comes on top of the query queue's, against the same driver instance and connection pool (source-derived).
2. **Results are not written to Cube's cache.**
   - **Previous:** per this doc's `95ea166012` text, the orchestrator path wrote results to Cube's cache driver with a 30-day expiry, even with `forceNoCache` set ([upstream QueryOrchestrator.ts][u-qo] L481, L497). The f6355de982 doc records no change to this.
   - **Now:** the package calls `QueryQueue.executeInQueue` directly, and nothing goes through `QueryCache`'s cache path ([queue.ts][p-queue] L63–92). The queue hands a finished result to the callers waiting for it. The in-memory queue deletes it once fetched ([upstream LocalQueueDriverConnection.ts][u-lqdc] L114–135).
   - UNVERIFIED: how long Cube Store keeps an unfetched queue result.
3. **`CUBEJS_INTROSPECTION_MAX_TABLES` is parsed differently.**
   - **Previous:** env-var's `asIntPositive()` with default `'100'` ([previous env.ts][f6-env]). In env-var 6.3.0, the version Cube's lockfile pins ([upstream yarn.lock][u-yarnlock] L10681–10683), that is `parseInt(value, 10)`. It refuses values containing `.` and accepts `0` ([int.js][envvar-int] L3–11; [int-positive.js][envvar-intpos] L5–13).
   - **Now:** `Number(value)` must be an integer ≥ 1, and unset or empty means 100 ([requests.ts][p-req] L9–21).
   - **Values handled differently:**

     | Value | Previous | Now |
     | --- | --- | --- |
     | `0` | A cap of 0, which no request can meet | 500 |
     | `10abc` | 10 | 500 |
     | `1e2` | 1 | 100 |
     | `0x10` | 0 | 16 |

   - An invalid value now answers `{"error":"Error: CUBEJS_INTROSPECTION_MAX_TABLES must be a positive integer, not '<value>'"}` on `/columns` and `/scaffold` only.
   - UNVERIFIED: how the previous parser treated an empty string.
4. **Cube's own code is stock v1.7.45.**
   - The previous image changed Cube's Playground scaffolding, eleven drivers, the base driver and the orchestrator. Now only the introspection routes use the package's copies ([NOTICE][p-notice] L6–17; note §4).
   - So Cube's dev-mode Playground scaffolding and `cubejs generate` in this image behave as stock. Stock scaffolding types `numeric` as `string`, because `'numb'` isn't a substring of `numeric` ([upstream ScaffoldingSchema.ts][u-ss] L385–405).
   - Cube's own calls to its drivers are stock too. The stock Postgres driver doesn't list materialized views ([drivers.test.ts][p-t-drv] L133–138). Stock Postgres finds a foreign key only when its target table is requested ([views.ts][p-views] L159–163; [upstream PostgresDriver.ts][u-pg] L201–219). Stock MySQL key queries are as upstream ([upstream MySqlDriver.ts][u-mysql] L199–232).
   - The f6355de982 doc's "The Playground and the CLI follow the same naming and join rules" no longer holds for this image.
   - wechart runs Cube with `CUBEJS_DEV_MODE: 'false'` (`docker-compose.yml` L103), so it serves no Playground.
5. **The start command changed, and a version check was added.**
   - **CMD:** `node /cube/node_modules/cube-introspection/dist/src/bin/server.js`, instead of `cubejs server` ([Dockerfile][p-df] L31). It does what `cubejs server` does: sets `NODE_ENV=production`, builds the server container with `--debug`, runs project diagnostics, and starts ([bin/server.ts][p-bin] L27–36; [upstream command/server.ts][u-cmd] L16–26).
   - **Version check:** it first compares the installed `@cubejs-backend/server-core` version with the package's peer dependency, `1.7.45`. On a mismatch it throws, prints the error and exits 1 ([bin/server.ts][p-bin] L13–25, L38–41; [package.json][p-pkg] L23–35).
   - **Overriding the command:** setting the container command to `cubejs server` would start stock Cube without the routes ([upstream latest.Dockerfile][u-df] L60).
6. **The refresh worker may now run stock `cubejs/cube:v1.7.45`.**
   - **Previous:** it had to run the fork image, because the overlay changed packages both Cube services run (this doc's `95ea166012` Install).
   - **Now:** Cube is unmodified and the README allows either image ([README][p-readme] L35–37).
   - With wechart's `cube.js`, a stock worker refuses only introspection tokens, which wechart doesn't send it (see Install).
7. **Presto, Trino and DuckDB are treated as incremental by class name,** not by edits to their `capabilities()` ([views.ts][p-views] L49–59). For catalog reads the set of incremental drivers is the same as before. What Cube itself sees for those drivers is stock. None is wechart's driver today.

## Install

wechart calls the API over HTTP and has no npm package to install. What changes is the Cube image.

**Build.** From the package's directory:

```sh
cd ~/Work/bi/cube/cube-introspection
docker build -t cube:v1.7.45-introspection-0b6eef90a9 .
```

- The Dockerfile says to build from this directory ([Dockerfile][p-df] L5–7).
- The input note gives the commit-tagged form, `-$(git rev-parse --short=10 HEAD)` (§2.1).
- The caller built with exactly the command above, exit 0 (section C).

**What the build does.**

- **Build stage.** A `node:24.21.0-trixie-slim` stage runs `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run build`, which is `rm -rf dist && tsc -p tsconfig.build.json` ([Dockerfile][p-df] L14–24; [package.json][p-pkg] L17–22). No native code is built.
- **What it compiles against.** The npm-published `@cubejs-backend/*` 1.7.45 ([package.json][p-pkg] L36–47; [package-lock.json][p-lock] L2484–2486, L2703–2705, L2793–2795).
- **Final stage.** `FROM cubejs/cube:${CUBE_VERSION}`, where `CUBE_VERSION` defaults to `v1.7.45` ([Dockerfile][p-df] L12, L26). It copies `dist/src`, `package.json`, `NOTICE` and `README.md` into `/cube/node_modules/cube-introspection/` (L28–29).
- **Runtime modules.** The package runs on the image's own Cube modules, not copies ([Dockerfile][p-df] L1–3). The caller's run shows that it and its peer dependencies resolve there (section C).
- **Changing `CUBE_VERSION`.** Anything other than the peer version gives an image that exits at start ([Dockerfile][p-df] L9–10; [bin/server.ts][p-bin] L13–25).

**The image otherwise is `cubejs/cube:v1.7.45`.**

- The entrypoint and working directory `/cube/conf` are the base's ([upstream latest.Dockerfile][u-df] L56; section C).
- Neither Dockerfile sets `USER` ([Dockerfile][p-df]; [upstream latest.Dockerfile][u-df]). So the default user is the base image's.
- wechart's chart notes "The image runs as root" and runs Cube as uid 1000 (`deploy/helm/wechart/templates/cube.yaml` L47–54). Compose sets no `user:` for Cube (`docker-compose.yml` L78–142).
- The published image is built from `latest.Dockerfile` ([upstream publish.yml][u-publish] L383–403).

**Don't override the container command.**

- The image's `CMD` starts the package's server ([Dockerfile][p-df] L31). A `command:` of `cubejs server` would start stock Cube without the routes (note §2.3).
- Neither wechart's compose nor its Helm chart sets a command for Cube or its worker today (`docker-compose.yml` L78–142; `deploy/helm/wechart/templates/cube.yaml` L57–105).
- Cube's `--debug` output needs the full command, with `--debug` appended to the `node … server.js` form ([bin/server.ts][p-bin] L31–33).

**Platform and registry.**

- **Platform.** Without `--platform`, a build targets "the platform of the BuildKit daemon where the build runs" ([Docker docs][docker-platform]). This host is Apple silicon (`deploy/helm/values/docker-desktop.yaml` L32).
- **Registry.** Per the input note, the image hasn't been pushed (§1). I can't verify a negative.
- **Tags.** The chart's Cube Deployments pull only what isn't there (`imagePullPolicy: IfNotPresent`, `deploy/helm/wechart/templates/cube.yaml` L60). So give each rebuild its own tag (`docs/deploy.md` L42, L44).

**Where it runs today (wechart working tree).**

- **Compose:** `cube` and `cube-refresh-worker` both use `${CUBE_IMAGE:-cube:v1.7.45-introspection-f6355de982}` (`docker-compose.yml` L79, L129).
- **Helm on docker-desktop:** `cube.image: cube:v1.7.45-introspection-f6355de982` (`deploy/helm/values/docker-desktop.yaml` L18). The chart's default is still `cubejs/cube:v1.7.45` (`deploy/helm/wechart/values.yaml` L50). One template serves both Deployments (`templates/cube.yaml` L6, L59).
- **Docs:** `docs/deploy.md` L36–42 and the compose comment (`docker-compose.yml` L70–77) still describe the overlay build. The input note lists the tag and doc changes (§2). They are the caller's to make.

**The two Cube services.**

- Both share one `cube.js` (`docker-compose.yml` L118–120, L142; `templates/cube-config.yaml` L1–13).
- The worker may run this image or stock ([README][p-readme] L35–37).
- **On a stock worker:** wechart's rule returns `['introspection']` only for `wechartIntrospection` tokens (`infra/cube/cube.js` L136). A stock gateway refuses that scope with 500, `A user-defined contextToApiScopes function returns a wrong scope: introspection` ([upstream gateway.ts][u-gw] L2823–2828). wechart sends introspection requests only to the API instance (`packages/api/src/cube/client.ts` L207–223).
- **On this image:** the worker also registers the routes (Gotchas).

**Environment variable.** `CUBEJS_INTROSPECTION_MAX_TABLES` is optional, and caps the tables one `/columns` or `/scaffold` request may name. It defaults to 100 ([README][p-readme] L54–55; [requests.ts][p-req] L9–21).

- It is read each time those two routes build their schema ([requests.ts][p-req] L33–43, L57–64; [gateway.ts][p-gw] L167–170, L183–186).
- If it is set to something other than a positive integer, those two routes answer 500. The other routes are unaffected (source-derived: [requests.ts][p-req] L16–18; [gateway.ts][p-gw] L208–219; [upstream gateway.ts][u-gw] L2578–2587).

## Init / auth pattern

**Authentication** is the JWT wechart already signs.

- It is HS256 with `CUBEJS_API_SECRET`, with `iat` and `exp`, sent as `Bearer` (`packages/api/src/cube/client.ts` L217, L278–303).
- Cube verifies it with `jwt.verify` against each configured secret. It rethrows `TokenExpiredError` at once ([upstream gateway.ts][u-gw] L2641–2646, L2665–2685).
- In production, any failure becomes 403 `{"error":"Invalid token"}` ([upstream gateway.ts][u-gw] L288, L2739–2753; [test][p-t-gw] L158–164). The package's server sets `NODE_ENV=production` ([bin/server.ts][p-bin] L29).

**The scope.**

- **Order.** Every introspection route asserts `introspection` first, then validates, then looks up the data source ([gateway.ts][p-gw] L199–220, L131–191).
- **Defaults.** Cube's defaults are `['graphql','meta','data','sql']` ([upstream gateway.ts][u-gw] L240–241). A test pins that `introspection` is not among them ([test][p-t-gw] L128–134).
- **How the package grants it.** Upstream refuses any scope outside `graphql`, `meta`, `data`, `sql` and `jobs` ([upstream gateway.ts][u-gw] L2808–2841). The package wraps a user-defined `contextToApiScopes`: it takes `introspection` out of what that returns, lets Cube check the rest, then puts it back ([gateway.ts][p-gw] L79–108).
  - `['introspection']` alone works, and grants nothing else ([test][p-t-gw] L136–148).
  - Any other unknown scope still answers 500 ([test][p-t-gw] L150–156).
- **Refusal** is 403 `{"error":"API scope is missing: introspection"}` ([upstream gateway.ts][u-gw] L2843–2860; [test][p-t-gw] L110–126; observed in A and C).
- **`CUBEJS_DEFAULT_API_SCOPES`.** When set, it supplies the defaults ([upstream gateway.ts][u-gw] L2847–2851). It is read as an unchecked comma list ([upstream env.ts][u-env] L1969–1970).
  - With no `contextToApiScopes`, Cube returns that list as-is, and the package falls back to Cube's function ([upstream gateway.ts][u-gw] L2833–2840; [gateway.ts][p-gw] L85–88). So a list naming `introspection` would grant it to every token.

**What wechart has today (working tree).**

- **The scope rule.** `infra/cube/cube.js` L133–138 does three things:
  - it filters `introspection` out of the defaults;
  - it returns those defaults for drafts;
  - it returns `['introspection']` alone when `wechartIntrospection === true`, and defaults plus `jobs` for everything else.
- **The token.** `CubeClient.introspect` gives each request its own 60 s token. It merges `wechartIntrospection: true` into the configured context and refuses any path outside `/v1/introspection/data-sources` (`packages/api/src/cube/client.ts` L207–223, L306–307).
- **Preview.** "Preview as" strips every `wechart…` claim from a user-supplied context, so a previewed context can't claim the scope (`client.ts` L285–294, L316–336).

**Why a dedicated token, off drafts, never in the browser.** The reasons below come from the source:

- **It exposes the warehouse catalog, not the model.**
  - `DataSourceIntrospection` reads schemas, tables, columns and keys straight from the driver ([introspection.ts][p-intro] L103–192). The route checks only the scope ([gateway.ts][p-gw] L199–220). No data model, `queryRewrite` or access policy is involved.
  - `CUBEJS_DB_SCHEMA` doesn't narrow the catalog: the package, the base driver and the Postgres driver never read it (Grep of all three `src` trees at 0b6eef90a9).
- **It is a load lever on the warehouse.**
  - Catalog reads run in the package's queue for the data source, at the query queue's concurrency ([queue.ts][p-queue] L116–145). That is 2 by default on Postgres (`docs/research/cube/data-sources.md` L213). They share the driver instance and its pool with dashboard queries ([server.ts][p-srv] L47–66; [upstream server.ts][u-core] L643–706).
  - One orchestrator, and so one catalog queue per data source, serves every context unless `contextToOrchestratorId` is set ([upstream server.ts][u-core] L234, L587–616).
  - `/columns` and `/scaffold` run three catalog queries per read, two of them at once ([views.ts][p-views] L100–105). `/tables` reads every table in the named schemas, whatever the page size ([gateway.ts][p-gw] L150–157; [requests.ts][p-req] L92–104).
- **Drafts gain nothing and would cost a compile.** Every data-source-scoped call lists data sources, which compiles the context's model ([gateway.ts][p-gw] L237–244, L261–266). A draft context compiles that draft under its own app id (`infra/cube/cube.js` L79–84).
- **Never on every token.** On a stock image, a scope list containing `introspection` makes every scope assertion for that context answer 500 ([upstream gateway.ts][u-gw] L2823–2828). On this image, it would open the catalog to every token.

**Two further hardening steps (both taken).** wechart's working tree now does both (`infra/cube/cube.js` L133–138):

- **It returns only `['introspection']` for the introspection token.** The routes need no other scope, so a leaked token can neither load data nor read `/v1/meta` ([test][p-t-gw] L136–148; [server.test.ts][p-t-srv] L133–137).
- **It filters `introspection` out of `defaultScopes`,** because `CUBEJS_DEFAULT_API_SCOPES` is unchecked (above).

The README's own example also grants `['introspection']` alone ([README][p-readme] L41–52).

**Request details.**

- **Content type.** Send `content-type: application/json` on the POSTs.
  - The body is parsed by body-parser's JSON parser, both globally in Cube's server and on the route ([upstream cubejs-server server.ts][u-cserver] L96; [gateway.ts][p-gw] L118, L161–164, L177–180). Its `type` "Defaults to `application/json`" ([body-parser README][bodyparser] L107–113, version 1.20.8 as read from the package's `node_modules`).
  - An unparsed body validates as `{}`, which answers `"tables" is required` ([gateway.ts][p-gw] L222–224; [test][p-t-gw] L311–312).
  - `CubeClient.introspect` sets the header whenever there is a body (`client.ts` L216).
- **Scope probe** (T176, AC-170), if wanted: `GET /v1/introspection/data-sources/default/tables` with no `schema`.
  - Past the scope it answers 400 `Invalid request: "schema" is required`; without the scope, 403 (observed in A; [test][p-t-gw] L241–248).
  - It reads nothing, because validation runs before the lookup ([gateway.ts][p-gw] L150–155).
  - Today's probe list has no `introspection` (`packages/api/src/cube/scopes.ts` L14).

## API surface we will use

Base: `{CUBE_URL}/cubejs-api/v1/introspection/data-sources` ([README][p-readme] L59–61; [gateway.ts][p-gw] L119).

These rules apply to all five endpoints:

- **Order of checks.** Scope, then validation, then data source lookup, then the catalog query ([gateway.ts][p-gw] L209, L136–137, L151–155, L167–171, L183–187). So a bad request to an unknown data source answers 400, not 404.
- **Middleware.**
  - The routes run the same five middlewares as Cube's own routes ([gateway.ts][p-gw] L111–117; [upstream gateway.ts][u-gw] L316–322).
  - They are registered before Cube's, so Cube's error middleware answers for them too ([gateway.ts][p-gw] L72–77; [upstream gateway.ts][u-gw] L698).
- **Unknown keys are refused** on the four data-source routes, for example 400 `"unexpected" is not allowed` ([test][p-t-gw] L283–294). The list route validates nothing ([gateway.ts][p-gw] L121–129), as in the previous image ([previous gateway.ts][f6-gw]).
- **Error body.** Every error is `{"error": "<message>"}`. `stack` and `requestId` are added only in dev mode or on playground-signed tokens ([upstream gateway.ts][u-gw] L2525–2529).
- **Browsable data sources.** A data source can be browsed if it is declared in `CUBEJS_DATASOURCES` (or is `default` when none are), or if the data model names it ([gateway.ts][p-gw] L231–256; [test][p-t-gw] L167–200).
  - The model's data sources are skipped, with a log line, when the model doesn't compile.
  - Names must match exactly ([gateway.ts][p-gw] L266).

### `GET /v1/introspection/data-sources`

Lists the browsable data sources, sorted, each with its `dbType` ([gateway.ts][p-gw] L121–129, L252–255).

```json
{"dataSources":[{"dataSource":"default","dbType":"postgres"}]}
```

(Observed in A. The caller's comparison in C matched between images.)

### `GET /v1/introspection/data-sources/{dataSource}/schemas`

- **`search`:** optional, at most 256 characters, and `''` is allowed ([requests.ts][p-req] L31, L45–47).
  - It is a case-insensitive substring match. An empty search matches every name ([requests.ts][p-req] L86–87).
  - It is applied in memory after the full list is read ([gateway.ts][p-gw] L136–141).
- **Result:** deduplicated, empty names dropped, sorted with JavaScript's `<`, which is case-sensitive code-unit order ([introspection.ts][p-intro] L59–65, L103–109).
- **Postgres** takes the list from Cube's unchanged query on `information_schema.tables`, grouped by schema ([upstream BaseDriver.ts][u-bd] L124–131, L396–399). The package doesn't replace it ([views.ts][p-views] L318–373).
  - So only schemas holding a table or view the role can see appear.
  - **A schema that holds only materialized views is not listed**, though `/tables?schema=<it>` lists them. That is source-derived.
- Response: `{"schemas":[{"name":"public"}]}` (observed in A, including `search=PUB`; C compared schemas with and without search).

### `GET /v1/introspection/data-sources/{dataSource}/tables`

| Parameter | Rule | Source |
| --- | --- | --- |
| `schema` | **Required**. Repeat it for several. `''` is allowed | [requests.ts][p-req] L25–29, L50 |
| `search` | As for schemas, matched against the table name only | [requests.ts][p-req] L51, L96–98 |
| `type` | Repeatable: `table`, `view`, `materialized_view` or `external`. **`null`-typed tables never match** | [requests.ts][p-req] L23, L52, L97 |
| `limit` | Integer ≥ 1, **no upper cap**. Absent means all | [requests.ts][p-req] L53, L101; [test][p-t-gw] L259–266, L283–294 |
| `offset` | Integer ≥ 0, default 0 | [requests.ts][p-req] L54 |

- **Sorting.** Rows are deduplicated by (schema, name) and sorted by schema, then name ([introspection.ts][p-intro] L111–142).
- **`total`** counts matches after `search` and `type`, before `offset` and `limit` ([requests.ts][p-req] L92–104).
- **Paging and filtering happen in memory,** after every table of the named schemas has been read ([gateway.ts][p-gw] L150–157).
- **`type`** comes from the catalog's word for the relation, which is also returned as `rawType` ([introspection.ts][p-intro] L37–57, L135–140; [test][p-t-intro] L93–114):

  | Word contains | `type` |
  | --- | --- |
  | `MATERIALIZED` | `materialized_view` |
  | `VIEW` | `view` |
  | `EXTERNAL`, `FOREIGN` | `external` |
  | anything else | `table` |
  | no word | `null` |

- **On Postgres the words are:**
  - `BASE TABLE`, `VIEW`, `FOREIGN` and `LOCAL TEMPORARY`, from `information_schema` ([PG docs][pg-tables]);
  - plus `MATERIALIZED VIEW` for every row of `pg_catalog.pg_matviews` in the named schemas ([views.ts][p-views] L124–134, L331–336; [drivers.test.ts][p-t-drv] L105–111).
  - Redshift, Crate and Materialize are left without the `pg_matviews` branch ([views.ts][p-views] L331–336; [catalog-views.test.ts][p-t-views] L160–166).
- **A schema that doesn't exist** contributes no rows. There is no 404 for it ([introspection.ts][p-intro] L111–142).
- **Observed in A:**
  - `?schema=public` answered 3 tables with `total: 3`;
  - `?schema=public&search=ORD&type=table&limit=1&offset=0` answered `orders` with `total: 1`;
  - no `schema` answered 400 `Invalid request: "schema" is required`.
- **Compared in C:** schema, search, type, limit/offset, a second page and a missing schema all matched between images.

### `POST /v1/introspection/data-sources/{dataSource}/columns`

- **Body:** `{"tables":[{"schema":"public","table":"orders"}]}`, with between 1 and `CUBEJS_INTROSPECTION_MAX_TABLES` entries (default 100). Each entry needs `schema` (`''` is allowed) and `table` ([requests.ts][p-req] L33–43, L57–59).
- **Refusal messages** are pinned in tests ([test][p-t-gw] L311–345):
  - `"tables" is required`
  - `"tables" must contain at least 1 items`
  - `"tables[0].table" is required`
  - `"tables[0].schema" is required`
  - `"tables" must contain less than or equal to <max> items`
- **Behaviour.**
  - Duplicate references are collapsed. Tables come back in the order of their first mention ([introspection.ts][p-intro] L149–150, L187–191, L309–315).
  - A table is "missing" when the catalog returned no column rows for it (L171–178).
  - If any table is missing, the answer is 404 `The '<ds>' data source has no table <schema.table>[, …]`, naming every missing table (L178–185; [test][p-t-intro] L166–178). Observed in A. In C, a request naming 100 missing tables matched between images.
- **Per column** ([introspection.ts][p-intro] L71–83):

  | Field | Meaning |
  | --- | --- |
  | `name` | The column name |
  | `rawType` | The catalog's type name |
  | `type` | `columnTypeOf(rawType)`: `time`, `number`, `string` or `boolean` |
  | `primaryKey` | From the driver's primary-key query |
  | `foreignKeys` | `[{schema, table, column}]`. `schema` is `null` when the driver doesn't report it |

- **Postgres specifics.**
  - Columns are ordered by schema, table and `ordinal_position` ([views.ts][p-views] L136–157).
  - Materialized-view columns come from `pg_attribute`, and their `rawType` is `format_type(atttypid, NULL)` (L148–152). That is the SQL type name, for example `bigint` ([drivers.test.ts][p-t-drv] L113–121, not run by me).
  - Foreign keys report the target schema from `constraint_column_usage.table_schema`. They are filtered on the referencing side, so they are reported even when the target table isn't requested ([views.ts][p-views] L159–185; [drivers.test.ts][p-t-drv] L123–131).
  - Primary keys come from Cube's unchanged query ([upstream PostgresDriver.ts][u-pg] L189–199).
  - Observed in B: `{"name":"customer_id",…,"foreignKeys":[{"schema":"public","table":"customers","column":"id"}]}`. C compared one-table, three-table and two-schema requests, including a materialized view and a view.
- **Other drivers.**
  - The package replaces the base driver's column read only where the driver inherits it ([views.ts][p-views] L318–329). BigQuery, Redshift and Databricks override it upstream, so they keep their own ([upstream BigQueryDriver.ts][u-bqd] L273–293; [upstream RedshiftDriver.ts][u-rs] L252; [upstream DatabricksDriver.ts][u-dbx] L621).
  - The base column query has no `ORDER BY`, so drivers that use it, including Crate and Materialize, don't guarantee column order ([upstream BaseDriver.ts][u-bd] L143–154).
  - Key queries that fail are swallowed with a log line, and keys then fall back to heuristics ([upstream BaseDriver.ts][u-bd] L164–200).

### `POST /v1/introspection/data-sources/{dataSource}/scaffold`

- **Body:** the same `tables` as `/columns`, plus an optional `format`: `yaml` (the default) or `js` ([requests.ts][p-req] L61–64). Anything else answers 400 `"format" must be one of [yaml, js]` ([test][p-t-gw] L400–409).
- **Response:** `{"cubes":[{cube, fileName, content, table:{schema,table}, unmappedColumns:[{name, rawType, reason}]}]}`, one entry per distinct table, in order ([introspection.ts][p-intro] L207–256).
  - `fileName` is `<cube>.yml` or `<cube>.js` ([BaseSchemaFormatter.ts][p-bsf] L99–102; [YamlSchemaFormatter.ts][p-ysf] L18–20; [JavaScriptSchemaFormatter.ts][p-jsf] L9–11).
  - Nothing is written anywhere.
- **Errors.**
  - The same 404 as `/columns`, because scaffold calls `columns()` first ([introspection.ts][p-intro] L211).
  - There is no 400 for tables that would share a cube name: they are renamed instead (L278–307).
- **JS format.** `format: js` produced `` cube(`customers`, { sql_table: `public.customers`, … }) `` (observed in A; [JavaScriptSchemaFormatter.ts][p-jsf] L17–20). C compared JS output between images.
  - wechart's model files are YAML (`infra/cube/model/cubes/*.yml`). wechart always asks for YAML (`packages/api/src/model/introspection.ts` L18–19).

#### Generation rules (scaffold)

The generator is a copy of Cube's Playground scaffolding, run with `snakeCase: true` ([introspection.ts][p-intro] L232–247; [upstream DevServer.ts][u-devserver] L185–189). The package adds five things to it ([NOTICE][p-notice] L9–13):

- `numeric` typing;
- cube renaming;
- schema-aware joins;
- time-typed keys;
- numbered members.

- **Cube name.** By default it is `toSnakeCase(table)` ([ScaffoldingSchema.ts][p-ss] L356–359; [utils.ts][p-utils] L3–6, L34–42).
  - If two or more requested tables would get the same default name, each of those is named `toSnakeCase("<schema>_<table>")` instead. That happens with same-named tables in different schemas, or with names that snake-case alike.
  - If that name is already taken in the batch, `_2`, `_3`… is appended ([introspection.ts][p-intro] L278–307).
  - Tables whose default name is unique keep it and are reserved first. For example, `a.b_c`, `x.b_c` and `y.a_b_c` become `a_b_c_2`, `x_b_c` and `a_b_c` ([test][p-t-intro] L291–306).
  - The file name and every join in the batch use the chosen name ([ScaffoldingSchema.ts][p-ss] L385–396, L425–429; [test][p-t-intro] L272–289).
  - Observed in C: same-named tables across schemas became `public_orders` and `introspection_check_orders` on both images.
- **`sql_table: <schema>.<table>`.** A part is quoted with `driver.quoteIdentifier` when it isn't `^[a-z0-9_]+$` ([BaseSchemaFormatter.ts][p-bsf] L158–167, L182–184, L197–203).
- **`data_source: <name>`** is written only when the data source isn't `default` ([introspection.ts][p-intro] L244–247; [BaseSchemaFormatter.ts][p-bsf] L190–195; [test][p-t-intro] L255–261).
- **Column type** is a substring heuristic on the type name, applied to `toSnakeCase(rawType)` in this order ([ScaffoldingSchema.ts][p-ss] L20–43, L459–461):

  | Type name contains | Cube type |
  | --- | --- |
  | `time` or `date` | `time` |
  | `int`, `dec`, `double`, `numb`, `numeric`, `float`, `real`, `serial` or `money` | `number` |
  | `bool` | `boolean` |
  | anything else | `string` |

- **Dimensions** ([ScaffoldingSchema.ts][p-ss] L293–307, L326–346):
  - every `string` or `boolean` column whose name doesn't start with `_`;
  - every key column: a database primary key, or a column named `id` after snake-casing. A key column is one dimension with `primary_key: true`, whatever its type or prefix, **time-typed keys included** (L301–304, L333–338; [test][p-t-st] L432–446; compared in C);
  - then every other non-`_` `time` column, ordered: names containing `create` first, then `update`, then the rest (L448–457);
  - primary keys are rendered first ([BaseSchemaFormatter.ts][p-bsf] L238).
- **Measures.**
  - A `sum` is made for each non-`_` `number` column whose name doesn't match `/_id$|id$/i` and whose snake-cased name *ends with* one of `amount`, `price`, `count`, `balance`, `total`, `number`, `cost`, `qty`, `quantity`, `duration` or `value` ([ScaffoldingSchema.ts][p-ss] L110–124, L309–324).
  - `count: {type: count}` is always added ([BaseSchemaFormatter.ts][p-bsf] L258–262).
- **Member names.**
  - A member's name comes from its column's title: non-alphanumerics become `_`, then the result is lower-cased and snake-cased ([BaseSchemaFormatter.ts][p-bsf] L148–156).
  - **Every member of a cube gets its own name.** The first to take a name keeps it. A later one gets the lowest free `_2`, `_3`…, skipping any name another member would get unnumbered. `count` is reserved for the count measure, and dimensions are named before measures (L105–132).
  - Examples, from the tests:
    - `Amount` and `amount` become `amount` and `amount_2` ([test][p-t-st] L380–396);
    - a number column `count` becomes the sum `count_2` (L398–412);
    - a key column named like a measure is the dimension `entry_total` and the sum `entry_total_2` (L414–430);
    - joins use the renamed member (L448–493).
  - Observed in C: `"Order Id"` and `order_id` produced identical output on both images.
- **Member SQL and titles.**
  - `sql` is the bare column name, or `{CUBE}.<quoted>` when the name isn't `^[a-z0-9_]+$` ([BaseSchemaFormatter.ts][p-bsf] L134–140). Cube prefixes bare identifiers with the cube alias at query time ([upstream BaseQuery.js][u-bq] L3302–3307).
  - `title` is written only when it differs from the default for the *unnumbered* name (L142–146). So a numbered member gets Cube's default title from its numbered name, e.g. "Amount 2" (`introspection-api-f6355de982.md`, "Consequences").
- **Joins** (`many_to_one`) are generated **only between tables in the same request** ([ScaffoldingSchema.ts][p-ss] L376–446; [BaseSchemaFormatter.ts][p-bsf] L17–24, L210–230):
  - **Foreign keys.** Candidates are the requested tables whose *name* equals the foreign key's target table (L383–398):
    - a foreign key that names its target's schema joins only that schema's requested table, or nothing;
    - a foreign key that names no schema prefers the referencing table's own schema. Otherwise it joins the first same-named candidate in request order.
  - **Name heuristic.** It applies to a column *without* foreign keys whose name ends in `_id` or `id` (other than `id`). The column looks for requested tables matching the stem, as singular, plural or name suffix (L399–431):
    - it prefers the table's own schema;
    - otherwise it joins only when exactly one candidate matches, and none when several do;
    - it joins on the same-named column or the target's `id`, and skips its own table.
  - Tests show all three cases ([test][p-t-ss] L607–663).
  - **No fallback.** A column whose foreign keys all point at unrequested tables gets no join, and no heuristic join (L383 vs L399).
  - **Join SQL.** `{CUBE.dim} = {other.dim}` when both sides are dimensions, otherwise `{CUBE}.col = {other}.col`. Renamed members are used ([BaseSchemaFormatter.ts][p-bsf] L78–103, L178–180, L210–219). Observed in A: `"{CUBE}.customer_id = {customers.id}"`.
- **Pre-aggregations.** Every file ends with `pre_aggregations:` holding two comment lines ([BaseSchemaFormatter.ts][p-bsf] L270–276; [YamlSchemaFormatter.ts][p-ysf] L49–54). Cube compiled it unchanged (observed in A).
- **YAML quoting.** A string value is double-quoted only if it contains `{`, `}` or `"` ([YamlSchemaFormatter.ts][p-ysf] L110–116).
- **`unmappedColumns`** lists columns that are neither a dimension nor a measure, compared by column name ([introspection.ts][p-intro] L258–276). Since members are numbered rather than dropped, a mapped column is always in the file. The reasons are:
  - `underscore_prefix`: the name starts with `_`;
  - `numeric_not_measure`: `/columns` typed it `number`, and it is neither a key nor named like a measure;
  - `not_mapped`: the fallback. I found no Postgres column that reaches it, because Postgres's lower-case type names get the same type from `/columns` and from scaffolding.
  - The README lists all three ([README][p-readme] L152–157).
  - **A column used only in a join is still listed.** In A, `customer_id` and `product_id` were listed as `numeric_not_measure`. C found this identical on both images ([test][p-t-intro] L243–253).

### Wire types

Verbatim from [types.ts][p-types] L12–81, trimmed of comments:

```ts
export type DataSourceTableType = 'table' | 'view' | 'materialized_view' | 'external';
export type DataSourceColumnType = 'time' | 'number' | 'string' | 'boolean';
export type DataSourceTableRef = { schema: string; table: string };
export type DataSourceDescription = { dataSource: string; dbType: string };
export type DataSourceTable = { schema: string; name: string; type: DataSourceTableType | null; rawType: string | null };
export type DataSourceForeignKey = { schema: string | null; table: string; column: string };
export type DataSourceColumn = { name: string; rawType: string; type: DataSourceColumnType; primaryKey: boolean; foreignKeys: DataSourceForeignKey[] };
export type DataSourceTableColumns = { schema: string; name: string; columns: DataSourceColumn[] };
export type DataSourceScaffoldFormat = 'yaml' | 'js';
export type DataSourceUnmappedColumnReason = 'underscore_prefix' | 'numeric_not_measure' | 'not_mapped';
export type DataSourceUnmappedColumn = { name: string; rawType: string; reason: DataSourceUnmappedColumnReason };
export type DataSourceScaffoldedCube = { cube: string; fileName: string; content: string; table: DataSourceTableRef; unmappedColumns: DataSourceUnmappedColumn[] };
```

Responses are `{dataSources: DataSourceDescription[]}`, `{schemas: {name: string}[]}`, `{tables: DataSourceTable[], total: number}`, `{tables: DataSourceTableColumns[]}` and `{cubes: DataSourceScaffoldedCube[]}` ([gateway.ts][p-gw] L125–127, L139–141, L156, L172, L188).

### Errors

| Status | Body | When | Source |
| --- | --- | --- | --- |
| 400 | `{"error":"Invalid request: <Joi message>"}` | Query or body fails validation, including unknown keys, too many tables and a bad `format` | [gateway.ts][p-gw] L222–229; [upstream user-error.ts][u-ue] L3–7; [upstream gateway.ts][u-gw] L2537–2544; observed in A and C |
| 403 | `{"error":"API scope is missing: introspection"}` | The scope is missing | [gateway.ts][p-gw] L209; [upstream gateway.ts][u-gw] L2843–2860; observed in A and C |
| 403 | `{"error":"Invalid token"}` | Bad or expired token (production) | [upstream gateway.ts][u-gw] L2739–2753; [test][p-t-gw] L158–164 |
| 404 | `{"error":"Unknown data source: 'nowhere'"}` | The data source isn't browsable | [gateway.ts][p-gw] L261–271; observed in A and C (GET and POST) |
| 404 | `{"error":"The 'default' data source has no table public.ghost"}` | `/columns`, `/scaffold`: a table is missing; every missing table is named | [introspection.ts][p-intro] L178–185; observed in A; C with 100 tables named |
| 200 | `{"error":"Continue wait"}` | A catalog read outlasts the queue's wait timeout | [queue.ts][p-queue] L82–88; [upstream gateway.ts][u-gw] L2545–2552; [README][p-readme] L63–66; unit tests only |
| 500 | `{"error":"Error: <driver message>"}` | The catalog query failed | [upstream QueryQueue.ts][u-qq] L418–432, L1020–1022; [upstream gateway.ts][u-gw] L2578–2587; [test][p-t-intro] L316–326 |
| 500 | `{"error":"Error: A user-defined contextToApiScopes function returns a wrong scope: …"}` | `cube.js` returns an unknown scope other than `introspection` (or, "an inconsistent type", a non-array) | [upstream gateway.ts][u-gw] L2818–2828; [test][p-t-gw] L150–156 |
| 500 | `{"error":"Error: CUBEJS_INTROSPECTION_MAX_TABLES must be a positive integer, not '<value>'"}` | Invalid env var (`/columns`, `/scaffold` only; source-derived) | [requests.ts][p-req] L9–21 |

**Retrying `Continue wait`.**

- **How long the queue waits.** It waits `continueWaitTimeout`, which is 10 s unless configured ([upstream QueryQueue.ts][u-qq] L125, L345–351). The catalog queue takes Cube's `continueWaitTimeout` and then the data source's `queueOptions` ([queue.ts][p-queue] L137–143).
- **Retries re-join the same work.** An identical request re-joins the same read, because the queue key is the operation plus its parameters, in a queue per data source ([queue.ts][p-queue] L69–72, L94–114, L126–127; [upstream QueryQueue.ts][u-qq] L252–268). The unit test answers "Continue wait", then the result, with one catalog read ([catalog-queue.test.ts][p-t-queue] L65–82).
- **Request ids don't matter.** Cube's default is `CUBEJS_QUEUE_EXTERNAL_ID=false`, and with it the request id doesn't affect that lookup ([upstream env.ts][u-env] L2082; [upstream QueryQueue.ts][u-qq] L210–212; [upstream CubeStoreQueueDriver.ts][u-csqd] L62, L79–85, L256–272).
- **What to retry on.** Retry the same request while the answer is 200 `{"error":"Continue wait"}`.
  - The 500 `{"error":"Error: Continue wait"}` form belonged to the `95ea166012` image.
  - wechart retries both forms, up to 30 times (`packages/api/src/model/introspection.ts` L29–37). Keeping the 500 branch is harmless.

## Gotchas

**The package and its image**

- **Pinned to Cube 1.7.45.**
  - The server exits at start on any other `@cubejs-backend/server-core` version ([bin/server.ts][p-bin] L13–25, L38–41; [README][p-readme] L22–24).
  - Moving Cube means moving the package: bump its peer, dev and Dockerfile versions, typecheck, test, and diff its scaffolding and catalog queries against the new Cube ([README][p-readme] L206–214). This is source-only; the refusal was not observed.
- **Don't override the container command** (see Install).
- **The image's user is the base's.** Neither Dockerfile sets `USER` ([Dockerfile][p-df]; [upstream latest.Dockerfile][u-df]).
  - The Helm chart runs Cube as uid 1000 with a read-only root filesystem and `/tmp` as an `emptyDir` (`templates/cube.yaml` L47–56, L90–111).
  - The caller ran the new image as uid 1000 (C). UNVERIFIED: the Helm release on this image.
- **Catalog reads use the package's own queue.** It has the driver, concurrency and wait timeout of Cube's queue for the data source, but separate slots ([queue.ts][p-queue] L46–56, L116–145).
  - The driver instance and its connection pool are Cube's own ([server.ts][p-srv] L47–66; [views.ts][p-views] L11–22).
  - Per the source's own comment, "With Cube Store as the queue, only processes running this package take its jobs" ([queue.ts][p-queue] L53–55). UNVERIFIED in Cube Store itself.
- **How the drivers are changed.** `catalogView` wraps the same driver instance in a `Proxy` ([views.ts][p-views] L318–384):
  - a read of a replaced method returns the package's version;
  - a method is replaced only where the driver's class is the one that defined it upstream, so a driver's own override stays (L321–325, L39–47);
  - everything else, including writes of lazy state such as a connection, reaches the driver (L375–383).
  - Cube's own queries see the driver unchanged ([catalog-views.test.ts][p-t-views] L109–120; [drivers.test.ts][p-t-drv] L133–138).
- **A refresh worker on this image also serves the introspection routes.** This is source-derived and was not observed.
  - The package's server core builds its gateway in every process ([server.ts][p-srv] L30–45). Cube's server calls `initApp` whether or not it is a refresh worker ([upstream cubejs-server server.ts][u-cserver] L94–102; [upstream container.ts][u-container] L213–243; [upstream server-core server.ts][u-core] L451–453).
  - The README and the input note say the worker "serves no introspection routes" ([README][p-readme] L36–37; note §4).
  - The routes still need a token with the scope. wechart's compose worker publishes its port on loopback only (`docker-compose.yml` L140–141). The chart gives the worker a ClusterIP Service (`templates/cube.yaml` L6–23).
- **Cube's own Playground and CLI scaffolding are stock** (see "Differences", item 4).
- **"Nothing is cached" now holds for Cube's cache.** Identical reads that are in flight at the same time run once ([catalog-queue.test.ts][p-t-queue] L65–73).

**Postgres catalog visibility**

- **Primary and foreign keys need ownership.**
  - `table_constraints` "contains all constraints belonging to tables that the current user owns or has some privilege other than `SELECT` on" ([PG docs][pg-tc]).
  - `constraint_column_usage` shows "only those columns … that are contained in a table owned by a currently enabled role" ([PG docs][pg-ccu]).
  - `key_column_usage` shows "only those columns … that the current user has access to, by way of being the owner or having some privilege" ([PG docs][pg-kcu]).
  - Primary keys use the first two views ([upstream PostgresDriver.ts][u-pg] L189–199). Foreign keys use all three ([views.ts][p-views] L164–185). So a SELECT-only role gets `primaryKey: false` and `foreignKeys: []`.
  - Scaffolding then marks only `id` columns as keys, and joins only by `<table>_id` naming ([ScaffoldingSchema.ts][p-ss] L326–331, L399–431). Cube requires a `primary_key` for a join to work ([joins.mdx][u-joins] L281–283).
  - The compose Cube user `sample` owns the sample tables (`docker-compose.yml` L36–42, L91). The Helm values connect as `postgres` (`deploy/helm/values/docker-desktop.yaml` L24). A least-privilege role, which `data-sources.md` recommends (L416), changes the output.
  - Materialized views have no constraints at all, so they only ever get the `id` heuristic.
- **Materialized views follow different visibility rules from tables.**
  - Tables and views come from `information_schema`, which shows "only those tables and views … that the current user has access to" ([PG docs][pg-tables]).
  - Materialized views come from `pg_matviews`, which "provides access to useful information about each materialized view in the database" and documents no privilege filter ([PG docs][pg-matviews]). Their columns come from `pg_attribute` ([views.ts][p-views] L124–157).
  - So a materialized view the role can't `SELECT` may still be listed and scaffolded, and its query would then fail. This is inferred from the docs and was not observed.
  - A schema holding only materialized views is missing from `/schemas` ([upstream BaseDriver.ts][u-bd] L124–131).
- **Materialized-view type names differ from tables'.**
  - A materialized view's `rawType` is `format_type(atttypid, NULL)` ([views.ts][p-views] L148). Tables get `information_schema.columns.data_type` (L145).
  - So arrays and enums are named differently, e.g. `integer[]` or the enum's own name versus `ARRAY` or `USER-DEFINED`. For materialized views, the substring type heuristic runs on user-chosen type names. This is source-derived and was not observed.
- **Partitions are listed separately.** PG 18's `information_schema.tables` includes partitioned tables (`p`) and partitions (`r`) alike ([information_schema.sql][pg-is]).
- **Type mapping is a substring heuristic** ([ScaffoldingSchema.ts][p-ss] L20–43):
  - `interval` and `point` contain `int`, so they are typed `number`. An `interval` named `…duration` becomes a `sum`.
  - `daterange` is typed `time`.
  - `USER-DEFINED` and `ARRAY` become `string`.
- **The catalog is whatever Cube's role can see.** `CUBEJS_DB_SCHEMA` doesn't narrow it (see Init / auth).

**`numeric` is `number` (package change)**

- Upstream v1.7.45 types `numeric` as `string`: its list has `numb`, which `numeric` doesn't contain ([upstream ScaffoldingSchema.ts][u-ss] L385–405). The package adds `numeric` ([ScaffoldingSchema.ts][p-ss] L30; [NOTICE][p-notice] L9; [test][p-t-ss] L749–781).
- A `numeric` column named like a measure becomes a `sum` (observed in A).
- A `numeric` column not named like one (e.g. `rating`) is unmapped as `numeric_not_measure`, where upstream makes it a string dimension. C found numeric typing identical on both images.

**Cube names and the rest of the model**

- **Cube names depend on the batch.** A table keeps its plain name only while no other table in the same request shares it ([introspection.ts][p-intro] L278–307). Read the returned `cube` and `fileName`, and don't predict them.
- **Scaffold ignores the existing model.** Its input is only the requested tables' columns (L211–247), and the `_2` numbering considers only names in the same batch.
  - wechart must detect clashes with the model store itself. Cube names are global, file paths are wechart's (`fileName` is a bare `<cube>.yml`), and join targets are cube names. wechart does this in `packages/api/src/model/clashes.ts` (L6–17), for AC-249.
  - A renamed cube needs the joins that target it in the batch rewritten ([BaseSchemaFormatter.ts][p-bsf] L210–230).
  - A duplicate cube name would fail Cube's compile at publish. A file-path clash would not; it would overwrite in the store.
- **Foreign keys to unrequested tables yield no join.** `/columns` reports them, with their schema, but scaffold joins only among requested tables. It doesn't fall back to the name heuristic for such columns ([ScaffoldingSchema.ts][p-ss] L383–399).
- **A join can still go to another schema, in two cases.** Neither is observed on this image, and neither applies to Postgres foreign keys, which always carry a schema ([views.ts][p-views] L169):
  - a foreign key whose driver reports no schema joins the first same-named requested table in request order when its own schema has none;
  - a `<table>_id` column joins a table in another schema when it is the only candidate ([ScaffoldingSchema.ts][p-ss] L361–374, L385–390, L410–416).
- **Two foreign keys to the same target table** (e.g. `billing_address_id` and `shipping_address_id`) produce joins keyed by the target cube's name, so only the last survives ([BaseSchemaFormatter.ts][p-bsf] L210–230).
- **A self-referencing foreign key** produces a join from the cube to itself. The FK branch doesn't skip its own table, unlike the heuristic ([ScaffoldingSchema.ts][p-ss] L383–398 vs L417–419). UNVERIFIED: whether Cube compiles that.

**Silent losses (AC-139's "dropped without saying so")**

The three losses found at `95ea166012` are closed in the package, as they were at `f6355de982`:

- **Member-name collisions:** numbered instead of dropped ([BaseSchemaFormatter.ts][p-bsf] L105–132; [test][p-t-st] L380–396).
- **A number column that snake-cases to `count`:** it becomes `count_2`, and the count measure stays (L115; [test][p-t-st] L398–412).
- **A time-typed primary key:** listed once, as a key ([ScaffoldingSchema.ts][p-ss] L333–338; [test][p-t-st] L432–446).
- **Compared over HTTP:** C compared clashing names and a time-typed key between images and found them identical.

What remains is about joins (above), and naming:

- A numbered member's name says nothing about which column it came from. Map members to columns by `sql`, not by name (`introspection-api-f6355de982.md`, "Consequences").
- wechart's guard stays: `packages/api/src/model/scaffoldCheck.ts` L3–21 parses each file and confirms two things. Every `/columns` column must appear in `unmappedColumns` or as a member's `sql`, and a `type: count` measure must exist.

**Failures that surface at publish (caught by validate-then-publish)**

- **Invalid identifiers.** Cube and member names must match `^[_a-zA-Z][_a-zA-Z0-9]*$` ([CubeValidator.ts][u-cv] L37–39, L950, L1022, L1169).
  - Cube names come from `toSnakeCase`, which keeps Unicode letters and digits ([utils.ts][p-utils] L3–6). So non-ASCII table names, and table names starting with a digit, fail. The same applies to `<schema>_<table>` names.
  - Member names are ASCII, but can start with a digit ([BaseSchemaFormatter.ts][p-bsf] L148–156).
- **Duplicate member names no longer come from the scaffold.** Dimensions and measures share one name set per cube ([BaseSchemaFormatter.ts][p-bsf] L113–132; [test][p-t-st] L414–430). Cube's `… defined more than once` check still applies to hand edits ([CubeSymbols.ts][u-csym] L556–573).
- **Parse the YAML before saving.** Plain values starting with a YAML-reserved character, such as a backtick-quoted MySQL identifier, would be invalid YAML ([YamlSchemaFormatter.ts][p-ysf] L110–116).

**Behaviour to design around**

- **`/v1/meta` hides the generated `id` dimensions.** `primary_key: true` makes `public` default to `false` ([dimensions.mdx][u-dims] L663–674; observed in A).
- **Numeric foreign-key columns such as `customer_id` are not dimensions** unless they are keys ([ScaffoldingSchema.ts][p-ss] L326–331).
- **Paging doesn't reduce database work.** Search, type filtering and paging happen in memory after a full read ([requests.ts][p-req] L92–104). With no `limit` cap, a single page can be the whole schema.
- **Sorting** is code-unit order, not locale-aware ([introspection.ts][p-intro] L59–65).
- **Empty schema names are dropped from `/schemas`** (L108). For schema-less sources, pass `schema=` directly. This doesn't apply to Postgres.
- **`/columns`' `type` can differ from scaffolding's.** `/columns` types the lower-cased raw name, and scaffolding types the snake-cased name ([introspection.ts][p-intro] L75; [ScaffoldingSchema.ts][p-ss] L20–21, L459–461).
  - For all-caps types with digits such as `INT64`, `toSnakeCase` gives `in_t64`, which is typed `string` ([utils.ts][p-utils] L5).
  - Postgres's lower-case names agree. The README says `type` "is the Cube type scaffolding gives the column" ([README][p-readme] L123–124), which is true only where the two agree.

**Other drivers (not wechart's today)**

- **Incremental schema loading.**
  - Upstream declares `incrementalSchemaLoading: true` for Postgres (Crate and Materialize inherit it), Redshift, MySQL, MSSQL, Snowflake, BigQuery, ClickHouse, Athena and Databricks. That is a Grep of `packages/*/src/*Driver.ts` ([PostgresDriver.ts][u-pg] L528–532; [CrateDriver.ts][u-crate] L9; [MaterializeDriver.ts][u-mz] L31).
  - The package adds Presto (and Trino, which extends it) and DuckDB by class name ([views.ts][p-views] L49–59; [TrinoDriver.ts][u-trino] L8; [test][p-t-views] L243–250).
  - Every other driver reads the whole catalog per call. Its tables have `type: null`, and its columns have no foreign keys ([introspection.ts][p-intro] L103–107, L117–126, L160–169; [test][p-t-intro] L181–200).
  - The README names those drivers: Druid, Dremio, Firebolt, Hive, ksqlDB, MongoBI, Oracle, Pinot, QuestDB, SQLite, Vertica and the generic JDBC driver ([README][p-readme] L72–75).
  - Any `type` filter excludes null-typed tables ([requests.ts][p-req] L97).
- **Databricks types.**
  - `SHOW TABLES` is combined with `SHOW VIEWS`. Views are `VIEW` or `MATERIALIZED VIEW` by `isMaterialized`, and everything else is `TABLE`, so external tables are not told apart ([views.ts][p-views] L279–316, L348).
  - If `SHOW VIEWS` fails, the schema's tables have no type ([catalog-views.test.ts][p-t-views] L198–233, unit tests only).
- **MySQL keys.** The package replaces both key queries ([views.ts][p-views] L187–219, L339–340):
  - primary keys come from `KEY_COLUMN_USAGE AS columns` where `CONSTRAINT_NAME = 'PRIMARY'`;
  - foreign keys come from the referencing row's `referenced_table_schema`, `referenced_table_name` and `referenced_column_name`.
  - **Why.** Upstream's primary-key query has no `columns` alias for the shared condition to name, so it "always fails". Its foreign-key query "names the referencing column as its own target" ([views.ts][p-views] L187, L205; [upstream MySqlDriver.ts][u-mysql] L199–232). A MySQL integration test exists ([drivers.test.ts][p-t-drv] L141–), but I didn't run it.
- **Redshift.** Tables of external schemas, which upstream lists without a type, are typed `EXTERNAL TABLE` ([views.ts][p-views] L350–357; [upstream RedshiftDriver.ts][u-rs] L235). The previous image did the same ([previous RedshiftDriver.ts][f6-rs]).
- **ClickHouse** types come from the table engine ([views.ts][p-views] L233–245).
- **BigQuery.**
  - Table types come from the table metadata ([views.ts][p-views] L247–277). Columns get generic types ([upstream BigQueryDriver.ts][u-bqd] L273–293, L311–325).
  - Its table listing swallows almost every error. It checks `e.toString().indexOf('Not found')`, which is truthy unless the message *starts* with "Not found", and then returns no tables ([views.ts][p-views] L256–259). This is copied from upstream ([upstream BigQueryDriver.ts][u-bqd] L303–307) and is source-derived.

## Observed locally

**Probe setup (A and B).** On 2026-09-25 a probe container ran against wechart's sample Postgres, reachable at `http://localhost:54010/cubejs-api`.

- Tokens were HS256, signed with `probe-secret`, with `exp` at +600 s, sent as a raw `Authorization` value.
- The scripts are `probe.mjs` and `probe2.mjs`. The probe's `cube.js`:

```js
module.exports = {
  contextToApiScopes: async (securityContext, defaultScopes) =>
    securityContext && securityContext.probeIntrospection === true
      ? [...defaultScopes, 'introspection']
      : defaultScopes,
};
```

The probe container's database settings were not recorded. Keys were visible, which implies the owning `sample` role or a superuser.

### A. Image built from `e01fd079d7` (`observed.txt`, `observed2.txt`, `observed3.txt`)

Endpoint results. Paths are relative to `/v1/introspection/data-sources`. The scoped token was used, except in the first row:

| Request | Status | Body |
| --- | --- | --- |
| `GET ` (token without the scope) | 403 | `{"error":"API scope is missing: introspection"}` |
| `GET ` | 200 | `{"dataSources":[{"dataSource":"default","dbType":"postgres"}]}` |
| `GET /default/schemas` | 200 | `{"schemas":[{"name":"public"}]}` |
| `GET /default/schemas?search=PUB` | 200 | `{"schemas":[{"name":"public"}]}` |
| `GET /default/tables?schema=public` | 200 | `{"tables":[{"schema":"public","name":"customers","type":"table","rawType":"BASE TABLE"},{"schema":"public","name":"orders","type":"table","rawType":"BASE TABLE"},{"schema":"public","name":"products","type":"table","rawType":"BASE TABLE"}],"total":3}` |
| `GET /default/tables?schema=public&search=ORD&type=table&limit=1&offset=0` | 200 | `{"tables":[{"schema":"public","name":"orders","type":"table","rawType":"BASE TABLE"}],"total":1}` |
| `GET /default/tables` | 400 | `{"error":"Invalid request: \"schema\" is required"}` |
| `POST /default/columns {"tables":[{"schema":"public","table":"orders"}]}` | 200 | `{"tables":[{"schema":"public","name":"orders","columns":[{"name":"id","rawType":"integer","type":"number","primaryKey":true,"foreignKeys":[]},{"name":"customer_id","rawType":"integer","type":"number","primaryKey":false,"foreignKeys":[{"table":"customers","column":"id"}]},{"name":"product_id","rawType":"integer","type":"number","primaryKey":false,"foreignKeys":[{"table":"products","column":"id"}]},{"name":"status","rawType":"text","type":"string","primaryKey":false,"foreignKeys":[]},{"name":"amount","rawType":"numeric","type":"number","primaryKey":false,"foreignKeys":[]},{"name":"ordered_at","rawType":"timestamp with time zone","type":"time","primaryKey":false,"foreignKeys":[]}]}]}` (FKs without `schema`: that image predates the change) |
| `POST /default/columns {"tables":[{"schema":"public","table":"ghost"},{"schema":"public","table":"orders"}]}` | 404 | `{"error":"The 'default' data source has no table public.ghost"}` |
| `POST /default/scaffold {"tables":[{"schema":"public","table":"orders"}]}` | 200 | `cube` `orders`, `fileName` `orders.yml`, `joins: []`, dimensions `id` (primary key) / `status` / `ordered_at`, measures `count` / `amount` (sum), commented `pre_aggregations`; `"unmappedColumns":[{"name":"customer_id","rawType":"integer","reason":"numeric_not_measure"},{"name":"product_id","rawType":"integer","reason":"numeric_not_measure"}]` |
| `GET /nowhere/schemas` | 404 | `{"error":"Unknown data source: 'nowhere'"}` |
| `POST /default/scaffold {"tables":[]}` | 400 | `{"error":"Invalid request: \"tables\" must contain at least 1 items"}` |

Scaffold of `orders`, `customers` and `products` together (200). This is `orders.yml`, whose unmapped columns were `customer_id` and `product_id`:

```yaml
cubes:
  - name: orders
    sql_table: public.orders

    joins:
      - name: customers
        sql: "{CUBE}.customer_id = {customers.id}"
        relationship: many_to_one

      - name: products
        sql: "{CUBE}.product_id = {products.id}"
        relationship: many_to_one

    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true

      - name: status
        sql: status
        type: string

      - name: ordered_at
        sql: ordered_at
        type: time

    measures:
      - name: count
        type: count

      - name: amount
        sql: amount
        type: sum

    pre_aggregations:
      # Pre-aggregation definitions go here.
      # Learn more in the documentation: https://docs.cube.dev/docs/pre-aggregations/getting-started-pre-aggregations
```

The other two files:

- `customers.yml` had `joins: []`, dimensions `id` (primary key), `name`, `country` and `signed_up_at`, and only `count`. Unmapped: none.
- `products.yml` had `joins: []`, dimensions `id` (primary key), `name` and `category`, and only `count`. Unmapped: none.

`format: js` for `customers` returned `customers.js`, beginning:

```js
cube(`customers`, {
  sql_table: `public.customers`,
```

It had `joins: {}`, the same members, and `pre_aggregations` with `//` comments.

**Compile and query.** The three YAML files were written unchanged into the probe's model and compiled.

- `/v1/meta` returned 200 with `customers` 3 dimensions, `orders` 2 and `products` 2. The measures were `customers.count`, `orders.count`, `orders.amount` and `products.count`. The primary-key `id` dimensions are hidden.
- `/v1/load` across the generated join returned 200:

  ```json
  [{"customers.country":"France","orders.count":"60","orders.amount":"56550.00"},{"customers.country":"United States","orders.count":"60","orders.amount":"57000.00"},{"customers.country":"United Kingdom","orders.count":"60","orders.amount":"57450.00"}]
  ```

### B. Image rebuilt from `95ea166012` (`observed4.txt`)

```
columns 200 {"name":"customer_id","rawType":"integer","type":"number","primaryKey":false,"foreignKeys":[{"schema":"public","table":"customers","column":"id"}]}
tables limit=20000 200 {"tables":[{"schema":"public","name":"customers","type":"table","rawType":"BASE TABLE"},{"schema":"public","name":"order…
```

The second line was truncated in the probe's own output.

The `f6355de982` image's observations are in `introspection-api-f6355de982.md`, "Observed".

### C. Image built from the package at `0b6eef90a9` (the caller's observations, 2026-09-25)

These are the caller's results, reported as given. I did not run them.

**Build and image.**

- `docker build -t cube:v1.7.45-introspection-0b6eef90a9 .` from `~/Work/bi/cube/cube-introspection` exited 0.
- Image config:
  - entrypoint `docker-entrypoint.sh`, the same as the old image and stock;
  - working directory `/cube/conf`;
  - CMD `node /cube/node_modules/cube-introspection/dist/src/bin/server.js`. The old image's was `cubejs server`.

**Run.** The new image ran as uid 1000 beside the old image (`cube:v1.7.45-introspection-f6355de982`):

- with the compose Cube's environment;
- with wechart's `infra/cube/cube.js` and model mounted;
- on the same network, against the same sample Postgres.

**Comparison.** 38 requests were sent to both images and compared byte for byte, status and body. **0 differed.** They covered:

- the data-source list;
- schemas with and without `search`;
- tables with `schema`, `search`, `type`, `limit`/`offset`, a second page, and a missing schema;
- 400s: no `schema`, an unknown key, `limit=0`, no body, an empty list, no table name, a bad scaffold format, and 101 tables over the default cap of 100;
- 404s: an unknown data source for GET and for POST, missing tables for `/columns` and `/scaffold`, and 100 missing tables named;
- columns for one and for three tables, and across two schemas with a materialized view and a view;
- scaffold in YAML and JS, with:
  - same-named tables across schemas, renamed `public_orders` and `introspection_check_orders` on both;
  - clashing member names (`"Order Id"` and `order_id`);
  - a time-typed primary key;
  - numeric typing, where `unmappedColumns` reason `numeric_not_measure` was identical;
- the scope refusal (403);
- Cube's own `/v1/meta`, `/v1/sql`, `/readyz` and `/livez`, and a `/v1/load`'s data.

The temporary schema used for the harder cases was dropped afterwards.

**What C settles.** On this image and the old one, identically:

- same-named tables across schemas, over HTTP;
- materialized-view and view columns;
- clashing member names;
- a time-typed key;
- the default table cap;
- a 404 naming 100 tables.

It does not show what those bodies contain beyond the cube names given.

**Not observed on any image:**

- "Continue wait" over HTTP, a driver failure, and an invalid or non-default `CUBEJS_INTROSPECTION_MAX_TABLES`;
- a SELECT-only role, and a materialized view the role can't `SELECT`;
- the Helm release on this image (northwind, read-only root filesystem);
- the refresh worker on this image, and whether it answers the introspection routes;
- the server's refusal to start on another Cube version;
- a scaffolded self-join compiled by Cube.

## What it means for wechart's flow

The flow runs browse → pick → preview → generate → review → save → publish.

- Every Cube call goes from wechart's API through `CubeClient.introspect`, never from the browser (`packages/api/src/cube/client.ts` L197–223).
- The browser's routes are `/api/introspection/sources…` (`packages/api/src/model/introspection.ts` L14–21, L124–145).

1. **Browse.**
   - List data sources with `GET …/data-sources`, then schemas with `GET …/{ds}/schemas?search=`.
   - List tables with `GET …/{ds}/tables?schema=…&search=…&type=…&limit=…&offset=…`, showing `total` for paging.
   - On Postgres, materialized views are listed with `type: materialized_view`. A schema holding only materialized views won't be in `/schemas`.
2. **Pick.**
   - Up to `CUBEJS_INTROSPECTION_MAX_TABLES` tables per request.
   - Same-named tables from different schemas can go in one request, and get `<schema>_<table>` names.
   - Include foreign-key targets in the same request to get joins.
3. **Preview (optional).**
   - `POST …/{ds}/columns` gives `rawType`, the predicted `type`, `primaryKey`, and `foreignKeys` with the target schema.
   - On Postgres, columns come in ordinal order.
   - With a role that doesn't own the tables, keys come back empty.
4. **Generate.** `POST …/{ds}/scaffold` with `format: "yaml"`. Retry "Continue wait" (200). The retry of the old 500 form is harmless.
5. **Review.**
   - Show each cube's returned `cube` name, its YAML, and its `unmappedColumns` with reasons.
   - Columns that only drive a join are listed as unmapped.
   - wechart's own checks:
     - cube-name and file-path clashes with the model store, run on the *returned* names (`packages/api/src/model/clashes.ts`, AC-249);
     - on rename, rewrite the joins in the batch that target the old name;
     - the loss guard (`packages/api/src/model/scaffoldCheck.ts`);
     - warn when a cube with joins has no primary key;
     - warn when a join went to a table in a different schema from its foreign key's. Now only possible for schema-less foreign keys or a sole heuristic candidate.
6. **Save** the files to wechart's model store.
7. **Publish** through validate-then-publish (AC-136, AC-137). Cube's compile of the draft catches invalid identifiers.

**T145's failing test** maps onto the scaffold response:

- `cubes` has one entry per distinct requested table, or the request fails as a whole ([introspection.ts][p-intro] L207–256);
- `unmappedColumns` reports the columns left out, and no mapped column is dropped from the file (Gotchas, "Silent losses").

The remaining gap is a product choice: numeric non-key columns that aren't named like measures are reported rather than turned into dimensions.

**Decisions.**

- **Settled in the working tree:**
  - both hardening steps (`infra/cube/cube.js` L133–138);
  - refusing and naming clashes (AC-249);
  - a "Continue wait" retry bound of 30 tries (`packages/api/src/model/introspection.ts` L29–30);
  - the fork's "Continue wait" fix (in the package).
- **Open, as far as this doc can tell:**
  - whether AC-139's "columns mapped to dimensions" should turn `numeric_not_measure` and foreign-key columns into dimensions;
  - whether generated `id` dimensions should be `public`;
  - who may generate cubes;
  - whether wechart adds joins to cubes that already exist;
  - where the image is published for the Helm chart (the chart default is still stock);
  - whether to take the input note's tag and doc changes (§2).

**Sibling research this supersedes when the fork image runs.** These rows describe stock Core and stay true for it:

- `docs/research/cube/data-sources.md` L382;
- `docs/research/cube-capabilities.md` L34 and L119 (§6 "Schema and table browsing");
- `docs/research/cube/configuration-deployment.md` L686 and L711–712.

A replacement for the §6 row, for the doc owner:

| Capability | Core/Cloud | API or config surface | wechart surface | Phase 1 | Source |
| --- | --- | --- | --- | --- | --- |
| Schema and table browsing, generate cubes | Stock Core: dev-only `/playground/db-schema` and `/generate-schema`. Fork image `cube:v1.7.45-introspection-<commit>` (package `cube-introspection` on unmodified Cube v1.7.45): production API with the `introspection` scope | `GET /v1/introspection/data-sources`, `…/{ds}/schemas`, `…/{ds}/tables`; `POST …/{ds}/columns`, `…/{ds}/scaffold`; `CUBEJS_INTROSPECTION_MAX_TABLES` | Table browser, generate cubes | as the spec decides for AC-139 / AC-250 | [introspection-api](./cube/introspection-api.md) |

## Alternatives considered

Not requested by the caller.

## Open questions / unverified

1. **UNVERIFIED: "Continue wait" as 200 over HTTP.** Shown by source and unit tests only ([catalog-queue.test.ts][p-t-queue] L75–82; [gateway.test.ts][p-t-gw] L360–369).
2. **UNVERIFIED: the driver-failure 500, and `CUBEJS_INTROSPECTION_MAX_TABLES` set to a non-default or invalid value.** Source only. The previous parser's handling of an empty string was not checked.
3. **UNVERIFIED: Cube Store queue behaviour.** How long it keeps an unfetched result, and whether only processes running the package take its jobs (the latter is the package's own comment, [queue.ts][p-queue] L53–55).
4. **UNVERIFIED: a refresh worker on this image serving the introspection routes.** This is derived from the source, and contradicts the README and the input note §4. Not observed.
5. **UNVERIFIED: the Helm release on this image.** That covers northwind, uid 1000 with a read-only root filesystem, and the chart's worker.
6. **UNVERIFIED: the version refusal at start.** Source only.
7. **UNVERIFIED: materialized views a role can't `SELECT`, and a SELECT-only Postgres role yielding empty keys.** From the PostgreSQL docs and the SQL.
8. **UNVERIFIED: whether Cube compiles a scaffolded self-join.**
9. **UNVERIFIED: cross-schema join rules on this image beyond C's same-named case.**
   - The foreign-key-with-schema case was observed on `f6355de982` by the Cube-expert agent (`introspection-api-f6355de982.md`, "Observed").
   - Here it is shown by unit tests ([scaffolding-schema.test.ts][p-t-ss] L607–663).
10. **UNVERIFIED: MySQL, Trino, Databricks, BigQuery, ClickHouse and Redshift behaviour.** The source and unit tests were read, but the integration tests were not run and no live database was used.
11. **The checkout versus the commit.**
    - I read the working tree at branch ref `0b6eef90a969167b5dcd1ccaec3283567a1f914a` without git, and did not confirm it is clean.
    - "No file of Cube's own is changed" comes from the input note. It is spot-checked here (see "Line numbers" at the top).
    - The package compiles against npm's `@cubejs-backend/*` 1.7.45, not the checkout's `packages/` ([package-lock.json][p-lock] L2484–2486).
12. **Context7 was not used.** The package exists only in the fork, and upstream facts were read from Cube's v1.7.45 source.
13. **Input-note claims** (`docs/inputs/2026-09-25-cube-introspection-package.md`). Each was checked against the sources above.
    - **Confirmed:**
      - §1: branch, commit and package location. The HTTP API is unchanged, per the source and the caller's 38-request comparison (the note's own run was 28 requests).
      - §2: the build command, and "neither sets a command today".
      - §3: every row.
      - §4: the pin to 1.7.45 and the refusal to start; catalog reads on the package's queue with the same driver, concurrency and wait timeout; the refresh worker running either image; Cube's own fixes being gone; the Postgres, MySQL and `numeric` fixes being kept.
    - **Not confirmed:**
      - §4 "The image starts as uid 1000". Neither Dockerfile sets `USER`; the Helm chart sets the uid.
      - §4 "it serves no introspection routes" for a worker running this image.
      - §1 "`git diff … ` is empty" and "not pushed". Not checkable without a shell or registry access.
14. **Pointers for the caller.**
    - `introspection-api-f6355de982.md` opens with "Everything that doc says still holds, except where this doc corrects it". That refers to this doc's `95ea166012` text, which this revision replaces.
    - `docs/research/country-map.md` L343 cites this doc's L559 for the `/v1/load` strings. That line moves with this revision, and its content is kept in section A.
15. **Stale wechart text, for the caller.** These describe the old image and don't affect behaviour:
    - `packages/api/src/model/introspection.ts` L23–26 says Cube reads the catalog "through the data source's query queue" and that "the fork lets the queue's error escape as `500`";
    - `docker-compose.yml` L70–77 and `docs/deploy.md` L36–42 describe the overlay build.

[p-tree]: https://github.com/senthilkrajagopal/cube/tree/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection
[p-readme]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/README.md
[p-df]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/Dockerfile
[p-notice]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/NOTICE
[p-pkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package.json
[p-lock]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package-lock.json
[p-gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
[p-req]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/requests.ts
[p-types]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/types.ts
[p-intro]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/introspection.ts
[p-srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
[p-bin]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/bin/server.ts
[p-queue]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/catalog/queue.ts
[p-views]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/catalog/views.ts
[p-ss]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/ScaffoldingSchema.ts
[p-bsf]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/formatters/BaseSchemaFormatter.ts
[p-ysf]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/formatters/YamlSchemaFormatter.ts
[p-jsf]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/formatters/JavaScriptSchemaFormatter.ts
[p-utils]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/scaffolding/utils.ts
[p-t-gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/gateway.test.ts
[p-t-intro]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/introspection.test.ts
[p-t-queue]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/catalog-queue.test.ts
[p-t-views]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/catalog-views.test.ts
[p-t-ss]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/scaffolding-schema.test.ts
[p-t-st]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/unit/scaffolding-template.test.ts
[p-t-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/integration/drivers.test.ts
[p-t-srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/test/integration/server.test.ts
[f-commit2]: https://github.com/senthilkrajagopal/cube/commit/95ea166012f2988c7a702d7c6890d9810e5a320b
[f6-gw]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-api-gateway/src/gateway.ts
[f6-dsi]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-server-core/src/core/DataSourceIntrospection.ts
[f6-env]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-backend-shared/src/env.ts
[f6-pg]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[f6-rs]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-redshift-driver/src/RedshiftDriver.ts
[u-gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[u-ue]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/user-error.ts
[u-env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[u-qq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[u-qc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[u-qo]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[u-lqdc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/LocalQueueDriverConnection.ts
[u-csqd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/CubeStoreQueueDriver.ts
[u-core]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[u-devserver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/DevServer.ts
[u-cmd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/command/server.ts
[u-container]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/container.ts
[u-cserver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
[u-bd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-base-driver/src/BaseDriver.ts
[u-pg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[u-mysql]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[u-rs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-redshift-driver/src/RedshiftDriver.ts
[u-crate]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-crate-driver/src/CrateDriver.ts
[u-mz]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-materialize-driver/src/MaterializeDriver.ts
[u-trino]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-trino-driver/src/TrinoDriver.ts
[u-dbx]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-databricks-jdbc-driver/src/DatabricksDriver.ts
[u-bqd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts
[u-ss]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
[u-cv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[u-csym]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[u-bq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[u-dims]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/dimensions.mdx
[u-joins]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/joins.mdx
[u-df]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
[u-publish]: https://github.com/cube-js/cube/blob/v1.7.45/.github/workflows/publish.yml
[u-yarnlock]: https://github.com/cube-js/cube/blob/v1.7.45/yarn.lock
[envvar-int]: https://unpkg.com/env-var@6.3.0/lib/accessors/int.js
[envvar-intpos]: https://unpkg.com/env-var@6.3.0/lib/accessors/int-positive.js
[bodyparser]: https://unpkg.com/body-parser@1.20.8/README.md
[pg-tables]: https://www.postgresql.org/docs/current/infoschema-tables.html
[pg-tc]: https://www.postgresql.org/docs/current/infoschema-table-constraints.html
[pg-ccu]: https://www.postgresql.org/docs/current/infoschema-constraint-column-usage.html
[pg-kcu]: https://www.postgresql.org/docs/current/infoschema-key-column-usage.html
[pg-matviews]: https://www.postgresql.org/docs/current/view-pg-matviews.html
[pg-is]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/catalog/information_schema.sql
[docker-platform]: https://docs.docker.com/reference/cli/docker/buildx/build/
