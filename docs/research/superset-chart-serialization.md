---
library: Apache Superset (chart / "slice" definition format)
packages: []
version: 6.1.0
researched: 2026-09-20
sources:
  [
    https://github.com/apache/superset/blob/6.1.0/superset/models/slice.py,
    https://github.com/apache/superset/blob/6.1.0/superset/charts/schemas.py,
    https://github.com/apache/superset/blob/6.1.0/superset/charts/api.py,
    https://github.com/apache/superset/blob/6.1.0/superset/common/query_context.py,
    https://github.com/apache/superset/blob/6.1.0/superset/common/query_object.py,
    https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/export.py,
    https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/update.py,
    https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/importers/v1/__init__.py,
    https://github.com/apache/superset/blob/6.1.0/superset/commands/export/models.py,
    https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/base.py,
    https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/processors.py,
    https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/query_functions.py,
    https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/query/buildQueryContext.ts,
    https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/query/types/QueryFormData.ts,
    https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/models/ChartPlugin.ts,
    https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts,
    https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/controlUtils/standardizedFormData.ts,
    https://github.com/apache/superset/issues/33152,
    https://github.com/apache/superset/pull/33285,
    https://github.com/apache/superset/issues/30816,
  ]
---

# Apache Superset 6.1.0 — how a chart ("slice") is defined and serialized

Version pinned from the registry: `apache-superset` latest stable is **6.1.0** ([pypi]), and GitHub `releases/latest` is tag `6.1.0`, published 2026-05-13 ([gh-latest]). Every file link below is at tag `6.1.0`.

## Summary

wechart has two shapes with no bridge — `ChartSpec` (wells: `{cube, measures[], dimensions[], timeDimensions[], chartType?}`, `/Users/srajagopal/Work/wechart/packages/core/src/chart-spec.ts`) and `RenderSpec` (`{chartType, encoding{category,series,values[]}, rows[], palette?, surface?}`, `/Users/srajagopal/Work/wechart/packages/core/src/render-spec.ts`) — and no decision about the persisted format. Superset is the closest large-scale prior art for that exact decision, and it made it in a specific way.

**The one-line answer: Superset persists only the authoring shape and a cached copy of the derived query. It never persists a render shape.**

- Persisted: `slices.params` — a flat, untyped JSON map of *control names* → values (Superset calls this `form_data`). This is wechart's `ChartSpec` role.
- Persisted alongside it: `slices.query_context` — a JSON string holding the *derived* query, produced by frontend TypeScript from `form_data`, cached in the row so backend-only jobs can re-run the query without a browser ([slice-py], [issue-33152]).
- Not persisted: the render shape. Superset's analogue of `RenderSpec` is `ChartProps` (`{formData, queriesData[], datasource, width, height, hooks, theme, …}`, [chartprops-ts]), which is built at render time and then converted by a per-plugin `transformProps` function into that plugin's own props ([chartplugin-ts], [superchartcore-tsx]).

The cost of that choice is documented by Superset's own maintainers, and it is the single most transferable finding here: because the `form_data` → `query_context` derivation lives only in the frontend, Superset had to re-implement ~50 TypeScript query-building functions in Python (1000+ lines, `query_functions.py`) just so a database migration could keep the cached query in sync ([pr-33285], [query-functions-py]). See §8.

No AC or feature IDs were supplied with this task, and `docs/spec.md` ACs are not cited here. This is reference research; nothing in this document is imported.

## Install

Nothing is installed. To reproduce the artifacts cited:

```sh
# the exact tree this document was read from
git clone --depth 1 --branch 6.1.0 https://github.com/apache/superset.git
# or fetch single files without cloning
curl -sL https://cdn.jsdelivr.net/gh/apache/superset@6.1.0/superset/models/slice.py
```

Runtime facts, for context only: Superset 6.1.0 requires Python `>=3.10` ([pypi]). Its chart plugins are React packages under `superset-frontend/plugins/`, and the ECharts ones wrap Apache ECharts ([pie-index-ts]).

## Init / auth pattern

Not applicable — no client library is being adopted. The HTTP surface, if we ever want to read a real instance's charts:

| Call | What it returns |
| --- | --- |
| `GET /api/v1/chart/{pk}` | `ChartGetResponseSchema`: `id, url, cache_timeout, certified_by, certification_details, changed_on_delta_humanized, description, params, slice_name, thumbnail_url, viz_type, query_context, is_managed_externally, tags, owners, dashboards, uuid, datasource_id, datasource_name_text, datasource_type, datasource_url, datasource_uuid` ([schemas-py] L1685–1707) |
| `GET /api/v1/chart/` | `list_columns` — includes `params`, `form_data`, `viz_type`, `slice_url`, `edit_url`, `thumbnail_url`; **does not include `query_context`** ([charts-api-py] L137–185) |
| `POST /api/v1/chart/` | `ChartPostSchema` (§4) |
| `GET /api/v1/chart/export/?q=[ids]` | ZIP of YAML — docstring: `"""Download multiple charts as YAML files."""` ([charts-api-py]) |
| `POST /api/v1/chart/data` | takes a `query_context` body, returns result data ([schemas-py] `ChartDataQueryContextSchema`) |

`resource_name = "chart"`, `allow_browser_login = True` ([charts-api-py]).

## API surface we will use

### 1. The exact persisted representation

**Where it lives.** SQLAlchemy model `Slice`, `__tablename__ = "slices"` ([slice-py]). Relevant columns, verbatim types:

| Column | Type | Nullable |
| --- | --- | --- |
| `id` | `Integer, primary_key=True` | no |
| `slice_name` | `String(250)` | yes |
| `datasource_id` | `Integer` | yes |
| `datasource_type` | `String(200)` | yes |
| `datasource_name` | `String(2000)` | yes |
| `viz_type` | `String(250)` | yes |
| `params` | `utils.MediumText()` | yes |
| `query_context` | `utils.MediumText()` | yes |
| `description`, `cache_timeout`, `perm`, `schema_perm`, `catalog_perm`, `last_saved_at`, `last_saved_by_fk`, `certified_by`, `certification_details`, `is_managed_externally`, `external_url` | — | — |

([slice-py]). So the whole chart definition is **two opaque JSON text blobs plus a `viz_type` string** — there is no column per field role, no schema table, nothing relational about the chart body.

**A real, complete saved chart.** This is Superset's own integration-test fixture `chart_config`, which is exactly what the v1 importer consumes and what the exporter produces ([importexport-fixture], Python literal — `False`/`None` are JSON `false`/`null`):

```python
chart_config = {
    "slice_name": "Deck Path",
    "viz_type": "deck_path",
    "params": {
        "color_picker": {"a": 1, "b": 135, "g": 122, "r": 0},
        "datasource": "12__table",
        "js_columns": ["color"],
        "js_data_mutator": r"data => data.map(d => ({\n    ...d,\n    color: colors.hexToRGB(d.extraProps.color)\n}));",
        "js_onclick_href": "",
        "js_tooltip": "",
        "line_column": "path_json",
        "line_type": "json",
        "line_width": 150,
        "mapbox_style": "mapbox://styles/mapbox/light-v9",
        "reverse_long_lat": False,
        "row_limit": 5000,
        "slice_id": 43,
        "time_grain_sqla": None,
        "time_range": " : ",
        "viewport": {"altitude": 1.5, "bearing": 0, "height": 1094,
                     "latitude": 37.73671752604488, "longitude": -122.18885402582598,
                     "maxLatitude": 85.05113, "maxPitch": 60, "maxZoom": 20,
                     "minLatitude": -85.05113, "minPitch": 0, "minZoom": 0,
                     "pitch": 0, "width": 669, "zoom": 9.51847667620428},
        "viz_type": "deck_path",
    },
    "query_context": '{"datasource":{"id":12,"type":"table"},"force":false,"queries":[{"time_range":" : ","filters":[],"extras":{"time_grain_sqla":null,"having":"","where":""},"applied_time_extras":{},"columns":[],"metrics":[],"annotation_layers":[],"row_limit":5000,"timeseries_limit":0,"order_desc":true,"url_params":{},"custom_params":{},"custom_form_data":{}}],"result_format":"json","result_type":"full"}',
    "cache_timeout": None,
    "uuid": "0c23747a-6528-4629-97bf-e4b78d3b9df1",
    "version": "1.0.0",
    "dataset_uuid": "10808100-158b-42c4-842e-f32b99d88dfb",
}
```

Note immediately: `viz_type` appears **twice** (top level and inside `params`), and the datasource appears **three** times (`params.datasource: "12__table"`, `query_context.datasource: {id, type}`, `dataset_uuid`).

**A complete real export file**, verbatim, one of Superset's shipped examples ([parallel-coords-yaml]; Apache header elided):

```yaml
cache_timeout: null
certification_details: null
certified_by: null
dataset_uuid: 69e9de42-fe7f-4948-946a-f7913227aee8
description: null
params:
  compare_lag: '10'
  compare_suffix: o10Y
  country_fieldtype: cca3
  entity: country_code
  granularity_sqla: year
  groupby: []
  limit: 100
  markup_type: markdown
  metrics:
  - sum__SP_POP_TOTL
  - sum__SP_RUR_TOTL_ZS
  - sum__SH_DYN_AIDS
  row_limit: 50000
  secondary_metric: sum__SP_POP_TOTL
  series: country_name
  show_bubbles: true
  since: '2011-01-01'
  time_range: '2014-01-01 : 2014-01-02'
  until: '2012-01-01'
  viz_type: para
query_context: null
slice_name: Parallel Coordinates
uuid: 48bf196c-f5fe-4e6c-b8ed-166e36b6648b
version: 1.0.0
viz_type: para
```

`query_context: null` here — and in every shipped example chart I read ([vgs-yaml], [weekly-messages-yaml]). The cached query is genuinely optional, and most of Superset's own seed data ships without it.

**Read-time mutation.** `Slice.form_data` is a *property*, not the raw column. It parses `params` and then overwrites three keys and conditionally adds a fourth ([slice-py], verbatim):

```python
@property
def form_data(self) -> dict[str, Any]:
    form_data: dict[str, Any] = {}
    try:
        form_data = json.loads(self.params)
    except Exception as ex:
        logger.error("Malformed json in slice's params", exc_info=True)
        logger.exception(ex)
    form_data.update({
        "slice_id": self.id,
        "viz_type": self.viz_type,
        "datasource": f"{self.datasource_id}__{self.datasource_type}",
    })
    if self.cache_timeout:
        form_data["cache_timeout"] = self.cache_timeout
    update_time_range(form_data)
    return form_data
```

So the columns are authoritative for `viz_type` and datasource, and the copies inside `params` are stale-but-harmless. Malformed `params` is logged and swallowed — a chart with corrupt params silently becomes a chart with *only* those four keys.

### 2. Query vs. visualization: `params`, `form_data`, `query_context`

**They are not separated. `form_data` is a superset of both, and it is copied into the query.**

- `params` (column, JSON text) ≡ `form_data` (parsed dict, plus the four overwrites above). One flat namespace holding query inputs (`groupby`, `metrics`, `adhoc_filters`, `row_limit`, `time_range`) *and* pure display options (`color_scheme`, `label_colors`, `show_legend`, `outerRadius`, `y_axis_format`) side by side, with no marker distinguishing them ([vgs-yaml], [pie-controlpanel-tsx]).
- `query_context` (column, JSON text) is produced by `buildQueryContext(formData, options)` in TypeScript. Its return value, verbatim ([buildquerycontext-ts]):

```ts
{
  datasource: new DatasourceKey(formData.datasource).toObject(),
  force: formData.force || false,
  queries,
  form_data: formData,
  result_format: formData.result_format || 'json',
  result_type: formData.result_type || 'full',
}
```

  **`form_data` is embedded whole inside `query_context`.** The Python re-implementation returns the identical dict ([query-functions-py] `build_query_context`, L1080–1087).

- Server-side, `QueryContext` mirrors that: `datasource`, `queries: list[QueryObject]`, `slice_`, `form_data: dict[str, Any] | None`, `result_type`, `result_format`, `force`, `custom_cache_timeout`, `cache_values`. Docstring: *"The query context contains the query object and additional fields necessary to retrieve the data payload for a given viz."* ([query-context-py])
- `QueryObject` is the actual query. Class attributes ([query-object-py]): `annotation_layers, applied_time_extras, apply_fetch_values_predicate, columns, datasource, extras, filter, from_dttm, granularity, inner_from_dttm, inner_to_dttm, is_rowcount, is_timeseries, metrics, order_desc, orderby, post_processing, result_type, row_limit, row_offset, series_columns, series_limit, series_limit_metric, time_offsets, time_shift, time_range, to_dttm`. Its class docstring is one line: *"The query objects are constructed on the client."*

**What is duplicated, and why.**

| Datum | Lives in | Why |
| --- | --- | --- |
| whole `form_data` | `params` column **and** `query_context.form_data` | `buildQueryContext` copies it in unconditionally ([buildquerycontext-ts]); plugins read viz options off `ChartProps.formData` at render time ([chartprops-ts]) |
| filters | `form_data.adhoc_filters` (`{clause, subject, operator, comparator, expressionType}`) **and** `queries[].filters` (`{col, op, val, grain, isExtra}`) | two different schemas for the same thing: `ChartDataFilterSchema` vs. the adhoc-filter literal built in `_migrate_temporal_filter` ([schemas-py] L941, [migrate-viz-base-py]) |
| dimensions | `form_data.groupby` / `columns` / `entity` / `series` … **and** `queries[].columns` | `extract_query_fields` folds all the aliases into `columns` ([query-functions-py] L574) |
| datasource | `params.datasource` (`"12__table"`), `query_context.datasource` (`{id, type}`), `slices.datasource_id`/`datasource_type`, and `dataset_uuid` on export | ([importexport-fixture], [slice-py], [chart-export-py]) |
| time range | `form_data.time_range` **and** `queries[].time_range`, plus legacy `since`/`until`/`granularity_sqla` | ([parallel-coords-yaml], [query-object-py]) |

The single canonical statement of the redundancy is Superset's own SIP-147 ([sip-147]):

> "in order for a dashboard to load a given chart it needs to perform a `POST` request to the chart API, submitting a request payload that includes the `query` and `form_data` needed by the endpoint. **This data is redundant**, since it's already available to the backend … and attached to the chart ID (which is also passed in the request)."

and it lists the consequences: extra latency, *"it opens an attack vector where users can modify the form data in order to fetch unauthorized data — for example, in an embedded dashboard. While this should never be possible by design, **there were multiple CVE reports exploiting this channel**"*, and un-cacheable `POST`s ([sip-147]). SIP-147 proposed `GET /api/v1/dashboard/{id}/chart/{id}/data` behind a `DASHBOARD_SIMPLE_CHART_API` feature flag. **That flag is not in `DEFAULT_FEATURE_FLAGS` in 6.1.0** — I read `superset/config.py` at the tag and it is absent ([config-py]). The issue is closed; whether it was implemented under another name is UNVERIFIED.

`query_context` is also *optional and lazily regenerated*: `ChartUpdateCommand` has a dedicated bypass so a background worker can write it without owning the chart ([chart-update-py], verbatim):

```python
def is_query_context_update(properties: dict[str, Any]) -> bool:
    return set(properties) == {"query_context", "query_context_generation"} and bool(
        properties.get("query_context_generation")
    )
```

with the comment *"Check and update ownership; when only updating query context we ignore ownership so the update can be performed by report workers"* ([chart-update-py]). The API field is documented as *"The query context generation represents whether the query_context is user generated or not so that it does not update user modified state."* ([schemas-py] L111–115).

### 3. Field roles: metrics, groupby, columns, adhoc metrics/filters, "wells"

**There is no well/shelf concept in the persisted data.** `params` is a flat `{controlName: value}` map. The control name *is* the shelf, and the set of shelves for a chart type exists only as frontend code in that plugin's `controlPanel` config ([controls-types-ts], [pie-controlpanel-tsx]).

Consequences, all sourced:

- **Role is recovered by aliasing, not by structure.** `QueryFieldAliases` is documented as *"Map of arbitrary control field names to query field names (one of 'metrics' | 'columns' | 'groupby'). Note that `groupby` is only added here because it will be handled when processing aliases but will not be sent to final objects."* ([queryformdata-ts]). The default alias table, verbatim ([query-functions-py] L587–597; a Python port of the TS original):

```python
query_field_aliases = {
    "metric": "metrics", "metric_2": "metrics", "secondary_metric": "metrics",
    "x": "metrics", "y": "metrics", "size": "metrics",
    "all_columns": "columns", "series": "groupby", "order_by_cols": "orderby",
}
```

  and then `groupby` is normalised to `columns`, with `query_mode == "raw"` dropping `groupby`/`metrics` and `query_mode == "aggregate"` dropping `columns` ([query-functions-py] L550–571).
- **Older saved charts carry the alias map inline.** Shipped examples contain a literal `queryFields` block inside `params` ([vgs-yaml]):

```yaml
  queryFields:
    columns: groupby
    groupby: groupby
    metrics: metrics
```

  i.e. the role mapping was, for a period, serialized into the chart document itself.
- **Saved metric = bare string. Adhoc metric = object.** `QueryFormMetric = SavedMetric | AdhocMetric`, `QueryFormColumn = PhysicalColumn | AdhocColumn` ([queryformdata-ts]). Bare strings in practice: `metrics: [sum__SP_POP_TOTL, …]` ([parallel-coords-yaml]). An adhoc metric, verbatim from a shipped chart ([vgs-yaml]):

```yaml
  metrics:
  - aggregate: SUM
    column:
      column_name: na_sales
      description: null
      expression: null
      filterable: true
      groupby: true
      id: 883
      is_dttm: false
      optionName: _col_NA_Sales
      python_date_format: null
      type: DOUBLE PRECISION
      verbose_name: null
    expressionType: SIMPLE
    hasCustomLabel: true
    isNew: false
    label: North America
    optionName: metric_3pl6jwmyd72_p9o4j2xxgyp
    sqlExpression: null
```

  Note the **entire dataset column definition, including its numeric `id: 883`, is copied into the chart**. `ChartDataAdhocMetricSchema` validates `expressionType ∈ {SIMPLE, SQL}` and `aggregate ∈ {AVG, COUNT, COUNT_DISTINCT, MAX, MIN, SUM}`, plus `column`, `sqlExpression`, `label`, `hasCustomLabel`, `optionName` (*"Unique identifier. Can be any string value, as long as all metrics have a unique identifier. If undefined, a random name will be generated."*), `timeGrain`, `isExtra` ([schemas-py] L357–417).
- **Adhoc filters have two shapes.** In `form_data`: `{clause: "WHERE", subject, operator, comparator, expressionType: "SIMPLE"|"SQL", sqlExpression?}` ([migrate-viz-base-py] `_migrate_temporal_filter`, and the real payload in [sip-147]). In the query object: `ChartDataFilterSchema` = `{col (raw: string or adhoc-column object), op (one of `FilterOperator`), val (raw), grain?, isExtra?}` ([schemas-py] L941–976).
- **Cross-viz-type role portability is a hand-maintained list.** `standardizedFormData.ts` exists purely so switching viz type keeps the user's selections ([standardized-formdata-ts]):

```js
export const sharedMetricsKey = ['metric','metrics','metric_2','size','x','y','secondary_metric'];
export const sharedColumnsKey = ['groupby','columns','groupbyColumns','groupbyRows','entity','series','series_columns'];
export const publicControls = ['granularity_sqla','time_grain_sqla','time_range','adhoc_filters','limit',
  'timeseries_limit_metric','series_limit_metric','order_desc','row_limit','x_axis','rolling_type',
  'rolling_periods','min_periods','time_compare','comparison_type','resample_rule','resample_method','dashboardId'];
```

  That list is the price of not naming roles in the data model. wechart's `RenderSpec.encoding` (`category`/`series`/`values`) already does name roles; Superset's `params` does not.

### 4. Chart-type-specific options without a union type

**Method: the schema is deliberately open. `params` is `dict[str, Any]` and is never schema-checked.**

- Type side: `BaseFormData extends TimeRange, FormDataResidual` where `FormDataResidual` is `{ [key: string]: any }`, with the comment *"Type signature for formData shared by all viz types. It will be gradually filled out as we build out the query object"* ([queryformdata-ts]). So there is no union of per-viz option types — there is one open interface.
- API side, `ChartPostSchema` ([schemas-py]):

```python
params = fields.String(
    metadata={"description": params_description},
    allow_none=True,
    validate=utils.validate_json,
)
```

  `validate_json` checks **JSON syntax only**; the contents are not schema-checked. `params_description` is *"Parameters are generated dynamically when clicking the save or overwrite button in the explore view. This JSON object for power users who may want to alter specific parameters."* ([schemas-py] L101–105). `viz_type` is `fields.String(validate=Length(0, 250))` — **any string of ≤250 chars is accepted**, including a viz type no plugin implements.
- Import side is the same: `ImportV1ChartSchema.params = fields.Dict()`, no value schema ([schemas-py] L1613–1627).
- Even inside the *validated* half, the escape hatch is explicit: `ChartDataQueryContextSchema.form_data = fields.Raw(allow_none=True, required=False)` ([schemas-py] L1425). The query object has `class Meta: unknown = EXCLUDE` — unknown keys are silently dropped, not rejected ([schemas-py] L1167–1169).

**Where per-viz-type validation actually lives: the frontend control panel, at edit time only.**

- Each plugin ships a `controlPanel` config of `controlPanelSections` → `ControlSetRow[]` → `ControlSetItem`s, optionally with `controlOverrides`, `sectionOverrides`, `onInit`, `formDataOverrides` ([controls-types-ts]). Pie's, for example, defines Query-section controls `groupby`, `metric`, `adhoc_filters`, `row_limit` (`default: 100`), `sort_by_metric`, and Customize-section controls `color_scheme`, `show_labels_threshold` (5), `threshold_for_other` (0), `roseType`, `label_type`, `number_format`, `date_format` (`'smart_date'`), `show_labels`, `labels_outside`, `label_line`, `show_total`, `outerRadius`, `donut`, `innerRadius`, most with `renderTrigger: true` ([pie-controlpanel-tsx]).
- Validation runs per control, per viz type: `getAllControlsState` walks the control panel config **for a given `vizType`**, and `execControlValidator` calls `validator.call(control, control.value, processedState)` for each entry in `control.validators`, collecting `validationErrors` and merging `externalValidationErrors` ([getcontrolstate-ts]).
- `renderTrigger: true` marks a control that re-renders without re-querying ([pie-controlpanel-tsx], [controls-types-ts]) — that is Superset's only structural distinction between "query option" and "display option", and it is in code, not in the saved data.

**Net effect: a chart saved with nonsense options is accepted by the API and only fails (or silently ignores the key) at render time.**

### 5. Versioning and migration of saved chart definitions

**Mechanism name: `MigrateViz` — imperative Alembic data migrations that rewrite every matching row's `params` and `query_context` in place.** There is no version number inside `params`; `slices` has no schema-version column ([slice-py]).

`superset/migrations/shared/migrate_viz/base.py` ([migrate-viz-base-py]). Class attributes, verbatim:

```python
    remove_keys: set[str] = set()
    rename_keys: dict[str, str] = {}
    source_viz_type: str
    target_viz_type: str
    has_x_axis_control: bool = False
```

Module constants:

```python
FORM_DATA_BAK_FIELD_NAME = "form_data_bak"
QUERIES_BAK_FIELD_NAME = "queries_bak"
```

`upgrade`, verbatim:

```python
        slices = session.query(Slice).filter(Slice.viz_type == cls.source_viz_type)
        for slc in paginated_update(
            slices,
            lambda current, total: logger.info("Upgraded %s/%s charts", current, total),
        ):
            cls.upgrade_slice(slc)
```

`upgrade_slice`, verbatim — the important part is that it writes a rollback copy **into the chart document itself**:

```python
    @classmethod
    def upgrade_slice(cls, slc: Slice) -> None:
        try:
            clz = cls(slc.params)
            form_data_bak = copy.deepcopy(clz.data)

            clz._pre_action()
            clz._migrate()
            clz._post_action()

            # viz_type depends on the migration and should be set after its execution
            # because a source viz can be mapped to different target viz types
            slc.viz_type = clz.target_viz_type

            backup: Any | dict[str, Any] = {FORM_DATA_BAK_FIELD_NAME: form_data_bak}

            query_context = try_load_json(slc.query_context)
            queries_bak = None

            if query_context:
                if "form_data" in query_context:
                    query_context["form_data"] = clz.data

                queries_bak = copy.deepcopy(query_context["queries"])

                queries = clz._build_query()["queries"]
                query_context["queries"] = queries
            else:
                query_context = clz._build_query()

            slc.query_context = json.dumps(query_context)
            backup[QUERIES_BAK_FIELD_NAME] = queries_bak
            slc.params = json.dumps({**clz.data, **backup})

        except Exception as e:
            logger.warning("Failed to migrate slice %s: %s", slc.id, e)
```

Four things follow, each load-bearing for wechart:

1. **Rollback state is stored in the document.** `params.form_data_bak` and `params.queries_bak` are the entire pre-migration form data and queries. `downgrade_slice` finds charts by `Slice.params.like(f"%{FORM_DATA_BAK_FIELD_NAME}%")` and restores from them ([migrate-viz-base-py]). Migrated charts therefore carry ~2× their payload indefinitely.
2. **Migration failures are swallowed per row** (`logger.warning("Failed to migrate slice %s: %s", …)`), so a migration can leave a mixed-format table with no error surfaced.
3. **`_migrate` is a key rename/remove pass plus a temporal-filter rewrite** ([migrate-viz-base-py]): apply `rename_keys`, drop `remove_keys`, set `viz_type`, then `_migrate_temporal_filter` pops `granularity_sqla` and `time_range` and appends an adhoc filter `{"clause": "WHERE", "subject": granularity_sqla, "operator": "TEMPORAL_RANGE", "comparator": time_range, "expressionType": "SIMPLE"}` (with an SQL-expression branch when the granularity is itself an adhoc column).
4. **The query has to be regenerated in Python.** `_build_query()` is a stub in the base class and is implemented per migration in `processors.py`, e.g. ([processors-py] L64–75):

```python
    def _build_query(self) -> dict[str, Any]:
        metric = self.data.get("metric")
        sort_by_metric = self.data.get("sort_by_metric")

        def process(base_query_object: dict[str, Any]) -> list[dict[str, Any]]:
            new_query_object = base_query_object.copy()
            if sort_by_metric:
                new_query_object["orderby"] = [[metric, False]]
            return [new_query_object]

        return build_query_context(self.data, process)
```

The concrete migrations in `processors.py`, with their key maps ([processors-py]): `treemap→treemap_v2` (rename `order_desc→sort_by_metric`, remove `metrics`); `pivot_table→pivot_table_v2` (`columns→groupbyColumns`, `groupby→groupbyRows`, `row_limit→series_limit`, `pandas_aggfunc→aggregateFunction`, …); `dual_line→mixed_timeseries`; `sunburst→sunburst_v2` (`groupby→columns`); a shared `TimeseriesChart` base (`bottom_margin→x_axis_title_margin`, `x_axis_label→x_axis_title`, `x_ticks_layout→xAxisLabelRotation`, `y_log_scale→logAxis`, removing `contribution`, `line_interpolation`, `reduce_x_ticks`, `show_brush`, `show_markers`) with subclasses `line→echarts_timeseries_line`, `area→echarts_area`, `bar`/`dist_bar→echarts_timeseries_bar`; `bubble→bubble_v2`; `heatmap→heatmap_v2` (`all_columns_x→x_axis`, `all_columns_y→groupby`, `y_axis_bounds→value_bounds`); `histogram→histogram_v2`; `sankey→sankey_v2`.

**Format changes without a migration also happen.** `UPDATING.md` 6.0.0 Breaking Changes lists PR 33116: *"In Echarts Series charts (e.g. Line, Area, Bar, etc.) charts, the `x_axis_sort_series` and `x_axis_sort_series_ascending` form data items have been renamed with `x_axis_sort` and `x_axis_sort_asc`."* ([updating-md]). Whether that shipped an accompanying data migration is UNVERIFIED — I did not locate a revision file for it.

Only the **import/export envelope** is versioned: `EXPORT_VERSION = "1.0.0"` ([dict-import-export-py]), written as `version:` into every chart YAML and into `metadata.yaml` ([chart-export-py], [export-models-py]).

### 6. Does the saved definition name a renderer or an abstract chart type?

**Neither cleanly. `viz_type` is a plugin registration key, and many of the keys name the renderer.**

The contract is stated in the type definition ([queryformdata-ts], comment on `viz_type`):

> "visualization type — necessary if you use the plugin and want to use buildQuery function from the plugin. **This must match the key used when registering the plugin.** — not necessary if you do not plan to use the buildQuery function from the plugin. Can put "custom" (or any string) in this field in that case."

**Resolution path.** `ChartPlugin.register()` writes the key into five registries ([chartplugin-ts]):

| Registry | Value |
| --- | --- |
| `ChartMetadataRegistry` | `ChartMetadata` |
| `ChartComponentRegistry` | React component loader |
| `ChartControlPanelRegistry` | `controlPanel` config |
| `ChartTransformPropsRegistry` | `transformProps` loader |
| `ChartBuildQueryRegistry` | `buildQuery` loader (if provided) |

Then at render: `const vizType = currentFormData.viz_type || this.props.vizType;` → `<SuperChart chartType={vizType} formData={currentFormData} queriesData={…} …/>` ([chartrenderer-tsx]) → `SuperChartCore` with `chartType: string` doing ([superchartcore-tsx]):

```ts
const Renderer = createLoadableRenderer({
  loader: {
    Chart: () => getChartComponentRegistry().getAsPromise(chartType),
    transformProps: overrideTransformProps
      ? () => Promise.resolve(overrideTransformProps)
      : () => getChartTransformPropsRegistry().getAsPromise(chartType),
  },
  ...
});
```

And at query time ([exploreutils-ts], `buildV1ChartDataPayload`):

```ts
  const registryResult = formData.viz_type
    ? getChartBuildQueryRegistry().get(formData.viz_type)
    : undefined;
  const buildQuery = (registryResult ? await registryResult : undefined) ?? defaultBuildQuery;
```

**Keys are bound in one file**, `MainPreset.ts`, e.g. `new EchartsPieChartPlugin().configure({ key: VizType.Pie })` ([mainpreset-ts]). The `VizType` enum values ([viztype-ts]) show the leakage plainly:

`Area = 'echarts_area'`, `Bar = 'echarts_timeseries_bar'`, `Line = 'echarts_timeseries_line'`, `Scatter = 'echarts_timeseries_scatter'`, `SmoothLine = 'echarts_timeseries_smooth'`, `Step = 'echarts_timeseries_step'`, `Timeseries = 'echarts_timeseries'`, `MixedTimeseries = 'mixed_timeseries'`, `TableAgGrid = 'ag-grid-table'`, `Table = 'table'`, `Pie = 'pie'`, `Heatmap = 'heatmap_v2'`, `Treemap = 'treemap_v2'`, `PivotTable = 'pivot_table_v2'`, `Sunburst = 'sunburst_v2'`, `Bubble = 'bubble_v2'`, `LegacyBubble = 'bubble'`, `Histogram = 'histogram_v2'`, `Sankey = 'sankey_v2'`, `ParallelCoordinates = 'para'`, `BigNumber = 'big_number'`, `BigNumberPeriodOverPeriod = 'pop_kpi'`, `Gantt = 'gantt_chart'`, `Gauge = 'gauge_chart'`, `Graph = 'graph_chart'`, `Tree = 'tree_chart'`, `Calendar = 'cal_heatmap'`, `Handlebars = 'handlebars'`, `Cartodiagram = 'cartodiagram'`, and others.

So the persisted `viz_type` encodes (a) the rendering library (`echarts_*`, `ag-grid-table`), (b) a migration generation (`_v2`, `treemap_v2`), and (c) a legacy/new split (`bubble` vs `bubble_v2`). A wechart `chartType` of `'bar'` is strictly more abstract than `'echarts_timeseries_bar'`.

There is also still a **server-side** legacy registry: `slice.py` imports `from superset.viz import BaseViz, viz_types` and `Slice.viz` does `viz_class = viz_types.get(self.viz_type)` ([slice-py]). Which viz types remain implemented there in 6.1.0 is UNVERIFIED.

`ChartMetadata` (the registry value) carries `name, description, thumbnail, thumbnailDark, credits, category, tags, behaviors, datasourceCount, queryObjectCount, dynamicQueryObjectCount, supportedAnnotationTypes, canBeAnnotationTypes, enableNoResults, exampleGallery, deprecated, label, labelExplanation, parseMethod, suppressContextMenu, useLegacyApi` ([chartmetadata-ts]) — all presentation/capability metadata, none of it persisted per chart.

### 7. The import/export YAML bundle

**Layout.** `ExportModelsCommand` yields `metadata.yaml` first, then one file per model ([export-models-py]):

```yaml
version: <EXPORT_VERSION>     # "1.0.0"
type: Slice                   # self.dao.model_cls.__name__
timestamp: <UTC ISO 8601>
```

Chart files go to `charts/{get_filename(slice_name, id)}.yaml`, and the command recursively yields the dataset (and thence the database) and, behind the `TAGGING_SYSTEM` flag, tags ([chart-export-py], verbatim):

```python
REMOVE_KEYS = ["datasource_type", "datasource_name", "url_params"]

class ExportChartsCommand(ExportModelsCommand):
    @staticmethod
    def _file_name(model: Slice) -> str:
        file_name = get_filename(model.slice_name, model.id)
        return f"charts/{file_name}.yaml"

    @staticmethod
    def _file_content(model: Slice) -> str:
        payload = model.export_to_dict(recursive=False, include_parent_ref=False,
                                       include_defaults=True, export_uuids=True)
        payload = {k: v for k, v in payload.items() if k not in REMOVE_KEYS}
        if payload.get("params"):
            try:
                payload["params"] = json.loads(payload["params"])
            except json.JSONDecodeError:
                logger.info("Unable to decode `params` field: %s", payload["params"])
        payload["version"] = EXPORT_VERSION
        if model.table:
            payload["dataset_uuid"] = str(model.table.uuid)
        ...
        return yaml.safe_dump(payload, sort_keys=False)
```

The base field list is `Slice.export_fields = ["slice_name", "description", "certified_by", "certification_details", "datasource_type", "datasource_name", "viz_type", "params", "query_context", "cache_timeout"]`, plus `extra_import_fields = ["is_managed_externally", "external_url"]` ([slice-py]).

So the bundle is:

```
metadata.yaml
charts/<Slice_Name>_<id>.yaml
datasets/<database>/<dataset>.yaml
databases/<database>.yaml
```

(chart → dataset → database chaining from `ExportChartsCommand._export` calling `ExportDatasetsCommand` ([chart-export-py]); the import side declares the same prefixes — `ImportChartsCommand.prefix = "charts/"` with `schemas = {"charts/": ImportV1ChartSchema(), "datasets/": ImportV1DatasetSchema(), "databases/": ImportV1DatabaseSchema()}` ([chart-importer-py]). The exact `datasets/`/`databases/` filename templates are UNVERIFIED — I did not read `superset/commands/dataset/export.py`.)

Note the asymmetry: `params` is a **JSON string** in the DB and in the API, but a **nested YAML mapping** in the bundle ([chart-export-py], `ImportV1ChartSchema.params = fields.Dict()` at [schemas-py] L1619), while `query_context` stays a JSON *string* even inside the YAML (`query_context = fields.String(allow_none=True, validate=utils.validate_json)`, [schemas-py] L1620; visible as an embedded one-line JSON string in [importexport-fixture]).

**Is it a stable public contract?**

- For: it is versioned (`version: 1.0.0`, required on every chart file, [schemas-py] L1623), it is keyed on UUIDs rather than ids, the admin docs say *"UUIDs remain stable across import/export cycles and can be used for cross-environment workflows"* ([admin-docs-importexport]), and the endpoint is a documented public API ([charts-api-py]).
- Against: `params` inside it is `fields.Dict()` with no value schema, so the envelope is versioned but **the payload is not**; the importer has hardcoded content knowledge (it skips obsolete `filter_box` charts, [chart-importer-py]); `EXPORT_VERSION` has stayed `"1.0.0"` across the `viz_type` renames of §5, so the version number does not distinguish `treemap` from `treemap_v2` payloads; and `_file_content` carries `# TODO (betodealmeida): move this logic to export_to_dict once this becomes the default export endpoint` ([chart-export-py]).
- An explicit written stability guarantee: **not found** (UNVERIFIED). The admin docs page covers CLI datasource import/export and `SECRET_KEY` re-encryption but makes no compatibility promise about the chart YAML body ([admin-docs-importexport]).

### 8. Publicly documented pain points with the `form_data` approach

All of these are from Superset's own issues, PRs, source comments, or release notes.

1. **The derivation lives only in the frontend, so the backend cannot recompute the query.** Issue #33152, *"Viz migrations are not migrating the query object"* (opened 2025-04-16, closed): *"Viz migrations only migrate the form_data and not the query object. This is problematic as backend processes such as cache warmup or alerts & reports use the saved query object to generate the queries."* ([issue-33152])

2. **The fix was to re-implement the TypeScript query builder in Python.** PR #33285 (merged 2025-05-26): *"To streamline the generation of query objects, we have implemented the `_build_query()` method in `processors.py` … This method effectively translates the TypeScript logic from `buildQuery.ts` into Python. Additionally, auxiliary functions originally found in `buildQuery.ts` have been translated and placed into a new Python file called `query_functions.py`. For testing the migration process, a script was developed to compare query objects generated by TypeScript with those produced by Python. This script was validated against over 50,000 charts across all legacy types and achieved an accuracy rate of 100%."* ([pr-33285]). `query_functions.py` is 49,231 bytes and defines ~50 functions ([query-functions-py]); it contains comments such as *"This is equivalent to checking that x is neither null nor undefined in TypeScript"* and *"Mimics the behavior of the TypeScript function"*.

3. **A maintainer's own assessment of the design.** mistercrunch on #33285 ([pr-33285-comments], 2025-05-14): *"clearly the issue here is that the `form_data` -> `query_context`, while it's deterministic, the logic lives only in the frontend, meaning there's some clear issues around backend database migrations … forcing some reimplementation of logic in the backend as part of migrations … that's pretty rough, I think that's the general idea for this PR. **This is fairly brittle and hard to test. How do we know that the logic is sound/perfect?**"* He itemises the alternatives considered: sandboxing JS in Python, invalidating `query_context` and regenerating it with a headless browser via a `/api/v1/headless/regenerate_query_context` endpoint, or flagging Alerts & Reports as disabled with a "re-enable" button.

4. **`query_context` was never schema'd or versioned, so identical chart types have divergent stored queries.** michael-s-molina on the same PR ([pr-33285-comments], 2025-05-15): *"we also noticed that **the query_context evolved over the years without schemas and versioning, which resulted in many versions of the query_context for the same chart type**. In other words, an ECharts Line chart created some time ago does not have the same schema as one created recently. One of the objectives of this PR is to also align these schemas for the migrated charts."*

5. **The stated direction is to delete `query_context`.** Same comment thread ([pr-33285-comments]): *"This work is to unblock 5.0 but **the plan is to actually get rid of the query_context** when working on chart visualizations in the Extensions project."* betodealmeida in the same thread: *"I started working on a node.js service that converts the form data to the query object using the viz logic."* Whether either has landed by 6.1.0 is UNVERIFIED; `query_context` is still a column in 6.1.0 ([slice-py]).

6. **Round-tripping `form_data` through the browser is a security channel.** SIP-147 ([sip-147]): *"it opens an attack vector where users can modify the form data in order to fetch unauthorized data — for example, in an embedded dashboard. While this should never be possible by design, there were multiple CVE reports exploiting this channel."*

7. **Payload size.** SIP-147 measures *"a latency of ~400ms for larger dashboards"* from having to fetch every chart's full definition before querying, and notes the `POST` shape defeats reverse-proxy and browser caching ([sip-147]). The example payload in the SIP is ~90 lines for a single pie chart, of which the `form_data` half is entirely a copy of stored state.

8. **Unstructured options make chart-type switching a hand-maintained key list** — `sharedMetricsKey`, `sharedColumnsKey`, `publicControls` in `standardizedFormData.ts` ([standardized-formdata-ts]).

9. **Deprecation is expressed inside the query object rather than by a version bump.** `ChartDataQueryObjectSchema` carries live-but-deprecated fields with deprecation notices in their descriptions: `granularity_sqla` (*"This field is deprecated, use `granularity` instead"*), `groupby` (*"This field is deprecated, use `columns` instead"*), `timeseries_limit` (*"use `series_limit` instead"*), `timeseries_limit_metric` (*"use `series_limit_metric` instead"*) ([schemas-py] L1199–1307, [queryformdata-ts]). Old charts keep writing the old keys forever.

10. **Migration backups bloat the document permanently** — `params.form_data_bak` + `params.queries_bak`, with no cleanup path in `base.py` ([migrate-viz-base-py]).

11. **Silent failure modes.** Malformed `params` → logged and swallowed, chart degrades to four keys ([slice-py]); failed migration → `logger.warning` per row ([migrate-viz-base-py]); unknown query-object keys → `unknown = EXCLUDE` ([schemas-py] L1167).

## Gotchas

Version-specific and design-specific pitfalls relevant to a wechart decision:

- **`viz_type` is duplicated between the column and `params.viz_type`, and the column wins** at read time ([slice-py]). Every shipped example carries both ([parallel-coords-yaml], [vgs-yaml]).
- **The dataset id is embedded in the document** (`params.datasource: "21__table"`, and adhoc metrics embed `column.id: 883`, [vgs-yaml]). Export therefore has to add `dataset_uuid` and import has to rewrite `datasource` ([chart-export-py], [chart-importer-py]). If wechart embeds Cube member names rather than ids this problem does not arise — but any embedded id or numeric key will reproduce it.
- **`REMOVE_KEYS` on export filters only the top-level payload**, not inside `params` ([chart-export-py]). Shipped example charts still carry `params.url_params.preselect_filters: '{"1389": {...}}'` — a dashboard id from another installation, frozen into the chart document ([vgs-yaml], [games-per-genre-yaml]).
- **`row_limit: null`** appears in shipped examples ([vgs-yaml]) — the flat map has no way to say "unset" vs "explicitly unlimited" distinctly from a missing key.
- **Presentation state is stored per chart with no sharing mechanism**: `label_colors` in one example is a 50-entry colour map, most of whose keys belong to *other* charts' series ([vgs-yaml]). wechart's `RenderSpec.palette` being handed in from outside (per its own doc comment) is the opposite, and better-founded, choice.
- **`echarts_*` in the persisted `viz_type` couples saved data to the rendering library** ([viztype-ts]). CLAUDE.md requires wechart's saved chart definitions to be engine-neutral, so Superset's `viz_type` vocabulary must not be copied verbatim.
- **No `$schema`, no version, no `usermeta`-style extension slot in the chart body.** Compare Vega-Lite's `usermeta`, which is "completely ignored by Vega and Vega-Lite" (`/Users/srajagopal/Work/wechart/docs/research/vega-lite.md`, §A). Superset has no such reserved namespace — `form_data_bak` and `queries_bak` are ad-hoc reserved keys invented by the migration code ([migrate-viz-base-py]).
- **Security note:** `params` can carry executable strings. The deck.gl fixture stores `js_data_mutator`, `js_tooltip` and `js_onclick_href` as JavaScript source inside the chart document ([importexport-fixture]), and `adhoc_filters` can carry raw `sqlExpression` ([migrate-viz-base-py]). Any format that stores code strings makes a saved chart an execution vector; if wechart's persisted format ever grows a free-text expression field, it inherits this.
- **`ImportV1ChartSchema` requires `uuid`, `version`, `dataset_uuid`, `slice_name`, `viz_type`** ([schemas-py] L1613–1627) — a chart cannot be imported without a stable identity and a dataset reference.

## Alternatives considered

Not requested — no comparison was asked for. What follows is the mapping back to wechart's two shapes, as facts, with no recommendation.

| wechart | Superset analogue | Persisted? |
| --- | --- | --- |
| `ChartSpec` (wells) | `slices.params` / `form_data` — flat `{controlName: value}`, roles recovered by alias tables | **yes**, as opaque JSON text ([slice-py]) |
| (nothing) | `slices.query_context` — cached `{datasource, queries[], form_data, result_format, result_type}` | **yes**, optional, regenerable ([slice-py], [buildquerycontext-ts]) |
| `toCubeQuery(spec)` | `buildQuery` per plugin + `buildQueryContext` | no — code ([exploreutils-ts]) |
| `RenderSpec` (`encoding`, `rows`) | `ChartProps` (`formData`, `queriesData[]`, `datasource`, `width`, `height`, `hooks`, `theme`, `behaviors`, `ownState`, `filterState`, `legendState`, …) then per-plugin `transformProps` | **no** — computed at render ([chartprops-ts], [chartplugin-ts]) |
| `ChartType` union in the spec | `viz_type: String(250)`, validated only for length | **yes**, unvalidated ([schemas-py]) |
| `RenderSpec.palette` handed in | `params.label_colors` / `color_scheme` stored per chart | **yes** ([vgs-yaml]) |

Two observations that bear directly on the wechart decision, both sourced above:

1. Superset persists an *authoring* shape and derives the render shape every time. It persists the derived *query* only as a cache, and that cache is the source of its worst documented maintenance problems (§8.1–8.5).
2. Superset's authoring shape does not name field roles; wechart's `ChartSpec` (three named wells) and `RenderSpec.encoding` (`category`/`series`/`values`) both do. The documented cost Superset pays for not doing so is `extract_query_fields`' alias table ([query-functions-py] L587) plus `standardizedFormData.ts`' three hand-maintained key lists ([standardized-formdata-ts]).

## Open questions / unverified

- **UNVERIFIED:** the exact `datasets/` and `databases/` filename templates in the export bundle. I read `superset/commands/chart/export.py` and `superset/commands/export/models.py` but not `superset/commands/dataset/export.py` or `.../database/export.py`.
- **UNVERIFIED:** whether any written stability guarantee exists for the export YAML body. The admin docs page ([admin-docs-importexport]) covers CLI datasource import/export and `SECRET_KEY` handling only; the developer-docs API pages ([dev-docs-importexport]) render client-side and returned no schema text to WebFetch.
- **UNVERIFIED:** whether PR 33116's `x_axis_sort_series` → `x_axis_sort` rename (UPDATING.md 6.0.0, [updating-md]) shipped an accompanying Alembic data migration. I could not enumerate recent files in `superset/migrations/versions/` — the GitHub contents API does not paginate that directory and returned only the first ~86 entries (2015–2018).
- **UNVERIFIED:** which legacy viz types `superset/viz.py` still implements server-side in 6.1.0. `slice.py` imports `viz_types` from it ([slice-py]), but I did not read `viz.py`.
- **UNVERIFIED:** whether SIP-147's `DASHBOARD_SIMPLE_CHART_API` landed under another name. The flag is absent from `DEFAULT_FEATURE_FLAGS` in 6.1.0's `config.py` ([config-py]) and the issue is closed ([sip-147]).
- **UNVERIFIED:** whether the Extensions-project plan to "get rid of the query_context" ([pr-33285-comments]) has a public SIP. `slice.py` at 6.1.0 imports `from superset_core.common.models import Chart as CoreChart` ([slice-py]), which suggests the Extensions work is in progress, but I did not trace `superset_core`.
- **UNVERIFIED:** whether `GET /api/v1/chart/{pk}` and the export endpoint ever disagree on `params`; they use different schemas (`ChartGetResponseSchema.params = fields.String()` vs. the exporter's `json.loads`).
- **Method note:** several files were read through `cdn.jsdelivr.net/gh/apache/superset@6.1.0/...`, which serves the identical file at the tag. Where the fetch summariser could not be trusted to reproduce code exactly, the file was downloaded and grepped locally; every code block quoted above came from such a grep or from an explicit verbatim-output prompt.
- **Not read:** `superset/common/query_context_processor.py` (post-processing execution), `superset/charts/data/api.py` (the `/chart/data` endpoint body), `superset-frontend/packages/superset-ui-core/src/query/buildQueryObject.ts`, and the per-plugin `transformProps` implementations.
- **Note for the caller:** no AC or feature IDs were supplied, and this document cites none. If it is saved under `docs/research/`, the `packages:` list is intentionally empty — nothing here is importable, so the "code can't import a package until research covers it" gate is not affected by this file.

[pypi]: https://pypi.org/pypi/apache-superset/json
[gh-latest]: https://api.github.com/repos/apache/superset/releases/latest
[slice-py]: https://github.com/apache/superset/blob/6.1.0/superset/models/slice.py
[schemas-py]: https://github.com/apache/superset/blob/6.1.0/superset/charts/schemas.py
[charts-api-py]: https://github.com/apache/superset/blob/6.1.0/superset/charts/api.py
[query-context-py]: https://github.com/apache/superset/blob/6.1.0/superset/common/query_context.py
[query-object-py]: https://github.com/apache/superset/blob/6.1.0/superset/common/query_object.py
[chart-export-py]: https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/export.py
[chart-update-py]: https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/update.py
[chart-importer-py]: https://github.com/apache/superset/blob/6.1.0/superset/commands/chart/importers/v1/__init__.py
[export-models-py]: https://github.com/apache/superset/blob/6.1.0/superset/commands/export/models.py
[dict-import-export-py]: https://github.com/apache/superset/blob/6.1.0/superset/utils/dict_import_export.py
[config-py]: https://github.com/apache/superset/blob/6.1.0/superset/config.py
[migrate-viz-base-py]: https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/base.py
[processors-py]: https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/processors.py
[query-functions-py]: https://github.com/apache/superset/blob/6.1.0/superset/migrations/shared/migrate_viz/query_functions.py
[parallel-coords-yaml]: https://github.com/apache/superset/blob/6.1.0/superset/examples/misc_charts/charts/Parallel_Coordinates.yaml
[vgs-yaml]: https://github.com/apache/superset/blob/6.1.0/superset/examples/video_game_sales/charts/Total_Sales_per_Market_Grouped_by_Genre.yaml
[games-per-genre-yaml]: https://github.com/apache/superset/blob/6.1.0/superset/examples/video_game_sales/charts/Games_per_Genre.yaml
[weekly-messages-yaml]: https://github.com/apache/superset/blob/6.1.0/superset/examples/slack_dashboard/charts/Weekly_Messages.yaml
[importexport-fixture]: https://github.com/apache/superset/blob/6.1.0/tests/integration_tests/fixtures/importexport.py
[buildquerycontext-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/query/buildQueryContext.ts
[queryformdata-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/query/types/QueryFormData.ts
[chartplugin-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/models/ChartPlugin.ts
[chartmetadata-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/models/ChartMetadata.ts
[chartprops-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/models/ChartProps.ts
[superchartcore-tsx]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/components/SuperChartCore.tsx
[viztype-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts
[controls-types-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-chart-controls/src/types.ts
[pie-controlpanel-tsx]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/plugins/plugin-chart-echarts/src/Pie/controlPanel.tsx
[pie-index-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/plugins/plugin-chart-echarts/src/Pie/index.ts
[mainpreset-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/visualizations/presets/MainPreset.ts
[standardized-formdata-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/controlUtils/standardizedFormData.ts
[getcontrolstate-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/controlUtils/getControlState.ts
[exploreutils-ts]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/exploreUtils/index.ts
[chartrenderer-tsx]: https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/Chart/ChartRenderer.tsx
[updating-md]: https://github.com/apache/superset/blob/6.1.0/UPDATING.md
[issue-33152]: https://github.com/apache/superset/issues/33152
[pr-33285]: https://github.com/apache/superset/pull/33285
[pr-33285-comments]: https://github.com/apache/superset/pull/33285#issuecomment-list
[sip-147]: https://github.com/apache/superset/issues/30816
[admin-docs-importexport]: https://superset.apache.org/admin-docs/6.1.0/configuration/importing-exporting-datasources
[dev-docs-importexport]: https://superset.apache.org/developer-docs/6.1.0/api/import-export
