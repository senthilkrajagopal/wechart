import {
  OVER_TIME,
  granularitiesOf,
  periodGrainOf,
  quickCalcTypeRefusal,
  type ChartSpec,
  type MeasureKind,
  type QuickCalcKind,
} from '@wechart/core';

/** "A", "A or B", "A, B or C". */
function eitherOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1] ?? ''}`;
}

/** What else is known of the measure and the chart's fields. */
export interface CalcAvailabilityOptions {
  /** The measure's type, as `/v1/meta` gives it (R46). */
  readonly measure?: MeasureKind | undefined;
  /** A field as a reader knows it. */
  readonly titleOf?: ((member: string) => string) | undefined;
}

/**
 * Why a quick calculation running over time can't run on this chart, or
 * undefined when it can (AC-049, R45.4). The previous period, a running
 * total and a moving average run over the chart's periods, so they need its
 * time field; xcube computes them on exactly one, at the hour or coarser
 * (research `xcube-quick-calcs.md`, "The `calculations` block"). One with
 * no time field names the time fields of the chart's cube or view that would
 * give it one, `timeFields`, by title.
 */
export function overTimeUnavailable(
  kind: QuickCalcKind,
  chart: Pick<ChartSpec, 'timeDimensions' | 'granularities'>,
  timeFields: readonly string[],
  titleOf: (member: string) => string = (member) => member,
): string | undefined {
  if (!OVER_TIME.has(kind)) return undefined;
  const grain = periodGrainOf(granularitiesOf(chart.timeDimensions, chart.granularities));
  if (!('paused' in grain)) return undefined;
  switch (grain.paused) {
    case 'noTime':
      return timeFields.length === 0
        ? 'Needs a time field in Time, and this cube or view has none.'
        : `Needs a time field in Time: add ${eitherOf(timeFields)}.`;
    case 'severalTimes':
      return `Needs one time field in Time, and this chart has ${String(grain.count)}.`;
    case 'tooFine':
      return `Needs ${titleOf(grain.member)} by the hour or longer.`;
  }
}

/**
 * Why a quick calculation can't be applied to this measure on this chart, or
 * undefined when it can: one that would be wrong for the measure's type
 * (R46), said first, as nothing about the chart changes that; then one that
 * runs over time without the time field it needs (AC-049).
 */
export function quickCalcUnavailable(
  kind: QuickCalcKind,
  chart: Pick<ChartSpec, 'timeDimensions' | 'granularities'>,
  timeFields: readonly string[],
  { measure, titleOf }: CalcAvailabilityOptions = {},
): string | undefined {
  return (
    (measure === undefined ? undefined : quickCalcTypeRefusal(kind, measure)) ??
    overTimeUnavailable(kind, chart, timeFields, titleOf)
  );
}
