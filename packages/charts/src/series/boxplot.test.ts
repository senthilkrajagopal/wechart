import { formatterFor, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_PALETTE } from '../theme';
import { boxplotOption } from './boxplot';

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
});
