/**
 * T866 (AC-511; design 20 state I): a combo below 1,024 px. Its axis titles
 * stay above their axes, its ticks go compact, its category labels are thinned
 * level rather than turned, its legend wraps under the title, and a reference
 * line is labelled by its label alone, its value in its tooltip.
 */
import { describe, expect, it } from 'vitest';

import type { ComboReference, RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';

const months = Array.from(
  { length: 12 },
  (_, at) => `2026-${String(at + 1).padStart(2, '0')}-01T00:00:00.000`,
);

const plan: ComboReference = {
  id: 'plan',
  kind: 'line',
  direction: 'horizontal',
  axis: 'left',
  value: 100_000,
  label: 'Monthly plan',
  showValue: true,
};

const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, MARGIN] },
  rows: months.map((month, at) => ({
    [MONTH]: month,
    [REVENUE]: 80_000 + at * 5_000,
    [MARGIN]: 0.2 + at / 100,
  })),
  palette: ['#2a78d6', '#eb6834'],
  formats: { [REVENUE]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [MARGIN]: 'Margin %' },
  options: { series: { [MARGIN]: { mark: 'line', axis: 'right' } }, references: [plan] },
};

const NARROW = { width: 366, height: 260, narrow: true };
const WIDE = { width: 900, height: 360 };

type Axis = {
  name?: string;
  nameLocation?: string;
  nameRotate?: number;
  axisLabel?: { formatter?: (value: unknown) => string; rotate?: number; interval?: unknown };
};
type Carrier = {
  name?: string;
  silent?: boolean;
  tooltip?: { show?: boolean };
  markLine?: {
    silent?: boolean;
    label?: { formatter?: unknown };
    tooltip?: { show?: boolean; trigger?: string; formatter?: unknown };
  };
};

const yAxesOf = (option: Record<string, unknown>) => option['yAxis'] as Axis[];
const planOf = (option: Record<string, unknown>) =>
  (option['series'] as Carrier[]).find((one) => one.name === 'reference:plan');

describe('a combo below 1,024 px (T866, AC-511)', () => {
  it('writes its ticks compact, a percent kept as it is', () => {
    const [left, right] = yAxesOf(optionFor(spec, NARROW));

    expect(left?.axisLabel?.formatter?.(100_000)).toBe('$100K');
    expect(left?.axisLabel?.formatter?.(0)).toBe('$0');
    expect(right?.axisLabel?.formatter?.(0.4)).toBe('40%');
  });

  it('writes its ticks in full when wide', () => {
    const [left] = yAxesOf(optionFor(spec, WIDE));

    expect(left?.axisLabel?.formatter?.(100_000)).toContain('100,000');
  });

  it('writes one axis’s ticks compact too', () => {
    const one: RenderSpec = { ...spec, options: { references: [plan] } };
    const yAxis = optionFor(one, NARROW)['yAxis'] as Axis;

    expect(yAxis.axisLabel?.formatter?.(100_000)).toBe('$100K');
  });

  it('keeps each axis’s title level, above its axis', () => {
    for (const axis of yAxesOf(optionFor(spec, NARROW))) {
      expect(axis.nameLocation).toBe('end');
      expect(axis.nameRotate ?? 0).toBe(0);
    }
  });

  it('thins its category labels level rather than turning them', () => {
    const xAxis = optionFor(spec, NARROW)['xAxis'] as Axis;

    expect(xAxis.axisLabel?.rotate).toBe(0);
    // ECharts' own interval, which keeps one label in each run it has room for.
    expect(xAxis.axisLabel?.interval ?? 'auto').toBe('auto');
  });

  it('labels a reference line by its label alone, its value in its tooltip', () => {
    const carrier = planOf(optionFor(spec, NARROW));

    expect(carrier?.markLine?.label?.formatter).toBe('Monthly plan');
    expect(carrier?.silent).toBe(false);
    expect(carrier?.markLine?.silent).toBe(false);
    expect(carrier?.markLine?.tooltip).toEqual({
      show: true,
      trigger: 'item',
      formatter: 'Monthly plan: $100K',
    });
  });

  it('labels it with its value, and gives it no tooltip, when wide', () => {
    const carrier = planOf(optionFor(spec, WIDE));

    expect(carrier?.markLine?.label?.formatter).toBe('Monthly plan · $100,000');
    expect(carrier?.silent).toBe(true);
    expect(carrier?.markLine?.tooltip).toBeUndefined();
  });

  it('wraps its legend, with room above the plot for each row', () => {
    const titled = (width: number) =>
      optionFor(
        {
          ...spec,
          titles: {
            [REVENUE]: 'Revenue booked this month across every region',
            [MARGIN]: 'Gross margin after discounts and returns',
          },
        },
        { width, height: 260, narrow: true },
      );
    const narrow = titled(240);
    const legend = narrow['legend'] as { type?: string };
    const top = (option: Record<string, unknown>) => (option['grid'] as { top?: number }).top ?? 0;

    expect(legend.type).toBe('plain');
    expect(top(narrow)).toBeGreaterThan(top(titled(900)));
  });
});
