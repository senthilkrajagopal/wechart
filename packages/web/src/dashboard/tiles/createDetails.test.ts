import type { ChartDocument, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { createDetailsTile } from './createDetails';

/**
 * T118 / AC-112: WHEN the user chooses "Create details tile" on a tile, THE
 * SYSTEM SHALL add a tile limited by that tile's marking, with its
 * nothing-marked message pre-filled.
 * `Fails when: the new tile is not limited by the marking, or has no message.`
 *
 * As the prototype's (dashboard.js, `createDetails`): beside the tile, marking
 * with nothing, limited by its marking, its message naming the tile to mark in.
 */
const DASHBOARD: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed' },
  markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
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

const CHART: ChartDocument = {
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
  documents: { c1: CHART },
  specs: { c1: SPEC },
  errors: {},
  mintTileId: () => 't-details',
  mintChartId: () => 'c-details',
  markingId: 'm1',
};

describe('Create details tile (AC-112)', () => {
  it('adds a tile beside it, limited by its marking, marking with nothing, its message filled in', () => {
    const made = createDetailsTile(DASHBOARD, 't1', options);
    expect(made?.tileId).toBe('t-details');
    expect(made?.document.pages[0]?.items).toEqual([
      { id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 40 },
      {
        id: 't-details',
        kind: 'chart',
        chartId: 'c-details',
        w: 6,
        h: 40,
        marksWith: '',
        limitedBy: ['m1'],
        nothingMarked: 'message',
        nothingMarkedMessage:
          'Nothing is marked in Orders by status. Mark something there to fill this tile.',
      },
      { id: 't2', kind: 'markdown', text: 'Notes', w: 6 },
    ]);
  });

  it('gives it a chart of its own, local to the dashboard, titled as the details of the tile', () => {
    const made = createDetailsTile(DASHBOARD, 't1', options);
    expect(made?.document.chartDrafts?.['c-details']).toEqual({
      document: { ...CHART, title: 'Details: Orders by status', localToDashboardId: 'd1' },
      drawn: { spec: SPEC },
      version: 0,
    });
  });

  it('makes nothing of a tile that is not a chart', () => {
    expect(createDetailsTile(DASHBOARD, 't2', options)).toBeUndefined();
  });
});
