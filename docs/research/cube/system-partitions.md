---
library: Cube system routes (pre-aggregation partitions)
packages: []
version: 1.7.45
researched: 2026-09-24
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/time.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-testing/test/smoke-postgres.test.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
  - https://github.com/cube-js/cube/pull/11571
  - https://github.com/cube-js/cube/pull/9342
---

# Cube system routes (pre-aggregation partitions) 1.7.45

## Summary

This doc covers Cube Core's undocumented route `POST /cubejs-system/v1/pre-aggregations/partitions`: how to switch it on, how to authenticate to it, what it takes and returns, and how Cube derives the partitions it lists. It also covers the documented jobs API's `selector.dateRange`, which rebuilds one partition at a time. Together they serve **AC-145** (docs/spec.md, amended 2026-09-24) and task **T151** (docs/tasks.md).

The user's decisions (spec F16 status note), which this doc takes as given:
- Read the partition list from the system route, read-only.
- Keep the enabling secret in Cube's and wechart's API environments only.
- Run a contract test on every Cube upgrade.
- Rebuild each selected partition through `POST /cubejs-api/v1/pre-aggregations/jobs` with `selector.dateRange = [partition start, partition start]`.

Pinned to **v1.7.45**. Tag v1.7.45 is commit `f2c28b8` (job-records.md). Line numbers are at the tag unless a link is marked **(checkout)**. Those come from a local clone at [`8368f2a`](https://github.com/cube-js/cube/commit/8368f2af49be2ee4926bc97c10d7174c7fa16297) (2026-09-11), and the tag's version was not re-read. Where a file has no commits between a copy and the tag, the doc says so, citing GitHub's history API.

**Verdict on the earlier analysis's eight claims** (details in the sections below):

1. **Mostly correct.** The routes are mounted only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set ([gw-sys]), under a "Private API (no scopes)" banner. They authorize with an HS256 JWT signed with that secret, and the JWT's payload becomes the security context ([gw-sysauth], [gw-defauth]). Corrections:
   - The block starts at L620 in v1.7.45 (L619 in v1.7.42 and v1.7.43).
   - Auth is enforced only when `NODE_ENV=production`. Otherwise no token is needed at all ([gw-ctor], [gw-defauth]).
   - The request has no `contexts` field and no `dateRange` field. The security context is the token's payload, and `dateRange` is rejected ([q-pa]).
   - The filter on the current structure version is at [QueryOrchestrator.ts L380–L397][qo-ver].
2. **Correct.** The main API accepts playground-signed tokens as a fallback ([gw-checkauth]). Debug detail requires `scope: ['dev-token']` ([gw-devtoken]). The secret does not turn on the Playground UI in production ([opts], [srv-dev]). A `Bearer ` prefix is optional ([gw-hdr]).
3. **Context.** The token's payload must carry `wechartStore`. **Time zones:** the request's `timezones` win, then `scheduledRefreshTimeZones`, then `UTC` ([gw-part], [q-pa]).
4. **"Not built" is `versionEntries: []`.** The route never reads the 1.7.43+ build-status record, so it cannot show "building" or "failed" ([pa-bs], [gw-part]).
5. **Derivation.** Partitions are a time series over the build range in each zone's local time, and only the last partition is clipped. `rollup_join` and `rollup_lambda` list none, and a non-partitioned rollup lists one ([prl-pp], [prl-desc], [rs-pp]).
6. **Confirmed, with conditions.** `[start, start]` matches exactly one partition when `start` is the partition's **local wall-clock** string in `YYYY-MM-DDTHH:mm:ss.SSS` form with no `Z` or offset, one zone is posted at a time, and the rollup's `timestampPrecision` is 3 ([gw-jobspost], [rs-post], [prl-int], [time]).
7. **Identical at v1.7.42, v1.7.43, v1.7.45 and master (2026-09-24),** apart from a one-line shift and an internal cache change in v1.7.44. Cube's smoke tests call `/partitions`, but in dev mode without auth.
8. **The secret opens much more than `partitions`:** build, cancel, queue and data preview, plus the whole main API under any security context. See Security for mitigations.

## Install

- **No npm package.** wechart's API calls the route with `fetch`, next to its existing Cube calls in /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts.
- **Images:** `cubejs/cube:v1.7.45` and `cubejs/cubestore:v1.7.45-arm64v8` (/Users/srajagopal/Work/wechart/docker-compose.yml L59, L67, L117; job-records.md "Install").
- **Enabling variable:** `CUBEJS_PLAYGROUND_AUTH_SECRET`, read by `getEnv('playgroundAuthSecret')` ([env], [srv-gw] L495). It is **not** in the environment-variable reference at the tag ([doc-env]). The REST reference doesn't mention `/cubejs-system` either ([doc-rest-ref]).
- **Runtime requirement:** keep `NODE_ENV=production` wherever the secret is set. `enforceSecurityChecks` is `options.enforceSecurityChecks || NODE_ENV === 'production'` ([gw-ctor] L288). Without it, a missing or invalid token is silently accepted ([gw-defauth] L2745–L2753).

## Init / auth pattern (Enabling and auth)

**Mounting.** `initApp` registers these routes only inside `if (this.playgroundAuthSecret)` ([gw-sys], L620–L692):
- `GET /cubejs-system/v1/context`
- `GET /cubejs-system/v1/pre-aggregations`
- `GET /cubejs-system/v1/pre-aggregations/security-contexts`
- `GET /cubejs-system/v1/pre-aggregations/timezones`
- `POST /cubejs-system/v1/pre-aggregations/partitions`
- `POST /cubejs-system/v1/pre-aggregations/preview`
- `POST /cubejs-system/v1/pre-aggregations/build`
- `POST /cubejs-system/v1/pre-aggregations/queue`
- `POST /cubejs-system/v1/pre-aggregations/cancel`

Details:
- The paths are literals, so they are **not** under `basePath` (`/cubejs-api`) ([gw-sys]). wechart's `apiUrl` ends in `/cubejs-api` (client.ts L56). Build the system URL from Cube's origin, not from `apiUrl`.
- Without the secret, the routes don't exist. Cube's unit test expects 404 ("not route (works only with playgroundAuthSecret)", [t-gw] **(checkout)**).
- The middleware is `checkAuthSystemMiddleware → requestContextMiddleware → contextRejectionMiddleware → requestLoggerMiddleware` ([gw-sys] L621–L626). **No `assertApiScope` runs**, so `contextToApiScopes` does not apply ([gw-part], [gw-sys]).

**Token.**
- `createCheckAuthSystemFn` calls `createDefaultCheckAuth({ key: playgroundAuthSecret, algorithms: ['HS256'] }, { isPlaygroundCheckAuth: true })` ([gw-sysauth]).
- `options.key` wins over `CUBEJS_API_SECRETS` and `CUBEJS_API_SECRET` ([gw-defauth] L2648–L2659). So a token signed with wechart's normal `CUBEJS_API_SECRET` gets 403 on these routes. Cube's test "not allowed with user token" expects exactly that ([t-gw] **(checkout)**).
- The JWT options (`issuer`, `audience`, `jwkUrl`) and any `checkAuth` in `cube.js` are not applied to system routes. Only key and algorithm are passed ([gw-sysauth], [gw-checkauth]).
- The verified payload becomes `req.securityContext` ([gw-defauth] L2742). `contextByReq` then builds the request context `{ securityContext, authInfo, signedWithPlaygroundAuthSecret, requestId, …extendContext }` ([gw-ctxbyreq]).
- Failure answers in production:
  - no header → 403 `{"error":"Authorization header isn't set"}`
  - a bad or expired token → 403 `{"error":"Invalid token"}`

  Sources: [gw-defauth] L2746–L2753, [gw-wrap]. On failure, `checkAuthWrapper` logs the presented `token` ([gw-wrap] L2889–L2894).

**Header.** Cube reads `x-cube-authorization` first, then `authorization`. It splits on the first space: one part is taken as the token, two parts means the second is the token ([gw-hdr]). So `Bearer <jwt>`, `<jwt>` and `<anything> <jwt>` all work.

**Which security context.**
- The partitions call compiles the model and derives partitions under the token's context: `getCompilerApi(context)` and `refreshScheduler().preAggregationPartitions(context, …)` ([gw-part] L911–L918, [rs-pp] L400).
- wechart's `cube.js` picks the model by `securityContext.wechartStore`. The value must be one of `WECHART_MODEL_STORES`, and without it Cube reads the mounted directory (/Users/srajagopal/Work/wechart/infra/cube/cube.js L28–L31, L79–L104).
- So the payload must be wechart's configured context, `{ wechartStore: "<store url>" }`. That is the same context the refresh worker builds for (cube.js L134–L137) and the one wechart puts in `selector.contexts` for jobs (client.ts L133).
- Never add `wechartDraft`. Drafts are not built (cube.js L116–L127).
- Never add `scope: ['dev-token']`. It is not needed here and only widens what the token unlocks (see Security).
- `iat`/`exp` also end up in the security context. That is harmless unless the model reads them (inference; wechart's model doesn't).

**Minimal server-side call (TypeScript, Node 26).** The signing mirrors `CubeClient.#token` (client.ts L219–L240).

```ts
import { createHmac } from 'node:crypto';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
function systemToken(secret: string, securityContext: Record<string, unknown>, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...securityContext, iat: now, exp: now + ttlSeconds })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

const url = new URL('/cubejs-system/v1/pre-aggregations/partitions', cubeApiUrl); // origin root, not /cubejs-api
const res = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${systemToken(systemSecret, { wechartStore })}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: { timezones: ['UTC'], preAggregations: [{ id: 'monthly_orders.by_status_month' }] } }),
});
```

## API surface we will use

### Request and response shape

**Request:** `POST /cubejs-system/v1/pre-aggregations/partitions` with a JSON body `{ "query": { … } }` ([gw-part-route]).
- The route passes `req.body.query` on. It may also be a JSON string. A missing `query` gives 400 `Query param is required` ([gw-parse]).
- The body parser is `bodyParser.json({ limit: getEnv('maxRequestSize') })` ([gw-jsonparser]).

`query` is validated by Joi ([q-pa] L516–L528). Unknown keys fail with 400 `Invalid query format: …` ([q-pa] L530–L534):

| Key | Type | Effect |
| --- | --- | --- |
| `preAggregations` | `[{ id: string (required), cacheOnly?: boolean, metaOnly?: boolean, partitions?: string[], refreshRange?: [string, string] }]` | Which pre-aggregations to list. **Needed in practice:** the scheduler calls `queryingOptions.preAggregations.reduce(…)` with no guard ([rs-pp] L401), so omitting it throws (a 500, inferred from [gw-err] L2578–L2587). **`[]` means every pre-aggregation**, because `CubeEvaluator.preAggregations` treats an empty `preAggregationIds` as no filter ([ce]). An unknown id is silently dropped ([ce]). |
| `…[].partitions` | table names | Keeps only partitions whose `tableName` is listed ([rs-pp] L457–L458). |
| `…[].cacheOnly` | boolean | If the build range is not already cached, returns `errors: ['Waiting for cache']` and no partitions ([rs-rq] L173–L182). |
| `…[].metaOnly` | boolean | Returns the pre-aggregation with `partitions: []` ([rs-pp] L416–L424). |
| `…[].refreshRange` | — | Accepted ("TODO: Deprecate") but not read on this path ([q-pa] L526, [rs-pp]). |
| `timezones` / `timezone` | IANA names, canonicalized by `timezoneSchema` ([q-tz]) | Zones to derive partitions for. See Derivation. |
| `expand` | subset of `partitions.details`, `partitions.meta`, `partitions.versions` | Which groups each partition carries. **Omitted means all three** ([gw-part] L929–L932). |
| `metadata` | object | Passed through; unused here. |
| `dateRange` | — | **Not accepted:** 400 `"dateRange" is not allowed`. This is inferred from Joi's default rejection of unknown keys; probe P4 checks it. |

**Response:** HTTP 200 `{ preAggregationPartitions: Item[] }`, with one `Item` per matched pre-aggregation, in model order ([gw-part] L934–L956, [rs-pp] L412–L500):

```ts
type VersionEntry = {                    // PreAggregations.ts L89–L96
  table_name: string;                    // "<schema>.<name><suffix>", no version segments
  content_version: string;
  structure_version: string;
  last_updated_at: number;               // epoch ms (base-32 seconds × 1000 when naming_version is 2)
  naming_version?: number;               // 2 for current names
  build_range_end?: string;              // from Cube Store information_schema.tables, when set
};
type Partition = {
  // 'partitions.details': the whole partition description, spread (gateway L940)
  tableName: string; preAggregationId: string; type: 'rollup' | 'originalSql'; dataSource: string;
  timezone: string; granularity?: string; partitionGranularity?: string;
  buildRangeStart?: string; buildRangeEnd?: string;   // local 'YYYY-MM-DDTHH:mm:ss.SSS'
  loadSql: unknown; structureVersionLoadSql?: unknown; previewSql: unknown; indexesSql: unknown[];
  invalidateKeyQueries: unknown[]; preAggregationStartEndQueries?: unknown; external: boolean;
  timestampFormat: string; timestampPrecision: number; expandedPartition: true; sealAt?: string; /* … */
  // 'partitions.meta' (gateway L941–L946)
  // dataSource, preAggregationId, tableName, type
  // 'partitions.versions' (gateway L947–L950)
  versionEntries: VersionEntry[];        // current structure only, newest first; [] = not built
  structureVersion: string | [];         // this partition's current structure version; [] fallback
};
type Item = {
  errors: string[];                      // e.g. 'Unused pre-aggregation', 'Waiting for cache'
  timezones: string[];                   // the normalized request zones
  invalidateKeyQueries?: unknown[];      // first partition's refresh-key SQL
  preAggregation: {                      // CubeEvaluator PreAggregationInfo, plus rendered SQL keys
    id: string; preAggregationName: string; cube: string; dataSource: string;
    preAggregation: Record<string, unknown>; references: unknown; refreshKey: unknown; indexesReferences?: unknown;
  };
  partitions: Partition[];               // flattened over the requested zones, zone by zone
};
```

Sources for the shape:
- description fields: [pa-desc], [sc-pa], [prl-desc]
- `PreAggregationInfo`: [ce]
- the rendered `refreshKey`/`refreshRangeStart`/`refreshRangeEnd` `.sql` swapped into `preAggregation.preAggregation`: [rs-pp] L464–L494
- a unit-test expectation of the item shape: [t-rs] **(checkout)**, L711–L739
- Cube's own smoke test reads `partitions[0].timezone`, `.versionEntries[0]`, `.indexesSql` and `.loadSql`: [t-smoke-pg] L119–L165, [t-smoke-lambda] **(checkout)**

The `Partition` type is assembled from source, not observed. Probe P2 checks it.

**Other answers:**
- **Continue wait.** `OrchestratorApi.expandPartitionsInPreAggregations` turns a `ContinueWaitError` into `{ error: 'Continue wait' }` ([oa]). `handleError` answers that with **HTTP 200** `{"error":"Continue wait"}` ([gw-err] L2545–L2552). This happens when an uncached build-range query outlasts `continueWaitTimeout` (inference). Retry the same request.
- **Validation:** 400 `{"error":"Invalid query format: …"}` ([q-pa], [gw-err] L2537–L2544).
- **Other failures:** 500 `{"error":"<Error.toString()>"}` in production ([gw-err] L2578–L2587). One example is a pre-aggregation over `maxPartitions` ([prl-max]).

### Build state and versions

**Where `versionEntries` come from:**
1. `QueryOrchestrator.getPreAggregationVersionEntries` passes each item's model definition to `PreAggregations.getVersionEntries` ([qo-ver] L363–L378, [pa-getver] L909–L946).
2. That lists the pre-aggregation schema's tables through `PreAggregationLoadCache`, once per data source and schema ([plc] L179–L191).
3. For external rollups with Cube Store as the external database, `skipExternalCacheAndQueue` is true ([srv-redis] L750). The listing is then read **uncached**, straight from Cube Store's `information_schema.tables` ([plc] L112–L124, [csd] **(checkout)** L204–L209).
4. That listing includes only tables that are ready ([cs-meta] `get_tables_with_path(false)`, [cs-ist] L16–L24). wechart's rollups are external: `/v1/meta?extended` reports `external: true` (meta-extended-pre-aggregations.md).

**How entries are parsed and filtered:**
- `tablesToVersionEntries` splits each name with `/(.+)_(.+)_(.+)_(.+)/` into `table_name`, `content_version`, `structure_version` and `last_updated_at`. It decodes base-32 seconds to ms and **sorts newest first** ([pa-t2v] L240–L268, [pa-ver] L20–L26).
- The route keeps an entry only if its `table_name` belongs to a listed partition **and** its `structure_version` equals that partition's current `getStructureVersion` ([qo-ver] L380–L397).
- The structure version hashes the partition's load SQL, indexes, stream offset and output column types ([pa-ver] L74–L87). So these are dropped:
  - builds from before a model change;
  - tables of the same partition built for another time zone. The load SQL converts time zones, so the structure differs (inference; see Derivation).

**Mapping to AC-145:**

| AC-145 state | From the route | Source |
| --- | --- | --- |
| **built** | `versionEntries.length > 0`. "The time Cube last built it" is `versionEntries[0].last_updated_at`, Cube's newest version. It is when Cube created that version entry (enqueue time, one-second resolution), not when the build ended. | [pa-t2v], job-records.md "Table names" |
| **not built** | `versionEntries` is `[]` | [gw-part] L948 |
| **building** | **Not exposed.** The 1.7.43+ record `SQL_PRE_AGGREGATIONS_BUILD_STATUS` is read only by the jobs API's `isPartitionExist`. It is never read on this route. | [pa-bs] L382–L401, [gw-part] |
| **failed** | **Not exposed.** From 1.7.43 a failed external upload drops its partial table ([pr-11629]), so the route goes on showing the previous version as newest. | [pa-bs], [pr-11629] |

- **Can a build in progress show up as a version entry?**
  - At v1.7.45 Cube's own comment says a versioned table "becomes visible to `getTablesQuery` as soon as it is created, long before the rows are imported into it" ([pa-status-comment] L151–L156).
  - But Cube Store's `information_schema.tables` lists only ready tables ([cs-meta]). How far an import has got depends on the upload path: `CREATE TABLE … LOCATION` for streamed or CSV data, and `CREATE TABLE` then `INSERT` for in-memory rows ([csd] **(checkout)** L259–L298).
  - **UNVERIFIED** for wechart's Postgres → Cube Store path; probe P10 checks it.
- **Where building and failed come from.** The spec takes them from AC-150's history. A history record with versioned table `T` belongs to partition `p` iff:
  - `T` starts with `p.tableName + '_'`;
  - the remainder is exactly three `_`-free segments (content, structure, base-32 time);
  - the structure segment equals `p.structureVersion`.

  This is derived from the name rule in job-records.md "Table names" and [pa-t2v].
- **Builds under another context.** Both of wechart's refresh contexts (`{}` and `{wechartStore}`) write to `prod_pre_aggregations`. When the two models compile a rollup identically, they share tables and version entries, which is what Cube would serve for either (inference from [bq-name] **(checkout)** and cube.js L79–L84, which never changes the schema).

### Derivation of partitions

For each requested pre-aggregation and **each time zone** ([rs-pp] L429–L446):

1. **Refresh query.** A rollup, or any partitioned pre-aggregation, gets `{ …references, preAggregationId, timezone }`. An `original_sql` one gets the cube's first measure and dimension ([rs-base]).
2. **Picking the description.** The query is compiled with `getSql(…, { preAggregationsOnly: true })` and the description whose `preAggregationId` matches is taken. If none matches, the item gets `errors: ['Unused pre-aggregation']` and no partitions: "Only the most detailed pre-aggregations will be use[d]" ([rs-rq] L149–L164).
3. **Expansion.** `expandPartitionsInPreAggregations` runs `partitionPreAggregations()` for every description the query needs ([pa-expand]). The **last group** becomes the item's `partitions`. Earlier groups are dependencies, such as `original_sql` sources, and are not returned ([rs-pp] L448–L462).
4. **Build range** (`loadBuildRange`, [prl-br] L508–L538):
   - The start and end queries are `build_range_start`/`build_range_end` SQL, stored as `refreshRangeStart`/`refreshRangeEnd` ([ce-alias] **(checkout)** L764–L785). Otherwise they are `min`/`max` of the rollup's time dimension over the cube's SQL ([bq-range] **(checkout)** L5233–L5247).
   - Each result goes through `parseUtcIntoLocalDate(…, timezone)`: a value without zone information is taken as UTC, then shown in the partition's zone ([time] L386–L426).
   - An empty result means "now" ([prl-br] L540–L556).
   - Results are cached in the query cache for 24 h. They are re-read when the first or last partition's refresh-key values change (`loadRangeQuery` renewal key, [prl-range] L93–L118, [prl-br] L520–L537). So a new period's partition appears once Cube re-reads the range (inference).
5. **Context.** Everything runs under the request's security context: its compiled model, and the orchestrator from `contextToOrchestratorId` ([gw-part] L911–L918). wechart sets none, so that is `STANDALONE` ([srv-orch]). Build-range SQL runs on the source database through that orchestrator's driver.
6. **Periods.** `effectiveDateRange` intersects the build range with the query's date range. The system route has none, so it is the build range ([prl-eff]). `timeSeries(partitionGranularity, range, timestampPrecision)` then cuts the periods ([prl-ts], [time] L101–L118, L274–L281):
   - `day`: `YYYY-MM-DDT00:00:00.000` to `T23:59:59.999`
   - `week`: ISO Monday to Sunday 23:59:59.999
   - `month`: day 01 to the last day
   - `quarter`: quarter start to quarter end
   - `year`: `01-01` to `12-31`
   - `hour`: `HH:00:00.000` to `HH:59:59.999`
   - `minute`: handled in code, not documented

   The fraction has `timestampPrecision` digits: 3 by default, 6 on BigQuery ([bq-prec] **(checkout)**). More than `maxPartitions` periods throws ([prl-max]).
7. **Clipping** ([prl-desc] L206–L247):
   - Each partition's `buildRangeStart` is its period start, and **the first partition is not clipped**.
   - `buildRangeEnd` is the period end, except that **the last partition's end is clipped to the build range end** whenever its partition invalidation queries are absent or non-empty (L212–L216).
   - The unclipped end is not in the description. Compute it from `buildRangeStart` and `partitionGranularity` with the rules above.
8. **Name.** `tableName` is `<schema>.<name>` plus the period start: `substring(0, 10 | 13 | 16)` with `-T:` removed ([prl-name]). The base name has **no time zone** ([bq-name] **(checkout)** L4386–L4389). So one period has the same `tableName` in every zone, and Cube's own unit test lists `foo_first20201230` under both `UTC` and `America/Los_Angeles` ([t-rs] **(checkout)** L753–L779).
9. **Non-partitioned rollups.** `partitionPreAggregations` returns the single description ([prl-pp] L462–L464): one "partition" with no name suffix and no `buildRangeStart`/`buildRangeEnd` ([sc-pa]).
10. **`rollup_join` and `rollup_lambda`.** These are "ephemeral": no refresh queries run, the item has `partitions: []` and `errors: []` ([rs-pp] L426–L446). To show anything, list the rollups they reference.
11. **Time zones.**
    - The route uses the request's `timezones` (or `timezone`), else `scheduledRefreshTimeZones(context)` if non-empty, else `['UTC']` ([gw-part] L906–L910, [q-pa] L536–L541).
    - The refresh worker builds in `scheduledRefreshTimeZones`, else `UTC` ([srv-sched] L838–L841, [rs-run] L272).
    - wechart sets neither the option nor `CUBEJS_SCHEDULED_REFRESH_TIMEZONES` ([opts], [env], cube.js). So "the time zones wechart builds in" is `['UTC']`, which matches the jobs call (client.ts L134).
    - `GET …/timezones` returns `[]` for wechart ([gw-sys] L648–L652, [srv-tz]). It can't be used to learn the worker's zones.
12. **Ask for one zone per request (inference).** `structureVersionsByTableName` is keyed by `tableName` alone ([qo-ver] L380–L388), and the zones share table names (point 8). In a multi-zone request, the zone processed last overwrites the others' structure versions. The other zones' partitions then get that zone's `versionEntries` and `structureVersion`. Probe P8b checks this.

### Jobs-API rebuild of one partition

**Request** (documented endpoint, `jobs` scope, which wechart grants per cube.js L123–L126):

```json
{ "action": "post",
  "selector": { "contexts": [{ "securityContext": { "wechartStore": "<store>" } }],
                "timezones": ["UTC"],
                "preAggregations": ["monthly_orders.by_status_month"],
                "dateRange": ["2026-01-01T00:00:00.000", "2026-01-01T00:00:00.000"] } }
```

**How Cube matches it:**
- **Normalization.** Each `dateRange` string goes through `parseUtcIntoLocalDate([{ val }], 'UTC')` once, before the per-context loop ([gw-jobspost] L1120–L1131).
  - The parser strictly accepts ISO 8601, `YYYY-MM-DD HH:mm:ss[.SSS]` and `YYYY-MM-DDTHH:mm:ss[.SSS]`. A value **with** `Z` or `±hh:mm` is converted to UTC wall clock. A value **without** one is kept as written.
  - The output is always `YYYY-MM-DDTHH:mm:ss.SSS` ([time] L386–L426). An unparsable value gives 400 `Cannot parse selector date range …` ([gw-jobspost] L1127–L1129).
  - Joi only checks two strings ([q-jobs] L246). This feature came with PR #9342 ("only partitions which intersect with it will be rebuilt", [pr-9342], closing [issue-6722]).
- **Partitions.** `postBuildJobs` derives partitions with the same `preAggregationPartitions` as the system route, under the selector's context and zones ([gw-jobsbuild], [rs-post] L748).
- **Filter.** A partition is kept iff `intersectDateRanges([p.buildRangeStart, p.buildRangeEnd], dateRange)` is non-null ([rs-post] L749–L786). That means `max(starts) ≤ min(ends)` as **string** comparison, and both ranges must be 23 or 26 characters ([prl-int] L558–L594).
- **No range.** A partition with no range (a non-partitioned rollup) is always kept ([rs-post] L753–L755).

**Why `[S, S]` with `S = p.buildRangeStart` selects exactly `p` (derivation):**
- The periods from `timeSeries` are contiguous and disjoint. Each ends at `…59.999` and the next starts at `…00.000` (the `TIME_SERIES` rules above).
- `p` contains `S` because `p.buildRangeStart = S ≤ p.buildRangeEnd`. That holds even for the clipped last partition, whose clipped end is still at or after its start.
- An earlier partition ends before `S`, and a later one starts after it.
- This holds for every granularity in the table: year, quarter, month, ISO week, day, hour and minute.

**Conditions:**
1. **Use the partition's local wall-clock start, with no `Z` and no offset.** The partitions route's `buildRangeStart` is exactly that string (local to `p.timezone`, [prl-br], [prl-desc]).
   - Sending the UTC instant instead can land in the neighbouring partition in zones ahead of UTC. Tokyo's March starts at `2026-03-01T00:00:00.000` local. The instant `2026-03-01T00:00:00.000+09:00` normalizes to `2026-02-28T15:00:00.000`, which is inside Tokyo's **February**.
   - This is derived from [time] L412–L425 plus the string compare; probe P8 checks it.
2. **One zone per post.** One normalized `dateRange` applies to every zone in `selector.timezones` (normalized once, [gw-jobspost] L1124–L1131), and a post returns tokens per context × zone × partition (job-records.md).
3. **One context per post.** The context should be the same claims used for the listing, so that both compile the same model (cube.js L79–L104).
4. **Precision 3 only.** With `timestampPrecision` 6 (BigQuery, [bq-prec] **(checkout)**), partition strings are 26 characters. A 23-character `S` then sorts **before** a period start ending in `.000000`, so `[S, S]` matches **nothing**. `[S, S + 1 ms]` matches exactly one partition at either precision. This is an inference from string ordering in [prl-int]; wechart's sample is Postgres (`BaseQuery.timestampPrecision()` returns 3, [bq-prec] **(checkout)**).
5. **Dependencies.** A rollup with `use_original_sql_pre_aggregations` also posts its dependency entries, filtered by the same range ([rs-post] L774–L783). Their tokens name the dependency's tables, not the rollup's partition. The seed has none.

**What comes back:**
- A `string[]` of tokens ([gw-jobsbuild], [rs-post] L828–L839).
- For each token, `get` returns `table = <p.tableName>_<content>_<structure>_<base-32 seconds>` (job-records.md "Table names"). `table.startsWith(p.tableName + '_')` is the check for AC-145's "names a partition the user did not select".
- If no partition intersects, the post fails with 400 `A user's selector doesn't match any of the pre-aggregations defined in the data model.` ([gw-jobs] L1085–L1090). That can happen if the build range moved since the listing (inference).
- A force build that duplicates a build already queued is skipped and reports `missing_partition` (job-records.md, "Queue de-duplication").

## Gotchas

### Stability across versions

| Piece | v1.7.42 | v1.7.43 | v1.7.45 | master (2026-09-24) | Source |
| --- | --- | --- | --- | --- | --- |
| System route block, middleware, handler text | same | same (L619, L899) | same text, +1 line (L620, L900). #11939 (1.7.44) touched only `/v1/graphql-to-json` | same as v1.7.45 (no later commits) | scratchpad copies of all four; [hist-gw]; [changelog] |
| Auth (`createCheckAuthFn`, `createCheckAuthSystemFn`, dev-token) | same | same | same | same | same copies (L2765/2790 vs L2766/2791) |
| `normalizeQueryPreAggregations`, Joi | same | same | same | same | last change 2026-08-19 (#11575) ([hist-q]) |
| `RefreshScheduler` | same | same | same | same | last change 2026-09-14, a lint pass ([hist-rs]); same line numbers in all three copies |
| `QueryOrchestrator.getPreAggregationVersionEntries` | same | same | same | same | last change 2026-09-11 ([hist-qo]) |
| `PreAggregationLoadCache` | same | same | same | same | last change 2026-08-28 ([hist-plc]) |
| `PreAggregationPartitionRangeLoader` | description cache per build range | same as v1.7.42 | #11896 (1.7.44) bounds the cache to one "partition plan" per pre-aggregation identity; derivation unchanged | same | v1.7.42 L443–L485 vs v1.7.45 L443–L506; [hist-prl]; [pr-11896] |
| `PreAggregations.ts` version-entry code | same | #11629 adds build-status records only | same as v1.7.43 | same | v1.7.42 L74–L87, L218, L833 vs v1.7.45 L74–L87, L240, L905 |
| `time.ts` (`timeSeries`, `parseUtcIntoLocalDate`) | same | same | same | same | last change 2026-09-16 (#11876), present in v1.7.42 ([hist-time]) |

- **Cube's own tests.**
  - `smoke-postgres` (partitions and preview, [t-smoke-pg]) is unchanged at the tag since 2026-09-10.
  - `smoke-lambda` (list and partitions) and `smoke-vertica` (partitions) are cited from the checkout ([t-smoke-lambda], [t-smoke-vertica]).
  - All three run through birdbox with `CUBEJS_DEV_MODE: 'true'` and send **no** `Authorization` header ([t-birdbox] **(checkout)** L567–L572). They check shape, not production auth.
  - The gateway unit tests cover auth against mocks: 403 without a token, 403 with an API-secret token, 404 without the secret, and 200 with a system token ([t-gw] **(checkout)**).
  - Whether CI runs the smoke suites on every release is UNVERIFIED.
- **Risk of an upcoming change.** Reviewing PR #11571, which added the `dev-token` gate, a reviewer wrote that `/cubejs-system/v1/*` "is still authorized by the signature alone" and that "it's the larger of the two holes and deserves a tracked follow-up rather than a paragraph" ([pr-11571]). A later release could require a claim on system routes too. A search of the tracker found no follow-up issue ([issue-search]). wechart's contract test should assert a 200 with wechart's exact token shape.

### Security

**What `CUBEJS_PLAYGROUND_AUTH_SECRET` unlocks, beyond `partitions`** (routes at [gw-sys]):
- **`build`:** force-builds any pre-aggregation or partition under any security context the token names ([gw-build], [rs-build]). `preAggregations: []` means **all** pre-aggregations ([ce]). It returns `{ result: true }` before the builds finish (`throwErrors` is not passed, [rs-build] L733–L737; inference).
- **`queue` / `cancel`:** list and cancel pre-aggregation queue items ([gw-queue], [pa-getver] L948–L956). The queue is shared by every Cube process with the same orchestrator id; see Corrections.
- **`preview`:** reads rows of a built partition through its `previewSql`, straight from the orchestrator. It never goes through `getNormalizedQueries`/`queryRewrite` ([gw-preview], [qo-prev]), so query-time row filters don't apply (inference).
- **`security-contexts`, `timezones`, `context`:** reveal `scheduledRefreshContexts` output (wechart's store URLs), zones, and `dockerVersion`/`serverCoreVersion` ([gw-sys] L628–L652, [gw-ctxroute]).
- **The whole main API.** With the secret set, `/cubejs-api/*` tries the normal auth, then accepts a playground-signed token with **any** payload as its security context ([gw-checkauth] L2766–L2784).
  - Scopes still apply, because `assertApiScope` has no playground branch ([gw-scope]). wechart grants `jobs` to every non-draft context (cube.js L123–L126).
  - So the secret is at least as powerful as `CUBEJS_API_SECRET`.
- **With `scope: ['dev-token']`**, `signedWithPlaygroundAuthSecret` is true ([gw-devtoken], [gw-defauth] L2743–L2744). That adds:
  - hidden members in `/v1/meta` ([gw-meta-vis] L724);
  - `includeDebugInfo` on `/v1/sql` and `/v1/dry-run` ([gw-debug] L1580, L1831);
  - the full `usedPreAggregations`, plus `refreshKeyValues`, `transformedQuery` and `requestId` on `/v1/load` ([gw-load-dev] L2026–L2036);
  - `requestId` in errors ([gw-err] L2528).

  PR #11571 explains the gate: "the signature alone was never evidence that the bearer is a developer" ([pr-11571]).
- **Not unlocked:**
  - The Playground/DevServer, which starts only in dev mode (`devServer: this.isDevMode()`, i.e. `NODE_ENV !== 'production' || CUBEJS_DEV_MODE`, [opts], [srv-dev] L282–L291, L451–L463).
  - WebSockets forward the flag ([subs] **(checkout)** L196), but wechart doesn't enable them. That the WebSocket path also accepts the fallback is an inference.
- **In non-production mode**, system routes accept requests with no token at all ([gw-defauth] L2746–L2753). Cube's smoke tests rely on this ([t-birdbox]).

**Mitigations available to wechart:**
- **Keep the secret out of the refresh worker.** In /Users/srajagopal/Work/wechart/docker-compose.yml, `cube-refresh-worker` merges `*cube-environment`, which **is** the `cube` service's own `environment` map (L74, L121). A key added there reaches the worker too, and the worker serves the whole REST API on `127.0.0.1:54001` (L128–L129).
  - Put the secret in a map merged only into `cube`, or blank it on the worker.
  - A blank value disables the routes, because `if (this.playgroundAuthSecret)` is false for `''` ([gw-sys]). That env-var returns `''` rather than `undefined` for a blank value is UNVERIFIED; either way the check is falsy.
- **Keep `NODE_ENV=production`** on any container that has the secret (compose L89–L92).
- **wechart's API only:**
  - calls `partitions` and nothing else (an allow-list in code, pinned by the contract test);
  - mints the token per request with a short `exp`;
  - never includes `dev-token` or `wechartDraft`;
  - never forwards the `partitions.details` SQL (`loadSql`, `previewSql`, `invalidateKeyQueries`) to the browser;
  - validates the response against the fields it uses.
- **Network.** The routes share Cube's port with `/cubejs-api` (one Express app, [gw-sys]), so they can't be firewalled apart without a proxy.
  - Locally, compose publishes `54000:4000` on every interface (L104–L105). Binding it to `127.0.0.1` limits it to this machine. wechart's API runs on the host (L100–L103).
  - In deployment, Cube should be reachable only from wechart's API (AC-008).
- **Secret hygiene.** Use a value distinct from `CUBEJS_API_SECRET` and treat it as equally sensitive. Cube logs the presented token on auth failure ([gw-wrap] L2889–L2894).

### Other gotchas

- **Continue wait is HTTP 200** with an `error` body (see Request and response shape). Retry rather than failing.
- **`preAggregations: []` lists every pre-aggregation**, and an unknown id silently gives `preAggregationPartitions: []` ([ce]).
- **`scheduled_refresh: false` rollups are listed** (no `scheduled` filter, [rs-pp] L406–L408), but the worker never builds them ([ce] `scheduledPreAggregations`).
- **Tables built in another zone** share the partition's `tableName` (Derivation, point 8). Cube drops untouched tables after `CUBEJS_TOUCH_PRE_AGG_TIMEOUT` (job-records.md, gotcha 5).
- **Hour partitions across a DST change.** The periods are wall-clock strings (`moment.range` over local strings, [time] L274–L281). How a skipped or repeated local hour maps to UTC was not traced (UNVERIFIED).

### Corrections to sibling docs

- **refresh-jobs-caching.md §C, `partitions` row:**
  - add `timezone` (singular), `metadata`, and the per-id `cacheOnly`/`metaOnly`;
  - `refreshRange` is accepted but unused;
  - `dateRange` is rejected;
  - `preAggregations: []` means all;
  - omitting `expand` returns all three groups.

  Sources: [q-pa], [rs-pp], [gw-part].
- **refresh-jobs-caching.md §C, auth column:** enforced only when `NODE_ENV=production`; `checkAuth`, `jwt` and `CUBEJS_API_SECRET(S)` don't apply ([gw-ctor], [gw-sysauth]).
- **refresh-jobs-caching.md §C, `build` row:** answers `{ result: true }` before the builds run (inference, [rs-build]).
- **refresh-jobs-caching.md §C, `timezones` row:** returns `[]` when neither option nor env is set, not the `UTC` the worker uses ([srv-tz], [srv-sched]).
- **refresh-jobs-caching.md §D and gotcha 14:** debug fields go only to playground-signed tokens **carrying `scope: ['dev-token']`**, not to any playground-signed token ([gw-devtoken], [gw-load-dev]).
- **refresh-jobs-caching.md gotcha 12:** add that the secret also authenticates the main API with any security context ([gw-checkauth]).
- **refresh-jobs-caching.md, Open questions, first bullet:** superseded by the user's decision of 2026-09-24 (spec F16 note).
- **pre-aggregations.md §5, `partitions` row:** `dateRange?` is not accepted ([q-pa]).
- **pre-aggregations.md §5, partition fields:** confirmed from source. `partitions.details` spreads the whole description and adds `structureVersionLoadSql`, `buildRangeStart`/`buildRangeEnd`, `sealAt` and `expandedPartition` ([gw-part] L940, [prl-desc], [pa-expand]).
- **pre-aggregations.md §3.3 and gotchas:** the secret grants main-API access too, not only build and cancel.
- **job-records.md, UNVERIFIED "Whether the refresh worker and the API share one pre-aggregation queue":** traced.
  - The queue is `SQL_PRE_AGGREGATIONS_${redisPrefix}_${dataSource}` ([pa-queue] L796).
  - `redisPrefix` is the orchestrator id ([srv-redis] L749), which defaults to `'STANDALONE'` ([srv-orch]). wechart sets no `contextToOrchestratorId`.
  - So both processes use `SQL_PRE_AGGREGATIONS_STANDALONE_default` in Cube Store (inference).
- **job-records.md, "Partition suffix time zone" inference:** now backed by the code path ([prl-br], [prl-name]) and Cube's unit test ([t-rs] **(checkout)**). Probe P7 observes it.
- **The brief:**
  - The route block starts at L620 in v1.7.45 (~L619 is v1.7.42/43).
  - The partitions request has no `contexts`.
  - `intersectDateRanges` is at L576–L594 in v1.7.45 (L555–L571 is v1.7.42/43).
  - The "Private API (no scopes)" banner is L616–L618.
- **docs/tasks.md T151 ("the system secret, given to Cube and wechart's API only"):** the compose anchor passes it to the worker unless it is kept out of `*cube-environment` (Security).

## Alternatives considered

Not requested. The user chose the system route on 2026-09-24 (spec F16 status note).

## Open questions / unverified

### Probes to run locally

Nothing below touches the repo. Files go to `$TMPDIR`, and the compose override is passed with `-f`.

Before starting:
- Recreating `cube` briefly interrupts anything running against it, e.g. e2e tests.
- If the running containers are still v1.7.42, `up` recreates them from the working tree's `docker-compose.yml` (v1.7.45). Recreate the worker in the same step so both match; the override doesn't give the worker the secret.

**Setup A: the compose Cube with the secret (claims 1–4, 6).**

```sh
cd /Users/srajagopal/Work/wechart
export SYS_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
export OVR="$TMPDIR/wechart-cube-system.yml"
printf 'services:\n  cube:\n    environment:\n      CUBEJS_PLAYGROUND_AUTH_SECRET: "%s"\n' "$SYS_SECRET" > "$OVR"
docker compose -f docker-compose.yml -f "$OVR" config | grep -c CUBEJS_PLAYGROUND_AUTH_SECRET   # expect 1: cube only
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:54000/cubejs-system/v1/pre-aggregations/partitions  # before: 404
docker compose -f docker-compose.yml -f "$OVR" up -d cube cube-refresh-worker

jwt() { SECRET="$1" CTX="$2" node -e '
  const { createHmac } = require("node:crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const u = b({ alg: "HS256", typ: "JWT" }) + "." + b({ ...JSON.parse(process.env.CTX), iat: now, exp: now + 300 });
  process.stdout.write(u + "." + createHmac("sha256", process.env.SECRET).update(u).digest("base64url"));'; }
export CUBE=http://localhost:54000
export CTX='{"wechartStore":"http://host.docker.internal:4100"}'   # needs wechart's API on :4100; '{}' reads the mounted model
sys()  { curl -sS -X POST "$CUBE/cubejs-system/v1/pre-aggregations/$1" -H "Authorization: Bearer $(jwt "$SYS_SECRET" "$CTX")" -H 'Content-Type: application/json' -d "$2"; }
jobs() { curl -sS -X POST "$CUBE/cubejs-api/v1/pre-aggregations/jobs" -H "Authorization: Bearer $(jwt dev-secret "$CTX")" -H 'Content-Type: application/json' -d "$1"; }
Q='{"query":{"timezones":["UTC"],"preAggregations":[{"id":"monthly_orders.by_status_month"}]}}'
```

**P1: mounting and auth (claims 1–2).**
- Expected, in order:
  1. 403 `Authorization header isn't set`;
  2. 403 `Invalid token` (API-secret token);
  3. 200 with `serverCoreVersion` (the version actually running);
  4. 200 with no `Bearer ` prefix.

```sh
curl -sS -X POST "$CUBE/cubejs-system/v1/pre-aggregations/partitions" -H 'Content-Type: application/json' -d "$Q" -w ' %{http_code}\n'
curl -sS -X POST "$CUBE/cubejs-system/v1/pre-aggregations/partitions" -H "Authorization: Bearer $(jwt dev-secret "$CTX")" -H 'Content-Type: application/json' -d "$Q" -w ' %{http_code}\n'
curl -sS "$CUBE/cubejs-system/v1/context" -H "Authorization: Bearer $(jwt "$SYS_SECRET" '{}')"; echo
curl -sS "$CUBE/cubejs-system/v1/context" -H "Authorization: $(jwt "$SYS_SECRET" '{}')" -w ' %{http_code}\n'
```

**P2: the seed rollup's partitions (claims 1, 3, 4).**
- Expect one partition:
  - `tableName` = `prod_pre_aggregations.monthly_orders_by_status_month20260101`;
  - `timezone` = `UTC`;
  - `buildRangeStart` = `2026-01-01T00:00:00.000`;
  - `buildRangeEnd` = `2026-08-29T00:00:00.000`, the last order, day 240 (/Users/srajagopal/Work/wechart/infra/sample-db/init.sql L46–L47);
  - `newest.structure_version == structureVersion`.
- Record every key, to write the contract test from.

```sh
sys partitions "$Q" | jq '.preAggregationPartitions[0] | {keys: keys, errors, timezones, parts: [.partitions[] | {tableName, timezone, partitionGranularity, buildRangeStart, buildRangeEnd, structureVersion, n: (.versionEntries|length), newest: .versionEntries[0], at: ((.versionEntries[0].last_updated_at // 0)/1000|todate)}]}'
sys partitions "$Q" | jq '.preAggregationPartitions[0].partitions[0] | keys'
sys partitions '{"query":{"timezones":["UTC"],"preAggregations":[{"id":"monthly_orders.by_status_month"}],"expand":["partitions.meta","partitions.versions"]}}' | jq '.preAggregationPartitions[0].partitions[0] | keys'
```

**P3: zones (claim 3).**
- The default gives `["UTC"]`.
- Los Angeles has the same `tableName` and a different `structureVersion`. Its `buildRangeEnd` is `2026-08-28T17:00:00.000`.

```sh
sys partitions '{"query":{"preAggregations":[{"id":"monthly_orders.by_status_month"}]}}' | jq -c '.preAggregationPartitions[0].timezones'
sys partitions '{"query":{"timezones":["America/Los_Angeles"],"preAggregations":[{"id":"monthly_orders.by_status_month"}]}}' | jq -c '[.preAggregationPartitions[0].partitions[] | {timezone, tableName, buildRangeEnd, structureVersion, n: (.versionEntries|length)}]'
```

**P4: request edge cases (claim 1).**
- Expected, in order:
  1. `[]`;
  2. every rollup's id;
  3. 400 `"dateRange" is not allowed`;
  4. 400 `Query param is required`.

```sh
sys partitions '{"query":{"preAggregations":[{"id":"no_such.rollup"}]}}'; echo
sys partitions '{"query":{"preAggregations":[]}}' | jq -c '[.preAggregationPartitions[].preAggregation.id]'
sys partitions '{"query":{"preAggregations":[{"id":"monthly_orders.by_status_month"}],"dateRange":["2026-01-01","2026-02-01"]}}'; echo
sys partitions '{}'; echo
```

**P5: main-API fallback and dev-token (claim 2).**
- Expect both to answer 200.
- Only the second should list `id`, the hidden primary key (pre-aggregations.md: `/v1/meta` leaves hidden members out).

```sh
curl -sS "$CUBE/cubejs-api/v1/meta" -H "Authorization: Bearer $(jwt "$SYS_SECRET" "$CTX")" | jq -c '[.cubes[] | select(.name=="monthly_orders") | .dimensions[].name]'
curl -sS "$CUBE/cubejs-api/v1/meta" -H "Authorization: Bearer $(jwt "$SYS_SECRET" "$(echo "$CTX" | jq -c '. + {scope:["dev-token"]}')")" | jq -c '[.cubes[] | select(.name=="monthly_orders") | .dimensions[].name]'
```

**P6: rebuild the seed's one partition (claim 6).**
- Expect:
  - one token, whose `table` starts with `prod_pre_aggregations.monthly_orders_by_status_month20260101_`;
  - afterwards, `versionEntries[0].last_updated_at / 1000` equals the table's last segment read as base-32;
  - the 2025 range gives 400 "doesn't match".

```sh
START=$(sys partitions "$Q" | jq -r '.preAggregationPartitions[0].partitions[0].buildRangeStart')
T=$(jobs '{"action":"post","selector":{"contexts":[{"securityContext":'"$CTX"'}],"timezones":["UTC"],"preAggregations":["monthly_orders.by_status_month"],"dateRange":["'"$START"'","'"$START"'"]}}'); echo "$T"
sleep 5; TABLE=$(jobs '{"action":"get","tokens":'"$T"'}' | jq -r '.[0].table'); echo "$TABLE"
node -e 'console.log(parseInt(process.argv[1].split("_").pop(), 32))' "$TABLE"
sys partitions "$Q" | jq '.preAggregationPartitions[0].partitions[0].versionEntries[0] | {table_name, structure_version, s: (.last_updated_at/1000)}'
jobs '{"action":"post","selector":{"contexts":[{"securityContext":'"$CTX"'}],"timezones":["UTC"],"preAggregations":["monthly_orders.by_status_month"],"dateRange":["2025-01-01T00:00:00.000","2025-01-01T00:00:00.000"]}}'; echo
```

**Setup B: a throwaway Cube with a month-partitioned probe cube (claims 5–6).**
- It shares only the sample database and Cube Store.
- Its own queue and cache are in memory, and its tables go to a separate schema.
- It runs no refresh worker, so nothing is built until you post a job.

```sh
export P="$TMPDIR/wechart-probe"; mkdir -p "$P/model/cubes"
cat > "$P/model/cubes/probe_orders.yml" <<'YML'
cubes:
  - name: probe_orders
    sql_table: public.orders
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: status, sql: status, type: string }
      - { name: ordered_at, sql: ordered_at, type: time }
    measures:
      - { name: count, type: count }
    pre_aggregations:
      - name: by_month
        measures: [count]
        dimensions: [status]
        time_dimension: ordered_at
        granularity: day
        partition_granularity: month
        refresh_key: { every: 1 hour }
YML
NET=$(docker inspect wechart-cube -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run -d --name wechart-cube-probe --network "$NET" -p 127.0.0.1:54009:4000 \
  -e NODE_ENV=production -e CUBEJS_DEV_MODE=false -e CUBEJS_REFRESH_WORKER=false \
  -e CUBEJS_DB_TYPE=postgres -e CUBEJS_DB_HOST=sample-db -e CUBEJS_DB_PORT=5432 \
  -e CUBEJS_DB_NAME=sample -e CUBEJS_DB_USER=sample -e CUBEJS_DB_PASS=sample \
  -e CUBEJS_API_SECRET=probe-api-secret -e CUBEJS_PLAYGROUND_AUTH_SECRET="$SYS_SECRET" \
  -e CUBEJS_DEFAULT_API_SCOPES=meta,data,graphql,sql,jobs \
  -e CUBEJS_CUBESTORE_HOST=cubestore -e CUBEJS_CUBESTORE_PORT=3030 \
  -e CUBEJS_CACHE_AND_QUEUE_DRIVER=memory -e CUBEJS_PRE_AGGREGATIONS_SCHEMA=probe_pre_aggregations \
  -v "$P/model:/cube/conf/model:ro" cubejs/cube:v1.7.45
PC=http://localhost:54009
psys()  { curl -sS -X POST "$PC/cubejs-system/v1/pre-aggregations/$1" -H "Authorization: Bearer $(jwt "$SYS_SECRET" '{}')" -H 'Content-Type: application/json' -d "$2"; }
pjobs() { curl -sS -X POST "$PC/cubejs-api/v1/pre-aggregations/jobs" -H "Authorization: Bearer $(jwt probe-api-secret '{}')" -H 'Content-Type: application/json' -d "$1"; }
pq() { echo '{"query":{"timezones":["'"$1"'"],"preAggregations":[{"id":"probe_orders.by_month"}]}}'; }
```

**P7: month partitions in three zones (claim 5).**
- Each zone should list 8 partitions, suffixes `20260101` to `20260801`, each starting at `YYYY-MM-01T00:00:00.000`, all with `n=0`.
- Only the last is clipped:
  - UTC ends `2026-08-29T00:00:00.000`;
  - Tokyo ends `2026-08-29T09:00:00.000`;
  - Los Angeles ends `2026-08-28T17:00:00.000`.

```sh
for tz in UTC Asia/Tokyo America/Los_Angeles; do echo "$tz"
  psys partitions "$(pq $tz)" | jq -c '.preAggregationPartitions[0].partitions[] | {t: .tableName[-8:], s: .buildRangeStart, e: .buildRangeEnd, sv: .structureVersion, n: (.versionEntries|length)}'
done
```

**P8: rebuild Tokyo's March only, and the offset pitfall (claim 6).**
- The first post should give one token, whose table ends `…by_month20260301_<c>_<s>_<t>`.
- Afterwards, only `20260301` should have `n=1` in Tokyo.
- The `+09:00` post should build `…20260201_…` (February), as predicted.

```sh
T=$(pjobs '{"action":"post","selector":{"contexts":[{"securityContext":{}}],"timezones":["Asia/Tokyo"],"preAggregations":["probe_orders.by_month"],"dateRange":["2026-03-01T00:00:00.000","2026-03-01T00:00:00.000"]}}'); echo "$T"
sleep 5; pjobs '{"action":"get","tokens":'"$T"'}' | jq -c '.[] | {status, table}'
psys partitions "$(pq Asia/Tokyo)" | jq -c '.preAggregationPartitions[0].partitions[] | {t: .tableName[-8:], n: (.versionEntries|length)}'
T2=$(pjobs '{"action":"post","selector":{"contexts":[{"securityContext":{}}],"timezones":["Asia/Tokyo"],"preAggregations":["probe_orders.by_month"],"dateRange":["2026-03-01T00:00:00.000+09:00","2026-03-01T00:00:00.000+09:00"]}}')
sleep 5; pjobs '{"action":"get","tokens":'"$T2"'}' | jq -c '.[] | .table'
```

**P8b: one zone per request (the multi-zone collision inference).** Compare Tokyo's March `versionEntries` and `structureVersion` in the combined answer with the Tokyo-only answer from P8.

```sh
psys partitions '{"query":{"timezones":["UTC","Asia/Tokyo"],"preAggregations":[{"id":"probe_orders.by_month"}]}}' | jq -c '.preAggregationPartitions[0].partitions[] | select(.tableName|endswith("20260301")) | {timezone, sv: .structureVersion, n: (.versionEntries|length)}'
```

**P9: every partition start selects exactly its own partition (claim 6).** Each line should read `tokens=1 ok=true`.

```sh
psys partitions "$(pq UTC)" | jq -r '.preAggregationPartitions[0].partitions[] | "\(.tableName) \(.buildRangeStart)"' |
while read -r TABLE START; do
  T=$(pjobs '{"action":"post","selector":{"contexts":[{"securityContext":{}}],"timezones":["UTC"],"preAggregations":["probe_orders.by_month"],"dateRange":["'"$START"'","'"$START"'"]}}')
  sleep 3; pjobs '{"action":"get","tokens":'"$T"'}' | jq -r --arg t "$TABLE" '"\($t) tokens=\(length) ok=\(all(.[]; .table | startswith($t + "_")))"'
done
```

**P10: is a build in progress visible? (claim 4, UNVERIFIED).** Record whether `n` rises before `status` reads `done`.

```sh
T=$(pjobs '{"action":"post","selector":{"contexts":[{"securityContext":{}}],"timezones":["Asia/Tokyo"],"preAggregations":["probe_orders.by_month"],"dateRange":["2026-03-01T00:00:00.000","2026-03-01T00:00:00.000"]}}')
for i in $(seq 1 25); do
  n=$(psys partitions "$(pq Asia/Tokyo)" | jq '[.preAggregationPartitions[0].partitions[] | select(.tableName|endswith("20260301")) | .versionEntries[]] | length')
  s=$(pjobs '{"action":"get","tokens":'"$T"'}' | jq -r '.[0].status'); echo "$n $s"; sleep 0.2
done
```

**Cleanup.** Tables under `probe_pre_aggregations` stay in the local Cube Store volume. How to drop a schema in Cube Store is UNVERIFIED. The compose worker only manages `prod_pre_aggregations` (inference).

```sh
docker rm -f wechart-cube-probe; rm -rf "$P"
docker compose up -d cube          # the committed compose file again: no secret, system routes 404
rm -f "$OVR"; unset SYS_SECRET
git status --short                 # unchanged by the probes
```

### UNVERIFIED items

- **No observation yet.** Every response shape here is read from source, not observed on a running Cube (P2–P4).
- **Builds in progress.** Whether one appears in `versionEntries` on wechart's Postgres → Cube Store path. Cube's comment and Cube Store's ready-only listing point opposite ways (P10).
- **Multi-zone collision.** That a request with several zones mixes structure versions is an inference from `structureVersionsByTableName` (P8b).
- **Precision 6.** That `[S, S]` matches nothing at `timestampPrecision` 6 is an inference from string ordering. It does not affect Postgres.
- **DST.** Hour partitions across a DST change were not traced.
- **Other errors.** Continue wait and `maxPartitions` answers on this route are inferred from `OrchestratorApi` and `handleError`. A missing `preAggregations` giving 500, and `dateRange` giving 400, are inferred from the code and Joi's defaults (P4).
- **Blank secret.** That an empty `CUBEJS_PLAYGROUND_AUTH_SECRET` reads as `''` and disables the routes.
- **Other transports.** That WebSocket auth also accepts playground-signed tokens.
- **Preview.** That `preview` bypasses query-time row filters.
- **`build_range_end` format.** The format of `versionEntries[].build_range_end` from Cube Store.
- **The `/context` route.** The value of `dockerVersion` it returns (P1).
- **Cube's CI.** Whether it runs the `/partitions` smoke tests on every release.
- **Changes in 1.7.44 and 1.7.45.** Whether #11812 ("retry pre-aggregation matching within one external type") or #11995 (schema-compiler speed-ups) changes which description `getSql(…, { preAggregationsOnly: true })` returns for a rollup ([changelog]). Not traced.
- **Line numbers.** These come from checkout `8368f2a` and were not re-read at the tag: `BaseQuery.js`, `BigqueryQuery.ts`, the `CubeEvaluator.ts` alias block, `CubeStoreDriver.ts`, `subscription-server.ts`, `birdbox.ts`, `smoke-lambda`/`smoke-vertica`, the gateway and RefreshScheduler unit tests. `CubeEvaluator.preAggregations`, `OptsHandler`, `env.ts`, `OrchestratorApi` and schema-compiler `PreAggregations.ts` were read at the tag but are cited by method name, without lines.

[gw-sys]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L616-L692
[gw-part-route]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L654-L660
[gw-part]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L900-L962
[gw-preview]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L964-L997
[gw-build]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L999-L1018
[gw-jobs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1060-L1109
[gw-jobspost]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1114-L1152
[gw-jobsbuild]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1157-L1190
[gw-queue]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1357-L1390
[gw-devtoken]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L137-L206
[gw-ctor]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L275-L303
[gw-jsonparser]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L390
[gw-meta-vis]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L721-L736
[gw-debug]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1557-L1856
[gw-load-dev]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2019-L2044
[gw-parse]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2457-L2468
[gw-ctxbyreq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2481-L2494
[gw-err]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2525-L2588
[gw-defauth]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2638-L2759
[gw-checkauth]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2761-L2788
[gw-sysauth]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2790-L2806
[gw-scope]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2843-L2860
[gw-hdr]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2862-L2875
[gw-wrap]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2877-L2935
[gw-ctxroute]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L3024-L3034
[q-tz]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L62-L69
[q-jobs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L232-L260
[q-pa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L516-L542
[rs-rq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L143-L191
[rs-base]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L193-L227
[rs-run]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L258-L279
[rs-pp]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L396-L501
[rs-build]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L695-L738
[rs-post]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L743-L840
[srv-tz]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L213
[srv-orch]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L234
[srv-dev]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L282-L463
[srv-gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L475-L507
[srv-redis]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L587-L759
[srv-sched]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L810-L848
[opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[oa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[qo-ver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts#L363-L404
[qo-prev]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts#L406-L438
[pa-ver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L20-L96
[pa-status-comment]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L142-L163
[pa-desc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L207-L238
[pa-t2v]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L240-L268
[pa-bs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L382-L401
[pa-expand]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L736-L789
[pa-queue]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L791-L835
[pa-getver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L905-L956
[prl-range]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L93-L118
[prl-desc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L206-L247
[prl-pp]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L443-L465
[prl-eff]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L467-L485
[prl-max]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L487-L506
[prl-br]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L508-L556
[prl-int]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L558-L594
[prl-ts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L596-L603
[prl-name]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L605-L625
[plc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts#L82-L191
[time]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/time.ts#L101-L426
[env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[ce]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[sc-pa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
[bq-name]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4386-L4389
[bq-prec]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/BigqueryQuery.ts#L162-L164
[bq-range]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5233-L5247
[ce-alias]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L764-L785
[csd]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-cubestore-driver/src/CubeStoreDriver.ts#L204-L298
[cs-meta]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/metastore/mod.rs
[cs-ist]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/queryplanner/info_schema/info_schema_tables.rs#L16-L24
[subs]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/src/ws/subscription-server.ts#L192-L199
[t-smoke-pg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-testing/test/smoke-postgres.test.ts#L116-L178
[t-smoke-lambda]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-testing/test/smoke-lambda.test.ts#L346-L382
[t-smoke-vertica]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-testing/test/smoke-vertica.test.ts#L73
[t-gw]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/test/index.test.ts#L971-L1098
[t-rs]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-server-core/test/unit/RefreshScheduler.test.ts#L691-L779
[t-birdbox]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-testing/src/birdbox.ts#L567-L572
[hist-gw]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-api-gateway/src/gateway.ts&sha=v1.7.45&per_page=5
[hist-rs]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-server-core/src/core/RefreshScheduler.ts&sha=master&per_page=10
[hist-qo]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts&sha=master&per_page=6
[hist-prl]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts&sha=master&per_page=6
[hist-q]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-api-gateway/src/query.js&sha=master&per_page=6
[hist-plc]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts&sha=master&per_page=5
[hist-time]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-backend-shared/src/time.ts&sha=master&per_page=5
[changelog]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
[pr-11571]: https://github.com/cube-js/cube/pull/11571
[pr-11629]: https://github.com/cube-js/cube/pull/11629
[pr-11896]: https://github.com/cube-js/cube/pull/11896
[pr-9342]: https://github.com/cube-js/cube/pull/9342
[issue-6722]: https://github.com/cube-js/cube/issues/6722
[issue-search]: https://api.github.com/search/issues?q=repo:cube-js/cube+%22cubejs-system%22&sort=updated&order=desc&per_page=15
[doc-rest-ref]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[doc-env]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx

Local files used:
- /Users/srajagopal/Work/wechart/infra/cube/cube.js
- /Users/srajagopal/Work/wechart/docker-compose.yml
- /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
- /Users/srajagopal/Work/wechart/infra/cube/model/cubes/monthly_orders.yml
- /Users/srajagopal/Work/wechart/infra/sample-db/init.sql

Tag copies used for line numbers are in /private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/src/ (v1.7.42, v1.7.43, v1.7.45). The checkout is /Users/srajagopal/Work/bi/cube (8368f2a).
