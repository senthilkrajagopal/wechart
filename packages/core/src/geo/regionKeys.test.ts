import { describe, expect, it } from 'vitest';

import { holdsCountryCodes } from './iso3';
import {
  isRegionKey,
  placeValues,
  regionIndexOf,
  regionKeyMarkingOf,
  unplacedSentence,
} from './regionKeys';

/**
 * T974 (AC-623): THE SYSTEM SHALL treat a dimension as a region key of a
 * boundary set when every non-empty value is a key of that set, unless the
 * model marks it otherwise, a dimension the model marks as a set's key
 * counting whatever its values and one it marks as not a key never counting,
 * as AC-313 does for Countries; an Admin-1 region's keys being its ISO 3166-2
 * code and its English name; and SHALL name under the map, in the page's
 * text, every value it can't place ("Not on the map: "Online" (no
 * territory)"), a value matching more than one region being one it can't place
 * and named as such.
 * `Fails when: a dimension marked as a set's key isn't offered on it, or one
 * marked as not a key is; an unmarked dimension whose values are all keys
 * isn't offered; an Admin-1 region isn't placed by its ISO 3166-2 code or by
 * its English name; a value matching more than one region is drawn on any of
 * them, or isn't named as matching more than one region; or an unplaced value
 * isn't named in the page's text.`
 */

/** Three German states, keyed by ISO 3166-2 and named in English, and one `~` key never placed. */
const GERMANY = regionIndexOf([
  { key: 'DE-BY', names: ['Bavaria'] },
  { key: 'DE-BE', names: ['Berlin'] },
  { key: 'DE-BB', names: ['Brandenburg'] },
  { key: '~DEU-1234', names: ['Somewhere'] },
]);

/** Two regions sharing an English name. */
const TWINS = regionIndexOf([
  { key: 'XX-A', names: ['Georgia'] },
  { key: 'XX-B', names: ['Georgia'] },
  { key: 'XX-C', names: ['Atlantic'] },
]);

describe('how the model marks a region key (AC-623)', () => {
  it('reads a set named in meta.wechart.regionKey, or false', () => {
    expect(regionKeyMarkingOf({ wechart: { regionKey: 'admin1' } })).toBe('admin1');
    expect(regionKeyMarkingOf({ wechart: { regionKey: 'custom:t1' } })).toBe('custom:t1');
    expect(regionKeyMarkingOf({ wechart: { regionKey: false } })).toBe(false);
    expect(regionKeyMarkingOf({ wechart: { regionKey: 'nonsense' } })).toBeUndefined();
    expect(regionKeyMarkingOf({ owner: 'finance' })).toBeUndefined();
    expect(regionKeyMarkingOf(undefined)).toBeUndefined();
  });

  it('reads AC-313’s country-code marking as Countries', () => {
    expect(regionKeyMarkingOf({ wechart: { countryCode: true } })).toBe('countries');
    expect(regionKeyMarkingOf({ wechart: { countryCode: false } })).toBe(false);
  });
});

describe('a region key of a set (AC-623)', () => {
  it('is a dimension whose every non-empty value is a key of the set', () => {
    expect(isRegionKey('admin1', GERMANY, ['DE-BY', 'Berlin', null, ''], undefined)).toBe(true);
    expect(isRegionKey('admin1', GERMANY, ['DE-BY', 'Online'], undefined)).toBe(false);
    // No value at all is no key.
    expect(isRegionKey('admin1', GERMANY, [null, ''], undefined)).toBe(false);
  });

  it('counts a dimension the model marks as the set’s key, whatever its values', () => {
    expect(isRegionKey('admin1', GERMANY, ['Online', 'Retail'], 'admin1')).toBe(true);
    expect(isRegionKey('custom:t1', GERMANY, ['Online'], 'custom:t1')).toBe(true);
  });

  it('never counts one marked as not a key, or as another set’s', () => {
    expect(isRegionKey('admin1', GERMANY, ['DE-BY', 'Berlin'], false)).toBe(false);
    expect(isRegionKey('admin1', GERMANY, ['DE-BY', 'Berlin'], 'custom:t1')).toBe(false);
  });

  it('keeps AC-313’s behaviour for ISO-3 codes on Countries', () => {
    for (const [values, marking] of [
      [['FRA', 'SGP'], undefined],
      [['FRA', 'Online'], undefined],
      [['Online'], true],
      [['FRA'], false],
    ] as const) {
      expect(
        isRegionKey(
          'countries',
          { regionsOf: () => [] },
          values,
          marking === undefined ? undefined : marking ? 'countries' : false,
        ),
      ).toBe(holdsCountryCodes(values, marking));
    }
  });
});

describe('placing values on a set’s regions (AC-623)', () => {
  it('places a region by its ISO 3166-2 code and by its English name', () => {
    const { placed, unplaced } = placeValues(['DE-BY', 'Berlin', 'Brandenburg'], GERMANY);
    expect([...placed]).toEqual([
      ['DE-BY', 'DE-BY'],
      ['Berlin', 'DE-BE'],
      ['Brandenburg', 'DE-BB'],
    ]);
    expect(unplaced).toEqual([]);
  });

  it('never places a `~` key, nor a value matching more than one region', () => {
    const { placed, unplaced } = placeValues(['Georgia', 'Atlantic', 'Online', null], TWINS);
    expect([...placed]).toEqual([['Atlantic', 'XX-C']]);
    expect(unplaced).toEqual([
      { value: 'Georgia', reason: 'ambiguous' },
      { value: 'Online', reason: 'none' },
      { value: null, reason: 'empty' },
    ]);
    expect(placeValues(['~DEU-1234'], GERMANY).unplaced).toEqual([
      { value: '~DEU-1234', reason: 'none' },
    ]);
  });

  it('names each value once, in the rows’ order', () => {
    expect(placeValues(['Online', 'Online', 'Retail'], GERMANY).unplaced).toEqual([
      { value: 'Online', reason: 'none' },
      { value: 'Retail', reason: 'none' },
    ]);
  });

  it('says them in the page’s words: quoted, with why, under the set’s own noun', () => {
    const { unplaced } = placeValues(['Online', 'Georgia', ''], TWINS);
    expect(unplacedSentence(unplaced, 'territory')).toBe(
      'Not on the map: "Online" (no territory), "Georgia" (matches more than one region), (empty)',
    );
    expect(unplacedSentence([], 'region')).toBeUndefined();
  });
});
