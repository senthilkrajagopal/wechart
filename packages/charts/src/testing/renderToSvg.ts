/**
 * Headless rendering for the renderer's own tests.
 *
 * The series modules return an ECharts option, and an option is easy to assert
 * against without ever proving a chart comes out of it. AC-037 fails "when a
 * listed type cannot be produced from a valid spec", so the tests render for
 * real — ECharts' SSR mode draws to an SVG string with no DOM and no canvas
 * (`init(null, …, { ssr: true, renderer: 'svg' })`, docs/research/echarts.md
 * §"Init / auth pattern") — and then read the marks back out of the output.
 *
 * Test support, not a product surface: nothing outside tests imports it.
 */
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TitleComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, LegendComponent, TitleComponent, SVGRenderer]);

export const RENDER_SIZE = { width: 640, height: 400 } as const;

export function renderToSvg(option: unknown): string {
  const instance = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    ...RENDER_SIZE,
  });
  try {
    // Animation off: an SSR snapshot is taken at frame zero, and an animating
    // chart would be measured part-way to its real geometry.
    instance.setOption({ animation: false, ...(option as object) });
    return instance.renderToSVGString();
  } finally {
    instance.dispose();
  }
}

/** One rounded corner of a mark: where it is, and how big the radius is. */
export interface Corner {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
}

export interface Box {
  readonly fill: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /**
   * The rounded corners, with their radii and positions.
   *
   * Not a `rounded: boolean`: "the outline contains an arc somewhere" is true
   * of a pill, of a 0.5 px radius, and of a bar rounded at the baseline end —
   * that is, of the direction.md rule exactly inverted. Which corners are
   * rounded and how much is the rule, so the rule has to be what is recorded.
   */
  readonly corners: readonly Corner[];
  /**
   * The painted border width. zrender omits `stroke-width` when it is 1, which
   * is exactly the value a half-width gap would produce, so `undefined` here
   * means "1 px, unstated" and is itself a finding.
   */
  readonly strokeWidthPx: number | undefined;
}

/**
 * The bounding box of every filled mark of the given colours.
 *
 * ECharts' SVG renderer emits each bar as one `<path>`; a square bar uses
 * absolute `M` plus relative `l`, and a rounded one adds `A` arcs at the
 * corners. Walking those four commands is exact for bar marks — this is not a
 * general SVG path parser and does not pretend to be.
 */
export function marksOf(svg: string, fills: readonly string[]): Box[] {
  const boxes: Box[] = [];

  for (const match of svg.matchAll(
    /<path d="([^"]*)"[^>]*\bfill="([^"]*)"(?:[^>]*\bstroke-width="([^"]*)")?/g,
  )) {
    const [, path = '', fill = '', strokeWidth] = match;
    if (!fills.includes(fill)) continue;

    const { points, corners } = outline(path);
    if (points.length === 0) continue;

    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    boxes.push({
      fill,
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      corners,
      strokeWidthPx: strokeWidth === undefined ? undefined : Number(strokeWidth),
    });
  }

  return boxes;
}

/** Every point an ECharts outline passes through, and every corner it rounds. */
function outline(path: string): { points: [number, number][]; corners: Corner[] } {
  const points: [number, number][] = [];
  const corners: Corner[] = [];
  let x = 0;
  let y = 0;

  // One command letter plus the numbers that follow it.
  for (const step of path.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const command = step[1] ?? '';
    const numbers = [...(step[2] ?? '').matchAll(/-?\d*\.?\d+(?:e-?\d+)?/g)].map((n) =>
      Number(n[0]),
    );

    switch (command) {
      case 'M':
      case 'L':
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          x = numbers[index] as number;
          y = numbers[index + 1] as number;
          points.push([x, y]);
        }
        break;
      case 'm':
      case 'l':
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          x += numbers[index] as number;
          y += numbers[index + 1] as number;
          points.push([x, y]);
        }
        break;
      // An elliptical arc: rx ry rotation large-arc sweep endX endY. The curve
      // bulges no further than its endpoints for the corner radii ECharts
      // draws, so the endpoint is enough for a box — but the radius is the
      // rule being checked, so it is kept rather than discarded.
      case 'A':
      case 'a':
        for (let index = 0; index + 6 < numbers.length; index += 7) {
          const endX = numbers[index + 5] as number;
          const endY = numbers[index + 6] as number;
          x = command === 'A' ? endX : x + endX;
          y = command === 'A' ? endY : y + endY;
          points.push([x, y]);
          corners.push({ x, y, radiusPx: numbers[index] as number });
        }
        break;
      case 'Z':
      case 'z':
        break;
      default:
        // Curves and the shorthand forms move the current point in ways this
        // walker does not track, so skipping one would silently return a
        // wrong box rather than fail. Better to stop than to measure a shape
        // we cannot read.
        throw new Error(
          `renderToSvg cannot read the path command "${command}"; extend outline() before using it on this chart type`,
        );
    }
  }

  return { points, corners };
}

export interface Label {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The positioned text in the output. Axis labels carry their position in a
 * `transform`, not in `x`/`y`, so where the categories sit — along the bottom
 * or down the side — is what tells a vertical bar chart from a horizontal one
 * in the rendered result rather than in the option.
 */
export function labelsOf(svg: string): Label[] {
  return [
    ...svg.matchAll(
      /<text\b[^>]*transform="translate\((-?[\d.]+) (-?[\d.]+)\)"[^>]*>([^<]*)<\/text>/g,
    ),
  ].map((match) => ({
    text: match[3] ?? '',
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

/** The positions of the given category labels, in the order given. */
export function categoryLabelsOf(svg: string, categories: readonly string[]): Label[] {
  const found = labelsOf(svg);
  return categories.flatMap((category) => found.filter((label) => label.text === category));
}
