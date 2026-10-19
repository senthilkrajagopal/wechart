import { sankeyDrawnOf } from '@wechart/charts';
import { columnTitleOf, formatterFor, type RenderSpec } from '@wechart/core';

import type { TableView } from './index';

/**
 * A Sankey's table view (T989, AC-613; design 23 sheet 10): a row a flow,
 * "‹source› → ‹target›", its value, and its share of what leaves its source
 * ("Web → EMEA · $210,000 · 32.3%"), to one decimal. Every flow as the rows
 * hold it, past the 50 the chart draws; a repeated member by its node's name
 * ("EMEA (2)").
 */
export function sankeyFlows(spec: RenderSpec): TableView {
  const { measure, flows } = sankeyDrawnOf(spec, false);
  const write = formatterFor(measure ?? '', spec.formats ?? {});
  const out = new Map<string, number>();
  for (const flow of flows) out.set(flow.source, (out.get(flow.source) ?? 0) + flow.value);
  return {
    columns: ['Flow', columnTitleOf(measure ?? '', spec.titles), 'Share of source'],
    rows: flows.map((flow) => {
      const whole = out.get(flow.source) ?? 0;
      return [
        `${flow.source} → ${flow.target}`,
        write(flow.value),
        whole === 0 ? '' : `${((flow.value / whole) * 100).toFixed(1)}%`,
      ];
    }),
  };
}
