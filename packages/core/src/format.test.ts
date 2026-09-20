import { describe, expect, it } from 'vitest';

import { formatValue, formatterFor, type MemberFormats } from './format';

/**
 * T052 / AC-046: THE SYSTEM SHALL format every value with its member's format
 * from the Cube model, including currency and percentage, in axes, labels,
 * tooltips and tables.
 *
 * "From the Cube model" is the load-bearing phrase. The format is not a chart
 * setting a user picks per tile — it is declared once on the measure and has
 * to follow it everywhere, so the same number never appears as "1234" on an
 * axis and "$1,234.00" in a table of the same chart.
 */
const AMOUNT = 'orders.total_amount';
const COUNT = 'orders.count';
const RATE = 'orders.refund_rate';

/** Exactly the shape `/v1/meta` gives: a format per member, often absent. */
const FORMATS: MemberFormats = {
  [AMOUNT]: 'currency',
  [RATE]: 'percent',
};

describe('currency', () => {
  it('is written as money', () => {
    expect(formatValue(1234.5, AMOUNT, FORMATS)).toBe('$1,234.50');
  });

  it('keeps its pennies, because rounding money hides a discrepancy', () => {
    expect(formatValue(0.5, AMOUNT, FORMATS)).toBe('$0.50');
  });
});

describe('percent', () => {
  it('is written as a percentage of one', () => {
    // Cube's percent format means the value is already a proportion.
    expect(formatValue(0.125, RATE, FORMATS)).toBe('12.5%');
  });
});

describe('a member with no declared format', () => {
  it('is grouped but otherwise left alone', () => {
    expect(formatValue(1234, COUNT, FORMATS)).toBe('1,234');
  });

  it('is not turned into money just because another member is', () => {
    // The format follows the member, not the chart.
    expect(formatValue(1234, COUNT, FORMATS)).not.toContain('$');
  });
});

describe('values that are not numbers', () => {
  it('shows nothing for a gap rather than a zero or a NaN', () => {
    expect(formatValue(null, AMOUNT, FORMATS)).toBe('');
    expect(formatValue(undefined, AMOUNT, FORMATS)).toBe('');
    expect(formatValue('', AMOUNT, FORMATS)).toBe('');
  });

  it('passes a string through when it is not a number at all', () => {
    // A dimension's value is text; formatting it as currency would be worse
    // than leaving it.
    expect(formatValue('paid', COUNT, FORMATS)).toBe('paid');
  });

  it('reads the strings Cube sends for numbers', () => {
    // Measures arrive as strings over JSON.
    expect(formatValue('1234.5', AMOUNT, FORMATS)).toBe('$1,234.50');
  });
});

describe('a formatter for one member', () => {
  it('can be taken once and reused, for an axis or a column', () => {
    const money = formatterFor(AMOUNT, FORMATS);

    expect([1, 2].map(money)).toEqual(['$1.00', '$2.00']);
  });

  it('is the plain one when nothing is declared', () => {
    expect(formatterFor(COUNT, FORMATS)(1000)).toBe('1,000');
  });
});

describe('formats wechart does not render specially', () => {
  it('falls back to the plain number rather than failing', () => {
    // Cube's format vocabulary includes imageUrl, link and id, which mean
    // nothing to an axis. Refusing to draw would be worse than a number.
    expect(formatValue(42, 'orders.id', { 'orders.id': 'id' })).toBe('42');
  });
});
