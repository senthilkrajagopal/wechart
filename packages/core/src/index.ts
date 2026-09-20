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
