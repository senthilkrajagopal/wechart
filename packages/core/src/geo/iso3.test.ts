import { describe, expect, it } from 'vitest';

import { countryCodeMarkingOf, holdsCountryCodes, ISO_3166_ALPHA_3 } from './iso3';

/**
 * T397 (AC-313): THE SYSTEM SHALL treat a dimension as holding ISO-3 country
 * codes when every non-empty value is an ISO 3166-1 alpha-3 code, unless the
 * model marks it otherwise; a dimension the model marks as a country code
 * counts whatever its values, and one it marks as not a country code never
 * does.
 * `Fails when: the map is offered for a dimension marked "not a country code",
 * withheld from one marked as a country code, or withheld from an unmarked
 * dimension whose values are all ISO-3 codes.`
 */
describe('which dimensions hold ISO-3 country codes (AC-313)', () => {
  it('holds the 249 ISO 3166-1 alpha-3 codes, and no user-assigned ones', () => {
    expect(ISO_3166_ALPHA_3.size).toBe(249);
    for (const code of ['SGP', 'FRA', 'NOR', 'USA', 'GBR', 'DEU']) {
      expect(ISO_3166_ALPHA_3.has(code), code).toBe(true);
    }
    // Kosovo's XKK is a user-assigned code, not ISO's (research/country-map.md).
    expect(ISO_3166_ALPHA_3.has('XKK')).toBe(false);
    // None in ISO's user-assigned ranges: AAA–AAZ, QMA–QZZ, XAA–XZZ, ZZA–ZZZ.
    const userAssigned = /^(AA[A-Z]|Q[M-Z][A-Z]|X[A-Z]{2}|ZZ[A-Z])$/;
    expect([...ISO_3166_ALPHA_3].filter((code) => userAssigned.test(code))).toEqual([]);
    expect([...ISO_3166_ALPHA_3].every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });

  it('counts an unmarked dimension whose every non-empty value is a code', () => {
    expect(holdsCountryCodes(['FRA', 'SGP', null, '', 'NOR'], undefined)).toBe(true);
  });

  it('doesn’t count one with any other value, nor one with no values at all', () => {
    expect(holdsCountryCodes(['FRA', 'France'], undefined)).toBe(false);
    expect(holdsCountryCodes(['fra'], undefined)).toBe(false);
    expect(holdsCountryCodes(['XKK', 'FRA'], undefined)).toBe(false);
    expect(holdsCountryCodes([null, ''], undefined)).toBe(false);
  });

  it('counts a dimension the model marks as a country code, whatever its values', () => {
    expect(holdsCountryCodes(['France', 'Kosovo'], true)).toBe(true);
  });

  it('never counts one the model marks as not a country code', () => {
    expect(holdsCountryCodes(['FRA', 'SGP'], false)).toBe(false);
  });

  it('reads the marking from the member’s meta, and nothing else as one', () => {
    expect(countryCodeMarkingOf({ wechart: { countryCode: true } })).toBe(true);
    expect(countryCodeMarkingOf({ wechart: { countryCode: false } })).toBe(false);
    expect(countryCodeMarkingOf({ wechart: { countryCode: 'yes' } })).toBeUndefined();
    expect(countryCodeMarkingOf({ countryCode: true })).toBeUndefined();
    expect(countryCodeMarkingOf(undefined)).toBeUndefined();
  });
});
