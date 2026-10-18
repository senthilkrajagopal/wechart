import type { ChartType, RenderSpec } from '@wechart/core';

/**
 * R81's text alternatives, one module per type (T934; direction.md rule
 * 166): each new type names its type, encodings, range and extremes in a
 * sentence built in `describe/‹type›.ts` and registered here in one line.
 */
export type Describe = (spec: RenderSpec) => string;

/** Each type with a text alternative of its own, by its type. One line per type. */
export const DESCRIBE: Partial<Record<ChartType, Describe>> = {};

/** A chart's text alternative, where its type has one. */
export function describeChart(spec: RenderSpec): string | undefined {
  return DESCRIBE[spec.chartType]?.(spec);
}
