import { isLegal } from './legality';
import { pieSlicesField } from './slices';
import type { Candidate, ChartType, Field, Signature } from './types';

/**
 * Enumerate, filter, rank — the shape CompassQL uses and the one the research
 * recommends for us (docs/research/recommender-algorithms.md §3): produce the
 * candidates a signature allows, drop the illegal ones (T027), and order what
 * is left by a weighted score.
 *
 * The scoring weights are ours. Draco's shipped weights are hand-tuned rather
 * than learned, and its design space has no pie, no KPI and no table, so they
 * could not be ported wholesale (research §7). What *is* ported is the shape —
 * a cost summed from named soft rules, lower being better — and the ordering of
 * channels by data type from Draco-APT and CompassQL's type↔channel table.
 */

export interface Recommendation {
  readonly candidate: Candidate;
  /** Lower is better, as in Draco: cost, not merit. */
  readonly score: number;
  /** AC-028: at most 80 characters. */
  readonly reason: string;
}

export interface Recommendations {
  readonly top: Recommendation | null;
  readonly runnersUp: readonly Recommendation[];
}

/** AC-028 states the limit; it is enforced here and asserted in the tests. */
export const MAX_REASON_LENGTH = 80;

const measuresOf = (signature: Signature) =>
  signature.fields.filter((field) => field.kind === 'measure');
const dimensionsOf = (signature: Signature) =>
  signature.fields.filter((field) => field.kind === 'dimension');
const timesOf = (signature: Signature) =>
  signature.fields.filter((field) => field.kind === 'timeDimension');

/** Unknown cardinality is treated as large: the optimistic guess is the one that misleads. */
const cardinality = (field: Field | undefined) => field?.cardinality ?? Number.POSITIVE_INFINITY;

function build(chartType: ChartType, parts: Partial<Candidate>): Candidate {
  return {
    chartType,
    valueFields: [],
    valueAxisCount: 1,
    ...parts,
  };
}

/**
 * Every chart the signature could be drawn as. Legality and scoring decide
 * which survive; enumeration is deliberately generous so a good candidate is
 * never missing for want of being considered.
 */
export function enumerate(signature: Signature): Candidate[] {
  const measures = measuresOf(signature);
  const dimensions = dimensionsOf(signature);
  const times = timesOf(signature);
  const candidates: Candidate[] = [];

  if (measures.length === 0 && dimensions.length === 0 && times.length === 0) return [];

  // A measure on its own is a number, not a chart.
  if (measures.length >= 1 && dimensions.length === 0 && times.length === 0) {
    candidates.push(build('kpi', { valueFields: measures.slice(0, 1) }));
    if (measures.length > 1) candidates.push(build('table', { valueFields: measures }));
  }

  // Over time.
  if (measures.length >= 1 && times.length >= 1) {
    const time = times[0]!;
    candidates.push(
      build(measures.length > 1 ? 'multiLine' : 'line', {
        valueFields: measures,
        categoryField: time,
      }),
    );
    candidates.push(build('area', { valueFields: measures.slice(0, 1), categoryField: time }));
    candidates.push(build('bar', { valueFields: measures.slice(0, 1), categoryField: time }));
    if (dimensions[0]) {
      candidates.push(
        build('trellis', {
          valueFields: measures.slice(0, 1),
          categoryField: time,
          facetField: dimensions[0],
        }),
      );
    }
  }

  // By category.
  if (measures.length >= 1 && dimensions.length >= 1 && times.length === 0) {
    const [first, second] = dimensions;
    candidates.push(build('bar', { valueFields: measures.slice(0, 1), categoryField: first! }));
    candidates.push(build('hbar', { valueFields: measures.slice(0, 1), categoryField: first! }));
    // Its slices as it draws them: a slice per row when split (AC-221).
    candidates.push(
      build('pie', {
        valueFields: measures.slice(0, 1),
        categoryField: pieSlicesField(first!, second, signature.rowCount),
      }),
    );
    candidates.push(build('treemap', { valueFields: measures.slice(0, 1), categoryField: first! }));

    if (second) {
      candidates.push(
        build('groupedBar', {
          valueFields: measures.slice(0, 1),
          categoryField: first!,
          colorField: second,
        }),
      );
      candidates.push(
        build('stackedBar', {
          valueFields: measures.slice(0, 1),
          categoryField: first!,
          colorField: second,
        }),
      );
      candidates.push(
        build('heatmap', {
          valueFields: measures.slice(0, 1),
          categoryField: first!,
          secondCategoryField: second,
        }),
      );
    }
  }

  // Two measures against each other.
  if (measures.length >= 2) {
    candidates.push(
      build('scatter', {
        valueFields: measures.slice(0, 2),
        ...(dimensions[0] ? { colorField: dimensions[0] } : {}),
      }),
    );
  }

  // Always available, and the fallback when nothing else fits.
  candidates.push(
    build('table', {
      valueFields: measures,
      ...(dimensions[0] ? { categoryField: dimensions[0] } : {}),
    }),
  );

  return candidates;
}

interface SoftRule {
  readonly name: string;
  readonly weight: number;
  readonly applies: (candidate: Candidate, signature: Signature) => boolean;
}

/**
 * Cost, summed. Lower is better, following Draco's `Cost(v) = Σ wᵢ·nᵢ(v)`
 * (research §2). The weights are ordinal judgements, not measurements, and are
 * kept in one place so they can be refitted later without touching the rules.
 */
export const SOFT_RULES: readonly SoftRule[] = [
  {
    // Position is read more accurately than angle or area (Heer & Bostock 2010,
    // research §6), so a pie costs more than a bar for the same data.
    name: 'prefer_position_over_angle',
    weight: 8,
    applies: (candidate) => candidate.chartType === 'pie' || candidate.chartType === 'donut',
  },
  {
    name: 'prefer_position_over_area',
    weight: 9,
    applies: (candidate) => candidate.chartType === 'treemap',
  },
  {
    // A time dimension drawn as discrete categories loses the shape of the
    // series; Draco's c_d_overlap_bar is the same judgement.
    name: 'time_as_categories',
    weight: 6,
    applies: (candidate, signature) =>
      timesOf(signature).length > 0 &&
      (candidate.chartType === 'bar' || candidate.chartType === 'hbar'),
  },
  {
    name: 'line_without_time',
    weight: 10,
    applies: (candidate, signature) =>
      timesOf(signature).length === 0 &&
      (candidate.chartType === 'line' || candidate.chartType === 'multiLine'),
  },
  {
    // Draco `horizontal_scrolling_x`: past about 50 categories a vertical bar
    // chart is a scrollbar with ink on it.
    name: 'horizontal_scrolling_x',
    weight: 7,
    applies: (candidate) =>
      candidate.chartType === 'bar' && cardinality(candidate.categoryField) > 50,
  },
  {
    // …and a horizontal bar chart is the answer to that, so it costs less there.
    name: 'many_categories_prefer_horizontal',
    weight: 2,
    applies: (candidate) =>
      candidate.chartType === 'hbar' && cardinality(candidate.categoryField) <= 12,
  },
  {
    name: 'table_is_a_last_resort',
    weight: 12,
    applies: (candidate) => candidate.chartType === 'table' || candidate.chartType === 'pivot',
  },
  {
    // A KPI is right for a single number and wrong for anything else, but
    // enumeration only offers it for a single number.
    name: 'prefer_kpi_for_one_number',
    weight: 0,
    applies: (candidate) => candidate.chartType === 'kpi',
  },
];

export function score(candidate: Candidate, signature: Signature): number {
  return SOFT_RULES.filter((rule) => rule.applies(candidate, signature)).reduce(
    (total, rule) => total + rule.weight,
    0,
  );
}

const REASONS: Record<ChartType, string> = {
  kpi: 'One number, shown as a number.',
  bar: 'Compares a measure across categories by length.',
  hbar: 'Long category names read better across than down.',
  groupedBar: 'Compares two categories side by side.',
  stackedBar: 'Shows parts and the whole in one bar.',
  line: 'A measure over time reads as a trend.',
  multiLine: 'Several measures over time, on one scale.',
  area: 'A trend with the volume beneath it.',
  stackedArea: 'Parts of a whole, over time.',
  scatter: 'Two measures against each other shows their relationship.',
  pie: 'Parts of one whole, when there are few of them.',
  donut: 'Parts of one whole, with room in the middle.',
  treemap: 'Nested parts, sized by the measure.',
  heatmap: 'Two categories crossed, with the measure as colour.',
  table: 'The values themselves, when no chart reads better.',
  pivot: 'Two categories crossed, as numbers.',
  trellis: 'One small chart per category, on a shared scale.',
  combo: 'Two measures of the same scale together.',
};

function reasonFor(candidate: Candidate): string {
  const reason = REASONS[candidate.chartType];
  return reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

/**
 * AC-028: a top pick and at least one runner-up, each with a short reason.
 *
 * Runners-up are meaningfully different from the winner rather than near
 * duplicates of it — Voyager groups by chart type and shows one of each, so an
 * alternative is a different way of seeing the data rather than the same chart
 * transposed (research §3).
 */
export function recommend(signature: Signature, runnerUpCount = 2): Recommendations {
  const ranked = enumerate(signature)
    .filter(isLegal)
    .map((candidate) => ({
      candidate,
      score: score(candidate, signature),
      reason: reasonFor(candidate),
    }))
    .sort((a, b) => a.score - b.score);

  const seen = new Set<ChartType>();
  const distinct = ranked.filter((recommendation) => {
    if (seen.has(recommendation.candidate.chartType)) return false;
    seen.add(recommendation.candidate.chartType);
    return true;
  });

  const [top, ...rest] = distinct;
  return { top: top ?? null, runnersUp: rest.slice(0, runnerUpCount) };
}
