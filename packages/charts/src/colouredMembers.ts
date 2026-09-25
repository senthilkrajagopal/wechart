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
 * - every other chart colours its series.
 */
import { OTHER_LABEL, seriesOf, type ChartType, type RenderSpec } from '@wechart/core';

import { colourKeyOf, isPieType, slicesOf } from './series/pie';
import { isTreemapType, treemapNodesOf } from './series/treemap';

const NO_MEMBER_COLOURS: readonly ChartType[] = ['kpi', 'table', 'pivot', 'heatmap', 'trellis'];

export function colouredMembersOf(spec: RenderSpec): string[] {
  if (NO_MEMBER_COLOURS.includes(spec.chartType)) return [];
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
