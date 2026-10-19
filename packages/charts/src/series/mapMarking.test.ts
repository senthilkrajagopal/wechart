import { EMPTY_PREDICATE, withItem, type RenderSpec } from '@wechart/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { echarts } from '../echarts';
import admin1Germany from '../geo/admin1/DEU.geo.json';
import admin1Index from '../geo/admin1/index.json';
import { registerAdmin1, registerAdmin1Index, type Admin1Index } from '../geo/admin1';
import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { itemsInShape } from '../interaction/itemsInShape';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';
import { RENDER_SIZE } from '../testing/renderToSvg';
import type { EChartsOption } from '../theme';

/**
 * T978 / AC-627: THE SYSTEM SHALL mark a region as its member and a point as
 * its member; a rectangle or lasso marking the points inside it, or, with no
 * Points layer, the regions it touches; marking drawn with outline and fade,
 * never by fill; and as a cross-filter source a region or point filters the
 * others to its member.
 * `Fails when: a lasso marks points outside it, or regions while a Points
 * layer shows; a marked region changes fill; or a region or point doesn't
 * filter.`
 */
beforeAll(() => {
  registerCountries(countries);
  registerAdmin1Index(admin1Index as unknown as Admin1Index);
  registerAdmin1('DEU', admin1Germany);
});

/** Six stores: three in Western Europe, three far away. */
const STORES: readonly [string, number][] = [
  ['48.8566,2.3522', 300], // Paris
  ['50.8503,4.3517', 200], // Brussels
  ['52.3676,4.9041', 150], // Amsterdam
  ['40.7128,-74.0060', 250], // New York
  ['-33.8688,151.2093', 120], // Sydney
  ['35.6762,139.6503', 90], // Tokyo
];

const COUNTRIES: RenderSpec = {
  chartType: 'map',
  encoding: { x: ['customers.country_iso3'], y: ['orders.revenue'] },
  rows: [
    { 'customers.country_iso3': 'FRA', 'orders.revenue': '400' },
    { 'customers.country_iso3': 'BEL', 'orders.revenue': '200' },
    { 'customers.country_iso3': 'USA', 'orders.revenue': '900' },
  ],
};

const withStores: RenderSpec = {
  ...COUNTRIES,
  options: { map: { points: { location: 'stores.location', size: 'orders.revenue' } } },
  mapPoints: {
    rows: STORES.map(([location, revenue]) => ({
      'stores.location': location,
      'orders.revenue': revenue,
    })),
  },
};

/** The option drawn on a real (server-side) chart, and the rectangle round some places. */
function drawn(spec: RenderSpec) {
  const option = optionFor(spec);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, ...RENDER_SIZE });
  chart.setOption({ animation: false, ...option });
  const at = (lat: number, lng: number) =>
    chart.convertToPixel({ seriesIndex: 0 }, [lng, lat]) as unknown as [number, number];
  /** A rectangle just round these [lat, lng] places. */
  const around = (...places: [number, number][]) => {
    const pixels = places.map(([lat, lng]) => at(lat, lng));
    const xs = pixels.map(([x]) => x);
    const ys = pixels.map(([, y]) => y);
    return {
      kind: 'rect' as const,
      x0: Math.min(...xs) - 2,
      y0: Math.min(...ys) - 2,
      x1: Math.max(...xs) + 2,
      y1: Math.max(...ys) + 2,
    };
  };
  return {
    option,
    chart,
    around,
    inShape: (shape: Parameters<typeof itemsInShape>[2]) =>
      itemsInShape(chart, chart.getOption() as EChartsOption, shape),
  };
}

describe('marking a map (AC-627)', () => {
  it('marks the 3 stores a rectangle takes in, and no region, while points show', () => {
    const { chart, around, inShape } = drawn(withStores);
    try {
      const items = inShape(around([48.8566, 2.3522], [52.3676, 4.9041]));
      expect(items.map((item) => item.marks)).toEqual([
        [{ member: 'stores.location', value: '48.8566,2.3522' }],
        [{ member: 'stores.location', value: '50.8503,4.3517' }],
        [{ member: 'stores.location', value: '52.3676,4.9041' }],
      ]);
    } finally {
      chart.dispose();
    }
  });

  it('marks the regions it touches with no Points layer', () => {
    const { chart, around, inShape } = drawn(COUNTRIES);
    try {
      // Paris to Brussels: France and Belgium, never the United States.
      const items = inShape(around([48.8566, 2.3522], [50.8503, 4.3517]));
      expect(items.map((item) => item.name).toSorted()).toEqual(['BEL', 'FRA']);
    } finally {
      chart.dispose();
    }
  });

  it('marks an Admin-1 region by its member as the row holds it, by name or by code', () => {
    const spec: RenderSpec = {
      chartType: 'map',
      encoding: { x: ['stores.state'], y: ['orders.revenue'] },
      rows: [
        { 'stores.state': 'Bavaria', 'orders.revenue': 10 },
        { 'stores.state': 'DE-BE', 'orders.revenue': 5 },
      ],
      options: { map: { boundarySet: 'admin1' } },
    };
    const { chart, around, inShape } = drawn(spec);
    try {
      // Munich, in Bavaria.
      expect(inShape(around([48.1351, 11.582])).map((item) => item.name)).toEqual(['Bavaria']);
    } finally {
      chart.dispose();
    }
    // Marked, Bavaria by its name keeps its fill and gains the outline; Berlin fades.
    const marked = optionFor({
      ...spec,
      marking: {
        predicate: withItem(EMPTY_PREDICATE, [{ member: 'stores.state', value: 'Bavaria' }]),
        colour: '#151107',
      },
    });
    const regions = (marked['series'] as Record<string, unknown>[]).find(
      (one) => one['type'] === 'map',
    )!;
    const style = (name: string) =>
      (
        (regions['data'] as { name: string; itemStyle?: Record<string, unknown> }[]).find(
          (item) => item.name === name,
        )?.itemStyle ?? {}
      );
    expect(style('DE-BY')).toMatchObject({
      borderColor: '#151107',
      borderWidth: MARKED_OUTLINE_PX,
      opacity: 1,
    });
    expect(style('DE-BE')).toMatchObject({ opacity: UNMARKED_OPACITY });
    // Never by fill: the scale's colour is the region's own.
    expect(style('DE-BY')).not.toHaveProperty('color');
    expect(style('DE-BY')).not.toHaveProperty('areaColor');
  });

  // Checkpoint 4's review: a partly marked region found by the value its row holds.
  it('draws an Admin-1 region partly marked by the name its row holds', () => {
    const rows = [
      { 'stores.state': 'Bavaria', 'orders.revenue': 10 },
      { 'stores.state': 'DE-BE', 'orders.revenue': 5 },
    ];
    const option = optionFor({
      chartType: 'map',
      encoding: { x: ['stores.state'], y: ['orders.revenue'] },
      rows,
      options: { map: { boundarySet: 'admin1' } },
      marking: {
        predicate: withItem(EMPTY_PREDICATE, [{ member: 'stores.channel', value: 'Web' }]),
        colour: '#151107',
        share: [{ 'stores.state': 'Bavaria', 'orders.revenue': 4 }],
        aggTypes: { 'orders.revenue': 'sum' },
      },
    });
    const regions = (option['series'] as Record<string, unknown>[]).find(
      (one) => one['type'] === 'map',
    )!;
    const bavaria = (regions['data'] as { name: string; share?: { marked?: number } }[]).find(
      (item) => item.name === 'DE-BY',
    );
    expect(bavaria?.share?.marked).toBe(4);
  });

  it('draws a marked store outlined and the rest faded, each in its own colour', () => {
    const option = optionFor({
      ...withStores,
      marking: {
        predicate: withItem(EMPTY_PREDICATE, [
          { member: 'stores.location', value: '48.8566,2.3522' },
        ]),
        colour: '#151107',
      },
    });
    const points = (option['series'] as Record<string, unknown>[]).find(
      (one) => one['type'] === 'scatter',
    )!;
    const styles = (points['data'] as { itemStyle: Record<string, unknown> }[]).map(
      (item) => item.itemStyle,
    );
    expect(styles[0]).toMatchObject({ borderColor: '#151107', borderWidth: MARKED_OUTLINE_PX });
    expect(styles[0]!['opacity']).toBe(0.72);
    for (const other of styles.slice(1)) expect(other['opacity']).toBeCloseTo(0.72 * UNMARKED_OPACITY);
    expect(new Set(styles.map((style) => style['color'])).size).toBe(1);
  });

  it('carries what a point and a region mark to a click', () => {
    const option = optionFor(withStores);
    const series = option['series'] as Record<string, unknown>[];
    const point = (series.find((one) => one['type'] === 'scatter')!['data'] as Record<string, unknown>[])[0]!;
    expect(point['marks']).toEqual([{ member: 'stores.location', value: '48.8566,2.3522' }]);
    // Named: ECharts' default name holds the separator a click is read by.
    expect(series.find((one) => one['type'] === 'scatter')!['name']).toBe('stores.location');
    const region = (series.find((one) => one['type'] === 'map')!['data'] as Record<string, unknown>[])[0]!;
    expect(region['category']).toBe('FRA');
  });
});
