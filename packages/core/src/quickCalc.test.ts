import { describe, expect, it } from 'vitest';

import { addToWell, emptySpec, removeFromWell } from './chart-spec';
import {
  MOVING_AVERAGE_PERIODS,
  QUICK_CALCS,
  QUICK_CALC_NAMES,
  applyQuickCalc,
  quickCalcName,
  readQuickCalcs,
} from './quickCalc';

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 *
 * The menu draws from this list, so the list is where a missing one would
 * start.
 */
describe('the six quick calculations (AC-047)', () => {
  it('are the six the criterion names, in its order', () => {
    expect(QUICK_CALCS.map((kind) => QUICK_CALC_NAMES[kind])).toEqual([
      '% of total',
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Rank',
      'Moving average',
    ]);
  });

  it('are each named as applied, a moving average with its window', () => {
    expect(quickCalcName({ kind: 'percentOfTotal' })).toBe('% of total');
    expect(quickCalcName({ kind: 'rank' })).toBe('Rank');
    expect(quickCalcName({ kind: 'movingAverage', periods: 3 })).toBe('Moving average, 3 periods');
  });

  it('offer a moving average over 3, 6 or 12 periods (the user, 2026-09-24)', () => {
    expect(MOVING_AVERAGE_PERIODS).toEqual([3, 6, 12]);
    expect(quickCalcName({ kind: 'movingAverage', periods: 12 })).toBe(
      'Moving average, 12 periods',
    );
  });
});

describe('a calculation applied to a measure of the chart', () => {
  const spec = addToWell(
    addToWell(emptySpec('orders'), 'measures', 'orders.count'),
    'measures',
    'orders.total_amount',
  );

  it('is held on the chart, by the measure it applies to', () => {
    const applied = applyQuickCalc(spec, 'orders.count', { kind: 'rank' });

    expect(applied.calculations).toEqual({ 'orders.count': { kind: 'rank' } });
  });

  it('replaces the measure’s calculation, and leaves the other measure’s', () => {
    const both = applyQuickCalc(
      applyQuickCalc(spec, 'orders.count', { kind: 'rank' }),
      'orders.total_amount',
      { kind: 'percentOfTotal' },
    );

    expect(
      applyQuickCalc(both, 'orders.count', { kind: 'movingAverage', periods: 6 }).calculations,
    ).toEqual({
      'orders.count': { kind: 'movingAverage', periods: 6 },
      'orders.total_amount': { kind: 'percentOfTotal' },
    });
  });

  it('is taken off, leaving none stored once the last one goes', () => {
    const applied = applyQuickCalc(spec, 'orders.count', { kind: 'rank' });

    expect(applyQuickCalc(applied, 'orders.count', undefined)).not.toHaveProperty('calculations');
  });

  it('goes with its measure when the measure leaves the chart', () => {
    const applied = applyQuickCalc(
      applyQuickCalc(spec, 'orders.count', { kind: 'rank' }),
      'orders.total_amount',
      { kind: 'runningTotal' },
    );

    expect(removeFromWell(applied, 'measures', 'orders.count').calculations).toEqual({
      'orders.total_amount': { kind: 'runningTotal' },
    });
    expect(
      removeFromWell(
        removeFromWell(applied, 'measures', 'orders.count'),
        'measures',
        'orders.total_amount',
      ),
    ).not.toHaveProperty('calculations');
  });
});

describe('reading a stored chart’s calculations', () => {
  it('reads each of the six', () => {
    const stored = {
      'a.one': { kind: 'percentOfTotal' },
      'a.two': { kind: 'differenceFromPrevious' },
      'a.three': { kind: 'percentDifferenceFromPrevious' },
      'a.four': { kind: 'runningTotal' },
      'a.five': { kind: 'rank' },
      'a.six': { kind: 'movingAverage', periods: 12 },
    };

    expect(readQuickCalcs(stored)).toEqual(stored);
  });

  it('refuses a calculation wechart does not have', () => {
    expect(() => readQuickCalcs({ 'a.one': { kind: 'median' } })).toThrow(/a\.one/);
  });

  it('refuses a moving average over a window the menu does not offer', () => {
    expect(() => readQuickCalcs({ 'a.one': { kind: 'movingAverage', periods: 5 } })).toThrow(
      /a\.one/,
    );
  });

  it('refuses anything but a map of measures to calculations', () => {
    expect(() => readQuickCalcs([{ kind: 'rank' }])).toThrow();
  });
});
