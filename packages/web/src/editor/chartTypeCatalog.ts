import { CHART_TYPES, CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import { CAPS, REQUIREMENTS } from '@wechart/recommender';

/**
 * The chart type gallery's catalog (AC-217): each type's purpose, what it is
 * for and what it needs, as the prototype's gallery states them
 * (docs/design/prototype/editor.js, CATS and DESC). A type may serve more
 * than one purpose — a stacked bar is both a comparison and a part of a whole.
 */
export interface TypePurpose {
  readonly id: string;
  readonly name: string;
  readonly types: readonly ChartType[];
}

export const TYPE_PURPOSES: readonly TypePurpose[] = [
  {
    id: 'evolution',
    name: 'Evolution over time',
    types: ['line', 'area', 'multiLine', 'stackedArea', 'combo'],
  },
  {
    id: 'ranking',
    name: 'Ranking and comparison',
    types: ['bar', 'hbar', 'groupedBar', 'stackedBar'],
  },
  {
    id: 'part',
    name: 'Part of a whole',
    types: ['pie', 'donut', 'treemap', 'stackedBar', 'stackedArea'],
  },
  { id: 'matrix', name: 'Distribution and matrix', types: ['heatmap', 'pivot', 'trellis'] },
  { id: 'correlation', name: 'Correlation', types: ['scatter'] },
  { id: 'kpi', name: 'KPI', types: ['kpi'] },
  { id: 'table', name: 'Table', types: ['table', 'pivot'] },
];

const SLICES = String(CAPS.pieSlices);

export const TYPE_DESCRIPTIONS: Readonly<Record<ChartType, string>> = {
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
};

/** What a type needs, in the words the field list uses (AC-033's requirements). */
export function needsText(type: ChartType): string {
  const needs = REQUIREMENTS[type].map((requirement) => requirement.memberType);
  if (needs.length === 0) return 'Draws any fields';
  // "…, or a time dimension and a dimension," is written to sit mid-sentence
  // (AC-033's "Put … in Dimensions"); here it ends one.
  const last = (needs.at(-1) ?? '').replace(/,$/, '');
  return `Needs ${needs.length === 1 ? last : `${needs.slice(0, -1).join(', ')} and ${last}`}`;
}

/** The types whose name or description holds the search, ignoring case; every type for none. */
export function typesMatching(search: string): readonly ChartType[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return CHART_TYPES;
  return CHART_TYPES.filter((type) =>
    `${CHART_TYPE_NAMES[type]} ${TYPE_DESCRIPTIONS[type]}`.toLowerCase().includes(needle),
  );
}
