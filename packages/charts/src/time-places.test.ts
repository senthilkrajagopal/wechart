/**
 * T206 / AC-188: THE SYSTEM SHALL write a time dimension's values by their
 * granularity … in axes, labels, tooltips and tables.
 * Fails when: a time value shows as a raw timestamp such as
 * "2026-01-02T00:00:00.000".
 *
 * `format.test.ts` in core proves the writing; this proves the places a chart
 * shows a time value — a category axis and its crosshair label, the tooltip,
 * the legend, and a trellis panel's title — for time on each channel it can
 * take. Tables are covered in `packages/web`, where they are rendered.
 */
import { describe, expect, it } from 'vitest';

import type { ChartType, RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { labelsOf, renderToSvg } from './testing/renderToSvg';

const AT = 'orders.ordered_at';
const COUNT = 'orders.count';
const STATUS = 'orders.status';

/** Two months of two statuses, as Cube sends them: bucket starts, no offset. */
const ROWS = [
  { [AT]: '2026-01-01T00:00:00.000', [STATUS]: 'shipped', [COUNT]: 3 },
  { [AT]: '2026-01-01T00:00:00.000', [STATUS]: 'completed', [COUNT]: 4 },
  { [AT]: '2026-02-01T00:00:00.000', [STATUS]: 'shipped', [COUNT]: 5 },
  { [AT]: '2026-02-01T00:00:00.000', [STATUS]: 'completed', [COUNT]: 6 },
];

function byMonth(chartType: ChartType, encoding: RenderSpec['encoding']): RenderSpec {
  return {
    chartType,
    encoding,
    rows: ROWS,
    palette: ['#123456', '#654321'],
    granularities: { [AT]: 'month' },
  };
}

const textOf = (spec: RenderSpec) =>
  labelsOf(renderToSvg(optionFor(spec))).map((label) => label.text);
const RAW = /\d{4}-\d{2}-\d{2}T/;

type Formatter = (params: unknown) => string;
const tooltipOf = (spec: RenderSpec) =>
  (optionFor(spec)['tooltip'] as { formatter: Formatter }).formatter;

describe('a time axis', () => {
  const overTime: [ChartType, RenderSpec['encoding']][] = [
    ['bar', { x: [AT], y: [COUNT] }],
    ['hbar', { x: [AT], y: [COUNT] }],
    ['groupedBar', { x: [AT], y: [COUNT], color: [STATUS] }],
    ['stackedBar', { x: [AT], y: [COUNT], color: [STATUS] }],
    ['line', { x: [AT], y: [COUNT] }],
    ['multiLine', { x: [AT], y: [COUNT], color: [STATUS] }],
    ['area', { x: [AT], y: [COUNT] }],
    ['stackedArea', { x: [AT], y: [COUNT], color: [STATUS] }],
    ['combo', { x: [AT], y: [COUNT] }],
    ['heatmap', { x: [AT], y: [STATUS], color: [COUNT] }],
    ['trellis', { facet: [STATUS], x: [AT], y: [COUNT] }],
  ];

  it.each(overTime)('is written by its granularity on a %s', (chartType, encoding) => {
    const labels = textOf(byMonth(chartType, encoding));

    expect(labels).toContain('Jan 2026');
    expect(labels).toContain('Feb 2026');
    expect(labels.filter((label) => RAW.test(label))).toEqual([]);
  });

  it('labels the crosshair’s pointer on it the same way', () => {
    const xAxis = optionFor(byMonth('line', { x: [AT], y: [COUNT] }))['xAxis'] as {
      axisPointer: { label: { formatter: (params: { value: unknown }) => string } };
    };

    expect(xAxis.axisPointer.label.formatter({ value: '2026-02-01T00:00:00.000' })).toBe(
      'Feb 2026',
    );
  });

  it('leaves a category that is not time as it is', () => {
    // An order id on the category axis is not grouped into "1,234" (T194).
    const ids: RenderSpec = {
      chartType: 'bar',
      encoding: { x: ['orders.id'], y: [COUNT] },
      rows: [
        { 'orders.id': 1234, [COUNT]: 1 },
        { 'orders.id': 5678, [COUNT]: 2 },
      ],
      palette: ['#123456'],
      granularities: { [AT]: 'month' },
    };

    expect(textOf(ids)).toContain('1234');
  });
});

describe('the tooltip', () => {
  it('heads a crosshair tooltip with the time, by its granularity', () => {
    const text = tooltipOf(byMonth('line', { x: [AT], y: [COUNT] }))([
      { name: '2026-01-01T00:00:00.000', seriesName: COUNT, value: 3, seriesIndex: 0 },
    ]);

    expect(text).toBe(`Jan 2026<br/>${COUNT}: 3`);
  });

  it('names a series split by time by its granularity', () => {
    const text = tooltipOf(byMonth('groupedBar', { x: [STATUS], y: [COUNT], color: [AT] }))({
      name: 'shipped',
      seriesName: '2026-02-01T00:00:00.000',
      value: 5,
      seriesIndex: 1,
    });

    expect(text).toBe('shipped<br/>Feb 2026: 5');
  });

  it('heads a heatmap cell with its time', () => {
    const text = tooltipOf(byMonth('heatmap', { x: [AT], y: [STATUS], color: [COUNT] }))({
      value: [1, 0, 5],
    });

    expect(text).toBe(`Feb 2026 · shipped<br/>${COUNT}: 5`);
  });

  it('names a trellis panel of time by its granularity', () => {
    const text = tooltipOf(byMonth('trellis', { facet: [AT], x: [STATUS], y: [COUNT] }))({
      name: 'shipped',
      seriesName: '2026-01-01T00:00:00.000',
      value: 3,
      seriesIndex: 0,
    });

    expect(text).toBe('shipped<br/>Jan 2026: 3');
  });
});

describe('the legend and panel titles', () => {
  it('names series split by time by their granularity', () => {
    const labels = textOf(byMonth('multiLine', { x: [STATUS], y: [COUNT], color: [AT] }));

    expect(labels).toContain('Jan 2026');
    expect(labels.filter((label) => RAW.test(label))).toEqual([]);
  });

  it('names a pie’s slices of time by their granularity', () => {
    const labels = textOf(byMonth('pie', { x: [AT], y: [COUNT] }));

    expect(labels).toContain('Feb 2026');
    expect(labels.filter((label) => RAW.test(label))).toEqual([]);
  });

  it('titles each trellis panel of time by its granularity', () => {
    const labels = textOf(byMonth('trellis', { facet: [AT], x: [STATUS], y: [COUNT] }));

    expect(labels).toContain('Jan 2026');
    expect(labels.filter((label) => RAW.test(label))).toEqual([]);
  });
});
