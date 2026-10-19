import { sankeyNotes } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';

import { StateLine } from '../shell/StatusIcon';

/**
 * What a Sankey says under the chart, in the page's own text, not the
 * chart's (T987, AC-611; rules 153, 165): each member split because a later
 * step holds it again, and the fold into "Other" past 50 flows. Nothing
 * where it drew every member once and every flow.
 */
export function SankeyNotes({ spec }: { readonly spec: RenderSpec }) {
  const notes = sankeyNotes(spec);
  if (notes.length === 0) return null;
  return (
    <div className="tile-notes" data-testid="sankey-notes">
      {notes.map((note) => (
        <StateLine key={note} kind="info">
          {note}
        </StateLine>
      ))}
    </div>
  );
}
