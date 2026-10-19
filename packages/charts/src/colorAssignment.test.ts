/**
 * T046 / AC-039: THE SYSTEM SHALL give a member the same colour in every tile
 * of a dashboard, and keep that colour when filters change the set of visible
 * members (direction.md rule 7).
 *
 * The failure this prevents is specific and common: colour assigned by
 * position. Two tiles listing the same members in a different order paint them
 * differently, and a filter that removes one member repaints every member
 * after it — so a reader who has learnt that blue is "east" is taught
 * something false by the act of filtering.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { assignColours, OTHER_COLOUR } from './colorAssignment';
import { colouredMembersOf } from './colouredMembers';
import { optionFor } from './optionFor';
import { marksOf, renderToSvg } from './testing/renderToSvg';

const PALETTE = ['#1', '#2', '#3'];

describe('a member keeps its colour', () => {
  it('gives the same answer every time it is asked', () => {
    const colours = assignColours(PALETTE);

    expect(colours.colourFor('east')).toBe(colours.colourFor('east'));
  });

  it('is unaffected by members asked for after it', () => {
    const colours = assignColours(PALETTE);
    const east = colours.colourFor('east');
    colours.colourFor('west');
    colours.colourFor('north');

    expect(colours.colourFor('east')).toBe(east);
  });

  it('keeps its colour when the members before it disappear', () => {
    const colours = assignColours(PALETTE);
    colours.colourFor('east');
    const west = colours.colourFor('west');

    // A filter removed "east"; "west" must not slide into its slot. Assigning
    // by position is exactly what would do that.
    expect(colours.colourFor('west')).toBe(west);
    expect(west).not.toBe(colours.colourFor('east'));
  });

  it('is the same in a second tile built from the same assignment', () => {
    const colours = assignColours(PALETTE);

    // One tile asks in one order...
    const tileOne = ['east', 'west'].map((m) => colours.colourFor(m));
    // ...another in the opposite order, and the members still match.
    const tileTwo = ['west', 'east'].map((m) => colours.colourFor(m));

    expect(tileTwo).toEqual([tileOne[1], tileOne[0]]);
  });
});

describe('the palette runs out', () => {
  it('hands the neutral to members past the last slot rather than repeating', () => {
    const colours = assignColours(PALETTE);
    PALETTE.forEach((_, index) => colours.colourFor(`member ${String(index)}`));

    // direction.md caps categorical colour at the validated slots. Cycling
    // would give two members the same colour and say they were the same
    // thing; the neutral says "not separately coloured", which is true.
    expect(colours.colourFor('one too many')).toBe(OTHER_COLOUR);
  });

  it('still keeps that answer stable', () => {
    const colours = assignColours(PALETTE);
    PALETTE.forEach((_, index) => colours.colourFor(`member ${String(index)}`));

    expect(colours.colourFor('extra')).toBe(colours.colourFor('extra'));
  });
});

/**
 * T852 (AC-504, rule 7): split, a combo colours by member, so EMEA takes in
 * the combo, bars and line alike, the colour it takes in a bar chart on the
 * same dashboard.
 */
describe('a combo split across every measure (AC-504)', () => {
  const regions = ['EMEA', 'APAC', 'AMER', 'LATAM'];
  const rows = regions.map((region, at) => ({
    'orders.quarter': 'Q1',
    'orders.region': region,
    'orders.revenue': 100 * (at + 1),
    'orders.margin': 0.1 * (at + 1),
  }));
  const bar: RenderSpec = {
    chartType: 'groupedBar',
    encoding: { x: ['orders.quarter'], y: ['orders.revenue'], color: ['orders.region'] },
    rows,
  };
  const combo: RenderSpec = {
    chartType: 'combo',
    encoding: {
      x: ['orders.quarter'],
      y: ['orders.revenue', 'orders.margin'],
      color: ['orders.region'],
    },
    rows,
    options: { series: { 'orders.margin': { axis: 'right' } } },
  };

  it('claims the same members a bar chart split by Region claims, each once', () => {
    expect(colouredMembersOf(combo)).toEqual(colouredMembersOf(bar));
    expect(colouredMembersOf(combo)).toEqual(regions);
  });

  it('draws EMEA in the colour the dashboard gave it, in its bars and its line', () => {
    const assignment = assignColours();
    // An earlier tile's member first, so EMEA's colour isn't its default
    // slot (T852's review), then the bar chart, as the dashboard's tiles.
    assignment.colourFor('Online');
    colouredMembersOf(bar).forEach((member) => assignment.colourFor(member));
    const colours = assignment.assigned();
    const drawn = optionFor({ ...combo, colours })['series'] as {
      name: string;
      type: string;
      itemStyle?: { color?: string };
      lineStyle?: { color?: string };
      tooltip?: unknown;
    }[];
    const emea = drawn.filter((one) => one.name === 'EMEA' && one.tooltip === undefined);

    expect(emea.map((one) => one.type)).toEqual(['bar', 'line']);
    expect(emea.map((one) => one.itemStyle?.color)).toEqual([colours['EMEA'], colours['EMEA']]);
  });
});

describe('the renderers use it', () => {
  // One category across, two regions as the series, so each region is one bar.
  const rows = [
    { 'orders.status': 'paid', 'orders.region': 'east', 'orders.count': 10 },
    { 'orders.status': 'paid', 'orders.region': 'west', 'orders.count': 20 },
  ];

  const specWith = (over: Partial<RenderSpec>): RenderSpec => ({
    chartType: 'bar',
    encoding: { x: ['orders.status'], y: ['orders.count'], color: ['orders.region'] },
    rows,
    colours: { east: '#aa0000', west: '#00bb00' },
    ...over,
  });

  /**
   * Bars only. Two series means a legend (AC-038), and its swatches are
   * filled paths in the very same colours — so the bars are picked out by
   * being far taller than a legend icon.
   */
  const fillsOf = (spec: RenderSpec) =>
    marksOf(renderToSvg(optionFor(spec)), ['#aa0000', '#00bb00'])
      .filter((mark) => mark.bottom - mark.top > 40)
      .sort((a, b) => a.left - b.left)
      .map((bar) => bar.fill);

  it('paints a member the colour the dashboard assigned, not the palette slot', () => {
    // The palette would have given east and west these two other colours;
    // the assignment has to win.
    expect(fillsOf(specWith({ palette: ['#123456', '#abcdef'] }))).toEqual(['#aa0000', '#00bb00']);
  });

  it('keeps a member on its colour when the one before it is filtered away', () => {
    // "east" is gone, so under colour-by-position "west" would slide into the
    // first slot and change colour. It must not.
    expect(fillsOf(specWith({ rows: [rows[1] as Record<string, unknown>] }))).toEqual(['#00bb00']);
  });
});

describe('the folded tail', () => {
  it('takes the neutral rather than a palette slot', () => {
    const spec: RenderSpec = {
      chartType: 'bar',
      encoding: { x: ['orders.status'], y: ['orders.count'], color: ['orders.status'] },
      rows: [
        { 'orders.status': 'paid', 'orders.count': 50 },
        { 'orders.status': 'Other (7)', 'orders.count': 20 },
      ],
      palette: ['#aa0000', '#00bb00'],
    };

    // "Other" is not a member; giving it a member's colour would put it in
    // the same visual class as the things it hides.
    const fills = marksOf(renderToSvg(optionFor(spec)), [OTHER_COLOUR, '#aa0000', '#00bb00'])
      .filter((mark) => mark.bottom - mark.top > 40)
      .map((mark) => mark.fill);

    expect(fills).toContain(OTHER_COLOUR);
  });
});

describe('a starting assignment', () => {
  it('can be handed in, so a saved dashboard reopens with the same colours', () => {
    const colours = assignColours(PALETTE, { west: PALETTE[2] as string });

    // Reopening a dashboard must not repaint it just because the rows came
    // back in a different order.
    expect(colours.colourFor('west')).toBe(PALETTE[2]);
    expect(colours.colourFor('east')).toBe(PALETTE[0]);
  });

  it('is readable back out, so it can be saved', () => {
    const colours = assignColours(PALETTE);
    colours.colourFor('east');

    expect(colours.assigned()).toEqual({ east: PALETTE[0] });
  });
});
