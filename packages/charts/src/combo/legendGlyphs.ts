/**
 * Where a drawn chart's legend put each entry's glyph (T857, AC-497): the
 * chart editor centres a 20 px button on each, opening the series' mark and
 * axis menu, and a pointer over it emphasises the series' axis (AC-500).
 *
 * ECharts draws the legend itself and has no public method giving an entry's
 * place, so this reads the legend's view as its own API object does
 * (research/echarts-legend-item-boxes.md): the first legend's content group,
 * one group per entry, the icon its first child, the entry's index in
 * `__legendDataIndex`. Anything missing gives no boxes, so the editor shows
 * no buttons rather than failing.
 */
import type { echarts } from '../echarts';

/**
 * One legend entry's glyph: its series' name and its centre, in the chart's
 * pixels; and the whole entry's box, which a pointer over emphasises the
 * series' axis on any tile (AC-500).
 */
export interface LegendGlyphBox {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly entry: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}

/** The entry under a point in the chart's pixels, or none (AC-500). */
export function legendEntryAt(
  boxes: readonly LegendGlyphBox[],
  x: number,
  y: number,
): LegendGlyphBox | undefined {
  return boxes.find(
    ({ entry }) => x >= entry.left && x <= entry.right && y >= entry.top && y <= entry.bottom,
  );
}

type Matrix = readonly number[] | null | undefined;
interface Drawn {
  readonly __legendDataIndex?: unknown;
  getComputedTransform?: () => Matrix;
  getBoundingRect?: () => { x: number; y: number; width: number; height: number };
  childAt?: (index: number) => Drawn | undefined;
  childCount?: () => number;
  children?: () => Drawn[];
}
interface LegendModel {
  getData?: () => readonly { get: (key: string) => unknown }[];
}
/** The two methods the instance has but its typings call private. */
interface Internals {
  getModel?: () =>
    { getComponent?: (type: string, index?: number) => LegendModel | undefined } | undefined;
  getViewOfComponentModel?: (model: LegendModel) => { getContentGroup?: () => Drawn } | undefined;
}

/** `(x, y)` through a zrender matrix `[a, b, c, d, e, f]`; none is the identity. */
function through(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  if (matrix === null || matrix === undefined || matrix.length < 6) return { x, y };
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Each legend entry's glyph centre, in the legend's order; none without a legend. */
export function legendGlyphBoxes(chart: ReturnType<typeof echarts.init>): LegendGlyphBox[] {
  const internals = chart as unknown as Internals;
  // No model before the first option is set.
  const model = internals.getModel?.()?.getComponent?.('legend', 0);
  if (model === undefined) return [];
  const content = internals.getViewOfComponentModel?.(model)?.getContentGroup?.();
  const data = model.getData?.() ?? [];
  const width = chart.getWidth();
  const height = chart.getHeight();
  const boxes: LegendGlyphBox[] = [];
  for (const entry of content?.children?.() ?? []) {
    const index = entry.__legendDataIndex;
    // A newline holds nothing and has no index (LegendView.js:142-149).
    if (typeof index !== 'number' || (entry.childCount?.() ?? 0) === 0) continue;
    const name = data[index]?.get('name');
    const icon = entry.childAt?.(0);
    const rect = icon?.getBoundingRect?.();
    if (typeof name !== 'string' || icon === undefined || rect === undefined) continue;
    const centre = through(
      icon.getComputedTransform?.(),
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    // A scroll legend's later page lies outside the chart: no button there.
    if (centre.x < 0 || centre.y < 0 || centre.x > width || centre.y > height) continue;
    // The whole entry, glyph, text and hit area, through the entry's own transform.
    const whole = entry.getBoundingRect?.() ?? rect;
    const matrix = entry.getComputedTransform?.();
    const start = through(matrix, whole.x, whole.y);
    const end = through(matrix, whole.x + whole.width, whole.y + whole.height);
    boxes.push({
      name,
      ...centre,
      entry: {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
      },
    });
  }
  return boxes;
}
