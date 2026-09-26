/**
 * @wechart/charts — the ECharts renderer for the chart spec, plus the marking
 * and hit-test layer that sits over it.
 */
export const PACKAGE_NAME = '@wechart/charts';

export { barOption, isBarType, type BarType, type Canvas } from './series/bar';
export { lineOption, isLineType, type LineType } from './series/line';
export { scatterOption, isScatterType } from './series/scatter';
export { pieOption, isPieType, type PieType } from './series/pie';
export { treemapOption, isTreemapType } from './series/treemap';
export { heatmapOption, isHeatmapType } from './series/heatmap';
export { DRAWABLE_TYPES, isDrawable, optionFor } from './optionFor';
export { themed, type ChartTheme } from './themed';
export { applyAxes, axesOf, type AxesSettings, type AxisSettings, type NumberFormat } from './axis';
export {
  applyCustomize,
  inSeriesOrder,
  legendSettingsOf,
  seriesOrderOf,
  seriesSettingsOf,
  STACKABLE_TYPES,
  type LegendPosition,
  type LegendSettings,
  type SeriesSettings,
} from './customize';
export { assignColours, OTHER_COLOUR, type ColourAssignment } from './colorAssignment';
export { colouredMembersOf } from './colouredMembers';
export { legendFor, seriesCount } from './legend';
export { isOneSource, labelOf } from './modelWriter';
export { echarts } from './echarts';
export { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from './theme';
export {
  CLICK_SLOP_PX,
  itemClicks,
  type ItemClick,
  type ItemClicks,
  type ItemEvent,
} from './interaction/itemClick';
export { insideShape, touchesSpan, type Point, type Shape } from './interaction/hitTest';
export { itemsInShape, type PixelConverter, type ShapeItem } from './interaction/itemsInShape';
export { dragGesture, type DragEvent, type DragGesture } from './interaction/dragOverlay';
export {
  bucketRangeAt,
  bucketStripeFor,
  edgeBetween,
  stripeFor,
  type AxisPixels,
  type BucketAxis,
  type Stripe,
} from './interaction/axisRange';
export { markFromLegend, type LegendModifiers } from './interaction/legendMark';
export {
  keyToMarking,
  type KeyModifiers,
  type KeyResult,
  type KeyboardState,
} from './interaction/keyboardMarking';
export { markFromPanel, panelOfTitleClick } from './interaction/panelMark';
export { FOCUS_RING_PX, focusedItemOf } from './marking/focus';
export {
  MARKED_OUTLINE_PX,
  UNMARKED_OPACITY,
  markedItemStyle,
  type ItemStyle,
  type TileMarking,
} from './marking/render';
export {
  isAdditive,
  partialMark,
  type MarkColours,
  type PartialMark,
  type PartlyMarked,
} from './marking/partial';
