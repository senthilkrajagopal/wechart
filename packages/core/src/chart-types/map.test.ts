import { describe, expect, it } from 'vitest';

import { CHART_TYPE_MODULES } from './index';
import {
  BOUNDARY_SETS,
  countMeasureOf,
  mapLayersOf,
  mapModule,
  mapPointsQuery,
  mapSettingsOf,
  mapUnlocatedQuery,
  pointsAsDensity,
} from './map';

/**
 * T973 / AC-622: THE SYSTEM SHALL offer one Map type, in place of the Country
 * map, taking a Boundary set (Countries …; Admin-1, by country; or a custom
 * set) and up to three layers, Regions (a region key coloured by a measure),
 * Points (a geo dimension sized by a measure) and Density (a geo dimension).
 * `Fails when: a boundary set or layer is missing; …`
 *
 * The Map's own settings, stored sparse under the chart's `options.map`.
 */
describe('the Map’s settings (AC-622)', () => {
  it('is registered as the map’s module', () => {
    expect(CHART_TYPE_MODULES.map).toBe(mapModule);
    expect(mapModule.type).toBe('map');
  });

  it('names the built-in boundary sets: Countries, then Admin-1', () => {
    expect(BOUNDARY_SETS).toEqual(['countries', 'admin1']);
  });

  it('reads nothing stored as Countries with no Points or Density layer', () => {
    expect(mapModule.parse(undefined)).toEqual({ boundarySet: 'countries' });
    expect(mapSettingsOf(undefined)).toEqual({ boundarySet: 'countries' });
    expect(mapSettingsOf({ whiskers: 'minmax' })).toEqual({ boundarySet: 'countries' });
  });

  it('reads each boundary set and layer as stored, anything unknown as the default', () => {
    expect(
      mapModule.parse({
        boundarySet: 'admin1',
        points: { location: 'stores.location', size: 'orders.revenue' },
        density: { location: 'stores.location' },
      }),
    ).toEqual({
      boundarySet: 'admin1',
      points: { location: 'stores.location', size: 'orders.revenue' },
      density: { location: 'stores.location' },
    });
    expect(mapModule.parse({ boundarySet: 'custom:territories' })).toEqual({
      boundarySet: 'custom:territories',
    });
    expect(
      mapModule.parse({
        boundarySet: 'tiles',
        points: { size: 'orders.revenue' },
        density: 'stores.location',
      }),
    ).toEqual({ boundarySet: 'countries' });
    expect(mapModule.parse({ boundarySet: 'custom:' })).toEqual({ boundarySet: 'countries' });
  });

  it('stores its settings sparse, so parsing them gives them back', () => {
    expect(mapModule.save({ boundarySet: 'countries' })).toBeUndefined();
    const settings = {
      boundarySet: 'custom:territories',
      points: { location: 'stores.location' },
    } as const;
    expect(mapModule.save(settings)).toEqual(settings);
    expect(mapModule.parse(mapModule.save(settings))).toEqual(settings);
  });

  it('draws the Regions layer from the chart’s dimension, coloured by its measure', () => {
    const chart = {
      wells: { measures: ['orders.revenue'], dimensions: ['orders.country'] },
    };
    expect(mapLayersOf(chart)).toEqual({
      regions: { key: 'orders.country', measure: 'orders.revenue' },
    });
    // With no dimension, there are no regions to colour.
    expect(mapLayersOf({ wells: { measures: ['orders.revenue'], dimensions: [] } })).toEqual({});
    expect(
      mapLayersOf({
        wells: { measures: [], dimensions: [] },
        options: { map: { points: { location: 'stores.location' } } },
      }),
    ).toEqual({ points: { location: 'stores.location' } });
  });
});

/**
 * T976 / AC-625: a Points layer from a geo dimension's latitude and longitude
 * … IF Cube returned fewer rows than the data holds, THEN say "Showing ‹n› of
 * ‹N› ‹members› (Cube's row limit)."
 *
 * The layer is asked of Cube on its own, as the tile's query is — its filters
 * and date ranges kept — by its location (and Colour), sized by its measure,
 * and told to count all its rows.
 */
describe('the Points layer’s own query (AC-625)', () => {
  const tile = {
    measures: ['orders.revenue'],
    dimensions: ['stores.territory'],
    filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    timeDimensions: [
      { dimension: 'orders.created_at', granularity: 'month', dateRange: 'Last year' },
      { dimension: 'orders.shipped_at', granularity: 'day' },
    ],
  };

  it('asks by location, sized by its measure, its filters and date ranges kept, counting all', () => {
    expect(
      mapPointsQuery(tile, { location: 'stores.location', size: 'orders.revenue' }),
    ).toEqual({
      measures: ['orders.revenue'],
      dimensions: ['stores.location'],
      filters: tile.filters,
      timeDimensions: [{ dimension: 'orders.created_at', dateRange: 'Last year' }],
      total: true,
    });
  });

  it('asks by Colour too, and for no measure when unsized', () => {
    expect(
      mapPointsQuery(
        { measures: ['orders.count'], dimensions: [] },
        { location: 'stores.location', colour: 'stores.format' },
      ),
    ).toEqual({
      measures: [],
      dimensions: ['stores.format', 'stores.location'],
      total: true,
    });
  });

  /**
   * Checkpoint 4's review: "312 stores have no location." counts entities,
   * not the one grouped row they collapse into — the location's cube's count
   * measure, with the location not set. (Ungrouped, Cube asks for the cube's
   * primary key, which a model need not give.)
   */
  it('counts the rows with no location by the cube’s count, the location not set', () => {
    expect(
      mapUnlocatedQuery(tile, { location: 'stores.location', size: 'orders.revenue' }, 'stores.count'),
    ).toEqual({
      measures: ['stores.count'],
      filters: [...tile.filters, { member: 'stores.location', operator: 'notSet' }],
      timeDimensions: [{ dimension: 'orders.created_at', dateRange: 'Last year' }],
    });
  });

  it('finds the location’s cube’s count measure in /v1/meta, or none', () => {
    const meta = {
      cubes: [
        {
          name: 'stores',
          measures: [
            { name: 'stores.revenue', aggType: 'sum' },
            { name: 'stores.count', aggType: 'count' },
          ],
        },
        { name: 'orders', measures: [{ name: 'orders.count', aggType: 'count' }] },
      ],
    };
    expect(countMeasureOf(meta, 'stores.location')).toBe('stores.count');
    expect(countMeasureOf(meta, 'regions.location')).toBeUndefined();
    expect(countMeasureOf(undefined, 'stores.location')).toBeUndefined();
  });

  it('draws the points as density on "Draw as density"', () => {
    expect(
      pointsAsDensity({
        boundarySet: 'admin1',
        points: { location: 'stores.location', size: 'orders.revenue' },
      }),
    ).toEqual({ boundarySet: 'admin1', density: { location: 'stores.location' } });
    expect(pointsAsDensity({ boundarySet: 'countries' })).toEqual({ boundarySet: 'countries' });
  });

  it('keeps Colour as stored', () => {
    expect(
      mapSettingsOf({
        map: { points: { location: 'stores.location', colour: 'stores.format' } },
      }).points,
    ).toEqual({ location: 'stores.location', colour: 'stores.format' });
  });
});
