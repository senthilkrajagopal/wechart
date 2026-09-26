---
library: xcube runtime hooks on Cube (fork senthilkrajagopal/cube, package cube-introspection/ to be renamed xcube, over unmodified Cube v1.7.45)
packages: []
# wechart imports nothing from Cube or xcube; it calls them over HTTP from its server only (AD 10).
version: 1.7.45
researched: 2026-09-25
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorStorage.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/types.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/PrepareCompiler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
  - https://github.com/senthilkrajagopal/cube/tree/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection
  - /Users/srajagopal/Work/bi/cube/cube-introspection/spikes (local branch spike/xcube-feasibility, commit db087e048a)
  - https://www.postgresql.org/docs/current/sql-notify.html
  - https://node-postgres.com/apis/client
  - https://www.pgbouncer.org/features.html
  - https://nodejs.org/api/vm.html
  - https://github.com/josdejong/workerpool
---

# xcube runtime on Cube 1.7.45: published model, whole-model publish, overlays, connections, build events

> **Superseded in part, 2026-09-26**, by the final integration plan ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md), decisions 1, 2 and 4; [the plan's snapshot](../../inputs/2026-09-26-integration-plan.md), "Modules", "Flows" and "Runtime settings") and round R28. The researcher's text below is kept as written.
> - **Replaced: one flat model and one refresh context.**
>   - xcube compiles modules, groups of cubes that reference each other, each under its own app id (`m:<moduleId>@<moduleVersion>`).
>   - It routes each query to its module through `extendContext`.
>   - The refresh worker gets one context per module.
>   - Finding 7's single-context worker tick and the whole-model candidate compile (finding 3) apply per module.
> - **Replaced: xcube owning the published model.** wechart is the system of record. xcube's schema holds a derived copy that wechart can rebuild with a snapshot.
> - **Decided: finding 8, model code beside secrets.** xcube accepts only YAML model items, and runs with Node's `require` off (R28 Q7; AC-332).
> - **Still holds:**
>   - the hooks: `repositoryFactory`, `schemaVersion`, `contextToAppId`, `driverFactory` and `logger`;
>   - `NOTIFY`-driven switching;
>   - the connection swap through `createOrchestratorApi`;
>   - build-event capture in every process, which wechart pulls (T373);
>   - the corrections to `per-folder-models.md`.

## Summary

**What this covers.** How xcube, a package running inside the user's Cube 1.7.45 fork, can own the published model and the connection runtime while Cube never calls wechart. It covers:

- serving one flat model from xcube's own Postgres schema;
- compiling a candidate model at publish;
- overlays for unpublished workspace and proposal content;
- per-data-source connections, including swaps and per-instance reporting;
- capturing build events;
- refresh contexts;
- which Cube process runs each hook.

**Criteria it serves** (`docs/spec.md`, `docs/requirements.md` §P2.4 "Architecture"):

| Criterion | What it needs from Cube |
|---|---|
| AC-327 | Cube takes its model and connections from xcube, and nothing in Cube or xcube calls wechart |
| AC-321, AC-322 | Whole-model compile on every publish, with Cube's error and its file |
| AC-323 | Overlays only certain users can query, dropped when a proposal lands or is rejected |
| AC-161 | Whether every running Cube instance uses a data source's new settings |
| AC-150 | Build history for refresh-worker builds |
| AC-274, AC-328 | One flat model with folder-prefixed names, and pre-aggregations kept apart |

**Provenance.**

- **The checkout.** `/Users/srajagopal/Work/bi/cube` is on branch `spike/xcube-feasibility` at `db087e048a`. That is `feat/xcube` (`0b6eef90a9`) plus one commit, "spike(xcube): feasibility spikes for the flat model, connection swaps and HA" (`.git/logs/HEAD` L16–18). That commit adds `cube-introspection/spikes/`. The package directory is still named `cube-introspection/`.
- **Line numbers.** Upstream line numbers are from the local checkout's Cube-owned files. I could not run `git diff`. I spot-checked these against the `v1.7.45` tag through raw GitHub, and all matched:
  - `server.ts` has `buildingOrchestratorApis` and `withLogRedaction`;
  - `OrchestratorStorage.ts` matches as a whole file;
  - `CompilerApi.ts`: `dispose`, `getCompilers`, `compileSchema`, `createQueryFactory` and `dataSources`;
  - `OrchestratorApi.ts`: `seenDataSources`, `testConnection` and `addDataSeenSource`;
  - `gateway.ts`: `readiness`, `liveness`, and the only `addDataSeenSource` call;
  - `ErrorReporter.ts`;
  - `DataSchemaCompiler.ts`: options, `compile()` and `transpileYamlFile`;
  - seven quoted sentences of `config.mdx`.
- **"Observed" means the fork's spikes.** Their committed outputs are the only runtime evidence here. I ran nothing.
  - **Spike A (scale).** Committed results under `spikes/a-scale/results/`. It used the npm `@cubejs-backend/*@1.7.45` packages (`cube-introspection/package-lock.json` L2721–2723, L2793–2795).
  - **Spike B (connection swaps).** Code only. **No run output is committed.**
  - **Spike C (2 API instances, a refresh worker, the Cube Store queue).** Committed outputs under `spikes/c-multi-instance/out/`.
  - Where I cite `docs/research/cube/spike-model-store-and-quick-calcs.md`, that observation was made on v1.7.42.
- **Context7.** `/cube-js/cube` serves master docs. Its `schema_version` and `repository_factory` text matches the tag. Everything else here comes from the tag's source and docs.

**Findings that decide the design:**

1. **Everything AC-327 needs is reachable without Cube calling out.** The model comes from `repositoryFactory` plus `schemaVersion` or `contextToAppId`. Connections come from `driverFactory`, build events from `logger`, and the refresh set from `scheduledRefreshContexts`. All of these are documented config options ([d-cfg] L58–190, L471–476, L855–868, L1530–1542). xcube feeds them from its own Postgres store, and LISTEN/NOTIFY carries changes.
   - Observed (spike C): after `UPDATE` + `NOTIFY`, both API instances and the worker served the new model in 233–407 ms, with a skew of 43 ms or less.
   - The one thing config can't do is **replace a live connection under a stable data-source name**. That needs an override of the protected `createOrchestratorApi` (Spike B's design).
2. **A version change recompiles lazily, and a failed compile takes the model down.**
   - `getCompilers()` compares `schemaVersion()` on every call. On a mismatch it replaces the compiled model with a pending compile that every request awaits ([u-capi] L216–240).
   - A failed compile leaves no model. Cube does not keep the last good one ([u-capi] L232–235). Observed on 1.7.42: every request, `/v1/meta` included, answered 500 (`spike-model-store-and-quick-calcs.md` L63).
   - A cold compile of 1k/3k/6k cubes took 3.0/7.4/14.2 s in-process on macOS (spike A).
3. **A whole-model candidate compile can run in-process, off the served model.** `prepareCompiler` and `compile` are exported from `@cubejs-backend/schema-compiler`, and `CompilerApi` from server-core ([u-prep] L61–142; [u-sc-index] L13).
   - **Errors come back as one string.** Compile throws a single `CompileError` whose text is grouped by file ([u-er] L159–219). The structured list sits in a *private* field ([u-dsc] L162–164).
   - **YAML syntax errors skip that path.** On the default path they reject the compile with a `YAMLException` that names no file ([u-dsc] L866–883). This was observed on 1.7.42.
   - **Most semantic errors name the cube, not the file.** They are prefixed `<cube> cube:` ([u-er] L142).
   - **Cost:** 3–47 s and 0.7–5.5 GB peak RSS, depending on model size and transpile threads (spike A).
4. **Overlays work as an app id per overlay** (`contextToAppId` plus `repositoryFactory`). But:
   - **Memory is the limit, not the LRU of 250.** A resident full-model overlay cost about 87–96 MB of heap at 3k cubes and 167 MB at 6k (spike A).
   - **A closure compile is much smaller.** Compiling only the dependency closure took 0.2–0.9 s and gave SQL identical to the full model in 8 of 8 queries (spike A). That is xcube's own code, not Cube's.
   - **Isolation isn't automatic.**
     - The result-cache key has no data source ([u-qc] L469–481).
     - Pre-aggregation table names have no data source ([u-pa] L74–87).
     - API instances never build pre-aggregations ([u-opts] L518–524, L627–630).
5. **Stock Cube never releases or tests named data sources' drivers.**
   - `OrchestratorApi.release()` and `/livez` cover only `seenDataSources` ([u-oapi] L182–193, L242–273).
   - Stock code adds only `default` to that set, and only from the standalone readiness probe ([u-gw] L3045–3063).
   - This corrects `per-folder-models.md` (see Gotchas, "Corrections").
6. **Build events have exactly one hook, the `logger` option.** Terminal build events fire in whichever process executed the build, and an API instance can be that process. So capture has to run in every process. Their fields are verified at [u-qq] L869–1089.
7. **One flat model means exactly one refresh context.** In the worker, one context does all of this per 30 s tick:
   - a compile;
   - a refresh-key plan for every cube and time zone, unless `CUBEJS_REFRESH_KEY_LOCAL_TIME=true` ([u-rs] L338–394; [d-env] L1521–1533);
   - a scheduler concurrency set by the *smallest* pre-aggregation queue concurrency across every data source ([u-rs] L232–256).
8. **Security: user-authored model code runs in the process that holds decrypted credentials.**
   - **Jinja** `env_var` read Cube's environment (observed on 1.7.42).
   - **JS model files** can `require` Node modules, because `allowNodeRequire` defaults to true ([u-capi] L146).
   - **`node:vm` is "not a security mechanism"** ([node-vm]).
   - So xcube's private key and plaintext credentials share a process with model code. This needs a decision (Open questions).

## API surface

### 1. The published model from xcube's own store

#### Hooks involved

| Hook | When Cube calls it | Context it gets | Source |
|---|---|---|---|
| `contextToAppId(ctx)` | Every `getCompilerApi` call: every API request and every refresh tick | The current request's | [u-srv] L533–534; [d-cfg] L84 |
| `repositoryFactory(ctx)` | Once per app id, when that app id's `CompilerApi` is created on a cache miss | The request that missed | [u-srv] L538–541; [d-cfg] L112 |
| `repository.dataSchemaFiles()` | At the start of each compile of that `CompilerApi` | None | [u-dsc] L255–256; `SchemaFileRepository` is `{ localPath(), dataSchemaFiles() }` ([u-frepo] L11–14) |
| `schemaVersion(ctx)` | Every `getCompilers()` call, several per request | The **current** request's: the closure is replaced on each `getCompilerApi` | [u-srv] L536, L565; [u-capi] L216–220 |
| `compilerCacheSize`, `maxCompilerCacheKeepAlive`, `updateCompilerCacheKeepAlive` | At start-up | — | [u-srv] L215–221, L238–243; [u-capi] L161–188 |

- **Docs versus source on `schemaVersion`'s context.** The docs say the context "is reused per application ID" ([d-cfg] L186–188). The source passes the current request's context ([u-srv] L536, L565). Keep the returned version independent of the context.
- **When a new version is noticed.** With neither `devServer` nor `fastReload` set, a new version is picked up only when `schemaVersion` returns a different string. With either set, every `getCompilers()` hashes all files ([u-capi] L226–229).

#### Two ways to switch versions

**Pattern A: one app id, version in `schemaVersion`.** This is config only.

```js
// xcube, in every Cube process (API instances and the refresh worker). A sketch, not run.
let current;                          // { version, files }: an immutable snapshot, replaced whole
module.exports = {
  contextToAppId: () => 'xcube_published',
  schemaVersion: () => current.version,                      // a string held in memory; no I/O
  repositoryFactory: () => ({
    localPath: () => '/',
    dataSchemaFiles: async () => current.files,              // read when the compile starts
  }),
};
```

- **The first request after a flip compiles, and every request for that app id waits for it.**
  - `this.compilers` is replaced by the pending compile promise ([u-capi] L231–237).
  - Nothing serves the previous version in the meantime.
  - On failure the promise is cleared and the error goes to the caller. The next request compiles again ([u-capi] L232–235).
- **Transpile caches carry across versions.** The `CompilerApi` stays the same, so its content-keyed caches do too ([u-capi] L161–176, L266–275; [u-dsc] L840–846, L979–988).
  - They are LRUs sized by `compilerCacheSize`, 250 by default ([u-capi] L162–176).
  - A model split into more files than that evicts its own entries. That is an inference; no spike measured it.

**Pattern B: an app id per version, warmed before the flip.** This uses only public methods.

```js
// Sketch, not run. `serving` flips only after this process has compiled the new version.
const pinned = (ctx) => ctx?.securityContext?.xcube?.version;   // set only by xcube itself; strip it from user tokens
module.exports = {
  contextToAppId: (ctx) => `xcube_pub@${pinned(ctx) ?? serving}`,
  repositoryFactory: (ctx) => {
    const v = pinned(ctx) ?? serving;
    return { localPath: () => '/', dataSchemaFiles: async () => (await snapshot(v)).files };
  },
  // no schemaVersion: each app id's model never changes
};
// on NOTIFY v:
//   const api = await core.getCompilerApi({ securityContext: { xcube: { version: v } }, requestId: `xcube-warm-${v}` });
//   await api.getCompilers();
//   serving = v;
```

- **Public methods.** `getCompilerApi` is public ([u-srv] L533). So is `getCompilers` ([u-capi] L216).
- **Observed (spike A `server-bench.js`, which switched versions by app id, L35–37, L92–99):**

  | Model size | First query on v2, compile included | Heap before v2 | Heap with both resident | Heap after v1 removed |
  |---|---|---|---|---|
  | 1k cubes | 2.4 s | — | — | — |
  | 3k cubes | 5.7 s | 337 MB | 525 MB | 423 MB |
  | 6k cubes | 12.4 s | 594 MB | 1015 MB | 777 MB |

  Sources: [a-srv5], [a-srv15], [a-srv30].
- **Retiring the old app id.** It stays in the LRU until evicted, deleted or expired. Removal calls `dispose()`, after which any access throws ([u-srv] L215–221; [u-capi] L191–202; [u-disp] L5–12). Deleting it on demand needs the protected `compilerCache` field ([u-srv] L148).
- **An instance whose warm-up fails** can keep serving the old version. That follows from the pattern; it was not observed.

#### Propagation with LISTEN/NOTIFY

**What PostgreSQL guarantees** ([pg-notify]):

- Notifications from a transaction "are not delivered until and unless the transaction is committed".
- The payload "must be shorter than 8000 bytes".
- Identical notifications in one transaction are folded into one.
- "Messages from different transactions are delivered in the order in which the transactions committed."
- Only sessions that have "previously executed LISTEN" receive them. A listener that isn't connected misses them.

**Constraints on the listener connection:**

- PgBouncer **transaction** pooling "never" supports LISTEN; session pooling does ([pgbouncer]).
- node-postgres raises a `notification` event, and `error` and `end` events for connection loss ([node-pg]).

**Spike C's listener** ([c-cubejs] L14–113):

- one dedicated `pg.Client` per Cube process;
- `LISTEN model_version`;
- a re-sync `SELECT` on connect;
- a 5 s re-sync poll, and reconnect after 1 s.

**Observed with two API instances on the xcube image and the worker** ([c-t5], [c-t5w]; method in [c-t5js] L17–30). "Serving" was measured by polling `/v1/meta` every 50 ms, so it includes a compile of a tiny model.

| Case | All processes serving the new version after | Skew |
|---|---|---|
| `UPDATE` + `NOTIFY` | 233–234 ms (APIs); 378–407 ms (APIs and worker) | ≤ 29 ms |
| `UPDATE` without `NOTIFY` (5 s poll only) | 2.0–4.7 s | up to 1.26 s |
| Listeners killed, then `NOTIFY` | 1.24–1.36 s | ≤ 27 ms |
| After a Postgres restart | 0.97–1.06 s | ≤ 43 ms |
| After a 10 s Postgres outage | 0.30–2.15 s | up to 1.24 s |

**Rules that follow** (from the guarantees above):

- Write the snapshot, the current-version row and `NOTIFY` in **one transaction**. Send only the version id as the payload.
- Re-read the current version on every (re)connect, and poll as a backstop.
- Use a direct or session-mode connection, one per process.
- **Don't serve before the first load.**
  - Spike C fell back to `'v1'` after 10 s ([c-cubejs] L83, L90–93). xcube should instead fail readiness.
  - Cube's `/readyz` checks nothing unless standalone, and it isn't standalone once `contextToAppId` is set ([u-gw] L3045–3063; [u-srv] L223–226). So xcube needs its own readiness route.

#### What a version change does to compiled models and caches

1. **Per-compile state is rebuilt.** `prepareCompiler` creates a fresh symbol table, evaluator, join graph, meta transformer and `CompilerCache` on every compile ([u-prep] L61–136).
   - The `CompilerCache` holds the SQL query cache (10,000 entries, 10 min) and the RBAC cache (10,000 entries, 5 min) ([u-ccache] L9–22). Both start empty.
   - `compilerId` is a new UUID ([u-prep] L92), so `/v1/meta`'s `compilerId` changes ([u-capi] L1105–1109).
2. **Transpile caches are kept in Pattern A only** (above).
3. **Orchestrator state is untouched**: drivers, queues, result cache, refresh-key cache and pre-aggregation table lists. It is keyed by orchestrator id, not app id ([u-srv] L587–616).
   - Changed cubes produce new SQL, and so new keys. Unchanged cubes keep their hits. This is an inference from the keys ([u-qc] L469–498).
4. **A changed rollup gets a new table.** The structure version hashes the rollup's load SQL ([u-pa] L74–87).
   - API instances don't build ([u-opts] L518–524, L627–630).
   - Queries they serve from that rollup fail with "No pre-aggregation partitions were built yet…" until the worker builds it ([u-pal] L170–177; [u-pa] L890–902).
   - Untouched tables are dropped after `CUBEJS_TOUCH_PRE_AGG_TIMEOUT`, 24 h by default ([u-env] L821–823, L835–837).

#### Cost of `schemaVersion` per request

- It runs on every `getCompilers()` call. Observed on 1.7.42: 17 version calls against 2 file fetches (`spike-model-store-and-quick-calcs.md` L62).
- With the version held in memory the cost is a function call and a microtask.
- Return a string. An object is `JSON.stringify`-ed on every call ([u-capi] L222–224).
- Cube's own example fetches the version over HTTP on each call (Context7, `docs/data-modeling/dynamic/javascript.mdx`). That is what xcube avoids.

### 2. Whole-model publish: compiling a candidate

#### Entry points at 1.7.45

**`prepareCompiler` and `compile`:**

- **Signatures:** `prepareCompiler(repo: SchemaFileRepository, options?: PrepareCompilerOptions): Compiler` and `compile(repo, options): Promise<Compiler>`. Both are exported through `@cubejs-backend/schema-compiler` ([u-prep] L30–43, L61–142; [u-cidx] L1).
- **Options pass through.** `prepareCompiler` spreads its options into the `DataSchemaCompiler` options ([u-prep] L94–123). So fields missing from the type, such as `omitErrors`, still reach it at runtime ([u-dsc] L67–95). That needs a TypeScript cast, and is an upgrade risk.

**`CompilerApi`:**

- `new CompilerApi(repository, dbTypeFn, options)` followed by `await api.getCompilers()`, then `api.dispose()` ([u-capi] L141, L216–240, L191–202). Exported from server-core ([u-sc-index] L13).
- This also runs `createQueryFactory`, which resolves a dialect for each cube's data source ([u-capi] L296–310). A `dbTypeFn` that throws on an unknown name therefore fails the compile.
- It throws only the `CompileError`, with no structured list.

**Match the served options**, or a candidate that passes could fail once served:

| Option | Why it matters | Source |
|---|---|---|
| `standalone: false` | Served compiles use it whenever `contextToAppId` is set | [u-srv] L223–226, L787 |
| `allowNodeRequire` | `CompilerApi` defaults it to true | [u-capi] L146 |
| `allowJsDuplicatePropsInSchema` | Changes which transpilers run | [u-prep] L88–90 |
| compile context | Must be the same as when served | — |

Spike A compiled with `standalone: true` ([a-lib] L35–44).

#### What the errors look like

- **The collector.** `ErrorReporter` gathers `{ message, plainMessage?, fileName?, lineNumber?, position? }` ([u-er] L13–19, L140–153).
  - No schema-compiler caller ever passes `lineNumber` (Grep of `packages/cubejs-schema-compiler/src`).
- **The throw.** At the end, `compile()` throws a `CompileError` unless `omitErrors` is set ([u-dsc] L548–567).
  - Its message is `Compile errors:\n` followed by `<file> Errors:` groups, sorted by file. Errors with no file go under a bare `Errors:` ([u-er] L159–219; [u-ce] L1–12).
- **Semantic errors carry context, not a file.** They are prefixed `<cube> cube: ` ([u-er] L142, L155–157), from validator, symbol, join-graph and meta passes ([u-cv] L1476–1480; `CubeSymbols.ts` L328–331; `JoinGraph.ts` L74; `CubeToMetaTransformer.ts` L232).
  - They carry a `fileName` only where the reporter is inside a file.
  - Duplicate cube and view names have no file ([u-cdict] L17–33).
  - Duplicate joins pass `cube.fileName` (`JoinGraph.ts` L202–205).
- **YAML syntax errors, on the default (non-native) path, never reach the collector.**
  - `YAML.load` throws inside the transpile worker ([u-yaml] L90; [u-tw] L74–90).
  - `transpileYamlFile` doesn't catch it ([u-dsc] L866–883; confirmed at the tag).
  - So the compile rejects with the `YAMLException` itself: line, column and snippet, no file.
- **Formats observed on 1.7.42 through Cube's HTTP API** (`spike-model-store-and-quick-calcs.md` L92–95):
  - `"Error: Compile errors:\ncubes/customers.yml Errors:\nMember names must be unique within a cube. …"`
  - `"Error: Compile errors:\nErrors:\nno_such_member is not defined\n"`
  - `"YAMLException: missed comma between flow collection entries (2:3)…"`
- **Nothing to import.** `CompileError` and `ErrorReporter` aren't exported from the package index ([u-cidx] L1–13). Recognise them by the message prefix, or by deep import, which is an upgrade risk.

#### Getting errors per file and line

The pieces available are:

1. **Syntax errors:** xcube parses each YAML file itself before calling Cube, with js-yaml, the library Cube uses ([u-yaml] L1). That gives file, line and column.
2. **The structured list:** compile with `omitErrors: true`, then read `compilers.compiler['errorsReporter'].getErrors()`. That is a private field ([u-dsc] L162–164, L288–289; [u-er] L221–223). The alternative is parsing the `CompileError` text.
3. **Files for file-less errors:** map the `<name> cube:` prefix to a file through xcube's own name-to-file index. xcube wrote the files, so it has one.
4. **Lines for semantic errors:** Cube gives none. xcube can point at the named cube or member's line from its own YAML parse. That is an inference; none was tested.

#### Keeping the served model untouched

- **Nothing per-compile is shared.** Each `prepareCompiler` builds its own state ([u-prep] L61–136).
- **What is shared:**
  - a module-level LRU that memoises *valid* definitions ([u-cv] L1466, L1489–1495);
  - the process's CPU and memory;
  - a transpile worker pool, created per compile and terminated after it ([u-dsc] L295–301, L542–544).
- **Observed compile cost (spike A):**

  | Where | Model | Default threads | 1 thread | 2 threads | 4 threads |
  |---|---|---|---|---|---|
  | macOS | 1k cubes, 200 views | 3.1 s / 2.7 GB | 6.6 s / 0.73 GB | 4.2 s / 0.93 GB | — |
  | macOS | 3k cubes, 600 views | 7.1 s / 3.6 GB | 16.9 s / 0.88 GB | 12.1 s / 1.5 GB | — |
  | macOS | 6k cubes, 1.2k views | 13.8 s / 5.5 GB | 38.7 s / 1.37 GB | 23.6 s / 1.5 GB | — |
  | Linux container | 3k cubes, 600 views | 10.9 s / 3.3 GB | 22.4 s / 1.0 GB | 13.2 s / 1.0 GB | 9.7 s / 1.8 GB |
  | Linux container | 6k cubes, 1.2k views | 20.9 s / 3.8 GB | 46.7 s / 1.2 GB | 29.1 s / 1.7 GB | 20.2 s / 2.5 GB |

  - Each cell is compile time / peak RSS ([a-cm] L1–9; [a-lc] L2–17).
  - The macOS runs were "on macOS", and the Linux runs used `node:22-bookworm-slim` ([a-readme] L11–12).
  - The default thread count is `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT=0`, which means workerpool's default, "the number of CPU's minus one" ([u-env] L376–378; [u-dsc] L295–301; [workerpool]).
- **Parallel candidates:** five 3k-cube compiles at once took 22.9 s wall and 4.9 GB peak RSS ([a-par5]).

#### What the compile does not check

- **It doesn't connect to any database.** Spike A's compiles ran with none, and its server bench planned `/v1/sql` against `host: 'dummy.invalid'` ([a-sb] L4–5, L31). So a column missing from the table surfaces only when queried.
- UNVERIFIED: which modelling errors appear only at query planning (for example a missing join path between two cubes). No test compiled a model that plans badly.

### 3. Overlays

#### Routing a request to an overlay

- `contextToAppId` returns, say, `xcube_ovl:<id>@<rev>`. `repositoryFactory` for that app id returns the published files with the overlay's changes applied, or a closure subset of them (below).
- Both are documented, and both run in every process ([d-cfg] L58–112).
- `preAggregationsSchema(ctx)` is also resolved once per app id ([d-cfg] L707–717). That is how an overlay gets its own schema.

#### Compiler cache and memory

**The app-id cache:**

- It is an LRU with `max: compilerCacheSize || 250`, `ttl: maxCompilerCacheKeepAlive`, `updateAgeOnGet: updateCompilerCacheKeepAlive`, and `dispose: v => v.dispose()` ([u-srv] L215–221).
- The TTL defaults to none: "keeps data models in memory indefinitely" ([d-cfg] L252–253).
- Stale entries are purged on an interval only when a TTL is set ([u-srv] L238–243).
- The same size number also sizes each `CompilerApi`'s three transpile caches ([u-capi] L161–176; [u-srv] L790).

**Memory per resident full-model overlay** (spike A, 2 transpile threads, macOS). The LRU's 250 entries is not the binding limit; memory is.

| Model | Mode | Heap per overlay | Compile each |
|---|---|---|---|
| 3k cubes | sequential | +96 MB | 10.5–11.1 s |
| 3k cubes | shared transpile caches | +87 MB | 8.8–9.2 s, two outliers at 15–16 s |
| 6k cubes | 5 in parallel | +167 MB | 35.4 s wall |

Sources: [a-seq], [a-seqs], [a-par6s].

**A closure compile is xcube's option, not Cube's.**

- Spike A computed the dependency closure of the queried and changed items: `extends`, `joins`, view `join_path`, and `{cube.member}` references in members, `sql`, `pre_aggregations` and `access_policy` ([a-closure] L20–44).
- It then compiled only that closure: 205–313 ms at 1k cubes and 245–875 ms at 6k cubes.
- The generated SQL was identical to the full model's in 8 of 8 queries across 3 scenarios ([a-cl5]; [a-cl30]).
- UNVERIFIED in general: a closure leaves out cubes that could change the join path Cube chooses in the full graph.

**Retiring an overlay.**

- Deleting its app id needs the protected `compilerCache` ([u-srv] L148).
- `dispose()` swaps the compiled model for a proxy that throws on any property access ([u-capi] L191–202; [u-disp] L5–42). A request still holding that `CompilerApi` then fails, because awaiting the proxy reads `then`. That is an inference from those lines.
- So retire an overlay after in-flight requests have finished, not the moment it is dropped.

#### Isolation from the published model

| Layer | Keyed by | Shared with the published model? | Source |
|---|---|---|---|
| Compiled model, SQL cache, RBAC cache | App id; per compile | No | [u-srv] L533–567; [u-prep] L74 |
| Result cache | `<orchestratorId>#SQL_QUERY_RESULT:` + hash of `[sql, values, preAgg loadSql, invalidate]`. **No data source** | Yes, whenever the SQL text is equal | [u-qc] L266–268, L314, L469–481, L1301–1303 |
| Refresh-key cache | `[sql, values, external, dataSource]` | Only for the same key SQL and data source | [u-qc] L490–498 |
| Query queues | Orchestrator id + data source | Yes; identical keys run once | [u-qc] L665–692 |
| Pre-aggregation tables | Schema + cube name (or `sql_alias`) + rollup name + hash of load SQL. **No data source** | Yes, when name and load SQL are equal. API instances pick by structure version alone | [u-pa] L74–87; [u-pal] L160–187 |
| Building | The worker builds only the app ids of `scheduledRefreshContexts`; API instances never build | Overlay rollups are never built unless something asks | [u-opts] L518–524, L627–630; [u-rs] L258–314 |

**What follows** (inference from these keys):

- **Repointed data sources leak across.** An overlay cube keeps its published name. If it points at a different data source with identical SQL, it shares result-cache entries and rollup tables with the published cube. An example is a workspace copy whose target changed (AC-280, AC-312). The ways to separate them:
  - **An orchestrator id per overlay.** The docs then require a separate `pre_aggregations_schema` ([d-cfg] L356–363). It also brings new drivers and queues, and an orchestrator LRU capped at 100 ([u-ostore] L9–24).
  - **An overlay-only `sql_alias`** on such cubes. It changes the SQL text and the table names.
  - **Stripping `pre_aggregations`** from overlay files.
  - **Adding the data source to `queryCacheKey`.** That static method is on Cube's own `QueryCache`, so it means editing or monkey-patching Cube.
- **Changed rollups fail until built.** An overlay query that matches a changed rollup fails on API instances until something builds it.
  - A jobs POST can build it: its `selector.contexts` entries are merged over the caller's context ([u-gw] L1133–1138).
  - Or the overlay's context can go into `scheduledRefreshContexts`.
- **A per-overlay schema is wiped before use.** The docs warn that "Cube will wipe out the contents of this database schema before use" ([d-cfg] L700–705). That is harmless for throwaway overlay schemas.

#### How a request names its overlay

- **A signed claim.** An RS256 claim naming the overlay reaches `contextToAppId` inside `securityContext`, after Cube has verified the token.
  - This conflicts with AD 12, "Tokens carry groups only, for now" (Open questions).
- **A header.** `extendContext(req)` can read a request header and add it to the request context that `contextToAppId` and `repositoryFactory` receive ([u-gw] L2481–2494; [d-cfg] L1165–1180).
  - The header isn't signed. It relies on AD 10: only wechart's server reaches Cube.
- **A live-overlay check either way.** xcube checks the overlay is live in its registry and throws otherwise, from `contextToAppId` or `queryRewrite`. Without it, a landed or rejected proposal's overlay can still be queried, which is AC-323's failure.
- **Jobs.** A jobs POST's `selector.contexts` overrides the token's context ([u-gw] L1133–1138). So `jobs` belongs on the service credential only.

#### Across 2 or more Cube instances

- **Compilation is per process.** `compilerCache` is a field of each `CubejsServerCore` ([u-srv] L148). So each instance compiles each overlay on its first request for it, and memory multiplies by the number of instances.
- **Overlay content must live in xcube's store.** A push accepted by one instance is otherwise invisible to the next request, which can land on another instance.
- **The revision in the app id** stops an instance serving a revision it knows is outdated. It learns of new ones from NOTIFY (observed 233–407 ms), with a poll as backstop.
- **The Cube Store queue and result cache are shared across instances.** Observed (spike C): a query started through `api1` and polled through both instances ran once in Postgres, and its repeat on both instances was served from cache in 17 ms ([c-t1] L1–10).

### 4. Connections

#### The `driverFactory` contract at 1.7.45

**Signature:**

- `driverFactory(ctx: DriverContext) => BaseDriver | DriverConfig`, sync or async.
- `DriverContext` is `RequestContext` plus `{ dataSource, preAggregations? }`.
- `DriverConfig` is `{ type, ...options }` ([u-types] L82–92, L161–166).
- It is "Called once per data_source for every orchestrator id" ([d-cfg] L475–476).

**Rules the source imposes:**

- **Pick one return type and keep it.** Mixing driver instances and configs throws. A value that is neither throws with `JSON.stringify(val)` in its message, which can put a secret in the error ([u-opts] L94–127).
- **Answer from memory.** With `DriverConfig`, the dialect comes from `type` by calling `driverFactory` **on every dbType lookup** ([u-opts] L185–207). That happens per query ([u-capi] L320–353) and per cube at compile ([u-capi] L296–310).
- **Driver instances lose the per-source dialect.** With `BaseDriver`, the dialect comes from the global `CUBEJS_DB_TYPE` ([u-opts] L196–201).
- **The context is the builder's.** A driver is created through `resolveDriver` with the context of the request that built the orchestrator ([u-srv] L663–670).
  - It is tested before use (L677).
  - A failed creation is cleared, so the next use retries (L685–697).
  - A config holding only `type` gets Cube's computed `maxPoolSize`. A config with more keys is passed through as is ([u-srv] L925–932).
- **Environment defaults leak in.** With `CUBEJS_DATASOURCES` unset, every data source's environment lookups map to the bare `CUBEJS_DB_*` names ([u-env] L106–126). The Postgres driver fills any missing field, TLS included, from them ([u-pg] L123–131).

#### Stock driver lifecycle

- **One driver per orchestrator × data source**, held in the orchestrator's closure ([u-srv] L624–706).
- **Orchestrators are cached** in an LRU of 100 with no TTL, built without options ([u-srv] L132; [u-ostore] L9–24). Removal for any reason runs `release()` ([u-ostore] L14–22).
- **`release()` and `/livez` cover only `seenDataSources`**, plus Cube Store ([u-oapi] L182–193, L242–273; [u-gw] L3065–3078).
  - Stock code calls `addDataSeenSource` once: `'default'`, in the standalone readiness probe ([u-gw] L3053; confirmed at the tag).
  - So a named data source's driver is never released or liveness-tested in stock Cube.
  - Its idle Postgres connections close after 30 s, with a minimum of 0 ([u-pg] L146–161).
- **New in 1.7.45:** concurrent requests for a cold orchestrator id share one build ([u-srv] L134–139, L587–616).
- **Queue concurrency is fixed per data source** when its queue is created ([u-qc] L665–692; [u-pa] L791–796). It comes from `queueOptions`, then the environment, then the driver's default ([u-opts] L231–281).

#### Swapping a connection without a restart

| Option | How | Reached through | Effect |
|---|---|---|---|
| **(a) Stable name, swap the driver behind it** (spike B) | Override `createOrchestratorApi` and hand Cube one delegating driver per name. `driverFactory` returns only `{ type }` | Protected method ([u-srv] L796–805) | Queues, result cache, refresh keys and pre-aggregation tables are untouched. The new driver is built and tested first; a failure leaves the old one. The old driver is released when its in-flight calls and stream handles finish, or after a drain timeout. The wrapper calls `addDataSeenSource` so orchestrator release closes these pools ([b-sw] L10–122, L139–157, L171–197). `check.js` asserts `instanceof`, the `isDriver` check, cancellable promises, stream-handle release and `release()` pass-through ([b-check] L17–47). **Run output not committed.** |
| **(b) A new orchestrator id** | `contextToOrchestratorId` returns, say, `conn@<rev>` | Public config ([d-cfg] L341–365) | New drivers, queues and result-cache prefix, so caches start cold. The old orchestrator is released only on LRU eviction, and then only its seen data sources. The docs require a separate `pre_aggregations_schema` per orchestrator id, so rollups rebuild ([d-cfg] L356–363) |
| **(c) Versioned data-source names** | Publish a model that names `ds_<id>_v<n>` | Public config | Every connection change becomes a model publish and recompile. It breaks stable prefixed names (AC-328). The old driver is never released in stock Cube (above) |

- **Only (a) keeps names stable.** It is also the only one that avoids cold caches and rollup rebuilds. Its risk is its dependence on the protected method's signature and on the driver-proxy semantics that `check.js` asserts.
- **A dbType change needs a recompile under every option.** Dialects are fixed per cube at compile ([u-capi] L296–310): a version bump in Pattern A, a new app id in Pattern B. Spike B's section 5 exercises this ([b-run] L185–197). No output is committed.
- **A host change doesn't rebuild Cube Store rollups.** The structure version excludes connection and data source ([u-pa] L74–87). Rollups built from the old target keep serving until their refresh key turns over, which is an inference. Rebuild them explicitly after a target change.
- **Rollups stored in the source database** (`external: false`) have a table-list cache keyed by data source and schema. It is kept 1 h by default ([u-palc] L88–92, L108–110). Spike B's sections 3c and 3d exercise a host change against it ([b-run] L167–182). No output is committed.

#### Data-source naming

- **Any string is accepted.** `data_source` is validated as any string ([u-cv] L1178).
- **Names appear in queue and pool names:** `SQL_QUERY_<prefix>_<ds>` and `SQL_PRE_AGGREGATIONS_<prefix>_<ds>` ([u-qc] L670; [u-pa] L796).
- **Endings to avoid.** The docs advise against names ending `_db`, `_aws` or `_jdbc`, which the environment-variable parser can misread ([d-mds] L35–37). That applies to environment-declared sources.
- **`default` must exist.** "A `default` data source **must** exist and be configured" ([d-mt] L55–61). Every query resolves `default`'s dbType before its own ([u-capi] L320–322). The root's `default` data source (§P2.6 D) fits this.

#### Decrypting inside xcube

- **Plaintext lives in the driver.** The Postgres driver keeps the config, password included, as `poolConfig` and `this.config` for its whole life ([u-pg] L123–131, L167–172). So decrypted credentials exist in every Cube process that uses the source.
- **Keep secrets out of refresh contexts.** `Refresh Scheduler Run` logs each context's `securityContext` ([u-rs] L281–284).
- **Keep secrets out of `driverFactory`'s return.** Returning `{ type }` alone keeps them off OptsHandler's error path ([u-opts] L119–127).
- **Model code shares the process.** See Gotchas 11.

#### Reporting per instance (AC-161)

- **Cube reports nothing per driver.** `/livez` answers a single health value ([u-gw] L3065–3078).
- **Proposal, not a Cube fact.** Each process's xcube registry writes rows to xcube's store with:
  - instance id, data source and connection revision;
  - state: `live`, `draining`, `failed`, or `none` (not built yet);
  - timestamps and a heartbeat.
- **wechart pulls them** through an xcube admin route. "Every instance uses the new settings" then means: every instance with a fresh heartbeat reports the new revision, with no old driver still draining.
- **Include the refresh worker.** An instance with no driver yet builds one from the registry on first use ([u-srv] L643–706).

### 5. Build events (AC-150)

**The only hook.** The documented `logger(message, params)` ([d-cfg] L1530–1542).

- A custom logger replaces Cube's output unless it also calls `createLogger` ([u-srv] L195–201; `logger-build-events.md`).
- The orchestrator has no event emitter for builds. The only `EventEmitter` is QueryQueue's stream events ([u-qq] L118, L179).
- Cube Store holds a build-status record (`building` / `failure`) for 86,400 s ([u-pa] L163, L384–391).

**The events** (fields verified in the local 1.7.45 source):

| Event | Meaning | Params | Source |
|---|---|---|---|
| `Performing query completed` | The build succeeded | `queueId`, `queueSize`, `duration`, `queryKey`, `queuePrefix`, `requestId`, `timeInQueue`, `metadata`, `preAggregationId`, `newVersionEntry`, `preAggregation`, `addedToQueueTime` | [u-qq] L1005–1018 |
| `Error while querying` | The build failed | The same, plus `error` as a stack string. Logged after the result is stored, or at once for a timeout | [u-qq] L869–883, L1019–1050, L1090–1092 |
| `Orphaned execution result` with `cancellationError` | The build was cancelled | — | [u-qq] L1072–1089 |

**Telling builds from other queries:**

- A build's `queuePrefix` is `SQL_PRE_AGGREGATIONS_<orchestratorId>_<dataSource>` ([u-pa] L796).
- `newVersionEntry` is `{ table_name, structure_version, content_version, last_updated_at, naming_version: 2 }` ([u-pal] L266–272).
- The refresh worker's builds carry `requestId` `scheduler-…` ([u-rs] L263).

**Capture in xcube** (a design that follows from the source):

- **Install it in every process.** The executor of a build can be an API instance: `logger-build-events.md` infers this from the reconcile code.
  - Spike C's API logs showed 2 `"Performing query"` lines on `orders` each while serving a worker-built rollup, with 0 source reads ([c-t6] L9–11).
  - Whether those lines were builds is not shown.
- **Filter first, never throw.** A synchronous logger that filters by message first and never throws; the rules and their reasons are in `logger-build-events.md`.
- **Buffer, then write.** It appends terminal build events to a bounded in-memory buffer. That buffer is flushed in batches into xcube's Postgres table, idempotently on `newVersionEntry` plus event. wechart pulls with a cursor.
- **Crash window.** Events still buffered when a process crashes are lost. That is an inference; the flush interval bounds it.
- **Redaction.** It is on by default in production, and the fields AC-150 needs survive it (`logger-build-events.md`).

### 6. Refresh contexts for one flat model

- **When it runs.** `scheduledRefreshContexts()` is called on **every tick** ([u-srv] L810–848). It defaults to `[null]` ([u-opts] L404). Cube logs "Multitenancy Without ScheduledRefreshContexts" when `contextToAppId` is set without it ([u-opts] L434–443).
- **One context.** Return exactly one, mapping to the published app id.
  - Each context's run compiles, then refreshes every cube's refresh key and every scheduled rollup of that model, then reconciles each data source's queue ([u-rs] L258–336).
  - So a second context mapping to the same app id repeats the same work. That is an inference from those lines.
- **Keep it minimal.** The context is logged ([u-rs] L281–284).
- **Rollups are built without access policies.** `applyRowLevelSecurity` is called only from the gateway ([u-gw] L1481; [u-capi] L493).
- **Leave overlays out** unless their rollups must be built.
- **Scale in one context:**
  - **Concurrency** is `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID` if set. Otherwise it is the **minimum** of all pre-aggregation queues' concurrencies, or 1 on the first run ([u-rs] L232–256, L266–269; [u-srv] L835; [u-env] L281). In a model spanning many data sources, the slowest-configured source sets the worker's parallelism for all.
  - **Refresh keys.** The default refresh key is `every: 10 second` for most databases ([d-cube] L416–419).
    - With `CUBEJS_REFRESH_KEY_LOCAL_TIME=false`, the default ([u-env] L403–405), the worker plans one `getSql` per cube and time zone per tick ([u-rs] L352–393).
    - Spike A measured 25–41, 63–93 and 121–273 ms per `/v1/sql` plan at 1k, 3k and 6k cubes ([a-srv5], [a-srv15], [a-srv30]).
    - Thousands of cubes can therefore exceed the 30 s heartbeat ([u-opts] L575–587). That is an inference; probe it.
    - `true` skips non-`sql` keys ([u-rs] L360–367; [d-env] L1521–1533).

### 7. Where each hook runs, and how it is reached

| Hook | API instance | Refresh worker | How it is reached | Upgrade risk |
|---|---|---|---|---|
| `contextToAppId`, `repositoryFactory`, `schemaVersion` | Every request | Every tick ([u-rs] L287); jobs | Documented config | Low. Docs and source differ on `schemaVersion`'s context |
| `compilerCacheSize`, keep-alive options, `preAggregationsSchema` | Yes | Yes | Documented config | Low |
| `driverFactory` | Queries and dbType lookups; catalog reads; builds it executes from the shared queue | Builds; refresh keys | Documented config | Low |
| Connection-swap wrapper | Yes | Yes | Override of **protected** `createOrchestratorApi` ([u-srv] L796–805) | Medium: `DriverFactoryByDataSource` and the `OrchestratorApi` constructor |
| `logger` | Yes | Yes | Documented config; event names and params are internal | Medium on content |
| `scheduledRefreshContexts`, `scheduledRefreshTimeZones` | Only the undocumented `/cubejs-system/.../security-contexts` route ([u-gw] L639–646) | Every tick | Documented config | Low |
| `extendContext`, `queryRewrite`, `contextToGroups`, `jwt` | Every request | — | Documented config | Low |
| Candidate compile | Wherever xcube's admin runs | — | `prepareCompiler`/`compile`/`CompilerApi` are exported. Structured errors need `omitErrors` plus the **private** `errorsReporter`; `CompileError` isn't exported | High for error extraction |
| Pre-warming a version | Yes | Yes | Public `getCompilerApi` and `getCompilers` | Low |
| Evicting a compiled overlay or version | Yes | Yes | **Protected** field `compilerCache` ([u-srv] L148) | Medium |
| Injecting xcube's options | Yes | Yes | **Protected** `createCoreInstance` or `createServer` ([u-cserver] L84–86; [u-container] L241–243). The package already overrides them ([p-srv] L69–83). The alternative is a `cube.js` that requires xcube | Medium |
| xcube admin, readiness and status routes | Yes, and the worker too, which also runs the HTTP gateway (`configuration-deployment.md` L804; `introspection-api.md` Gotchas) | Yes | **Protected** `createApiGatewayInstance` plus a gateway subclass ([u-srv] L509–517; [p-gw] L60–77) | Medium |
| `allowNodeRequire: false` | Yes | Yes | A `CreateOptions` field ([u-types] L241); **undocumented** | Medium |
| LISTEN client, registry, decryption | Yes | Yes | xcube's own code | — |

- **The worker must run xcube.** Spike C ran it on stock `cubejs/cube:v1.7.45` with a shared `cube.js` ([c-compose] L68–78). For xcube to own the model, connections and logger there, the worker needs xcube's code: the xcube image, or xcube on its `NODE_PATH`.
- **The package pins its Cube version.** It refuses to start on any other `@cubejs-backend/server-core` version ([p-bin] L13–25; [p-pkg] L23–35).

## Gotchas

1. **A bad published model takes every query down.** Cube keeps no last good model ([u-capi] L231–237; observed on 1.7.42). Flip versions only after the candidate compiles. Pattern B also lets an instance keep serving the old version if its own compile fails.
2. **Pattern A blocks requests while it recompiles.** Measured compiles run 2.4–22.5 s at 1k–6k cubes (spike A).
3. **Publishes must be serialized.** The candidate is the current version plus a change, so the commit must fail if the version moved while the candidate compiled. Use compare-and-set or a lock. This is a correctness inference; no test raced two publishes.
4. **Snapshots must be immutable, and version ids must never repeat.** In Pattern A, `dataSchemaFiles` runs after `schemaVersion` was read ([u-capi] L216–240; [u-dsc] L255–256). A flip in between labels newer content with the older version, and the next request recompiles. That is correct only when each id maps to one immutable snapshot.
5. **`CUBEJS_COMPILER_CACHE_SIZE` has two jobs.** It caps app ids, and it sizes each `CompilerApi`'s transpile caches ([u-capi] L161–176; [u-srv] L790). A model split into more files than that thrashes those caches. That is an inference.
6. **Transpile threads trade time for memory, and the variable is undocumented.** The default (CPUs − 1) peaked at 2.7–5.5 GB; 1–2 threads peaked at 0.7–1.7 GB, but took 1.3–3.2 times as long (spike A). `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT` is read at [u-env] L376–378 and appears nowhere in `docs-mintlify` (Grep). Set it per process role.
7. **Result-cache and rollup keys have no data source** (§3 table). Only overlays reuse published cube names, so this bites there. The fix is to separate them by orchestrator id, alias or schema.
8. **A target change doesn't rebuild Cube Store rollups** (§4). Rebuild them after AC-312's "target changed".
9. **`/readyz` is always 200 once `contextToAppId` is set** ([u-gw] L3045–3063). xcube needs a readiness route that fails until it has loaded the model and registry.
10. **Registering data sources as seen also puts them in `/livez`.** It is needed so pools close on release ([u-oapi] L182–193, L242–273). Don't use `/livez` as the liveness probe once any data source can fail.
11. **Model code, credentials and the private key share a process.**
    - **Jinja `env_var`** rendered `CUBEJS_API_SECRET` (observed on 1.7.42, `spike-model-store-and-quick-calcs.md` L96–99).
    - **JS files** run with `require`, since `allowNodeRequire` defaults to true ([u-capi] L146; [u-dsc] L458–478).
    - **`globals.py`** is loaded if present ([u-dsc] L258).
    - **`node:vm` "is not a security mechanism"** ([node-vm]).
    - **What xcube must do, at publish and overlay push alike:**
      - refuse anything but `.yml` and `.yaml`;
      - refuse Jinja syntax (`/{%|%}|{{|}}/`, [u-dsc] L30, L265–277);
      - set `allowNodeRequire: false`;
      - keep the private key out of environment variables.
    - UNVERIFIED: whether YAML expression fields can reach `require` or `process`.
12. **`COMPILE_CONTEXT` captures each app id's first requester** ([d-cfg] L62–66; [u-dsc] L489). Refuse it in published and overlay content.
13. **`driverFactory` rules.** It must do no I/O, must return a consistent type, and must never return a malformed value ([u-opts] L94–127, L185–207).
14. **Set every driver field.** With `CUBEJS_DATASOURCES` unset, environment defaults fill any field left out ([u-env] L106–126; [u-pg] L123–131).
15. **A swapped driver keeps its data source's old queue concurrency.** Concurrency is fixed when the queue is created ([u-qc] L665–692). This is an inference.
16. **The jobs body overrides the token's context** ([u-gw] L1133–1138). With overlays and versions carried in context, `jobs` belongs on the service credential alone.
17. **A flat model enlarges query-path payloads** (spike A, [a-srv5], [a-srv15], [a-srv30]). This bears on §P2.3 S2 (3 s at p95):

    | Model | `/v1/meta`, all cubes | `/v1/meta`, ~10% visible | `/v1/sql` planning | `/v1/sql` response |
    |---|---|---|---|---|
    | 1k cubes | 9.2 MB, 58–61 ms | 2.3 MB | 25–41 ms | 1.8 MB |
    | 3k cubes | 27.7 MB, 212–235 ms | 7.0 MB | 63–93 ms | 5.4 MB |
    | 6k cubes | 55 MB, 470–520 ms | 14 MB | 121–273 ms | 10.9 MB |

    The `/v1/sql` responses are that large because of the `canUseTransformedQuery` field.
18. **Logger rules still apply.** Never throw, never `async`, filter first, don't mutate `params` (`logger-build-events.md`).

**Corrections to sibling docs**

- **`per-folder-models.md`.**
  - Finding 7 says "Old drivers are released only when their orchestrator is evicted". §3 says "the old driver object … stay[s] in memory until the orchestrator is released". Gotcha 9 says "/livez … tests every seen data source of every cached orchestrator … one bad or rotated credential makes the pod DOWN".
  - At 1.7.45 stock, only names passed to `addDataSeenSource` are tested or released. Stock code passes only `'default'`, and only from standalone readiness ([u-gw] L3053; [u-oapi] L182–193, L242–273). So named data sources are neither liveness-tested nor released on eviction or shutdown.
  - These statements become true only if xcube registers its data sources, as spike B does.
  - Its Provenance line ("checkout … on `feat/introspection-package`") is now `spike/xcube-feasibility` at `db087e048a`.
- **`configuration-deployment.md` L761.** "A changed connection takes effect only under a new orchestrator ID or after a restart" holds for configuration alone. A `createOrchestratorApi` override (§4 option a) is a third way.

## Open questions / unverified

1. **How a request names its overlay.** A signed claim conflicts with AD 12 ("groups only, for now"). A header set via `extendContext` is unsigned. This is a requirement question for the user.
2. **Where the candidate compile runs:** in the API instances or in a separate xcube process. Nothing in the requirements says. The memory figures above bear on it.
3. **Overlay pre-aggregations.** Build them, share published tables, or strip them? And full-model overlays or closure overlays? Closure correctness is UNVERIFIED beyond spike A's three scenarios.
4. **Pattern A or B** for version switches (§1).
5. **UNVERIFIED: spike B's behaviour.** Its run output is not committed. That covers:
   - a swap while a query runs on the old host;
   - password rotation;
   - rollups across a host change (3a–3d);
   - a dbType change.
6. **UNVERIFIED: whether API instances execute worker-enqueued builds.** It is inferred in `logger-build-events.md`, and spike C's t6 is ambiguous.
7. **UNVERIFIED: whether YAML expression fields can execute code.** That needs a probe with `allowNodeRequire` both true and false. So does whether unsetting an environment variable hides it from native Jinja `env_var`.
8. **UNVERIFIED: the refresh worker's per-tick cost** for one context of thousands of cubes. That covers refresh-key planning, and how a long build's `Continue wait`, which rethrows ([u-rs] L651–657), affects the rest of the tick.
9. **UNVERIFIED: which modelling errors surface only at query planning,** not at compile.
10. **UNVERIFIED: the AC-161 per-instance design and the build-event store.** Both are proposals, not tested.
11. **Measurement conditions.** Linux compile figures used `node:22-bookworm-slim`, while Cube's image runs Node 24 (`logger-build-events.md` Install). Spike C's propagation times used a tiny model.
12. **Checkout equality.** Cube-owned files were spot-checked against the tag, not diffed. The spike commit's full file list was not read from git.

[u-srv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[u-capi]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
[u-opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[u-ostore]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorStorage.ts
[u-oapi]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[u-rs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[u-types]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/types.ts
[u-sc-index]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/index.ts
[u-gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[u-qc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[u-qq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts
[u-pa]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[u-pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[u-palc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts
[u-prep]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/PrepareCompiler.ts
[u-dsc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[u-er]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
[u-ce]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CompileError.ts
[u-cdict]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeDictionary.ts
[u-cv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[u-ccache]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CompilerCache.ts
[u-cidx]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/index.ts
[u-yaml]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
[u-tw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/transpilers/transpiler_worker.ts
[u-env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[u-disp]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/disposedProxy.ts
[u-frepo]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/FileRepository.ts
[u-pg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[u-cserver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
[u-container]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/container.ts
[d-cfg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[d-env]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
[d-mt]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
[d-mds]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx
[d-cube]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/cube.mdx
[p-srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
[p-gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
[p-bin]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/bin/server.ts
[p-pkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package.json
[a-readme]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/README.md
[a-cm]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/compile-matrix.jsonl
[a-lc]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/linux-compile.jsonl
[a-srv5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x5.json
[a-srv15]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x15.json
[a-srv30]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30.json
[a-sb]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/server-bench.js
[a-seq]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-seq10.json
[a-seqs]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-seq10-shared.json
[a-par5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-par5.json
[a-par6s]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-6000-par5-shared.json
[a-cl5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/closure-200x5.json
[a-cl30]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/closure-200x30.json
[a-closure]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/closure.js
[a-lib]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/lib.js
[b-sw]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/b-connections/switchable.js
[b-check]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/b-connections/check.js
[b-run]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/b-connections/run.js
[c-cubejs]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/conf/cube.js
[c-compose]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/docker-compose.yml
[c-t5js]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/scripts/t5-version.mjs
[c-t5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version.txt
[c-t5w]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version-with-worker.txt
[c-t1]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t1-cubestore.txt
[c-t6]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t6-preagg.txt
[pg-notify]: https://www.postgresql.org/docs/current/sql-notify.html
[pgbouncer]: https://www.pgbouncer.org/features.html
[node-pg]: https://node-postgres.com/apis/client
[node-vm]: https://nodejs.org/api/vm.html
[workerpool]: https://github.com/josdejong/workerpool