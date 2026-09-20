import type { Candidate, RuleOutcome } from './types';

/**
 * The hard rules: a candidate that fails any of these is never offered, as the
 * top pick or as a runner-up (AC-030, AC-031).
 *
 * Rule names follow Draco's `hard.lp` where one matches, so the trace AC-029
 * shows can be compared against published constraints
 * (docs/research/recommender-algorithms.md §2). Where Draco has no equivalent,
 * the name is ours and the doc says so.
 */

/**
 * Channel capacity. These four numbers are **product decisions**, not figures
 * from the graphical-perception literature — the research went looking and
 * found no published maximum for colours, trellis panels, pie slices or
 * heatmap cells (docs/research/recommender-algorithms.md §5, direction.md §5).
 * They are stated here as the single place they are enforced.
 */
export const CAPS = {
  /** Matches the validated categorical palette, which has exactly 8 slots. */
  colorCategories: 8,
  trellisPanels: 20,
  pieSlices: 6,
  heatmapCells: 200,
} as const;

type Rule = (candidate: Candidate) => RuleOutcome;

const pass = (rule: string): RuleOutcome => ({ rule, passed: true });
const fail = (rule: string, reason: string): RuleOutcome => ({ rule, passed: false, reason });

/**
 * AC-030. No Draco equivalent: its design space has one mark per view and no
 * dual-axis construct, so this rule is ours (research §2).
 *
 * Two value axes let a chart imply a relationship between series by the
 * arbitrary choice of two scales, which is the single most common way a chart
 * misleads (direction.md rule 8).
 */
const noDualValueAxis: Rule = (candidate) =>
  candidate.valueAxisCount > 1
    ? fail(
        'no_dual_value_axis',
        'Two value axes let the chart imply a relationship that comes from the choice of scales. Use two charts, or index both measures to a common base.',
      )
    : pass('no_dual_value_axis');

const colorCapacity: Rule = (candidate) => {
  const categories = candidate.colorField?.cardinality;
  return categories !== undefined && categories > CAPS.colorCategories
    ? fail(
        'high_cardinality_color',
        `Colour carries ${String(CAPS.colorCategories)} categories at most; this needs ${String(categories)}.`,
      )
    : pass('high_cardinality_color');
};

const trellisCapacity: Rule = (candidate) => {
  const panels = candidate.facetField?.cardinality;
  return panels !== undefined && panels > CAPS.trellisPanels
    ? fail(
        'high_cardinality_facet',
        `A trellis shows ${String(CAPS.trellisPanels)} panels at most; this needs ${String(panels)}.`,
      )
    : pass('high_cardinality_facet');
};

const pieCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'pie' && candidate.chartType !== 'donut') {
    return pass('pie_slice_capacity');
  }
  const slices = candidate.categoryField?.cardinality;
  return slices !== undefined && slices > CAPS.pieSlices
    ? fail(
        'pie_slice_capacity',
        `A pie is readable up to ${String(CAPS.pieSlices)} slices; this has ${String(slices)}.`,
      )
    : pass('pie_slice_capacity');
};

const heatmapCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'heatmap') return pass('heatmap_cell_capacity');

  const rows = candidate.categoryField?.cardinality;
  const columns = candidate.secondCategoryField?.cardinality;
  if (rows === undefined || columns === undefined) return pass('heatmap_cell_capacity');

  const cells = rows * columns;
  return cells > CAPS.heatmapCells
    ? fail(
        'heatmap_cell_capacity',
        `A heatmap stays readable up to ${String(CAPS.heatmapCells)} cells; this has ${String(cells)}.`,
      )
    : pass('heatmap_cell_capacity');
};

/** Draco `pie_without_single_measure`-shaped: a pie shows one measure's parts. */
const pieNeedsOneMeasure: Rule = (candidate) => {
  if (candidate.chartType !== 'pie' && candidate.chartType !== 'donut') {
    return pass('pie_single_measure');
  }
  return candidate.valueFields.length === 1
    ? pass('pie_single_measure')
    : fail('pie_single_measure', 'A pie divides one measure into parts, not several.');
};

/** Draco `no_encodings`: a chart with nothing on it is not a chart. */
const needsSomethingToDraw: Rule = (candidate) =>
  candidate.valueFields.length === 0 && candidate.categoryField === undefined
    ? fail('no_encodings', 'The chart has no fields to draw.')
    : pass('no_encodings');

export const HARD_RULES: readonly Rule[] = [
  needsSomethingToDraw,
  noDualValueAxis,
  colorCapacity,
  trellisCapacity,
  pieCapacity,
  heatmapCapacity,
  pieNeedsOneMeasure,
];

/** Every rule's verdict, in order — this is what AC-029's trace shows. */
export function checkLegality(candidate: Candidate): RuleOutcome[] {
  return HARD_RULES.map((rule) => rule(candidate));
}

export function isLegal(candidate: Candidate): boolean {
  return checkLegality(candidate).every((outcome) => outcome.passed);
}
