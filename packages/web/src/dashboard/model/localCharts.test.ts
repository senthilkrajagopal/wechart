import { describe, expect, it } from 'vitest';

import { NOTHING_CHOSEN } from '../edit/templates';
import type { Element_ } from './document';
import { withLocalCharts } from './localCharts';

/**
 * T132 / AC-126: WHEN a chart is created on a dashboard, THE SYSTEM SHALL
 * make it local to that dashboard and keep it out of Explore folders and
 * search.
 * Fails when: a dashboard-local chart appears in a folder listing or in
 * search results.
 *
 * A chart tile added to a dashboard — from the palette's "Chart" or a
 * section template (direction.md: "created in the dashboard editor … or
 * from a section template") — gets a chart of its own at once: a draft in
 * the edit session, local to the dashboard, at version 0 — not yet stored —
 * which the dashboard's save creates with it (the API's `updateTogether`).
 */
describe('a chart tile added to a dashboard', () => {
  it('gets a chart of its own, local to the dashboard, as a draft not yet stored', () => {
    let n = 0;
    const tiles: Element_[] = [
      { id: 't1', kind: 'chart', w: 3, h: 13, chartType: 'kpi' },
      { id: 't2', kind: 'markdown', w: 4, text: 'Notes' },
    ];

    const { elements, drafts } = withLocalCharts(tiles, 'd1', () => `c-${String((n += 1))}`);

    expect(elements).toEqual([
      { id: 't1', kind: 'chart', w: 3, h: 13, chartType: 'kpi', chartId: 'c-1' },
      { id: 't2', kind: 'markdown', w: 4, text: 'Notes' },
    ]);
    expect(drafts).toEqual({
      'c-1': {
        document: {
          schemaVersion: 1,
          title: 'New chart',
          localToDashboardId: 'd1',
          chart: {
            source: { cube: '' },
            wells: { measures: [], dimensions: [], timeDimensions: [] },
            chartType: 'kpi',
          },
        },
        // Drawn as any tile with no fields is: saying what it needs.
        drawn: { error: NOTHING_CHOSEN },
        version: 0,
      },
    });
  });

  it('leaves the choice of type to the recommender when the tile names none', () => {
    const { drafts } = withLocalCharts([{ id: 't1', kind: 'chart', w: 4 }], 'd1', () => 'c-1');
    expect(drafts['c-1']?.document.chart.chartType).toBeUndefined();
  });

  it('leaves a tile that already has a chart as it is', () => {
    const bound: Element_ = { id: 't1', kind: 'chart', w: 4, chartId: 'lib-1' };
    expect(withLocalCharts([bound], 'd1', () => 'c-1')).toEqual({
      elements: [bound],
      drafts: {},
    });
  });
});
