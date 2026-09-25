import type { EChartsOption } from '../theme';
import { insideShape, touchesSpan, type Shape } from './hitTest';

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
  /** Where each stack has reached, per axis pair and category. */
  const stacked = new Map<string, number>();

  list<Series>(option['series']).forEach((series, seriesIndex) => {
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

      const key = `${series.stack ?? `alone-${String(seriesIndex)}`}|${String(xi)}|${String(yi)}|${String(index)}`;
      const base = series.stack === undefined ? 0 : (stacked.get(key) ?? 0);
      const top = base + amount;
      if (series.stack !== undefined) stacked.set(key, top);

      const at = (along: number): [number, number] =>
        horizontal ? [px(along), py(index)] : [px(index), py(along)];

      if (series.type === 'line') {
        const [x, y] = at(top);
        if (insideShape(shape, x, y)) take(name, seriesName);
        return;
      }
      if (touchesSpan(shape, at(base), at(top))) take(name, seriesName);
    });
  });

  return out;
}
