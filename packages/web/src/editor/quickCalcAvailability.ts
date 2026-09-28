import type { ChartSpec, QuickCalcKind } from '@wechart/core';

/**
 * The quick calculations that run along time (AC-049): the previous period is
 * a `time_shift` of the chart's time dimension, and a running total and a
 * moving average are rolling windows, which need a time dimension in the
 * query (research/cube/data-modeling.md Y.7, `rolling_window`;
 * research/cube/spike-model-store-and-quick-calcs.md §2). % of total and rank
 * need none.
 */
const OVER_TIME: ReadonlySet<QuickCalcKind> = new Set([
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'runningTotal',
  'movingAverage',
]);

/** "A", "A or B", "A, B or C". */
function eitherOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1] ?? ''}`;
}

/**
 * Why a quick calculation can't be applied to this chart (AC-049), or
 * undefined when it can: one that runs along time, on a chart with no time
 * dimension, says so and names the fields that would give it one — the time
 * fields of the chart's cube or view, `timeFields`, by title.
 */
export function quickCalcUnavailable(
  kind: QuickCalcKind,
  chart: Pick<ChartSpec, 'timeDimensions'>,
  timeFields: readonly string[],
): string | undefined {
  if (!OVER_TIME.has(kind) || chart.timeDimensions.length > 0) return undefined;
  return timeFields.length === 0
    ? 'Needs a time field in Time, and this cube or view has none.'
    : `Needs a time field in Time: add ${eitherOf(timeFields)}.`;
}
