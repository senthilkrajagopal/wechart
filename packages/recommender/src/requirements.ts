import { CHART_TYPE_NAMES } from '@wechart/core';

import type { ChartType } from './types';

/**
 * What each chart type needs before it can be drawn, and what is missing when
 * it cannot (AC-033).
 *
 * The message has to name **the well and the member type** — "not enough
 * fields" leaves someone staring at three wells wondering which one wants what.
 */
export type WellName = 'measures' | 'dimensions' | 'timeDimensions';

export interface Requirement {
  readonly well: WellName;
  readonly atLeast: number;
  /** What to put there, in the words the field list uses. */
  readonly memberType: string;
  /** Time dimensions count towards it as well: a grouping of either kind (T242). */
  readonly timeCounts?: boolean;
  /** Only dimensions holding ISO-3 country codes count towards it (T398, AC-313). */
  readonly countryCodes?: boolean;
  /**
   * One fewer is enough with two or more measures: small multiples drawn a
   * panel per metric need one grouping, not two (T510, UX-057).
   */
  readonly fewerByMetric?: boolean;
}

export interface FieldCounts {
  readonly measures: number;
  readonly dimensions: number;
  readonly timeDimensions: number;
  /** The dimensions holding ISO-3 country codes (AC-313), where known; none otherwise. */
  readonly countryCodes?: number;
}

const measures = (atLeast: number): Requirement => ({
  well: 'measures',
  atLeast,
  memberType: atLeast === 1 ? 'a measure' : `${String(atLeast)} measures`,
});

const dimensions = (atLeast: number): Requirement => ({
  well: 'dimensions',
  atLeast,
  memberType: atLeast === 1 ? 'a dimension' : `${String(atLeast)} dimensions`,
});

/**
 * Groupings of either kind: dimensions, time among them. Small multiples need
 * one to panel by and one along each panel's axis (T242's review).
 */
const groupings = (atLeast: number): Requirement => ({
  well: 'dimensions',
  atLeast,
  memberType: `${String(atLeast)} dimensions, or a time dimension and a dimension,`,
  timeCounts: true,
});

/** A dimension whose values are ISO-3 country codes, or which the model marks so (AC-313). */
const countryCodes = (): Requirement => ({
  well: 'dimensions',
  atLeast: 1,
  memberType: 'a dimension of ISO-3 country codes',
  countryCodes: true,
});

const time = (): Requirement => ({
  well: 'timeDimensions',
  atLeast: 1,
  memberType: 'a time dimension',
});

export const REQUIREMENTS: Record<ChartType, readonly Requirement[]> = {
  kpi: [measures(1)],
  bar: [measures(1)],
  hbar: [measures(1)],
  groupedBar: [measures(1), dimensions(2)],
  stackedBar: [measures(1), dimensions(2)],
  line: [measures(1), time()],
  multiLine: [measures(2), time()],
  area: [measures(1), time()],
  stackedArea: [measures(1), time(), dimensions(1)],
  scatter: [measures(2)],
  pie: [measures(1), dimensions(1)],
  donut: [measures(1), dimensions(1)],
  treemap: [measures(1), dimensions(1)],
  heatmap: [measures(1), dimensions(2)],
  table: [],
  // Rows from a time dimension and columns from a dimension, as `compile`
  // draws them (T305's review).
  pivot: [groupings(2)],
  // Or a panel per metric: two measures and one grouping (T510).
  trellis: [measures(1), { ...groupings(2), fewerByMetric: true }],
  combo: [measures(2)],
  // A measure's values spread per category (AC-306): one plain dimension to
  // box by, as `compile` encodes it.
  boxplot: [measures(1), dimensions(1)],
  // A measure by country (AC-305): a dimension of ISO-3 codes to colour by.
  map: [measures(1), countryCodes()],
};

/** How many fields the chart has towards a requirement. */
function have(requirement: Requirement, counts: FieldCounts): number {
  if (requirement.countryCodes === true) return counts.countryCodes ?? 0;
  return counts[requirement.well] + (requirement.timeCounts === true ? counts.timeDimensions : 0);
}

/**
 * A requirement as these fields meet it: one grouping fewer, said as one,
 * where two measures draw small multiples a panel per metric (T510).
 */
function asMet(requirement: Requirement, counts: FieldCounts): Requirement {
  if (requirement.fewerByMetric !== true || counts.measures < 2) return requirement;
  return {
    ...requirement,
    atLeast: requirement.atLeast - 1,
    memberType: 'a dimension or a time dimension',
  };
}

/** The requirements this chart does not yet meet. Empty when it can be drawn. */
export function missingFor(chartType: ChartType, counts: FieldCounts): Requirement[] {
  return REQUIREMENTS[chartType]
    .map((requirement) => asMet(requirement, counts))
    .filter((requirement) => have(requirement, counts) < requirement.atLeast);
}

export function canDraw(chartType: ChartType, counts: FieldCounts): boolean {
  return missingFor(chartType, counts).length === 0;
}

/** Each well as the editor names it (AC-216: the prototype's Metrics). */
const WELL_LABEL: Record<WellName, string> = {
  measures: 'Metrics',
  dimensions: 'Dimensions',
  timeDimensions: 'Time',
};

/**
 * A sentence naming what to add and where. One per unmet requirement, so a
 * chart short of two different things says both.
 */
export function describeMissing(chartType: ChartType, counts: FieldCounts): string[] {
  return missingFor(chartType, counts).map((requirement) => {
    const had = have(requirement, counts);
    const short = requirement.atLeast - had;
    // The type by its name, never its id (AC-217). Where a second metric
    // would do instead, that too (T510).
    const byMetric =
      requirement.fewerByMetric === true && counts.measures < 2
        ? ' Or add a second metric to Metrics, for a panel per metric.'
        : '';
    return `${CHART_TYPE_NAMES[chartType]} needs ${requirement.memberType} in ${WELL_LABEL[requirement.well]}; add ${String(short)} more.${byMetric}`;
  });
}
