import type { ChartType } from '../render-spec';
import { kpiModule } from './kpi';
import { mapModule } from './map';
import { parallelModule } from './parallel';

/**
 * R81's chart types, one module each (T934; docs/tasks.md §P2.27): a type's
 * own settings — a KPI's Compare to, a histogram's bins, a timeline's End —
 * live in `chart-types/‹type›.ts`, which reads them from a saved chart and
 * writes them back, and is registered here in one line. Two lanes add types
 * side by side, so each touches only its own module and its own line.
 */
export interface ChartTypeModule<Options = unknown> {
  readonly type: ChartType;
  /** The type's own settings, read from a saved chart as stored; its defaults where none are. */
  readonly parse: (stored: unknown) => Options;
  /** Its settings as they are stored, so that parsing them gives them back. */
  readonly save: (options: Options) => unknown;
}

/** Every type with a module of its own, by its type. One line per type. */
export const CHART_TYPE_MODULES: Partial<Record<ChartType, ChartTypeModule>> = {
  kpi: kpiModule as ChartTypeModule,
  map: mapModule as ChartTypeModule,
  parallel: parallelModule as ChartTypeModule,
};
