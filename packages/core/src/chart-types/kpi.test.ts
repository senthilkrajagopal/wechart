import { describe, expect, it } from 'vitest';

import { toChartSpec, type ChartDocument } from '../chart-document';
import { toCubeQuery } from '../chart-spec';
import { CHART_TYPE_MODULES } from './index';
import {
  KPI_COMPARE_TO,
  kpiOptionsOf,
  kpiModule,
  kpiPeriodOf,
  kpiQueries,
  withKpiOptions,
} from './kpi';

/**
 * T936 / AC-564: WHEN a KPI is edited, THE SYSTEM SHALL offer, after Metrics,
 * the optional wells Compare to (Previous period, Same period last year,
 * Another measure, A value, or None), Target (a measure or a value), Time
 * (the period and the trend's time dimension), Tile by (one dimension) and
 * Direction (Higher is better, the default, Lower is better, or Neutral); and
 * a KPI with none of the new wells set, a KPI saved before R81 included,
 * SHALL draw exactly as before …
 * `Fails when: a well or a Compare to choice is missing, or another is
 * offered; Direction starts other than Higher is better …`
 *
 * And AC-037 (R81): a spec of one of R81's types parses, and saved and
 * reopened is the same.
 */
describe('a KPI’s own settings (AC-564, AC-037)', () => {
  const stored = {
    compareTo: { kind: 'samePeriodLastYear' },
    target: { kind: 'measure', member: 'orders.revenue_target' },
    time: { member: 'orders.ordered_at', granularity: 'month' },
    tileBy: 'orders.region',
    direction: 'lower',
  };

  it('reads every setting, and saves them back the same', () => {
    const options = kpiModule.parse(stored);
    expect(options).toEqual({
      compareTo: { kind: 'samePeriodLastYear' },
      target: { kind: 'measure', member: 'orders.revenue_target' },
      time: { member: 'orders.ordered_at', granularity: 'month' },
      tileBy: 'orders.region',
      direction: 'lower',
    });
    expect(kpiModule.save(options)).toEqual(stored);
    expect(kpiModule.parse(kpiModule.save(options))).toEqual(options);
  });

  it('reads a KPI with none of them, one saved before R81 included, as Higher is better and nothing else', () => {
    expect(kpiModule.parse(undefined)).toEqual({ direction: 'higher' });
    expect(kpiModule.parse({})).toEqual({ direction: 'higher' });
    // Saved sparse: nothing is written that wasn't set.
    expect(kpiModule.save({ direction: 'higher' })).toEqual({});
  });

  it('reads a value as a comparison or a target, and another measure as a comparison', () => {
    const options = kpiModule.parse({
      compareTo: { kind: 'measure', member: 'orders.last_year_revenue' },
      target: { kind: 'value', value: 1_400_000 },
      direction: 'neutral',
    });
    expect(options.compareTo).toEqual({ kind: 'measure', member: 'orders.last_year_revenue' });
    expect(options.target).toEqual({ kind: 'value', value: 1_400_000 });
    expect(options.direction).toBe('neutral');
    expect(kpiModule.parse({ compareTo: { kind: 'value', value: 12 } }).compareTo).toEqual({
      kind: 'value',
      value: 12,
    });
  });

  // None first, as a select's empty choice sits; the rest in design 23's order.
  it('offers Compare to’s five choices, None first', () => {
    expect(KPI_COMPARE_TO.map((choice) => choice.label)).toEqual([
      'None',
      'Previous period',
      'Same period last year',
      'Another measure',
      'A value',
    ]);
  });

  it('leaves out what it can’t read rather than reading it as something else', () => {
    expect(
      kpiModule.parse({
        compareTo: { kind: 'nextYear' },
        target: { kind: 'value', value: 'lots' },
        time: { member: 'orders.ordered_at', granularity: 'fortnight' },
        tileBy: 3,
        direction: 'sideways',
      }),
    ).toEqual({ direction: 'higher' });
  });

  it('is kept in a chart’s options under `kpi`, sparse, and registered as the KPI’s module', () => {
    expect(CHART_TYPE_MODULES.kpi).toBe(kpiModule);
    expect(kpiOptionsOf({ kpi: stored })).toEqual(kpiModule.parse(stored));
    expect(kpiOptionsOf(undefined)).toEqual({ direction: 'higher' });
    const next = withKpiOptions({ legend: 'top' }, { direction: 'higher' });
    // Nothing set: no `kpi` key at all, so a KPI saved before R81 saves as it was.
    expect(next).toEqual({ legend: 'top' });
    expect(withKpiOptions({}, { direction: 'lower', tileBy: 'orders.region' })).toEqual({
      kpi: { direction: 'lower', tileBy: 'orders.region' },
    });
  });
});

/**
 * T937 / AC-565: WHEN a KPI has Compare to, Target or Time set, THE SYSTEM
 * SHALL draw … its change …, the comparison coming from Cube's
 * `compareDateRange` for Previous period and Same period last year.
 * `Fails when: … the comparison is computed other than by compareDateRange …`
 */
describe('a KPI’s comparison, asked of Cube (AC-565)', () => {
  // 18 October 2026: Time's period is the grain's current one, October (T936-1).
  const now = new Date('2026-10-18T09:30:00Z');
  const time = { member: 'orders.ordered_at', granularity: 'month' } as const;
  const base = { measures: ['orders.revenue'], dimensions: [] };

  it('asks Previous period over October 2026 by month as compareDateRange [Oct 2026, Sep 2026] on Ordered at', () => {
    const { value } = kpiQueries(
      base,
      { compareTo: { kind: 'previousPeriod' }, time, direction: 'higher' },
      now,
    );
    expect(value['timeDimensions']).toEqual([
      {
        dimension: 'orders.ordered_at',
        compareDateRange: [
          ['2026-10-01', '2026-10-31'],
          ['2026-09-01', '2026-09-30'],
        ],
      },
    ]);
    expect(value['measures']).toEqual(['orders.revenue']);
  });

  it('asks Same period last year as [Oct 2026, Oct 2025]', () => {
    const { value } = kpiQueries(
      base,
      { compareTo: { kind: 'samePeriodLastYear' }, time, direction: 'higher' },
      now,
    );
    expect(value['timeDimensions']).toEqual([
      {
        dimension: 'orders.ordered_at',
        compareDateRange: [
          ['2026-10-01', '2026-10-31'],
          ['2025-10-01', '2025-10-31'],
        ],
      },
    ]);
  });

  it('asks Time’s period alone for another measure, beside it, or a value', () => {
    const measure = kpiQueries(
      base,
      {
        compareTo: { kind: 'measure', member: 'orders.revenue_last_year' },
        time,
        direction: 'higher',
      },
      now,
    ).value;
    expect(measure['measures']).toEqual(['orders.revenue', 'orders.revenue_last_year']);
    expect(measure['timeDimensions']).toEqual([
      { dimension: 'orders.ordered_at', dateRange: ['2026-10-01', '2026-10-31'] },
    ]);
    const value = kpiQueries(
      base,
      { compareTo: { kind: 'value', value: 1_320_000 }, direction: 'higher' },
      now,
    ).value;
    expect(value).toEqual(base);
  });

  it('asks a KPI with none of its settings exactly as before', () => {
    expect(kpiQueries(base, { direction: 'higher' }, now).value).toEqual(base);
  });

  it('puts the compared time dimension in place of the same one in the editor’s Time well', () => {
    const { value } = kpiQueries(
      {
        ...base,
        timeDimensions: [
          { dimension: 'orders.ordered_at', granularity: 'day' },
          { dimension: 'orders.shipped_at', granularity: 'day' },
        ],
      },
      { compareTo: { kind: 'previousPeriod' }, time, direction: 'higher' },
      now,
    );
    expect(value['timeDimensions']).toEqual([
      { dimension: 'orders.shipped_at', granularity: 'day' },
      {
        dimension: 'orders.ordered_at',
        compareDateRange: [
          ['2026-10-01', '2026-10-31'],
          ['2026-09-01', '2026-09-30'],
        ],
      },
    ]);
  });

  it('takes the period of each grain that holds now, and the one before it', () => {
    // 18 October 2026 is a Sunday; Cube's weeks start on Monday.
    expect(kpiPeriodOf('day', now)).toEqual({
      current: ['2026-10-18', '2026-10-18'],
      previous: ['2026-10-17', '2026-10-17'],
      lastYear: ['2025-10-18', '2025-10-18'],
    });
    expect(kpiPeriodOf('week', now).current).toEqual(['2026-10-12', '2026-10-18']);
    expect(kpiPeriodOf('week', now).previous).toEqual(['2026-10-05', '2026-10-11']);
    expect(kpiPeriodOf('quarter', now)).toEqual({
      current: ['2026-10-01', '2026-12-31'],
      previous: ['2026-07-01', '2026-09-30'],
      lastYear: ['2025-10-01', '2025-12-31'],
    });
    expect(kpiPeriodOf('year', now).previous).toEqual(['2025-01-01', '2025-12-31']);
    expect(kpiPeriodOf('month', new Date('2026-03-31T12:00:00Z')).previous).toEqual([
      '2026-02-01',
      '2026-02-28',
    ]);
  });

  it('is asked so wherever a KPI’s query is made, and for no other type', () => {
    const kpi = (chartType: string): ChartDocument =>
      ({
        schemaVersion: 2,
        title: 'Revenue',
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.revenue'], dimensions: [], timeDimensions: [] },
          chartType,
          options: { kpi: { compareTo: { kind: 'previousPeriod' }, time } },
        },
      }) as unknown as ChartDocument;
    expect(toCubeQuery(toChartSpec(kpi('kpi')), now)['timeDimensions']).toEqual([
      {
        dimension: 'orders.ordered_at',
        compareDateRange: [
          ['2026-10-01', '2026-10-31'],
          ['2026-09-01', '2026-09-30'],
        ],
      },
    ]);
    expect(toCubeQuery(toChartSpec(kpi('bar')), now)['timeDimensions']).toBeUndefined();
  });
});
