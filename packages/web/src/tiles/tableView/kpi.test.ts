import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { tableViewOf } from './index';
import { kpiTableView } from './kpi';

/**
 * T942 / AC-569: THE SYSTEM SHALL give a KPI's table view one row per tile
 * (or one row) with columns for the value in each compared period, the change
 * with ▲ or ▼, the target and the percentage of it ("EMEA · $412,000 ·
 * $395,000 · ▲ +4.2% · $450,000 · 92%") …
 * `Fails when: a column is missing, or a row disagrees with its tile.`
 * Design 23 sheet 1's table view: Region, Oct 2026, Sep 2026, Change,
 * Target, %.
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const OCT = '2026-10-01T00:00:00.000 - 2026-10-31T23:59:59.999';
const SEP = '2026-09-01T00:00:00.000 - 2026-09-30T23:59:59.999';

const kpi = {
  compareTo: { kind: 'previousPeriod' },
  time: { member: 'orders.ordered_at', granularity: 'month' },
  target: { kind: 'value', value: 450_000 },
};

const spec = (rows: readonly Record<string, unknown>[], more: Record<string, unknown> = {}) =>
  ({
    chartType: 'kpi',
    encoding: { y: [REVENUE] },
    rows,
    formats: { [REVENUE]: 'currency' },
    titles: { [REVENUE]: 'Revenue', [REGION]: 'Region' },
    options: { kpi: { ...kpi, ...more } },
  }) as unknown as RenderSpec;

describe('the KPI’s table view (T942, AC-569)', () => {
  it('lists a tiled KPI’s tiles, a row each, by value: the periods, change, target and share', () => {
    const tiled = spec(
      [
        { [REGION]: 'LATAM', [REVENUE]: '176000', compareDateRange: OCT },
        { [REGION]: 'EMEA', [REVENUE]: '412000', compareDateRange: OCT },
        { [REGION]: 'LATAM', [REVENUE]: '182400', compareDateRange: SEP },
        { [REGION]: 'EMEA', [REVENUE]: '395400', compareDateRange: SEP },
      ],
      { tileBy: REGION },
    );
    const view = kpiTableView(tiled);
    expect(view?.columns).toEqual(['Region', 'Oct 2026', 'Sep 2026', 'Change', 'Target', '%']);
    expect(view?.rows.map((row) => row.join(' · '))).toEqual([
      'EMEA · $412,000 · $395,400 · ▲ +4.2% · $450,000 · 92%',
      'LATAM · $176,000 · $182,400 · ▼ −3.5% · $450,000 · 39%',
    ]);
    expect(view?.figures).toEqual([1, 2, 3, 4, 5]);
    expect(tableViewOf(tiled)).toEqual(view);
  });

  it('lists one KPI as one row, with only the columns it has', () => {
    const one = spec(
      [
        { [REVENUE]: '1352000', compareDateRange: OCT },
        { [REVENUE]: '1320000', compareDateRange: SEP },
      ],
      { target: undefined },
    );
    expect(kpiTableView(one)).toEqual({
      columns: ['Oct 2026', 'Sep 2026', 'Change'],
      rows: [['$1,352,000', '$1,320,000', '▲ +2.4%']],
      figures: [0, 1, 2],
    });
  });

  it('says a compared period with no data as "—", and leaves a KPI with none of R81’s settings its rows', () => {
    const empty = spec([
      { [REVENUE]: '1352000', compareDateRange: OCT },
      { [REVENUE]: null, compareDateRange: SEP },
    ]);
    expect(kpiTableView(empty)?.rows).toEqual([['$1,352,000', '—', '—', '$450,000', '300%']]);
    const plain = { ...spec([{ [REVENUE]: '5' }]), options: {} } as unknown as RenderSpec;
    expect(tableViewOf(plain)).toBeUndefined();
  });
});
