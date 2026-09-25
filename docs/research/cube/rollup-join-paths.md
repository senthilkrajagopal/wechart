---
library: Cube rollup join paths
packages: []
version: 1.7.45
researched: 2026-09-25
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/optimizer.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/multi_fact_join_groups.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubenativeutils/src/wrappers/neon/lifetime_guard.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/test/unit/pre-aggregations.test.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/joins.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
---
# Cube rollup join paths 1.7.45

## Summary

This doc covers how self-hosted Cube Core v1.7.45 builds a rollup's join tree, when it can't, where that failure shows up, and what wechart's publish can ask Cube in order to refuse such a rollup with Cube's own reason. It extends the model publish check: the draft compile (AC-136) and the check for names a rollup doesn't have (T207, AC-189), both in /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts (L51–L57, L145–L148, L222–L226).

**How this was checked.** Everything below comes from reading source. No Cube instance was run for this doc; the probes at the end are for the caller to run.
- Code was read in the local checkout at `/Users/srajagopal/Work/bi/cube` (commit 8368f2a).
- Line numbers point at tag v1.7.45 (commit `f2c28b8`). They come from one of two places:
  - Sourcegraph's index of that commit ([sg-check]);
  - the checkout, shifted by the diff hunks of the only later commit to that file (for JoinGraph.ts, [c-900602d]).
- Start lines are exact. Range ends are approximate. A link marked **(checkout)** points at 8368f2a.

**Findings**

1. **Join edges are directed, but the root is not forced.**
   - An edge runs from the cube that declares `joins` to the joined cube ([jg-compile], [doc-joins-dir]).
   - `buildJoin` tries **every** hint as the root. Each other hint needs a directed path from that root. Among the roots that work, the tree with the fewest joins wins ([jg-build], [jg-root]).
   - The rollup's owning cube is not added as a hint ([bq-subq], [ts-pac-hints]).
   - So if only `user` declares a join to `base`, a rollup on `base` that names `base.count` and `user.city` works. Its root is `user`, so the SQL is `user LEFT JOIN base`.
   - An explicit path (`CUBE.user.city`) removes that freedom. Every hop must then be reachable in its declared direction, starting from the owning cube ([jg-root], [cs-jhfp]).
2. **Both planners use the same join algorithm; they differ in which hints they pass.**
   - wechart's compose does not set `CUBEJS_TESSERACT_SQL_PLANNER`, and it defaults to `true` ([env], /Users/srajagopal/Work/wechart/docker-compose.yml L74–L99). So Tesseract runs.
   - Tesseract builds joins by calling back into JS: `BaseQuery.joinTreeForHints` → `JoinGraph.buildJoin` ([ts-qt], [bq-rust], [bq-jtfh]).
   - Tesseract builds one join per measure: the dimension hints plus that measure's own hints ([ts-pac-hints], [ts-mfjg]). The JS planner builds one join over all members ([bq-cjh]).
3. **The error text** is `Can't find join path to join 'x', 'y'`, with each hint quoted. A path hint prints as `'a,b'` ([jg-throw]).
   - The JS `UserError` crosses the native bridge unchanged ([nu-guard] L82). The gateway answers a `UserError` with HTTP 400 `{"type":"UserError","error":…}` ([gw-err], [ue]).
   - Under Tesseract the dimension cubes are listed first. For the reproduction the text is `'user', 'base'`.
4. **Where it surfaces.**
   - **Model compile** (so `/v1/meta` and the publish's draft compile) never builds a rollup's join. **`/v1/meta?extended`** never does either.
   - **Queries.** Tesseract compiles **every pre-aggregation of every cube in a query's plan** before matching ([ts-opt], [ts-all]). So `/v1/sql`, `/v1/dry-run` and `/v1/load` fail for **every query whose plan includes the rollup's cube**, not only queries the rollup would serve.
   - **Refresh worker.** Its failure aborts the whole context's run on every tick. The call sits outside the only `try` ([rs-refresh], [rs-run]).
5. **Oracle recommendation.** No Cube call answers "can rollup R be joined?" for one rollup in isolation. Use Cube as the gate, and wechart's rule to attribute the failure:
   - **(a) Gate.** After the draft compiles, send one `GET /cubejs-api/v1/sql` per cube that owns a pre-aggregation in the draft, under `{wechartStore, wechartDraft}`, with a one-member query on that cube.
     - That makes Tesseract compile every pre-aggregation of the cube, building each rollup's join through the same `JoinGraph.buildJoin` the worker uses ([ts-opt], [ts-pac-hints]).
     - It executes and enqueues nothing ([capi-sql]).
     - The draft context already has the `sql` scope (/Users/srajagopal/Work/wechart/infra/cube/cube.js L123–L126, [gw-scopes], [gw-sqlfn]).
     - Cube stops at the first failing pre-aggregation of that cube, and its text names cubes, not the rollup.
   - **(b) Attribution.** Use the exact rule in "The rule wechart would implement" to say which rollup(s) fail. wechart can also run the rule on its own to list every failing rollup.
   - **(c) Optional, worker-exact check per rollup.** If the playground secret is enabled (AC-145, system-partitions.md), send `POST /cubejs-system/v1/pre-aggregations/partitions` with a single `{id, cacheOnly: true}`. That runs the worker's own `getSql(…, {preAggregationsOnly: true})` for that rollup ([rs-rq], [rs-pp]).

**Differences between v1.7.42 (running) and v1.7.45 (target).** None found in the traced paths.
- JoinGraph.ts: the last commit is 900602d in both ([jg-hist-42], [jg-hist]).
- PreAggregations.ts: the last commit is e8c04fc in both ([pa-hist-42]).
- `cubenativeutils`: no commits after 2026-09-01 ([nu-hist]).
- Planner commits between the tags don't touch pre-aggregation compile, join hints or error propagation:
  - 3222ec0: multi-stage matching retry ([c-3222ec0]);
  - 8a32446: a depth guard, adding `maxMultiStageDepth` ([c-8a32446]);
  - f177d5d: calendar shift ([c-f177d5d]);
  - 4cb9452: FILTER_PARAMS ([c-4cb9452]).
- Line numbers do shift by 1–4 in BaseQuery.js and RefreshScheduler.ts.

## Install
Not applicable. This is server behaviour of `cubejs/cube:v1.7.45`, and wechart imports no package for it (/Users/srajagopal/Work/wechart/docker-compose.yml L67, L117).

## Init / auth pattern

**The call.** `GET {apiUrl}/v1/sql?query=<json>`, with `Authorization: Bearer <HS256 JWT>`. The JWT is signed with `CUBEJS_API_SECRET`, and its payload is `{ wechartStore, wechartDraft, iat, exp }`.
- That is the same token shape the publish's draft compile already uses: `client.meta({ wechartStore, wechartDraft: id })` (/Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts L193; token built in /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts L219–L240).
- `contextToAppId`/`schemaVersion` send a draft context to a compiled model of its own (/Users/srajagopal/Work/wechart/infra/cube/cube.js L79–L104).

**Scopes.**
- A draft context gets Cube's default scopes (cube.js L123–L126). The defaults are `['graphql', 'meta', 'data', 'sql']` ([gw-scopes]); compose sets no `CUBEJS_DEFAULT_API_SCOPES`.
- `/v1/sql` asserts `sql` ([gw-sqlfn]) and `/v1/dry-run` asserts `data` ([gw-dry]). Both are granted.
- The jobs API asserts `jobs` ([gw-jobs]), which drafts don't have. Refusing it is intended (cube.js L116–L127).

**Facts in wechart's code that affect this call** (not changes proposed here):
- `CubeClient.sql(query, preview)` takes no per-request `context`, unlike `meta(context)` (client.ts L67–L69, L99–L110). `#request` does accept a context (L186–L199).
- publish.ts deletes the draft in `finally` straight after `/v1/meta` (L217–L219).
  - Cube keeps the compiled draft under its own app id, with a constant `schemaVersion` `draft_<id>` (cube.js L99–L104). So later calls should reuse the compile without re-reading files.
  - Inference: if Cube evicted that compile (LRU, 10-minute keep-alive, cube.js L72–L77), a recompile would get 404 from the store. Keeping the draft until the probes finish avoids that.

Minimal call (TypeScript, Node 26):
```ts
const query = { measures: [`${cube}.${anyMeasure}`] };         // or { dimensions: [`${cube}.${anyDimension}`] }
const res = await fetch(`${apiUrl}/v1/sql?query=${encodeURIComponent(JSON.stringify(query))}`, {
  headers: { authorization: `Bearer ${token({ wechartStore, wechartDraft })}` },
});
// 200: every pre-aggregation of `cube` compiled, join trees included.
// 4xx/5xx: body.error is Cube's reason, e.g. "Can't find join path to join 'user', 'base'".
```

## API surface we will use

### Q1. The join-tree algorithm

**The graph** ([jg-compile], [jg-edges])
- `edges` is keyed `"<from>-<to>"`. For each valid cube A and each entry in `A.joins`, `from = A` and `to = join.name`.
- `nodes` groups edges by `from`, and `graph = new Graph(this.nodes)` (node-dijkstra `^2.5.0`, [sc-pkg] **(checkout)** L52).
- `undirectedNodes` is used only by `connectedComponents()` ([jg-compile]), never for joins.
- An edge is dropped, and the compile reports an error, when:
  - the target doesn't exist: `Cube <B> doesn't exist`;
  - a side with count/sum/avg/number measures lacks a primary key: `primary key for '<X>' is required when join is defined in order to make aggregates work properly`;
  - A declares B twice. None of the duplicates becomes an edge ([jg-edges], [jg-dup]).
- Errors reported this way fail the compile with `Compile errors:\n…` ([dsc-throw], [ce-text]), so the publish's draft compile already refuses them.
- With `extends`, the parent's joins are merged into the child. The child may redeclare one to override it ([jg-dup] comment).

**`buildJoin(cubesToJoin)`** ([jg-build], [jg-root])
1. For every hint h in `cubesToJoin`, try `buildJoinTreeForRoot(h, others)`. Keep the non-null trees, sort them by number of joins (a stable sort, so ties keep hint order), and take the first.
2. If no tree remains, throw ``UserError(`Can't find join path to join ${cubesToJoin.map(v => `'${v}'`).join(', ')}`)`` ([jg-throw]).

**`buildJoinTreeForRoot`** ([jg-root]):
- **A path hint as the root.** Its first cube becomes the root, and the rest of the path is processed first as a path hint.
- **A single-cube hint g:**
  - skip it if g is the root;
  - if g is already joined, move on;
  - otherwise `graph.path(root, g)` must return a path. That is Dijkstra over the directed edges, so any length is allowed and intermediate cubes are joined too.
- **A path hint [p0…pk]:**
  - first drop every element equal to the root (the filter runs before the walk);
  - then walk it with `prev = root`. For each element, either it is already joined (`prev = it`), or `graph.path(prev, it)` must exist.
  - Each hop therefore needs directed reachability from the previous element, not a direct edge.
- Joins along the found paths come from `edges["a-b"]`, in direction only ([jg-bypath]).
- node-dijkstra returns `null` for an unreachable goal ([nd]). How it breaks ties between equal-length paths is UNVERIFIED.

**Where a rollup's hints come from**
- **Tesseract compile** ([ts-pac-hints], [ts-mfjg], [ts-groups]):
  - `MeasuresJoinHints::builder(empty).add_dimensions(dimensions).add_dimensions(time_dimensions).build(measures)`.
  - For each measure, `hints = dimension hints ++ that measure's hints`, resolved by `join_for_hints` → JS `joinTreeForHints` ([ts-qt], [ts-bt], [bq-jtfh]).
  - With no measures, the dimension hints alone are used. With no hints at all, no join is built.
  - Segments are **not** in this list.
- **Order of the hint list.**
  - `dimensions` and `measures` are alphabetical, because `evaluateReferences` sorts unless `originalSorting` is set ([cs-sort], [ce-epr]).
  - Tesseract drops only adjacent duplicates ([ts-jh]). JS then `R.uniq`s the list and applies view join maps ([bq-jtfh], [bq-joinmap]).
- **A member's own hint** ([ts-jhc], [bq-push], [cs-jhfp]):
  - a plain reference gives its cube;
  - a path reference `CUBE.users.city` on C gives the vector `[C, users]`;
  - a view member is rewritten to its view's `join_path` prefix;
  - cubes whose members the member's `sql` references are added too.
- **Transitive join conditions.** JS repeats the build while joins' `sql` add hints for third cubes ([bq-jtfh]).
- **JS planner (Tesseract off).** One list for the whole query: query-level `joinHints`, then measures, dimensions, segments, filters and time dimensions ([bq-cjh], [bq-cjhm], [bq-amc]). A failure throws from the sub-query constructor. `prebuildJoin` re-throws only when the native planner is off ([bq-prebuild]).

**Answers to the cases asked** (derived from the code above)

| Case | Result |
|---|---|
| Only `user → base` declared; rollup on `base` names `base.count` and `user.city` | Works. Root `user` reaches `base`. Cube places the declaring cube on the left of the `LEFT JOIN` ([doc-joins-dir]), so `base` rows with no matching `user` drop out of the rollup (inference). |
| The same, spelled `CUBE.user.city` | Fails. Every root candidate starts at `base`, and `base → user` doesn't exist. Text: `Can't find join path to join 'base', 'base,user'` or similar (exact hint rendering UNVERIFIED). |
| Chain `a → b → c`; rollup names `a` and `c` members | Works. Root `a`, and `b` is joined implicitly. The owning cube can be any of the three. |
| `a → b` and `c → b` (both into `b`); names `a` and `c` members | Fails, even if `b` members are added, because `b` has no outgoing edge. |
| Hub: `o → c` and `o → p`; names only `c` and `p` members | Fails with `'c', 'p'`. Adding any `o` member fixes it. Cube's own regression test states this failure ([t-hub]). |
| Diamond: `a → b → d` and `a → c → d`; names `a` and `d` | Works, via `b` or `c`. Which one is UNVERIFIED (node-dijkstra tie-break). `CUBE.b.d.x` forces the path. Cube's docs call diamonds ambiguous and point to views' `join_path` ([doc-joins-diamond]). |
| Tesseract, measures on two unjoined cubes, no dimensions | Compile passes, because each measure is joined on its own ([ts-mfjg]). The JS planner would fail. Whether such a rollup then builds and matches is UNVERIFIED. |
| Rollup names no member of its owning cube | No join to the owner is built. The rollup is effectively over the other cubes (inference). |

**Other pre-aggregation types** ([ts-pac], [ts-lambda], [ts-rjsrc], [bq-pqse], [rs-base])
- **`original_sql`:** never joins. `preAggregationQueryForSqlEvaluation` returns the query itself, and the worker queries only the cube's first measure and first dimension.
- **`rollup_join`:** its own members must be joinable under the same per-measure rule (the compile hints run before the `rollupJoin` branch). Then `build_join_source` resolves each join against the referenced rollups. Its errors:
  - `Nothing to join in rollup join. Target joins are included in existing rollup joins`;
  - `No rollups found that can be used for a rollup join from "A" (…) to "B" (…). Check the "<name>" pre-aggregation definition — every rollup must declare the dimensions its own joins are on, including keys the query doesn't select`;
  - `Multiple rollups found …`.

  Sources: [ts-rjerr]. The JS equivalents are in [pa-rj] and [pa-rjm].
- **`rollup_lambda`:** has no join of its own; each referenced rollup is compiled, joins included ([ts-lambda]).
- Neither `rollup_join` nor `rollup_lambda` is refreshed by the worker ([rs-pp] L427).

### Q2. Tesseract versus the JS planner
- **wechart runs Tesseract.** `nativeSqlPlanner` is `get('CUBEJS_TESSERACT_SQL_PLANNER').default('true')`. Setting it to false prints "Tesseract planner is a default one, but you are trying to use a legacy planner…" ([env]). Compose doesn't set it (docker-compose.yml L74–L99).
- **What is the same:** the edges, `buildJoin`, the error text, and the fact that the owner isn't a forced root.
- **What differs:**
  - Tesseract uses per-measure groups, which accept multi-fact rollups; the JS planner uses one tree.
  - The hint order, and so the message: Tesseract puts dimensions first, JS puts measures first.
  - With Tesseract on, JS `prebuildJoin` swallows join errors ([bq-prebuild]) and Tesseract raises them instead.

### Q3. Error texts

| Case | Stage | Text | Source |
|---|---|---|---|
| Rollup cubes not joinable | query, refresh or jobs time | `Can't find join path to join 'user', 'base'` (Tesseract, dimension cubes first); `'base', 'user'` under the JS planner | [jg-throw], [ts-pac-hints], [bq-cjh] |
| Join to a missing cube | compile | `Cube <name> doesn't exist` | [jg-edges] |
| Join without a needed primary key | compile | `primary key for '<cube>' is required when join is defined in order to make aggregates work properly` | [jg-edges] |
| Two joins to one cube | compile | `Cube 'A' declares N joins to 'B' (joins[i], joins[j]). Only one join per pair of cubes is supported. Keep a single join to 'B', or use extends to create a child cube of 'B' and join that instead` | [jg-dup] |
| `rollup_join` problems | query time | see Q1 | [ts-rjerr] |
| A view with two paths to one cube | compile | `Views can't define multiple join paths to the same cube. …` | [cv-viewdup] |

- **Expected wire form** (derived; probe P2). `UserError` sets `type = 'UserError'` ([ue]). When a JS callback throws inside Tesseract, the original JS error is re-thrown (`NeonThrow(throw) => Err(throw)`, [nu-guard]). The gateway then answers **400** `{"type":"UserError","error":"Can't find join path to join …"}` ([gw-err]).
- This agrees with the sibling observation at v1.7.42: a JS `ReferenceError` thrown through the same bridge arrived unchanged, as a 500, because it isn't a `UserError` (pre-aggregations.md L313–L316).

### Q4. Where it surfaces

| Operation | Builds rollup join trees? | For a rollup on C that can't be joined | Source |
|---|---|---|---|
| Model compile (`/v1/meta`, the publish's draft compile) | No. JoinGraph builds edges only, and reference functions aren't called at compile | 200 | [jg-compile], rollup-references.md Q3 |
| `/v1/meta?extended` | No. The references are only stringified | 200 | [tme] |
| `/v1/sql`, `/v1/dry-run`, `/v1/load` on a query whose plan includes C | Yes. Tesseract compiles every pre-aggregation of each cube in the plan, then filters | error for every such query | [capi-sql], [bq-ext], [bq-match], [ts-tlp], [ts-opt], [ts-all] |
| The same, when the plan doesn't include C | No | fine | [ts-opt] (`collect_cube_names_from_node`) |
| `POST /v1/pre-aggregations/can-use` | No. It only matches a caller-supplied `transformedQuery` against caller-supplied `references` | n/a | [gw-canuse], [capi-canuse] |
| `POST /v1/pre-aggregations/jobs` `post` | Yes, through `preAggregationPartitions` → `getSql` for every selected rollup, before anything runs. It builds the rollups that pass, and needs the `jobs` scope. There is no validate-only action (`post` and `get` only) | the whole request fails | [gw-jobs], [rs-post], [q-jobs] **(checkout)** |
| `GET /cubejs-system/v1/pre-aggregations` (without `metaOnly`) | Yes, for all rollups | the whole request fails | [gw-getpa] **(checkout)**, [rs-pp] |
| `POST /cubejs-system/v1/pre-aggregations/partitions` | Yes, for each listed id; `rollup_join`/`rollup_lambda` are skipped | the whole request fails (`Promise.all`) | [gw-part], [rs-pp], [rs-rq] |
| Refresh worker | Yes, for each scheduled rollup, through `getSql(baseQuery, { preAggregationsOnly: true })` | the run for that context aborts | [rs-rq], [rs-base] |

**Confirmed from code: one failure aborts the context's run.**
1. The timer calls `handleScheduledRefreshInterval({})` ([srv-timer]). That runs `runScheduledRefresh` for each context from `scheduledRefreshContexts` ([srv-handle]).
2. With no `queryIteratorState`, `refreshPreAggregations` builds a fresh round-robin iterator on every tick ([rs-refresh]).
3. `queryIterator.current()` and `queryIterator.advance()` call `refreshQueriesForPreAggregation`, which calls `getSql`. They sit **outside** the only `try`, which wraps `executeQuery` ([rs-refresh], [rs-rr]). `advance()` restores its cursors and re-throws ([rs-rr]).
4. The rejection reaches `runScheduledRefresh`'s `catch`. That logs `Refresh Scheduler Error` with `e.stack`, skips `forceReconcile`, and returns `{finished: false}` ([rs-run]).

**The effect on each tick** (derived):
- Rollups before the broken one, in `scheduledPreAggregations` order ([ce-pas]), still have their newest partition checked.
- These are never refreshed in that context:
  - the broken rollup;
  - every rollup after it;
  - the older partitions of every rollup, because `partitionCursor` never advances.
- wechart's `{}` and `{wechartStore}` contexts run separately (cube.js L134–L137).

### Q5. The oracle

**Recommended gate: `GET /v1/sql`, one per cube that owns a pre-aggregation in the draft.**
- **Request.** `query={"measures":["<cube>.<m>"]}`, or a dimension if the cube has no measure. Pick a member whose `sql` touches only that cube, so the plan contains only that cube ([ts-opt]).
- **What Cube runs.** `getSql` evaluates `externalPreAggregationQuery()` → `findPreAggregationForQuery()` → Tesseract's match-only planning ([capi-sql], [bq-ext], [pa-find], [bq-match]). `try_optimize` then compiles all of the cube's pre-aggregations of every type, scheduled or not ([ts-opt], [ts-all]).
- **Response.** 200 `{ sql: {…} }` when every pre-aggregation compiles; otherwise Cube's error ([gw-sqlfn], [gw-err]).
- **What it catches:** every compile-stage rollup failure on that cube (joins, unknown names, wrong kinds), including `rollup_join` and `rollup_lambda`. It enqueues nothing.
- **What it misses** (errors raised only when the rollup's own description is generated, i.e. when the rollup is matched or refreshed): refresh-key cron shapes, index columns, build SQL ([pa-descfor]).
- **Segments.** The compile step leaves segments out, while the worker's query carries them inside `dimensions` ([ce-epr], [rs-base]). How Tesseract plans a segment passed as a dimension is UNVERIFIED.

**Would a query built from a rollup's members be equivalent?** Only partly:
- **Algorithm:** same (`JoinGraph.buildJoin`).
- **Hints:** a query adds order dimensions, filters and segments ([ts-qp]).
- **Spelling:** REST `measures` accept only `cube.member`, and the third segment of a `dimensions` entry is read as a granularity ([q-id]). A path must be sent as a query-level `joinHints: [["base","users"]]` ([q-schema]), which is prepended rather than attached to the member ([bq-cjh], [ts-qp]).
- **Pollution:** a query also compiles the pre-aggregations of every cube it touches ([ts-opt]).

  The per-cube probe avoids translating the rollup into a query at all.

**Worker-exact, per rollup: `POST /cubejs-system/v1/pre-aggregations/partitions`.**
- Body: `{"query":{"timezones":["UTC"],"preAggregations":[{"id":"C.r","cacheOnly":true}]}}`, one id per request.
- Token: signed with `CUBEJS_PLAYGROUND_AUTH_SECRET`, with payload `{wechartStore, wechartDraft}`. No scope check applies (system-partitions.md).
- It runs `refreshQueriesForPreAggregation`, which is the worker's exact `getSql` ([rs-pp], [rs-rq]).
- With `cacheOnly`, the next step only reads the query cache (`resultFromCacheIfExists`, [opa-cache]), so nothing runs on the source database.
- Any error fails the request. It skips `rollup_join`/`rollup_lambda` ([rs-pp] L427).
- A broken sibling rollup on any cube R touches fails R's check too. The worker behaves the same way ([ts-opt]).

**Attribution.** The text lists the failing hint cubes. Match them to rollups with the rule below, or compile one draft per rollup with the other pre-aggregations removed. That costs one more compiled model per rollup in Cube's LRU (cube.js L72–L77).

### Q6. Views
- `preAggregations` and `joins` are in `baseSchema`, which `viewSchema` inherits, so a view's pre-aggregations pass validation ([cv-base], [cv-view]).
- The view reference docs don't mention pre-aggregations (a Sourcegraph search at the tag found no match).
- A cube's rollup may name view members, and resolution accepts them (rollup-references.md Q1). Each view member's hint becomes the view's `join_path` prefix, as a path hint ([ts-jhc], [bq-joinmap]). So the rollup's join follows the view's paths hop by hop, under the directed rule in Q1.
- No compile-time check that a view's `join_path` follows real joins was found. Among the compiler's join-related errors there is only the duplicate-path error ([cv-viewdup]). UNVERIFIED by a probe.
- Whether a rollup that names view members builds and matches end to end remains UNVERIFIED.

## The rule wechart would implement (Tesseract, v1.7.45)

This is for attributing a failure, or for checking without Cube. For each pre-aggregation P on cube C:

1. **Types.**
   - `original_sql`: skip.
   - `rollup_lambda`: check each referenced rollup ([ts-lambda]).
   - `rollup` and `rollup_join`: apply steps 2–6 to P's own members.
2. **Edges.** A directed edge A→B for each join in A's merged joins, taken from a model that compiles ([jg-edges], [jg-dup]).
3. **Hints.** Resolve each reference (rollup-references.md rules 1–4).
   - A plain reference gives the member's cube.
   - A path reference gives the vector `[C, …, K]`.
   - A view member gives the view's `join_path` prefix.
   - Add every cube whose members the member's `sql` references ([ts-jhc], [cs-jhfp]).
4. **Lists.**
   - D = the hints of the alphabetically sorted `dimensions`, then the time dimension(s). Include the segments too, to match the worker's query ([cs-sort], [ts-pac-hints], [rs-base]).
   - For each measure m (sorted): H = D ++ hint(m).
   - With no measures: H = D. With nothing at all: no check.
5. **Joinable(H).** H is joinable if some root candidate r ∈ H succeeds (for a path hint, its first cube). A candidate succeeds when, processing every other hint in order:
   - a single cube g is r, or already joined, or reachable from r;
   - a path hint has the elements equal to r removed, then each element is either already joined or reachable from the previous one, starting at r.

   Each new cube is marked joined ([jg-root]).
6. **Transitive join conditions.** If a used join's `sql` references a third cube's members, that cube must be joinable too ([bq-jtfh]).
7. **The message Cube gives** is `Can't find join path to join ` followed by the de-duplicated H, each element as `'x'` (a vector as `'a,b'`), joined by `, ` ([jg-throw], [bq-jtfh]).

## Gotchas
1. **Cube reports the first failing pre-aggregation on the cube.** Its text names cubes, not the rollup.
2. **Pre-existing broken rollups block the probe.**
   - publish.ts refuses only what the change breaks (L51–L93).
   - To keep that policy, probe the live model as well (the same token without `wechartDraft`) and refuse only new failures.
3. **A reverse join is accepted silently, with the other cube as root.** The rollup then preserves the other side's rows ([doc-joins-dir]).
4. **An explicit `CUBE.x.member` path forces direction.** That can turn a working rollup into a failing one.
5. **Hub cubes are never added on their own** ([t-hub]).
6. **Under Tesseract, a broken rollup breaks every query whose plan includes its cube** ([ts-opt]). A bad cron breaks only queries matched to that rollup ([pa-descfor]; refresh-key-schedule.md).
7. **"Silently" is only true from wechart's side.** Cube logs `Refresh Scheduler Error` with the stack on every tick ([rs-run]), but no API tells wechart.
8. **Access policies (UNVERIFIED).** No refusal of hidden members was found in the gateway's query path; the gateway filters visibility only in `/v1/meta` ([gw-meta-vis] **(checkout)** L719). But an access policy that denies the draft context's (empty) groups could fail the probe query for access reasons.
9. **The system route is undocumented, and its secret opens much more.** See system-partitions.md, Security.
10. **`/v1/pre-aggregations/can-use` can't validate a rollup against the model** ([capi-canuse]).

## Alternatives considered

| Candidate | Faithful? | Builds? | Scope/secret | Per rollup? |
|---|---|---|---|---|
| `/v1/sql` or `/v1/dry-run` per owning cube | yes, for the compile stage | no | `sql` / `data`, already granted | no; first failure per cube |
| `/v1/sql` from a rollup's members | partly (spelling, filters, other cubes' pre-aggregations) | no | `sql` | no |
| System `partitions`, `cacheOnly`, one id per request | the worker's exact path | no | playground secret | yes, for `rollup`/`original_sql` |
| Jobs API | runs getSql, then builds | yes | `jobs`, which drafts lack | no |
| `/v1/pre-aggregations/can-use` | no model join | no | `meta` | n/a |
| `/v1/meta?extended` | no | no | `meta` | n/a |
| A draft per rollup plus `/v1/sql` | yes | no | `sql` | yes; one extra compile each |

## Corrections to sibling docs
1. **rollup-references.md, Q3 row "Cube not reachable by a join".**
   - The text form is right.
   - Under Tesseract the dimension cubes come first (`'users', 'orders'` for a measure on `orders` and a dimension on `users`), and a path prints as `'orders,users'`.
   - The Tesseract column is the same JS text, passed through unchanged ([nu-guard], [ts-qt]).
   - The per-hop behaviour is resolved: each hop needs directed reachability, not a direct edge ([jg-root]).
2. **rollup-references.md, rule 9.** It is wrong.
   - Other cubes don't have to be reachable *from C*. Any hint cube may be the root, and C isn't a hint unless it is named.
   - Under Tesseract the check is per measure (the dimensions plus that measure).
   - Path spellings force direction.
   - See "The rule wechart would implement".
3. **rollup-references.md, Open question 5.** Answered by item 1.
4. **rollup-references.md, "When the functions are first called" and "Consequence".**
   - `compilerApi.preAggregations()`, used by the jobs API and the system list, evaluates names only. Joins are built where `getSql` runs ([ce-pas], [rs-rq]).
   - The "breaks every query on that cube" inference holds, in code, for compile-stage errors. Its scope is every plan that includes the cube ([ts-opt]).
5. **refresh-key-schedule.md, Gotcha 1.** Confirmed from code ([rs-refresh], [rs-rr], [rs-run]). Refinements:
   - Rollups before the broken one still get their newest partition.
   - Each tick logs the stack.
   - Join failures break every query on the cube's plans, not only the queries the rollup serves.
6. **system-partitions.md.**
   - Item `errors` hold only `'Unused pre-aggregation'` and `'Waiting for cache'`. A rollup whose `getSql` throws fails the **whole** response ([rs-pp]).
   - So `preAggregations: []` (all) returns nothing if any rollup is broken. List one id per request to attribute.
   - "Never add `wechartDraft`" was written for listing. With `cacheOnly`, a draft token builds nothing ([rs-rq], [opa-cache]).
7. **markings-query-support.md, UNVERIFIED L496** (Tesseract returning 400 `UserError`): derived as yes, from [nu-guard] and [gw-err]. Probe P2 checks it.
8. **data-modeling.md.**
   - L334: add that the root is any hint cube, ties break by fewest joins and then hint order, and Dijkstra's own ties are unspecified ([jg-build]).
   - L799: a view's `join_path` is not checked against the joins at compile ([cv-viewdup]; UNVERIFIED).
9. **data-apis.md L132 (`can-use`).** Add that it can't validate a rollup against the model ([capi-canuse]).
10. **This task's brief.** "Every scheduled refresh in that model stops silently" should read: "every rollup from the broken one on, plus the older partitions of all rollups, stop for that context. Cube logs it; nothing reaches wechart."

## Open questions / unverified
1. The exact wire response for the join error on each route: 400 `UserError` is derived. Probes P2 and P8 check it.
2. How the hint is rendered for path references under Tesseract (probe P4).
3. node-dijkstra's tie-break on diamonds ([nd]).
4. Whether a Tesseract multi-fact rollup (measures on unjoined cubes) builds and matches (probe P9).
5. How Tesseract handles segments passed inside `dimensions` in the worker's query.
6. `scheduledPreAggregations` order versus file and list order ([ce-pas] uses `Object.keys(evaluatedCubes)`; probe P7).
7. Whether access policies or hidden members affect the probe query.
8. Whether rollups that name view members build and match; whether a bad view `join_path` compiles.

## Probes to run locally

**Setup.**
- `docker compose up -d` recreates the containers at v1.7.45 from the working tree. No behavioural difference from v1.7.42 was found.
- Put the model below in `infra/cube/model/cubes/zz_probe_joins.yml`. Then run `docker compose restart cube cube-refresh-worker`; the mounted model's `schemaVersion` is the constant `'disk'`.
- Afterwards, delete the file and restart again.
- While the file is present, the `{}` context's worker run stops at `pj_lonely`.

```sh
export CUBE=http://localhost:54000/cubejs-api/v1
mint() { CTX="$1" SECRET="${2:-dev-secret}" node -e '
const c=require("node:crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const n=Math.floor(Date.now()/1e3);const u=b({alg:"HS256",typ:"JWT"})+"."+b({...JSON.parse(process.env.CTX),iat:n,exp:n+3600});
process.stdout.write(u+"."+c.createHmac("sha256",process.env.SECRET).update(u).digest("base64url"))'; }
export TOKEN=$(mint '{}')
sqlq() { curl -sS -G -H "Authorization: Bearer $TOKEN" --data-urlencode "query=$1" "$CUBE/sql" -w '\nHTTP %{http_code}\n'; }
```

```yaml
cubes:
  - name: pj_lonely            # P2: no join to pj_customers either way
    sql_table: public.products
    dimensions: [{ name: id, sql: id, type: number, primary_key: true }]
    measures: [{ name: count, type: count }]
    pre_aggregations:
      - { name: unjoinable, measures: [count], dimensions: [pj_customers.country] }
  - name: pj_customers         # joined only from pj_orders
    sql_table: public.customers
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: country, sql: country, type: string }
    measures: [{ name: count, type: count }]
    pre_aggregations:
      - { name: reverse_ok, measures: [pj_orders.count], dimensions: [country] }      # P3
  - name: pj_orders
    sql_table: public.orders
    joins:
      - { name: pj_customers, relationship: many_to_one, sql: '{CUBE}.customer_id = {pj_customers}.id' }
      - { name: pj_products, relationship: many_to_one, sql: '{CUBE}.product_id = {pj_products}.id' }
      - { name: pj_cust2, relationship: many_to_one, sql: '{CUBE}.customer_id = {pj_cust2}.id' }
    dimensions: [{ name: id, sql: id, type: number, primary_key: true }]
    measures: [{ name: count, type: count }]
  - name: pj_cust2             # P4: path spelled from CUBE, against the edge
    sql_table: public.customers
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: country, sql: country, type: string }
    pre_aggregations:
      - { name: path_wrong_way, measures: [CUBE.pj_orders.count], dimensions: [country] }
  - name: pj_products          # P5: hub pj_orders not named
    sql_table: public.products
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: category, sql: category, type: string }
    pre_aggregations:
      - { name: hub_missing, dimensions: [category, pj_customers.country] }
  - name: pj_zz_ok             # P7: healthy, after the broken ones
    sql_table: public.orders
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: status, sql: status, type: string }
    measures: [{ name: count, type: count }]
    pre_aggregations:
      - { name: ok, measures: [count], dimensions: [status], refresh_key: { every: 1 minute } }
```

- **P0: planner and image.** Run `docker exec wechart-cube sh -c 'echo ${CUBEJS_TESSERACT_SQL_PLANNER:-unset}'` and expect `unset`. Run `docker inspect -f '{{.Config.Image}}' wechart-cube wechart-cube-refresh-worker` and expect `cubejs/cube:v1.7.45`.
- **P1: compile passes.** Run `curl -sS -H "Authorization: Bearer $TOKEN" "$CUBE/meta" -w '\nHTTP %{http_code}\n' | tail -1` and expect HTTP 200.
- **P2: the reproduction.**
  - `sqlq '{"measures":["pj_lonely.count"]}'`: expect HTTP 400 `{"type":"UserError","error":"Can't find join path to join 'pj_customers', 'pj_lonely'"}`.
  - `sqlq '{"measures":["pj_customers.count"]}'`: expect 200. The plan excludes `pj_lonely`.
- **P3: reverse direction works, root swapped.** Run `sqlq '{"measures":["pj_orders.count"],"dimensions":["pj_customers.country"]}' | head -n -1 | jq '.sql.preAggregations[]|{preAggregationId, loadSql: .loadSql[0]}'`. Expect `pj_customers.reverse_ok`, whose `loadSql` reads `FROM public.orders … LEFT JOIN public.customers`.
- **P4: an explicit path forces direction.** `sqlq '{"dimensions":["pj_cust2.country"]}'`: expect 400, with a `Can't find join path to join …` text naming `pj_cust2` and `pj_orders`. Record the exact rendering.
- **P5: hub.** `sqlq '{"dimensions":["pj_products.category"]}'`: expect 400 `Can't find join path to join 'pj_customers', 'pj_products'`.
- **P6: worker log.** `docker logs --since 3m wechart-cube-refresh-worker 2>&1 | grep -A2 'Refresh Scheduler Error'`: expect the P2 text with a `JoinGraph.buildJoin` stack, repeating every tick (about 30 s).
- **P7: abort scope.**
  1. Poll `curl -sS -G -H "Authorization: Bearer $TOKEN" --data-urlencode 'query={"measures":["pj_zz_ok.count"],"dimensions":["pj_zz_ok.status"]}' "$CUBE/load" | jq -c '.error // .usedPreAggregations'` every 30 s for 3 minutes. Expect the "No pre-aggregation partitions were built yet…" error throughout.
  2. Move the `pj_zz_ok` entry to the top of the file and restart. Expect `usedPreAggregations` within about 2 minutes.
- **P8: system route, per rollup.** Needs system-partitions.md Setup A, with `CTX='{}'`.
  - `sys partitions '{"query":{"timezones":["UTC"],"preAggregations":[{"id":"pj_lonely.unjoinable","cacheOnly":true}]}}'`: expect 400 with the P2 text.
  - The same with `pj_customers.reverse_ok`: expect 200, with one partition and `versionEntries: []`.
- **P9 (optional): multi-fact.** Add `{ name: mf, measures: [count, pj_customers.count] }` to a new cube `pj_mf` (sql_table public.orders, with an `id` primary key and a `count`). Then `sqlq '{"measures":["pj_mf.count"]}'`: Tesseract should give 200.
- **P10 (optional): JS planner.** Recreate `cube` only with `CUBEJS_TESSERACT_SQL_PLANNER=false` (a `-f` override) and repeat P2. Expect `'pj_lonely', 'pj_customers'` (measures first).
- **Store context (optional).** Publish the same rollup through wechart on :4100. Then run P2 with `TOKEN=$(mint '{"wechartStore":"http://host.docker.internal:4100"}')`.

[sg-check]: https://sourcegraph.com/github.com/cube-js/cube@v1.7.45
[c-900602d]: https://github.com/cube-js/cube/commit/900602d1cc815b7f7bdd6204513963cc9ae396a0
[c-3222ec0]: https://github.com/cube-js/cube/commit/3222ec0e1f508566b6e633a69e20f3764f2d4e90
[c-8a32446]: https://github.com/cube-js/cube/commit/8a32446e1ba2553c33bd05c33f9f861ec1ce8549
[c-f177d5d]: https://github.com/cube-js/cube/commit/f177d5d8713b738154cab5fe7eb63f334c8452c1
[c-4cb9452]: https://github.com/cube-js/cube/commit/4cb9452355d108187393c43223d30bbfd0cfa8a0
[jg-hist]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts&sha=v1.7.45
[jg-hist-42]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts&sha=v1.7.42
[pa-hist-42]: https://api.github.com/repos/cube-js/cube/commits?path=packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts&sha=v1.7.42
[nu-hist]: https://api.github.com/repos/cube-js/cube/commits?path=rust/cube/cubenativeutils&sha=v1.7.45&since=2026-09-01T00:00:00Z
[jg-compile]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L64-L110
[jg-edges]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L112-L168
[jg-dup]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L170-L210
[jg-build]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L223-L260
[jg-throw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L245
[jg-root]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L269-L348
[jg-bypath]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L379-L381
[bq-prebuild]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L389-L413
[bq-jtfh]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L423-L464
[bq-joinmap]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L525-L590
[bq-ext]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L873-L884
[bq-rust]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L952-L1003
[bq-match]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L1008-L1055
[bq-cjh]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L2778-L2830
[bq-cjhm]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L2861-L2872
[bq-amc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L2898-L2905
[bq-push]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L3328-L3345
[bq-subq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4259-L4270
[bq-pqse]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4845-L4853
[pa-descfor]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L318-L449
[pa-find]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L919-L932
[pa-rj]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L1046-L1087
[pa-rjm]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L1089-L1158
[ce-pas]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L930-L991
[ce-epr]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L1165-L1196
[cs-sort]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1241
[cs-jhfp]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1264-L1279
[cv-base]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L1168-L1209
[cv-view]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L1315
[cv-viewdup]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L1599
[dsc-throw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts#L552
[ce-text]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CompileError.ts#L6
[ue]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/UserError.ts#L1-L7
[rs-rq]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L143-L191
[rs-base]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L193-L227
[rs-run]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L258-L314
[rs-pp]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L396-L500
[rs-rr]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L503-L612
[rs-refresh]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L614-L692
[rs-post]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L743-L840
[srv-timer]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L382
[srv-handle]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts#L810-L848
[capi-sql]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts#L355-L384
[capi-canuse]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts#L1203-L1205
[opa-cache]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L710-L733
[gw-scopes]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L241
[gw-canuse]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L586-L603
[gw-part]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L900-L930
[gw-jobs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1063-L1112
[gw-sqlfn]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1557-L1598
[gw-dry]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L1819-L1850
[gw-err]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts#L2525-L2583
[gw-getpa]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/src/gateway.ts#L864-L893
[gw-meta-vis]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/src/gateway.ts#L719
[q-id]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L58-L73
[q-schema]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js#L177-L212
[q-jobs]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-api-gateway/src/query.js#L232-L234
[tme]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts#L1-L108
[env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts#L347-L359
[ts-opt]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/optimizer.rs#L83-L106
[ts-pac]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L87-L269
[ts-pac-hints]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L205-L210
[ts-lambda]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L271-L368
[ts-rjsrc]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L412-L478
[ts-rjerr]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L461-L724
[ts-all]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L739-L751
[ts-mfjg]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/multi_fact_join_groups.rs#L46-L158
[ts-groups]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/multi_fact_join_groups.rs#L258-L342
[ts-qt]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_tools.rs#L147-L163
[ts-bt]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/cube_bridge/base_tools.rs#L42
[ts-qp]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_properties.rs#L320-L341
[ts-tlp]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/top_level_planner.rs#L34-L57
[ts-jh]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/join_hints.rs#L29-L41
[ts-jhc]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/collectors/join_hints_collector.rs#L99-L126
[nu-guard]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubenativeutils/src/wrappers/neon/lifetime_guard.rs#L55-L95
[t-hub]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/test/unit/pre-aggregations.test.ts#L1062-L1151
[doc-joins-dir]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/joins.mdx?plain=1#L241
[doc-joins-diamond]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/joins.mdx?plain=1#L426-L433
[sc-pkg]: https://github.com/cube-js/cube/blob/8368f2af49be2ee4926bc97c10d7174c7fa16297/packages/cubejs-schema-compiler/package.json#L52
[nd]: https://github.com/albertorestifo/node-dijkstra/blob/master/libs/Graph.js
