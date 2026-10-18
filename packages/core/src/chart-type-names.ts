import type { ChartType } from './render-spec';

/**
 * Each chart type by the name a person knows it (AC-217), as the prototype's
 * type card and gallery name them (docs/design/prototype/reco.js) — never by
 * its id, "groupedBar". One list, so the card, the gallery and the sentence
 * saying what a type needs (AC-033) cannot name a type two ways.
 */
export const CHART_TYPE_NAMES: Readonly<Record<ChartType, string>> = {
  kpi: 'KPI',
  bar: 'Bar',
  hbar: 'Bar, horizontal',
  groupedBar: 'Grouped bar',
  stackedBar: 'Stacked bar',
  line: 'Line',
  multiLine: 'Multi-series line',
  area: 'Area',
  stackedArea: 'Stacked area',
  scatter: 'Scatter',
  pie: 'Pie',
  donut: 'Donut',
  treemap: 'Treemap',
  heatmap: 'Heatmap',
  table: 'Table',
  pivot: 'Pivot table',
  trellis: 'Small multiples',
  combo: 'Combo (bar + line)',
  boxplot: 'Box plot',
  // "Map", in place of Country map (R81, 23-Q19 (a); AC-559, AC-622).
  map: 'Map',
  // R81's types, as design 23's cards name them (AC-559).
  waterfall: 'Waterfall',
  histogram: 'Histogram',
  bubble: 'Bubble',
  parallel: 'Parallel coordinates',
  bullet: 'Bullet chart',
  sankey: 'Sankey',
  funnel: 'Funnel',
  timeline: 'Timeline',
  calendar: 'Calendar heatmap',
  icicle: 'Icicle',
  graphicalTable: 'Graphical table',
};

export function chartTypeName(type: ChartType): string {
  return CHART_TYPE_NAMES[type];
}
