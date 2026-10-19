import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RenderSpec } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { OTHER_COLOUR } from '../colorAssignment';
import admin1Germany from '../geo/admin1/DEU.geo.json';
import admin1Index from '../geo/admin1/index.json';
import {
  admin1CountryOf,
  admin1RegionsOf,
  registerAdmin1,
  registerAdmin1Index,
  type Admin1Index,
} from '../geo/admin1';
import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { optionFor } from '../optionFor';
import { regionsOf, renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_SURFACE } from '../theme';
import { unplacedNote } from './map';

/**
 * T975 / AC-624: THE SYSTEM SHALL draw a Regions layer on §5's sequential
 * ramp with a legend and the "No data" swatch, a region with no row in the
 * null neutral, and 0.5 px surface boundaries, on every boundary set.
 * `Fails when: a region with a value isn't coloured; one with no row takes a
 * ramp colour; the legend or "No data" swatch is missing; or another boundary
 * set draws otherwise than Countries does.`
 *
 * AC-622 (R83): Admin-1's regions are each country's ISO 3166-2 top tier,
 * dissolved from Natural Earth's `region_cod` and `geonunit` where its own
 * units are a lower tier. `Fails when: … Admin-1 draws a lower tier where
 * Natural Earth carries the top one, such as France's départements instead
 * of its régions or the UK's local authorities instead of its nations.`
 *
 * AC-623 (R83): an Admin-1 region's keys are its ISO 3166-2 code and its
 * English name; a value matching more than one region is never placed.
 */
const INDEX = admin1Index as unknown as Admin1Index;

beforeAll(() => {
  registerCountries(countries);
  registerAdmin1Index(INDEX);
  registerAdmin1('DEU', admin1Germany);
});

/** Revenue by German state: 15 of the 16, Bavaria and Berlin by name; Bremen has no row. */
const STATES: readonly [string, number][] = [
  ['DE-BW', 900],
  ['Bavaria', 1_400],
  ['Berlin', 300],
  ['DE-BB', 120],
  ['DE-HH', 260],
  ['DE-HE', 610],
  ['DE-MV', 80],
  ['DE-NI', 500],
  ['DE-NW', 1_200],
  ['DE-RP', 330],
  ['DE-SL', 60],
  ['DE-SN', 270],
  ['DE-ST', 140],
  ['DE-SH', 190],
  ['DE-TH', 150],
];

const germany = (rows: readonly [string, number][] = STATES): RenderSpec => ({
  chartType: 'map',
  encoding: { x: ['stores.state'], y: ['orders.revenue'] },
  rows: rows.map(([state, revenue]) => ({ 'stores.state': state, 'orders.revenue': revenue })),
  formats: { 'orders.revenue': 'currency' },
  options: { map: { boundarySet: 'admin1' } },
});

const luma = (fill: string) => {
  const [r = 0, g = 0, b = 0] = (fill.match(/[\d.]+/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('Admin-1 (AC-622, R83)', () => {
  it('is each country’s ISO top tier: France’s 18 régions, the UK’s 4 nations, Germany’s 16 Länder', () => {
    const keys = (country: string) => (INDEX[country] ?? []).map(([key]) => key);
    expect(keys('FRA')).toHaveLength(18);
    expect(keys('FRA')).toEqual(expect.arrayContaining(['FR-20R', 'FR-IDF', 'FR-971', 'FR-976']));
    expect(keys('FRA')).not.toContain('FR-75');
    expect(keys('GBR').toSorted()).toEqual(['GB-ENG', 'GB-NIR', 'GB-SCT', 'GB-WLS']);
    expect(keys('DEU').toSorted()).toEqual(
      [
        'DE-BB', 'DE-BE', 'DE-BW', 'DE-BY', 'DE-HB', 'DE-HE', 'DE-HH', 'DE-MV',
        'DE-NI', 'DE-NW', 'DE-RP', 'DE-SH', 'DE-SL', 'DE-SN', 'DE-ST', 'DE-TH',
      ].toSorted(),
    );
    expect(keys('ESP')).toHaveLength(19);
    expect(keys('ITA')).toHaveLength(20);
    expect(keys('BEL').toSorted()).toEqual(['BE-BRU', 'BE-VLG', 'BE-WAL']);
    // Natural Earth's point of view, as shipped: Crimea in Russia's file (R83).
    expect(keys('RUS')).toEqual(expect.arrayContaining(['UA-43', 'UA-40']));
    expect(keys('USA')).toHaveLength(51);
  });

  it('places a region by its ISO 3166-2 code and by its English name, and finds its country', () => {
    const regions = admin1RegionsOf('DEU')!;
    expect(regions.regionsOf('DE-BY')).toEqual(['DE-BY']);
    expect(regions.regionsOf('Bavaria')).toEqual(['DE-BY']);
    expect(admin1CountryOf(['DE-BY', 'Berlin', 'Online'])).toBe('DEU');
    expect(admin1CountryOf(['Online'])).toBeUndefined();
  });

  // T975-3: units Natural Earth gives one code are one ISO subdivision in
  // parts, dissolved under it; a name two regions share still matches both.
  it('places a code Natural Earth gives several units as one region, and never a name two regions share', () => {
    // New South Wales and Lord Howe Island both carry AU-NSW.
    const australia = admin1RegionsOf('AUS')!;
    expect(australia.regionsOf('AU-NSW')).toEqual(['AU-NSW']);
    expect(australia.regionsOf('New South Wales')).toEqual(['AU-NSW']);
    expect((INDEX['AUS'] ?? []).filter(([key]) => key === 'AU-NSW')).toHaveLength(1);
    // Buenos Aires: the city and the province.
    expect(admin1RegionsOf('ARG')!.regionsOf('Buenos Aires')).toHaveLength(2);
  });

  it('keeps each country’s file small enough to fetch on demand', () => {
    const folder = join(import.meta.dirname, '../geo/admin1');
    const sizes = readdirSync(folder).map((file) => readFileSync(join(folder, file)).length);
    expect(sizes.length).toBeGreaterThan(200);
    expect(Math.max(...sizes)).toBeLessThan(400_000);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(5_000_000);
  });
});

describe('a Regions layer on Admin-1 (AC-624)', () => {
  it('fills German states by Revenue from the ramp, larger darker', () => {
    const option = optionFor(germany());
    const svg = renderToSvg(option);
    const filled = regionsOf(svg);
    const placed = filled.filter((region) => region.dataIndex < STATES.length);
    expect(new Set(placed.map((region) => region.dataIndex)).size).toBe(STATES.length);
    for (const region of placed) expect(region.fill).not.toBe(OTHER_COLOUR);
    // Bavaria (1,400) darker than Saarland (60).
    const fillOf = (at: number) => filled.find((region) => region.dataIndex === at)?.fill ?? '';
    expect(luma(fillOf(1))).toBeLessThan(luma(fillOf(10)));
  });

  it('draws a state with no row in the null neutral, with the legend and its "No data" swatch', () => {
    const option = optionFor(germany());
    const svg = renderToSvg(option);
    const unvalued = regionsOf(svg).filter((region) => region.dataIndex >= STATES.length);
    // Bremen: drawn, not coloured from the ramp.
    expect(unvalued.length).toBeGreaterThan(0);
    expect(new Set(unvalued.map((region) => region.fill))).toEqual(new Set([OTHER_COLOUR]));
    expect(svg).toContain('No data');
    expect(svg).toContain('$1,400');
    expect(svg).toContain('$60');
  });

  it('draws its boundaries 0.5 px in the surface colour, as Countries does', () => {
    const regions = (option: Record<string, unknown>) =>
      (option['series'] as Record<string, unknown>[]).find((one) => one['type'] === 'map')!;
    const style = (option: Record<string, unknown>) => regions(option)['itemStyle'];
    const onAdmin1 = optionFor(germany());
    expect(style(onAdmin1)).toEqual({
      areaColor: OTHER_COLOUR,
      borderColor: DEFAULT_SURFACE,
      borderWidth: 0.5,
    });
    const onCountries = optionFor({
      ...germany([['FRA', 10]]),
      options: {},
    });
    expect(style(onAdmin1)).toEqual(style(onCountries));
    expect(regions(onAdmin1)['projection']).toBeDefined();
    expect(renderToSvg(onAdmin1)).toMatch(/stroke-width="0\.5"/);
  });

  it('names what it can’t place under the map, a value of two regions as such', () => {
    expect(unplacedNote(germany([...STATES, ['Online', 5]]))).toBe(
      'Not on the map: "Online" (no region)',
    );
  });

  it('says so where no country’s regions are named', () => {
    const svg = renderToSvg(optionFor(germany([['Online', 5], ['Retail', 3]])));
    expect(svg).toContain('None of stores.state’s values match Admin-1.');
  });
});
