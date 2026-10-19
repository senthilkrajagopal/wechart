import { sankeyNotes, sankeyPartlyMarked } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';

import { StateLine } from '../shell/StatusIcon';

/**
 * What a Sankey says under the chart, in the page's own text, not the
 * chart's (T987, AC-611; rules 153, 165): each member split because a later
 * step holds it again, and the fold into "Other" past 50 flows; and while a
 * link is partly marked, that its marked share is in its tooltip, not drawn
 * (T988, AC-612; the type's one stated limitation). Nothing where it drew
 * every member once, every flow, and no partly marked link.
 */
export function SankeyNotes({ spec }: { readonly spec: RenderSpec }) {
  const notes = sankeyNotes(spec);
  const partly = sankeyPartlyMarked(spec);
  if (notes.length === 0 && !partly) return null;
  return (
    <div className="tile-notes" data-testid="sankey-notes">
      {notes.map((note) => (
        <StateLine key={note} kind="info">
          {note}
        </StateLine>
      ))}
      {partly ? (
        <StateLine kind="info" testId="sankey-share-info">
          A link’s marked share is given in its tooltip, not drawn.
        </StateLine>
      ) : null}
    </div>
  );
}
