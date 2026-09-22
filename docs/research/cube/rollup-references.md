---
library: cube
packages: []
version: 1.7.42
researched: 2026-09-22
sources: [https://github.com/cube-js/cube/tree/v1.7.42, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx]
---
# Cube 1.7.42: how rollup member references resolve

## Summary
This note covers how Cube 1.7.42 resolves the member names in a `rollup` (and in `rollup_join` and `rollup_lambda`), and what `/v1/meta` returns. wechart needs this to check a YAML model before publishing it. Findings:

- **Compile does not check rollup references.** Each reference list must only be a function; nothing evaluates it until a pre-aggregation is listed, matched or built. The one exception is `output_column_types[].member`.
- **When references are evaluated,** Cube accepts these spellings:
  - a bare member of the owning cube
  - `CUBE.`, `TABLE.` or `<own cube>.` followed by a member
  - `<other cube>.member`
  - a join path such as `CUBE.users.city`
  - a view name (not documented)
- **`/v1/meta` is not a complete member set.** Outside dev mode it leaves out hidden members, and it lists only custom granularities.

**How this was checked.** No Cube instance was run for this note, so nothing here was tested. The probes that followed it are in the addendum at the end.

- **Source code.** It was read from a local checkout at `/Users/srajagopal/Work/bi/cube` (commit 8368f2a). That commit is an ancestor of v1.7.42. Per the GitHub commits API, the only later commits to these files before the tag are:
  - e8c04fc: a linter change that adds blank lines
  - 99cceac: gateway.ts
  - 900602d: JoinGraph.ts
- **Line numbers.** Every line number below comes from Sourcegraph's index of the v1.7.42 tag, or from files that have no commits after 8368f2a.
- **Labels.** "Inferred" means the code path was read but not run.

## Install
Nothing to install. This is server behaviour of the `cubejs/cube:v1.7.42` image.

## Init / auth pattern
Not applicable. The `/v1/meta` visibility depends on dev mode and on the playground auth secret; see Q4.

## API surface we will use

### Q1. Which spellings are accepted in `measures`, `dimensions`, `segments`, `time_dimension`, `time_dimensions[].dimension` and `rollups`, and how each resolves

**How a YAML item becomes a function**
- These YAML paths are wrapped as functions:
  - `pre_aggregations.<n>.(measures|dimensions|segments|time_dimension|rollups)`
  - `time_dimensions.N.dimension`
  - `indexes.<n>.columns`
  - `output_column_types.N.member`

  Source: [tp-pat].
- Each array item is parsed as a Python expression and converted to JS [yc-transpile]. A quoted string such as `"'x'"` or `"{'x'}"` becomes a JS string literal [py-atom].
- The expression is then wrapped in an arrow function [yc-arrow]. The function's **parameters are only the identifiers that resolve at transpile time** [tp-ids] [tp-visit]:
  - a member of the owning cube (its measures, dimensions, segments and pre-aggregations are all symbols [cs-transform])
  - a view name
  - a cube name
  - `CUBE` or `TABLE` [cs-const]
- Any other bare identifier stays a free variable inside the function body.
- In later compile phases, an existing arrow function's parameters are recomputed [tp-arrow] [dsc].
- JS models go through the same transpiler.

**How the function is evaluated**
- `preparePreAggregations` renames `measures` to `measureReferences`, and does the same for dimensions, segments, time dimensions and rollups [ce-prep].
- `evaluatePreAggregationReferences` evaluates the lists [ce-epr]:
  - measures, dimensions, segments and time dimensions use `{collectJoinHints: true}`
  - `rollups` uses `{originalSorting: true}`
  - segments are appended to the `dimensions` list
- `evaluateReferences` calls the function with one resolver per parameter [cs-er] [cs-rsc]. `resolveSymbol` checks a **cube or view name first**, then a member of the owning cube, and returns a proxy [cs-rs].
- Property access on the proxy, in this order [cs-proxy]:
  1. A member of that cube gives a member proxy.
  2. Otherwise a cube name is a join hop, and join hints accumulate.
  3. A time dimension followed by a predefined or custom granularity is accepted [cs-gran].
  4. Anything else throws.
- `toString` produces `R.uniq(joinHints ++ [cube, member])` joined with `.` [cs-er].
- Downstream, a path with more than two parts is split into a join hint plus its last two segments [cs-jh]. `evaluateAllReferences` then prefixes every member with its path in the rollup's join tree [pa-ear]. This is by design: "Strings in `dimensions`, `measures` and `timeDimensions[*].dimension` can contain full join path" [ce-td].

**Results when the owning cube is `orders`, with a join `orders` → `users`**

| Spelling | JS `evaluateReferences` result | Tesseract (native planner) |
|---|---|---|
| `count` (bare member of `orders`) | `orders.count` | `orders.count` [ts-sp] |
| `CUBE.count`, `TABLE.count`, `orders.count` | `orders.count` | same |
| `users.city` | `users.city`; the join path is added later [pa-ear] | resolved as a cube hop [ts-sp] |
| `CUBE.users.city`, `orders.users.city` | `orders.users.city` | path `[orders, users]`, member `users.city` [ts-sp] |
| `CUBE.created_at.day` in `time_dimension` | `orders.created_at.day`, which is later misread as a join path | error `Pre-aggregation time dimension must be a dimension` [ts-tests] |
| `v.count` (a view member) | `v.count`, because views are symbols and evaluated cubes [cs-compile] [ce-compile] | resolves (`cube_exists`) [ts-sp] |
| `CUBE.main` (a pre-aggregation name) | `orders.main`, no error | fails (not a member) |
| JS string `'orders.count'` or YAML `"'orders.count'"` | passed through, not checked | reported as unresolved: `'count' not found for path 'orders.count' in pre-aggregation …` [ts-sc] [ts-refs] (inferred) |
| JS template `` `${CUBE}.count` `` | `orders.count` | resolved as an interpolated path [ts-sc] [ts-tests] |

**Other points**
- **Docs.** The documented forms are `CUBE.x`, bare names, and joined-cube members such as `users.name` [doc-md] [doc-join] [doc-idx]. `rollups` accepts `CUBE.orders_rollup` or `users.users_rollup` [doc-rj] [doc-lambda].
- **`rollups` must name a pre-aggregation.** The result is looked up with `byPath('preAggregations', …)` [pa-ear] [ce-bypath].
- **Tesseract checks each member's kind** [ts-checks] [ts-pac]:
  - `measures` must be measures
  - `dimensions` must be dimensions
  - `segments` must be segments
  - `time_dimension` must be a `time` dimension

  The JS path does not check kinds at evaluation.
- **Tesseract is on by default:** `CUBEJS_TESSERACT_SQL_PLANNER` defaults to `true` [env] [bq-native].
- **`granularity`.** The validator accepts any string [cv-gran]. The docs allow the predefined granularities or a custom one on that dimension [doc-gran]. An unknown one fails later with `Granularity "x" does not exist in dimension …` [gran].
- **Views.** The docs describe pre-aggregation members as members "from the cube" [doc-md]. Whether a rollup that names view members builds or matches is UNVERIFIED.

### Q2. `indexes.<n>.columns`

**How columns are evaluated**
- Columns are evaluated with `evaluateReferences(cube, columns, {originalSorting: true})`, with no join hints. This happens in:
  - `CubeEvaluator.preAggregations()` [ce-pas]
  - `BaseQuery.evaluateIndexColumns`, at build time [bq-idx] [pa-desc]
- For each result `evaluateIndexColumns` does the following [bq-idx]:
  1. If `path[0]` is a cube and the first two segments are a measure, dimension or segment [ce-inst]:
     - with three segments, a `time` dimension and a valid granularity, it returns the time-dimension alias
     - otherwise it returns `aliasName(column)`
  2. Otherwise it passes the string through unchanged, as an escaped column name.

**Accepted forms** [doc-idx] [doc-agg]
- A member: `CUBE.status`, bare `status`, or a joined-cube member such as `Products.name`.
- A time dimension with its granularity: `CUBE.created_at.day`, including a custom granularity [cs-gran].
- The alias string `"{'orders__created_at_day'}"` in YAML, or `` `orders__created_at_day` `` in JS.

**Forms that pass evaluation but fail later (inferred)**
- `CUBE.users.name` is passed through raw as `orders.users.name`, because `orders.users` is not a member.
- `CUBE.created_at` without a granularity becomes the plain alias, which does not match the rollup's `…_day` time-dimension column. The docs require the `.<granularity>` form [doc-idx].

**Does an index column have to be one of the rollup's own columns?**
- Cube itself does not check this.
- Cube Store rejects a column that is not in the built table: `Column '…' in index '…' is not found in table '…'` [cstore].
- For aggregate indexes, Cube Store also rejects columns that are in the aggregations list [cstore-agg]. The docs say aggregating indexes contain "only dimensions and pre-aggregated measures from the pre-aggregation definition" [doc-agg].
- So in practice a column must map to one of the rollup's dimensions, or to its time dimension at the rollup's granularity. Whether a measure column is useful in a regular index is UNVERIFIED.

**Validator.** It only requires `columns` to be a function, with `type: regular|aggregate` [cv-idx]. The `type` default of `regular` is set in [cs-idx].

### Q3. Compile time versus evaluation time

**Compile time**
- Pre-aggregations are only checked by the Joi schema, which requires every reference field to be a function [cv-rollup].
- The functions are not called during compile, so unknown names pass. The references are only renamed at compile [ce-prep].
- The "first phase" branch that returns `undefined` [cs-proxy] does not apply to pre-aggregations, because their functions are not called then.
- Errors that do appear at compile:
  - Python parse failures: `Failed to parse Python expression…` [yc-parse]
  - duplicate names across members and pre-aggregations: `… defined more than once` [cs-transform]
  - `output_column_types[].member`, which **is** evaluated during compile [ce-prep]

**When the functions are first called**
- The refresh scheduler, through `scheduledPreAggregations()` or `preAggregations()` [rs] [capi-pa] [ce-pas].
- `/cubejs-system/v1/pre-aggregations` and `/v1/pre-aggregations/jobs` [gw-pa] [gw-jobs].
- Query matching. The JS path is `evaluatedPreAggregationObj`, with no try/catch [pa-obj] [pa-find]. Tesseract compiles every pre-aggregation of the queried cubes and propagates any error [ts-opt] [ts-all] [bq-rust].
- Building [pa-rpq] [bq-idx].

**Error texts**

| Case | JS path | Tesseract |
|---|---|---|
| Unknown bare name `nope`, or unknown cube `nocube.x` | Not a parameter, so the call throws V8's `ReferenceError: nope is not defined` [tp-ids]. The message text is V8's, not Cube's. | Same JS function; wording not checked |
| `CUBE.nope`, `users.nope`, `CUBE.count.nope`, `CUBE.created_at.badgran` | `UserError`: `orders.nope cannot be resolved. There's no such member or cube.` [cs-proxy] | Inferred: ``Error in `CUBE.nope`: Cannot resolve: nope`` [mstc] [ts-scb] [ts-sp] |
| Interpolated or string path that is unknown | none (passed through) | `'x' not found for path 'orders.x' in pre-aggregation 'orders.pa'` [ts-refs] [ts-tests] |
| Wrong kind of member | fails later (not traced) | `Pre-aggregation measure must be a measure`, `… dimension must be a dimension`, `… time dimension must be a dimension` [ts-checks] |
| Cube not reachable by a join | `Can't find join path to join 'orders', 'users'` [jg]; the exact per-hop behaviour is UNVERIFIED | not traced |
| `rollups` entry that is not a pre-aggregation | `'x' not found for path 'orders.x'` [ce-bypath] [pa-ear] | not traced |

**Consequence (inferred, not run).** One bad reference throws inside whole-list or whole-cube loops. It can therefore break the refresh scheduler's list, the pre-aggregation endpoints, and every query on that cube, not only queries that would use the bad rollup.

### Q4. `/v1/meta` (non-extended)

**What it lists**
- Each cube and view appears with `measures`, `dimensions` and `segments`.
- Every member has `name` = `` `${cubeName}.${memberName}` `` [c2m].

**Visibility**
- A member's `isVisible` is true only if the cube is visible and the member is. For both, `public` is checked first, then `visible`, then `shown` [c2m] [c2m-vis].
- Defaults: `true`, except primary-key dimensions, which default to `false` [c2m].
- With RBAC, `isVisible` is also ANDed with the member's per-context access [capi-rbac].

**What the gateway filters out**
- Outside dev mode, and unless the request is signed with the playground auth secret, the gateway drops every measure, dimension and segment whose `isVisible` is false.
- It also **drops a cube entirely** when nothing in it remains visible [gw-filter] [gw-meta].
- `?extended` applies the same filter [gw-ext].
- Result: members with `public: false` or `shown: false`, hidden primary keys, every member of a `public: false` cube, and RBAC-hidden members are all **missing**.

**Granularities.** A dimension's `granularities` lists only the entries defined in the model's `granularities`, as `{name, title, interval, offset, origin}`. The predefined `second`…`year` are not listed [c2m].

**Pre-aggregations.** Pre-aggregation names are not in the non-extended response; `?extended` adds `preAggregations` [gw-ext]. This matches the existing notes in `docs/research/cube/data-modeling.md` (Gotchas 5 and 9) and `docs/research/cube/access-control.md`; no corrections were found.

### Rules for resolving a rollup's references
Owning cube C. "Symbol" means a cube or view name, or a member (measure, dimension or segment) or pre-aggregation name of a cube.

1. **Split the entry on `.`.** A YAML entry that is a Python string literal is not a path:
   - the JS path accepts it unchecked
   - Tesseract resolves it only in the `` ${CUBE}.x `` form

   Treat string literals as unresolvable, except as index-column aliases [py-atom] [ts-sc].
2. **Resolve the first segment s0,** in Cube's order [cs-rs] [tp-ids]:
   1. `CUBE` or `TABLE` gives C.
   2. Otherwise a cube or view name gives that cube. Names collide: a cube name wins over a member of C with the same name.
   3. Otherwise a member of C gives the member `C.s0`.
   4. Otherwise it is unknown, and Cube raises `s0 is not defined`.
3. **Walk the remaining segments** with a current cube K [cs-proxy]:
   1. If `s` is a symbol of K (member or pre-aggregation), it is the member.
   2. Otherwise, if `s` is a cube or view name, it is a join hop: K becomes `s`.
   3. Otherwise it is unknown: `K.s cannot be resolved`.

   After a member, one more segment is allowed only when the member is a `time` dimension and the segment is a predefined or custom granularity of it. Anything else is unknown.
4. **The full name is `K.member`.** The join path is the list of cubes visited; a path starting from `CUBE` or an own-name prefix counts C. Cube matches against `path.join('.') + '.' + member` [cs-er] [pa-ear].
5. **Check the kind of each member by list** [ts-checks] [doc-td]:
   - `measures` must be a measure
   - `dimensions` must be a dimension
   - `segments` must be a segment
   - `time_dimension` and `time_dimensions[].dimension` must be a `time` dimension, **with no granularity suffix**
6. **Check `granularity`** (and `time_dimensions[].granularity`). It must be one of `second`…`year`, or a custom granularity defined on that dimension [doc-gran] [gran].
7. **Resolve `rollups`** the same way, then require the result to be an existing pre-aggregation, `cube.preAggName` [pa-ear].
8. **Resolve `indexes.*.columns`** with rules 2–3, without join paths [bq-idx]. Accept:
   - a member (dimension) that is one of the rollup's dimensions, written `X.dim` with no join path
   - the rollup's time dimension written `X.td.<its granularity>`
   - a string alias

   Refuse a join path or a time dimension without its granularity. Cube Store requires the column to exist in the rollup table [cstore].
9. **Check joins.** Every cube other than C must be reachable by joins from C [jg]. Checking each hop of an explicit path is UNVERIFIED (see Open questions).
10. **Check against the model, not `/v1/meta`.** `/v1/meta` omits hidden members and whole cubes outside dev mode, and omits predefined granularities [gw-filter] [c2m]. Build the member set from the model files, or from dev-mode or playground-signed `/v1/meta`.

## Gotchas
- **Pre-aggregation names share the member namespace.** A duplicate name is a compile error [cs-transform], and `CUBE.<preagg>` passes JS evaluation when used as a member.
- **Names of other cubes are resolved first.** An owning-cube member that has the same name as a cube is never reachable bare [cs-rs].
- **`CUBE.created_at.day` behaves differently by position.** In an index it is the documented form. In `dimensions` or `time_dimension` it is wrong [doc-idx] [ts-tests].
- **Bare identifiers that happen to exist in the vm context** (built-ins such as `Date`, or view-group names that `view_group` stores in the context [dsc]) are neither caught by the transpiler nor flagged by Cube. Rule 2 refuses them.

## Alternatives considered
Not requested.

## Open questions / unverified
1. Whether rollups that name view members build or match. Resolution accepts them.
2. The exact Tesseract error text for the symbol form (`CUBE.nope`) and for an unknown bare name. Inferred from source; the `CubeError` Display format was not checked. *Settled by the addendum.*
3. Whether the native (swc) transpiler treats unknown bare identifiers the same way as the JS transpiler. The Rust transpiler was not read.
4. Whether one bad rollup fails every query on its cube. No catch was found in the code, but it was not run. *Settled by the addendum.*
5. The error when a hop in an explicit path is not a join edge.
6. The exact alias format of non-time index columns, and the effect of `sql_alias`, beyond the documented `<cube>__<td>_<gran>`.
7. Whether measure columns are useful in regular indexes.

## Addendum: probed locally, 2026-09-22
The probes ran on a throwaway `cubejs/cube:v1.7.42` container (`CUBEJS_DEV_MODE=false`) against a scratch model; the full results are in `pre-aggregations.md`, "Observed locally". They settle open questions 2 and 4, and add:

- **One bad rollup fails every query on its cube.** `ReferenceError: nope is not defined` for a bare name; ``TesseractUserError: Error in `CUBE.nope`: Cannot resolve: nope`` for `CUBE.nope`.
- **`TABLE.count`, `TABLE.status` matched.**
- **`CUBE.ordered_at.day` failed in `dimensions`** (`Pre-aggregation dimension must be a dimension`) **and as `time_dimension`** (`Pre-aggregation time dimension must be a dimension`).
- **A `time_dimension` naming a `string` dimension failed** (`Pre-aggregation time dimension must be a dimension`).
- **A quoted `"'<cube>.count'"` in `measures` failed**: `'count' not found for path '<cube>.count' in pre-aggregation '<cube>.r'`.
- **`extends` in YAML is the parent's bare name** (`extends: p_table`). A child's rollup naming the parent's members (`CUBE.count`, `CUBE.status`) matched.

[B]: https://github.com/cube-js/cube/blob/v1.7.42
[ce-td]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L147-L157
[ce-compile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L221-L252
[ce-prep]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L730-L803
[ce-pas]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L930-L987
[ce-inst]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L1049-L1053
[ce-bypath]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L1071-L1103
[ce-epr]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L1165-L1196
[cs-const]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L279
[cs-compile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L314-L341
[cs-transform]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L556-L603
[cs-idx]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L786-L792
[cs-er]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1195-L1242
[cs-jh]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1264-L1279
[cs-rsc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1281-L1298
[cs-rs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1408-L1454
[cs-proxy]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1456-L1528
[cs-gran]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L1536-L1555
[tp-pat]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts#L26-L29
[tp-arrow]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts#L95-L126
[tp-visit]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts#L185-L214
[tp-ids]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts#L285-L318
[yc-transpile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts#L219-L304
[yc-parse]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts#L361-L374
[yc-arrow]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts#L376-L402
[py-atom]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/parser/PythonParser.ts#L185-L200
[cv-gran]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L461
[cv-idx]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L557-L565
[cv-rollup]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L640-L777
[dsc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts#L492-L520
[bq-native]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L366
[bq-rust]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L1007-L1054
[bq-idx]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4409-L4450
[pa-desc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L413-L441
[pa-find]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L919-L932
[pa-obj]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L1168-L1177
[pa-rpq]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L1359-L1387
[pa-ear]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L1441-L1515
[jg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts#L245
[gran]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/Granularity.ts#L48
[mstc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/MemberSqlTemplateCompiler.js#L81-L102
[ts-pac]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L87-L199
[ts-all]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L739-L751
[ts-refs]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L768-L861
[ts-checks]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L863-L898
[ts-tests]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/pre_aggregations_compiler.rs#L908-L1162
[ts-opt]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/optimizer.rs#L72-L95
[ts-sp]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/symbols/common/symbol_path.rs#L72-L194
[ts-scb]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/sql_call_builder.rs#L139-L151
[ts-sc]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/sql_call.rs#L591-L653
[env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts#L347-L353
[cstore]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/metastore/mod.rs#L1832-L1862
[cstore-agg]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cubestore/cubestore/src/metastore/mod.rs#L1977-L2009
[gw-filter]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L720-L735
[gw-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L770-L820
[gw-ext]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L839-L854
[gw-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L868-L896
[gw-jobs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1162
[capi-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts#L941-L948
[capi-rbac]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts#L983-L1049
[rs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L406-L505
[c2m]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts#L229-L376
[c2m-vis]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts#L400-L416
[doc-rj]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L288-L311
[doc-join]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L431-L470
[doc-md]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L502-L547
[doc-td]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L588-L661
[doc-gran]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L705-L708
[doc-lambda]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L1496-L1518
[doc-idx]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L1525-L1689
[doc-agg]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx?plain=1#L1737-L1779
