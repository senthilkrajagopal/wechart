import { describe, expect, it } from 'vitest';

import type { RenderSpec } from './render-spec';
import { applyTopN, OTHER_LABEL } from './topN';

/**
 * T048 / AC-041: WHEN a categorical chart exceeds its top-N setting, THE
 * SYSTEM SHALL aggregate the remainder into a single "Other (n)" item and
 * label it with the number of members it covers.
 *
 * The count in the label is the part that stops "Other" being a lie. A slice
 * labelled just "Other" could be two members or two hundred, and a reader has
 * no way to tell how much of the chart they are not seeing.
 */
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [
    { [STATUS]: 'a', [COUNT]: 50 },
    { [STATUS]: 'b', [COUNT]: 40 },
    { [STATUS]: 'c', [COUNT]: 30 },
    { [STATUS]: 'd', [COUNT]: 20 },
    { [STATUS]: 'e', [COUNT]: 10 },
  ],
  options: { topN: 3 },
  ...over,
});

const categoriesOf = (result: RenderSpec) => result.rows.map((row) => String(row[STATUS]));

describe('collapsing the tail', () => {
  it('keeps the top N and folds the rest into one item', () => {
    expect(categoriesOf(applyTopN(spec()))).toEqual(['a', 'b', 'c', `${OTHER_LABEL} (2)`]);
  });

  it('says how many members the item covers', () => {
    // "Other" alone could be two members or two hundred. The count is what
    // tells a reader how much of the chart they are not seeing.
    expect(categoriesOf(applyTopN(spec({ options: { topN: 1 } })))).toContain(`${OTHER_LABEL} (4)`);
  });

  it('adds up what it folded in', () => {
    const folded = applyTopN(spec()).rows.at(-1);

    // d + e.
    expect(folded?.[COUNT]).toBe(30);
  });

  it('ranks by value, so the tail is the small members and not the late ones', () => {
    const unsorted = spec({
      rows: [
        { [STATUS]: 'small', [COUNT]: 1 },
        { [STATUS]: 'big', [COUNT]: 100 },
        { [STATUS]: 'middling', [COUNT]: 50 },
      ],
      options: { topN: 2 },
    });

    expect(categoriesOf(applyTopN(unsorted))).toEqual(['big', 'middling', `${OTHER_LABEL} (1)`]);
  });
});

describe('when there is no tail to collapse', () => {
  it('leaves a chart with fewer categories than the setting alone', () => {
    const few = spec({ options: { topN: 10 } });

    expect(applyTopN(few).rows).toEqual(few.rows);
  });

  it('adds no item when the count is exactly the setting', () => {
    const exact = spec({ options: { topN: 5 } });

    // An "Other (0)" would be an empty category taking a colour and a legend
    // entry for nothing.
    expect(categoriesOf(applyTopN(exact))).not.toContain(OTHER_LABEL);
    expect(applyTopN(exact).rows).toHaveLength(5);
  });

  it('does nothing at all without a setting', () => {
    const none = spec({ options: {} });

    expect(applyTopN(none)).toBe(none);
  });

  it('does nothing to a chart with no category', () => {
    const noCategory = spec({ encoding: { y: [COUNT] } });

    expect(applyTopN(noCategory)).toBe(noCategory);
  });
});

describe('several measures', () => {
  it('folds each one separately', () => {
    const two = spec({
      encoding: { x: [STATUS], y: [COUNT, 'orders.amount'] },
      rows: [
        { [STATUS]: 'a', [COUNT]: 10, 'orders.amount': 1 },
        { [STATUS]: 'b', [COUNT]: 20, 'orders.amount': 2 },
        { [STATUS]: 'c', [COUNT]: 30, 'orders.amount': 4 },
      ],
      options: { topN: 1 },
    });

    const folded = applyTopN(two).rows.at(-1);
    expect(folded?.[COUNT]).toBe(30);
    expect(folded?.['orders.amount']).toBe(3);
  });
});

describe('gaps', () => {
  it('treats a missing value as absent rather than as zero when ranking', () => {
    const withGap = spec({
      rows: [
        { [STATUS]: 'a', [COUNT]: null },
        { [STATUS]: 'b', [COUNT]: 5 },
        { [STATUS]: 'c', [COUNT]: 1 },
      ],
      options: { topN: 1 },
    });

    // "a" has no measurement, so it cannot outrank one that does.
    expect(categoriesOf(applyTopN(withGap))[0]).toBe('b');
  });
});
