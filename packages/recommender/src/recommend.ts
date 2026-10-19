import { undrawnOf } from '@wechart/core';

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

/**
 * A measure whose values add up (T969): Cube's `sum` and `count`, as
 * charts' `isAdditive` reads them. Unknown isn't: a share of a total
 * nobody knows to be one would be a claim about the data.
 */
const isSummed = (field: Field) => field.aggType === 'sum' || field.aggType === 'count';

/** A measure's scale, a plain number where unknown (T510). */
const scaleOfField = (field: Field) => field.scale ?? 'number';

/** How many scales the measures are on. */
const onScales = (measures: readonly Field[]) => new Set(measures.map(scaleOfField)).size;

/**
 * The metrics a candidate's form leaves undrawn (T510): as `undrawnOf` in
 * @wechart/core says it for the drawn chart, so the editor's pills and the
 * pick agree. A one-axis form split by colour, or small multiples panelled
 * by a member, draw their first metric alone.
 */
function dropsOf(candidate: Candidate, signature: Signature): number {
  const measures = measuresOf(signature);
  const scales = new Map(measures.map((field) => [field.name, scaleOfField(field)]));
  return undrawnOf({
    chartType: candidate.chartType,
    measures: measures.map((field) => field.name),
    split: candidate.colorField !== undefined || candidate.facetField !== undefined,
    scaleOf: (member) => scales.get(member) ?? 'number',
  }).length;
}

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

  /**
   * R81's (T968, AC-560): a Target makes a bullet per member of one
   * dimension, or a single bullet with none; one measure over time is also
   * a KPI with its trend; 4 or more measures by one dimension are lines
   * across their axes.
   */
  if (signature.target === true && measures.length >= 1 && times.length === 0) {
    if (dimensions.length <= 1)
      candidates.push(
        build('bullet', {
          valueFields: measures.slice(0, 1),
          ...(dimensions[0] === undefined ? {} : { categoryField: dimensions[0] }),
        }),
      );
  }
  if (measures.length === 1 && times.length >= 1 && dimensions.length === 0)
    candidates.push(build('kpi', { valueFields: measures, categoryField: times[0]! }));
  if (measures.length >= 4 && dimensions.length === 1 && times.length === 0)
    candidates.push(build('parallel', { valueFields: measures, categoryField: dimensions[0]! }));

  /**
   * R81's runners-up (T969, AC-561), never first: a summed measure stacked
   * at 100 % by at most 8 members, beside the stack at Sum; a measure over
   * time by one dimension of more than 8 members, a row each with its trend;
   * one measure over time by a dimension, a KPI tile per member.
   */
  const summed = measures[0] !== undefined && isSummed(measures[0]);
  if (summed && dimensions.length === 2 && times.length === 0)
    candidates.push(
      build('stackedBar', {
        valueFields: measures.slice(0, 1),
        categoryField: dimensions[0]!,
        colorField: dimensions[1]!,
        stack: 'percent',
      }),
    );
  if (summed && dimensions.length === 1 && times.length >= 1)
    candidates.push(
      build('stackedArea', {
        valueFields: measures.slice(0, 1),
        categoryField: times[0]!,
        colorField: dimensions[0]!,
        stack: 'percent',
      }),
    );
  if (
    measures.length >= 1 &&
    times.length >= 1 &&
    dimensions.length === 1 &&
    cardinality(dimensions[0]) > 8
  )
    candidates.push(
      build('graphicalTable', { valueFields: measures, categoryField: dimensions[0]! }),
    );
  if (measures.length === 1 && times.length >= 1 && dimensions.length === 1)
    candidates.push(
      build('kpi', { valueFields: measures, categoryField: times[0]!, facetField: dimensions[0]! }),
    );

  // Over time. `compile` colours these by the first dimension where there is
  // one (`defaultEncoding`), so each carries it as its colour, and the colour
  // cap applies to it (T305, AC-031).
  if (measures.length >= 1 && times.length >= 1) {
    const time = times[0]!;
    const split = dimensions[0] ? { colorField: dimensions[0] } : {};
    candidates.push(
      build(measures.length > 1 ? 'multiLine' : 'line', {
        valueFields: measures,
        categoryField: time,
        ...split,
      }),
    );
    candidates.push(
      build('area', { valueFields: measures.slice(0, 1), categoryField: time, ...split }),
    );
    candidates.push(
      build('bar', { valueFields: measures.slice(0, 1), categoryField: time, ...split }),
    );
    if (dimensions[0]) {
      candidates.push(
        build('trellis', {
          valueFields: measures.slice(0, 1),
          categoryField: time,
          facetField: dimensions[0],
        }),
      );
      // Time down its rows, the dimension across: no colour and no panels to
      // cap, so a dimension too large for either still has a chart beside the
      // table (T305's review, AC-028's runner-up).
      candidates.push(
        build('pivot', {
          valueFields: measures,
          categoryField: time,
          secondCategoryField: dimensions[0],
        }),
      );
    }
  }

  // By category.
  if (measures.length >= 1 && dimensions.length >= 1 && times.length === 0) {
    const [first, second] = dimensions;
    // Coloured by the second dimension where there is one, as `compile`
    // draws them (T305, AC-031).
    const split = second ? { colorField: second } : {};
    candidates.push(
      build('bar', { valueFields: measures.slice(0, 1), categoryField: first!, ...split }),
    );
    candidates.push(
      build('hbar', { valueFields: measures.slice(0, 1), categoryField: first!, ...split }),
    );
    // Its slices as it draws them: a slice per row when split (AC-221).
    candidates.push(
      build('pie', {
        valueFields: measures.slice(0, 1),
        categoryField: pieSlicesField(first!, second, signature.rowCount),
      }),
    );
    candidates.push(build('treemap', { valueFields: measures.slice(0, 1), categoryField: first! }));
    // By country, where the one grouping holds ISO-3 codes (T398, AC-305):
    // its countries shaded by the measure. A second grouping has nowhere to go.
    if (first!.countryCodes === true && second === undefined) {
      candidates.push(build('map', { valueFields: measures.slice(0, 1), categoryField: first! }));
    }

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

  /**
   * Metrics on different scales, by one grouping: small multiples, a panel
   * per metric, each on its own scale (T510; UX-057, the user's option (a)).
   * Two groupings leave no one axis to draw each panel along.
   */
  const [grouping, another] = [...times, ...dimensions];
  if (grouping !== undefined && another === undefined && onScales(measures) > 1) {
    candidates.push(build('trellis', { valueFields: measures, categoryField: grouping }));
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
  {
    /**
     * Metrics on different scales: Auto never picks a form that drops one
     * (T510; UX-057, design 01-5 item 5; R67). One that leaves a metric out —
     * a second on another scale, or past the one a pie, a KPI or a split bar
     * draws — costs more than a table, which draws them all. Offered still, as
     * a runner-up, its pill saying "not drawn" when chosen. Of one scale, the
     * picks stand: whether Auto should avoid dropping those too is open.
     */
    name: 'drops_a_metric',
    weight: 20,
    applies: (candidate, signature) =>
      onScales(measuresOf(signature)) > 1 && dropsOf(candidate, signature) > 0,
  },
  {
    /**
     * Two measures on different scales with nothing to group by are one row:
     * a scatter of them is one point, which a table says better (T510, where
     * a KPI of the first no longer wins for dropping the second). Ours.
     */
    name: 'scatter_of_one_point',
    weight: 13,
    applies: (candidate, signature) =>
      candidate.chartType === 'scatter' &&
      onScales(measuresOf(signature)) > 1 &&
      dimensionsOf(signature).length === 0 &&
      timesOf(signature).length === 0,
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
  boxplot: 'How a measure’s values spread within each category.',
  map: 'A measure by country, shaded on a map.',
  // R81's types (T934), each card's purpose as a reason; T968 and T1012
  // decide when each is offered (AC-560, AC-561).
  waterfall: 'What moved a total from one value to another.',
  histogram: 'One numeric field: bins show its shape and where outliers sit.',
  bubble: 'Three measures: across, up, and size.',
  parallel: 'Compares members across 3 or more measures.',
  bullet: 'Each member against its target and bands.',
  sankey: 'How volume flows between stages or categories.',
  funnel: 'Where volume drops between steps.',
  timeline: 'Start and end on one time axis show overlaps.',
  calendar: 'A calendar shows weekday and seasonal patterns.',
  icicle: 'Each level’s share of the total, as lengths.',
  graphicalTable: 'A row per member, with its trend and target at a glance.',
};

/** A candidate's reason where its form says more than its type. */
function formReasonOf(candidate: Candidate, signature: Signature): string | undefined {
  const { chartType, categoryField, facetField } = candidate;
  // Small multiples by metric, not by a member (T510).
  if (chartType === 'trellis' && facetField === undefined && candidate.valueFields.length > 1)
    return 'One small chart per metric, each on its own scale.';
  // R81's runners-up (T969, AC-561), where no titles are at hand
  // (`runnerUpReasonFor` says them from the data).
  if (candidate.stack === 'percent') return 'Each stack adds to 100 %: the mix, not the totals.';
  if (chartType === 'kpi' && facetField !== undefined)
    return 'A KPI per member: each one’s number and its trend.';
  // R81's KPI and bullet forms (T968, AC-560).
  if (chartType === 'kpi' && categoryField?.kind === 'timeDimension')
    return 'KPI with trend: this period’s number, its trend beneath.';
  if (chartType === 'kpi' && signature.target === true && categoryField === undefined)
    return 'One number against its target.';
  if (chartType === 'bullet' && categoryField === undefined)
    return 'A single bullet: the number against its target and bands.';
  return undefined;
}

function reasonFor(candidate: Candidate, signature: Signature): string {
  const reason = formReasonOf(candidate, signature) ?? REASONS[candidate.chartType];
  return reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

/** R81's types (T934): none is the top pick but where AC-560 names it. */
const R81_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'waterfall',
  'histogram',
  'bubble',
  'parallel',
  'bullet',
  'sankey',
  'funnel',
  'timeline',
  'calendar',
  'icicle',
  'graphicalTable',
]);

type Is = (candidate: Candidate) => boolean;

/**
 * What is offered only as a runner-up but where AC-560 names it (T968,
 * T969): R81's types, a stack at 100 %, a KPI tiled by a dimension.
 */
const runnerUpOnly: Is = (candidate) =>
  R81_TYPES.has(candidate.chartType) ||
  candidate.stack === 'percent' ||
  (candidate.chartType === 'kpi' && candidate.facetField !== undefined);

/** A pick's identity among the picks: its type, and a stack at 100 % apart from it at Sum. */
const pickKeyOf = (candidate: Candidate) =>
  candidate.stack === undefined ? candidate.chartType : `${candidate.chartType}:${candidate.stack}`;

/**
 * AC-560's picks, by the signature, ahead of the scores (T968): the top pick
 * and its named first runner-up, where the signature is one of R81's.
 * Narrowed by the parking: the histogram's and the bubble's are parked, and
 * the Map's are lane B's (T1012).
 */
function r81PicksOf(signature: Signature): { readonly top?: Is; readonly next?: Is } {
  const measures = measuresOf(signature);
  const dimensions = dimensionsOf(signature);
  const times = timesOf(signature);
  const is =
    (type: ChartType, also: Is = () => true): Is =>
    (candidate) =>
      candidate.chartType === type && also(candidate);
  if (signature.target === true && measures.length >= 1 && times.length === 0) {
    // A Target and one dimension: a bullet per member.
    if (dimensions.length === 1) return { top: is('bullet') };
    // A Target and none: the KPI against it, a single bullet next.
    if (dimensions.length === 0) return { top: is('kpi'), next: is('bullet') };
  }
  // 4 or more measures by one dimension of more than 8 members.
  if (
    measures.length >= 4 &&
    dimensions.length === 1 &&
    times.length === 0 &&
    cardinality(dimensions[0]) > 8
  )
    return { top: is('parallel') };
  // One measure over time: Line kept, KPI with trend next.
  if (measures.length === 1 && times.length >= 1 && dimensions.length === 0)
    return {
      top: is('line'),
      next: is('kpi', (candidate) => candidate.categoryField?.kind === 'timeDimension'),
    };
  return {};
}

/** The ranking with AC-560's picks put first, and no other R81 type first (T968). */
function withR81Picks<T extends { readonly candidate: Candidate }>(
  ranked: readonly T[],
  signature: Signature,
): T[] {
  const { top, next } = r81PicksOf(signature);
  const pinned = [top, next].flatMap((wanted) => {
    const found = wanted === undefined ? undefined : ranked.find((each) => wanted(each.candidate));
    return found === undefined ? [] : [found];
  });
  const rest = ranked.filter((each) => !pinned.includes(each));
  /**
   * Never first where AC-560 doesn't name it, nor ahead of the usual
   * runners-up (T969): R81's offers come after every other candidate, in
   * their own order, and `recommend` offers them past its count.
   */
  return [
    ...pinned,
    ...rest.filter((each) => !runnerUpOnly(each.candidate)),
    ...rest.filter((each) => runnerUpOnly(each.candidate)),
  ];
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
      reason: reasonFor(candidate, signature),
    }))
    .sort((a, b) => a.score - b.score);

  const seen = new Set<string>();
  const distinct = withR81Picks(ranked, signature).filter((recommendation) => {
    const key = pickKeyOf(recommendation.candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const [top, ...rest] = distinct;
  /**
   * More than half a bar's labels hidden at the tile's size: the horizontal
   * bar second, which writes them all across (T516; UX-117's second half; R67,
   * the user), by two fields or by country too. Where they fit, or it is top
   * already, the order stands.
   */
  const crowded = (signature.hiddenLabels ?? 0) > 0.5;
  const across = rest.findIndex((each) => each.candidate.chartType === 'hbar');
  const ordered =
    crowded && across > 0
      ? [rest[across]!, ...rest.slice(0, across), ...rest.slice(across + 1)]
      : rest;
  /**
   * R81's runners-up are offered whenever their rule holds (AC-561), after
   * the usual ones: past those, not left out for want of a place (T969).
   */
  const shown = ordered.slice(0, runnerUpCount);
  const offered = ordered.slice(runnerUpCount).filter((each) => runnerUpOnly(each.candidate));
  return { top: top ?? null, runnersUp: [...shown, ...offered] };
}
