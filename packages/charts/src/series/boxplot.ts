/**
 * Box plot (T399, AC-306; research/box-plot.md; direction.md rule 88).
 *
 * Each category's box is computed from its rows by `boxStats` (type-7
 * quartiles), not by ECharts' own transform, which reads null as 0 and ends
 * Tukey whiskers at the fence rather than at the last value inside it. ECharts
 * draws what it's given: `[low, Q1, median, Q3, high]` per box, whatever the
 * two ends mean. The values beyond Tukey's whiskers are a scatter series.
 */
import {
  boxStats,
  memberOn,
  type BoxStats,
  type RenderSpec,
  type WhiskerRule,
} from '@wechart/core';

import { colourFor } from '../colours';
import type { EChartsOption } from '../theme';

export function isBoxplotType(chartType: string): boolean {
  return chartType === 'boxplot';
}

/** The chart option `whiskers`: Tukey's unless the user chose the minimum and maximum. */
export function whiskerRuleOf(spec: RenderSpec): WhiskerRule {
  return spec.options?.['whiskers'] === 'minmax' ? 'minmax' : 'tukey';
}

export interface Box {
  /** The category, as the rows carry it. */
  readonly name: string;
  readonly stats: BoxStats;
}

/**
 * One box per category that has values, in the order categories first appear.
 * The drawing and its tooltip both read these, so they can't disagree.
 */
export function boxesOf(spec: RenderSpec): Box[] {
  const category = memberOn(spec.encoding, 'x');
  const value = memberOn(spec.encoding, 'y');
  if (category === undefined || value === undefined) return [];

  // One pass over the rows, however many categories (up to 50,000 rows).
  const values = new Map<string, unknown[]>();
  for (const row of spec.rows) {
    const name = String(row[category] ?? '');
    let list = values.get(name);
    if (list === undefined) values.set(name, (list = []));
    list.push(row[value]);
  }
  const rule = whiskerRuleOf(spec);
  return [...values].flatMap(([name, list]) => {
    const stats = boxStats(list, rule);
    return stats === undefined ? [] : [{ name, stats }];
  });
}

export function boxplotOption(spec: RenderSpec): EChartsOption {
  if (!isBoxplotType(spec.chartType)) throw new Error(`${spec.chartType} is not a box plot`);

  const value = memberOn(spec.encoding, 'y') ?? '';
  // One series, so one colour: the measure's, as every renderer picks it (AC-039).
  const colour = colourFor(spec, value, 0);
  const boxes = boxesOf(spec);

  return {
    animation: false,
    xAxis: { type: 'category', data: boxes.map((box) => box.name) },
    yAxis: { type: 'value', scale: true },
    series: [
      {
        type: 'boxplot' as const,
        name: value,
        data: boxes.map(({ stats }) => [stats.low, stats.q1, stats.median, stats.q3, stats.high]),
        itemStyle: { borderColor: colour },
      },
      {
        // Outliers, in their category's colour at 60 % (direction.md rule 88).
        type: 'scatter' as const,
        name: `${value} (outliers)`,
        data: boxes.flatMap(({ name, stats }) => stats.outliers.map((outlier) => [name, outlier])),
        symbolSize: 8,
        itemStyle: { color: colour, opacity: 0.6 },
      },
    ],
  };
}
