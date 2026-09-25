# Cube introspection API for generating cubes (2026-09-25)

Raw input, written from the Cube fork session at the user's request. It is **input to project-interview**, not requirements. Claims here must be verified by component-research (with sources) before the spec relies on them.

## 1. What changed

AC-139 / T145 ("generate cubes from a data source's tables") was deferred on 2026-09-21 because Cube Core had no production API for browsing a source's tables. `research/cube-capabilities.md` §6 records it as "Core (driver methods; dev-only route)".

The user has since added that API to a fork of Cube:

- **Repository:** https://github.com/senthilkrajagopal/cube
- **Branch:** `feat/data-source-introspection-api`, commit `e01fd079d7`, based on upstream `v1.7.45`
- **Local checkout:** `~/Work/bi/cube`
- **Image:** `cube:v1.7.45-introspection`, built locally from `packages/cubejs-docker/overlay.Dockerfile`. It is the published `cubejs/cube:v1.7.45` with the changed TypeScript packages laid over it. It has not been pushed to any registry.
- **Build command** (from the Cube checkout's root):

  ```sh
  docker build -f packages/cubejs-docker/overlay.Dockerfile -t cube:v1.7.45-introspection .
  ```

The API reference is in the fork at `docs-mintlify/reference/core-data-apis/rest-api/reference.mdx`, section "Data source introspection". The code is in:

- `packages/cubejs-api-gateway/src/gateway.ts` (routes)
- `packages/cubejs-api-gateway/src/data-sources.ts` (validation)
- `packages/cubejs-api-gateway/src/types/data-sources.ts` (wire types)
- `packages/cubejs-server-core/src/core/DataSourceIntrospection.ts` (implementation)

This matches the approach the user wants: the flow of Superset's and Metabase's "create dataset". wechart browses the source through Cube, lets the user pick tables, and receives generated YAML. It then saves that YAML to its own model store and publishes it through the existing validate-then-publish flow (AC-136, AC-137). Cube never writes model files.

## 2. What wechart would do, gate by gate

1. **project-interview / write-spec:** revisit the deferral of AC-139 (F15) and T145.
   - The deferral note says browsing goes "through Cube's drivers called from wechart's server". With this API it goes through Cube, and T145 no longer depends on T165 (the connection test).
   - Decisions for the user:
     - Adopt the fork image in place of `cubejs/cube:v1.7.45`, and decide where it is published (the Helm chart pulls images).
     - Decide who may generate cubes (a model-engineer permission or not).
     - Decide what happens when a generated cube's name or file name matches an existing one in the model store (for example: refuse, rename, or ask).
2. **component-research:** write `docs/research/cube/introspection-api.md`, citing the fork's source and reference doc above.
   - Verify every claim in §3 and §4 against a running `cube:v1.7.45-introspection` rather than taking this note's word for it.
   - Update the §6 row "Schema and table browsing" in `research/cube-capabilities.md`.
3. **plan-tasks:** these areas look affected, for the task plan to confirm:
   - **Deployment:** `docker-compose.yml` (both `cube` and `cube-refresh-worker`) and the Helm values (`cube.image`) use the fork image. Both Cube services must run the same image.
   - **Scope:** `infra/cube/cube.js` `contextToApiScopes` grants `introspection` to the tokens wechart signs for this feature.
     - Keep it off draft tokens, as with `jobs` today.
     - Consider a separate short-lived token, rather than adding the scope to every token, because the scope exposes the warehouse catalog.
   - **API:** `packages/api` proxies the five endpoints. The browser never holds a token with the `introspection` scope.
   - **Web:** `packages/web` "Generate cubes" flow: data source → schema → tables (search, type filter, paging) → optional column preview → generate → review the YAML and unmapped columns → save to the model store → publish.
   - **Existing test:** T145's failing test ("each selected table produces a cube whose columns map to dimensions plus a count measure, and any dropped column is reported") maps onto the scaffold response's `unmappedColumns`.

## 3. The API

Base: `{CUBE_URL}/cubejs-api/v1/introspection/data-sources`. Every request carries `Authorization: <JWT signed with CUBEJS_API_SECRET>`, and the token's context must be granted the `introspection` scope.

`introspection` is **not** in Cube's default scopes. A token without it gets `403 {"error":"API scope is missing: introspection"}`.

### `GET /v1/introspection/data-sources`

Lists the data sources that can be browsed: those in `CUBEJS_DATASOURCES` (or `default` when none are declared), plus any the data model names. A data model that fails to compile doesn't stop the listing.

```json
{ "dataSources": [{ "dataSource": "default", "dbType": "postgres" }] }
```

### `GET /v1/introspection/data-sources/{dataSource}/schemas?search=`

Returns schemas sorted by name. `search` is a case-insensitive substring match.

```json
{ "schemas": [{ "name": "public" }, { "name": "sales" }] }
```

### `GET /v1/introspection/data-sources/{dataSource}/tables`

Query parameters:

| Parameter | Meaning                                                                                      |
| --------- | -------------------------------------------------------------------------------------------- |
| `schema`  | Required. Repeat it for several schemas (`schema=a&schema=b`).                               |
| `search`  | Case-insensitive substring match on the table name.                                          |
| `type`    | Repeatable. One of `table`, `view`, `materialized_view`, `external`.                         |
| `limit`   | 1–10000. All tables when absent.                                                             |
| `offset`  | Defaults to 0.                                                                               |

Tables are sorted by schema, then name. `total` counts the matches before `limit` and `offset` are applied. `type` is `null` when the driver can't tell; `rawType` is the source's own word for it.

```json
{
  "tables": [
    { "schema": "public", "name": "orders", "type": "table", "rawType": "BASE TABLE" },
    { "schema": "public", "name": "paid_orders", "type": "view", "rawType": "VIEW" }
  ],
  "total": 2
}
```

### `POST /v1/introspection/data-sources/{dataSource}/columns`

The body names 1–100 tables. `schema` may be `""` for sources without schemas.

```json
{ "tables": [{ "schema": "public", "table": "orders" }] }
```

Tables come back in the order asked for. Columns come back in the source's order.

- `type` is the Cube type scaffolding would give the column: `time`, `number`, `string` or `boolean`.
- `rawType` is the source's own type.

```json
{
  "tables": [
    {
      "schema": "public",
      "name": "orders",
      "columns": [
        { "name": "id", "rawType": "integer", "type": "number", "primaryKey": true, "foreignKeys": [] },
        {
          "name": "customer_id",
          "rawType": "integer",
          "type": "number",
          "primaryKey": false,
          "foreignKeys": [{ "table": "customers", "column": "id" }]
        },
        { "name": "created_at", "rawType": "timestamp with time zone", "type": "time", "primaryKey": false, "foreignKeys": [] }
      ]
    }
  ]
}
```

If any table is missing, the response is `404 {"error":"The 'default' data source has no table public.ghost"}`, naming every missing table.

### `POST /v1/introspection/data-sources/{dataSource}/scaffold`

Body: `{ "tables": [...same as /columns...], "format": "yaml" | "js" }`. `format` defaults to `yaml`.

The response has one entry per table, in order. Nothing is written anywhere.

```json
{
  "cubes": [
    {
      "cube": "orders",
      "fileName": "orders.yml",
      "content": "cubes:\n  - name: orders\n    sql_table: public.orders\n ...",
      "table": { "schema": "public", "table": "orders" },
      "unmappedColumns": [
        { "name": "discount_ratio", "rawType": "double precision", "reason": "numeric_not_measure" },
        { "name": "_etl_loaded_at", "rawType": "timestamp without time zone", "reason": "underscore_prefix" }
      ]
    }
  ]
}
```

The generation rules, as Cube's Playground applies them:

- Names are snake_case, and the cube uses `sql_table`.
- There is a dimension for each string, boolean and time column, and for each key column (`primary_key` from the database, or a column named `id`).
- There is a `sum` measure for each number column whose name ends like a measure word (`amount`, `price`, `count`, `balance`, `total`, `number`, `cost`, `qty`, `quantity`, `duration`, `value`), plus a `count` measure.
- Joins (`many_to_one`) are generated **only between tables generated in the same request**. They come from foreign keys, or from `<table>_id` columns.
- `data_source: <name>` is written when the data source isn't `default`.
- The file ends with a commented `pre_aggregations` placeholder.

`unmappedColumns[].reason` is one of:

- `underscore_prefix`: the name starts with `_`.
- `numeric_not_measure`: a number that is neither a key nor named like a measure.
- `not_mapped`: a fallback reason.

A column used only in a join's SQL (for example `customer_id`) is still listed as unmapped.

If two tables in one request would generate the same cube name (for example `public.orders` and `sales.orders`), the response is `400` and nothing is generated.

### Errors, for every endpoint

| Status | Response                                                          | Cause                                                                                                             |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 400    | `{"error":"Invalid request: <Joi message>"}`                      | Bad parameters or body.                                                                                           |
| 403    | —                                                                 | The `introspection` scope is missing.                                                                             |
| 404    | `{"error":"Unknown data source: 'x'"}`                            | The data source isn't one that can be browsed.                                                                    |
| 404    | —                                                                 | A named table is missing (`/columns`, `/scaffold`).                                                               |
| 200    | `{"error":"Continue wait"}`                                       | The catalog query outlasted Cube's queue wait timeout. Retry the same request, exactly as with `/v1/load`.        |
| 500    | `{"error": ...}`                                                  | The driver failed, for example the connection was refused.                                                        |

Every request reads the catalog live, through that data source's Cube query queue. Nothing is cached.

## 4. Known limits

- **Postgres materialized views are not listed.** Postgres leaves them out of `information_schema`. The sample and northwind databases are Postgres.
- **Databricks** reports no table type (`type: null`).
- **Drivers without incremental schema loading** (for example DuckDB, Trino/Presto, Druid) read the whole catalog on each request, and their tables have `type: null`.
- **BigQuery and Databricks** report generic column types in `rawType`, not native ones.
- **Scaffold ignores the existing model.** It knows nothing of cubes already in wechart's model store, so wechart must detect name and file clashes itself.

## 5. Also fixed in the fork (these change behaviour wechart may already observe)

- **Postgres `numeric` columns are typed `number`.** They were typed `string`, so money columns became string dimensions instead of sums.
- **Postgres foreign keys are reported even when the referenced table isn't requested.** Before, a foreign key only appeared when its target table was also requested.
- **Cube's orchestrator methods for listing schemas, tables and columns work.** Before, they sent the operation to the database as SQL and failed.
