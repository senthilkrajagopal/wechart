import type { ChartDocument, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { chartWritesOf, withDraft } from '../dashboard/edit/chartDrafts';
import type { DashboardDocument } from '../dashboard/model/document';
import { detach } from './detach';

/**
 * T135 / AC-129: WHEN the user makes a local copy of a shared chart, THE
 * SYSTEM SHALL repoint that tile to the copy, keep edits made so far, and
 * leave the shared chart unchanged.
 * Fails when: the shared chart changes, or the edits are lost.
 *
 * The copy is a new chart, local to this dashboard, made with the edits as
 * they stand — a draft at version 0 the dashboard's save creates, as a new
 * tile's chart is (T132) — and the shared chart's own draft, if the session
 * had one, goes: those edits are the copy's now, and the shared chart is
 * written as it was, which is not at all.
 */
const SHARED: ChartDocument = {
  schemaVersion: 1,
  title: 'Orders by status',
  owner: 'admin',
  folderId: 'sales',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
};
const EDITED: ChartDocument = { ...SHARED, chart: { ...SHARED.chart, chartType: 'line' } };
const LINE: RenderSpec = {
  chartType: 'line',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [],
};

const DASHBOARD: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Page 1',
      items: [
        { id: 't1', kind: 'chart', chartId: 'shared', w: 6, h: 40 },
        { id: 't2', kind: 'chart', chartId: 'other', w: 6, h: 40 },
      ],
    },
  ],
};

describe('making a local copy of a shared chart', () => {
  it('repoints the tile to a copy local to this dashboard, with the edits so far', () => {
    const detached = detach(DASHBOARD, 't1', {
      dashboardId: 'd1',
      copyId: 'copy',
      edited: { document: EDITED, drawn: { spec: LINE } },
    });

    expect(detached.pages[0]?.items[0]).toEqual({
      id: 't1',
      kind: 'chart',
      chartId: 'copy',
      w: 6,
      h: 40,
    });
    // The edits kept; local to this dashboard, in no folder; new, so version 0.
    const { folderId: _folder, ...rest } = EDITED;
    void _folder;
    expect(detached.chartDrafts?.['copy']).toEqual({
      document: { ...rest, localToDashboardId: 'd1' },
      drawn: { spec: LINE },
      version: 0,
    });
    // Saved, only the copy is written: the shared chart as it was.
    expect(chartWritesOf(detached, 'd1')).toEqual([
      { id: 'copy', document: { ...rest, localToDashboardId: 'd1' }, version: 0 },
    ]);
  });

  it('takes the shared chart’s edit of this session with it, so the shared chart is not written', () => {
    const edited = withDraft(DASHBOARD, 'shared', {
      document: EDITED,
      drawn: { spec: LINE },
      version: 4,
    });

    const detached = detach(edited, 't1', {
      dashboardId: 'd1',
      copyId: 'copy',
      edited: { document: EDITED, drawn: { spec: LINE } },
    });

    expect(detached.chartDrafts?.['shared']).toBeUndefined();
    expect(chartWritesOf(detached, 'd1').map((write) => write.id)).toEqual(['copy']);
    // The other tile is untouched.
    expect(detached.pages[0]?.items[1]).toEqual(DASHBOARD.pages[0]?.items[1]);
  });

  /**
   * T135's review: another tile here showing the same shared chart shows it
   * as stored once the copy is made — the edits of this session went with the
   * copy, and the shared chart is written as it was: not at all.
   */
  it('leaves another tile showing the shared chart on the chart as stored', () => {
    const twice: DashboardDocument = {
      ...DASHBOARD,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          items: [
            { id: 't1', kind: 'chart', chartId: 'shared', w: 6, h: 40 },
            { id: 't3', kind: 'chart', chartId: 'shared', w: 6, h: 40 },
          ],
        },
      ],
    };
    const edited = withDraft(twice, 'shared', {
      document: EDITED,
      drawn: { spec: LINE },
      version: 4,
    });

    const detached = detach(edited, 't1', {
      dashboardId: 'd1',
      copyId: 'copy',
      edited: { document: EDITED, drawn: { spec: LINE } },
    });

    expect(detached.pages[0]?.items[1]).toEqual({
      id: 't3',
      kind: 'chart',
      chartId: 'shared',
      w: 6,
      h: 40,
    });
    expect(detached.chartDrafts?.['shared']).toBeUndefined();
    expect(chartWritesOf(detached, 'd1').map((write) => write.id)).toEqual(['copy']);
  });

  it('leaves the dashboard as it is for a tile it cannot find', () => {
    const local = withDraft(DASHBOARD, 'other', {
      document: { ...SHARED, localToDashboardId: 'd1' },
      drawn: { spec: LINE },
      version: 2,
    });
    expect(
      detach(local, 'missing', {
        dashboardId: 'd1',
        copyId: 'copy',
        edited: { document: EDITED, drawn: { spec: LINE } },
      }),
    ).toBe(local);
  });
});
