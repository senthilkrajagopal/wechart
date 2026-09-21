/**
 * Whether a marking shape touches an item (AC-088, direction.md rule 47).
 *
 * Pure geometry over pixel coordinates. The pixels come from ECharts'
 * `convertToPixel`, which `docs/research/echarts.md` records as "documented and
 * stable" and identifies as the thing rectangle and lasso marking must be
 * built on, because ECharts' own brush component does not cover our series
 * mix. Keeping the geometry here and the conversion at the call site means the
 * hard part is testable without a chart instance.
 */
export type Point = readonly [number, number];

export type Shape =
  | {
      readonly kind: 'rect';
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
    }
  | { readonly kind: 'lasso'; readonly points: readonly Point[] };

/**
 * How many places along an item's length are tested.
 *
 * A bar is not a point: a rectangle dragged across the middle of a tall bar
 * touches it without enclosing either end, and marking only when an end is
 * enclosed would miss the ordinary case of dragging across a chart. The
 * prototype samples the length, and this is that sampling written down.
 *
 * It is an approximation, and the resolution is the promise: a shape thinner
 * than the gap between samples can pass through a long bar unnoticed. Nine
 * samples over a bar is the prototype's figure, kept so the behaviour matches
 * the design it was drawn from.
 */
export const BAR_SAMPLES = 8;

/** Whether a point is inside the shape. Edges count: touching is touching. */
export function insideShape(shape: Shape, x: number, y: number): boolean {
  if (shape.kind === 'rect') {
    // Normalised here rather than in every caller, because a drag up and to
    // the left produces x1 < x0 and that is the same rectangle.
    const [left, right] = shape.x0 <= shape.x1 ? [shape.x0, shape.x1] : [shape.x1, shape.x0];
    const [top, bottom] = shape.y0 <= shape.y1 ? [shape.y0, shape.y1] : [shape.y1, shape.y0];
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  return inPolygon(shape.points, x, y);
}

/**
 * Whether the shape touches anywhere along an item that has length, such as a
 * bar running from its base to its value.
 */
export function touchesSpan(shape: Shape, from: Point, to: Point): boolean {
  for (let step = 0; step <= BAR_SAMPLES; step++) {
    const at = step / BAR_SAMPLES;
    const x = from[0] + (to[0] - from[0]) * at;
    const y = from[1] + (to[1] - from[1]) * at;
    if (insideShape(shape, x, y)) return true;
  }

  return false;
}

/**
 * Ray casting: count the edges a ray to the right crosses, and an odd count
 * means inside. Chosen because it is correct for concave polygons, which is
 * most of why anyone draws a lasso rather than a rectangle.
 */
function inPolygon(points: readonly Point[], x: number, y: number): boolean {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a === undefined || b === undefined) continue;

    const straddles = a[1] > y !== b[1] > y;
    if (!straddles) continue;

    const crossingX = ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (x < crossingX) inside = !inside;
  }

  return inside;
}
