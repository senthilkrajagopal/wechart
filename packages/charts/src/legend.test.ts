/**
 * T045 / AC-038: WHEN a chart has two or more series, THE SYSTEM SHALL show a
 * legend; with one series it SHALL show none (direction.md rule 4).
 * Fails when: a single-series chart shows a legend box, or a multi-series
 * chart omits it.
 *
 * Both halves are load-bearing, and the second is the one usually got wrong: a
 * legend naming the single thing already named by the axis and the title is
 * clutter, and on a small tile it is clutter that costs a chart its height.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { seriesCount } from './legend';
import { optionFor } from './optionFor';
import { labelsOf, renderToSvg } from '../src/testing/renderToSvg';

const PALETTE = ['#123456', '#abcdef', '#0f9d58'];

const STATUS = 'orders.status';
const REGION = 'orders.region';
const COUNT = 'orders.count';
const AMOUNT = 'orders.amount';

const drawn = (spec: RenderSpec) => labelsOf(renderToSvg(optionFor(spec))).map((l) => l.text);

const cartesian = (measures: readonly string[]): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [STATUS], y: [...measures] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 10, [AMOUNT]: 100 },
    { [STATUS]: 'refunded', [COUNT]: 20, [AMOUNT]: 200 },
  ],
  palette: PALETTE,
});

describe('how many series a chart has', () => {
  it('counts one per measure on a cartesian chart', () => {
    expect(seriesCount(cartesian([COUNT]))).toBe(1);
    expect(seriesCount(cartesian([COUNT, AMOUNT]))).toBe(2);
  });

  it('counts the members of a splitting dimension', () => {
    expect(
      seriesCount({
        ...cartesian([COUNT]),
        encoding: { x: [STATUS], y: [COUNT], color: [REGION] },
        rows: [
          { [STATUS]: 'paid', [REGION]: 'east', [COUNT]: 1 },
          { [STATUS]: 'paid', [REGION]: 'west', [COUNT]: 2 },
        ],
      }),
    ).toBe(2);
  });

  it('counts the slices of a pie, because those are what carry the colours', () => {
    // A pie is one ECharts series but several coloured things, and it is the
    // coloured things a legend names.
    expect(seriesCount({ ...cartesian([COUNT]), chartType: 'pie' })).toBe(2);
  });

  it('counts nothing for a chart whose colour is a scale rather than a set', () => {
    // A heatmap's colour says how much, not which. Naming its values in a
    // legend would be naming every cell.
    expect(seriesCount({ ...cartesian([COUNT]), chartType: 'heatmap' })).toBe(0);
  });

  it('counts nothing for the types that have no marks to name', () => {
    for (const chartType of ['kpi', 'table', 'pivot'] as const) {
      expect(seriesCount({ ...cartesian([COUNT]), chartType })).toBe(0);
    }
  });
});

describe('the legend itself', () => {
  it('appears, naming each series, when there are two', () => {
    const labels = drawn(cartesian([COUNT, AMOUNT]));

    expect(labels).toContain(COUNT);
    expect(labels).toContain(AMOUNT);
  });

  it('does not appear when there is only one', () => {
    const labels = drawn(cartesian([COUNT]));

    // The axis and the title already say what the one series is.
    expect(labels).not.toContain(COUNT);
  });

  it('appears on a pie with two or more slices', () => {
    const labels = drawn({ ...cartesian([COUNT]), chartType: 'pie' });

    expect(labels).toContain('paid');
    expect(labels).toContain('refunded');
  });

  it('does not appear on a pie with a single slice', () => {
    const labels = drawn({
      ...cartesian([COUNT]),
      chartType: 'pie',
      rows: [{ [STATUS]: 'paid', [COUNT]: 10 }],
    });

    expect(labels).not.toContain('paid');
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it — legends, tooltips, table headers, well
 * pills, marking chips and the "Why this chart?" trace — and never by its
 * internal name.
 * `Fails when: a legend, table header, pill, chip or trace shows a name such
 * as "orders.count".`
 */
describe('a legend of measures names them by their titles (AC-220)', () => {
  const titles = { [COUNT]: 'Orders Count', [AMOUNT]: 'Orders Amount' };

  it('writes each measure series by its title, never its name', () => {
    const labels = drawn({ ...cartesian([COUNT, AMOUNT]), titles });
    expect(labels).toContain('Orders Count');
    expect(labels).toContain('Orders Amount');
    expect(labels).not.toContain(COUNT);
    expect(labels).not.toContain(AMOUNT);
  });

  it('names them in the tooltip too', () => {
    const option = optionFor({ ...cartesian([COUNT, AMOUNT]), titles }) as {
      tooltip?: { formatter?: (params: unknown) => string };
    };
    const said =
      option.tooltip?.formatter?.([
        { name: 'paid', seriesName: COUNT, seriesIndex: 0, value: 10 },
        { name: 'paid', seriesName: AMOUNT, seriesIndex: 1, value: 100 },
      ]) ?? '';
    expect(said).toContain('Orders Count');
    expect(said).toContain('Orders Amount');
    expect(said).not.toContain(COUNT);
  });
});
