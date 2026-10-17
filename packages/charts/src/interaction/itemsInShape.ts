import { laidBarWidth } from '../series/bar';
import type { EChartsOption } from '../theme';
import { insideShape, touchesRect, type Shape } from './hitTest';

/**
 * The items of a drawn chart that a marking shape touches (AC-088, AC-089,
 * direction.md rule 47).
 *
 * Built on `convertToPixel`, which `docs/research/echarts.md` records as
 * documented and stable and names as what rectangle and lasso marking must
 * rest on: ECharts' own brush selects in bar, scatter and candlestick series
 * only. This is the prototype's `itemsInArea` (`charts.js`), written against
 * wechart's option.
 *
 * Each item is named as a click on it names it — its category and its series
 * (`ChartCanvas`) — so what a drag marks is what a click on the same bar
 * would, and the dashboard turns both into a marking the same way.
 *
 * Covers the cartesian series: bar (a bar is touched anywhere along its
 * length, `touchesSpan`), line and area (their point), scatter and heatmap
 * (their point or cell centre). A pie's or a treemap's items are sectors and
 * rectangles with no axis to convert along; the prototype marks those by
 * click alone, and so does this.
 */
export interface PixelConverter {
  /** A value on one axis, as a pixel along it: ECharts' own `convertToPixel`. */
  convertToPixel(
    finder: { readonly xAxisIndex?: number; readonly yAxisIndex?: number },
    value: number | string,
  ): number;
  /** The chart's size, for a band's width where there is one category. */
  getWidth?(): number;
  getHeight?(): number;
}

export interface ShapeItem {
  /** The category, as a click on the item reports it. */
  readonly name: string;
  /** The series it is in, as the legend writes it. */
  readonly seriesName: string;
}

type Axis = { readonly type?: string; readonly data?: readonly unknown[] };
type Series = {
  readonly type?: string;
  readonly name?: string;
  readonly data?: readonly unknown[];
  readonly stack?: string;
  readonly xAxisIndex?: number;
  readonly yAxisIndex?: number;
};

const list = <T>(value: unknown): readonly T[] =>
  Array.isArray(value) ? (value as T[]) : value === undefined ? [] : [value as T];

/** An axis entry's words: a plain value, or `{ value }` with a style. */
const said = (entry: unknown): string =>
  typeof entry === 'object' && entry !== null && 'value' in entry
    ? String((entry as { value: unknown }).value)
    : String(entry ?? '');

/** An item's value, whether written bare or as `{ value, … }`. */
const valueOf = (item: unknown): unknown =>
  typeof item === 'object' && item !== null && !Array.isArray(item)
    ? (item as { value?: unknown }).value
    : item;

export function itemsInShape(
  chart: PixelConverter,
  option: EChartsOption,
  shape: Shape,
): ShapeItem[] {
  const xAxes = list<Axis>(option['xAxis']);
  const yAxes = list<Axis>(option['yAxis']);
  const out: ShapeItem[] = [];
  const seen = new Set<string>();
  const take = (name: string, seriesName: string) => {
    const key = `${name}\u0000${seriesName}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, seriesName });
  };
  /**
   * Where each stack has reached, per axis pair, category and sign: ECharts
   * 6.1 stacks by sign by default (`stackStrategy: 'samesign'`), so a
   * negative segment grows down from the baseline, not from the top of the
   * positive ones (T190 stage 7's review).
   */
  const stacked = new Map<string, number>();
  const allSeries = list<Series>(option['series']);
  /**
   * The bars side by side in each band, per axis pair: every unstacked bar
   * series a column of its own, and a stack one — as ECharts lays them out
   * (`laidBarWidth`, research/echarts-bar-density.md). Overlaid bars
   * (`barGap: '-100%'`) share one.
   */
  const columnsOf = new Map<string, string[]>();
  allSeries.forEach((series, seriesIndex) => {
    if (series.type !== 'bar') return;
    const axes = `${String(series.xAxisIndex ?? 0)}|${String(series.yAxisIndex ?? 0)}`;
    const columns = columnsOf.get(axes) ?? [];
    const overlaid = (series as { barGap?: unknown }).barGap === '-100%';
    const column = overlaid
      ? (columns[0] ?? 'overlay')
      : (series.stack ?? `alone-${String(seriesIndex)}`);
    if (!columns.includes(column)) columns.push(column);
    columnsOf.set(axes, columns);
  });

  allSeries.forEach((series, seriesIndex) => {
    const xi = series.xAxisIndex ?? 0;
    const yi = series.yAxisIndex ?? 0;
    const xAxis = xAxes[xi] ?? {};
    const yAxis = yAxes[yi] ?? {};
    const px = (value: number | string) => chart.convertToPixel({ xAxisIndex: xi }, value);
    const py = (value: number | string) => chart.convertToPixel({ yAxisIndex: yi }, value);
    const seriesName = series.name ?? '';

    (series.data ?? []).forEach((item, index) => {
      const value = valueOf(item);
      if (value === null || value === undefined || value === '-') return;
      const carried =
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? (item as { category?: unknown }).category
          : undefined;

      if (series.type === 'scatter' || series.type === 'heatmap') {
        if (!Array.isArray(value)) return;
        const [x, y] = value as [number | string, number | string];
        if (!insideShape(shape, px(x), py(y))) return;
        // A heatmap's cell is named by its column, as its axis writes it.
        const name =
          series.type === 'heatmap' && typeof x === 'number' && xAxis.data !== undefined
            ? said(xAxis.data[x])
            : String(x);
        take(name, seriesName);
        return;
      }
      if (series.type !== 'bar' && series.type !== 'line') return;

      const horizontal = yAxis.type === 'category';
      const categories = (horizontal ? yAxis : xAxis).data ?? [];
      const name = typeof carried === 'string' ? carried : said(categories[index]);
      const amount = Number(value);
      if (!Number.isFinite(amount)) return;

      // A log axis starts its bars at 1, where 0 has no place at all
      // (ECharts' `Log.getDefaultStartValue`); and a value it cannot place
      // is not marked, rather than turning every comparison into NaN.
      const valueAxis = horizontal ? xAxis : yAxis;
      const origin = valueAxis.type === 'log' ? 1 : 0;
      const sign = amount < 0 ? '-' : '+';
      const key = `${series.stack ?? `alone-${String(seriesIndex)}`}|${String(xi)}|${String(yi)}|${String(index)}|${sign}`;
      const base = series.stack === undefined ? origin : (stacked.get(key) ?? origin);
      const top = series.stack === undefined || origin === 0 ? base + amount : amount;
      if (series.stack !== undefined) stacked.set(key, top);

      const onCategory = (at: number) => (horizontal ? py(at) : px(at));
      const onValue = (at: number) => (horizontal ? px(at) : py(at));
      const [from, to] = [onValue(base), onValue(top)];
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;

      if (series.type === 'line') {
        const centre = onCategory(index);
        const [x, y] = horizontal ? [to, centre] : [centre, to];
        if (Number.isFinite(centre) && insideShape(shape, x, y)) take(name, seriesName);
        return;
      }

      // The rectangle ECharts draws: its column's slot in the band.
      const band =
        categories.length > 1
          ? Math.abs(onCategory(1) - onCategory(0))
          : (horizontal ? (chart.getHeight?.() ?? 0) : (chart.getWidth?.() ?? 0)) * 0.8;
      const columns = columnsOf.get(`${String(xi)}|${String(yi)}`) ?? [];
      const overlaid = (series as { barGap?: unknown }).barGap === '-100%';
      const column = Math.max(
        0,
        columns.indexOf(
          overlaid ? (columns[0] ?? '') : (series.stack ?? `alone-${String(seriesIndex)}`),
        ),
      );
      // As drawn: never past its series' cap (T683; wechart's 36 px), the
      // group centred all the same (research/echarts-axis-legend-bars.md §4).
      const cap = (series as { barMaxWidth?: unknown }).barMaxWidth;
      const width = Math.min(
        laidBarWidth(band, 1, Math.max(1, columns.length)),
        typeof cap === 'number' ? cap : Number.POSITIVE_INFINITY,
      );
      const group = columns.length * width + (columns.length - 1) * 0.1 * width;
      const centre = onCategory(index) - group / 2 + width / 2 + column * 1.1 * width;
      if (!Number.isFinite(centre)) return;
      const [a, b] = [centre - width / 2, centre + width / 2];
      const touched = horizontal
        ? touchesRect(shape, Math.min(from, to), a, Math.max(from, to), b)
        : touchesRect(shape, a, Math.min(from, to), b, Math.max(from, to));
      if (touched) take(name, seriesName);
    });
  });

  return out;
}
