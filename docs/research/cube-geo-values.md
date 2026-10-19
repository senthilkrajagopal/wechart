---
packages: ['@cubejs-client/core']
version: 1.7.45
researched: 2026-10-18
---

# Cube geo dimension values

For T976 and T977 (AC-625, AC-626): the shape of a Cube `type: geo` dimension's value in a `/v1/load` row, and what `/v1/meta` says of it.

**Pinned version.** `docker-compose.yml` pins `ghcr.io/senthilkrajagopal/xcube:v1.7.45-bb188d8ada@sha256:9602…`. The source was read at the local fork `~/Work/bi/cube` (branch `feat/xcube`, `packages/cubejs-client-core/package.json` 1.7.45); that its HEAD is `bb188d8ada` is unconfirmed. Upstream links use the `v1.7.45` tag. Only wechart's server calls Cube (`docs/research/cube/data-apis.md`); no wechart package imports `@cubejs-client/core`, whose facts below are reference only.

## Summary

A `type: geo` dimension is declared with `latitude: { sql }` and `longitude: { sql }`, not `sql`. Both SQL planners compile it to one string expression, **`<latitude> || ',' || <longitude>`** in the dialect's concatenation. A geo value therefore reaches the client as **one string `"lat,lng"`, latitude first**, in one column under the member's name — never an object or two columns. Nothing after the database reformats it (only `time` values are). `/v1/meta` and the load annotation report `type: "geo"`. Cube has no GeoJSON or WKT output.

## Declaring one

- "Geographic coordinates. Requires `latitude` and `longitude` sub-parameters instead of `sql`." ([dimensions.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/dimensions.mdx)), with the example `type: geo`, `latitude: { sql: "{CUBE}.latitude" }`, `longitude: { sql: "{CUBE}.longitude" }`.
- Validation: `type` one of `string, number, boolean, time, geo`; the geo alternative needs both `latitude.sql` and `longitude.sql` and no `sql` (`packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts` L352, L1035–1042). Always write `{ sql: … }`; the bare shorthand doesn't pass the JS compiler (inferred from `CubePropContextTranspiler.ts` L14–16).

## The value in a `/v1/load` row

- JS planner: `BaseQuery.evaluateSymbolSql` → `concatStringsSql([latitude, "','", longitude])` (`packages/cubejs-schema-compiler/src/adapter/BaseQuery.js` L3519–3524).
- Tesseract (the default planner): `GeoDimensionSqlNode` → `templates.concat_strings([latitude, "','", longitude])` (`rust/cube/cubesqlplanner/cubesqlplanner/src/physical_plan/sql_nodes/geo_dimension.rs` L39–53); its own test asserts `latitude || ',' || longitude` (`src/tests/cube_evaluator/symbol_evaluator.rs` L26).
- Concatenation by dialect: `||` by default and on Postgres (`BaseQuery.js` L3703–3705, L4743); `CONCAT` on MySQL, BigQuery and Cube Store; `+` on MSSQL; `toString(a) || …` on ClickHouse.
- Cube's own tests: Postgres `DECIMAL` gives `'120.120,40.60'` (`test/integration/postgres/sql-generation.test.ts` L3356–3368); Postgres `NUMERIC(10,6)` gives `40.712776,-74.005974` (`…advanced_features__geo_query.snap`); ClickHouse `Float64` gives `'120.12,10.6'` (`test/integration/clickhouse/clickhouse-graph-builder.test.ts` L1095–1108). **The digits are the database's own text cast**, so they vary by column type and dialect.
- No post-processing: the orchestrator rewrites only `time` members (`rust/cube/cubeorchestrator/src/query_result_transform.rs` L178–223); `packages/cubejs-api-gateway/src` has no geo handling.
- **Nulls (inferred):** on Postgres the whole value is `null` when either coordinate is, since `text || text` is strict ([CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html), STRICT). `CONCAT` dialects may instead ignore a null part ([string functions](https://www.postgresql.org/docs/current/functions-string.html)); unverified for MySQL, BigQuery and Cube Store.

## `/v1/meta` and the annotation

- `/v1/meta` reports `"type": "geo"` (`dimensionDataType` rewrites only `switch`, `packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts` L313, L320, L426–428). The latitude and longitude SQL aren't exposed, extended meta included (`packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts` L58–66).
- The `/v1/load` annotation copies `type` (`prepare-annotation.ts` L60–67).
- `@cubejs-client/core`'s `TCubeMemberType` lacks `'geo'` (`packages/cubejs-client-core/src/types.ts` L404); wechart's own meta types must allow it (its map well already compares `type === 'geo'`).

## Grouping, filtering, ordering, ungrouped, pre-aggregations

- Grouped by the concatenated string: rows at one coordinate collapse into one (`PostgresDBRunner.js` L66–67 against `sql-generation.test.ts` L3365). For one point per entity, group by the entity too, or ask ungrouped.
- Ordering sorts the **text** (`sql-generation.test.ts` L3361–3367).
- Filters compare the text (inferred: parameters aren't cast for geo); there is no bounding-box or radius operator. Filter numeric latitude/longitude dimensions instead.
- Ungrouped needs the primary keys of every cube in the query ([queries.mdx "Ungrouped query"](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx)); no test selects a geo dimension ungrouped (unverified).
- A rollup holding a geo dimension stores the concatenated text (inferred from `rust/…/physical_plan/sql_nodes/factory.rs` L277–283); untested.

## Row limits

- Default 10,000 rows, at most 50,000 (`CUBEJS_DB_QUERY_DEFAULT_LIMIT`, `CUBEJS_DB_QUERY_LIMIT`; `packages/cubejs-backend-shared/src/env.ts` L755–765); a larger `limit` throws "The query limit has been exceeded." (`packages/cubejs-api-gateway/src/query.js` L458–472). `total: true` gives the count without the limit (`docs/research/cube/data-apis.md`), which is how a cut set of points is said.

## Gotchas

- **Latitude first.** Many map renderers take `[lng, lat]`; the order ECharts' `geo` takes is not researched here — confirm it in an ECharts research doc before wiring T976.
- **Parse as two numbers** split on the single comma; never compare the strings (`'120.120,40.60'` vs `'120.12,40.6'`). A missing or non-numeric part is no point.
- `chartPivot`-style keys joined with `,` are ambiguous with a geo value; never split them back.
- wechart's seed models have no `type: geo` dimension; T976's tests need one.

## Open questions

1. A live `/v1/load` sample on the pinned image (the value, the annotation, a null coordinate).
2. Postgres `numeric || text` strictness (`anytextcat`).
3. A geo dimension in a rollup, ungrouped, and in a filter, on the pinned image.
