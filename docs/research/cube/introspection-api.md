---
library: Cube data-source introspection API (fork senthilkrajagopal/cube, branch feat/data-source-introspection-api)
packages: []
# Upstream Cube v1.7.45 plus the fork's commits e01fd079d7 and 95ea166012 (the full SHA of the second is the version). It is an HTTP API, so there are no import names.
version: 1.7.45+95ea166012f2988c7a702d7c6890d9810e5a320b
researched: 2026-09-25
sources:
  - https://github.com/senthilkrajagopal/cube/commit/95ea166012f2988c7a702d7c6890d9810e5a320b
  - https://github.com/senthilkrajagopal/cube/commit/e01fd079d7a985232c71bd29dce4a0a9e65b3c0c
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/data-sources.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/types/data-sources.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/src/core/DataSourceIntrospection.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/formatters/BaseSchemaFormatter.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-postgres-driver/src/PostgresDriver.ts
  - https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-docker/overlay.Dockerfile
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
  - https://www.postgresql.org/docs/current/infoschema-tables.html
  - https://www.postgresql.org/docs/current/infoschema-table-constraints.html
  - https://www.postgresql.org/docs/current/infoschema-constraint-column-usage.html
  - https://www.postgresql.org/docs/current/view-pg-matviews.html
---

# Cube data-source introspection API (fork) 1.7.45 + 95ea166012

**Revision.** This doc was first written against fork commit `e01fd079d7` and revised on the same day for `95ea166012f2988c7a702d7c6890d9810e5a320b`, "feat(api-gateway): close the introspection API's gaps". The newer commit's parent is `e01fd07` ([commit][f-commit2]).

**Line numbers** refer to `95ea166012`. I read them in the local checkout `/Users/srajagopal/Work/bi/cube`, whose branch ref is that SHA. Every fork link points at that commit.

**Observed** means the local probe on 2026-09-25 (see "Observed locally"). Most of the probe ran against the image built from `e01fd079d7`. Two checks ran against the image rebuilt from `95ea166012`. Each observation says which image it came from.

## Summary

**What it is.** Five HTTP endpoints under `{base_path}/v1/introspection/data-sources` ([gateway.ts][f-gw] L629–703). They list the data sources that can be browsed, list a data source's schemas and the tables in them, read the columns of up to `CUBEJS_INTROSPECTION_MAX_TABLES` tables (default 100), and **scaffold** a cube per table. The scaffold returns YAML or JS and writes nothing.

- **Scope.** The endpoints are gated by a new API scope, `introspection`, which is not in Cube's defaults ([gateway.ts][f-gw] L253–254, L1205–1216; [REST index][f-idx] L181–194).
- **Implementation.** `DataSourceIntrospection` reads the catalog through the driver, using the data source's query queue. It generates cubes with Cube's own Playground scaffolding code ([DataSourceIntrospection.ts][f-dsi] L78–87, L193–255; [DevServer.ts][f-devserver] L185–189).

**Why wechart uses it.** AC-139 (F15, T145) says: "WHEN the user generates cubes from a data source, THE SYSTEM SHALL browse that connection's schemas and tables and create a cube per selected table with its columns mapped to dimensions and a count measure." It fails when "a selected table produces no cube, or a column is dropped without saying so."

- It was deferred because Core had no production API for browsing tables. Core's browsing and generation routes are dev-only and unauthenticated (`docs/research/cube/data-sources.md` L255–259, L382; `docs/research/cube/configuration-deployment.md` L686, L711–712).
- With the fork image, wechart's server can browse, preview and generate through Cube in production mode. It then saves the YAML to its own model store and publishes it through the existing validate-then-publish flow (AC-136, AC-137).
- wechart's working tree already references this doc as T275 / AC-250 (`infra/cube/cube.js` L123–135; `packages/api/src/cube/client.ts` L166–192).

**What `95ea166012` changed.** Each change was checked against its source:

| Change | Source |
| --- | --- |
| `/tables` `limit` is at least 1, with no upper cap | [data-sources.ts][f-ds] L36; [test][f-gwtest] L218–225; observed with `limit=20000` on the 95ea image |
| `/columns` and `/scaffold` take at most `CUBEJS_INTROSPECTION_MAX_TABLES` tables (default 100), read on each request | [data-sources.ts][f-ds] L16–26; [env.ts][f-env] L305–307; [env var doc][f-envdoc] L1296–1304; [test][f-gwtest] L289–304 |
| Foreign keys carry the target `schema`, or `null` when the driver doesn't report it. Postgres and MySQL report it | [types][f-types] L37–42; [DataSourceIntrospection.ts][f-dsi] L70–74; [PostgresDriver.ts][f-pg] L261; [MySqlDriver.ts][f-mysql] L223; observed on the 95ea image |
| Same-named tables across schemas become `<schema>_<table>` (cube, file and joins), numbered `_2`, `_3`… on a further clash. The earlier 400 on duplicate cube names is gone | [DataSourceIntrospection.ts][f-dsi] L200–202, L231–236, L277–306; [unit tests][f-dsitest] L260–294 |
| A join to a name that exists in several schemas prefers the FK's schema, or else the table's own. It falls back to any same-named table when the preferred schema has none (see Gotchas) | [ScaffoldingSchema.ts][f-ss] L356–413 |
| Postgres materialized views are listed via `pg_matviews`, with columns from `pg_attribute` | [PostgresDriver.ts][f-pg] L189–239; [integration test][f-pgtest] L240–277 (not run by me) |
| Postgres columns come back in ordinal order | [PostgresDriver.ts][f-pg] L237 |
| MySQL primary and foreign keys are reported | [MySqlDriver.ts][f-mysql] L199–231 |
| The set of drivers with incremental schema loading has changed | Grep of `incrementalSchemaLoading: true` (see Gotchas) |
| Databricks tells views apart via `SHOW VIEWS` | [DatabricksDriver.ts][f-dbx] L614–655 |

**Key findings:**

1. **The endpoints behave as documented for the normal cases.**
   - Observed on the e01fd079d7 image: scope refusal, listing, search, type filter, paging, `total`, validation errors, a missing table, an unknown data source, and one-table and three-table scaffolds. The three generated YAML files compiled unchanged, and a `/v1/load` across the generated join answered.
   - Observed on the 95ea166012 image: the new FK `schema` and an uncapped `limit`.
2. **`Continue wait` still comes back as a 500, not the documented 200.**
   - `95ea166012` did not touch this path. `DataSourceIntrospection` lets the queue's `ContinueWaitError` escape unconverted ([QueryQueue.ts][f-qq] L349–351; [DataSourceIntrospection.ts][f-dsi] L97–191).
   - The gateway recognises only an object whose `error` is `'Continue wait'` ([gateway.ts][f-gw] L2714). A plain `Error` falls through to **500 `{"error":"Error: Continue wait"}`** (L2747–2756).
   - The reference doc still says 200 ([reference.mdx][f-ref] L755–758). The gateway test injects the object form, not what the implementation throws ([data-sources.test.ts][f-gwtest] L319–328).
   - This is source-derived and was not observed.
3. **On Postgres, primary and foreign keys still need a role that owns the tables.**
   - Both key queries read `information_schema.table_constraints` and `constraint_column_usage` ([PostgresDriver.ts][f-pg] L241–277).
   - `table_constraints` shows only constraints on tables the user "owns or has some privilege other than `SELECT` on" ([PG docs][pg-tc]).
   - `constraint_column_usage` shows only columns "contained in a table owned by a currently enabled role" ([PG docs][pg-ccu]).
4. **The scaffold can still drop a column, or the count measure, without reporting it.** The renderer is unchanged: it merges members by generated name ([BaseSchemaFormatter.ts][f-bsf] L186–210), while `unmappedColumns` compares column names ([DataSourceIntrospection.ts][f-dsi] L257–275).
5. **Generated cube names now depend on the batch.** `public.orders` alone is `orders`; requested alongside `sales.orders`, it is `public_orders` ([DataSourceIntrospection.ts][f-dsi] L277–306). Nothing checks names against wechart's existing model.
6. **Keep the scope on a dedicated short-lived token with a `wechart`-prefixed claim.** wechart's working tree does this already, with `wechartIntrospection: true` and a 60 s token (`infra/cube/cube.js` L123–135; `packages/api/src/cube/client.ts` L176–192, L276). Two further hardening steps are recommended under Init / auth.
7. **"Nothing is cached" needs a qualifier.**
   - Every call asks the database, because `forceNoCache` is set ([QueryOrchestrator.ts][f-qo] L501–512; [QueryCache.ts][f-qc] L1279–1282).
   - Results are still written to Cube's cache driver with a 30-day expiry ([QueryOrchestrator.ts][f-qo] L493; [QueryCache.ts][f-qc] L1191–1193).

## Install

There is no npm package; wechart calls the API over HTTP. What changes is the Cube image.

**Build.** From the fork's root:

```sh
docker build -f packages/cubejs-docker/overlay.Dockerfile -t cube:v1.7.45-introspection .
```

([overlay.Dockerfile][f-overlay] L8–10)

**What the build does.**

- A `node:24.21.0-trixie-slim` stage runs `yarn install --frozen-lockfile --ignore-scripts`, then `tsc --build` for **sixteen** packages ([overlay.Dockerfile][f-overlay] L14–40):
  - core: `backend-shared`, `api-gateway`, `server-core`, `query-orchestrator`, `base-driver`, `schema-compiler`;
  - drivers: postgres, redshift, crate, materialize, mysql, bigquery, clickhouse, prestodb, duckdb, databricks-jdbc.
- The final stage is `FROM cubejs/cube:v1.7.45`. It copies each package's `dist` over `/cube/node_modules/@cubejs-backend/<pkg>/dist` (L42–59).
- No native code is rebuilt (L1–2).
- The base image's release must equal the packages' version, "or the overlaid packages and the rest of the image drift apart" (L4–6).
- `backend-shared` is overlaid because the new environment variable is read through it ([env.ts][f-env] L305–307).

**Platform and registry.**

- Without `--platform`, a build targets "the platform of the BuildKit daemon where the build runs" ([Docker docs][docker-platform]). This host is Apple silicon (`deploy/helm/values/docker-desktop.yaml` L26).
- Per the input note, the image hasn't been pushed; I can't verify a negative.
- Docker Desktop's Kubernetes ran wechart's locally built images, and the Cube Deployment's pull policy is `IfNotPresent`. Give each rebuild its own tag, because an upgrade to the same tag doesn't restart the pods (`docs/deploy.md` L36; `deploy/helm/wechart/templates/cube.yaml` L60).
- The fork image was rebuilt under the same tag, `cube:v1.7.45-introspection`. That is fine for compose but not for the chart.

**Where it runs today.**

- **Compose:** `cube` and `cube-refresh-worker` both use `${CUBE_IMAGE:-cube:v1.7.45-introspection}` (`docker-compose.yml` L66–73, L122–123).
- **Helm:** `cube.image` is still `cubejs/cube:v1.7.45` (`deploy/helm/wechart/values.yaml` L49–50). One template uses it for both Deployments (`templates/cube.yaml` L6, L59).

**Both Cube services must run the same image.**

- They share one `cube.js` (`docker-compose.yml` L112–114, L136; `templates/cube-config.yaml` L1–13).
- A stock gateway throws `A user-defined contextToApiScopes function returns a wrong scope: introspection` whenever a context's scopes include it ([upstream gateway.ts][u-gw]). That becomes a 500 through the generic error branch ([gateway.ts][f-gw] L2747–2756), and the worker serves the REST API too (`docker-compose.yml` L130–135).
- The fork also changes packages both instances run (schema-compiler, query-orchestrator, base driver, Postgres driver, shared env) ([commit 1][f-commit1]; [commit 2][f-commit2]).

**New environment variable.** `CUBEJS_INTROSPECTION_MAX_TABLES` is optional, a positive integer, default `100` ([env.ts][f-env] L305–307; [env var doc][f-envdoc] L1296–1304).

- It is read each time `/columns` or `/scaffold` validates a request ([data-sources.ts][f-ds] L16–26, L40–47; [gateway.ts][f-gw] L678–698).
- A value that isn't a positive integer should make `asIntPositive()` throw inside the handler, so every `/columns` and `/scaffold` call would 500 ([gateway.ts][f-gw] L1214–1224, L2747–2756). This is source-derived and was not observed.

## Init / auth pattern

**Authentication** is the JWT wechart already signs:

- HS256 with `CUBEJS_API_SECRET`, `iat` and `exp`, sent as `Bearer` (`packages/api/src/cube/client.ts` L247–272).
- Cube verifies it with `jwt.verify` and rethrows `TokenExpiredError`, so `exp` is enforced ([gateway.ts][f-gw] L2810–2815, L2842–2843).

**The scope.**

- Every introspection route first asserts `introspection`, then validates, then looks up the data source ([gateway.ts][f-gw] L1205–1216, L643–703).
- The defaults are `['graphql','meta','data','sql']` ([gateway.ts][f-gw] L253–254). A test pins that `introspection` is not among them ([data-sources.test.ts][f-gwtest] L117–123).
- The fork's gateway accepts `introspection` from a user-defined `contextToApiScopes` ([gateway.ts][f-gw] L2993).
- Refusal is 403 `{"error":"API scope is missing: introspection"}` ([gateway.ts][f-gw] L3012–3029; observed on the e01fd079d7 image).
- `defaultScopes` come from `CUBEJS_DEFAULT_API_SCOPES` when it is set ([gateway.ts][f-gw] L3016–3020). That value is read as an unchecked comma list ([env.ts][f-env] L1972–1973).

**What wechart has today (working tree).**

- `infra/cube/cube.js` L130–135 returns:
  - the defaults for drafts;
  - defaults plus `introspection` when `wechartIntrospection === true`;
  - defaults plus `jobs` for everything else.
- `CubeClient.introspect` gives each request its own 60 s token. It merges `wechartIntrospection: true` into the configured context, which carries `wechartStore`, and refuses any path outside `/v1/introspection/data-sources` (`packages/api/src/cube/client.ts` L176–192, L276; `packages/api/src/server.ts` L184–192).
- "Preview as" strips every `wechart…` claim from user-supplied contexts, so a previewed context can't claim the scope (`client.ts` L285–305).

**Why a dedicated token, off drafts, never in the browser.** The reasons below come from the source:

- **It exposes the warehouse catalog, not the model.** `DataSourceIntrospection` reads schemas, tables, columns and keys straight from the driver ([DataSourceIntrospection.ts][f-dsi] L97–191). The route checks only the scope ([gateway.ts][f-gw] L1205–1226). No data model, `queryRewrite` or access policy is involved. `CUBEJS_DB_SCHEMA` doesn't narrow the catalog: neither the base driver nor the Postgres driver reads it (Grep of both `src` trees at 95ea166012).
- **It is a load lever on the warehouse and on dashboards.** Every context shares one orchestrator unless `contextToOrchestratorId` is set, so catalog queries share `/v1/load`'s queue ([server.ts][f-server] L234). Postgres's default queue concurrency is 2 (`docs/research/cube/data-sources.md` L213). `/columns` and `/scaffold` each run three catalog queries ([BaseDriver.ts][f-bd] L437–442). `/tables` reads every table in the named schemas, whatever the page size ([data-sources.ts][f-ds] L72–87).
- **Drafts gain nothing and would cost a compile.** Every data-source-scoped call lists data sources, which compiles the context's model ([gateway.ts][f-gw] L1243–1250, L1267–1272). A draft context compiles that draft under its own app id (`infra/cube/cube.js` L72–84).
- **Never on every token.** On a stock image, a scope list containing `introspection` makes every request with that context 500 ([upstream gateway.ts][u-gw]; [gateway.ts][f-gw] L2987–2998).

**Two further hardening steps are recommended.** Neither is in the working tree yet:

- **Return only `['introspection']` for the introspection token.** The routes need no other scope ([gateway.ts][f-gw] L1215), and a leaked token could then neither load data nor read `/v1/meta`.
- **Filter `introspection` out of `defaultScopes`.** wechart spreads the defaults into every result (`infra/cube/cube.js` L131–134), so a `CUBEJS_DEFAULT_API_SCOPES` that named `introspection` would grant it to every token.

```js
contextToApiScopes: async (securityContext, defaultScopes) => {
  const context = securityContext || {};
  const defaults = defaultScopes.filter((scope) => scope !== 'introspection'); // CUBEJS_DEFAULT_API_SCOPES is unchecked
  if (context.wechartDraft !== undefined) return defaults;
  if (context.wechartIntrospection === true) return ['introspection'];
  return [...defaults, 'jobs'];
},
```

**Request details.**

- Send `content-type: application/json` on the POSTs. They go through `jsonParser` ([gateway.ts][f-gw] L673–676, L689–692); without the header the body is empty and validation fails with `"tables" is required` ([data-sources.test.ts][f-gwtest] L270–271). `CubeClient.introspect` sets the header when there is a body (`client.ts` L185).
- **Scope probe** (T176, AC-170), if wanted: `GET /v1/introspection/data-sources/default/tables` with no `schema`.
  - It answers 400 `Invalid request: "schema" is required` once past the scope, and 403 without it (observed on the e01fd079d7 image).
  - It reads nothing, because validation runs before the lookup ([gateway.ts][f-gw] L662–668).
  - Today's probe list has no `introspection` (`packages/api/src/cube/scopes.ts` L14).

## API surface we will use

Base: `{CUBE_URL}/cubejs-api/v1/introspection/data-sources` ([gateway.ts][f-gw] L633–703).

These rules apply to all five endpoints:

- **Order of checks.** Scope, then validation, then data source lookup, then the catalog query ([gateway.ts][f-gw] L1205–1216, L643–703). A bad request to an unknown data source therefore answers 400, not 404.
- **Unknown keys are refused,** for example 400 `"unexpected" is not allowed` ([data-sources.test.ts][f-gwtest] L242–253).
- **Error body.** Every error is `{"error": "<message>"}`. `stack` and `requestId` are added only in dev mode or on playground-signed tokens ([gateway.ts][f-gw] L2694–2713).
- **Browsable data sources.** A data source can be browsed if it is declared in `CUBEJS_DATASOURCES` (or is `default` when none are), or if the data model names it. The model's data sources are skipped, with a log line, when the model doesn't compile. Names must match exactly ([gateway.ts][f-gw] L1237–1274; [data-sources.test.ts][f-gwtest] L126–178).

### `GET /v1/introspection/data-sources`

Lists the browsable data sources, sorted, each with its `dbType` ([gateway.ts][f-gw] L1243–1262).

```json
{"dataSources":[{"dataSource":"default","dbType":"postgres"}]}
```

(observed, e01fd079d7 image)

### `GET /v1/introspection/data-sources/{dataSource}/schemas`

- **`search`:** optional, at most 256 characters, `''` allowed. It is a case-insensitive substring match, applied in memory after the full list is read ([data-sources.ts][f-ds] L14, L28–30, L65–70; [gateway.ts][f-gw] L647–653).
- **Result:** deduplicated, empty names dropped, sorted with JavaScript's `<`, which is case-sensitive code-unit order ([DataSourceIntrospection.ts][f-dsi] L52–58, L97–104).
- **Postgres** takes the list from `information_schema.tables` grouped by schema, unchanged in 95ea166012 ([BaseDriver.ts][f-bd] L124–131, L398–401). So only schemas holding a table or view the role can see appear. **A schema that holds only materialized views is not listed**, though `/tables?schema=<it>` lists them. That is source-derived.
- Response: `{"schemas":[{"name":"public"}]}` (observed, e01fd079d7 image, including `search=PUB`).

### `GET /v1/introspection/data-sources/{dataSource}/tables`

| Parameter | Rule | Source |
| --- | --- | --- |
| `schema` | **Required**; repeat it for several; `''` allowed | [data-sources.ts][f-ds] L8–12, L33 |
| `search` | As for schemas; matched against the table name only | [data-sources.ts][f-ds] L34, L79–81 |
| `type` | Repeatable: `table`, `view`, `materialized_view` or `external`. **`null`-typed tables never match** | [data-sources.ts][f-ds] L6, L35, L80 |
| `limit` | Integer ≥ 1, **no upper cap**; absent means all | [data-sources.ts][f-ds] L36, L84; [test][f-gwtest] L218–225, L244; observed `limit=20000` → 200 (95ea image) |
| `offset` | Integer ≥ 0, default 0 | [data-sources.ts][f-ds] L37 |

- **Sorting.** Rows are deduplicated by (schema, name) and sorted by schema, then name ([DataSourceIntrospection.ts][f-dsi] L106–139).
- **`total`** counts matches after `search` and `type`, before `offset` and `limit` ([data-sources.ts][f-ds] L72–87).
- **Paging and filtering happen in memory** after every table of the named schemas has been read ([gateway.ts][f-gw] L662–669).
- **`type`** comes from the catalog's word for the relation, which is also returned as `rawType` ([DataSourceIntrospection.ts][f-dsi] L35–50, L132–137):

  | Word contains | `type` |
  | --- | --- |
  | `MATERIALIZED` | `materialized_view` |
  | `VIEW` | `view` |
  | `EXTERNAL`, `FOREIGN` | `external` |
  | anything else | `table` |
  | no word | `null` |

- **On Postgres the words are:**
  - `BASE TABLE`, `VIEW`, `FOREIGN` and `LOCAL TEMPORARY`, from `information_schema` ([PG docs][pg-tables]);
  - plus `MATERIALIZED VIEW` for every row of `pg_catalog.pg_matviews` in the named schemas ([PostgresDriver.ts][f-pg] L198–212).
  - Redshift, Crate and Materialize turn the materialized-view branch off ([RedshiftDriver.ts][f-rs] L60–62; [CrateDriver.ts][f-crate] L10–12; [MaterializeDriver.ts][f-mz] L32–34).
- **A schema that doesn't exist** contributes no rows. There is no 404 for it ([DataSourceIntrospection.ts][f-dsi] L106–139).
- Observed on the e01fd079d7 image:
  - `?schema=public` answered 3 tables with `total: 3`;
  - `?schema=public&search=ORD&type=table&limit=1&offset=0` answered `orders` with `total: 1`;
  - no `schema` answered 400 `Invalid request: "schema" is required`.

### `POST /v1/introspection/data-sources/{dataSource}/columns`

- **Body:** `{"tables":[{"schema":"public","table":"orders"}]}`, holding between 1 and `CUBEJS_INTROSPECTION_MAX_TABLES` entries (default 100). Each entry needs `schema` (`''` allowed) and `table` ([data-sources.ts][f-ds] L16–26, L40–42).
- **Refusal messages** are pinned in tests: `"tables" is required`, `must contain at least 1 items`, `"tables[0].table" is required`, `"tables[0].schema" is required`, and `"tables" must contain less than or equal to <max> items` ([data-sources.test.ts][f-gwtest] L270–304).
- **Behaviour.**
  - Duplicate references are collapsed. Tables come back in the order of their first mention ([DataSourceIntrospection.ts][f-dsi] L147, L186–190, L308–314).
  - A table is "missing" when the catalog returned no column rows for it (L170–177).
  - If any table is missing: 404 `The '<ds>' data source has no table <schema.table>[, …]`, naming every missing table (L177–184; [unit test][f-dsitest] L154–166; observed on the e01fd079d7 image).
- **Per column** ([DataSourceIntrospection.ts][f-dsi] L64–76):

  | Field | Meaning |
  | --- | --- |
  | `name` | The column name |
  | `rawType` | The catalog's type name |
  | `type` | `columnTypeOf(rawType)`: `time`, `number`, `string` or `boolean` |
  | `primaryKey` | From the driver's primary-key query |
  | `foreignKeys` | `[{schema, table, column}]`; `schema` is `null` when the driver doesn't report it |

- **Postgres specifics.**
  - Columns are ordered by schema, table and `ordinal_position` ([PostgresDriver.ts][f-pg] L237).
  - Materialized-view columns come from `pg_attribute`, and their `rawType` is `format_type(atttypid, NULL)` (L226–235). That is the SQL type name, for example `bigint` ([integration test][f-pgtest] L267–277).
  - FKs report the target schema from `constraint_column_usage.table_schema`, and they are reported even when the target table isn't requested ([PostgresDriver.ts][f-pg] L253–277).
  - Observed on the 95ea image: `{"name":"customer_id",…,"foreignKeys":[{"schema":"public","table":"customers","column":"id"}]}`.
- **Other drivers.** The base query has no `ORDER BY`, so drivers that use it, including Redshift, Crate and Materialize, don't guarantee column order ([BaseDriver.ts][f-bd] L144–155; [PostgresDriver.ts][f-pg] L214–217). Key queries that fail are swallowed with a log line, and keys then fall back to heuristics ([BaseDriver.ts][f-bd] L165–201).

### `POST /v1/introspection/data-sources/{dataSource}/scaffold`

- **Body:** the same `tables` as `/columns`, plus optional `format`, `yaml` (the default) or `js` ([data-sources.ts][f-ds] L44–47).
- **Response:** `{"cubes":[{cube, fileName, content, table:{schema,table}, unmappedColumns:[{name, rawType, reason}]}]}`, one entry per distinct table, in order ([DataSourceIntrospection.ts][f-dsi] L206–255).
  - `fileName` is `<cube>.yml` or `<cube>.js` ([BaseSchemaFormatter.ts][f-bsf] L88–91).
  - Nothing is written anywhere.
- **Errors.** The same 404 as `/columns`, because scaffold calls `columns()` first ([DataSourceIntrospection.ts][f-dsi] L210). **There is no longer a 400 for tables that would share a cube name:** `UserError` and the distinct-name assertion are gone, replaced by renaming (L8–19, L231–236).
- **JS format.** `format: js` produced `cube(\`customers\`, { sql_table: \`public.customers\`, … })` (observed, e01fd079d7 image; [JavaScriptSchemaFormatter.ts][f-jsf] L15–18). wechart's model files are YAML (`infra/cube/model/cubes/*.yml`).

#### Generation rules (scaffold)

The generator is Cube's Playground scaffolding with `snakeCase: true` ([DataSourceIntrospection.ts][f-dsi] L231–246; [DevServer.ts][f-devserver] L185–189). The fork adds three things: `numeric` typing (see Gotchas), cube renaming, and the schema-aware joins below.

- **Cube name.** By default `toSnakeCase(table)` ([ScaffoldingSchema.ts][f-ss] L351–354; [utils.ts][f-utils] L32–40). If two or more requested tables would get the same default name, each of those is named `toSnakeCase("<schema>_<table>")` instead.
  - If that name is already taken in the batch, `_2`, `_3`… is appended ([DataSourceIntrospection.ts][f-dsi] L277–306).
  - Tables whose default name is unique keep it and are reserved first. For example, `a.b_c`, `x.b_c` and `y.a_b_c` become `a_b_c_2`, `x_b_c` and `a_b_c` ([unit test][f-dsitest] L279–294).
  - The file name and every join in the batch use the chosen name ([BaseSchemaFormatter.ts][f-bsf] L70–91, L158–178; [unit test][f-dsitest] L260–277).
- **`sql_table: <schema>.<table>`.** A part is quoted with `driver.quoteIdentifier` when it isn't `^[a-z0-9_]+$` ([BaseSchemaFormatter.ts][f-bsf] L118–132, L145–148).
- **`data_source: <name>`** is written only when the data source isn't `default` ([DataSourceIntrospection.ts][f-dsi] L243–246; [BaseSchemaFormatter.ts][f-bsf] L138–143).
- **Column type** is a substring heuristic on the type name, applied to `toSnakeCase(rawType)` in this order ([ScaffoldingSchema.ts][f-ss] L18–41, L441–443):

  | Type name contains | Cube type |
  | --- | --- |
  | `time` or `date` | `time` |
  | `int`, `dec`, `double`, `numb`, `numeric`, `float`, `real`, `serial` or `money` | `number` |
  | `bool` | `boolean` |
  | anything else | `string` |

- **Dimensions** ([ScaffoldingSchema.ts][f-ss] L291–305, L324–341):
  - every non-`_` `string` or `boolean` column;
  - every key column: a database primary key, or a column named `id` after snake-casing. Key columns get `primary_key: true` whatever their type or prefix (L299–302);
  - then every non-`_` `time` column, ordered: names containing `create` first, then `update`, then the rest (L430–439);
  - primary keys are rendered first ([BaseSchemaFormatter.ts][f-bsf] L186).
- **Measures.**
  - A `sum` for each non-`_` `number` column whose name doesn't match `/_id$|id$/i` and whose snake-cased name *ends with* one of `amount`, `price`, `count`, `balance`, `total`, `number`, `cost`, `qty`, `quantity`, `duration` or `value` ([ScaffoldingSchema.ts][f-ss] L108–122, L307–322).
  - Plus `count: {type: count}` ([BaseSchemaFormatter.ts][f-bsf] L198–210).
- **Member names and SQL.**
  - The name is derived from the column's title: non-alphanumerics become `_`, then the result is lower-cased and snake-cased ([BaseSchemaFormatter.ts][f-bsf] L108–116).
  - `sql` is the bare column name, or `{CUBE}.<quoted>` when the name isn't `^[a-z0-9_]+$` (L94–100).
  - Cube prefixes bare identifiers with the cube alias at query time ([BaseQuery.js][f-bq] L3302–3307).
  - `title` is written only when it differs from the default (L102–106).
- **Joins** (`many_to_one`) are generated **only between tables in the same request** ([ScaffoldingSchema.ts][f-ss] L223–249, L366–428; [BaseSchemaFormatter.ts][f-bsf] L15–22, L158–178):
  - **Foreign keys.** Candidates are the requested tables whose *name* equals the FK's target table. Of those, the ones in the FK's `schema` are preferred; when the driver reported no schema, the ones in the referencing table's own schema. **If none are in that schema, all candidates remain**, and the first in request order is joined (L356–386).
  - **Name heuristic.** A column *without* FKs whose name ends in `_id` or `id` (other than `id`) looks for requested tables matching the stem, singular, plural or as a name suffix. It prefers the table's own schema; otherwise it joins **every** candidate. It joins on the same-named column or the target's `id`, and skips its own table (L387–413).
  - **No fallback.** A column whose FKs all point at unrequested tables gets no join and no heuristic join (L373 vs L387).
  - **Join SQL.** `{CUBE.dim} = {other.dim}` when both sides are dimensions, otherwise `{CUBE}.col = {other}.col` ([BaseSchemaFormatter.ts][f-bsf] L70–86, L158–168). Observed on the e01fd079d7 image: `"{CUBE}.customer_id = {customers.id}"`.
- **Pre-aggregations.** Every file ends with `pre_aggregations:` holding two comment lines ([BaseSchemaFormatter.ts][f-bsf] L218–224; [YamlSchemaFormatter.ts][f-ysf] L47–52). Cube compiled it unchanged (observed, e01fd079d7 image).
- **YAML quoting.** A string value is double-quoted only if it contains `{`, `}` or `"` ([YamlSchemaFormatter.ts][f-ysf] L108–114).
- **`unmappedColumns`** lists columns that are neither a dimension nor a measure, compared **by column name** ([DataSourceIntrospection.ts][f-dsi] L257–275). Reasons:
  - `underscore_prefix`: the name starts with `_`;
  - `numeric_not_measure`: `/columns` typed it `number`, and it is neither a key nor named like a measure;
  - `not_mapped`: the fallback. I found no Postgres column that reaches it, because Postgres's lower-case type names get the same type from `/columns` and from scaffolding. The reference doc lists only the first two ([reference.mdx][f-ref] L853–855).
  - **A column used only in a join is still listed:** observed `customer_id` and `product_id` as `numeric_not_measure` on the e01fd079d7 image.

### Wire types

Verbatim from [types/data-sources.ts][f-types] L12–81, trimmed of comments:

```ts
export type DataSourceTableType = 'table' | 'view' | 'materialized_view' | 'external';
export type DataSourceColumnType = 'time' | 'number' | 'string' | 'boolean';
export type DataSourceTableRef = { schema: string; table: string };
export type DataSourceDescription = { dataSource: string; dbType: string };
export type DataSourceTable = { schema: string; name: string; type: DataSourceTableType | null; rawType: string | null };
export type DataSourceForeignKey = { schema: string | null; table: string; column: string };
export type DataSourceColumn = { name: string; rawType: string; type: DataSourceColumnType; primaryKey: boolean; foreignKeys: DataSourceForeignKey[] };
export type DataSourceTableColumns = { schema: string; name: string; columns: DataSourceColumn[] };
export type DataSourceUnmappedColumnReason = 'underscore_prefix' | 'numeric_not_measure' | 'not_mapped';
export type DataSourceUnmappedColumn = { name: string; rawType: string; reason: DataSourceUnmappedColumnReason };
export type DataSourceScaffoldedCube = { cube: string; fileName: string; content: string; table: DataSourceTableRef; unmappedColumns: DataSourceUnmappedColumn[] };
```

Responses: `{dataSources: DataSourceDescription[]}`, `{schemas: {name: string}[]}`, `{tables: DataSourceTable[], total: number}`, `{tables: DataSourceTableColumns[]}` and `{cubes: DataSourceScaffoldedCube[]}` ([gateway.ts][f-gw] L637–700).

### Errors

| Status | Body | When | Source |
| --- | --- | --- | --- |
| 400 | `{"error":"Invalid request: <Joi message>"}` | Query or body fails validation, including unknown keys and too many tables | [gateway.ts][f-gw] L1228–1235; observed (e01fd079d7 image) |
| 403 | `{"error":"API scope is missing: introspection"}` | The scope is missing | [gateway.ts][f-gw] L3012–3029; observed (e01fd079d7 image) |
| 404 | `{"error":"Unknown data source: 'nowhere'"}` | The data source isn't browsable | [gateway.ts][f-gw] L1267–1274; observed (e01fd079d7 image) |
| 404 | `{"error":"The 'default' data source has no table public.ghost"}` | `/columns`, `/scaffold`: a table is missing; all are named | [DataSourceIntrospection.ts][f-dsi] L177–184; observed (e01fd079d7 image) |
| 200 | `{"error":"Continue wait"}` | **Documented** for a queue wait timeout | [reference.mdx][f-ref] L755–758; **contradicted by the source** |
| 500 | `{"error":"Error: Continue wait"}` | **What the source produces** for that case (source-derived, not observed) | [QueryQueue.ts][f-qq] L349–351; [ContinueWaitError.ts][f-cwe] L1–5; [gateway.ts][f-gw] L2714, L2747–2756 |
| 500 | `{"error":"Error: <driver message>"}` | The catalog query failed | [QueryQueue.ts][f-qq] L418–432, L1019–1022; [gateway.ts][f-gw] L2747–2756 |
| 500 | `{"error":"Error: A user-defined contextToApiScopes function returns a wrong scope: …"}` | `cube.js` returns a scope the gateway doesn't know | [gateway.ts][f-gw] L2987–2998 |
| 500 | The env-var library's error | `CUBEJS_INTROSPECTION_MAX_TABLES` isn't a positive integer (`/columns`, `/scaffold`; source-derived) | [env.ts][f-env] L305–307; [data-sources.ts][f-ds] L25 |

**The earlier 400 for duplicate cube names is gone** (see the scaffold section).

**Retrying `Continue wait`.**

- The queue waits `continueWaitTimeout`, 10 s unless configured ([QueryQueue.ts][f-qq] L125, L345–351).
- The identical request re-joins the same work by query key: the operation plus its parameters plus the data source ([QueryQueue.ts][f-qq] L252–254, L266–268; [QueryOrchestrator.ts][f-qo] L470–478, L496–499).
- With Cube's default `CUBEJS_QUEUE_EXTERNAL_ID=false`, the request id doesn't matter to that lookup ([env.ts][f-env] L2085; [CubeStoreQueueDriver.ts][f-csqd] L256–272).
- So retry the same request while the answer is 200 `{"error":"Continue wait"}` **or** 500 `{"error":"Error: Continue wait"}`. `CubeClient.introspect` returns status and body without throwing, so its caller must check both (`packages/api/src/cube/client.ts` L176–192).

## Gotchas

**The fork itself**

- **`Continue wait` surfaces as 500, still true at 95ea166012.**
  - `/v1/load` converts `ContinueWaitError` in `OrchestratorApi` ([OrchestratorApi.ts][f-oapi] L124–136).
  - `DataSourceIntrospection` calls `QueryOrchestrator` directly and doesn't convert it ([DataSourceIntrospection.ts][f-dsi] L97–191, L316–327).
  - The fix belongs in the fork: catch `ContinueWaitError` and rethrow `{ error: 'Continue wait' }`.
- **It is a fork, not upstream.**
  - Stock v1.7.45 has no such routes and refuses the scope ([upstream gateway.ts][u-gw]).
  - The overlay replaces sixteen packages' `dist` and must stay on its base release ([overlay.Dockerfile][f-overlay] L4–6, L42–59).
- **"Nothing is cached" is only half true.**
  - Every call asks the database ([QueryOrchestrator.ts][f-qo] L501–512).
  - Results are still written to the cache driver with a 30-day expiry ([QueryCache.ts][f-qc] L1166–1204).
- **Orchestrator metadata methods are fixed only in the fork.**
  - `METADATA:` queries go to the queue's `metadata` handler ([QueryCache.ts][f-qc] L88–92, L603–613, L670–679, L807–836).
  - Upstream sends every non-persistent query through the `query` handler ([upstream QueryCache.ts][u-qc]). The upstream failure itself was not reproduced.

**Postgres catalog visibility**

- **Primary and foreign keys need ownership.** A SELECT-only role gets `primaryKey: false` and `foreignKeys: []` everywhere ([PG docs][pg-tc]; [PG docs][pg-ccu]; [PostgresDriver.ts][f-pg] L241–277).
  - Scaffolding then marks only `id` columns as keys, and joins only by `<table>_id` naming ([ScaffoldingSchema.ts][f-ss] L299–302, L387–413).
  - Cube requires a `primary_key` for a join to work ([joins.mdx][f-joins] L281–283).
  - The compose Cube user `sample` owns the sample tables (`docker-compose.yml` L36–38, L85). The Helm values connect as `postgres` (`deploy/helm/values/docker-desktop.yaml` L18). A least-privilege role, which `data-sources.md` recommends (L416), changes the output.
  - Materialized views have no constraints at all, so they only ever get the `id` heuristic.
- **Materialized views follow different visibility rules from tables.** Tables and views come from `information_schema`, which shows "only those tables and views … that the current user has access to" ([PG docs][pg-tables]). Materialized views come from `pg_matviews`, which "provides access to useful information about each materialized view in the database" and documents no privilege filter ([PG docs][pg-matviews]); their columns come from `pg_attribute` ([PostgresDriver.ts][f-pg] L198–239).
  - So a materialized view the role can't `SELECT` may still be listed and scaffolded. Its query would then fail. This is inferred from the docs and was not observed.
  - A schema holding only materialized views is missing from `/schemas` ([BaseDriver.ts][f-bd] L124–131).
- **Materialized-view type names differ from tables'.** A materialized view's `rawType` is `format_type(atttypid, NULL)` ([PostgresDriver.ts][f-pg] L230), while tables get `information_schema.columns.data_type`. Arrays and enums are therefore named differently: e.g. `integer[]` or the enum's own name, versus `ARRAY` or `USER-DEFINED`. For materialized views, the substring type heuristic runs on user-chosen type names. This is source-derived and was not observed.
- **Partitions are listed separately.** PG 18's `information_schema.tables` includes partitioned tables (`p`) and partitions (`r`) alike ([information_schema.sql][pg-is]).
- **Type mapping is a substring heuristic** ([ScaffoldingSchema.ts][f-ss] L18–41).
  - `interval` and `point` contain `int`, so they are typed `number`. An `interval` named `…duration` becomes a `sum`.
  - `daterange` is typed `time`.
  - `USER-DEFINED` and `ARRAY` become `string`.
- **The catalog is whatever Cube's role can see.** `CUBEJS_DB_SCHEMA` doesn't narrow it (see Init / auth).

**`numeric` is now `number` (fork change)**

- Upstream v1.7.45 lacks `numeric` in its list ([upstream ScaffoldingSchema.ts][u-ss]); the fork adds it ([ScaffoldingSchema.ts][f-ss] L28).
- A `numeric` column named like a measure becomes a `sum` (observed, e01fd079d7 image).
- A `numeric` column not named like one (e.g. `rating`) is now unmapped as `numeric_not_measure`, where upstream made it a string dimension.

**Cube names and the rest of the model**

- **Cube names depend on the batch.** A table keeps its plain name only while no other table in the same request shares it ([DataSourceIntrospection.ts][f-dsi] L277–306). Regenerating `public.orders` alone yields `orders`; regenerating it alongside `sales.orders` yields `public_orders`. Read the returned `cube` and `fileName`, and don't predict them.
- **Scaffold ignores the existing model.** Its input is only the requested tables' columns (L210–236), and the `_2` numbering considers only names in the same batch.
  - wechart must detect clashes with the model store itself: cube names are global; file paths are wechart's, since `fileName` is a bare `<cube>.yml`; join targets are cube names.
  - A renamed cube needs the joins that target it in the batch rewritten ([BaseSchemaFormatter.ts][f-bsf] L158–178).
  - A duplicate cube name would fail Cube's compile at publish. A file-path clash would not; it would overwrite in the store.
- **FKs to unrequested tables yield no join.** `/columns` reports them, including their schema, but scaffold joins only among requested tables and doesn't fall back to the name heuristic for such columns ([ScaffoldingSchema.ts][f-ss] L373–387).
- **A join can still land on a same-named table in another schema.**
  - When no requested table is in the preferred schema, the FK branch joins the first same-named table in request order, whatever its schema ([ScaffoldingSchema.ts][f-ss] L360–364, L375–378). For example, an FK to `crm.customers` joins a requested `public.customers` when `crm.customers` isn't requested.
  - In the same situation, the name heuristic joins every same-named candidate (L398–412).
  - This is source-derived and was not observed.
- **Two FKs to the same target table** (e.g. `billing_address_id` and `shipping_address_id`) produce joins keyed by the target cube's name, so only the last survives ([BaseSchemaFormatter.ts][f-bsf] L158–178).
- **A self-referencing FK** produces a join from the cube to itself. The FK branch doesn't skip its own table, unlike the heuristic ([ScaffoldingSchema.ts][f-ss] L373–386 vs L398–401). Whether Cube compiles that is UNVERIFIED.

**Silent losses (AC-139's "dropped without saying so")**

The formatter is unchanged in 95ea166012, so these still hold:

- **Member-name collisions.** Two columns whose generated member names coincide both count as mapped, and the renderer keeps only the last. Examples: `Amount` and `amount`, or names differing only in punctuation or non-ASCII letters ([BaseSchemaFormatter.ts][f-bsf] L108–116, L186–210; [DataSourceIntrospection.ts][f-dsi] L257–264).
- **A numeric column that snake-cases to `count`** replaces the generated `count: {type: count}` with its `sum` ([BaseSchemaFormatter.ts][f-bsf] L198–210; [ScaffoldingSchema.ts][f-ss] L320–322).
- **A time-typed primary key** is emitted twice under one name. The later entry has no `primary_key` ([ScaffoldingSchema.ts][f-ss] L299–302, L324–340; [BaseSchemaFormatter.ts][f-bsf] L186–197).
- **A check that catches all three.** Parse each `content` and confirm two things: every `/columns` column appears either in `unmappedColumns` or as a member's `sql`, and a `type: count` measure exists.

**Failures that surface at publish (caught by validate-then-publish)**

- **Invalid identifiers.** Cube and member names must match `^[_a-zA-Z][_a-zA-Z0-9]*$` ([CubeValidator.ts][f-cv] L37–39, L950, L1022, L1169). Table names starting with a digit fail. Non-ASCII table names also fail, because `toSnakeCase` keeps letters ([utils.ts][f-utils] L1–3). The same applies to `<schema>_<table>` names.
- **A dimension and a measure with the same name** fail with `… defined more than once` ([CubeSymbols.ts][f-csym] L556–573).
- **Parse the YAML before saving.** Plain values starting with a YAML-reserved character, such as a backtick-quoted MySQL identifier, would be invalid YAML ([YamlSchemaFormatter.ts][f-ysf] L108–114).

**Behaviour to design around**

- **`/v1/meta` hides the generated `id` dimensions.** `primary_key: true` makes `public` default to `false` ([dimensions.mdx][f-dims] L663–674; observed on the e01fd079d7 image).
- **Numeric FK columns such as `customer_id` are not dimensions** unless they are keys ([ScaffoldingSchema.ts][f-ss] L324–329).
- **Paging doesn't reduce database work.** Search, type filtering and paging are in memory after a full read ([data-sources.ts][f-ds] L72–87). With no `limit` cap, a single page can be the whole schema.
- **Shared queue.** Catalog queries share the queue and connection pool that dashboard queries use (see Init / auth).
- **Sorting** is code-unit order, not locale-aware ([DataSourceIntrospection.ts][f-dsi] L52–58).
- **Empty schema names are dropped from `/schemas`** (L103). For schema-less sources, pass `schema=` directly. This doesn't apply to Postgres.
- **`/columns`' `type` can differ from scaffolding's.** `/columns` types the raw name and scaffolding types the snake-cased name ([DataSourceIntrospection.ts][f-dsi] L64–68 vs [ScaffoldingSchema.ts][f-ss] L441–443). For all-caps types with digits such as `INT64`, `toSnakeCase` gives `in_t64`, which is typed `string` ([utils.ts][f-utils] L3). Postgres's lower-case names agree.

**Other drivers (not wechart's today)**

- **Incremental schema loading.** These declare `incrementalSchemaLoading: true`: Postgres (Crate and Materialize inherit it, Redshift declares it), MySQL, MSSQL, Snowflake, BigQuery, ClickHouse, Athena, Databricks, DuckDB, and Presto (Trino extends it). Source: a Grep across driver sources at 95ea166012 ([PostgresDriver.ts][f-pg] L586–590; [MySqlDriver.ts][f-mysql] L482–485; [TrinoDriver.ts][f-trino] L8).
  - Every other driver reads the whole catalog per call and reports `type: null` ([DataSourceIntrospection.ts][f-dsi] L85–86, L119–123). That includes Druid, Firebolt, the generic JDBC driver, MongoBI, Pinot and ksqlDB, which I checked; the reference doc also names Dremio, Hive, Oracle and Vertica ([reference.mdx][f-ref] L764–770).
  - Any `type` filter excludes null-typed tables ([data-sources.ts][f-ds] L80).
- **Databricks types.** `SHOW TABLES` is combined with `SHOW VIEWS`: views are `VIEW` or `MATERIALIZED VIEW` by `isMaterialized`, and everything else is `TABLE`, so external tables are not told apart. If `SHOW VIEWS` fails, the schema's tables have no type ([DatabricksDriver.ts][f-dbx] L614–655). Per the input note this is covered by unit tests only; the commit touched `DatabricksDriver.test.ts` ([commit 2][f-commit2]).
- **MySQL keys.**
  - Primary keys come from `KEY_COLUMN_USAGE` where `CONSTRAINT_NAME = 'PRIMARY'`. Foreign keys come from the referencing row's `referenced_table_schema`, `referenced_table_name` and `referenced_column_name` ([MySqlDriver.ts][f-mysql] L199–231).
  - Upstream's primary-key query didn't alias the table as `columns`, which the shared condition names, and its foreign-key query selected the constraint's own table and column as the "target" ([upstream MySqlDriver.ts][u-mysql]). That is consistent with the note's "failed silently" and "named its own column". Not reproduced.
- **Generic column types.** BigQuery reports generic types ([BigQueryDriver.ts][f-bqd] L316–328).

## Observed locally

**Probe setup.** On 2026-09-25 a probe container ran against wechart's sample Postgres, reachable at `http://localhost:54010/cubejs-api`. Tokens were HS256, signed with `probe-secret`, with `exp` at +600 s, sent as a raw `Authorization` value. The scripts are `probe.mjs` and `probe2.mjs`. The probe's `cube.js`:

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

Endpoint results. Paths are relative to `/v1/introspection/data-sources`; the scoped token was used except in the first row:

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

Scaffold of `orders`, `customers` and `products` together (200). `orders.yml`, whose unmapped columns were `customer_id` and `product_id`:

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

**Not re-run on the 95ea166012 image:** everything in A. Nothing in the changes touches the three-table scaffold of distinct `public` tables: the FK schema is `public`, and no names clash. So I expect the same output, but that is an inference. It is not verified.

**Not observed on either image:**

- `Continue wait`, a driver failure, or an invalid `CUBEJS_INTROSPECTION_MAX_TABLES`;
- same-named tables across schemas (the sample DB has one schema);
- materialized views, or a SELECT-only role;
- the northwind database;
- the silent-loss cases.

## What it means for wechart's flow

The flow runs browse → pick → preview → generate → review → save → publish. Every Cube call goes from wechart's API through `CubeClient.introspect`, never from the browser (`packages/api/src/cube/client.ts` L166–192).

1. **Browse.**
   - List data sources with `GET …/data-sources`, then schemas with `GET …/{ds}/schemas?search=`.
   - List tables with `GET …/{ds}/tables?schema=…&search=…&type=…&limit=…&offset=…`, showing `total` for paging.
   - On Postgres, materialized views are listed with `type: materialized_view`, but a schema holding only materialized views won't be in `/schemas`.
2. **Pick.**
   - Up to `CUBEJS_INTROSPECTION_MAX_TABLES` tables per request.
   - Same-named tables from different schemas can now go in one request and get `<schema>_<table>` names.
   - Include FK targets in the same request to get joins.
3. **Preview (optional).**
   - `POST …/{ds}/columns` gives `rawType`, the predicted `type`, `primaryKey`, and `foreignKeys` with target schema.
   - On Postgres, columns come in ordinal order.
   - With a role that doesn't own the tables, keys come back empty.
4. **Generate.** `POST …/{ds}/scaffold` with `format: "yaml"`. Retry `Continue wait` in both forms.
5. **Review.**
   - Show each cube's returned `cube` name, its YAML, and its `unmappedColumns` with reasons.
   - Columns that only drive a join are listed as unmapped.
   - wechart's own checks:
     - cube-name and file-path clashes with the model store, run on the *returned* names;
     - on rename, rewrite joins in the batch that target the old name;
     - the silent-loss check;
     - warn when a cube with joins has no primary key;
     - warn when a join went to a table in a different schema from the FK's.
6. **Save** the files to wechart's model store.
7. **Publish** through validate-then-publish (AC-136, AC-137). Cube's compile of the draft catches invalid identifiers and duplicate member names.

**T145's failing test** maps onto the scaffold response:

- `cubes` has one entry per distinct requested table, or the request fails as a whole. There is now no 400 for same-named tables ([DataSourceIntrospection.ts][f-dsi] L206–255);
- `unmappedColumns` reports the columns left out.

Two gaps: the silent-loss cases, and numeric non-key columns that aren't named like measures are reported rather than turned into dimensions.

**Decisions for the user.** Each is a product choice:

- whether AC-139's "columns mapped to dimensions" should turn `numeric_not_measure` and FK columns into dimensions;
- whether generated `id` dimensions should be `public`;
- who may generate cubes;
- the policy for clashes with existing names (refuse, rename or ask), including whether wechart keeps the fork's `<schema>_<table>` names;
- whether wechart adds joins to cubes that already exist;
- whether to take the two hardening steps in Init / auth;
- the retry bound for `Continue wait`;
- where the fork image is published for the Helm chart (`cube.image` is still stock);
- whether to fix the `Continue wait` conversion in the fork.

**Sibling research this supersedes when the fork image runs.** These rows describe stock Core and stay true for it:

- `docs/research/cube/data-sources.md` L382;
- `docs/research/cube-capabilities.md` L34 and L119 (§6 "Schema and table browsing");
- `docs/research/cube/configuration-deployment.md` L686 and L711–712.

A replacement for the §6 row, for the doc owner:

| Capability | Core/Cloud | API or config surface | wechart surface | Phase 1 | Source |
| --- | --- | --- | --- | --- | --- |
| Schema and table browsing, generate cubes | Stock Core: dev-only `/playground/db-schema` and `/generate-schema`. Fork image `cube:v1.7.45-introspection`: production API with the `introspection` scope | `GET /v1/introspection/data-sources`, `…/{ds}/schemas`, `…/{ds}/tables`; `POST …/{ds}/columns`, `…/{ds}/scaffold`; `CUBEJS_INTROSPECTION_MAX_TABLES` | Table browser, generate cubes | as the spec decides for AC-139 / AC-250 | [introspection-api](./cube/introspection-api.md) |

## Alternatives considered

Not requested by the caller.

## Open questions / unverified

1. **UNVERIFIED: the `Continue wait` status.** The source at 95ea166012 reads as 500 `{"error":"Error: Continue wait"}`, against the documented 200. Not observed.
2. **UNVERIFIED: same-named tables over HTTP.** `<schema>_<table>` naming, `_2` numbering and schema-preferring joins are shown by source and unit tests only.
3. **UNVERIFIED: materialized views.** Listing, columns and `format_type` names are shown by source and a Postgres integration test that I did not run. Their visibility to a role without `SELECT` is inferred from the PostgreSQL docs.
4. **UNVERIFIED: driver-failure and invalid-env 500s.** Source only.
5. **UNVERIFIED: a SELECT-only Postgres role** yielding empty keys, from the PostgreSQL docs and the driver's SQL.
6. **UNVERIFIED: whether Cube compiles a scaffolded self-join.**
7. **UNVERIFIED: the silent-loss cases,** derived from the source.
8. **UNVERIFIED: the cross-schema join fallback,** derived from the source (see Gotchas).
9. **UNVERIFIED: MySQL keys and Databricks `SHOW VIEWS` typing.** The source was read; the tests were not run, and no live database was used.
10. **Not probed:** northwind, large catalogs, and concurrent load. The `e01fd079d7` observations were not re-run on the `95ea166012` image.
11. **"Not pushed to any registry"** comes from the input note.
12. **Local checkout versus the commit.** Without git, I read the working tree at branch ref `95ea166012f2…` and did not confirm it is clean. GitHub's changed-file list for that commit (31 files) matches the files read ([commit 2][f-commit2]).
13. **Context7 was not used.** The API exists only in the fork.
14. **Input-note claims.** Every claim in the revised `docs/inputs/2026-09-25-cube-introspection-api.md` §1, §3, §4 and §5 was checked against the sources above. They were confirmed except where this doc qualifies them:
    - the `Continue wait` status (§3);
    - "nothing is cached" (§3);
    - "columns come back in the source's order", which holds for Postgres but not for base-query drivers (§3);
    - the unlisted 403 and 404 bodies (§3);
    - the dimension rule's underscore exclusion (§3);
    - the join rule's fallback to another schema (§3);
    - the unfiltered visibility of materialized views (§5).

    §2 is planning. Its deployment facts are confirmed for compose (`docker-compose.yml` L73, L123). The Helm chart still names the stock image (`deploy/helm/wechart/values.yaml` L50).

[f-commit1]: https://github.com/senthilkrajagopal/cube/commit/e01fd079d7a985232c71bd29dce4a0a9e65b3c0c
[f-commit2]: https://github.com/senthilkrajagopal/cube/commit/95ea166012f2988c7a702d7c6890d9810e5a320b
[f-ref]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[f-idx]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[f-envdoc]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/configuration/environment-variables.mdx
[f-dims]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/data-modeling/dimensions.mdx
[f-joins]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/docs-mintlify/reference/data-modeling/joins.mdx
[f-gw]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/gateway.ts
[f-ds]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/data-sources.ts
[f-types]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/src/types/data-sources.ts
[f-gwtest]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-api-gateway/test/data-sources.test.ts
[f-dsi]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/src/core/DataSourceIntrospection.ts
[f-dsitest]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/test/unit/DataSourceIntrospection.test.ts
[f-oapi]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[f-server]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/src/core/server.ts
[f-devserver]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-server-core/src/core/DevServer.ts
[f-qo]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[f-qc]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[f-qq]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[f-cwe]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-query-orchestrator/src/orchestrator/ContinueWaitError.ts
[f-csqd]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-cubestore-driver/src/CubeStoreQueueDriver.ts
[f-ss]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
[f-utils]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/utils.ts
[f-bsf]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/formatters/BaseSchemaFormatter.ts
[f-ysf]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/formatters/YamlSchemaFormatter.ts
[f-jsf]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/scaffolding/formatters/JavaScriptSchemaFormatter.ts
[f-cv]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[f-csym]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[f-bq]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[f-bd]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-base-driver/src/BaseDriver.ts
[f-pg]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[f-pgtest]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-postgres-driver/test/PostgresDriver.test.ts
[f-rs]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-redshift-driver/src/RedshiftDriver.ts
[f-crate]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-crate-driver/src/CrateDriver.ts
[f-mz]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-materialize-driver/src/MaterializeDriver.ts
[f-mysql]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[f-trino]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-trino-driver/src/TrinoDriver.ts
[f-dbx]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-databricks-jdbc-driver/src/DatabricksDriver.ts
[f-bqd]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts
[f-env]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-backend-shared/src/env.ts
[f-overlay]: https://github.com/senthilkrajagopal/cube/blob/95ea166012f2988c7a702d7c6890d9810e5a320b/packages/cubejs-docker/overlay.Dockerfile
[u-gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[u-ss]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/scaffolding/ScaffoldingSchema.ts
[u-pg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[u-qc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[u-mysql]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[pg-tables]: https://www.postgresql.org/docs/current/infoschema-tables.html
[pg-tc]: https://www.postgresql.org/docs/current/infoschema-table-constraints.html
[pg-ccu]: https://www.postgresql.org/docs/current/infoschema-constraint-column-usage.html
[pg-matviews]: https://www.postgresql.org/docs/current/view-pg-matviews.html
[pg-is]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/catalog/information_schema.sql
[docker-platform]: https://docs.docker.com/reference/cli/docker/buildx/build/
