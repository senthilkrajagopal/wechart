import { recommend } from '@wechart/recommender';
import { describe, expect, it } from 'vitest';

import { optionsOnPick } from './kpiTrendPick';

/**
 * T968 / AC-560: one measure and a time dimension keep Line as the top pick,
 * "KPI with trend" its first runner-up. Picking it draws what it says: the
 * KPI, its Time the chart's time dimension at the chart's grain, so its
 * trend is drawn.
 */
const revenueByMonth = recommend({
  fields: [
    { name: 'orders.revenue', kind: 'measure' },
    { name: 'orders.ordered_at', kind: 'timeDimension' },
  ],
});

describe('picking "KPI with trend" (T968, AC-560)', () => {
  it('sets the KPI’s Time to the chart’s time dimension, at its grain', () => {
    expect(optionsOnPick('kpi', revenueByMonth, {}, { 'orders.ordered_at': 'week' })).toEqual({
      kpi: { time: { member: 'orders.ordered_at', granularity: 'week' } },
    });
  });

  it('takes the month where the chart has no grain for it', () => {
    expect(optionsOnPick('kpi', revenueByMonth, { sort: 'x' }, {})).toEqual({
      sort: 'x',
      kpi: { time: { member: 'orders.ordered_at', granularity: 'month' } },
    });
  });

  it('keeps a Time the KPI already has, and sets nothing for any other pick', () => {
    const own = { kpi: { time: { member: 'orders.shipped_at', granularity: 'day' } } };
    expect(optionsOnPick('kpi', revenueByMonth, own, {})).toBeUndefined();
    expect(optionsOnPick('area', revenueByMonth, {}, {})).toBeUndefined();
    const oneNumber = recommend({ fields: [{ name: 'orders.revenue', kind: 'measure' }] });
    expect(optionsOnPick('kpi', oneNumber, {}, {})).toBeUndefined();
  });
});
