import {
  limitFilterFor,
  markingMembers,
  type CubeFilter,
  type MarkingPredicate,
} from '@wechart/core';

import { markFilterOn } from '../dashboard/markings/filterToMarked';

/**
 * The marked share of a tile's items (T388, AC-104; research
 * cube/markings-query-support.md, Q3, option B).
 *
 * A tile that groups by every member a marking names has items wholly in it
 * or wholly out of it, read from its own rows. One that doesn't — a bar per
 * category, with a marking on status — has items partly marked, and what
 * part is a second answer from Cube: its own query with the marking in its
 * filters. Not arithmetic on its rows, since a measure over a subset isn't a
 * fraction of the measure over everything. Its own answer is left as it is,
 * so it stays cached however the marking changes.
 */

/**
 * Whether a tile grouped by these needs the marked share: the marking holds
 * something it doesn't group by — each member as the tile's cube or view
 * names it (`reach`), so a view's own name for a marked member is grouped.
 */
export function needsMarkedShare(
  groupings: readonly string[],
  predicate: MarkingPredicate,
  reach: (member: string) => string | false | undefined = () => undefined,
): boolean {
  const grouped = new Set(groupings);
  return markingMembers(predicate).some((member) => {
    const named = reach(member);
    return !grouped.has(typeof named === 'string' ? named : member);
  });
}

/**
 * The filter that asks for it: the marking's own, as a tile it limits is
 * asked, with its members as the tile's cube or view names them (`reach`).
 * None while it holds nothing or every row; a member the tile can't reach is
 * said, as the tile says it (AC-103).
 */
export function markedShareFilter(
  predicate: MarkingPredicate,
  reach: (member: string) => string | false | undefined,
): { readonly filter: CubeFilter } | { readonly unreached: string } | undefined {
  const filter = limitFilterFor([predicate], 'all');
  if (filter === undefined) return undefined;
  return markFilterOn({ filter, members: markingMembers(predicate) }, reach);
}
