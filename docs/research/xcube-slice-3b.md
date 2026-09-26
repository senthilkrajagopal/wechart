---
library: xcube slice 3b and fixes (the user's Cube fork)
packages: [xcube]
version: 'xcube at c0610bb768 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/f9f833d324f1250aaced3108e528e2bc8cee0b69
  - https://github.com/senthilkrajagopal/cube/commit/20bf014bb12e0308eab5f81f0db2ad37038e03c7
  - https://github.com/senthilkrajagopal/cube/commit/c0610bb76848700cb212c70252f020e0b377bf4b
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/README.md
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/src/runtime/runtime.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/src/gateway.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/src/modules/graph.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/src/config.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/src/store/migrations.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/xcube/test/integration/switch.test.ts
  - https://github.com/senthilkrajagopal/cube/blob/c0610bb76848700cb212c70252f020e0b377bf4b/.github/workflows/xcube.yml
  - https://github.com/senthilkrajagopal/cube/actions/runs/36254271546
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/lane.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/modules/graph.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/errors.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/validate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/bootstrap.sql
  - /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/switch.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/modules.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/modules.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/routing.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeToMetaTransformer.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeEvaluator.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregations.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OptsHandler.js (1.7.45)
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-2.md
  - /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-answers-slice-3.md
---
# xcube slice 3b and fixes (xcube at c0610bb768 on Cube v1.7.45)

This doc is the sibling of [x3a] (`docs/research/xcube-slice-3a.md`, which covers 36aedeb6c4). It covers three later commits:
- f9f833d324, "modules (slice 3b)";
- 20bf014bb1, "publish the image to ghcr.io";
- c0610bb768, "titles as Cube makes them; no resolved-file lines on errors".

It also checks each claim in xcube's answers to wechart's eight questions ([in], `docs/inputs/2026-09-26-xcube-answers-slice-3.md`). "Corrections to xcube-slice-3a.md" below lists the statements in [x3a] that no longer hold.

## Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube`, and that ref is `c0610bb76848700cb212c70252f020e0b377bf4b` ([head]).
  - `refs/remotes/fork/feat/xcube` holds the same SHA ([fork-ref]).
  - The reflog's last three entries are the three commits, in order ([reflog] L5-7).
- **What the commits contain** ([c-3b]; [c-ci]; [c-fix]):
  - **f9f833d324** changes 15 files (+1666 −130):
    - README;
    - `src/config.ts`, `src/gateway.ts`, `src/server.ts`;
    - the new `src/modules/graph.ts`;
    - `src/runtime/runtime.ts` (+683 −118) and `src/runtime/settings.ts`;
    - `src/store/migrations.ts` (+21 −0) and `src/store/revisions.ts`;
    - the new `test/integration/modules.test.ts`, `test/unit/modules.test.ts` and `test/unit/routing.test.ts`;
    - one-line changes to `items.test.ts`, `revisions.test.ts` and `config.test.ts`.
  - **20bf014bb1** changes `.github/workflows/xcube.yml` (+46 −2) and `xcube/Dockerfile` (+7 −1).
  - **c0610bb768** changes the README, `package.json` and `package-lock.json`, `src/names/publish.ts` (+4 −2) and `src/runtime/runtime.ts` (+8 −10). It adds `test/integration/switch.test.ts` (+204) and changes `test/unit/names.test.ts` (+24 −1).
- **The working tree.**
  - The files [x3a] found uncommitted (`src/modules/graph.ts`, `test/unit/routing.test.ts`) are committed in f9f833d324 ([c-3b]).
  - I compared the changed passages with the commits' diffs. They match the working tree:
    - the `config.ts`, `settings.ts`, `migrations.ts` and `server.ts` hunks of f9f833d324 ([d-3b]);
    - the `runtime.ts` `itemErrors` and `publish.ts` `titleOf` hunks of c0610bb768 ([d-fix]).
  - Bash wasn't available, so no `git status` was run. Uncommitted edits elsewhere can't be ruled out. Otherwise [x3a]'s working-tree caveat is moot.
- **Line numbers.** Lines cited here are c0610bb768's, read from the working tree.
  - [in] cites f9f833d324 unless it marks c0610bb768. The c0610bb768 diff maps one to the other ([d-fix]):
    - `runtime.ts` is the same up to L1691, and 2 lines shorter after the `itemErrors` hunk (`@@ -1689,19 +1689,17 @@`);
    - `publish.ts` is 2 lines longer from L46 on (`@@ -1,4 +1,5 @@`, `@@ -37,9 +38,10 @@`). So [in]'s `publish.ts:114` is L116 here.
- **Cube.** Cube's behaviour is cited from `xcube/node_modules/@cubejs-backend/*` at 1.7.45. Where noted, it is cited from the fork's own Cube sources (`packages/*`, whose `query-orchestrator` is 1.7.45 ([c-qo-pkg] L5)).
- **Sibling docs.** No sibling doc corrects an xcube 3b claim.
  - `docs/requirements.md` L539-553 and `docs/tasks.md` L6446-6485 already cite this doc and the image digest.
  - Gotchas 3-7 below qualify their line "Modules (3b) change nothing wechart sends" (requirements L552; tasks L6451).

## Summary

**3b: modules.** An items model now compiles in **modules**, so a change recompiles only the modules it touches ([readme] L177-223; [c-3b] message).
- **What wechart sends is unchanged.** Admin requests, query requests and token claims are as in 3a.
- **What xcube does with them:**
  - `/v1/load`, `/v1/sql` and `/v1/dry-run` go to the module holding the query's cubes;
  - `/v1/meta` is merged across modules;
  - jobs are fanned out to the owning modules;
  - the refresh worker runs one context per module ([rt] L815-855, L962-1005; [gw] L90-217).
- **What 3b adds that a client can see:**
  - a `modules` field on `GET …/revision`;
  - a `503 "Cube is busy compiling; try again"` for a query that needs a union of modules;
  - a `400 "queryRewrite added …"` (not reachable with wechart's `cube.js`);
  - two environment variables;
  - a `compilerCacheSize` default of 2000;
  - migration 3 (`revision_modules`, `minReader: 2`) ([rt] L1510-1522, L849, L905-906; [set] L88-91; [cfg] L95; [mig] L105-125).

**c0610bb768: fixes.**
- Folder items' titles now follow Cube's own `titleize` ([pub] L41-45).
- Cube's compile errors name the item with no line or column ([rt] L1692-1704).
- New tests:
  - a files-mode model switching to items with identical SQL and rollup load SQL ([t-switch] L156-166);
  - a folder item's rollup built through the jobs API ([t-switch] L168-203);
  - a golden items-hash vector ([t-names] L552-561).

**20bf014bb1: the image.** CI publishes the image to `ghcr.io/senthilkrajagopal/xcube` for amd64 and arm64 ([ci] L133-172).
- wechart adopts `ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768@sha256:d787e67c23f567437e49e1ad1e3eab1802c143bd1bfab465ded9e9468c5e1ab8`.
- That index carries both the per-commit tag and the moving tag `v1.7.45-feat-xcube` ([ghcr]).

**For wechart (T449/AC-333, T426, T430/AC-336, T448/AC-337, AC-328, AC-329; tasks L6446-6485).**
- With default packing, **today's model is one module.** Every item is a root item (one zone, so nothing is shared), and every reference group is under 50 items. So it is served as one compiled model: no merging, no fan-out, no unions ([graph] L97-114, L147-168; [rt] L1272, L624-626, L722, L745, L996).
- **Module behaviour starts** when any of these holds:
  - a root cube is used by a root item *and* a folder item, or by items in two top-level folders (it becomes shared, so there is a `commons` module);
  - a reference group reaches 50 items;
  - packed groups exceed 300 items ([rt] L1858-1861; [graph] L97-114, L158-168).

## Install

- **No npm dependency in wechart.** As in slices 2 and 3a, the only import is `require('xcube')` in the Cube image's `cube.js` ([x2] "Install"; [w-cube] L17).
- **The image.** Pull by digest:
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768@sha256:d787e67c23f567437e49e1ad1e3eab1802c143bd1bfab465ded9e9468c5e1ab8
  ```
  - Per GitHub's package page, `sha256:d787e67c…` is the version tagged both `v1.7.45-c0610bb768` and `v1.7.45-feat-xcube`, and it is public ([ghcr]; [ghcr-pkg]).
  - Its platform manifests are linux/amd64 `sha256:50aee04b1bdbf37b9e9b4371cfe4a86d464d40d06fe7d6e8cac385d06008a2e9` and linux/arm64 `sha256:087ec829cb88a8cadcd88febf298157b0a65a5889e74ccf4c7fba59f010c3b78` ([ghcr-pkg]).
  - Two more untagged versions (`13c7f630…`, shown as "unknown/unknown", and `9d7b35f6…`) were published at the same time ([ghcr]). UNVERIFIED: that they are buildx attestation manifests. I inferred it from "unknown/unknown" and did not inspect them.
  - An anonymous pull token is issued for the repository ([ghcr-token]).
- **The base** is `cubejs/cube:v1.7.45`, with xcube's compiled `dist/src` copied to `/cube/node_modules/xcube` and `CMD ["node", "/cube/node_modules/xcube/dist/src/bin/server.js"]` ([dockerfile] L12, L28-37).
- **Schema migration 3 (`modules`).** It runs on first start, under the advisory lock as before ([migrate] L47-131).
  - It adds `revision_modules (model, rev, module_id, version char(64) CHECK '^[0-9a-f]{64}$', members jsonb, copies jsonb DEFAULT '[]')`.
  - The primary key is `(model, rev, module_id)`, with an FK to `revisions` `ON DELETE CASCADE`.
  - It has `minReader: 2` ([mig] L105-125).
- **Bootstrap.** Unchanged: `bootstrap.sql` is in none of the three diffs ([c-3b]; [c-ci]; [c-fix]; [boot] L12-16).
- **New environment variables** ([set] L88-91; [readme] L145-146):

| Variable | Default | Meaning |
| --- | --- | --- |
| `XCUBE_MODULE_PACK_MIN` | `50` | Reference groups smaller than this are packed together. `0` packs nothing ([graph] L151) |
| `XCUBE_MODULE_PACK_MAX` | `300` | The most items a packed module holds; at least 1 (`Math.max(1, …)`) |

  - Both must be whole numbers ≥ 0, or start-up throws `<NAME> must be a whole number` ([set] L33-43).
  - `XCUBE_FILE_TYPES` and `XCUBE_MAX_MODELS` are **not** new in 3a or 3b. Both are slice 2's ([x2] L131-132). They appear as context lines in the f9f833d324 `settings.ts` hunk ([d-3b]).

## Init / auth pattern

`cube.js` is unchanged: `require('xcube').config({ modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' }, {...})` ([w-cube] L17-66). `config()` gains two things in f9f833d324 ([cfg] L70, L94-102; [d-3b]):

- **`compilerCacheSize: cube.compilerCacheSize ?? 2000`**, commented "xcube retires compiled models itself; Cube's cache must not evict them first" ([cfg] L94-95).
  - Cube builds its defaults as `{ compilerCacheSize: getEnv('compilerCacheSize'), …, ...opts }`, so the option xcube passes wins over `CUBEJS_COMPILER_CACHE_SIZE` ([c-opts] L299, L308).
  - Only `compilerCacheSize` in `cube.js` changes it.
  - Untested: no test mentions `compilerCacheSize` (grep of `xcube/test`).
- **A `queryRewrite` wrapper**, only when `cube.js` has a `queryRewrite`.
  - It runs the user's rewrite, then `runtime.checkRewritten` ([cfg] L96-102).
  - wechart's `cube.js` has no `queryRewrite` ([w-cube] L17-66).

Admin routes, admin tokens and query tokens are unchanged. `routes.ts` is in none of the three diffs ([c-3b]; [c-fix]).

## API surface we will use

### `GET …/revision`

- **200** `{ model, generation, mode, current, modules?, instance }` ([rt] L1510-1522; [rev] L156-182).
- **`modules: { id, version, cubes, copies }[]`** appears when `mode` is `items` and `current` isn't null ([rt] L1516-1521).
  - `cubes` is the **number** of items the module owns, views included (`members.length`).
  - `copies` is the number of shared cubes it carries copies of.
  - `version` is a 64-hex SHA-256 of the module's files ([rt] L1517-1519, L1869-1874; [mig] L118).
- **An items revision stored without modules** (by a 3a process) answers `modules: []`. By reading: `store.modules` returns no rows, and the empty array is still spread ([rev] L283-290; [rt] L1516-1521).
- **Tested.** Three modules with `[cubes, copies]` of `[1,0], [1,1], [1,1]`, one of them `commons` ([t-mod] L185-187).
- **The README** example for this route still shows neither `mode`, `itemsHash` nor `modules`. Its Modules section does list `modules` ([readme] L222-223, L353-366).

### Publishing under modules (`PUT …/snapshot` with items, `POST …/changesets`, `?dryRun=true`)

- **Request and response shapes are as in [x3a].** `routes.ts` is unchanged ([c-3b]; [c-fix]).
- **What is compiled to validate.**
  - With at most one module, the whole file set is validated, as in 3a.
  - Otherwise each module whose `version` isn't among the base revision's is compiled on its own, plus each module a probe routes to ([rt] L1882-1919).
  - A probe spanning modules is asked of the whole model ([rt] L1905-1919; [t-mod] L215-224).
  - Errors from several modules are deduplicated by path and message ([rt] L1924-1932).
- **What is stored.** Modules are computed at publish from the items' `bindings` and stored with the revision ([rt] L1815, L1835-1843, L1856-1875; [rev] L431-444).
- **Compile errors** (`422 invalid_items` with kind `compile`) carry `folderId`, `name`, `kind` and `message`. They have **no `line` or `column`** since c0610bb768 ([rt] L1692-1704; [d-fix]).
  - Placement: Cube's error groups name a file ([err] L109-145), or a message starts with `<name> cube|view` and `placeByName` finds the resolved file that defines it ([err] L72-89; [val] L68-69). The resolved file `<fullName>.yml` then maps to its item ([rt] L1699-1702).
  - An error placed nowhere has `folderId: null, name: null` ([rt] L1702).
- **`cubeMessage`** is still `String(e)` of Cube's compile error. Its code frames point into xcube's resolved rewrite, not the authored YAML ([val] L67-74; [err] L97-101, L129-136; [rt] L1826-1829).
- **YAML syntax errors** in the authored item still carry the author's 1-based line and column (kind `yaml`) ([items] L192-197).

### `/v1/load`, `/v1/sql`, `/v1/dry-run` (routing)

- **Where the module is chosen.** `extendContext` calls `pinFor`, which reads the query from `req.query.query`, `req.body.query` or `req.params.query` and picks a module ([rt] L256-267, L815-855; [cfg] L86-91).
- **The cubes a query names.** `cubesOfQuery` reads the first segment of each member in:
  - `measures`, `dimensions` and `segments`;
  - `timeDimensions[].dimension`;
  - `filters` (`member`/`dimension`, nested `and`/`or`);
  - `joinHints`;
  - `order` (object or array);
  - member-expression `cubeName`;
  - arrays of queries ([rt] L216-254; [t-route] L36-51).
- **`moduleForQuery`** picks, in this order ([rt] L761-792; [t-route] L53-87):
  1. the owner of the first cube, when it holds every named cube;
  2. else `commons`, when it holds them all;
  3. else the smallest module holding them all;
  4. if no module holds them all but the owners share a cube, the **union** `u:<id>+<id>`;
  5. if the owners share nothing, or a name is unknown, the first cube's owner, "for Cube to refuse the join" or answer the unknown name.
- **Unions.**
  - A union is compiled in the compile lane at `Priority.Import`, inside `extendContext`, so the request waits ([rt] L840-853, L859-882).
  - A lane with `XCUBE_COMPILE_QUEUE` (4) optional waiters, or a wait over `XCUBE_COMPILE_WAIT_MS` (120 s), answers **503** `Cube is busy compiling; try again` with `Retry-After: ceil(compileWaitMs/1000)`, which is **120** by default ([rt] L846-850; [lane] L64-89; [set] L83-84).
  - The catch-up 503 for a newer `wechartRevision` still uses `Retry-After: 2` ([rt] L830-835).
  - Tested: a union query answers 200 and logs one union of two modules ([t-mod] L234-240). The 503 is untested (grep).
- **Headers.** `x-xcube-revision: <model>@<rev>` and `x-xcube-generation` are set as before ([rt] L837-838).

### `/v1/meta` and `/v1/meta?extended=true`

- **When merging applies.** For a context naming no module, on a revision with more than one module, `XcubeApiGateway.meta`/`metaExtended` asks each module in id order and merges ([gw] L117-132; [rt] L707-727).
- **The merge** ([gw] L140-217):
  - Each cube or view appears **once**, from the first module whose answer lists it.
  - `connectedComponent` is renumbered with union-find across modules, from 1, in order of first appearance.
  - `viewGroups` are merged by name, and the first seen wins.
  - `compilerId` = a deterministic UUID derived from the modules' `compilerId`s, when any answer carries one.
  - A non-200 from any module is returned as is.
- **The shape** is Cube's own `{ cubes, viewGroups?, compilerId? }` / `{ cubes }` ([c-gw] L534-567, L579-607). Order and numbering differ from a single compile.
- **Tested.** Names once, `?extended` too, one component for cubes joined through a shared cube, and no whole-model compile ([t-mod] L204-213).
- **`meta.xcube = { folderId, shortName }`** is on every cube and view, root items included ([pub] L115-116).

### Jobs API (`POST /v1/pre-aggregations/jobs`)

- **Fan-out.** Before Cube's route, `fanOutJobs` rewrites a `post` selector's `contexts` ([gw] L90-115; [rt] L729-754):
  - each context naming a model served in modules becomes one context per module owning the named `preAggregations` (the cube part) or `cubes`, or per module when neither is named;
  - each carries `securityContext.xcubeModule = <id>`.
- **Selector ids** are `<cube>.<preAggregationName>`: the full cube name and the pre-aggregation's **name**, never its `sql_alias` ([c-ev] L598-615).
- **Tested** ([t-switch] L168-203):
  - `preAggregations: ['fsales__orders.main']` builds;
  - `get` by token reports `done`, with `table` matching `/fsales__orders_main/`;
  - the stored selector context carries `xcubeModule` matching `/^m[0-9a-f]{10}$/`.
  - That test sets `packMin: 1`. With default packing, a small model is one module and there is no fan-out ([t-switch] L89; [rt] L745).
- **Unit-tested** narrowing: `['commons', 'sales']` for two named pre-aggregations, and `null` when the context already names a module ([t-route] L89-106).

### Refresh worker

- **One context per module**, each pinned to the active revision, when the revision has several modules ([rt] L962-1005).
- **Untested** for modules. The unit store returns no modules ([t-rt] L73-75, L342-364).

### `queryRewrite` (not used by wechart)

- **The rule.** Cubes a rewrite adds that the query's module doesn't hold answer **400** `queryRewrite added <cubes>, which the query's own cubes don't reach; add them through access policies instead` ([rt] L884-908).
- **Exempt:** unions and requests with no module ([rt] L889-892).
- **Unit-tested** ([t-route] L108-126).

### Requests with no query

- **SQL API and GraphQL.** A context no module or union serves gets the whole revision, compiled on first use on the request path (not in the lane), with a warning ([rt] L622-642, L684-705).
- **`DELETE /v1/running-query/:requestId`**, which wechart uses ([w-client] L218-223), needs only Cube's orchestrator. By reading, it compiles nothing ([c-gw] L314-320, L1006-1010; [c-srv] L413-436).

## Modules

- **Grouping** ([graph] L74-221; [rt] L1851-1875):
  - **Zones.** An item's zone is the first folder under `froot` on its path, and `froot` for root items ([rt] L1858-1861).
  - **Shared cubes.** A *cube* (never a view) that items from two or more zones refer to is **shared** ([graph] L97-114).
    - It joins no group. Every module using it compiles a copy of it and of everything it references ([graph] L116-128, L194-203).
    - All shared cubes form the module `commons` ([graph] L212-218).
    - The `shared` override exists in the graph, but `modulesFor` never sets it ([graph] L10-11; [rt] L1862-1867).
  - **Groups.** Everything else is grouped by union-find over `bindings`, so each module is reference-closed ([graph] L130-145; [rt] L1866). A view over two facts pulls them into one group ([t-graph] L37-47).
  - **Packing.** Groups under `packMin` are packed, same zone first, into modules of at most `packMax` ([graph] L147-168; [t-graph] L60-64).
- **Ids** ([graph] L69-72, L170-210; [t-graph] L66-96):
  - `commons` is fixed.
  - A new group takes the previous module id it overlaps most.
  - Otherwise the id is `m` + the first 10 hex characters of SHA-256 of its sorted members.
  - Ids are kept across revisions: a split keeps the id on the larger piece.
- **Versions.**
  - A module's `version` is the content hash of its members' and copies' resolved files ([rt] L1868-1874).
  - Its compiled model's app id is `xcube:<model>:m:<id>:<version[0:12]>`, shared by every revision holding that version. So an unchanged module is not recompiled ([rt] L1235-1260, L1337-1353).
  - Tested: adding a cube compiles 1 of 3 modules ([t-mod] L226-232).
- **Activation.**
  - A new revision's uncompiled modules compile one by one in the lane at `Priority.Activate`. The switch happens once all have compiled ([rt] L1303-1390).
  - The first items revision compiles all its modules, because a files-mode revision's app id is `appIdOf(head)` ([rt] L203-205, L1250-1251).
- **Unions and the whole model.** At most `MAX_UNIONS = 16` per revision; the least recently used goes first ([rt] L213-214, L649-682).
  - Unions and the whole model retire after `XCUBE_RETIRE_GRACE_MS` idle. The check runs every 30 s ([rt] L455, L1431-1451).
- **Memory.** Modules, copies, unions, the whole model and revisions in their grace period are all compiled models.
  - xcube warns above 250 residents ([rt] L1457-1459).
  - Cube's cache is sized 2000 ([cfg] L95).

## Rollback

- **The runner's rule** ([migrate] L86-107). The runner refuses:
  - an applied migration whose checksum differs (L86-93);
  - a schema whose largest `min_reader` exceeds this code's newest version (L95-100).
  
  It **logs and runs on** for versions it doesn't know (L101-107). XCUBE_MIGRATE=false with pending migrations also refuses (L109-114).
  - `start()` treats these refusals as fatal ([rt] L427-429).
  - Unit-tested with a fake version 99, at `min_reader` 1 and 99 ([t-store] L61-67).
- **The 3a image on a 3b schema.**
  - Migration 3 keeps `minReader: 2` ([mig] L108-109). f9f833d324 only appends it and changes migrations 1-2 not at all (+21 −0), so 3a's checksums still match ([c-3b]; [d-3b]). `migrate.ts` is in none of the three diffs.
  - So a 3a process logs "the schema has migrations newer than this xcube; running on" and runs. This is by reading: I did not reproduce the fork session's run.
  - A 3a process writes no `revision_modules` rows. Its retention deletes old `revisions`, which cascades to `revision_modules` ([mig] L122; [x3a] "Items mode").
  - A 3b process serves a revision without modules whole, as `all` ([rt] L1224, L1250-1251), until it publishes again.
- **The slice-2 image** refuses any schema at version 2 or later: `needs xcube schema version 2 or later to read it; this is 1` ([migrate] L95-100; [mig] L67-72, whose comment explains that slice 2's retention would prune authored item contents).
- **The ways back to files mode or slice 2:**
  1. **Drop and re-import.** Stop Cube, run `DROP SCHEMA xcube CASCADE`, and re-run `bootstrap.sql`, whose `CREATE SCHEMA IF NOT EXISTS xcube AUTHORIZATION xcube` recreates it empty ([boot] L16).
     - The model comes back with a new `generation` (`DEFAULT gen_random_uuid()`, [mig] L24).
     - wechart's slice-2 sync sends its file set at start, after each publish and on a 60 s reconcile ([w-snap] L11-15).
     - Tokens naming a revision the new generation doesn't have are answered from the current one ([rt] L921-926).
  2. **Restore a `pg_dump`** of the `xcube` schema taken before the first 3a start. UNVERIFIED: by reasoning only, not tested.
  - **No way back in place.** Files imports on an items model are `409 mode` ([rt] L1634-1637; [rev] L357-359).

## The c0610bb768 fixes and tests

- **Titles** ([pub] L41-45; [d-fix]).
  - `titleOf` is now `inflection.titleize(inflection.underscore(camelCase(name, { pascalCase: true })))` with `Id(s)` → `ID(s)`. That is Cube's `titleize` step for step ([c-meta] L16-20; [c-meta-ts] L181-186).
  - `camelcase` and `inflection` are new `peerDependencies`/`devDependencies` ([pkg] L32-33, L62, L64).
  - In the dev tree both resolve to the single copies Cube's schema-compiler uses: camelcase 6.3.0 and inflection 1.13.4, with no nested copies ([camel]; [infl]; glob of `schema-compiler/node_modules`).
  - **Tested** against Cube's compiled titles for `orders order_items sales_2023 q3_sales user_id user_ids a2b_c v1 x_2_y id kpi_2023_q4` ([t-names] L541-550).
  - Tracing the libraries confirms [in]'s table. camelcase upper-cases after digits, and inflection's `underscore` puts `_` before every capital ([camel] L11, L48-54, L104-108; [infl] L580, L804-817, L903-928):
    - `sales_2023` → "Sales2023";
    - `kpi_2023_q4` → "Kpi2023 Q4";
    - `x_2_y` → "X2 Y";
    - `a2b_c` → "A2 B C".
  - Only folder items get an xcube title ([pub] L89-94).
- **Compile errors without line or column** ([rt] L1692-1704; [d-fix]). YAML errors keep the author's lines ([items] L192-197).
  - No test asserts the absence. `items.test.ts` L219 uses `toMatchObject` (grep).
- **`switch.test.ts`** ([t-switch]).
  - **L147-154.** A files-mode model serves `cubes/orders.yml`, whose rollup is partitioned by month (L29-50).
  - **L156-166.** The first items snapshot, with the root item `orders`, answers 201. `/v1/sql` then gives identical `tableName`, `loadSql`, `indexesSql` and `invalidateKeyQueries` (L140-142, L164) and identical `sql` (L165).
  - **L168-203.** Covered under the jobs API above.
  - **CI.** It ran in CI, where `XCUBE_TEST_DATABASE_URL` is set (L21-22; [ci] L75-81). The run for c0610bb768 concluded success ([run-fix]). Per-test output was not viewed.
- **The golden items-hash vector** ([t-names] L552-561; [readme] L329-335).
  - `[{folderId:'froot',name:'customers',kind:'cube',yaml:'cubes:\n  - name: customers\n'}, {folderId:'fsales',name:'orders',kind:'cube',yaml:'cubes:\n  - name: orders\n'}]` hashes to `49ef16c81790839fe68a0306e4942506ba81c09e060c18c32341864ff0ffeee4`, in either input order.
  - The function is unchanged ([pub] L314-324).
  - I did not compute the hash myself. The test asserts it, and CI passed ([run-fix]).
- **`compilerCacheSize: 2000`** is from f9f833d324, not c0610bb768 ([d-3b]; [cfg] L94-95).

## CI image publishing (20bf014bb1)

- **Registry and tags** ([ci] L133-144):
  - `ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/xcube`;
  - tags `v<cube>-<first 10 of GITHUB_SHA>` and `v<cube>-feat-xcube`, where `<cube>` is `peerDependencies['@cubejs-backend/server-core']`, which is `1.7.45` ([pkg] L29).
- **When it publishes.** Only on a `push` to `refs/heads/feat/xcube` ([ci] L135), and only after:
  - job `test` (typecheck and `npm test` with the database suites);
  - the image job's boot and `serving.sh` checks ([ci] L85-132).
  
  The workflow triggers only on changes under `xcube/**` or to itself ([ci] L9-18). Pull requests and `workflow_dispatch` build but don't publish.
- **Platforms.** `linux/amd64,linux/arm64` via `docker/build-push-action@v7` ([ci] L152-160). The TypeScript build stage runs once on `$BUILDPLATFORM` ([dockerfile] L14-16). OCI labels name the source repository ([dockerfile] L30-32).
- **Where the digest is recorded.**
  - The step "Name what was published" writes `Published <digest>, tagged:` and the tags to the run's step summary ([ci] L161-172).
  - I could not view the summary text. The run page as fetched showed jobs and artifacts only ([run-fix]).
  - The digest above is from the package page ([ghcr]).
- **Runs.** All three concluded success ([run-3b]; [run-ci]; [run-fix]; [run-fix-jobs]):
  - f9f833d324: run 36252847129, 15:42-15:46Z. It predates the publish step, so there is no image.
  - 20bf014bb1: run 36253848833, 15:59-16:04Z. It published `v1.7.45-20bf014bb1`, index `sha256:444601095e8b…`, without the c0610bb768 fixes ([ghcr]).
  - c0610bb768: run 36254271546, 16:06-16:11Z. Every step succeeded, including "Publish, for amd64 and arm64".

## What a wechart client must change or watch (36aedeb6c4 → c0610bb768)

1. **Image reference.** Use the digest above. `v1.7.45-feat-xcube` moves with every passing push ([ci] L142).
2. **`GET …/revision`** gains `modules`. It is additive, and `cubes` is a count of owned items ([rt] L1516-1521).
3. **`422` compile errors** have no `line`/`column`. Don't derive positions from `cubeMessage` either (API surface above).
4. **Folder-item titles** follow Cube's rules. Items published by an earlier image keep their old titles until they are republished: `publish` returns kept items with their stored resolved YAML ([pub] L273-280, L292-296).
5. **Cross-module queries** can wait for a union compile inside the request, up to `XCUBE_COMPILE_WAIT_MS` (120 s), or answer `503` with `Retry-After: 120` ([rt] L840-853; [lane] L64-89).
   - wechart's Cube client has at least one 5 s timeout, `ASK_TIMEOUT_MS` ([w-client] L391-392).
   - Which calls could hit a union is UNVERIFIED.
6. **`/v1/meta`.** Cube order and `connectedComponent` numbers may differ from a single compile. `compilerId` is xcube-derived ([gw] L160-215).
7. **Jobs.** More tokens (per module). The stored context shows `xcubeModule`. Selectors stay `<fullCube>.<preAggregationName>` ([gw] L104-115; [c-ev] L600-615).
8. **Environment.**
   - `XCUBE_MODULE_PACK_MIN`/`_MAX` are new ([set] L88-91).
   - `CUBEJS_COMPILER_CACHE_SIZE` is overridden by xcube's 2000 unless `cube.js` sets `compilerCacheSize` ([cfg] L95; [c-opts] L299, L308).
9. **Limits.** Unchanged: `routes.ts` and `snapshot.ts` are in none of the three diffs ([c-3b]; [c-fix]).

## Corrections to xcube-slice-3a.md

| [x3a] statement | Now |
| --- | --- |
| Provenance L33-53, Gotcha 1 (L395), Install L84-85, Open question 2 (L430): the working tree carries uncommitted 3b; build from the commit | Moot. HEAD and the fork ref are c0610bb768, 3b is committed, and wechart pulls the published image by digest (Provenance; Install) |
| Install L86: "CI builds and boots the image but doesn't publish it" | CI publishes to ghcr.io for amd64 and arm64 from 20bf014bb1 on ([ci] L133-172) |
| Install L95: "No new environment variables" | Still true of 3a. 3b adds `XCUBE_MODULE_PACK_MIN`/`_MAX` ([set] L88-91) |
| Summary L63 and L354: config.ts, gateway.ts and the jobs and refresh contexts are unchanged | True of 3a. 3b changes `config.ts` (cache size, `queryRewrite`), `gateway.ts` (meta merge, jobs fan-out), `server.ts` and refresh contexts ([c-3b]) |
| Summary L62, L349-350: the whole model compiles as one file set | 3b: modules; the whole model only for no-module contexts and spanning probes ([rt] L684-705, L1905-1919) |
| L310 and Open question 3: `titleOf` is `inflection.titleize(name)` + `Id`→`ID`, and may differ from Cube | Fixed: Cube's own steps, tested ([pub] L41-45; [t-names] L541-550) |
| L182 and Gotcha 10 (L414-416): compile errors carry line and column in the resolved file | No line or column since c0610bb768 ([rt] L1692-1704). Placement also uses `placeByName` on messages that start with a cube or view name ([err] L72-89; [val] L69), which L182 did not mention |
| L210: the `GET …/revision` shape | Plus `modules` ([rt] L1516-1521) |
| L230 and L379, Open questions 5 and 7: no test switches a model holding files revisions; rollup versions across the switch not observed | Tested in [t-switch] L147-166 (identical `tableName`, `loadSql`, `indexesSql`, `invalidateKeyQueries`, SQL) |
| L355 and Open question 6: jobs selectors for folder items untested | Tested in [t-switch] L168-203 |
| L305, L387 and Open question 8: no golden vector | [t-names] L552-561; [readme] L329-335 |
| Open question 4: the rollup-stem budget unverified | Consistent by reading: 25 + 12 + 26 = 63 ([pub] L19-20; [c-prl] L605-624; [c-pa-ts] L882-888; [w-pn] L151, L189). Still not run with a minute partition |
| Open question 9 and input rows 5 and 44: 3b not in the commit | Now committed. "Transparent" is partly true (Gotchas 3-7) |

Everything else in [x3a] about names, resolution, bindings, the items hash, removal, aliases and admin routes still holds. `items.ts`, `rewrite.ts`, `expr.ts`, `routes.ts` and `snapshot.ts` are in none of the three diffs, and `publish.ts` changed only in `titleOf` ([c-3b]; [c-fix]; [d-fix]).

## Gotchas

1. **Pin the digest.** `v1.7.45-feat-xcube` moves. `v1.7.45-20bf014bb1` is the same code without the title and error fixes ([ghcr]; [ci] L142).
2. **Titles published by an earlier image persist** until each item is republished (What a client must watch, 4). This only matters for a database an earlier 3a image has published into.
3. **A union wait sits inside the request.** It blocks up to 120 s, and a full lane answers `503` with `Retry-After: 120`. Publishes' validations (`Priority.Import`) compete for the same 4 waiting slots, and activations go ahead of both ([rt] L869; [lane] L64-89).
4. **`xcubeModule` in a security context is honoured.**
   - It picks the module for queries and `/v1/meta`, and stops fan-out for jobs ([rt] L627, L722-723, L745, L996).
   - wechart's preview strips only `wechart…` and token claims ([w-client] L398-414), so a previewed context can carry `xcubeModule`. Previews are Super-Admin-only when security is on ([w-server] L309-316).
   - Access policies still apply per cube. The effect is a wrong or partial answer, not a policy bypass. That is by reading; no test.
   - Stripping `xcube…` keys from previewed contexts closes it.
5. **Array (blending) queries across modules that share nothing go to the first cube's module.** The code comment says "the whole model" ([rt] L756-760 vs L775-781; [t-route] L78-81 covers a single query).
   - A grep of `packages/` found no array query sent by wechart.
   - `compareDateRange` expands inside Cube, after routing, over the same cubes ([w-server] L532-548).
6. **Shared by accident.** A root cube referenced by a root item and by any folder item is shared (zones `froot` and the folder's), so `commons` and copies appear ([rt] L1858-1861; [graph] L97-114).
7. **Merged `/v1/meta`.**
   - `viewGroups` are first-wins by name ([gw] L208-212). A group whose views span modules may list only one module's views. By reading; untested.
   - Don't key anything on `connectedComponent` numbers or cube order.
8. **`CUBEJS_COMPILER_CACHE_SIZE` has no effect** under xcube's `config()`. Set `compilerCacheSize` in `cube.js` instead ([cfg] L95; [c-opts] L299, L308).
9. **The switch still changes admin-visible state:**
   - `mode`;
   - `contentHash`, over resolved `<name>.yml` files, not `cubes/<name>.yml`;
   - `itemsHash`;
   - `files`;
   - `modules`.
   
   A slice-2 reconcile would never match. Stop it at the switch, as [x3a] Gotcha 4 says ([t-switch] L149, L160; [pub] L310-312).
10. **"Nothing is rebuilt" is inferred.**
    - Cube's structure version hashes `structureVersionLoadSql || loadSql`, `indexesSql`, `streamOffset` and `outputColumnTypes` ([c-pa] L64-76). The test compares `loadSql` and `indexesSql` but not the other two.
    - It uses an in-source DuckDB rollup (`external: false`), not Cube Store ([t-switch] L43-49).
11. **Refresh with shared cubes.** A shared cube's rollups appear in the refresh context of `commons` and of every module that copies it ([rt] L996-1003; [graph] L194-203).
    - Cube's orchestrator is shared (`contextToOrchestratorId` defaults to `'STANDALONE'`, [c-srv] L131).
    - UNVERIFIED: whether duplicate builds are deduplicated.
12. **The SQL API and GraphQL compile the whole model on the request path** ([rt] L684-705). wechart uses neither ([w-client] L82-223).

## Open questions / unverified

1. **UNVERIFIED: the 3a image running on a 3b schema.** It is established by reading and by the runner's unit test ([migrate] L95-107; [t-store] L61-67), not by running 36aedeb6c4's image. [in] L66 reports a run I could not reproduce (read-only).
2. **UNVERIFIED: the `pg_dump` way back.** Not tested.
3. **UNVERIFIED: the jobs table name.** [in] L139's `prod_pre_aggregations.fsales__orders_main20260101_…`: the test asserts only `/fsales__orders_main/` ([t-switch] L173, L199).
   - `prod_pre_aggregations` is Cube's non-dev default ([c-opts] L300-303).
   - `20260101` is the month partition suffix by Cube's rule ([c-prl] L605-624). Not observed.
4. **UNVERIFIED: titles in the image.** In the image, xcube's `camelcase`/`inflection` resolve from `/cube/node_modules`. Whether that is the copy Cube's schema-compiler uses there was not checked. The CI image checks don't look at titles ([dockerfile] L34-35; [ci] L115-132).
5. **UNVERIFIED: the content of the CI step summary.** The digest was taken from the package page ([ghcr]).
6. **UNVERIFIED (design intent):** overlays (slice 5), the slice-4 folder check and the slice-4 admin meta route.
   - No overlay code exists (grep of `xcube/src` for "overlay": 0).
   - No admin meta route exists ([routes] L247-377).
   - The plan doc is not in the fork.
7. **UNVERIFIED: which wechart calls could meet a union compile,** and whether their timeouts (e.g. [w-client] L391-392) allow it.
8. **Untested in the fork:**
   - the 503 busy path;
   - the `compilerCacheSize` default;
   - merged `compilerId` and `viewGroups`;
   - per-module refresh contexts;
   - the `queryRewrite` wrapper end to end (only `checkRewritten` is unit-tested);
   - the absence of `line` on compile errors (grep of `xcube/test`).
9. **For the spec (not decided here):** whether to strip `xcube…` claims from previewed contexts (Gotcha 4), and wechart's timeout and retry policy for a `503` with `Retry-After: 120` (Gotcha 3).

## Input claims checked

[in] is `docs/inputs/2026-09-26-xcube-answers-slice-3.md`, cited by line.

| # | Claim ([in] line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | CI publishes public amd64+arm64 images, `:v1.7.45-<commit>` per passing push plus the moving `:v1.7.45-feat-xcube` (L9-11) | Verified | [ci] L133-160; [ghcr]; [ghcr-pkg]. Only pushes to `feat/xcube` touching `xcube/**` or the workflow; the commit part is 10 characters |
| 2 | Pull by digest; the digest is in each run's summary (L13) | Partly | The workflow writes it ([ci] L161-172); the summary was not viewed. `d787e67c…` is confirmed on the package page ([ghcr]) |
| 3 | Folder id `^f[a-z0-9]{1,40}$` (`items.ts:6`), root `froot` (`:8`), one root, known parents, no cycle (`FolderTree.check`, `:110`) (L20-22) | Verified | [items] L6, L8, L110-147. It also refuses bad ids and duplicates |
| 4 | Full names use the xcube id (`fullNameOf`, `:62`); only `folderId` and short names are read (L23-26) | Verified | [items] L25-28, L62-64; [mig] L78-83 |
| 5 | Ids stable, unique, never reused; a reused id re-points names (L27-30) | Verified (consequence) | Follows from `<folderId>__<name>` ([items] L62-64). The rule is wechart's to keep |
| 6 | Encoding suggestions; stripping not injective (L31-34) | Verified | `f` + 32 or 24 hex fits 2-41 characters ([items] L6). Lower-case only |
| 7 | Overlays not built; slice-5 design (L38-43) | Partly | None built (grep). The design is UNVERIFIED |
| 8 | Keep workspaces out of the tree; everything published is served and listed in `/v1/meta` (L44-46) | Verified by reading | Every item → files → modules → meta ([rt] L1815-1843; [gw] L117-217). Slice 4 is UNVERIFIED |
| 9 | Exactly one cube or view per item (`items.ts:172`, `:205`, `:212`); never splits (L50) | Verified | [items] L172-213 |
| 10 | Splitting when sending works if each item is self-contained (L51-53) | Verified by reading | Each item is parsed alone ([items] L172-236; [pub] L235-243) |
| 11 | YAML errors carry authored lines (`items.ts:194-196`) (L55) | Verified | [items] L192-197 |
| 12 | Compile errors placed by the named resolved file or the leading cube/view name (`placeByName`; `itemErrors`, `runtime.ts:1693`) (L56) | Verified | [err] L72-89; [val] L68-69; [rt] L1698-1704. L1693 at f9f833d324 ([d-fix]) |
| 13 | At f9f833d324 such errors could carry resolved-file line and column (L57) | Verified | Removed lines in [d-fix] |
| 14 | Fixed in c0610bb768 (`runtime.ts:1698-1702`): item and message, no line or column (L58) | Verified | [rt] L1692-1704. `cubeMessage` still holds Cube's raw text with resolved-file frames |
| 15 | 3a runs on a 3b schema; migration 3 `minReader: 2` (`migrations.ts:106-109`); runner refuses only when `min_reader` exceeds its newest (`migrate.ts:96`) and warns for unknown versions (`:103`) (L63-65) | Verified by reading | [mig] L105-109; [migrate] L86-107. It also refuses on a checksum mismatch, which can't occur here (+21 −0) |
| 16 | "Verified by running" 3a's migrations on a version-3 schema (L66) | UNVERIFIED here | Not reproduced. The code path and [t-store] L61-67 agree |
| 17 | 3a serves items revisions whole; 3b serves a revision 3a stored whole until it publishes again (L67) | Verified by reading | [rt] L1224, L1250-1251; [mig] L122 (cascade) |
| 18 | Slice 2 refuses version ≥ 2; message; migration 2's `minReader` rationale (`migrations.ts:68-72`) (L68-70) | Verified | [migrate] L95-100; [mig] L67-72 |
| 19 | Drop, re-bootstrap, slice-2 re-import at start or reconcile, new generation (L72-76) | Verified by reading | [boot] L16; [mig] L24; [w-snap] L11-15; [rt] L921-926 |
| 20 | Restore a pre-3a `pg_dump` (L77) | UNVERIFIED | Reasoning only |
| 21 | No way back in place: `409 mode` (L78) | Verified | [rt] L1634-1637; [rev] L357-359 |
| 22 | No xcube field-list route; `/v1/meta` is the list; slice-4 route is intent (L82-83) | Verified; intent UNVERIFIED | [routes] L247-377 |
| 23 | `/v1/meta` merged over every module (`gateway.ts:118-131`, `runtime.ts:711`, `gateway.ts:140-205`): each cube once, components renumbered, derived `compilerId` (L84-89) | Verified | [gw] L117-217; [rt] L707-727; [t-mod] L204-213. Also: `viewGroups` first-wins; order differs |
| 24 | `meta.xcube` on every cube and view (`publish.ts:114`) (L90) | Verified | [pub] L115-116 (L114 at f9f833d324) |
| 25 | No groups at 3b: no folder check, no xcube policy; no authored policy means open (L91-94) | Verified by reading | [pub] L84-117 adds no policy; "no policy means open" per [w-gp] L283. Slice 4 is UNVERIFIED |
| 26 | Revision headers on every response, `/v1/meta` included (`runtime.ts:837-838`) (L96) | Verified | [rt] L837-838, set in `extendContext` for every request ([cfg] L86-91) |
| 27 | Every change to items or resolution makes a new revision; a folder-only push doesn't (L97-98) | Verified | [rt] L1776-1777; [rev] L221-229, L362-373 |
| 28 | Switch tested (`switch.test.ts:156-166`, `:164`): name, SQL, `tableName`, `loadSql`, `indexesSql`, `invalidateKeyQueries` identical (L102-106) | Verified | [t-switch] L156-166 |
| 29 | "The structure version … is the same, and nothing is rebuilt" (L106) | Partly | Inferred. The structure version also hashes `structureVersionLoadSql`, `streamOffset` and `outputColumnTypes`, which are not compared ([c-pa] L64-76); in-source DuckDB only |
| 30 | "The only visible change is `meta.xcube` in `/v1/meta`" (L107) | Partly | True of Cube's answers by reading (no file names in meta, [c-meta] grep). The admin API's `mode`, `contentHash`, `files`, `itemsHash` and `modules` change, and the revision number advances |
| 31 | During the switch: compile in background, switch when all compiled (`runtime.ts:1309-1390`); first items revision compiles all modules (L111) | Verified | [rt] L1303-1390, L203-205, L1257 |
| 32 | In-flight pins kept for the grace period (`:610`, `:1379`; 5 minutes); newer-revision requests wait 10 s or `503` + `Retry-After`; refresh one context per module (`:967`) (L112-114) | Verified | [rt] L609-620, L1377-1380, L910-960, L830-835, L962-1005; [set] L76, L85 |
| 33 | Titles: old `titleOf` differs for digit words; table values (L119-127) | Verified | [x3a] L310; [camel]; [infl]; [c-meta] L16-20 |
| 34 | Fixed (`publish.ts:42`) with Cube's steps, tested (`names.test.ts:541`); only folder items get an xcube title (L128-130) | Verified | [pub] L41-45, L89-94; [t-names] L541-550 |
| 35 | Rollup table name and 25 + 12 + 26 = 63; `PostgresDriver` `createTable` counts `schema.`; Cube Store has no limit; root stems unchanged (L132-136) | Verified by reading | [c-pa-ts] L882-888; [c-prl] L605-624; [c-pg] L444-450; [pub] L19-20, L155-158. A Postgres source also stages external rollups under the same name ([w-pn] L164), and the table part fits there too |
| 36 | Jobs for folder items tested (`switch.test.ts:168-203`); selector uses full cube name and pre-aggregation name (L138-140) | Verified | [t-switch] L168-203; [c-ev] L598-615. The test's pre-aggregation has no alias, so "not its alias" is by reading |
| 37 | `prod_pre_aggregations.fsales__orders_main20260101_…` (L139) | Partly | Only `/fsales__orders_main/` is asserted (Open question 3) |
| 38 | Contexts sent to the owning module (`gateway.ts:91-116`, `runtime.ts:734`); `xcubeModule` stored (`:202`); `get` works (L141) | Verified | [gw] L90-115; [rt] L729-754; [t-switch] L189-202. The test uses `packMin: 1` |
| 39 | Golden vector (`names.test.ts:559`) and canonical form (L143-152) | Verified | [t-names] L552-561; [pub] L314-324; [readme] L329-335. CI passed ([run-fix]) |
| 40 | `GET …/revision` adds `modules: [{ id, version, cubes, copies }]` (`runtime.ts:1510-1519`), additive (L156) | Verified | [rt] L1510-1522. `cubes`/`copies` are counts; `[]` for revisions without modules |
| 41 | `503` "Cube is busy compiling" when a spanning query's union can't enter the queue (`runtime.ts:849`); unions only for modules sharing a cube, ≤ 16, retired when idle (L158) | Partly | Also after a 120 s wait. `Retry-After` is `compileWaitMs/1000` (120), and the request blocks meanwhile ([lane] L64-89; [rt] L213-214, L775-781, L1431-1440). Untested |
| 42 | `400` "queryRewrite added …" (`runtime.ts:906`, `config.ts:97`); wechart has no `queryRewrite` (L159) | Verified | [rt] L884-908; [cfg] L96-102; [w-cube] L17-66; [t-route] L108-126 |
| 43 | New variables `XCUBE_MODULE_PACK_MIN` (50) and `_MAX` (300) (`settings.ts:89-90`) (L160) | Verified | [set] L88-91 |
| 44 | "3a added `XCUBE_FILE_TYPES` and `XCUBE_MAX_MODELS`" (L161) | **Wrong** | Both are slice 2's ([x2] L131-132). `settings.ts` is not in the 3a diff ([x3a] L63) |
| 45 | `config()` sets `compilerCacheSize` 2000 unless `cube.js` sets it (`config.ts:95`) (L162) | Verified | [cfg] L94-95. It also overrides `CUBEJS_COMPILER_CACHE_SIZE` ([c-opts] L299, L308) |
| 46 | Migration 3 adds `revision_modules` (L163) | Verified | [mig] L105-125 |
| 47 | No request or response shape changes for `/v1/load`, `/v1/sql`, `/v1/dry-run`, `/v1/meta` or the jobs API (L164) | Partly | Keys unchanged. New 503 and 400 answers; merged meta order, numbering and `compilerId`; more job tokens with `xcubeModule` in stored contexts (Gotchas 3-7) |
| 48 | SQL API and GraphQL answered from the whole model, compiled on first use (L165) | Verified | [rt] L684-705 |
| 49 | c0610bb768 adds the title and error fixes (L166-168) | Verified | [d-fix]. It also adds `switch.test.ts` and the golden vector ([c-fix]) |

[head]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (c0610bb76848700cb212c70252f020e0b377bf4b)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[c-3b]: https://api.github.com/repos/senthilkrajagopal/cube/commits/f9f833d324f1250aaced3108e528e2bc8cee0b69
[c-ci]: https://api.github.com/repos/senthilkrajagopal/cube/commits/20bf014bb12e0308eab5f81f0db2ad37038e03c7
[c-fix]: https://api.github.com/repos/senthilkrajagopal/cube/commits/c0610bb76848700cb212c70252f020e0b377bf4b
[d-3b]: https://github.com/senthilkrajagopal/cube/commit/f9f833d324f1250aaced3108e528e2bc8cee0b69.diff
[d-fix]: https://github.com/senthilkrajagopal/cube/commit/c0610bb76848700cb212c70252f020e0b377bf4b.diff
[run-3b]: https://github.com/senthilkrajagopal/cube/actions/runs/36252847129
[run-ci]: https://github.com/senthilkrajagopal/cube/actions/runs/36253848833
[run-fix]: https://github.com/senthilkrajagopal/cube/actions/runs/36254271546
[run-fix-jobs]: https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36254271546/jobs
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions
[ghcr-pkg]: https://github.com/users/senthilkrajagopal/packages/container/package/xcube
[ghcr-token]: https://ghcr.io/token?scope=repository:senthilkrajagopal/xcube:pull
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
[lane]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/lane.ts
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
[graph]: /Users/srajagopal/Work/bi/cube/xcube/src/modules/graph.ts
[gw]: /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
[cfg]: /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
[srv]: /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
[mig]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
[rev]: /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
[err]: /Users/srajagopal/Work/bi/cube/xcube/src/model/errors.ts
[val]: /Users/srajagopal/Work/bi/cube/xcube/src/model/validate.ts
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
[boot]: /Users/srajagopal/Work/bi/cube/xcube/bootstrap.sql
[readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md
[pkg]: /Users/srajagopal/Work/bi/cube/xcube/package.json
[dockerfile]: /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
[ci]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[t-switch]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/switch.test.ts
[t-mod]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/modules.test.ts
[t-graph]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/modules.test.ts
[t-route]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/routing.test.ts
[t-names]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
[t-store]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/store.test.ts
[t-rt]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/runtime.test.ts
[c-meta]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeToMetaTransformer.js
[c-meta-ts]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[c-ev]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeEvaluator.js
[c-pa]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregations.js
[c-pa-ts]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[c-prl]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts
[c-qo-pkg]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/package.json
[c-pg]: /Users/srajagopal/Work/bi/cube/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[c-gw]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js
[c-opts]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OptsHandler.js
[c-srv]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js
[camel]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/camelcase/index.js (6.3.0)
[infl]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/inflection/lib/inflection.js (1.13.4)
[in]: /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-answers-slice-3.md
[x3a]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
[x2]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-2.md
[w-pn]: /Users/srajagopal/Work/wechart/docs/research/cube/prefixed-names.md
[w-gp]: /Users/srajagopal/Work/wechart/docs/research/cube/generated-policies.md
[w-cube]: /Users/srajagopal/Work/wechart/infra/cube/cube.js
[w-snap]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/snapshot.ts
[w-client]: /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
[w-server]: /Users/srajagopal/Work/wechart/packages/api/src/server.ts
