/**
 * Quick calculations (F6): a fixed menu of derived measures on a measure of
 * the chart, for analysts who don't write SQL (`[R7]`).
 *
 * A calculation is stored on the chart as what the user chose — engine-neutral
 * data, like the rest of the chart — keyed by the measure it applies to. How
 * Cube computes each one (a generated multi-stage companion, AC-048) is derived
 * from it, never stored with it (research/cube/spike-model-store-and-quick-calcs.md §2).
 */

import type { ChartSpec } from './chart-spec';

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
