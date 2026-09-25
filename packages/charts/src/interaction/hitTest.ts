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
 *
 * A bar is not a point: a rectangle dragged across the middle of a tall bar
 * touches it without enclosing either end. So the span touches the shape when
 * either end is inside it, or when the span crosses one of its edges — exact,
 * where the prototype sampled nine points along the bar, and a shape thinner
 * than the gap between two samples slipped through a tall bar unmarked
 * (found by T094's drag across a bar's foot).
 */
export function touchesSpan(shape: Shape, from: Point, to: Point): boolean {
  if (insideShape(shape, from[0], from[1]) || insideShape(shape, to[0], to[1])) return true;
  return edgesOf(shape).some(([a, b]) => segmentsMeet(from, to, a, b));
}

/**
 * Whether the shape touches a rectangle, such as a bar as ECharts draws it:
 * an edge of the rectangle inside or across the shape, or the shape wholly
 * inside the rectangle.
 */
export function touchesRect(shape: Shape, x0: number, y0: number, x1: number, y1: number): boolean {
  const corners: readonly Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  if (
    corners.some((corner, index) => touchesSpan(shape, corner, corners[(index + 1) % 4] ?? corner))
  )
    return true;
  const [first] = edgesOf(shape);
  return (
    first !== undefined && insideShape({ kind: 'rect', x0, y0, x1, y1 }, first[0][0], first[0][1])
  );
}

/** The shape's outline as segments, a lasso closed back to its start. */
function edgesOf(shape: Shape): (readonly [Point, Point])[] {
  const points: readonly Point[] =
    shape.kind === 'rect'
      ? [
          [shape.x0, shape.y0],
          [shape.x1, shape.y0],
          [shape.x1, shape.y1],
          [shape.x0, shape.y1],
        ]
      : shape.points;
  return points.map((point, index) => [point, points[(index + 1) % points.length] ?? point]);
}

/** Which side of the line through a and b the point c is on: its sign. */
function turn(a: Point, b: Point, c: Point): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

/** Whether c, on the line through a and b, lies within the segment a–b. */
function within(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a[0], b[0]) <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] &&
    c[1] <= Math.max(a[1], b[1])
  );
}

/** Whether two segments share a point, touching and overlapping included. */
function segmentsMeet(p: Point, q: Point, r: Point, s: Point): boolean {
  const [a, b, c, d] = [turn(p, q, r), turn(p, q, s), turn(r, s, p), turn(r, s, q)];
  if (a !== b && c !== d) return true;
  return (
    (a === 0 && within(p, q, r)) ||
    (b === 0 && within(p, q, s)) ||
    (c === 0 && within(r, s, p)) ||
    (d === 0 && within(r, s, q))
  );
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
