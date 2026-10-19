import { describe, expect, it } from 'vitest';

import { checkLegality } from './legality';
import { MAX_REASON_LENGTH, recommend } from './recommend';
import { runnerUpReasonFor } from './reason';
import type { Field, Signature } from './types';

/**
 * T1012 / AC-560: … one of R81's types the top pick only for: … a geo
 * dimension and one measure (Map with a Points layer); a region key (AC-623)
 * and one measure (Map with a Regions layer) …
 * AC-561: … Sankey, for 2 dimensions and one summed measure of at most 50
 * pairs ("Revenue from Channel to Region: 12 flows, widths to scale.") … as a
 * runner-up, never the top pick, each with its reason of at most 80
 * characters. `Fails when: … a Sankey of 51 pairs …`
 * AC-031: … a Sankey of more than 50 flows, and a … Sankey … of a measure that
 * isn't summed.
 * AC-305: an ISO-3 dimension and one measure offer the Map on Countries.
 * Narrowed by the parking: the funnel's, timeline's, calendar's and icicle's
 * runners-up are parked.
 */
const revenue: Field = { name: 'orders.revenue', kind: 'measure', aggType: 'sum' };
const average: Field = { name: 'orders.average', kind: 'measure', aggType: 'avg' };
const dimension = (name: string, cardinality: number, extra: Partial<Field> = {}): Field => ({
  name,
  kind: 'dimension',
  cardinality,
  ...extra,
});
const TITLES: Record<string, string> = {
  'orders.revenue': 'Revenue',
  'orders.channel': 'Channel',
  'customers.region': 'Region',
};
const titleOf = (name: string) => TITLES[name] ?? name;

describe('the Map as the top pick (AC-560)', () => {
  it('is Map with Points for a geo dimension and one measure', () => {
    const { top } = recommend({
      fields: [revenue, dimension('stores.location', 120, { geo: true })],
      rowCount: 120,
    });
    expect(top?.candidate.chartType).toBe('map');
    expect(top?.candidate.mapLayer).toBe('points');
    expect(top!.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
  });

  it('is Map with Regions on Admin-1 for an Admin-1 region key and one measure', () => {
    const { top } = recommend({
      fields: [revenue, dimension('stores.state', 15, { regionSet: 'admin1' })],
      rowCount: 15,
    });
    expect(top?.candidate.chartType).toBe('map');
    expect(top?.candidate.mapLayer).toBe('regions');
    expect(top?.candidate.boundarySet).toBe('admin1');
  });

  // ISO-3 codes are Countries' region key (AC-623 over AC-313): the Map is the top pick.
  it('is Map with Regions on Countries for ISO-3 codes, as AC-305 offers it, and no runner-up', () => {
    const { top, runnersUp } = recommend({
      fields: [revenue, dimension('customers.iso3', 5, { countryCodes: true })],
      rowCount: 5,
    });
    expect(top?.candidate.chartType).toBe('map');
    expect(top?.candidate.boundarySet ?? 'countries').toBe('countries');
    expect(runnersUp.some((each) => each.candidate.chartType === 'map')).toBe(false);
  });
});

describe('the Sankey as a runner-up (AC-561, AC-031)', () => {
  const flows = (pairs: number, measure: Field = revenue): Signature => ({
    fields: [measure, dimension('orders.channel', 3), dimension('customers.region', 4)],
    rowCount: pairs,
  });

  it('offers Sankey for Channel and Region with Revenue, never first, saying its flows', () => {
    const { top, runnersUp } = recommend(flows(12));
    expect(top?.candidate.chartType).not.toBe('sankey');
    const sankey = runnersUp.find((each) => each.candidate.chartType === 'sankey');
    expect(sankey).toBeDefined();
    expect(runnerUpReasonFor(sankey!.candidate, titleOf)).toBe(
      'Revenue from Channel to Region: 12 flows, widths to scale.',
    );
  });

  it('doesn’t offer it for 51 pairs, nor for an average, which the caps reject', () => {
    const offersSankey = (signature: Signature) =>
      [recommend(signature).top, ...recommend(signature).runnersUp].some(
        (each) => each?.candidate.chartType === 'sankey',
      );
    expect(offersSankey(flows(51))).toBe(false);
    expect(offersSankey(flows(12, average))).toBe(false);
    const rejected = checkLegality({
      chartType: 'sankey',
      valueFields: [average],
      categoryField: dimension('orders.channel', 3),
      secondCategoryField: dimension('customers.region', 4),
      valueAxisCount: 1,
      flows: 51,
    }).filter((outcome) => !outcome.passed);
    expect(rejected.map((outcome) => outcome.rule)).toEqual([
      'sankey_flow_capacity',
      'sankey_summed_measure',
    ]);
  });

  it('keeps every reason within 80 characters, and no R81 type first beside the Map', () => {
    for (const signature of [
      flows(12),
      flows(50),
      { fields: [revenue, dimension('stores.location', 3, { geo: true })], rowCount: 3 },
    ]) {
      const { top, runnersUp } = recommend(signature);
      for (const each of [top!, ...runnersUp]) {
        expect(each.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
        expect(
          (runnerUpReasonFor(each.candidate, titleOf) ?? each.reason).length,
        ).toBeLessThanOrEqual(MAX_REASON_LENGTH);
      }
      expect(['sankey', 'parallel', 'bullet']).not.toContain(top?.candidate.chartType);
    }
  });
});
