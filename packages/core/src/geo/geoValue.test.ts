import { describe, expect, it } from 'vitest';

import { geoPointOf } from './geoValue';

/**
 * T976 (AC-625): a `/v1/load` row's geo value gives its latitude and
 * longitude. Cube writes a `type: geo` dimension as one string, latitude
 * first, `"lat,lng"`, in the database's own digits (research
 * `cube-geo-values.md`).
 */
describe('a Cube geo value (AC-625)', () => {
  it('is latitude, then longitude, as two numbers', () => {
    expect(geoPointOf('40.712776,-74.005974')).toEqual({ lat: 40.712776, lng: -74.005974 });
    expect(geoPointOf('120.120,40.60')).toBeUndefined();
    expect(geoPointOf('-33.8688,151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('is no point when missing, malformed or off the globe', () => {
    for (const value of [
      null,
      undefined,
      '',
      '40.7',
      '40.7,',
      ',-74',
      'a,b',
      '40.7,-74,1',
      '91,0',
      '0,181',
      42,
    ]) {
      expect(geoPointOf(value), String(value)).toBeUndefined();
    }
  });

  it('allows the spaces a database may write around the comma', () => {
    expect(geoPointOf(' 51.5 , -0.12 ')).toEqual({ lat: 51.5, lng: -0.12 });
  });
});
