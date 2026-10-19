/**
 * The names a chart colours its marks by, in the order it draws them — what a
 * dashboard's colour assignment must claim for it (AC-039, T301).
 *
 * One definition beside the renderers, so the assignment claims exactly the
 * names `colourFor` is later asked about:
 *
 * - a pie's or donut's slices and a treemap's rectangles are coloured by their
 *   categories, not by their one series (the measure);
 * - a KPI, a table and a pivot draw no categorical colour; a heatmap's colour
 *   is a sequential scale; a trellis draws every panel in the palette's first
 *   colour. None of them colours a member, so none claims one. A claim would
 *   spend a slot that a later tile's real member then goes without, and past
 *   the last slot that member falls to the neutral direction.md §5 keeps for
 *   "Other" and null;
 * - parallel coordinates colour their lines by Colour, or without it by
 *   their members while the lines fit the palette (COLOUR-1);
 * - every other chart colours its series.
 */
import {
  memberOn,
  membersOn,
  OTHER_LABEL,
  seriesOf,
  type ChartType,
  type RenderSpec,
} from '@wechart/core';

import { isParallelType, lineMembersOf } from './series/parallel';
import { colourKeyOf, isPieType, slicesOf } from './series/pie';
import { isTreemapType, treemapNodesOf } from './series/treemap';

const NO_MEMBER_COLOURS: readonly ChartType[] = ['kpi', 'table', 'pivot', 'heatmap', 'trellis'];

/**
 * The measure a chart draws as its one series — one measure, split by
 * nothing, on a chart that colours its series — or nothing (T465, UX-103).
 * A single series colours no member: it claims no slot, and is drawn in the
 * colour another tile gives that measure as one of several series, or else
 * the palette's first. Claimed, it went without a slot past a donut's eight
 * categories and fell to the neutral, which reads as "Other" or no data.
 */
export function singleSeriesOf(spec: RenderSpec): string | undefined {
  if (
    NO_MEMBER_COLOURS.includes(spec.chartType) ||
    isPieType(spec.chartType) ||
    isTreemapType(spec.chartType) ||
    memberOn(spec.encoding, 'color') !== undefined
  )
    return undefined;
  const measures = membersOn(spec.encoding, 'y');
  return measures.length === 1 ? measures[0] : undefined;
}

/** Whether a chart colours members at all: not a KPI's kind, not a single series. */
export function coloursMembers(spec: RenderSpec): boolean {
  return !NO_MEMBER_COLOURS.includes(spec.chartType) && singleSeriesOf(spec) === undefined;
}

export function colouredMembersOf(spec: RenderSpec): string[] {
  if (!coloursMembers(spec)) return [];
  // Parallel coordinates' measures are axes, not series: without Colour, its
  // lines are coloured by their members while they fit the palette, and
  // otherwise by nothing (COLOUR-1).
  if (isParallelType(spec.chartType) && memberOn(spec.encoding, 'color') === undefined)
    return [...new Set(lineMembersOf(spec) ?? [])];
  const names = isPieType(spec.chartType)
    ? slicesOf(spec).map(colourKeyOf)
    : isTreemapType(spec.chartType)
      ? treemapNodesOf(spec).map((node) => node.name)
      : seriesOf(spec).series.map((one) => one.name);
  // Top N's folded tail is no member: `colourFor` draws it in the neutral,
  // and a claim would spend a slot on it, and another each time its count
  // changed (T301's review).
  return [...new Set(names)].filter((name) => !name.startsWith(`${OTHER_LABEL} (`));
}
