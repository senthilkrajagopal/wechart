import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { clickedValue } from './clicked';

/**
 * T123 / AC-117: what a click stands for, which is the first half of "clicks
 * a mark". A chart whose bars are categories means the category; one whose
 * bars are split by a second dimension means the series the bar belongs to,
 * because that is what the legend beside it names.
 */
const spec = (
  chartType: RenderSpec['chartType'],
  encoding: RenderSpec['encoding'],
): RenderSpec => ({
  chartType,
  encoding,
  rows: [],
});

const byCategory = { x: ['orders.status'], y: ['orders.count'] };
const split = { x: ['orders.status'], y: ['orders.count'], color: ['products.category'] };

describe('the member a clicked item stands for', () => {
  it('is the category on a bar chart', () => {
    expect(clickedValue(spec('bar', byCategory), { name: 'shipped' })).toEqual({
      member: 'orders.status',
      value: 'shipped',
    });
  });

  it('is the category on a pie', () => {
    expect(clickedValue(spec('pie', byCategory), { name: 'shipped' })).toEqual({
      member: 'orders.status',
      value: 'shipped',
    });
  });

  it('is the series where the bars are split by one', () => {
    // Clicking the "Beverages" part of a stacked bar means Beverages, not the
    // status the stack stands on.
    expect(
      clickedValue(spec('stackedBar', split), { name: 'shipped', seriesName: 'Beverages' }),
    ).toEqual({ member: 'products.category', value: 'Beverages' });
  });

  it('is the panel in a trellis', () => {
    expect(
      clickedValue(spec('trellis', { ...byCategory, facet: ['products.category'] }), {
        name: 'shipped',
        seriesName: 'Beverages',
      }),
    ).toEqual({ member: 'products.category', value: 'Beverages' });
  });

  it('is nothing for a click on empty plot area', () => {
    expect(clickedValue(spec('bar', byCategory), {})).toBeUndefined();
    expect(clickedValue(spec('bar', byCategory), { name: '' })).toBeUndefined();
  });

  it('is nothing where the series are measures rather than a split', () => {
    // A combo of two measures has a series per measure, so the name under
    // the pointer is "orders.count" — not a value of the x member. Paired
    // with it, the filter would be `orders.status = 'orders.count'`, which no
    // row matches, and every target it reached would empty (T123's review).
    const combo = spec('combo', { x: ['orders.status'], y: ['orders.count', 'orders.revenue'] });

    expect(clickedValue(combo, { name: 'shipped', seriesName: 'orders.revenue' })).toBeUndefined();
  });

  it('is nothing on a chart drawn from no dimension, such as a KPI', () => {
    expect(
      clickedValue(spec('kpi', { y: ['orders.count'] }), { name: 'orders.count' }),
    ).toBeUndefined();
  });
});
