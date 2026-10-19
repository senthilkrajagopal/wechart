---
packages: [echarts, zrender]
version: echarts 6.1.0, zrender 6.1.0
researched: 2026-10-18
---

# Where ECharts draws each legend entry's icon (T857)

T857 puts a 20 px button over each combo legend entry's glyph, in the chart editor only (AC-497). ECharts draws the legend itself, so wechart has to read where each entry's icon landed. This doc sits beside `echarts-combo-layers.md`, which covers the legend's icons, formatter and hover, and it contradicts nothing there. Every claim below was read in the installed sources, `node_modules/.pnpm/echarts@6.1.0` and `zrender@6.1.0`.

## What the instance exposes

- **No public method gives a component's drawn elements.** The `ECharts` class declares `getModel` and `getViewOfComponentModel` as `private` in its typings (`types/dist/shared.d.ts`, the `ECharts` class: `private getModel;`, `private getViewOfComponentModel;`). Both exist at runtime: the same file's `ExtensionAPI` declares them as `abstract getModel(): GlobalModel` and `abstract getViewOfComponentModel(componentModel): ComponentView`, and the instance's API object forwards to them.
- **`getModel().getComponent('legend', 0)`** is the first legend's model; **`getViewOfComponentModel(model)`** its view, a `LegendView` (or `ScrollableLegendView` for `type: 'scroll'`, which extends it).
- So wechart calls them through a narrow local type, and treats a missing method or view as "no boxes": the editor then shows no buttons rather than failing.

## How a legend view holds its entries

- `LegendView.getContentGroup()` returns the group holding one group per entry (`lib/component/legend/LegendView.js:76-78`). A scroll legend puts that same group inside its clipped container group (`ScrollableLegendView.js:66-67`) and pages by moving it (`:237`).
- Each entry is drawn by `_createItem` (`LegendView.js:283-368`):
  - its **first child is the icon**, added before the text (`:297-318`);
  - the text sits `itemWidth + 5` px to its right (`:319`);
  - a transparent hit rect is added last (`:342-356`);
  - and the entry group carries **`__legendDataIndex`**, its index in `legendModel.getData()` (`:366`).
- An empty name or `'\n'` adds a bare `newline` group with no children (`:142-149`). A name already drawn adds no group (`:153-155`).
- Each `legend.data` item's own `name` is read with `legendItemModel.get('name')` (`:142`), so `legendModel.getData()[i].get('name')` names entry `i`.

## How to turn an element into chart pixels (zrender)

- `Element.getComputedTransform()` updates the transform of every ancestor, then its own, and returns `this.transform` (`zrender/lib/core/Transformable.js:89-100`). The result is a 6-number matrix `[a, b, c, d, e, f]`, mapping `(x, y)` to `(a·x + c·y + e, b·x + d·y + f)`, or `null` where no transform was needed (identity).
- `Path.getBoundingRect()` is the path's own box, before any transform (`zrender/lib/graphic/Path.js:169`).
- Coordinates are relative to the chart's root, which is the chart's DOM element's top-left corner.

## Consequences for wechart

- An icon's centre in the chart's pixels is its bounding box's centre, through its computed transform. That's where the 20 px button is centred.
- Read the boxes after the chart has drawn, on ECharts' `finished` event, so a scroll legend's page and every transform are settled.
- A box outside the chart's own width and height (a scroll legend's later page) gets no button.
- **UNVERIFIED:** the moment a scroll legend's page animation (`graphic.updateProps`, `ScrollableLegendView.js:237`) has finished relative to `finished`. wechart's combo legend rarely pages in the editor, and its boxes are read again on the next draw.
