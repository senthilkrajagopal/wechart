import { assignColours, colouredMembersOf } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { useState } from 'react';

import { isSection, isTabGroup, type DashboardDocument } from './model/document';

/**
 * One colour per member, for the whole dashboard (AC-039, direction.md rule 7).
 *
 * `assignColours` in @wechart/charts is the mechanism; what belongs here is
 * the decision that the *dashboard* owns the assignment. A tile asked to
 * choose its own colours has only its own rows to go on, so the same member
 * lands on whichever slot its rank happens to give it — and two tiles that
 * list the same members in a different order then disagree about what blue
 * means.
 *
 * Members are claimed in document order, so the assignment is a property of
 * the saved dashboard rather than of the order the tiles' queries returned.
 * Without that, a slow first tile would silently repaint the dashboard.
 */
export interface DashboardColours {
  /** The tiles' specs, each carrying the colours the dashboard chose. */
  readonly specs: Record<string, RenderSpec>;
  /**
   * Every member assigned so far, to be fed back in as `starting` next time.
   *
   * This is what makes the criterion's second half true. A member only keeps
   * its colour while a filter hides it if the assignment outlives the filter:
   * recomputed from the visible rows alone, the member that was second becomes
   * the member that is first, and takes the colour the hidden one had. So the
   * assignment is state the dashboard carries, not a function of what is on
   * screen — and the caller is expected to hand it straight back.
   */
  readonly assigned: Record<string, string>;
}

export function dashboardColours(
  document: DashboardDocument,
  specs: Readonly<Record<string, RenderSpec>>,
  starting: Readonly<Record<string, string>> = {},
): DashboardColours {
  const assignment = assignColours(undefined, starting);

  /** Chart ids in document order: pages, then sections and tab groups within. */
  const chartIds: string[] = [];
  const walk = (items: DashboardDocument['pages'][number]['items']) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items);
      else if (isTabGroup(element)) {
        // Every tab, not just the open one: which tab is open is a view
        // concern, and a member must not change colour because a reader
        // happened to open the tiles in a different order.
        for (const tab of element.tabs) walk(tab.items);
      } else if (element.kind === 'chart' && element.chartId !== undefined) {
        chartIds.push(element.chartId);
      }
    }
  };
  for (const page of document.pages) walk(page.items);

  const coloured: Record<string, RenderSpec> = {};
  for (const chartId of chartIds) {
    const spec = specs[chartId];
    if (spec === undefined) continue;

    // What the tile colours: a pie's slices by their categories, and nothing
    // for a tile that colours no member (T301).
    const colours: Record<string, string> = {};
    for (const member of colouredMembersOf(spec)) colours[member] = assignment.colourFor(member);
    coloured[chartId] = { ...spec, colours };
  }
  return { specs: coloured, assigned: assignment.assigned() };
}

const sameAssignment = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

/**
 * The dashboard's colours, kept across renders.
 *
 * `dashboardColours` is pure, so on its own it would start from nothing every
 * time the tiles' data changed — and a filter that hides a member would hand
 * that member's colour to whoever is now first. Keeping the assignment here is
 * what makes AC-039's "keep that colour when filters change the set of visible
 * members" true of the running dashboard rather than of one call.
 *
 * State is adjusted during render, which React supports for a value derived
 * from props that has to persist. It settles after one extra pass because an
 * assignment only ever grows. A ref would be wrong: React may discard a render
 * attempt, and a ref written during that render would keep colours nobody was
 * ever shown.
 */
export function useDashboardColours(
  document: DashboardDocument,
  specs: Readonly<Record<string, RenderSpec>>,
): Record<string, RenderSpec> {
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const coloured = dashboardColours(document, specs, assigned);

  if (!sameAssignment(coloured.assigned, assigned)) setAssigned(coloured.assigned);

  return coloured.specs;
}
