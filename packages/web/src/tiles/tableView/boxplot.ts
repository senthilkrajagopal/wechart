import { boxesOf, drawnPointsOf } from '@wechart/charts';
import { columnTitleOf, formatterFor, memberOn, type RenderSpec } from '@wechart/core';

import type { TableView } from './index';

/**
 * A box plot's table view (T993, AC-593; design 23 sheet 11): a row per box,
 * its category, n and the statistics its tooltip gives (rule 88): where the
 * whiskers end, its quartiles and its median (decision T993-2).
 */
export function boxplotStatistics(spec: RenderSpec): TableView {
  const category = memberOn(spec.encoding, 'x') ?? '';
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const write = formatterFor(measure, spec.formats ?? {});
  return {
    columns: [columnTitleOf(category, spec.titles), 'n', 'Low', 'Q1', 'Median', 'Q3', 'High'],
    rows: boxesOf(spec).map(({ name, stats }) => [
      name,
      stats.n.toLocaleString('en-US'),
      write(stats.low),
      write(stats.q1),
      write(stats.median),
      write(stats.q3),
      write(stats.high),
    ]),
  };
}

/**
 * The rows "View points" lists (AC-593): each point the box plot draws, as
 * its category, its entity and its value, in the order drawn. None where no
 * point is an entity, without Each point is.
 */
export function boxplotPointRows(spec: RenderSpec): Record<string, unknown>[] | undefined {
  const entity = spec.eachPointIs;
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (entity === undefined || category === undefined || measure === undefined) return undefined;
  return drawnPointsOf(spec).map(({ name, point }) => ({
    [category]: name,
    [entity]: point.entity,
    [measure]: point.value,
  }));
}
