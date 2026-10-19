import type { RenderSpec } from '@wechart/core';
import { deltaEOK, deltaEUnderDichromacy, oklabFromHex } from '@wechart/ui';
import { beforeAll, describe, expect, it } from 'vitest';

import { OTHER_COLOUR } from '../colorAssignment';
import { echarts } from '../echarts';
import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { optionFor } from '../optionFor';
import { pointsOf, RENDER_SIZE, renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_PALETTE, DEFAULT_SURFACE, SEQUENTIAL } from '../theme';
import { diameterOf, mapPointsOf, POINT_MAX_PX, POINT_MIN_PX } from './mapPoints';

/**
 * T976 / AC-625: THE SYSTEM SHALL draw a Points layer from a geo dimension's
 * latitude and longitude as area-proportional circles 8–24 px across at 0.72
 * with a 1 px surface ring, in categorical slot 2 over a Regions layer, or by
 * a Colour dimension of at most 3 members; count the rows with no location
 * ("312 stores have no location."); and IF Cube returned fewer rows than the
 * data holds, THEN say "Showing ‹n› of ‹N› ‹members› (Cube's row limit)."
 * `Fails when: a point is placed off its latitude and longitude; its size
 * isn't proportional by area within 1 %, or outside 8–24 px; points over
 * regions take slot 1; a fourth colour is drawn; rows without a location
 * aren't counted; or a cut result isn't said.`
 *
 * A Cube geo value is "lat,lng" (research `cube-geo-values.md`); ECharts'
 * `geo` takes `[lng, lat]` (research `echarts-geo-points.md`).
 */
beforeAll(() => {
  registerCountries(countries);
});

/** Ten stores, Revenue 50K to 300K, across the world. */
const STORES: readonly [string, number][] = [
  ['40.7128,-74.0060', 300_000], // New York
  ['51.5074,-0.1278', 250_000], // London
  ['48.8566,2.3522', 220_000], // Paris
  ['35.6762,139.6503', 200_000], // Tokyo
  ['-33.8688,151.2093', 175_000], // Sydney
  ['-23.5505,-46.6333', 150_000], // São Paulo
  ['19.4326,-99.1332', 125_000], // Mexico City
  ['1.3521,103.8198', 100_000], // Singapore
  ['55.7558,37.6173', 75_000], // Moscow
  ['-1.2921,36.8219', 50_000], // Nairobi
];

const pointsRows = (stores = STORES) =>
  stores.map(([location, revenue]) => ({
    'stores.location': location,
    'orders.revenue': revenue,
  }));

const map = (
  points: Record<string, unknown>,
  answer: RenderSpec['mapPoints'],
  regions = true,
): RenderSpec => ({
  chartType: 'map',
  encoding: regions ? { x: ['customers.country_iso3'], y: ['orders.revenue'] } : {},
  rows: regions
    ? [
        { 'customers.country_iso3': 'USA', 'orders.revenue': '900' },
        { 'customers.country_iso3': 'FRA', 'orders.revenue': '400' },
      ]
    : [{ 'orders.revenue': '1300' }],
  options: { map: { points } },
  formats: { 'orders.revenue': 'currency' },
  ...(answer === undefined ? {} : { mapPoints: answer }),
});

const SIZED = { location: 'stores.location', size: 'orders.revenue' };

describe('the Points layer (AC-625)', () => {
  it('draws 10 stores on the map at their coordinates, longitude first', () => {
    const option = optionFor(map(SIZED, { rows: pointsRows() }));
    const svg = renderToSvg(option);
    const drawn = pointsOf(svg, [DEFAULT_PALETTE[1]!]);
    expect(drawn).toHaveLength(10);

    // Where the map's own projection puts each store's [lng, lat].
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, ...RENDER_SIZE });
    try {
      chart.setOption({ animation: false, ...option });
      for (const [location] of STORES) {
        const [lat, lng] = location.split(',').map(Number) as [number, number];
        const [x, y] = chart.convertToPixel({ seriesIndex: 0 }, [lng, lat]) as [number, number];
        const near = drawn.filter(
          (point) => Math.abs(point.x - x) < 0.5 && Math.abs(point.y - y) < 0.5,
        );
        expect(near, location).toHaveLength(1);
      }
    } finally {
      chart.dispose();
    }
  });

  it('sizes them by area from 8 px for the least Revenue to 24 px for the most', () => {
    const drawn = mapPointsOf(map(SIZED, { rows: pointsRows() }))!;
    const diameters = drawn.points.map((point) => point.diameter);
    expect(Math.min(...diameters)).toBe(POINT_MIN_PX);
    expect(Math.max(...diameters)).toBe(POINT_MAX_PX);
    // Area grows with the value: halfway in Revenue is halfway in area.
    const area = (d: number) => Math.PI * (d / 2) ** 2;
    const half = diameterOf(175_000, 50_000, 300_000);
    expect(area(half)).toBeCloseTo((area(8) + area(24)) / 2, 6);
    // In the drawing too, within 1 %.
    const svg = renderToSvg(optionFor(map(SIZED, { rows: pointsRows() })));
    const sizes = pointsOf(svg, [DEFAULT_PALETTE[1]!]).map((point) => point.diameterPx);
    expect(Math.min(...sizes)).toBeCloseTo(8, 1);
    expect(Math.max(...sizes)).toBeCloseTo(24, 1);
  });

  it('takes categorical slot 2 over a Regions layer, at 0.72 with a 1 px surface ring', () => {
    const option = optionFor(map(SIZED, { rows: pointsRows() }));
    const scatter = (option['series'] as Record<string, unknown>[]).find(
      (series) => series['type'] === 'scatter',
    )!;
    expect(scatter['coordinateSystem']).toBe('geo');
    const items = scatter['data'] as { itemStyle: Record<string, unknown> }[];
    for (const item of items) {
      expect(item.itemStyle).toEqual({
        color: DEFAULT_PALETTE[1],
        opacity: 0.72,
        borderColor: DEFAULT_SURFACE,
        borderWidth: 1,
      });
    }
    // Never slot 1, the ramp's own hue.
    expect(pointsOf(renderToSvg(option), [DEFAULT_PALETTE[0]!])).toHaveLength(0);
  });

  /**
   * The palette validator (research `palette-validation.md`; the marking
   * palette's thresholds, ΔEOK ×100 of 15, and 8 under protan and deutan
   * simulation): slot 2 stands apart from every step of the ramp under it,
   * and from the null neutral, where slot 1 — the ramp's own hue — doesn't.
   */
  it('passes the palette validator over the sequential ramp, where slot 1 fails', () => {
    const [pale, dark] = SEQUENTIAL.map((hex) =>
      [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)),
    ) as [number[], number[]];
    const steps = [0, 0.25, 0.5, 0.75, 1].map(
      (t) =>
        `#${pale
          .map((value, at) => Math.round(value + (dark[at]! - value) * t))
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')}`,
    );
    const separation = (one: string, other: string) =>
      Math.min(
        deltaEOK(oklabFromHex(one), oklabFromHex(other)) / 15,
        deltaEUnderDichromacy(one, other, 'protan') / 8,
        deltaEUnderDichromacy(one, other, 'deutan') / 8,
      );
    for (const step of [...steps, OTHER_COLOUR])
      expect(separation(DEFAULT_PALETTE[1]!, step), step).toBeGreaterThanOrEqual(1);
    expect(Math.min(...steps.map((step) => separation(DEFAULT_PALETTE[0]!, step)))).toBeLessThan(1);
  });

  it('takes slot 1 with no Regions layer', () => {
    const svg = renderToSvg(optionFor(map(SIZED, { rows: pointsRows() }, false)));
    expect(pointsOf(svg, [DEFAULT_PALETTE[0]!])).toHaveLength(10);
  });

  it('colours by a Colour dimension of at most 3 members, and refuses a fourth', () => {
    const coloured = (formats: readonly string[]) =>
      map(
        { ...SIZED, colour: 'stores.format' },
        {
          rows: pointsRows().map((row, at) => ({
            ...row,
            'stores.format': formats[at % formats.length],
          })),
        },
      );
    const three = mapPointsOf(coloured(['Mall', 'Street', 'Outlet']))!;
    expect(three.refusal).toBeUndefined();
    expect(new Set(three.points.map((point) => point.colour))).toEqual(
      new Set([DEFAULT_PALETTE[1], DEFAULT_PALETTE[2], DEFAULT_PALETTE[3]]),
    );

    const four = mapPointsOf(coloured(['Mall', 'Street', 'Outlet', 'Kiosk']))!;
    expect(four.refusal).toBe('Colour takes at most 3 members; stores.format has 4.');
    // Drawn in one colour, as with no Colour at all: no fourth.
    expect(new Set(four.points.map((point) => point.colour))).toEqual(new Set([DEFAULT_PALETTE[1]]));
  });

  it('counts the rows with no location, and says a cut result', () => {
    const drawn = mapPointsOf(
      map(SIZED, {
        rows: [
          ...pointsRows(),
          { 'stores.location': null, 'orders.revenue': 10 },
          { 'stores.location': 'nowhere', 'orders.revenue': 10 },
        ],
        total: 48_210,
      }),
    )!;
    expect(drawn.points).toHaveLength(10);
    expect(drawn.unlocated).toBe(2);
    expect(drawn.shown).toBe(12);
    expect(drawn.total).toBe(48_210);
    expect(drawn.noun).toBe('stores');
  });

  // Checkpoint 4's review: entities, not the one grouped row they collapse into.
  it('counts the rows with no location as Cube counted them apart, not as one grouped row', () => {
    const drawn = mapPointsOf(
      map(SIZED, {
        rows: [...pointsRows(), { 'stores.location': null, 'orders.revenue': 3_120 }],
        unlocated: 312,
      }),
    )!;
    expect(drawn.unlocated).toBe(312);
    expect(drawn.points).toHaveLength(10);
  });

  it('draws nothing of its own before its answer is in, or without the layer', () => {
    expect(mapPointsOf(map(SIZED, undefined))).toBeUndefined();
    const noLayer: RenderSpec = { ...map(SIZED, { rows: pointsRows() }), options: {} };
    expect(mapPointsOf(noLayer)).toBeUndefined();
    const option = optionFor(map(SIZED, undefined));
    expect(
      (option['series'] as Record<string, unknown>[]).some((series) => series['type'] === 'scatter'),
    ).toBe(false);
  });
});
