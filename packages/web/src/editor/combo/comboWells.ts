import {
  addToWell,
  withComboSplit,
  type ChartSpec,
  type ChartType,
  type WellName,
} from '@wechart/core';

/**
 * A field added to a well as the chart editor adds it (T860; AC-504): in a
 * combo, a dimension splits it, and a combo splits by one dimension only, so
 * a second replaces the first, the category axis kept (`withComboSplit`).
 * Everywhere else, `addToWell`.
 */
export function addToWellAs(
  chartType: ChartType | null,
  spec: ChartSpec,
  well: WellName,
  member: string,
): ChartSpec {
  if (chartType === 'combo' && well === 'dimensions') return withComboSplit(spec, member);
  return addToWell(spec, well, member);
}

/**
 * The dimension a combo is split by, as its wells hold it (AC-504): with a
 * time axis, its one plain dimension; without, the one after the category.
 */
export function comboSplitMember(
  spec: Pick<ChartSpec, 'dimensions' | 'timeDimensions'>,
): string | undefined {
  return spec.timeDimensions.length > 0 ? spec.dimensions[0] : spec.dimensions[1];
}
