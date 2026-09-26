---
library: Cube per-folder models
packages: []
version: 1.7.45 (fork f6355de982)
researched: 2026-09-25
sources: [
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/cube.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/context-variables.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/cross-data-source-queries.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx,
  https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-server-core/src/core/server.ts,
  https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts,
  /Users/srajagopal/Work/bi/cube (local checkout, see "Provenance"),
  https://node-postgres.com/apis/client,
  https://nodejs.org/docs/latest-v24.x/api/cli.html
]
---

# Cube per-folder models 1.7.45 (fork f6355de982)

> **Superseded, 2026-09-25**, by the user's architecture decisions 1, 2, 3, 5 and 12 ([docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md); requirements §P2.4 "Architecture", round R27).
> - What this doc designs is replaced. Cube now serves one flat model under folder-prefixed names, owned by xcube, and xcube binds names at publish from each item's own folder. That replaces:
>   - layout B, a compile per folder chain;
>   - the `wechartModel` claim;
>   - nearest-name serving by wechart;
>   - binding from the viewer's folder;
>   - connections served by wechart.
> - Kept as the record, and still useful: its facts about Cube's own source (findings 4–5, §3's driver lifecycle, Gotchas 7–10 and 14).
> - Replaced by [xcube-runtime.md](./xcube-runtime.md), [prefixed-names.md](./prefixed-names.md), [generated-policies.md](./generated-policies.md) and [whole-model-publish.md](./whole-model-publish.md).
>
> **Confirmed superseded, 2026-09-26**, by the final integration plan ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md), decisions 3 and 4; the plan's "What changes in wechart's docs").
> - Layout B, one app id per folder chain composed by wechart and `cube.js`, becomes modules. xcube computes them from the reference graph and compiles each on its own, and wechart publishes changesets and folders.

## Summary

**What this covers.** How wechart's phase-2 folder tree maps onto Cube's multitenancy hooks. Each folder path gets its own compiled model, resolved nearest name first. Pre-aggregations are kept apart and built for each path. Connections come from wechart's per-folder data sources rather than from Cube's environment.

**Criteria it serves** (`docs/spec.md` F28, F18; `docs/requirements.md` §P2.5 "Per-folder models in Cube", §P2.6 D, E, G):

- AC-272, AC-274, AC-275: name resolution, isolation, and change scope.
- AC-273 and AC-157 to AC-161: data sources.
- AC-307: 10 tiles in under 3 s at p95 with security on.
- AC-008: groups in the security context.

**Provenance.**

- The caller named branch `feat/data-source-introspection-api` at f6355de982. The local checkout `~/Work/bi/cube` is actually on `feat/introspection-package` at 0b6eef90a9 (`.git/HEAD`, `.git/refs/heads/*`).
- Per `docs/inputs/2026-09-25-cube-introspection-package.md` §1, that branch changes no Cube-owned file relative to v1.7.45. That is an input claim; I could not run `git diff` to check it.
- So every `file:line` below is from the local checkout.
- I fetched the two files this design leans on hardest from GitHub at f6355de982 and confirmed the quoted methods are identical there:
  - `server.ts`: `getCompilerApi`, `getOrchestratorApi`, the driver closure, `resolveDriver`, `handleScheduledRefreshInterval` ([f-srv])
  - `QueryCache.ts`: `queryCacheKey`, `getKey`, `refreshKeyIdentity` ([f-qc])
- The old branch did change `BaseQuery.js`, `CubeSymbols.ts`, `QueryCache.ts` and `QueryOrchestrator.ts` elsewhere ([r-intro] sources list), so line numbers there may drift at f6355de982.
- Docs: `config.mdx` and `multitenancy.mdx` were confirmed at the v1.7.45 tag through raw GitHub. The other docs pages were read in the checkout's `docs-mintlify`.
- Nothing here was run: this session had no shell. Every runtime behaviour is source-derived unless it cites a wechart doc that observed it. The Probes section lists what to observe.

**Findings that decide the design:**

1. **The app id is a model cache key only.** Each distinct `contextToAppId` value gets one compiled model. The model is built by `repositoryFactory(context)` and `preAggregationsSchema(context)`, both called once per app id with the first request's context ([srv] L533-567; [d-cfg] "Called only once per app_id"). Everything below the model is shared unless the orchestrator id or the schema differs: connections, queues, the result cache and pre-aggregation tables ([d-mt] Warning under "Same DB Instance with per Tenant Data Model").
2. **Groups must not be in the app id, and need not be.**
   - Access policies are evaluated for each request: `contextToGroups(context)` → `getApplicablePolicies` ([capi] L386-460, L493-805, L986-1072).
   - The only thing that is per app id and user-dependent is `COMPILE_CONTEXT`, "evaluated only once per each key generated by `context_to_app_id`" ([d-ctxvars] L829-833). wechart must refuse it in served models.
3. **Cube names are global within one compile.** A second cube or view of the same name in any file fails with `Found duplicate cube name '<n>'.` ([dict] L17-33). "Nearest wins" (AC-272) therefore has to be done by wechart when it serves files: it serves one definition per name, the nearest.
4. **The result cache is keyed without the data source.** The key is `[sql, values, preAggregation loadSqls, invalidate]` under the prefix `<orchestratorId>#SQL_QUERY_RESULT:` ([qc] L266-268, L469-481, L1301-1303; same at [f-qc]). So two folders whose same-named cubes generate identical SQL against different databases share cached answers when they share an orchestrator. That breaks AC-274.
5. **Pre-aggregation table names don't include the data source either.** A table is `<schema>.<cube-or-sql_alias>_<preAgg>_<content>_<structure>_<updated>`, and both versions hash the load SQL ([bq] L4229-4247, L4393-4400; [scpa] L450-457; [opa] L28-87, L882-888; [pal] L379-391). Two folders' rollups stay apart only through a different schema or a different cube `sql_alias`. The docs say `sql_alias` "affects all member names including pre-aggregation table names" ([d-cube] L108-132).
6. **Data-source names must be made globally unique when wechart serves the files.**
   - `driverFactory` sees only `{ securityContext, dataSource }`, and each orchestrator caches one driver per data-source name ([srv] L643-706).
   - Within one folder path, `warehouse` may mean different connections for different folders' models (AC-273 resolves from each model's own folder).
   - So the served files must name a canonical, context-independent data source, for example `ds_<id>_v<n>`.
7. **Connections from wechart need no restart** if they go through `driverFactory` with `CUBEJS_DATASOURCES` unset (any name is accepted, [env] L78-101).
   - A changed connection takes effect when a new driver is created: under a new name, a new orchestrator, or after a restart ([srv] L643-706; [ostore] L9-24).
   - Old drivers are released only when their orchestrator is evicted (an LRU of 100, no TTL, [srv] L132, [ostore] L9) or when Cube restarts.
   - `/livez` goes on testing them ([oapi] L182-193; [gw] L3065-3076).

**Layout, on technical grounds.** I compare two layouts (§2):

- **Layout A**, the documented full-tenancy layout: an app id, an orchestrator id and a schema per folder path.
- **Layout B:** an app id per folder path, one shared orchestrator, and one shared schema. wechart gives every served cube a `sql_alias` derived from its origin folder and resolved data source, and a canonical `data_source`.

I recommend B, for four reasons:

- AC-274 holds by construction, because the aliases differ, so the SQL differs, so the result-cache keys and table names differ.
- Rollups survive a change of folder path, so no HTTP 400s after a folder gains its first model. This bears on AC-275 and AC-307.
- Pools and queues are shared per real data source, which protects the warehouse.
- There is no 100-orchestrator cap.

B's correctness rests on wechart's rewriting of the served files. It has not been probed. Fork change F1 (§5) removes the dependence of result-cache isolation on SQL text.

## Install

- **No new packages** (`packages: []`). Cube keeps running the fork image. The change is in `infra/cube/cube.js` and in wechart's model-store API.
- **Environment:**
  - **`CUBEJS_DATASOURCES` must stay unset.** When it is set, any name not in it throws "The X data source is missing in the declared CUBEJS_DATASOURCES" ([env] L88-101).
  - **`CUBEJS_DB_*` are defaults for every data source.** With `CUBEJS_DATASOURCES` unset, `keyByDataSource` maps every name to the bare `CUBEJS_DB_*` key ([env] L106-126). The Postgres driver builds its pool config as `{ host: getEnv('dbHost',…), …, ssl: this.getSslOptions(…), ...config }` ([pg] L123-131).
    - Every `driverFactory` result must set every field, including `ssl` and `maxPoolSize`.
    - Otherwise the phase-1 sample database's host, user or TLS settings leak into folder data sources.
    - Keep `CUBEJS_DB_*` only for the `default` source (see Init).
  - **`CUBEJS_COMPILER_CACHE_SIZE` / `compilerCacheSize`:** a positive integer, default 250, which "can not be disabled" ([env] L329-341; [d-cfg] `compiler_cache_size`). Size it at or above the number of folder paths in active use, on each API replica and on the refresh worker (§1).
  - **Refresh worker:** `CUBEJS_SCHEDULED_REFRESH_BATCH_SIZE` defaults to 1, so contexts are refreshed one after another within each tick ([env] L323-325; [srv] L829-847).
- **Kubernetes:** `/livez` should not be the liveness probe once data sources are user-supplied (Gotcha 9). `kubernetes.md` L206 currently uses it ([r-k8s]).

## Init / auth pattern

### What wechart signs (HS256 with `CUBEJS_API_SECRET`, server-side only)

```jsonc
{
  "wechartStore": "http://wechart-api:…",   // existing claim: which trusted model store
  "wechartModel": "f12.f3.f1",              // the folder path, as model-bearing folder ids, nearest first
  "wechartFolder": "f19",                   // the dashboard's own folder: logs and audit only, never in an id
  "wechartDraft": "…",                      // optional, as today
  "groups": ["…"]                           // AC-008; only the groups the model's policies name (Gotcha 11)
}
```

- **`wechartModel` identifies the chain of model-bearing folders.** A folder with no models of its own maps to its nearest model-bearing ancestor's chain. So /A/B and /A/C share /A's app id when neither holds models, and app ids are bounded by the number of model-bearing folders plus active workspaces.
  - This is an inference from how app ids key the compile cache ([srv] L533-563).
  - A workspace chain is `ws:<user>` followed by the origin folder's chain (§P2.6 E).
- **`contextToAppId` runs on every request** ([d-cfg] `context_to_app_id`: "Called on each request"). It must be computed from the claim alone, with no I/O.
- **Only wechart can mint a context**, because only it holds the secret ([r-cfg] L143). The browser must never supply `wechartModel`. The API computes it after checking folder access (AC-268).

### `cube.js` sketch for layout B

This sketch is assembled from the sources cited in the comments and has not been run.

```js
// infra/cube/cube.js (sketch, layout B). Existing storeOf/draftOf/fromStore/fromDisk kept.
const CHAIN = /^[a-z0-9]{1,16}(\.[a-z0-9]{1,16}){0,31}$/;       // wechart's folder-id format (assumption)
const DS = /^ds_[a-z0-9]{1,24}_v[0-9]{1,9}$/;                    // canonical, versioned; never ends in _db/_aws/_jdbc
const chainOf = (ctx) => {
  const c = ctx && ctx.securityContext && ctx.securityContext.wechartModel;
  return typeof c === 'string' && CHAIN.test(c) ? c : undefined;
};

// A versioned name's config never changes, so it can be cached for the process lifetime.
// driverFactory is called for dbType on every query (OptsHandler L185-207), so it must not do I/O each time.
const dsConfigs = new Map();
const dsConfig = (store, name) => {
  if (!dsConfigs.has(name)) {
    dsConfigs.set(name, fromStore(store, `data-sources/${name}`).catch((e) => { dsConfigs.delete(name); throw e; }));
  }
  return dsConfigs.get(name);
};

module.exports = {
  maxCompilerCacheKeepAlive: 10 * 60 * 1000,            // today's value; see Gotcha 5 for AC-307
  updateCompilerCacheKeepAlive: true,

  contextToAppId: (ctx) => {
    const store = storeOf(ctx); const chain = chainOf(ctx);
    if (store === undefined || chain === undefined) return 'CUBE_APP_disk';
    const draft = draftOf(ctx);
    return `CUBE_APP_${slug(store)}_${chain}${draft === undefined ? '' : `_draft_${slug(draft)}`}`;
  },
  // contextToOrchestratorId: unset → one orchestrator, 'STANDALONE' (server.ts L234).
  // preAggregationsSchema: unset → 'prod_pre_aggregations' (OptsHandler L411-415).

  repositoryFactory: (ctx) => {
    const store = storeOf(ctx); const chain = chainOf(ctx); const draft = draftOf(ctx);
    return {
      localPath: () => MODEL_DIR,
      dataSchemaFiles: async () => {
        if (store === undefined || chain === undefined) return fromDisk();
        const route = draft === undefined ? `chains/${chain}/files` : `chains/${chain}/drafts/${draft}`;
        return (await fromStore(store, route)).files;     // nearest-only, sql_alias + canonical data_source already applied
      },
    };
  },
  schemaVersion: async (ctx) => {
    const store = storeOf(ctx); const chain = chainOf(ctx);
    if (store === undefined || chain === undefined) return 'disk';
    const draft = draftOf(ctx);
    return draft === undefined ? (await fromStore(store, `chains/${chain}/version`)).version : `draft_${draft}`;
  },

  driverFactory: async ({ securityContext, dataSource }) => {
    if (dataSource === 'default') return { type: process.env.CUBEJS_DB_TYPE };   // env default, as phase 1
    if (!DS.test(dataSource)) throw new Error(`Unknown data source: ${dataSource}`); // throw; never return junk (Gotcha 8)
    const store = storeOf({ securityContext }) || STORES[0];
    return { ...(await dsConfig(store, dataSource)) };   // { type, host, port, database, user, password, ssl, maxPoolSize, … }
  },

  scheduledRefreshContexts: async () => [
    { securityContext: {} },
    ...(await Promise.all(STORES.map(async (store) =>
      (await fromStore(store, 'chains')).chains.map((chain) => ({ securityContext: { wechartStore: store, wechartModel: chain } }))))).flat(),
  ],
  // contextToGroups, contextToApiScopes: as today, but see Gotcha 12 on `jobs`.
};
```

- **The `default` source.** "A `default` data source must exist and be configured" ([d-mt] Warning). `getSqlGenerator` resolves the `default` dbType before it knows the query's own data source ([capi] L312-352). Returning `{ type }` alone makes Cube size the pool and read `CUBEJS_DB_*` for it ([srv] L925-935; [opts] L150-157). Which folder data source a model that names none should use is not specified (Open questions).
- **Returning only `{ type }` for every source would read env.** For any other source, return full configs.

## API surface we will use

### 1. One compiled model per folder path (`contextToAppId`, `repositoryFactory`, `schemaVersion`)

| Hook | When Cube calls it | Which context it sees | Source |
| --- | --- | --- | --- |
| `contextToAppId(ctx)` | every request | the request's | [srv] L534; [d-cfg] |
| `repositoryFactory(ctx)` | once per app id, when the `CompilerApi` is created | the **first** request's for that app id | [srv] L538-541; [d-cfg] "Called only once per app_id" |
| `preAggregationsSchema(ctx)` | once per app id | the first request's | [srv] L554; [d-cfg] "Called once per app_id" |
| `schemaVersion(ctx)` | every `getCompilers()` call, which is several per request. The spike counted 17 version calls against 2 file fetches. | the **current** request's: `compilerApi.schemaVersion` is replaced on each `getCompilerApi` | [srv] L536, L565; [capi] L216-240; [r-spike] §1 |
| `COMPILE_CONTEXT` in models | once per app id | the first request's | [d-ctxvars] L829-833; [srv] L555 |
| the dbType closure (calls `driverFactory`) | per cube at compile, and several times per query | the first request's context merged with `{ dataSource }` | [srv] L542-545; [capi] L296-352; [opts] L185-207 |

**Compile cache** ([srv] L215-243):

- It is `new LRUCache({ max: compilerCacheSize || 250, ttl: maxCompilerCacheKeepAlive, updateAgeOnGet: updateCompilerCacheKeepAlive, dispose: v => v.dispose() })`.
- `purgeStale()` runs every `maxCompilerCacheKeepAlive` ms.
- `dispose()` replaces the compilers with a `disposedProxy` that throws on any property access ([capi] L191-202; [disp] L5-21). Consequence, inferred and not observed: a request still holding an evicted `CompilerApi` fails with "Cannot access property … on disposed CompilerApi instance". Keep the cache larger than the set of folder paths used concurrently.

**Memory and compile cost:**

- Per app id there is a dedicated "data model compile cache and SQL compile cache". Per orchestrator id there is a dedicated orchestrator. The docs' footprint is "single-digit MBs on the lower end and dozens of MBs on the higher end" ([d-mt] "Running in Production").
- Each `CompilerApi` also owns three transpile LRUs of 250 entries ([capi] L161-176), an SQL query cache and an access-policy cache of 10,000 entries / 5 min ([CompilerCache.ts] L12-21).
- UNVERIFIED: compile time and heap for wechart's own models. They are measurable from Cube's `Compiling schema completed` log, which carries `duration` ([capi] L278-282), and from container memory. The spike saw a publish reach `/v1/meta` "within about a second" ([r-spike] §1). That is one data point, not a measure.
- The transpile caches are keyed by the md5 of file content ([dsc] L840-843), but they belong to each `CompilerApi`. So every folder path re-transpiles the ancestor files it shares with others (F5 in §5).

**With hundreds of folder paths** (inferences from the lines above):

- Each API replica compiles each path on its first request to it.
- A publish to folder F recompiles every path that includes F, lazily, on next use, in each replica and in the worker. A publish at the root recompiles every path.
- If more paths are active than `compilerCacheSize`, the LRU thrashes: recompiles, plus the disposed-instance failures above.
- The docs' scaling advice is to bucket tenants, or to split them across nodes with coordinated `scheduledRefreshContexts` ([d-mt] "Running in Production").

**Groups stay out of the id.**

- `contextToGroups` is called for each request context ([capi] L386-391).
- Policies are cached under `${cube.name}_${md5(JSON.stringify(context))}` ([capi] L417-427). That context includes the request id, so in effect this is a per-request cache (inference).
- `/v1/meta` visibility is patched per request, and the compiler id mixes in a visibility hash ([capi] L986-1116).
- So users with different groups share one compile.

### 2. Pre-aggregations per folder path

**Table naming** (source; see also [r-jr] "Table names"):

- The full name is `<schema>.<aliasName(cube.preAgg)><partition>_<content_version>_<structure_version>_<updated>` ([opa] L882-888).
- `aliasName` replaces the cube name with its `sql_alias` ([bq] L4229-4247, L4393-4396; [scpa] L450-457). Tesseract does the same ([qt] L189-196; [pac] L237-251).
- The structure version is `version(loadSql [+ indexes, streamOffset, outputColumnTypes])` ([opa] L74-87). The content version adds the invalidation keys ([pal] L379-391). Neither includes the data source.
- The schema is the option `preAggregationsSchema`, resolved once per app id ([srv] L554; [bq] L374, L4398-4400).

**What sharing a schema implies:**

- `dropOrphanedTables` lists every table in the rollup's schema and drops those absent from the orchestrator's `tablesUsed ∪ tablesTouched`.
- Those keys are prefixed with the orchestrator id ([pal] L1089-1156; [opa] L362-385, L419-473).
- `CUBEJS_DROP_PRE_AGG_WITHOUT_TOUCH` defaults to `true` and `CUBEJS_TOUCH_PRE_AGG_TIMEOUT` to 24 h ([env] L821-837).
- **So two orchestrators must never share a schema.** That is the docs' warning: override `pre_aggregations_schema` when you override `context_to_orchestrator_id`, "Otherwise, you end up with table name clashes" ([d-cfg]).

| | **Layout A** (documented full tenancy) | **Layout B** (recommended) |
| --- | --- | --- |
| **Setup** | App id, orchestrator id and `preAggregationsSchema` all per folder path ([d-mt]; [d-cfg]) | App id per folder path. Orchestrator and schema shared. wechart serves each cube with `sql_alias: <name>_<h>`, where `h` hashes the origin folder id and the resolved canonical data source, and `data_source: ds_<id>_v<n>` |
| **AC-274, rollups** | Apart by schema | Apart by alias. Same definition on the same data source means the same table, which is correct to share |
| **AC-274, result cache** | Apart by orchestrator prefix ([qc] L266-268) | Apart because the alias changes the SQL text, which is in the key ([qc] L469-481; [qt] L189-196). F1 makes this independent of SQL text |
| **A folder gains its first model** (descendants' paths change) | New schema: every rollup-matching query returns HTTP 400 until the worker rebuilds. An API instance without a builder doesn't fall back ([r-pa] L297) | Inherited cubes keep their aliases, so their rollups keep serving. Only changed rollups rebuild |
| **Workspaces** | A new path, so a new schema and 400s, unless `preAggregationsSchema` maps a workspace to its origin's schema | Unchanged copies keep the origin alias, so their rollups are reused |
| **Connections and queues** | One pool and one queue per path × data source. Warehouse concurrency multiplies with paths ([srv] L643-706; [qo] L103-120) | One pool and one queue per real data source. No fairness between folders on one source |
| **Scale limit** | `OrchestratorStorage` is an LRU of 100 with no TTL, built without options ([srv] L132; [ostore] L9-24). Over 100 paths, orchestrators are evicted and released (pools and Cube Store sockets), then rebuilt | None beyond the compile cache |
| **Refresh-key cache** | Per path | Shared: the key includes the data source ([qc] L490-498) |
| **Needs** | Config only | Config only, plus wechart's served-file rewriting. F1 recommended |

**Refresh worker** (`scheduledRefreshContexts`; there is no `scheduledRefreshContextsFactory` option: the only occurrence is a test helper in `api-gateway/test/index.test.ts` L982):

- It is called on **every tick** ([srv] L810-848) and defaults to `[null]` ([opts] L404). Cube logs "Multitenancy Without ScheduledRefreshContexts" when `contextToAppId` is set without it ([opts] L434-443).
- It must return one context per model-bearing folder path, plus the disk model. Drafts and workspaces are left out, as today ([cubejs] L140-149).
- **Per context, per tick** ([rs] L258-314):
  - `getCompilerApi`, a compile in the worker process;
  - `refreshCubesRefreshKey` for every cube and time zone, skipped for keys evaluated locally ([rs] L338-394);
  - `refreshPreAggregations` over every scheduled rollup's partitions ([rs] L614-693);
  - `forceReconcile` per data source ([rs] L319-336).
- A context whose model fails is logged and the others continue ([rs] L300-313; observed in [r-pa] L350).
- **Cost scales with the number of folder paths.** Contexts run one at a time unless `CUBEJS_SCHEDULED_REFRESH_BATCH_SIZE` is raised ([env] L323-325; [srv] L829-847).
  - In layout A every path also rebuilds the rollups of every cube it inherits.
  - In layout B the other paths find the table and only check refresh keys (inference from [pal] L159-243).
- **The worker's compile cache must also hold every path.** Otherwise each pass recompiles: LRU size, and the 10-minute TTL if a pass takes longer.
- **Per-app-id build concurrency.** The docs give `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID` a default of 10 ([d-env] L213-225). The source has no default ([env] L281). The scheduler then falls back to the smallest pre-aggregation queue concurrency, or 1 on the first run ([srv] L833-836; [rs] L266-269). For Postgres that is 2 ([r-ds] L213). See Corrections.
- **Jobs API.** Pre-aggregation ids stay `<cube>.<name>`, not the alias ([scpa] L381). Build contexts come from the request body (Gotcha 12).

### 3. Data sources supplied by wechart

- **Signature:** `driverFactory(context: DriverContext) => BaseDriver | DriverConfig` (sync or async), where `DriverContext = RequestContext & { dataSource: string; preAggregations?: boolean }` ([types] L82-92, L161-166).
  - Return a `DriverConfig` (`{ type, ...options }`), not a driver instance: with an instance, the dialect comes from global `CUBEJS_DB_TYPE` ([opts] L185-207; [r-ds] Gotchas).
  - `dbType` as an option throws since v1.7.0 ([opts] L63-71).
- **When it runs:**
  1. Once per data source per orchestrator, to create the driver. That runs `testConnection()` and caches the driver in `driverPromise[dataSource]`. A failed creation is cleared, so the next request retries ([srv] L643-706; [d-cfg] "Called once per data_source for every orchestrator id").
  2. **On every dbType lookup**, which happens several times per query and per cube at compile: `getDbType` calls `driverFactory` again each time once the result type is `DriverConfig` ([opts] L185-207; [capi] L296-352).
  3. From queue-concurrency defaults ([opts] L212-226, L231-281).

  So `driverFactory` must answer from memory. Fetching from wechart's API is fine once per name, as in the Init sketch.
- **Which context it gets.** The orchestrator's closure holds the context of the request that **built** the orchestrator ([srv] L618, L663-668). With a shared orchestrator, `driverFactory` must depend only on `dataSource`. That is why the names are canonical.
- **Listing:** `CompilerApi.dataSources()` lists the data sources named by the model and calls `orchestratorApi.driverFactory(name)` for each. That creates and tests the driver, and silently drops sources that fail ([capi] L1175-1201). The fork's `GET /v1/introspection/data-sources` lists declared-or-`default` plus model-named sources ([igw] L231-256; old branch [r-intro] L195). `/v1/data-sources` is Cloud-only ([r-cfg] L365).
- **Pooling:**
  - One driver, and so one pool, per orchestrator × data-source name. Pre-aggregation builds share it when `driverFactory` is custom ([srv] L649-703).
  - When the config has keys beyond `type`, Cube doesn't compute `maxPoolSize` ([srv] L925-932). Postgres then uses `config.maxPoolSize || CUBEJS_DB_MAX_POOL || 8`, min 0, idle 30 s ([pg] L146-161).
  - Pool size should be "at least twice of total concurrency among all queues" ([d-cfg] `orchestrator_options`).
  - Queue concurrency can be set per data source with a **synchronous** `orchestratorOptions.queryCacheOptions.queueOptions(dataSource)`, which Cube reads directly ([opts] L231-245). The docs "strongly recommend" leaving these at their defaults ([d-cfg]).
- **Orchestrator per context.** Leave `contextToOrchestratorId` unset for layout B.
  - The docs' warning that tenants would "share a single connection to whichever data source was resolved first" ([d-same] L20-27) applies when one name means different connections in different contexts.
  - Canonical names remove that case (inference from [srv] L644-646).
- **Rotation and edits without a restart.** Three routes:
  - **Versioned names (config only).** A saved change bumps `ds_<id>_v<n>`.
    - The served files change, so `schemaVersion` changes, so the paths recompile. The first query under the new name creates a new driver ([srv] L643-706).
    - Rollups survive, because table names don't include the data source ([opa] L74-87, L882-888).
    - The old driver object and its credentials stay in memory until the orchestrator is released: an LRU of 100, or restart ([ostore] L9-24).
    - Postgres idle connections close after 30 s with min 0 ([pg] L147-158).
    - `/livez` keeps testing the old name (Gotcha 9).
  - **Postgres password function.** node-postgres accepts `password?: string or function` ([pgclient]). Cube passes the config through to the pool's `create` ([pg] L123-135). A function lets a live pool pick up a rotated password. This is source-derived and was not observed. Whether the other five driver types support anything similar is UNVERIFIED.
  - **Fork F2:** evict one data source's driver on demand (§5).
- **AC-161 answer:**
  - **Restart:** not needed for adding, changing or removing a folder data source through this path.
  - **Restart still needed:** for env-level settings (`CUBEJS_DB_*` for `default`, `CUBEJS_DATASOURCES`, Cube Store) and for `cube.js` itself ([r-cfg] §3).
  - **"The running Cube uses the new settings" is observable per process** (API replicas and worker each hold their own compile and orchestrator; the worker serves REST, [r-intro] L124; [r-k8s] L226):
    - `/v1/sql` for a cube of that folder returns `dataSource` ([r-ds] L250), which will be the new versioned name.
    - The introspection list for that folder path contains the name only if the driver was created and connected ([capi] L1186-1195; [srv] L677). This is an inference.

### 4. How a query names its folder path; drafts, workspaces, introspection, jobs

- **Carrier.** A signed claim carries the path (Init). `contextToAppId`, `repositoryFactory`, `schemaVersion` and `scheduledRefreshContexts` read it.
  - `contextToGroups` reads `groups`.
  - Nothing that feeds an id reads `groups` or `wechartFolder`.
- **AC-275.** The version for a path is the combined version of the files served for it, after shadowing. A change in F changes only the paths that contain F, and not where a nearer folder shadows the changed name. This is wechart logic, and it relies on `schemaVersion` being compared per app id ([capi] L216-240).
- **Drafts** keep their own app id, `<path>_draft_<id>`: never built, never given `jobs` ([cubejs] L116-122).
- **Workspaces** are a path of the form `ws:<user>` + origin chain.
- **Introspection:**
  - The token keeps `wechartIntrospection: true` and the scope rule stays as today ([cubejs] L124-138). It adds `wechartModel` so that the folder path's model-named sources are listed.
  - Listing compiles that path ([igw] L237-244).
  - A folder data source that no model names yet is not browsable ([igw] L231-271). Two ways to fix that:
    - config only: for a `wechartDataSource` introspection claim, serve an app id whose one stub cube names that source (UNVERIFIED);
    - fork F6.
  - Scaffolded YAML names the canonical data source, which wechart must map back to the folder's name on save (inference).
- **Context preview.** wechart's API strips `wechart…` claims from a previewed context ([cubejs] L128-129). It must re-add the folder path it authorised.
- **Jobs.** `selector.contexts[i]` is merged over the caller's context, `{ ...context, ...config }` ([gw] L1133-1145; [r-rjc] gotcha 2). The body, not the token, decides which folder path, or draft, is built. See Gotcha 12.

### 5. What configuration cannot do, and minimal fork change points

Through configuration alone, per-folder models, isolated rollups, per-folder connections and hot connection changes are all reachable, with layout B and wechart's served-file rewriting. Each fork change below hardens one weak point or removes a limit.

The standalone package pattern already subclasses `CubejsServerCore` and overrides protected methods ([isrv] L18-45). `buildOrchestratorApi`, `createCompilerApiOptions`, `createOrchestratorApi` and `createApiGatewayInstance` are protected ([srv] L509, L618, L769, L796). So F2, F4, F5 and F6 can live in a package rather than in Cube's files. F1 cannot: it touches a static method on `QueryCache` constructed inside `OrchestratorApi` ([oapi] L35).

| # | Change | Where | Why | Needed for |
| --- | --- | --- | --- | --- |
| F1 | Add `queryBody.dataSource ?? 'default'` to `QueryCache.queryCacheKey` | [qc] L469-481 (same at [f-qc]) | Result-cache isolation independent of SQL text. `refreshKeyIdentity` already includes the data source ([qc] L490-498) | Defence in depth for AC-274 in layout B |
| F2 | Supersede or release one data source's driver: key `driverPromise` by `name#version` from a hook, or add `OrchestratorApi.releaseDataSource(name)` that releases the driver and deletes it from `seenDataSources` | [srv] L643-706; [oapi] L182-193, L242-273 | Stable names, immediate credential eviction, and `/livez` stops testing retired credentials | Rotation without versioned names; security of retired secrets |
| F3 | `/livez` option to test only Cube Store | [gw] L3065-3076 | One user's bad data source shouldn't fail Cube's liveness | Only if `/livez` stays the liveness probe |
| F4 | Pass size and TTL to `OrchestratorStorage` | [srv] L132; [ostore] L9 | The 100 cap | Layout A only |
| F5 | Share the content-keyed transpile LRUs across `CompilerApi` instances | [srv] L769-794; [capi] L161-176; [dsc] L840-843 | Paths re-transpile shared ancestor files. UNVERIFIED that the transpiled output doesn't depend on the other files in the compile | Compile cost with hundreds of paths |
| F6 | Let `cube.js` declare browsable data sources for introspection | [igw] L231-256 (package, not Cube) | Browse a new folder source before any model names it | Scaffolding from a new folder source |

## Gotchas

1. **Shadowing is wechart's job.** Cube rejects a duplicate cube name, or a cube and a view of the same name, anywhere in one compile ([dict] L17-33). wechart must serve only the nearest definition, and cubes and views share one namespace. Prefix served `fileName`s with the folder so that compile errors, which name the file for duplicates, attribute correctly ([r-spike] §1a).
2. **Names inside a parent's model bind in the viewer's folder path.**
   - Cube resolves `joins`, view `includes` and `join_path`, `extends`, and `rollup_join` / `rollups` references by name within the compile.
   - So in /A/B, /A's `sales` joins /A/B's `customers` if /A/B defines one.
   - This is inference from the global namespace in [dict] and the join graph built over the compiled cubes ([r-dm], [r-rjp]). See Open questions.
3. **Joins across folders can cross data sources.** If a parent's and a child's `warehouse` resolve to different sources, a query joining their cubes "is rejected" ([d-xds] L357-362).
4. **`COMPILE_CONTEXT` captures the first requester** of each app id ([d-ctxvars] L829-833). YAML can reach it without Jinja, through `J·EXPR` fields like `public` ([r-dm] L532, L784). wechart must refuse it in served models, or users with different groups would share one user's compile-time view.
5. **The 10-minute compile TTL now applies to folder paths too.** It was set for drafts ([cubejs] L72-77), but the cache is one TTL for every app id ([srv] L215-221). A folder not opened for 10 minutes compiles cold on its next dashboard. That is a risk to AC-307 until it is measured.
6. **Per-replica state.** Each API replica and the worker compile, and create drivers, independently. Warm-up after a publish has to reach every replica.
7. **Env defaults leak into every data source** when `CUBEJS_DATASOURCES` is unset ([env] L106-126; [pg] L123-131). Set every field explicitly.
8. **Credentials in logs.** A `driverFactory` return that is neither a driver nor has a `type` throws with `JSON.stringify(val)` in the message ([opts] L119-127). Throw your own error instead of returning a partial config. `Refresh Scheduler Run` logs each context's `securityContext` ([rs] L281-284). Job records store the security context in Cube Store in plain JSON ([r-jr] L202). So refresh and job contexts should carry the folder path only, never `groups`.
9. **`/livez` couples pod health to every data source ever used.** It tests every seen data source of every cached orchestrator, plus Cube Store ([gw] L3065-3076; [oapi] L182-193; [r-k8s] L40-45).
   - With user-supplied folder sources, one bad or rotated credential makes the pod DOWN.
   - With `livenessProbe: /livez` ([r-k8s] L206), Kubernetes would then restart Cube for every folder.
   - `/readyz` always answers 200 once `contextToAppId` is set ([r-k8s] L39).
10. **`driverFactory` runs per query for the dialect.** Any I/O in it adds to every tile ([opts] L185-207).
11. **Token size.** Node's default maximum HTTP header size is 16 KiB ([nodecli]). Cube's server passes no `maxHeaderSize` ([srvhttp] L88-109). Hundreds of AD group ids in the JWT can exceed it, which is an inference and UNVERIFIED at runtime. Include only groups that the folder path's access policies name.
12. **The jobs body chooses the context** ([gw] L1133-1145).
    - Any token with `jobs` can build any folder path's, or a draft's, rollups by naming it in `selector.contexts`.
    - The `cube.js` comment that drafts are never built "by Cube as well" holds only for draft *tokens* ([cubejs] L116-122).
    - Grant `jobs` only to tokens wechart signs for Jobs, and build `selector.contexts` server-side from the folder being built (R18).
13. **API instances return HTTP 400 until a rollup is built** ([r-pa] L297). Any change that re-homes rollups (a new schema, a new alias) breaks rollup-matching tiles until the worker catches up. This is the main reason for layout B, and for keeping aliases stable across edits.
14. **Aliases must stay short and unique.** `sql_alias` exists because Postgres truncates long identifiers ([d-cube] L108-132). Folder or hash suffixes lengthen member aliases such as `<alias>__<member>` ([bq] L4246). wechart must own `sql_alias` in served files, refusing or namespacing any the user sets. Cube's aliases use `__`, so don't use `__` in a suffix (inference from [bq] L4246).
15. **Canonical data-source names** must avoid endings of `_db`, `_aws` and `_jdbc` ([r-cfg] L503).
16. **`schemaVersion` docs and source differ.** The docs say the context "is reused per application ID" ([d-cfg]). The source calls it with the current request's context ([srv] L536, L565). Keep the version a function of the folder-path claim only.

## Alternatives considered

The caller did not ask for a library comparison. The two Cube layouts are compared in §2 because questions 1–3 need it.

## Corrections to sibling docs

- **`refresh-jobs-caching.md` L219.** "Default 10" is the docs' value ([d-env] L213-225). In source there is no default ([env] L281). The effective value is the smallest pre-aggregation queue concurrency, or 1 ([srv] L833-836; [rs] L266-269).
- **`configuration-deployment.md` L794, open question "Orchestrator eviction".** Answered: an LRU of 100, no TTL, released on eviction ([ostore] L9-24; [srv] L132). This agrees with `data-sources.md` L267.
- **`configuration-deployment.md` §1, `schemaVersion` row.** Add that it runs on every `getCompilers()` call with the current request's context ([capi] L216-220; [srv] L565).
- **`data-sources.md` gotcha, "driverFactory is also called to resolve dialects".** More exactly: on every dbType lookup, several per query ([opts] L185-207; [capi] L312-352).
- **`kubernetes.md` L206.** Revisit `livenessProbe: /livez` once folder data sources exist (Gotcha 9).
- **`infra/cube/cube.js` L116-122, comment.** Drafts are unbuildable only through draft tokens (Gotcha 12).

## Probes to run

None of these was run. Use the compose stack and two Postgres databases.

- **P1.** Two folder paths, same cube name, same SQL, different databases, shared orchestrator, no alias. Expect the second path's `/v1/load` to return the first path's cached rows. Repeat with aliases: expect separate results.
- **P2.** With aliases, list `information_schema.tables` in Cube Store. Expect `prod_pre_aggregations.<name>_<h>_<preagg>_…`. Then give a child folder its first model: its dashboards should keep using the parent's rollups.
- **P3.** Compile time (`Compiling schema completed` → `duration`) and container heap at 10, 100 and 300 folder paths.
- **P4.** Bump a data source's version and revoke the old password. Check `/v1/sql` `dataSource` on the API and the worker, then `/livez`. Expect DOWN.
- **P5.** `compilerCacheSize: 2` with 3 paths queried concurrently. Look for "disposed CompilerApi instance".
- **P6.** A 300-GUID `groups` claim. Expect Node to answer 431.
- **P7.** Postgres `password` as a function, rotated while the pool is live.

## Open questions / unverified

- **Name binding inside inherited models.** Is it the viewer's folder path (Cube's behaviour with a single compile, Gotcha 2) or the defining folder's? The spec states nearest-wins only for dashboards and charts (AC-272). This is a requirement question for the user.
- **Which data source a cube with no `data_source` uses** in a folder: the env `default`, or a folder data source named `default`? AC-273 covers named sources only.
- **UNVERIFIED:**
  - compile time and memory per folder path for wechart's models (P3);
  - that the alias approach keeps every query's SQL distinct under Tesseract for all query shapes (P1, P2);
  - that other definitions sharing one `table_name` prefix in one schema never interfere. This is avoided by including the origin folder in `h`;
  - the introspection stub-cube approach;
  - credential rotation for Snowflake, Databricks, BigQuery, SQL Server and Oracle drivers;
  - F5's safety;
  - whether the local checkout's Cube-owned files equal v1.7.45, as the input claims. `server.ts` and `QueryCache.ts` were checked at f6355de982; the others were not.
- **Transport of decrypted credentials** from wechart's API to `cube.js`: in-cluster TLS or network policy is a deployment decision. It is not researched here.

[srv]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/server.ts
[capi]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/CompilerApi.ts
[opts]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/OptsHandler.ts
[types]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/types.ts
[ostore]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/OrchestratorStorage.ts
[oapi]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[rs]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[qc]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[qo]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[opa]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[pal]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[scpa]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
[bq]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[dict]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeDictionary.ts
[dsc]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[CompilerCache.ts]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CompilerCache.ts
[qt]: /Users/srajagopal/Work/bi/cube/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_tools.rs
[pac]: /Users/srajagopal/Work/bi/cube/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs
[env]: /Users/srajagopal/Work/bi/cube/packages/cubejs-backend-shared/src/env.ts
[disp]: /Users/srajagopal/Work/bi/cube/packages/cubejs-backend-shared/src/disposedProxy.ts
[pg]: /Users/srajagopal/Work/bi/cube/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[gw]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/gateway.ts
[srvhttp]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server/src/server.ts
[igw]: /Users/srajagopal/Work/bi/cube/cube-introspection/src/gateway.ts
[isrv]: /Users/srajagopal/Work/bi/cube/cube-introspection/src/server.ts
[f-srv]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-server-core/src/core/server.ts
[f-qc]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[d-cfg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[d-mt]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
[d-same]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/configuration/multiple-sources-same-schema.mdx
[d-cube]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/cube.mdx
[d-ctxvars]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/context-variables.mdx
[d-xds]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/cross-data-source-queries.mdx
[d-env]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
[pgclient]: https://node-postgres.com/apis/client
[nodecli]: https://nodejs.org/docs/latest-v24.x/api/cli.html
[cubejs]: /Users/srajagopal/Work/wechart/infra/cube/cube.js
[r-cfg]: /Users/srajagopal/Work/wechart/docs/research/cube/configuration-deployment.md
[r-ds]: /Users/srajagopal/Work/wechart/docs/research/cube/data-sources.md
[r-pa]: /Users/srajagopal/Work/wechart/docs/research/cube/pre-aggregations.md
[r-rjc]: /Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md
[r-k8s]: /Users/srajagopal/Work/wechart/docs/research/cube/kubernetes.md
[r-spike]: /Users/srajagopal/Work/wechart/docs/research/cube/spike-model-store-and-quick-calcs.md
[r-jr]: /Users/srajagopal/Work/wechart/docs/research/cube/job-records.md
[r-intro]: /Users/srajagopal/Work/wechart/docs/research/cube/introspection-api.md
[r-dm]: /Users/srajagopal/Work/wechart/docs/research/cube/data-modeling.md
[r-rjp]: /Users/srajagopal/Work/wechart/docs/research/cube/rollup-join-paths.md
