import type { ChartType, RenderSpec } from '@wechart/core';

import { boxplotPointRows, boxplotStatistics } from './boxplot';
import { bulletTableView } from './bullet';
import { kpiTableView } from './kpi';
import { sankeyFlows } from './sankey';
import { stack100Columns } from './stack100';

/**
 * R81's table views, one module per type (T934; AC-178, direction.md rule
 * 166): the numbers behind every mark of a new type — a histogram's bins, a
 * Sankey's flows — laid out in `tableView/‹type›.ts` as named columns and
 * rows of display text, and registered here in one line.
 */
export interface TableView {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** The columns of figures, by place, set right as a measure's are (T956). */
  readonly figures?: readonly number[];
}

/** A type's table view; undefined where the spec keeps its rows as queried (a KPI with no R81 setting). */
export type TableViewOf = (spec: RenderSpec) => TableView | undefined;

/** Each type with a table view of its own, by its type. One line per type. */
export const TABLE_VIEWS: Partial<Record<ChartType, TableViewOf>> = {
  boxplot: boxplotStatistics,
  bullet: bulletTableView,
  kpi: kpiTableView,
  sankey: sankeyFlows,
};

/** A chart's own table view, where its type has one; the rows as queried otherwise. */
export function tableViewOf(spec: RenderSpec): TableView | undefined {
  return TABLE_VIEWS[spec.chartType]?.(spec);
}

/**
 * The rows a type's own table view lists under "View points" (AC-593): the
 * points it draws, each a row of named members, shown and marked as any
 * table's rows are. Undefined where it draws none that are entities.
 */
export type PointRowsOf = (spec: RenderSpec) => Record<string, unknown>[] | undefined;

/** Each type whose table view offers "View points", by its type. One line per type. */
export const VIEW_POINTS: Partial<Record<ChartType, PointRowsOf>> = {
  boxplot: boxplotPointRows,
};

/** The rows "View points" lists, where a chart's type offers it and draws any. */
export function pointRowsOf(spec: RenderSpec): Record<string, unknown>[] | undefined {
  const rows = VIEW_POINTS[spec.chartType]?.(spec);
  return rows === undefined || rows.length === 0 ? undefined : rows;
}

/**
 * A column a chart's table view adds after its rows as queried (T958): its
 * heading, and one cell of display text for each of the spec's rows, in
 * their order. The rows stay the table's own, marked as any table's are.
 */
export interface AddedColumn {
  readonly title: string;
  readonly cells: readonly string[];
}

export type AddedColumnsOf = (spec: RenderSpec) => readonly AddedColumn[];

/**
 * Each type whose table view adds columns to its rows, by its type. One line
 * per type: a stacked bar or area at 100 %, its share of each category (AC-585).
 */
export const ADDED_COLUMNS: Partial<Record<ChartType, AddedColumnsOf>> = {
  stackedArea: stack100Columns,
  stackedBar: stack100Columns,
};

/** The columns a chart's table view adds; none for most. */
export function addedColumnsOf(spec: RenderSpec): readonly AddedColumn[] {
  return ADDED_COLUMNS[spec.chartType]?.(spec) ?? [];
}
