import type { ChartType, RenderSpec } from '@wechart/core';

import { describeBoxplot } from './boxplot';
import { describeBullet } from './bullet';
import { describeSankey } from './sankey';
import { describeStack100 } from './stack100';

/**
 * R81's text alternatives, one module per type (T934; direction.md rule
 * 166): each new type names its type, encodings, range and extremes in a
 * sentence built in `describe/‹type›.ts` and registered here in one line.
 * A module may have nothing to say of a spec — a stacked bar at Sum, which
 * 100 % stacking describes only at 100 % (T958).
 */
export type Describe = (spec: RenderSpec) => string | undefined;

/** Each type with a text alternative of its own, by its type. One line per type. */
export const DESCRIBE: Partial<Record<ChartType, Describe>> = {
  boxplot: describeBoxplot,
  bullet: describeBullet,
  sankey: describeSankey,
  stackedArea: describeStack100,
  stackedBar: describeStack100,
};

/** A chart's text alternative, where its type has one. */
export function describeChart(spec: RenderSpec): string | undefined {
  return DESCRIBE[spec.chartType]?.(spec);
}
