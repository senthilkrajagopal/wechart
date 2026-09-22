import type { ChartDocument } from '@wechart/core';

import { withDraft } from '../dashboard/edit/chartDrafts';
import {
  changeTile,
  chartIdOf,
  type ChartDraft,
  type DashboardDocument,
} from '../dashboard/model/document';

/**
 * The chart as a local chart's: this dashboard's, in no folder — every other
 * field kept, as the chart editor keeps a field it does not model (T192).
 */
function localTo(chart: ChartDocument, dashboardId: string): ChartDocument {
  const copy: { -readonly [Key in keyof ChartDocument]: ChartDocument[Key] } = { ...chart };
  delete copy.folderId;
  return { ...copy, localToDashboardId: dashboardId };
}

/**
 * "Make a local copy" of a shared chart (T135, AC-129; direction.md rule 41):
 * the tile repointed to a new chart local to this dashboard, made with the
 * edits so far — a draft at version 0 the dashboard's save creates, as a new
 * tile's chart is (T132) — and the shared chart left as it was: its draft in
 * this session, if it had one, goes, since those edits are the copy's now.
 *
 * Returns the dashboard as it was for a tile it cannot find.
 */
export function detach(
  dashboard: DashboardDocument,
  tileId: string,
  {
    dashboardId,
    copyId,
    edited,
  }: {
    dashboardId: string;
    /** The copy's id, minted in the browser as a new chart's is. */
    copyId: string;
    /** The chart with the edits made so far, and what it draws. */
    edited: Pick<ChartDraft, 'document' | 'drawn'>;
  },
): DashboardDocument {
  const sharedId = chartIdOf(dashboard, tileId);
  if (sharedId === undefined) return dashboard;
  const repointed = changeTile(dashboard, tileId, (tile) => ({ ...tile, chartId: copyId }));
  const { [sharedId]: _left, ...drafts } = repointed.chartDrafts ?? {};
  void _left;
  return withDraft({ ...repointed, chartDrafts: drafts }, copyId, {
    document: localTo(edited.document, dashboardId),
    drawn: edited.drawn,
    version: 0,
  });
}
