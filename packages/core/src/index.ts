/**
 * @wechart/core — chart spec, marking model, filter model and the canonical
 * Cube query builder. No DOM, no React.
 */
export const PACKAGE_NAME = '@wechart/core';

export {
  UNDERLYING_ROW_LIMIT,
  addToWell,
  emptySpec,
  granularitiesOf,
  isEmpty,
  QUERY_GRANULARITY,
  removeFromWell,
  toCubeQuery,
  toUnderlyingQuery,
  wellFor,
  type ChartFilter,
  type ChartSpec,
  type WellName,
} from './chart-spec';

export {
  CHART_DOCUMENT_VERSION,
  ChartDocumentError,
  chartDocumentOf,
  readChartDocument,
  toChartSpec,
  type ChartDefinition,
  type ChartDocument,
  type EncodingOverrides,
} from './chart-document';

export {
  LEGACY_FIXTURES,
  migrateChartDocument,
  versionOf,
  type LegacyFixture,
} from './chart-migrations';
export { CHART_TYPE_NAMES, chartTypeName } from './chart-type-names';

export {
  CHANNELS,
  CHART_TYPES,
  distinctValues,
  memberOn,
  membersOn,
  seriesOf,
  type Channel,
  type ChartType,
  type Encoding,
  type ChartHighlight,
  type ChartMarking,
  type RenderSpec,
  type SeriesData,
} from './render-spec';

export { compile, defaultEncoding, type CompileOptions } from './compile';

export { pivot, type PivotResult } from './pivot';

export { applyTopN, OTHER_LABEL } from './topN';

export { applySort, type SortBy, type SortDirection, type SortSettings } from './sort';

export {
  formatValue,
  formatterFor,
  granularityOf,
  rewritesValues,
  type MemberFormat,
  type MemberFormats,
  type MemberGranularities,
  type TimeGranularity,
} from './format';

export {
  IMAGE_HEAD_BYTES,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  imageProblem,
  type ImageType,
} from './images';

export {
  DEFAULT_INTERACTIONS,
  INTERACTION_MODES,
  newDashboardBody,
  type CrossFilterConfig,
  type InteractionMode,
  type Interactions,
  type NewDashboard,
  type NewDashboardBody,
  type PairAction,
} from './dashboard-document';

export {
  applyItemClick,
  applyToggleOrAdd,
  isItemMarked,
  type ClickModifiers,
} from './markings/apply';

export {
  applyAxisRange,
  rangeFromDrag,
  type AxisDrag,
  type RangeModifiers,
} from './markings/range';

export { markingApplicability, type Applicability } from './markings/applicability';

export { limitRowsBy, limitingMarkings, type LimitCombination } from './markings/limit-by';

export { limitFilterFor, type CubeFilter } from './markings/query';

export {
  MARKING_ITEM_LIMIT,
  addItemsWithinLimit,
  expandWholeTile,
  invertTileItems,
  markAll,
  markAllOfTile,
  type LimitedMarking,
} from './markings/limit';

export {
  itemForRow,
  markRowClick,
  rowsMarkable,
  type RowClick,
  type RowMarking,
} from './markings/rows';

export {
  EMPTY_PREDICATE,
  isEmptyPredicate,
  markedCount,
  matchesPredicate,
  predicateProblems,
  withItem,
  withRange,
  type BoundedRange,
  type MarkedItem,
  type MarkingPredicate,
  type MemberValue,
  type WholeTile,
} from './markings/predicate';

export {
  MARKING_SLOTS,
  MAX_MARKINGS,
  addMarking,
  canAddMarking,
  defaultMarkings,
  markingsFrom,
  problemsWith,
  removeMarking,
  renameMarking,
  setDefaultMarking,
  setMarkingSlot,
  type Marking,
  type MarkingSlot,
} from './markings/model';

export { columnTitleOf, csvOf, exportNoteOf, rowsText, tableColumnsOf } from './export/csv';
