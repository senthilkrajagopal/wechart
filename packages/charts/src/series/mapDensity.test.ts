import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { beforeAll, describe, expect, it } from 'vitest';

import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { itemsInShape } from '../interaction/itemsInShape';
import { optionFor } from '../optionFor';
import { SEQUENTIAL } from '../theme';
import { DENSITY_CANT_BE_MARKED } from './mapDensity';

/**
 * T977 / AC-626: THE SYSTEM SHALL draw a Density layer from a geo dimension
 * on §5's sequential ramp fading to transparent, regions drawn as 1 px
 * `border-strong` outlines while it shows; and SHALL never mark from it, its
 * layer row and tooltip saying "Density can't be marked; it shows where
 * points gather".
 * `Fails when: density is drawn in another ramp; regions keep their fill
 * under it; a gesture on it marks anything; or the sentence is missing from
 * the layer row or the tooltip.`
 *
 * Its heatmap draws into a canvas, which Node's server-side rendering hasn't
 * (research `echarts-geo-points.md`), so its option is read here and its
 * drawing in the browser (e2e).
 */
beforeAll(() => {
  registerCountries(countries);
});

const PLACES = ['40.7128,-74.0060', '51.5074,-0.1278', '48.8566,2.3522', '48.86,2.35', null];

const density: RenderSpec = {
  chartType: 'map',
  encoding: { x: ['customers.country_iso3'], y: ['orders.revenue'] },
  rows: [
    { 'customers.country_iso3': 'USA', 'orders.revenue': '900' },
    { 'customers.country_iso3': 'FRA', 'orders.revenue': '400' },
  ],
  options: { map: { density: { location: 'stores.location' } } },
  mapDensity: { rows: PLACES.map((place) => ({ 'stores.location': place })) },
};

type Series = Record<string, unknown> & { type?: string; data?: unknown[] };
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];

describe('the Density layer (AC-626)', () => {
  it('is a heatmap on the map’s geo, at each located place, longitude first', () => {
    const option = optionFor(density);
    const heat = seriesOf(option).find((one) => one.type === 'heatmap')!;
    expect(heat['coordinateSystem']).toBe('geo');
    expect(heat.data).toEqual([
      [-74.006, 40.7128, 1],
      [-0.1278, 51.5074, 1],
      [2.3522, 48.8566, 1],
      [2.35, 48.86, 1],
    ]);
    // Its geo laid out as the regions' own, and drawing nothing itself.
    const regions = seriesOf(option).find((one) => one.type === 'map')!;
    const geo = option['geo'] as Record<string, unknown>;
    expect(geo['show']).toBe(false);
    for (const key of ['map', 'projection', 'left', 'right', 'top', 'bottom'])
      expect(geo[key], key).toBe(regions[key]);
  });

  it('is on the sequential ramp, fading to transparent at its least', () => {
    const option = optionFor(density);
    const index = seriesOf(option).findIndex((one) => one.type === 'heatmap');
    const maps = option['visualMap'] as Record<string, unknown>[];
    const own = maps.find((one) => one['seriesIndex'] === index)!;
    const colours = (own['inRange'] as { color: string[] }).color;
    expect(colours[0]).toMatch(/^rgba\(\d+, ?\d+, ?\d+, ?0\)$/);
    expect(colours.at(-1)).toBe(SEQUENTIAL[1]);
    expect(colours).toContain(SEQUENTIAL[0]);
    // No other ramp colours the regions while it shows.
    expect(maps).toHaveLength(1);
  });

  it('draws the regions as 1 px border-strong outlines, with no fill, while it shows', () => {
    const regions = seriesOf(optionFor(density)).find((one) => one.type === 'map')!;
    expect(regions['itemStyle']).toEqual({
      areaColor: 'transparent',
      borderColor: COLORS.light['border-strong'],
      borderWidth: 1,
    });
    // And none of them keeps a fill of its own.
    for (const item of regions.data ?? [])
      expect((item as { itemStyle?: { areaColor?: string } }).itemStyle?.areaColor ?? 'transparent').toBe(
        'transparent',
      );
  });

  it('marks nothing from a gesture over it, and is silent to a click', () => {
    const option = optionFor({
      ...density,
      encoding: {},
      rows: [{ 'orders.revenue': '1300' }],
    });
    const heat = seriesOf(option).find((one) => one.type === 'heatmap')!;
    expect(heat['silent']).toBe(true);
    const everywhere = { kind: 'rect' as const, x0: -10_000, y0: -10_000, x1: 10_000, y1: 10_000 };
    const converter = { convertToPixel: () => 0 };
    expect(itemsInShape(converter, option, everywhere)).toEqual([]);
  });

  it('says it can’t be marked in its tooltip', () => {
    expect(DENSITY_CANT_BE_MARKED).toBe("Density can't be marked; it shows where points gather");
    const tooltip = optionFor(density)['tooltip'] as {
      formatter: (params: { name?: string; value?: unknown }) => string;
    };
    expect(tooltip.formatter({ name: 'FRA', value: 400 })).toContain(DENSITY_CANT_BE_MARKED);
  });
});
