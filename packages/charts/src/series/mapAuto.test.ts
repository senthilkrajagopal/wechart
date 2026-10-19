import type { RenderSpec } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import admin1Germany from '../geo/admin1/DEU.geo.json';
import admin1Index from '../geo/admin1/index.json';
import { registerAdmin1, registerAdmin1Index, type Admin1Index } from '../geo/admin1';
import { mapBoundariesReady } from '../geo/boundaries';
import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { optionFor } from '../optionFor';
import { mapSpecOf, unplacedNote } from './map';
import { mapPointsOf } from './mapPoints';

/**
 * T1012 / AC-560: a geo dimension and one measure make the Map with a Points
 * layer the top pick, and a region key and one measure the Map with a
 * Regions layer — drawn so in Auto, where no setting says so: the Map takes
 * its layer from the dimension's values, as the recommender took its pick.
 */
beforeAll(() => {
  registerCountries(countries);
  registerAdmin1Index(admin1Index as unknown as Admin1Index);
  registerAdmin1('DEU', admin1Germany);
});

const map = (dimension: string, values: readonly string[]): RenderSpec => ({
  chartType: 'map',
  encoding: { x: [dimension], y: ['orders.revenue'] },
  rows: values.map((value, at) => ({ [dimension]: value, 'orders.revenue': (at + 1) * 10 })),
});

describe('the Map in Auto (AC-560)', () => {
  it('draws a geo dimension’s rows as its Points layer, with no regions to place', () => {
    const stores = map('stores.location', ['48.8566,2.3522', '51.5074,-0.1278', '40.7128,-74.006']);
    const drawn = mapPointsOf(mapSpecOf(stores));
    expect(drawn?.points).toHaveLength(3);
    expect(drawn?.points.map((point) => point.diameter)).toEqual([8, expect.any(Number), 24]);
    const series = optionFor(stores)['series'] as Record<string, unknown>[];
    expect(series.some((one) => one['type'] === 'scatter')).toBe(true);
    // Its places aren't countries it can't place, and with no Regions layer
    // there is no ramp or "No data" swatch to read.
    expect(unplacedNote(stores)).toBeUndefined();
    const option = optionFor(stores);
    expect(option['visualMap']).toBeUndefined();
    expect(JSON.stringify(option['graphic'] ?? [])).not.toContain('No data');
  });

  it('draws an Admin-1 region key on Admin-1 where no boundary set is chosen', () => {
    const states = map('stores.state', ['Bavaria', 'DE-BE', 'Hesse']);
    expect(mapBoundariesReady(states)).toBe(true);
    const regions = (optionFor(states)['series'] as Record<string, unknown>[]).find(
      (one) => one['type'] === 'map',
    );
    expect(regions?.['map']).toBe('wechart-admin1-DEU');
    // ISO-3 codes stay on Countries, as AC-305 has them.
    const countriesMap = map('customers.iso3', ['FRA', 'NOR']);
    expect(
      (optionFor(countriesMap)['series'] as Record<string, unknown>[]).find(
        (one) => one['type'] === 'map',
      )?.['map'],
    ).toBe('wechart-countries');
  });
});
