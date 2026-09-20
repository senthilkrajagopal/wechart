---
library: Cube Core query support for Spotfire-style markings (REST /v1/load filters, pre-aggregation matching, joins, caching)
packages: []
version: 1.7.42
researched: 2026-09-19
sources:
  [
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/query-format.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/queries.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/pre-aggregations/matching-pre-aggregations.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/multi-fact-views.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/joins.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/measures.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/dimension_matcher.rs,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts,
  ]
---

# Cube Core 1.7.42: query support for Spotfire-style markings

## Summary

**Scope.** This doc covers how wechart's markings (linked selections) map onto Cube Core 1.7.42 queries. It covers four areas:

- encoding a marking as REST filters
- pre-aggregation matching
- partial highlight
- cross-cube propagation, row-level markings, measure-value selections, security, caching and long polling

**What it traces to.** `docs/spec.md` does not exist yet, so there are no AC IDs to cite. The feature sources are:

- the user's §10 correction, which makes "Spotfire-style markings" a requirement ([input])
- design checklist items 13, 31 (Keep only / Exclude), 32 (Filter / Highlight / None matrix) and 33 (marking details tile with a nothing-marked state) ([design])
- the Spotfire marking notes in [design-refs]: intersection vs "Any marking", and an AND with filters

**Method.**

- Context7 tools were not available in this session. Every claim comes from the Cube repo at tag `v1.7.42` (docs in `docs-mintlify/`, and source), plus the sibling research docs.
- Tesseract (the Rust planner) is the default at 1.7.42 (`CUBEJS_TESSERACT_SQL_PLANNER` default `true`) ([env-doc], [src-env]). Pre-aggregation matching "always follows the SQL planner and can't be toggled independently" ([src-basequery]). So the Rust matcher is the one that decides pre-aggregation hits. This doc covers both the Rust matcher and the legacy JS matcher.

### Recommendations

**1. Encoding** (details in Q1)

- **Canonical form.** Store a marking as a sorted, de-duplicated set of tuples over `(member, value)`, where a time member also carries its granularity. Store the query timezone the marks were read in alongside it.
- **Compile per target tile, choosing the narrowest form that is still exact:**
  - One tuple: flat top-level filters, using a single-value `equals` per dimension and `notSet` for NULL.
  - One non-time member with many values: a single `equals` with many values. Add an `or` with `notSet` if NULL is marked.
  - Otherwise: `{"or":[{"and":[…]}, …]}`.
- **Time buckets:**
  - If every tuple shares one contiguous time span, move it out of the tuples into `timeDimensions[].dateRange`. That is the only date form that pre-aggregations match.
  - Otherwise, encode each bucket as `inDateRange` with `["<start>.000","<end>.999"]` inside its `and` group.
- **Never send an empty group.** Handle "nothing marked" explicitly (see Open questions).
- **Canonicalize order** (tuples and values) so identical markings produce identical SQL and hit Cube's cache.
- **Transport.** Let the SDK switch to POST on its own: it does so for URLs of 2000 characters or more.

**2. Partial highlight** (details in Q3)

- **Local derivation.** If every marking member is already a grouping key of the target tile, at a granularity that nests, compute the highlight locally with no extra query.
- **Otherwise, two regular REST queries:** `base` and `base ∧ marking`. Send them as one `/v1/load` array (a blending request) or as two loads.
  - This is the only option that is exact for every measure type (count distinct, avg, ratios, multi-stage), because Cube evaluates each measure at the tile's own grain.
  - The base result stays cached across marking changes.
- **Rejected options:**
  - The SQL API single-query route: its plan type is chosen by cubesql, pushdown disables pre-aggregations, and post-processing silently truncates at 50,000 rows.
  - "Grain expansion" (querying at tile ∪ marking dimensions and summing on the client): wrong for non-additive measures.

**3. Cross-cube applicability** (details in Q4)

- **Cheap prefilter** from `/v1/meta`:
  - For view tiles, the marking member (or a view member whose `aliasMember` is that member) must exist in the view.
  - For cube tiles, equal `connectedComponent` is **necessary but not sufficient**. It is computed on the _undirected_ join graph, while Cube resolves joins over _directed_ edges.
- **Authoritative check:** run the tile query plus the marking through `/v1/sql` (after RLS) or `/v1/dry-run` (before RLS). No database query is executed. A 400 containing `Can't find join path to join` means "not applicable". Cache the verdict per (tile member set, marking member set, model version).

**4. Model guidance for markable dimensions** (Q2)

- Add markable dimensions to rollup `dimensions`.
- Prefer additive measures (including `count_distinct_approx`).
- For time markings inside `or`, the rollup needs a bucket-valued dimension. `inDateRange` filters match only when the raw time dimension is in the rollup's `dimensions` ([match-doc]).

### Corrections to sibling research docs

1. **`data-apis.md` query table, `ungrouped` row ("Requires the primary keys of all cubes unless `allow_ungrouped_without_primary_key`").** At 1.7.42 the check is **off by default**.
   - `CUBEJS_ALLOW_UNGROUPED_WITHOUT_PRIMARY_KEY` defaults to the value of `CUBESQL_SQL_PUSH_DOWN`, which defaults to `'true'` ([src-env]).
   - The env doc's table says `false`, but its note says "When query push-down in the SQL API is enabled via `CUBESQL_SQL_PUSH_DOWN`, this option is enabled as well" ([env-doc]).
   - The server passes `this.options.allowUngroupedWithoutPrimaryKey || getEnv('allowUngroupedWithoutPrimaryKey')` ([src-server-core]).
2. **`data-apis.md` ("`connectedComponent` … at least one join path", Gotcha 16) and `data-modeling.md` ("members from the same component can be queried together").** Both overstate what the value means.
   - `connectedComponents()` walks `undirectedNodes`, but `buildJoinTreeForRoot` follows directed `graph.path()` ([src-joingraph]). Two cubes in one component can still fail with `Can't find join path` (see Q4).
   - The value is looked up by cube name in the join graph ([src-meta]). Views and cubes with no joins are not graph nodes, so from source reading they get no value (UNVERIFIED at runtime).
3. **`data-apis.md` operator table.** Add that `notEquals` and `notIn` automatically append `OR <col> IS NULL` unless `null` is among the values. Adding `null` to `equals`/`in` appends `OR <col> IS NULL` (Q1.6).
4. **`data-apis.md` open question "Top-level filter semantics".** New evidence: Cube's own RLS enforces access by pushing its filter as a new top-level `filters` entry (`query.filters.push(rlsFilter)`) ([src-compilerapi]). That only restricts rows if top-level entries are ANDed. The docs still don't state it, so keep the integration test.
5. **`pre-aggregations.md` §2.** It describes the JS matcher. The deciding matcher at 1.7.42 is Tesseract's `DimensionMatcher`/`MeasureMatcher`, which has Full/Partial match states (Q2). That doc's JS description is accurate for the legacy path.

## Install

No new packages; `packages: []`. The client surface is `@cubejs-client/core`/`react` as covered in [data-apis]. Server settings that affect markings (the docker-compose Cube service):

| Setting                                                     | Default at 1.7.42                                                       | Why it matters for markings                                                                                                              | Source                            |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `CUBEJS_MAX_REQUEST_SIZE`                                   | `50mb`; must be 100kb–64mb                                              | Caps POST bodies (`bodyParser.json({ limit })`) and WebSocket messages, and so the size of large IN-list markings                        | [src-env], [src-gw], [env-doc]    |
| `CUBEJS_DB_QUERY_DEFAULT_LIMIT` / `CUBEJS_DB_QUERY_LIMIT`   | 10,000 / 50,000                                                         | Row cap for raw-table tiles, and therefore for row-level markings. A larger explicit `limit` throws `The query limit has been exceeded.` | [src-env], [src-query], [queries] |
| `CUBEJS_ALLOW_UNGROUPED_WITHOUT_PRIMARY_KEY`                | inherits `CUBESQL_SQL_PUSH_DOWN` (`true`)                               | Primary-key check for `ungrouped`                                                                                                        | [src-env], [env-doc]              |
| `CUBEJS_TESSERACT_SQL_PLANNER`                              | `true`                                                                  | Selects the Rust planner and matcher                                                                                                     | [src-env], [src-basequery]        |
| `CUBEJS_PRE_AGGREGATIONS_ALLOW_NON_STRICT_DATE_RANGE_MATCH` | `true`                                                                  | Lets unaligned marking date ranges match coarser rollups ("slight potential data discrepancy")                                           | [pa-ref]                          |
| `CUBEJS_ROLLUP_ONLY`                                        | `false`                                                                 | If true, marking queries that miss rollups fail                                                                                          | [env-doc], [src-qo]               |
| Queue `concurrency`                                         | `2` (config doc); Postgres driver `getDefaultConcurrency()` returns `2` | Every marking change enqueues new queries                                                                                                | [config-doc], [src-pg]            |
| `continueWaitTimeout` / `orphanedTimeout`                   | 10 s / 120 s                                                            | Long polling, and cleanup of abandoned marking queries                                                                                   | [config-doc]                      |

## Init / auth pattern

Nothing marking-specific. Use the authenticated `cube(getToken, { apiUrl })` client from [data-apis]. Scopes for the probes:

- `/v1/dry-run` asserts the `data` scope ([src-gw]).
- `/v1/sql` asserts the `sql` scope ([src-gw]).

## API surface we will use

### Q1. Encoding a marking as Cube filters

**1.1 Grammar the server accepts** ([src-query])

- A filter is `oneFilter = {member|dimension, operator, values?}`, where `values: Joi.array().items(Joi.string().allow('', null), Joi.number(), Joi.boolean(), Joi.link('...'))`.
- A group is `oneCondition = {or: [...]} | {and: [...]}`. It is recursive through `Joi.link('...')`.
- The only logical operators are `or` and `and`. **There is no `not`.**
- The filter `member` must match `^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$`, i.e. `cube.member`. A time bucket like `orders.order_date.month` **cannot** be a filter member.
- `timeDimensions` objects (`dimension`/`granularity`/`dateRange`) are **not** accepted inside `filters`.
- `normalizeQueryFilters`:
  - throws `Values required for filter` when `values` is empty (except for `set`, `notSet` and `measureFilter`);
  - converts non-null values with `toString()`.

**1.2 An OR of AND-tuples with time buckets.** Date operators "can be placed inside `or`/`and` logical operators", and "the date predicate is emitted inside the corresponding logical group" ([qf]).

```json
{
  "measures": ["orders.revenue"],
  "dimensions": ["customers.region"],
  "timezone": "UTC",
  "filters": [
    {
      "or": [
        {
          "and": [
            { "member": "products.category", "operator": "equals", "values": ["Beverages"] },
            {
              "member": "orders.order_date",
              "operator": "inDateRange",
              "values": ["1997-03-01T00:00:00.000", "1997-03-31T23:59:59.999"]
            }
          ]
        },
        {
          "and": [
            { "member": "products.category", "operator": "equals", "values": ["Condiments"] },
            {
              "member": "orders.order_date",
              "operator": "inDateRange",
              "values": ["1997-04-01T00:00:00.000", "1997-04-30T23:59:59.999"]
            }
          ]
        }
      ]
    }
  ]
}
```

- **Bucket bounds.** Use the same form the SDK's own mark-to-filter translation uses. `ResultSet.drillDown` computes `dayRange(value, value, …).snapTo(granularity)` and formats both ends as `YYYY-MM-DDTHH:mm:ss.SSS` ([src-rs]).
- **Values are passed through unchanged.** Two absolute values in a filter are passed through as-is. Only single-element values are expanded: relative strings are resolved, and `YYYY-MM-DD` is padded to `T00:00:00.000`/`T23:59:59.999` ([src-query]).
- **Relative strings** are rejected unless `values` has one element ([src-query]).
- **Timezone.** Absolute timestamps are local to the query timezone ([qf], via [data-apis]). A marking made in timezone A and replayed in timezone B selects different instants (inference). Keep the marking's timezone with it.

**Factored form, when all tuples share one contiguous time span.** This is the pre-aggregation-friendly form (Q2). `timeDimensions.dateRange` "is always emitted as a global `AND` … and also drives granularity and pre-aggregation matching" ([qf]).

```json
{
  "timeDimensions": [
    {
      "dimension": "orders.order_date",
      "granularity": "month",
      "dateRange": ["1997-03-01T00:00:00.000", "1997-03-31T23:59:59.999"]
    }
  ],
  "filters": [
    { "member": "products.category", "operator": "equals", "values": ["Beverages", "Condiments"] }
  ]
}
```

- If the tile already has a `dateRange` on that dimension, intersect it with the marking's span on the client (inference).
- If both a `dateRange` and a date filter are set on the same member, "both predicates are emitted and `AND`-ed together" ([qf]).

**1.3 Limits on nesting and on the number of values**

- **Nesting depth:** I found no limit. I checked the Joi schema (`Joi.link` recursion with no depth option) and `normalizeQueryFilters` (plain recursion) ([src-query]), and the Tesseract filter compiler, which recurses over `or`/`and` ([src-ts-filtercomp]).
- **Number of values:** I found no `max()` on `values` ([src-query]). The practical limits are:
  - request size (1.4);
  - the database's bind-parameter count. The Postgres driver sends values as bind parameters (`conn.query({ text: query, values })`) ([src-pg]). The Postgres Bind message carries the parameter count in an `Int16` field ([pg-proto]). The exact ceiling Cube hits is UNVERIFIED.
  - Tesseract drops `null` from IN lists before allocating parameters (`filter(|v| !v.is_null())`) ([src-ts-fctx]).
- **Response size:** each `/v1/load` result echoes the normalized `query` (`LoadResponseResult.query`) ([data-apis]). Large markings therefore also enlarge responses.

**1.4 GET vs POST and request size**

- Both methods are registered:
  - GET reads `req.query.query` (a JSON string, `JSON.parse`d).
  - POST reads `req.body.query` through `bodyParser.json({ limit: getEnv('maxRequestSize') })` ([src-gw]).
- The REST reference says: "Use POST to fix problem with query length limits" ([rest-ref]).
- The SDK picks `method ?? this.method ?? (url.length < 2000 ? 'GET' : 'POST')` ([src-http]).
- The POST limit is `CUBEJS_MAX_REQUEST_SIZE`: default `50mb`, range 100kb–64mb. It also caps WebSocket payloads ([src-env], [env-doc]).
- The GET URL limit on the server (Node's header limit) is UNVERIFIED; the Node docs fetch was truncated.

**1.5 NULL semantics** (these matter for "Filter out")

| Filter                  | SQL (JS `BaseFilter` and Tesseract agree) | NULL rows    | Source                                                               |
| ----------------------- | ----------------------------------------- | ------------ | -------------------------------------------------------------------- |
| `equals ["A"]`          | `col = ?`                                 | excluded     | [src-basefilter], [src-ts-eq]                                        |
| `equals ["A","B"]`      | `col IN (?, ?)`                           | excluded     | [src-basefilter], [src-ts-typed], [src-ts-in]                        |
| `equals ["A", null]`    | `col IN (?) OR col IS NULL`               | included     | [src-basefilter], [src-ts-in]                                        |
| `equals [null]`         | `col IS NULL`                             | only NULLs   | [src-basefilter], [src-ts-typed]                                     |
| `notEquals ["A"]`       | `col <> ? OR col IS NULL`                 | **included** | [src-basefilter], [src-ts-eq]                                        |
| `notEquals ["A","B"]`   | `col NOT IN (?, ?) OR col IS NULL`        | **included** | [src-basefilter], [src-ts-in]                                        |
| `notEquals ["A", null]` | `col NOT IN (?)`                          | excluded     | [src-basefilter], [src-ts-in]                                        |
| `set` / `notSet`        | `IS NOT NULL` / `IS NULL`                 |              | [qf], [src-basefilter]                                               |
| `notInDateRange`        | JS: `col < from OR col > to`              | excluded     | [src-basequery]; the Tesseract template was not traced ([src-ts-dr]) |
| `notContains`           | adds `IS NULL` unless `null` is in values | included     | [qf]                                                                 |

The docs only say "use `notSet`" for NULL checks ([qf]). Putting `null` inside `values` is accepted by the schema and handled in source, but it is undocumented. **Emit `notSet`/`set` for documented behavior.**

**1.6 A marked NULL or empty value**

- **NULL:** use `{"member": m, "operator": "notSet"}`. This is what `drillDown` emits for a `null` clicked value ([src-rs]). With other values on the same member:

  ```json
  {
    "or": [
      { "member": "customers.region", "operator": "equals", "values": ["West"] },
      { "member": "customers.region", "operator": "notSet" }
    ]
  }
  ```

- **Empty string:** `equals [""]` (the schema allows `''`, [src-query]). It is distinct from NULL.

**1.7 "Filter out" (exclude the marked tuples).** With no `not`, apply De Morgan: NOT(OR over tuples of AND over members of `m = v`) becomes AND over tuples of OR over members of the negated predicate. Negations:

- `equals` → `notEquals`
- `notSet` → `set`
- `inDateRange` → `notInDateRange`

To keep NULL-dated rows, add `notSet` on the date inside each OR, because `notInDateRange` drops NULLs in the JS planner (inference from the SQL above).

```json
{
  "and": [
    {
      "or": [
        { "member": "products.category", "operator": "notEquals", "values": ["Beverages"] },
        {
          "member": "orders.order_date",
          "operator": "notInDateRange",
          "values": ["1997-03-01T00:00:00.000", "1997-03-31T23:59:59.999"]
        },
        { "member": "orders.order_date", "operator": "notSet" }
      ]
    }
  ]
}
```

**1.8 Several markings on one tile** (Spotfire "intersection" or "Any marking", [design-refs])

- Intersection: each marking is its own top-level `filters` entry. This relies on top-level entries being ANDed; see correction 4.
- Any marking: `{"or": [markingA, markingB]}`.

**1.9 Empty marking.** `{"or": []}` passes validation (no `min(1)`) ([src-query]), and both planners then drop it, which means no restriction:

- Tesseract's `get_item_type_from_vec([])` returns `Ok(None)`, so `add_item` skips it ([src-ts-filtercomp]).
- JS `BaseGroupFilter.filterToWhere` returns `null` for an empty group ([src-groupfilter]).

So "nothing marked" must be handled by wechart, never by sending an empty group. The nothing-marked behaviour is a product decision (see Open questions).

### Q2. Pre-aggregation matching with marking filters

**2.1 Which matcher decides.** `findPreAggregationForQuery()` calls `findPreAggregationForQueryRust()` when `useNativeSqlPlanner && canUseNativeSqlPlannerPreAggregation`. The latter is `useNativeSqlPlanner && !neverUseSqlPlannerPreaggregation()` ([src-pa-js], [src-basequery]). With the default env, the Rust matcher decides.

**2.2 Tesseract rules** ([src-ts-dimmatch], [src-ts-opt], [src-ts-measmatch])

- **Match states.** `DimensionMatcher.try_match` walks query dimensions, time dimensions, `filters`, time-dimension filters and segments, and combines `MatchState` values. Any `NotMatched` wins, then `Partial`, then `Full`.
- **Filter members.** Every filter member, including members nested in `or`/`and`, is resolved with `try_match_symbol`. A member owned by the cube that is not in the rollup's `dimensions` (or `segments`) returns `NotMatched`, and that rollup is rejected.
- **Coverage.** A rollup dimension counts as "covered" only if one of these holds:
  - it is a query grouping dimension;
  - it is a single-value `equals` filter (`is_single_value_equal`: one value and operator `Equal`) that is not under an OR. The code is `add_to_matched_dimension && group.operator == FilterGroupOperator::And`.

  `result()` downgrades to `Partial` when any rollup dimension, time dimension or segment is uncovered.

- **Partial matches.** A `Partial` match is rejected if the query has multiplied measures. Otherwise `MeasureMatcher` runs with `only_additive = true`, and non-additive measures (`count_distinct`, `avg`) fail: `pre_aggregation_measures.contains(..) && (!self.only_additive || measure.is_additive())`.
- **Member expressions** (`MemberSymbol::MemberExpression`) never match a rollup measure.
- **Time filters.** Filters that carry a `TimeDimension` symbol (from `timeDimensions.dateRange`) go through `try_match_time_dimension` against rollup `time_dimension` entries. With `allow_non_strict_date_range_match`, the query granularity is used as-is; otherwise `rollup_granularity()` derives it from range alignment. A filter-level `inDateRange` on `orders.order_date` resolves to a plain `Dimension` symbol, so it needs that raw dimension in the rollup's `dimensions`.

**2.3 JS matcher (legacy path)** ([src-pa-js])

- `transformQueryToCanUseForm` puts filter members (via `getMembers()`, which recurses through groups, [src-groupfilter]) into `sortedDimensions`.
- **Additive path:** requires `sortedDimensions ⊆` rollup dimensions.
- **Non-additive path:** requires `allFiltersWithinSelectedDimensions && R.equals(rollupDims, sortedDimensions)`, or that every rollup dimension is a single-value equality. `collectFilterDimensionsWithSingleValueEqual` returns `null` as soon as it meets an `or`, which disables that route.

**2.4 Answers to the three questions**

| Question                                                                                | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does a nested `or`/`and` of dimension filters match a rollup that has those dimensions? | **Yes, if every filter member is a rollup dimension or segment.** But members referenced only inside `or`, or through multi-value `equals`, don't count as covered. So when the rollup has dimensions beyond the tile's grouping, the match is `Partial`: additive measures only, and no multiplied measures ([src-ts-dimmatch], [src-ts-opt], [src-ts-measmatch]). A **single-tuple** marking sent as flat top-level single-value `equals` filters _is_ covered, so it can match an exact rollup even for `count_distinct` (same code).         |
| Does a time-bucket filter at the rollup's granularity match?                            | **Via `timeDimensions[].dateRange`: yes.** Rollup granularity matching applies, and a month-aligned range matches month-or-finer rollups ([qf], [src-ts-dimmatch]). **Via `inDateRange` in `filters` (inside or outside `or`): no**, unless the raw time dimension is in the rollup's `dimensions`. Docs: "A date range expressed as a filter is applied as a generic dimension filter, so it matches only when that time dimension is also listed in the pre-aggregation's `dimensions`" ([match-doc]); also the `inDateRange` warning in [qf]. |
| What if the marking uses a dimension the rollup lacks?                                  | That rollup is `NotMatched` ([src-ts-dimmatch]). Cube tries the remaining candidates, first match wins ([pre-aggs]). With none left, the query runs against the source and `usedPreAggregations` is absent ([pre-aggs]). With rollup-only mode it fails: `No pre-aggregation table has been built for this query yet…` ([src-qo]).                                                                                                                                                                                                               |

**Time markings inside `or` and rollups (options for the user; model design, not decided).**

- Option (a): add the raw time dimension to rollup `dimensions`. That makes the rollup row-grain in time.
- Option (b): add a derived bucket dimension (for example a truncated-month dimension) to the rollup and have wechart filter it with `equals`. This is inference; timezone behaviour of such a dimension is UNVERIFIED.
- Option (c): accept source-database execution for multi-bucket markings.

### Q3. Partial highlight: options compared

"Total per mark" is the tile's base query. "Marked portion per mark" is the same query restricted to the marking.

| Option                                                                                                                                                                                   | Non-additive measures (count distinct, avg, ratios)                                                                                                                         | Pre-aggregation hits                                                                                                                                                                          | Caching                                                                                                                | Consistency                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Local derivation.** Every marking member is a grouping key of the tile, at a nesting granularity                                                                                    | Exact: each tile row is entirely in or entirely out of the predicate (inference). Week does not nest in month                                                               | Base only                                                                                                                                                                                     | Base only                                                                                                              | Single result                                                                                                                                                                               |
| **B. Two regular REST queries** (`base`, `base ∧ marking`), either as `cubeApi.load([base, marked])` (blending, `queryType=multi`) or as two loads. **Recommended when A doesn't apply** | **Exact.** Cube computes every measure at the tile grain with the marking in `WHERE`                                                                                        | Base: as usual. Marked: needs the marking members in the rollup; `Partial` means additive only (Q2)                                                                                           | Base SQL doesn't change, so it keeps hitting the cache. Marked is cached per canonical marking ([cache-doc], [src-qc]) | Two executions. A refresh can land between them (compare `lastRefreshTime` / `usedPreAggregations[].lastUpdatedAt`; inference)                                                              |
| C. "Grain expansion": one query at tile ∪ marking dimensions, re-aggregated on the client                                                                                                | **Wrong** for non-additive measures (inference from non-additivity, [pre-aggs]). Exact only for sum/count/min/max                                                           | The query dimensions equal the rollup's, so non-additive measures can match, but the re-aggregation is still wrong                                                                            | One cache entry per marking member set                                                                                 | Single result. Row count grows with the product of cardinalities, under the 50,000 cap ([queries])                                                                                          |
| D. SQL API single query (`SUM(CASE WHEN … THEN … END)` via `/v1/cubesql`)                                                                                                                | Depends on the plan cubesql picks. Before 1.7.33, `COUNT(DISTINCT measure) + MAX(CASE …)` "silently return[ed] 1 per group" (fixed by [pr11737], in 1.7.33 per [changelog]) | Pushdown "do[es] not use pre-aggregations" ([sql-index]). CASE is ❌ for "Inner (selections)" in post-processing ([sql-ref]). Tesseract never matches member expressions ([src-ts-measmatch]) | In-memory cache only for pushdown ([sql-index])                                                                        | Single result, but post-processing reads a regular query "cut off at 50,000 rows … the result can be incorrect without any error being raised" ([sql-qf])                                   |
| D′. REST `PatchMeasure` member expression (`{type:'PatchMeasure', sourceMeasure, replaceAggregationType, addFilters}`)                                                                   | Would be a filtered measure                                                                                                                                                 | UNVERIFIED                                                                                                                                                                                    | UNVERIFIED                                                                                                             | **Internal and undocumented.** It exists only in the Joi schema ([src-query]). [i10294] reports a deserialization failure on 1.6.1                                                          |
| E. Multi-stage measure with `filter: {exclude: [...]}` (the documented "share of total" pattern)                                                                                         | Exact for the listed members                                                                                                                                                | Subqueries match independently, all-or-nothing ([pre-aggs])                                                                                                                                   | Per query                                                                                                              | The `exclude` list is **static in the model**, so it can't follow arbitrary markings ([measures-ref], [share-recipe]). Whether marks with no marked rows keep their total row is UNVERIFIED |
| F. Measure `filters` (static SQL) or `FILTER_PARAMS` parameter tricks                                                                                                                    | Static only ([measures-ref]). The FILTER_PARAMS recipe applies "a single value" from the query through a self-join CTE ([dynparam-recipe])                                  | UNVERIFIED                                                                                                                                                                                    |                                                                                                                        | Does not generalise to OR-of-tuples markings                                                                                                                                                |

**Details for option B:**

- **Array requests.** A `/v1/load` array becomes a `BLENDING_QUERY`. All queries run in one request (`Promise.all` over `getSqlResponseInternal`). The only extra validation is `Data blending query granularities must match` on each query's first time-dimension granularity, which base and marked share ([src-gw], [src-query]).
- **Reading results.** Read them with `resultSet.decompose()`; `rawData()` throws for multi-result responses ([data-apis]).
- **Failures are shared.** If the marked query errors (for example no join path), the whole array fails. Run the applicability check (Q4) first, or send two loads (inference).
- **Keep the base visible.** Set `useCubeQuery(..., { resetResultSetOnChange: false })` for highlight tiles so the base stays on screen while the marked query loads ([data-apis]).

### Q4. Propagating a marking across cubes

**4.1 How Cube resolves joins** ([src-joingraph], [joins-doc])

- **Directed edges.** "All joins are directed". The source cube is the left side of a `LEFT JOIN` ([joins-doc]).
- **Root choice.** `buildJoin(cubesToJoin)` tries **every** queried cube as the root. `buildJoinTreeForRoot` then needs a directed `graph.path(prevNode, toJoin)` from that root to every other cube. The tree with the fewest joins wins.
- **Consequences:**
  - A tile on `customers` with a marking on `orders.status` works if `orders → customers` exists, because root `orders` reaches `customers`.
  - Two "sibling" cubes that only join _into_ a shared cube (A→B, C→B) cannot be combined. No root reaches both, so the error is `Can't find join path to join 'A', 'C'`.
- **Tesseract** calls the same JS join graph through the native bridge trait `JoinGraph::build_join` ([src-ts-jg]).

**4.2 Views**

- A view fixes the path: "Views eliminate this ambiguity by specifying the exact `join_path`" ([views-doc]).
- A marking can reach a view tile only through a member the view includes. `/v1/meta` view members carry `aliasMember`, the original cube path ([data-modeling]). Map a marking on `products.category` to the view member whose `aliasMember` is `products.category`.
- Whether a REST query may mix view members with raw cube members is UNVERIFIED: I found no statement in [view-ref] or [views-doc].

**4.3 Multi-fact tiles** (measures from two facts)

- "Every grouped dimension, filter and segment has to be reachable from all facts, so a query that carries one fails with `Can't find join path to join …`."
- "Common dimension filters … are applied to every subquery." A marking on a shared dimension is therefore fine.
- A marking on one fact's own dimension fails, unless only that fact's measures are requested.

Source: [multifact-doc].

**4.4 Error when there is no path**

- JS throws `UserError` with ``Can't find join path to join ${cubesToJoin.map(v => `'${v}'`).join(', ')}`` ([src-joingraph]).
- The gateway maps a `UserError` to HTTP 400 with body `{ type: 'UserError', error, plainError, stack?, requestId? }` ([src-gw]).
- Whether the Tesseract path surfaces it as the same `UserError` type and status is UNVERIFIED. Match on the message substring.

**4.5 Detecting applicability up front**

- **`/v1/meta` `connectedComponent`:**
  - It **is** exposed per cube config: `connectedComponent: this.joinGraph.connectedComponents()[cubeName]` ([src-meta]).
  - Doc wording: "If the same value is returned for two cubes, then there is at least one join path between them" ([rest-ref]).
  - Source: components come from `findConnectedComponent` over `undirectedNodes` ([src-joingraph]), so the value ignores direction. Use it only to rule out ("different component, never applicable").
  - Views and join-less cubes have no graph node, so the value is absent (source reading; UNVERIFIED at runtime).
- **`/v1/meta?extended`:** exposes per-cube `joins` (`[{name, relationship, sql}]`) ([data-modeling]). Re-implementing `buildJoin` on the client would duplicate Cube's algorithm (roots, fewest joins, join hints, views). Use the server as the authority instead.
- **Authoritative probe:** `/v1/sql` or `/v1/dry-run` with the tile query plus the marking filter. Both call `compilerApi.getSql()`, which builds the join ([src-gw]).
  - `/v1/sql` uses the post-RLS / post-`queryRewrite` queries.
  - `/v1/dry-run` uses the pre-RLS normalized queries (the third element returned by `getNormalizedQueries`) ([src-gw], [access-control]).
  - The verdict depends only on member names, not values (inference), so cache it per member set and model version.
  - The `/v1/sql` SQL text also shows whether a rollup would be hit ([pre-aggs]).

### Q5. Row-level marking (raw table tiles)

- **Ungrouped queries.** `ungrouped: true`: "Cube will not add the `GROUP BY`", and measures render unaggregated ([queries]).
- **Primary-key check.** `initUngrouped()` throws `Ungrouped query requires primary keys to be present in dimensions: … Pass allowUngroupedWithoutPrimaryKey option to disable this check.` when the option is falsy ([src-basequery]). The effective default at 1.7.42 is **on (check disabled)**; see correction 1.
  - wechart still needs the primary keys in the query to identify marked rows.
- **Measure filters** throw `Measure filters aren't allowed in ungrouped query` ([src-basequery]).
- **Primary-key visibility.** "Setting `primary_key` to `true` will change the default value of the `public` parameter to `false`" ([dims-ref]). Hidden members are omitted from `/v1/meta` outside dev mode ([access-control]).
  - Primary keys used for marking must be `public: true`, or included in the view ([data-modeling]). Otherwise wechart can neither discover nor query them.
  - Composite keys are allowed ("more than one primary key dimension", [dims-ref]). Encode a composite-key marking as an OR of AND-tuples.
- **Limits.**
  - The default is 10,000 rows. The maximum is 50,000; a larger explicit `limit` throws `The query limit has been exceeded.` ([queries], [src-query], [src-env]).
  - `total: true` clones the query, strips `order`/`limit`/`rowLimit`/`offset`, and runs `select count(*) … from (<sql>)` ([src-gw], [src-basequery]). This works for ungrouped SQL too.
- **Applying a primary-key marking to aggregated tiles.**
  - **Yes**, as a dimension filter: `equals` with the key values, or tuples for composite keys. It is subject to Q4 join reachability.
  - Over a join, the filter keeps only rows linked to marked rows; Cube's primary-key-based fan-out handling keeps measures deduplicated (inference from [data-modeling] joins).
  - Pre-aggregations need the primary key in rollup `dimensions` (Q2), which row-grain keys usually aren't, so expect source-database execution.
- **Ungrouped rollups** must contain the primary keys of all involved cubes ([pre-aggs]).

### Q6. Measure-value selections (rectangle on a scatter)

- **Recommendation: encode the rectangle as the set of point identities** (the scatter's grouping tuples, e.g. customer IDs), read from the scatter's own result rows. Encode it as an `equals` list or tuples.
- **Why not a measure filter (inference from documented semantics):**
  - A measure filter is `HAVING` at _the receiving tile's_ grain: "When you filter on a measure, you are restricting the results after the measure has been calculated" ([qf]).
  - `revenue BETWEEN a AND b` on a region tile filters regions, not the marked customers.
  - Multi-fact queries apply measure filters "as `HAVING` conditions after the subqueries are joined" ([multifact-doc]).
- **Limits of measure filters:**
  - Operators on measures: `equals`, `notEquals`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet` ([qf] via [data-apis]); `measureFilter` is special.
  - Not allowed in ungrouped queries ([src-basequery]).
  - For pre-aggregations, the filtered measure must be in the rollup. JS adds `measureFilters` to matched measures ([src-pa-js]); Tesseract adds filter measures via `all_measures(schema, filters)` ([src-ts-opt]).
- **Mixing inside a logical operator:** confirmed not allowed.
  - Docs: "You can not put dimensions and measures filters in the same logical operator" ([qf]).
  - Tesseract: `You cannot use dimension and measure in same condition` from `get_item_type_from_vec` ([src-ts-filtercomp]).
  - Measure and dimension filters may sit side by side as separate top-level entries.
  - A `measureFilter`-operator item is classified as a _dimension_ filter ([src-ts-filtercomp]).
- **Model-level alternative for the user to consider.** Expose the per-customer measures as `sub_query: true` dimensions on `customers` ([dims-ref]). The rectangle then becomes `gte`/`lte` dimension filters that propagate by join.
  - Caveat: the subquery value ignores query filters unless `propagate_filters_to_sub_query: true` ([dims-ref]). It must equal what the scatter plotted.
  - Pre-aggregation behaviour is UNVERIFIED.

### Q7. Security and caching

- **RLS and `queryRewrite`.** `getNormalizedQueries` works in this order ([src-gw], [src-compilerapi]):
  1. `compilerApi.applyRowLevelSecurity`, which pushes the RLS filter as a new top-level `filters` entry, or adds a `1 = 0` segment on denial.
  2. `queryRewrite(queryWithRlsFilters, context)`, skipped when denied.
  3. `normalizeQuery`, which validates again.

  Marking filters are ordinary `filters` entries, so Cube passes them through unchanged, and RLS still applies. Only wechart's own `queryRewrite` code could alter them. Unresolved points:
  - Whether members used _only_ in filters count as "queried members" for policy selection. `applyRowLevelSecurity` derives members from `getSql(...).memberNames` ([src-compilerapi]); `collectAllMemberNames` was not traced. UNVERIFIED.
  - How filters on _masked_ members behave: the policy docs don't cover it ([dap-doc]). UNVERIFIED.
  - A marking member hidden from the tile's user fails. The REST member-level denial is currently HTTP 500 ([access-control]).

- **Cache keys.**
  - Docs: "The cache key is a generated SQL statement with any existing query-dependent pre-aggregations", and a cached value is returned if "the `refresh_key` value for the query hasn't changed" ([cache-doc]).
  - Source: `[query, values, preAggregations.map(p => p.loadSql)]` is hashed. The in-memory LRU holds `maxInMemoryCacheEntries || 10000` entries, and an entry is unusable after `IN_MEMORY_CACHE_DISABLE_PERIOD` = 5 minutes ([src-qc]).
  - Every new marking means new SQL or params, so the marked query misses the cache on first use. Re-marking the same set hits only if the canonical encoding produces identical SQL and parameter order (inference). The default `refresh_key` on Postgres is `every: 10 second` ([cache-doc]).
- **Queue keys and deduplication.** `queue.executeInQueue('query', cacheKey, …)`: the queue key is the cache key ([src-qc]). Identical concurrent tile queries share one execution, and "Subsequent calls … are idempotent" ([rest-index]).
- **Long polling (`Continue wait`).** Two documented causes: "The maximum concurrency is reached" and heavy queries ([rest-index]). Concurrency defaults to 2 ([config-doc], [src-pg]). A dashboard re-querying N tiles (×2 for highlight) on each marking change can queue work and return `Continue wait` after `continueWaitTimeout` (10 s) ([config-doc]).
  - **Superseded loads.** `useCubeQuery` passes `mutexObj`/`mutexKey: 'query'`. A superseded load stops polling at its next `Continue wait` (`checkMutex` throws) ([src-react-query], [src-client-index]), but the HTTP request isn't aborted ([data-apis]).
  - **Server side,** the abandoned query is "marked for cancellation if not requested during" `orphanedTimeout` (120 s) ([config-doc]), and it holds a slot until then or until it finishes.
  - **Mitigations (inference):** debounce marking bursts; cancel superseded requests with `DELETE /v1/running-query/{requestId}` ([data-apis]); put markable dimensions in rollups.

### Q8. Cube features that resemble markings

None implements linked selection. The related pieces:

| Feature                                      | Relation to markings                                                                                                                                                                                                                | Source                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `ResultSet.drillDown(locator)` (client)      | Translates one clicked point into `equals`/`notSet` filters plus a snapped `timeDimensions.dateRange`. This is the SDK's reference mark-to-filter mapping for a single tuple. It throws for compare-date-range and blending results | [src-rs]                           |
| Segments                                     | Static, named `WHERE` predicates; not dynamic                                                                                                                                                                                       | [data-modeling]                    |
| `FILTER_PARAMS`                              | Pushes a query filter into cube SQL; one recipe uses it to parameterize a calculation without filtering all rows                                                                                                                    | [dynparam-recipe], [data-modeling] |
| Multi-stage `filter` / `grain`               | Share-of-total: drops or keeps query filters per measure; static                                                                                                                                                                    | [measures-ref], [share-recipe]     |
| View `default_filters`                       | Static governance filters "applied to every query against the view"                                                                                                                                                                 | [view-ref]                         |
| Dimension `links` / Cloud dashboard drill-in | "a drill-in link (`dashboard:`) navigates to another dashboard … filtered by the values in the clicked row" (Cube Cloud dashboards)                                                                                                 | [dash-doc]                         |

## Gotchas

1. **`inDateRange` in `filters` defeats rollups** unless the raw time dimension is a rollup dimension ([match-doc], [qf]). Only `timeDimensions.dateRange` drives rollup granularity matching.
2. **Filter members cannot carry a granularity** (`cube.member` only, [src-query]). Time buckets must be expressed as `[start, end]` ranges.
3. **`notEquals`/`notIn` keep NULL rows** (`OR col IS NULL`) unless `null` is in `values`. `notInDateRange` drops NULL rows in the JS planner ([src-basefilter], [src-ts-in], [src-basequery]). Filter-out results differ by operator.
4. **No `not` operator.** Filter-out needs De Morgan (Q1.7) ([src-query]).
5. **`{or: []}` means "no filter"**, not "no rows" ([src-query], [src-ts-filtercomp], [src-groupfilter]). An empty `values` array throws instead ([src-query]).
6. **OR markings and multi-value `equals` give only `Partial` rollup matches.** Non-additive measures fall back to the source ([src-ts-dimmatch], [src-ts-measmatch]). Single-tuple markings encoded as flat single-value `equals` avoid this.
7. **Non-strict date-range matching (default `true`)** trades exactness for hits: "at the cost of a slight potential data discrepancy" ([pa-ref]). A marking range finer than, or unaligned with, the rollup granularity can be served from coarser buckets (magnitude is inference; verify with `/v1/sql`).
8. **`connectedComponent` is undirected and absent for views** (source reading) ([src-joingraph], [src-meta]). Don't treat it as "joinable".
9. **Multi-fact tiles reject fact-specific marking members** with `Can't find join path to join …` ([multifact-doc]).
10. **Primary keys are `public: false` by default** ([dims-ref]). Row-level markings need them public, and hidden primary keys don't appear in `/v1/meta` outside dev mode ([access-control]).
11. **The ungrouped primary-key check is off by default at 1.7.42** through the `CUBESQL_SQL_PUSH_DOWN` default chain ([src-env], [env-doc]). Don't rely on Cube to reject key-less raw queries.
12. **Blending arrays fail as a unit**, and `rawData()` throws on multi results. Use `decompose()` ([src-gw], [data-apis]).
13. **Cache hits need byte-identical SQL and params**, so canonicalize tuple and value order ([src-qc], [cache-doc]).
14. **Default queue concurrency is 2**, abandoned queries linger up to 120 s, and `useCubeQuery` never aborts HTTP ([config-doc], [src-pg], [data-apis]).
15. **Rollup-only mode turns every non-matching marking query into an error** ([src-qo]).
16. **SQL API conditional aggregates** can hit pushdown (no pre-aggregations) or post-processing (silent 50,000-row truncation) ([sql-index], [sql-qf]).
17. **Large markings enlarge requests and responses.** POST caps at `CUBEJS_MAX_REQUEST_SIZE` ([src-env]), and responses echo the normalized query ([data-apis]).

## Alternatives considered

The caller asked for a comparison of partial-highlight strategies; it is the table in Q3. Option B is recommended when option A doesn't apply. The reasons are correctness for all measure types and a base-query cache that survives marking changes. Options C, D, D′, E and F are rejected or limited for the correctness, pre-aggregation and documentation-status reasons given in the table.

## Open questions / unverified

- **Product decisions for the user:**
  - The nothing-marked state for "limit" tiles. Spotfire offers empty, all data, or a message ([design-refs]); design item 33 says "configurable" ([design]).
  - What "marked portion" means for non-additive measures (avg, ratios). The marked value can exceed the total, so a stacked partial bar can't show it.
  - The timezone policy when tiles differ.
  - Whether modelers should add bucket dimensions or `sub_query` dimensions to support time and measure markings on rollups (Q2, Q6).
- UNVERIFIED: whether the Tesseract path returns HTTP 400 `UserError` for `Can't find join path` (JS source only). Test with `/v1/dry-run`.
- UNVERIFIED: that views and join-less cubes have no `connectedComponent` in `/v1/meta` (source reading of [src-meta], [src-joingraph]).
- UNVERIFIED: whether REST queries may mix view members with raw cube members; no documentation found.
- UNVERIFIED: the Tesseract SQL template for `notInDateRange`. Only the JS `timeNotInRangeFilter` was read ([src-basequery], [src-ts-dr]).
- UNVERIFIED: the effective maximum number of `equals` values per query against Postgres. The bind count is an `Int16` field ([pg-proto]); not tested.
- UNVERIFIED: the Node GET URL/header limit inside the Cube 1.7.42 image (Node 24.21.0 per [pre-aggs]). The Node docs fetch was truncated.
- UNVERIFIED: whether filter-only members trigger that cube's access-policy row filters (`getSql().memberNames` via `collectAllMemberNames` not traced) ([src-compilerapi]).
- UNVERIFIED: how filters on masked members behave ([dap-doc] silent).
- UNVERIFIED: `ResultSet.drillDown`/`dayRange().snapTo()` for **custom** granularities, which affects computing bucket ends ([src-rs]).
- UNVERIFIED: whether multi-stage `filter.exclude` keeps marks that have zero marked rows (option E).
- UNVERIFIED: `PatchMeasure` semantics and support status (internal; [i10294]).
- UNVERIFIED: whether top-level `filters` entries are always ANDed. Evidence exists (correction 4), but the docs don't say it. Integration test needed.
- Not researched: a GraphQL encoding of markings (REST is the chosen transport, [data-apis]).

[input]: ../../inputs/2026-09-19-product-direction.md
[design]: ../../design/direction.md
[design-refs]: ../../design/references.md
[data-apis]: ./data-apis.md
[pre-aggs]: ./pre-aggregations.md
[access-control]: ./access-control.md
[data-modeling]: ./data-modeling.md
[qf]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/query-format.mdx
[rest-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[rest-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[queries]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/queries.mdx
[sql-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[sql-qf]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/query-format.mdx
[sql-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/reference.mdx
[env-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[config-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[match-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/pre-aggregations/matching-pre-aggregations.mdx
[cache-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/pre-aggregations/index.mdx
[pa-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[joins-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/joins.mdx
[multifact-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/multi-fact-views.mdx
[views-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/views.mdx
[view-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/view.mdx
[measures-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/measures.mdx
[dims-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[dap-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/data-access-policies.mdx
[share-recipe]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/data-modeling/share-of-total.mdx
[dynparam-recipe]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/data-modeling/passing-dynamic-parameters-in-a-query.mdx
[dash-doc]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/explore-analyze/dashboards/index.mdx
[changelog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[src-query]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js
[src-gw]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[src-server-core]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[src-compilerapi]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts
[src-pa-js]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
[src-basequery]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[src-basefilter]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseFilter.ts
[src-groupfilter]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseGroupFilter.ts
[src-joingraph]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts
[src-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[src-ts-dimmatch]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/dimension_matcher.rs
[src-ts-measmatch]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/measure_matcher.rs
[src-ts-opt]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/optimizer.rs
[src-ts-filtercomp]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/filter/compiler.rs
[src-ts-typed]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/filter/typed_filter.rs
[src-ts-eq]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/physical_plan/filter/operators/equality.rs
[src-ts-in]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/physical_plan/filter/operators/in_list.rs
[src-ts-fctx]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/physical_plan/filter/operators/filter_sql_context.rs
[src-ts-dr]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/physical_plan/filter/operators/date_range.rs
[src-ts-jg]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubesqlplanner/cubesqlplanner/src/cube_bridge/join_graph.rs
[src-qc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts
[src-qo]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[src-pg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[src-http]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/HttpTransport.ts
[src-client-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[src-rs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/ResultSet.ts
[src-react-query]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-query.ts
[pg-proto]: https://www.postgresql.org/docs/current/protocol-message-formats.html
[i10294]: https://github.com/cube-js/cube/issues/10294
[pr11737]: https://github.com/cube-js/cube/pull/11737
