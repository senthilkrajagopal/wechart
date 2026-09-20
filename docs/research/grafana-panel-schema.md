---
library: Grafana dashboard and panel definition (reference research, not a dependency)
packages: []
version: 13.2.2
researched: 2026-09-20
sources:
  [
    https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/,
    https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/,
    https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/,
    https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-schema/src/raw/dashboard/x/types.gen.ts,
    https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/kinds/v2/dashboard_spec.cue,
    https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/features/dashboard/state/DashboardMigrator.ts,
    https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/README.md,
    https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/features/query/state/PanelQueryRunner.ts,
    https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides,
    https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/migration-handler-for-panels,
  ]
---

# Grafana 13.2.2 — how a panel and a dashboard are defined and serialized

## Summary

Grafana 13.2.2 is the latest release at the research date (tag `v13.2.2`, published 2026-09-15) ([rel]). This is reference research: wechart imports nothing from Grafana, so `packages:` is empty.

Why wechart is looking at it. `docs/spec.md` defines a **Chart spec** as "The saved, engine-neutral definition of a chart: source, metrics, dimensions, time, filters, type and options" (spec.md line 21), and AC-037 requires rendering every chart type "from a chart spec". The open question the caller posed — what is persisted, and what relation the saved shape has to the shape the renderer consumes — is exactly the question Grafana answers with `panels[].options` + `panels[].fieldConfig` + `panels[].transformations`. The ACs this touches: AC-037 (render from a chart spec), AC-038/AC-039 (legend and per-member colour), AC-040 (axis min/max/log/grid/tick/format/title), AC-044 (sort), AC-045 (trellis), AC-046 (member formatting everywhere), AC-047/AC-048 (quick calculations computed in Cube, not the browser), AC-065/AC-066 (what a save persists and what a discard restores).

The five findings that matter most for that decision:

1. **Grafana persists the authoring shape only.** A saved panel holds `type`, `targets` (queries), `options`, `fieldConfig` and `transformations` ([types-gen]). The thing the renderer actually consumes — `DataFrame[]` whose every field carries a resolved `field.config` — is computed at load time by `PanelQueryRunner.getData()` and is never saved ([pqr]). The single exception is a dashboard **snapshot**, which stores frozen result data (`Dashboard.snapshot`, and the `snapshotData` short-circuit in `getData`) ([types-gen], [pqr]).
2. **Per-field configuration is a separate, matcher-addressed layer** (`fieldConfig.defaults` + `fieldConfig.overrides[]`), applied after transformations and outside the panel plugin's own option object ([types-gen], [applyFieldOverrides], [pqr]).
3. **The dashboard schema does not describe panel content.** `options?: Record<string, unknown>` and `targets?: Array<Record<string, unknown>>` are untyped holes; their meaning comes from the panel plugin's own schema plus the stored `pluginVersion` ([types-gen]).
4. **`schemaVersion` is frozen.** `DASHBOARD_SCHEMA_VERSION = 42` carries the comment "Schema version 42 is the FINAL version for the v1 dashboard API. DO NOT increment this number or add new schema migrations." ([migrator]). New per-visualization evolution is pushed down into panel-plugin migration handlers.
5. **The replacement is shipped in-tree and in use**: `apiVersion: dashboard.grafana.app/v2`, `kind: Dashboard`, with `spec.elements` (a map of named `Panel` kinds) and a separate `spec.layout` ([v2-spec], [devenv-filter]). Grafana's own dev dashboards are stored in that format at v13.2.2 ([devenv-filter]). Thema and kindsys are gone from `go.mod`; codegen is CUE + `grafana-app-sdk v0.56.6` ([gomod]).

Docs citations below use the `latest` docs channel. Spot check: `https://grafana.com/docs/grafana/v13.2/panels-visualizations/configure-overrides/` loads with the identical opening paragraph, so `latest` maps to the 13.2 line at the research date ([overrides-docs], [overrides-docs-v132]).

## Install

Not applicable — nothing is installed. Everything below was read from the `v13.2.2` tag of `github.com/grafana/grafana` and from grafana.com docs. Grafana OSS is AGPL-3.0 ([repo-root] lists `LICENSE`; the exact licence text was not read — see Open questions).

## Init / auth pattern

Not applicable (no client library). The runtime facts that matter for reading Grafana JSON as reference material:

- The v1 dashboard JSON lives under the classic HTTP API; the current dashboard API is Kubernetes-style: create uses `metadata.name` as the identifier (or `metadata.generateName`), and the `uid` path parameter on update/delete refers to `metadata.name`, not the `metadata.uid` in responses ([http-api-dash]).
- Serving a v2-format body through a v1 endpoint fails with "dashboard appears to be in v2 format. Please use the /apis/dashboard.grafana.app/v2 API" ([issue-126641]).

## API surface we will use

### 1. The dashboard JSON schema: top-level shape, `schemaVersion`, and a complete panel

**Generated TypeScript for the v1 schema** is `packages/grafana-schema/src/raw/dashboard/x/types.gen.ts`, header "Code generated - EDITING IS FUTILE. DO NOT EDIT. … Generated by: kinds/gen.go … Run 'make gen-cue' from repository root to regenerate." ([types-gen]).

Top-level `Dashboard` fields, verbatim from [types-gen]: `annotations?: AnnotationContainer`, `description?`, `editable?`, `fiscalYearStartMonth?`, `gnetId?`, `graphTooltip?: DashboardCursorSync`, `id?: (number | null)`, `links?: DashboardLink[]`, `liveNow?`, `panels?: Array<(Panel | RowPanel)>`, `preload?`, `refresh?: string`, `revision?`, **`schemaVersion: number`** (the only required field besides none — everything else is optional), `snapshot?: {...}`, `tags?`, `templating?: { list?: VariableModel[] }`, `time?: {from, to}`, `timepicker?`, `timezone?`, `title?`, `uid?`, `version?`, `weekStart?`.

- `schemaVersion` doc comment: "Version of the JSON schema, incremented each time a Grafana update brings changes to said schema." ([types-gen]).
- `version` doc comment: "Version of the dashboard, incremented each time the dashboard is updated." ([types-gen]) — two different counters.
- `export const defaultDashboard: Partial<Dashboard> = { editable: true, fiscalYearStartMonth: 0, graphTooltip: DashboardCursorSync.Off, links: [], panels: [], schemaVersion: 42, tags: [], timezone: 'browser' }` ([types-gen]).
- The docs page repeats the same field list and adds that `gridPos.w` is 1–24 ("dashboard width divided into 24 columns") and each `h` unit is 30 pixels ([json-model-docs]).

**`Panel`, verbatim** ([types-gen]):

```ts
export interface Panel {
  autoMigrateFrom?: string;
  cacheTimeout?: string;
  datasource?: DataSourceRef;
  description?: string;
  fieldConfig?: FieldConfigSource;
  gridPos?: GridPos;
  hideTimeOverride?: boolean;
  id?: number;
  interval?: string;
  libraryPanel?: LibraryPanelRef;
  links?: Array<DashboardLink>;
  maxDataPoints?: number;
  maxPerRow?: number;
  options?: Record<string, unknown>;
  pluginVersion?: string;
  queryCachingTTL?: number;
  repeat?: string;
  repeatDirection?: ('h' | 'v');
  targets?: Array<Record<string, unknown>>;
  timeCompare?: string;
  timeFrom?: string;
  timeShift?: string;
  title?: string;
  transformations?: Array<DataTransformerConfig>;
  transparent?: boolean;
  type: string;
}
```

`type` is the only required field: "The panel plugin type id. This is used to find the plugin to display the panel." ([types-gen]).

Doc comments that decide the split ([types-gen]):

- `options` — "It depends on the panel plugin. They are specified by the Options field in panel plugin schemas."
- `fieldConfig` — "Field options allow you to change how the data is displayed in your visualizations."
- `targets` — "Depends on the panel plugin. See the plugin documentation for details."
- `transformations` — "List of transformations that are applied to the panel data before rendering. When there are multiple transformations, Grafana applies them in the order they are listed. Each transformation creates a result set that then passes on to the next transformation in the processing pipeline."
- `pluginVersion` — "The version of the plugin that is used for this panel. This is used to find the plugin to display the panel and to migrate old panel configs."
- `repeat` — "Name of template variable to repeat for." (with `repeatDirection: 'h' | 'v'` and `maxPerRow`) — this is Grafana's trellis analogue (relevant to AC-045).
- `libraryPanel?: LibraryPanelRef` = `{name, uid}`: "A library panel is a reusable panel that you can use in any dashboard. When you make a change to a library panel, that change propagates to all instances of where the panel is used."

`GridPos` is `{h, w, x, y, static?}`, with `static?` documented as "Whether the panel is fixed within the grid. If true, the panel will not be affected by other panels' interactions" ([types-gen]). `RowPanel` is a distinct shape: `{collapsed: boolean, datasource?, gridPos?, id: number, panels: Array<Panel>, repeat?, title?, type: 'row'}` — collapsed rows nest their children inside `panels`, expanded rows leave them as siblings in the top-level array ([types-gen], and the nesting is visible in [v42-testdata]).

**A real, complete panel** — first panel of `panel-common/color_modes.json` (a real dev dashboard kept as the v1 fixture for backend migration tests; dashboard `schemaVersion: 26`, `uid: inxsweKGz`, `version: 17`, title "Gradient Color modes") ([v1-color-modes]):

```json
{
  "datasource": { "type": "grafana-testdata-datasource" },
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "continuous-BlYlRd" },
      "custom": { "align": "center", "displayMode": "color-background", "filterable": false },
      "mappings": [],
      "thresholds": {
        "mode": "percentage",
        "steps": [
          { "color": "green", "value": null },
          { "color": "blue", "value": 20 },
          { "color": "orange", "value": 60 },
          { "color": "red", "value": 70 }
        ]
      },
      "unit": "degree"
    },
    "overrides": [
      { "matcher": { "id": "byName", "options": "Field" },
        "properties": [ { "id": "custom.displayMode" } ] }
    ]
  },
  "gridPos": { "h": 16, "w": 19, "x": 0, "y": 0 },
  "id": 4,
  "options": { "showHeader": true, "sortBy": [ { "desc": true, "displayName": "Last" } ] },
  "pluginVersion": "7.4.0-pre",
  "targets": [ { "refId": "A", "scenarioId": "random_walk", "seriesCount": 15, "alias": "", "stringInput": "", "lines": 10, "points": [],
                 "csvWave": { "timeStep": 60, "valuesCSV": "0,0,2,2,1,1" },
                 "pulseWave": { "offCount": 3, "offValue": 1, "onCount": 3, "onValue": 2, "timeStep": 60 },
                 "stream": { "bands": 1, "noise": 2.2, "speed": 250, "spread": 3.5, "type": "signal" } } ],
  "timeFrom": null,
  "timeShift": null,
  "title": "Gradient color schemes",
  "transformations": [
    { "id": "reduce", "options": { "reducers": ["max", "mean", "last", "min"] } },
    { "id": "organize", "options": { "excludeByName": { "Field": false }, "indexByName": {}, "renameByName": {} } }
  ],
  "type": "table"
}
```

Four things to read off it: (a) `targets[0]` is entirely datasource-plugin-shaped — `scenarioId`, `csvWave`, `pulseWave` mean nothing to the dashboard schema; (b) `options` is table-plugin-shaped; (c) the same panel's *per-column* styling lives in `fieldConfig.defaults.custom`, not in `options`; (d) an override property may carry **no `value`** (`{"id": "custom.displayMode"}`), which is how "unset this for these fields" is expressed — `DynamicConfigValue.value` is optional ([fieldOverrides-ts]).

A smaller real v1 dashboard with a full top-level envelope (`annotations.list`, `editable`, `fiscalYearStartMonth`, `graphTooltip`, `id`, `links`, `liveNow`, `panels`, `schemaVersion: 36`, `tags`, `templating.list`, `time`, `timepicker.refresh_intervals`, `timezone`, `title`, `uid`, `version`, `weekStart`) is `v1_dev_dashboards/home.json` ([home-json]).

### 2. The `fieldConfig` defaults/overrides model

**Serialized shape** ([types-gen]):

```ts
export interface FieldConfigSource {
  defaults: FieldConfig;                       // "Defaults are the options applied to all fields."
  overrides: Array<{                           // "Overrides are the options applied to specific fields overriding the defaults."
    matcher: MatcherConfig;
    properties: Array<{ id: string; value?: unknown }>;
  }>;
}
export interface MatcherConfig {
  id: string;      // "The matcher id. This is used to find the matcher implementation from registry."
  options?: unknown; // "The matcher options. This is specific to the matcher implementation."
  scope?: MatcherScope;
}
```

The runtime types in `@grafana/data` name the same rows: `ConfigOverrideRule = { matcher: MatcherConfig; properties: DynamicConfigValue[] }` and `DynamicConfigValue = { id: string; value?: any }` ([fieldOverrides-ts]).

**Standard (schema-known) per-field properties** ([types-gen]): `actions?`, `color?: FieldColor`, `custom?: Record<string, unknown>`, `decimals?`, `description?`, `displayName?`, `displayNameFromDS?`, `filterable?`, `links?`, `mappings?: ValueMapping[]`, `max?`, `min?`, `noValue?`, `path?`, `thresholds?: ThresholdsConfig`, `unit?`, `writeable?`. The editor-side registry enumerates them as `FieldConfigProperty = { Unit, Min, Max, FieldMinMax, Decimals, DisplayName, NoValue, Thresholds, Mappings, Links, Actions, Color, Filterable }` ([fieldOverrides-ts]). The docs describe them as display-only: standard options "let you change how field data is displayed in your visualizations" and "Not all of the options listed apply to all visualizations with standard options" ([std-options-docs]).

**Matchers.** `MatcherConfig.id` resolves against a registry; the ids are ([matcher-ids]):

```ts
export enum FieldMatcherID {
  numeric = 'numeric', time = 'time', first = 'first', firstTimeField = 'firstTimeField',
  byType = 'byType', byTypes = 'byTypes', byName = 'byName', byNames = 'byNames',
  byRegexp = 'byRegexp', byRegexpOrNames = 'byRegexpOrNames', byFrameRefID = 'byFrameRefID', byValue = 'byValue',
}
export enum FrameMatcherID { byName = 'byName', byRefId = 'byRefId', byIndex = 'byIndex' }
export enum MatcherID { anyMatch, allMatch, invertMatch, alwaysMatch, neverMatch }  // 'checks children' / 'checks child'
```

The UI exposes a subset: "Fields with name", "Fields with name matching regex" ("Properties you add to this type of rule are applied to all fields where the field name matches the regular expression"), "Fields with type", "Fields returned by query" ("such as A, B, or C"), and "Fields with values" ("Select all fields returned by your defined reducer condition, such as Min, Max, Count, Total") ([overrides-docs]).

Real serialized matchers, from the backend migration fixture ([v42-testdata]):

```json
{ "matcher": { "id": "byName", "options": "Field1" },
  "properties": [ { "id": "custom.hideFrom", "value": { "viz": true } } ] }
{ "__systemRef": "hideSeriesFrom",
  "matcher": { "id": "byNames", "options": { "mode": "exclude", "names": ["foo"], "prefix": "All except:", "readOnly": true } },
  "properties": [ { "id": "custom.hideFrom", "value": { "legend": false, "tooltip": false, "viz": true } } ] }
{ "matcher": { "id": "byRegexp", "options": "/.*/" }, "properties": [ { "id": "custom.hideFrom", "value": { "viz": true } } ] }
{ "matcher": { "id": "byValue", "options": { "op": "gte", "reducer": "allIsZero", "value": 0 } },
  "properties": [ { "id": "unit", "value": "short" } ] }
```

Note `__systemRef: "hideSeriesFrom"` and `readOnly: true`: UI-generated rules (clicking a legend item to isolate a series) are written into the same `overrides` array as user-authored rules, tagged so the UI can find and rewrite them. The v2 CUE declares that field explicitly: `overrides: [...{ "__systemRef"?: string, matcher: MatcherConfig, properties: [...DynamicConfigValue] }]` ([v2-spec]).

**How it is applied.** `applyFieldOverrides(options: ApplyFieldOverrideOptions, data = options.data, scope: MatcherScope = 'series'): DataFrame[]` walks every field of every frame: it first calls `setFieldConfigDefaults(config, source.defaults, context)`, then iterates the override rules (`for (const rule of override) { if (rule.match(field, newFrame, data)) … }`), so later matching rules can supersede earlier ones; array-valued properties merge with "Override values come first so they take precedence" ([applyFieldOverrides]). `ApplyFieldOverrideOptions` is `{data?, fieldConfig, fieldConfigRegistry?, replaceVariables, theme, timeZone?, dataLinkPostProcessor?}` ([fieldOverrides-ts]) — note it needs the theme and a variable interpolator, i.e. resolution is environment-dependent and therefore necessarily a load-time step, not a save-time one.

**Why it is separate from `options`.** Because only `fieldConfig` has a matcher mechanism. The plugin guide states the two layers: "**Defaults**: Apply to all fields, configured in the panel editor's options pane" and "**Overrides**: Apply selectively to fields matching specific rules (matchers target fields; properties define changes)" ([pt-field-overrides]). A plugin registers its own per-field properties through `useFieldConfig({ useCustomConfig: builder => … })`; they are then stored under `fieldConfig.defaults.custom` and addressed in overrides with the `custom.` prefix (`"id": "custom.hideFrom"` above) ([pt-field-overrides], [panelplugin-ts], [v42-testdata]). Each such property can declare `shouldApply?: (field: Field) => boolean`, `hideFromDefaults?` and `hideFromOverrides?` ([fieldOverrides-ts]) — i.e. a property can be per-field-only or defaults-only.

At render time the panel does not re-read `fieldConfig`: it reads the already-resolved `field.config` (custom properties under `field.config.custom`) on each field of the incoming frames ([pt-field-overrides]).

### 3. `panels[].options` versus `fieldConfig` — the rule

The decision rule that the code and schema support:

| | `options` | `fieldConfig.defaults` (+ `.custom`) |
|---|---|---|
| Scope | The whole panel/visualization | One field (series/column) at a time |
| Can be targeted at a subset of fields? | No | Yes, via `overrides[].matcher` ([types-gen]) |
| Declared by | "the Options field in panel plugin schemas" ([types-gen]) | standard properties in the schema plus the plugin's `useFieldConfig` custom registry ([types-gen], [pt-field-overrides]) |
| Typed in the dashboard schema? | No (`Record<string, unknown>`) | Partially: standard keys typed, `custom` is `Record<string, unknown>` ([types-gen]) |
| Available to the panel as | `props.options` | `frame.fields[i].config` ([panel-ts], [pt-field-overrides]) |

The timeseries plugin is the clearest worked example of where the line falls ([timeseries-cfg], [common-gen]):

- `Options`: `legend: TimeSeriesLegendOptions`, `tooltip: common.VizTooltipOptions`, `timeCompare?`, `orientation?`, `annotations?`, `disableKeyboardEvents?`, plus `common.OptionsWithTimezones` / `OptionsWithAnnotations`. `VizLegendOptions` = `{asTable?, calcs, displayMode?, isVisible?, limit?, overflow?, placement, showLegend, sortBy?, sortDesc?, width?}`; `VizTooltipOptions` = `{hideZeros?, maxHeight?, maxWidth?, mode, sort}`.
- `FieldConfig`: `common.GraphFieldConfig & {}` = `{drawStyle?, gradientMode?, insertNulls?, showValues?, thresholdsStyle?, transform?}` plus `LineConfig {lineColor?, lineInterpolation?, lineStyle?, lineWidth?, spanNulls?}`, `FillConfig {fillBelowTo?, fillColor?, fillOpacity?}`, `PointsConfig {pointColor?, pointSize?, pointSymbol?, showPoints?}`, `AxisConfig {axisBorderShow?, axisCenteredZero?, axisColorMode?, axisGridShow?, axisLabel?, axisPlacement?, axisSoftMax?, axisSoftMin?, axisWidth?, scaleDistribution?}`, `BarConfig {barAlignment?, barMaxWidth?, barWidthFactor?}`, `StackableFieldConfig {stacking?}`, `HideableFieldConfig {hideFrom?}`.

So: **the legend is a panel option; the axis is a field config.** Axis placement, soft min/max and `scaleDistribution` (log/linear) sit per field because a panel can have two y-axes driven by two different series; the legend has exactly one instance per panel. Note the consequence for wechart's AC-040: Grafana's axis min/max is split — `min`/`max`/`decimals`/`unit` are *standard* field properties, while `axisSoftMin`/`axisSoftMax`/`axisLabel`/`scaleDistribution` are *custom* (plugin-specific) field properties ([types-gen], [common-gen]).

The mechanical test, stated as facts: if a setting must be expressible for some fields and not others, it has to be in `fieldConfig`, because `overrides` is the only mechanism that carries a matcher ([types-gen], [applyFieldOverrides]). If it is a property of the panel as a whole, it goes in `options`, which has no per-field addressing at all.

### 4. The transformations pipeline

**Where it sits.** Docs: transformations are "a powerful way to manipulate data returned by a query before the system applies a visualization", sequence Query result → Transformation → Visualization; "When there are multiple transformations, Grafana applies them in the order they are listed. Each transformation creates a result set that then passes on to the next transformation in the processing pipeline." ([transform-docs], identical wording in the schema doc comment [types-gen]).

**The actual order in code** is `PanelQueryRunner.getData(options: GetDataOptions)` with `GetDataOptions = { withTransforms: boolean; withFieldConfig: boolean }` ([pqr]):

1. If `this.dataConfigSource.snapshotData` exists, return those frames directly — no queries, no transforms (`state: LoadingState.Done`).
2. Otherwise: `if (withTransforms) dataWithTransforms = this.applyTransformations(data)` — series and annotations are split by topic and run through `transformDataFrame` separately.
3. Then `if (withFieldConfig && data.series?.length) … series: applyFieldOverrides({ timeZone: data.request?.timezone ?? 'browser', data: processedData.series, ...fieldConfig })`. Annotations get `applyFieldOverrides` with an empty `fieldConfig` (`{defaults: {}, overrides: []}`).
4. A `structureRev` counter is bumped whenever the frame structure changes (`compareDataFrameStructures`), and streaming packets with an unchanged schema skip the whole override pass.

So the order is **query → transformations → field overrides → panel props**, and both middle steps are client-side, driven off the panel's saved config. The panel never sees the raw query response when transformations are configured.

**What a transformation is, serialized** ([types-gen]):

```ts
export interface DataTransformerConfig {
  disabled?: boolean;
  filter?: MatcherConfig;   // frame matcher
  id: string;               // registry id
  options: unknown;         // shape defined by the transformer
  topic?: ('series' | 'annotations' | 'alertStates');
}
```

The v2 CUE restates it with comments ([v2-spec]): `disabled?: bool` "Disabled transformations are skipped"; `filter?: MatcherConfig` "Optional frame matcher. When missing it will be applied to all results"; `topic?: DataTopic` "Where to pull DataFrames from as input to transformation"; `options: _` "Options to be passed to the transformer / Valid options depend on the transformer id".

The registry ids are `DataTransformerID` ([transformer-ids]): `append, reduce, order, organize, rename, calculateField, seriesToColumns (@deprecated use joinByField), seriesToRows, merge, concatenate, labelsToFields, filterFields, filterFieldsByName, filterFrames, filterByRefId, renameByRegex, filterByValue, noop, ensureColumns, groupBy, sortBy, histogram, configFromData, rowsToFields, prepareTimeSeries, convertFieldType, convertFrameType, fieldLookup, heatmap, spatial, joinByField, joinByLabels, extractFields, groupingToMatrix, limit, partitionByValues, timeSeriesTable, transpose, formatTime, formatString, regression, smoothing, groupToNestedTable`. The docs list 40+ user-facing names for the same set ([transform-docs]).

Note `configFromData` / "Config from query results": a transformation can *write field config* (units, thresholds, min/max) from query results, i.e. the config layer is not purely user-authored ([transformer-ids], [transform-docs]).

Docs also note the escape hatches: "Sometimes the system cannot graph transformed data. When that happens, click the `Table view` toggle above the visualization to switch to a table view", and a per-row bug icon inspects a transformation's input and output frames ([transform-docs]).

Relevance to AC-047/AC-048: Grafana's answer to "% of total / running total / moving average" is this client-side pipeline (`calculateField`, `regression`, `smoothing`, `reduce`). wechart's spec takes the opposite position — compute in Cube as a multi-stage measure (AC-048) — so Grafana's transformation list is useful as a *capability inventory* and as evidence of what a serialized transform step looks like, not as a design to copy.

### 5. `targets` (queries) and the datasource reference

**Panel-level.** `datasource?: DataSourceRef` with doc comment "The datasource used in all targets"; `DataSourceRef = { type?: string; uid?: string }` ([types-gen]). Special uids appear in real dashboards: the built-in annotation query uses `{"type": "datasource", "uid": "grafana"}` ([home-json]); the panel-to-panel reuse datasource is `-- Dashboard --` ([issue-126324]).

**Target-level.** `targets?: Array<Record<string, unknown>>` — the dashboard schema says nothing about a target's contents ("Depends on the panel plugin. See the plugin documentation for details.") ([types-gen]). In practice each target carries a `refId` plus datasource-specific keys ([v1-color-modes]); `refId` is what `byFrameRefID` / `filterByRefId` / "Fields returned by query" address ([matcher-ids], [overrides-docs]).

**Migration of the reference format.** Datasources were once referenced by *name*; the backend migration registry passes a `DataSourceIndexProvider` to exactly two migrations, `33: V33(dsIndexProvider)` and `36` ([mig-consts]) — i.e. name→`{type, uid}` resolution is a schema migration that needs an instance-local index, which is why moving a dashboard between instances is a distinct problem from migrating it.

**Export / import (`__inputs`).** `DashboardExporter.makeExportable(dashboard)` produces ([exporter]):

```ts
export interface Input { name: string; type: string; label: string; value: any; description: string; usage?: InputUsage; }
export interface ExternalDashboard {
  __inputs?: Input[];
  __elements?: Record<string, LibraryElementExport>;
  __requires?: Array<Requires[string]>;
  panels: Array<PanelModel | PanelWithExportableLibraryPanel>;
}
```

Summary of the exporter's behaviour (paraphrase of the fetched source, not verbatim) ([exporter]): `templateizeDatasourceUsage` replaces each concrete datasource with `{ type: ds.meta.id, uid: '${DS_…}' }`, the reference name being `"DS_" + name.toUpperCase()`; each replaced datasource becomes an `Input` of type `'datasource'`; constant variables become inputs named `"VAR_" + …` of type `'constant'`; query-variable option lists are cleared so they repopulate on import; `__requires` collects `'datasource' + id` and `'panel' + id` entries plus the Grafana version; library panels move into `__elements`.

Docs side: the export dialog has a "Share dashboard with another instance" toggle that "remove[s] details specific to your Grafana instance", and advanced options choose **Model type: Classic or V2 Resource** and **Format: JSON or YAML (V2 Resource only)**; "To publish a dashboard to the Grafana community catalog, you must export it using the **Classic** model." ([share-docs]). On import, "Many imported dashboards contain queries that reference a data source. During import, Grafana lets you map those references to data sources that exist in your environment" ([import-docs]).

**In v2 the reference moved.** A query is a kind, and the datasource is named, not uid-typed ([v2-spec]):

```cue
DataQueryKind: { kind: "DataQuery", group: string, version: string | *"v0", labels?: [string]: string, datasource?: { name?: string }, spec: [string]: _ }
PanelQueryKind: { kind: "PanelQuery", spec: PanelQuerySpec }
PanelQuerySpec: { query: DataQueryKind, refId: string | *"A", hidden: bool }
```

`group` carries the plugin id (`"grafana-testdata-datasource"`), `spec` the plugin-specific query, and `datasource.name` the instance ([devenv-filter], [issue-126324]). Omitting `datasource` means "default datasource" — which is why the dropped `-- Dashboard --` reference in [issue-126324] silently falls back to random-walk data.

UNVERIFIED: the `-- Mixed --` datasource and per-target datasource overrides. I did not find a v13.2.2 source for them in the files read.

### 6. Schema versioning and migration

**Frontend, `DashboardMigrator`** ([migrator]):

```ts
/**
 * The current version of the dashboard schema.
 *
 * NOTE: Schema version 42 is the FINAL version for the v1 dashboard API.
 * DO NOT increment this number or add new schema migrations.
 *
 * This is necessary due to the migration of the legacy dashboards API to the app platform.
 *
 * For panel-specific migrations, implement them as panel migrations in the
 * individual panel plugin migration handlers instead of adding new schema versions.
 *
 * Legacy migration instructions (for reference only):
 * To add a dashboard migration increment this number
 * and then add your migration at the bottom of 'updateSchema'
 * hint: search "Add migration here"
 *
 * This number also needs to be updated on the CUE schema:
 * kinds/dashboard/dashboard_kind.cue
 * Example PR: #87712
 */
export const DASHBOARD_SCHEMA_VERSION = 42;
```

`updateSchema(old: any, targetSchemaVersion?: number)` reads `const oldVersion = this.dashboard.schemaVersion`, sets `const finalTargetVersion = targetSchemaVersion || DASHBOARD_SCHEMA_VERSION`, returns immediately `if (oldVersion === finalTargetVersion)`, then runs a long chain of guarded blocks and finally `if (oldVersion < finalTargetVersion) { this.dashboard.schemaVersion = finalTargetVersion; }` ([migrator]). Migration is therefore **forward-only and idempotent-by-version**, not a diff. Panel-level steps are queued as `panelUpgrades: PanelSchemeUpgradeHandler[]` and applied to every panel, including nested row children. Representative blocks ([migrator]):

```ts
if (oldVersion < 40 && finalTargetVersion >= 40) {
  // In old dashboards refresh property can be a boolean
  if (typeof this.dashboard.refresh !== 'string') { this.dashboard.refresh = ''; }
}
if (oldVersion < 41 && finalTargetVersion >= 41) {
  // time_options is a legacy property that was not used since grafana version 5
  //  therefore deprecating this property from the schema
  if ('time_options' in this.dashboard.timepicker) { delete this.dashboard.timepicker.time_options; }
}
if (oldVersion < 42 && finalTargetVersion >= 42) { panelUpgrades.push(migrateHideFromFunctionality); }
```

and at the end of the method:

```ts
/**
 * ⚠️  WARNING: DO NOT ADD NEW MIGRATIONS HERE ⚠️
 * Schema version 42 is the FINAL version for the v1 dashboard API. …
 */
```

**Backend, `apps/dashboard/pkg/migration`.** The same migrations now exist in Go, one file per version, `v2.go` … `v42.go` (each with a `_test.go`) ([mig-versions]). `schemaversion/migrations.go` declares:

```go
const (
	MIN_VERSION    = 0
	LATEST_VERSION = 42
)
```

and `GetMigrations(dsIndexProvider DataSourceIndexProvider, _ LibraryElementIndexProvider) map[int]SchemaVersionMigrationFunc` mapping 2…42 ([mig-consts]). `migrate.go` reads the version with `GetSchemaVersion(dash)`, returns `NewMinimumVersionError(inputVersion)` if `inputVersion < MIN_VERSION`, loops from `inputVersion + 1` to `targetVersion` applying each registered function and setting `dash["schemaVersion"] = nextVersion` after each step, and finally re-checks that the target was reached (summary of the fetched source; the quoted fragments are `if inputVersion < schemaversion.MIN_VERSION, return schemaversion.NewMinimumVersionError(inputVersion)` and `if schemaversion.GetSchemaVersion(dash) != targetVersion, return schemaversion.NewMigrationError`) ([mig-migrate]).

The package README states ([mig-readme]): schema migrations apply to `v0alpha1` and `v1beta1` dashboards and run "in the backend, replicating logic from the legacy DashboardMigrator while implementing built-in plugin migrations since the backend cannot load external plugins"; frontend parity tests verify "both backend (Go) and frontend (TypeScript) conversions produce identical outputs" (test files named `transformSaveModelV1ToV2.test.ts`, `transformSaveModelV2ToV1.test.ts`, `DashboardMigratorToBackend.test.ts`); the API-version conversion chain is `v0alpha1 → v1beta1 → v2alpha1/v2beta1` with `v2 → v0/v1` chained back through intermediates; Angular panels are carried across the v1→v2 conversion in a temporary `__angularMigration` field so the frontend can still call `plugin.onPanelTypeChanged()`; golden files are verified by SHA-256 checksums rather than stored in full, "avoiding noisy diffs when migration logic changes".

**Panel plugin migration** ([panel-ts], [panelplugin-ts], [pt-migration]):

```ts
/**
 * Called when a panel is first loaded with current panel model to migrate
 * panel options if needed. Can return panel options, or a Promise that
 * resolves to panel options for async migrations
 */
export type PanelMigrationHandler<TOptions = any> = (panel: PanelMigrationModel<TOptions>) => Partial<TOptions> | Promise<Partial<TOptions>>;

/**
 * Called before a panel is initialized. Allows panel inspection for any updates before changing the panel type.
 */
export type PanelTypeChangedHandler<TOptions = any> = (panel: PanelModel<TOptions>, prevPluginId: string, prevOptions: Record<string, any>, prevFieldConfig: FieldConfigSource) => Partial<TOptions>;
```

Registered as `setMigrationHandler(handler, shouldMigrate?: (panel: PanelModel) => boolean)` — "This function is called before the panel first loads if the current version is different than the version that was saved… This is a good place to support any changes to the options model" — and `setPanelChangeHandler(handler)` — "This function is called when the visualization was changed… useful for supporting PanelModel API updates when changing between Angular and React panels" ([panelplugin-ts]). The guide adds: "A migration handler is a function that runs when the dashboard's stored panel version differs from the current installed panel version"; inspect `panel.pluginVersion` to branch (empty for v1 panels); and the caveat "Changes made to the panel are not automatically persisted, users need to manually save the dashboard after a panel is migrated" — so the migration re-runs on every load until someone saves ([pt-migration]).

Two dashboard-level fields support this: `pluginVersion` (the version stamp that triggers the handler) and `autoMigrateFrom?: string` on `Panel` ([types-gen]).

The panel's render-time contract is `PanelProps<T>` = `{id, data, timeRange, timeZone, options: T, transparent, width, height, fieldConfig, renderCounter, title, eventBus, onOptionsChange, onFieldConfigChange, replaceVariables, onChangeTimeRange}` ([panel-ts]) — note `options` and `fieldConfig` arrive as separate props, and `onFieldConfigChange(config, replace?)` is separate from `onOptionsChange(options)`.

### 7. The newer schema work: Dashboard Schema V2 / kinds

**Tooling.** Thema and kindsys are **absent** from `go.mod` at v13.2.2; what remains is `github.com/grafana/grafana-app-sdk v0.56.6` and `cuelang.org/go v0.11.1 // indirect` ([gomod]). Schemas are CUE under `apps/dashboard/kinds/`, with `config.cue`, `dashboard.cue`, `globalvariable.cue`, `manifest.cue`, `notebook.cue`, `snapshot.cue`, `cue.mod` and version directories `v0alpha1`, `v1beta1`, `v2`, `v2alpha1`, `v2beta1` ([kinds-dir]). The v1 TypeScript types are still generated by `kinds/gen.go` with jennies `TSTypesJenny` / `LatestMajorsOrXJenny` ([types-gen]).

**Manifest** ([manifest]): `appName: "dashboard"`, `groupOverride: "dashboard.grafana.app"`, `preferredVersion: "v1"`, with version keys `"v1"`, `"v0alpha1"`, `"v1beta1"`, `"v2alpha1"`, `"v2beta1"`, `"v2"`. So at 13.2.2 six API versions of the same resource exist and **v1 is still the preferred version**.

**What V2 changes.** `apps/dashboard/kinds/v2/dashboard_spec.cue` ([v2-spec]):

```cue
DashboardSpec: {
    annotations: [...AnnotationQueryKind] | *[]
    cursorSync: DashboardCursorSync
    description?: string
    editable?: bool | *true
    elements: [ElementReference.name]: Element | *{}
    layout: GridLayoutKind | RowsLayoutKind | AutoGridLayoutKind | TabsLayoutKind
    links: [...DashboardLink] | *[]
    liveNow?: bool
    preload: bool | *false
    revision?: uint16
    tags: [...string] | *[]
    timeSettings: TimeSettingsSpec
    title: string
    variables: [...VariableKind] | *[]
    preferences?: Preferences
}
Element: PanelKind | LibraryPanelKind
PanelKind: { kind: "Panel", spec: PanelSpec }
PanelSpec: { id: number, title: string, description?: string, subtitle?: string, links: [...DataLink], data: QueryGroupKind, vizConfig: VizConfigKind, transparent?: bool }
VizConfigKind: { kind: "VizConfig", group: string, version: string, spec: VizConfigSpec }
VizConfigSpec: { options: [string]: _, fieldConfig: FieldConfigSource }
QueryGroupKind: { kind: "QueryGroup", spec: QueryGroupSpec }
QueryGroupSpec: { queries: [...PanelQueryKind], transformations: [...TransformationKind], queryOptions: QueryOptionsSpec }
ElementReference: { kind: "ElementReference", name: string }
```

The structural changes, each with a consequence:

- **No `schemaVersion`.** Versioning moves to `apiVersion` (`dashboard.grafana.app/v2`) plus per-kind `group`/`version` stamps ([devenv-filter], [issue-126641] which describes v2 JSON as "lacking schemaVersion, panels, uid").
- **Content and placement are separated.** `elements` is a *map* keyed by name; `layout` references elements by `ElementReference` ([v2-spec]). `GridLayoutItemSpec: {x, y, width, height, element: ElementReference, repeat?: RepeatOptions}`.
- **Four layout kinds**: `GridLayoutKind` (explicit x/y/w/h), `AutoGridLayoutSpec {maxColumnCount?: number | *3, columnWidthMode: "narrow" | *"standard" | "wide" | "custom", columnWidth?, rowHeightMode: "short" | *"standard" | "tall" | "custom", rowHeight?, fillScreen?: bool | *false, items}`, `TabsLayoutSpec {tabs}` with `TabsLayoutTabSpec {title?, layout, conditionalRendering?, repeat?, variables?}`, and `RowsLayoutSpec {rows}` with `RowsLayoutRowSpec {title?, collapse?, hideHeader?, fillScreen?, conditionalRendering?, repeat?, layout, variables?}`. Layouts nest: a tab or row contains another layout kind ([v2-spec]). This is directly comparable to wechart's tabs/sections requirement.
- **Conditional rendering is first-class**: `ConditionalRenderingGroupSpec {visibility: "show"|"hide", condition: "and"|"or", items}` with `ConditionalRenderingVariableKind`, `ConditionalRenderingDataKind`, `ConditionalRenderingTimeRangeSizeKind` ([v2-spec]).
- **Per-element variables**: rows and tabs can declare `variables: [...VariableKind]` ([v2-spec]).
- **The panel's viz identity is a kind reference**: `VizConfigKind {group, version}` where `group` is the plugin id and `version` the plugin version — the old `type` + `pluginVersion` pair, promoted into the structure ([v2-spec], [devenv-filter] shows `"group": "table", "version": "9.4.0-pre"`).
- **`options` and `fieldConfig` survive unchanged** inside `VizConfigSpec` ([v2-spec]). The defaults/overrides/matcher model is carried over verbatim, including `__systemRef`.
- **Query options are grouped**: `QueryOptionsSpec {timeFrom?, timeTo?, maxDataPoints?, timeShift?, queryCachingTTL?, interval?, cacheTimeout?, hideTimeOverride?, timeCompare?}` instead of being flat panel fields ([v2-spec] vs [types-gen]).
- **Time settings are grouped**: `TimeSettingsSpec {timezone? | *"browser", from | *"now-6h", to | *"now", autoRefresh | *"", autoRefreshIntervals | *[…], quickRanges?, hideTimepicker | *false, weekStart?, fiscalYearStartMonth | *0, nowDelay?}` ([v2-spec]).

**A real v2 panel** — first element of `devenv/dev-dashboards/transforms/filter.json`, root `apiVersion: "dashboard.grafana.app/v2"`, `kind: "Dashboard"` ([devenv-filter]):

```json
{ "kind": "Panel", "spec": { "id": 2, "title": "Transformer query filters", "description": "", "links": [],
  "data": { "kind": "QueryGroup", "spec": {
    "queries": [ { "kind": "PanelQuery", "spec": { "query": { "kind": "DataQuery", "group": "grafana-testdata-datasource", "version": "v0", "spec": { "csvContent": "AAA\n1\n2\n3\n4", "scenarioId": "csv_content" } }, "refId": "A", "hidden": false } } ],
    "transformations": [ { "kind": "Transformation", "group": "reduce", "spec": { "filter": { "id": "byRefId", "options": "A" }, "options": { "includeTimeField": false, "mode": "reduceFields", "reducers": ["min"] } } } ],
    "queryOptions": {} } },
  "vizConfig": { "kind": "VizConfig", "group": "table", "version": "9.4.0-pre", "spec": {
    "options": { "footer": { "countRows": false, "fields": "", "reducer": ["sum"], "show": false }, "frameIndex": 0, "showHeader": true },
    "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [ { "value": null, "color": "green" }, { "value": 80, "color": "red" } ] }, "color": { "mode": "thresholds" }, "custom": { "align": "auto", "cellOptions": { "type": "auto" }, "inspect": false } }, "overrides": [] } } } } }
```

**Shipped vs. proposed at 13.2.2** — evidence, and the limits of it:

| Claim | Status | Evidence |
|---|---|---|
| v2 CUE kinds exist in-tree with Go+TS codegen | Shipped | [kinds-dir], [manifest], [v2-spec] |
| `/apis/dashboard.grafana.app/v2` is served | Shipped | error text quoted in [issue-126641] |
| Grafana's own dev dashboards are stored as v2 | Shipped | [devenv-filter] |
| Export UI offers "Classic" vs "V2 Resource" (+ YAML for V2) | Shipped | [share-docs] |
| New layouts (auto-grid, tabs, rows, conditional rendering) | GA feature toggle, default on: `{Name: "dashboardNewLayouts", Description: "Enables new dashboard layouts", Stage: FeatureStageGeneralAvailability, Generate: Generate{LegacyFrontend: true}, Owner: grafanaDashboardsSquad, Expression: "true"}`; the generated TS says `@default true` | [registry-go], [toggles-ts] |
| v1 schema is closed | Shipped decision | [migrator], [mig-consts] |
| v2 is the *preferred* stored API version | **No** — `preferredVersion: "v1"` | [manifest] |
| Docs call V2 "The current schema, supporting new features such as advanced layouts and conditional rendering. It models all dashboard elements as Kubernetes kinds, following Kubernetes conventions for declaring dashboard components." | Shipped doc statement | [json-model-docs] |
| `v2alpha1` / `v2beta1` still exist alongside `v2` | Shipped | [manifest], [mig-readme] |

UNVERIFIED: whether a stock OSS 13.2.2 install saves new dashboards as v1 or v2 by default. `preferredVersion: "v1"` ([manifest]) points to v1, but the docs' "current schema" wording and the v2 devenv fixtures point the other way, and I found no single authoritative statement. I did not find a release note or `whatsnew` page asserting v2 GA; `docs/sources` at v13.2.2 no longer contains a `dashboards/` directory (its directories are administration, alerting, as-code, breaking-changes, datasources, developer-resources, developers, fundamentals, introduction, setup-grafana, shared, troubleshooting, tutorials, upgrade-guide, visualizations, whatsnew), so the versioned markdown for the JSON-model page could not be read from the tag ([docs-sources-dir]).

### 8. Known pain points, publicly documented

1. **The v1 schema is a dead end by decree.** "Schema version 42 is the FINAL version for the v1 dashboard API. DO NOT increment this number or add new schema migrations… This is necessary due to the migration of the legacy dashboards API to the app platform." Anything that would have been a schema migration must now be a per-plugin migration ([migrator]).
2. **The dashboard JSON is not self-describing.** `options: Record<string, unknown>` and `targets: Array<Record<string, unknown>>` ([types-gen]); the meaning of both depends on plugins that the backend "cannot load" ([mig-readme]). Reading a dashboard correctly requires the plugin set that wrote it.
3. **The same migrations are implemented twice** (TypeScript `DashboardMigrator` and Go `apps/dashboard/pkg/migration`), and correctness is defended by parity tests that push both outputs "through the same Scene load/save cycle before comparison" to normalise default values and field ordering ([mig-readme], [migrator], [mig-versions]).
4. **Conversion data loss is a named, instrumented failure mode.** The migration package emits `grafana_dashboard_migration_conversion_failure_total` with `error_type` values including `conversion_error`, `schema_version_migration_error`, `schema_minimum_version_error` and **`conversion_data_loss_error`** ("Detected panel/query/annotation/link/variable losses"), plus a `normalizeConversion` wrapper doing "automatic checks that panels, queries, annotations, and links are preserved" ([mig-readme]).
5. **Migrations are forward-only and not persisted.** The migrator only ever raises `schemaVersion` (`if (oldVersion < finalTargetVersion) this.dashboard.schemaVersion = finalTargetVersion`) ([migrator]); plugin migrations "are not automatically persisted, users need to manually save the dashboard after a panel is migrated" ([pt-migration]).
6. **Documentation/constant mismatch on the floor version.** The README says schema migrations run "from v13 (minimum) through v42 (latest)" and that `schema_minimum_version_error` covers "Pre-v13 dashboards" ([mig-readme]), while the Go constant is `MIN_VERSION = 0` ([mig-consts]). One of the two is stale; I could not determine which.
7. **Export/import regressions in the v1↔v2 period.** "Dashboards: 'Classic' option still outputs v2 schema in 13.0.2 — file-based provisioning cannot obtain a v1 JSON from the GUI" (opened 2026-06-17, closed 2026-08-28; labels type/bug, type/regression, area/provisioning, area/dashboard/import) ([issue-126641]). Still open at the research date: "'-- Dashboard --' datasource reference is dropped from panel queries when exporting a v2-schema dashboard" — the exported `PanelQuery` omits `"datasource": { "name": "-- Dashboard --" }`, so provisioned panels silently fall back to the default datasource and render random-walk sample data (opened 2026-06-12) ([issue-126324]).
8. **Coexistence cost is itself a filed proposal.** "Dashboards: one product surface, many stacks — tighten the Scenes + API + schema v2 story" (open, 2026-04-23) describes "several API personalities for the same dashboard UID", "unified fetch/save as composite behavior with fallback logic", "schema translation requiring round-trip fidelity maintenance", dual UI implementations, and a resulting "combinatorial tax" on every new feature ([issue-123320]).
9. **Machine-written and user-written config share one list.** UI actions inject override rules into `fieldConfig.overrides` tagged `__systemRef` with `readOnly: true` matcher options ([v42-testdata], [v2-spec]); and the `configFromData` transformation can write field config from query results ([transformer-ids]). A consumer of the JSON cannot assume `overrides` is user intent.
10. **Grafonnet is disavowed in favour of the Foundation SDK**: "Grafonnet is not officially supported by Grafana. Instead, use the Foundation SDK to create dashboards as code." ([oac-docs]) — i.e. the community's main dashboards-as-code tool was left behind by the schema churn.

### 9. What this means for wechart's ChartSpec / RenderSpec question

Facts, with no recommendation (the shape of wechart's persisted format is the user's decision):

- Grafana persists a shape much closer to wechart's `ChartSpec` than to `RenderSpec`: queries (`targets`) + a visualization id (`type`/`VizConfigKind.group`) + configuration (`options`, `fieldConfig`) + a declarative post-query pipeline (`transformations`) ([types-gen], [v2-spec]).
- Nothing resembling `RenderSpec.rows` is stored. Rows exist only as in-memory `DataFrame[]` produced by `PanelQueryRunner.getData()` ([pqr]). The single persisted exception is a snapshot, which is a distinct dashboard mode with its own `Dashboard.snapshot` metadata block (`created`, `expires`, `external`, `externalUrl`, `originalUrl`, `id`, `key`, `name`, `orgId`, `updated`, `url?`, `userId`) ([types-gen], [pqr]).
- Grafana splits configuration by *addressability*, not by *renderer*: `options` (panel-wide) vs `fieldConfig.defaults` (all fields) vs `fieldConfig.overrides[]` (matcher-selected fields) ([types-gen], [applyFieldOverrides]). wechart's `RenderSpec.encoding {category?, series?, values[]}` has no equivalent in Grafana — Grafana has no encoding layer at all; a panel plugin infers roles from frame shape, which is why transformations like `prepareTimeSeries`, `joinByField` and `partitionByValues` exist ([transformer-ids]).
- Grafana's resolution step (`applyFieldOverrides`) requires `theme`, `timeZone` and `replaceVariables` ([fieldOverrides-ts]), so its "render spec" is by construction environment-dependent and non-portable — which is consistent with it never being persisted.
- Grafana's trellis analogue is `repeat` + `repeatDirection` + `maxPerRow` on the saved panel (v1) or `RepeatOptions {mode, value, direction?, maxPerRow?}` on the layout item (v2) — i.e. repetition is declared in the saved spec and expanded at load ([types-gen], [v2-spec]). Compare AC-045's fixed 20-panel cap.
- Grafana's versioning of the persisted shape is two-level: a document-level integer (`schemaVersion`, migrated centrally by `DashboardMigrator`) plus a per-plugin string (`pluginVersion`, migrated by the plugin's own handler) ([migrator], [panelplugin-ts]). The document-level level is the one that got frozen ([migrator]).

## Gotchas

- **Two version counters.** `schemaVersion` (schema shape) and `version` (edit revision) are unrelated ([types-gen]). v2 adds a third idea: `revision?: uint16` in `DashboardSpec` ([v2-spec]), and v1 `Dashboard.revision` is documented as "should only be used in dashboards defined by plugins" ([types-gen]).
- **Collapsed rows hide panels.** With `RowPanel.collapsed: true` the row's children live in `RowPanel.panels`, not in the top-level `panels` array ([types-gen], [v42-testdata]). Any code that walks `dashboard.panels` must recurse, which is exactly why the migrator applies `panelUpgrades` to nested panels ([migrator]).
- **An override property with no `value` is legal** and means "clear/unset" ([v1-color-modes], [fieldOverrides-ts]).
- **Override order matters and is last-wins per property**, with array-valued properties merged "Override values come first so they take precedence" ([applyFieldOverrides]).
- **`fieldConfig.defaults.custom` keys are plugin-private**, and overrides address them with a `custom.` prefix (`"id": "custom.hideFrom"`), so switching visualization type can strand config that no longer has an owner — the reason `setPanelChangeHandler(PanelTypeChangedHandler)` receives `prevOptions` *and* `prevFieldConfig` ([panel-ts], [panelplugin-ts], [v42-testdata]).
- **Transformations run in the browser, before overrides**, and change frame structure ([pqr]); ordering them wrong is a documented user trap ("applying a Reduce transformation early… collapses data to single values") ([transform-docs]).
- **`topic` on a transformation** selects `'series' | 'annotations' | 'alertStates'`; series and annotations are transformed separately, and annotations get overrides applied with an empty `fieldConfig` ([types-gen], [pqr]).
- **Export rewrites the document.** Datasource uids become `${DS_…}` inputs, constants become `VAR_…` inputs, query-variable option lists are emptied, library panels move to `__elements`, and `__requires` records plugin and Grafana version floors ([exporter]). An exported dashboard is not the same document as the stored one.
- **v2 drops `uid`, `panels` and `schemaVersion` from the body**, which breaks v1 file provisioning if the wrong model is exported ([issue-126641]).
- **Grafana OSS licensing.** wechart imports nothing here, but any copied JSON structure or code would fall under Grafana's licence; `LICENSE` and `LICENSING.md` exist at the repo root ([repo-root]) and were not read — see Open questions.

## Alternatives considered

The caller did not ask for a comparison. This document reports Grafana only; per the framing it is one of three reference studies, and it makes no recommendation about wechart's persisted format.

## Open questions / unverified

- UNVERIFIED: whether stock Grafana OSS 13.2.2 stores new dashboards as `dashboard.grafana.app/v1` or `/v2` by default. `manifest.cue` says `preferredVersion: "v1"` ([manifest]); the docs call V2 "the current schema" ([json-model-docs]); the devenv dashboards are v2 ([devenv-filter]). No single source settles it.
- UNVERIFIED: the exact GA/preview status label Grafana attaches to Dashboard Schema V2 as a whole. `dashboardNewLayouts` is `FeatureStageGeneralAvailability` with `Expression: "true"` ([registry-go]), but that toggle is about layouts, not the schema. `docs/sources` at v13.2.2 has no `dashboards/` directory, so the versioned markdown could not be read from the tag ([docs-sources-dir]); grafana.com `/latest/` pages were used instead.
- CONFLICT, unresolved: minimum migratable schema version — README says v13 ([mig-readme]); `MIN_VERSION = 0` ([mig-consts]).
- UNVERIFIED: the `-- Mixed --` datasource and per-target datasource overrides at 13.2.2. Only `-- Dashboard --` ([issue-126324]) and the built-in `{type: "datasource", uid: "grafana"}` ([home-json]) were confirmed.
- UNVERIFIED: the exact body of `templateizeDatasourceUsage` and of `makeExportable`. The fetch returned a summary rather than verbatim code for those two functions; the `Input` and `ExternalDashboard` interfaces and the `DS_`/`VAR_` prefixes were returned verbatim ([exporter]).
- UNVERIFIED: `PanelMigrationModel` (the argument type of `PanelMigrationHandler`) — referenced in `panel.ts` but its definition was not returned; likewise the `shouldMigrate` predicate is in the `setMigrationHandler` signature ([panelplugin-ts]) but is not covered by the how-to guide ([pt-migration]).
- UNVERIFIED: Grafana's exact licence text for v13.2.2. `LICENSE` and `LICENSING.md` exist at the repo root ([repo-root]) but were not read.
- Not read: `apps/dashboard/kinds/v2alpha1` and `v2beta1` (only `v2` was read), `apps/dashboard/pkg/migration/conversion/*` (the v1→v2 converters), `transformDataFrame.ts`, `public/app/features/dashboard-scene/serialization/*` (the Scenes save/load model that sits between the JSON and the UI at 13.2), and the `Preferences`, `VariableKind` and `DataLink` definitions in the v2 CUE.
- Web search was unavailable for this session (budget exhausted), so every source below is a direct fetch of a repo file, a GitHub API response, or a grafana.com docs page. No blog posts were used.

[rel]: https://api.github.com/repos/grafana/grafana/releases/latest
[repo-root]: https://api.github.com/repos/grafana/grafana/contents?ref=v13.2.2
[types-gen]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-schema/src/raw/dashboard/x/types.gen.ts
[json-model-docs]: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/
[overrides-docs]: https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
[overrides-docs-v132]: https://grafana.com/docs/grafana/v13.2/panels-visualizations/configure-overrides/
[std-options-docs]: https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/
[transform-docs]: https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/
[share-docs]: https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/
[import-docs]: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/import-dashboards/
[http-api-dash]: https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/
[pt-index]: https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/
[pt-field-overrides]: https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides
[pt-migration]: https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/migration-handler-for-panels
[fieldOverrides-ts]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/types/fieldOverrides.ts
[panel-ts]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/types/panel.ts
[panelplugin-ts]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/panel/PanelPlugin.ts
[applyFieldOverrides]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/field/fieldOverrides.ts
[matcher-ids]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/transformations/matchers/ids.ts
[transformer-ids]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/transformations/transformers/ids.ts
[pqr]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/features/query/state/PanelQueryRunner.ts
[migrator]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/features/dashboard/state/DashboardMigrator.ts
[exporter]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/features/dashboard/components/DashExportModal/DashboardExporter.ts
[mig-readme]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/README.md
[mig-consts]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/schemaversion/migrations.go
[mig-migrate]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/migrate.go
[mig-versions]: https://api.github.com/repos/grafana/grafana/contents/apps/dashboard/pkg/migration/schemaversion?ref=v13.2.2
[kinds-dir]: https://api.github.com/repos/grafana/grafana/contents/apps/dashboard/kinds?ref=v13.2.2
[manifest]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/kinds/manifest.cue
[v2-spec]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/kinds/v2/dashboard_spec.cue
[devenv-filter]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/devenv/dev-dashboards/transforms/filter.json
[v1-color-modes]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/testdata/v1_dev_dashboards/panel-common/color_modes.json
[home-json]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/testdata/v1_dev_dashboards/home.json
[v42-testdata]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/apps/dashboard/pkg/migration/testdata/input/v42.hidefrom_tooltip.json
[timeseries-cfg]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/public/app/plugins/panel/timeseries/panelcfg.cue
[common-gen]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-schema/src/common/common.gen.ts
[toggles-ts]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/packages/grafana-data/src/types/featureToggles.gen.ts
[registry-go]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/pkg/services/featuremgmt/registry.go
[gomod]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/go.mod
[oac-docs]: https://raw.githubusercontent.com/grafana/grafana/v13.2.2/docs/sources/as-code/observability-as-code/_index.md
[docs-sources-dir]: https://api.github.com/repos/grafana/grafana/contents/docs/sources?ref=v13.2.2
[issue-123320]: https://github.com/grafana/grafana/issues/123320
[issue-126324]: https://github.com/grafana/grafana/issues/126324
[issue-126641]: https://github.com/grafana/grafana/issues/126641
