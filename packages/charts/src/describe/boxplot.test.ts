import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { describeBoxplot } from './boxplot';
import { describeChart } from './index';

/**
 * T993 / AC-593: … and SHALL add to its text alternative how points and
 * violin are drawn ("Points: every order, as a beeswarm. Violin: EMEA gathers
 * near $120; APAC spreads widest.") …
 * `Fails when: … the text alternative or "View points" is missing.`
 *
 * Design 23 sheet 11: "Today's five statistics and n per region, then
 * "Points: every order, as a beeswarm. Violin: EMEA gathers near $120; APAC
 * spreads widest."" (decision T993-1 for the words).
 */
const REGION = 'orders.region';
const ORDER = 'orders.id';
const AMOUNT = 'orders.amount';

/** EMEA's orders gathered near $120, APAC's spread from $50 to $410. */
const rows = (): RenderSpec['rows'] => [
  ...[100, 110, 115, 118, 120, 120, 122, 125, 130, 160].map((amount, at) => ({
    [REGION]: 'EMEA',
    [ORDER]: `E-${String(at)}`,
    [AMOUNT]: String(amount),
  })),
  ...[50, 90, 130, 170, 210, 250, 290, 330, 370, 410].map((amount, at) => ({
    [REGION]: 'APAC',
    [ORDER]: `A-${String(at)}`,
    [AMOUNT]: String(amount),
  })),
];

const spec = (distribution?: Record<string, unknown>, eachPointIs: string | null = ORDER) =>
  ({
    chartType: 'boxplot',
    encoding: { x: [REGION], y: [AMOUNT] },
    rows: rows(),
    ...(eachPointIs === null ? {} : { eachPointIs }),
    ...(distribution === undefined ? {} : { options: { distribution } }),
    titles: { [REGION]: 'Region', [ORDER]: 'Order', [AMOUNT]: 'Amount' },
    formats: { [AMOUNT]: 'currency' },
  }) as unknown as RenderSpec;

const HEAD =
  'Box plot of Amount by Region. ' +
  'EMEA: n 10, low $110, Q1 $115.75, median $120, Q3 $124.25, high $130. ' +
  'APAC: n 10, low $50, Q1 $140, median $230, Q3 $320, high $410.';

describe('a box plot’s text alternative (AC-593)', () => {
  it('says each box’s five statistics and n, then how its points are drawn', () => {
    expect(describeBoxplot(spec({ points: 'beeswarm' }))).toBe(
      `${HEAD} Points: every Order, as a beeswarm.`,
    );
    expect(describeBoxplot(spec({ points: 'all' }))).toBe(`${HEAD} Points: every Order, jittered.`);
    expect(describeBoxplot(spec({ points: 'none' }))).toBe(`${HEAD} Points: none.`);
  });

  it('counts the values beyond the whiskers where Points is Outliers', () => {
    expect(describeBoxplot(spec())).toBe(`${HEAD} Points: 2 values beyond the whiskers.`);
    expect(describeChart(spec())).toBe(describeBoxplot(spec()));
  });

  it('says where each violin gathers and which spreads widest', () => {
    expect(describeBoxplot(spec({ points: 'beeswarm', violin: true }))).toBe(
      `${HEAD} Points: every Order, as a beeswarm. Violin: EMEA gathers near $120, APAC near $230; APAC spreads widest.`,
    );
  });

  it('says what is drawn without Each point is: Outliers, and no violin', () => {
    expect(describeBoxplot(spec({ points: 'beeswarm', violin: true }, null))).toBe(
      `${HEAD} Points: 2 values beyond the whiskers.`,
    );
  });
});
