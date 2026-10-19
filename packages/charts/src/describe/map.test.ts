import type { RenderSpec } from '@wechart/core';
import { regionIndexOf } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { echarts } from '../echarts';
import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { registerRegionSet } from '../geo/regionSets';
import { describeMap, mapRegionTable } from './map';

/**
 * T980 / AC-629: THE SYSTEM SHALL give a map a text alternative naming the
 * measure, the boundary set, the number of regions, the highest and lowest,
 * the regions with no data and the points layer ("Map of Revenue by sales
 * territory, 6 territories: highest Atlantic $1.40M, lowest Mountain $0.20M;
 * Islands has no data. 10 stores as points sized by Revenue."), and a table
 * view by region, "No data" where a region has no row, with each points
 * layer's count. Countries and Admin-1 SHALL draw disputed areas from Natural
 * Earth's default point of view, the text alternative saying so (R83).
 * `Fails when: a part of the text alternative is missing or wrong; a map on
 * Countries or Admin-1 has no point-of-view sentence in its text
 * alternative; or a region with no row reads 0 in the table.`
 */
const TERRITORIES = ['Atlantic', 'Gulf', 'Central', 'Pacific', 'North', 'Mountain', 'Islands'];

/** Seven square territories side by side, 10° wide, along the equator. */
const square = (at: number) => ({
  type: 'Feature',
  properties: { territory_id: TERRITORIES[at] },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [at * 10, 0],
        [at * 10 + 10, 0],
        [at * 10 + 10, 10],
        [at * 10, 10],
        [at * 10, 0],
      ],
    ],
  },
});

beforeAll(() => {
  registerCountries(countries);
  echarts.registerMap('wechart-custom-territories', {
    geoJSON: { type: 'FeatureCollection', features: TERRITORIES.map((_, at) => square(at)) },
  } as unknown as Parameters<typeof echarts.registerMap>[1]);
  registerRegionSet('custom:territories', {
    map: 'wechart-custom-territories',
    nameProperty: 'territory_id',
    index: regionIndexOf(TERRITORIES.map((key) => ({ key, names: [] }))),
    noun: 'territory',
    names: new Map(TERRITORIES.map((key) => [key, key])),
  });
});

const REVENUE: readonly [string, number][] = [
  ['Atlantic', 1_400_000],
  ['Gulf', 1_020_000],
  ['Central', 660_000],
  ['Pacific', 820_000],
  ['North', 410_000],
  ['Mountain', 200_000],
];

/** Ten stores: three in Atlantic, two each in Gulf and Central, one each in three others. */
const STORES = [0.5, 0.6, 0.7, 1.5, 1.6, 2.5, 2.6, 3.5, 4.5, 5.5].map(
  (at) => `5,${String(at * 10)}`,
);

const territories: RenderSpec = {
  chartType: 'map',
  encoding: { x: ['stores.territory'], y: ['orders.revenue'] },
  rows: REVENUE.map(([territory, revenue]) => ({
    'stores.territory': territory,
    'orders.revenue': revenue,
  })),
  formats: { 'orders.revenue': 'currency' },
  titles: {
    'stores.territory': 'Sales territory',
    'orders.revenue': 'Revenue',
    'stores.location': 'Store location',
  },
  options: {
    map: {
      boundarySet: 'custom:territories',
      points: { location: 'stores.location', size: 'orders.revenue' },
    },
  },
  mapPoints: {
    rows: STORES.map((location, at) => ({
      'stores.location': location,
      'orders.revenue': 1000 * (at + 1),
    })),
  },
};

describe('a map’s text alternative (AC-629)', () => {
  it('names its measure, set, regions, extremes, regions with no data and points', () => {
    expect(describeMap(territories)).toBe(
      'Map of Revenue by sales territory, 6 territories: highest Atlantic $1.40M, lowest Mountain $0.20M; Islands has no data. 10 stores as points sized by Revenue.',
    );
  });

  it('says Natural Earth’s point of view on Countries and Admin-1, and counts many regions with no data', () => {
    const onCountries: RenderSpec = {
      chartType: 'map',
      encoding: { x: ['customers.country_iso3'], y: ['orders.revenue'] },
      rows: [
        { 'customers.country_iso3': 'FRA', 'orders.revenue': 120 },
        { 'customers.country_iso3': 'NOR', 'orders.revenue': 80 },
      ],
      titles: { 'customers.country_iso3': 'Country', 'orders.revenue': 'Revenue' },
    };
    const said = describeMap(onCountries)!;
    expect(said).toMatch(
      /^Map of Revenue by country, 2 countries: highest France 120, lowest Norway 80; \d{3} countries have no data\. Borders and disputed areas as Natural Earth draws them\.$/,
    );
    expect(describeMap(territories)).not.toContain('Natural Earth');
  });
});

describe('a map’s table view (AC-629)', () => {
  it('is a row a region, "No data" where it has no row, never 0, with its stores', () => {
    const table = mapRegionTable(territories)!;
    expect(table.columns).toEqual(['Sales territory', 'Revenue', 'Stores']);
    expect(table.rows).toEqual([
      ['Atlantic', 1_400_000, 3],
      ['Gulf', 1_020_000, 2],
      ['Central', 660_000, 2],
      ['Pacific', 820_000, 1],
      ['North', 410_000, 1],
      ['Mountain', 200_000, 1],
      ['Islands', undefined, 0],
    ]);
  });
});
