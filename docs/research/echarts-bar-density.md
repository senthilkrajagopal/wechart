---
library: Apache ECharts — bar width when bars are many (series-bar.barMinWidth, the border inside a bar)
packages: []
version: 6.1.0
researched: 2026-09-24
sources:
  [
    https://github.com/apache/echarts-doc/blob/master/en/option/partial/barGrid.md,
    https://echarts.apache.org/en/option.html#series-bar.barMinWidth,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/bar/BarView.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/layout/barGrid.ts,
    https://github.com/apache/echarts/blob/6.1.0/src/coord/cartesian/GridModel.ts,
  ]
---

# Bars too many for their width (AC-210)

A sibling to `echarts.md`, which covers `large` / `progressive` for dense
series but not a bar's minimum width. The first version of this note claimed
the `barMinWidth` default did not hold; T224's review traced the installed
source and found otherwise. The corrected account follows.

## Documented

`series-bar.barMinWidth` (`number | string`): "The minimum width of the bar. In
cartesian the default value is `1`, otherwise the default value is `null`. Has
higher priority than `barWidth`." (echarts-doc `option/partial/barGrid.md`,
read through Context7 on 2026-09-24.)

## Read in the installed source (`node_modules/.pnpm/echarts@6.1.0/…/lib`)

- **The default holds.** `layout/barGrid.js` (`createLayoutInfoListOnAxis`)
  takes `seriesModel.get('barMinWidth') || (isInLargeMode ? 0.5 : 1)`. Setting
  `barMinWidth: 1` explicitly changes nothing, and wechart doesn't set it.
- **How wide a bar is laid out** (`calcBarWidthAndOffset`, same file):
  - The band is the axis length divided by the categories.
  - It loses its category gap: `max(35 − 4 × columns, 15)%` of the band, where
    columns are the stacks side by side.
  - The rest is shared among the columns, with `defaultBarGap` between two
    columns. `defaultBarGap` is `'10%'` of a bar (`chart/bar/BaseBarSeries.js`).
- **Why the bars vanished.** In `chart/bar/BarView.js`, `getLayout.cartesian2d`
  shrinks each bar's rectangle by `getLineWidth`, which is
  `min(borderWidth, width, height)` whenever the bar has a border colour.
  - The stroke is then drawn centred on the shrunken edge. It covers
    `borderWidth` of the bar's box on each side, so the bar's own colour shows
    across `width − 2 × borderWidth`.
  - direction.md §6's 2 px surface gap is drawn as that border, in the
    surface colour. So a bar laid out 4 px wide or less shows no colour, and
    one 2 px wide or less has its path shrunk to nothing.
  - The 243 bars of 81 categories × 3 series at 640 px are laid out about
    1.4 px each.
- **The default grid** (`coord/cartesian/GridModel.js`): `left: '15%'`,
  `right: '10%'`, `top: 65`, `bottom: 80`. With `outerBoundsMode: 'auto'` it
  can shrink further to hold labels.

## Observed (SVG SSR, `packages/charts/src/series/bar.test.ts`, "a dense bar chart")

- With the gap left off, bars packed past their axis are drawn at the 1 px
  minimum. The SVG writes their paths between 0.6 and 1 px wide, and some of
  each one's colour shows.
- With the gap kept on a bar laid out 6 px or more, 2 px or more of its colour
  shows.

## wechart's rule (a decision, not an ECharts behaviour; overturnable)

`series/bar.ts` estimates each bar's laid-out width from the canvas the chart is
drawn in. It uses the grid's margins and barGrid's formula above.

**Since T254 (2026-09-24), the grid is the prototype's, not ECharts' default.**
Every chart on axes is laid out 8 px left, 28 px right, 12 px above and 8 px
below, with "same" outer bounds holding the labels
(`echarts-text-and-grid.md`, Q3). A drawn legend takes its room, which
Customize can place on any side.

**The estimate now errs under, not over (T254's review).** The first T254
estimate took only the grid's edges, `width − 36` and `height − 20`. It kept the
gap on bars really under 4 px wide, which drew them empty (AC-210's failing
state). Two cases did it: a legend placed at the bottom, and wide value labels
such as "$40,000.00" in a narrow tile. It now subtracts the legend's room where
one is drawn (`plotEdgesOf` in `customize.ts`) and a value-label allowance: a
24 px row under a horizontal chart, an 80 px column beside a vertical one. So a
borderline bar loses its gap and keeps its colour. `bar.test.ts` draws both cases
through `optionFor`.

- The gap is kept only where the bar is at least three gaps wide, so the colour
  between its two borders is at least as wide as one border.
- Below that, bars touch rather than vanish.

The estimate errs slightly wide, because a legend or long labels shrink the
grid. It errs only towards keeping a gap next to colour that still shows.
`ChartCanvas` measures its box and redraws when the box changes.

## UNVERIFIED

- The canvas renderer was not checked; wechart draws tiles with SVG.
- `outerBoundsMode: 'auto'`: how far long labels shrink the grid was not
  measured.
