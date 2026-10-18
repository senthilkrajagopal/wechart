import { formatterFor, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { PARALLEL_LINE_CAP, parallelLinesOf, parallelOption } from './parallel';

/**
 * T982 / AC-598: THE SYSTEM SHALL draw one 1.5 px line per member across the
 * measure axes, at 0.6 opacity past 50 lines; title each axis above with its
 * maximum and label its minimum below; … and past 1,000 members draw the
 * first 1,000 by the first measure …
 * `Fails when: an axis lacks its maximum or minimum; … 1,001 lines are drawn;
 * or the cut isn't said.` (The sentences are the tile's: ParallelNotes.)
 * And AC-597's `fewer than 3 measures draw lines`.
 *
 * Rendered for real, as every renderer here is (ECharts' SSR to SVG).
 */
const AXES = ['products.revenue', 'products.margin', 'products.units'];

const rowsOf = (n: number): RenderSpec['rows'] =>
  Array.from({ length: n }, (_, at) => ({
    'products.name': `Product ${String(at + 1)}`,
    // As Cube sends them: numbers as strings.
    'products.revenue': String(1000 + at * 10),
    'products.margin': String((10 + (at % 7)) / 100),
    'products.units': String(50 + ((at * 13) % 40)),
  }));

const spec = (
  rows: RenderSpec['rows'],
  extra: Partial<RenderSpec> = {},
  axes: readonly string[] = AXES,
): RenderSpec => ({
  chartType: 'parallel',
  encoding: { x: ['products.name'], y: [...axes] },
  rows,
  formats: { 'products.revenue': 'currency', 'products.margin': 'percent' },
  titles: {
    'products.name': 'Product',
    'products.revenue': 'Revenue',
    'products.margin': 'Margin %',
    'products.units': 'Units',
  },
  ...extra,
});

type Axis = {
  dim: number;
  name: string;
  min: number;
  max: number;
  axisLabel: { formatter: (value: number) => string };
};
type Series = {
  type: string;
  name: string;
  lineStyle: { width: number; opacity: number; color?: string };
  data: { name: string; value: (number | null)[] }[];
};
const axesOf = (option: Record<string, unknown>) => option['parallelAxis'] as Axis[];
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];
const lineCount = (option: Record<string, unknown>) =>
  seriesOf(option).reduce((sum, one) => sum + one.data.length, 0);

describe('parallel coordinates’ axes (T982, AC-598)', () => {
  const option = parallelOption(spec(rowsOf(14)));

  it('gives each measure an axis of its own, in order, from its own minimum to its maximum', () => {
    const axes = axesOf(option);
    expect(axes.map((axis) => axis.dim)).toEqual([0, 1, 2]);
    expect(axes.map(({ min, max }) => [min, max])).toEqual([
      [1000, 1130],
      [0.1, 0.16],
      [50, 89],
    ]);
  });

  it('titles each axis above with its measure and its maximum, as the model writes it', () => {
    const money = formatterFor('products.revenue', { 'products.revenue': 'currency' });
    const [revenue, margin, units] = axesOf(option);
    expect(revenue!.name).toBe(`Revenue\n${money(1130)}`);
    expect(margin!.name).toBe(
      `Margin %\n${formatterFor('products.margin', { 'products.margin': 'percent' })(0.16)}`,
    );
    expect(units!.name).toBe('Units\n89');
    expect((revenue as unknown as { nameLocation: string }).nameLocation).toBe('end');
  });

  it('labels each axis with its minimum alone, below it', () => {
    const money = formatterFor('products.revenue', { 'products.revenue': 'currency' });
    const [revenue] = axesOf(option);
    expect(revenue!.axisLabel.formatter(1000)).toBe(money(1000));
    // No other tick is labelled; the maximum is in the title.
    expect(revenue!.axisLabel.formatter(1050)).toBe('');
    expect(revenue!.axisLabel.formatter(1130)).toBe('');

    // Drawn: the title over the axis's top, its maximum under that, and its
    // minimum under the axis's lower end — each centred on the axis.
    const svg = renderToSvg(optionFor(spec(rowsOf(14))));
    const placed = (text: string) => {
      const found = new RegExp(
        `<text [^>]*text-anchor="middle"[^>]*y="([-\\d.]+)" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)"[^>]*>${text.replace(/[$.]/g, '\\$&')}</text>`,
      ).exec(svg);
      return found === null
        ? undefined
        : { x: Number(found[2]), y: Number(found[3]) + Number(found[1]) };
    };
    const axis = /<path d="M([\d.]+) ([\d.]+)L[\d.]+ ([\d.]+)"/.exec(svg);
    expect(axis, 'the first axis is drawn').not.toBeNull();
    const [axisX, bottom, top] = [Number(axis![1]), Number(axis![2]), Number(axis![3])];
    const title = placed('Revenue');
    const max = placed(money(1130));
    const min = placed(money(1000));
    expect(title, 'the title is drawn').toBeDefined();
    expect(max, 'the maximum is drawn').toBeDefined();
    expect(min, 'the minimum is drawn').toBeDefined();
    expect(title!.y).toBeLessThan(max!.y);
    expect(max!.y).toBeLessThan(top);
    expect(min!.y).toBeGreaterThan(bottom);
    for (const one of [title!, max!, min!]) expect(Math.abs(one.x - axisX)).toBeLessThan(1);
  });

  it('on a Shared scale, runs every axis over all the measures’ minimum and maximum', () => {
    // Measures of one format: Shared is refused otherwise (AC-597), and drawn as Each axis.
    const mixed = parallelOption(
      spec(rowsOf(3), { options: { parallel: { scale: 'shared' } } }, [
        'products.revenue',
        'products.units',
        'products.units',
      ]),
    );
    expect(axesOf(mixed)[0]!.min).toBe(1000);
    const shared = parallelOption(
      spec(rowsOf(3), { options: { parallel: { scale: 'shared' } }, formats: {} }, [
        'products.revenue',
        'products.units',
        'products.units',
      ]),
    );
    expect(axesOf(shared).map(({ min, max }) => [min, max])).toEqual([
      [50, 1020],
      [50, 1020],
      [50, 1020],
    ]);
  });
});

describe('parallel coordinates’ lines (T982, AC-598)', () => {
  it('draws one 1.5 px line per member, its values in the axes’ order, fully opaque up to 50', () => {
    const option = parallelOption(spec(rowsOf(50)));
    expect(lineCount(option)).toBe(50);
    const [series] = seriesOf(option);
    expect(series!.type).toBe('parallel');
    expect(series!.lineStyle.width).toBe(1.5);
    expect(series!.lineStyle.opacity).toBe(1);
    expect(series!.data[0]).toEqual({ name: 'Product 1', value: [1000, 0.1, 50] });
  });

  it('draws 60 lines at 0.6, so crossings read', () => {
    const option = parallelOption(spec(rowsOf(60)));
    expect(lineCount(option)).toBe(60);
    for (const one of seriesOf(option)) expect(one.lineStyle.opacity).toBe(0.6);
    // And as drawn: 60 polylines of 1.5 px at 0.6.
    const svg = renderToSvg(optionFor(spec(rowsOf(60))));
    const lines = svg.match(/<polyline [^>]*stroke-width="1.5"[^>]*>/g) ?? [];
    expect(lines).toHaveLength(60);
    for (const line of lines) expect(line).toContain('stroke-opacity="0.6"');
  });

  it('colours each line by its Colour member, a series per member', () => {
    const rows = rowsOf(4).map((row, at) => ({
      ...row,
      'products.channel': at % 2 === 0 ? 'Web' : 'Retail',
    }));
    const option = parallelOption(
      spec(rows, {
        encoding: { x: ['products.name'], y: AXES, color: ['products.channel'] },
        palette: ['#3b6fb6', '#e0913a'],
      }),
    );
    const series = seriesOf(option);
    expect(series.map((one) => one.name)).toEqual(['Web', 'Retail']);
    expect(series.map((one) => one.data.length)).toEqual([2, 2]);
    expect(series.map((one) => one.lineStyle.color)).toEqual(['#3b6fb6', '#e0913a']);
    // The legend names the Colour members, as any split's does (AC-038).
    const drawn = optionFor(
      spec(rows, { encoding: { x: ['products.name'], y: AXES, color: ['products.channel'] } }),
    );
    expect(drawn['legend']).toMatchObject({ top: 0, left: 0, icon: 'roundRect' });
  });

  it('has no legend without Colour: its lines are one thing, not its measures', () => {
    expect(Object.keys(optionFor(spec(rowsOf(4))))).not.toContain('legend');
  });

  it('past 1,000 members, draws the first 1,000 by the first measure and says how many there are', () => {
    const many = spec(rowsOf(4210));
    const lines = parallelLinesOf(many);
    expect(PARALLEL_LINE_CAP).toBe(1000);
    expect(lines.members).toBe(4210);
    expect(lines.drawn).toBe(1000);
    const option = parallelOption(many);
    expect(lineCount(option)).toBe(1000);
    // The largest Revenue first: Product 4210 is drawn, Product 1 isn't.
    const names = seriesOf(option).flatMap((one) => one.data.map((line) => line.name));
    expect(names).toContain('Product 4210');
    expect(names).toContain('Product 3211');
    expect(names).not.toContain('Product 3210');
    // The axes run over what is drawn.
    expect(axesOf(option)[0]!.min).toBe(1000 + 3210 * 10);
  });

  it('counts lines, not members, where Colour splits a member: never more than 1,000, faded past 50 (T982 review)', () => {
    // 30 members, each in two channels: 60 lines.
    const split = (n: number) =>
      rowsOf(n).flatMap((row) => [
        { ...row, 'products.channel': 'Web' },
        { ...row, 'products.channel': 'Retail' },
      ]);
    const coloured = (rows: RenderSpec['rows']) =>
      spec(rows, { encoding: { x: ['products.name'], y: AXES, color: ['products.channel'] } });
    const sixty = parallelOption(coloured(split(30)));
    expect(lineCount(sixty)).toBe(60);
    for (const one of seriesOf(sixty)) expect(one.lineStyle.opacity).toBe(0.6);

    // 600 members in two channels: 1,200 lines, cut to the 500 members with
    // the largest first measure, all of whose lines are drawn.
    const many = coloured(split(600));
    expect(lineCount(parallelOption(many))).toBe(1000);
    expect(parallelLinesOf(many)).toMatchObject({ members: 600, drawn: 500 });
  });

  it('draws no line with fewer than 3 measures (AC-597)', () => {
    const two = spec(rowsOf(5), {}, ['products.revenue', 'products.margin']);
    const option = optionFor(two);
    expect(lineCount(option)).toBe(0);
    expect(parallelLinesOf(two).drawn).toBe(0);
    expect(renderToSvg(option)).not.toMatch(/<polyline/);
  });

  it('says a line’s member and its value on each axis in its tooltip, as the model writes them', () => {
    const tooltip = optionFor(spec(rowsOf(3)))['tooltip'] as {
      trigger: string;
      formatter: (params: unknown) => string;
    };
    expect(tooltip.trigger).toBe('item');
    const money = formatterFor('products.revenue', { 'products.revenue': 'currency' });
    const percent = formatterFor('products.margin', { 'products.margin': 'percent' });
    expect(
      tooltip.formatter({ name: 'Product 2', seriesName: 'Product', value: [1010, 0.11, 63] }),
    ).toBe(`Product 2<br/>Revenue: ${money(1010)}<br/>Margin %: ${percent(0.11)}<br/>Units: 63`);
  });

  it('is drawable through optionFor, as every chart is', () => {
    expect(() => renderToSvg(optionFor(spec(rowsOf(14))))).not.toThrow();
  });
});
