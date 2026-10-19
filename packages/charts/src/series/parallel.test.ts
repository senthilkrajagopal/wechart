import { formatterFor, type RenderSpec } from '@wechart/core';
import { format } from 'echarts/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { CHART_FONT } from '../themed';
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
    // Its member too, which a click on it marks (T983, AC-599).
    expect(series!.data[0]).toEqual({
      name: 'Product 1',
      value: [1000, 0.1, 50],
      marks: [{ member: 'products.name', value: 'Product 1' }],
    });
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

  /**
   * COLOUR-1 (AC-598, AC-039; the user, on the Sales dashboard's "Category
   * profile": every line was drawn in the neutral). Without Colour, and no
   * more lines than the palette has slots, each line is its member's colour:
   * the dashboard's for that member, or standing alone its place in the
   * palette. Past the slots, every line is the palette's first colour, never
   * the neutral. The lines' names stay in text ink.
   */
  describe('without Colour, each line in its member’s colour (COLOUR-1)', () => {
    type Line = { name: string; lineStyle?: { color?: string } };
    const linesIn = (option: Record<string, unknown>) =>
      seriesOf(option).flatMap((one) =>
        (one.data as Line[]).map((line) => line.lineStyle?.color ?? one.lineStyle.color),
      );
    const PALETTE = ['#aa0000', '#00bb00', '#0000cc', '#cc00cc'];

    it('draws each line in its place in the palette, standing alone', () => {
      const option = parallelOption(spec(rowsOf(3), { palette: PALETTE }));
      expect(linesIn(option)).toEqual(PALETTE.slice(0, 3));
      // As drawn: three polylines, each stroked in its own colour.
      const svg = renderToSvg(optionFor(spec(rowsOf(3), { palette: PALETTE })));
      const polylines = svg.match(/<polyline [^>]*>/g) ?? [];
      const strokes = polylines.map((line) => /stroke="([^"]+)"/.exec(line)?.[1]);
      expect(strokes).toEqual(PALETTE.slice(0, 3));
      // The series' width kept under each line's own colour.
      for (const line of polylines) expect(line).toContain('stroke-width="1.5"');
    });

    it('draws a line in the colour the dashboard gives its member', () => {
      const option = parallelOption(
        spec(rowsOf(3), {
          palette: PALETTE,
          colours: { 'Product 1': '#cc00cc', 'Product 2': '#0000cc', 'Product 3': '#aa0000' },
        }),
      );
      expect(linesIn(option)).toEqual(['#cc00cc', '#0000cc', '#aa0000']);
    });

    it('draws every line in the palette’s first colour past its slots, never the neutral', () => {
      const many = spec(rowsOf(PALETTE.length + 1), {
        palette: PALETTE,
        // The first measure's colour on the dashboard, which they once took.
        colours: { 'products.revenue': '#b3b1ab' },
      });
      expect(new Set(linesIn(parallelOption(many)))).toEqual(new Set([PALETTE[0]]));
    });

    it('names the lines in text ink, not their colours', () => {
      const option = parallelOption(spec(rowsOf(3), { palette: PALETTE }));
      const fills = (option['graphic'] as { style: { fill: string } }[]).map(
        (one) => one.style.fill,
      );
      expect(fills).toHaveLength(3);
      for (const fill of fills) expect(PALETTE).not.toContain(fill);
    });
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

/**
 * AC-598's titles, on a dashboard tile (the coordinator's Sales dashboard: on
 * a 4-column tile the first axis's title read "ales lines Revenue", cut at
 * the tile's left edge, and every title was the member's full title). Each
 * axis is titled by its short title where the chart is one cube's, as every
 * other chart's labels are (`labelOf`, AC-220), and every title, maximum and
 * minimum is drawn inside the tile, a title too long for its axis's room cut
 * short with "…".
 */
describe('parallel coordinates’ titles on a tile (AC-598)', () => {
  const SALES = [
    'sales_lines.revenue',
    'sales_lines.units_sold',
    'sales_lines.avg_order_value',
    'sales_lines.discount_rate',
  ];
  const sales = (titles: Record<string, string>, short?: Record<string, string>): RenderSpec => ({
    chartType: 'parallel',
    encoding: { x: ['sales_lines.category'], y: SALES },
    rows: ['Beverages', 'Condiments', 'Confections', 'Dairy Products'].map((category, at) => ({
      'sales_lines.category': category,
      'sales_lines.revenue': String(120000 + at * 31000),
      'sales_lines.units_sold': String(5000 + at * 700),
      'sales_lines.avg_order_value': String(400 + at * 17),
      'sales_lines.discount_rate': String(0.04 + at / 100),
    })),
    formats: { 'sales_lines.revenue': 'currency', 'sales_lines.discount_rate': 'percent' },
    titles: { 'sales_lines.category': 'Sales lines Category', ...titles },
    ...(short === undefined ? {} : { shortTitles: short }),
  });
  const FULL = {
    'sales_lines.revenue': 'Sales lines Revenue',
    'sales_lines.units_sold': 'Sales lines Units Sold',
    'sales_lines.avg_order_value': 'Sales lines Avg Order Value',
    'sales_lines.discount_rate': 'Sales lines Discount Rate',
  };
  const SHORT = {
    'sales_lines.revenue': 'Revenue',
    'sales_lines.units_sold': 'Units Sold',
    'sales_lines.avg_order_value': 'Avg Order Value',
    'sales_lines.discount_rate': 'Discount Rate',
  };
  // A 4-column tile on a 12-column dashboard at 1,280 px, less its padding.
  const TILE = { width: 380, height: 260 };

  /** Every text drawn, with its box across the canvas, as the SSR string places it. */
  const textsOf = (svg: string) =>
    [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([, attributes = '', text = '']) => {
      const x = Number(/translate\(([-\d.]+) /.exec(attributes)?.[1] ?? 'NaN');
      const anchor = /text-anchor="(\w+)"/.exec(attributes)?.[1] ?? 'start';
      const width = format.getTextRect(text, `12px ${CHART_FONT}`).width;
      const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
      return { text, left, right: left + width };
    });

  it('titles each axis by its short title where the chart is one cube’s', () => {
    // On a 6-column tile, where every short title has its room beside the
    // lines' names (on a 4-column one, "Avg Order Value" is cut short).
    const names = axesOf(parallelOption(sales(FULL, SHORT), { width: 580, height: 260 })).map(
      (axis) => axis.name.split('\n')[0],
    );
    expect(names).toEqual(['Revenue', 'Units Sold', 'Avg Order Value', 'Discount Rate']);
  });

  it('draws every title, maximum and minimum inside the tile', () => {
    const texts = textsOf(renderToSvg(optionFor(sales(FULL, SHORT), TILE), TILE));
    expect(texts.map((one) => one.text)).toEqual(
      expect.arrayContaining(['Revenue', 'Discount Rate']),
    );
    for (const one of texts) {
      expect(one.left, `${one.text} starts inside the tile`).toBeGreaterThanOrEqual(0);
      expect(one.right, `${one.text} ends inside the tile`).toBeLessThanOrEqual(TILE.width);
    }
  });

  /** A text's box, down the canvas: its centre as the SSR string places it. */
  const placedText = (svg: string, text: string) => {
    const found = new RegExp(`<text ([^>]*)>${text.replace(/[$.()/]/g, '\\$&')}</text>`).exec(svg);
    if (found === null) return undefined;
    const attributes = found[1] ?? '';
    const [, x = 'NaN', y = 'NaN'] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attributes) ?? [];
    const dy = Number(/ y="([-\d.]+)"/.exec(attributes)?.[1] ?? 0);
    const anchor = /text-anchor="(\w+)"/.exec(attributes)?.[1] ?? 'start';
    const width = format.getTextRect(text, `12px ${CHART_FONT}`).width;
    const left =
      anchor === 'middle'
        ? Number(x) - width / 2
        : anchor === 'end'
          ? Number(x) - width
          : Number(x);
    return { left, right: left + width, y: Number(y) + dy };
  };
  /** Each line's last point as drawn: a polyline in the SSR string. */
  const lineEndsOf = (svg: string) =>
    [...svg.matchAll(/<polyline points="([^"]+)"[^>]*stroke-width="1.5"/g)].map(
      ([, points = '']) => {
        const numbers = points
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        return { x: numbers[numbers.length - 2]!, y: numbers[numbers.length - 1]! };
      },
    );

  /**
   * The user, 2026-10-18 ("Label line ends (Recommended)"; AC-598 amended):
   * every line was the same grey, with no legend or label, so only the
   * tooltip said which category a line was. Where 10 or fewer lines are
   * drawn, each is named at its right end, beside the last axis, inside the
   * tile, and no two names overlap; past 10, none is (the tooltip and the
   * table view name them).
   */
  it('names each of 10 or fewer lines at its right end, beside the last axis, inside the tile', () => {
    const svg = renderToSvg(optionFor(sales(FULL, SHORT), TILE), TILE);
    const ends = lineEndsOf(svg);
    expect(ends).toHaveLength(4);
    const lastAxis = Math.max(...ends.map((end) => end.x));
    const names = ['Beverages', 'Condiments', 'Confections', 'Dairy Products'];
    const labels = names.map((name) => ({ name, at: placedText(svg, name) }));
    for (const { name, at } of labels) {
      expect(at, `${name} is named`).toBeDefined();
      expect(at!.left, `${name} is right of the last axis`).toBeGreaterThan(lastAxis);
      expect(at!.right, `${name} ends inside the tile`).toBeLessThanOrEqual(TILE.width);
    }
    // Each beside its own line's end: the lines end in the rows' order, the
    // first lowest (its values least).
    const byEnd = [...ends].sort((a, b) => b.y - a.y);
    const byLabel = [...labels].sort((a, b) => b.at!.y - a.at!.y).map((one) => one.name);
    expect(byLabel).toEqual(names);
    for (const [at, end] of byEnd.entries())
      expect(Math.abs(labels[at]!.at!.y - end.y)).toBeLessThanOrEqual(16);
  });

  it('keeps the names of lines ending together apart, and inside the tile', () => {
    const together = sales(FULL, SHORT);
    const rows = together.rows.map((row) => ({ ...row, 'sales_lines.discount_rate': '0.05' }));
    const svg = renderToSvg(optionFor({ ...together, rows }, TILE), TILE);
    const ys = ['Beverages', 'Condiments', 'Confections', 'Dairy Products']
      .map((name) => placedText(svg, name))
      .map((at) => {
        expect(at).toBeDefined();
        return at!.y;
      })
      .sort((a, b) => a - b);
    for (let at = 1; at < ys.length; at += 1)
      expect(ys[at]! - ys[at - 1]!, 'two names a line apart').toBeGreaterThanOrEqual(14);
    expect(ys[0]!).toBeGreaterThanOrEqual(6);
    expect(ys[ys.length - 1]!).toBeLessThanOrEqual(TILE.height - 6);
  });

  it('names no line where more than 10 are drawn', () => {
    const svg = renderToSvg(optionFor(spec(rowsOf(11))));
    expect(svg).not.toContain('>Product 1<');
    expect(svg).not.toContain('>Product 11<');
    const ten = renderToSvg(optionFor(spec(rowsOf(10))));
    expect(ten).toContain('>Product 10<');
  });

  it('cuts a title too long for its axis’s room short with “…”, inside the tile and clear of its neighbours', () => {
    const texts = textsOf(renderToSvg(optionFor(sales(FULL), TILE), TILE));
    const titles = texts.filter((one) => one.text.startsWith('Sales lines'));
    expect(titles).toHaveLength(4);
    expect(
      titles.some((one) => one.text.endsWith('…')),
      titles.map((one) => one.text).join(' | '),
    ).toBe(true);
    for (const one of titles) {
      expect(one.left, `${one.text} starts inside the tile`).toBeGreaterThanOrEqual(0);
      expect(one.right, `${one.text} ends inside the tile`).toBeLessThanOrEqual(TILE.width);
    }
    const across = [...titles].sort((a, b) => a.left - b.left);
    for (let at = 1; at < across.length; at += 1)
      expect(
        across[at]!.left,
        `${across[at]!.text} clears ${across[at - 1]!.text}`,
      ).toBeGreaterThan(across[at - 1]!.right);
  });
});
