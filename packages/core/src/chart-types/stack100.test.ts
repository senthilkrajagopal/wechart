import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '../render-spec';
import {
  foldForShares,
  isPercentStack,
  percentRefusal,
  SHARE_SERIES_CAP,
  sharesOf,
  shareText,
  stackOf,
  withStack,
} from './stack100';

/**
 * T957 / AC-584, AC-037: THE SYSTEM SHALL offer Customize › Stack, Sum or
 * 100 %, on Stacked bar and Stacked area …; WHILE the measure isn't summed,
 * 100 % SHALL be disabled with "‹measure› is an average, so its shares of a
 * total wouldn't mean anything. 100 % takes a summed measure."; … folding to
 * "Other" (AC-041) and the row limit SHALL apply before shares are taken, so
 * each bar's or point's drawn shares add to 100 %; tooltips SHALL give both
 * value and share ("Web: $210K · 51 % of EMEA") …
 * `Fails when: … 100 % can be chosen for an average; … a bar's drawn shares
 * don't add to 100 %, or shares are taken before folding; or a tooltip lacks
 * the value or the share.`
 */
const REGIONS = ['EMEA', 'APAC', 'Americas', 'LATAM'];
const CHANNELS = Array.from({ length: 12 }, (_, at) => `Channel ${String(at + 1)}`);

/** Revenue by Region and Channel: channel n's revenue grows with n, so 12 … 6 are the largest. */
const rows = REGIONS.flatMap((region, r) =>
  CHANNELS.map((channel, c) => ({
    'orders.region': region,
    'orders.channel': channel,
    'orders.revenue': String((c + 1) * 1000 + r * 37.3),
  })),
);

const spec = (options: Record<string, unknown>): RenderSpec =>
  ({
    chartType: 'stackedBar',
    encoding: { x: ['orders.region'], color: ['orders.channel'], y: ['orders.revenue'] },
    rows,
    options,
    measureTypes: { 'orders.revenue': 'sum' },
  }) as unknown as RenderSpec;

describe('100 % stacking (AC-584, AC-037)', () => {
  it('is Sum unless 100 % is stored, and stores nothing for Sum', () => {
    expect(stackOf({})).toBe('sum');
    expect(stackOf({ stack: 'percent' })).toBe('percent');
    expect(stackOf({ stack: 'nonsense' })).toBe('sum');
    expect(withStack({ topN: 5, stack: 'percent' }, 'sum')).toEqual({ topN: 5 });
    expect(withStack({ topN: 5 }, 'percent')).toEqual({ topN: 5, stack: 'percent' });
  });

  it('draws at 100 % only a stacked bar or a stacked area', () => {
    expect(isPercentStack(spec({ stack: 'percent' }))).toBe(true);
    expect(isPercentStack({ ...spec({ stack: 'percent' }), chartType: 'stackedArea' })).toBe(true);
    expect(isPercentStack({ ...spec({ stack: 'percent' }), chartType: 'groupedBar' })).toBe(false);
    expect(isPercentStack(spec({}))).toBe(false);
  });

  it('draws at Sum a measure not known to be summed, though 100 % was stored', () => {
    const averaged = { ...spec({ stack: 'percent' }), measureTypes: { 'orders.revenue': 'avg' } };
    expect(isPercentStack(averaged)).toBe(false);
    const summed = { ...spec({ stack: 'percent' }), measureTypes: { 'orders.revenue': 'sum' } };
    expect(isPercentStack(summed)).toBe(true);
    // Nothing known of it, as the editor refuses it: at Sum, the two agreeing (T957's review).
    const unknown = { ...spec({ stack: 'percent' }), measureTypes: {} };
    expect(isPercentStack(unknown)).toBe(false);
    const untyped = Object.fromEntries(
      Object.entries(spec({ stack: 'percent' })).filter(([key]) => key !== 'measureTypes'),
    ) as unknown as RenderSpec;
    expect(isPercentStack(untyped)).toBe(false);
  });

  it('refuses 100 % for a measure that isn’t summed, saying why', () => {
    expect(percentRefusal('Margin %', 'avg')).toBe(
      'Margin % is an average, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.',
    );
    expect(percentRefusal('Customers', 'countDistinct')).toBe(
      'Customers isn’t summed, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.',
    );
    expect(percentRefusal('Revenue', 'sum')).toBeUndefined();
    expect(percentRefusal('Orders', 'count')).toBeUndefined();
    // Nothing known of it: not offered, since a share is a claim about the data.
    expect(percentRefusal('Mystery', undefined)).toBe(
      'Mystery isn’t summed, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.',
    );
  });

  it('folds 12 channels to 7 and "Other (5)" before shares are taken, the 5 smallest by total', () => {
    expect(SHARE_SERIES_CAP).toBe(8);
    const folded = foldForShares(spec({ stack: 'percent' }));
    const channels = [...new Set(folded.rows.map((row) => String(row['orders.channel'])))];
    expect(channels).toHaveLength(8);
    expect(channels).toContain('Other (5)');
    for (const kept of CHANNELS.slice(5)) expect(channels).toContain(kept);
    // EMEA's Other is the sum of its five smallest channels.
    const other = folded.rows.find(
      (row) => row['orders.region'] === 'EMEA' && row['orders.channel'] === 'Other (5)',
    );
    expect(Number(other?.['orders.revenue'])).toBeCloseTo(1000 + 2000 + 3000 + 4000 + 5000, 9);
  });

  it('leaves a chart of 8 channels or fewer, or at Sum, as it is', () => {
    const sum = spec({});
    expect(foldForShares(sum)).toBe(sum);
    const eight = CHANNELS.slice(0, 8);
    const few = {
      ...spec({ stack: 'percent' }),
      rows: rows.filter((row) => eight.includes(String(row['orders.channel']))),
    };
    expect(foldForShares(few)).toBe(few);
  });

  it('gives each region’s drawn shares summing to 100 within 1e-9', () => {
    const series = CHANNELS.map((name, c) => ({
      name,
      values: REGIONS.map((_, r) => (c + 1) * 1000 + r * 37.3),
    }));
    const shares = sharesOf(series);
    for (const [r] of REGIONS.entries()) {
      const total = shares.reduce((sum, one) => sum + (one.values[r] ?? 0), 0);
      expect(Math.abs(total - 100)).toBeLessThan(1e-9);
    }
    expect(shares[0]?.name).toBe('Channel 1');
  });

  it('leaves a gap a gap, and a category with nothing in it unshared', () => {
    const shares = sharesOf([
      { name: 'Web', values: [210, null, 0] },
      { name: 'Store', values: [200, 50, 0] },
    ]);
    expect(shares[0]?.values[1]).toBeNull();
    expect(shares[1]?.values[1]).toBe(100);
    expect(shares[0]?.values[2]).toBeNull();
  });

  it('writes a tooltip line with the value and its share of the category', () => {
    expect(shareText('Web', '$210K', 51.2, 'EMEA')).toBe('Web: $210K · 51 % of EMEA');
  });
});
