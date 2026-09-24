import type { ChartDocument, RenderSpec } from '@wechart/core';

import { elementAt, isTile, placeOf, type DashboardDocument } from './document';
import { insertElement } from './insert';

/**
 * Duplicating a chart tile (T068, AC-062): the copy beside it, with a chart
 * of its own, so editing one tile leaves the other unchanged — and a filter
 * scoped to one tile cannot reach the other through a shared chart (T084).
 *
 * The copy's chart is the original's definition as this session has it — its
 * draft, if it was edited here — held as a draft at version 0 and local to
 * this dashboard, as a new tile's chart is (T132): the dashboard's save
 * creates it, or nothing is written. A library chart's copy is local too; the
 * shared chart is left alone. Drawn as the original is drawn, so the copy
 * shows at once rather than asking Cube again.
 */
/**
 * A copy of a tile that draws no chart — markdown, a header, a divider, an
 * image, a link (AC-205, the prototype's Duplicate on every item) — beside
 * it, as a chart tile's copy is placed. Nothing of its own to copy but itself.
 */
export function duplicatePlainTile(
  dashboard: DashboardDocument,
  tileId: string,
  mintTileId: () => string,
): { document: DashboardDocument; tileId: string } | undefined {
  const tile = elementAt(dashboard, tileId);
  const place = placeOf(dashboard, tileId);
  if (tile === null || !isTile(tile) || tile.kind === 'chart' || place === null) return undefined;
  const copy = { ...tile, id: mintTileId() };
  return {
    document: insertElement(dashboard, copy, { key: place.key, index: place.index + 1 }),
    tileId: copy.id,
  };
}

export function duplicateChartTile(
  dashboard: DashboardDocument,
  tileId: string,
  {
    dashboardId,
    documents,
    specs,
    errors,
    mintTileId,
    mintChartId,
  }: {
    dashboardId: string;
    /** The stored chart documents, by chart id. */
    documents: Readonly<Record<string, ChartDocument>>;
    /** What each chart draws, by chart id — or why it cannot. */
    specs: Readonly<Record<string, RenderSpec>>;
    errors: Readonly<Record<string, unknown>>;
    mintTileId: () => string;
    mintChartId: () => string;
  },
): { document: DashboardDocument; tileId: string } | undefined {
  const tile = elementAt(dashboard, tileId);
  if (tile === null || !isTile(tile) || tile.kind !== 'chart' || tile.chartId === undefined)
    return undefined;
  const drafted = dashboard.chartDrafts?.[tile.chartId];
  const source = drafted?.document ?? documents[tile.chartId];
  const place = placeOf(dashboard, tileId);
  if (source === undefined || place === null) return undefined;

  const spec = specs[tile.chartId];
  const drawn = drafted?.drawn ?? (spec === undefined ? { error: errors[tile.chartId] } : { spec });
  const chartId = mintChartId();
  const copy = { ...tile, id: mintTileId(), chartId };
  const placed = insertElement(dashboard, copy, { key: place.key, index: place.index + 1 });
  return {
    document: {
      ...placed,
      chartDrafts: {
        ...placed.chartDrafts,
        [chartId]: {
          document: { ...source, localToDashboardId: dashboardId },
          drawn,
          version: 0,
        },
      },
    },
    tileId: copy.id,
  };
}
