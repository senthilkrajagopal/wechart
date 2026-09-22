import type { ChartDocument } from '@wechart/core';

import { NOTHING_CHOSEN } from '../edit/templates';
import type { ChartDraft, Element_ } from './document';

/**
 * A chart of its own for each chart tile added to a dashboard (T132, AC-126):
 * the palette's "Chart" and a section template's tiles — direction.md's
 * dashboard-local chart, "created in the dashboard editor … or from a section
 * template". Local to the dashboard, so Explore's folders and search never
 * list it (the API leaves `localToDashboardId` charts out of both); with no
 * cube and no fields yet, and the type the tile was made for, if any.
 *
 * A draft in the edit session at version 0 — not yet stored — which the
 * dashboard's save creates with it, in the same transaction (the API's
 * `updateTogether`), or not at all. A tile already bound to a chart, as
 * "Chart from folders" binds one, is left as it is.
 */
export function withLocalCharts(
  elements: readonly Element_[],
  dashboardId: string,
  mintChartId: () => string,
): { elements: Element_[]; drafts: Record<string, ChartDraft> } {
  const drafts: Record<string, ChartDraft> = {};
  const minted = elements.map((element): Element_ => {
    if (element.kind !== 'chart' || element.chartId !== undefined) return element;
    const chartId = mintChartId();
    const document: ChartDocument = {
      schemaVersion: 1,
      title: 'New chart',
      localToDashboardId: dashboardId,
      chart: {
        source: { cube: '' },
        wells: { measures: [], dimensions: [], timeDimensions: [] },
        ...(element.chartType === undefined ? {} : { chartType: element.chartType }),
      },
    };
    drafts[chartId] = { document, drawn: { error: NOTHING_CHOSEN }, version: 0 };
    return { ...element, chartId };
  });
  return { elements: minted, drafts };
}
