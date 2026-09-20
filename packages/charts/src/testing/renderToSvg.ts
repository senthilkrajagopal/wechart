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
import {
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  TreemapChart,
  HeatmapChart,
  VisualMapComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  SVGRenderer,
]);

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
  return filledPaths(svg).filter((box) => fills.includes(box.fill));
}

/**
 * Every cell of a heatmap, darkest last.
 *
 * A heatmap's colours are interpolated along a ramp rather than chosen from a
 * palette, so they cannot be matched by name the way a bar's can — ECharts
 * writes them as `rgb(…)`. What a heatmap claims is that a larger value is a
 * darker cell, so what the helper returns is the luminance to compare.
 */
export function cellsOf(svg: string): (Box & { luminance: number })[] {
  return filledPaths(svg)
    .filter((box) => box.fill.startsWith('rgb('))
    .map((box) => {
      const [r = 0, g = 0, b = 0] = (box.fill.match(/\d+/g) ?? []).map(Number);
      // Rec. 709 luma. Only the ordering matters here, not the exact value.
      return { ...box, luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b };
    });
}

/** Every filled `<path>`, with any `translate` already applied. */
function filledPaths(svg: string): Box[] {
  const boxes: Box[] = [];

  for (const match of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attributes = match[1] ?? '';
    const path = /\bd="([^"]*)"/.exec(attributes)?.[1];
    const fill = /\bfill="([^"]*)"/.exec(attributes)?.[1];
    if (path === undefined || fill === undefined || fill === 'none') continue;

    const { points, corners } = outline(path);
    if (points.length === 0) continue;

    // A treemap's rectangles are drawn at the origin and placed by a
    // transform, so a box read from the path alone would put every one of
    // them in the same corner.
    const translate =
      /\btransform="matrix\(1,0,0,1,([-\d.]+),([-\d.]+)\)"|\btransform="translate\(([-\d.]+)[ ,]([-\d.]+)\)"/.exec(
        attributes,
      );
    const dx = Number(translate?.[1] ?? translate?.[3] ?? 0);
    const dy = Number(translate?.[2] ?? translate?.[4] ?? 0);

    const xs = points.map(([x]) => x + dx);
    const ys = points.map(([, y]) => y + dy);
    const strokeWidth = /\bstroke-width="([^"]*)"/.exec(attributes)?.[1];

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

export interface Stroke {
  readonly colour: string;
  readonly widthPx: number;
  /** The vertices the line passes through, in draw order. */
  readonly points: readonly [number, number][];
  /**
   * How many times the line lifts and restarts. A `null` in the data draws a
   * break rather than joining across it, which shows up as an extra `M`.
   */
  readonly breaks: number;
}

/**
 * Every stroked line of the given colours.
 *
 * A line series is a stroke with `fill="none"`, so `marksOf` — which finds
 * marks by their fill — cannot see one. An area series draws both: a filled
 * polygon that `marksOf` finds, and the line on top that this finds.
 *
 * `fill="none"` is what separates the line from its own markers: a marker is
 * also a stroked path in the series colour, but it is a filled circle carrying
 * a scale transform (see `markersOf`).
 */
export function strokesOf(svg: string, colours: readonly string[]): Stroke[] {
  const strokes: Stroke[] = [];

  for (const match of svg.matchAll(
    /<path d="([^"]*)"[^>]*\bfill="none"[^>]*\bstroke="([^"]*)"(?:[^>]*\bstroke-width="([^"]*)")?/g,
  )) {
    const [, path = '', colour = '', width] = match;
    if (!colours.includes(colour)) continue;

    strokes.push({
      colour,
      // zrender omits `stroke-width` when it is 1, so an absent attribute is
      // a real 1 px line rather than a missing measurement.
      widthPx: width === undefined ? 1 : Number(width),
      points: outline(path).points,
      breaks: (path.match(/[Mm]/g) ?? []).length - 1,
    });
  }

  return strokes;
}

export interface Marker {
  readonly colour: string;
  readonly diameterPx: number;
}

/**
 * The point markers on a line.
 *
 * ECharts draws each as a unit circle scaled by a transform matrix, so the
 * drawn diameter is twice the matrix scale rather than anything in the path
 * itself — which is why direction.md's "markers are at least 8 px" cannot be
 * read off the path data.
 */
export function markersOf(svg: string, colours: readonly string[]): Marker[] {
  const markers: Marker[] = [];

  for (const match of svg.matchAll(
    /<path d="M1 0A[^"]*"[^>]*\btransform="matrix\(([-\d.]+),[^"]*\)"[^>]*\bstroke="([^"]*)"/g,
  )) {
    const [, scale = '0', colour = ''] = match;
    if (!colours.includes(colour)) continue;
    markers.push({ colour, diameterPx: Number(scale) * 2 });
  }

  return markers;
}

export interface Sector {
  readonly fill: string;
  /** Degrees swept, clockwise from the slice's start edge. */
  readonly sweepDeg: number;
  /** True when the slice runs all the way to the middle, i.e. it is not a ring. */
  readonly touchesCentre: boolean;
}

/**
 * Every pie or donut slice of the given colours.
 *
 * ECharts writes a slice as an outer arc plus the edges back: a pie's edge
 * runs to the centre (`… L200 200 Z`), a donut's stops at the inner radius and
 * arcs back. So "has a hole" is readable from the geometry rather than from
 * the option that asked for it.
 *
 * The centre is the middle of the canvas, which is where ECharts puts a pie
 * unless told otherwise, and the angles are taken from the outer arc's two
 * endpoints about it.
 */
export function sectorsOf(svg: string, fills: readonly string[]): Sector[] {
  const centreX = RENDER_SIZE.width / 2;
  const centreY = RENDER_SIZE.height / 2;
  const sectors: Sector[] = [];

  for (const match of svg.matchAll(/<path d="([^"]*)"[^>]*\bfill="([^"]*)"/g)) {
    const [, path = '', fill = ''] = match;
    if (!fills.includes(fill)) continue;

    const { points } = outline(path);
    const [start, end] = points;
    if (start === undefined || end === undefined) continue;

    const angle = ([x, y]: [number, number]) =>
      (Math.atan2(y - centreY, x - centreX) * 180) / Math.PI;
    const sweep = (((angle(end) - angle(start)) % 360) + 360) % 360;

    sectors.push({
      fill,
      sweepDeg: sweep,
      touchesCentre: points.some(
        ([x, y]) => Math.abs(x - centreX) < 1 && Math.abs(y - centreY) < 1,
      ),
    });
  }

  return sectors;
}

export interface Point {
  readonly fill: string;
  readonly x: number;
  readonly y: number;
  readonly diameterPx: number;
}

/**
 * Every plotted point of the given colours, with where it landed.
 *
 * A scatter point is the same scaled unit circle a line marker is, but filled
 * with the series colour and carrying no stroke — so `markersOf`, which keys
 * on the stroke, cannot see one. The transform is what matters here: the
 * matrix holds the scale and then the position, so a point's coordinates are
 * nowhere in the path data.
 */
export function pointsOf(svg: string, fills: readonly string[]): Point[] {
  const points: Point[] = [];

  for (const match of svg.matchAll(
    /<path d="M1 0A[^"]*"[^>]*\btransform="matrix\(([-\d.]+),[-\d.,]*?([-\d.]+),([-\d.]+)\)"[^>]*\bfill="([^"]*)"/g,
  )) {
    const [, scale = '0', x = '0', y = '0', fill = ''] = match;
    if (!fills.includes(fill)) continue;
    points.push({ fill, x: Number(x), y: Number(y), diameterPx: Number(scale) * 2 });
  }

  return points;
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
