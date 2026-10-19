import { describe, expect, it } from 'vitest';

import { EMPTY_PREDICATE, withItem, type MarkingPredicate } from '@wechart/core';

import { withFilters, type ActiveFilter } from '../../filters/apply';
import { changeOf, changeQueryOf, timeOf, valueQueryOf } from './elementQueries';

/**
 * T884 / AC-520: a Value shows a measure … optionally limited by a marking,
 * showing all data when nothing is marked unless the author chose "—" for
 * that case (AC-116), and with its own filter added to the tile's; and a
 * Change shows a measure's change against the previous period, at the
 * period it is set to.
 * `Fails when: … a marking-limited Value ignores the marking or the
 * nothing-marked choice; its own filter isn't applied …`
 *
 * AC-116: each element computed from Cube under the filters that reach its
 * tile and its own filter.
 */
const shipped: MarkingPredicate = withItem(EMPTY_PREDICATE, [
  { member: 'orders.status', value: 'shipped' },
]);
const SHIPPED = { member: 'orders.status', operator: 'equals', values: ['shipped'] };
const OWN = { member: 'orders.country', operator: 'equals', values: ['DE'] };

describe('what a Value asks Cube (T884, AC-520, AC-116)', () => {
  it('asks its measure over all data with no marking', () => {
    expect(
      valueQueryOf({ type: 'value', attrs: { measure: 'orders.revenue' } }, undefined),
    ).toEqual({ query: { measures: ['orders.revenue'] } });
  });

  it('asks it over the marked rows, limited by its marking', () => {
    expect(
      valueQueryOf(
        { type: 'value', attrs: { measure: 'orders.revenue', marking: 'Picks' } },
        shipped,
      ),
    ).toEqual({ query: { measures: ['orders.revenue'], filters: [SHIPPED] } });
  });

  it('with nothing marked, over all data, or nothing to ask when "—" is chosen', () => {
    expect(
      valueQueryOf(
        { type: 'value', attrs: { measure: 'orders.revenue', marking: 'Picks' } },
        EMPTY_PREDICATE,
      ),
    ).toEqual({ query: { measures: ['orders.revenue'] } });
    expect(
      valueQueryOf(
        {
          type: 'value',
          attrs: { measure: 'orders.revenue', marking: 'Picks', whenUnmarked: 'none' },
        },
        EMPTY_PREDICATE,
      ),
    ).toEqual({ none: true });
  });

  it('adds its own filter to the tile’s', () => {
    const asked = valueQueryOf(
      { type: 'value', attrs: { measure: 'orders.revenue', filters: [OWN] } },
      undefined,
    );
    if (!('query' in asked)) throw new Error('expected a query');
    expect(asked.query).toEqual({ measures: ['orders.revenue'], filters: [OWN] });
    const tile: ActiveFilter = {
      filter: { id: 'f', widget: 'list', member: 'orders.category' },
      value: { kind: 'values', values: ['Beverages'] },
    };
    expect(withFilters(asked.query, [tile])['filters']).toEqual([
      OWN,
      { member: 'orders.category', operator: 'equals', values: ['Beverages'] },
    ]);
  });
});

describe('what a Change asks, and what it comes to (T884, AC-520)', () => {
  it('asks the last two periods of its time dimension, at its period, newest first', () => {
    expect(
      changeQueryOf(
        {
          type: 'change',
          attrs: { measure: 'orders.revenue', period: 'quarter', filters: [OWN] },
        },
        'orders.created_at',
      ),
    ).toEqual({
      measures: ['orders.revenue'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'quarter' }],
      order: { 'orders.created_at': 'desc' },
      limit: 2,
      filters: [OWN],
    });
  });

  it('compares the newest period with the one before it', () => {
    const rows = [{ 'orders.revenue': '1270000' }, { 'orders.revenue': '1220000' }];
    const change = changeOf(rows, 'orders.revenue');
    expect(change?.delta).toBe(50000);
    expect(change?.ratio).toBeCloseTo(0.041, 3);
    // One period alone, or none, has nothing to compare.
    expect(changeOf(rows.slice(0, 1), 'orders.revenue')).toBeUndefined();
    // Against nothing, a ratio is no number.
    expect(
      changeOf([{ 'orders.revenue': '5' }, { 'orders.revenue': '0' }], 'orders.revenue'),
    ).toEqual({ current: 5, previous: 0, delta: 5, ratio: undefined });
  });

  it('takes its own time dimension, else its cube’s first', () => {
    const model = {
      cubes: [
        {
          name: 'orders',
          measures: [{ name: 'orders.revenue' }],
          dimensions: [
            { name: 'orders.status', type: 'string' },
            { name: 'orders.created_at', type: 'time' },
            { name: 'orders.shipped_at', type: 'time' },
          ],
        },
      ],
    };
    expect(timeOf({ type: 'change', attrs: { measure: 'orders.revenue' } }, model)).toBe(
      'orders.created_at',
    );
    expect(
      timeOf(
        { type: 'change', attrs: { measure: 'orders.revenue', time: 'orders.shipped_at' } },
        model,
      ),
    ).toBe('orders.shipped_at');
    expect(timeOf({ type: 'change', attrs: { measure: 'people.count' } }, model)).toBeUndefined();
  });
});
