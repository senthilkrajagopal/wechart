/**
 * T038 / AC-037: pie and donut.
 *
 * A pie's whole claim is that each slice's **angle** is its share of the
 * total. Counting slices does not test that — a renderer that gave every
 * category an equal slice would pass a count. So the angles are read back out
 * of the drawn geometry and checked against the shares.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { NO_VALUE, pieOption, slicesOf } from './pie';
import { seriesCount } from '../legend';
import { optionFor } from '../optionFor';
import { labelsOf, renderToSvg, sectorsOf } from '../testing/renderToSvg';

const BLUE = '#123456';
const ORANGE = '#abcdef';
const GREEN = '#0f9d58';
const PALETTE = [BLUE, ORANGE, GREEN];

const STATUS = 'orders.status';
const COUNT = 'orders.count';

const draw = (spec: RenderSpec) => renderToSvg(pieOption(spec));

/** Halves and quarters, so the expected angles are exact. */
const spec: RenderSpec = {
  chartType: 'pie',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 50 },
    { [STATUS]: 'refunded', [COUNT]: 25 },
    { [STATUS]: 'pending', [COUNT]: 25 },
  ],
  palette: PALETTE,
};

describe('pie', () => {
  it('draws one slice per category', () => {
    expect(sectorsOf(draw(spec), PALETTE)).toHaveLength(3);
  });

  it('gives each slice the angle its share of the total deserves', () => {
    const sectors = sectorsOf(draw(spec), PALETTE);
    const byFill = (fill: string) => sectors.find((sector) => sector.fill === fill);

    // 50 of 100 is half the circle; 25 of 100 is a quarter. A renderer that
    // ignored the values and split the circle evenly would give three 120°
    // slices and fail all three.
    expect(byFill(BLUE)?.sweepDeg).toBeCloseTo(180, 0);
    expect(byFill(ORANGE)?.sweepDeg).toBeCloseTo(90, 0);
    expect(byFill(GREEN)?.sweepDeg).toBeCloseTo(90, 0);
  });

  it('fills the circle, leaving no hole', () => {
    // Every slice runs to the middle. This is what a donut does not do.
    for (const sector of sectorsOf(draw(spec), PALETTE)) {
      expect(sector.touchesCentre).toBe(true);
    }
  });
});

describe('donut', () => {
  const donut: RenderSpec = { ...spec, chartType: 'donut' };

  it('draws the same slices as the pie', () => {
    const sectors = sectorsOf(draw(donut), PALETTE);

    expect(sectors).toHaveLength(3);
    expect(sectors.find((sector) => sector.fill === BLUE)?.sweepDeg).toBeCloseTo(180, 0);
  });

  it('leaves a hole in the middle', () => {
    // The one thing that makes it a donut rather than a pie, read from the
    // geometry rather than from the option that asked for it.
    for (const sector of sectorsOf(draw(donut), PALETTE)) {
      expect(sector.touchesCentre).toBe(false);
    }
  });
});

describe('a slice with nothing in it', () => {
  it('is left out rather than drawn as a zero-width sliver', () => {
    const withGap: RenderSpec = {
      ...spec,
      rows: [
        { [STATUS]: 'paid', [COUNT]: 50 },
        { [STATUS]: 'refunded', [COUNT]: null },
        { [STATUS]: 'pending', [COUNT]: 50 },
      ],
    };

    // A missing measurement is not a category worth nothing, and a sliver in
    // the legend invites the reader to look for a slice that is not there.
    expect(sectorsOf(draw(withGap), PALETTE)).toHaveLength(2);
  });
});

/**
 * T232 / AC-221: WHEN a pie or donut is drawn, THE SYSTEM SHALL list every
 * slice in its legend.
 * `Fails when: a slice has no legend entry.`
 *
 * Over two dimensions a pie has a slice per pair, and slices named by their
 * category alone shared names — and legend entries — with each other.
 */
describe('a pie over two dimensions (AC-221)', () => {
  const REGION = 'orders.region';
  const twoDimensions: RenderSpec = {
    chartType: 'pie',
    encoding: { x: [STATUS], y: [COUNT], color: [REGION] },
    rows: [
      { [STATUS]: 'paid', [REGION]: 'North', [COUNT]: 10 },
      { [STATUS]: 'paid', [REGION]: 'South', [COUNT]: 20 },
      { [STATUS]: 'refunded', [REGION]: 'North', [COUNT]: 30 },
      { [STATUS]: 'refunded', [REGION]: 'South', [COUNT]: 40 },
    ],
    palette: ['#111111', '#222222', '#333333', '#444444'],
  };

  it('lists every slice in its legend, each by both its values', () => {
    const legendNames = labelsOf(renderToSvg(optionFor(twoDimensions))).map((label) => label.text);
    for (const name of ['paid · North', 'paid · South', 'refunded · North', 'refunded · South'])
      expect(legendNames).toContain(name);
    expect(seriesCount(twoDimensions)).toBe(4);
  });

  it('heads its tooltip by the slice as written, its value by the measure’s title (AC-220)', () => {
    const option = optionFor({ ...twoDimensions, titles: { [COUNT]: 'Orders Count' } }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    // The series as ECharts names one it was given no name for.
    const seriesName = 'series\u00000';
    expect(
      option.tooltip?.formatter?.({ name: 'paid · North', seriesName, seriesIndex: 0, value: 10 }),
    ).toBe('paid · North<br/>Orders Count: 10');
  });

  it('keeps each slice’s own values apart from its name, for a click or a marking to match', () => {
    const [first] = slicesOf(twoDimensions);
    expect(first).toEqual({ name: 'paid · North', value: 10, category: 'paid', split: 'North' });
  });

  it('names a slice by every grouping its rows carry, a blank one said (T232’s review)', () => {
    const TIER = 'customers.tier';
    const three: RenderSpec = {
      ...twoDimensions,
      measures: [COUNT],
      rows: [
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'gold', [COUNT]: 10 },
        { [STATUS]: 'paid', [REGION]: 'North', [TIER]: 'silver', [COUNT]: 20 },
        { [STATUS]: null, [REGION]: 'South', [TIER]: 'gold', [COUNT]: 30 },
      ],
    };
    expect(slicesOf(three).map((slice) => slice.name)).toEqual([
      'paid · North · gold',
      'paid · North · silver',
      `${NO_VALUE} · South · gold`,
    ]);
    expect(seriesCount(three)).toBe(3);
  });

  it('names Top N’s "Other" by its category alone, with no empty second value', () => {
    const folded: RenderSpec = {
      ...twoDimensions,
      rows: [...twoDimensions.rows, { [STATUS]: 'Other (3)', [COUNT]: 5 }],
    };
    expect(slicesOf(folded).at(-1)?.name).toBe('Other (3)');
  });
});

describe('a pie with a blank category (T232’s review)', () => {
  it('lists it in the legend by a name, not as an empty entry', () => {
    const blank: RenderSpec = {
      chartType: 'pie',
      encoding: { x: [STATUS], y: [COUNT] },
      rows: [
        { [STATUS]: 'paid', [COUNT]: 10 },
        { [STATUS]: null, [COUNT]: 20 },
      ],
      palette: PALETTE,
    };
    const legendNames = labelsOf(renderToSvg(optionFor(blank))).map((label) => label.text);
    expect(legendNames).toContain(NO_VALUE);
    expect(slicesOf(blank).at(-1)).toEqual({ name: NO_VALUE, value: 20, category: '' });
  });
});

/**
 * T395, AC-303: WHEN data labels are on for a pie or donut, THE SYSTEM SHALL
 * draw each label whole, moving or hiding the labels that don't fit (gap 3).
 * `Fails when: a slice's label shows a truncated value such as "$…".`
 *
 * ECharts' own default cuts an outer label to the room left to the tile's
 * edge, "$1,2..." at 260 px (research `echarts-pie-labels.md`). Read off the
 * drawn SVG: each value label whole, and all of it inside the tile, its
 * extent by its anchor and its characters at 12 px, 0.6 em apiece (generous
 * for digits).
 */
describe('data labels on a narrow tile (T395, AC-303)', () => {
  const AMOUNT = 'orders.amount';
  const values = [1_234_567, 234_567, 34_567, 4_567];
  const money = (chartType: 'pie' | 'donut'): RenderSpec => ({
    chartType,
    encoding: { x: [STATUS], y: [AMOUNT] },
    rows: values.map((value, at) => ({ [STATUS]: `s${String(at)}`, [AMOUNT]: value })),
    palette: PALETTE,
    formats: { [AMOUNT]: 'currency' },
    options: { dataLabels: true, legend: { show: false } },
  });
  const valueLabels = (svg: string) =>
    [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
      .map((match) => ({
        text: match[2] ?? '',
        x: Number(/translate\((-?[\d.]+)/.exec(match[1] ?? '')?.[1]),
        anchor: /text-anchor="(\w+)"/.exec(match[1] ?? '')?.[1] ?? 'start',
      }))
      .filter((label) => label.text.startsWith('$'));
  /** A label's left and right, by its anchor. */
  const extentOf = (label: { text: string; x: number; anchor: string }): [number, number] => {
    const w = label.text.length * 12 * 0.6;
    return label.anchor === 'end'
      ? [label.x - w, label.x]
      : label.anchor === 'middle'
        ? [label.x - w / 2, label.x + w / 2]
        : [label.x, label.x + w];
  };
  /** Each value as the currency format writes it, whole. */
  const WHOLE = ['$1,234,567', '$234,567', '$34,567', '$4,567'];

  it('draws each value whole, and inside the tile, at any width', () => {
    for (const chartType of ['pie', 'donut'] as const)
      for (const width of [200, 260, 420]) {
        const size = { width, height: 220 };
        const labels = valueLabels(renderToSvg(optionFor(money(chartType), size), size));
        const said = `${chartType} at ${String(width)} px: ${labels.map((l) => l.text).join(' | ')}`;

        expect(
          labels.every((label) => !/…|\.\.\./.test(label.text)),
          said,
        ).toBe(true);
        // Drawn wherever they fit: a pie's at every width, inside its slices
        // where need be; a donut's, whose band can't hold "$1,234,567", only
        // where a ring of half its size or more leaves them room beside it.
        expect(labels.length > 0, said).toBe(chartType === 'pie' || width >= 420);
        for (const label of labels) {
          expect(WHOLE, said).toContain(label.text);
          const [from, to] = extentOf(label);
          expect(from, `${said}: ${label.text}`).toBeGreaterThanOrEqual(0);
          expect(to, `${said}: ${label.text}`).toBeLessThanOrEqual(width);
        }
      }
  });

  /** A ring's outer radius, as drawn: the largest arc of its slices. */
  const ringOf = (svg: string) =>
    Math.max(
      ...[...svg.matchAll(/<path d="([^"]*)"[^>]*\bfill="([^"]*)"/g)]
        .filter((match) => PALETTE.includes(match[2] ?? ''))
        .flatMap((match) => [...(match[1] ?? '').matchAll(/A\s*([\d.]+)/g)])
        .map((arc) => Number(arc[1])),
    );

  it('shrinks a ring, down to half its size, to keep each label beside it and clear of it', () => {
    for (const width of [300, 340]) {
      const size = { width, height: 220 };
      const svg = renderToSvg(optionFor(money('donut'), size), size);
      const labels = valueLabels(svg);
      const ring = ringOf(svg);
      const said = `donut at ${String(width)} px, ring ${String(ring)}: ${labels.map((l) => l.text).join(' | ')}`;

      // Smaller than its own 70 % of the box's half-height (110 px), and no
      // smaller than half that.
      expect(ring, said).toBeLessThan(0.7 * 110);
      expect(ring, said).toBeGreaterThanOrEqual(0.35 * 110 - 0.5);
      expect(labels.length, said).toBeGreaterThan(0);
      for (const label of labels) {
        expect(WHOLE, said).toContain(label.text);
        const [from, to] = extentOf(label);
        expect(to <= width / 2 - ring || from >= width / 2 + ring, `${said}: ${label.text}`).toBe(
          true,
        );
      }
    }
  });

  /**
   * T395's review: with the legend at the side, which takes 120 px of the
   * pie's box, a 2-column tile (about 185 px) left the labels no room, and
   * the widest ran past the tile's edge or back over the legend. Each label
   * is whole and within the pie's own box, the legend's room left clear —
   * moved inside the slices where they have the room, else not drawn.
   */
  it('keeps each value whole and clear of a side legend, moving or hiding what doesn’t fit', () => {
    const SIDE_PX = 120;
    const drawnAt = (chartType: 'pie' | 'donut', position: 'right' | 'left', width: number) => {
      const size = { width, height: 260 };
      const spec: RenderSpec = {
        ...money(chartType),
        options: { dataLabels: true, legend: { show: true, position } },
      };
      return valueLabels(renderToSvg(optionFor(spec, size), size));
    };
    for (const chartType of ['pie', 'donut'] as const)
      for (const position of ['right', 'left'] as const)
        for (const width of [170, 185, 200, 240, 300, 420]) {
          const labels = drawnAt(chartType, position, width);
          const said = `${chartType}, legend ${position}, ${String(width)} px: ${labels.map((l) => l.text).join(' | ')}`;
          const [left, right] = position === 'right' ? [0, width - SIDE_PX] : [SIDE_PX, width];
          for (const label of labels) {
            expect(WHOLE, said).toContain(label.text);
            const [from, to] = extentOf(label);
            expect(from, `${said}: ${label.text}`).toBeGreaterThanOrEqual(left);
            expect(to, `${said}: ${label.text}`).toBeLessThanOrEqual(right);
          }
        }
    // Moved, not only hidden: a 3-column tile's pie still writes its values.
    expect(drawnAt('pie', 'right', 300).length).toBeGreaterThan(0);
  });
});
