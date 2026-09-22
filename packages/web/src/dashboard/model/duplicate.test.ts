import type { ChartDocument, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { chartWritesOf, withDraft } from '../edit/chartDrafts';
import type { DashboardDocument } from './document';
import { duplicateChartTile } from './duplicate';

/**
 * T068 / AC-062: WHEN the user duplicates a chart tile, THE SYSTEM SHALL give
 * the copy its own dashboard-local chart, so editing one tile leaves the other
 * unchanged.
 * Fails when: editing the duplicate changes the original tile's chart.
 *
 * The copy's chart is a draft in the edit session at version 0, as a new
 * tile's is (T132): its definition the original's as the session has it, and
 * local to this dashboard — a library chart's copy included — so the save
 * creates it with the dashboard, or not at all.
 */
const DASHBOARD: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Page 1',
      items: [
        { id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 40 },
        { id: 't2', kind: 'markdown', text: 'Notes', w: 6 },
      ],
    },
  ],
};

const LIBRARY_CHART: ChartDocument = {
  schemaVersion: 1,
  title: 'Orders by status',
  owner: 'admin',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
};

const SPEC: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'shipped', 'orders.count': '3' }],
};

const options = {
  dashboardId: 'd1',
  documents: { c1: LIBRARY_CHART },
  specs: { c1: SPEC },
  errors: {},
  mintTileId: () => 't-copy',
  mintChartId: () => 'c-copy',
};

describe('duplicating a chart tile', () => {
  it('puts the copy beside it, with a chart of its own, local to this dashboard', () => {
    const copied = duplicateChartTile(DASHBOARD, 't1', options);

    expect(copied?.tileId).toBe('t-copy');
    expect(copied?.document.pages[0]?.items).toEqual([
      { id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 40 },
      { id: 't-copy', kind: 'chart', chartId: 'c-copy', w: 6, h: 40 },
      { id: 't2', kind: 'markdown', text: 'Notes', w: 6 },
    ]);
    // Its definition the original's, drawn as the original is, not yet stored.
    expect(copied?.document.chartDrafts?.['c-copy']).toEqual({
      document: { ...LIBRARY_CHART, localToDashboardId: 'd1' },
      drawn: { spec: SPEC },
      version: 0,
    });
    // The save creates it with the dashboard: a library chart's copy is local.
    expect(chartWritesOf(copied?.document ?? DASHBOARD, 'd1')).toEqual([
      { id: 'c-copy', document: { ...LIBRARY_CHART, localToDashboardId: 'd1' }, version: 0 },
    ]);
  });

  it('leaves the original’s chart as it was when the copy is edited', () => {
    const copied = duplicateChartTile(DASHBOARD, 't1', options);
    const draft = copied?.document.chartDrafts?.['c-copy'];
    if (copied === undefined || draft === undefined) throw new Error('not duplicated');

    const edited = withDraft(copied.document, 'c-copy', {
      ...draft,
      document: {
        ...draft.document,
        chart: { ...draft.document.chart, chartType: 'pie' },
      },
    });

    // The original tile still shows its own chart, which has no edit of its
    // own and whose stored definition the copy did not touch.
    expect(edited.pages[0]?.items[0]).toEqual({
      id: 't1',
      kind: 'chart',
      chartId: 'c1',
      w: 6,
      h: 40,
    });
    expect(edited.chartDrafts?.['c1']).toBeUndefined();
    expect(edited.chartDrafts?.['c-copy']?.document.chart.chartType).toBe('pie');
  });

  it('leaves the copy’s chart as it was when the original is edited', () => {
    const copied = duplicateChartTile(DASHBOARD, 't1', options);
    if (copied === undefined) throw new Error('not duplicated');

    const edited = withDraft(copied.document, 'c1', {
      document: {
        ...LIBRARY_CHART,
        localToDashboardId: 'd1',
        chart: { ...LIBRARY_CHART.chart, chartType: 'pie' },
      },
      drawn: { spec: { ...SPEC, chartType: 'pie' } },
      version: 1,
    });

    expect(edited.chartDrafts?.['c-copy']).toEqual(copied.document.chartDrafts?.['c-copy']);
    expect(edited.chartDrafts?.['c-copy']?.document.chart.chartType).toBe('bar');
  });

  it('copies the chart as this session has edited it, and keeps the original’s edit its own', () => {
    const drafted = withDraft(DASHBOARD, 'c1', {
      document: {
        ...LIBRARY_CHART,
        localToDashboardId: 'd1',
        chart: { ...LIBRARY_CHART.chart, chartType: 'line' },
      },
      drawn: { spec: { ...SPEC, chartType: 'line' } },
      version: 3,
    });

    const copied = duplicateChartTile(drafted, 't1', options);

    expect(copied?.document.chartDrafts?.['c-copy']?.document.chart.chartType).toBe('line');
    expect(copied?.document.chartDrafts?.['c-copy']?.drawn).toEqual({
      spec: { ...SPEC, chartType: 'line' },
    });
    expect(copied?.document.chartDrafts?.['c-copy']?.version).toBe(0);
    expect(copied?.document.chartDrafts?.['c1']?.version).toBe(3);
  });

  it('offers nothing for a tile with no chart', () => {
    expect(duplicateChartTile(DASHBOARD, 't2', options)).toBeUndefined();
  });
});
