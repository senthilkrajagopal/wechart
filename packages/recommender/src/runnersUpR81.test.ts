import { describe, expect, it } from 'vitest';

import { MAX_REASON_LENGTH, recommend } from './recommend';
import { runnerUpReasonFor } from './reason';
import type { Field, Signature } from './types';

/**
 * T969 / AC-561 (R81): WHEN the chart's fields change, THE SYSTEM SHALL offer
 * as a runner-up, never the top pick, each with its reason of at most 80
 * characters: … 100 % stacked bar or area, beside Stacked bar or area, for at
 * most 8 stacked members of a summed measure ("Channel mix in each Region,
 * every bar adding to 100 %."); … Graphical table, for one dimension of more
 * than 8 members, a measure and a time dimension ("42 categories, each with
 * a trend: a row per category, with sparklines."); KPI tiled, for one
 * measure, a time dimension and a dimension of at most 20 members; and
 * Parallel coordinates, for 4 or more measures and a dimension of at most 8
 * members.
 * `Fails when: one of those signatures lacks its runner-up, or makes it the
 * top pick; a reason passes 80 characters; or a runner-up is offered outside
 * its rule, such as … a KPI tiled by 21 members.` (and "an average offers
 * no 100 %"). Narrowed by the parking: the waterfall's, icicle's, funnel's,
 * timeline's and calendar's are parked; the Sankey's is lane B's (T1012).
 */
const revenue: Field = { name: 'orders.revenue', kind: 'measure', aggType: 'sum' };
const average: Field = { name: 'orders.average', kind: 'measure', aggType: 'avg' };
const month: Field = { name: 'orders.ordered_at', kind: 'timeDimension' };
const dimension = (name: string, cardinality: number): Field => ({
  name,
  kind: 'dimension',
  cardinality,
});
const TITLES: Record<string, string> = {
  'customers.region': 'Region',
  'orders.channel': 'Channel',
  'products.category': 'Category',
  'products.name': 'Product',
};
const titleOf = (name: string) => TITLES[name] ?? name;

const offered = (signature: Signature) => {
  const { top, runnersUp } = recommend(signature);
  return { top, runnersUp };
};

describe('R81’s runners-up (T969, AC-561)', () => {
  it('offers 100 % stacked bar for Revenue by Region and Channel of 5, never first', () => {
    const { top, runnersUp } = offered({
      fields: [revenue, dimension('customers.region', 4), dimension('orders.channel', 5)],
    });
    expect(top?.candidate.stack).toBeUndefined();
    const percent = runnersUp.find(
      (each) => each.candidate.chartType === 'stackedBar' && each.candidate.stack === 'percent',
    );
    expect(percent).toBeDefined();
    expect(runnerUpReasonFor(percent!.candidate, titleOf)).toBe(
      'Channel mix in each Region, every bar adding to 100 %.',
    );
  });

  it('offers 100 % stacked area for Revenue over time by Channel of 5', () => {
    const { runnersUp } = offered({ fields: [revenue, month, dimension('orders.channel', 5)] });
    const percent = runnersUp.find(
      (each) => each.candidate.chartType === 'stackedArea' && each.candidate.stack === 'percent',
    );
    expect(percent).toBeDefined();
    expect(runnerUpReasonFor(percent!.candidate, titleOf)).toBe(
      'Channel mix over orders.ordered_at, every point adding to 100 %.',
    );
  });

  it('offers no 100 % for an average, nor for more than 8 stacked members', () => {
    const percents = (signature: Signature) =>
      [offered(signature).top, ...offered(signature).runnersUp].filter(
        (each) => each?.candidate.stack === 'percent',
      );
    expect(
      percents({
        fields: [average, dimension('customers.region', 4), dimension('orders.channel', 5)],
      }),
    ).toEqual([]);
    expect(percents({ fields: [average, month, dimension('orders.channel', 5)] })).toEqual([]);
    expect(
      percents({
        fields: [revenue, dimension('customers.region', 4), dimension('orders.channel', 9)],
      }),
    ).toEqual([]);
  });

  it('offers Graphical table for 42 Categories with Revenue and month, never first', () => {
    const { top, runnersUp } = offered({
      fields: [revenue, month, dimension('products.category', 42)],
    });
    expect(top?.candidate.chartType).not.toBe('graphicalTable');
    const table = runnersUp.find((each) => each.candidate.chartType === 'graphicalTable');
    expect(table).toBeDefined();
    expect(runnerUpReasonFor(table!.candidate, titleOf)).toBe(
      '42 categories, each with a trend: a row per category, with sparklines.',
    );
    // 8 members or fewer aren't "many": no graphical table.
    expect(
      offered({ fields: [revenue, month, dimension('products.category', 8)] }).runnersUp.map(
        (each) => each.candidate.chartType,
      ),
    ).not.toContain('graphicalTable');
  });

  it('offers KPI tiled for Revenue, month and 4 Regions, and not for 21', () => {
    const tiled = (members: number) =>
      [offered({ fields: [revenue, month, dimension('customers.region', members)] })]
        .flatMap(({ top, runnersUp }) => [top, ...runnersUp])
        .find((each) => each?.candidate.chartType === 'kpi');
    const four = tiled(4);
    expect(four?.candidate.facetField?.name).toBe('customers.region');
    expect(runnerUpReasonFor(four!.candidate, titleOf)).toBe(
      'A KPI per Region: 4 tiles, each this period’s number and its trend.',
    );
    expect(
      offered({ fields: [revenue, month, dimension('customers.region', 4)] }).top?.candidate
        .chartType,
    ).not.toBe('kpi');
    expect(tiled(21)).toBeUndefined();
  });

  it('offers Parallel coordinates as a runner-up for 4 measures by 6 Products', () => {
    const four = ['revenue', 'margin', 'count', 'units'].map((name): Field => ({
      name: `orders.${name}`,
      kind: 'measure',
    }));
    const { top, runnersUp } = offered({ fields: [...four, dimension('products.name', 6)] });
    expect(top?.candidate.chartType).not.toBe('parallel');
    const parallel = runnersUp.find((each) => each.candidate.chartType === 'parallel');
    expect(parallel).toBeDefined();
    expect(runnerUpReasonFor(parallel!.candidate, titleOf)).toBe(
      '4 measures across 6 Product values: a line per member.',
    );
  });

  it('offers them after the usual runners-up, which keep their places', () => {
    const { top, runnersUp } = offered({
      fields: [revenue, dimension('orders.channel', 4), month],
    });
    expect(top?.candidate.chartType).toBe('line');
    expect(runnersUp.slice(0, 2).map((each) => each.candidate.chartType)).toEqual([
      'area',
      'trellis',
    ]);
    expect(runnersUp.slice(2).map((each) => each.candidate.chartType)).toEqual([
      'stackedArea',
      'kpi',
    ]);
  });

  it('keeps every R81 reason within 80 characters', () => {
    const long = (name: string) => `${name} with a very long title indeed`;
    for (const signature of [
      { fields: [revenue, dimension('customers.region', 4), dimension('orders.channel', 5)] },
      { fields: [revenue, month, dimension('products.category', 4200)] },
      { fields: [revenue, month, dimension('customers.region', 20)] },
    ])
      for (const each of recommend(signature).runnersUp) {
        expect(each.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
        expect(runnerUpReasonFor(each.candidate, long)?.length ?? 0).toBeLessThanOrEqual(
          MAX_REASON_LENGTH,
        );
      }
  });
});
