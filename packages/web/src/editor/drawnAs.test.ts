import type { ChartDocument, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { withDrawnAs } from './drawnAs';

/**
 * T243 / AC-193: a chart's row in Explore names its chart type — for one that
 * follows the recommendation, the type it was drawn as when saved, which
 * Explore cannot know without querying every chart it lists
 * (recheck-shell-explore N1: "Automatic" is as empty as "Chart").
 */
const AUTO: ChartDocument = {
  schemaVersion: 2,
  title: 'Orders',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
  },
};

const KPI: RenderSpec = { chartType: 'kpi', encoding: { y: ['orders.count'] }, rows: [] };

describe('what a saved chart was drawn as', () => {
  it('records the recommender’s pick on a chart that follows it', () => {
    expect(withDrawnAs(AUTO, { spec: KPI }).chart).toEqual({ ...AUTO.chart, drawnAs: 'kpi' });
  });

  it('records nothing on a chart whose type was chosen, and drops an old record', () => {
    const chosen = { ...AUTO, chart: { ...AUTO.chart, chartType: 'bar' as const, drawnAs: 'kpi' } };
    expect(withDrawnAs(chosen, { spec: KPI }).chart).toEqual({ ...AUTO.chart, chartType: 'bar' });
  });

  it('records nothing on a chart that cannot be drawn', () => {
    const stale = { ...AUTO, chart: { ...AUTO.chart, drawnAs: 'kpi' } };
    expect(withDrawnAs(stale, { error: new Error('no fields') }).chart).toEqual(AUTO.chart);
  });
});
