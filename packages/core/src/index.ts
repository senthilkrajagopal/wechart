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
  swapMeasure,
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
export { CHART_TYPE_MODULES, type ChartTypeModule } from './chart-types';
export {
  KPI_COMPARE_TO,
  KPI_DIRECTIONS,
  kpiModule,
  kpiOptionsOf,
  withKpiOptions,
  type KpiCompareTo,
  type KpiDirection,
  type KpiOptions,
  type KpiTarget,
  type KpiTime,
} from './chart-types/kpi';
export {
  EXPORT_EXTENSION,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportedBodyOf,
  exportedDataSourceOf,
  exportFileNameOf,
  readExport,
  readExportFile,
  settingKeysOf,
  type ExportRefusal,
  type ReadExport,
  type ExportedChart,
  type ExportedDashboard,
  type ExportedDataSource,
  type ExportedModel,
  type ExportFile,
  type ExportItem,
} from './exportFile';
export { rebound, templateNeedsBinding } from './importBinding';
export {
  clockChangeBetween,
  nextRefreshes,
  nextRefreshesBeforeChange,
  refreshEveryRefusal,
  refreshLagSeconds,
  refreshPeriodOf,
  type ClockChange,
} from './refresh-key';

export {
  CHANNELS,
  CHART_TYPES,
  R81_TYPES,
  distinctValues,
  inValueOrder,
  memberOn,
  membersOn,
  seriesOf,
  type Channel,
  type ChartType,
  type Encoding,
  type ChartHighlight,
  type ChartMarking,
  type ComboAxis,
  type ComboMark,
  type RenderSpec,
  type SeriesData,
  type SeriesOptions,
} from './render-spec';

export {
  canSynchronize,
  COMBO_AXES,
  COMBO_MARKS,
  COMBO_SERIES_LIMIT,
  comboLimit,
  comboLimitOf,
  comboProblems,
  comboSeriesOf,
  comboStackingOf,
  comboStackingRows,
  isSynchronized,
  logScaleState,
  markTakenBy,
  membersShownOf,
  unitOfFormat,
  withComboAuto,
  withComboSeries,
  withComboSplit,
  withComboStacking,
  withLogScale,
  withSynchronize,
  type AreaStacking,
  type BarStacking,
  type ComboLimit,
  type ComboSeries,
  type MembersShown,
  type ComboStacking,
  type ComboStackingRow,
  type LogScaleState,
  type SynchronizeState,
} from './combo';

export { compile, defaultEncoding, type CompileOptions } from './compile';

export {
  onOneScale,
  scaleOf,
  undrawnMeasures,
  undrawnOf,
  undrawnOffers,
  type FormShape,
  type Undrawn,
  type UndrawnOffer,
  type UndrawnReason,
} from './undrawn';

export {
  CALC_GRANULARITIES,
  MOVING_AVERAGE_PERIODS,
  OVER_TIME,
  QUICK_CALCS,
  QUICK_CALC_NAMES,
  applyQuickCalc,
  calculationsInEffect,
  periodGrainOf,
  quickCalcLabel,
  quickCalcName,
  quickCalcTypeRefusal,
  withMemberLabels,
  withoutCalculations,
  type CalculatedMeasure,
  type CalculationAsked,
  type MeasureKind,
  type MemberLabels,
  type MovingAveragePeriods,
  type PeriodGrain,
  type QuickCalc,
  type QuickCalcKind,
} from './quickCalc';

export { pivot, type PivotResult } from './pivot';

export { applyComboFold, applyRowLimit, applyTopN, OTHER_LABEL } from './topN';
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

export { allowedGroups } from './access/allowed';

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
  elementOfToken,
  firstTokenIn,
  textPartsOf,
  textRenamed,
  tokenMembersOf,
  type TextToken,
} from './text-tokens';
export * from './text-document';
export { textDocumentFromMarkdown } from './text-document-from-markdown';
export { textDocumentToMarkdown } from './text-document-to-markdown';

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
  MAX_NAME,
  NAME,
  nameInUse,
  nameInUseOf,
  nameKey,
  nameProblem,
  type NamedKind,
} from './names';
export {
  dataSourceProblems,
  targetChanges,
  type DataSourceShape,
  type FieldValue,
  type SealedV1,
} from './data-sources/validate';
export { INFO_V1, isSealedDriver, padV1, secretAadV1 } from './data-sources/aad';
export { periodOf, periodsOf } from './periods';
export {
  BOXPLOT_POINTS,
  boxplotDistributionOf,
  DEFAULT_DISTRIBUTION,
  distributionPatch,
  drawnDistribution,
  needsEachPointIs,
  POINTS_NEED_EACH_POINT_IS,
  type BoxplotDistribution,
  type BoxplotPoints,
} from './chart-types/boxplotDistribution';
export {
  BOUNDARY_SETS,
  DEFAULT_MAP,
  mapLayersOf,
  mapModule,
  mapSettingsOf,
  type BoundarySet,
  type DensityLayer,
  type MapLayers,
  type MapSettings,
  type PointsLayer,
} from './chart-types/map';
export {
  MIN_PARALLEL_AXES,
  PARALLEL_SCALES,
  parallelModule,
  parallelOf,
  sharedScaleRefusal,
  tooFewMeasures,
  type Parallel,
  type ParallelScale,
  type ParallelSettings,
} from './chart-types/parallel';
export {
  COLUMN_KINDS,
  columnsOf,
  graphicalTableModule,
  graphicalTableOf,
  newColumn,
  NO_COLUMNS,
  withColumns,
  type ColumnKind,
  type GraphicalTable,
  type GraphicalTableColumn,
  type GraphicalTableSettings,
} from './chart-types/graphicalTable';
export {
  MAX_SANKEY_STEPS,
  MIN_SANKEY_STEPS,
  ONE_STEP,
  SANKEY_COLOUR_BY,
  sankeyLinksOf,
  sankeyModule,
  sankeyOf,
  type Sankey,
  type SankeyColourBy,
  type SankeyLink,
  type SankeySettings,
} from './chart-types/sankey';
export {
  BULLET_NO_TARGET,
  bandsRefusal,
  bulletBandOf,
  bulletModule,
  bulletOptionsOf,
  DEFAULT_BANDS,
  MAX_BANDS,
  MIN_BANDS,
  targetCount,
  targetMeasuresOf,
  withBulletOptions,
  type BulletSettings,
  type BulletTarget,
} from './chart-types/bullet';
export {
  foldForShares,
  isPercentStack,
  percentRefusal,
  SHARE_SERIES_CAP,
  sharesOf,
  shareText,
  STACKED_TYPES,
  stackOf,
  withStack,
  type Stack,
} from './chart-types/stack100';
export { sealSecretV1, type XcubeKey } from './data-sources/seal';
