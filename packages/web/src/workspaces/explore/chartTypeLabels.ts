import { CHART_TYPE_NAMES } from '@wechart/core';

/**
 * Each chart type's name as a reader sees it — the one list in
 * `@wechart/core` (AC-217), so the library page, the editor's type card and
 * the gallery cannot name a type two ways (T230's review).
 */
export const CHART_TYPE_LABEL = CHART_TYPE_NAMES;

/**
 * What a listed chart's Type column says (AC-193): its saved type; where the
 * recommender picks it, what it was drawn as when saved — "KPI · auto", as
 * its own page says (T243) — or "Automatic" for one saved before that was
 * recorded; "Incomplete" when it has no fields to draw — the prototype's
 * word. A stored type this build does not know is shown as stored rather
 * than hidden.
 */
export function chartTypeText(chart: {
  readonly chartType?: string | null;
  readonly drawnAs?: string | null;
  readonly hasFields?: boolean;
}): string {
  const named = (type: string) =>
    (CHART_TYPE_LABEL as Readonly<Record<string, string>>)[type] ?? type;
  const { chartType, drawnAs } = chart;
  if (chartType !== null && chartType !== undefined && chartType !== '') return named(chartType);
  if (chart.hasFields !== true) return 'Incomplete';
  return drawnAs !== null && drawnAs !== undefined && drawnAs !== ''
    ? `${named(drawnAs)} · auto`
    : 'Automatic';
}
