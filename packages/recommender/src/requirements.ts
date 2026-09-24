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
}

export interface FieldCounts {
  readonly measures: number;
  readonly dimensions: number;
  readonly timeDimensions: number;
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
  pivot: [dimensions(2)],
  trellis: [measures(1), dimensions(1)],
  combo: [measures(2)],
};

/** The requirements this chart does not yet meet. Empty when it can be drawn. */
export function missingFor(chartType: ChartType, counts: FieldCounts): Requirement[] {
  return REQUIREMENTS[chartType].filter(
    (requirement) => counts[requirement.well] < requirement.atLeast,
  );
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
    const have = counts[requirement.well];
    const short = requirement.atLeast - have;
    return `A ${chartType} needs ${requirement.memberType} in ${WELL_LABEL[requirement.well]}; add ${String(short)} more.`;
  });
}
