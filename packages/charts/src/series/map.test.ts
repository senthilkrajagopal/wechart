import { EMPTY_PREDICATE, formatValue, withItem, type RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { beforeAll, describe, expect, it } from 'vitest';

import countries from '../geo/countries-50m.geo.json';
import { registerCountries } from '../geo/countryMap';
import { OTHER_COLOUR } from '../colorAssignment';
import { focusedItemOf } from '../marking/focus';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';
import { regionsOf, renderToSvg } from '../testing/renderToSvg';
import { unplacedCodes } from './map';

/**
 * T398 / AC-305: WHEN a chart has one measure and a dimension holding ISO-3
 * country codes, THE SYSTEM SHALL offer a country map that colours each
 * country by the measure on a sequential scale with a legend, and names any
 * codes it can't place. Its boundaries are Natural Earth's 1:50m admin-0
 * units, so small states such as Singapore (SGP) are placed.
 * `Fails when: a country code in the data isn't coloured (SGP included), the
 * map has no legend, or an unplaced code isn't named.`
 *
 * Rules 86–87: an equal-area projection and §5's sequential ramp; countries
 * without a value in the null neutral, and a "No data" swatch beside the
 * continuous bar, whose two ends are labelled with formatted values.
 *
 * Rendered for real, as every renderer here is (ECharts' SSR to SVG).
 */
beforeAll(() => {
  registerCountries(countries);
});

const spec = (rows: RenderSpec['rows']): RenderSpec => ({
  chartType: 'map',
  encoding: { x: ['customers.country_iso3'], y: ['orders.revenue'] },
  rows,
  formats: { 'orders.revenue': 'currency' },
});

const ROWS = [
  { 'customers.country_iso3': 'SGP', 'orders.revenue': '1200.50' },
  { 'customers.country_iso3': 'FRA', 'orders.revenue': '56550.00' },
  { 'customers.country_iso3': 'NOR', 'orders.revenue': '8000' },
  { 'customers.country_iso3': 'USA', 'orders.revenue': '240000' },
  { 'customers.country_iso3': 'XKX', 'orders.revenue': '10' },
];

describe('a country map', () => {
  it('fills every placeable code in the data from the sequential ramp, SGP, FRA and NOR included', () => {
    const svg = renderToSvg(optionFor(spec(ROWS)));

    // The data's placed rows are its first items, in order: SGP, FRA, NOR, USA.
    const filled = regionsOf(svg);
    for (const [index, code] of ['SGP', 'FRA', 'NOR', 'USA'].entries()) {
      const fills = filled.filter((region) => region.dataIndex === index).map((r) => r.fill);
      expect(fills.length, code).toBeGreaterThan(0);
      for (const fill of fills) {
        expect(fill, code).toMatch(/^rgba?\(/);
        expect(fill, code).not.toBe(OTHER_COLOUR);
      }
    }
    // A larger value is a darker blue: USA's revenue is the most.
    const luma = (index: number) => {
      const fill = filled.find((region) => region.dataIndex === index)?.fill ?? '';
      const [r = 0, g = 0, b = 0] = (fill.match(/[\d.]+/g) ?? []).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luma(3)).toBeLessThan(luma(1));
    expect(luma(1)).toBeLessThan(luma(0));
  });

  it('draws the countries without a value in the null neutral', () => {
    const svg = renderToSvg(optionFor(spec(ROWS)));

    // Germany, say, has no row: it is drawn, not coloured from the ramp.
    const unvalued = regionsOf(svg).filter((region) => region.dataIndex >= 4);
    expect(unvalued.length).toBeGreaterThan(100);
    expect(new Set(unvalued.map((region) => region.fill))).toEqual(new Set([OTHER_COLOUR]));
  });

  it('has a legend: the bar’s two ends in the measure’s format, and a "No data" swatch', () => {
    const svg = renderToSvg(optionFor(spec(ROWS)));

    const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
    // Each end as the measure's format writes it — "$240,000", not "240000".
    const formats = { 'orders.revenue': 'currency' };
    expect(texts).toContain(formatValue(240000, 'orders.revenue', formats));
    expect(texts).toContain(formatValue(1200.5, 'orders.revenue', formats));
    expect(texts).not.toContain('240000');
    expect(texts).toContain('No data');
    // The swatch beside it, in the null neutral, ringed as no country is:
    // a country's edge is the surface's colour.
    const ringed = [...svg.matchAll(/<path\b([^>]*)>/g)].filter(
      ([, attributes = '']) =>
        attributes.includes(`fill="${OTHER_COLOUR}"`) &&
        attributes.includes(`stroke="${COLORS.light['border-strong']}"`),
    );
    expect(ringed).toHaveLength(1);
  });

  /**
   * direction.md's hover: "the country's name, then the measure; 'No data'
   * when it has none". Australia is three features of one key — Australia
   * first, then its Indian Ocean territories and Ashmore and Cartier — and
   * is named for the first (T398's review).
   */
  it('names a country in its tooltip, then its value or "No data"', () => {
    const formatter = (
      optionFor(spec([{ 'customers.country_iso3': 'AUS', 'orders.revenue': '5' }]))['tooltip'] as {
        formatter: (params: { name: string; value: unknown }) => string;
      }
    ).formatter;

    expect(formatter({ name: 'AUS', value: 5 })).toBe(
      `Australia<br/>${formatValue(5, 'orders.revenue', { 'orders.revenue': 'currency' })}`,
    );
    expect(formatter({ name: 'DEU', value: Number.NaN })).toBe('Germany<br/>No data');
  });

  /**
   * T398's review, AC-096 and AC-117 on a map tile: marking a country uses
   * outline and fade, never fill (direction.md, "Country map"; the fill is
   * the scale's), and a highlight fades the rest; the keyboard's item is the
   * country it names, however many codes the map could not place.
   */
  describe('on a dashboard', () => {
    type Region = { name: string; itemStyle?: Record<string, unknown> };
    const regions = (drawn: Record<string, unknown>) =>
      ((drawn['series'] as { data: Region[] }[])[0]?.data ?? []).map(({ name, itemStyle }) => ({
        name,
        ...(itemStyle === undefined ? {} : { itemStyle }),
      }));
    const rows = [
      { 'customers.country_iso3': 'XKX', 'orders.revenue': '1' },
      { 'customers.country_iso3': 'FRA', 'orders.revenue': '2' },
      { 'customers.country_iso3': 'NOR', 'orders.revenue': '3' },
    ];

    it('outlines a marked country and fades the rest, leaving the fill to the scale', () => {
      const drawn = optionFor({
        ...spec(rows),
        marking: {
          predicate: withItem(EMPTY_PREDICATE, [
            { member: 'customers.country_iso3', value: 'FRA' },
          ]),
          colour: '#151107',
        },
      });

      expect(regions(drawn)).toEqual([
        {
          name: 'FRA',
          itemStyle: { opacity: 1, borderColor: '#151107', borderWidth: MARKED_OUTLINE_PX },
        },
        { name: 'NOR', itemStyle: { opacity: UNMARKED_OPACITY, borderWidth: 0 } },
      ]);
    });

    it('fades every country but the highlighted one', () => {
      const drawn = optionFor({
        ...spec(rows),
        highlight: { kind: 'fade', member: 'customers.country_iso3', value: 'NOR' },
      });

      const [france, norway] = regions(drawn);
      expect(france?.itemStyle?.['opacity']).toBeLessThan(1);
      expect(norway?.itemStyle?.['opacity'] ?? 1).toBe(1);
    });

    it('puts the keyboard on the country it names, and none on a code it can’t place', () => {
      expect(
        focusedItemOf(optionFor({ ...spec(rows), keyboardFocus: 'FRA' }), {
          ...spec(rows),
          keyboardFocus: 'FRA',
        }),
      ).toEqual({ seriesIndex: 0, dataIndex: 0 });
      expect(
        focusedItemOf(optionFor({ ...spec(rows), keyboardFocus: 'XKX' }), {
          ...spec(rows),
          keyboardFocus: 'XKX',
        }),
      ).toBe(undefined);
    });
  });

  it('names every code it can’t place, and draws none of them', () => {
    expect(
      unplacedCodes(spec([...ROWS, { 'customers.country_iso3': null, 'orders.revenue': '3' }])),
    ).toEqual(['XKX', '(empty)']);
    expect(unplacedCodes(spec(ROWS.slice(0, 4)))).toEqual([]);
  });
});
