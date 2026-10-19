import {
  assignColours,
  DEFAULT_PALETTE,
  colouredMembersOf,
  coloursMembers,
  OTHER_COLOUR,
  seriesSettingsOf,
  singleSeriesOf,
} from '@wechart/charts';
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

  /**
   * A colour a tile's Customize tab chose for a member (AC-219) is that
   * member's colour on the whole dashboard (T465, UX-103), so the member is
   * one colour on every tile rather than the chosen one on that tile and a
   * palette slot on the next. The first tile in document order to choose one
   * decides; a tile that chose otherwise still draws its own choice.
   *
   * Read from each tile's settings, whatever its rows show at the moment, so
   * a member doesn't change colour as it comes into view (T465's review). And
   * never carried: a choice is the tile's setting, not a claim, so Discard,
   * Undo or Auto taking it away gives every tile the member's own colour back.
   */
  const chosen: Record<string, string> = {};
  for (const chartId of chartIds) {
    const spec = specs[chartId];
    if (spec === undefined || !coloursMembers(spec)) continue;
    for (const [member, settings] of Object.entries(seriesSettingsOf(spec))) {
      if (settings.colour !== undefined && !(member in chosen)) chosen[member] = settings.colour;
    }
  }
  const assignment = assignColours(undefined, starting, Object.values(chosen));

  // Every claim first, in document order, so that a single series below can
  // take the colour its measure has as one of several series anywhere.
  for (const chartId of chartIds) {
    const spec = specs[chartId];
    if (spec !== undefined)
      for (const member of colouredMembersOf(spec)) assignment.colourFor(member);
  }
  const claimed = assignment.assigned();

  const coloured: Record<string, RenderSpec> = {};
  for (const chartId of chartIds) {
    const spec = specs[chartId];
    if (spec === undefined) continue;

    // What the tile colours: a pie's slices by their categories, and nothing
    // for a tile that colours no member (T301).
    const colours: Record<string, string> = {};
    for (const member of colouredMembersOf(spec))
      colours[member] = chosen[member] ?? assignment.colourFor(member);
    // A single series claims nothing: its measure's colour where another tile
    // gives it one, else the palette's first — never the neutral (T465).
    const alone = singleSeriesOf(spec);
    const given = alone === undefined ? undefined : (chosen[alone] ?? claimed[alone]);
    if (alone !== undefined && given !== undefined && given !== OTHER_COLOUR)
      colours[alone] = given;
    coloured[chartId] = { ...spec, colours };
  }
  return { specs: coloured, assigned: claimed };
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
  return useDashboardColourAssignment(document, specs).specs;
}

/**
 * The same, with the assignment itself, for what draws a member outside a
 * chart — a Text tile's sparkline in its measure's colour (T885, AC-521).
 */
export function useDashboardColourAssignment(
  document: DashboardDocument,
  specs: Readonly<Record<string, RenderSpec>>,
): DashboardColours {
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const coloured = dashboardColours(document, specs, assigned);

  if (!sameAssignment(coloured.assigned, assigned)) setAssigned(coloured.assigned);

  return coloured;
}

/**
 * A member's dashboard colour (AC-039): the one it was given, else the next
 * the palette has free, as the next chart to draw it would give it.
 */
export function colourOfMember(assigned: Readonly<Record<string, string>>, member: string): string {
  return assignColours(DEFAULT_PALETTE, assigned).colourFor(member);
}
