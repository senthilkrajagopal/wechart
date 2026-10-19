import type { RenderSpec } from '@wechart/core';

import { DataTable } from './DataTable';
import { useGraphicalTableTrends } from './GraphicalTable';
import { graphicalTableTableView } from './tableView/graphicalTable';

/**
 * A graphical table's "View as table" (T947, AC-574): the numbers behind
 * every cell, its trends asked as the table asks them, drawn by the table
 * view every chart has.
 */
export function GraphicalTableAsTable({
  spec,
  query,
  label,
  height,
}: {
  readonly spec: RenderSpec;
  readonly query?: Readonly<Record<string, unknown>> | undefined;
  readonly label?: string | undefined;
  readonly height?: number | undefined;
}) {
  const now = new Date();
  const trends = useGraphicalTableTrends(spec, query, 'every', now);
  return (
    <DataTable
      spec={spec}
      view={graphicalTableTableView(spec, trends, now)}
      label={label}
      {...(height === undefined ? {} : { height })}
    />
  );
}
