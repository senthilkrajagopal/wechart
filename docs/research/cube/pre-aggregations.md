---
library: Cube (pre-aggregations and Cube Store)
packages: ['@cubejs-client/core']
version: 1.7.42
researched: 2026-09-19
sources:
  [
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/using-pre-aggregations.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/matching-pre-aggregations.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/lambda-pre-aggregations.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/running-in-production.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/non-additivity.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/data-store-cost-saving-guide.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/dedicated/pre-aggregation-storage.mdx',
    'https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx',
  ]
---

# Cube pre-aggregations and Cube Store 1.7.42

Pinned to Cube tag `v1.7.42` (released 2026-09-18) [rel-1742]. Doc links point at `docs-mintlify` at that tag. Source-code links point at the same tag. Anything marked **(source-only)** was read in the code at the tag but is not in the docs at the tag, so treat it as an unstable internal surface.

## Summary

- **What it is.** Pre-aggregations are materialized rollup tables that you declare in the data model. Cube builds them into Cube Store and routes matching queries to them automatically; there are no application code changes [doc-overview]. `original_sql` pre-aggregations are the exception: they are stored in the source database by default [doc-use]. Cube Store is Cube's Rust storage and query engine for pre-aggregations, built on a router, workers and object storage. It also hosts Cube's cache and queue store [doc-csa].
- **Why wechart needs it.** The user named pre-aggregations explicitly in the capability scope ([input] §1). The caller's brief lists these UI needs:
  - author and edit pre-aggregation definitions
  - show which pre-aggregations exist, with their partitions, build status, size and freshness
  - show whether a chart's query hit a pre-aggregation
  - suggest pre-aggregations for slow charts

  No AC or feature IDs exist yet because `docs/spec.md` hasn't been written, so this doc traces only to [input] and the brief.

- **Main findings for wechart:**
  1. **Hit indicator (documented, Core).** Since 1.7.33, every `/v1/load` response to every consumer carries `usedPreAggregations` (`preAggregationId`, `lastUpdatedAt`, `type`). It sits alongside `external` and `lastRefreshTime` [ref-rest] [pr-11591] [changelog].
  2. **Inventory, partitions and preview.** Core offers only the undocumented `/cubejs-system/v1/pre-aggregations*` routes. They are registered only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set, and they need an HS256 JWT signed with that secret [src-gateway] [src-server] [src-env] **(source-only)**.
  3. **Size and row counts.** Core's HTTP APIs don't expose these. They are available only from Cube Store's own SQL interface (MySQL protocol, port 3306), in `system.partitions`, `system.chunks` and `system.tables` [ref-cs-sql] [src-cs-partitions] [src-cs-chunks] **(system tables are source-only)**.
  4. **Cloud-only features.** Build history, "Used By" query lists, query-history acceleration filters and the performance charts exist only in Cube Cloud [cloud-mon] [cloud-qh] [cloud-perf].
  5. **Suggestions.** Core Playground's Rollup Designer builds its suggestion from `/v1/dry-run` `transformedQueries` using a small, readable algorithm that wechart can reimplement [src-pg-utils] [core-add].
  6. **Authoring.** No REST endpoint in the 1.7.42 REST reference writes data model files [ref-rest], so wechart must author pre-aggregations as data model file edits. The data-model researcher covers that.

## Install

- **Client (browser and Node):** `pnpm add @cubejs-client/core@1.7.42`.
  - Latest on npm is `1.7.42`, MIT licensed.
  - Entry points: `dist/cubejs-client-core.cjs` (CJS), a UMD browser build, and types at `dist/src/index.d.ts`.
  - The `exports` field provides ESM, CJS and types, plus a `./format` subpath [npm-client].
  - Since 1.7.33 the client uses the platform `fetch` API instead of `cross-fetch` [rel-1733].
  - This doc covers only the parts of the package that relate to pre-aggregations. See Open questions.
- **Server images** (docker-compose), both published 2026-09-18 [dh-cube] [dh-cs]:
  - `cubejs/cube:v1.7.42` (a `-jdk` variant exists)
  - `cubejs/cubestore:v1.7.42` (`-arm64v8` and `-non-avx` variants exist)
  - Inside the Cube image, 1.7.42 upgraded Node.js to 24.21.0 [rel-1742]. That is independent of wechart's Node 26, because wechart talks to Cube over HTTP.
- **Wiring Cube to Cube Store.**
  - `CUBEJS_CUBESTORE_HOST`: development default `localhost`.
  - `CUBEJS_CUBESTORE_PORT`: default `3030` [ref-env].
  - Cube Store's HTTP interface defaults to `0.0.0.0:3030`, and its MySQL-compatible interface to `0.0.0.0:3306` [ref-env].
- **Not recommended for wechart to import: `@cubejs-backend/cubestore-driver@1.7.42`.** It is Cube's internal Cube Store driver. It depends on `@cubejs-backend/native`, `@cubejs-backend/base-driver` and `@cubejs-backend/cubestore` [npm-csdriver], and `@cubejs-backend/cubestore` runs a `postinstall` script (`node bin/post-install`) [npm-cs]. The reasons are technical: it is a native, internal dependency tree that is coupled to Cube's release train. If wechart needs Cube Store diagnostics, a MySQL-protocol client needs its own research doc (see Open questions).

## Init / auth pattern

**1. Cube API plus Cube Store in docker-compose.** This is adapted from the documented router and worker example, with the image tags pinned [doc-prod] [core-prod]:

```yaml
services:
  cubestore_router:
    image: cubejs/cubestore:v1.7.42
    environment:
      - CUBESTORE_SERVER_NAME=cubestore_router:9999
      - CUBESTORE_META_PORT=9999
      - CUBESTORE_WORKERS=cubestore_worker_1:9001
      - CUBESTORE_REMOTE_DIR=/cube/data
    volumes: ['.cubestore:/cube/data']
  cubestore_worker_1:
    image: cubejs/cubestore:v1.7.42
    environment:
      - CUBESTORE_SERVER_NAME=cubestore_worker_1:9001
      - CUBESTORE_WORKER_PORT=9001
      - CUBESTORE_META_ADDR=cubestore_router:9999
      - CUBESTORE_WORKERS=cubestore_worker_1:9001
      - CUBESTORE_REMOTE_DIR=/cube/data
    depends_on: [cubestore_router]
    volumes: ['.cubestore:/cube/data']
  cube:
    image: cubejs/cube:v1.7.42
    environment:
      - CUBEJS_CUBESTORE_HOST=cubestore_router
    depends_on: [cubestore_router]
```

- `CUBESTORE_REMOTE_DIR` (local filesystem as "remote" storage) is "not recommended for production" [ref-env].
- `CUBESTORE_WORKERS` and `CUBESTORE_META_ADDR` must be stable addresses [doc-prod].
- In production, Cube Store "**must** run as a separate process" [core-prod].

**2. Hit indicator in the React app.** The default export has the signature `cube(apiToken: string | (() => Promise<string>), options: CubeApiOptions)` [src-client-index]. `ResultSet` keeps the raw response private and exposes it only through `serialize()`, which returns `{ loadResponse }` [src-client-rs]. `loadResponse` is either the multi-result shape (with `results`) or a single result, depending on the response [src-client-rs].

```ts
import cube from '@cubejs-client/core';

type UsedPreAgg = { preAggregationId?: string; lastUpdatedAt?: number | string; type: string };

const cubeApi = cube(getToken, { apiUrl: 'http://localhost:4000/cubejs-api/v1' });
const rs = await cubeApi.load(query);
const lr = rs.serialize().loadResponse as {
  results?: Array<{ usedPreAggregations?: Record<string, UsedPreAgg> }>;
} & { usedPreAggregations?: Record<string, UsedPreAgg> };
const results = Array.isArray(lr.results) ? lr.results : [lr];
const used = results.flatMap((r) => Object.values(r.usedPreAggregations ?? {})); // [] means no pre-aggregation hit
```

`lastUpdatedAt` is typed `number | string` here on purpose; see Gotchas.

**3. Core system API (optional, server-side only, source-only).**

- These routes exist only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set on the Cube API (`if (this.playgroundAuthSecret)`) [src-gateway] [src-server] [src-env].
- Authorization is checked by `createCheckAuthSystemFn`, which verifies a JWT with key `playgroundAuthSecret` and `algorithms: ['HS256']` [src-gateway].
- The secret must live only in wechart's backend, because the same token can trigger builds and cancel queue items (section 5).
- This variable is not in the environment-variable reference at the tag [ref-env].

**4. Cube Store SQL (optional, server-side only).**

- Documented CLI access: `mysql -h <CUBESTORE_IP> --user=cubestore -pcubestore --protocol=TCP` [ref-cs-sql].
- Cube Store "does not have any in-built authentication mechanisms", and the docs recommend a network configuration "that only allows access from the Cube deployment" [core-prod] [doc-prod]. Any wechart backend connection deviates from that recommendation (see Open questions).

## API surface we will use

### 1. Data model: `pre_aggregations` parameters

General rules:

- A pre-aggregation must include every dimension and measure the query uses. It usually belongs in the cube that defines most of its members, and one that contains no members of its defining cube is ignored [ref-pa].
- Rollups may include members of several joined cubes [ref-pa].
- The docs use snake_case YAML keys. The validator at the tag checks camelCase keys (for example `unionWithSourceData`) [ref-pa] [src-validator].

| Parameter                                                                                       | Applies to                                                                | Values and default                                                                      | Notes                                                                                                                                                                                                                                                               | Source                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `name`                                                                                          | all                                                                       | Unique within the cube                                                                  | Cube name + pre-aggregation name form the prefix of the physical table names. A cube-level `sql_alias` "affects all member names including pre-aggregation table names"                                                                                             | [ref-pa] [ref-cube]                              |
| `type`                                                                                          | all                                                                       | `rollup` (default), `original_sql`, `rollup_join`, `rollup_lambda`                      | The validator also accepts `autoRollup` with `maxPreAggregations`. It is undocumented, so don't surface it                                                                                                                                                          | [ref-pa] [src-validator] [src-symbols]           |
| `measures`, `dimensions`, `segments`                                                            | rollup, rollup_join, rollup_lambda                                        | Arrays of member references                                                             | Additive rollups (`count`, `sum`, `min`, `max`, `count_distinct_approx`) can serve subset queries                                                                                                                                                                   | [ref-pa]                                         |
| `time_dimension` + `granularity`                                                                | rollup; also rollup_join and rollup_lambda; original_sql when partitioned | Any `time` dimension. `granularity` is `second`…`year` or a custom granularity          | The validator's `GranularitySchema` is `Joi.string().required()`, with the comment "To support custom granularities"                                                                                                                                                | [ref-pa] [src-validator]                         |
| `time_dimensions`                                                                               | rollup                                                                    | Array of `{dimension, granularity}`                                                     | **Source-only.** Present in the validator, absent from the reference                                                                                                                                                                                                | [src-validator]                                  |
| `partition_granularity`                                                                         | rollup; original_sql with a time dimension                                | `hour`, `day`, `week`, `month`, `quarter`, `year`                                       | Requires `time_dimension` + `granularity`. Rule of thumb: stay under "500-1,000 partitions per pre-aggregation in total"                                                                                                                                            | [ref-pa] [src-validator]                         |
| `refresh_key.every`                                                                             | all except rollup_join and rollup_lambda                                  | Interval or CRON. Default `1 hour`, or `10 seconds` when `sql` is set                   | Runs "at least once" per interval, not at most once. CRON combined with `sql` is a compile error. The interval regex is `^(\d+) (second\|minute\|hour\|day\|week)s?$`                                                                                               | [ref-pa] [src-validator]                         |
| `refresh_key.sql`                                                                               | same                                                                      | SQL                                                                                     | Rebuilds when its result changes. Checked every 10 s by default. Must not be combined with `incremental`                                                                                                                                                            | [ref-pa]                                         |
| `refresh_key.incremental`                                                                       | partitioned rollups                                                       | bool, default `false`                                                                   | Partitions are replaced whole; nothing is appended                                                                                                                                                                                                                  | [ref-pa]                                         |
| `refresh_key.update_window`                                                                     | with `incremental`                                                        | Interval                                                                                | Without it, "only update the last partition". Partitions older than the window are never refreshed unless the rollup SQL changes                                                                                                                                    | [ref-pa]                                         |
| `refresh_key.timezone`                                                                          | with CRON `every`                                                         | IANA zone                                                                               | **Source-only.**                                                                                                                                                                                                                                                    | [src-validator]                                  |
| `build_range_start` / `build_range_end`                                                         | partitioned pre-aggregations                                              | `{ sql }`. Default is the min/max of `time_dimension`                                   | No effect on non-partitioned pre-aggregations. Cube "will **not** return results outside of the defined build range". A `build_range_end` of now combined with a small `update_window` or `FILTER_PARAMS` can create a refresh cycle; use a future-dated end        | [ref-pa]                                         |
| `refresh_range_start` / `refresh_range_end`                                                     | base                                                                      | `{ sql }`                                                                               | **Source-only.** Semantics unverified                                                                                                                                                                                                                               | [src-validator]                                  |
| `scheduled_refresh`                                                                             | all except rollup_join and rollup_lambda                                  | bool. Default from `CUBEJS_SCHEDULED_REFRESH_DEFAULT` (`true`)                          | For `rollup_join` the validator allows only `false`. `false` means built tables become stale or orphaned and are garbage-collected                                                                                                                                  | [ref-pa] [src-symbols] [src-env] [src-validator] |
| `allow_non_strict_date_range_match`                                                             | rollup, original_sql, rollup_join                                         | bool. Default from `CUBEJS_PRE_AGGREGATIONS_ALLOW_NON_STRICT_DATE_RANGE_MATCH` (`true`) | The default applies only when a time dimension is present. `false` means "requested date range exactly matches" the granularity                                                                                                                                     | [ref-pa] [ref-env] [src-symbols]                 |
| `use_original_sql_pre_aggregations`                                                             | rollup                                                                    | bool, default `false`                                                                   | The rollup builds from an `original_sql` pre-aggregation instead of re-running the cube SQL                                                                                                                                                                         | [ref-pa] [rec-osql]                              |
| `rollups`                                                                                       | rollup_join (exactly two), rollup_lambda                                  | References                                                                              | `rollup_join` "can be used only to join two rollups"                                                                                                                                                                                                                | [ref-pa] [doc-lambda]                            |
| `union_with_source_data`                                                                        | rollup_lambda only                                                        | bool, default `false`                                                                   | Unions the batch rollup with fresh source data                                                                                                                                                                                                                      | [ref-pa] [doc-lambda]                            |
| `indexes`                                                                                       | all                                                                       | `name → { columns, type? }`; `type` is `regular` or `aggregate`                         | Time-dimension columns are written `CUBE.created_at.day` or `orders__created_at_day`. The validator also accepts a `{ sql }` index form (**source-only**). With no explicit index, a default index is created, "dimensions come first, time dimensions come second" | [ref-pa] [doc-use] [src-validator]               |
| `external`                                                                                      | all except rollup_lambda                                                  | bool                                                                                    | The rollup and rollup_join default is `getEnv('externalDefault')` (`CUBEJS_EXTERNAL_DEFAULT`, default `true`, not in the env reference). `original_sql` defaults to `false`. For `original_sql`, `external: true` is "not recommended or generally supported"       | [src-symbols] [src-env] [ref-pa]                 |
| `sql_alias`                                                                                     | base                                                                      | string                                                                                  | **Source-only** on pre-aggregations; the documented `sql_alias` is at cube level                                                                                                                                                                                    | [src-validator] [ref-cube]                       |
| `read_only`, `stream_offset` (`earliest`/`latest`), `unique_key_columns`, `output_column_types` | streaming (ksqlDB) rollups                                                | See [ksql]                                                                              | "All pre-aggregations where data source is ksqlDB are streaming", and no `refresh_key` is needed                                                                                                                                                                    | [ksql] [doc-use] [src-validator]                 |

Minimal partitioned, incremental, indexed rollup, taken from the reference's own examples [ref-pa]:

```yaml
pre_aggregations:
  - name: category_and_date
    measures: [CUBE.count]
    dimensions: [CUBE.status]
    time_dimension: CUBE.created_at
    granularity: day
    partition_granularity: month
    build_range_start: { sql: "SELECT NOW() - INTERVAL '365 day'" }
    build_range_end: { sql: 'SELECT NOW()' }
    refresh_key: { every: 1 day, incremental: true, update_window: 7 day }
    indexes:
      - name: status_date_idx
        columns: [CUBE.status, CUBE.created_at.day]
      - name: status_agg
        columns: [CUBE.status]
        type: aggregate
```

Type-specific rules:

- **`original_sql`** persists the cube's `sql` in the data source. Use it for heavy SQL that rollups reuse, or where rollups can't be used (for example funnels) [ref-pa] [rec-osql]. Storing it in the source database needs write access, so the driver must not be `readOnly: true` [rec-osql].
- **`rollup_join`**:
  - It is in Preview, and it is "designed to join data across different data sources" [ref-pa].
  - It is ephemeral: it is read at query time from its two referenced rollups [ref-pa].
  - Each referenced rollup needs an index covering the join key. For partition pruning, put a selective single-value dimension before the join key [ref-pa] [doc-use].
  - The right side is bounded by the number of physical Cube Store partitions [ref-pa] [rec-cadence].
  - Set freshness controls on the referenced rollups, not on the join [rec-cadence] [rec-multids].
- **Aggregating indexes** store only the index columns plus rolled-up measures. They serve a query only if all its measures are additive and all its dimensions and filters are index columns. When both qualify, Cube Store prefers an aggregating index over regular ones [doc-use] [ref-pa]. The aggregation happens at compaction time, using `SUM`, `MIN`/`MAX` and `MERGE` for HLL [doc-csa].

### 2. Matching rules

- **Candidate order.** Cube substitutes view members with the underlying cube members and searches pre-aggregations of the cubes involved. It tests them in definition order, `rollup` before `original_sql`, and uses the first match [doc-match].
- **No match.** Cube falls back to the upstream source, "unless the rollup-only mode is enabled" [doc-match].
- **Documented checks** [doc-match]:
  1. Leaf-measure additivity. For calculated measures, the referenced leaf measures are checked.
  2. Membership. The pre-aggregation contains every dimension, filter dimension and leaf measure; `switch` dimensions are exempt.
  3. No measures multiplied via `one_to_many`.
  4. The query time dimension has a granularity.
  5. Filter dimensions are also query dimensions.
  6. Time-dimension alignment rules apply.
- **Branch logic.** The docs' yes/no branches are in a flowchart image (`https://ucarecdn.com/f986b0cb-a9ea-47b7-a743-ca9a4644c246/`) that I couldn't read, so this comes from `canUsePreAggregationForTransformedQueryFn` [src-pamatch]:
  - **Additive path.** Used when `leafMeasureAdditive && !hasMultipliedMeasures && !hasMultiStage`, or when the query is ungrouped. It passes when:
    - every leaf measure is in the pre-aggregation
    - the query dimensions are a subset of the pre-aggregation dimensions
    - each query time dimension's granularity is in the granularity hierarchy of a pre-aggregation time dimension
    - rolling-window granularity matches, if the query has one

    It fails if the pre-aggregation contains a multiplied measure that the query uses. If the additive check fails, the non-additive check is tried.

  - **Non-additive (exact) path.** It requires all of the following:
    - no time dimension without granularity
    - no cumulative measures
    - query time dimensions **equal** the pre-aggregation's
    - pre-aggregation dimensions **equal** the query's sorted dimensions, with all filters inside the selected dimensions (or every pre-aggregation dimension is a single-value equality filter)
    - all measures present
- **Time dimensions** [doc-match]:
  - The common granularity is the greatest common divisor ("between hour and day is hour").
  - The date range must align with granularity boundaries, unless `allow_non_strict_date_range_match` applies.
  - "The time zone in the query must match the time zone of a pre-aggregation". Build zones come from `scheduled_refresh_time_zones`.
- **Ungrouped queries.** The pre-aggregation must include the primary keys of all cubes involved, and only members of those cubes [doc-match].
- **Multi-fact and multi-stage queries.** Cube matches each subquery independently. Matching is "all-or-nothing": if any subquery can't be served, the other matches are dropped too [doc-match].
- **Tesseract.** With the native planner on (`CUBEJS_TESSERACT_SQL_PLANNER`, default `true` [src-env]) and `canUseNativeSqlPlannerPreAggregation`, matching runs in Rust (`findPreAggregationForQueryRust()`) instead of the JS function above [src-pamatch]. See Gotchas.

### 3. Lambda pre-aggregations

- They follow the Lambda architecture: pre-aggregations are the batch layer, and source data or other (usually streaming) pre-aggregations are the speed layer. They "**only** work with data that is newer than the existing batched pre-aggregations" [doc-lambda].
- "Lambda pre-aggregations only work with Cube Store" [doc-lambda].
- The `rollup_lambda` definition **must** come before any other pre-aggregation in the cube [ref-pa] [doc-lambda].
- **Batch + source.** The batch rollup needs `time_dimension` and `partition_granularity`. `build_range_*` bounds the batch window, and the lambda sets `rollups: [CUBE.batch]` with `union_with_source_data: true` [doc-lambda].
- **Batch + streaming.** The lambda lists several rollups across cubes. For each date range, the first rollup with a fully built partition serves it. The last rollup covers the rest, "even if not completely built". Build ranges must overlap enough to cover partition build times [doc-lambda].
- In the validator, the lambda accepts only `type`, `granularity`, `timeDimension`, `rollups`, `measures`, `dimensions`, `segments` and `unionWithSourceData`. It has no `refreshKey`, `indexes` or `external` [src-validator].
- In `usedPreAggregations`, a lambda (or join) is reported as the rollups it references, "not as itself" [ref-rest].

### 4. Query-time signals: REST and `@cubejs-client/core`

**`/v1/load` response fields** [ref-rest]:

- `external`: whether the query was served from a pre-aggregation in Cube Store.
- `lastRefreshTime`: ISO 8601.
- `usedPreAggregations`: "keyed by pre-aggregation table name". Each entry carries:
  - `preAggregationId`: the model name, for example `Orders.main`, "stable across rebuilds"
  - `lastUpdatedAt`
  - `type`

Behavior and exposure:

- `usedPreAggregations` is "Absent when the query hit no pre-aggregation" [ref-rest].
- These fields "are returned to every API consumer - including browsers holding a public embedding token" [ref-rest].
- `targetTableName` (the physical build table, with version hashes) and `refreshKeyValues` stay behind `CUBEJS_DEV_MODE` and the Playground [ref-rest] [src-client-types].
- This was introduced in 1.7.33 by PR #11591. Before that, the names were available only in dev mode [pr-11591] [changelog]. The SQL API's `cubesql` also carries `usedPreAggregations`, and `cubeSql()`/`cubeSqlStream()` in the client forward it [pr-11591] [rel-1733].

Client types [src-client-types]:

- `UsedPreAggregation = { preAggregationId?: string; targetTableName?: string; lastUpdatedAt?: number; type: PreAggregationType }`
- `PreAggregationType = 'rollup' | 'rollupJoin' | 'rollupLambda' | 'originalSql'`
- `LoadResponseResult` has `external: boolean | null`, `dbType`, `extDbType`, `usedPreAggregations?`, `transformedQuery?`, `lastRefreshTime`. `LoadResponse` also has `slowQuery?: boolean`.

**`/v1/sql`: predicts use without executing.**

- Documented fields: `sql` (SQL plus params), `dataSource`, and for SQL format `status` and `query_type`. The documented example SQL reads `FROM prod_pre_aggregations.base_orders_orders_by_month`, so the generated SQL shows when the query would hit a pre-aggregation [ref-rest].
- **Source-only:** the handler returns the whole `CompilerApi.getSql` result. It includes `external`, `preAggregations` (descriptions of the pre-aggregations used), `lambdaQueries`, `canUseTransformedQuery`, and `rollupMatchResults` (only with `includeDebugInfo`). `sanitizeSqlQuery` only trims `granularityHierarchies` [src-gateway] [src-compilerapi].
- Client signature: `sql(query, options?): Promise<SqlQuery>` [src-client-index].

**`/v1/dry-run`: inputs for suggestions.**

- The route is registered for GET and POST [src-gateway] but isn't listed in the REST reference at the tag [ref-rest].
- The response is `{ queryType, normalizedQueries, queryOrder, transformedQueries, pivotQuery }` [src-gateway].
- Client signature: `dryRun(query, options?): Promise<DryRunResponse>` [src-client-index].
- `TransformedQuery` fields include `leafMeasureAdditive`, `isAdditive`, `leafMeasures`, `measureToLeafMeasures`, `hasMultipliedMeasures`, `allFiltersWithinSelectedDimensions`, `sortedDimensions`, `ownedDimensions`, `ownedTimeDimensionsWithRollupGranularity` and `granularityHierarchies` [src-client-types].

**`POST /v1/pre-aggregations/can-use` (source-only).**

- Requires the `meta` API scope.
- Body: `{ transformedQuery, references }`.
- Returns `{ canUsePreAggregationForTransformedQuery }`, computed by the **JS** matcher `PreAggregations.canUsePreAggregationForTransformedQueryFn`. With references supplied, that function returns `{ canUse, leafMeasureMatch }` [src-gateway] [src-compilerapi] [src-pamatch].
- The Playground Rollup Designer calls it to check a proposed definition [src-pg-rd].

**How the Playground suggests a rollup (algorithm to reimplement).** `getPreAggregationReferences(transformedQuery, segments)` [src-pg-utils]:

- `measures` = `transformedQuery.leafMeasures`
- `dimensions` = `ownedDimensions` that are not segments
- `segments` = `ownedDimensions` that are segments
- `timeDimension`/`granularity` = the first entry of `ownedTimeDimensionsWithRollupGranularity`, defaulting to `'day'`

`getRollupDefinitionFromReferences` then renders YAML or JS [src-pg-utils]. When `!leafMeasureAdditive`, the designer works from `measureToLeafMeasures` [src-pg-rd]. The Core Playground surfaces this as "Query was not accelerated with pre-aggregation" → "Add to the Data Model" [core-add].

**Observed locally (2026-09-21, `cubejs/cube:v1.7.42`, `NODE_ENV=production`, `CUBEJS_DEV_MODE=false`, the compose Cube Store).** These were checked against a throwaway Cube on the compose network and then against the compose Cube, with a `count`/`status`/`ordered_at` rollup (`granularity: month`, `partition_granularity: year`) over `public.orders`:

- **An API instance with no refresh worker refuses queries a rollup would serve until the rollup is built.** `/v1/load` answered HTTP 400: "No pre-aggregation partitions were built yet for the pre-aggregation serving this query and this API instance wasn't set up to build pre-aggregations. Please make sure your refresh worker is configured correctly, running, …". It does not fall back to the source database, and asking again does not help.
- **With a second instance running `CUBEJS_REFRESH_WORKER=true` on the same model and Cube Store**, the same query was served from the rollup after 24–30 s. The answer was HTTP 200 with `external: true` and `usedPreAggregations: { "prod_pre_aggregations.<cube>_<rollup>": { preAggregationId: "<cube>.<rollup>", lastUpdatedAt: <epoch ms>, type: "rollup" } }`, as §4 above describes.
- **`lastRefreshTime` on a rollup-served answer is the rollup's build time, and `cache: 'no-cache'` doesn't move it.** Asked with `no-cache` twice, and then plainly, the query read the rollup each time with the same `lastRefreshTime` and `lastUpdatedAt`. `no-cache` skips Cube's result cache, not the pre-aggregation.
- **What Cube's compile refuses in a rollup, and what it lets through.** Each variant below was published through wechart's publish endpoint, which has Cube compile it as a draft (T142).
  - **Refused (HTTP 422, attributed to the file):**
    - a `time_dimension` with no `granularity`: "(preAggregations.<name>.granularity) is required";
    - a `rollup_lambda` with no `rollups`: "(preAggregations.<name>.rollups) is required";
    - an unknown key: "does not match any of the allowed types".
  - **Compiled and published:**
    - a measure, dimension, time dimension or index column the cube doesn't have;
    - a granularity that isn't one (`fortnight`);
    - a `partition_granularity` with no time dimension.

  Mistakes in the second list surface only when the rollup is built or matched, not at publish.
- **Whether a query would use a rollup, and what Cube matches on: `/v1/sql`, `/v1/dry-run`, `/v1/meta?extended=true`.** Each was asked with `?query=` (GET, the signed token) against the seed rollup `monthly_orders.by_status_month` (`count`, `total_amount` by `status`, `ordered_at` by month):
  - **`/v1/sql` → `sql.preAggregations`** lists what Cube will use, each with `preAggregationId` (`monthly_orders.by_status_month`), plus `sql.external: true`. It is `[]` with `external: false` when nothing matches. Seen empty for: `monthly_orders.count` by `ordered_at` **day**, which is finer than the rollup's month; `monthly_orders.count` by `monthly_orders.id`, which isn't in the rollup; and `orders.count` by status, on a cube with no rollups. Seen matching for count by status with no time dimension.
  - **`/v1/dry-run` → `transformedQueries[0]`** holds the facts the matcher uses (§2):
    - `leafMeasures`, `leafMeasureAdditive`, and `measureToLeafMeasures`: `{ "<measure>": [{ measure, additive, type }] }`, where `orders.average_amount` is `additive: false`.
    - `ownedDimensions`, and `ownedTimeDimensionsWithRollupGranularity`: `[["monthly_orders.ordered_at","day"]]`.
    - `granularityHierarchies`: `{ "<member>.<granularity>": [the granularities that can serve it] }`, for example `"orders.ordered_at.week": ["week","day","hour","minute","second"]` and `"…month": ["month","day","hour","minute","second"]`.
    - `allFiltersWithinSelectedDimensions`, `filterDimensionsSingleValueEqual`, `hasMultipliedMeasures`, `hasCumulativeMeasures`.
  - **`/v1/meta?extended=true` → each cube's `preAggregations`**: the compiled rollups, as Cube runs them.
    - Members are given as the reference functions' text: `measureReferences: "[count, total_amount]"`, `dimensionReferences: "[status]"`, `timeDimensionReference: "ordered_at"`.
    - Also `granularity`, `partitionGranularity`, `type`, `name`, and `indexes: { byStatus: { type: "regular" } }` (camelCased, with no columns).
- **`scheduledRefreshContexts` entries fail one at a time.** A context whose model couldn't be read (a store that was down, or one answering 404) logged `Refresh Scheduler Error` with that `securityContext`. The rollup for the context that could be read was still built.

**`/v1/pre-aggregations/jobs` (cross-reference only).** This is the documented trigger and status API. Statuses are `scheduled`, `processing`, `missing_partition` and `done`, and status responses include the physical `table` [ref-rest]. The build-jobs and refresh-worker researcher owns it. Related changes: 1.7.29 made job status "per-entry and data-source aware", and 1.7.11 passes the job's data source when checking queue status [changelog].

### 5. Core system API for pre-aggregations (source-only, undocumented)

All routes are registered only `if (this.playgroundAuthSecret)`. They use `checkAuthSystemMiddleware` (HS256 JWT with `CUBEJS_PLAYGROUND_AUTH_SECRET`) [src-gateway] [src-env].

| Route                                                                | Handler I/O                                                                                                                                                                                                                                                                                                                                                                                                       | Source                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `GET /cubejs-system/v1/context`                                      | Context information                                                                                                                                                                                                                                                                                                                                                                                               | [src-gateway]               |
| `GET /cubejs-system/v1/pre-aggregations`                             | → `{ preAggregations }`: every compiled pre-aggregation, resolved via `refreshScheduler().preAggregationPartitions` across the configured refresh time zones                                                                                                                                                                                                                                                      | [src-gateway]               |
| `GET /cubejs-system/v1/pre-aggregations/security-contexts`           | → `{ securityContexts }` from `scheduledRefreshContexts`                                                                                                                                                                                                                                                                                                                                                          | [src-gateway]               |
| `GET /cubejs-system/v1/pre-aggregations/timezones`                   | → `{ timezones }` from `scheduledRefreshTimeZones`                                                                                                                                                                                                                                                                                                                                                                | [src-gateway]               |
| `POST /cubejs-system/v1/pre-aggregations/partitions`                 | `query` with `{ timezones, preAggregations: [{ id, cacheOnly?, metaOnly?, partitions? }], dateRange? }` and optional `expand` of `partitions.details`, `partitions.meta` and/or `partitions.versions`. Returns `{ preAggregationPartitions: [{ errors, invalidateKeyQueries, preAggregation, timezones, partitions }] }`. With `partitions.versions`, each partition gets `versionEntries` and `structureVersion` | [src-gateway] [src-refresh] |
| `POST /cubejs-system/v1/pre-aggregations/preview`                    | `{ preAggregationId, versionEntry, timezone }` → `{ preview }` (sample rows)                                                                                                                                                                                                                                                                                                                                      | [src-gateway]               |
| `POST /cubejs-system/v1/pre-aggregations/build`, `/queue`, `/cancel` | Build, list queue, cancel queued builds. Cross-reference to the jobs researcher                                                                                                                                                                                                                                                                                                                                   | [src-gateway]               |

- A `VersionEntry` is `{ table_name, content_version, structure_version, last_updated_at: number, build_range_end?, naming_version? }` [src-orch-pa]. This is Core's per-build freshness record.
- Partition objects follow the orchestrator's `PreAggregationDescription`. Fields include `tableName`, `preAggregationId`, `type`, `dataSource`, `external`, `timezone`, `granularity`, `partitionGranularity`, `matchedTimeDimensionDateRange`, `buildRangeStart/End`, `updateWindowSeconds`, `sealAt`, `rollupLambdaId` and `indexesSql` [src-orch-pa]. I inferred this from the types; confirm it against a running instance.

### 6. Cube Store

**Architecture** [doc-csa]:

- **Router:** owns the metastore, plans queries, and hosts the cache and queue store.
- **Workers:** execute partial queries on the partitions they own and never talk to each other (shared-nothing, consistent hashing).
- **Object store:** holds all persistent data.
- Technology: "Rust, Apache Arrow, DataFusion, Parquet, RocksDB".

**Data organization** [doc-csa]:

- The metastore is RocksDB, with the hierarchy Schema → Table → Index → Partition → Chunk.
- An index is a sorted copy of the data.
- Partitions auto-split during compaction at 2,097,152 rows or 100 MiB by default, with up to 16 children per pass.
- Chunks are Parquet files or in-memory buffers. Streaming rows are compacted to Parquet about every minute.

**Query execution** [doc-csa]:

- DataFusion plans the query, then index selection, min-max partition pruning, aggregate/top-k/limit pushdown, and a router/worker plan split.
- Pruning happens at the partition, chunk and Parquet row-group levels.
- Joins are **merge joins only**, so every joined table needs an index whose sort key starts with the join columns.

**Cache and queue** [doc-csa]:

- The cache defaults to 4 GiB and 100,000 keys, with `allkeys-lru` eviction.
- There is one queue per workload, with the lifecycle Pending → Active → Finished.
- Priority ranges from −10000 to 10000. Heartbeats default to 30 s, items stalled for more than 2 min are cancelled, and orphaned items after 120 s.
- There is no scheduler node; every API instance and refresh worker runs the reconciliation loop.
- Transport limits: 64 MiB message and frame by default, and a cache entry maximum of 63 MiB.

**Cluster and resources:**

- Router env vars: `CUBESTORE_SERVER_NAME`, `CUBESTORE_META_PORT`, `CUBESTORE_WORKERS`.
- Worker env vars: `CUBESTORE_SERVER_NAME`, `CUBESTORE_WORKER_PORT`, `CUBESTORE_META_ADDR`, `CUBESTORE_WORKERS`.
- Budget "at least 4 CPUs and up to 8GB per main or worker node" [doc-prod].
- Single-instance mode is "usually unsuitable for production" [core-prod].
- Query performance is best when the number of partitions in a query is at most the worker count [core-prod].

**Storage** [ref-env] [doc-prod] [core-prod]:

- Persistent storage options:
  - S3: `CUBESTORE_S3_BUCKET`/`_REGION`/`_SUB_PATH`/`_SSE`, AWS keys, or web identity (`CUBESTORE_AWS_WEB_IDENTITY_TOKEN_FILE`, `CUBESTORE_AWS_ROLE_ARN`)
  - GCS: `CUBESTORE_GCS_BUCKET`/`_SUB_PATH`, `CUBESTORE_GCP_CREDENTIALS` or `CUBESTORE_GCP_KEY_FILE`
  - MinIO: `CUBESTORE_MINIO_*`
  - Local filesystem: `CUBESTORE_REMOTE_DIR`
- Scratch storage is `CUBESTORE_DATA_DIR` (default `.cubestore/data`); local SSDs are recommended.
- Only S3, GCS and Azure Blob provide the strong consistency Cube Store needs. MinIO doesn't, and it can fail with "storage can't provide the required consistency".
- Azure Blob is named as supported, but no Azure `CUBESTORE_*` variables appear in the env reference (see Open questions).

**Operations limits:**

- Garbage collection: orphaned pre-aggregation tables have a 1-day default TTL. It relies on file creation times, which XFS doesn't support. All partitions should be built before GC starts [doc-prod] [core-prod].
- No HA: "doesn't support replicating any of its nodes", and any node down means a full cluster outage [doc-prod].
- Parquet-level AES-256 encryption at rest is Enterprise-only [doc-prod].

**SQL interface** [ref-cs-sql]:

- The router serves the MySQL protocol on `3306` (`CUBESTORE_PORT`/`CUBESTORE_BIND_ADDR`). Only Linux and macOS MySQL clients are supported.
- **Diagnostics (read-only):**
  - `SELECT * FROM information_schema.tables`
  - `EXPLAIN`, `EXPLAIN ANALYZE`, `EXPLAIN ANALYZE DETAILED`
  - `DUMP` writes a metastore backup plus Parquet files to the router's disk, and these are never cleaned up.
  - Reading plans: `…InplaceAggregate` with `MergeSort` is optimal, while `PartialHashAggregate`/`FinalHashAggregate` with `Merge` is "most likely" sub-optimal.
- **Cache and queue:** `CACHE SET|GET|KEYS|INCR|REMOVE|CLEAR`, and `QUEUE ADD|ADD_AND_RETRIEVE|GET|LIST|PENDING|ACTIVE|RESULT|RESULT_BLOCKING|ACK|CANCEL|HEARTBEAT|RETRIEVE|STALLED|ORPHANED|TO_CANCEL|MERGE_EXTRA|CLEAR`. "The queue coordinates pre-aggregation builds".
- **Maintenance and recovery (destructive):**
  - `SYS METASTORE HEALTHCHECK|COMPACTION|SET_CURRENT|TRUNCATE`
  - `SYS CACHESTORE HEALTHCHECK|INFO|COMPACTION|PERSIST|EVICTION|TRUNCATE|WIPE`
  - `SYS KILL ALL JOBS`, `SYS REPARTITION`, `SYS DROP CACHE`, `SYS DROP QUERY CACHE`, `SYS PANIC WORKER`
  - The docs describe these as "intended for recovering a Cube Store cluster already in bad state".
- **System tables (source-only).** The info-schema module at the tag defines [src-cs-info]:
  - `information_schema`: `tables`, `columns`, `schemata`
  - `system`: `tables`, `partitions`, `chunks`, `indexes`, `jobs`, `queue`, `queue_results`, `cache`, `snapshots`, `replay_handles`, plus RocksDB properties

  Columns relevant to wechart:

  | Table                       | Columns                                                                                                                                                                                                                                                                                                    | Source              |
  | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
  | `information_schema.tables` | `table_schema`, `table_name`, `build_range_end`, `seal_at`                                                                                                                                                                                                                                                 | [src-cs-ist]        |
  | `system.tables`             | `id`, `schema_id`, `table_schema`, `table_name`, `columns`, `locations`, `import_format`, `has_data`, `is_ready`, `unique_key_column_indices`, `aggregate_columns`, `seq_column_index`, `partition_split_threshold`, `created_at`, `build_range_end`, `seal_at`, `sealed`, `select_statement`, `extension` | [src-cs-tables]     |
  | `system.indexes`            | `id`, `table_id`, `name`, `columns`, `sort_key_size`, `partition_split_key_size`, `multi_index_id`, `index_type`                                                                                                                                                                                           | [src-cs-indexes]    |
  | `system.partitions`         | `id`, `file_name`, `index_id`, `parent_partition_id`, `multi_partition_id`, `min_value`, `max_value`, `min_row`, `max_row`, `active`, `warmed_up`, `main_table_row_count`, `file_size`                                                                                                                     | [src-cs-partitions] |
  | `system.chunks`             | `id`, `file_name`, `partition_id`, `replay_handle_id`, `row_count`, `uploaded`, `active`, `in_memory`, `created_at`, `oldest_insert_at`, `deactivated_at`, `file_size`, `min_row`, `max_row`                                                                                                               | [src-cs-chunks]     |
  | `system.jobs`               | `id`, `row_reference`, `job_type`, `status`, `last_heart_beat`                                                                                                                                                                                                                                             | [src-cs-jobs]       |

- **Physical table names** embed the Cube partition start date and version hashes, for example `dev_pre_aggregations.orders_main20190101_23jnqarg_uiyfxd0f_1gifflf` [doc-use]. The schema defaults to `dev_pre_aggregations` in development and `prod_pre_aggregations` in production (`CUBEJS_PRE_AGGREGATIONS_SCHEMA`, or the `pre_aggregations_schema` config option) [ref-env] [ref-config]. The client type's comment calls `targetTableName` the table "content and structure versions included" [src-client-types].

### 7. Operations: production, cost and non-additivity

- **Build strategies** [doc-use]:
  - _Simple_: stages through the source database; not recommended for large data.
  - _Batching_: compressed CSVs; enabled automatically where supported.
  - _Export bucket_: recommended above about 100k rows; needs `CREATE TABLE` permission and a separately configured retention policy.
- **Partitioning guidance:**
  - Partitions should be small enough that a worker scans one in under 100 ms.
  - "Lean towards less partitions". Workers handle up to 4 partitions concurrently, so avoid more than 64 partitions in a build, or 32 with two indexes [doc-use].
  - Keep total partitions below 500–1,000 per pre-aggregation [ref-pa].
  - `orchestrator_options.preAggregationsOptions.maxPartitions` defaults to `10000` [ref-config].
  - Cube Store auto-partitions by index sort key. Explicit non-time partitioning is possible through multi-tenancy (orchestrator IDs and per-key schemas) [doc-use].
- **Indexes** [doc-use]:
  - Column order matters: first high-selectivity single-value filters, then GROUP BY dimensions, then the rest.
  - Extra indexes add build time but no warehouse cost.
  - Without a usable index, Cube Store falls back to hash aggregation or full scans.
  - Just-built versions are "pending compaction" for seconds to minutes.
- **Heavy builds** [doc-prod]: use an export bucket, partitions, incremental builds, a suitable build range, fewer high-cardinality dimensions, split pre-aggregations, or an `original_sql` stage.
- **Rollup-only mode** [doc-use] [ref-env]:
  - `CUBEJS_ROLLUP_ONLY=true` serves queries only from pre-aggregations.
  - On a single node that is also the refresh worker, unmatched queries error.
- **Cost guide** [rec-cost]:
  - Pre-aggregations are "the most effective way to reduce data store usage and costs".
  - Use rollup-only mode to prevent non-cached queries.
  - Align refresh with data loads, and use lambda for real-time data.
  - Use partitioned incremental refresh for append-only data, with an update window for late-settling data.
  - Very frequent refresh "can increase your data warehouse costs" [doc-overview].
- **Non-additivity** [rec-nonadd]:
  - `count_distinct`, `avg` and custom aggregations such as percentiles match only exact-dimension queries.
  - Remedies:
    1. Use `count_distinct_approx`. It is approximate, and supported only for "Athena, BigQuery, and Snowflake".
    2. Decompose `avg` into `sum` / `count`, and don't include the `avg` measure itself in the pre-aggregation.
    3. Add exact-match pre-aggregations.
- **Other recipes:**
  - Refresh only affected partitions with `refresh_key.sql` + `FILTER_PARAMS` [rec-select].
  - Push date filters into cube SQL for incremental builds with `FILTER_PARAMS` and build ranges [rec-incr].
  - Toggle pre-aggregations by environment with Jinja `env_var` [rec-disable].
- **Garbage collection** [ref-env]:
  - `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH` (default `true`) drops pre-aggregations the refresh worker didn't touch.
  - `CUBEJS_TOUCH_PRE_AGG_TIMEOUT` defaults to 86400 s.
- **Refresh worker, `CUBEJS_PRE_AGGREGATIONS_BUILDER`, `externalRefresh`, `scheduled_refresh_contexts`/`time_zones`:** cross-reference to the build-jobs and refresh-worker researcher [doc-refresh] [ref-config] [ref-env].

### 8. Monitoring: Cloud vs Core

**Cube Cloud (Cloud-only):**

- The Pre-Aggregations page lists all pre-aggregations with last build, build duration, total size and partition count [cloud-mon].
  - The Partitions view shows per-partition build time and size, with "Build All" and "Build Selected".
  - Tabs: Definition, Preview, Used By (recent queries), Indexes.
  - Build History covers "the last 24 hours" with status, trigger, start and duration.
  - The page states no plan tier.
- Query History [cloud-qh]:
  - filters on whether a query was accelerated
  - a Pre-Aggregations tab
  - an "Accelerate" action that adds a pre-aggregation
  - a Flame Graph
  - an SQL tab that shows the Cube Store SQL
- Performance Insights shows requests by cache type and Cube Store worker saturation. It is "Available on Premium and above plans" [cloud-perf].
- Bring-your-own pre-aggregation storage (S3, GCS, Azure) is Enterprise with Dedicated Infrastructure only, and not in Government or China regions [cloud-byo].

**Core:** what it exposes, and through which API:

- **Per query:** `usedPreAggregations`, `external` and `lastRefreshTime` on `/v1/load` (documented) [ref-rest]. Before execution, `/v1/sql` returns the generated SQL (documented) plus `external` and `preAggregations` (source-only) [src-gateway] [src-compilerapi].
- **Inventory, partitions, version entries (`last_updated_at`, content and structure versions), preview, errors, queue:** `/cubejs-system/v1/pre-aggregations*` (source-only; needs `CUBEJS_PLAYGROUND_AUTH_SECRET`) [src-gateway].
- **Build job status:** `/v1/pre-aggregations/jobs` (documented; cross-reference) [ref-rest].
- **Physical state:** Cube Store SQL, including `information_schema.tables` (documented) and `system.tables`/`partitions`/`chunks`/`indexes`/`jobs` (source-only). This covers row counts, file sizes, readiness (`is_ready`, `has_data`), `created_at`, `build_range_end`, active and warmed-up partitions, and job heartbeats [ref-cs-sql] [src-cs-info].
- **Lifecycle log events** through the `logger` config option [ref-config]. Event names include:
  - `'Executing Load Pre Aggregation SQL'`
  - `'Refreshing pre-aggregation content'`
  - `'Error refreshing pre-aggregation'`
  - `'Pre-aggregations build job error'`
  - `'Uploading external pre-aggregation completed'`
  - `'Creating pre-aggregation index'`
  - `'Dropping orphaned tables'`

  See [src-loader] for the full list.

- **Cube Store metrics:** statsd or dogstatsd (`CUBESTORE_METRICS_FORMAT`, `_ADDRESS` default `127.0.0.1`, `_PORT` default `8125`) [ref-env].
- **Not in Core:** build history over time, a "used by" query list, query history and performance charts. wechart would have to derive these by logging `usedPreAggregations` and job results itself.

## Capability inventory

| Capability                                                                                                 | Core or Cloud-only                                                     | API/config surface to drive it                                                                                                                                                                             | Candidate wechart UI surface                                                             | Source                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Define and edit `rollup` (measures, dimensions, segments, time_dimension, granularity)                     | Core                                                                   | Data model `pre_aggregations` (YAML/JS files); no REST write API                                                                                                                                           | Pre-aggregation editor per cube (form + YAML preview)                                    | [ref-pa] [ref-rest]                                   |
| `original_sql` + `use_original_sql_pre_aggregations`                                                       | Core                                                                   | Data model                                                                                                                                                                                                 | Editor: "materialize cube SQL" toggle; warn when `external: true`                        | [ref-pa] [rec-osql]                                   |
| `rollup_join` (Preview; cross-data-source; exactly two rollups)                                            | Core                                                                   | Data model `type: rollup_join`, `rollups`, join-key indexes                                                                                                                                                | Editor with validation: 2 rollups, index on join key, no `scheduled_refresh`             | [ref-pa] [rec-cadence]                                |
| `rollup_lambda` (+ `union_with_source_data`)                                                               | Core (Cube Store only)                                                 | Data model; must be listed first                                                                                                                                                                           | Editor that enforces ordering; "real-time" badge                                         | [ref-pa] [doc-lambda]                                 |
| Streaming (ksqlDB) rollups                                                                                 | Core                                                                   | `read_only`, `stream_offset`, `unique_key_columns`, `output_column_types`                                                                                                                                  | Editor section shown only for ksqlDB data sources                                        | [ksql]                                                |
| Multiple `time_dimensions`, `autoRollup`, `sql_alias`, `refresh_range_*`, `{sql}` indexes, CRON `timezone` | Core (source-only, undocumented)                                       | Validator keys                                                                                                                                                                                             | Not surfaced (or hidden "advanced" JSON) until documented                                | [src-validator]                                       |
| Partitioning (`partition_granularity`)                                                                     | Core                                                                   | Data model; `maxPartitions` (default 10000)                                                                                                                                                                | Editor with a live partition-count estimate against the 500–1,000 guidance               | [ref-pa] [ref-config]                                 |
| Refresh strategy (`every`, `sql`, CRON, `incremental`, `update_window`)                                    | Core                                                                   | Data model                                                                                                                                                                                                 | Refresh editor; restrict intervals to second/minute/hour/day/week (validator)            | [ref-pa] [src-validator] [issue-3586]                 |
| Build range (`build_range_start`/`end`)                                                                    | Core                                                                   | Data model                                                                                                                                                                                                 | Editor; warn that data outside the range is not returned                                 | [ref-pa]                                              |
| `scheduled_refresh`                                                                                        | Core                                                                   | Data model; `CUBEJS_SCHEDULED_REFRESH_DEFAULT`                                                                                                                                                             | Editor toggle; warn that `false` means GC drops the tables                               | [ref-pa] [src-env]                                    |
| `allow_non_strict_date_range_match`                                                                        | Core                                                                   | Data model; env default `true`                                                                                                                                                                             | Editor toggle, showing the env default                                                   | [ref-pa] [ref-env]                                    |
| Regular and aggregating indexes                                                                            | Core                                                                   | Data model `indexes` (`type: aggregate`)                                                                                                                                                                   | Index editor with column ordering (drag to reorder)                                      | [ref-pa] [doc-use]                                    |
| Storage location (`external`)                                                                              | Core                                                                   | Data model; `CUBEJS_EXTERNAL_DEFAULT` (source)                                                                                                                                                             | Read-only "stored in Cube Store / source DB" chip                                        | [src-symbols] [doc-use]                               |
| Chart "served from pre-aggregation" indicator                                                              | Core (documented, ≥1.7.33)                                             | `/v1/load` `usedPreAggregations`, `external`, `lastRefreshTime`; `serialize().loadResponse` in client                                                                                                      | Chart header badge + inspector panel (id, type, last updated)                            | [ref-rest] [pr-11591] [src-client-rs]                 |
| Predict hit before running                                                                                 | Core (SQL text documented; `external`/`preAggregations` source-only)   | `/v1/sql`                                                                                                                                                                                                  | Chart builder hint ("will use orders.main")                                              | [ref-rest] [src-compilerapi]                          |
| Suggest a pre-aggregation for a slow chart                                                                 | Core (dry-run and can-use are source-only)                             | `/v1/dry-run` `transformedQueries` → Playground algorithm; `/v1/pre-aggregations/can-use`; then verify with `/v1/sql` or `usedPreAggregations`                                                             | "Accelerate this chart" dialog showing the proposed YAML and non-additivity advice       | [src-pg-utils] [src-pg-rd] [src-gateway] [rec-nonadd] |
| List all pre-aggregations                                                                                  | Core (source-only) or wechart's own model index                        | `GET /cubejs-system/v1/pre-aggregations` (needs `CUBEJS_PLAYGROUND_AUTH_SECRET`)                                                                                                                           | Pre-aggregations inventory page                                                          | [src-gateway]                                         |
| Partitions per pre-aggregation (date ranges, table names, errors)                                          | Core (source-only)                                                     | `POST /cubejs-system/v1/pre-aggregations/partitions` with `expand`                                                                                                                                         | Partition table in the detail drawer                                                     | [src-gateway] [src-orch-pa]                           |
| Freshness                                                                                                  | Core                                                                   | Per query: `lastRefreshTime`, `usedPreAggregations[].lastUpdatedAt` (documented). Per partition: `versionEntries[].last_updated_at` (source-only). Cube Store `system.tables.created_at` (source-only)     | "Last built" column + stale warning                                                      | [ref-rest] [src-orch-pa] [src-cs-tables]              |
| Size and row counts                                                                                        | Core via Cube Store SQL only (source-only tables); Cloud UI shows size | `system.partitions.file_size`/`main_table_row_count`, `system.chunks.row_count`/`file_size`, over MySQL :3306                                                                                              | Size column; partition skew chart                                                        | [src-cs-partitions] [src-cs-chunks] [ref-cs-sql]      |
| Build status / trigger / cancel                                                                            | Core                                                                   | `/v1/pre-aggregations/jobs` (documented); `/cubejs-system/.../build`, `/queue`, `/cancel` (source-only); Cube Store `system.jobs`, `QUEUE LIST/ACTIVE/PENDING`. **Cross-reference: build-jobs researcher** | Status column + "Build"/"Build selected partitions" actions                              | [ref-rest] [src-gateway] [ref-cs-sql]                 |
| Data preview of a built pre-aggregation                                                                    | Core (source-only)                                                     | `POST /cubejs-system/v1/pre-aggregations/preview`                                                                                                                                                          | Preview tab                                                                              | [src-gateway]                                         |
| Build history (24 h), "Used By" queries                                                                    | Cloud-only                                                             | Cube Cloud UI                                                                                                                                                                                              | wechart equivalent requires wechart to log `usedPreAggregations` and job outcomes itself | [cloud-mon]                                           |
| Query history acceleration filter, flame graph, "Accelerate"                                               | Cloud-only                                                             | Cube Cloud UI                                                                                                                                                                                              | wechart's own query log + suggestion dialog                                              | [cloud-qh]                                            |
| Performance Insights (cache-type mix, worker saturation)                                                   | Cloud-only (Premium+)                                                  | Cube Cloud UI                                                                                                                                                                                              | Out of scope unless wechart builds it from statsd metrics                                | [cloud-perf]                                          |
| Query plan diagnostics                                                                                     | Core                                                                   | Cube Store `EXPLAIN`, `EXPLAIN ANALYZE`, `EXPLAIN ANALYZE DETAILED`                                                                                                                                        | Admin "diagnose slow chart" panel (plan + optimal/sub-optimal heuristic)                 | [ref-cs-sql]                                          |
| Cube Store maintenance (`SYS …`, `CACHE CLEAR`, `QUEUE CLEAR`)                                             | Core                                                                   | Cube Store SQL (destructive)                                                                                                                                                                               | Not surfaced, or admin-only with confirmation                                            | [ref-cs-sql]                                          |
| Rollup-only mode                                                                                           | Core                                                                   | `CUBEJS_ROLLUP_ONLY`                                                                                                                                                                                       | Read-only deployment setting display; per-chart "would fail in rollup-only" warning      | [doc-use] [ref-env]                                   |
| Pre-aggregation time zones                                                                                 | Core                                                                   | `scheduled_refresh_time_zones`; `/cubejs-system/.../timezones` (source-only)                                                                                                                               | Show the build zones; warn when a chart's time zone isn't among them                     | [doc-match] [ref-config] [src-gateway]                |
| Security contexts for builds                                                                               | Core                                                                   | `scheduled_refresh_contexts`; `/cubejs-system/.../security-contexts` (source-only). **Cross-reference: security researcher**                                                                               | Tenant selector in the inventory                                                         | [ref-config] [src-gateway]                            |
| Pre-aggregation schema                                                                                     | Core                                                                   | `CUBEJS_PRE_AGGREGATIONS_SCHEMA` / `pre_aggregations_schema`                                                                                                                                               | Read-only settings display                                                               | [ref-env] [ref-config]                                |
| Garbage collection of orphaned tables                                                                      | Core                                                                   | `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH`, `CUBEJS_TOUCH_PRE_AGG_TIMEOUT`                                                                                                                                        | Read-only settings display                                                               | [ref-env]                                             |
| Lifecycle logs                                                                                             | Core                                                                   | `logger` config option                                                                                                                                                                                     | Admin log stream filtered to pre-aggregation events                                      | [ref-config] [src-loader]                             |
| Cube Store metrics                                                                                         | Core                                                                   | `CUBESTORE_METRICS_*` (statsd/dogstatsd)                                                                                                                                                                   | Ops only (outside UI)                                                                    | [ref-env]                                             |
| Cube Store cluster, storage, encryption                                                                    | Core (ops); Parquet encryption Enterprise; HA Cloud-only               | `CUBESTORE_*` env, docker-compose                                                                                                                                                                          | Not a UI surface (deployment)                                                            | [doc-prod] [ref-env]                                  |
| Bring-your-own pre-aggregation bucket                                                                      | Cloud-only (Enterprise, Dedicated)                                     | Cube Cloud support process                                                                                                                                                                                 | None                                                                                     | [cloud-byo]                                           |

## Gotchas

- **`update_window`/`every` units.** The validator accepts only `second|minute|hour|day|week` (optionally plural) [src-validator]. The docs' own example `update_window: 3 months` [doc-use] fails compilation. Issue #3586 is still open [issue-3586]. The wechart editor must emit day or week multiples.
- **`lastUpdatedAt` type mismatch.** The client type and `VersionEntry.last_updated_at` are `number` [src-client-types] [src-orch-pa], but the REST reference example shows an ISO string [ref-rest]. Parse both.
- **`usedPreAggregations` semantics:**
  - Absent when there was no hit (not `{}`).
  - Keyed by table name, so use `preAggregationId` as the stable identity.
  - `rollupJoin` and `rollupLambda` are reported as their referenced rollups [ref-rest].
  - `type` uses camelCase values (`originalSql`, `rollupJoin`), unlike the snake_case YAML types [src-client-types] [ref-pa].
  - It requires Cube ≥ 1.7.33 [changelog].
- **Information disclosure.** Pre-aggregation names reach every consumer, including public embedding tokens [ref-rest]. Don't rely on `targetTableName` or `refreshKeyValues`: they appear only with `CUBEJS_DEV_MODE`, which "bypasses authentication" [ref-rest].
- **Two matchers.** With Tesseract on by default, real query routing may use the Rust matcher [src-pamatch] [src-env]. `/v1/pre-aggregations/can-use` always uses the JS matcher [src-gateway] [src-compilerapi]. Treat can-use as advisory, and confirm with `/v1/sql` or `usedPreAggregations`.
- **Undocumented system API.** `/cubejs-system/*`, `/v1/dry-run`, `/v1/pre-aggregations/can-use` and the Cube Store `system.*` tables aren't in the docs at the tag [ref-rest] [ref-cs-sql]. They can change in any patch release.
  - Enabling `/cubejs-system/*` in production means setting `CUBEJS_PLAYGROUND_AUTH_SECRET`, whose tokens can also build and cancel [src-gateway].
- **Cube Store has no authentication and no HA in OSS** [core-prod] [doc-prod]. Querying it from wechart widens its network exposure.
- **Build range hides data.** Queries outside `build_range_*` return empty results rather than falling back. Use lambda if that isn't acceptable [ref-pa].
- **Lambda constraints:**
  - It must be the first pre-aggregation in the cube and works only with Cube Store [ref-pa] [doc-lambda].
  - It only covers data newer than the batch [doc-lambda].
  - Its validator schema has no `refresh_key`, `indexes` or `external` [src-validator].
- **`rollup_join`:**
  - It is in Preview, and the API may change [ref-pa].
  - It is for cross-data-source joins only; for same-source joins use a multi-cube `rollup` [ref-pa].
  - `scheduled_refresh` must be `false` or unset [src-validator].
- **`original_sql`:**
  - It is stored in the source database, which needs write access (no `readOnly: true` driver) [rec-osql].
  - Indexes on `original_sql` can fail on Postgres, which is relevant to wechart's sample DB. Issue #7420 is open [ref-pa] [issue-7420].
- **Non-additive measures on Postgres.** `count_distinct_approx` is documented only for Athena, BigQuery and Snowflake [rec-nonadd], so suggestions for the Postgres sample must use decomposition or exact-match rollups.
- **Time zones.** The query time zone must equal a pre-aggregation build zone [doc-match]. Charts with a per-dashboard time zone miss unless that zone is in `scheduled_refresh_time_zones`.
- **Multi-fact and multi-stage queries are all-or-nothing** [doc-match]. One unmatched subquery sends the whole chart to the source.
- **`scheduled_refresh: false`** tables are "considered stale and orphaned" and dropped by GC [ref-pa]. GC also fails on XFS [doc-prod].
- **`every` runs at least once per interval, not at most once.** CRON + `sql` is a compile error [ref-pa].
- **Conflicting partition guidance:**
  - The reference says 500–1,000 per pre-aggregation [ref-pa].
  - The best-practices section says at most 64 per build (32 with two indexes) [doc-use].
  - `maxPartitions` defaults to 10000 [ref-config].

  Surface all three in the editor rather than picking one.

- **MinIO contradiction.** The architecture page lists MinIO as an object store [doc-csa]. The production guides say MinIO lacks the required consistency [doc-prod] [core-prod]. Local-filesystem `CUBESTORE_REMOTE_DIR` is "not recommended for production" [ref-env].
- **Docs navigation.** `docs/pre-aggregations/running-in-production.mdx` and `overview.mdx` exist at the tag but aren't linked from `docs.json`. The navigable page is `cube-core/running-in-production` [docs-nav] [core-prod].
- **1.7.0 breaking change.** All numeric query results are serialized as JSON strings, and CubeStore responses use Arrow internally [changelog]. That isn't specific to pre-aggregations, but it affects any wechart code that reads results served from rollups.
- **Snowflake time zones (enterprise sources).** `TIMESTAMP_TZ`/`TIMESTAMP_LTZ` rollups failed in Cube Store because of a driver type-map gap, fixed by PR #11404 [issue-11403]. I didn't confirm which release carries the fix.

## Alternatives considered

The caller didn't ask for a comparison.

## Open questions / unverified

1. **System API in production.** Is relying on undocumented `/cubejs-system/*` routes (and setting `CUBEJS_PLAYGROUND_AUTH_SECRET` in production) acceptable? The alternative is for wechart to derive the inventory from its own model files and read partition state from Cube Store directly. This is a decision for the user.
2. **Cube Store client.** Reading `system.*` tables from wechart's backend needs a MySQL-protocol client library, which needs its own research doc. It also needs a network policy exception to the docs' "only allows access from the Cube deployment" guidance [core-prod].
3. UNVERIFIED: whether Cube Store accepts SQL joins across `system.*` tables (for example `partitions` → `indexes` → `tables` to sum size per pre-aggregation), given that user-table joins are merge-join only [doc-csa]. Not tested. Fallback: query each table and join in wechart.
4. UNVERIFIED: whether `usedPreAggregations` is present when `/v1/load` is served from the in-memory result cache. The docs don't say [ref-rest].
5. UNVERIFIED: the exact `/v1/sql` JSON for `external` and `preAggregations`. I read it from `getSql` [src-compilerapi], not from a live response.
6. UNVERIFIED: whether `/v1/pre-aggregations/can-use` needs `references.rollups`. The matcher reads `references.rollups.length` [src-pamatch], but the Playground sends only `measures`, `dimensions` and `timeDimensions` [src-pg-rd]. Test against a running 1.7.42.
7. UNVERIFIED: the semantics of `autoRollup`, `time_dimensions` (multiple), `refresh_range_start/end` and pre-aggregation-level `sql_alias`. They exist only in the validator [src-validator].
8. UNVERIFIED: the Cube Store configuration variables for Azure Blob. Azure is named as supported [doc-prod], but no `CUBESTORE_AZURE_*` entries are in the env reference [ref-env].
9. UNVERIFIED: whether the system JWT needs a `Bearer ` prefix and any claims. `createCheckAuthSystemFn` shows only key and algorithm [src-gateway].
10. UNVERIFIED: when the server sets `LoadResponse.slowQuery`. The field is typed [src-client-types] but not documented [ref-rest]. wechart may need its own latency measure to define "slow chart", which is a product question for the user.
11. UNVERIFIED: which Cube Cloud plan tier includes the Pre-Aggregations monitoring page. The page doesn't state one [cloud-mon].
12. **Research gap.** The matching flowchart image (`https://ucarecdn.com/f986b0cb-a9ea-47b7-a743-ca9a4644c246/`) wasn't readable. The branch logic above comes from source [src-pamatch], not the image.
13. **Scope.** `@cubejs-client/core` is listed in `packages:` for the pre-aggregation surface only (`load`, `sql`, `dryRun`, `ResultSet.serialize`, the related types). A general client-core research doc (auth, `CubeApiOptions`, React bindings) should cover the rest of the package.

[input]: ../../inputs/2026-09-19-product-direction.md
[ref-pa]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[ref-cube]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[doc-use]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/using-pre-aggregations.mdx
[doc-match]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/matching-pre-aggregations.mdx
[doc-lambda]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/lambda-pre-aggregations.mdx
[doc-csa]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/cube-store-architecture.mdx
[doc-prod]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/running-in-production.mdx
[core-prod]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/running-in-production.mdx
[doc-refresh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/refreshing-pre-aggregations.mdx
[doc-overview]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/pre-aggregations/overview.mdx
[core-add]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/getting-started/add-a-pre-aggregation.mdx
[ref-cs-sql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/cubestore/sql-commands.mdx
[ref-rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[ref-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[ref-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[rec-nonadd]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/non-additivity.mdx
[rec-osql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/using-originalsql-and-rollups-effectively.mdx
[rec-select]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/refreshing-select-partitions.mdx
[rec-incr]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/incrementally-building-pre-aggregations-for-a-date-range.mdx
[rec-multids]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/joining-multiple-data-sources.mdx
[rec-cadence]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/mixed-refresh-cadences-rollup-join.mdx
[rec-disable]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/pre-aggregations/disabling-pre-aggregations.mdx
[rec-cost]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/configuration/data-store-cost-saving-guide.mdx
[cloud-mon]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/pre-aggregations.mdx
[cloud-qh]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/query-history.mdx
[cloud-perf]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/monitoring/performance.mdx
[cloud-byo]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/deployment/dedicated/pre-aggregation-storage.mdx
[ksql]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/connect-to-data/data-sources/ksqldb.mdx
[docs-nav]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs.json
[src-validator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[src-symbols]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[src-pamatch]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
[src-gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[src-compilerapi]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts
[src-refresh]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[src-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[src-orch-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[src-loader]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[src-client-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/types.ts
[src-client-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[src-client-rs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/ResultSet.ts
[src-pg-utils]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-playground/src/rollup-designer/utils.ts
[src-pg-rd]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-playground/src/rollup-designer/RollupDesigner.tsx
[src-cs-info]: https://github.com/cube-js/cube/tree/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema
[src-cs-ist]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/info_schema_tables.rs
[src-cs-tables]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/system_tables.rs
[src-cs-indexes]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/system_indexes.rs
[src-cs-partitions]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/system_partitions.rs
[src-cs-chunks]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/system_chunks.rs
[src-cs-jobs]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/queryplanner/info_schema/system_jobs.rs
[changelog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[rel-1742]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[rel-1733]: https://newreleases.io/project/github/cube-js/cube/release/v1.7.33
[pr-11591]: https://github.com/cube-js/cube/pull/11591
[issue-3586]: https://github.com/cube-js/cube/issues/3586
[issue-7420]: https://github.com/cube-js/cube/issues/7420
[issue-11403]: https://github.com/cube-js/cube/issues/11403
[npm-client]: https://registry.npmjs.org/@cubejs-client/core/latest
[npm-csdriver]: https://registry.npmjs.org/@cubejs-backend/cubestore-driver/latest
[npm-cs]: https://registry.npmjs.org/@cubejs-backend/cubestore/latest
[dh-cube]: https://hub.docker.com/r/cubejs/cube/tags
[dh-cs]: https://hub.docker.com/r/cubejs/cubestore/tags
