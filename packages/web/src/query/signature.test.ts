import { emptySpec } from '@wechart/core';
import { recommend } from '@wechart/recommender';
import { describe, expect, it } from 'vitest';

import { recommendedTypeOf, signatureOf, topTypeOf } from './signature';

/**
 * `signatureOf` is what the editor and the dashboard both recommend from
 * (T193). It was extracted from the editor unchanged; these pin its behaviour
 * directly, because two callers now depend on it and neither caller's tests
 * would say which of them a change had broken.
 */
const spec = {
  ...emptySpec('orders'),
  measures: ['orders.count'],
  dimensions: ['orders.status'],
  timeDimensions: ['orders.ordered_at'],
};

const rows = [
  { 'orders.status': 'paid', 'orders.ordered_at': '2026-01-01', 'orders.count': 3 },
  { 'orders.status': 'paid', 'orders.ordered_at': '2026-01-02', 'orders.count': 4 },
  { 'orders.status': 'shipped', 'orders.ordered_at': '2026-01-02', 'orders.count': 5 },
];

describe('the signature of a chart', () => {
  it('lists every field with its kind, measures first', () => {
    expect(signatureOf(spec, rows).fields.map(({ name, kind }) => [name, kind])).toEqual([
      ['orders.count', 'measure'],
      ['orders.status', 'dimension'],
      ['orders.ordered_at', 'timeDimension'],
    ]);
  });

  it('counts distinct values of each grouping in the rows returned', () => {
    /**
     * Cardinality from this result, not from a separate count (AC-028): two
     * statuses and two dates here, although three rows.
     */
    const { fields } = signatureOf(spec, rows);

    expect(fields.find((field) => field.name === 'orders.status')?.cardinality).toBe(2);
    expect(fields.find((field) => field.name === 'orders.ordered_at')?.cardinality).toBe(2);
  });

  it('gives a measure no cardinality', () => {
    const measure = signatureOf(spec, rows).fields.find((field) => field.name === 'orders.count');

    expect(measure).toEqual({ name: 'orders.count', kind: 'measure' });
  });

  it('leaves cardinality unknown, not zero, when there are no rows', () => {
    /**
     * Zero would say "no categories", which reads as a small, drawable chart.
     * Unknown is what an empty result actually tells you — and the recommender
     * treats it differently, which is why recommending before the query has
     * run can pick differently from recommending after.
     */
    const { fields } = signatureOf(spec, []);

    expect(fields.every((field) => !('cardinality' in field))).toBe(true);
  });

  it('carries the row count', () => {
    expect(signatureOf(spec, rows).rowCount).toBe(3);
    expect(signatureOf(spec, []).rowCount).toBe(0);
  });
});

describe('the pick', () => {
  it('is the recommendation’s top candidate', () => {
    const recommendation = recommend(signatureOf(spec, rows));

    expect(topTypeOf(recommendation)).toBe(recommendation.top?.candidate.chartType);
  });

  it('is null when nothing can be recommended', () => {
    // A chart with no fields at all, the recommender's documented case.
    expect(topTypeOf(recommend(signatureOf(emptySpec('orders'), [])))).toBeNull();
  });

  it('is the same whether read from a recommendation or from the chart', () => {
    // The two routes the editor and the dashboard take must agree.
    expect(recommendedTypeOf(spec, rows)).toBe(topTypeOf(recommend(signatureOf(spec, rows))));
  });
});
