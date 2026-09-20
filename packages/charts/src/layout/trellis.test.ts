/**
 * T043 / AC-037 and AC-045: the trellis.
 *
 * AC-045: WHEN a trellis chart is rendered, THE SYSTEM SHALL lay panels out in
 * a grid with a shared scale by default and a per-panel title, and cap the
 * panels at 20 (direction.md rule 6).
 *
 * The shared scale is the part worth testing hardest. Every panel *looks*
 * right under an independent scale — each one fills its own box — and that is
 * exactly the failure: two panels whose bars are the same height while their
 * values differ tenfold. So the test compares heights across panels rather
 * than asking the option what it was set to.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { trellisOption, MAX_PANELS } from './trellis';
import { labelsOf, marksOf, renderToSvg } from '../testing/renderToSvg';

const BLUE = '#123456';
const PALETTE = [BLUE];

const REGION = 'orders.region';
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const draw = (spec: RenderSpec) => renderToSvg(trellisOption(spec));

/** Two regions an order of magnitude apart, so a shared scale is visible. */
const spec: RenderSpec = {
  chartType: 'trellis',
  encoding: { facet: [REGION], x: [STATUS], y: [COUNT] },
  rows: [
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 100 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 80 },
    { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 10 },
    { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
  ],
  palette: PALETTE,
};

const heightsByPanel = (svg: string) => {
  // Panels are laid out left to right, so the x of a bar says which one it is
  // in. Two panels here, split at the midpoint of the canvas.
  const marks = marksOf(svg, PALETTE);
  const midpoint = 640 / 2;
  const height = (box: (typeof marks)[0]) => box.bottom - box.top;
  return {
    left: marks.filter((box) => box.left < midpoint).map(height),
    right: marks.filter((box) => box.left >= midpoint).map(height),
  };
};

describe('panels', () => {
  it('draws one per member of the facet', () => {
    const titles = labelsOf(draw(spec)).filter((label) => ['east', 'west'].includes(label.text));

    expect(titles).toHaveLength(2);
  });

  it('gives every panel its own title', () => {
    const titles = labelsOf(draw(spec)).map((label) => label.text);

    // Without a title a reader cannot tell which panel is which, which is the
    // whole point of splitting the chart up.
    expect(titles).toContain('east');
    expect(titles).toContain('west');
  });

  it('lays them out side by side rather than on top of each other', () => {
    const { left, right } = heightsByPanel(draw(spec));

    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it('draws every category inside each panel', () => {
    const { left, right } = heightsByPanel(draw(spec));

    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
  });
});

describe('the shared scale', () => {
  it('makes a panel of small values look small', () => {
    const { left, right } = heightsByPanel(draw(spec));

    // east peaks at 100, west at 10. On one scale west's tallest bar is about
    // a tenth of east's; on independent scales both would fill their panel and
    // the chart would say the two regions were alike.
    const tallestLeft = Math.max(...left);
    const tallestRight = Math.max(...right);
    expect(tallestRight).toBeLessThan(tallestLeft / 5);
  });

  it('can be turned off, and then each panel fills its own box', () => {
    const independent: RenderSpec = {
      ...spec,
      options: { sharedScale: false },
    };
    const { left, right } = heightsByPanel(draw(independent));

    // direction.md: synchronised by default, each settable to independent.
    const tallestLeft = Math.max(...left);
    const tallestRight = Math.max(...right);
    expect(tallestRight).toBeGreaterThan(tallestLeft * 0.8);
  });
});

describe('the cap', () => {
  const many: RenderSpec = {
    chartType: 'trellis',
    encoding: { facet: [REGION], x: [STATUS], y: [COUNT] },
    rows: Array.from({ length: 25 }, (_, index) => ({
      [REGION]: `region ${String(index)}`,
      [STATUS]: 'paid',
      [COUNT]: index + 1,
    })),
    palette: PALETTE,
  };

  it('stops at twenty panels however many members there are', () => {
    const titles = labelsOf(draw(many)).filter((label) => label.text.startsWith('region '));

    // direction.md rule 6. Past this a panel is too small to read and the
    // chart stops being a chart.
    expect(MAX_PANELS).toBe(20);
    expect(titles).toHaveLength(MAX_PANELS);
  });

  it('keeps the first twenty, in the order the rows arrived', () => {
    const titles = labelsOf(draw(many))
      .filter((label) => label.text.startsWith('region '))
      .map((label) => label.text);

    expect(titles).toContain('region 0');
    expect(titles).not.toContain('region 20');
  });
});
