import {
  EMPTY_PREDICATE,
  limitFilterFor,
  withItem,
  withRange,
  type MarkingPredicate,
} from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { measureQueryOf } from './TextTokens';

/**
 * T389 / AC-116: … a measure token limited by a marking SHALL show the
 * measure over the marked rows, or over all data when nothing is marked.
 * `Fails when: … a limited measure ignores the marking.`
 *
 * The tokens are read in core (`text-tokens.test.ts`); this is what one asks.
 */
describe('a measure token’s query', () => {
  const shipped: MarkingPredicate = withItem(EMPTY_PREDICATE, [
    { member: 'orders.status', value: 'shipped' },
  ]);

  it('asks the measure over the marked rows when its marking holds something', () => {
    expect(
      measureQueryOf({ kind: 'measure', member: 'orders.count', marking: 'M' }, shipped),
    ).toEqual({
      measures: ['orders.count'],
      filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    });
  });

  it('asks it over a marked range, or a marked item, as a tile the marking limits is asked', () => {
    const range = withRange(EMPTY_PREDICATE, { member: 'orders.amount', from: 10, to: 20 });
    for (const marked of [range, withItem(range, [{ member: 'orders.status', value: 'paid' }])]) {
      const limit = limitFilterFor([marked], 'all');
      expect(limit).not.toBe(undefined);
      expect(
        measureQueryOf({ kind: 'measure', member: 'orders.count', marking: 'M' }, marked),
      ).toEqual({ measures: ['orders.count'], filters: [limit] });
    }
  });

  it('asks it over all data when nothing is marked, or no marking is named', () => {
    expect(
      measureQueryOf({ kind: 'measure', member: 'orders.count', marking: 'M' }, EMPTY_PREDICATE),
    ).toEqual({ measures: ['orders.count'] });
    expect(measureQueryOf({ kind: 'measure', member: 'orders.count' }, undefined)).toEqual({
      measures: ['orders.count'],
    });
  });
});
