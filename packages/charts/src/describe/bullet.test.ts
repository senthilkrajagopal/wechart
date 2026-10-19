import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { describeBullet } from './bullet';
import { describeChart } from './index';

/**
 * T956 / AC-583: THE SYSTEM SHALL name each bullet "‹member›: ‹value› of
 * ‹target› target (‹p› %), in the ‹band› band", the chart "‹n› regions; ‹k›
 * above target (‹members›).", and give a table view …
 * `Fails when: a bullet's name or the chart's summary lacks a part, or the
 * table lacks a column.`
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const TARGET = 'orders.revenue_target';

const spec = (
  rows: readonly (readonly [string, number, number | null])[],
  title = 'Region',
): RenderSpec =>
  ({
    chartType: 'bullet',
    encoding: { x: [REGION], y: [REVENUE] },
    rows: rows.map(([region, revenue, target]) => ({
      [REGION]: region,
      [REVENUE]: String(revenue),
      [TARGET]: target === null ? null : String(target),
    })),
    options: { bullet: { target: { kind: 'measure', member: TARGET } } },
    formats: { [REVENUE]: 'currency', [TARGET]: 'currency' },
    titles: { [REGION]: title, [REVENUE]: 'Revenue', [TARGET]: 'Revenue target' },
  }) as unknown as RenderSpec;

const FOUR = [
  ['EMEA', 412000, 450000],
  ['North America', 538000, 520000],
  ['LATAM', 176000, 200000],
  ['APAC', 221000, 225000],
] as const;

describe('the bullet chart’s text alternative (AC-583)', () => {
  it('sums the chart up, then names each bullet with its target, share and band', () => {
    expect(describeBullet(spec(FOUR))).toBe(
      [
        '4 regions; 1 above target (North America).',
        'EMEA: $412,000 of $450,000 target (92 %), in the 80–100 % band.',
        'North America: $538,000 of $520,000 target (103 %), in the 100–120 % band.',
        'LATAM: $176,000 of $200,000 target (88 %), in the 80–100 % band.',
        'APAC: $221,000 of $225,000 target (98 %), in the 80–100 % band.',
      ].join(' '),
    );
    expect(describeChart(spec(FOUR))).toBe(describeBullet(spec(FOUR)));
  });

  it('says a bullet with no target has none, and none above target in words', () => {
    const said = describeBullet(
      spec(
        [
          ['EMEA', 412000, 450000],
          ['Africa', 143000, null],
        ],
        'Category',
      ),
    );
    expect(said).toBe(
      '2 categories; none above target. EMEA: $412,000 of $450,000 target (92 %), in the 80–100 % band. Africa: $143,000, no target.',
    );
  });

  // Checkpoint 2's review: a member with a target but no value keeps its target.
  it('says a bullet with no value has none, and still names its target', () => {
    const blank = spec([['EMEA', 412000, 450000]]);
    const said = describeBullet({
      ...blank,
      rows: [...blank.rows, { [REGION]: 'LATAM', [REVENUE]: null, [TARGET]: '200000' }],
    });
    expect(said).toMatch(/ LATAM: no value, against a \$200,000 target\.$/);
  });

  it('says one member in the singular', () => {
    expect(describeBullet(spec([['EMEA', 500000, 450000]]))).toMatch(
      /^1 region; 1 above target \(EMEA\)\. /,
    );
  });
});
