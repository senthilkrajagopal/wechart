import { echarts } from '../echarts';
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
  /**
   * The entity a box plot's point is, by its "Each point is" value (AC-593),
   * written as the point carries it; a point is then itself, not its category.
   */
  readonly entity?: string;
  /** What the item marks as drawn, where it says so itself: a map's point its place (T978). */
  readonly marks?: readonly { readonly member: string; readonly value: string | number }[];
}

type Axis = { readonly type?: string; readonly data?: readonly unknown[] };
type Series = {
  readonly type?: string;
  readonly coordinateSystem?: string;
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
  // A map's points, or with none its regions (T978, AC-627).
  const onMap = mapItemsInShape(chart, option, shape);
  if (onMap !== undefined) return onMap;
  const xAxes = list<Axis>(option['xAxis']);
  const yAxes = list<Axis>(option['yAxis']);
  const out: ShapeItem[] = [];
  const seen = new Set<string>();
  const take = (name: string, seriesName: string, entity?: string) => {
    const key = `${name}\u0000${seriesName}\u0000${entity ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entity === undefined ? { name, seriesName } : { name, seriesName, entity });
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
  /**
   * Bars share a band by their category axis, whichever value axis each
   * reads (ECharts' `barGrid.js` lays them out on the base axis): a combo's
   * bars on two value axes stand side by side (T846's review).
   */
  const bandOf = (series: Series) => {
    const yi = series.yAxisIndex ?? 0;
    return yAxes[yi]?.type === 'category' ? `y${String(yi)}` : `x${String(series.xAxisIndex ?? 0)}`;
  };
  allSeries.forEach((series, seriesIndex) => {
    if (series.type !== 'bar') return;
    const axes = bandOf(series);
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
    // A map's Density layer is never marked (T977, AC-626).
    if (series.type === 'heatmap' && series.coordinateSystem === 'geo') return;

    (series.data ?? []).forEach((item, index) => {
      const value = valueOf(item);
      if (value === null || value === undefined || value === '-') return;
      const carried =
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? (item as { category?: unknown }).category
          : undefined;

      // A combo's points are one value each, at their category, as a line's
      // are (T846's review); a scatter's or a heatmap's are pairs.
      const pointAtCategory = series.type === 'scatter' && !Array.isArray(value);
      if ((series.type === 'scatter' || series.type === 'heatmap') && !pointAtCategory) {
        if (!Array.isArray(value)) return;
        const [x, y] = value as [number | string, number | string];
        // Where it is drawn: a box plot's point is moved sideways from its
        // category's centre by its own offset (T991), and is its entity (AC-593).
        const own =
          typeof item === 'object' && item !== null && !Array.isArray(item)
            ? (item as { symbolOffset?: unknown; entity?: unknown })
            : {};
        const offset = Array.isArray(own.symbolOffset) ? own.symbolOffset : [];
        const [dx = 0, dy = 0] = offset.map((each) => (typeof each === 'number' ? each : 0));
        if (!insideShape(shape, px(x) + dx, py(y) + dy)) return;
        if (own.entity !== undefined && own.entity !== null) {
          take(String(x), seriesName, String(own.entity));
          return;
        }
        // A heatmap's cell is named by its column, as its axis writes it; a
        // point that carries its category by that, as a bullet's target
        // carries its member (checkpoint 1's review, AC-582).
        const name =
          typeof carried === 'string'
            ? carried
            : series.type === 'heatmap' && typeof x === 'number' && xAxis.data !== undefined
              ? said(xAxis.data[x])
              : String(x);
        take(name, seriesName);
        return;
      }
      if (series.type !== 'bar' && series.type !== 'line' && !pointAtCategory) return;

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

      if (series.type === 'line' || pointAtCategory) {
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
      const columns = columnsOf.get(bandOf(series)) ?? [];
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

type GeoConverter = {
  convertToPixel(finder: { readonly seriesIndex: number }, value: readonly number[]): unknown;
};
type Ring = readonly (readonly number[])[];
type Geometry =
  | { readonly type: 'Polygon'; readonly coordinates: readonly Ring[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly Ring[])[] };
type Feature = { readonly properties?: Record<string, unknown>; readonly geometry?: Geometry };

/** Whether a pixel is inside a polygon's outer ring, by ray casting. */
function insideRing(ring: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let at = 0, before = ring.length - 1; at < ring.length; before = at, at += 1) {
    const [xa, ya] = ring[at]!;
    const [xb, yb] = ring[before]!;
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

/**
 * The items a shape takes in on a map (T978, AC-627; design 23 sheet 6): the
 * Points layer's points inside it, each its place; or, with no Points
 * layer, the regions it touches — any of a region's drawn vertices inside
 * it, or the shape inside the region — each as its row holds it. The
 * Density layer is never taken (T977). None of a chart that isn't a map.
 */
function mapItemsInShape(
  chart: PixelConverter,
  option: EChartsOption,
  shape: Shape,
): ShapeItem[] | undefined {
  const series = list<Series & Record<string, unknown>>(option['series']);
  const regionsAt = series.findIndex((one) => one.type === 'map');
  if (regionsAt < 0) return undefined;
  const geo = chart as unknown as GeoConverter;
  const pixel = (at: number, lngLat: readonly number[]) => {
    const point = geo.convertToPixel({ seriesIndex: at }, lngLat);
    return Array.isArray(point) && point.length >= 2
      ? ([Number(point[0]), Number(point[1])] as [number, number])
      : undefined;
  };
  const out: ShapeItem[] = [];

  const pointsAt = series.findIndex(
    (one) => one.type === 'scatter' && one.coordinateSystem === 'geo',
  );
  if (pointsAt >= 0) {
    // The scatter sits on the hidden geo, laid out as the regions' own, so
    // the regions' series converts its coordinates (research `echarts-geo-points.md`).
    for (const item of series[pointsAt]!.data ?? []) {
      const own = asItem(item);
      const value = own['value'];
      if (!Array.isArray(value)) continue;
      const at = pixel(regionsAt, [Number(value[0]), Number(value[1])]);
      if (at === undefined || !insideShape(shape, at[0], at[1])) continue;
      const marks = own['marks'] as ShapeItem['marks'];
      out.push({
        name: String(own['name'] ?? ''),
        seriesName: String(series[pointsAt]!.name ?? ''),
        ...(marks === undefined ? {} : { marks }),
      });
    }
    return out;
  }

  const regions = series[regionsAt]!;
  const mapName = String(regions['map'] ?? '');
  const nameProperty = String(regions['nameProperty'] ?? 'name');
  const features =
    (echarts.getMap(mapName) as { geoJSON?: { features?: readonly Feature[] } } | null)?.geoJSON
      ?.features ?? [];
  const byKey = new Map<string, Feature[]>();
  for (const feature of features) {
    const key = String(feature.properties?.[nameProperty] ?? '');
    byKey.set(key, [...(byKey.get(key) ?? []), feature]);
  }
  const probe: [number, number] =
    shape.kind === 'rect'
      ? [(shape.x0 + shape.x1) / 2, (shape.y0 + shape.y1) / 2]
      : [shape.points[0]?.[0] ?? Number.NaN, shape.points[0]?.[1] ?? Number.NaN];
  for (const item of regions.data ?? []) {
    const own = asItem(item);
    // Only the regions a row placed, which carry their row's value:
    // ECharts appends the others to the series' data as it draws.
    if (typeof own['category'] !== 'string') continue;
    const key = String(own['name'] ?? '');
    const polygons = (byKey.get(key) ?? []).flatMap((feature) =>
      feature.geometry === undefined
        ? []
        : feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates,
    );
    const touched = polygons.some((rings) => {
      const outer = (rings[0] ?? [])
        .map((lngLat) => pixel(regionsAt, lngLat))
        .filter((at): at is [number, number] => at !== undefined);
      return (
        outer.some(([x, y]) => insideShape(shape, x, y)) || insideRing(outer, probe[0], probe[1])
      );
    });
    if (touched) out.push({ name: own['category'], seriesName: String(regions.name ?? '') });
  }
  return out;
}

const asItem = (item: unknown): Record<string, unknown> =>
  typeof item === 'object' && item !== null && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : { value: item };
