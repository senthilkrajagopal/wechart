import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { describe, expect, it } from 'vitest';

import { isDrawable, optionFor } from '../optionFor';
import { labelsOf, marksOf, renderToSvg } from '../testing/renderToSvg';
import { themed } from '../themed';
import { BULLET_PITCH_PX, bulletOption } from './bullet';

/**
 * T954 / AC-581: THE SYSTEM SHALL draw one bullet per member on one shared
 * axis from zero, labelled "Axis starts at $0: bars are lengths": a 24 px
 * band row on a 48 px pitch, the bands in R80's three greys (`bg-subtle`,
 * `border-subtle`, `border-strong`) lightest lowest, an 8 px `text-primary`
 * value bar and a 2 × 32 px `text-primary` target; a member with no target
 * drawing its bar with "No target"; and members past the tile's height
 * scrolling with the axis fixed.
 * `Fails when: bullets have their own axes, or the axis doesn't start at
 * zero; a size or colour differs; the bands read in another lightness order;
 * a member with no target is dropped or unlabelled; or the axis scrolls away.`
 *
 * Design 23 sheet 8: Revenue against its target by Region, bands at 80, 100
 * and 120 % of each member's own target.
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const TARGET = 'orders.revenue_target';
const GREYS = [
  COLORS.light['bg-subtle'],
  COLORS.light['border-subtle'],
  COLORS.light['border-strong'],
];
const INK = COLORS.light['text-primary'];

const FOUR = [
  ['EMEA', 412000, 450000],
  ['North America', 538000, 520000],
  ['LATAM', 176000, 200000],
  ['APAC', 221000, 225000],
] as const;

const spec = (
  rows: readonly (readonly [string, number, number | null])[] = FOUR,
  target: unknown = { kind: 'measure', member: TARGET },
): RenderSpec =>
  ({
    chartType: 'bullet',
    encoding: { x: [REGION], y: [REVENUE] },
    measures: [REVENUE],
    rows: rows.map(([region, revenue, goal]) => ({
      [REGION]: region,
      [REVENUE]: String(revenue),
      [TARGET]: goal === null ? null : String(goal),
    })),
    options: target === undefined ? {} : { bullet: { target } },
    formats: { [REVENUE]: 'currency', [TARGET]: 'currency' },
    titles: { [REGION]: 'Region', [REVENUE]: 'Revenue', [TARGET]: 'Revenue target' },
  }) as unknown as RenderSpec;

/**
 * The targets as drawn: ECharts draws a `rect` symbol as a unit square,
 * `M-1 -1l2 0l0 2l-2 0Z`, scaled and placed by its transform, so its size is
 * twice the matrix's scale; and at full strength, never ECharts' 0.8.
 */
function targetsOf(svg: string) {
  return [
    ...svg.matchAll(
      /<path d="M-1 -1l2 0l0 2l-2 0Z" transform="matrix\(([-\d.]+),0,0,([-\d.]+),([-\d.]+),([-\d.]+)\)" fill="([^"]+)"([^>]*)>/g,
    ),
  ].flatMap(([, a = '0', d = '0', x = '0', y = '0', fill = '', rest = '']) =>
    fill !== INK
      ? []
      : [
          {
            left: Number(x) - Number(a),
            right: Number(x) + Number(a),
            top: Number(y) - Number(d),
            bottom: Number(y) + Number(d),
            faded: rest.includes('fill-opacity'),
          },
        ],
  );
}

const centre = (box: { top: number; bottom: number }) => (box.top + box.bottom) / 2;
const height = (box: { top: number; bottom: number }) => box.bottom - box.top;
const width = (box: { left: number; right: number }) => box.right - box.left;

describe('a bullet chart drawn (AC-581)', () => {
  it('is drawable, on one value axis from zero that says so', () => {
    expect(isDrawable('bullet')).toBe(true);
    const option = optionFor(spec());
    const axis = option['xAxis'] as Record<string, unknown>;
    expect(Array.isArray(axis)).toBe(false);
    expect(axis).toMatchObject({ type: 'value', min: 0 });
    expect(axis['name']).toBe('Axis starts at $0: bars are lengths');
  });

  it('draws each member’s bands, 24 px tall on a 48 px pitch, lightest lowest', () => {
    const svg = renderToSvg(optionFor(spec()));
    const [lowest, middle, highest] = GREYS.map((grey) =>
      marksOf(svg, [grey]).sort((a, b) => a.top - b.top),
    ) as [ReturnType<typeof marksOf>, ReturnType<typeof marksOf>, ReturnType<typeof marksOf>];
    for (const bands of [lowest, middle, highest]) {
      expect(bands).toHaveLength(4);
      for (const band of bands) expect(height(band)).toBeCloseTo(24, 0);
    }
    expect(BULLET_PITCH_PX).toBe(48);
    for (let at = 1; at < 4; at += 1)
      expect((lowest[at]?.top ?? 0) - (lowest[at - 1]?.top ?? 0)).toBeCloseTo(48, 0);
    // Left to right from zero: the lightest band lowest, the darkest highest.
    for (let at = 0; at < 4; at += 1) {
      expect(lowest[at]?.right ?? 0).toBeCloseTo(middle[at]?.left ?? -1, 0);
      expect(middle[at]?.right ?? 0).toBeCloseTo(highest[at]?.left ?? -1, 0);
    }
    // Square, as R80's bullet graph is.
    for (const band of [...lowest, ...middle, ...highest]) expect(band.corners).toEqual([]);
  });

  it('draws an 8 px value bar and a 2 × 32 px target in text-primary, centred on the bands', () => {
    const svg = renderToSvg(optionFor(spec()));
    const bars = marksOf(svg, [INK])
      .filter((box) => Math.abs(height(box) - 8) < 0.6)
      .sort((a, b) => a.top - b.top);
    const targets = targetsOf(svg).sort((a, b) => a.top - b.top);
    const bands = marksOf(svg, [GREYS[0] ?? '']).sort((a, b) => a.top - b.top);
    expect(bars).toHaveLength(4);
    expect(targets).toHaveLength(4);
    for (let at = 0; at < 4; at += 1) {
      const [band, bar, target] = [bands[at], bars[at], targets[at]];
      if (band === undefined || bar === undefined || target === undefined)
        throw new Error(`bullet ${String(at)} not drawn whole`);
      expect(centre(bar)).toBeCloseTo(centre(band), 0);
      expect(centre(target)).toBeCloseTo(centre(band), 0);
      expect(width(target)).toBeCloseTo(2, 0);
      expect(height(target)).toBeCloseTo(32, 0);
      expect(target.faded).toBe(false);
      // Every bar from the same zero.
      expect(bar.left).toBeCloseTo(band.left, 0);
    }
    // Lengths to scale: North America's bar against EMEA's.
    const [emea, america] = [bars[0], bars[1]];
    if (emea === undefined || america === undefined) throw new Error('bars not drawn');
    expect(width(america) / width(emea)).toBeCloseTo(538 / 412, 2);
  });

  it('draws a member with no target as its bar alone, labelled "No target"', () => {
    const svg = renderToSvg(optionFor(spec([...FOUR, ['Africa', 143000, null]])));
    expect(marksOf(svg, [GREYS[0] ?? ''])).toHaveLength(4);
    const bars = marksOf(svg, [INK]).filter((box) => Math.abs(height(box) - 8) < 0.6);
    expect(bars).toHaveLength(5);
    const said = labelsOf(svg).map((label) => label.text);
    expect(said).toContain('Africa');
    expect(said.some((text) => text.includes('No target'))).toBe(true);
  });

  it('draws a target value as every member’s target', () => {
    const svg = renderToSvg(optionFor(spec(FOUR, { kind: 'value', value: 300000 })));
    const targets = targetsOf(svg);
    expect(targets).toHaveLength(4);
    const lefts = new Set(targets.map((box) => Math.round(box.left)));
    expect(lefts.size).toBe(1);
  });

  it('scrolls members past the tile’s height on the member axis, the value axis fixed', () => {
    const thirty = Array.from(
      { length: 30 },
      (_, at) => [`Region ${String(at + 1)}`, 1000 * (at + 1), 1100 * (at + 1)] as const,
    );
    const canvas = { width: 520, height: 360 };
    const option = bulletOption(spec(thirty), canvas);
    // As the tile draws it: the window kept through the pipeline.
    expect(themed(optionFor(spec(thirty), canvas), 'light')['dataZoom']).toEqual(
      option['dataZoom'],
    );
    const zooms = option['dataZoom'] as Record<string, unknown>[];
    expect(zooms.length).toBeGreaterThan(0);
    const grid = option['grid'] as { height: number };
    const rows = grid.height / BULLET_PITCH_PX;
    for (const zoom of zooms) {
      // A window of the rows the tile holds, held at that size.
      expect(zoom).toMatchObject({
        yAxisIndex: [0, 1],
        filterMode: 'none',
        startValue: 0,
        endValue: rows - 1,
        minValueSpan: rows - 1,
        maxValueSpan: rows - 1,
      });
    }
    // The wheel moves it, never zooms; a drag is the marking's. Not
    // `zoomLock`, under which ECharts doesn't hear the wheel at all
    // (research/echarts-bullet.md §2).
    const inside = zooms.find((zoom) => zoom['type'] === 'inside');
    expect(inside).toMatchObject({
      moveOnMouseWheel: true,
      moveOnMouseMove: false,
      zoomOnMouseWheel: false,
    });
    expect(inside?.['zoomLock']).toBeUndefined();
    expect(zooms.find((zoom) => zoom['type'] === 'slider')).toMatchObject({ zoomLock: true });

    // The plot holds whole rows on the pitch, and the value axis reads the
    // same wherever the members are scrolled to.
    expect(grid.height % BULLET_PITCH_PX).toBe(0);
    const ticks = (svg: string) =>
      labelsOf(svg)
        // The value axis's ticks, not the members' figures.
        .filter((label) => /^\$[\d,.]+$/.test(label.text))
        .map((label) => label.text);
    const top = renderToSvg(optionFor(spec(thirty), canvas), canvas);
    const scrolled = {
      ...optionFor(spec(thirty), canvas),
      dataZoom: zooms.map((zoom) => ({ ...zoom, startValue: 20, endValue: 29 })),
    };
    const moved = renderToSvg(scrolled, canvas);
    expect(ticks(moved)).toEqual(ticks(top));
    expect(ticks(top).length).toBeGreaterThan(1);
    // Scrolled: other members shown, on the same axis.
    const names = (svg: string) => labelsOf(svg).map((label) => label.text);
    expect(names(top)).toContain('Region 1');
    expect(names(top)).not.toContain('Region 21');
    expect(names(moved)).toContain('Region 21');
    expect(names(moved)).not.toContain('Region 1');
  });
});
