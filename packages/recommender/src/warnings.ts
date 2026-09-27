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
    case 'combo':
      return at({ valueFields: measures.slice(0, 2), valueAxisCount: 2 });
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
