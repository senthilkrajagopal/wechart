import { addItemsWithinLimit, EMPTY_PREDICATE, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { clickedEntity, clickedMarkItem, clickedValue } from './clicked';

/**
 * T993 / AC-593: THE SYSTEM SHALL mark a box plot's point as its entity by
 * ID, at most 1,000 (AC-102), and the points inside a rectangle or lasso, and
 * a box or violin as its category member, as today …
 * `Fails when: a point marks other than its entity's ID; a box or violin
 * marks other than its member; …`
 *
 * Design 23 sheet 11, Cross-filter: "a box or violin filters to its member;
 * a point to its Order." A point carries its entity as drawn
 * (`series/boxplot.ts`); a shape names it so too (`itemsInShape`).
 */
const spec = {
  chartType: 'boxplot',
  encoding: { x: ['orders.region'], y: ['orders.amount'] },
  eachPointIs: 'orders.id',
  rows: [
    { 'orders.region': 'EMEA', 'orders.id': 7, 'orders.amount': '100' },
    { 'orders.region': 'EMEA', 'orders.id': 'E-2', 'orders.amount': '120' },
  ],
} as unknown as RenderSpec;

describe('a box plot clicked (AC-593)', () => {
  it('marks and filters a point by its entity’s ID, as its row holds it', () => {
    const point = { name: 'EMEA', seriesName: 'orders.amount (points)', entity: 'E-2' };
    expect(clickedValue(spec, point)).toEqual({ member: 'orders.id', value: 'E-2' });
    expect(clickedMarkItem(spec, point)).toEqual([{ member: 'orders.id', value: 'E-2' }]);
    // A numeric ID is marked as its row holds it, so the row matches.
    expect(clickedMarkItem(spec, { ...point, entity: '7' })).toEqual([
      { member: 'orders.id', value: 7 },
    ]);
  });

  it('marks and filters a box or a violin by its category', () => {
    for (const seriesName of ['orders.amount', 'orders.amount (violin)']) {
      expect(clickedMarkItem(spec, { name: 'EMEA', seriesName })).toEqual([
        { member: 'orders.region', value: 'EMEA' },
      ]);
    }
  });

  it('marks at most 1,000 points from one lasso, refusing the rest and saying so (AC-102)', () => {
    const many = {
      ...spec,
      rows: Array.from({ length: 1200 }, (_, at) => ({
        'orders.region': 'EMEA',
        'orders.id': `O-${String(at)}`,
        'orders.amount': String(at),
      })),
    } as unknown as RenderSpec;
    const enclosed = many.rows.flatMap((row) => {
      const item = clickedMarkItem(many, {
        name: 'EMEA',
        seriesName: 'orders.amount (points)',
        entity: String(row['orders.id']),
      });
      return item === undefined ? [] : [item];
    });
    expect(enclosed).toHaveLength(1200);
    const grown = addItemsWithinLimit(EMPTY_PREDICATE, enclosed);
    expect(grown.predicate.items).toHaveLength(1000);
    expect(grown.refused).toBe(200);
    expect(grown.message).toMatch(/1,000/);
  });

  it('reads a point’s entity from what ECharts reports of it', () => {
    expect(clickedEntity({ data: { value: ['EMEA', 100], entity: 'E-2' } })).toBe('E-2');
    expect(clickedEntity({ data: { value: ['EMEA', 100], entity: 7 } })).toBe('7');
    expect(clickedEntity({ data: ['EMEA', 100] })).toBeUndefined();
  });
});
