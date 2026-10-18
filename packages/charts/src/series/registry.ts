import type { ChartType, RenderSpec } from '@wechart/core';

import type { EChartsOption } from '../theme';
import type { Canvas } from './bar';

/**
 * R81's series, one module per type (T934; docs/tasks.md §P2.27): each new
 * type's ECharts option is built in `series/‹type›.ts` and registered here in
 * one line, and `optionFor` draws it as it draws every other chart — marked,
 * highlighted, focused, on the prototype's grid, with its legend and tooltip.
 * A type with no series registered isn't drawable, and says so
 * (`isDrawable`; the tile's "‹type› charts are not drawn yet.").
 */
export type SeriesOption = (spec: RenderSpec, canvas: Canvas) => EChartsOption;

/** Each type with a series module of its own, by its type. One line per type. */
export const SERIES: Partial<Record<ChartType, SeriesOption>> = {};
