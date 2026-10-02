/**
 * Quick calculations (F6): a fixed menu of derived measures on a measure of
 * the chart, for analysts who don't write SQL (`[R7]`).
 *
 * A calculation is stored on the chart as what the user chose — engine-neutral
 * data, like the rest of the chart — keyed by the measure it applies to. How
 * Cube computes each one is derived from it, never stored with it: the chart's
 * query asks xcube for it in a `calculations` block, and xcube answers it with
 * a companion multi-stage measure on the measure's own cube, generated when
 * first asked for (AC-048, R46; research `xcube-quick-calcs.md`).
 */

import type { ChartSpec } from './chart-spec';
import type { MemberFormats, MemberGranularities, TimeGranularity } from './format';
import type { RenderSpec } from './render-spec';

/** The six (AC-047), in the criterion's order, which is the menu's. */
export const QUICK_CALCS = [
  'percentOfTotal',
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'runningTotal',
  'rank',
  'movingAverage',
] as const;

export type QuickCalcKind = (typeof QUICK_CALCS)[number];

/**
 * The windows a moving average is offered over: 3 periods by default,
 * changeable in the menu to 6 or 12 (the user, 2026-09-24, `docs/handoff.md` §2).
 */
export const MOVING_AVERAGE_PERIODS = [3, 6, 12] as const;

export type MovingAveragePeriods = (typeof MOVING_AVERAGE_PERIODS)[number];

/** One calculation as the chart holds it. */
export type QuickCalc =
  | { readonly kind: Exclude<QuickCalcKind, 'movingAverage'> }
  | { readonly kind: 'movingAverage'; readonly periods: MovingAveragePeriods };

/** Each calculation by the name the criterion gives it (AC-047). */
export const QUICK_CALC_NAMES: Readonly<Record<QuickCalcKind, string>> = {
  percentOfTotal: '% of total',
  differenceFromPrevious: 'Difference from previous period',
  percentDifferenceFromPrevious: '% difference from previous period',
  runningTotal: 'Running total',
  rank: 'Rank',
  movingAverage: 'Moving average',
};

/** A calculation as applied: its name, and a moving average's window. */
export function quickCalcName(calc: QuickCalc): string {
  const name = QUICK_CALC_NAMES[calc.kind];
  return calc.kind === 'movingAverage' ? `${name}, ${String(calc.periods)} periods` : name;
}

/**
 * The chart with `measure`'s calculation set to `calc`, or taken off when
 * `calc` is undefined. The last one taken off leaves none stored, as there
 * were before any was applied.
 */
export function applyQuickCalc(
  spec: ChartSpec,
  measure: string,
  calc: QuickCalc | undefined,
): ChartSpec {
  const rest = Object.fromEntries(
    Object.entries(spec.calculations ?? {}).filter(([name]) => name !== measure),
  );
  const calculations = calc === undefined ? rest : { ...rest, [measure]: calc };
  if (Object.keys(calculations).length > 0) return { ...spec, calculations };
  const { calculations: _gone, ...without } = spec;
  void _gone;
  return without;
}

/** A stored chart's calculations, each one wechart offers, or a refusal naming the measure. */
export function readQuickCalcs(value: unknown): Readonly<Record<string, QuickCalc>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error("The chart's calculations are not a map of measures to calculations.");
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([measure, raw]) => {
      const calc = quickCalcOf(raw);
      if (calc === null) {
        throw new Error(`The calculation on ${measure} is not one wechart offers.`);
      }
      return [measure, calc];
    }),
  );
}

/**
 * The calculations that run along time (AC-049): the differences take the
 * previous period at the chart's grain, and a running total and a moving
 * average run over its periods. % of total and rank need no time field.
 */
export const OVER_TIME: ReadonlySet<QuickCalcKind> = new Set([
  'differenceFromPrevious',
  'percentDifferenceFromPrevious',
  'runningTotal',
  'movingAverage',
]);

/** The grains xcube computes a calculation over time at (research `xcube-quick-calcs.md`). */
export const CALC_GRANULARITIES = [
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const satisfies readonly TimeGranularity[];

export type CalcGranularity = (typeof CALC_GRANULARITIES)[number];

/**
 * The grain a chart's calculations over time run at, or why they are paused
 * (R45.4). xcube computes one only on a query with exactly one time dimension,
 * at the hour or coarser; otherwise it refuses the query (`granularity`).
 */
export type PeriodGrain =
  | { readonly granularity: CalcGranularity }
  | { readonly paused: 'noTime' }
  | { readonly paused: 'severalTimes'; readonly count: number }
  | {
      readonly paused: 'tooFine';
      readonly member: string;
      readonly granularity: TimeGranularity;
    };

/** The chart's period grain, from each time field's granularity as its query asks it. */
export function periodGrainOf(grains: MemberGranularities): PeriodGrain {
  const entries = Object.entries(grains);
  const [only] = entries;
  if (only === undefined) return { paused: 'noTime' };
  if (entries.length > 1) return { paused: 'severalTimes', count: entries.length };
  const [member, granularity] = only;
  const allowed = CALC_GRANULARITIES.find((each) => each === granularity);
  return allowed === undefined
    ? { paused: 'tooFine', member, granularity }
    : { granularity: allowed };
}

/** The grain calculations over time run at, or undefined while they are paused. */
function runningGrain(grain: PeriodGrain): CalcGranularity | undefined {
  return 'paused' in grain ? undefined : grain.granularity;
}

/**
 * The chart's calculations that Cube is asked for and the chart draws: those
 * on a measure the chart shows, a calculation over time only while the chart
 * has a period grain (R45.4: otherwise paused, and the plain measure drawn),
 * and none on a box plot, whose rows are each one observation.
 */
export function calculationsInEffect(
  spec: Pick<ChartSpec, 'measures' | 'calculations' | 'chartType'>,
  grain: PeriodGrain,
): Readonly<Record<string, QuickCalc>> {
  if (spec.chartType === 'boxplot') return {};
  return Object.fromEntries(
    Object.entries(spec.calculations ?? {}).filter(
      ([measure, calc]) =>
        spec.measures.includes(measure) &&
        (!OVER_TIME.has(calc.kind) || runningGrain(grain) !== undefined),
    ),
  );
}

/** Each calculation as xcube's `calculations` block names it (research `xcube-quick-calcs.md`). */
const XCUBE_KIND: Readonly<Record<QuickCalcKind, string>> = {
  percentOfTotal: 'pct_of_total',
  differenceFromPrevious: 'difference',
  percentDifferenceFromPrevious: 'pct_difference',
  runningTotal: 'running_total',
  rank: 'rank',
  movingAverage: 'moving_average',
};

/** One entry of a query's `calculations` block. */
export interface CalculationAsked {
  readonly measure: string;
  readonly kind: string;
  readonly periods?: MovingAveragePeriods;
}

/**
 * The `calculations` block that asks Cube for these, by measure name, so the
 * same calculations always make the same query, which is what lets an answer
 * be served from cache (AC-105).
 */
export function calculationBlock(
  calculations: Readonly<Record<string, QuickCalc>>,
): CalculationAsked[] {
  return Object.entries(calculations)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([measure, calc]) =>
      calc.kind === 'movingAverage'
        ? { measure, kind: XCUBE_KIND[calc.kind], periods: calc.periods }
        : { measure, kind: XCUBE_KIND[calc.kind] },
    );
}

/**
 * What a calculation adds to its measure's name (AC-048): "running total",
 * "difference from previous month", "3-month moving average". The same words
 * xcube's answer gives its column (research `xcube-quick-calcs.md`, "The
 * answer").
 */
export function quickCalcLabel(calc: QuickCalc, grain: PeriodGrain): string {
  const period = runningGrain(grain) ?? 'period';
  switch (calc.kind) {
    case 'percentOfTotal':
      return '% of total';
    case 'differenceFromPrevious':
      return `difference from previous ${period}`;
    case 'percentDifferenceFromPrevious':
      return `% difference from previous ${period}`;
    case 'runningTotal':
      return 'running total';
    case 'rank':
      return 'rank';
    case 'movingAverage':
      return `${String(calc.periods)}-${period} moving average`;
  }
}

/**
 * A calculated measure as a chart draws it: what its name gains, and how its
 * values are written where that differs from the measure's own format. A
 * share is a percentage and a rank a plain number; a difference, a running
 * total and a moving average are in the measure's own units.
 */
export interface CalculatedMeasure {
  readonly label: string;
  readonly format?: 'percent' | 'number';
}

/** Each calculation in effect, as its measure is drawn. */
export function calculatedMeasures(
  calculations: Readonly<Record<string, QuickCalc>>,
  grain: PeriodGrain,
): Readonly<Record<string, CalculatedMeasure>> {
  return Object.fromEntries(
    Object.entries(calculations).map(([measure, calc]) => {
      const label = quickCalcLabel(calc, grain);
      const format =
        calc.kind === 'percentOfTotal' || calc.kind === 'percentDifferenceFromPrevious'
          ? 'percent'
          : calc.kind === 'rank'
            ? 'number'
            : undefined;
      return [measure, format === undefined ? { label } : { label, format }];
    }),
  );
}

/** The model's names and formats for a drawn chart's members. */
export interface MemberLabels {
  readonly formats?: MemberFormats | undefined;
  readonly titles?: Readonly<Record<string, string>> | undefined;
  readonly shortTitles?: Readonly<Record<string, string>> | undefined;
}

/**
 * A drawn chart with the model's titles and formats put on it, each
 * calculated measure named with its calculation and written in its own way
 * (AC-048). Every place that writes a chart with the model's names goes
 * through here, so none can drop the calculation from the label. A map not
 * given is left as the chart has it.
 */
export function withMemberLabels(spec: RenderSpec, labels: MemberLabels): RenderSpec {
  const calculated = Object.entries(spec.calculated ?? {});
  const named = (
    names: Readonly<Record<string, string>>,
    fallback: Readonly<Record<string, string>> = {},
  ) => ({
    ...names,
    ...Object.fromEntries(
      calculated.map(([measure, { label }]) => [
        measure,
        `${names[measure] ?? fallback[measure] ?? measure} (${label})`,
      ]),
    ),
  });
  return {
    ...spec,
    ...(labels.formats === undefined
      ? {}
      : {
          formats: {
            ...labels.formats,
            ...Object.fromEntries(
              calculated.flatMap(([measure, { format }]) =>
                format === undefined ? [] : [[measure, format]],
              ),
            ),
          },
        }),
    ...(labels.titles === undefined ? {} : { titles: named(labels.titles) }),
    ...(labels.shortTitles === undefined
      ? {}
      : { shortTitles: named(labels.shortTitles, labels.titles) }),
  };
}

/**
 * A drawn chart's titles or formats for rows that carry no calculation — the
 * rows behind it, ungrouped — with every calculated measure's own label left
 * out: there, a measure is the measure as it is, never its calculation.
 */
export function withoutCalculations<T>(
  labels: Readonly<Record<string, T>> | undefined,
  spec: Pick<RenderSpec, 'calculated'> | undefined,
): Readonly<Record<string, T>> {
  const calculated = spec?.calculated ?? {};
  return Object.fromEntries(
    Object.entries(labels ?? {}).filter(([member]) => !Object.hasOwn(calculated, member)),
  );
}

/** What a measure is, as `/v1/meta` says: its type, and whether it is a rolling window. */
export interface MeasureKind {
  /** `aggType`, camelized as Cube reports it: `count`, `sum`, `countDistinct`… */
  readonly aggType?: string;
  readonly cumulative?: boolean;
}

const COUNTS: ReadonlySet<string> = new Set(['count', 'sum', 'countDistinct', 'countDistinctApprox']);
const DISTINCT: ReadonlySet<string> = new Set(['countDistinct', 'countDistinctApprox']);
const NUMBERS: ReadonlySet<string> = new Set([...COUNTS, 'avg', 'min', 'max', 'number']);

/** A measure's type as a reason names it. */
function typeName(aggType: string): string {
  switch (aggType) {
    case 'avg':
      return 'an average';
    case 'min':
      return 'a minimum';
    case 'max':
      return 'a maximum';
    case 'number':
      return 'a calculated number';
    case 'countDistinct':
    case 'countDistinctApprox':
      return 'a distinct count';
    default:
      return `a measure of type ${aggType}`;
  }
}

/**
 * Why a calculation is wrong for this measure's type (R46), or undefined when
 * it is right: the rule xcube computes by, and wechart's choice to disable %
 * of total for a distinct count, whose shares overlap (research
 * `xcube-quick-calcs.md`, "Which types take which calculation"). A measure
 * whose type isn't reported is left to Cube, which refuses with its reason.
 */
export function quickCalcTypeRefusal(kind: QuickCalcKind, measure: MeasureKind): string | undefined {
  if (measure.cumulative === true)
    return 'Not for a rolling measure: it already runs over time.';
  const { aggType } = measure;
  if (aggType === undefined) return undefined;
  if (!NUMBERS.has(aggType))
    return `Not for ${typeName(aggType)}: it takes a count, a sum, an average, a minimum, a maximum or a number.`;
  switch (kind) {
    case 'percentOfTotal':
      if (DISTINCT.has(aggType))
        return 'Not for a distinct count: one value can be counted in more than one row, so the shares would overlap.';
      return COUNTS.has(aggType)
        ? undefined
        : `Not for ${typeName(aggType)}: its values don’t add up to a total.`;
    case 'runningTotal':
      return COUNTS.has(aggType)
        ? undefined
        : `Not for ${typeName(aggType)}: adding up its periods gives no true total.`;
    case 'movingAverage':
      return COUNTS.has(aggType)
        ? undefined
        : `Not for ${typeName(aggType)}: averaging its periods gives no true average.`;
    case 'differenceFromPrevious':
    case 'percentDifferenceFromPrevious':
    case 'rank':
      return undefined;
  }
}

function quickCalcOf(raw: unknown): QuickCalc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, periods } = raw as Record<string, unknown>;
  if (kind === 'movingAverage') {
    return MOVING_AVERAGE_PERIODS.find((offered) => offered === periods) === undefined
      ? null
      : { kind, periods: periods as MovingAveragePeriods };
  }
  const known = QUICK_CALCS.find((each) => each === kind);
  return known === undefined || known === 'movingAverage' ? null : { kind: known };
}
