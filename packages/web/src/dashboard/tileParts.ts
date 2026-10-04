import { inSeriesOrder, MAX_PANELS, nameWriter, seriesCount, seriesOrderOf } from '@wechart/charts';
import { distinctValues, memberOn, OTHER_LABEL, seriesOf, type RenderSpec } from '@wechart/core';

/** A series the menu offers: its value, and its name as the legend writes it. */
export interface TileSeries {
  readonly value: string;
  readonly label: string;
}

/** A trellis panel the menu offers, its header's words, and its place among the panels drawn. */
export interface TilePanel {
  readonly value: string;
  readonly label: string;
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
 * a pointer could reach on the tile as it draws it (`shown`: as the filters
 * leave it, with the model's formats; T631's review):
 *
 * - a series, where the legend names the colour split: its entries, in the
 *   order the legend lists them (Customize's first, T392). A scatter's
 *   points are its series.
 * - a panel, of the trellis (at most `MAX_PANELS`), with its place among the
 *   panels drawn, which is how a header's click names it too (T632).
 *
 * Each labelled as the legend or the panel's header writes it: a value of
 * time by its granularity (AC-188; T632).
 */
export function tilePartsOf(shown: RenderSpec): {
  readonly series: readonly TileSeries[];
  readonly panels: readonly TilePanel[];
} {
  const split = memberOn(shown.encoding, 'color');
  const seriesName = nameWriter(shown, split);
  const series =
    split === undefined || NO_SPLIT_LEGEND.has(shown.chartType) || seriesCount(shown) < 2
      ? []
      : inSeriesOrder(seriesOf(shown).series, seriesOrderOf(shown))
          .map((one) => one.name)
          .filter(pickable)
          .map((value) => ({ value, label: seriesName(value) }));

  const facet = memberOn(shown.encoding, 'facet');
  const panelTitle = nameWriter(shown, facet);
  const panels =
    shown.chartType !== 'trellis' || facet === undefined
      ? []
      : distinctValues(shown.rows, facet)
          .slice(0, MAX_PANELS)
          .map((value, index) => ({ value, label: panelTitle(value), index }))
          .filter((panel) => pickable(panel.value));
  return { series, panels };
}
