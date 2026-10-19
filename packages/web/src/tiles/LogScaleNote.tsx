import { logScaleOmissions } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';

/**
 * The values a combo's log axis leaves out (T850, AC-502; design 20 state
 * E): a value at or below zero has no place on a log scale, so it isn't
 * drawn, and is counted and named in a note under the chart, in the page's
 * own text — "3 values not drawn: Orders was 0 in Jan, Feb and Mar, and a
 * log scale has no zero." Nothing is said while every value is drawn.
 */
export function LogScaleNote({ spec }: { readonly spec: RenderSpec }) {
  const omitted = logScaleOmissions(spec);
  if (omitted === undefined) return null;
  return (
    <p className="tile-notes" data-testid="log-scale-omissions">
      {omitted.text}
    </p>
  );
}
