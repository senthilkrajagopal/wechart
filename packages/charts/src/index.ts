/**
 * @wechart/charts — the ECharts renderer for the chart spec, plus the marking
 * and hit-test layer that sits over it.
 */
export const PACKAGE_NAME = '@wechart/charts';

export { barOption, isBarType, type BarType } from './series/bar';
export { lineOption, isLineType, type LineType } from './series/line';
export { scatterOption, isScatterType } from './series/scatter';
export { pieOption, isPieType, type PieType } from './series/pie';
export { treemapOption, isTreemapType } from './series/treemap';
export { heatmapOption, isHeatmapType } from './series/heatmap';
export { DRAWABLE_TYPES, isDrawable, optionFor } from './optionFor';
export { applyAxes, axesOf, type AxesSettings, type AxisSettings, type NumberFormat } from './axis';
export { assignColours, OTHER_COLOUR, type ColourAssignment } from './colorAssignment';
export { legendFor, seriesCount } from './legend';
export { echarts } from './echarts';
export { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from './theme';
export {
  CLICK_SLOP_PX,
  itemClicks,
  type ItemClick,
  type ItemClicks,
  type ItemEvent,
} from './interaction/itemClick';
