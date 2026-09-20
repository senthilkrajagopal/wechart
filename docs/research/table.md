---
library: TanStack Table + TanStack Virtual (data table & pivot table)
packages: ['@tanstack/react-table', '@tanstack/table-core', '@tanstack/react-virtual']
version: '@tanstack/react-table 9.2.4, @tanstack/react-virtual 3.14.13'
researched: 2026-09-19
sources:
  [
    https://registry.npmjs.org/@tanstack/react-table/latest,
    https://github.com/TanStack/table/blob/main/docs/guide/features.md,
    https://github.com/TanStack/table/blob/main/docs/framework/react/guide/row-selection.md,
    https://github.com/TanStack/table/blob/main/docs/framework/react/guide/cell-selection.md,
    https://github.com/TanStack/table/blob/main/docs/framework/react/guide/virtualization.md,
    https://www.ag-grid.com/license-pricing/,
    https://github.com/glideapps/glide-data-grid,
  ]
---

# TanStack Table 9.2.4 + TanStack Virtual 3.14.13

## Summary

Headless table state engine (`@tanstack/react-table`) plus a headless virtualizer (`@tanstack/react-virtual`); we render all markup, so the table is a real `<table>` we control. Chosen for the table/pivot renderer behind **AC-037** (render table and pivot table from a chart spec), **AC-178** (table view of every chart's data), **AC-046** (member-format applied in tables), **AC-092** (row marking with Shift-range, gated on primary key), **AC-114** (view marked rows, row count, export) and **AC-176** (keyboard reachability with visible focus).

Licence: both MIT ([react-table](https://registry.npmjs.org/@tanstack/react-table/latest), [react-virtual](https://registry.npmjs.org/@tanstack/react-virtual/latest)), with no feature gated behind a commercial tier — the whole feature set ships in the MIT package ([features guide](https://github.com/TanStack/table/blob/main/docs/guide/features.md)). This is the deciding difference from AG Grid (see Alternatives).

## Install

```bash
pnpm add @tanstack/react-table@9.2.4 @tanstack/react-virtual@3.14.13
```

- Peer deps: `react >=18` for react-table ([npm](https://registry.npmjs.org/@tanstack/react-table/latest)); `react`/`react-dom` `^16.8 || ^17 || ^18 || ^19` for react-virtual ([npm](https://registry.npmjs.org/@tanstack/react-virtual/latest)) — React 19 is in range for both.
- `@tanstack/react-table` is ESM-only (`"type": "module"`, `exports` only, `sideEffects: false`) and declares `engines.node >= 20` ([package.json](https://github.com/TanStack/table/blob/main/packages/react-table/package.json)). Fine for Vite + Node 26.
- Transitive deps: `@tanstack/table-core` and `@tanstack/react-store`; `@tanstack/virtual-core` for the virtualizer ([npm](https://registry.npmjs.org/@tanstack/react-table/latest)).
- Bundle (bundlephobia): react-table 120,827 B min / **31,751 B gzip** ([size](https://bundlephobia.com/api/size?package=@tanstack/react-table@9.2.4)); react-virtual 26,139 B / **7,792 B gzip** ([size](https://bundlephobia.com/api/size?package=@tanstack/react-virtual@3.14.13)). Docs state the full package is "approximately 25 KB minified and compressed" and features are tree-shakeable ([overview](https://github.com/TanStack/table/blob/main/docs/overview.md)).
- No auth/licence key of any kind.

## Init / auth pattern

v9 requires explicit feature registration — this is the main shape change from v8 ([features guide](https://github.com/TanStack/table/blob/main/docs/guide/features.md)):

```ts
import {
  tableFeatures,
  useTable,
  rowSelectionFeature,
  cellSelectionFeature,
  columnGroupingFeature,
  rowAggregationFeature,
  rowSortingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnOrderingFeature,
} from '@tanstack/react-table';

const features = tableFeatures({ rowSelectionFeature, cellSelectionFeature /* … */ });
// define `features` and `columns` at module scope, not inside the component
const table = useTable({ features, columns, data, getRowId: (r) => r[primaryKeyField] });
```

Render with `table.getHeaderGroups()`, `table.getRowModel()` and `table.FlexRender` ([quick start](https://github.com/TanStack/table/blob/main/docs/framework/react/quick-start.md)). Row models are registered separately from features (`createSortedRowModel()`, `createFilteredRowModel()`, …) so server-side/Cube-side processing stays possible ([features guide](https://github.com/TanStack/table/blob/main/docs/guide/features.md)).

## API surface we will use

**Row selection (AC-092, AC-114).** `rowSelectionFeature`; state is `{ [rowId]: boolean }`. Docs: `getToggleSelectedHandler()` "supports Shift range selection by default", following "the table's current logical display order, including filtering, grouping, sorting, and expansion"; toggles with `enableRowRangeSelection: false` and `isRowRangeSelectionEvent`. Also `enableMultiRowSelection`, `enableRowSelection: (row) => boolean`, `row.getCanSelect()`, `table.getSelectedRowModel()` ([row selection](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/row-selection.md)). AC-092's primary-key gate maps to `getRowId` (docs show UUID row ids producing meaningful state) plus `enableRowSelection: () => hasPrimaryKey`; `getSelectedRowModel().rows.length` supplies AC-114's row count.

**Cell selection / keyboard (AC-176).** `cellSelectionFeature` stores ranges as `anchor`/`focus` corners — "The `anchor` corner is where the selection started and stays put. The `focus` corner is the one that moves while dragging or Shift-extending." APIs: `table.moveCellSelection(direction)`, `table.extendCellSelection(direction)` ('up'|'down'|'left'|'right'), `cell.getIsSelected()`, `cell.getSelectionEdges()`, `table.getSelectedCellRangesData()`, `table.selectCellRange()`, `table.resetCellSelection()`. The docs are explicit that it "exposes imperative APIs rather than built-in keyboard handling" — we bind keydown to those calls and own the roving-tabindex/focus ring ([cell selection](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/cell-selection.md)).

**Grouping + totals (AC-037 pivot).** `columnGroupingFeature` and `rowAggregationFeature` are separate registrations; grouping state is an ordered array of column ids; `groupedColumnMode: 'reorder' | 'remove' | false`; `manualGrouping` for server-grouped data ([grouping](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/grouping.md)). Aggregations: `sum, count, min, max, extent, mean, median, unique, uniqueCount, first, last`, plus `'auto'` (numbers → `sum`, Dates → `extent`); render with `aggregatedCell` and detect with `cell.getIsAggregated()`. **Grand totals**: `column.getAggregationValue()` with no argument aggregates over the pre-grouped row model, and footers use the standard footer renderer ([aggregation](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/aggregation.md)).

**Pivot (cross-tab) is not in the library.** The grouping guide covers row grouping only; there is no column-grouping/cross-tab feature ([grouping](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/grouping.md)). We compute the cross-tab before rendering, from Cube: `ResultSet.tablePivot(pivotConfig): Array<object>` and `ResultSet.tableColumns(pivotConfig): TableColumn[]`, where `PivotConfig.x` are dimensions on rows and `.y` on columns, `measures` must be the last entry of its array, and `tableColumns` "supports hierarchical nesting when dimensions are pivoted" ([Cube JS SDK reference](https://docs.cube.dev/reference/javascript-sdk/reference/cubejs-client-core)). So: Cube produces pivoted columns and flat row objects; TanStack supplies header groups, row subtotals and grand totals.

**Virtualization (AC-114 at 10k–50k rows).** Table and virtualizer are independent: "TanStack Virtual decides which item indexes should be rendered for the current scroll position." Pass `table.getRowModel().rows` (rows) or `table.getVisibleLeafColumns()` (columns) to the virtualizer. Rows use absolute positioning with `transform: translateY()` and a `tbody` sized by `getTotalSize()`; **columns** use left/right spacer cells "rather than absolute positioning, maintaining table semantics" ([virtualization](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/virtualization.md)).

**Cell rendering, resizing, reordering (AC-046).** `cell`/`aggregatedCell`/`footer` renderers take arbitrary React, so member formats, inline bars, sparklines and conditional background rules are ordinary render functions ([quick start](https://github.com/TanStack/table/blob/main/docs/framework/react/quick-start.md), [aggregation](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/aggregation.md)). Resizing: `columnSizingFeature` + `columnResizingFeature`, `header.getResizeHandler()`, `column.getCanResize()`, `column.getIsResizing()`, `columnResizeMode: 'onEnd' | 'onChange'` ([column resizing](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/column-resizing.md)). Reordering: `columnOrderingFeature` ([features guide](https://github.com/TanStack/table/blob/main/docs/guide/features.md)).

**Off-main-thread option.** `createWorkerRowModel(tableWorker, stage)` can move `'filtered' | 'grouped' | 'sorted' | 'expanded'` into a Web Worker running a "shadow table"; offloaded stages must be a contiguous pipeline prefix; flat data only (no `getSubRows`); pagination stays on the main thread; grouping aggregates need both `rowAggregationFeature` and `columnGroupingFeature`; the worker must be terminated manually ([worker row models](https://github.com/TanStack/table/blob/main/docs/guide/worker-row-models.md)).

## Gotchas

- **v9 is young.** `@tanstack/react-table@9.0.0` was published 2026-08-04 ([release](https://api.github.com/repos/TanStack/table/releases/tags/@tanstack/react-table@9.0.0)); 9.2.4 (2026-08-28) fixes a crash where stale worker row-model payloads referenced missing core rows ([releases](https://api.github.com/repos/TanStack/table/releases)). Repo is active (pushed 2026-09-16, 65 open issues, MIT) ([repo](https://api.github.com/repos/TanStack/table)). `8.21.3` remains available as a fallback, but v8's peer range is `react >=16.8` and it lacks `cellSelectionFeature` and built-in Shift row-range selection ([8.21.3](https://registry.npmjs.org/@tanstack/react-table/8.21.3)).
- **Virtualization vs. table semantics.** The guide warns "native table layout does not work well with dynamic-height virtual rows" and recommends `table { display: grid } / tr { display: flex }`, noting this "breaks semantic HTML stricter interpretations" ([virtualization](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/virtualization.md)). For AC-176 we should keep fixed row heights so the native table layout survives, and regardless set `aria-rowcount`/`aria-rowindex` (and `aria-colcount`/`aria-colindex`) because only part of the rows are in the DOM — the APG table pattern requires exactly this when rows "are hidden or not present in the DOM" ([W3C APG table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/)).
- **Screen readers get whatever we emit.** Headless means zero built-in ARIA; the semantics in AC-176 are ours to write (native `<table>/<th scope>/<td>` is the strongest option available among the three candidates, since we control the markup).
- **Keyboard cell navigation and column resizing by keyboard are not provided.** Cell selection exposes only imperative move/extend ([cell selection](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/cell-selection.md)); the column-resizing guide documents only mouse/touch handlers ([column resizing](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/column-resizing.md)).
- **ESM-only + `engines.node >= 20`** ([package.json](https://github.com/TanStack/table/blob/main/packages/react-table/package.json)) — fine for Vite/Node 26, but any CommonJS tooling will fail to `require` it.
- Feature and column objects must be module-scoped; the features guide says to "define feature objects outside components to maintain stable configuration" ([features guide](https://github.com/TanStack/table/blob/main/docs/guide/features.md)).
- Common virtualization bug called out by docs: mapping `table.getRowModel().rows` instead of `virtualizer.getVirtualItems()` ([virtualization](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/virtualization.md)).

## Alternatives considered

**ag-grid-community 36.2.0** — MIT ([npm](https://registry.npmjs.org/ag-grid-community/latest)), deps `ag-stack@36.2.0` (MIT, [npm](https://registry.npmjs.org/ag-stack/latest)) and `ag-charts-types`; `ag-grid-react@36.2.0` is MIT with `react ^19` in peers ([npm](https://registry.npmjs.org/ag-grid-react/latest)). Best built-in accessibility of the three: `role="grid"`/`role="treegrid"`, `aria-rowcount`, `aria-colcount`, `aria-rowindex`, `aria-colindex`, `aria-sort`, `aria-selected`, `aria-expanded`, `rowgroup`/`columnheader`/`gridcell`, targeting WCAG 2.0 AA ([a11y docs](https://www.ag-grid.com/react-data-grid/accessibility/)); rich built-in keyboard model including arrows, Ctrl+arrows, Page Up/Down, Home/End, F2, Space, `Shift+←/→` to move columns and `Alt+←/→` to resize them ([keyboard nav](https://www.ag-grid.com/react-data-grid/keyboard-navigation/)); documented DOM virtualisation with a 10-row buffer above/below and a 500-rendered-row safety cap (`suppressMaxRenderedRowRestriction`) ([DOM virtualisation](https://www.ag-grid.com/react-data-grid/dom-virtualisation/)). **Rejected on licence**: Row Grouping, Pivoting, Aggregation, Cell Range Selection, clipboard copy/paste, Excel export, column menu and context menu are all Enterprise, paid ([pricing/feature matrix](https://www.ag-grid.com/license-pricing/)); the pivoting page is flagged `enterprise: true` ([pivoting](https://www.ag-grid.com/react-data-grid/pivoting/)) as is cell selection ([cell selection](https://www.ag-grid.com/react-data-grid/cell-selection/)). Only Shift-click _row_ range selection stays in Community ([multi-row selection](https://www.ag-grid.com/react-data-grid/row-selection-multi-row/)). AC-037's pivot and AC-092's range behaviour would therefore sit on the paid tier or be rebuilt outside the grid, and without a key Enterprise "will display a watermark and an error message in the console" in production ([licensing](https://www.ag-grid.com/react-data-grid/licensing/)). Heaviest bundle by far: 1,391,629 B min / **376,905 B gzip** ([size](https://bundlephobia.com/api/size?package=ag-grid-community@36.2.0)).

**@glideapps/glide-data-grid 6.0.3** — MIT ([npm](https://registry.npmjs.org/@glideapps/glide-data-grid/latest)), 189,167 B / **63,787 B gzip** plus peer deps `lodash`, `marked`, `react-responsive-carousel` ([size](https://bundlephobia.com/api/size?package=@glideapps/glide-data-grid@6.0.3)). Canvas-rendered, "scales to millions of rows", with keyboard arrows, Shift+arrow range extension, Home/End and Escape ([README](https://github.com/glideapps/glide-data-grid/blob/main/README.md), [API.md](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/API.md)). **Rejected on React 19 and accessibility.** The published `latest` (6.0.3, released 2024-02-03) declares peers `react: ^16.12.0 || 17.x || 18.x` — no React 19 ([npm](https://registry.npmjs.org/@glideapps/glide-data-grid/latest), [releases](https://api.github.com/repos/glideapps/glide-data-grid/releases)); React 19 appears only on the unreleased `beta` channel, `6.0.4-alpha25` ([main package.json](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/package.json), [dist-tags](https://registry.npmjs.org/@glideapps/glide-data-grid)), whose last commits are 2026-01-21 ([commits](https://api.github.com/repos/glideapps/glide-data-grid/commits)). Accessibility: canvas means no native table semantics; the project ships an accessibility DOM tree only behind an experimental flag (`experimental.disableAccessibilityTree`) ([API reference](https://docs.grid.glideapps.com/api/dataeditor)) and the maintainers state "none of the primary developers are accessibility users so there are likely flaws in the implementation we are not aware of" ([README](https://github.com/glideapps/glide-data-grid/blob/main/README.md)). It also has no grouping/aggregation/pivot at all — the README feature list and API reference document cell types, selection and editing only ([README](https://github.com/glideapps/glide-data-grid/blob/main/README.md)).

**Recommendation: `@tanstack/react-table@9.2.4` + `@tanstack/react-virtual@3.14.13`, with the pivot cross-tab computed by Cube's `ResultSet.tablePivot`/`tableColumns`.** Reasons, in AC order: it is the only candidate whose grouping, aggregation, grand totals, row-range selection and cell-range selection are all in a permissively licensed package with nothing behind a paid tier (AC-037, AC-092, AC-114) ([features](https://github.com/TanStack/table/blob/main/docs/guide/features.md), [pricing comparison](https://www.ag-grid.com/license-pricing/)); Shift-range row marking that follows display order is built in and can be gated per row on primary-key availability via `enableRowSelection`/`getRowId` (AC-092) ([row selection](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/row-selection.md)); rendering real `<table>` markup gives screen readers native table semantics rather than canvas or a vendor's ARIA layer, which is the strongest position for AC-176 and AC-178 ([overview](https://github.com/TanStack/table/blob/main/docs/overview.md), [APG](https://www.w3.org/WAI/ARIA/apg/patterns/table/)); arbitrary React cell renderers carry Cube member formats, bars and conditional styling into every cell (AC-046); and it is the smallest payload of the three by an order of magnitude versus AG Grid (~40 KB gzip combined vs ~377 KB) ([sizes](https://bundlephobia.com/api/size?package=@tanstack/react-table@9.2.4)). The costs accepted are that cross-tab column headers and column-direction subtotals come from Cube rather than the grid, and that all ARIA and keyboard wiring is ours.

## Open questions / unverified

- **UNVERIFIED — measured performance at 10,000 and 50,000 rows.** I found no published benchmark for TanStack Table/Virtual at those sizes. Documented claims only: TanStack Virtual is "for rendering massive lists, grids, and tables at 60FPS" with a 10,000-item example and no stated maximum ([README](https://github.com/TanStack/virtual/blob/main/README.md), [intro](https://tanstack.com/virtual/latest/docs/introduction)); glide claims millions of rows ([README](https://github.com/glideapps/glide-data-grid/blob/main/README.md)); AG Grid documents a 500-rendered-row cap ([DOM virtualisation](https://www.ag-grid.com/react-data-grid/dom-virtualisation/)). Recommend we measure 10k/50k against our own row shape before committing the AC-114 export path.
- **UNVERIFIED — Cube's 10,000 default / 50,000 maximum row limit.** Caller-supplied; the two Cube doc URLs I tried (`/reference/core-data-apis/rest-api/query-format`, `/product/apis-integrations/queries#row-limit`) did not state the numbers. _(These are cited in `cube/data-apis.md` and `cube/configuration-deployment.md`.)_
- **UNVERIFIED — AG Grid's stated React version support page.** `ag-grid-react@36.2.0` peers include `^19.0.0` ([npm](https://registry.npmjs.org/ag-grid-react/latest)), but the getting-started page carries no compatibility statement. Moot given the licence rejection.
- Open decision for the caller: should column-direction subtotals for the pivot be requested from Cube as extra queries, or computed client-side over `tablePivot` output? The library gives row subtotals and grand totals but no column-group subtotals ([grouping](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/grouping.md), [aggregation](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/aggregation.md)).
- Open decision: whether to adopt v9 now (built-in Shift row-range + `cellSelectionFeature`, stable for ~6 weeks) or pin v8.21.3. I recommend v9; flagging the maturity risk explicitly.
