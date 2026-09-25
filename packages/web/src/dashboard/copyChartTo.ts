import type { ChartDocument } from '@wechart/core';

import { saveDashboard } from './edit/save';
import { pageKey } from './model/document';
import { insertElement } from './model/insert';
import { dashboardOf, type StoredDocument } from './model/stored';

/**
 * Copy › To dashboard (T271, AC-243): a tile showing a copy of this tile's
 * chart, added to the end of another dashboard's first page.
 *
 * The copy is a chart of its own, local to that dashboard — the source's
 * definition, out of any folder, with `localToDashboardId` — created in the
 * same save as the tile that shows it (the API's `updateTogether`, T132), so
 * the dashboard is never left pointing at a chart that was not written. The
 * source dashboard is neither read nor written.
 *
 * A save that another has overtaken is refused (409) as any dashboard save
 * is; the caller says so, and nothing was written.
 */
export async function copyChartToDashboard({
  targetId,
  chart,
  size,
  fetchImpl = fetch,
  mintChartId = () => crypto.randomUUID(),
  mintTileId = () => `el-${String(Date.now())}-copy`,
}: {
  targetId: string;
  chart: ChartDocument;
  /** The tile's size, so the copy is placed as big as the original. */
  size: { readonly w: number; readonly h?: number | undefined };
  fetchImpl?: typeof fetch;
  mintChartId?: () => string;
  mintTileId?: () => string;
}): Promise<{ title: string; chartId: string }> {
  const response = await fetchImpl(`/api/documents/dashboard/${encodeURIComponent(targetId)}`);
  if (!response.ok) throw new Error(`Could not read that dashboard (${String(response.status)}).`);
  const stored = (await response.json()) as StoredDocument;
  const target = dashboardOf(stored);
  const page = target.pages[0];
  if (page === undefined) throw new Error('That dashboard has no page to put the chart on.');

  const chartId = mintChartId();
  // Everything the source's chart carries but its folder: a local chart is
  // in none (Explore lists it nowhere).
  const copy: { -readonly [K in keyof ChartDocument]: ChartDocument[K] } = {
    ...chart,
    localToDashboardId: targetId,
  };
  delete copy.folderId;
  const next = insertElement(
    target,
    {
      id: mintTileId(),
      kind: 'chart',
      chartId,
      w: size.w,
      ...(size.h === undefined ? {} : { h: size.h }),
    },
    { key: pageKey(page.id), index: null },
  );
  await saveDashboard({
    dashboardId: targetId,
    document: next,
    version: stored.version ?? 1,
    charts: [{ id: chartId, document: copy, version: 0 }],
    fetchImpl,
  });
  return { title: target.title, chartId };
}
