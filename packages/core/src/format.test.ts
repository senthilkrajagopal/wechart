import { describe, expect, it } from 'vitest';

import { formatValue, formatterFor, type MemberFormats, type TimeGranularity } from './format';

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
    expect(formatValue(1234.5, AMOUNT, FORMATS)).toBe('$1,234.5');
  });

  it('is written as Cube writes it: two decimals at most, their trailing zeros trimmed', () => {
    /**
     * Cube's `currency` is `$,.2~f` (research/cube/data-modeling.md, "What
     * `/v1/meta` reports for each format"). T052 kept the pennies ("$0.50");
     * the user chose Cube's own format over that, 2026-09-21 (T201).
     */
    expect(formatValue(0.5, AMOUNT, FORMATS)).toBe('$0.5');
    expect(formatValue(1234.567, AMOUNT, FORMATS)).toBe('$1,234.57');
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
    expect(formatValue('1234.5', AMOUNT, FORMATS)).toBe('$1,234.5');
  });
});

describe('a formatter for one member', () => {
  it('can be taken once and reused, for an axis or a column', () => {
    const money = formatterFor(AMOUNT, FORMATS);

    expect([1, 2].map(money)).toEqual(['$1', '$2']);
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

  it('leaves an id as it is, never grouped (T195)', () => {
    // An id is not a quantity: "1,234" misstates order 1234.
    expect(formatValue(1234, 'orders.id', { 'orders.id': 'id' })).toBe('1234');
    expect(formatterFor('orders.id', { 'orders.id': 'id' })('98765')).toBe('98765');
  });
});

/**
 * T201 / AC-046: the rest of Cube's vocabulary, each given as `/v1/meta`
 * reports it — the d3 specifier Cube means, in `formatDescription`, and the
 * currency code beside it (observed: research/cube/data-modeling.md, "What
 * `/v1/meta` reports for each format"). The user chose Cube's own formats,
 * 2026-09-21.
 */
describe('Cube’s whole format vocabulary', () => {
  const M = 'probe.value';
  const written = (value: number, specifier: string, currency?: string) =>
    formatValue(value, M, {
      [M]: { specifier, ...(currency === undefined ? {} : { currency }) },
    });

  it('writes each named format by the specifier Cube reports for it', () => {
    expect(written(0.1234, '.1~%')).toBe('12.3%'); // percent_1
    expect(written(1234.56, '$,.0f')).toBe('$1,235'); // currency_0
    expect(written(1234567, '.2~s')).toBe('1.2M'); // abbr
    expect(written(-1234.5, '(,.2~f')).toBe('(1,234.5)'); // accounting
    expect(written(1234.56789, ',.3~f')).toBe('1,234.568'); // number_3
    expect(written(1234, '.0f')).toBe('1234'); // id
  });

  it('writes a custom d3 specifier as d3 does', () => {
    expect(written(1234.56, '$,.1f')).toBe('$1,234.6');
  });

  it('writes a declared currency in its own symbol', () => {
    // A `currency: EUR` keeps the `$` specifier; the code names the symbol.
    expect(written(1234.5, '$,.2~f', 'EUR')).toBe('€1,234.5');
    expect(written(1234.5, '$,.2~f', 'GBP')).toBe('£1,234.5');
  });

  it('falls back to Cube’s plain number for a specifier d3 cannot read', () => {
    expect(written(1234.5, 'not a specifier')).toBe('1,234.5');
  });

  it('writes a negative with a plain minus, as a reader can type it', () => {
    // d3 writes U+2212 by default; wechart keeps the hyphen-minus it has
    // always written, which searches and copies as a number.
    expect(written(-5, ',.2~f')).toBe('-5');
  });
});

/**
 * T206 / AC-188: THE SYSTEM SHALL write a time dimension's values by their
 * granularity — a year as "2026", a quarter as "Q1 2026", a month as
 * "Jan 2026", a week as "Week of Jan 5, 2026", a day as "Jan 2, 2026", and an
 * hour or finer with the time — in axes, labels, tooltips and tables, unless
 * the member's model format says otherwise.
 * Fails when: a time value shows as a raw timestamp such as
 * "2026-01-02T00:00:00.000".
 *
 * The values are Cube's as observed (research/cube/data-apis.md, "The values
 * that come back"): a bucket's start, `YYYY-MM-DDTHH:mm:ss.SSS`, no offset.
 */
describe('a time value, by its granularity', () => {
  const AT = 'orders.ordered_at';
  const written = (granularity: TimeGranularity, value: unknown) =>
    formatterFor(AT, {}, { [AT]: granularity })(value);

  it('writes each granularity as AC-188 lists', () => {
    expect(written('year', '2026-01-01T00:00:00.000')).toBe('2026');
    expect(written('quarter', '2026-01-01T00:00:00.000')).toBe('Q1 2026');
    expect(written('quarter', '2026-10-01T00:00:00.000')).toBe('Q4 2026');
    expect(written('month', '2026-01-01T00:00:00.000')).toBe('Jan 2026');
    expect(written('week', '2026-01-05T00:00:00.000')).toBe('Week of Jan 5, 2026');
    expect(written('day', '2026-01-02T00:00:00.000')).toBe('Jan 2, 2026');
  });

  it('writes an hour or finer with the time', () => {
    expect(written('hour', '2026-01-02T15:00:00.000')).toBe('Jan 2, 2026, 3:00 PM');
    expect(written('minute', '2026-01-02T15:04:00.000')).toBe('Jan 2, 2026, 3:04 PM');
    expect(written('second', '2026-01-02T15:04:05.000')).toBe('Jan 2, 2026, 3:04:05 PM');
  });

  it('writes the bucket Cube named, whatever the reader’s own time zone', () => {
    // No offset: the value is already in the query's time zone, so a reader
    // west of it must not see the day before, nor midnight as 7 PM.
    expect(written('day', '2026-01-01T00:00:00.000')).toBe('Jan 1, 2026');
    expect(written('year', '2026-01-01T00:00:00.000')).toBe('2026');
  });

  it('writes a week that starts in the year before under that year', () => {
    expect(written('week', '2025-12-29T00:00:00.000')).toBe('Week of Dec 29, 2025');
  });

  it('is the same through formatValue', () => {
    expect(formatValue('2026-01-01T00:00:00.000', AT, {}, { [AT]: 'month' })).toBe('Jan 2026');
  });

  it('leaves a gap empty, and text that is not a time as it came', () => {
    expect(written('day', null)).toBe('');
    expect(written('day', 'not a time')).toBe('not a time');
  });

  it('writes Cube’s `member.granularity` column of the same time the same way', () => {
    // A grouped result carries the time twice: as the member and as
    // `member.<granularity>` (research/cube/data-apis.md).
    expect(formatterFor(`${AT}.month`, {}, { [AT]: 'month' })('2026-01-01T00:00:00.000')).toBe(
      'Jan 2026',
    );
    // A suffix that is not a granularity is some other member.
    expect(formatterFor(`${AT}.label`, {}, { [AT]: 'month' })('x')).toBe('x');
  });

  it('gives way to the member’s own time format from the model (AC-188, T201)', () => {
    // `{type: 'custom-time', value}` in `/v1/meta`, written by d3-time-format
    // as Cube's own client writes it (research/d3-time-format.md).
    const monthly = { [AT]: { time: '%Y-%m' } };
    expect(formatterFor(AT, monthly, { [AT]: 'day' })('2026-01-02T00:00:00.000')).toBe('2026-01');
    // And under Cube's `member.<granularity>` column beside it.
    expect(formatterFor(`${AT}.day`, monthly, { [AT]: 'day' })('2026-01-02T00:00:00.000')).toBe(
      '2026-01',
    );
  });

  it('writes Cube’s documented time-format examples as Cube documents them', () => {
    const at = '2025-12-04T14:30:00.000';
    const pattern = (time: string) => formatValue(at, AT, { [AT]: { time } });
    expect(pattern('%m/%d/%Y %H:%M')).toBe('12/04/2025 14:30');
    expect(pattern('%B %d, %Y')).toBe('December 04, 2025');
    expect(pattern('%b %d, %Y')).toBe('Dec 04, 2025');
    expect(pattern('%I:%M %p')).toBe('02:30 PM');
    expect(pattern('%A, %B %d')).toBe('Thursday, December 04');
    expect(pattern('Q%q %Y')).toBe('Q4 2025');
  });

  it('keeps to the granularity’s form when the model’s time format has no directive', () => {
    // A time dimension's `format: link` reaches meta as a custom-time "link",
    // which d3 would print for every value (research/d3-time-format.md).
    expect(
      formatterFor(AT, { [AT]: { time: 'link' } }, { [AT]: 'month' })('2026-01-01T00:00:00.000'),
    ).toBe('Jan 2026');
  });

  it('does not touch a member with no granularity', () => {
    expect(formatterFor('orders.status', {}, { [AT]: 'day' })('shipped')).toBe('shipped');
  });
});
