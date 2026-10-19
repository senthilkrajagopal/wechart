/**
 * A box plot's violin (T992, AC-592; design 23 sheet 11; direction.md §7i
 * "Box plot layers"): each category's values as a mirrored density, in the
 * category's colour at 0.24 with a 1.5 px edge of that colour, behind its
 * box, which narrows to 20 px inside it.
 *
 * Drawn by wechart's own ECharts `custom` series, not
 * `@echarts-x/custom-violin`: that package estimates its density only over 0
 * to 10 with a fixed bandwidth, draws no edge and can't be marked
 * (research/echarts-violin.md; 23-Q10 (a)). The density is estimated here
 * (decision T992-1): a Gaussian kernel, its bandwidth by the rule Vega uses,
 * from each category's least value to its greatest, each violin as wide as
 * its share of the band where its values gather most.
 */
import type { CustomSeriesOption } from 'echarts/charts';

/** The violin's fill opacity and edge (direction.md §7i, from §7h's area fill). */
export const VIOLIN_FILL_OPACITY = 0.24;
export const VIOLIN_EDGE_PX = 1.5;
/** The box's width inside a violin (direction.md §7i). */
export const BOX_IN_VIOLIN_PX = 20;

/**
 * The box's `boxWidth` bounds while a violin is drawn: at most 20 px, and
 * otherwise as wide as ECharts makes one box on its band, so on a narrow
 * band it never meets its neighbours (T992's review).
 */
export const BOX_IN_VIOLIN_WIDTH: readonly [number, number] = [0, BOX_IN_VIOLIN_PX];

/**
 * The box's width on a band of this many pixels, as ECharts lays out one
 * boxplot series: `0.8 · band − 2`, held to `boxWidth`'s bounds
 * (`calculateBase` in `echarts/lib/chart/boxplot/boxplotLayout.js`;
 * research/echarts-violin.md).
 */
export function boxInViolinOf(band: number): number {
  return Math.min(Math.max(band * 0.8 - 2, BOX_IN_VIOLIN_WIDTH[0]), BOX_IN_VIOLIN_WIDTH[1]);
}
/**
 * The share of its category's band a violin takes where its values gather
 * most: design 23 sheet 11 draws a 76 px violin in a 120 px band.
 */
export const VIOLIN_WIDTH_SHARE = 0.64;
/** The heights a density is estimated at, from the least value to the greatest. */
const STEPS = 64;

/** One height of a violin: its value, and its width there, 1 where widest. */
export interface DensityAt {
  readonly at: number;
  readonly width: number;
}

/** The value below which a sorted list's share `p` of values lies (type 7, as the box's). */
function quantile(sorted: readonly number[], p: number): number {
  const at = (sorted.length - 1) * p;
  const below = Math.floor(at);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (at - below);
}

/**
 * The bandwidth: `1.06 · min(σ, IQR/1.34) · n^-0.2`, as Vega's
 * `bandwidth.js` reckons it (research/echarts-violin.md, "Kernel density
 * references"); σ alone where the quartiles meet, and none where every value
 * is one.
 */
function bandwidthOf(sorted: readonly number[]): number {
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const sigma = Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
  const spread = (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 1.34;
  const scale = spread > 0 ? Math.min(sigma, spread) : sigma;
  return 1.06 * scale * n ** -0.2;
}

/**
 * A category's violin: the values' Gaussian kernel density at `STEPS`
 * heights from the least value to the greatest, scaled so the widest is 1.
 * None for fewer than two values, or values all one.
 */
export function densityOf(values: readonly number[]): DensityAt[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length < 2) return [];
  const least = sorted[0]!;
  const greatest = sorted[sorted.length - 1]!;
  if (least === greatest) return [];
  const h = bandwidthOf(sorted);
  if (!(h > 0)) return [];
  const heights = Array.from(
    { length: STEPS },
    (_, at) => least + ((greatest - least) * at) / (STEPS - 1),
  );
  heights[STEPS - 1] = greatest;
  // The constant factor drops out when scaled to the widest.
  const densities = heights.map((at) =>
    sorted.reduce((sum, value) => sum + Math.exp(-0.5 * ((at - value) / h) ** 2), 0),
  );
  const widest = Math.max(...densities);
  return heights.map((at, index) => ({ at, width: densities[index]! / widest }));
}

/** A category's violin to draw: its name on the axis, its density, its colour. */
export interface ViolinOf {
  readonly name: string;
  readonly density: readonly DensityAt[];
  readonly colour: string;
}

type RenderItem = NonNullable<CustomSeriesOption['renderItem']>;

/**
 * The violins as one `custom` series under the box (`z` 1; the boxplot's is
 * 2): an item per category, `[name, least, greatest]`, so the value axis
 * reaches its ends; each drawn as a polygon about its category's centre.
 */
export function violinSeries(name: string, violins: readonly ViolinOf[]): CustomSeriesOption {
  const renderItem: RenderItem = (params, api) => {
    const violin = violins[params.dataIndex];
    if (violin === undefined || violin.density.length < 2) return null;
    const category = api.value(0);
    const sized = api.size?.([1, 0]);
    const band = Array.isArray(sized) ? (sized[0] ?? 0) : (sized ?? 0);
    // Never narrower than its box, with an edge's room either side: on a
    // narrow band the box is narrower than 20 px (`boxInViolinOf`).
    const half = Math.max(band * VIOLIN_WIDTH_SHARE, boxInViolinOf(band) + 2 * VIOLIN_EDGE_PX) / 2;
    const [centre = 0] = api.coord([category, violin.density[0]!.at]);
    const right = violin.density.map(({ at, width }) => {
      const [, y = 0] = api.coord([category, at]);
      return [round(centre + width * half), round(y)];
    });
    const left = [...right].reverse().map(([x = 0, y = 0]) => [round(2 * centre - x), y]);
    const opacity = Number(api.value(3));
    return {
      type: 'polygon',
      shape: { points: [...right, ...left] },
      style: {
        // Faded with its box under a marking that holds none of its points (AC-593).
        ...(Number.isFinite(opacity) && opacity < 1 ? { opacity } : {}),
        fill: violin.colour,
        fillOpacity: VIOLIN_FILL_OPACITY,
        stroke: violin.colour,
        lineWidth: VIOLIN_EDGE_PX,
      },
    };
  };
  return {
    type: 'custom',
    name,
    z: 1,
    clip: true,
    encode: { x: 0, y: [1, 2] },
    // Named by its category, so a click on it names what a click on its box
    // names (AC-593); its fourth value its opacity, which a marking lowers
    // where its box fades (`withBoxMarks`).
    data: violins.map((violin) => ({
      name: violin.name,
      value: [
        violin.name,
        violin.density[0]?.at ?? null,
        violin.density[violin.density.length - 1]?.at ?? null,
        1,
      ],
    })),
    renderItem,
  };
}

/** To a hundredth of a pixel, so the drawing is the same from run to run. */
function round(px: number): number {
  return Math.round(px * 100) / 100;
}
