import { QUICK_CALCS } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { quickCalcUnavailable } from './quickCalcAvailability';

/**
 * AC-049: WHEN a quick calculation needs a time dimension and the chart has
 * none, THE SYSTEM SHALL disable it and say which field is missing.
 * Fails when: the calculation is offered and produces an error, or gives no
 * reason when disabled.
 *
 * The four that run along time are the ones that need it: the previous
 * period is a `time_shift`, and a running total and a moving average are
 * rolling windows, which need a time dimension in the query
 * (research/cube/data-modeling.md Y.7; spike-model-store-and-quick-calcs.md §2).
 */
const OVER_TIME = [
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'runningTotal',
  'movingAverage',
] as const;

describe('a quick calculation without a time dimension (AC-049)', () => {
  const untimed = { timeDimensions: [] };

  it('is unavailable when it runs along time, naming the field to add', () => {
    for (const kind of OVER_TIME) {
      expect(quickCalcUnavailable(kind, untimed, ['Ordered at'])).toBe(
        'Needs a time field in Time: add Ordered at.',
      );
    }
  });

  it('names each time field the chart could take', () => {
    expect(quickCalcUnavailable('runningTotal', untimed, ['Ordered at', 'Shipped at'])).toBe(
      'Needs a time field in Time: add Ordered at or Shipped at.',
    );
    expect(
      quickCalcUnavailable('runningTotal', untimed, ['Ordered at', 'Shipped at', 'Paid at']),
    ).toBe('Needs a time field in Time: add Ordered at, Shipped at or Paid at.');
  });

  it('says so when the chart’s cube or view has no time field to add', () => {
    expect(quickCalcUnavailable('movingAverage', untimed, [])).toBe(
      'Needs a time field in Time, and this cube or view has none.',
    );
  });

  it('leaves % of total and rank available, which need no time', () => {
    expect(quickCalcUnavailable('percentOfTotal', untimed, ['Ordered at'])).toBeUndefined();
    expect(quickCalcUnavailable('rank', untimed, ['Ordered at'])).toBeUndefined();
  });

  it('leaves all six available once the chart has a time dimension', () => {
    for (const kind of QUICK_CALCS) {
      expect(
        quickCalcUnavailable(kind, { timeDimensions: ['orders.ordered_at'] }, ['Ordered at']),
      ).toBeUndefined();
    }
  });
});
