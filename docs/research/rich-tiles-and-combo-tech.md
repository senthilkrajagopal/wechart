---
library: Rich text tile editor (Tiptap, recommended) and ECharts combo/micro-chart techniques
packages: [@tiptap/core, @tiptap/pm, @tiptap/react, @tiptap/starter-kit, @tiptap/static-renderer, @tiptap/static-renderer/json/react, @tiptap/static-renderer/pm/react, @tiptap/markdown, @tiptap/extension-mention, @tiptap/suggestion, @tiptap/extension-collaboration, echarts, echarts/core, echarts/charts, echarts/components, echarts/features, echarts/renderers, echarts-stat, d3-shape, lexical, @lexical/react, @lexical/markdown, @lexical/mdast, @lexical/headless, @lexical/a11y, @lexical/yjs, @blocknote/core, @blocknote/react, @blocknote/server-util, platejs, platejs/static, @platejs/markdown, @platejs/mention, @platejs/slash-command, slate-react, prosemirror-model, prosemirror-state, prosemirror-view, prosemirror-markdown, @handlewithcare/react-prosemirror]
version: '@tiptap/* 3.32.0 (core, pm, react, starter-kit, static-renderer, markdown, extension-mention, suggestion); echarts 6.1.0; echarts-stat 1.2.0; d3-shape 3.2.0. Compared and not chosen: lexical and @lexical/* 0.52.0; @blocknote/core and @blocknote/react 0.56.0; platejs 53.3.15; slate-react 0.145.1; prosemirror-view 1.42.6; prosemirror-markdown 1.13.8; @handlewithcare/react-prosemirror 3.2.11'
researched: 2026-10-18
sources:
  [
    https://registry.npmjs.org/@tiptap/react/latest,
    https://github.com/ueberdosis/tiptap/releases,
    https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/static-renderer.mdx,
    https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/node-views/react.mdx,
    https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx,
    https://github.com/advisories/GHSA-c8x8-7fp4-3x9w,
    https://prosemirror.net/docs/changelog/,
    https://lexical.dev/docs/concepts/decorators,
    https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content,
    https://platejs.org/docs/static,
    https://prosemirror.net/docs/guide/,
    https://echarts.apache.org/en/option.html,
    https://echarts.apache.org/handbook/en/concepts/dataset/,
    https://echarts.apache.org/handbook/en/concepts/data-transform/,
    https://echarts.apache.org/handbook/en/how-to/cross-platform/server/,
    https://github.com/apache/echarts-doc/blob/master/en/changelog.md,
    https://github.com/ecomfe/echarts-stat,
  ]
---

# Rich text tiles (Tiptap 3.32.0) and combo charts and micro-charts (ECharts 6.1.0)

## Summary

This doc covers the rich tiles and combo charts in phase 3. They come from the user's 2026-10-18 note (`docs/inputs/2026-10-18-phase-3-advanced-analytics.md`). That note says no requirement, AC or task exists for them yet, so this doc cites no new AC IDs. It touches these existing ACs:
- **AC-208**, the markdown tile, which renders "no raw HTML" by construction (`packages/web/src/tiles/Markdown.tsx`);
- **AC-116**, the live `{{…}}` tokens in that tile;
- **AC-218**, combo charts;
- **AC-037**, the chart types, including the current single-axis `packages/charts/src/series/combo.ts`;
- **AC-174/AC-175**, dashboard performance.

**Recommendation for the editor: Tiptap 3.32.0, using only its MIT open-source packages.** It is chosen on correctness, security, performance and fit:

1. **Live inline elements are React components in both modes.** In edit mode, an inline atom node is drawn by `ReactNodeViewRenderer`. In read mode, the same component is mapped through `@tiptap/static-renderer/json/react`.
   - That renderer draws a document "without ProseMirror runtime dependencies" ([static-renderer docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/static-renderer.mdx)). It is 3,688 B gzip ([Bundlephobia](https://bundlephobia.com/api/size?package=@tiptap/static-renderer@3.32.0)).
   - So a dashboard in read mode never loads the editor.
2. **Read mode is XSS-safe by construction.** The React static renderer builds elements with `React.createElement` only and never uses `dangerouslySetInnerHTML` ([source](https://github.com/ueberdosis/tiptap/blob/main/packages/static-renderer/src/pm/react/react.ts)). That is the same property AC-208 relies on today.
3. **Storage is plain JSON:** ProseMirror's `toJSON`/`nodeFromJSON` format ([ProseMirror guide](https://prosemirror.net/docs/guide/)). Tiptap can check strictly that content matches the schema, with `enableContentCheck` ([schema docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/core-concepts/schema.mdx)).
4. **It is stable under semver (3.x), MIT, and actively released.** There were eight releases from 3.30.5 (Aug 28) to 3.32.0 (Oct 13), including security fixes ([releases](https://github.com/ueberdosis/tiptap/releases)).

**Recommendation for combo charts:** stay on ECharts 6.1.0 primitives:
- mixed `series[].type` with `yAxisIndex`;
- `alignTicks`;
- per-axis `stack` ids;
- series-level `markLine` and `markArea`.

Pivoting "split by dimension" stays in `@wechart/core`, and trend lines are computed outside ECharts. Each choice is sourced below.

**Recommendation for sparklines inside rich text:** small SVG components that wechart renders in React itself, not ECharts instances. The reasons are in §3.

## Install

```bash
pnpm add @tiptap/core@3.32.0 @tiptap/pm@3.32.0 @tiptap/react@3.32.0 \
  @tiptap/starter-kit@3.32.0 @tiptap/static-renderer@3.32.0 \
  @tiptap/extension-mention@3.32.0 @tiptap/suggestion@3.32.0
# only if markdown round-trip through Tiptap is chosen (see Gotchas: beta):
pnpm add @tiptap/markdown@3.32.0
# only if ecStat regression is chosen (see §2, trend lines):
pnpm add echarts-stat@1.2.0
```

**Peer dependencies of `@tiptap/react` 3.32.0:**
- React and react-dom `^17 || ^18 || ^19`;
- `@tiptap/pm` and `@tiptap/core` pinned to exactly `3.32.0`.

Its runtime deps are `fast-equals`, `use-sync-external-store` and `@types/use-sync-external-store` ([registry](https://registry.npmjs.org/@tiptap/react/latest)). wechart is on React 19.3.0 (`packages/web/package.json`), which the peer range covers.

**Other packages:**
- `@tiptap/static-renderer` 3.32.0 is MIT. Its peers are react, react-dom, and `@tiptap/pm`/`@tiptap/core` at 3.32.0. Its exports are `.`, `./pm/react`, `./json/react`, `./pm/markdown`, `./pm/html-string` and `./json/html-string` ([registry](https://registry.npmjs.org/@tiptap/static-renderer/latest)).
- `@tiptap/markdown` 3.32.0 is MIT and depends on `marked ^17.0.1` ([registry](https://registry.npmjs.org/@tiptap/markdown/latest)).
- `@tiptap/extension-mention` 3.32.0 is MIT, with peers `@tiptap/pm`, `@tiptap/core` and `@tiptap/suggestion` at exactly 3.32.0 ([registry](https://registry.npmjs.org/@tiptap/extension-mention/latest)).

**Security floor:** `@tiptap/pm` must resolve `prosemirror-view` ≥ 1.42.3.
- Tiptap v3.31.2 bumped it for GHSA-c8x8-7fp4-3x9w, "pasting crafted HTML could run arbitrary JavaScript" ([v3.31.2](https://github.com/ueberdosis/tiptap/releases/tag/v3.31.2)).
- The advisory rates it High (CVSS 8.5), affecting `< 1.42.3`, published 2026-08-25 ([GHSA](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w)).
- The latest is 1.42.6, dated 2026-09-25 ([changelog](https://prosemirror.net/docs/changelog/), [registry](https://registry.npmjs.org/prosemirror-view/latest)).

**Bundle sizes:**

| Package | Min | Gzip | Note |
| --- | --- | --- | --- |
| `@tiptap/core` | 119,787 B | 36,782 B | ProseMirror excluded ([Bundlephobia](https://bundlephobia.com/api/size?package=@tiptap/core@3.32.0)) |
| `prosemirror-view` with its 3 deps | 180,347 B | 54,670 B | ([Bundlephobia](https://bundlephobia.com/api/size?package=prosemirror-view@1.42.6)) |
| `@tiptap/react` | — | 8,760 B | ([Bundlephobia](https://bundlephobia.com/api/size?package=@tiptap/react@3.32.0)) |
| `@tiptap/starter-kit`, all 24 deps | — | 106,422 B | ([Bundlephobia](https://bundlephobia.com/api/size?package=@tiptap/starter-kit@3.32.0)) |
| `@tiptap/static-renderer` | — | 3,688 B | ([Bundlephobia](https://bundlephobia.com/api/size?package=@tiptap/static-renderer@3.32.0)) |

`@tiptap/pm` was rate-limited (HTTP 429), so it has no figure (see Open questions). The editor belongs in a lazily loaded chunk that only edit mode imports; read mode needs only the static renderer.

**Vite and ESM:** no extra configuration was found to be needed. UNVERIFIED for this repo until the first import; check it with `vite build`.

## Init / auth pattern

There is no auth, because only MIT packages are used. Tiptap's Pro and Cloud extensions (comments, AI, version history) are installed from Tiptap's private registry with a token ([pro-extensions](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/pro-extensions.mdx)). None is needed here.

**Edit mode** (Vite + React 19):

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { LiveValue } from './nodes/LiveValue'; // our inline atom node

const editor = useEditor({
  extensions: [StarterKit, LiveValue /*, Mention, SlashMenu */],
  content: storedDoc,            // Tiptap/ProseMirror JSON
  enableContentCheck: true,      // emit contentError on schema mismatch
  shouldRerenderOnTransaction: false, // v3 default
  editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': tileTitle } },
});
return (
  <TileDataProvider value={liveData}>   {/* context reaches node views: see below */}
    <EditorContent editor={editor} />
  </TileDataProvider>
);
```

- **`shouldRerenderOnTransaction` defaults to off in v3.** UI that depends on editor state should use `useEditorState` ([upgrade guide](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/upgrade-tiptap-v2.mdx), [performance](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/performance.mdx)).
- **`enableContentCheck` and `contentError`:** checking is "100% accurate on JSON content types" ([schema](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/core-concepts/schema.mdx)).
- **The ARIA role must be set by us.** Tiptap's accessibility guide says "The editor should have the `role="textbox"`" and that the toolbar and menus should carry `toolbar`, `menu` and `menuitem` roles ([accessibility](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/accessibility.mdx)). Attributes go through `editorProps.attributes` ([style docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/getting-started/style-editor/index.mdx)).

**Read mode** (dashboard). Nothing from ProseMirror is loaded:

```tsx
import { renderJSONContentToReactElement } from '@tiptap/static-renderer/json/react';

const element = renderJSONContentToReactElement({
  content: storedDoc,
  options: {
    nodeMapping: { doc: Doc, paragraph: P, heading: H, liveValue: LiveValueView, sparkline: SparklineView /* … */ },
    markMapping: { bold: Strong, italic: Em, link: SafeLink, code: Code },
    unhandledNode: () => null, unhandledMark: ({ children }) => children,
  },
});
```

- The `json` namespace "Requires custom mappings for all nodes and marks". The `pm` namespace instead derives its mappings from each extension's `renderHTML` ([static-renderer docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/static-renderer.mdx)).
- The exact option shape of `renderJSONContentToReactElement` was taken from the docs' description of the `json` namespace (`nodeMapping`, `markMapping`, `unhandledNode`, `unhandledMark`). Confirm it against the installed `.d.ts`, because the docs show the signature in full only for `renderToReactElement` (`pm`).

## API surface we will use

### 1. Rich text editor

**Custom inline node** (live value, sparkline, KPI with delta, button):

```ts
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

export const LiveValue = Node.create({
  name: 'liveValue',
  group: 'inline', inline: true, atom: true, selectable: true,
  addAttributes: () => ({ ref: { default: null }, format: { default: null } }), // a reference, never the data
  parseHTML: () => [{ tag: 'span[data-live-value]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-live-value': '', ...HTMLAttributes }],
  addNodeView: () => ReactNodeViewRenderer(LiveValueNodeView),
});
```

- **Node options.** `group: 'inline'`, `inline: true` and `atom: true` together give an inline, indivisible node; this is the pattern of Tiptap's own mention example ([markdown utilities](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/api/utilities.mdx), [node API](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/create-new/node.mdx)).
- **Wrapper element.** `NodeViewWrapper` renders a `<span>` for inline nodes; the `as` option and `contentDOMElementTag` change that ([React node views](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/node-views/react.mdx)).
- **Props.** Node view props include `node`, `updateAttributes`, `selected` and `editor` (same page).
- **Re-rendering on outside data without remounting the editor.** Node views are mounted as `ReactDOM.createPortal(renderer.reactElement, renderer.element, id)` by a `Portals` component. That component is rendered *inside* `EditorContent` and subscribed with `useSyncExternalStore` ([EditorContent.tsx](https://github.com/ueberdosis/tiptap/blob/main/packages/react/src/EditorContent.tsx)).
  - React's rule for portals is that "the child can access the context provided by the parent tree" ([react.dev createPortal](https://react.dev/reference/react-dom/createPortal)).
  - Tiptap's FAQ says to wrap `EditorContent` in a provider so node views can read context ([FAQ](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/faq.mdx)).
  - So a node view that reads tile data from a context or an external store re-renders when that data changes, with no editor transaction and no remount.
  - Keep the data out of node attributes. `updateAttributes` is a document change ([React node views](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/node-views/react.mdx)), so it would enter undo history and the saved spec.
- **Read mode** uses the same component through `nodeMapping` (above). One component, two hosts.

**Slash menu and mentions** (MIT):
- `@tiptap/suggestion` defines the popup lifecycle (`items`, `render` → `onStart`/`onUpdate`/`onKeyDown`/`onExit`), drawn with `ReactRenderer`. `char` defaults to `'@'` ([suggestion](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/suggestion.mdx)).
- A slash menu is the same utility with `char: '/'`.
- Tiptap's UI Components include `useSlashDropdownMenu` and `SuggestionMenu` ([slash-dropdown-menu](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/components/slash-dropdown-menu.mdx)). They are MIT where the underlying extension is open source ([UI components license](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/ui-components/getting-started/overview.mdx)).
- Building our own menu on `@tiptap/suggestion` keeps our design tokens and `role="menu"` semantics (AC-176) under our control. That is a design choice, not a sourced claim.

**Storage:**
- `editor.getJSON()` returns the document, and `setContent(json, { errorOnInvalidContent: true })` restores it ([setContent](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/commands/content/set-content.mdx)).
- The format is ProseMirror's JSON: `{ type, attrs?, content?, marks?, text? }` ([guide](https://prosemirror.net/docs/guide/)).
- The node and mark names are ours, so the stored spec is a wechart-owned tree that no Tiptap class defines. Wrap it in a wechart version field and validate it with wechart's own schema on save and load.

**Markdown** (for the existing markdown tile):
- With `@tiptap/markdown`: `contentType: 'markdown'` on load, `editor.getMarkdown()`, and `MarkdownManager.parse()` without an editor. Per-node `markdownTokenizer`, `parseMarkdown` and `renderMarkdown` hooks exist ([markdown index](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx), [custom tokenizer](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/advanced-usage/custom-tokenizer.mdx), [examples](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/examples.mdx)).
- A custom inline tokenizer would map today's `{{…}}` tokens (AC-116) to `liveValue` nodes.
- HTML inside markdown is parsed through the extensions' `parseHTML` rules ([basic usage](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/getting-started/basic-usage.mdx)). Anything not in the schema is dropped, so it never becomes raw HTML.
- The extension is marked **beta**: "early release … may have edge cases" ([markdown index](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/index.mdx)). See Gotchas for its open defects.
- The alternative for a one-way import is to walk wechart's own markdown subset (`Markdown.tsx`: headings, emphasis, lists, code and tokens) into Tiptap JSON. This is a design option, not a sourced claim.

**Paste and links:**
- `transformPastedHTML` runs over pasted HTML before parsing, ordered by priority ([extension API](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/custom-extensions/create-new/extension.mdx)).
- Unknown content is stripped by default ([invalid schema](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/core-concepts/schema.mdx)).
- The Link mark rejects a disallowed href in `parseHTML` and blanks it (`href: ''`) in `renderHTML`. Its default allow list is http, https, ftp, ftps, mailto, tel, callto, sms, cid and xmpp, plus `protocols`; `isAllowedUri` overrides it ([link.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-link/src/link.ts), [Link docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/extensions/marks/link.mdx)).
- In read mode with the `json` renderer, the `link` entry in `markMapping` is our own component, so it must apply the same URL check. The `json` namespace does not run `renderHTML`.

**Collaboration (later):**
- `@tiptap/extension-collaboration` with Yjs and the open-source Hocuspocus server ([collaboration overview](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/collaboration/getting-started/overview.mdx), [Hocuspocus guide](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/hocuspocus/guides/collaborative-editing.mdx)).
- Hocuspocus's own license was not checked. UNVERIFIED.

### 2. ECharts 6.1.0 for combo charts

Read alongside `docs/research/echarts.md`, which covers the import set, events, `stackOrder` and the v6 breaking changes.

- **Mixed series in one grid.** Each series has its own `type` (`'bar' | 'line' | 'scatter'`; an area is a `line` with `areaStyle`) and binds to axes with `xAxisIndex` and `yAxisIndex`. Two yAxes can share one xAxis, with `yAxisIndex` choosing the axis per series ([basic concepts](https://github.com/apache/echarts-doc/blob/master/en/tutorial/basic-concepts-overview.md)). `ScatterChart` and `LineChart` are already in wechart's import set (`docs/research/echarts.md`).
- **Multiple yAxes.**
  - "Usually a single grid component can place at most 2 y axis… `offset` can be used to avoid overlap when you need to put more than two" ([yAxis](https://github.com/apache/echarts-doc/blob/master/en/option/component/y-axis.md)).
  - `position: 'left' | 'right'` sets the side; the second axis defaults to the opposite side.
  - Both `position` and `offset` need `axisLine.onZero: false` (same page).
  - So 4 axes means 2 per side, with `offset` in pixels. Product open question: are 4 axes the right limit?
- **`alignTicks` (value and log axes only)** ([yAxis.alignTicks](https://github.com/apache/echarts-doc/blob/master/en/option/component/y-axis.md)).
  - **Reference axis.** In 6.1.0 the axis aligned *to* is "the last one that does not request `alignTicks`". If every axis requests it, the first one is used. An axis with a user `interval` is excluded ([Grid.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/Grid.ts)).
  - **How it aligns.** The aligned axis takes the reference axis's segment count. Its extent "must NOT shrink… can expand… slightly". Fixed `min`/`max` are respected. Log axes use a linear stub, with the comment "PENDING: We do not find a acceptable precision for LogScale here" ([axisAlignTicks.ts](https://github.com/apache/echarts/blob/6.1.0/src/coord/axisAlignTicks.ts)).
  - **Zero alignment is not guaranteed.** The feature requests are still open: [#16154](https://github.com/apache/echarts/issues/16154) "Align multiple Y Axis 0 line" and [#18541](https://github.com/apache/echarts/issues/18541) (zero-tick alignment).
  - **Other open bugs:** [#18876](https://github.com/apache/echarts/issues/18876) (`minInterval` ignored), [#21116](https://github.com/apache/echarts/issues/21116) and [#18063](https://github.com/apache/echarts/issues/18063) (float-precision labels), [#19967](https://github.com/apache/echarts/issues/19967) and [#17607](https://github.com/apache/echarts/issues/17607) (blank space on the right).
  - **Consequence:** for zero alignment, wechart must compute each axis's `min`/`max` itself. Give each axis the same negative-to-positive ratio, then set `alignTicks` or `interval`. This is a wechart algorithm with no third-party source. Combining it with `minInterval` hits #18876 (see `docs/research/echarts-axis-legend-bars.md`).
- **`dataset` and `encode`.**
  - `series.encode` maps dataset columns to `x`/`y`. `seriesLayoutBy: 'column' | 'row'` (default `'column'`) maps series to columns or rows. `datasetIndex` picks one of several datasets ([dataset handbook](https://echarts.apache.org/handbook/en/concepts/dataset/)).
  - The built-in transforms are only `filter` and `sort`, which can be piped. External transforms are registered with `echarts.registerTransform` ([data-transform handbook](https://echarts.apache.org/handbook/en/concepts/data-transform/)).
  - **There is no pivot transform.** Splitting one series by a dimension needs either one `filter` dataset per member, or a long-to-wide pivot before `setOption`.
  - wechart already pivots in `@wechart/core` (`seriesOf`, used by `combo.ts`). Keeping it there keeps the spec engine-neutral and avoids N filter passes.
  - Since 5.2.0, series that share one dataset "process the data once". The handbook's 1,000-series case renders in "300 ms or less" ([5.2.0 notes](https://github.com/apache/echarts-handbook/blob/master/contents/en/basics/release-note/5-2-0.md)).
- **Stacking inside a combo.**
  - Series with the same `stack` stack together. Only a `value` or `log` axis can be the stacked axis ([stack option](https://github.com/apache/echarts-doc/blob/master/en/option/partial/stack.md)).
  - `stackStrategy` is `'samesign'` (the default), `'all'`, `'positive'` or `'negative'`. `stackOrder` is `'seriesAsc'` or `'seriesDesc'` and must be set on every series in the stack (same page).
  - **Stack groups are keyed by the `stack` string alone**, regardless of type or axis ([dataStack.ts](https://github.com/apache/echarts/blob/6.1.0/src/processor/dataStack.ts)). Namespace stack ids per y-axis (for example `${axisIndex}:${group}`), so that series on different axes never stack together.
- **Reference lines and areas** (`MarkLineComponent` and `MarkAreaComponent` are already imported).
  - `markLine.data` items take `type: 'min' | 'max' | 'average' | 'median'`, `yAxis: <value>`, `coord`, or pixel/percent `x`/`y`. A pair of points makes a segment ([mark-line](https://github.com/apache/echarts-doc/blob/master/en/option/partial/mark-line.md)).
  - `markArea.data` is a pair of corners, using `type`, `yAxis`/`xAxis`, `coord` (with `'min'`/`'max'`) or pixels ([mark-area](https://github.com/apache/echarts-doc/blob/master/en/option/partial/mark-area.md)).
  - Markers belong to a series, so they use that series' axis. In 6.0, markers gained `z`/`z2` and `relativeTo` ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- **Regression and trend lines.**
  - `echarts-stat` 1.2.0 (BSD) offers `ecStat:regression` with `method: 'linear' | 'exponential' | 'logarithmic' | 'polynomial'` ([README](https://github.com/ecomfe/echarts-stat), [registry](https://registry.npmjs.org/echarts-stat/latest)).
  - Its other options, with defaults: `order` (2), `dimensions` (`[0, 1]`), and `formulaOn` (`'end'`; or `'start'`, `'all'`, `'none'`). It reads `upstream.cloneRawData()` ([regression.js](https://github.com/ecomfe/echarts-stat/blob/master/src/transform/regression.js)).
  - It is registered with `echarts.registerTransform(...)` and referenced as `transform: { type: 'ecStat:regression', config }` ([data-transform handbook](https://echarts.apache.org/handbook/en/concepts/data-transform/)).
  - **Maintenance risk:**
    - The last version, 1.2.0, was published 2020-11-03 and the package was last modified 2022-06-16 ([registry](https://registry.npmjs.org/echarts-stat)).
    - It ships only `main: index.js` and `src/ecStat.d.ts`, with no `module` or `exports` ([registry](https://registry.npmjs.org/echarts-stat/latest)).
    - It needs numeric x values, so a category axis must be mapped to indices.
  - Phase 3 stage A already puts "curve fits" in wechart's own analytics. Computing the fitted points there and drawing them as a plain `line` series keeps the spec engine-neutral and keeps ECharts out of statistics. `docs/research/box-plot.md` already notes that ecStat is not needed for box plots.
- **Many series: limits and performance.**
  - ECharts documents no hard limit on series. Turn animation off above `animationThreshold` (default 2000 graphic elements). For dense lines use `sampling` (`'lttb'`, `'min-max'` since 5.5.0) and `large`/`progressive` ([transition handbook](https://github.com/apache/echarts-handbook/blob/master/contents/en/how-to/animation/transition.md), [5.5.0 notes](https://github.com/apache/echarts-handbook/blob/master/contents/en/basics/release-note/5-5-0.md), `docs/research/echarts.md`).
  - wechart already sets `animation: false`.
  - The 8-series limit is a readability and product decision (an open question for the user). ECharts does not dictate it.
- **ECharts 6 features relevant to combo charts** ([v6 features](https://github.com/apache/echarts-handbook/blob/master/contents/en/basics/release-note/v6-feature.md), [changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md), [features.ts](https://github.com/apache/echarts/blob/6.1.0/src/export/features.ts), [charts.ts](https://github.com/apache/echarts/blob/6.1.0/src/export/charts.ts)):
  - **Axis breaks** (`axis.breaks` with `start`, `end`, `gap`, and `breakArea.expandOnClick`) need `AxisBreak` from `echarts/features`. They suit a combo whose series differ by orders of magnitude, as an alternative to a second axis ([axis-common](https://github.com/apache/echarts-doc/blob/master/en/option/component/axis-common.md)).
  - **Scatter jitter** (`axis.jitter`, `jitterOverlap`, `jitterMargin`) needs `ScatterJitter`. It applies "only… in single-axis or category axes" (same page).
  - **`stackOrder`** (see above).
  - **`setTheme()`** switches themes dynamically without dispose, and the v6 default theme is rebuilt on design tokens.
  - **6.1.0:** `dataMin`/`dataMax` axis extents, and `series-line.triggerEvent`.
  - **`ChordChart` and the `matrix` coordinate system exist.** Matrix lays out components in cells inside one canvas (`convertToLayout({ matrixIndex }, …)`, [instance API](https://github.com/apache/echarts-doc/blob/master/en/api/echarts-instance.md)). Neither is a combo feature. Matrix could host small multiples or a table of mini charts inside one tile, but not charts flowing inside DOM text.

### 3. Sparklines and micro-charts in rich text

| Option | Facts | Fit |
| --- | --- | --- |
| **A. One small ECharts instance per element** | Each needs `init` with its own DOM node, a renderer and a `ResizeObserver`; memory is only reclaimed by `dispose()` (`docs/research/echarts.md`). ECharts recommends SVG for "multiple chart instances that risk browser crashes" ([canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)). | Heaviest. It multiplies instance lifecycles inside a contenteditable. Up to 10 live elements per tile is the user's open question, so a dashboard could reach dozens of instances. |
| **B. ECharts SVG via `renderToSVGString`** | `init(null, null, { renderer: 'svg', ssr: true, width, height })` then `renderToSVGString({ useViewBox })` ([SSR handbook](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/), [API](https://github.com/apache/echarts-doc/blob/master/en/api/echarts-instance.md)). An optional ~1 KB-gzip client runtime adds hover/click (`hydrate`) ([5.5.0 notes](https://github.com/apache/echarts-handbook/blob/master/contents/en/basics/release-note/5-5-0.md)). | One shared instance can render many strings, but the output must go in through `innerHTML`. SSR **does not escape attribute values**, while text content is encoded (`docs/research/echarts-text-and-grid.md`, ZR `svg/core.js`). React warns against unsanitised `dangerouslySetInnerHTML` ([react.dev](https://react.dev/reference/react-dom/components/common)). Running `ssr: true` in a browser rather than in Node: UNVERIFIED. |
| **C. Dedicated micro-chart library** | `react-sparklines` 1.7.0 was last published 2017-07-27 ([registry](https://registry.npmjs.org/react-sparklines)); `@fnando/sparkline` 0.3.10 was published 2018-09-18 ([registry](https://registry.npmjs.org/@fnando/sparkline)). | Rejected: both are unmaintained. |
| **D. wechart-owned React SVG (`<svg><path d=…/></svg>`)**, optionally with `d3-shape` 3.2.0 (ISC, ESM, 5,657 B gzip) for curve interpolation ([registry](https://registry.npmjs.org/d3-shape/latest), [Bundlephobia](https://bundlephobia.com/api/size?package=d3-shape@3.2.0)) | Plain React elements, so no `innerHTML`, and React escapes all text. The same component works in the editor node view and in the static renderer. It can carry `role="img"` and an `aria-label` in our own terms. | **Recommended.** It also keeps the sparkline spec engine-neutral (measure, time dimension, granularity, kind). |

Performance with many sparklines on a page has no published benchmark for A, B or D. Measure D against AC-174/AC-175 with the `finished`-free timing T180 already uses (`docs/research/echarts.md`, "Drawn when `setOption` returns"). A full-size chart embedded in a rich tile (not a sparkline) should stay a normal ECharts tile instance.

## Gotchas

**Tiptap 3.32.0** (open issues as of 2026-10-18):
- **React 19 `flushSync` error** when remounting `useEditor` with an existing ID and `ReactNodeViewRenderer`, seen when reordering a list of editors: [#7543](https://github.com/ueberdosis/tiptap/issues/7543). A fix was in progress on 2026-03-01. This matters for dashboards that reorder tiles in edit mode; keying editors by a stable tile id may not avoid it.
- **Node view mounting:**
  - "EditorContent builds every node view twice on mount" ([#8516](https://github.com/ueberdosis/tiptap/issues/8516)).
  - "Mounting many React node views with content is slow in Chrome when the page has no selection" ([#8438](https://github.com/ueberdosis/tiptap/issues/8438)).
  - Node view content renders after the rest of the editor content ([#7438](https://github.com/ueberdosis/tiptap/issues/7438)).
  - Read mode avoids all three because it uses the static renderer.
- **Node view behaviour:**
  - "React context don't work with nested elements in NodeViews" ([#6547](https://github.com/ueberdosis/tiptap/issues/6547)). Test that the live-data context reaches our node views.
  - "NodeViewWrapper breaks React with error boundaries" ([#7033](https://github.com/ueberdosis/tiptap/issues/7033)).
  - "Editor `editable` state doesn't reflect in custom nodes" ([#6876](https://github.com/ueberdosis/tiptap/issues/6876)). Pass edit or read mode through our own context instead.
- **`@tiptap/markdown` is beta**, with many open round-trip defects filed 2026-10-09 to 10-16 ([issues](https://github.com/ueberdosis/tiptap/issues?q=is%3Aissue%20state%3Aopen%20markdown)):
  - heading levels ignored on parse (#8506);
  - consecutive hard breaks lost (#8478);
  - over-escaping on serialize (#8471, #8519);
  - link hrefs keeping HTML entities (#8468);
  - quadratic parsing with the Table/TaskList tokenizers (#8458);
  - `a == b` read as highlight (#8531).

  Do not make markdown the stored format. Store JSON.
- **Security history:**
  - 3.31.2: the ProseMirror paste XSS.
  - 3.31.3: unsafe colour values in collaboration.
  - 3.30.5: DoS risk in markdown attribute parsing ([releases](https://github.com/ueberdosis/tiptap/releases)).
  - Pin 3.32.0 and keep `@tiptap/*` versions identical, because the peers are exact.
- **Read-mode links are ours to check.** The `json` static renderer does not run `renderHTML`, so the Link mark's built-in href check does not apply there ([static-renderer docs](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/api/utilities/static-renderer.mdx), [link.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-link/src/link.ts)).
- **Stray attributes.** The `pm` static renderer converts `class` to `className`, parses `style` strings, and maps `colspan`/`rowspan`. It does not filter other attributes ([react.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/static-renderer/src/pm/react/react.ts)). Only attributes declared by our `addAttributes` exist on our nodes. Validate stored JSON so that no stray attributes come in from imported or tampered specs.

**ECharts:**
- `alignTicks` neither aligns zero nor respects `minInterval` (issues above).
- Stack ids are global within a chart.
- `echarts-stat` has no ESM entry and is unmaintained.
- SSR SVG attributes are unescaped.

## Alternatives considered

The caller asked for this comparison. A cell marked "—" means not found in the sources fetched.

| | **Tiptap 3.32.0** | **Lexical 0.52.0** | **BlockNote 0.56.0** | **Plate 53.3.15 (Slate)** | **ProseMirror direct** |
| --- | --- | --- | --- | --- | --- |
| License | MIT, with Pro/Cloud paid extensions (comments, AI, version history) ([overview](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/getting-started/overview.mdx), [pro](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/pro-extensions.mdx)) | MIT ([registry](https://registry.npmjs.org/lexical/latest)) | Core MPL-2.0; `@blocknote/xl-*` (AI, PDF/DOCX export, …) GPL-3.0 or commercial ([README](https://github.com/TypeCellOS/BlockNote/blob/main/README.md), [registry](https://registry.npmjs.org/@blocknote/core/latest)) | MIT; paid "Plate Plus" templates ([README](https://github.com/udecode/plate/blob/main/README.md)) | MIT ([registry](https://registry.npmjs.org/prosemirror-view/latest)) |
| Size (gzip) | core 36.8 KB, plus prosemirror-view 54.7 KB; static renderer 3.7 KB | `lexical` 63.0 KB ([Bundlephobia](https://bundlephobia.com/api/size?package=lexical@0.52.0)); `@lexical/react` not measured (429) | `@blocknote/react` 247.4 KB ([Bundlephobia](https://bundlephobia.com/api/size?package=@blocknote/react@0.56.0)) | `platejs` 97.0 KB ([Bundlephobia](https://bundlephobia.com/api/size?package=platejs@53.3.15)) | view and deps 54.7 KB |
| React 19 | peer `^19` | `@lexical/react` peer `>=18.x` ([registry](https://registry.npmjs.org/@lexical/react/latest)) | peer `^18 \|\| ^19` ([registry](https://registry.npmjs.org/@blocknote/react/latest)) | peer `>=18` ([registry](https://registry.npmjs.org/platejs/latest)) | via third-party `@handlewithcare/react-prosemirror` 3.2.11, peer `react >=17 <20`, pins `prosemirror-view` 1.42.3 ([registry](https://registry.npmjs.org/@handlewithcare/react-prosemirror/latest)) |
| Maintenance and stability | 8 releases from Aug 28 to Oct 13; semver 3.x | 0.x, with breaking changes in recent minors: 0.51 ESM-only, 0.52 `SELECTION_CHANGE_COMMAND` timing and `getCommonAncestor` removed ([releases](https://github.com/facebook/lexical/releases), [v0.52.0](https://github.com/facebook/lexical/releases/tag/v0.52.0)) | 0.x, with breaking changes in 0.52 (Yjs decoupled), 0.53 (Radix → base-ui) and 0.56 ([releases](https://github.com/TypeCellOS/BlockNote/releases)) | frequent patches ([releases](https://github.com/udecode/plate/releases)). Slate "is currently in beta… no `1.0` release schedule" ([Slate README](https://github.com/ianstormtaylor/slate/blob/main/Readme.md)) | view 1.42.6 on 2026-09-25 ([changelog](https://prosemirror.net/docs/changelog/)) |
| Document model and JSON | ProseMirror JSON tree, schema-checked | `SerializedEditorState`, `exportJSON`/`importJSON` per node ([nodes](https://lexical.dev/docs/concepts/nodes)). An unregistered type throws, with "essentially no validation in the parsers from JSON" ([#7212](https://github.com/facebook/lexical/issues/7212)) | `Block[]`, stored with `JSON.stringify(editor.document)` ([markdown export](https://www.blocknotejs.org/docs/features/export/markdown)) | Slate `Value` (element/text JSON) ([static](https://platejs.org/docs/static)) | `toJSON`/`nodeFromJSON` ([guide](https://prosemirror.net/docs/guide/)) |
| Inline React components | `ReactNodeViewRenderer` in portals that inherit context | `DecoratorNode.decorate()` rendered with `createPortal`; `isInline()` ([nodes](https://lexical.dev/docs/concepts/nodes), [decorators](https://lexical.dev/docs/concepts/decorators)) | `createReactInlineContentSpec` ([inline content](https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content)); open bug "Custom inline content not updating in the document" ([#2142](https://github.com/TypeCellOS/BlockNote/issues/2142)) | `createPlatePlugin({ node: { isElement, isInline, isVoid } })` ([plugin](https://platejs.org/docs/plugin)) | `NodeView` (`update`, `stopEvent`, `ignoreMutation`) with no React layer of its own ([guide](https://prosemirror.net/docs/guide/)) |
| Slash menu and mentions | `@tiptap/suggestion`, `@tiptap/extension-mention` (MIT) | `LexicalTypeaheadMenuPlugin` ([plugins](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/react/plugins.md)) | built-in suggestion menus ([grid menus](https://www.blocknotejs.org/docs/react/components/grid-suggestion-menus)) | `@platejs/slash-command`, `@platejs/mention` ([slash](https://platejs.org/docs/slash-command), [mention](https://platejs.org/docs/mention)) | build your own |
| Collaboration | Yjs and Hocuspocus | `@lexical/yjs` `CollaborationPlugin` ([collab](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/collaboration/react.md)) | Yjs via `withCollaboration` (0.52) | YjsPlugin (open bug [Plate issues](https://github.com/udecode/plate/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)) | y-prosemirror (UNVERIFIED, not fetched) |
| Accessibility | guidance only; we set the roles ([guide](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/guides/accessibility.mdx)) | **strongest:** `@lexical/a11y` (live region, focus manager with Alt+F10, roving tabindex, focus trap) and an ARIA table ([a11y README](https://github.com/facebook/lexical/blob/main/packages/lexical-a11y/README.md), [keyboard a11y](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/concepts/keyboard-accessibility.md)) | open a11y issues: tables, contrast, keyboard ([issues](https://github.com/TypeCellOS/BlockNote/issues?q=is%3Aissue%20state%3Aopen%20accessibility)) | — UNVERIFIED | none documented |
| Paste and XSS | `transformPastedHTML`, schema stripping, prosemirror-view ≥ 1.42.3 | `LinkNode.sanitizeUrl()` fails safe (v0.48.0, [releases](https://github.com/facebook/lexical/releases)) | GenericPopover re-parses `innerHTML`, violating a strict CSP ([#3209](https://github.com/TypeCellOS/BlockNote/issues/3209)) | — UNVERIFIED | the 1.42.3 fix |
| Markdown | `@tiptap/markdown` (beta, marked) | `@lexical/markdown` (regex transformers, stable); `@lexical/mdast` (micromark, **experimental**, +~26 kB) ([README](https://github.com/facebook/lexical/blob/main/packages/lexical-markdown/README.md), [mdast comparison](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/serialization/markdown-mdast.md)) | `tryParseMarkdownToBlocks`, `blocksToMarkdownLossy` ([import](https://www.blocknotejs.org/docs/features/import/markdown), [export](https://www.blocknotejs.org/docs/features/export/markdown)) | `@platejs/markdown` with remark/MDX rules ([markdown](https://platejs.org/docs/markdown)) | `prosemirror-markdown` 1.13.8, markdown-it with `html: false` ([from_markdown.ts](https://github.com/ProseMirror/prosemirror-markdown/blob/master/src/from_markdown.ts)) |
| Read-only without the editor | **yes:** `json/react` static renderer | read-only means a live editor (`editable: false`, [read-only](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/concepts/read-only.md)) or `$generateHtmlFromNodes` into an HTML string ([html](https://lexical.dev/docs/packages/lexical-html)); no static React renderer found | `isEditable = false` ([editor overview](https://www.blocknotejs.org/docs/reference/editor/overview)) or a server-side HTML string ([server](https://www.blocknotejs.org/docs/features/server-processing)) | **yes:** `PlateStatic` and `createStaticEditor`, memoised ([static](https://platejs.org/docs/static)) | `DOMSerializer` (DOM, not React) |

**Why the alternatives were rejected:**
- **Lexical:**
  - Its read mode would mount an editor per tile or go through HTML strings.
  - Breaking changes land in minor releases.
  - Unknown node types crash import, which is a hazard for long-lived stored specs.
  - Its accessibility package is better than Tiptap's guidance. wechart must build the equivalent (Alt+F10 toolbar, live region) itself to meet AC-176.
- **BlockNote:** it is built on Tiptap; it is a block-based (Notion-style) model; it is about 7x Tiptap core's gzip size; it is 0.x with breaking releases; and its export, PDF and AI packages are GPL.
- **Plate:** `PlateStatic` matches Tiptap's static rendering, but Slate is self-described beta with no 1.0 schedule.
- **ProseMirror direct:** this is what Tiptap wraps. Going direct means owning the React integration (a third-party package that pins `prosemirror-view` exactly) and a static renderer, with no gain in correctness.

## Open questions / unverified

- **Bundle sizes:** `@tiptap/pm` and `@lexical/react` gzip sizes are unknown because Bundlephobia returned HTTP 429. Measure the editor chunk and the read-mode chunk in CI.
- **`renderJSONContentToReactElement` options:** the exact TypeScript shape was taken from prose, not a signature. Check the installed `.d.ts`.
- **Hocuspocus license:** not fetched. UNVERIFIED.
- **Plate:** accessibility and paste sanitising were not found in what was fetched. UNVERIFIED.
- **y-prosemirror for raw ProseMirror collaboration:** not fetched. UNVERIFIED.
- **Release years** for the Tiptap and Lexical release pages (which show day and month only) are inferred to be 2026 from two facts: the ProseMirror changelog dates 1.42.3 to 2026-08-25, and Tiptap 3.31.2 bumped to it.
- **`d3-shape` release dates:** GitHub's releases page gave inconsistent dates (v3.2.0 listed before v3.1.0). Maintenance is UNVERIFIED. `d3-shape` is optional for option D.
- **Running ECharts `ssr: true` in a browser** (option B): UNVERIFIED. wechart has only run it in Node tests.
- **Sparkline performance at dashboard scale** is unmeasured for every option. Measure against AC-174/AC-175.
- **Product questions:** 10 live elements per tile, 8 series and 4 axes, whether more than one series may be split, when to warn about a combo (AC-218), and whether rich tiles replace markdown tiles. These are the user's open questions in `docs/inputs/2026-10-18-phase-3-advanced-analytics.md`; none was decided here.
- **`packages:` scope:** the frontmatter lists the import names of the rejected editors, so that this doc covers the comparison. Only the Tiptap set, `echarts-stat` and `d3-shape` are proposed for use.
