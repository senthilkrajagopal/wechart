import { mapRegionTable } from '@wechart/charts';
import { formatterFor, memberOn, type RenderSpec } from '@wechart/core';

import type { TableView } from './index';

/**
 * A map's table view (T980, AC-629; design 23 sheet 6): a row a region of its
 * boundary set, those with a row first, its value in the measure's format or
 * "No data" — never 0 — and, with a Points layer, how many of its points lie
 * in it. None before the set's boundaries are in.
 */
export function mapTableView(spec: RenderSpec): TableView | undefined {
  const table = mapRegionTable(spec);
  if (table === undefined) return undefined;
  const write = formatterFor(memberOn(spec.encoding, 'y') ?? '', spec.formats ?? {});
  const withPoints = table.columns.length > 2;
  return {
    columns: table.columns,
    rows: table.rows.map(([name, value, points]) => [
      name,
      value === undefined ? 'No data' : write(value),
      ...(withPoints ? [String(points ?? 0)] : []),
    ]),
    figures: withPoints ? [1, 2] : [1],
  };
}
