---
packages: [echarts]
version: 6.1.0
researched: 2026-10-18
---

# ECharts sankey series

All `E/...` paths are under `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/`, and `Z/...` under `.../zrender@6.1.0/node_modules/zrender/`. The installed version is **6.1.0** (`packages/charts/package.json` pins `"echarts": "6.1.0"`). Sources at the tag: https://github.com/apache/echarts/tree/6.1.0/src/chart/sankey. Line numbers refer to the installed compiled JS. Option docs: https://echarts.apache.org/en/option.html#series-sankey and https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/sankey.md.

For T987–T989 (AC-611 … AC-613): a 2–4 step flow chart with per-step nodes, per-member colours on one step, links coloured by source or target, outside labels with totals, a repeated member split into its own node, and marking by node or link.

## Registration

- `import { SankeyChart } from 'echarts/charts'`, re-exported as `export { install as SankeyChart } from '../chart/sankey/install.js'` (`E/lib/export/charts.js:62`).
- `install` registers `SankeyView`, `SankeySeriesModel`, the layout and visual stages, the `dragNode` action and roam actions (`E/lib/chart/sankey/install.js:50-70`).
- With `ssr: true`, every element with a `dataIndex` gets `ecmeta_series_index`, `ecmeta_data_index` and `ecmeta_ssr_type` attributes (`E/lib/core/echarts.js:312-325`; `Z/lib/svg/graphic.js:41-51`).

## Data shape

- Nodes come from `data || nodes`, links from `edges || links` (`SankeySeries.js:62-63`).
- A node's identity is `id ?? name ?? index` (`createGraphFromNodeEdge.js:56-60`). The docs say a node name "must be unique".
- A link's `source`/`target` is a node index or an `id ?? name`; an unresolved end drops the link **silently**, and later edge `dataIndex`es shift (`Graph.js:106-124`; `createGraphFromNodeEdge.js:64-74`).
- An edge's name is `link.id ?? source + ' > ' + target` (`createGraphFromNodeEdge.js:71`).
- **Per-link `lineStyle.color` and `lineStyle.opacity` both work.** Each curve takes its own item model's `lineStyle` (`SankeyView.js:134-135, 185`); `color` maps to `fill`, and `'source' | 'target' | 'gradient'` are replaced by the source node's colour, the target node's, or a gradient (`SankeyView.js:186-187, 307-330`). The same runs for emphasis, blur and select (`SankeyView.js:206-210`).
- Per-node `itemStyle.color` overrides the value-mapped colour (`sankeyVisual.js:74-79`); the rest of `itemStyle` comes from the item model (`SankeyView.js:223-233`).
- `levels[].depth` must be a natural number (`SankeySeries.js:71-73`); a link's level is its **source** node's depth (`SankeySeries.js:91-103`).

## Layout

Defaults (`SankeySeries.js:172-223`): `left '5%'`, `top '5%'`, `right '20%'`, `bottom '5%'`, `orient 'horizontal'`, `nodeWidth 20`, `nodeGap 8`, `draggable true`, `layoutIterations 32`, `nodeAlign 'justify'`.

- A node's column is its longest path from a source (Kahn traversal), **unless the node item has `depth >= 0`, which forces its column** and exempts it from `justify`/`right` moves (`sankeyLayout.js:97-167`). With `justify`, sinks without a depth jump to the last column (`sankeyLayout.js:197-216`): set `depth` = step index on every node.
- Column x = `depth * (width - nodeWidth) / maxDepth` (`sankeyLayout.js:157-162, 223-232`). One value-to-pixel scale for all columns (`sankeyLayout.js:272-284`).
- Within a column the initial order is the data order; relaxation passes then move nodes (`sankeyLayout.js:247-255, 285-320, 372-452`). **Any node of computed value 0 forces 0 iterations** (`sankeyLayout.js:63-66`).
- `draggable` (default true) makes a mousedown-drag dispatch `dragNode` and store `localX/localY` (`SankeyView.js:254-276`). Set `draggable: false` for marking.

## Cycles and duplicates

- A cycle throws `'Sankey is a DAG, the original data has cycle!'` during `setOption` (`sankeyLayout.js:152-156`). A self-link is a cycle.
- A duplicate node identity is not merged: a dev-only `console.error('Graph nodes have duplicate name or id')`, the node is skipped, and (from reading `Graph.js:241-246`, not run) later nodes misalign. **Every node needs a unique identity.**

## Labels and values

- Default `label: { show: true, position: 'right', fontSize: 12 }` (`SankeySeries.js:192-200`); `position` takes zrender's built-in positions (`Z/lib/core/types.d.ts:14`) and can be set per node or per level.
- A node without its own `value` has `max(sum(out), sum(in), 0)` (`sankeyLayout.js:80-90`); label and tooltip params use it (`SankeySeries.js:158-166`).

## Emphasis and blur

- `emphasis.focus` takes `'none' | 'self' | 'series' | 'adjacency' | 'trajectory'` (`SankeySeries.d.ts:21-25`; `Graph.js:314-440`).
- Default `lineStyle: { color: '#86878c' (neutral50), opacity: 0.2, curveness: 0.5 }` and `emphasis: { label: { show: true }, lineStyle: { opacity: 0.5 } }` (`SankeySeries.js:203-220`; `E/lib/visual/tokens.js:63`).
- An emphasis style without its own fill **lifts the colour** (`E/lib/util/states.js:177-185`); set `emphasis.lineStyle.color` (`'source'`/`'target'` are resolved too). Blur without its own opacity is ×0.1 (`states.js:221-239`); set it explicitly.

## Events and tooltips

- Event params come from `getDataParams(dataIndex, dataType)` (`E/lib/core/echarts.js:841-866`).
- Node: `dataType: 'node'`, `name`, `data` (the raw node item), `value` (own or computed), `dataIndex` (`SankeyView.js:250`).
- Link: `dataType: 'edge'`, `name`, `data` (the raw link item, so `data.source`/`data.target`), `value`, `dataIndex` among valid links (`SankeyView.js:130-133`; `linkSeriesData.js:138-141`). Map a click back through `params.data`, not the index.
- Item tooltips use the same params; a per-item `tooltip.formatter` is honoured (`E/lib/component/tooltip/TooltipView.js:446-473`).

## SVG (SSR)

- Nodes are `Rect`s at `z2: 10`, written as `<path d="M x y l w 0 …">` (`SankeyView.js:224-234`; `Z/lib/svg/SVGPathRebuilder.js:68-71`).
- Links are filled bezier bands `<path d="M… C… L… C… Z">` with no stroke; thickness `max(1, dy)` (`SankeyView.js:77-89, 154`). All edges are added before all nodes (`SankeyView.js:128, 217`).
- `fill-opacity` is written only when below 1: a link at 0.4 is `fill-opacity="0.4"` (`Z/lib/svg/mapStyleToAttrs.js:18-33`).
- The layout box offset is a `transform` on each element (`SankeyView.js:123-124`).
- Use `animation: false`: the first render otherwise has a growing clip rect (`SankeyView.js:277-281, 332-347`).

## Gotchas

- Unique node identities per step (e.g. "EMEA" and "EMEA (2)").
- Unresolved link ends are dropped silently.
- `right: '20%'` default reserves room for right-hand labels; put the last step's labels on the left, or set the margin.
- Escape member names in tooltip HTML.

## Open questions

- The duplicate-name `TypeError` and an edge's `params.color` being undefined come from reading the source, not running it.
- Label `<text>` markup was not rendered here; tests confirm it.
