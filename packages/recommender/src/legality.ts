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
  /** R81's (T968, AC-031; design 23 Q5 (a)): a KPI's tiles, at the trellis's panel cap. */
  kpiTiles: 20,
  /** R81's (T1012, AC-031; design 23 sheet 10): a Sankey's flows, as it folds past them. */
  sankeyFlows: 50,
} as const;

type Rule = (candidate: Candidate) => RuleOutcome;

/**
 * A field whose cardinality nobody knows is treated as **over** any cap, not
 * under it.
 *
 * The two guesses are not symmetric: assuming small offers a pie that then
 * draws five hundred slices, while assuming large offers a bar for a category
 * that turns out to have four values — a worse chart, not a broken one. So an
 * absent count fails a capacity rule. A channel carrying no field at all is a
 * different thing and passes.
 */
const countFor = (field: Candidate['colorField']) =>
  field === undefined ? null : (field.cardinality ?? Number.POSITIVE_INFINITY);

const describeCount = (count: number) =>
  Number.isFinite(count) ? String(count) : 'an unknown number of';

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
  const categories = countFor(candidate.colorField);
  return categories !== null && categories > CAPS.colorCategories
    ? fail(
        'high_cardinality_color',
        `Colour carries ${String(CAPS.colorCategories)} categories at most; this needs ${describeCount(categories)}.`,
      )
    : pass('high_cardinality_color');
};

const trellisCapacity: Rule = (candidate) => {
  // A KPI's tiles are its own rule's (T969): one reason, not two.
  if (candidate.chartType === 'kpi') return pass('high_cardinality_facet');
  const panels = countFor(candidate.facetField);
  return panels !== null && panels > CAPS.trellisPanels
    ? fail(
        'high_cardinality_facet',
        `A trellis shows ${String(CAPS.trellisPanels)} panels at most; this needs ${describeCount(panels)}.`,
      )
    : pass('high_cardinality_facet');
};

const pieCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'pie' && candidate.chartType !== 'donut') {
    return pass('pie_slice_capacity');
  }
  const slices = countFor(candidate.categoryField);
  return slices !== null && slices > CAPS.pieSlices
    ? fail(
        'pie_slice_capacity',
        `A pie is readable up to ${String(CAPS.pieSlices)} slices; this has ${describeCount(slices)}.`,
      )
    : pass('pie_slice_capacity');
};

const heatmapCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'heatmap') return pass('heatmap_cell_capacity');

  const rows = countFor(candidate.categoryField);
  const columns = countFor(candidate.secondCategoryField);
  if (rows === null || columns === null) return pass('heatmap_cell_capacity');

  const cells = rows * columns;
  return cells > CAPS.heatmapCells
    ? fail(
        'heatmap_cell_capacity',
        `A heatmap stays readable up to ${String(CAPS.heatmapCells)} cells; this has ${describeCount(cells)}.`,
      )
    : pass('heatmap_cell_capacity');
};

/**
 * A KPI tiled by a dimension (R81, T968, AC-031): a tile per member, at most
 * as many as a trellis has panels. Ours; Draco has no KPI.
 */
const kpiTileCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'kpi') return pass('kpi_tile_capacity');
  const tiles = countFor(candidate.facetField);
  return tiles !== null && tiles > CAPS.kpiTiles
    ? fail(
        'kpi_tile_capacity',
        `A KPI shows ${String(CAPS.kpiTiles)} tiles at most; this needs ${describeCount(tiles)}.`,
      )
    : pass('kpi_tile_capacity');
};

/**
 * A Sankey of at most 50 flows (R81, T1012, AC-031): its pairs as the query
 * answered them, an unknown count read as over, as every cap reads one.
 */
const sankeyFlowCapacity: Rule = (candidate) => {
  if (candidate.chartType !== 'sankey') return pass('sankey_flow_capacity');
  const flows = candidate.flows ?? Number.POSITIVE_INFINITY;
  return flows > CAPS.sankeyFlows
    ? fail(
        'sankey_flow_capacity',
        `A Sankey draws ${String(CAPS.sankeyFlows)} flows at most; this has ${describeCount(flows)}.`,
      )
    : pass('sankey_flow_capacity');
};

/** A Sankey's widths add up only for a summed measure: Cube's sum or count (T1012, AC-031). */
const sankeySummed: Rule = (candidate) => {
  if (candidate.chartType !== 'sankey') return pass('sankey_summed_measure');
  const [measure] = candidate.valueFields;
  return measure?.aggType === 'sum' || measure?.aggType === 'count'
    ? pass('sankey_summed_measure')
    : fail('sankey_summed_measure', 'A Sankey’s widths add up only for a summed measure.');
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
  kpiTileCapacity,
  sankeyFlowCapacity,
  sankeySummed,
];

/** Every rule's verdict, in order — this is what AC-029's trace shows. */
export function checkLegality(candidate: Candidate): RuleOutcome[] {
  return HARD_RULES.map((rule) => rule(candidate));
}

export function isLegal(candidate: Candidate): boolean {
  return checkLegality(candidate).every((outcome) => outcome.passed);
}
