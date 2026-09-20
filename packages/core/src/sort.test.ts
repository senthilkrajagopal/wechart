import { describe, expect, it } from 'vitest';

import type { RenderSpec } from './render-spec';
import { applySort } from './sort';

/**
 * T051 / AC-044: WHEN the user sorts a chart, THE SYSTEM SHALL order
 * categories by value ascending, value descending or label, and keep that
 * order after a data refresh.
 *
 * The second half is the one that needs care. "Keeps the order after a
 * refresh" means the order is a property of the chart, not of the rows that
 * happened to arrive — so the same setting applied to the same data has to
 * give the same answer, including for ties.
 */
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [
    { [STATUS]: 'banana', [COUNT]: 20 },
    { [STATUS]: 'apple', [COUNT]: 30 },
    { [STATUS]: 'cherry', [COUNT]: 10 },
  ],
  ...over,
});

const order = (result: RenderSpec) => result.rows.map((row) => String(row[STATUS]));

describe('by value', () => {
  it('puts the largest first when descending', () => {
    expect(
      order(applySort(spec({ options: { sort: { by: 'value', direction: 'desc' } } }))),
    ).toEqual(['apple', 'banana', 'cherry']);
  });

  it('puts the smallest first when ascending', () => {
    expect(
      order(applySort(spec({ options: { sort: { by: 'value', direction: 'asc' } } }))),
    ).toEqual(['cherry', 'banana', 'apple']);
  });
});

describe('by label', () => {
  it('orders alphabetically', () => {
    expect(
      order(applySort(spec({ options: { sort: { by: 'label', direction: 'asc' } } }))),
    ).toEqual(['apple', 'banana', 'cherry']);
  });

  it('reverses when descending', () => {
    expect(
      order(applySort(spec({ options: { sort: { by: 'label', direction: 'desc' } } }))),
    ).toEqual(['cherry', 'banana', 'apple']);
  });
});

describe('without a setting', () => {
  it('leaves the order Cube returned', () => {
    const untouched = spec({ options: {} });

    // Cube was asked for an ordering and returned one. Imposing another here
    // would silently override it.
    expect(applySort(untouched)).toBe(untouched);
  });
});

describe('after a refresh', () => {
  it('gives the same order for the same data', () => {
    const sorted = spec({ options: { sort: { by: 'value', direction: 'desc' } } });

    expect(order(applySort(sorted))).toEqual(order(applySort(sorted)));
  });

  it('keeps tied categories in a stable order rather than shuffling them', () => {
    const ties = spec({
      rows: [
        { [STATUS]: 'b', [COUNT]: 10 },
        { [STATUS]: 'a', [COUNT]: 10 },
        { [STATUS]: 'c', [COUNT]: 10 },
      ],
      options: { sort: { by: 'value', direction: 'desc' } },
    });

    // All equal, so nothing distinguishes them by value. Arrival order is
    // preserved, which means a refresh returning the same rows redraws the
    // same chart rather than reshuffling the ties.
    expect(order(applySort(ties))).toEqual(['b', 'a', 'c']);
  });
});

describe('gaps and the folded tail', () => {
  it('sorts a category with no measurement to the end, not to zero', () => {
    const withGap = spec({
      rows: [
        { [STATUS]: 'missing', [COUNT]: null },
        { [STATUS]: 'small', [COUNT]: 1 },
      ],
      options: { sort: { by: 'value', direction: 'asc' } },
    });

    // Ascending, a null treated as zero would sort in front of every real
    // value and claim it was the smallest measurement.
    expect(order(applySort(withGap))).toEqual(['small', 'missing']);
  });

  it('leaves "Other" at the end whatever the sort', () => {
    const folded = spec({
      rows: [
        { [STATUS]: 'a', [COUNT]: 1 },
        { [STATUS]: 'b', [COUNT]: 100 },
        { [STATUS]: 'Other (3)', [COUNT]: 50 },
      ],
      options: { sort: { by: 'value', direction: 'desc' } },
    });

    // It is not a member, and sorting it into the middle by its total would
    // imply it were one.
    expect(order(applySort(folded)).at(-1)).toBe('Other (3)');
  });
});
