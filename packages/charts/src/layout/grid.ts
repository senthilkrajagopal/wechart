/**
 * The prototype's grid (charts.js:219, `gridBase`), with no legend beside the
 * plot: `{ left: 8, right: 28, top: 12, bottom: 8, containLabel: true }` in
 * ECharts 6's own terms — "same" outer bounds that hold the axes' labels and
 * names inside those edges (T254, recheck-dashboard F9;
 * research/echarts-text-and-grid.md, Q3). ECharts' own default grid — 15 % and
 * 10 % at the sides, 65 and 80 px above and below — left an empty band under
 * the axis.
 *
 * Carried by each renderer that draws bars as well as laid under every chart
 * on axes by `optionFor`, so a bar's estimated width (`categoryAxisPx`) is
 * measured against the grid it is drawn on, whichever way it is drawn.
 */
export const PROTOTYPE_GRID = {
  left: 8,
  right: 28,
  top: 12,
  bottom: 8,
  outerBoundsMode: 'same',
  outerBoundsContain: 'all',
} as const;
