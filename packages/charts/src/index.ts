/**
 * @wechart/charts — the ECharts renderer for the chart spec, plus the marking
 * and hit-test layer that sits over it.
 */
export const PACKAGE_NAME = '@wechart/charts';

export { barOption, isBarType, type BarType, type Canvas } from './series/bar';
export { lineOption, isLineType, type LineType } from './series/line';
export { scatterOption, isScatterType } from './series/scatter';
export { bulletsOf } from './series/bullet';
export { pieOption, isPieType, type PieType } from './series/pie';
export { treemapOption, isTreemapType } from './series/treemap';
export { heatmapOption, isHeatmapType } from './series/heatmap';
export { boxesOf, drawnPointsOf, type Box } from './series/boxplot';
export { isMapType, mapOption, regionSetIdOf, unplacedCodes, unplacedNote } from './series/map';
export {
  mapPointsOf,
  POINT_COLOURS_MAX,
  type MapPoint,
  type MapPointsDrawn,
} from './series/mapPoints';
export { countryMap, loadCountryMap, type CountryMap } from './geo/countryMap';
export {
  admin1CountryOf,
  admin1Index,
  admin1RegionsOf,
  loadAdmin1Index,
  type Admin1Index,
} from './geo/admin1';
export { loadMapBoundaries, mapBoundariesReady } from './geo/boundaries';
export {
  onRegionSets,
  regionSetOf,
  registerRegionSet,
  type RegionSet,
} from './geo/regionSets';
export {
  isParallelType,
  PARALLEL_LINE_CAP,
  parallelLinesOf,
  parallelOption,
  type ParallelLines,
} from './series/parallel';
export {
  isSankeyType,
  SANKEY_FLOW_CAP,
  sankeyDrawnOf,
  sankeyNotes,
  sankeyOption,
  sankeyPartlyMarked,
  type SankeyDrawn,
  type SankeyFlow,
  type SankeyNode,
} from './series/sankey';
export { DRAWABLE_TYPES, isDrawable, optionFor } from './optionFor';
export { SERIES, type SeriesOption } from './series/registry';
export { DESCRIBE, describeChart, type Describe } from './describe';
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
export { colouredMembersOf, coloursMembers, singleSeriesOf } from './colouredMembers';
export { legendFor, seriesCount } from './legend';
export { logScaleOmissions, type LogOmissions } from './series/combo';
export { MAX_PANELS } from './layout/trellis';
export { hiddenLabelShare } from './layout/hiddenLabels';
export { withScrollKept } from './layout/scrollWindow';
export { isOneSource, labelOf, nameWriter } from './modelWriter';
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
export {
  brushedWords,
  membersBrushed,
  parallelAxesOf,
  parallelBrushOf,
  withBrush,
  type ParallelAxisPlace,
} from './interaction/parallelBrush';
export { axisEmphasis, emphasisPatch } from './interaction/axisEmphasis';
export { legendEntryAt, legendGlyphBoxes, type LegendGlyphBox } from './combo/legendGlyphs';
export { referencesOutside } from './combo/references';
export { comboColumnHead, comboTableOf, type ComboTable } from './combo/describe';
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
  markedCellOf,
  markedState,
  partialMark,
  type MarkColours,
  type PartialMark,
  type PartlyMarked,
} from './marking/partial';
export { rowMarksOf, type RowMark } from './marking/partialOption';
