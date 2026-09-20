/**
 * @wechart/charts — the ECharts renderer for the chart spec, plus the marking
 * and hit-test layer that sits over it.
 */
export const PACKAGE_NAME = '@wechart/charts';

export { barOption, isBarType, type BarType } from './series/bar';
export { lineOption, isLineType, type LineType } from './series/line';
export { scatterOption, isScatterType } from './series/scatter';
export { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from './theme';
