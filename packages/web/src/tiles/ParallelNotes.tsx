import { parallelLinesOf } from '@wechart/charts';
import { tooFewMeasures, type RenderSpec } from '@wechart/core';

import { StateLine } from '../shell/StatusIcon';

/**
 * What parallel coordinates say under the chart, in the page's own text, not
 * the chart's (T982, AC-598, AC-597; design 23 sheet 7; rule 159): while each
 * axis runs on its own scale, not to compare heights across axes; past 1,000
 * members, how many of how many are drawn and by what, with Filter and
 * Table; and with fewer than 3 measures, what the chart needs.
 */
export const SCALE_WARNING =
  "Each axis runs from its own minimum to its maximum. Don't compare a line's height on one axis with its height on another.";

/** A dimension's title as a plural noun in a sentence: "Product" → "products". */
export function membersWord(title: string): string {
  const word = title.toLowerCase();
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

const titleOf = (spec: RenderSpec, member: string) => spec.titles?.[member] ?? member;

export function ParallelNotes({
  spec,
  onFilter,
  onTable,
}: {
  readonly spec: RenderSpec;
  /** Where the chart's filters can be changed: the editor's Filters well. */
  readonly onFilter?: (() => void) | undefined;
  /** The tile's table view, which holds every member. */
  readonly onTable?: (() => void) | undefined;
}) {
  const { lineBy, axes, scale, members, drawn } = parallelLinesOf(spec);
  const tooFew = tooFewMeasures(axes.length);
  if (tooFew !== undefined) {
    return (
      <StateLine kind="info" className="tile-notes" testId="parallel-tile-too-few">
        {tooFew}
      </StateLine>
    );
  }
  const cut = drawn < members && lineBy !== undefined;
  return (
    <>
      {scale === 'each' && drawn > 0 ? (
        <p className="tile-notes" data-testid="parallel-scale-warning">
          {SCALE_WARNING}
        </p>
      ) : null}
      {cut ? (
        <div className="tile-notes parallel-cut" data-testid="parallel-cut">
          <StateLine kind="warn">
            Showing {drawn.toLocaleString('en-US')} of {members.toLocaleString('en-US')}{' '}
            {membersWord(titleOf(spec, lineBy))}, by {titleOf(spec, axes[0] ?? '')}. Filter, or open
            the table.
          </StateLine>
          {onFilter === undefined ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={onFilter}>
              Filter
            </button>
          )}
          {onTable === undefined ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={onTable}>
              Table
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
