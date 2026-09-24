import type { ChartType } from '@wechart/core';

/**
 * Each chart type's name as a reader sees it — the prototype's `RECO.TYPES`
 * labels (docs/design/prototype/reco.js), with Pie added, which the prototype
 * draws only as a donut.
 *
 * A Record over the union, so a type added to `ChartType` without a name here
 * is a type error rather than a raw identifier on screen.
 */
export const CHART_TYPE_LABEL: Readonly<Record<ChartType, string>> = {
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
  kpi: 'KPI',
  table: 'Table',
  pivot: 'Pivot table',
  trellis: 'Small multiples',
  combo: 'Combo (bar + line)',
};

/**
 * What a listed chart's Type column says (AC-193): its saved type; "Automatic"
 * when the recommender picks it as it is drawn, which depends on the rows it
 * returns and so cannot be named without querying; "Incomplete" when it has
 * no fields to draw — the prototype's word. A stored type this build does not
 * know is shown as stored rather than hidden.
 */
export function chartTypeText(chart: {
  readonly chartType?: string | null;
  readonly hasFields?: boolean;
}): string {
  const { chartType } = chart;
  if (chartType !== null && chartType !== undefined && chartType !== '')
    return (CHART_TYPE_LABEL as Readonly<Record<string, string>>)[chartType] ?? chartType;
  return chart.hasFields === true ? 'Automatic' : 'Incomplete';
}
