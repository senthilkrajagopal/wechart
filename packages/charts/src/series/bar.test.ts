/**
 * T035 / AC-037: bar, horizontal bar, grouped bar and stacked bar.
 *
 * Every assertion here is made against a chart that was actually rendered, not
 * against the option that would have produced it. AC-037 fails "when a listed
 * type cannot be produced from a valid spec", and an option object is not a
 * chart: a test that only inspects `option.series[0].type` passes just as
 * happily when the option is unrenderable.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { barOption } from './bar';
import { categoryLabelsOf, marksOf, renderToSvg, type Box } from '../testing/renderToSvg';

/**
 * Deliberately NOT the default ramp. Using `DEFAULT_PALETTE[0]` and `[1]` here
 * would make every assertion pass even if `barOption` ignored `spec.palette`
 * entirely — and the palette being handed in, rather than looked up, is the
 * hinge the dashboard-wide colour rule (AC-039) hangs on.
 */
const BLUE = '#123456';
const ORANGE = '#abcdef';
const SURFACE = '#fedcba';
const PALETTE = [BLUE, ORANGE];

const STATUS = 'orders.status';
const COUNT = 'orders.count';
const TOTAL = 'orders.total';

const draw = (spec: RenderSpec) => renderToSvg(barOption(spec));

/** The leftmost mark of one colour — the first category's, in every layout. */
function leftmost(boxes: readonly Box[], fill: string): Box {
  const ofColour = boxes.filter((box) => box.fill === fill).sort((a, b) => a.left - b.left);
  const first = ofColour[0];
  if (first === undefined) throw new Error(`no ${fill} mark was rendered`);
  return first;
}

describe('bar', () => {
  const spec: RenderSpec = {
    chartType: 'bar',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: [
      { [STATUS]: 'paid', [COUNT]: 10 },
      { [STATUS]: 'refunded', [COUNT]: 30 },
      { [STATUS]: 'pending', [COUNT]: 20 },
    ],
    palette: PALETTE,
    surface: SURFACE,
  };

  it('draws one mark per category', () => {
    expect(marksOf(draw(spec), PALETTE)).toHaveLength(3);
  });

  it('puts the categories along the horizontal axis', () => {
    const labels = categoryLabelsOf(draw(spec), ['paid', 'refunded', 'pending']);

    // Presence, not order: categoryLabelsOf returns the labels in the order
    // they were asked for, so it could not report a different one.
    expect(labels).toHaveLength(3);
    // Spread across the bottom, on one line: that is what makes it vertical.
    // Order is asserted by the height test below, which pins each value to
    // its own position.
    expect(new Set(labels.map((label) => label.x)).size).toBe(3);
    expect(new Set(labels.map((label) => label.y)).size).toBe(1);
  });

  it('gives a larger value a taller bar, and stands them on a shared baseline', () => {
    const marks = marksOf(draw(spec), PALETTE).sort((a, b) => a.left - b.left);
    const [paid, refunded, pending] = marks as [Box, Box, Box];

    expect(new Set(marks.map((mark) => Math.round(mark.bottom))).size).toBe(1);

    const height = (box: Box) => box.bottom - box.top;
    expect(height(refunded)).toBeGreaterThan(height(pending));
    expect(height(pending)).toBeGreaterThan(height(paid));
  });
});

describe('hbar', () => {
  const spec: RenderSpec = {
    chartType: 'hbar',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: [
      { [STATUS]: 'paid', [COUNT]: 10 },
      { [STATUS]: 'refunded', [COUNT]: 30 },
      { [STATUS]: 'pending', [COUNT]: 20 },
    ],
    palette: PALETTE,
    surface: SURFACE,
  };

  it('draws one mark per category', () => {
    expect(marksOf(draw(spec), PALETTE)).toHaveLength(3);
  });

  it('puts the categories down the vertical axis', () => {
    const labels = categoryLabelsOf(draw(spec), ['paid', 'refunded', 'pending']);

    expect(new Set(labels.map((label) => label.y)).size).toBe(3);
    expect(new Set(labels.map((label) => label.x)).size).toBe(1);
  });

  it('gives each category the length of its own value, from a shared edge', () => {
    // ECharts draws the first category at the BOTTOM of a horizontal bar
    // chart, so the rows read upwards. Sorting by `top` descending puts them
    // back in the order the data gave.
    const marks = marksOf(draw(spec), PALETTE).sort((a, b) => b.top - a.top);
    const [paid, refunded, pending] = marks as [Box, Box, Box];

    expect(new Set(marks.map((mark) => Math.round(mark.left))).size).toBe(1);

    // Each bar is tied to its own value, not merely "three bars of unequal
    // length": a reversed or scrambled mapping fails here.
    const width = (box: Box) => box.right - box.left;
    expect(width(refunded)).toBeGreaterThan(width(pending));
    expect(width(pending)).toBeGreaterThan(width(paid));
  });
});

describe('groupedBar', () => {
  const spec: RenderSpec = {
    chartType: 'groupedBar',
    encoding: { x: [STATUS], y: [COUNT, TOTAL] },
    rows: [
      { [STATUS]: 'paid', [COUNT]: 10, [TOTAL]: 25 },
      { [STATUS]: 'refunded', [COUNT]: 30, [TOTAL]: 15 },
    ],
    palette: PALETTE,
    surface: SURFACE,
  };

  it('draws a mark per measure per category', () => {
    const marks = marksOf(draw(spec), PALETTE);

    expect(marks.filter((mark) => mark.fill === BLUE)).toHaveLength(2);
    expect(marks.filter((mark) => mark.fill === ORANGE)).toHaveLength(2);
  });

  /**
   * `bar` and `groupedBar` are the same layout, which is a decision and not an
   * oversight: grouping is a property of the data. Pinned here so the two
   * cannot quietly diverge, and so the rest of this block is not read as
   * proving something about the *type* that it only proves about the data.
   */
  it('is what a plain bar does with a second measure, and vice versa', () => {
    const asBar = marksOf(draw({ ...spec, chartType: 'bar' }), PALETTE);
    const asGrouped = marksOf(draw(spec), PALETTE);
    expect(asBar).toEqual(asGrouped);

    const oneMeasure: RenderSpec = {
      ...spec,
      chartType: 'groupedBar',
      encoding: { x: [STATUS], y: [COUNT] },
    };
    expect(marksOf(draw(oneMeasure), PALETTE)).toHaveLength(2);
  });

  it('sets the two measures side by side on a shared baseline', () => {
    const marks = marksOf(draw(spec), PALETTE);
    const count = leftmost(marks, BLUE);
    const total = leftmost(marks, ORANGE);

    // Side by side: the columns do not overlap horizontally...
    expect(count.right).toBeLessThanOrEqual(total.left);
    // ...and both stand on the axis rather than one on top of the other.
    expect(Math.round(count.bottom)).toBe(Math.round(total.bottom));
  });
});

describe('stackedBar', () => {
  const spec: RenderSpec = {
    chartType: 'stackedBar',
    encoding: { x: [STATUS], y: [COUNT, TOTAL] },
    rows: [
      { [STATUS]: 'paid', [COUNT]: 10, [TOTAL]: 25 },
      { [STATUS]: 'refunded', [COUNT]: 30, [TOTAL]: 15 },
    ],
    palette: PALETTE,
    surface: SURFACE,
  };

  it('draws a mark per measure per category', () => {
    const marks = marksOf(draw(spec), PALETTE);

    expect(marks.filter((mark) => mark.fill === BLUE)).toHaveLength(2);
    expect(marks.filter((mark) => mark.fill === ORANGE)).toHaveLength(2);
  });

  it('puts the two measures in one column, one above the other', () => {
    const marks = marksOf(draw(spec), PALETTE);
    const count = leftmost(marks, BLUE);
    const total = leftmost(marks, ORANGE);

    // One column: the same horizontal extent, unlike the grouped layout.
    expect(Math.round(count.left)).toBe(Math.round(total.left));
    expect(Math.round(count.right)).toBe(Math.round(total.right));

    // Stacked: the first measure sits on the baseline and the second rests on
    // top of it, so the upper mark's foot meets the lower mark's head —
    // separated only by the surface gap of direction.md §6, never by the
    // whole height of the lower bar, which is what a failure to stack looks
    // like.
    expect(count.bottom).toBeGreaterThan(total.bottom);
    // A literal, not MARK.gapPx: the tolerance must not be read from the
    // constant it exists to police, or raising the gap would make this pass
    // for bars that never stacked at all.
    expect(Math.abs(total.bottom - count.top)).toBeLessThanOrEqual(2);
  });
});

describe('marks follow direction.md §6', () => {
  const base = {
    encoding: { x: [STATUS], y: [COUNT, TOTAL] },
    rows: [{ [STATUS]: 'paid', [COUNT]: 10, [TOTAL]: 25 }],
    palette: PALETTE,
    surface: SURFACE,
  } as const;

  const single: RenderSpec = {
    ...base,
    chartType: 'bar',
    encoding: { x: [STATUS], y: [COUNT] },
    rows: [...base.rows],
  };

  it('rounds the data-end of a single bar, at the stated radius', () => {
    const marks = marksOf(draw(single), PALETTE);
    const bar = marks[0];

    expect(marks).toHaveLength(1);
    // Not "contains an arc somewhere": a pill, a half-pixel radius and a bar
    // rounded at the baseline all contain arcs. The radius and the corner
    // positions are the rule.
    expect(bar?.corners).toHaveLength(2);
    for (const corner of bar?.corners ?? []) {
      expect(corner.radiusPx).toBe(4);
      expect(corner.y).toBeLessThanOrEqual((bar?.top ?? 0) + 4);
    }
  });

  it('rounds the end the bar grows towards, not the baseline, when the value is negative', () => {
    const marks = marksOf(draw({ ...single, rows: [{ [STATUS]: 'paid', [COUNT]: -10 }] }), PALETTE);
    const bar = marks[0];

    // A negative bar hangs below the axis, so its data-end is its bottom.
    // Rounding the top would anchor the round end at the baseline — the rule
    // inverted — and a `contains an arc` assertion could not tell the two apart.
    expect(bar?.corners).toHaveLength(2);
    for (const corner of bar?.corners ?? []) {
      expect(corner.y).toBeGreaterThanOrEqual((bar?.bottom ?? 0) - 4);
    }
  });

  it('rounds the outer end of a horizontal bar', () => {
    const marks = marksOf(draw({ ...single, chartType: 'hbar' }), PALETTE);
    const bar = marks[0];

    for (const corner of bar?.corners ?? []) {
      expect(corner.x).toBeGreaterThanOrEqual((bar?.right ?? 0) - 4);
    }
  });

  it('rounds only the outermost segment of a stack', () => {
    const marks = marksOf(draw({ ...base, chartType: 'stackedBar' }), PALETTE);

    expect(marks.find((mark) => mark.fill === ORANGE)?.corners).toHaveLength(2);
    expect(marks.find((mark) => mark.fill === BLUE)?.corners).toHaveLength(0);
  });

  it('separates touching marks by the full gap width, in the surface colour', () => {
    const marks = marksOf(draw({ ...base, chartType: 'stackedBar' }), PALETTE);

    expect(draw({ ...base, chartType: 'stackedBar' })).toContain(`stroke="${SURFACE}"`);
    // An SVG stroke straddles the boundary two stacked marks share, so both
    // strokes land in the same band. Half the gap width on each would paint a
    // 1 px band, not 2. Asserting the colour alone cannot see that: zrender
    // emits `stroke` whatever the width, and omits `stroke-width` when it is 1.
    for (const mark of marks) expect(mark.strokeWidthPx).toBe(2);
  });
});
