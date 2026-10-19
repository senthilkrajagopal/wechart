/**
 * The Sankey (T986, AC-610, AC-037; design 23 sheet 10; direction.md rule
 * 153): volume flowing between 2 to 4 steps, each a dimension, in order, by
 * one summed measure, a link for each pair of adjacent steps' members.
 *
 * The steps are the chart's dimensions and the measure its first, so its one
 * grouped Cube query is the editor's as it is: every step's dimension at
 * once. Only Customize › Colour links by, Source or Target, is the type's own
 * setting, stored sparse as `options.sankey`.
 */
import type { ChartTypeModule } from './index';

export const SANKEY_COLOUR_BY = ['source', 'target'] as const;
export type SankeyColourBy = (typeof SANKEY_COLOUR_BY)[number];

export interface SankeySettings {
  readonly colourLinksBy: SankeyColourBy;
}

export const MIN_SANKEY_STEPS = 2;
export const MAX_SANKEY_STEPS = 4;

/** What a Sankey of one step says, with + Step (AC-610). */
export const ONE_STEP = 'A Sankey shows flows between steps. Add a second dimension to Steps.';

const DEFAULT_SANKEY: SankeySettings = { colourLinksBy: 'source' };

function parse(stored: unknown): SankeySettings {
  const by =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)['colourLinksBy']
      : undefined;
  return by === 'target' ? { colourLinksBy: by } : DEFAULT_SANKEY;
}

/** Sparse: Source, the default, is stored as nothing. */
function save(settings: SankeySettings): Record<string, unknown> | undefined {
  return settings.colourLinksBy === 'source' ? undefined : { colourLinksBy: 'target' };
}

export const sankeyModule: ChartTypeModule<SankeySettings> = { type: 'sankey', parse, save };

/** The aggregations whose values add up across a node's flows. */
const SUMMED: ReadonlySet<string> = new Set(['sum', 'count']);

/** An aggregation as a sentence says it: "an average". */
const AGGREGATION_WORDS: Readonly<Record<string, string>> = {
  avg: 'an average',
  min: 'a minimum',
  max: 'a maximum',
  countDistinct: 'a distinct count',
  countDistinctApprox: 'a distinct count',
  number: 'a calculated number',
  runningTotal: 'a running total',
};

export interface Sankey {
  /** Each step's dimension, in order. */
  readonly steps: readonly string[];
  /** The one measure the flows are of. */
  readonly measure?: string;
  readonly colourLinksBy: SankeyColourBy;
  /** Why it can't be drawn from these fields, in the words the wells say; nothing when it can. */
  readonly refusal?: string;
}

/**
 * A chart read as a Sankey, and why it can't be drawn where it can't: one
 * step (AC-610's sentence), a fifth step, a second measure, or a measure
 * that isn't summed, by its aggregation as the model gives it (`aggTypes`);
 * a measure whose aggregation isn't known is taken as given.
 */
export function sankeyOf(
  chart: {
    readonly wells: {
      readonly measures: readonly string[];
      readonly dimensions: readonly string[];
    };
    readonly options?: Readonly<Record<string, unknown>> | undefined;
  },
  aggTypes: Readonly<Record<string, string>> = {},
  titles: Readonly<Record<string, string>> = {},
): Sankey {
  const steps = [...chart.wells.dimensions];
  const [measure] = chart.wells.measures;
  const { colourLinksBy } = parse(chart.options?.['sankey']);
  const read = { steps, ...(measure === undefined ? {} : { measure }), colourLinksBy };

  const refusal = (() => {
    if (steps.length > MAX_SANKEY_STEPS)
      return `A Sankey takes at most ${String(MAX_SANKEY_STEPS)} steps; there are ${String(steps.length)}. Remove a dimension from Steps.`;
    if (chart.wells.measures.length > 1)
      return `A Sankey draws one measure; there are ${String(chart.wells.measures.length)}. Remove one from Metrics.`;
    const aggregation = measure === undefined ? undefined : aggTypes[measure];
    if (measure !== undefined && aggregation !== undefined && !SUMMED.has(aggregation))
      return `A Sankey’s flows add up, so its measure must be a sum or a count; ${titles[measure] ?? measure} is ${AGGREGATION_WORDS[aggregation] ?? `a ${aggregation}`}.`;
    if (steps.length === 1) return ONE_STEP;
    return undefined;
  })();
  return refusal === undefined ? read : { ...read, refusal };
}

export interface SankeyLink {
  /** The step the link leaves, by its place: 0 joins steps 1 and 2. */
  readonly from: number;
  readonly source: string;
  readonly target: string;
  readonly value: number;
}

/**
 * A link for each pair of adjacent steps' members that rows join, its value
 * the sum of those rows' measure, in the order the rows first join them;
 * never between steps that aren't adjacent (AC-610).
 */
export function sankeyLinksOf(
  rows: readonly Readonly<Record<string, unknown>>[],
  steps: readonly string[],
  measure: string,
): SankeyLink[] {
  const links: SankeyLink[] = [];
  for (let from = 0; from + 1 < steps.length; from += 1) {
    const sourceOf = steps[from] ?? '';
    const targetOf = steps[from + 1] ?? '';
    const sums = new Map<string, { source: string; target: string; value: number }>();
    for (const row of rows) {
      const source = String(row[sourceOf] ?? '');
      const target = String(row[targetOf] ?? '');
      const raw = row[measure];
      const value = raw === null || raw === undefined || raw === '' ? 0 : Number(raw);
      const key = JSON.stringify([source, target]);
      const link = sums.get(key);
      if (link === undefined)
        sums.set(key, { source, target, value: Number.isFinite(value) ? value : 0 });
      else link.value += Number.isFinite(value) ? value : 0;
    }
    for (const link of sums.values()) links.push({ from, ...link });
  }
  return links;
}
