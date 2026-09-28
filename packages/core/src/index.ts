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
  nextRefreshes,
  refreshEveryRefusal,
  refreshLagSeconds,
  refreshPeriodOf,
} from './refresh-key';

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

export {
  MOVING_AVERAGE_PERIODS,
  QUICK_CALCS,
  QUICK_CALC_NAMES,
  applyQuickCalc,
  quickCalcName,
  type MovingAveragePeriods,
  type QuickCalc,
  type QuickCalcKind,
} from './quickCalc';

export { pivot, type PivotResult } from './pivot';

export { applyRowLimit, applyTopN, OTHER_LABEL } from './topN';
export { drilledDocument, drillOptions, type DrillOption } from './drill';

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
export { rangeEndOf } from './markings/buckets';

export { markingApplicability, type Applicability } from './markings/applicability';

export { limitRowsBy, limitingMarkings, type LimitCombination } from './markings/limit-by';

export { limitFilterFor, markedFilter, negatedFilter, type CubeFilter } from './markings/query';

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
  markingMembers,
  matchesPredicate,
  predicateFrom,
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
  markingModeOf,
  markingsFrom,
  problemsWith,
  removeMarking,
  renameMarking,
  setDefaultMarking,
  setMarkingMode,
  setMarkingSlot,
  type Marking,
  type MarkingMode,
  type MarkingSlot,
} from './markings/model';

export {
  columnTitleOf,
  csvOf,
  exportNoteOf,
  rowsCsvOf,
  rowsText,
  tableColumnsOf,
} from './export/csv';

export {
  effectiveGroups,
  folderAccess,
  type AccessFolder,
  type EffectiveGrant,
  type EffectiveGroups,
  type FolderAccessSetting,
  type FolderLevel,
  type GroupList,
} from './access/effective';

export { folderRights, isSuperAdmin, type FolderRight, type Viewer } from './access/visibility';

export {
  CUBE_PARSE,
  objectsOf,
  type FileObjects,
  type MemberKind,
  type ModelObject,
} from './model/objects';

export { boxStats, quantile7, type BoxStats, type WhiskerRule } from './stats/boxplot';
export { countryCodeMarkingOf, holdsCountryCodes, ISO_3166_ALPHA_3 } from './geo/iso3';
export {
  firstTokenIn,
  textPartsOf,
  textRenamed,
  tokenMembersOf,
  type TextToken,
} from './text-tokens';

export {
  DRIVER_TYPES,
  DRIVERS,
  targetKeysOf,
  type AuthMethod,
  type DriverField,
  type DriverSpec,
  type DriverType,
} from './data-sources/drivers';
export {
  dataSourceProblems,
  SHORT_NAME,
  targetChanges,
  type DataSourceShape,
  type FieldValue,
  type SealedV1,
} from './data-sources/validate';
export { INFO_V1, isSealedDriver, padV1, secretAadV1 } from './data-sources/aad';
export { sealSecretV1, type XcubeKey } from './data-sources/seal';
