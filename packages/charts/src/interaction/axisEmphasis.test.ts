/**
 * T848 (AC-500): hovering a combo's series, or its legend entry, emphasises
 * its axis — that axis's title and ticks in `text-primary` — and fades the
 * other axis's marks to 0.28 (design 20 state B; Datawrapper's keys).
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { optionFor } from '../optionFor';
import { themed } from '../themed';
import { axisEmphasis, emphasisPatch } from './axisEmphasis';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';

const spec: RenderSpec = {
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, TARGET, MARGIN] },
  rows: [
    { [MONTH]: 'Jan', [REVENUE]: 120, [TARGET]: 100, [MARGIN]: 0.21 },
    { [MONTH]: 'Feb', [REVENUE]: 155, [TARGET]: 110, [MARGIN]: 0.38 },
  ],
  options: { series: { [MARGIN]: { mark: 'point', axis: 'right' } } },
};

type Axis = { axisLabel?: { color?: string }; nameTextStyle?: { color?: string } };
type Series = {
  name?: string;
  yAxisIndex?: number;
  itemStyle?: { opacity?: number };
  lineStyle?: { opacity?: number };
  areaStyle?: { opacity?: number };
};

describe('hovering a series of a two-axis combo', () => {
  for (const theme of ['light', 'dark'] as const) {
    const drawn = themed(optionFor(spec), theme);
    const hovered = axisEmphasis(drawn, 'combo', MARGIN, theme);
    const axes = hovered['yAxis'] as Axis[];
    const series = hovered['series'] as Series[];

    it(`puts the right axis's title and ticks in text-primary (${theme})`, () => {
      expect(axes[1]?.axisLabel?.color).toBe(COLORS[theme]['text-primary']);
      expect(axes[1]?.nameTextStyle?.color).toBe(COLORS[theme]['text-primary']);
      // The other axis as it was.
      expect(axes[0]?.axisLabel?.color).toBe(COLORS[theme]['text-secondary']);
    });

    it(`fades the left axis's marks to 0.28, and leaves the right's (${theme})`, () => {
      const left = series.filter((one) => (one.yAxisIndex ?? 0) === 0);
      const right = series.filter((one) => one.yAxisIndex === 1);

      expect(left.length).toBeGreaterThan(0);
      for (const one of left) {
        expect(one.itemStyle?.opacity).toBe(0.28);
        expect(one.lineStyle?.opacity).toBe(0.28);
      }
      expect(right.length).toBeGreaterThan(0);
      for (const one of right) expect(one.itemStyle?.opacity).toBe(1);
    });
  }

  it('fades an area’s fill with its marks, from its own 0.24', () => {
    const area: RenderSpec = {
      ...spec,
      options: {
        series: { [TARGET]: { mark: 'area' }, [MARGIN]: { mark: 'point', axis: 'right' } },
      },
    };
    const series = axisEmphasis(optionFor(area), 'combo', MARGIN, 'light')['series'] as Series[];
    const target = series.find((one) => one.name === TARGET && one.areaStyle !== undefined);

    expect(target?.areaStyle?.opacity).toBeCloseTo(0.24 * 0.28, 9);
  });

  it('emphasises the left axis for a left series', () => {
    const hovered = axisEmphasis(optionFor(spec), 'combo', REVENUE, 'light');
    const axes = hovered['yAxis'] as Axis[];
    const series = hovered['series'] as Series[];

    expect(axes[0]?.axisLabel?.color).toBe(COLORS.light['text-primary']);
    expect(series.find((one) => one.name === MARGIN)?.itemStyle?.opacity).toBe(0.28);
  });
});

/** T848's review. */
describe('marks that carry their own strength', () => {
  it('fades a marked tile’s bars item by item, as each item sets its own', () => {
    const drawn = optionFor(spec);
    const marked = {
      ...drawn,
      series: (drawn['series'] as Series[]).map((one) =>
        one.name === REVENUE
          ? { ...one, data: [{ value: 120, itemStyle: { opacity: 0.4 } }, 155] }
          : one,
      ),
    };
    const revenue = (axisEmphasis(marked, 'combo', MARGIN, 'light')['series'] as Series[]).find(
      (one) => one.name === REVENUE,
    ) as Series & { data?: unknown[] };

    // A plain item takes the series' 0.28.
    expect(revenue.data).toEqual([{ value: 120, itemStyle: { opacity: 0.4 * 0.28 } }, 155]);
    expect(revenue.itemStyle?.opacity).toBe(0.28);
    // And back as drawn with nothing hovered.
    const back = emphasisPatch(marked, 'combo', undefined, 'light')?.['series'] as {
      data?: unknown[];
    }[];
    expect(back[0]?.data).toEqual([{ value: 120, itemStyle: { opacity: 0.4 } }, 155]);
  });
});

describe('a trellis, whose panels each have a value axis', () => {
  it('is left as it is', () => {
    const option = {
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { type: 'bar', name: 'East', yAxisIndex: 0, data: [1] },
        { type: 'bar', name: 'West', yAxisIndex: 1, data: [2] },
      ],
    };

    expect(axisEmphasis(option, 'trellis', 'East', 'light')).toBe(option);
    expect(emphasisPatch(option, 'trellis', 'East', 'light')).toBeUndefined();
  });
});

describe('nothing to emphasise', () => {
  it('leaves the option as it is with nothing hovered', () => {
    const option = optionFor(spec);

    expect(axisEmphasis(option, 'combo', undefined, 'light')).toBe(option);
  });

  it('leaves a combo of one axis, and any other chart, as it is', () => {
    const one = optionFor({ ...spec, options: {} });
    const bar = optionFor({ ...spec, chartType: 'bar' });

    expect(axisEmphasis(one, 'combo', REVENUE, 'light')).toBe(one);
    expect(axisEmphasis(bar, 'bar', REVENUE, 'light')).toBe(bar);
  });

  it('leaves it as it is for a name no series has', () => {
    const option = optionFor(spec);

    expect(axisEmphasis(option, 'combo', 'orders.nothing', 'light')).toBe(option);
  });
});
