/**
 * T047 / AC-040: WHEN the user edits an axis, THE SYSTEM SHALL apply minimum,
 * maximum, logarithmic scale, gridlines, tick rotation, number format and axis
 * title to the rendered chart.
 * Fails when: a setting is accepted and the drawing does not change.
 *
 * That failing state is why each setting is checked against the drawn output
 * rather than against the option it was written into. An option that is set
 * and never read looks identical to one that works.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { hasRotatedText, labelsOf, renderToSvg } from './testing/renderToSvg';

const STATUS = 'orders.status';
const COUNT = 'orders.count';

const spec = (axes: Record<string, unknown>, rows?: Record<string, unknown>[]): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: rows ?? [
    { [STATUS]: 'paid', [COUNT]: 10 },
    { [STATUS]: 'refunded', [COUNT]: 40 },
  ],
  palette: ['#123456'],
  options: { axes },
});

const textOf = (rendered: RenderSpec) =>
  labelsOf(renderToSvg(optionFor(rendered))).map((l) => l.text);

describe('the axis title', () => {
  it('appears when one is set', () => {
    expect(textOf(spec({ y: { title: 'Orders placed' } }))).toContain('Orders placed');
  });

  it('is absent when none is set', () => {
    expect(textOf(spec({}))).not.toContain('Orders placed');
  });
});

describe('minimum and maximum', () => {
  it('fixes the bottom of the scale', () => {
    // A tick at -100 can only come from a min the chart was told to use: the
    // data never goes below 10.
    expect(textOf(spec({ y: { min: -100 } }))).toContain('-100');
  });

  it('fixes the top of the scale', () => {
    expect(textOf(spec({ y: { max: 500 } }))).toContain('500');
  });

  it('leaves the scale to the data when neither is set', () => {
    expect(textOf(spec({}))).not.toContain('500');
  });
});

describe('a logarithmic scale', () => {
  const decades = [
    { [STATUS]: 'a', [COUNT]: 1 },
    { [STATUS]: 'b', [COUNT]: 10 },
    { [STATUS]: 'c', [COUNT]: 100 },
  ];

  it('spaces the decades evenly, which a linear scale does not', () => {
    const on = renderToSvg(optionFor(spec({ y: { log: true } }, decades)));
    const marks = labelsOf(on)
      .filter((label) => ['1', '10', '100'].includes(label.text))
      .sort((a, b) => b.y - a.y);

    // 1, 10 and 100 one decade apart: on a log axis the gaps between their
    // ticks are equal, and on a linear axis 1 and 10 nearly touch.
    const [low, mid, high] = marks as [(typeof marks)[0], (typeof marks)[0], (typeof marks)[0]];
    const lower = low.y - mid.y;
    const upper = mid.y - high.y;
    expect(upper / lower).toBeCloseTo(1, 1);
  });

  it('is not what a chart does by default', () => {
    const off = renderToSvg(optionFor(spec({}, decades)));
    const marks = labelsOf(off)
      .filter((label) => ['1', '10', '100'].includes(label.text))
      .sort((a, b) => b.y - a.y);

    // Linear: if all three ticks are even present, they are not evenly spaced.
    if (marks.length === 3) {
      const [low, mid, high] = marks as [(typeof marks)[0], (typeof marks)[0], (typeof marks)[0]];
      expect((mid.y - high.y) / (low.y - mid.y)).not.toBeCloseTo(1, 1);
    }
  });
});

describe('gridlines', () => {
  const gridlineCount = (rendered: RenderSpec) =>
    (
      renderToSvg(optionFor(rendered)).match(
        /stroke-dasharray|<path[^>]*stroke="#[a-fA-F0-9]{6}"/g,
      ) ?? []
    ).length;

  it('draws more lines when they are on than when they are off', () => {
    expect(gridlineCount(spec({ y: { gridlines: true } }))).toBeGreaterThan(
      gridlineCount(spec({ y: { gridlines: false } })),
    );
  });
});

describe('tick rotation', () => {
  it('turns the labels when asked', () => {
    // ECharts writes a rotation as a matrix rather than a rotate(), so the
    // check is for non-zero off-diagonal terms.
    expect(hasRotatedText(renderToSvg(optionFor(spec({ x: { tickRotation: 90 } }))))).toBe(true);
  });

  it('leaves them upright by default', () => {
    expect(hasRotatedText(renderToSvg(optionFor(spec({}))))).toBe(false);
  });
});

describe('the number format', () => {
  const big = [
    { [STATUS]: 'a', [COUNT]: 1000 },
    { [STATUS]: 'b', [COUNT]: 4000 },
  ];

  it('groups thousands when told to write them in full', () => {
    expect(textOf(spec({ y: { numberFormat: 'full' } }, big))).toContain('4,000');
  });

  it('shortens them when told to be compact', () => {
    expect(textOf(spec({ y: { numberFormat: 'compact' } }, big))).toContain('4K');
  });

  it('writes a percentage as one', () => {
    const fractions = [
      { [STATUS]: 'a', [COUNT]: 0.25 },
      { [STATUS]: 'b', [COUNT]: 0.5 },
    ];

    expect(textOf(spec({ y: { numberFormat: 'percent' } }, fractions))).toContain('50%');
  });
});
