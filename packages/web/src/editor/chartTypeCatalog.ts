import { CHART_TYPES, CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import { CAPS, REQUIREMENTS } from '@wechart/recommender';

/**
 * The chart type gallery's catalog (AC-217): each card's purpose, what it is
 * for and what it needs, as the prototype's gallery states them
 * (docs/design/prototype/editor.js, CATS and DESC), and from R81 as design
 * 23's screen 1 does (AC-559). A card may serve more than one purpose — a
 * stacked bar is both a comparison and a part of a whole — and is then the
 * same card on each shelf.
 *
 * A card is a chart type, or one of R81's two presets: 100 % stacked bar and
 * area are Stacked bar and Stacked area opened at 100 % (23-Q15 (a), AC-584),
 * not types of their own.
 */
export type Preset = 'stackedBar100' | 'stackedArea100';
export type CardId = ChartType | Preset;

export interface TypePurpose {
  readonly id: string;
  readonly name: string;
  readonly cards: readonly CardId[];
}

/** AC-559's nine purposes, in order, each with its cards in design 23's order. */
export const TYPE_PURPOSES: readonly TypePurpose[] = [
  {
    id: 'evolution',
    name: 'Evolution over time',
    cards: [
      'line',
      'area',
      'multiLine',
      'stackedArea',
      'combo',
      'stackedArea100',
      'timeline',
      'calendar',
    ],
  },
  {
    id: 'ranking',
    name: 'Ranking and comparison',
    cards: ['bar', 'hbar', 'groupedBar', 'stackedBar', 'waterfall', 'bullet', 'funnel'],
  },
  {
    id: 'part',
    name: 'Part of a whole',
    cards: [
      'pie',
      'donut',
      'treemap',
      'stackedBar',
      'stackedArea',
      'stackedBar100',
      'stackedArea100',
      'icicle',
    ],
  },
  // R81's ninth shelf (23-Q11 (a)): where volume goes, and where it is lost.
  { id: 'flow', name: 'Flow', cards: ['sankey', 'funnel'] },
  {
    id: 'matrix',
    name: 'Distribution and matrix',
    cards: ['histogram', 'boxplot', 'heatmap', 'pivot', 'trellis'],
  },
  { id: 'correlation', name: 'Correlation', cards: ['scatter', 'bubble', 'parallel'] },
  // Phase 2 (T398, AC-305): the prototype's gallery has no map. From R81 the
  // Map, in place of Country map (23-Q19 (a)).
  { id: 'geography', name: 'Geography', cards: ['map'] },
  { id: 'kpi', name: 'KPI', cards: ['kpi', 'bullet'] },
  { id: 'table', name: 'Table', cards: ['table', 'pivot', 'graphicalTable'] },
];

/** What a preset opens: its stacked type, at 100 %. */
const PRESETS: Readonly<Record<Preset, { readonly type: ChartType; readonly stack: 'percent' }>> = {
  stackedBar100: { type: 'stackedBar', stack: 'percent' },
  stackedArea100: { type: 'stackedArea', stack: 'percent' },
};

function isPreset(card: CardId): card is Preset {
  return Object.hasOwn(PRESETS, card);
}

/** What choosing a card pins: its type, and for a preset its stacking (AC-559, AC-584). */
export function cardChoice(card: CardId): {
  readonly type: ChartType;
  readonly stack?: 'percent';
} {
  return isPreset(card) ? PRESETS[card] : { type: card };
}

/** Every card, as All charts lists them: each type, a preset after its stacked type. */
export const ALL_CARDS: readonly CardId[] = CHART_TYPES.flatMap((type): CardId[] =>
  type === 'stackedBar'
    ? [type, 'stackedBar100']
    : type === 'stackedArea'
      ? [type, 'stackedArea100']
      : [type],
);

/** Each card by its name (AC-217): a type's from the one list, a preset's as design 23 names it. */
export const CARD_NAMES: Readonly<Record<CardId, string>> = {
  ...CHART_TYPE_NAMES,
  stackedBar100: '100 % stacked bar',
  stackedArea100: '100 % stacked area',
};

const SLICES = String(CAPS.pieSlices);

export const TYPE_DESCRIPTIONS: Readonly<Record<CardId, string>> = {
  kpi: 'One headline number per measure',
  bar: 'Compare values across categories',
  hbar: 'Bars for long labels or many categories',
  groupedBar: 'Side-by-side comparison',
  stackedBar: 'Composition within each category',
  line: 'Trend over time',
  multiLine: 'Several series over time',
  area: 'Volume over time',
  stackedArea: 'Composition over time',
  scatter: 'Relationship between two measures',
  pie: `Share of a small whole (≤ ${SLICES} slices)`,
  donut: `Share of a small whole, as a ring (≤ ${SLICES} slices)`,
  treemap: 'Share of a whole with many parts',
  heatmap: 'Two dimensions as a colour matrix',
  table: 'Exact values',
  pivot: 'Rows × columns with totals',
  trellis: 'One small panel per member',
  combo: 'Bars plus a line on two axes (use with care)',
  boxplot: 'Spread of values per category: median, quartiles and outliers',
  // R81's cards, in design 23's words (AC-559).
  map: 'Regions, points or density on vector boundaries',
  waterfall: 'What moved a total from one value to another',
  histogram: 'How values are spread, in bins',
  bubble: 'Three measures: across, up, and size',
  parallel: 'Compare members across 3 or more measures',
  bullet: 'Each member against its target and bands',
  stackedBar100: 'Mix within each category; every bar is 100 %',
  stackedArea100: 'Mix over time; every point is 100 %',
  sankey: 'How volume flows between stages or categories',
  funnel: 'Where volume drops between steps',
  timeline: 'What ran when, for how long, and what overlapped',
  calendar: 'Which days run hot or cold',
  icicle: 'A total broken down level by level; sunburst as an option',
  graphicalTable: 'Rows of values, sparklines, bullets and icons',
};

/**
 * What R81's cards need, in design 23's words (AC-559): "summed" wherever the
 * measure must add up, which a field's count can't say. Today's cards say it
 * from their requirements (AC-033).
 */
const NEEDS: Readonly<Partial<Record<CardId, string>>> = {
  map: 'Needs a region key or a location, and a measure',
  waterfall: 'Needs a summed measure, and a dimension or time for its steps',
  histogram: 'Needs a numeric dimension, or a measure with Each point is',
  bubble: 'Needs 3 measures and a dimension',
  parallel: 'Needs 3 or more measures and a dimension',
  bullet: 'Needs a measure, a target and a dimension',
  stackedBar100: 'Needs a summed measure and two dimensions',
  stackedArea100: 'Needs a summed measure, time and a dimension',
  sankey: 'Needs a summed measure and 2–4 dimensions',
  funnel: 'Needs a stage dimension and a measure, or measures in order',
  timeline: 'Needs a dimension, a start time and an end time',
  calendar: 'Needs a time dimension by day and a measure',
  icicle: 'Needs a summed measure and 2–4 dimensions, or a hierarchy',
  graphicalTable: 'Needs a dimension and a measure',
};

/**
 * Words a search finds a card by beyond its name and purpose. No gauge is
 * built (R81, "No gauge (Recommended)"): a search for one finds the two
 * cards that do its job, by their targets (design 23 screen 1 pin 7).
 */
const SEARCH_WORDS: Readonly<Partial<Record<CardId, string>>> = {
  kpi: 'gauge target',
  bullet: 'gauge',
};

/** What a card needs, in the words the field list uses (AC-033's requirements). */
export function needsText(card: CardId): string {
  const own = NEEDS[card];
  if (own !== undefined) return own;
  const needs = REQUIREMENTS[cardChoice(card).type].map((requirement) => requirement.memberType);
  if (needs.length === 0) return 'Draws any fields';
  // "…, or a time dimension and a dimension," is written to sit mid-sentence
  // (AC-033's "Put … in Dimensions"); here it ends one.
  const last = (needs.at(-1) ?? '').replace(/,$/, '');
  return `Needs ${needs.length === 1 ? last : `${needs.slice(0, -1).join(', ')} and ${last}`}`;
}

/** The cards whose name, description or search words hold the search, ignoring case; every card for none. */
export function typesMatching(search: string): readonly CardId[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return ALL_CARDS;
  return ALL_CARDS.filter((card) =>
    `${CARD_NAMES[card]} ${TYPE_DESCRIPTIONS[card]} ${SEARCH_WORDS[card] ?? ''}`
      .toLowerCase()
      .includes(needle),
  );
}
