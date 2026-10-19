import { loadCountryMap } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { tableViewOf } from './index';

/**
 * T980 / AC-629: … and a table view by region, "No data" where a region has
 * no row, with each points layer's count.
 * `Fails when: … a region with no row reads 0 in the table.`
 */
beforeAll(async () => {
  await loadCountryMap();
});

const spec: RenderSpec = {
  chartType: 'map',
  encoding: { x: ['customers.country_iso3'], y: ['orders.revenue'] },
  rows: [
    { 'customers.country_iso3': 'FRA', 'orders.revenue': 1200 },
    { 'customers.country_iso3': 'NOR', 'orders.revenue': 800 },
  ],
  formats: { 'orders.revenue': 'currency' },
  titles: { 'customers.country_iso3': 'Country', 'orders.revenue': 'Revenue' },
  options: { map: { points: { location: 'stores.location' } } },
  mapPoints: {
    rows: [
      { 'stores.location': '48.8566,2.3522' },
      { 'stores.location': '43.2965,5.3698' },
      { 'stores.location': '59.9139,10.7522' },
    ],
  },
};

describe('a map’s table view (AC-629)', () => {
  it('is a row a country, its revenue or "No data", never 0, and its stores', () => {
    const table = tableViewOf(spec)!;
    expect(table.columns).toEqual(['Country', 'Revenue', 'Stores']);
    expect(table.rows.slice(0, 2)).toEqual([
      ['France', '$1,200', '2'],
      ['Norway', '$800', '1'],
    ]);
    const rest = table.rows.slice(2);
    expect(rest.length).toBeGreaterThan(200);
    for (const [, revenue, stores] of rest) {
      expect(revenue).toBe('No data');
      expect(stores).toBe('0');
    }
    expect(table.figures).toEqual([1, 2]);
  });
});
