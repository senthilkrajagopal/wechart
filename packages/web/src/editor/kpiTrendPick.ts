import { kpiOptionsOf, withKpiOptions, type ChartType, type TimeGranularity } from '@wechart/core';
import type { Recommendations } from '@wechart/recommender';

/**
 * The options a quick pick sets with its type (T968, AC-560): "KPI with
 * trend", offered after Line for one measure over time, draws what it says —
 * the KPI, its Time the chart's time dimension at the chart's grain (the
 * month where it has none), so its trend is drawn. A KPI that has a Time
 * keeps it; any other pick sets nothing.
 */
export function optionsOnPick(
  type: ChartType,
  recommendation: Recommendations,
  options: Readonly<Record<string, unknown>>,
  granularities: Readonly<Record<string, TimeGranularity>> | undefined,
): Record<string, unknown> | undefined {
  if (type !== 'kpi') return undefined;
  const offered = [recommendation.top, ...recommendation.runnersUp].find(
    (each) => each?.candidate.chartType === 'kpi',
  );
  const time = offered?.candidate.categoryField;
  if (time?.kind !== 'timeDimension') return undefined;
  const kpi = kpiOptionsOf(options);
  if (kpi.time !== undefined) return undefined;
  // A KPI tiled (T969, AC-561): a tile per member of its dimension too.
  const tileBy = offered?.candidate.facetField?.name;
  return withKpiOptions(options, {
    ...kpi,
    time: { member: time.name, granularity: granularities?.[time.name] ?? 'month' },
    ...(tileBy === undefined || kpi.tileBy !== undefined ? {} : { tileBy }),
  });
}
