import { CHART_TYPE_NAMES } from '@wechart/core';

/**
 * Each chart type's name as a reader sees it — the one list in
 * `@wechart/core` (AC-217), so the library page, the editor's type card and
 * the gallery cannot name a type two ways (T230's review).
 */
export const CHART_TYPE_LABEL = CHART_TYPE_NAMES;

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
