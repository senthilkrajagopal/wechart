import type { ChartDocument, RenderSpec } from '@wechart/core';

import { changeTile, type DashboardDocument } from '../model/document';
import { duplicateChartTile } from '../model/duplicate';
import { NOTHING_MARKED_DEFAULT, defaultNothingMarkedMessage } from './NothingMarked';

/**
 * "Create details tile" (T118, AC-112; Spotfire's Create Details
 * Visualization, the prototype's `createDetails` in dashboard.js): a tile
 * beside this one that shows only what this one's marking holds.
 *
 * Its chart is a copy of the tile's own, as Duplicate makes (AC-062) — a
 * chart of its own, local to the dashboard, titled as the tile's details —
 * so it can be changed to whatever the details should be without touching
 * the tile it came from. It marks with nothing, is limited by the marking,
 * and says what to mark while nothing is (AC-109, AC-110).
 */
export function createDetailsTile(
  dashboard: DashboardDocument,
  tileId: string,
  options: {
    dashboardId: string;
    documents: Readonly<Record<string, ChartDocument>>;
    specs: Readonly<Record<string, RenderSpec>>;
    errors: Readonly<Record<string, unknown>>;
    mintTileId: () => string;
    mintChartId: () => string;
    /** The marking the tile marks with, which limits the new one. */
    markingId: string;
    /**
     * The tiles that mark with it, by title, which its message names
     * (AC-110); the tile's own title where none are given.
     */
    masters?: readonly string[];
  },
): { document: DashboardDocument; tileId: string } | undefined {
  let chartId: string | undefined;
  const copied = duplicateChartTile(dashboard, tileId, {
    ...options,
    mintChartId: () => (chartId = options.mintChartId()),
  });
  if (copied === undefined) return undefined;
  const draft = chartId === undefined ? undefined : copied.document.chartDrafts?.[chartId];
  if (chartId === undefined || draft === undefined) return undefined;
  const title = draft.document.title;

  const limited = changeTile(copied.document, copied.tileId, (tile) => ({
    ...tile,
    marksWith: '',
    limitedBy: [options.markingId],
    nothingMarked: NOTHING_MARKED_DEFAULT,
    nothingMarkedMessage: defaultNothingMarkedMessage(
      options.masters !== undefined && options.masters.length > 0 ? options.masters : [title],
    ),
  }));
  return {
    document: {
      ...limited,
      chartDrafts: {
        ...limited.chartDrafts,
        [chartId]: { ...draft, document: { ...draft.document, title: `Details: ${title}` } },
      },
    },
    tileId: copied.tileId,
  };
}
