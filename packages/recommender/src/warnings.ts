import { checkLegality } from './legality';
import { pieSlicesField } from './slices';
import type { Candidate, ChartType, Field, Signature } from './types';

/**
 * What a chosen type warns of (AC-218): the chart that type would draw from
 * these fields, put through the same hard rules the recommender rejects its
 * own candidates by — two value axes (direction.md rule 30), and each
 * channel's capacity (rule 6) — and each rule it fails, in the rule's words.
 *
 * The fields go where `compile` puts them (`defaultEncoding`): over time, the
 * time is the category and the first dimension the split; otherwise the first
 * dimension is the category and the second the split.
 */
export function warningsFor(
  chartType: ChartType,
  signature: Signature,
  /** The chart's Top N, which folds its category into N and one "Other" (AC-041). */
  { topN }: { topN?: number | undefined } = {},
): string[] {
  const of = (kind: Field['kind']) => signature.fields.filter((field) => field.kind === kind);
  const [measures, dimensions, times] = [of('measure'), of('dimension'), of('timeDimension')];
  // A country map colours each country by one value (T398's review): another
  // grouping splits its rows, and only one of them can be drawn. Its many
  // countries are no colour's capacity: the scale takes them all.
  if (chartType === 'map')
    return dimensions.length + times.length > 1
      ? [
          'A country map shows one value per country, and another grouping splits them, so each country shows only its first. Remove the other grouping to map the measure by country alone.',
        ]
      : [];
  const [category, split] =
    times[0] === undefined ? [dimensions[0], dimensions[1]] : [times[0], dimensions[0]];

  const candidate = candidateFor(
    chartType,
    measures,
    category,
    split,
    signature.rowCount,
    topN,
    dimensions[0],
  );
  if (candidate === undefined) return [];
  return checkLegality(candidate).flatMap((outcome) =>
    outcome.passed || outcome.reason === undefined ? [] : [outcome.reason],
  );
}

/** One of a combo's value axes, as its warning names it: its first measure and its unit. */
export interface ComboAxisSide {
  /** The axis's first measure, by its title. */
  readonly measure: string;
  /** Its format's unit: "$", "%", or "" for a plain number. */
  readonly unit: string;
  /** The axis's range as drawn leaves zero out. */
  readonly offZero?: boolean;
}

/** What a combo's two-scales warning offers, in its order (AC-218). */
export type ComboWarningOffer = 'oneAxis' | 'synchronize' | 'smallMultiples' | 'table';

/** A combo's two-scales warning (AC-218): its words, its offers, and whether Synchronize can be. */
export interface ComboWarning {
  readonly text: string;
  readonly offers: readonly ComboWarningOffer[];
  readonly synchronize:
    { readonly available: true } | { readonly available: false; readonly reason: string };
}

/**
 * The warning a combo gives its author while it draws two value axes that
 * aren't synchronized (T861; AC-218 as amended by R80; design 20 pin 6 and
 * state D), and none on one axis or two synchronized. Two formats: "Two
 * scales: Revenue ($) and Margin % (%) can be made to look related.", One
 * axis first. One format: "Revenue and Cost are both in $. On one scale they
 * compare honestly; on two, their gap is whatever the axes make it.",
 * Synchronize first. Either adds "The ‹left or right› axis doesn't start at
 * zero." for an axis drawn off zero. Each axis is named by its first
 * measure, in whose format it's written (decision T846-2); a plain number's
 * unit is "numbers".
 */
export function comboWarning({
  left,
  right,
  synchronize,
  synchronized,
}: {
  readonly left: ComboAxisSide;
  readonly right?: ComboAxisSide | undefined;
  readonly synchronize: ComboWarning['synchronize'];
  readonly synchronized: boolean;
}): ComboWarning | undefined {
  if (right === undefined || synchronized) return undefined;
  const unit = (side: ComboAxisSide) => (side.unit === '' ? 'numbers' : side.unit);
  const lead = synchronize.available
    ? `${left.measure} and ${right.measure} are both in ${unit(left)}. On one scale they compare honestly; on two, their gap is whatever the axes make it.`
    : `Two scales: ${left.measure} (${unit(left)}) and ${right.measure} (${unit(right)}) can be made to look related.`;
  const offZero = (['left', 'right'] as const)
    .filter((side) => (side === 'left' ? left : right).offZero === true)
    .map((side) => ` The ${side} axis doesn't start at zero.`)
    .join('');
  return {
    text: `${lead}${offZero}`,
    offers: synchronize.available
      ? ['synchronize', 'oneAxis', 'smallMultiples', 'table']
      : ['oneAxis', 'synchronize', 'smallMultiples', 'table'],
    synchronize,
  };
}

function candidateFor(
  chartType: ChartType,
  measures: readonly Field[],
  category: Field | undefined,
  split: Field | undefined,
  rowCount: number | undefined,
  topN: number | undefined,
  firstDimension: Field | undefined,
): Candidate | undefined {
  const at = (parts: Partial<Candidate>): Candidate => ({
    chartType,
    valueFields: measures.slice(0, 1),
    valueAxisCount: 1,
    ...(category === undefined ? {} : { categoryField: category }),
    ...parts,
  });
  switch (chartType) {
    // A table, a pivot and a KPI show every value as it is: nothing to exceed.
    case 'table':
    case 'pivot':
    case 'kpi':
      return undefined;
    // A combo warns of its two scales from its axes, not its fields
    // (`comboWarning`; AC-218 as amended by R80), and folds its split
    // within 8 series (AC-505), so its colours never run out.
    case 'combo':
      return undefined;
    case 'pie':
    case 'donut':
      // Every measure, so a pie of two says it shows one; its slices counted
      // as the recommender counts them.
      return at({
        valueFields: measures,
        ...(category === undefined
          ? {}
          : { categoryField: pieSlicesField(category, split, rowCount, topN) }),
      });
    case 'heatmap':
      return at(split === undefined ? {} : { secondCategoryField: split });
    case 'trellis':
      return at(split === undefined ? {} : { facetField: split });
    case 'boxplot':
      // Its boxes lie along an axis, and colour carries nothing (T399's review).
      return at({});
    case 'scatter':
      // Both measures on the axes, coloured by the first dimension — as
      // `compile` colours a scatter, whatever else there is (T242).
      return at({
        valueFields: measures.slice(0, 2),
        ...(firstDimension === undefined ? {} : { colorField: firstDimension }),
      });
    default:
      return at(split === undefined ? {} : { colorField: split });
  }
}
