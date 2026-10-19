import { formatterFor, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_PALETTE } from '../theme';
import { boxplotOption, distributionNotes } from './boxplot';

/**
 * T399 (AC-306): WHEN the user draws a box plot of a numeric value by a
 * category, THE SYSTEM SHALL draw one box per category with its median and
 * quartiles, computed by linear interpolation (type 7). Its whiskers follow a
 * chart option: by default Tukey's, ending at the most extreme value within
 * 1.5 × IQR of the box, with values beyond drawn as dots; or else the minimum
 * and maximum.
 */
const rowsOf = (values: Record<string, (number | string | null)[]>) =>
  Object.entries(values).flatMap(([category, list]) =>
    list.map((value) => ({ 'orders.status': category, 'orders.amount': value })),
  );

const spec = (options?: Record<string, unknown>): RenderSpec => ({
  chartType: 'boxplot',
  encoding: { x: ['orders.status'], y: ['orders.amount'] },
  // As Cube sends them: numbers as strings.
  rows: rowsOf({
    paid: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '100'],
    refunded: ['5', '6', '7', null],
  }),
  palette: ['#3b6fb6', '#e0913a'],
  ...(options === undefined ? {} : { options }),
});

type Series = { type: string; data: unknown[] };

describe('a box plot’s boxes (T399, AC-306)', () => {
  it('draws one box per category from its low whisker, quartiles, median and high whisker', () => {
    const option = boxplotOption(spec());
    expect((option['xAxis'] as { data: string[] }).data).toEqual(['paid', 'refunded']);
    const [boxes] = option['series'] as Series[];
    expect(boxes!.type).toBe('boxplot');
    expect(boxes!.data).toEqual([
      [1, 3.25, 5.5, 7.75, 9],
      [5, 5.5, 6, 6.5, 7],
    ]);
  });

  it('draws the values beyond Tukey’s whiskers as dots in their category', () => {
    const [, dots] = boxplotOption(spec())['series'] as Series[];
    expect(dots!.type).toBe('scatter');
    expect(dots!.data).toEqual([['paid', 100]]);
  });

  it('runs the whiskers to the minimum and maximum, with no dots, under the min/max option', () => {
    const series = boxplotOption(spec({ whiskers: 'minmax' }))['series'] as Series[];
    expect(series[0]!.data[0]).toEqual([1, 3.25, 5.5, 7.75, 100]);
    expect(series[1]!.data).toEqual([]);
  });

  it('leaves out a category with no values rather than drawing an empty box', () => {
    const option = boxplotOption({
      ...spec(),
      rows: [...spec().rows, { 'orders.status': 'lost', 'orders.amount': null }],
    });
    expect((option['xAxis'] as { data: string[] }).data).toEqual(['paid', 'refunded']);
  });

  it('is drawn: the SVG holds a box for each category', () => {
    const svg = renderToSvg(optionFor(spec()));
    // Each box is one path: its body, whiskers, caps and median (research §1).
    const boxes = svg.match(/<path[^>]*d="M[^"]*Z[^"]*"/g) ?? [];
    expect(boxes.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Rule 88 (direction.md §7e): outliers as dots in the category's colour at
 * 60 %, and a tooltip listing n and the five statistics. T399's review: the
 * colour held only where a palette was passed, which the app never does, and
 * the box's tooltip showed its lower whisker as its value.
 */
describe('a box plot’s colour and tooltip (T399, rule 88)', () => {
  const unpainted = (options?: Record<string, unknown>): RenderSpec =>
    Object.fromEntries(
      Object.entries(spec(options)).filter(([key]) => key !== 'palette'),
    ) as unknown as RenderSpec;
  type Styled = { itemStyle?: { borderColor?: string; color?: string; opacity?: number } };

  it('draws the box and its dots in the chart’s first colour, the dots at 60 %, with no palette given', () => {
    const [boxes, dots] = boxplotOption(unpainted())['series'] as Styled[];
    expect(boxes!.itemStyle?.borderColor).toBe(DEFAULT_PALETTE[0]);
    expect(dots!.itemStyle).toEqual({ color: DEFAULT_PALETTE[0], opacity: 0.6 });
  });

  it('is drawn with a dot per outlier at 60 %, and none under the min/max option', () => {
    const dots = (svg: string) => svg.match(/<path[^>]*opacity="0\.6"[^>]*>/g) ?? [];
    expect(dots(renderToSvg(optionFor(unpainted())))).toHaveLength(1);
    expect(dots(renderToSvg(optionFor(unpainted({ whiskers: 'minmax' }))))).toHaveLength(0);
  });

  it('takes a colour chosen for the measure in Customize', () => {
    const chosen = unpainted({ series: { 'orders.amount': { colour: '#aa0000' } } });
    const [boxes, dots] = boxplotOption(chosen)['series'] as Styled[];
    expect(boxes!.itemStyle?.borderColor).toBe('#aa0000');
    expect(dots!.itemStyle?.color).toBe('#aa0000');
  });

  const titled = (options?: Record<string, unknown>): RenderSpec => ({
    ...spec(options),
    titles: { 'orders.amount': 'Amount', 'orders.status': 'Status' },
    formats: { 'orders.amount': 'currency' },
  });
  const tooltipOf = (rendered: RenderSpec) =>
    (optionFor(rendered)['tooltip'] as { formatter: (params: unknown) => string }).formatter;
  const lines = (html: string) => html.split('<br/>');
  const money = formatterFor('orders.amount', { 'orders.amount': 'currency' });

  it('lists the category, n, the minimum, quartiles, median and maximum, and the whisker ends', () => {
    // ECharts puts the category's index before the five values it was given.
    const text = tooltipOf(titled())({
      seriesType: 'boxplot',
      seriesIndex: 0,
      dataIndex: 0,
      name: 'paid',
      value: [0, 1, 3.25, 5.5, 7.75, 9],
    });
    expect(lines(text)).toEqual([
      'paid',
      'n: 10',
      `Minimum: ${money(1)}`,
      `Q1: ${money(3.25)}`,
      `Median: ${money(5.5)}`,
      `Q3: ${money(7.75)}`,
      `Maximum: ${money(100)}`,
      `Whiskers: ${money(1)} – ${money(9)}`,
    ]);
  });

  it('leaves the whisker ends out when they are the minimum and maximum', () => {
    const text = tooltipOf(titled({ whiskers: 'minmax' }))({
      seriesType: 'boxplot',
      seriesIndex: 0,
      dataIndex: 1,
      name: 'refunded',
      value: [1, 5, 5.5, 6, 6.5, 7],
    });
    expect(lines(text)).toEqual([
      'refunded',
      'n: 3',
      `Minimum: ${money(5)}`,
      `Q1: ${money(5.5)}`,
      `Median: ${money(6)}`,
      `Q3: ${money(6.5)}`,
      `Maximum: ${money(7)}`,
    ]);
  });

  it('names an outlier by its category and the measure’s title, never the member id', () => {
    const text = tooltipOf(titled())({
      seriesType: 'scatter',
      seriesIndex: 1,
      dataIndex: 0,
      name: '',
      value: ['paid', 100],
    });
    expect(lines(text)).toEqual(['paid', `Amount: ${money(100)}, beyond the whiskers`]);
    expect(text).not.toContain('orders.amount');
  });

  it('says “beyond the whiskers” of a point only when it is (T991: All and Beeswarm draw every point)', () => {
    const tooltip = tooltipOf({
      ...titled({ distribution: { points: 'all' } }),
      eachPointIs: 'orders.id',
    });
    const point = (value: number) =>
      lines(
        tooltip({
          seriesType: 'scatter',
          seriesIndex: 1,
          dataIndex: 0,
          name: '',
          value: ['paid', value],
        }),
      );
    expect(point(5)).toEqual(['paid', `Amount: ${money(5)}`]);
    expect(point(100)).toEqual(['paid', `Amount: ${money(100)}, beyond the whiskers`]);
  });
});

/**
 * T991 / AC-592 (points), AC-306: a box plot's Points as None, All or
 * Beeswarm, "its points 8 px at 0.6; Beeswarm placing points side by side
 * without overlap and All jittering them, both from a fixed seed so a redraw
 * or an image places every point the same; and WHERE a category's points
 * can't be placed side by side, draw them as All, saying "Too many points to
 * place side by side in ‹member›: drawn as All, jittered."".
 * `Fails when: a size or opacity differs; two Beeswarm points overlap; two
 * draws of the same data place a point differently; or a fallback to All
 * isn't said.` And AC-306: Outliers draws as before R81.
 *
 * Rendered for real, and every drawn point measured against every other.
 */
describe('a box plot’s points (T991, AC-592, AC-306)', () => {
  /** Each order's value, by region: EMEA gathered near $120, North America spread wide. */
  const regional = (apac = 0): RenderSpec['rows'] => [
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
    ...Array.from({ length: apac }, (_, at) => ({
      'orders.region': 'APAC',
      'orders.id': `a${String(at)}`,
      'orders.amount': String(150 + ((at * 13) % 150)),
    })),
  ];
  const drawn = (points: string, rows = regional(), eachPointIs: string | null = 'orders.id') =>
    ({
      chartType: 'boxplot',
      encoding: { x: ['orders.region'], y: ['orders.amount'] },
      rows,
      ...(eachPointIs === null ? {} : { eachPointIs }),
      options: { distribution: { points } },
    }) as RenderSpec;

  type Dot = { x: number; y: number; size: number; opacity: string };
  /** Every point as drawn: a circle of radius 1 scaled to its size, at its centre. */
  const dotsOf = (svg: string): Dot[] =>
    [
      ...svg.matchAll(
        /<path d="M1 0A1 1 0 1 1 1 -0\.1A1 1 0 0 1 1 0" transform="matrix\(([\d.]+),0,0,[\d.]+,([-\d.]+),([-\d.]+)\)"[^>]*fill-opacity="([\d.]+)"/g,
      ),
    ].map((found) => ({
      size: Number(found[1]) * 2,
      x: Number(found[2]),
      y: Number(found[3]),
      opacity: found[4] ?? '',
    }));
  const closest = (dots: readonly Dot[]) => {
    let least = Number.POSITIVE_INFINITY;
    for (let a = 0; a < dots.length; a += 1)
      for (let b = a + 1; b < dots.length; b += 1)
        least = Math.min(least, Math.hypot(dots[a]!.x - dots[b]!.x, dots[a]!.y - dots[b]!.y));
    return least;
  };
  type Scatter = {
    type: string;
    data: { value: [string, number]; symbolOffset: [number, number] }[];
  };
  const scatterOf = (option: Record<string, unknown>) =>
    (option['series'] as Scatter[]).find((one) => one.type === 'scatter');

  it('None draws no dots, not even the values beyond the whiskers', () => {
    // `spec()` has an outlier at 100 in "paid".
    const none = { ...spec({ distribution: { points: 'none' } }) };
    const option = optionFor(none);
    expect(scatterOf(option)).toBeUndefined();
    expect(dotsOf(renderToSvg(option))).toEqual([]);
    // With Each point is too.
    expect(dotsOf(renderToSvg(optionFor({ ...none, eachPointIs: 'orders.id' })))).toEqual([]);
  });

  it('Outliers draws exactly as before R81, Each point is or not', () => {
    // Two ECharts instances number their SVG classes apart, so the options
    // and the drawn dots are compared, not the SVG's bytes.
    const outliers = {
      ...spec({ distribution: { points: 'outliers' } }),
      eachPointIs: 'orders.id',
    };
    const { options: _chosen, ...asBefore } = outliers;
    void _chosen;
    expect(boxplotOption(outliers)).toEqual(boxplotOption(spec()));
    expect(boxplotOption(asBefore)).toEqual(boxplotOption(spec()));
    const before = dotsOf(renderToSvg(optionFor(spec())));
    expect(dotsOf(renderToSvg(optionFor(outliers)))).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it('All and Beeswarm draw as Outliers while Each point is is empty', () => {
    const outliers = scatterOf(boxplotOption(drawn('outliers', regional(), null)));
    expect(scatterOf(boxplotOption(drawn('beeswarm', regional(), null)))).toEqual(outliers);
    expect(scatterOf(boxplotOption(drawn('all', regional(), null)))).toEqual(outliers);
  });

  it('All draws every point, 8 px at 0.6, jittered within its category from a fixed seed', () => {
    const svg = renderToSvg(optionFor(drawn('all')));
    const dots = dotsOf(svg);
    expect(dots).toHaveLength(160);
    for (const dot of dots) {
      expect(dot.size).toBe(8);
      expect(dot.opacity).toBe('0.6');
    }
    const offsets = scatterOf(boxplotOption(drawn('all')))!.data.map((one) => one.symbolOffset[0]);
    expect(new Set(offsets).size).toBeGreaterThan(100);
    // A redraw, and a draw on its own, place every point the same.
    expect(dotsOf(renderToSvg(optionFor(drawn('all'))))).toEqual(dots);
  });

  it('Beeswarm places every point side by side, no two overlapping, the same on every draw', () => {
    const svg = renderToSvg(optionFor(drawn('beeswarm')));
    const dots = dotsOf(svg);
    expect(dots).toHaveLength(160);
    for (const dot of dots) {
      expect(dot.size).toBe(8);
      expect(dot.opacity).toBe('0.6');
    }
    expect(closest(dots)).toBeGreaterThanOrEqual(8);
    expect(dotsOf(renderToSvg(optionFor(drawn('beeswarm'))))).toEqual(dots);
    // Nothing to say: every region fits.
    expect(distributionNotes(drawn('beeswarm'))).toEqual([]);
  });

  it('on a smaller tile, places side by side every region it says it does', () => {
    // Sparser, so it fits there too.
    const rows = regional().filter((_, at) => at % 4 === 0);
    const small = { width: 420, height: 260 };
    expect(distributionNotes(drawn('beeswarm', rows), small)).toEqual([]);
    const dots = dotsOf(renderToSvg(optionFor(drawn('beeswarm', rows), small), small));
    expect(dots).toHaveLength(40);
    expect(closest(dots)).toBeGreaterThanOrEqual(8);

    // Denser: whatever it doesn't say it drew as All, it placed side by side.
    const dense = drawn('beeswarm');
    const said = distributionNotes(dense, small);
    const placed = scatterOf(boxplotOption(dense, small))!.data;
    const swarmed = dotsOf(renderToSvg(optionFor(dense, small), small)).filter(
      (_, at) => !said.some((note) => note.includes(` in ${placed[at]!.value[0]}:`)),
    );
    expect(swarmed.length + said.length * 80).toBe(160);
    expect(closest(swarmed)).toBeGreaterThanOrEqual(8);
  });

  it('keeps the swarm apart where the category labels are turned (T991 review)', () => {
    // Names of about 22 characters on 3 categories: level by the band the
    // points measure, but turned by `fitCategoryLabels`, which keeps 80 px
    // for the value labels.
    const names = [
      'Enterprise customers (EU)',
      'Enterprise customers (US)',
      'Small business (APAC)',
    ];
    const rows = names.flatMap((name, category) =>
      Array.from({ length: 60 }, (_, at) => ({
        'orders.region': name,
        'orders.id': `${String(category)}-${String(at)}`,
        'orders.amount': String(100 + ((at * 7) % 40) + category * 50),
      })),
    );
    const dense = drawn('beeswarm', rows);
    const said = distributionNotes(dense);
    const placed = scatterOf(boxplotOption(dense))!.data;
    const swarmed = dotsOf(renderToSvg(optionFor(dense))).filter(
      (_, at) => !said.some((note) => note.includes(` in ${placed[at]!.value[0]}:`)),
    );
    expect(swarmed.length).toBeGreaterThan(0);
    expect(closest(swarmed)).toBeGreaterThanOrEqual(8);
  });

  it('draws APAC’s 3,000 points as All where they can’t fit side by side, and says so in the chart', () => {
    const many = drawn('beeswarm', regional(3000));
    const sentence = 'Too many points to place side by side in APAC: drawn as All, jittered.';
    expect(distributionNotes(many)).toEqual([sentence]);
    const option = optionFor(many);
    const svg = renderToSvg(option);
    expect(svg).toContain(sentence);
    // APAC's jittered as All draws; EMEA and North America still side by side.
    const placed = scatterOf(boxplotOption(many))!.data;
    const apac = placed.filter((one) => one.value[0] === 'APAC').map((one) => one.symbolOffset[0]);
    const all = scatterOf(boxplotOption(drawn('all', regional(3000))))!
      .data.filter((one) => one.value[0] === 'APAC')
      .map((one) => one.symbolOffset[0]);
    expect(apac).toEqual(all);
    const others = dotsOf(svg).filter((_, at) => placed[at]!.value[0] !== 'APAC');
    expect(others).toHaveLength(160);
    expect(closest(others)).toBeGreaterThanOrEqual(8);
  });
});
