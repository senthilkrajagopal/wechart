import { beforeAll, describe, expect, it } from 'vitest';

import { CHART_TYPES, type RenderSpec } from '@wechart/core';

import countries from './geo/countries-50m.geo.json';
import { registerCountries } from './geo/countryMap';
import { DIRECT_LABEL_TOP } from './layout/directLabels';
import { DRAWABLE_TYPES, isDrawable, optionFor } from './optionFor';
import {
  cellsOf,
  labelsOf,
  marksOf,
  pointsOf,
  renderToSvg,
  sectorsOf,
} from './testing/renderToSvg';

/**
 * AC-037: one entry point from a spec to a drawable option.
 *
 * The renderers are per family; something has to choose between them, and that
 * choice is what the app calls. A dispatcher that quietly fell back to one
 * family for an unknown type would draw the wrong chart rather than say it
 * cannot draw it, so the unknown case is checked too.
 */
const PALETTE = ['#123456', '#abcdef'];

/**
 * Two families need more than the usual "a category and a measure":
 *
 * - **scatter** puts a measure on x, so a categorical x drops every row for
 *   want of a coordinate and the test would prove nothing but the drop rule;
 * - **heatmap** is categorical on both axes with the measure on colour.
 *
 * That the fixture has to branch is the point of the channel model: these are
 * genuinely different bindings, not one binding with options.
 */
const spec = (chartType: RenderSpec['chartType']): RenderSpec => {
  if (chartType === 'scatter') {
    return {
      chartType,
      encoding: { x: ['orders.total'], y: ['orders.count'] },
      rows: [
        { 'orders.total': 5, 'orders.count': 10 },
        { 'orders.total': 9, 'orders.count': 30 },
      ],
      palette: PALETTE,
    };
  }

  if (chartType === 'trellis') {
    return {
      chartType,
      encoding: { facet: ['orders.region'], x: ['orders.status'], y: ['orders.count'] },
      rows: [
        { 'orders.region': 'east', 'orders.status': 'paid', 'orders.count': 10 },
        { 'orders.region': 'west', 'orders.status': 'paid', 'orders.count': 30 },
      ],
      palette: PALETTE,
    };
  }

  // Countries, by their ISO-3 codes, on the registered boundaries (T398).
  if (chartType === 'map') {
    return {
      chartType,
      encoding: { x: ['customers.country_iso3'], y: ['orders.count'] },
      rows: [
        { 'customers.country_iso3': 'FRA', 'orders.count': 10 },
        { 'customers.country_iso3': 'USA', 'orders.count': 30 },
      ],
      palette: PALETTE,
    };
  }

  if (chartType === 'heatmap') {
    return {
      chartType,
      encoding: { x: ['orders.status'], y: ['orders.region'], color: ['orders.count'] },
      rows: [
        { 'orders.status': 'paid', 'orders.region': 'east', 'orders.count': 10 },
        { 'orders.status': 'refunded', 'orders.region': 'west', 'orders.count': 30 },
      ],
      palette: PALETTE,
    };
  }

  return {
    chartType,
    encoding: { x: ['orders.status'], y: ['orders.count'] },
    rows: [
      { 'orders.status': 'paid', 'orders.count': 10 },
      { 'orders.status': 'refunded', 'orders.count': 30 },
    ],
    palette: PALETTE,
  };
};

describe('every drawable type produces marks', () => {
  // A map is drawn only on its boundaries, registered first (T398).
  beforeAll(() => {
    registerCountries(countries);
  });

  for (const chartType of DRAWABLE_TYPES) {
    it(`draws ${chartType}`, () => {
      const svg = renderToSvg(optionFor(spec(chartType)));

      // Each family leaves a different trace, so "something was drawn" has to
      // be asked of each in its own terms.
      const drew =
        marksOf(svg, PALETTE).length > 0 ||
        pointsOf(svg, PALETTE).length > 0 ||
        sectorsOf(svg, PALETTE).length > 0 ||
        // A heatmap's colours are interpolated along a ramp rather than taken
        // from the palette, so they arrive as rgb() and none of the above sees
        // them.
        cellsOf(svg).length > 0 ||
        svg.includes(`stroke="${PALETTE[0] ?? ''}"`);

      expect(drew).toBe(true);
    });
  }
});

describe('a type ECharts does not draw', () => {
  const notEcharts = CHART_TYPES.filter((chartType) => !isDrawable(chartType));

  it('is only the DOM-rendered ones', () => {
    // Every type is drawn now; these three are drawn as DOM by `ChartTile`,
    // because a number or a table on a canvas is unselectable, unsearchable
    // and invisible to a screen reader. Nothing is left undrawn.
    expect([...notEcharts].sort()).toEqual(['kpi', 'pivot', 'table']);
  });

  for (const chartType of notEcharts) {
    it(`reports ${chartType} rather than drawing something else`, () => {
      // Falling back to a bar would put a chart on screen that the spec never
      // asked for. Derived from the vocabulary rather than hard-coded, so this
      // keeps testing the right types as the split moves.
      expect(() => optionFor(spec(chartType))).toThrow(new RegExp(chartType));
    });
  }

  it('agrees with its own list', () => {
    for (const chartType of DRAWABLE_TYPES) {
      expect(isDrawable(chartType)).toBe(true);
    }
  });
});

/**
 * T254 / AC-187, recheck-dashboard F9: the prototype's grid,
 * `{ left: 8, right: 28, top: 12, bottom: 8, containLabel: true }`, in
 * ECharts 6's own terms — the rect's edges and "same" outer bounds holding
 * the axes' labels and names (research/echarts-text-and-grid.md, Q3). ECharts'
 * default left 80 px empty below the axis labels.
 */
describe('a chart on axes', () => {
  for (const chartType of ['bar', 'line', 'scatter', 'heatmap'] as const)
    it(`is laid out on the prototype’s grid (${chartType})`, () => {
      const grid = optionFor(spec(chartType))['grid'] as Record<string, unknown>;
      expect(grid).toMatchObject({
        left: 8,
        right: 28,
        bottom: 8,
        outerBoundsMode: 'same',
        outerBoundsContain: 'all',
      });
      // One series, so no legend: 12 above, as the prototype's topPad (T254's
      // review: the assertion was only "a number").
      expect(grid['top']).toBe(12);
    });

  it('keeps the prototype’s 12 px top when Customize hides the legend or moves it', () => {
    // T254's review: removing the legend's 32 px top left ECharts' default 65.
    const twoSeries: RenderSpec = {
      chartType: 'bar',
      encoding: { x: ['orders.status'], y: ['orders.count'], color: ['orders.region'] },
      rows: [
        { 'orders.status': 'paid', 'orders.region': 'east', 'orders.count': 10 },
        { 'orders.status': 'paid', 'orders.region': 'west', 'orders.count': 30 },
      ],
      palette: PALETTE,
    };
    const topOf = (options: Record<string, unknown>) =>
      (optionFor({ ...twoSeries, options })['grid'] as { top?: unknown }).top;
    // Over the legend's room, a grouped bar's names over its tallest bars
    // take theirs (T681's follow-up; R76 dashboard-Q1).
    expect(topOf({})).toBe(32 + DIRECT_LABEL_TOP);
    expect(topOf({ legend: { show: false } })).toBe(12 + DIRECT_LABEL_TOP);
    expect(topOf({ legend: { position: 'bottom' } })).toBe(12 + DIRECT_LABEL_TOP);
    expect(topOf({ legend: { position: 'right' } })).toBe(12 + DIRECT_LABEL_TOP);
  });

  it('draws its axis labels down to 8 px from the foot, not 80', () => {
    const labels = labelsOf(renderToSvg(optionFor(spec('bar'))));
    const category = labels.find((label) => label.text === 'paid');
    // The headless canvas is 400 px high; ECharts' default grid put the
    // category labels near 330.
    expect(category?.y ?? 0).toBeGreaterThan(370);
  });
});
