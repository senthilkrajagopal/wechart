import { inSeriesOrder, MAX_PANELS, seriesCount, seriesOrderOf } from '@wechart/charts';
import { distinctValues, memberOn, OTHER_LABEL, seriesOf, type RenderSpec } from '@wechart/core';

/** A trellis panel the menu offers, and its place among the chart's own panels. */
export interface TilePanel {
  readonly value: string;
  readonly index: number;
}

/**
 * Types whose legend lists something other than the colour split, or that
 * draw none: a heatmap's colour is its measure, a scale; a pie's, donut's
 * or treemap's legend lists its categories; a table, KPI, pivot or trellis
 * has no legend (`@wechart/charts`' legend.ts).
 */
const NO_SPLIT_LEGEND: ReadonlySet<RenderSpec['chartType']> = new Set([
  'heatmap',
  'pie',
  'donut',
  'treemap',
  'kpi',
  'table',
  'pivot',
  'trellis',
]);

/** Neither a blank nor Top N's "Other (n)": no legend entry or panel a pointer can pick. */
const pickable = (value: string) => value !== '' && !value.startsWith(`${OTHER_LABEL} (`);

/**
 * The series and panels a tile's ⋯ menu offers (T631, AC-176; R63), each one
 * a pointer could reach on the tile as drawn (T631's review):
 *
 * - a series, where the legend names the colour split: its entries, in the
 *   order the legend lists them (Customize's order first, T392), as the
 *   filters leave the tile (`shown`). A scatter's points are its series.
 * - a panel, of the trellis as drawn (`shown`, at most `MAX_PANELS`), with
 *   its place among the chart's own panels (`own`), which is how a header's
 *   click is read (`clickedValue`).
 */
export function tilePartsOf(
  own: RenderSpec,
  shown: RenderSpec,
): { readonly series: readonly string[]; readonly panels: readonly TilePanel[] } {
  const split = memberOn(shown.encoding, 'color');
  const series =
    split === undefined || NO_SPLIT_LEGEND.has(shown.chartType) || seriesCount(shown) < 2
      ? []
      : inSeriesOrder(seriesOf(shown).series, seriesOrderOf(shown))
          .map((one) => one.name)
          .filter(pickable);

  const facet = memberOn(own.encoding, 'facet');
  const ownPanels =
    own.chartType === 'trellis' && facet !== undefined ? distinctValues(own.rows, facet) : [];
  const panels =
    facet === undefined || ownPanels.length === 0
      ? []
      : distinctValues(shown.rows, facet)
          .slice(0, MAX_PANELS)
          .filter(pickable)
          .map((value) => ({ value, index: ownPanels.indexOf(value) }))
          .filter((panel) => panel.index >= 0);
  return { series, panels };
}
