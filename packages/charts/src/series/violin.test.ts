import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_PALETTE } from '../theme';
import { boxplotOption } from './boxplot';
import { densityOf, VIOLIN_WIDTH_SHARE } from './violin';

/**
 * T992 / AC-592 (violin): THE SYSTEM SHALL draw a box plot's violin in the
 * category's colour at 0.24 with a 1.5 px edge, the box narrowing to 20 px
 * inside it; … both from a fixed seed so a redraw or an image places every
 * point the same …
 * `Fails when: a size or opacity differs; …; two draws of the same data place
 * a point differently; …`
 *
 * Drawn by wechart's own custom series, its density estimated here
 * (research/echarts-violin.md: the package's is wrong outside 0–10, has no
 * edge and can't be marked; decision T992-1). Rendered for real.
 */

/** Each order's value, by region: EMEA gathered near $120, North America spread wide. */
const regional = (): RenderSpec['rows'] => [
  ...Array.from({ length: 80 }, (_, at) => ({
    'orders.region': 'EMEA',
    'orders.id': `e${String(at)}`,
    'orders.amount': String(100 + ((at * 37) % 50)),
  })),
  ...Array.from({ length: 80 }, (_, at) => ({
    'orders.region': 'North America',
    'orders.id': `n${String(at)}`,
    'orders.amount': String(50 + at * 4.5),
  })),
];

const drawn = (distribution: Record<string, unknown>, rows = regional()): RenderSpec => ({
  chartType: 'boxplot',
  encoding: { x: ['orders.region'], y: ['orders.amount'] },
  rows,
  eachPointIs: 'orders.id',
  options: { distribution },
});

type Polygon = {
  points: { x: number; y: number }[];
  fill: string;
  stroke: string;
  fillOpacity: string;
  strokeWidth: string;
};
/** Every violin as drawn: a `<polygon>` with a fill opacity, in the SSR string. */
const violinsOf = (svg: string): Polygon[] =>
  [...svg.matchAll(/<polygon ([^>]*)>/g)].map(([, attributes = '']) => {
    const attribute = (name: string) =>
      new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1] ?? '';
    const numbers = attribute('points')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const points: { x: number; y: number }[] = [];
    for (let at = 0; at + 1 < numbers.length; at += 2)
      points.push({ x: numbers[at]!, y: numbers[at + 1]! });
    return {
      points,
      fill: attribute('fill'),
      stroke: attribute('stroke'),
      fillOpacity: attribute('fill-opacity'),
      strokeWidth: attribute('stroke-width'),
    };
  });

type Box = { type: string; boxWidth?: [number, number] };
const boxOf = (option: Record<string, unknown>) =>
  (option['series'] as Box[]).find((one) => one.type === 'boxplot');

describe('a box plot’s violin (T992, AC-592)', () => {
  it('draws each category’s violin in its colour at 0.24, with a 1.5 px edge of that colour', () => {
    const violins = violinsOf(renderToSvg(optionFor(drawn({ points: 'beeswarm', violin: true }))));
    expect(violins).toHaveLength(2);
    expect(violins.map((one) => one.fill)).toEqual([DEFAULT_PALETTE[0], DEFAULT_PALETTE[1]]);
    for (const violin of violins) {
      expect(violin.fillOpacity).toBe('0.24');
      expect(violin.strokeWidth).toBe('1.5');
      expect(violin.stroke).toBe(violin.fill);
    }
  });

  it('narrows the box to 20 px inside it, and only while the violin is on', () => {
    // At most 20 px: narrower only where its band is (the next test).
    expect(boxOf(boxplotOption(drawn({ points: 'beeswarm', violin: true })))?.boxWidth).toEqual([
      0, 20,
    ]);
    const svg = renderToSvg(optionFor(drawn({ points: 'beeswarm', violin: true })));
    const widths = [
      ...svg.matchAll(/<path d="M([\d.]+) [\d.]+L([\d.]+) [^"]*"[^>]*ecmeta_series_index="0"/g),
    ].map(([, left = '', right = '']) => Math.round(Number(right) - Number(left)));
    expect(widths).toEqual([20, 20]);
    expect(boxOf(boxplotOption(drawn({ points: 'beeswarm' })))?.boxWidth).toBeUndefined();
    expect(violinsOf(renderToSvg(optionFor(drawn({ points: 'beeswarm' }))))).toEqual([]);
  });

  it('draws each violin mirrored about its category, within its band and its values', () => {
    const option = optionFor(drawn({ points: 'none', violin: true }));
    const violins = violinsOf(renderToSvg(option));
    expect(violins).toHaveLength(2);
    const centres = violins.map((one) => {
      const xs = one.points.map((point) => point.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    });
    // Two categories across the plot: their violins a band apart, each no
    // wider than its share of the band.
    const band = centres[1]! - centres[0]!;
    expect(band).toBeGreaterThan(0);
    for (const [at, violin] of violins.entries()) {
      const xs = violin.points.map((point) => point.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(band * VIOLIN_WIDTH_SHARE + 1);
      // Mirrored: every point has its twin across the centre (the SVG
      // string writes a tenth of a pixel).
      for (const point of violin.points)
        expect(
          violin.points.some(
            (twin) =>
              Math.abs(twin.y - point.y) < 0.01 &&
              Math.abs(twin.x + point.x - 2 * centres[at]!) <= 0.2,
          ),
          JSON.stringify(point),
        ).toBe(true);
    }
    // North America's values run from 50 to 405.5, EMEA's from 100 to 149:
    // its violin reaches further up and down.
    const tall = (violin: Polygon) => {
      const ys = violin.points.map((point) => point.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(tall(violins[1]!)).toBeGreaterThan(tall(violins[0]!) * 3);
  });

  /**
   * T992's review: on a narrow band (many categories on a small tile) a
   * fixed 20 px box was wider than its violin, and wider than its band. The
   * box is at most 20 px, and never wider than its violin; and it is drawn
   * open, so the violin shows through it, as sheet 11 draws it.
   */
  it('keeps the box inside its violin on a narrow band, and the violin showing through it', () => {
    const regions = Array.from({ length: 16 }, (_, at) => `Region ${String(at + 1)}`);
    const rows = regions.flatMap((region, at) =>
      Array.from({ length: 30 }, (_, order) => ({
        'orders.region': region,
        'orders.id': `${String(at)}-${String(order)}`,
        'orders.amount': String(100 + ((order * 37) % 60) + at * 5),
      })),
    );
    const tile = { width: 380, height: 260 };
    const svg = renderToSvg(optionFor(drawn({ violin: true }, rows), tile), tile);
    const violins = violinsOf(svg);
    expect(violins).toHaveLength(16);
    // Each box as drawn: its rectangle first in its path, the boxplot's series 0.
    const boxes = [
      ...svg.matchAll(/<path d="M([\d.]+) [\d.]+L([\d.]+) [^"]*"([^>]*)ecmeta_series_index="0"/g),
    ].map(([, left = '', right = '', attributes = '']) => ({
      left: Number(left),
      right: Number(right),
      fill: /fill="([^"]*)"/.exec(attributes)?.[1],
    }));
    expect(boxes).toHaveLength(16);
    for (const [at, box] of boxes.entries()) {
      const xs = violins[at]!.points.map((point) => point.x);
      expect(box.right - box.left, `box ${String(at + 1)}`).toBeLessThanOrEqual(20);
      expect(box.left, `box ${String(at + 1)} inside its violin`).toBeGreaterThanOrEqual(
        Math.min(...xs) - 0.1,
      );
      expect(box.right, `box ${String(at + 1)} inside its violin`).toBeLessThanOrEqual(
        Math.max(...xs) + 0.1,
      );
      // Clear of the next box.
      if (at + 1 < boxes.length) expect(box.right).toBeLessThan(boxes[at + 1]!.left);
      // Open, so the violin shows through.
      expect(box.fill).toBe('none');
    }
  });

  it('draws the same violin again from the same data', () => {
    const once = violinsOf(renderToSvg(optionFor(drawn({ points: 'all', violin: true }))));
    const again = violinsOf(renderToSvg(optionFor(drawn({ points: 'all', violin: true }))));
    expect(again).toEqual(once);
  });

  it('draws no violin for a category of one value, or of one value repeated', () => {
    const rows = [
      ...regional().slice(0, 80),
      { 'orders.region': 'APAC', 'orders.id': 'a1', 'orders.amount': '120' },
      { 'orders.region': 'LATAM', 'orders.id': 'l1', 'orders.amount': '90' },
      { 'orders.region': 'LATAM', 'orders.id': 'l2', 'orders.amount': '90' },
    ];
    const violins = violinsOf(renderToSvg(optionFor(drawn({ violin: true }, rows))));
    expect(violins.map((one) => one.fill)).toEqual([DEFAULT_PALETTE[0]]);
  });
});

describe('a violin’s density (T992; decision T992-1)', () => {
  it('is widest where the values gather, from the least value to the greatest', () => {
    const values = [...Array.from({ length: 40 }, (_, at) => 10 + (at % 5) / 10), 50, 60];
    const density = densityOf(values);
    expect(density[0]!.at).toBe(10);
    expect(density[density.length - 1]!.at).toBe(60);
    const near = (value: number) =>
      density.reduce((best, one) =>
        Math.abs(one.at - value) < Math.abs(best.at - value) ? one : best,
      ).width;
    const widest = Math.max(...density.map((one) => one.width));
    // Scaled to its own widest: 1 where the values gather.
    expect(widest).toBe(1);
    expect(near(10.2)).toBe(1);
    expect(near(35)).toBeLessThan(0.05);
  });

  it('has none for fewer than two values, or values all one', () => {
    expect(densityOf([])).toEqual([]);
    expect(densityOf([5])).toEqual([]);
    expect(densityOf([5, 5, 5])).toEqual([]);
  });
});
