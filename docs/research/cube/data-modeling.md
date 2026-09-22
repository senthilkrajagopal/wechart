---
library: Cube (Cube.js) data modeling
packages: ['@cubejs-client/core']
version: 1.7.42
researched: 2026-09-19
sources:
  - https://github.com/cube-js/cube/tree/v1.7.42/docs-mintlify/reference/data-modeling
  - https://github.com/cube-js/cube/tree/v1.7.42/docs-mintlify/docs/data-modeling
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://github.com/cube-js/cube/tree/v1.7.42/packages/cubejs-schema-compiler/src/compiler
  - https://github.com/cube-js/cube/tree/v1.7.42/packages/cubejs-server-core/src/core
  - https://github.com/cube-js/cube/tree/v1.7.42/packages/cubejs-client-core/src
  - https://github.com/cube-js/cube/releases/tag/v1.7.42
---

# Cube data modeling 1.7.42

## Summary

This doc covers everything a user can define in the Cube data model at v1.7.42, which was released 2026-09-18 ([release]). It also covers how a UI outside Cube reads the compiled model and how it writes model files that Cube Core picks up. The npm packages (`@cubejs-client/core`, `@cubejs-backend/schema-compiler`, `cubejs-cli`) and the Docker image `cubejs/cube:v1.7.42` are all at 1.7.42 ([npm-client-latest], [npm-sc], [npm-cli], [hub]).

What it covers:

- **Model entities:** cubes, views, view groups, measures, dimensions, segments, joins, hierarchies and folders.
- **Modeling patterns:** multi-fact views, calendar cubes, custom granularities, data blending, `extends`, polymorphic cubes.
- **Dynamic models:** Jinja/Python and JavaScript, `COMPILE_CONTEXT`, the execution sandbox, export/import.
- **Context variables and Python tooling:** the context variables, the `cube` Python package, `cube_dbt` and `lkml2cube`.
- **Descriptions:** AI context, descriptions and `meta`.
- **Cloud-only tooling:** the content validator and IDE.
- **Syntax and loading:** YAML vs JS syntax and file layout, and how Core reloads the model (dev mode, `schemaVersion`, `repositoryFactory`).

Why wechart needs it (from `docs/inputs/2026-09-19-product-direction.md`; the caller gave no feature or AC IDs, so none are cited):

- **Semantic-layer management UI.** Browse, edit and validate the model. §1 of the input asks for "almost all" Cube functionality in the UI.
- **Chart-builder field list and recommender input.** §3 of the input builds on "every field is declared as a measure or dimension with a type". `/v1/meta` gives the measure/dimension split and the member data types, plus `aggType`, formats, drill members, hierarchies, folders and `meta`. It does **not** give cardinality ([s-meta]).
- **Validation feedback.** Core compiles the model with Joi schemas and reports errors grouped by file ([s-validator], [s-errors]). Cube's Content Validator is Cloud-only ([d-content-validator]).

This area has one npm import surface for a Node/React app: `@cubejs-client/core` (`meta()` plus the format helpers). Everything else is file formats, Cube server config (`cube.js`/`cube.py`) and REST.

## Install

Web app (Vite + React, Node 26 toolchain):

```sh
pnpm add @cubejs-client/core@1.7.42
```

- `@cubejs-client/core@1.7.42` is MIT-licensed, sets `"type": "module"`, exports `.` and `./format` with `import`/`require`/`types` conditions, and declares `engines.node >=20.0.0`. It has no peer dependencies ([npm-client-latest], [npm-client]).
- Its runtime dependencies are `uuid`, `dayjs`, `ramda`, `core-js`, `d3-format`, `d3-time-format` and `url-search-params-polyfill` ([npm-client-latest]). The registry metadata sets no `sideEffects` field ([npm-client]).

Cube server (docker-compose). Nothing to install in the wechart app:

- **Image:** `cubejs/cube:v1.7.42` exists on Docker Hub ([hub]). The image is built `FROM node:24.21.0-trixie-slim`, installs `python3.13 libpython3.13-dev`, sets `NODE_ENV=production`, and runs `CMD ["cubejs", "server"]` ([s-dockerfile]).
- **Model location:** the model is mounted into `/cube/conf`. The docs warn not to mount the whole folder `.:/cube/conf` when `package.json` has dependencies, because the mount hides `node_modules`. Mount `./model:/cube/conf/model` and `./cube.js:/cube/conf/cube.js` individually instead ([c-deploy]).
- **Python packages in Core:** for packages with native extensions (for example `cube_dbt` dependencies), build a custom image `FROM cubejs/cube:latest` with `RUN pip install -r requirements.txt` and `RUN npm install` ([c-deploy]). See Open questions for the conflicting "installed on startup" statement.
- **Config file:** use `cube.js` or `cube.py`. `cube.ts` support was removed in 1.7.34 ([changelog], [pr-11763]).

Optional CLIs (Cube project side, not the web app):

- `cubejs-cli@1.7.42` provides the `cubejs` bin with `validate`, `generate` and `typegen` commands (Apache-2.0) ([npm-cli], [s-cli-validate], [s-cli-generate], [s-cli-typegen]).
- `lkml2cube` 0.2.10 (MIT, Python >=3.10) ([pypi-lkml2cube]).
- `cube_dbt` 0.6.3 (MIT, Python >=3.8) ([pypi-cube-dbt]).

## Init / auth pattern

### Reading the model from the React app

```ts
import cube from '@cubejs-client/core';

// Default export: (apiToken: string | (() => Promise<string>), options: CubeApiOptions) => CubeApi
const cubeApi = cube(
  async () => fetchCubeJwtFromWechartBackend(), // never ship CUBEJS_API_SECRET to the browser
  { apiUrl: 'http://localhost:4000/cubejs-api/v1' },
);

const meta = await cubeApi.meta(); // Promise<Meta>; options: { signal?, baseRequestId?, onlyViews? }
meta.cubes; // Cube[] (cubes and views)
meta.meta.viewGroups; // ViewGroup[] | undefined
```

- **Default export:** the `cube(apiToken, options)` signature and `meta(options?: MetaMethodOptions)` come from [s-client-index]. `meta()` issues `request('meta', { signal, baseRequestId, onlyViews? })` and wraps the body in `new Meta(body)` ([s-client-index]).
- **`Meta` class:** exposes `meta`, `cubes` and `cubesMap`, plus `membersForQuery`, `membersGroupedByCube`, `resolveMember`, `defaultTimeDimensionNameFor` and `filterOperatorsForMember` ([s-client-meta]).
- **Base path:** the REST base path is `/cubejs-api` (`http://localhost:4000/cubejs-api/v1/meta`), sent with an `Authorization: TOKEN` header ([r-rest]). The CLI's `typegen` also calls `${apiUrl}/meta` ([s-cli-typegen]).
- **Scope:** the `meta` endpoint asserts the `meta` API scope (`assertApiScope('meta', …)`) ([s-gateway]).
- **JWT signing:** JWTs are signed with `CUBEJS_API_SECRET` ([r-env]). How wechart mints them belongs to the security research doc.

**Extended meta.** `@cubejs-client/core` does not send `extended`. Call REST directly:

```ts
const res = await fetch(`${base}/cubejs-api/v1/meta?extended`, {
  headers: { Authorization: token },
});
```

The gateway routes to `metaExtended` when the `extended` key is present, and it honours `onlyViews=true` ([s-gateway]).

### Making Cube Core pick up model edits (Cube side, `cube.js`)

The following is an illustrative combination of documented options, not a documented Cube recipe. Signatures come from [r-config] and the `SchemaFileRepository` interface in [s-filerepo].

```js
// cube.js (runs in Cube's Node process, not in the model sandbox)
module.exports = {
  // caching key for the compiled model; required before COMPILE_CONTEXT can be used
  contextToAppId: ({ securityContext }) => `CUBE_APP_${securityContext.model_rev ?? 'published'}`,
  // called once per app id; must return { localPath(), dataSchemaFiles() }
  repositoryFactory: ({ securityContext }) => ({
    localPath: () => '/cube/conf/model',
    dataSchemaFiles: async () => loadModelFiles(securityContext.model_rev), // [{ fileName, content }]
  }),
  // called on every request; a different return value triggers recompilation
  schemaVersion: async ({ securityContext }) => currentModelRevision(securityContext),
};
```

## API surface we will use

### 1. Model file format and layout

**File layout**

- Model files live in `model/` by default. Change it with `schema_path` or `CUBEJS_SCHEMA_PATH`. The docs recommend `model/cubes` and `model/views` with one entity per file ([d-syntax], [r-config], [r-env]).
- The default `FileRepository` recursively reads `process.cwd()/<schemaPath>` and keeps files ending in `.js`, `.yml`, `.yaml`, `.jinja` or `.py`. It returns `{ fileName (relative path), content }` ([s-filerepo]).
  - It skips nothing else. `getFiles` `fs.stat`s each entry, recurses into directories and pushes everything else. The only filter is the extension check, so a dot-file such as `cubes/.draft.yml` is compiled. Checked in the v1.7.42 source on 2026-09-21 ([raw](https://raw.githubusercontent.com/cube-js/cube/v1.7.42/packages/cubejs-backend-shared/src/FileRepository.ts)).

**How each file type is compiled** ([s-dsc])

- `.js`: transpiled JS.
- `.yml`/`.yaml`: YAML. A YAML file is Jinja-rendered first if it matches `/{%|%}|{{|}}/`.
- `.jinja`: Jinja-rendered, then compiled as YAML.
- Python: only a file whose `fileName === 'globals.py'` is loaded as the Python context. With the default repository that means the root of the schema path.
- YAML and JS files can be mixed in one model ([d-syntax]).

**YAML**

- The only allowed top-level keys are `cubes`, `views` and `view_groups`. Anything else raises `Unexpected YAML key: … Only 'cubes', 'views', and 'view_groups' are allowed here.` ([s-yaml])
- Members and joins must be YAML **arrays** of objects with `name`. The errors are "`joins must be defined as array`" and "`${memberType}s must be defined as array`" ([s-yaml]).

**JS**

- Globals: `cube(name, {...})`, `view(name, {...})`, `view_group(name, {...})`, `context(name, {...})` and `asyncModule(fn)` ([s-dsc]).
- Members are objects keyed by name. Joins can be an object keyed by cube name or an array of `{name, sql, relationship}` ([s-validator], [s-meta-ext]).

**Key and value normalisation**

- The compiler camelizes cube keys (`camelizeCube`), so snake_case keys work in both YAML and JS ([s-symbols], [s-utils]).
- Type values containing `_` are camelized too: `count_distinct` becomes `countDistinct`, and `many_to_one` becomes `manyToOne` ([s-symbols]).

**Names**

- Names must start with a letter, contain only letters, digits and `_`, and must not be a Python reserved word. Uniqueness is per scope ([d-syntax]).
- The validator regex is `/^[_a-zA-Z][_a-zA-Z0-9]*$/` ([s-validator]).

**References**

- YAML uses `{member}`, `{cube.member}`, `{cube1.cube2.member}` (join path), `{CUBE}`, `{time_dim.granularity}` and `{cube.sql()}`.
- JS uses `${...}` template literals. Literal braces in YAML are escaped as `\{ \}` ([d-syntax]).

### 2. Cubes ([r-cube], [d-cubes], [s-validator])

| Param (YAML)                                                                                      | Values / notes                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                            | required, unique across cubes and views                                                                                                                       |
| `sql_table` / `sql`                                                                               | the validator requires **exactly one** (`.xor('sql','sqlTable')`)                                                                                             |
| `data_source`                                                                                     | default `"default"`, passed to `driverFactory()`                                                                                                              |
| `sql_alias`                                                                                       | shortens generated aliases; affects member aliases and pre-aggregation table names                                                                            |
| `extends`                                                                                         | reuse another cube's members                                                                                                                                  |
| `title`, `description`, `public` (default `true`), `meta`                                         | `meta` may carry `ai_context`                                                                                                                                 |
| `refresh_key`                                                                                     | `every` (interval or CRON), `sql`, `timezone`, `immutable`. Default `every: '10 second'`, or `'2 minute'` on BigQuery, Athena, Snowflake, Presto and Firebolt |
| `calendar`                                                                                        | boolean, marks a calendar cube                                                                                                                                |
| `joins`, `measures`, `dimensions`, `segments`, `hierarchies`, `pre_aggregations`, `access_policy` | see below; `pre_aggregations` and `access_policy` are covered by other research docs ([r-preagg], [r-dap])                                                    |

The validator also accepts undocumented keys: `shown` (legacy visibility), `rewriteQueries` and `sqlAlias` ([s-validator]).

### 3. Views ([r-view], [d-views], [s-validator], [s-symbols])

- **`cubes[]`** entries take:
  - `join_path` (for example `base_orders.line_items.products`)
  - `includes`: `"*"` or a list. A list item can be a member name or an object with `name`, `alias`, `title`, `description`, `format` and `meta`. The source also honours `currency`.
  - `excludes`
  - `prefix: true`, which yields `<cube>_<member>`
  - `alias`, a custom prefix
  - `split`, which is accepted by the validator but undocumented
- **View-level `measures` / `dimensions`:**
  - They may reference only included view members; a view measure that touches raw table columns is rejected at compile time.
  - A measure that combines members of different cubes must set `multi_stage: true`.
- **`folders`:** see §10.
- **`default_filters`:** each entry has `member`, `operator`, `values` and `unless`.
  - Operators: `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `notStartsWith`, `endsWith`, `notEndsWith`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet`, `inDateRange`, `notInDateRange`, `onTheDate`, `beforeDate`, `beforeOrOnDate`, `afterDate`, `afterOrOnDate` ([s-validator]).
  - The docs say they are "enforced on every query against the view, including filter suggestions" ([r-view]).
  - Core compiles them in `CubeEvaluator.prepareViewFilters` ([s-evaluator]).
  - They are **not** part of the `/v1/meta` output ([s-meta]).
- **`public`:** can be a `COMPILE_CONTEXT` expression, for example `public: COMPILE_CONTEXT.security_context.is_finance` ([r-view]).
- **Other keys:** `extends`, `access_policy`, and `view_group`/`view_groups`. The last two let a view attach itself to groups; they are source-only ([s-validator], [s-vg]).
- **`meta` conventions:** `meta.auto_run` and `meta.default_ui_filters` are documented as Cube Cloud Workbooks behaviour. Core only passes `meta` through ([r-view], [s-meta]).

### 4. View groups ([r-view-group], [d-view-groups], [s-vg], [s-validator])

- **Definition:** YAML `view_groups: [{ name, title?, description?, includes? }]` or JS `view_group(name, {...})`.
  - `includes` holds view names and/or nested groups, each with its own `name`, `title`, `description` and `includes`.
  - The legacy `views` array is still accepted, but `views` and `includes` are mutually exclusive (`'View group must use either "views" or "includes"'`).
- **Compile errors** include `View group "<name>" already exists!`, `View "<v>" references view group "<g>" which is not defined.` and `View group "<g>" includes "<x>" which is not a defined view.`
- **In `/v1/meta`:**
  - A top-level `viewGroups` array appears when non-empty. Each item is `{ name, title?, description?, views: string[], includes: (string | group)[] }`.
  - Each view carries `viewGroups: string[]`.
  - Groups are filtered to visible views ([s-gateway], [s-meta]).

### 5. Measures ([r-measures], [d-measures], [s-validator])

**Types**

| YAML type                   | `sql`                       | Notes                                                                                   |
| --------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `count`                     | optional                    | handles join fan-out                                                                    |
| `count_distinct`            | non-aggregated expr         |                                                                                         |
| `count_distinct_approx`     | non-aggregated expr         | HyperLogLog; additive and rollup-friendly                                               |
| `sum`, `avg`, `min`, `max`  | non-aggregated numeric expr |                                                                                         |
| `number`                    | aggregate expr              | calculations over other measures                                                        |
| `string`, `time`, `boolean` | aggregate expr of that type |                                                                                         |
| `number_agg`                | custom aggregate            | Tesseract only (see Gotchas: the validator only accepts it in the `multi_stage` branch) |
| `rank`                      | via `order_by`              | multi-stage only (docs example; validator `multiStageMeasureType`)                      |

`running_total` was removed in 1.7.0 ([changelog]).

**Parameters**

| Param                                    | Notes                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `description`, `public`, `meta` |                                                                                                                                                                                                                                                   |
| `filters: [{sql}]`                       | filtered aggregates                                                                                                                                                                                                                               |
| `drill_members`                          | list of member references                                                                                                                                                                                                                         |
| `format`                                 | see below                                                                                                                                                                                                                                         |
| `currency`                               | ISO 4217 code, upper-cased. Forbidden on `string`/`boolean`/`time` measures                                                                                                                                                                       |
| `mask`                                   | data masking; security doc                                                                                                                                                                                                                        |
| `rolling_window`                         | `type` is `fixed` (default) or `to_date` (+ `granularity`); plus `trailing`/`leading` (`"N unit"` or `unbounded`) and `offset` (`start`/`end`). The validator also accepts the legacy types `year_to_date`, `quarter_to_date` and `month_to_date` |

**Multi-stage parameters** (require `multi_stage: true`; Tesseract, default since 1.7.0) ([d-measures], [s-validator])

| Param                                                                        | Notes                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `time_shift: [{interval, type: prior\|next, time_dimension?}]` or `[{name}]` | `name` references a calendar-cube shift                     |
| `grain: {keep_only \| exclude, include}`                                     | legacy equivalents: `group_by`, `reduce_by`, `add_group_by` |
| `filter: {mode: relative\|fixed, exclude \| keep_only, include}`             |                                                             |
| `case: {switch, when: [{value, sql}], else: {sql}}`                          |                                                             |
| `order_by: [{sql, dir}]`                                                     | for `rank`                                                  |

**Formats** ([r-measures], [s-formats], [s-validator])

| Kind                           | Values                                                              | Notes                               |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------- |
| Base                           | `number`, `percent`, `currency`                                     |                                     |
| Named, with `_0`–`_6` suffixes | `number_N`, `percent_N`, `currency_N`, `abbr[_N]`, `accounting[_N]` |                                     |
| Source-only                    | `decimal[_N]`, `id`                                                 | also accepted as named formats      |
| Custom                         | any d3-format specifier, e.g. `$,.2f`                               | validated against a d3-format regex |

The d3 `%` type multiplies by 100 ([d3-format]).

**What `/v1/meta` reports for each format.** Observed against a throwaway Cube v1.7.42 with a probe model of one measure per format, 2026-09-21, T201.
- Every **number** member carries `formatDescription: {name, specifier}`. `specifier` is the d3-format string Cube itself means, and it is present even when no `format` is declared:

  | Declared `format`   | `format` in meta                                                   | `formatDescription.specifier` |
  | ------------------- | ------------------------------------------------------------------ | ----------------------------- |
  | none (a number)     | absent                                                             | `,.2~f`                       |
  | `percent`           | `"percent"`                                                        | `.2~%`                        |
  | `percent_1`         | `{type: 'custom-numeric', value: '.1~%', alias: 'percent_1'}`      | `.1~%`                        |
  | `currency`          | `"currency"`                                                       | `$,.2~f`                      |
  | `currency_0`        | `{type: 'custom-numeric', value: '$,.0f', alias: 'currency_0'}`    | `$,.0f`                       |
  | `abbr`, `abbr_2`    | `{type: 'custom-numeric', value: '.2~s', alias: …}`                | `.2~s` (both)                 |
  | `accounting`        | `{type: 'custom-numeric', value: '(,.2~f', alias: 'accounting'}`   | `(,.2~f`                      |
  | `number_3`          | `{…, value: ',.3~f', alias: 'number_3'}`                           | `,.3~f`                       |
  | `decimal_2`         | `{…, value: ',.2~f', alias: 'decimal_2'}`                          | `,.2~f`                       |
  | `id`                | `{…, value: '.0f', alias: 'id'}`                                   | `.0f`                         |
  | `$,.1f` (custom)    | `{type: 'custom-numeric', value: '$,.1f'}`                         | `$,.1f`                       |

- **A `currency` code**, for example `EUR`, keeps the `$` specifier. It is reported as `formatDescription.currency: 'EUR'` and as the member's `currency`, so the symbol is the formatter's locale's to supply.
- **A time format** such as `%Y-%m` is `format: {type: 'custom-time', value: '%Y-%m'}`, with no `formatDescription`. Time and string members without a format carry neither.
- **The `~` in the defaults trims insignificant zeros:** `currency` writes 1234.5 as `$1,234.5`, not `$1,234.50`.

### 6. Dimensions ([r-dimensions], [d-dimensions], [s-validator])

**Types:** `string`, `number`, `boolean`, `time`, `geo` and `switch`.

- `geo` takes `latitude: {sql}` and `longitude: {sql}` instead of `sql`.
- `switch` takes only `values: [..]`, with at least one entry and no `sql`, `title` or `public`. It is Tesseract-powered.

**Parameters**

| Param                                         | Notes                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `description`, `public`, `meta`      |                                                                                                                                                                                                                                       |
| `primary_key`                                 | a primary-key dimension defaults to hidden                                                                                                                                                                                            |
| `order`                                       | `asc`/`desc`: default sort                                                                                                                                                                                                            |
| `case: {when: [{sql, label}], else: {label}}` | `label` may be `{sql}`                                                                                                                                                                                                                |
| `sub_query`, `propagate_filters_to_sub_query` |                                                                                                                                                                                                                                       |
| `format`                                      | see below                                                                                                                                                                                                                             |
| `currency`                                    | only on `number` dimensions                                                                                                                                                                                                           |
| `mask`                                        | data masking; security doc                                                                                                                                                                                                            |
| `links[]`                                     | `name`, `label`, `url` or `dashboard` (mutually exclusive), `icon`, `target: blank\|self`, `primary` (at most one), `params: [{key, value}]`. Needs Cube 1.6.53+. Link URLs surface as synthetic dimensions `<dim>___link_<name>_url` |
| `granularities`                               | time only; see below                                                                                                                                                                                                                  |
| `time_shift`                                  | only on a time dimension of a `calendar: true` cube: `[{name, type, interval}]`, `[{name, sql}]` or `[{type, interval, sql}]`                                                                                                         |

The validator also accepts `multi_stage: true` with `add_group_by`/`filter`, plus the undocumented `key`, `suggest_filter_values`, `aliases`, `values_as_segments` and `enable_suggestions` ([s-validator]).

**Formats**

- **`string`:** `imageUrl`, `link`, or `{type: link, label}`.
- **`number`:** the named formats above, `id`, or d3 specifiers.
- **`time`:** strftime/d3-time-format strings. At least one `%` specifier is required, otherwise the validator errors ([s-validator]).

**Granularities**

- **Defaults:** `year`, `quarter`, `month`, `week`, `day`, `hour`, `minute` and `second` ([r-dimensions]).
- **Custom:** `{interval, offset?, title?}`, `{interval, origin, title?}` or `{sql, title?}`.
  - `sql` overrides must use a default granularity name ([d-calendar]).
  - Without `origin`, an interval must divide its parent unit evenly (for example `week`/`day` only `1`, `month` a divisor of 12). Otherwise the error is "Arbitrary intervals cannot be used without origin point specified" ([s-validator]).
- **Database support:** Athena, Redshift, DuckDB, Databricks, BigQuery, ClickHouse, SQL Server, MySQL, Postgres and Snowflake ([r-dimensions]).
- **API support:** the REST API addresses custom granularities by name. The SQL and GraphQL APIs need proxy dimensions ([r-dimensions], [rc-granularity]).

### 7. Segments ([r-segments], [s-validator])

- `name` and `sql` are required. `sql` is a `WHERE`-valid predicate.
- Optional: `description` and `public`.
- The validator also accepts `title`, `meta`, `shown` and `aliases`.
- Queries reference a segment as `"segments": ["users.sf_users"]`.

### 8. Joins ([r-joins], [d-joins], [s-validator], [pr-11809])

- A join is `{ name: <target cube>, relationship, sql }`.
- **Relationships:** `one_to_one`, `one_to_many` and `many_to_one`. The legacy `has_one`/`hasOne`, `has_many`/`hasMany` and `belongs_to`/`belongsTo` are still valid, as are camelCase forms.
- **Direction:** joins are directed (`a → b` ≠ `b → a`) and always generated as `LEFT JOIN`.
- **Primary keys:** a primary key is required to avoid fan-out.
- **Path choice:** transitive paths are chosen with Dijkstra. Diamond graphs should be resolved with views.
- **Same cube twice:** use `extends` to create an alias cube. Since 1.7.40, two joins from one cube to the same cube fail to compile.

### 9. Hierarchies ([r-hierarchies], [s-validator], [s-evaluator])

- A hierarchy is `{ name, levels: [dimension refs, coarse → fine], title?, public? }`.
- Levels may be dimensions of joined cubes (for example `orders.status`).
- Non-dimension levels error with "Only dimensions can be part of a hierarchy…".
- Views expose a hierarchy by listing it in `includes`. Levels that are not included in the view are silently dropped from the view's hierarchy.

### 10. Folders ([r-view], [s-validator], [s-meta], [s-env])

- **Scope:** folders exist only in views; `folders` is in `viewSchema` only.
- **Shape:** `folders: [{ name, includes: "*" | [memberName | {join_path} | nestedFolder] }]`. Nesting has no depth limit in the schema.
- **Meta output:** `nestedFolders` keeps the tree as `{name, members: (string | NestedFolder)[]}`. `folders` is flat as `{name, members: string[]}`.
  - With `CUBEJS_NESTED_FOLDERS_DELIMITER` unset (default `''`), nested members are merged into their root folder.
  - With a delimiter, `folders` contains path-joined names such as `A / B`.

### 11. Context variables ([r-ctx], [c-multitenancy], [s-dsc])

- **`{CUBE}` / `${CUBE}`:** refers to the current cube. It is required inside cubes that are extended ([d-extending]).
- **`FILTER_PARAMS.cube.member.filter(expr | (from, to) => sql)`:** must be a top-level expression in `WHERE`, and heavy use is discouraged.
  - Naming a segment or a time shift in it works only with Tesseract; with `CUBEJS_TESSERACT_SQL_PLANNER=false` it renders `1 = 1`.
  - Wrap several of them in `FILTER_GROUP(...)`.
- **`SQL_UTILS.convertTz(sql)`:** do not use the resulting dimension as a `timeDimension`.
- **`COMPILE_CONTEXT`:**
  - Contents: `securityContext` plus `extendContext` output.
  - Evaluation: once per `context_to_app_id` key. Access it from YAML via Jinja `{{ }}`.
  - Requirement: without `contextToAppId`, access throws `COMPILE_CONTEXT can't be used unless contextToAppId is defined`.
- **`SECURITY_CONTEXT`:** deprecated; use `query_rewrite` instead.

### 12. Dynamic models ([d-dynamic], [d-jinja], [d-js], [d-reuse], [d-exec-env], [r-cube-pkg], [s-dsc])

- **Jinja and Python:**
  - Jinja works in all YAML model files. Python functions and variables go in `model/globals.py` and are registered on `TemplateContext` from the `cube` package (`add_variable`, `add_function` / `@template.function`, `add_filter` / `@template.filter`).
  - Macros can live in `.jinja` files and are imported with `{% import %}`. Auto-escaping is on; opt out with `| safe` or a `SafeString`.
  - Dependencies go in `requirements.txt`. The `cube` package is built in.
- **JavaScript:**
  - `asyncModule(async () => { … cube(…) })` runs once per compilation, so a model can be generated from an API or a database.
  - Inside `asyncModule`, `sql` and `drill_members` must be functions.
  - This is JS-only, not YAML.
- **Export/import:** ES `export`/`import` between JS model files only.
- **Sandbox (Node VM):**
  - No `process` and no `console`.
  - `require` resolves model files and npm packages whose names end in `-schema`. Anything else fails with `Package '<x>' not found` unless `allowNodeRequire` is set.
  - `process.env` is reached through a helper module placed outside `model/` ([d-exec-env], [s-dsc]).

### 13. dbt and LookML tooling

- **`cube_dbt`** ([r-cube-dbt], [pypi-cube-dbt]):
  - `Dbt(manifest_dict)`, `Dbt.from_file(path)` and `Dbt.from_url(url)` load a manifest.
  - `.filter(paths=, tags=, names=)` narrows it, then `.models` or `.model(name)` returns models. Ephemeral models are excluded.
  - `Model.as_cube()` and `Model.as_dimensions(skip=[])` return YAML snippets for Jinja. So do `Column.as_dimension()` and the `primary_key` tag convention.
  - The docs' Core install section is commented out with "TODO: test and uncomment Cube Core installation instructions".
- **`lkml2cube`** ([r-lkml2cube], [pypi-lkml2cube]):
  - A CLI. `cubes` converts LookML views to cubes (flags `--parseonly`, `--outputdir`, `--rootdir`). `views` converts explores to cubes, views and joins (flags `--outputdir`, `--printonly`).
  - PyPI also documents an `explores` command that generates LookML from Cube's meta API using `--token`.

### 14. AI context, descriptions and `meta` ([d-ai], [s-meta])

- `meta.ai_context` is consumed by Cube's AI agent (Analytics Chat, a Cloud feature). Only view-level and member-level values are consumed; cube-level values are ignored. The limit is 2,000 characters, and longer text is silently truncated.
- `description` is shown to users and is also used by the agent.
- Core copies `meta` and `description` verbatim into `/v1/meta` for cubes, views, measures, dimensions and segments.

### 15. Reading the compiled model: `GET /cubejs-api/v1/meta`

Sources: [r-rest], [s-gateway], [s-meta], [s-openspec].

**Query params**

- none: the normal meta response.
- `?onlyViews=true`: views only.
- `?extended`: adds definition details (below).

**Response and visibility**

- The response is `{ cubes: CubeConfig[], viewGroups?: CompiledViewGroup[] }`.
- Outside dev mode, the gateway removes measures, dimensions and segments whose `isVisible` is false, then drops cubes left with no members.
- In dev mode (`CUBEJS_DEV_MODE`), or with a token signed by the Playground auth secret, **nothing is filtered**.

**`CubeConfig`** ([s-meta])

| Field                                                          | Meaning                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `name`, `type: 'cube'\|'view'`, `title`, `description`, `meta` | identity and descriptions                                                        |
| `isVisible` / `public`                                         | visibility                                                                       |
| `connectedComponent`                                           | join-graph component id; members from the same component can be queried together |
| `viewGroups?`                                                  | groups the view belongs to                                                       |
| `measures`, `dimensions`, `segments`                           | see below                                                                        |
| `hierarchies`                                                  | `{name: "<cube>.<h>", title?, levels: string[], public}`                         |
| `folders`, `nestedFolders`                                     | see §10                                                                          |

**Measure fields**

- `name` (`cube.member`), `title` (includes the cube title), `shortTitle`, `description`, `meta`, `isVisible`/`public`, `aliasMember` (the original cube path for view members).
- `type` is the data type. `toMemberDataType` passes `number`, `string`, `time` and `boolean` through and maps **every aggregate type to `number`**.
- `aggType` is the declared type after camelization (`count`, `sum`, `countDistinct`, `countDistinctApprox`, …).
- `cumulative` and `cumulativeTotal` are true for rolling windows.
- `drillMembers: string[]` and `drillMembersGrouped: {measures, dimensions}`.
- `format`: a string, or `{type: 'custom-numeric', value, alias?}`.
- `formatDescription: {name, specifier (d3), currency?}` and `currency`.

**Dimension fields**

- `name`, `title`, `shortTitle`, `description`, `meta`, `isVisible`/`public`, `aliasMember`.
- `type`: `string`, `number`, `boolean`, `time` or `geo`. **`switch` is reported as `string`, and its `values` are not emitted.**
- `primaryKey`, `suggestFilterValues` (default true), `order`, `key`.
- `format`: a string, `{type:'link',label}`, `{type:'custom-time',value}` or `{type:'custom-numeric',…}`. `formatDescription` is emitted only for `number` dimensions. `currency`.
- `granularities`: **only custom ones**, as `{name, title, interval, offset, origin}`.
- `links?: [{name, label, dashboard?, icon, target?, primary?, params?: string[]}]` and `synthetic?`.

**Segment fields:** `name`, `title`, `shortTitle`, `description`, `meta`, `isVisible`/`public`.

**`?extended`** ([s-meta-ext], [s-gateway])

- Adds per cube: `sql`, `extends`, `fileName`, `refreshKey`, `joins` (`[{name, relationship, sql}]`) and `preAggregations`.
- Adds `sql` to members, measure `filters`, and dimension `case`.
- All SQL values are **stringified compiled functions** (`fn.toString()` after `=>`), not the original YAML or JS.
- The extended response contains **no `viewGroups`**.

**Client helpers** ([s-client-format])

- `@cubejs-client/core/format` exports `formatValue(value, options)`, `getFormat(member, {locale})` and `formatDateByGranularity(value, granularity?)`.
- They handle the `custom-numeric`, `custom-time`, named and `currency` formats.

**Candidate recommender input (wechart design, not a Cube claim).** Cube supplies the member type fields listed above: dimension `type`, measure `type`/`aggType`, `format` (for example `id` hints at an identifier) and `granularities` ([s-meta]). A signature for §3 of the input could be built this way:

- N = `string`/`boolean` dimensions
- T = `time` dimensions
- Q = measures, or `number` dimensions
- geo = `geo` dimensions

Cardinality is not in `/v1/meta` and would need a query.

### 16. Writing model files and making Core pick them up

Sources: [s-compiler-api], [s-server], [s-opts], [s-env], [s-filerepo], [r-config], [c-multitenancy].

**Recompile check.** On every request, `CompilerApi.getCompilers()` does the following:

1. It computes `version = (await schemaVersion()) || 'default_schema_version'`. An object return value is JSON-stringified.
2. **Only if `devServer` or `fastReload` is on**, it appends the md5 of `JSON.stringify(await repository.dataSchemaFiles())`.
3. If the version differs from the last one, it recompiles.

There is no file watcher. So:

| Mechanism                                                        | When files are re-read                          | Notes                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev mode: `CUBEJS_DEV_MODE=true`, or `NODE_ENV !== 'production'` | every API request (hashes all files)            | This is an authentication bypass: it mounts the Playground with no auth and hands out tokens ([c-devwarn]). The official image sets `NODE_ENV=production` ([s-dockerfile]) |
| `CUBEJS_FAST_RELOAD_ENABLED=true`                                | every API request (hashes all files)            | Source-only; absent from the env-var reference ([s-env], [r-env])                                                                                                          |
| `schemaVersion(ctx)`                                             | when its return value changes                   | Called on each request, with the context reused per app id ([r-config])                                                                                                    |
| Compiler-cache eviction                                          | when the app-id entry is evicted, or on restart | LRU with `compilerCacheSize` (default 250), `maxCompilerCacheKeepAlive` and `updateCompilerCacheKeepAlive` ([r-config], [s-server])                                        |

**`repositoryFactory`**

- It is called when a `CompilerApi` is created for an app id (once per app id). It returns any object with `localPath()` and `async dataSchemaFiles(): {fileName, content}[]` ([r-config], [s-filerepo], [s-server]).
- `FileRepository` is exported from `@cubejs-backend/server-core`. Python has `file_repository(path)` ([r-config]).
- `fileName` extensions drive how each file is compiled (§1).
- `FileRepository.writeDataSchemaFile(fileName, source)` exists and writes synchronously ([s-filerepo]).

**Draft isolation (candidate pattern)**

- Per-tenant or per-draft models come from `contextToAppId` combined with `repositoryFactory` ([c-multitenancy]).
- Each app id holds its own compile and SQL caches, "single-digit MBs … to dozens of MBs" ([c-multitenancy]).

**Dev-mode Playground routes (Core)**

- Registered only when `devServer` is on, with no auth middleware in `DevServer.ts` ([s-devserver], [s-server]):
  - `GET /playground/files`: file list with contents.
  - `GET /playground/db-schema`: tables from the driver.
  - `POST /playground/generate-schema`: body `{tables, format, dataSource?, tablesSchema?}`. It **runs `fs.emptyDir` on `<schemaPath>/cubes` and `<schemaPath>/views`**, then writes the generated cubes and an `example_view.yml`.
  - `POST /playground/schema/pre-aggregation`: edits JS or non-templated YAML only.

**CLI**

- `cubejs validate [-p schemaPath]` runs `compile(new FileRepository(schemaPath), {allowNodeRequire: true})` from `@cubejs-backend/schema-compiler` ([s-cli-validate], [s-prepare]).
- `cubejs generate -t t1,t2 [-d ds]` writes to `<schemaPath>/cubes/` ([s-cli-generate]).

**Validation feedback**

- Joi validates with `abortEarly: false` ([s-validator]).
- `ErrorReporter.throwIfAny()` groups errors by file (sorted), in the form `"<file> Errors:\n<msg>…"`. It throws `CompileError("Compile errors:\n…", plainMessages)` ([s-errors], [s-compile-error]).
- `CompileError` extends `Error`, not `UserError`. So the gateway's `handleError` falls to the default branch: HTTP 500 with `{ error: e.toString(), stack (dev mode only), requestId, plainError }` ([s-gateway]). This is from reading the source and has not been tested; see Open questions.

## YAML schema inventory (for form generation)

This section lists every key the Cube v1.7.42 compiler accepts in YAML model files, for a code editor paired with a form/tab editor.

- **Authority:** the Joi schemas in `CubeValidator.ts` at tag v1.7.42 ([y-validator]). Where the docs disagree with the validator, the row says so and §Y.17 collects all the mismatches.
- **Unknown keys fail validation.** The schemas are built with Joi `object().keys({...})`, which "Sets or extends the allowed object keys" ([y-joi]). A key not listed here is therefore rejected, except inside `meta`, which is `Joi.any()` ([y-validator]).

**Column legend**

- **Req.** Whether the key is required. "shape X" means it is required only in that shape.
- **Tmpl.** How the value is interpreted. Every cell is `J…` because Jinja is file-level: any YAML file containing `{%`, `%}`, `{{` or `}}` is rendered by Jinja before parsing, so `J` is always possible ([y-dsc]). The suffix says what Cube does with the value after that:
  - `J` — a plain YAML literal.
  - `J·SQL` — a Cube SQL template. The string is parsed as a Python f-string, so `{CUBE}`, `{member}`, `{cube.member}`, `{cube.sql()}` and context variables resolve ([y-yaml], [y-transpile]).
  - `J·REF` — compiled into member or cube reference(s). Write bare names; no braces ([y-transpile]).
  - `J·EXPR` — a boolean. If you write a string instead, it is parsed as a Python expression, for example `COMPILE_CONTEXT.security_context.is_finance`. These are the `nonStringFields` ([y-validator], [y-yaml], [y-r-view]).

### Y.1 How a YAML file becomes a validated model

1. If the file contains Jinja markers, Jinja renders it with `COMPILE_CONTEXT` and the functions and variables from `globals.py` ([y-dsc]).
2. `js-yaml` `load()` parses a single document ([y-yaml], [y-jsyaml]).
3. The root is checked. Only `cubes`, `views` and `view_groups` are allowed ([y-yaml]).
4. Named lists become maps: `measures`, `dimensions`, `segments`, `pre_aggregations` and `hierarchies`, plus the nested `granularities`, `indexes` and `time_shift`. An item without `name` gives `name isn't defined for …`; a key that is not a list gives `… must be defined as array` ([y-yaml]).
5. Transpiled fields become functions: SQL via the Python f-string parser, references via the Python expression parser. A parse failure gives `Failed to parse Python expression. Most likely this type of syntax isn't supported yet: …` ([y-yaml], [y-transpile]).
6. Keys are camelized. `type` and `relationship` values that contain `_` are camelized too (`count_distinct` becomes `countDistinct`). A missing pre-aggregation `type` defaults to `rollup` ([y-utils], [y-symbols]).
7. Joi validates each cube with `abortEarly: false`, then runs extra checks: granularity `sql` naming and unique view join paths ([y-validator]).
8. Evaluator checks run last: hierarchy levels, view groups, default filters, and duplicate member names ([y-evaluator], [y-vg], [y-symbols]).

### Y.2 File root

| YAML key      | Type                              | Req. | Default | Conflicts / dependencies                                                                                                                  | Tmpl. | Source   |
| ------------- | --------------------------------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| `cubes`       | list of cube objects (Y.3)        | no   | none    | Any mix of the three roots is allowed in one file. A duplicate name gives `Found duplicate cube name '<n>'.`                              | J     | [y-yaml] |
| `views`       | list of view objects (Y.10)       | no   | none    | A duplicate gives `Found duplicate view name '<n>'.`                                                                                      | J     | [y-yaml] |
| `view_groups` | list of view-group objects (Y.12) | no   | none    | A duplicate gives `Found duplicate view group name '<n>'.`                                                                                | J     | [y-yaml] |
| any other key | none                              | none | none    | `Unexpected YAML key: <k>. Only 'cubes', 'views', and 'view_groups' are allowed here.` A file that is empty or only whitespace is skipped | none  | [y-yaml] |

### Y.3 Cube

| YAML key           | Type                                         | Req.                               | Default          | Conflicts / dependencies                                                                                                         | Tmpl.               | Source                                |
| ------------------ | -------------------------------------------- | ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------- |
| `name`             | identifier, regex `^[_a-zA-Z][_a-zA-Z0-9]*$` | yes (YAML)                         | none             | Unique across all cubes and views. Not a Python reserved word                                                                    | J                   | [y-validator], [y-yaml], [y-d-syntax] |
| `sql_table`        | SQL (table name)                             | exactly one of `sql_table` / `sql` | none             | Joi `xor('sql','sqlTable')`                                                                                                      | J·SQL               | [y-validator], [y-r-cube]             |
| `sql`              | SQL (SELECT)                                 | exactly one of `sql_table` / `sql` | none             | xor with `sql_table`. Reuse another cube with `{other.sql()}`                                                                    | J·SQL               | [y-validator], [y-d-syntax]           |
| `extends`          | cube reference (name)                        | no                                 | none             | Inherits members. Inside extended cubes, reference columns with `{CUBE}`                                                         | J·REF (Python expr) | [y-yaml], [y-d-extending]             |
| `data_source`      | string                                       | no                                 | `default`        | Must be a data source known to `driverFactory`                                                                                   | J                   | [y-r-cube]                            |
| `sql_alias`        | string                                       | no                                 | auto             | Also renames pre-aggregation tables                                                                                              | J                   | [y-r-cube]                            |
| `title`            | string                                       | no                                 | humanized `name` | none                                                                                                                             | J                   | [y-r-cube], [y-validator]             |
| `description`      | string                                       | no                                 | none             | none                                                                                                                             | J                   | [y-r-cube], [y-validator]             |
| `public`           | boolean or expr                              | no                                 | `true`           | Legacy synonym `shown`                                                                                                           | J·EXPR              | [y-r-cube], [y-validator]             |
| `shown`            | boolean or expr                              | no                                 | none             | Legacy and undocumented. `public` takes precedence in meta visibility                                                            | J·EXPR              | [y-validator]                         |
| `meta`             | any                                          | no                                 | none             | See Y.15                                                                                                                         | J                   | [y-validator]                         |
| `calendar`         | boolean (strict)                             | no                                 | `false`          | Cubes only, not views. Needs exactly one `primary_key` dimension of `type: time`. Tesseract                                      | J                   | [y-validator], [y-d-calendar]         |
| `refresh_key`      | object (Y.4)                                 | no                                 | depends on DB    | none                                                                                                                             | none                | [y-r-cube]                            |
| `joins`            | list of join objects (Y.5)                   | no                                 | none             | none                                                                                                                             | none                | [y-validator]                         |
| `dimensions`       | named list (Y.6)                             | no                                 | none             | Member names must be unique across dimensions, measures, segments, pre_aggregations and hierarchies (`… defined more than once`) | none                | [y-validator], [y-symbols]            |
| `measures`         | named list (Y.7)                             | no                                 | none             | Same uniqueness rule                                                                                                             | none                | [y-validator]                         |
| `segments`         | named list (Y.8)                             | no                                 | none             | Same uniqueness rule                                                                                                             | none                | [y-validator]                         |
| `hierarchies`      | named list (Y.9)                             | no                                 | none             | Same uniqueness rule                                                                                                             | none                | [y-validator]                         |
| `pre_aggregations` | named list (Y.13)                            | no                                 | none             | Same uniqueness rule                                                                                                             | none                | [y-validator]                         |
| `access_policy`    | list (Y.14)                                  | no                                 | none             | none                                                                                                                             | none                | [y-validator], [y-r-dap]              |
| `rewrite_queries`  | boolean or expr                              | no                                 | none             | Undocumented                                                                                                                     | J·EXPR              | [y-validator]                         |

### Y.4 Cube `refresh_key`

| YAML key    | Type                                                                                                        | Req.                                 | Default                                                                               | Conflicts / dependencies                                                                    | Tmpl. | Source                    |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- | ------------------------- |
| `every`     | `N unit` with unit ∈ {second, minute, hour, day, week} (plural `s` allowed), or a 5- or 6-field CRON string | one of `every` / `sql` / `immutable` | `2 minute` on BigQuery, Athena, Snowflake, Presto and Firebolt; `10 second` elsewhere | With `sql`, only an interval is allowed, not CRON                                           | J     | [y-validator], [y-r-cube] |
| `sql`       | SQL                                                                                                         | one of the three                     | none                                                                                  | With `every`, the object may hold only `sql` and `every`                                    | J·SQL | [y-validator]             |
| `timezone`  | IANA time zone                                                                                              | no                                   | query time zone                                                                       | Only with a CRON or interval `every` and no `sql`. An invalid zone gives `unknown timezone` | J     | [y-validator], [y-r-cube] |
| `immutable` | boolean (strict)                                                                                            | one of the three                     | none                                                                                  | The object may hold only `immutable`                                                        | J     | [y-validator]             |

### Y.5 Join (list item under `joins`)

| YAML key       | Type                                                                                                                                                                                 | Req. | Default | Conflicts / dependencies                                                                                                  | Tmpl. | Source                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------- |
| `name`         | identifier; the target cube's name                                                                                                                                                   | yes  | none    | At most one join per target cube; since v1.7.40 a second one fails to compile. To join the same cube twice, use `extends` | J     | [y-validator], [y-r-joins], [y-changelog] |
| `relationship` | enum: `many_to_one`, `one_to_many`, `one_to_one`; legacy `belongs_to`, `has_many`, `has_one`; camelCase forms `manyToOne`, `oneToMany`, `oneToOne`, `belongsTo`, `hasMany`, `hasOne` | yes  | none    | Both cubes need a `primary_key` for fan-out handling. Joins are directed and always LEFT JOIN                             | J     | [y-validator], [y-r-joins]                |
| `sql`          | SQL (ON condition)                                                                                                                                                                   | yes  | none    | Typically `{CUBE}.fk = {target}.pk`                                                                                       | J·SQL | [y-validator], [y-r-joins]                |

### Y.6 Dimension (named list item under `dimensions`)

Joi accepts exactly one of these shapes ([y-validator]):

| Shape | Keys                                                                     | Not allowed in this shape |
| ----- | ------------------------------------------------------------------------ | ------------------------- |
| **A** | `sql`, optionally with `sub_query` and `propagate_filters_to_sub_query`  | none                      |
| **B** | `case`, optionally with `multi_stage`                                    | `sql`                     |
| **C** | `latitude` + `longitude` (`type: geo`)                                   | `sql`                     |
| **D** | `multi_stage: true` + `sql`, optionally with `add_group_by` and `filter` | none                      |
| **E** | `type: time` + `sql` + `time_shift`                                      | none                      |
| **F** | `type: switch` + `values`                                                | every other key           |

| YAML key                                                                                | Type                                                                                                                                                                                                                                                                                                  | Req.           | Default                                  | Conflicts / dependencies                                                                                   | Tmpl.                       | Source                                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `name`                                                                                  | identifier                                                                                                                                                                                                                                                                                            | yes            | none                                     | Unique within the cube                                                                                     | J                           | [y-validator], [y-yaml]                        |
| `type`                                                                                  | enum: `string`, `number`, `boolean`, `time`, `geo`, `switch`                                                                                                                                                                                                                                          | yes            | none                                     | `switch` allows only `name`, `type` and `values` (shape F). `/v1/meta` reports `switch` as `string`        | J                           | [y-validator], [y-r-dimensions]                |
| `sql`                                                                                   | SQL                                                                                                                                                                                                                                                                                                   | shapes A, D, E | none                                     | Not allowed with `case` (B), geo (C) or switch (F). Time dimensions should evaluate to TIMESTAMP           | J·SQL                       | [y-validator], [y-d-syntax]                    |
| `title`                                                                                 | string                                                                                                                                                                                                                                                                                                | no             | humanized `name`                         | Not allowed on switch                                                                                      | J                           | [y-validator]                                  |
| `description`                                                                           | string                                                                                                                                                                                                                                                                                                | no             | none                                     | Not allowed on switch                                                                                      | J                           | [y-validator]                                  |
| `public`                                                                                | boolean or expr                                                                                                                                                                                                                                                                                       | no             | `true`; `false` when `primary_key: true` | Legacy `shown`                                                                                             | J·EXPR                      | [y-validator], [y-r-dimensions]                |
| `primary_key`                                                                           | boolean or expr                                                                                                                                                                                                                                                                                       | no             | `false`                                  | Required on cubes used in joins. A calendar cube needs exactly one, and it must be `type: time`            | J·EXPR                      | [y-validator], [y-r-joins], [y-d-calendar]     |
| `order`                                                                                 | enum: `asc`, `desc`                                                                                                                                                                                                                                                                                   | no             | none                                     | Default sort order                                                                                         | J                           | [y-validator], [y-r-dimensions]                |
| `format`                                                                                | Depends on `type`. **string/boolean/geo:** `imageUrl`, `link`, `{type: link, label}`, `currency`, `percent`, `number`, `id`. **number:** the same plus named formats (Y.16) and d3-format specifiers. **time:** the same base set plus strftime/d3-time strings containing at least one `%` specifier | no             | none                                     | Invalid strings produce a specific error, e.g. `Invalid time format …`, `Invalid numeric format …`         | J                           | [y-validator], [y-formats], [y-r-dimensions]   |
| `currency`                                                                              | ISO 4217 code, case-insensitive, stored upper-case                                                                                                                                                                                                                                                    | no             | none                                     | Only on `type: number`. Otherwise: `"currency" property can only be used with dimensions of type "number"` | J                           | [y-validator]                                  |
| `meta`                                                                                  | any                                                                                                                                                                                                                                                                                                   | no             | none                                     | See Y.15                                                                                                   | J                           | [y-validator]                                  |
| `mask`                                                                                  | number, boolean, string, or `{sql}`                                                                                                                                                                                                                                                                   | no             | `NULL`                                   | Used by `member_masking` policies (Y.14). A string value is parsed as a Python expression (see Y.21)       | J·EXPR; `mask.sql` is J·SQL | [y-validator], [y-r-dimensions], [y-transpile] |
| `sub_query`                                                                             | boolean or expr                                                                                                                                                                                                                                                                                       | no             | `false`                                  | Shapes A and D only. `sql` references a measure, usually of another cube                                   | J·EXPR                      | [y-validator], [y-r-dimensions]                |
| `propagate_filters_to_sub_query`                                                        | boolean or expr                                                                                                                                                                                                                                                                                       | no             | `false`                                  | Only meaningful with `sub_query`                                                                           | J·EXPR                      | [y-validator], [y-r-dimensions]                |
| `case`                                                                                  | object (Y.6c)                                                                                                                                                                                                                                                                                         | shape B        | none                                     | No `sql`                                                                                                   | see Y.6c                    | [y-validator]                                  |
| `latitude`                                                                              | `{sql}`                                                                                                                                                                                                                                                                                               | shape C        | none                                     | Needs `longitude`, `type: geo`, and no `sql`                                                               | J·SQL                       | [y-validator], [y-r-dimensions]                |
| `longitude`                                                                             | `{sql}`                                                                                                                                                                                                                                                                                               | shape C        | none                                     | Needs `latitude`                                                                                           | J·SQL                       | [y-validator]                                  |
| `granularities`                                                                         | named list (Y.6a)                                                                                                                                                                                                                                                                                     | no             | none                                     | Only on `type: time`; forbidden on other types. Granularity names are not camelized                        | see Y.6a                    | [y-validator], [y-utils]                       |
| `time_shift`                                                                            | list (Y.6b)                                                                                                                                                                                                                                                                                           | no             | none                                     | Shape E (`type: time`). Docs: calendar cubes only. Joi does not check `calendar`                           | see Y.6b                    | [y-validator], [y-r-dimensions]                |
| `links`                                                                                 | list (Y.6d)                                                                                                                                                                                                                                                                                           | no             | none                                     | Needs Cube 1.6.53 or later                                                                                 | see Y.6d                    | [y-validator], [y-r-dimensions]                |
| `values`                                                                                | list of strings (at least one)                                                                                                                                                                                                                                                                        | shape F        | none                                     | Forbidden unless `type: switch`                                                                            | J                           | [y-validator]                                  |
| `multi_stage`                                                                           | boolean                                                                                                                                                                                                                                                                                               | no             | none                                     | Shapes B and D. Tesseract                                                                                  | J                           | [y-validator]                                  |
| `add_group_by`                                                                          | member references                                                                                                                                                                                                                                                                                     | no             | none                                     | Shape D (`multi_stage: true`)                                                                              | J·REF                       | [y-validator], [y-transpile]                   |
| `filter`                                                                                | multi-stage filter (Y.7d)                                                                                                                                                                                                                                                                             | no             | none                                     | Shape D                                                                                                    | see Y.7d                    | [y-validator]                                  |
| `key`                                                                                   | member reference                                                                                                                                                                                                                                                                                      | no             | none                                     | Undocumented. Surfaces as `key` in `/v1/meta`                                                              | J·REF                       | [y-validator], [y-transpile]                   |
| `suggest_filter_values`                                                                 | boolean                                                                                                                                                                                                                                                                                               | no             | `true` in meta                           | Undocumented                                                                                               | J                           | [y-validator]                                  |
| `shown`, `aliases`, `field_type` (`string`), `values_as_segments`, `enable_suggestions` | legacy                                                                                                                                                                                                                                                                                                | no             | none                                     | Undocumented                                                                                               | J / J·EXPR (`shown`)        | [y-validator]                                  |

**Y.6a `granularities` item.** Joi accepts one of three shapes ([y-validator]):

- `{interval, origin, title?}`
- `{interval, offset?, title?}`
- `{sql, title?}`

| YAML key   | Type                                                                                   | Req.                           | Default   | Conflicts / dependencies                                                                                                                                                                                                                                                                                    | Tmpl. | Source                          |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------- |
| `name`     | identifier                                                                             | yes                            | none      | A `sql` granularity must be named after a predefined granularity (year, quarter, month, week, day, hour, minute, second). Otherwise: `…a granularity defined with 'sql' must be named after one of the predefined granularities…`                                                                           | J     | [y-validator], [y-r-dimensions] |
| `interval` | `N unit[ N unit…]` with unit ∈ {second, minute, hour, day, week, month, quarter, year} | yes, except in the `sql` shape | none      | Without `origin`, the interval must be a single unit that divides its parent evenly (`week` and `day` only 1; `month` a divisor of 12; `quarter` a divisor of 4; `hour` a divisor of 24; `minute`/`second` a divisor of 60). Otherwise: `Arbitrary intervals cannot be used without origin point specified` | J     | [y-validator]                   |
| `offset`   | signed `N unit[ …]`                                                                    | no                             | none      | **Cannot be combined with `origin`** (separate Joi shapes)                                                                                                                                                                                                                                                  | J     | [y-validator]                   |
| `origin`   | ISO date or datetime string                                                            | no                             | none      | Makes arbitrary intervals legal. Invalid values: `Origin should be valid date-only form…`                                                                                                                                                                                                                   | J     | [y-validator]                   |
| `title`    | string                                                                                 | no                             | humanized | none                                                                                                                                                                                                                                                                                                        | J     | [y-validator]                   |
| `sql`      | SQL                                                                                    | `sql` shape                    | none      | Overrides the default granularity SQL, typically on calendar cubes. Pre-aggregations must declare overridden granularities                                                                                                                                                                                  | J·SQL | [y-validator], [y-d-calendar]   |

Custom granularities work on Athena, Redshift, DuckDB, Databricks, BigQuery, ClickHouse, SQL Server, MySQL, Postgres and Snowflake. They can be queried by name only through the REST API ([y-r-dimensions], [y-rc-granularity]).

**Y.6b dimension `time_shift` item** (calendar cubes). The shapes are ([y-validator]):

- `{name, type, interval}`
- `{name, sql}`
- `{type, interval, sql}` (no `name`)

| YAML key   | Type                                                                                                 | Req.                    | Conflicts / dependencies                              | Tmpl. | Source                        |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------- | ----- | ----------------------------- |
| `name`     | identifier                                                                                           | in the first two shapes | Referenced by measures through `time_shift: [{name}]` | J     | [y-validator], [y-d-calendar] |
| `type`     | enum: `prior`, `next`                                                                                | with `interval`         | Forbidden in the `{name, sql}` shape                  | J     | [y-validator]                 |
| `interval` | `N unit`, N may be negative, unit ∈ {minute, hour, day, week, month, quarter, year} (plural allowed) | with `type`             | Forbidden in the `{name, sql}` shape                  | J     | [y-validator]                 |
| `sql`      | SQL mapping a time to its shifted time                                                               | in the last two shapes  | none                                                  | J·SQL | [y-validator], [y-transpile]  |

**Y.6c `case`.** Two forms ([y-validator], [y-r-dimensions]):

- **Label form:** `when: [{sql, label}]` plus `else: {label}`. `when[].sql` is required (J·SQL). `label` is a string, or `{sql}` (J·SQL) for a dynamic label.
- **Switch form:** `switch` (J·SQL, required), `when: [{value (string, required), sql (required)}]`, and `else: {sql}`. The docs use it for multi-stage conditional members over `switch` dimensions ([y-d-measures]).

**Y.6d `links` item** ([y-validator], [y-r-dimensions])

| YAML key    | Type                                                      | Req.     | Conflicts / dependencies                                                                                      | Tmpl.            | Source                          |
| ----------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------- |
| `name`      | identifier                                                | yes      | Unique per dimension (`Duplicate link name`). Produces the synthetic dimension `<dim>___link_<name>_url`      | J                | [y-validator], [y-r-dimensions] |
| `label`     | string                                                    | yes      | none                                                                                                          | J                | [y-validator]                   |
| `url`       | SQL                                                       | see note | At most one of `url` / `dashboard` (Joi `oxor`). **The docs say one of them is required; Joi allows neither** | J·SQL            | [y-validator], [y-r-dimensions] |
| `dashboard` | string (dashboard slug)                                   | see note | As above                                                                                                      | J                | [y-validator]                   |
| `icon`      | string (Tabler icon, kebab-case)                          | no       | none                                                                                                          | J                | [y-r-dimensions]                |
| `target`    | enum: `blank`, `self`                                     | no       | Default depends on link type                                                                                  | J                | [y-validator], [y-r-dimensions] |
| `primary`   | boolean (strict)                                          | no       | At most one per dimension (`Only one link can be marked as primary`)                                          | J                | [y-validator]                   |
| `params`    | list of `{key: string (required), value: SQL (required)}` | no       | Values are URL-encoded                                                                                        | `value` is J·SQL | [y-validator], [y-transpile]    |

### Y.7 Measure (named list item under `measures`)

**Shapes** ([y-validator]):

- **Without `multi_stage`:**
  - `type: count`: `sql` is optional.
  - `type` ∈ {`number`, `string`, `boolean`, `time`, `sum`, `avg`, `min`, `max`, `count_distinct`, `count_distinct_approx`}: `sql` is required.
- **With `multi_stage: true`:**
  - The type list above plus `number_agg` and `rank`.
  - `sql` is optional.
  - The Y.7b–Y.7e keys become allowed.

| YAML key                                                                       | Type                                                                             | Req.                                    | Default          | Conflicts / dependencies                                                                                                                | Tmpl.                       | Source                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------- |
| `name`                                                                         | identifier                                                                       | yes                                     | none             | Unique within the cube                                                                                                                  | J                           | [y-validator], [y-yaml]                      |
| `type`                                                                         | enum (see Shapes)                                                                | yes                                     | none             | `number_agg` and `rank` pass Joi only with `multi_stage: true` (§Y.17). `running_total` was removed in 1.7.0                            | J                           | [y-validator], [y-r-measures], [y-changelog] |
| `sql`                                                                          | SQL                                                                              | yes, except for `count` and multi-stage | none             | Aggregate types take a non-aggregated expression. `number`, `string`, `time` and `boolean` take an aggregate expression                 | J·SQL                       | [y-validator], [y-r-measures]                |
| `title`                                                                        | string                                                                           | no                                      | humanized `name` | none                                                                                                                                    | J                           | [y-validator]                                |
| `description`                                                                  | string                                                                           | no                                      | none             | none                                                                                                                                    | J                           | [y-validator]                                |
| `public`                                                                       | boolean or expr                                                                  | no                                      | `true`           | Legacy `shown` and `visible`                                                                                                            | J·EXPR                      | [y-validator]                                |
| `format`                                                                       | `percent`, `currency`, `number`, a named format (Y.16), or a d3-format specifier | no                                      | none             | `imageUrl` and `link` are not allowed on measures                                                                                       | J                           | [y-validator], [y-formats]                   |
| `currency`                                                                     | ISO 4217 code                                                                    | no                                      | none             | Forbidden on `string`, `boolean` and `time` measures                                                                                    | J                           | [y-validator]                                |
| `meta`                                                                         | any                                                                              | no                                      | none             | See Y.15                                                                                                                                | J                           | [y-validator]                                |
| `mask`                                                                         | number, boolean, string, or `{sql}`                                              | no                                      | `NULL`           | Measure masks are not applied in ungrouped queries                                                                                      | J·EXPR; `mask.sql` is J·SQL | [y-validator], [y-r-measures]                |
| `filters`                                                                      | list of `{sql}`                                                                  | no                                      | none             | Filtered aggregation                                                                                                                    | J·SQL                       | [y-validator], [y-r-measures]                |
| `drill_members`                                                                | list of member references                                                        | no                                      | none             | Surfaces as `drillMembers` in meta                                                                                                      | J·REF                       | [y-validator], [y-transpile]                 |
| `rolling_window`                                                               | object (Y.7a)                                                                    | no                                      | none             | Queries need a time dimension with a date range. With Tesseract, `to_date` works without one if the data source generates a time series | see Y.7a                    | [y-validator], [y-r-measures]                |
| `multi_stage`                                                                  | boolean                                                                          | no                                      | none             | Tesseract (default since 1.7.0). Unlocks Y.7b–Y.7e                                                                                      | J                           | [y-validator], [y-d-measures]                |
| `time_shift`                                                                   | list (Y.7b)                                                                      | no                                      | none             | multi-stage only                                                                                                                        | see Y.7b                    | [y-validator]                                |
| `grain`                                                                        | object (Y.7c)                                                                    | no                                      | none             | multi-stage only                                                                                                                        | see Y.7c                    | [y-validator]                                |
| `group_by` / `reduce_by` / `add_group_by`                                      | member references                                                                | no                                      | none             | multi-stage only. Deprecated in favour of `grain.keep_only`, `grain.exclude` and `grain.include`                                        | J·REF                       | [y-validator], [y-r-measures]                |
| `filter`                                                                       | object (Y.7d)                                                                    | no                                      | none             | multi-stage only                                                                                                                        | see Y.7d                    | [y-validator]                                |
| `case`                                                                         | object (Y.6c, either form)                                                       | no                                      | none             | multi-stage only. The docs require an `else` branch                                                                                     | see Y.6c                    | [y-validator], [y-r-measures]                |
| `order_by`                                                                     | list of `{sql (required), dir: asc or desc}`                                     | no                                      | none             | multi-stage only; used by `rank`                                                                                                        | `sql` is J·SQL              | [y-validator], [y-d-measures]                |
| `cumulative`, `drill_filters` (list of `{sql}`), `aliases`, `visible`, `shown` | legacy                                                                           | no                                      | none             | Undocumented                                                                                                                            | J / J·SQL                   | [y-validator]                                |

**Y.7a `rolling_window`** ([y-validator], [y-r-measures])

| YAML key      | Type                                                                                                | Req.              | Default    | Conflicts / dependencies                                              | Tmpl. | Source                        |
| ------------- | --------------------------------------------------------------------------------------------------- | ----------------- | ---------- | --------------------------------------------------------------------- | ----- | ----------------------------- |
| `type`        | enum: `fixed`, `to_date`, `year_to_date`, `quarter_to_date`, `month_to_date`                        | no                | `fixed`    | The last three are accepted by Joi but not described in the reference | J     | [y-validator], [y-r-measures] |
| `trailing`    | `N unit` (N may be negative; unit ∈ {minute, hour, day, week, month, quarter, year}) or `unbounded` | no                | none       | `fixed` only                                                          | J     | [y-validator]                 |
| `leading`     | same as `trailing`                                                                                  | no                | `0` (docs) | `fixed` only                                                          | J     | [y-validator], [y-r-measures] |
| `offset`      | enum: `start`, `end`                                                                                | no                | `end`      | `fixed` only                                                          | J     | [y-validator], [y-r-measures] |
| `granularity` | string (granularity name)                                                                           | yes for `to_date` | none       | `to_date` only. Custom granularities need Tesseract                   | J     | [y-validator], [y-r-measures] |

**Y.7b measure `time_shift`** ([y-validator], [y-r-measures])

- **One item:** exactly one of `name` or `interval`. `interval` requires `type`. `time_dimension` is optional.
- **Two or more items:** every item needs `time_dimension`, `interval` and `type`, and `name` is not allowed.

| YAML key         | Type                                                              | Tmpl. | Source                        |
| ---------------- | ----------------------------------------------------------------- | ----- | ----------------------------- |
| `interval`       | `N unit` (unit ∈ {minute, hour, day, week, month, quarter, year}) | J     | [y-validator]                 |
| `type`           | enum: `prior`, `next`                                             | J     | [y-validator]                 |
| `time_dimension` | member reference                                                  | J·REF | [y-validator], [y-transpile]  |
| `name`           | identifier; must name a calendar-cube shift (Y.6b)                | J     | [y-validator], [y-d-calendar] |

**Y.7c `grain`.** Keys: `exclude`, `keep_only`, `include`; each is a list of member references (J·REF). `exclude` and `keep_only` cannot be combined (Joi `nand`) ([y-validator], [y-transpile]).

**Y.7d multi-stage `filter`**

- `mode`: `relative` or `fixed`.
- `exclude` or `keep_only`: member references (J·REF); not both.
- `include`: a list of filters. Each is either `{member (string, required), operator (Y.16 list including measureFilter), values (list, required unless set or notSet)}` or `{or: [...]}` / `{and: [...]}` ([y-validator], [y-transpile]).

### Y.8 Segment (named list item under `segments`)

| YAML key           | Type                  | Req. | Default   | Conflicts / dependencies                       | Tmpl.      | Source                        |
| ------------------ | --------------------- | ---- | --------- | ---------------------------------------------- | ---------- | ----------------------------- |
| `name`             | identifier            | yes  | none      | Unique among the cube's members                | J          | [y-validator], [y-r-segments] |
| `sql`              | SQL (WHERE predicate) | yes  | none      | none                                           | J·SQL      | [y-validator], [y-r-segments] |
| `description`      | string                | no   | none      | none                                           | J          | [y-validator]                 |
| `public`           | boolean or expr       | no   | `true`    | Legacy `shown`                                 | J·EXPR     | [y-validator], [y-r-segments] |
| `title`            | string                | no   | humanized | Accepted by Joi; not in the segments reference | J          | [y-validator]                 |
| `meta`             | any                   | no   | none      | Accepted by Joi; not in the segments reference | J          | [y-validator]                 |
| `shown`, `aliases` | legacy                | no   | none      | Undocumented                                   | J·EXPR / J | [y-validator]                 |

### Y.9 Hierarchy (named list item under `hierarchies`)

| YAML key | Type                                         | Req.                         | Default | Conflicts / dependencies                                                                                                                                   | Tmpl.  | Source                                          |
| -------- | -------------------------------------------- | ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------- |
| `name`   | identifier                                   | yes                          | none    | Unique among the cube's members                                                                                                                            | J      | [y-validator], [y-r-hierarchies]                |
| `levels` | list of dimension references, coarse to fine | docs: yes; **Joi: optional** | none    | Must be dimensions (`Only dimensions can be part of a hierarchy…`). Joined-cube dimensions are allowed. In views, levels that are not included are dropped | J·REF  | [y-validator], [y-evaluator], [y-r-hierarchies] |
| `title`  | string                                       | no                           | none    | none                                                                                                                                                       | J      | [y-validator]                                   |
| `public` | boolean or expr                              | no                           | `true`  | none                                                                                                                                                       | J·EXPR | [y-validator]                                   |

### Y.10 View (list item under `views`)

| YAML key                                                                                                                      | Type                         | Req.        | Default   | Conflicts / dependencies                                                                                                                   | Tmpl.               | Source                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------ |
| `name`                                                                                                                        | identifier                   | yes (YAML)  | none      | Unique across cubes and views                                                                                                              | J                   | [y-validator], [y-yaml]              |
| `cubes`                                                                                                                       | list of cube entries (Y.10a) | no (Joi)    | none      | One join path per cube per root, otherwise: `Views can't define multiple join paths to the same cube…`                                     | see Y.10a           | [y-validator], [y-r-view]            |
| `extends`                                                                                                                     | view reference               | no          | none      | none                                                                                                                                       | J·REF (Python expr) | [y-validator], [y-yaml], [y-r-view]  |
| `title`                                                                                                                       | string                       | no          | humanized | none                                                                                                                                       | J                   | [y-validator]                        |
| `description`                                                                                                                 | string                       | no          | none      | none                                                                                                                                       | J                   | [y-validator]                        |
| `public`                                                                                                                      | boolean or expr              | no          | `true`    | e.g. `COMPILE_CONTEXT.security_context.is_finance`                                                                                         | J·EXPR              | [y-validator], [y-r-view]            |
| `meta`                                                                                                                        | any                          | no          | none      | See Y.15 (`ai_context`, `auto_run`, `default_ui_filters`)                                                                                  | J                   | [y-validator], [y-r-view]            |
| `measures`                                                                                                                    | named list (Y.7 schema)      | no          | none      | May reference only included view members; view measures over raw columns are rejected. Combining different cubes needs `multi_stage: true` | as Y.7              | [y-validator], [y-r-view]            |
| `dimensions`                                                                                                                  | named list (Y.6 schema)      | no          | none      | Same rules as `measures`                                                                                                                   | as Y.6              | [y-validator], [y-r-view]            |
| `folders`                                                                                                                     | list (Y.11)                  | no          | none      | Views only                                                                                                                                 | see Y.11            | [y-validator], [y-r-view]            |
| `default_filters`                                                                                                             | list (Y.10c)                 | no          | none      | Enforced on every query against the view. Not in `/v1/meta`                                                                                | see Y.10c           | [y-validator], [y-r-view]            |
| `access_policy`                                                                                                               | list (Y.14)                  | no          | none      | none                                                                                                                                       | none                | [y-validator], [y-r-view]            |
| `view_group` / `view_groups`                                                                                                  | view-group reference(s)      | no          | none      | Undocumented. The group must exist: `View "<v>" references view group "<g>" which is not defined.`                                         | J·REF               | [y-validator], [y-vg], [y-transpile] |
| `joins`, `segments`, `hierarchies`, `pre_aggregations`, `refresh_key`, `data_source`, `sql_alias`, `rewrite_queries`, `shown` | as in cubes                  | no          | none      | Accepted by Joi through the shared base schema; not documented for views; behaviour untested                                               | as in cubes         | [y-validator]                        |
| `sql`, `sql_table`, `calendar`                                                                                                | none                         | not allowed | none      | Not in `viewSchema`, so they are rejected                                                                                                  | none                | [y-validator], [y-joi]               |

**Y.10a view `cubes` entry**

| YAML key    | Type                                                           | Req.                         | Default   | Conflicts / dependencies                                                                                              | Tmpl.             | Source                    |
| ----------- | -------------------------------------------------------------- | ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------- |
| `join_path` | reference path `root.cube2.cube3`                              | yes                          | none      | Follows directed joins from the root                                                                                  | J·REF             | [y-validator], [y-r-view] |
| `includes`  | `"*"`, or a list of member names and/or member objects (Y.10b) | docs: yes; **Joi: optional** | none      | Can include measures, dimensions, segments and hierarchies. `public: false` cube members become queryable if included | J (literal names) | [y-validator], [y-r-view] |
| `excludes`  | list of member names                                           | no                           | none      | Used with `includes: "*"`                                                                                             | J                 | [y-validator], [y-r-view] |
| `prefix`    | boolean or expr                                                | no                           | `false`   | When true, members are exposed as `<cube>_<member>`                                                                   | J·EXPR            | [y-validator], [y-r-view] |
| `alias`     | string                                                         | no                           | cube name | The prefix to use when `prefix: true`                                                                                 | J                 | [y-validator], [y-r-view] |
| `split`     | boolean                                                        | no                           | none      | Undocumented                                                                                                          | J                 | [y-validator]             |

**Y.10b include member object**

| YAML key      | Type                                                                                                    | Req.                | Conflicts / dependencies                                                    | Tmpl. | Source                     |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- | ----- | -------------------------- |
| `name`        | identifier (cube member name)                                                                           | yes                 | Paths are not allowed: `Paths aren't allowed in cube includes…`             | J     | [y-validator], [y-symbols] |
| `alias`       | identifier                                                                                              | no                  | Renames the exposed member                                                  | J     | [y-validator]              |
| `title`       | string                                                                                                  | no                  | none                                                                        | J     | [y-validator]              |
| `description` | string                                                                                                  | no                  | none                                                                        | J     | [y-validator]              |
| `format`      | **base formats only:** `imageUrl`, `link`, `{type: link, label}`, `currency`, `percent`, `number`, `id` | no                  | Narrower than member-level `format` (no named or d3 formats)                | J     | [y-validator]              |
| `meta`        | any                                                                                                     | no                  | Replaces the whole member `meta`                                            | J     | [y-validator], [y-r-view]  |
| `currency`    | none                                                                                                    | **rejected by Joi** | `CubeSymbols` reads `include.currency`, but the Joi object does not list it | none  | [y-validator], [y-symbols] |

**Y.10c `default_filters` item** ([y-validator], [y-r-view], [y-evaluator])

| YAML key   | Type                                               | Req.                              | Conflicts / dependencies                                           | Tmpl.          |
| ---------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | -------------- |
| `member`   | member reference                                   | yes                               | Must be exposed by the view                                        | J·REF          |
| `operator` | enum (Y.16 operator list, without `measureFilter`) | yes                               | none                                                               | J              |
| `values`   | list                                               | yes, except with `set` / `notSet` | none                                                               | J (transpiled) |
| `unless`   | list of member references                          | no                                | Filtering or grouping on one of these members releases the default | J·REF          |

### Y.11 Folder (list item under a view's `folders`)

| YAML key   | Type                                                                                                                                       | Req. | Default | Conflicts / dependencies                                                                                                                                | Tmpl.                   | Source                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------- |
| `name`     | string (free text)                                                                                                                         | yes  | none    | Unique within the view (docs)                                                                                                                           | J                       | [y-validator], [y-d-syntax]              |
| `includes` | `"*"`, or a list whose items are a member name, `{join_path: <path>}` (every member from that path), or a nested folder `{name, includes}` | yes  | none    | No depth limit in the schema. Nested display depends on the consuming tool; the flat `folders` meta output depends on `CUBEJS_NESTED_FOLDERS_DELIMITER` | J; `join_path` is J·REF | [y-validator], [y-transpile], [y-r-view] |

### Y.12 View group (list item under `view_groups`)

| YAML key      | Type                                                                                                 | Req. | Default | Conflicts / dependencies                                                                                                                                | Tmpl.              | Source                                   |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------- |
| `name`        | string                                                                                               | yes  | none    | Unique. A duplicate gives `View group "<n>" already exists!`                                                                                            | J                  | [y-validator], [y-vg]                    |
| `title`       | string                                                                                               | no   | none    | none                                                                                                                                                    | J                  | [y-validator], [y-r-view-group]          |
| `description` | string                                                                                               | no   | none    | none                                                                                                                                                    | J                  | [y-validator], [y-r-view-group]          |
| `includes`    | list of view names and/or nested groups `{name (required), title, description, includes (required)}` | no   | none    | At most one of `includes` / `views` (`View group must use either "views" or "includes"`). Unknown views: `…includes "<x>" which is not a defined view.` | J·REF (view names) | [y-validator], [y-vg], [y-d-view-groups] |
| `views`       | list of view names (legacy)                                                                          | no   | none    | Ignored when `includes` is present                                                                                                                      | J·REF              | [y-validator], [y-vg]                    |

### Y.13 Pre-aggregation keys (named list item under `pre_aggregations`)

Details belong in the pre-aggregations research doc. These are the Joi keys per `type`. `type` values are camelized before validation, and a missing `type` becomes `rollup` ([y-validator], [y-symbols], [y-r-preagg]).

| YAML key                                                                                                            | Allowed for types                                | Type / values                                                                                   | Req.                                       | Notes                                                                                                      | Tmpl.          | Source                                   |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------- |
| `name`                                                                                                              | all                                              | identifier                                                                                      | yes                                        | none                                                                                                       | J              | [y-yaml]                                 |
| `type`                                                                                                              | none                                             | enum: `rollup`, `original_sql`, `rollup_join`, `rollup_lambda`, `auto_rollup`                   | no                                         | Default `rollup`. `auto_rollup` is undocumented                                                            | J              | [y-validator], [y-symbols], [y-r-preagg] |
| `measures`, `dimensions`, `segments`                                                                                | rollup, rollup_join, rollup_lambda               | member reference lists                                                                          | no                                         | none                                                                                                       | J·REF          | [y-validator], [y-transpile]             |
| `time_dimension`                                                                                                    | rollup, original_sql, rollup_join, rollup_lambda | member reference                                                                                | original_sql: with `partition_granularity` | none                                                                                                       | J·REF          | [y-validator]                            |
| `granularity`                                                                                                       | rollup, rollup_join, rollup_lambda               | string                                                                                          | yes when the key is present                | Docs: required with `time_dimension`                                                                       | J              | [y-validator], [y-r-preagg]              |
| `time_dimensions`                                                                                                   | rollup                                           | list of `{dimension (reference), granularity}`                                                  | no                                         | Undocumented                                                                                               | J·REF          | [y-validator], [y-transpile]             |
| `rollups`                                                                                                           | rollup_join, rollup_lambda                       | pre-aggregation reference list                                                                  | yes for those types                        | none                                                                                                       | J·REF          | [y-validator]                            |
| `partition_granularity`                                                                                             | all except rollup_lambda                         | enum: `hour`, `day`, `week`, `month`, `quarter`, `year`                                         | original_sql with `time_dimension`: yes    | none                                                                                                       | J              | [y-validator]                            |
| `refresh_key`                                                                                                       | all except rollup_lambda                         | `{sql, every (interval)}` or `{every (interval or CRON), timezone, incremental, update_window}` | no                                         | Docs default `every: 1 hour` (10 seconds when `sql` is set)                                                | `sql` is J·SQL | [y-validator], [y-r-preagg]              |
| `scheduled_refresh`                                                                                                 | all except rollup_lambda                         | boolean or expr                                                                                 | no                                         | Default `true`. Must be `false` for rollup_join                                                            | J·EXPR         | [y-validator], [y-r-preagg]              |
| `build_range_start`, `build_range_end`                                                                              | all except rollup_lambda                         | `{sql}`                                                                                         | no                                         | none                                                                                                       | J·SQL          | [y-validator], [y-r-preagg]              |
| `refresh_range_start`, `refresh_range_end`                                                                          | all except rollup_lambda                         | `{sql}`                                                                                         | no                                         | Undocumented in the reference                                                                              | J·SQL          | [y-validator]                            |
| `indexes`                                                                                                           | all except rollup_lambda                         | named list of `{columns (references), type: regular or aggregate}` or `{sql}`                   | no                                         | `type` defaults to `regular`                                                                               | J·REF / J·SQL  | [y-validator], [y-r-preagg]              |
| `allow_non_strict_date_range_match`                                                                                 | rollup, original_sql, rollup_join                | boolean                                                                                         | no                                         | Docs default `true`                                                                                        | J              | [y-validator], [y-r-preagg]              |
| `use_original_sql_pre_aggregations`, `external`, `read_only`                                                        | all except rollup_lambda                         | boolean or expr                                                                                 | no                                         | `external` and `read_only` are undocumented                                                                | J·EXPR         | [y-validator]                            |
| `union_with_source_data`                                                                                            | rollup_lambda                                    | boolean or expr                                                                                 | no                                         | Default `false`                                                                                            | J·EXPR         | [y-validator], [y-r-preagg]              |
| `unique_key_columns`                                                                                                | rollup, original_sql                             | list of strings                                                                                 | no                                         | Undocumented                                                                                               | J              | [y-validator]                            |
| `stream_offset`                                                                                                     | all except rollup_lambda                         | enum: `earliest`, `latest`                                                                      | no                                         | Undocumented                                                                                               | J              | [y-validator]                            |
| `output_column_types`                                                                                               | all except rollup_lambda                         | list of `{member (reference), type (string)}`                                                   | no                                         | Undocumented                                                                                               | J·REF          | [y-validator], [y-transpile]             |
| `sql_alias`                                                                                                         | all except rollup_lambda                         | string                                                                                          | no                                         | Undocumented in the pre-aggregation reference                                                              | J              | [y-validator]                            |
| `max_pre_aggregations`                                                                                              | auto_rollup                                      | number                                                                                          | no                                         | Undocumented                                                                                               | J              | [y-validator]                            |
| `time_dimension_reference`, `measure_references`, `dimension_references`, `segment_references`, `rollup_references` | legacy                                           | references                                                                                      | no                                         | Mixing them with the new keys fails: `[timeDimensionReference, …] are deprecated, please, use […] instead` | J·REF          | [y-validator]                            |

### Y.14 `access_policy` (list item on a cube or view)

| YAML key                                | Type                                                                    | Req.                                   | Default | Conflicts / dependencies                                                                                        | Tmpl.          | Source                                  |
| --------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| `group`                                 | string; `"*"` means any group                                           | exactly one of `group` / `groups`      | none    | Joi `nand` + `or`                                                                                               | J              | [y-validator], [y-r-dap]                |
| `groups`                                | list of strings                                                         | exactly one of `group` / `groups`      | none    | none                                                                                                            | J              | [y-validator], [y-r-dap]                |
| `conditions`                            | list of `{if: expression}`                                              | no                                     | none    | All must be true. In YAML, `if` is a Python expression, e.g. `"{ userAttributes.x }"`                           | J·EXPR         | [y-validator], [y-r-dap], [y-transpile] |
| `member_level.includes`                 | `"*"` or a list of member names                                         | no                                     | none    | Docs: use `includes` or `excludes`. Joi does not forbid both                                                    | J              | [y-validator], [y-r-dap]                |
| `member_level.excludes`                 | `"*"` or a list of member names                                         | no                                     | none    | as above                                                                                                        | J              | [y-validator], [y-r-dap]                |
| `member_masking.includes` / `.excludes` | `"*"` or a list                                                         | no                                     | none    | `member_masking` requires `member_level` in the same policy (Joi `with`). Masked values come from member `mask` | J              | [y-validator], [y-r-dap]                |
| `row_level.filters`                     | list of filters (below)                                                 | exactly one of `filters` / `allow_all` | none    | Joi `xor`                                                                                                       | see below      | [y-validator], [y-r-dap]                |
| `row_level.allow_all`                   | `true`                                                                  | exactly one of `filters` / `allow_all` | none    | Only `true` is valid                                                                                            | J              | [y-validator]                           |
| filter `member`                         | member reference                                                        | yes                                    | none    | none                                                                                                            | J·REF          | [y-validator], [y-transpile]            |
| filter `operator`                       | enum (Y.16 list including `measureFilter`)                              | yes                                    | none    | none                                                                                                            | J              | [y-validator]                           |
| filter `values`                         | list; may contain `"{ securityContext.* }"` or `"{ userAttributes.* }"` | yes, except with `set` / `notSet`      | none    | none                                                                                                            | J (transpiled) | [y-validator], [y-r-dap], [y-transpile] |
| filter `or` / `and`                     | list of filters or nested `or`/`and`                                    | exactly one per condition object       | none    | Joi `xor('or','and')`                                                                                           | none           | [y-validator], [y-r-dap]                |

The docs say that when no policy matches a group, access is denied to that group ([y-r-dap]). Detailed semantics belong to the security research doc.

### Y.15 `meta`

`meta` is `Joi.any()` on cubes, views, measures, dimensions and segments. It is not validated and is copied verbatim into `/v1/meta` ([y-validator], [y-meta]).

| Conventional key                                                     | Where             | Meaning                                                                            | Source        |
| -------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ------------- |
| `ai_context` (string)                                                | views and members | Cloud AI agent guidance. Truncated at 2,000 characters. Ignored when set on a cube | [y-d-ai]      |
| `auto_run` (boolean)                                                 | views             | Cloud Workbooks auto-run; default `true`                                           | [y-r-view]    |
| `default_ui_filters` (list of `{member, operator, value or values}`) | views             | Cloud Workbooks starting filters, not enforced                                     | [y-r-view]    |
| any other key                                                        | anywhere          | wechart-specific hints can live here                                               | [y-validator] |

The compiler has a `meta` guard during key camelization ([y-utils]). Whether nested `meta` keys stay unchanged in `/v1/meta` still needs a test.

### Y.16 Enumerations used above

- **Named numeric formats** ([y-formats]), each accepting an `_0`–`_6` suffix:
  - `number`, `percent`, `currency`, `abbr`, `accounting`, `decimal`.
  - `id` has no suffix.
  - `decimal` is accepted by the source but not documented.
- **Custom numeric formats:** d3-format specifiers checked against `NUMERIC_FORMAT_REGEX`. An invalid one gives `Invalid numeric format "<v>". Must be a valid d3-format specifier…` ([y-validator]).
- **Filter operators:** `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `notStartsWith`, `endsWith`, `notEndsWith`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet`, `inDateRange`, `notInDateRange`, `onTheDate`, `beforeDate`, `beforeOrOnDate`, `afterDate`, `afterOrOnDate`. Access-policy and multi-stage filters also accept `measureFilter` ([y-validator]).
- **Interval grammars** ([y-validator]):
  - Refresh `every`: `N unit`, unit ∈ {second, minute, hour, day, week}.
  - Rolling window and time shift: signed `N unit`, unit ∈ {minute, hour, day, week, month, quarter, year}.
  - Granularity `interval` and `offset`: up to 8 `N unit` parts, unit ∈ {second … year}.
- **Currency:** a known ISO 4217 code, otherwise `"<v>" is not a valid currency code…` ([y-validator]).

### Y.17 Docs vs validator mismatches (v1.7.42)

| Item                               | Docs                                                                                     | Validator (Joi)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Source                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `number_agg`, `rank` measure types | `number_agg` is listed as a regular type (Tesseract); `rank` is shown with `multi_stage` | Both accepted **only** with `multi_stage: true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [y-r-measures], [y-d-measures], [y-validator]  |
| `links[].url` / `dashboard`        | "must specify either"                                                                    | `oxor`: at most one, so neither is also accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [y-r-dimensions], [y-validator]                |
| `hierarchies[].levels`             | required                                                                                 | not marked required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [y-r-hierarchies], [y-validator]               |
| view `cubes[].includes`            | required                                                                                 | not marked required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [y-r-view], [y-validator]                      |
| view include `format`              | "override formatting"                                                                    | base formats only (no named or d3 formats)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [y-r-view], [y-validator]                      |
| view include `currency`            | not documented                                                                           | read by `CubeSymbols` but rejected by Joi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [y-symbols], [y-validator]                     |
| dimension `time_shift`             | calendar cubes only                                                                      | no `calendar` check in Joi, and none found in `CubeEvaluator`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [y-r-dimensions], [y-validator], [y-evaluator] |
| granularity `offset` + `origin`    | not addressed                                                                            | cannot be combined                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [y-validator]                                  |
| measure `time_shift` with 2+ items | not addressed                                                                            | each item needs `time_dimension`, `interval` and `type`; no `name`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [y-validator]                                  |
| segment `title`, `meta`            | not listed                                                                               | accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [y-r-segments], [y-validator]                  |
| pre-aggregation `type`             | default `rollup`                                                                         | Joi requires it, but `CubeSymbols` fills in `rollup` first                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [y-r-preagg], [y-symbols]                      |
| undocumented but accepted          | none                                                                                     | cube `shown`, `rewrite_queries`; dimension `key`, `suggest_filter_values`, `field_type`, `values_as_segments`, `enable_suggestions`, `aliases`; measure `cumulative`, `drill_filters`, `visible`, `aliases`; view `view_group(s)`, cube-entry `split`; view-level cube keys (Y.10); pre-aggregation `auto_rollup`, `max_pre_aggregations`, `time_dimensions`, `unique_key_columns`, `external`, `read_only`, `stream_offset`, `output_column_types`, `sql_alias`, `refresh_range_*`, refresh `timezone`; `decimal[_N]` formats | [y-validator], [y-formats]                     |

### Y.18 (a) Reference and templating syntax

- **Cube references (single braces):**
  - `{CUBE}` is the current cube.
  - `{member}` is a member of the same cube.
  - `{cube.member}` is qualified; referencing another cube implies a join.
  - `{cube1.cube2.member}` is a join path.
  - `{time_dim.granularity}` gives a truncated time.
  - `{cube.sql()}` reuses another cube's SQL.
  - Outside `sql`/`sql_table`, references are bare names without braces.
  - Literal braces in YAML are escaped as `\{` and `\}`. ([y-d-syntax])
- **How YAML values are parsed:** YAML SQL values are wrapped as a Python f-string (`f"…"`) and transpiled, so `{…}` holds a limited Python expression. `extends` and string values of `nonStringFields` are parsed as Python expressions ([y-yaml], [y-validator]).
- **Context variables** inside `{}`: `FILTER_PARAMS.cube.member.filter(...)`, `FILTER_GROUP(...)`, `SQL_UTILS.convertTz(...)`, and `COMPILE_CONTEXT`, which the docs show accessed via Jinja `{{ }}` ([y-r-ctx]).
- **Jinja (double braces and blocks):** `{{ expr }}`, `{% for %}`, `{% if %}`, `{% macro %}` and `{% import "path.jinja" as m %}` are rendered over the whole file before YAML parsing ([y-d-jinja], [y-dsc]). Values from Jinja are auto-escaped; use `| safe` or return a `SafeString` from Python. For multi-line SQL in macros, apply `indent` before `safe` ([y-d-jinja]).
- **`globals.py` helpers** (`from cube import TemplateContext`; `template = TemplateContext()`):
  - `template.add_variable(name, value)`
  - `template.add_function(name, fn)` or `@template.function('name')`
  - `template.add_filter(name, fn)` or `@template.filter('name')`
  - Only a file whose relative name is exactly `globals.py` is loaded, which means the root of the schema path.
  - Extra Python dependencies go in `requirements.txt`; the `cube` package is built in.
  - Sources: [y-r-cube-pkg], [y-d-jinja], [y-dsc].

### Y.19 (b) File and folder conventions

- **Location:** model files live under `model/`; change it with `schema_path` or `CUBEJS_SCHEMA_PATH`. The recommended layout is `model/cubes/*.yml` and `model/views/*.yml`, one entity per file ([y-d-syntax]). View groups typically go in `model/views/view_groups.yml` ([y-d-view-groups]).
- **File types:** `.yml` and `.yaml` are both compiled as YAML. `.jinja` files are rendered and then compiled as YAML; a file that renders to nothing, such as a macros-only file, is skipped. `globals.py` provides the Python context. `.js` files are JS models ([y-filerepo], [y-dsc], [y-yaml]).
- **Directory depth:** the default repository reads subdirectories recursively ([y-filerepo]).
- **Mixing:** one file may hold `cubes`, `views` and `view_groups` together ([y-yaml]). File names are not tied to entity names by the compiler; each cube just records its `fileName` ([y-dsc]).
- **Cube's own scaffolding:** in dev mode, `POST /playground/generate-schema` writes `model/cubes/<table>.yml` and `model/views/example_view.yml`, and first **empties both folders** ([y-devserver]).

### Y.20 (c) Compile errors: shape and location

**How errors are collected** ([y-validator], [y-errors])

- Joi runs with `abortEarly: false`, so all errors are collected.
- Each error record is `{message, plainMessage?, fileName?, lineNumber?, position?}`.
- If any errors exist, `throwIfAny()` throws a `CompileError`. It groups errors by file name, sorted, as `"<fileName> Errors:"` followed by one message per line. Errors without a file are grouped under a bare `"Errors:"` header ([y-errors]).
- The thrown message is prefixed with `Compile errors:\n` ([y-compile-error]).

**Location information by error type**

| Error kind                                                                                                  | File name                                                              | Line/column                                                                                 | Message shape                                                                                                                                                                 | Source                           |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| JS syntax (Babel)                                                                                           | yes                                                                    | Rendered as a Babel code frame inside the message text. `plainMessage` is `Syntax Error: …` | text                                                                                                                                                                          | [y-errors]                       |
| YAML transpile errors (unknown root key, missing `name`, "must be defined as array", Python parse failures) | yes (the worker reporter sets `inFile`)                                | none                                                                                        | text                                                                                                                                                                          | [y-worker], [y-yaml]             |
| YAML syntax errors (js-yaml `YAMLException`)                                                                | not traced                                                             | not traced                                                                                  | `load()` "throws `YAMLException` on error". `YamlCompiler` and the worker have no try/catch around it                                                                         | [y-jsyaml], [y-yaml], [y-worker] |
| Joi schema errors                                                                                           | **none** by source reading: the `inContext` child reporter has no file | none                                                                                        | Prefixed with `<cube> cube: `. Custom messages embed a dotted **camelCase** Joi path, e.g. `(refreshKey.every = 5 months) …`. `Possible reasons (one of):` lists alternatives | [y-validator], [y-errors]        |
| Jinja-rendered files                                                                                        | yes                                                                    | Any position refers to the **rendered** text, not the source template                       | text                                                                                                                                                                          | [y-dsc]                          |

**What reaches a client**

- No Core endpoint returns structured `{file, line, path}` errors.
- Any API call that needs the compiled model, including `GET /v1/meta`, fails with a JSON body of `{error, plainError, requestId?, stack?}`.
  - `error` is a string.
  - `plainError` is built only from errors that have a `plainMessage`.
  - `stack` is included only in dev mode ([y-gateway]).
- `CompileError` is not a `UserError`, so by source reading the HTTP status is 500. This is untested ([y-gateway], [y-compile-error]).
- The dev-mode `/playground/*` routes include no validation endpoint ([y-devserver]).
- `cubejs validate` prints the same text ([y-cli-validate]).

**Mapping errors to form fields.** A UI can map errors by parsing the `"<fileName> Errors:"` groups, the `"<cube> cube:"` prefix and the dotted path. The path uses camelized keys (for example `preAggregations`) and member names as map keys. Line numbers must come from the UI's own YAML parse.

**Native transpiler.** With `CUBEJS_TRANSPILATION_NATIVE=true` (default `false`), YAML goes through the native transpiler instead, and error text may differ ([y-env], [y-dsc]).

### Y.21 (d) Constructs that cannot round-trip losslessly through a form

- **Comments.** js-yaml `load()` returns plain values ([y-jsyaml]), so comments never reach Cube. A form that re-serializes the parsed object drops them. Round-tripping needs a comment-preserving YAML document model on wechart's side; that library still needs its own research.
- **Anchors, aliases and merge keys.** They are resolved during parsing (YAML 1.2), so re-serializing the parsed object expands them. This follows from `load()` returning plain values ([y-jsyaml]).
- **Multi-document files (`---`).** js-yaml `load()` "does not understand multi-document sources, it throws exception on those" ([y-jsyaml]). Cube calls `load()` ([y-yaml]), so such files are invalid. A form should reject them rather than merge them.
- **Jinja.** A file containing `{{`, `}}`, `{%` or `%}` anywhere, even inside SQL, is a template ([y-dsc]). Loops, conditionals, macros, variables, `globals.py` calls and `cube_dbt` output (`{{ model.as_dimensions() }}`) cannot become form fields ([y-d-jinja], [y-r-cube-dbt]). Treat such files as code-only, or show the rendered result read-only.
- **Python-expression values.** String values of `nonStringFields` (`public`, `shown`, `primary_key`, `sub_query`, `propagate_filters_to_sub_query`, `prefix`, `mask`, `scheduled_refresh`, `external`, `incremental`, `use_original_sql_pre_aggregations`, `read_only`, `union_with_source_data`, `rewrite_queries`) and access-policy `conditions.if` are expressions, not booleans or literals ([y-validator], [y-r-dap]). A plain toggle would lose them.
- **Formatting and aliases.** Snake_case vs camelCase keys, legacy value aliases (`has_many`, `belongs_to`, `group_by`, `*_references`), key order, quoting and block-scalar SQL (`|`, `>`) all parse to the same model ([y-utils], [y-symbols], [y-validator]). Normalizing them in a form rewrites the source text.
- **Undocumented but valid keys** (§Y.17) must be kept as pass-through fields, or the form will silently delete them.
- **JS model files** (`asyncModule`, `context()`, export/import) have no YAML or form representation ([y-dsc], [y-d-js]).
- **Escaped braces** (`\{`, `\}`) in SQL must be preserved exactly ([y-d-syntax]).

[y-validator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[y-transpile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts
[y-worker]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/transpiler_worker.ts
[y-yaml]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
[y-symbols]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[y-evaluator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[y-vg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/ViewGroupEvaluator.ts
[y-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[y-dsc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[y-errors]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
[y-compile-error]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CompileError.ts
[y-formats]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/named-numeric-formats.ts
[y-utils]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/utils.ts
[y-gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[y-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[y-filerepo]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/FileRepository.ts
[y-devserver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DevServer.ts
[y-cli-validate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/validate.ts
[y-changelog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[y-joi]: https://raw.githubusercontent.com/hapijs/joi/v17.13.3/API.md
[y-jsyaml]: https://raw.githubusercontent.com/nodeca/js-yaml/4.1.0/README.md
[y-r-cube]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[y-r-view]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/view.mdx
[y-r-view-group]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/view-group.mdx
[y-r-measures]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/measures.mdx
[y-r-dimensions]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[y-r-segments]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/segments.mdx
[y-r-joins]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/joins.mdx
[y-r-hierarchies]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/hierarchies.mdx
[y-r-preagg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[y-r-dap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/data-access-policies.mdx
[y-r-ctx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/context-variables.mdx
[y-r-cube-pkg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube-package.mdx
[y-r-cube-dbt]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube_dbt.mdx
[y-d-syntax]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/concepts/syntax.mdx
[y-d-calendar]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/concepts/calendar-cubes.mdx
[y-d-extending]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/extending-cubes.mdx
[y-d-measures]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/measures.mdx
[y-d-view-groups]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/view-groups.mdx
[y-d-ai]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/ai-context.mdx
[y-d-jinja]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/jinja.mdx
[y-d-js]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/javascript.mdx
[y-rc-granularity]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/data-modeling/custom-granularity.mdx

## Capability inventory

| Capability                                                                                                                 | Core or Cloud-only                                       | API/config surface to drive it                                                    | Candidate wechart UI surface                                         | Source                                              |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Cube definition (`sql_table` xor `sql`, `data_source`, `sql_alias`, `title`, `description`, `public`, `meta`)              | Core                                                     | YAML `cubes:` / JS `cube()`                                                       | Model browser plus cube editor form with a SQL editor                | [r-cube], [s-validator]                             |
| Cube `refresh_key`                                                                                                         | Core                                                     | cube param (`every`/CRON, `sql`, `timezone`, `immutable`)                         | Cube editor freshness section (caching doc)                          | [r-cube], [s-validator]                             |
| Pre-aggregations                                                                                                           | Core                                                     | `pre_aggregations`                                                                | Link only: pre-aggregation research                                  | [r-preagg]                                          |
| Access policies and member masking                                                                                         | Core                                                     | `access_policy`, `mask`                                                           | Link only: security research                                         | [r-dap], [r-measures]                               |
| Views: join paths and curation (`includes`/`excludes`/`prefix`/`alias`, member overrides)                                  | Core                                                     | YAML `views:` / JS `view()`                                                       | View builder: join-path picker, field checklist, rename and override | [r-view], [s-symbols]                               |
| View `extends`                                                                                                             | Core                                                     | view param                                                                        | "Duplicate / extend view" action                                     | [r-view]                                            |
| View-level calculated measures and dimensions (`multi_stage` across cubes)                                                 | Core (Tesseract)                                         | view `measures`/`dimensions`                                                      | Calculated-field editor scoped to a view                             | [r-view]                                            |
| View `default_filters` (`unless`)                                                                                          | Core                                                     | view param; not in `/v1/meta`                                                     | Enforced-filter editor on a view                                     | [r-view], [s-evaluator], [s-meta]                   |
| `meta.auto_run`, `meta.default_ui_filters`                                                                                 | Core stores them; behaviour defined for Cloud Workbooks  | `meta` keys (passed through `/v1/meta`)                                           | Honour as dashboard defaults and manual-run                          | [r-view], [s-meta]                                  |
| View groups (nested)                                                                                                       | Core                                                     | `view_groups:` / `view_group()`; view `view_group(s)`; `/v1/meta` `viewGroups`    | Dataset catalog tree                                                 | [r-view-group], [d-view-groups], [s-vg]             |
| Folders (nested)                                                                                                           | Core (views only)                                        | view `folders`; meta `folders`/`nestedFolders`; `CUBEJS_NESTED_FOLDERS_DELIMITER` | Field-list tree in the chart builder                                 | [r-view], [s-meta], [s-env]                         |
| Measure aggregation types (`count` … `max`, `number`, `string`, `time`, `boolean`)                                         | Core                                                     | measure `type`; meta `type`/`aggType`                                             | Measure editor; recommender Q input                                  | [r-measures], [s-meta]                              |
| Measure `filters` (filtered aggregates)                                                                                    | Core                                                     | measure param                                                                     | Measure editor "only count where…"                                   | [r-measures]                                        |
| Rolling windows and period-to-date                                                                                         | Core                                                     | `rolling_window`; meta `cumulative`                                               | Measure editor window section; YTD/MTD presets                       | [r-measures], [d-measures]                          |
| Multi-stage measures (`time_shift`, `grain`, `filter` modes, `rank`, `case`/`switch`, `number_agg`)                        | Core (Tesseract, default since 1.7.0)                    | measure params with `multi_stage: true`                                           | Period-over-period, percent-of-total and rank builders               | [d-measures], [s-validator]                         |
| `drill_members`                                                                                                            | Core                                                     | measure param; meta `drillMembers`/`drillMembersGrouped`                          | Chart drill-to-detail                                                | [r-measures], [s-meta]                              |
| Measure and dimension formats (named, d3, strftime) and `currency`                                                         | Core                                                     | `format`, `currency`; meta `format`/`formatDescription`                           | Axis, tooltip and table formatting; format picker                    | [r-measures], [r-dimensions], [s-formats]           |
| Dimension types (`string`, `number`, `boolean`, `time`, `geo`, `switch`)                                                   | Core                                                     | dimension `type`; meta `type`                                                     | Dimension editor; recommender N/T/Q/geo input                        | [r-dimensions], [s-meta]                            |
| `case` dimensions                                                                                                          | Core                                                     | dimension `case`                                                                  | Bucketing / "group values" editor                                    | [r-dimensions]                                      |
| Sub-query dimensions                                                                                                       | Core                                                     | `sub_query`, `propagate_filters_to_sub_query`                                     | "Measure as attribute" editor                                        | [r-dimensions]                                      |
| Proxy dimensions / member references                                                                                       | Core                                                     | `{cube.member}`, `{time.granularity}` in `sql`                                    | Reference autocomplete in the SQL editor                             | [d-syntax], [d-dimensions]                          |
| Default and custom time granularities                                                                                      | Core (custom only on the listed DBs; REST only)          | `granularities`; meta `granularities` (custom only)                               | Time-grain picker                                                    | [r-dimensions], [rc-granularity]                    |
| Dimension `order`                                                                                                          | Core                                                     | param; meta `order`                                                               | Default sort in the builder                                          | [r-dimensions], [s-meta]                            |
| `primary_key`                                                                                                              | Core                                                     | param; meta `primaryKey`                                                          | Key badge; join editor validation                                    | [r-dimensions], [d-joins]                           |
| Dimension `links`                                                                                                          | Core definition; Workbooks rendering is Cloud            | `links[]`; meta `links`, synthetic `___link_…_url` dimensions                     | Clickable cells, drill-to-dashboard                                  | [r-dimensions], [s-meta]                            |
| Geo dimensions                                                                                                             | Core                                                     | `type: geo` with `latitude`/`longitude`                                           | Map chart eligibility                                                | [r-dimensions]                                      |
| Segments                                                                                                                   | Core                                                     | `segments`; meta `segments`; query `segments`                                     | Predefined filter chips                                              | [r-segments], [s-validator]                         |
| Joins and relationships                                                                                                    | Core                                                     | `joins[] {name, relationship, sql}`; `?extended` `joins`; `connectedComponent`    | Join-graph editor; "fields compatible with selection"                | [r-joins], [s-meta-ext], [s-meta]                   |
| Hierarchies                                                                                                                | Core                                                     | `hierarchies`; meta `hierarchies`                                                 | Drill paths; hierarchy editor                                        | [r-hierarchies], [s-evaluator]                      |
| Extending cubes                                                                                                            | Core                                                     | `extends`                                                                         | "Create child cube" action                                           | [d-extending]                                       |
| Polymorphic cubes                                                                                                          | Core (pattern)                                           | `extends` + `sql` filter on a type column                                         | Template: "split cube by type"                                       | [rc-polymorphic]                                    |
| Data blending                                                                                                              | Core (pattern)                                           | cube `sql` with `UNION ALL` of `{cube.sql()}`                                     | Template: "blend cubes" (same data source only)                      | [d-blending]                                        |
| Multi-fact views                                                                                                           | Core (Tesseract)                                         | view with fact and shared dimension cubes at root join paths, `prefix`            | View builder multi-fact mode with reachability checks                | [d-multifact]                                       |
| Calendar cubes and custom calendars                                                                                        | Core (Tesseract)                                         | `calendar: true`, dimension `time_shift`, granularity `sql`                       | Calendar setup wizard (4-5-4 and fiscal)                             | [d-calendar], [rc-calendar]                         |
| Context variables (`CUBE`, `FILTER_PARAMS`, `FILTER_GROUP`, `SQL_UTILS`, `COMPILE_CONTEXT`; `SECURITY_CONTEXT` deprecated) | Core                                                     | SQL template syntax                                                               | SQL editor autocomplete and lint                                     | [r-ctx]                                             |
| Jinja + Python (`globals.py`, macros)                                                                                      | Core (Python 3.13 in the image)                          | `.yml`/`.jinja` + `globals.py`                                                    | Read-only / code editor for templated files                          | [d-jinja], [s-dsc], [s-dockerfile]                  |
| Dynamic JS models (`asyncModule`)                                                                                          | Core                                                     | `.js`                                                                             | Code editor; mark generated members as read-only                     | [d-js]                                              |
| JS export/import                                                                                                           | Core                                                     | `.js` ES modules                                                                  | Code editor                                                          | [d-reuse]                                           |
| Schema execution environment (VM, `-schema` packages)                                                                      | Core                                                     | compiler sandbox                                                                  | Lint rules in the code editor                                        | [d-exec-env], [s-dsc]                               |
| `cube` Python package (`TemplateContext`, `config`)                                                                        | Core                                                     | `globals.py`, `cube.py`                                                           | Code editor                                                          | [r-cube-pkg]                                        |
| `cube_dbt`                                                                                                                 | Usable in Core (custom image); Cloud auto-installs       | Python in `globals.py` + Jinja                                                    | "Import from dbt manifest" flow                                      | [r-cube-dbt], [c-deploy]                            |
| `lkml2cube`                                                                                                                | External CLI (MIT)                                       | `lkml2cube cubes`/`views` (+ `explores`)                                          | "Import from LookML" flow                                            | [r-lkml2cube], [pypi-lkml2cube]                     |
| Snowflake semantic views sync                                                                                              | Cloud-only (Enterprise)                                  | Cloud integration                                                                 | Not available on Core                                                | [d-snowflake]                                       |
| AI context (`meta.ai_context`)                                                                                             | Core stores and exposes it; the consuming agent is Cloud | `meta.ai_context`                                                                 | "AI notes" field on views and members                                | [d-ai], [s-meta]                                    |
| Titles, descriptions, `meta`                                                                                               | Core                                                     | params; meta `title`/`shortTitle`/`description`/`meta`                            | Field tooltips, catalog docs                                         | [r-cube], [s-meta]                                  |
| Content Validator                                                                                                          | Cloud-only                                               | Cloud Data Model module                                                           | wechart equivalent: check saved chart specs against `/v1/meta`       | [d-content-validator]                               |
| Data Model IDE (incl. Cloud dev-mode branches)                                                                             | Cloud-only                                               | Cloud UI                                                                          | wechart's own model editor                                           | [d-ide], [d-devmode]                                |
| Visual Modeler                                                                                                             | Cloud-only (Premium and above)                           | Cloud UI                                                                          | wechart's own visual editor                                          | [d-visual]                                          |
| SQL Runner                                                                                                                 | Cloud-only                                               | Cloud UI                                                                          | Not in this area                                                     | [d-sql-runner]                                      |
| Core dev mode + Playground (files, db-schema, generate-schema)                                                             | Core, dev only, unauthenticated                          | `CUBEJS_DEV_MODE`; `/playground/*`                                                | Local scaffolding only                                               | [c-devwarn], [s-devserver]                          |
| `cubejs validate` / `generate` / `typegen`                                                                                 | Core                                                     | `cubejs-cli`                                                                      | Server-side validate step; type generation                           | [s-cli-validate], [s-cli-generate], [s-cli-typegen] |
| Model file layout and syntax (YAML/JS, `schema_path`)                                                                      | Core                                                     | `model/**`, `CUBEJS_SCHEMA_PATH`                                                  | File tree in the model editor                                        | [d-syntax], [s-filerepo]                            |
| `schemaVersion`                                                                                                            | Core                                                     | `cube.js`/`cube.py` option                                                        | "Publish model revision" trigger                                     | [r-config], [s-compiler-api]                        |
| `repositoryFactory`                                                                                                        | Core                                                     | `cube.js`/`cube.py` option                                                        | Model storage in the wechart metadata DB                             | [r-config], [s-filerepo]                            |
| `contextToAppId` and compiler cache options                                                                                | Core                                                     | config options                                                                    | Draft preview and multi-tenant isolation                             | [r-config], [c-multitenancy]                        |
| `CUBEJS_FAST_RELOAD_ENABLED`                                                                                               | Core (undocumented)                                      | env var                                                                           | Hot reload without dev mode                                          | [s-env], [s-compiler-api]                           |
| `allow_js_duplicate_props_in_schema`                                                                                       | Core                                                     | config option                                                                     | Not exposed                                                          | [r-config]                                          |
| Tesseract toggle                                                                                                           | Core                                                     | `CUBEJS_TESSERACT_SQL_PLANNER` (default `true`)                                   | Admin setting / feature gating                                       | [r-env], [s-env]                                    |
| `/v1/meta` (`?extended`, `?onlyViews`)                                                                                     | Core                                                     | REST; `@cubejs-client/core` `meta()`                                              | Field list, catalog, model browser                                   | [r-rest], [s-gateway]                               |

## Gotchas

1. **Dev mode is an auth bypass.** The docs say it "mounts Playground and its supporting endpoints with no authentication whatsoever", and never to use it in production ([c-devwarn]). Other effects:
   - `/v1/meta` returns hidden members in dev mode ([s-gateway]).
   - Error responses include stacks ([s-gateway]).
   - The default pre-aggregation schema switches to `dev_pre_aggregations` ([s-opts]).
   - A random `apiSecret` is generated if none is set ([s-opts]).
2. **`/playground/generate-schema` is destructive.** It empties `<schemaPath>/cubes` and `<schemaPath>/views` before writing ([s-devserver]).
3. **Production never re-reads model files by itself.** A new file on the volume is ignored until `schemaVersion` changes, the cache entry is evicted, or the process restarts ([s-compiler-api]). The refresh worker is a separate Cube process ([c-deploy]); it would need the same trigger. That last point is inferred, not tested.
4. **`COMPILE_CONTEXT` requires `contextToAppId`.** Without it, access throws a `UserError` ([s-dsc]). `COMPILE_CONTEXT` is evaluated once per app id, not per user ([r-ctx]).
5. **Visibility filtering is incomplete.** `/v1/meta` filters only measures, dimensions and segments by `isVisible`. Hierarchies keep `public: false` entries, and folder member lists are built without a visibility check ([s-gateway], [s-meta]). The UI must filter them itself.
6. **The docs' `/v1/meta` example is out of date.** It shows `aliasName` ([r-rest]); the server emits `aliasMember` ([s-meta]). Treat the transformer source and the OpenAPI spec ([s-openspec]) as the contract.
7. **Measure `type` in meta is `number` for every aggregation.** Use `aggType` for aggregation semantics ([s-symbols], [s-meta]).
8. **Switch dimensions lose information.** They appear as `type: 'string'` with no `values` ([s-meta]).
9. **Default granularities are not listed in meta.** Only custom granularities are ([s-meta]); the eight defaults are fixed in the docs ([r-dimensions]).
10. **The client's TypeScript types look narrower than the server output** (as retrieved from [s-client-types]):
    - `TCubeMemberType` lacks `geo`.
    - `aggType` is typed `'count' | 'number'`.
    - Measure `format` is typed `'currency' | 'percent'`.
    - `CubeTimeDimensionGranularity` has only `name`/`title`.

    A wechart-side schema derived from [s-meta] avoids relying on these types.

11. **Custom granularity rules.** `offset` and `origin` cannot be combined (they are separate Joi alternatives). Uneven intervals need `origin` ([s-validator]). SQL and GraphQL APIs cannot address custom granularities ([r-dimensions]).
12. **`number_agg` disagreement.** The docs list it as an ordinary type, "Tesseract only" ([r-measures]). The v1.7.42 validator accepts `numberAgg` and `rank` only in the `multi_stage: true` branch ([s-validator]).
13. **Undocumented but accepted.** `decimal[_N]` named formats ([s-formats]); dimension `key`/`suggest_filter_values`, view cube `split`, and view `view_group(s)` ([s-validator]).
14. **Breaking changes in the 1.7 line** ([changelog], [pr-11809], [pr-11763]):
    - 1.7.0 removed `running_total` and made Tesseract the default.
    - 1.7.34 removed `cube.ts`.
    - 1.7.40 rejects two joins from one cube to the same cube. Previously all but the last were silently dropped.
15. **SQL snippets are not wrapped in parentheses** ([d-syntax]).
16. **A YAML file becomes Jinja if it contains `{{`, `}}`, `{%` or `%}` anywhere**, including inside SQL ([s-dsc]).
17. **Public-flag leak through views.** Members with `public: false` on a cube become queryable through a view that includes them, unless they are excluded ([r-view]).
18. **Hierarchy levels are dropped silently.** Levels not included in a view disappear from that view's hierarchy ([s-evaluator]).
19. **Extended cubes need `CUBE`.** Omitting the cube name or using `${base}` breaks in extended cubes ([d-extending]).
20. **Calendar cube requirements.** A calendar cube needs exactly one primary key, which must be a `time` dimension. Pre-aggregations must declare overridden granularities ([d-calendar]).
21. **Multi-fact query limits.** Grouped dimensions, filters and segments must be reachable from every fact ([d-multifact]).
22. **`?extended` is not round-trippable.** Its SQL is stringified compiled functions, so the model editor must read and write the source files. `fileName` maps each cube to its file ([s-meta-ext]).
23. **AI context limits.** `ai_context` is truncated at 2,000 characters for the Cloud agent, and cube-level `ai_context` is ignored ([d-ai]).
24. **Sandbox restrictions in JS models.** No `process` or `console`, and `require` is limited to `-schema` packages ([d-exec-env], [s-dsc]).
25. **Mounting `.:/cube/conf` hides the image's `node_modules`** ([c-deploy]).

## Open questions / unverified

- **Compile-error HTTP shape.** The claim that compile errors surface as HTTP 500 comes from reading `handleError` ([s-gateway], [s-compile-error]). Needs an integration test.
- **`meta` key camelization.** Are `meta` keys (for example `ai_context`) kept verbatim? `utils.ts` has a `level === 1 && key === 'meta'` guard ([s-utils]), but the full logic was not read. Needs a test.
- **`number_agg` without `multi_stage`.** Whether it compiles at 1.7.42 (Gotcha 12). Needs a compile test.
- **`default_filters` enforcement.** The query-time enforcement path was not traced beyond `prepareViewFilters` ([s-evaluator]). Behaviour on the SQL API is unverified.
- **Refresh worker reloads.** Whether it picks up `schemaVersion` and `FAST_RELOAD` changes the same way as the API instance is inferred, not tested.
- **`requirements.txt` in Core.** The Jinja page says packages are "automatically installed with `pip` on the startup" ([d-jinja]). The deployment guide says to build a custom image ([c-deploy]), `cube_dbt`'s Core instructions are a TODO ([r-cube-dbt]), and the Dockerfile has no pip step ([s-dockerfile]).
- **`cubejs validate` on Jinja/Python models.** It passes no `nativeInstance` ([s-cli-validate], [s-prepare]). Whether it works on those models is unverified.
- **Imports outside `model/`.** The docs allow utilities outside `model/` via relative paths ([d-exec-env], [d-reuse]). How the compiler resolves `../` was not traced.
- **`COMPILE_CONTEXT` key spelling.** The docs show both `COMPILE_CONTEXT.security_context` ([r-view]) and `COMPILE_CONTEXT.securityContext` ([r-ctx]). Presumed aliased (`cloneCompileContextWithGetterAlias`, [s-dsc]); unverified.
- **Client types were read through a summarizing fetch** ([s-client-types]). Re-check `dist/src/types.d.ts` in the installed package before relying on Gotcha 10.
- **`EXCLUDED_MEASURE_TYPES`** (the measure types that get no `formatDescription`) was not read ([s-meta]).
- **No change signal over REST.** No REST parameter exposes `compilerId`; the route passes only `extended`/`onlyViews` ([s-gateway]). A UI detecting model changes must compare `/v1/meta` payloads.
- **Not researched:** Cube Cloud Semantic Layer Sync (outside this area).
- **Context7 was not available** in this session. All claims come from the tagged docs source, the tagged code, and the npm/PyPI/Docker registries.

[release]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[changelog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[pr-11809]: https://github.com/cube-js/cube/pull/11809
[pr-11763]: https://github.com/cube-js/cube/pull/11763
[npm-client]: https://registry.npmjs.org/@cubejs-client/core/1.7.42
[npm-client-latest]: https://registry.npmjs.org/@cubejs-client/core/latest
[npm-sc]: https://registry.npmjs.org/@cubejs-backend/schema-compiler/latest
[npm-cli]: https://registry.npmjs.org/cubejs-cli/latest
[hub]: https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=25&name=1.7.42
[pypi-lkml2cube]: https://pypi.org/pypi/lkml2cube/json
[pypi-cube-dbt]: https://pypi.org/pypi/cube_dbt/json
[d3-format]: https://d3js.org/d3-format
[r-cube]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[r-view]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/view.mdx
[r-view-group]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/view-group.mdx
[r-measures]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/measures.mdx
[r-dimensions]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[r-segments]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/segments.mdx
[r-joins]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/joins.mdx
[r-hierarchies]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/hierarchies.mdx
[r-preagg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[r-dap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/data-access-policies.mdx
[r-ctx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/context-variables.mdx
[r-cube-pkg]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube-package.mdx
[r-cube-dbt]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube_dbt.mdx
[r-lkml2cube]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/lkml2cube.mdx
[r-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[r-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[r-rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[d-syntax]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/concepts/syntax.mdx
[d-calendar]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/concepts/calendar-cubes.mdx
[d-blending]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/concepts/data-blending.mdx
[d-multifact]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/multi-fact-views.mdx
[d-view-groups]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/view-groups.mdx
[d-views]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/views.mdx
[d-cubes]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/cubes.mdx
[d-extending]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/extending-cubes.mdx
[d-joins]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/joins.mdx
[d-measures]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/measures.mdx
[d-dimensions]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dimensions.mdx
[d-ai]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/ai-context.mdx
[d-content-validator]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/content-validator.mdx
[d-ide]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/data-model-ide.mdx
[d-visual]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/visual-modeler.mdx
[d-sql-runner]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/sql-runner.mdx
[d-devmode]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dev-mode.mdx
[d-dynamic]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/index.mdx
[d-jinja]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/jinja.mdx
[d-js]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/javascript.mdx
[d-reuse]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/code-reusability-export-and-import.mdx
[d-exec-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/dynamic/schema-execution-environment.mdx
[d-snowflake]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/integrations/snowflake-semantic-views.mdx
[rc-granularity]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/data-modeling/custom-granularity.mdx
[rc-calendar]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/data-modeling/custom-calendar.mdx
[rc-polymorphic]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/data-modeling/polymorphic-cubes.mdx
[c-multitenancy]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/multitenancy.mdx
[c-create]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/getting-started/create-a-project.mdx
[c-deploy]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/cube-core/deployment.mdx
[c-devwarn]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/snippets/dev-mode-warning.mdx
[s-validator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[s-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[s-symbols]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[s-evaluator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[s-vg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/ViewGroupEvaluator.ts
[s-yaml]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
[s-utils]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/utils.ts
[s-dsc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[s-errors]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
[s-compile-error]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CompileError.ts
[s-formats]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/named-numeric-formats.ts
[s-prepare]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/PrepareCompiler.ts
[s-compiler-api]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts
[s-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts
[s-opts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts
[s-devserver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/DevServer.ts
[s-filerepo]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/FileRepository.ts
[s-env]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts
[s-gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[s-meta-ext]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts
[s-openspec]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/openspec.yml
[s-client-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/types.ts
[s-client-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/Meta.ts
[s-client-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[s-client-format]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/format.ts
[s-cli-validate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/validate.ts
[s-cli-generate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/generate.ts
[s-cli-typegen]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-cli/src/command/typegen.ts
[s-dockerfile]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-docker/latest.Dockerfile
