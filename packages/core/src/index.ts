/**
 * @wechart/core — chart spec, marking model, filter model and the canonical
 * Cube query builder. No DOM, no React.
 */
export const PACKAGE_NAME = '@wechart/core';

export {
  UNDERLYING_ROW_LIMIT,
  addToWell,
  emptySpec,
  isEmpty,
  removeFromWell,
  toCubeQuery,
  toUnderlyingQuery,
  wellFor,
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
  type RenderSpec,
  type SeriesData,
} from './render-spec';

export { compile, defaultEncoding, type CompileOptions } from './compile';

export { pivot, type PivotResult } from './pivot';

export { applyTopN, OTHER_LABEL } from './topN';

export { applySort, type SortBy, type SortDirection, type SortSettings } from './sort';

export { formatValue, formatterFor, type MemberFormats } from './format';

export {
  DEFAULT_INTERACTIONS,
  INTERACTION_MODES,
  newDashboardBody,
  type CrossFilterConfig,
  type InteractionMode,
  type Interactions,
  type NewDashboard,
  type NewDashboardBody,
} from './dashboard-document';

export {
  applyItemClick,
  applyToggleOrAdd,
  isItemMarked,
  type ClickModifiers,
} from './markings/apply';

export {
  EMPTY_PREDICATE,
  isEmptyPredicate,
  matchesPredicate,
  predicateProblems,
  withItem,
  withRange,
  type BoundedRange,
  type MarkedItem,
  type MarkingPredicate,
  type MemberValue,
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
  setDefaultMarking,
  type Marking,
  type MarkingSlot,
} from './markings/model';
