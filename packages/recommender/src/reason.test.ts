import { describe, expect, it } from 'vitest';

import { MAX_REASON_LENGTH } from './recommend';
import { dataReasonFor } from './reason';
import type { Candidate, Field } from './types';

/**
 * T689 (EDI-07; 2026-09-24 design 01 pin 5): the Recommended card's reason is
 * built from the data — "8 countries × 1 measure → bars" — the signature and
 * cardinalities the recommender already computed, each field by its title
 * (AC-220), in at most 80 characters (AC-028; the coordinator's call).
 */
const country: Field = { name: 'customers.country', kind: 'dimension', cardinality: 8 };
const status: Field = { name: 'orders.status', kind: 'dimension', cardinality: 3 };
const total: Field = { name: 'orders.total_amount', kind: 'measure' };
const count: Field = { name: 'orders.count', kind: 'measure' };
const TITLES: Record<string, string> = {
  'customers.country': 'Country',
  'orders.status': 'Status',
};
const titleOf = (name: string) => TITLES[name] ?? name;
const candidate = (parts: Partial<Candidate>): Candidate => ({
  chartType: 'bar',
  valueFields: [total],
  valueAxisCount: 1,
  ...parts,
});

describe('the Recommended card’s reason, built from the data (T689, EDI-07)', () => {
  it('counts each grouping field’s values by its title, the measures, and names the form', () => {
    expect(dataReasonFor(candidate({ categoryField: country }), titleOf)).toBe(
      '8 Country values × 1 measure → Bar',
    );
    expect(
      dataReasonFor(
        candidate({
          chartType: 'groupedBar',
          categoryField: country,
          colorField: status,
          valueFields: [total, count],
        }),
        titleOf,
      ),
    ).toBe('8 Country values × 3 Status values × 2 measures → Grouped bar');
  });

  it('says “many” where a field’s values are not yet counted, and a lone measure plainly', () => {
    expect(
      dataReasonFor(
        candidate({ categoryField: { name: country.name, kind: country.kind } }),
        titleOf,
      ),
    ).toBe('many Country values × 1 measure → Bar');
    expect(dataReasonFor(candidate({ chartType: 'kpi' }), titleOf)).toBe('1 measure → KPI');
  });

  it('is never longer than 80 characters', () => {
    const long = (name: string) => `${name} with a title far longer than anyone would choose`;
    const reason = dataReasonFor(candidate({ categoryField: country, colorField: status }), long);
    expect(reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(reason.endsWith('…')).toBe(true);
  });
});
