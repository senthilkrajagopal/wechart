import { describe, expect, it } from 'vitest';

import { CHART_TYPE_MODULES } from './index';
import { KPI_COMPARE_TO, kpiOptionsOf, kpiModule, withKpiOptions } from './kpi';

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
