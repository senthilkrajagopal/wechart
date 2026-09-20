---
library: Metabase (reference research — how a saved question/card is defined and serialized)
packages: []
version: 0.63.18
researched: 2026-09-20
sources:
  [
    https://github.com/metabase/metabase/tree/v0.63.18,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib_be/models/transforms.clj,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/interface.clj,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/schema.cljc,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/schema.cljc,
    https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/schema/ref.cljc,
    https://github.com/metabase/metabase/blob/v0.63.18/docs/developers-guide/api-changelog.md,
    https://github.com/metabase/metabase/blob/v0.63.18/docs/installation-and-operation/serialization.md,
    https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md,
    https://github.com/metabase/representations/tree/main/examples/v1,
  ]
---

# Metabase 0.63.18 — the saved question (card) definition and its serialization

Reference research. Nothing here is imported by wechart; `packages:` is intentionally empty.

Metabase 0.63.18 is the latest stable release, published 2026-09-16 ([mb-latest-release]). The serialization format is specified in a separate repo, `metabase/representations`, spec version 1.0.0, read at `main` on 2026-09-20 ([rep-spec]).

## Summary

Metabase splits a saved question into **two persisted blobs plus one scalar**: `dataset_query` (the query, in MBQL), `visualization_settings` (an open JSON map of display options), and `display` (a single string naming the chart type). They live in three columns of one row of `report_card` ([card-model]). This is the same split wechart is deciding about between `ChartSpec` (saved authoring shape) and `RenderSpec` (what the renderer consumes).

Relevant wechart ACs from `docs/spec.md`: AC-014 (saved charts survive restart), AC-026 and AC-032 (wells and a sticky manual chart type), AC-035 and AC-066 (undo/redo/discard restoring chart specs), AC-037 (render 18 chart types from a chart spec), AC-040 (axis options applied to the rendered chart), AC-046 (member formats in axes, labels, tooltips and tables).

The eight findings that bear on that decision:

1. **There is no third "render spec" in Metabase.** The renderer is fed `{series: [{card, data}]}` — the card (query + display + viz settings) plus the result rows — and every drawing decision is computed at render time from that pair, not persisted ([viz-index], [viz-settings-visualization]).
2. **`display` is a scalar column on the card, not a key inside `visualization_settings`** ([card-transforms], [rep-card-schema]). The equivalent of wechart's `ChartSpec.chartType`.
3. **`visualization_settings` is a schemaless open map.** The API validates it as `ms/Map` and nothing more ([card-api]); the serdes JSON Schema declares `additionalProperties: true` ([rep-card-schema]). Per-display options are kept apart by **dotted string key prefixes** (`graph.*`, `line.*`, `table.*`, `stackable.*`, `boxplot.*`, `scatter.*`, `legend.*`), never by a discriminated union ([graph-settings]).
4. **The query has no version field.** Legacy MBQL ("MBQL 4") carries no version number anywhere ([legacy-schema]). MBQL 5 is distinguished structurally by `:lib/type :mbql/query` ([lib-schema]). Normalization is by inference: `metabase.legacy-mbql.normalize` "Normalize MBQL 1-4 to MBQL 4" and throws if handed anything with `:lib/type` ([legacy-normalize]).
5. **The card *row* does have a version field**, `card_schema` (integer), with an upgrade-on-read multimethod chain. Current value 23; 20 is the legacy floor assigned to every card that existed when the column was added in v0.55 ([card-schema-version]).
6. **`visualization_settings` also has its own independent version**, stored under a `:version` key inside the blob, current value 2 ([viz-migration], [json-migration]).
7. **Field references are `[:field <opts> <id-or-name>]`** in MBQL 5 and `[:field <id-or-name> <opts>]` in MBQL 4 — note the argument order flipped between versions ([lib-ref-schema], [legacy-schema]).
8. **Metabase has publicly, repeatedly failed to make `visualization_settings` column keys survive query edits.** Issue #11829 "Better way to identify columns for visualization settings" was open from 2019 until 2025-05-22 ([iss-11829]); #36185 (open) is an umbrella issue calling it "a deep problem with several diverse symptoms" ([iss-36185]). The resolution was to move the key from a field ref to the plain column **name** ([column-key]).

## Install

Nothing is installed. To inspect a live instance, the project already has Metabase on the local k8s cluster at `:3000` (per project memory). Reading a card directly:

```sh
# app DB: the card is one row
SELECT id, name, display, type, card_schema, dataset_query, visualization_settings
FROM report_card WHERE id = 1;

# REST: MBQL 5 (default since 0.57), or MBQL 4 with the compatibility flag
curl -H "x-api-key: $KEY" "$MB/api/card/1"
curl -H "x-api-key: $KEY" "$MB/api/card/1?legacy-mbql=true"
```

`report_card` is the table name ([card-model]). The `legacy-mbql` query parameter is declared on `GET /api/card/:id` with `{:optional true, :default false}` ([card-api]).

## Init / auth pattern

Not applicable — this is reference research. Two facts about Metabase's own contract, since they bound how much of this is safe to copy:

- **The REST API is unversioned and explicitly not a stable contract**: "The API is subject to change. We rarely change API endpoints, and almost never remove them" and "The API isn't versioned" ([api-intro]).
- **MBQL is explicitly declared opaque to API consumers**: "we do not officially support editing or introspection of MBQL via the REST API (please treat it as an opaque object)" ([api-changelog]).

---

## API surface we will use

### 1. The exact persisted representation of a saved card

**Table:** `report_card`. `(methodical/defmethod t2/table-name :model/Card [_model] :report_card)` ([card-model]).

**Which columns are encoded, and how** — the Toucan 2 transform spec, verbatim ([card-transforms]):

```clojure
(t2/deftransforms :model/Card
  {:dataset_query          lib-be/transform-query
   :public_uuid            (mi/transform-encrypted-text "report_card.public_uuid")
   :display                mi/transform-keyword
   :embedding_params       mi/transform-json
   :query_type             mi/transform-keyword
   :result_metadata        mi/transform-result-metadata
   :visualization_settings mi/transform-visualization-settings
   :parameters             parameters/transform-parameters
   :parameter_mappings     parameters/transform-parameter-mappings
   :type                   mi/transform-keyword
   :dimensions             metrics/transform-dimensions
   :dimension_mappings     metrics/transform-dimension-mappings})
```

So: `dataset_query`, `visualization_settings`, `result_metadata`, `parameters`, `parameter_mappings`, `embedding_params`, `dimensions` and `dimension_mappings` are JSON text columns. `display`, `query_type` and `type` are plain strings read as keywords. Everything else is a scalar column.

**Column names appearing in `card.clj`** ([card-columns]): `id`, `name`, `collection_id`, `description`, `display`, `archived`, `archived_directly`, `collection_position`, `collection_preview`, `type`, `creator_id`, `made_public_by_id`, `public_uuid`, `dataset_query`, `database_id`, `table_id`, `query_type`, `result_metadata`, `visualization_settings`, `parameters`, `parameter_mappings`, `embedding_params`, `enable_embedding`, `embedding_type`, `entity_id`, `card_schema`, `metabase_version`, `source_card_id`, `dashboard_id`, `document_id`, `cache_ttl`, `cache_invalidated_at`, `view_count`, `last_used_at`, `initially_published_at`, `dimensions`, `dimension_mappings`, `legacy_query`, `dataset_query_metrics_v2_migration_backup`.
  UNVERIFIED: this list is what a reader found in `card.clj`, not the Liquibase `createTable` changeset. Some entries (`card_id`, `public_uuid_prefix`) were also reported and are probably references to other tables; I did not read `resources/migrations/001_update_migrations.yaml` (411 kB) to confirm the authoritative column set. The app DB schema is managed by Liquibase — `resources/liquibase.yaml` plus `resources/migrations/{001,056,057,058,059}_update_migrations.yaml` and per-version directories `060/` … `063/` ([migrations-dir]).

Two of those columns are migration scaffolding and worth naming, because they show what this design costs:
- `:legacy_query` — `;; temporary column to power rollback from v57 to v56; we can remove it in v58` ([card-legacy-query]).
- `:dataset_query_metrics_v2_migration_backup` — `;; data migration column`, `dissoc`'d on read and excluded from serialization ([card-legacy-query]).

**The matching REST/TS type** ([ts-card]):

```ts
export interface UnsavedCard<Q extends DatasetQuery = DatasetQuery> {
  display: VisualizationDisplay;
  dataset_query: Q;
  parameters?: Parameter[];
  visualization_settings: VisualizationSettings;
  // …
}
export interface Card<Q extends DatasetQuery = DatasetQuery> extends UnsavedCard<Q> {
  id: CardId;
  entity_id: BaseEntityId;
  type: CardType;              // "model" | "question" | "metric"
  result_metadata: Field[] | null;
  // …
}
```

#### A real, complete saved card

This is `examples/v1/collections/main/visualization_settings/line_chart.yaml` from Metabase's own representation-format examples, verbatim and complete ([rep-line-chart]). It is the **serialization** form of a card (portable references, see §7), not the app-DB form:

```yaml
name: Revenue Over Time (Line)
entity_id: UEWVldEEZ-3sYUjjN54qz
collection_id: cOlViZsEtTiNgS0ExAmP1
creator_id: admin@example.com
display: line
database_id: Sample Database
dataset_query:
  "lib/type": mbql/query
  database: Sample Database
  stages:
  - "lib/type": mbql.stage/mbql
    source-table: [Sample Database, null, ORDERS]
    aggregation:
    - [sum, {}, [field, {base-type: type/Float}, [Sample Database, null, ORDERS, TOTAL]]]
    breakout:
    - [field, {temporal-unit: month}, [Sample Database, null, ORDERS, CREATED_AT]]
visualization_settings:
  "graph.show_values": true
  "graph.label_values_frequency": fit
  "graph.x_axis.title_text": Month
  "graph.x_axis.scale": timeseries
  "graph.y_axis.title_text": Revenue ($)
  "graph.y_axis.scale": linear
  "graph.y_axis.auto_range": false
  "graph.y_axis.min": 0
  "graph.y_axis.max": 100000
  "graph.show_goal": true
  "graph.goal_value": 50000
  "graph.goal_label": Monthly Target
  "graph.show_trendline": true
  series_settings:
    sum:
      display: line
      color: "#509EE3"
      "line.style": solid
      "line.size": M
      "line.interpolate": cardinal
      "line.missing": interpolate
      "line.marker_enabled": true
      show_series_values: true
serdes/meta:
- id: UEWVldEEZ-3sYUjjN54qz
  label: line_chart
  model: Card
```

(The YAML above is reflowed to flow sequences for the `aggregation`/`breakout`/`source-table` arrays; the source file uses block sequences. Every key and value is unchanged.)

**The app-DB / REST JSON form of `dataset_query`.** An official MBQL-4-era `POST /api/card` body, verbatim from Metabase's own learn docs ([learn-api]):

```json
{
  "visualization_settings": { "table.pivot_column": "QUANTITY", "table.cell_column": "SUBTOTAL" },
  "collection_position": null,
  "result_metadata": null,
  "collection_id": null,
  "name": "API-generated question",
  "dataset_query": { "database": 1, "query": { "source-table": 2 }, "type": "query" },
  "display": "table"
}
```

Since 0.57 the stored and returned form is MBQL 5 instead ([api-changelog]), which for the same query is (derived from [lib-schema], [lib-common-options], [rep-line-chart] — **UNVERIFIED as a captured payload**; I found no primary source containing a recorded MBQL 5 JSON body with numeric IDs and `lib/uuid`):

```json
{
  "lib/type": "mbql/query",
  "database": 1,
  "stages": [
    { "lib/type": "mbql.stage/mbql",
      "source-table": 2,
      "aggregation": [["sum", {"lib/uuid": "…"}, ["field", {"lib/uuid": "…", "base-type": "type/Float"}, 42]]],
      "breakout":    [["field", {"lib/uuid": "…", "temporal-unit": "month"}, 39]] }
  ]
}
```

### 2. MBQL

**Two live versions.** The legacy namespace's own docstring ([legacy-schema]):

> "Schema for validating a *normalized* MBQL 4 query. … GENERALLY you should not need to touch this namespace, since MBQL 4 should be considered frozen in time in 57+ with the move to MBQL 5 in the app DB and over the wire -- any new MBQL clauses should only get added to the MBQL 5 schema in `metabase.lib.schema` going forward."
> "We don't want to have to add things to two places for the rest of our lives; it's ok if MBQL 4 doesn't support some new features."

| | MBQL 4 (legacy) | MBQL 5 (`metabase-lib`, "pMBQL") |
| --- | --- | --- |
| Discriminator | `:type` = `"query"` or `"native"` | `:lib/type` = `"mbql/query"` |
| Nesting | `:query` → `:source-query` → … (recursive maps) | `:stages` — a flat ordered array of stage maps |
| Top-level keys | `:database :type :query :native :parameters :settings :constraints :middleware :info :create-row :update-row` ([legacy-query-keys]) | `:lib/type :lib/metadata :database :stages` plus optional settings/constraints/middleware ([lib-schema]) |
| Clause shape | `[tag arg…]`, e.g. `["field" 42 {…}]` | `[tag opts arg…]` — options always second, always containing `:lib/uuid` ([lib-common-options]) |

Metabase refuses to mix them: `normalize-query` throws `"MBQL 4 keys like :type, :query, or :native are not allowed in MBQL 5 queries with :lib/type"` and `"MBQL 5 :stages is not allowed in an MBQL 4 query with :type"` ([lib-be-transforms]).

**Stage keys** (MBQL 5): `source-table` or `source-card`, `joins`, `expressions`, `fields`, `filters`, `aggregation`, `breakout`, `order-by`, `limit`; a native stage has `native` plus `template-tags` ([rep-query-schema]).

**Aggregations** are clauses in the `aggregation` array; **breakouts** (GROUP BY) are refs in `breakout`; from [rep-line-chart]:

```yaml
aggregation: [[sum, {}, [field, {base-type: type/Float}, [Sample Database, null, ORDERS, TOTAL]]]]
breakout:    [[field, {temporal-unit: month}, [Sample Database, null, ORDERS, CREATED_AT]]]
```

Aggregation operator names available over the wire include `count, sum, avg, median, min, max, stddev, distinct, cum-sum, offset, metric, measure` ([ts-query]).

**Filters** are a `filters` array of boolean clauses. Legacy dispatches on `::DatetimeExpression / ::NumericExpression / ::StringExpression / ::BooleanExpression / ::value / ::segment / ::FieldOrExpressionRef` ([legacy-filter]). Every operator follows `[operator, options, ...args]` ([rep-query-schema]).

**Expressions** are named, and referenced by name. From [rep-fields-expr], verbatim:

```yaml
fields:
- [field, {}, [Sample Database, null, ORDERS, CREATED_AT]]
- [expression, {}, Profit]
expressions:
- ["-", {"lib/expression-name": Profit},
     [field, {base-type: type/Float}, [Sample Database, null, ORDERS, TOTAL]],
     [field, {base-type: type/Float}, [Sample Database, null, ORDERS, TAX]]]
```

The expression's **name lives in the defining clause's options** (`lib/expression-name`), and the reference is `["expression", {}, "Profit"]` — a name, not an index.

**Joins** are first-class maps inside a stage, each with its own `stages` (so a join source can itself be a subquery), `conditions`, `alias`, `strategy`, and `fields` (`all`, `none`, or an explicit ref list). Verbatim from [rep-joins]:

```yaml
joins:
- "lib/type": mbql/join
  stages: [{"lib/type": mbql.stage/mbql, source-table: [Sample Database, null, PRODUCTS]}]
  conditions:
  - ["=", {}, [field, {}, [Sample Database, null, ORDERS, PRODUCT_ID]],
              [field, {}, [Sample Database, null, PRODUCTS, ID]]]
  alias: Products
  strategy: left-join
  fields: all
```

Once joined, downstream refs carry `join-alias` in options: `[field, {join-alias: People}, [Sample Database, null, PEOPLE, NAME]]` ([rep-joins]).

**Semantic-layer refs.** Metabase 0.63 also has `["metric", opts, entity_id]`, `["measure", opts, entity_id]` and `["segment", opts, entity_id]` — references to named, table-attached aggregations and filters resolved by entity ID ([rep-ref-schema], [rep-metric-refs]). This is the closest analogue to a Cube measure/segment reference, and it is the one ref family keyed by a *stable ID of a modelled object* rather than by a physical column.

#### Field references and why the indirection exists

MBQL 5 ([lib-ref-schema]):

```clojure
(mr/def ::field.id       [:tuple [:= :field] ::field.options         ::id/field])
(mr/def ::field.literal  [:tuple [:= :field] ::field.literal.options :string])
```

MBQL 4 ([legacy-field]):

```clojure
(defclause* ^{:added "0.39.0"} field
  [:and {:decode/normalize #'normalize-field}
   (helpers/clause :field
                   "id-or-name" [:or ::lib.schema.id/field :string]
                   "options"    [:maybe [:ref ::FieldRefOptions]])
   ::require-base-type-for-field-name])
```

So the third (MBQL 5) or second (MBQL 4) element is **either an integer Field ID or a string column name**, and the options map carries per-use modifiers. Documented options: `:base-type`, `:effective-type`, `:temporal-unit` ("used to specify DATE BUCKETING for a FieldOrExpression that represents a moment in time"), `:binning` ("Using binning requires the driver to support the `:binning` feature"), `:join-alias` ("used to refer to a FieldOrExpression from a different Table/nested query that you are EXPLICITLY JOINING against"), `:source-field` ("For implicitly joinable columns, the ID of the FK field used to perform the implicit join") ([lib-ref-schema], [legacy-field]).

**Why the indirection, from the sources:**

1. **The ref is a pointer into a metadata catalogue, not a column name.** An integer ID resolves through the `MetadataProvider` (§6) to a `Field` row that holds display name, base type, semantic type, formatting settings and FK targets — none of which is in the query. The name form is the escape hatch for columns that have no `Field` row (native queries, expressions, nested-query outputs), and the schema then *requires* `:base-type` (`::require-base-type-for-field-name`) because nothing else can supply it ([legacy-field]).
2. **Options make the same underlying field distinguishable at different uses.** `CREATED_AT` bucketed by month and `CREATED_AT` bucketed by year are two different result columns produced from one Field ID; only the options tell them apart. Same for `join-alias` on a self-join and `source-field` on an implicit FK join ([lib-ref-schema]).
3. **ID refs are cheaper and safer to resolve than name refs.** The schema comment on `:source-field` is blunt: "You REALLY shouldn't be specifying this for a field name ref, since it makes resolution 10x harder" ([lib-ref-schema]).
4. **Ordering flipped between versions.** MBQL 4 is `[:field id-or-name opts]`, MBQL 5 is `[:field opts id-or-name]`. Any persisted format that embeds refs positionally has to be migrated when the grammar moves, which is exactly what the 0.57 change forced ([api-changelog]).

### 3. `visualization_settings` — what lives there vs. in `dataset_query`

**The line is: anything that changes the result rows goes in `dataset_query`; anything that changes how those rows are drawn goes in `visualization_settings`; the chart type goes in `display`.** Concretely, from the examples above and the settings registry:

| Concern | Where | Source |
| --- | --- | --- |
| Source table/card, joins, filters, expressions, aggregations, breakouts, order-by, limit | `dataset_query` | [rep-query-schema] |
| Chart type | `display` column (`table`, `bar`, `line`, `area`, `row`, `pie`, `scalar`, `smartscalar`, `number`, `combo`, `pivot`, `funnel`, `map`, `scatter`, `waterfall`, `progress`, `gauge`, `object`, `list`, `heading`, `text`, `link`, `iframe`, `action`, `sankey`, `boxplot`; the TS union adds `treemap` and `placeholder`) | [rep-card-schema], [ts-visualization] |
| Which column goes on which axis / which are the series | `visualization_settings["graph.dimensions"]`, `["graph.metrics"]` | [graph-settings] |
| Axis titles, min/max, log scale, gridlines, goal line, trend line, value labels | `visualization_settings["graph.*"]` | [graph-settings] |
| Per-series colour, line style, marker, axis assignment, per-series display type | `visualization_settings.series_settings[<series key>]` | [series-settings] |
| Per-column number/date format, column title, visibility, conditional formatting | `visualization_settings.column_settings[<column key>]`, `["table.columns"]`, `["table.column_formatting"]` | [rep-table-formatted] |

**Critically: `graph.dimensions` and `graph.metrics` hold plain column-name strings, not field refs.** Verbatim from [rep-bar-stacked]:

```yaml
"graph.dimensions": [CREATED_AT, CATEGORY]
"graph.metrics": [count]
```

So the binding from query output to visual channel is by result-column name. Both settings have `persistDefault: true` and a `getDefault` that infers them from the series when absent, plus an `isValid` that falls back to the default when the stored value no longer matches the data ([graph-settings]).

**`display` is not inside `visualization_settings`** at card level — it is its own column, stored as a string and read as a keyword ([card-transforms]). It *does* appear as a key inside `series_settings.<key>.display`, which is how combo charts give one series a line and another a bar ([series-settings]).

#### `column_settings` keying

The key is a **JSON-stringified two-element array used as an object key**. Verbatim from a real export ([rep-table-formatted]):

```yaml
column_settings:
  '["name","PRICE"]':
    number_style: currency
    currency: USD
    currency_style: symbol
    decimals: 2
    column_title: Price (USD)
  '["name","CREATED_AT"]':
    date_style: "MMMM D, YYYY"
    date_abbreviate: true
    time_enabled: null
```

There are **two key schemes, both live**:

- Modern: `getColumnKey` returns `JSON.stringify(["name", column.name])` ([column-key]).
- Legacy: `getLegacyColumnKey` returns `["ref", fieldRef]` (or `["name", …]` for field-literal / aggregation refs) ([column-key]).

The frontend reads both, and the source comment says why ([column-key]):

> "We check for both legacy and modern keys because not all viz settings have been migrated. To be extra safe and maintain backward compatibility, we check for the legacy key first."

`getObjectColumnSettings` additionally tries key variants with and without `base-type` "to handle incomplete migrations" ([column-key]).

The backend normalizes these keys on every read ([viz-normalize]):

```clojure
(defn normalize-visualization-settings
  "The frontend uses JSON-serialized versions of MBQL clauses as keys in `:column_settings`.
   This normalizes them to MBQL 4 clauses so things work correctly."
  …)
```

It decodes each key from JSON, normalizes `["ref", …]` against `::viz-settings-ref`, `["name", …]` against `::viz-settings-name`, falls through to full MBQL normalization otherwise, **silently drops keys it cannot normalize** (`:when (some? k)`), and re-encodes to JSON ([viz-normalize]). It also walks the whole settings map rewriting any embedded `field-id / fk-> / datetime-field / joined-field / binning-strategy / field / aggregation / expression` clause to MBQL 4 form ([viz-normalize]).

Two special cases in that function, both instructive:

- `:table.columns` entries get `(dissoc % :key)` — a legacy per-column key field is stripped on read ([viz-normalize]).
- `graph.metrics` is `dissoc`'d before `walk/keywordize-keys` and re-attached afterwards, un-keywordized — because its values are result-column *name strings* that must not become keywords ([viz-normalize]). This is the concrete cost of putting name-valued data in a map whose keys are keywordized.

`series_settings` is keyed by `keyForSingleSeries(single)`, which is `String(single.card.name)` (with a `_seriesKey` fallback for legacy series cards) ([series-settings]) — a display name, not an ID.

### 4. Carrying chart-type-specific options without a union schema

Metabase's answer, in five parts:

1. **No schema at all on the persisted side.** `POST /api/card` types it `[:visualization_settings ms/Map]` and `PUT` types it `[:maybe ms/Map]` ([card-api]). The serdes JSON Schema is `type: object, additionalProperties: true` ([rep-card-schema]). Nothing rejects a `line.*` key on a pie chart.
2. **Dotted namespaces instead of a tagged union.** Keys are prefixed by family, not by display type: the shared cartesian family uses `graph.*` and `stackable.*`; the line family adds `line.interpolate`, `line.marker_enabled`, `line.missing`; scatter adds `scatter.bubble`; boxplot adds `boxplot.whisker_type`, `boxplot.points_mode`, `boxplot.show_mean`; table uses `table.columns`, `table.column_formatting`, `table.pivot_column`, `table.cell_column` ([graph-settings], [rep-table-formatted], [learn-api]). One flat map holds all of them; switching `display` just changes which keys are read.
3. **The *definitions* are per-visualization and live in code, not in the data.** `registerVisualization` requires a static `identifier` ("Visualization must define an 'identifier' static variable") and stores it in a `Map<VisualizationDisplay, Visualization>` ([viz-index]). `getSettingDefinitionsForSeries` merges `COMMON_SETTINGS` (title, description, hide-when-empty) with `getVisualizationRaw(series)?.settings` — the display's own declarations — and stamps each with an `id` equal to its key ([viz-settings-visualization]).
4. **Most settings are computed, not stored.** `getComputedSettingsForSeries` takes definitions + data + stored settings and runs each definition's `getDefault()` and `getHidden()` ([viz-settings-visualization]). A setting is only written back when the user changes it, or when the definition sets `persistDefault: true` (as `graph.dimensions` and `graph.metrics` do) ([graph-settings]). So the stored map is a sparse override layer over a computed baseline — which is also why it tolerates being schemaless.
5. **Nested settings for per-object options.** `nestedSettings(id, {getObjects, getObjectKey, getObjectSettings, getSettingDefinitionsForObject, getInheritedSettingsForObject})` produces `{ [parentKey]: { [objectKey]: {…} } }` and returns two definitions: the container and a per-object provider ([nested-settings]). `column_settings` and `series_settings` are both instances of it ([column-settings-ts], [series-settings]).
6. **Third-party displays get a reserved namespace**: `CustomVizDisplayType = \`custom:${string}\`` in the display union ([ts-visualization]).

**What Metabase does *not* do:** there is no filtering of unknown keys on read — stored keys that no registered definition claims pass straight through to computed settings ([viz-settings-visualization], summarised by the reader as "no explicit filtering"; UNVERIFIED as a source comment, this is an absence-of-code observation).

### 5. Versioning and migration

**Three independent version mechanisms, plus Liquibase for the schema itself.**

**(a) The app DB schema — Liquibase.** `resources/liquibase.yaml` plus `resources/migrations/001_update_migrations.yaml`, `056_`, `057_`, `058_`, `059_` and per-version directories `060/`–`063/` ([migrations-dir]). Inferred from the file names; I did not read the changesets.

**(b) The card row — `card_schema`, an integer column with upgrade-on-read.** Verbatim ([card-schema-version]):

```clojure
(def ^:private current-schema-version
  "Latest schema version number. This is an increasing integer stored in each card's `:card_schema` column.
   It is used to guide `after-select` logic in how to modernize a card correctly.
   `20` is the \"legacy\" version - that was the default value given to all cards that existed when the
   `card_schema` column was added.
   Update process:
   - Increment this number.
   - Update `before-insert` and `before-update` if necessary, so they are storing upgraded cards.
   - Add a new [[upgrade-card-schema-to]] implementation, that upgrades the immediately previous version
     to your new version.
   The core `after-select` logic compares each row's `card_schema` and runs the upgrade functions for all
   versions up to and including [[current-schema-version]]."
  23)
```

```clojure
(defmulti ^:private upgrade-card-schema-to
  "Upgrades a card on read, so that it fits the given schema version number.
   The number is the **target** revision - if we read a row with `:card_schema` 22 and the
   [[current-schema-version]] is 25, then the `after-select` logic will effectively call
       (-> card (upgrade-card-schema-to 23) (upgrade-card-schema-to 24) (upgrade-card-schema-to 25))"
  {:arglists '([card target-schema-version])}
  (fn [_card target-schema-version] target-schema-version))
```

Properties worth copying or avoiding:
- **Reading a card without `card_schema` is a hard error**: `"Cannot SELECT a Card without including :card_schema"` ([card-schema-version]).
- **Downgrades are tolerated, not upgraded**: the loop uses `(if (>= (:card_schema card) current-schema-version) card …)` ([card-schema-version]).
- **`before-insert` and `before-update` both stamp `current-schema-version`** ([card-columns]) — so the upgrade is materialized on next write, and until then every read pays it.
- **Two of the four upgrades are dead.** 21 "is a no-op" (it backfilled `:ident`s on `result_metadata` but "caused performance problems since it's often recursive, and the caching was ineffective"). 23 was meant to repair cards whose `dataset_query` was `{}` after a 0.57 upgrade (#66199) and carries the comment "This fix was a failure. We have to keep the schema upgrade, but now it's just a no-op." Only 22 still does work: `(dissoc % :ident :model/inner_ident)` on each `result_metadata` column, with the note "the idents project was ultimately abandoned" ([card-schema-version]).

Lesson for wechart: **an upgrade-on-read chain is append-only.** You can never delete a step, even one that turned out to be wrong, because older rows still have to traverse it.

**(c) `visualization_settings` — a `:version` key inside the blob.** ([viz-migration], [json-migration]):

```clojure
(jm/def-json-migration migrate-viz-settings*)
(def ^:private viz-settings-current-version 2)

(defmethod ^:private migrate-viz-settings* [1 2] [viz-settings _]
  (let [{percent? :pie.show_legend_perecent   ; sic — the typo is in the persisted key
         legend?  :pie.show_legend} viz-settings
        new-visibility (cond legend? "inside" percent? "legend")
        new-linktype   (when (= "page" (-> viz-settings :click_behavior :linkType)) "dashboard")]
    (cond-> viz-settings
      new-visibility (assoc :pie.percent_visibility new-visibility)
      new-linktype   (assoc-in [:click_behavior :linkType] new-linktype))))
```

`def-json-migration` builds a multimethod dispatching on `[current-version desired-version]`, reading the current version from the `:version` key inside the JSON and defaulting to 1 when absent ([json-migration]). The transform runs it on **both** directions ([viz-migration]):

```clojure
(def transform-visualization-settings
  {:in  (comp json-in migrate-viz-settings)
   :out (comp migrate-viz-settings normalize-visualization-settings json-out-without-keywordization)})
```

and only stamps a new version when the migration actually changed something ([viz-migration]). Note the migrated-from key `:pie.show_legend_perecent` — a misspelling that is permanent, because it is in the persisted data of every instance.

**(d) MBQL itself — no version field.** The MBQL 4 top-level schema has keys `:database :type :query :native :parameters :settings :constraints :middleware :info :create-row :update-row` and **no version key** ([legacy-query-keys]). MBQL 5 identifies itself by `:lib/type :mbql/query`, which doubles as the discriminator ([lib-schema]). Version is therefore *inferred from shape*: `metabase.legacy-mbql.normalize/normalize` is documented as "Normalize MBQL 1-4 to MBQL 4" and refuses anything already tagged — `"Legacy MBQL normalization code cannot normalize MBQL >= 5"` ([legacy-normalize]).

The read/write path for `dataset_query`, verbatim ([lib-be-transforms]):

```clojure
(defn- transform-query-in [query]
  (when-not (map? query) (throw (ex-info … {:status-code 400})))
  (-> query (as-> $q (normalize-query nil $q {:strict? true})) lib/prepare-for-serialization mi/json-in))

(defn- transform-query-out [s]
  (when (some? s)
    (lib.util/recover
     (fn [] (-> (mi/json-out-without-keywordization s) normalize-query lib/prepare-after-deserialization))
     (fn [e] (log/errorf "Error deserializing dataset_query from app DB: %s" (ex-message e)) {}))))
```

Three things to note: writes are **strict** (invalid MBQL is rejected at write time); reads **recover to `{}`** on any error rather than failing (which is how cards end up with an empty `dataset_query` — the condition schema upgrade 23 tried and failed to repair); and `prepare-for-serialization` / `prepare-after-deserialization` strip internal keys via `:encode/serialize` and `:decode/api` markers on the Malli schemas, e.g. `::stage` drops `:parameters`, `:lib/stage-metadata` and `:middleware` on the way out ([lib-serialize], [lib-schema], [lib-common-options]).

**(e) Card history — the `revision` table.** Card edits are snapshotted into `:revision` ([revision-model]). It has to know about `card_schema` too:

```clojure
(t2/define-after-select :model/Revision
  [{:keys [model] :as revision}]
  ;; …ensures :card_schema is present before calling after-select.
  ;; Old revisions from before v0.55 won't have this field!
  (cond-> revision
    (and (= model :model/Card) (map? (:object revision)) (not (:card_schema (:object revision))))
    (update :object assoc :card_schema queries/starting-card-schema-version)))
```

and `card_schema` is excluded from revision diffing "as it's a technical/internal field" so it does not create spurious revisions ([revision-model]). This is directly relevant to AC-035 and AC-066: if wechart snapshots chart specs for undo/discard, every schema-version field has to be both back-filled on old snapshots and excluded from change detection.

### 6. The `lib` / metadata layer

**`MetadataProvider` is the single abstraction** ([metadata-protocols]):

> "Protocol for something that we can get information about Tables and Fields from. This can be provided in various ways: 1. By raw metadata attached to the query itself 2. By the application database in Clj code 3. By the Query Processor store in Clj code 4. By the Redux store in JS 5. By (hopefully cached) REST API calls"

```clojure
(defprotocol MetadataProvider
  (database  [metadata-provider])
  (metadatas [metadata-provider metadata-spec])
  (setting   [metadata-provider setting-key]))
```

with helpers `table`, `field`, `card`, `segment`, `measure` ([metadata-protocols]). The provider is attached to the query as `:lib/metadata` and **stripped before storage** — `::query` declares `[:lib/metadata {:optional true} ::lib.schema.metadata/metadata-provider]` and `:encode/serialize #'serialize-query` ([lib-schema], [lib-serialize]). So the persisted query is metadata-free; resolution happens on every load.

**Resolution entry points:**
- Server-side: `normalize-query` attaches `lib.metadata.jvm/application-database-metadata-provider` when none is supplied ([lib-be-transforms]).
- Client-side: `GET /api/card/:id/query_metadata` — "Get all of the required query metadata for a card" — returns everything the frontend needs in one call ([card-api-metadata]).
- The frontend **cannot introspect the query itself**: `DatasetQuery = OpaqueDatasetQuery | LegacyDatasetQuery` where ([ts-query])

  ```ts
  declare const OpaqueDatasetQuerySymbol: unique symbol;
  export type OpaqueDatasetQuery = unknown & {
    database: DatabaseId | null;
    _opaque: typeof OpaqueDatasetQuerySymbol;
  };
  ```

  Every read and write goes through the compiled-to-JS `metabase-lib`. That library is treated as a versioned API surface with its own changelog ([mbql-lib-changelog]).

**Matching a ref to a column — `find-matching-column`** ([lib-equality]):

> "Given `a-ref-or-column` and a list of `columns`, finds the column that best matches this ref or column. Matching is based on finding basically plausible matches first. There is often zero or one plausible matches, and this can return quickly. If there are multiple plausible matches, they are disambiguated by the most important extra included in the `ref`."

The reported fallback order: integer IDs matched by `:id`, with `:join-alias` consulted when multiple joins exist; string IDs matched against `:lib/desired-column-alias` first, then `:name`; and the comment "If they didn't match by `:id` above they shouldn't match by name due to a coincidence of column names in different tables" — i.e. the name fallback **excludes columns that have an `:id`** ([lib-equality]).

**What happens when a referenced field is renamed or removed.** This is the weakest-documented area; the pieces I could source:

- **Sync does not delete.** The sync step's job is to "Make sure the `Field` instances in the Metabase application database match up with those in the DB metadata, creating new Fields as needed, and marking existing ones as active or inactive as appropriate" ([sync-fields]), and the docs say sync "deactivates deleted tables" ([sync-docs]). So a removed column becomes an inactive `Field` row; the integer ID in the ref still resolves to a row.
- **Matching is by name.** `select-best-matching-name` ranks candidates so that "Items with matching `:schema` and `:name` are prioritized, with exact matches ranked higher than non-exact matches" ([sync-fields]). A **rename therefore looks like a drop plus an add**: the old Field goes inactive, a new Field with a new ID appears, and any saved query holding the old ID now points at a deactivated field.
  UNVERIFIED: I did not find a source stating the resulting user-visible behaviour of running such a card (error vs. silently dropped column). `docs/databases/sync-scan.md` "doesn't explicitly address what happens to saved questions when source tables are deleted or renamed" ([sync-docs]).
- **Unresolvable field IDs surface as a query-processor error.** Issue #34950, "Error: Field X is not present in the Query Processor Store" — P1 regression, opened 2023-10-23, closed 2023-10-25, 59 comments; the reporter's workaround was re-opening and re-saving each question, and the error recurred on save ([iss-34950]).
- **`result_metadata` goes stale independently.** It is a separate JSON column holding the last known output columns, normalized on read by `lib/normalize-result-metadata-column` ([result-metadata-transform]). Issue #14016 "Card saved result_metadata can be out of date if base/special type of Fields change" (closed) and #35968 "Stale `result_metadata` leads to broken column types" (open since 2023-11-20, P2, Difficulty:Hard) ([iss-35968], [iss-search-result-metadata]).
- **Metabase added a side index of card→field edges**, the `query_field` table (`:model/QueryField` → `:query_field`) ([query-field]), precisely because the dependency is otherwise buried in an opaque JSON column and cannot be queried or foreign-keyed.
  UNVERIFIED: the model file is three lines; I did not read the analysis code that populates it or confirm what it is used for.

### 7. The serialization / export format (serdes)

**Two formats exist and they are not the same thing:** the app-DB/REST JSON (numeric IDs, `lib/uuid`, §1) and the export YAML (portable references, §1's example). The export format is specified outside the product repo, in `metabase/representations`, "Version: 1.0.0" ([rep-spec]).

**File layout**, verbatim from the spec ([rep-spec]):

```
export-root/
├── settings.yaml
├── collections/
│   ├── main/                               # Main namespace (regular content)
│   │   ├── {slug}.yaml                     # Entities in root collection
│   │   ├── {collection_slug}.yaml          # Collection definition (sibling of its folder)
│   │   └── {collection_slug}/              # Collection contents
│   │       ├── {card_slug}.yaml            # Cards, dashboards, documents, etc.
│   │       ├── {dashboard_slug}.yaml       #   — all flat in the same folder
│   │       ├── {child_slug}.yaml           # Child collection definition
│   │       └── {child_slug}/              # Child collection contents
│   ├── snippets/                           # Snippets namespace
│   └── transforms/                         # Transforms namespace
├── databases/
│   └── {database_slug}/
│       ├── {database_slug}.yaml
│       ├── schemas/{schema_slug}/tables/{table_slug}/
│       │   ├── {table_slug}.yaml
│       │   ├── segments/{slug}.yaml
│       │   └── measures/{slug}.yaml
│       └── tables/                         # Schemaless databases
├── python_libraries/{slug}.yaml
└── transforms/
    ├── transform_jobs/{slug}.yaml
    └── transform_tags/{slug}.yaml
```

One file per entity; a collection is a `.yaml` file that is a *sibling* of the directory holding its contents. Metabase "only checks for importable YAML files in these top-level directories: `collections/`, `databases/` (only `segments/` and `measures/` subdirectories), `python_libraries/`, and `transforms/`" ([rep-spec]). File names are slugs: "Names are lowercased, and special characters are replaced with underscores", with a numeric suffix on collision (`products_by_week_2.yaml`) ([serialization-docs]).

**Entity IDs.** `entity_id` "is a 21-character NanoID string (alphabet: `A-Za-z0-9_-`). It is the primary portable identifier used in cross-references" ([rep-spec]). The product docs: "Metabase assigns a unique Entity ID to every Metabase item (a dashboard, question, etc.)" and "By 'stable' we mean that you can, for example, export a dashboard with an entity ID from one Metabase, and import that dashboard into another Metabase and have that dashboard use the same Entity ID" ([serialization-docs]). `:model/Card` derives `:hook/entity-id`, so IDs are generated on insert ([card-model]).

**Reference rewriting.** On export "numeric database IDs are replaced with human-readable names and entity IDs" ([rep-spec]):

| Target | Portable form |
| --- | --- |
| Database | `"Sample Database"` |
| Table | `["Sample Database", null, "ORDERS"]` (db, schema, table) |
| Field | `["Sample Database", null, "ORDERS", "TOTAL"]` |
| Collection / Card / Dashboard | `entity_id` NanoID |
| User | email address |
| Metric / Measure / Segment | `entity_id` NanoID |

([rep-spec], [rep-ref-schema], [rep-line-chart], [rep-metric-refs])

Every file ends with a `serdes/meta` block giving the identity path: `- {id: <entity_id>, label: <slug>, model: Card}` ([rep-line-chart], [rep-card-schema]).

**`lib/uuid` handling.** The exported refs in every example carry `{}` or only semantic options ([rep-line-chart], [rep-joins], [rep-fields-expr]), so `lib/uuid` is clearly not exported for ordinary refs. The spec keeps it only where it is load-bearing: "When an aggregation is referenced elsewhere (e.g., in `order-by` or a later stage), its options map must include a `lib/uuid`" and "Aggregation references use the `aggregation` keyword with a UUID that matches the `lib/uuid` of the referenced aggregation clause" ([rep-spec]).
  UNVERIFIED: whether uuids are regenerated on import. The spec "does not explicitly state that `lib/uuid` is stripped or regenerated during import/export operations" ([rep-spec]).

**Card fields exported** ([rep-spec], [rep-card-schema]): `name`, `entity_id`, `display`, `creator_id`, `dataset_query`, `visualization_settings`, `serdes/meta`, `description`, `archived`, `archived_directly`, `type`, `collection_id`, `collection_position`, `collection_preview`, `dashboard_id`, `document_id`, `database_id`, `parameters`, `parameter_mappings`, `result_metadata`, `enable_embedding`, `embedding_params`, `embedding_type`, `public_uuid`, `made_public_by_id`, `metabase_version`, `card_schema`, `created_at`. Required: `name`, `entity_id`, `display`, `creator_id`, `dataset_query`, `visualization_settings`, `serdes/meta`. Note `card_schema` is described as "Internal card schema version (should not be changed manually)" and `parameter_mappings` as "(unused, always empty)" ([rep-card-schema]).

**Is it a stable public contract? No.** The three statements that settle it ([serialization-docs]):

> "Currently, serialization only works if source and target Metabase have the same major version."
> "Serialization is _not_ meant to back up your Metabase."
> "Just like the CLI serialization commands, these endpoints are only available for Pro and Enterprise plans."

and the format changed again in Metabase 60: "File and directory names now use human-readable names (like `accounts_model.yaml`) instead of Entity ID prefixes", plus "Fields with default values (like `archived: false`) and null-valued fields are omitted from the YAML output" ([serialization-docs]). A formally versioned spec with JSON Schemas ([rep-schemas]) — but locked to the major version of the instance that wrote it. The REST API it sits on is itself unversioned ([api-intro]), and MBQL inside it is declared opaque ([api-changelog]).

### 8. Publicly documented pain points with this split

**On `visualization_settings` column keys — the central, admitted failure:**

- **#11829 "Better way to identify columns for visualization settings"** — labels `Type:Tech Debt`, `.Correctness`, `Visualization/Chart Settings`, `Difficulty:Hard`, `.Backend`, `.metabase-lib`, `.Wanted: MLv2`. The problem statement is preserving settings "when manipulating the query in certain ways, e.x. adding/removing aggregations/breakouts/fields" and across GUI↔SQL conversion. The body records three successive approaches — column names (broke on duplicate names), field references (broke on query transformation), and the then-current `field_ref` (still limited) — and enumerates seven candidate solutions with a comparison matrix. Closed 2025-05-22 ([iss-11829]).
  The resolution is visible in the code: `getColumnKey` now returns `JSON.stringify(["name", column.name])`, with `getLegacyColumnKey` kept for unmigrated data ([column-key]).
- **#36185 "Duplicated columns in source query cannot be distinguished"** — **open**, created 2023-11-28, labels `.metabase-lib`, `.Wanted: MLv2`, `.Team/QueryingPlatform`. "This is an umbrella issue tracking a deep problem with several diverse symptoms." Causes listed: self-joins or repeated joins of the same table, columns with identical implicit and explicit joins, differing binning granularity, and "broken `field_ref`s in query result metadata affecting visualization settings". Backend: "The query processor conflates these separate columns because their `:id`s are the same." Frontend: indexing columns by ID creates conflicts and precomputed field refs are unreliable. It catalogues 14+ dependent bugs ([iss-36185]).

**On exports breaking because viz-settings refs went stale:** #19465 "Specific visualization_settings can cause empty export"; #19717 same, "(even in v0.41.6)"; #19889 "Certain visualization_settings can cause empty/missing columns on export"; #18382 "Columns missing from exports, when viz settings are using older field dimensions"; #18972 "Exports fails, when there's invalid visualization `column_settings` references"; #15475 "Pulse fails when visualization_settings is referring to a field-literal column". All closed ([iss-search-vizsettings], [iss-search-columnsettings]).

**On settings drifting out of sync with the query:** #12679 "Deleting columns doesn't delete affiliated column title"; #25592 "New custom columns won't appear in a dashboard card with reordered columns"; #13455 "Changing column order/visibility via visualization Settings sidebar is inconsistent"; #20624 "Model metadata not overriding question column settings"; #43382 "Custom mapping is reset while editing unrelated settings in column metadata" (**open**) ([iss-search-fieldrefs], [iss-search-columnsettings]).

**On `result_metadata`:** #35968 "Stale `result_metadata` leads to broken column types" (**open**, P2, Difficulty:Hard, since 2023-11-20); #14016 "Card saved result_metadata can be out of date if base/special type of Fields change"; #36003 "`result_metadata` overwritten by `qp/process-query-and-save-execution!`"; #41896 "Pivot tables have invalid `result_metadata` affecting dashboard click behavior"; #30150 "Remove `result_metadata` from question yamls (non-models)" ([iss-search-result-metadata], [iss-35968]).

**On the expressiveness ceiling of a static settings blob:** #55207 "Ability to Parameterize Viz Settings (Column Names, Card Titles, etc)" — **open** since 2025-03-14 ([iss-search-columnsettings]).

**In Metabase's own code and docs:**

- The 0.57 release changed the serialization of every query in every instance: "MBQL queries (in Cards and elsewhere) are now serialized as MBQL 5 as opposed to MBQL 4 (aka legacy MBQL) in the application database and in REST API responses" ([api-changelog]) — and required a rollback column, `:legacy_query`, "temporary column to power rollback from v57 to v56; we can remove it in v58" ([card-legacy-query]).
- Two of four `card_schema` upgrades are admitted dead ends: 21 "caused performance problems"; 23 "This fix was a failure. We have to keep the schema upgrade, but now it's just a no-op"; 22 exists only to erase bad data from the abandoned `:ident` project — "the idents project was ultimately abandoned and `:ident` and `:model/inner_ident` are no longer populated or used" ([card-schema-version]).
- Deserialization of a card's query swallows errors and returns `{}` ([lib-be-transforms]); schema upgrade 23 exists because customers upgrading to 57 ended up with cards whose `dataset_query` was `{}` (#66199) ([card-schema-version]).
- `normalize-visualization-settings` **drops** any `column_settings` key it cannot normalize, logging at debug for some paths and warn for others ([viz-normalize]).
- A persisted misspelling is permanent: `:pie.show_legend_perecent` ([viz-migration]).
- `metabase.models.interface` opens with a banner: "PLEASE DON'T ADD NEW TRANSFORMS HERE, GO PUT THEM IN RELEVANT MODULES THAT USE THEM INSTEAD" ([mi-ns]) — the transform layer that normalizes viz settings is itself flagged tech debt.

### 9. How this maps onto wechart's two shapes (facts, no recommendation)

| wechart | Metabase equivalent | Source |
| --- | --- | --- |
| `ChartSpec.cube` | `dataset_query.stages[0]["source-table"]` (or `source-card`) | [rep-query-schema] |
| `ChartSpec.measures[]` | `dataset_query.stages[0].aggregation[]`, or `["measure", opts, entity_id]` refs to table-attached measures | [rep-line-chart], [rep-metric-refs] |
| `ChartSpec.dimensions[]` | `dataset_query.stages[0].breakout[]` | [rep-bar-stacked] |
| `ChartSpec.timeDimensions[]` | a `breakout` ref with `{temporal-unit: month}` — **not a separate well**; granularity is an option on the ref | [rep-line-chart] |
| `ChartSpec.chartType` | the `display` column, a bare string | [card-transforms], [rep-card-schema] |
| `RenderSpec.encoding.category` / `.series` | `visualization_settings["graph.dimensions"]` — an ordered array of **result-column names**; first = x, second = series | [rep-bar-stacked], [graph-settings] |
| `RenderSpec.encoding.values[]` | `visualization_settings["graph.metrics"]` — result-column names | [rep-bar-stacked] |
| `RenderSpec.rows[]` | not persisted; the renderer is handed `{series: [{card, data}]}` at draw time | [viz-index] |
| `RenderSpec.palette` | `visualization_settings["graph.colors"]` and per-series `series_settings.<key>.color` | [graph-settings], [series-settings] |
| `RenderSpec.surface` (axes, legend, labels) | `visualization_settings["graph.x_axis.*"]`, `["graph.y_axis.*"]`, `["legend.*"]`, `["graph.show_values"]` — computed at render time from definitions + data + the sparse stored overrides | [graph-settings], [viz-settings-visualization] |

Two structural observations that follow from the sources:

1. **Metabase persists only the ChartSpec analogue.** There is no stored RenderSpec. `graph.dimensions`/`graph.metrics` are the *only* persisted bridge, and they are a string-name binding from query-output columns to visual channels, defaulted from data when absent and re-defaulted when invalid ([graph-settings]).
2. **The binding is by name at the render boundary, by ref inside the query.** Metabase arrived at this after abandoning ref-keyed viz settings (#11829, [column-key]). The two keying schemes still coexist in the data ([column-key]).

## Gotchas

- **Argument order flipped between MBQL versions.** MBQL 4 `[:field id-or-name opts]` vs MBQL 5 `[:field opts id-or-name]` ([legacy-field], [lib-ref-schema]). Any persisted positional encoding is a migration liability.
- **The version of the query is inferred, never declared.** `normalize-query` throws on shape collisions rather than reading a version number ([lib-be-transforms], [legacy-normalize]).
- **`graph.metrics` values must not be keywordized.** The backend `dissoc`s it before `walk/keywordize-keys` and re-attaches it afterwards ([viz-normalize]). Any format that keywordizes a settings map has the same problem with name-valued settings.
- **`column_settings` keys are JSON strings inside JSON.** Double encoding: `'["name","PRICE"]'` is the object key ([rep-table-formatted]). Normalizing them requires decode → normalize → re-encode on every read ([viz-normalize]).
- **Unnormalizable settings keys are dropped, not surfaced** ([viz-normalize]).
- **Query deserialization failures are swallowed to `{}`** ([lib-be-transforms]), which produces cards that exist but have no query.
- **A missing `card_schema` on read is a hard error**, so every read path and every historical snapshot must supply it ([card-schema-version], [revision-model]).
- **Upgrade-on-read steps cannot be deleted**, only neutered ([card-schema-version]).
- **Export is version-locked**: "serialization only works if source and target Metabase have the same major version" ([serialization-docs]).
- **`display` is a bare string in a column with no DB-level constraint** ([card-transforms]); the enum lives in a JSON Schema for exports ([rep-card-schema]) and in a TS union for the client ([ts-visualization]), and custom displays use a `custom:` prefix ([ts-visualization]).
- **The frontend cannot read the persisted query directly** — it is typed `unknown & {…, _opaque: unique symbol}` and must go through `metabase-lib` ([ts-query]). A very strong encapsulation boundary, at the cost of needing a shared query library on both sides.
- **Security note:** `public_uuid` is stored encrypted (`mi/transform-encrypted-text "report_card.public_uuid"`) ([card-transforms]); public sharing and embedding state (`enable_embedding`, `embedding_params`, `embedding_type`, `made_public_by_id`) are all card columns and are all exported by serdes ([rep-card-schema]) — an export carries sharing state with it.

## Alternatives considered

Not requested; none offered.

## Open questions / unverified

- **UNVERIFIED — a captured MBQL 5 JSON payload.** I found no primary source containing a recorded `dataset_query` in the app-DB/REST form (numeric IDs + `lib/uuid`). The JSON shown in §1 is derived from [lib-schema], [lib-common-options] and [rep-line-chart]. The MBQL 4 JSON in §1 is real but pre-0.57 ([learn-api]). Resolvable by reading one row from the local Metabase at `:3000`.
- **UNVERIFIED — the authoritative `report_card` column list.** §1's list is from names appearing in `card.clj` ([card-columns]), not from the Liquibase changeset. `resources/migrations/001_update_migrations.yaml` is 411 kB and I did not read it. Two reported names (`card_id`, `public_uuid_prefix`) are probably references to other tables.
- **UNVERIFIED — behaviour when a referenced field is renamed or dropped.** The sync side is sourced ([sync-fields], [sync-docs]); the user-visible result of running such a card is not. `docs/databases/sync-scan.md` does not cover it. #34950 shows one failure mode ("Field X is not present in the Query Processor Store") but as a regression, not as designed behaviour ([iss-34950]).
- **UNVERIFIED — what `query_field` is used for.** The model file is three lines ([query-field]); I did not read the code that populates or consumes it.
- **UNVERIFIED — whether `lib/uuid` is regenerated on serdes import** ([rep-spec]).
- **UNVERIFIED — that unknown `visualization_settings` keys are never filtered.** This is an absence-of-code observation in [viz-settings-visualization], not a sourced statement.
- **UNVERIFIED — creation date of #11829.** The issues API reported 2020-01-30 and the search API reported 2019-12-13. The closed date, 2025-05-22, is consistent ([iss-11829], [iss-search-columnsettings]).
- **Not read:** `enterprise/backend/src/metabase_enterprise/serialization/` (the serdes implementation — I used the spec repo and the docs instead); `resources/sample-content.edn`; `resources/openapi/openapi.json` (1.7 MB); `frontend/src/metabase/visualizations/visualizations/*` (the per-display settings declarations — I read the shared `graph.ts`, `series.ts`, `column.ts` and `nested.ts` instead).
- **Not covered:** dashboards. A dashcard has its own `visualization_settings` that overrides the card's, and Metabase's click-behavior and parameter-mapping model lives there. wechart's AC-053 … AC-068 and AC-076 … AC-083 touch the same ground; that would be a separate pass over `dashboard.yaml` in [rep-schemas] and `src/metabase/dashboards/`.
- Web search was unavailable for this session (budget exhausted), so every source here is a direct fetch of a GitHub raw file, a GitHub API response, or a metabase.com docs page. No blog posts were used.

[mb-latest-release]: https://api.github.com/repos/metabase/metabase/releases/latest
[card-model]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj
[card-transforms]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj
[card-columns]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj
[card-schema-version]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj
[card-legacy-query]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/card.clj
[card-api]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries_rest/api/card.clj
[card-api-metadata]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries_rest/api/card.clj
[queries-schema]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/schema.clj
[query-field]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/queries/models/query_field.clj
[lib-be-transforms]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib_be/models/transforms.clj
[lib-schema]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/schema.cljc
[lib-ref-schema]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/schema/ref.cljc
[lib-common-options]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/schema/common.cljc
[lib-serialize]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/serialize.cljc
[lib-equality]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/equality.cljc
[metadata-protocols]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/lib/metadata/protocols.cljc
[legacy-normalize]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/normalize.cljc
[legacy-schema]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/schema.cljc
[legacy-field]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/schema.cljc
[legacy-filter]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/schema.cljc
[legacy-query-keys]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/legacy_mbql/schema.cljc
[mi-ns]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/interface.clj
[viz-normalize]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/interface.clj
[viz-migration]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/interface.clj
[result-metadata-transform]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/interface.clj
[json-migration]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/models/json_migration.clj
[revision-model]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/revisions/models/revision.clj
[sync-fields]: https://github.com/metabase/metabase/blob/v0.63.18/src/metabase/sync/sync_metadata/fields.clj
[sync-docs]: https://github.com/metabase/metabase/blob/v0.63.18/docs/databases/sync-scan.md
[migrations-dir]: https://github.com/metabase/metabase/tree/v0.63.18/resources/migrations
[api-changelog]: https://github.com/metabase/metabase/blob/v0.63.18/docs/developers-guide/api-changelog.md
[api-intro]: https://github.com/metabase/metabase/blob/v0.63.18/resources/openapi/api-intro.md
[mbql-lib-changelog]: https://github.com/metabase/metabase/blob/v0.63.18/docs/developers-guide/mbql-library-changelog.md
[serialization-docs]: https://github.com/metabase/metabase/blob/v0.63.18/docs/installation-and-operation/serialization.md
[ts-card]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase-types/api/card.ts
[ts-query]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase-types/api/query.ts
[ts-visualization]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase-types/api/visualization.ts
[column-key]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase-lib/v1/queries/utils/column-key.ts
[column-settings-ts]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/lib/settings/column.ts
[graph-settings]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/lib/settings/graph.ts
[series-settings]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/lib/settings/series.ts
[nested-settings]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/lib/settings/nested.ts
[viz-settings-visualization]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/lib/settings/visualization.ts
[viz-index]: https://github.com/metabase/metabase/blob/v0.63.18/frontend/src/metabase/visualizations/index.ts
[learn-api]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/metabase-api
[rep-spec]: https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md
[rep-schemas]: https://github.com/metabase/representations/tree/main/core-spec/v1/schemas
[rep-card-schema]: https://github.com/metabase/representations/blob/main/core-spec/v1/schemas/card.yaml
[rep-query-schema]: https://github.com/metabase/representations/blob/main/core-spec/v1/schemas/common/query.yaml
[rep-ref-schema]: https://github.com/metabase/representations/blob/main/core-spec/v1/schemas/common/ref.yaml
[rep-line-chart]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/visualization_settings/line_chart.yaml
[rep-bar-stacked]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/visualization_settings/bar_chart_stacked.yaml
[rep-table-formatted]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/visualization_settings/table_formatted.yaml
[rep-joins]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/queries/joins.yaml
[rep-fields-expr]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/queries/fields_and_expressions.yaml
[rep-metric-refs]: https://github.com/metabase/representations/blob/main/examples/v1/collections/main/queries/metric_measure_segment_refs.yaml
[iss-11829]: https://github.com/metabase/metabase/issues/11829
[iss-36185]: https://github.com/metabase/metabase/issues/36185
[iss-35968]: https://github.com/metabase/metabase/issues/35968
[iss-34950]: https://github.com/metabase/metabase/issues/34950
[iss-search-vizsettings]: https://api.github.com/search/issues?q=repo:metabase/metabase+visualization_settings+in:title+is:issue
[iss-search-columnsettings]: https://api.github.com/search/issues?q=repo:metabase/metabase+%22column+settings%22+is:issue+in:title
[iss-search-fieldrefs]: https://api.github.com/search/issues?q=repo:metabase/metabase+%22field+refs%22+is:issue
[iss-search-result-metadata]: https://api.github.com/search/issues?q=repo:metabase/metabase+result_metadata+is:issue+in:title
