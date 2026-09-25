import type { ChartDocument, RenderSpec } from '@wechart/core';

/**
 * A chart as it is saved, with what it was drawn as recorded beside a type it
 * leaves to the recommender (T243, AC-193): the pick depends on the rows it
 * returns, so Explore — which lists charts without querying them — reads it
 * from here to name the chart "Bar · auto" rather than "Automatic".
 *
 * Kept on the chart as a field this build models nowhere else, which the
 * editor carries through a load and save as it does every field it does not
 * edit (`keepingUnknownFields`). Dropped where the type was chosen — the
 * chosen type is the name — and where the chart cannot be drawn.
 */
export function withDrawnAs(
  document: ChartDocument,
  drawn: { readonly spec: RenderSpec } | { readonly error: unknown },
): ChartDocument {
  // Any earlier record goes: it said what the chart was drawn as then.
  const chart = Object.fromEntries(
    Object.entries(document.chart).filter(([key]) => key !== 'drawnAs'),
  ) as ChartDocument['chart'];
  if (document.chart.chartType !== undefined || !('spec' in drawn)) return { ...document, chart };
  return {
    ...document,
    chart: { ...chart, drawnAs: drawn.spec.chartType } as ChartDocument['chart'],
  };
}
