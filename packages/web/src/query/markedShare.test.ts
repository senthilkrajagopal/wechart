import { EMPTY_PREDICATE, limitFilterFor, withItem, withRange } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { markedShareFilter, needsMarkedShare } from './markedShare';

/**
 * T388 / AC-104: WHEN a tile needs the marked share and the marking's members
 * are not among its own groupings, THE SYSTEM SHALL obtain it with one
 * additional query per tile …
 *
 * Which tiles need it, and the filter that asks for it: the marking's own, as
 * a tile it limits is asked (`limitFilterFor`), its members named as the
 * tile's cube or view names them.
 */
const shipped = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'shipped' }]);

describe('which tiles need the marked share', () => {
  it('is a tile that doesn’t group by a member the marking names', () => {
    expect(needsMarkedShare(['products.category'], shipped)).toBe(true);
    expect(needsMarkedShare(['orders.status', 'products.category'], shipped)).toBe(false);
    // A range on a time dimension the tile groups by: its items are whole.
    const inMarch = withRange(EMPTY_PREDICATE, {
      member: 'orders.ordered_at',
      granularity: 'month',
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(needsMarkedShare(['orders.ordered_at'], inMarch)).toBe(false);
    expect(needsMarkedShare(['orders.status'], inMarch)).toBe(true);
  });

  it('reads the marking’s members as the tile’s cube or view names them (T388’s review)', () => {
    // A view's `status` is the marking's `orders.status`: grouped, not partly marked.
    const asView = (member: string) =>
      member === 'orders.status' ? 'sales_view.status' : undefined;
    expect(needsMarkedShare(['sales_view.status'], shipped, asView)).toBe(false);
    expect(needsMarkedShare(['sales_view.region'], shipped, asView)).toBe(true);
  });

  it('is no tile while the marking holds nothing', () => {
    expect(needsMarkedShare(['products.category'], EMPTY_PREDICATE)).toBe(false);
  });
});

describe('the filter that asks for it', () => {
  it('is the marking’s own, with its members as the tile names them', () => {
    expect(markedShareFilter(shipped, () => undefined)).toEqual({
      filter: limitFilterFor([shipped], 'all'),
    });
    expect(
      markedShareFilter(shipped, (member) =>
        member === 'orders.status' ? 'sales_view.status' : undefined,
      ),
    ).toEqual({ filter: { member: 'sales_view.status', operator: 'equals', values: ['shipped'] } });
  });

  it('is none for a member the tile can’t reach, or a marking that holds nothing', () => {
    expect(markedShareFilter(shipped, () => false)).toEqual({ unreached: 'orders.status' });
    expect(markedShareFilter(EMPTY_PREDICATE, () => undefined)).toBe(undefined);
  });
});
