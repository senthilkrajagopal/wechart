import type { ChartType, RenderSpec } from '@wechart/core';

/**
 * R81's table views, one module per type (T934; AC-178, direction.md rule
 * 166): the numbers behind every mark of a new type — a histogram's bins, a
 * Sankey's flows — laid out in `tableView/‹type›.ts` as named columns and
 * rows of display text, and registered here in one line.
 */
export interface TableView {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type TableViewOf = (spec: RenderSpec) => TableView;

/** Each type with a table view of its own, by its type. One line per type. */
export const TABLE_VIEWS: Partial<Record<ChartType, TableViewOf>> = {};

/** A chart's own table view, where its type has one; the rows as queried otherwise. */
export function tableViewOf(spec: RenderSpec): TableView | undefined {
  return TABLE_VIEWS[spec.chartType]?.(spec);
}
