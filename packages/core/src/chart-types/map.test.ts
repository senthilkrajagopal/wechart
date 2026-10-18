import { describe, expect, it } from 'vitest';

import { CHART_TYPE_MODULES } from './index';
import { BOUNDARY_SETS, mapLayersOf, mapModule, mapSettingsOf } from './map';

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
