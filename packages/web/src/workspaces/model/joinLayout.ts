/**
 * Where the join diagram's boxes and arrows go (T144, AC-138): the boxes on a
 * circle, the cube being edited at the top; each arrow bends to its own
 * right, as the prototype's curved edges do, so two cubes joining each other
 * show two arrows (T144's review).
 *
 * In a pane too narrow for the circle, the boxes lie on an ellipse as wide
 * as the pane allows and as tall as keeps them apart: shrunk instead, the
 * diagram's text would fall under the 12 px floor (AC-004), and wider than
 * the pane, its right-hand boxes lay past the edge (the Superset parity run).
 * The drawing is as big as what it draws, arrows and labels too.
 */
export const BOX = { width: 168, height: 52 };
export const MARGIN = 16;
/** The least room between two boxes. */
const CLEARANCE = 8;
/** Half a relationship's label, "many to one", as drawn: its extent past its point. */
const LABEL = { x: 40, y: 8 };

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box, where it is drawn: its top-left corner. */
export type Placed<T extends { readonly name: string } = { readonly name: string }> = T & Point;

const round = (value: number) => Math.round(value * 10) / 10;

const centreOf = (box: Placed): Point => ({ x: box.x + BOX.width / 2, y: box.y + BOX.height / 2 });

/** Where the line from a box's centre toward a point leaves the box. */
function borderToward(box: Placed, toward: Point): Point {
  const centre = centreOf(box);
  const [dx, dy] = [toward.x - centre.x, toward.y - centre.y];
  const scale = Math.min(
    dx === 0 ? Infinity : BOX.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : BOX.height / 2 / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

type Joins = readonly { readonly from: string; readonly to: string }[];

/** The angle of the box at `index` of `count`, the first at the top. */
const angleOf = (index: number, count: number) =>
  -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);

/** The boxes on an ellipse around the origin, by the radii across and down. */
function onEllipse<T extends { readonly name: string }>(
  boxes: readonly T[],
  across: number,
  down: number,
): Placed<T>[] {
  return boxes.map((box, index) => {
    const angle = angleOf(index, boxes.length);
    return {
      ...box,
      x: Math.round(Math.cos(angle) * across - BOX.width / 2),
      y: Math.round(Math.sin(angle) * down - BOX.height / 2),
    };
  });
}

/**
 * The least radius down that keeps every two boxes apart, on an ellipse this
 * wide across; none when two boxes side by side would meet at any height.
 */
function downFor(count: number, across: number): number | undefined {
  let down = 0;
  for (let i = 0; i < count; i += 1)
    for (let j = i + 1; j < count; j += 1) {
      const [a, b] = [angleOf(i, count), angleOf(j, count)];
      if (Math.abs(Math.cos(a) - Math.cos(b)) * across >= BOX.width + CLEARANCE) continue;
      const apart = Math.abs(Math.sin(a) - Math.sin(b));
      if (apart < 1e-9) return undefined;
      down = Math.max(down, (BOX.height + CLEARANCE) / apart);
    }
  // Rounding each box to the pixel takes a pixel off either side.
  return down + 2;
}

/**
 * Two columns, the boxes taking turns down them: side by side, each is half
 * a row below the one before, and a whole row below the one above it in its
 * own column. For panes no ellipse fits.
 */
function inColumns<T extends { readonly name: string }>(boxes: readonly T[]): Placed<T>[] {
  const across = BOX.width + 64;
  const down = Math.round((BOX.height + 40) / 2);
  return boxes.map((box, index) => ({ ...box, x: (index % 2) * across, y: index * down }));
}

/** What the boxes and joins draw: the corners of it all. */
function extentOf(placed: readonly Placed[], joins: Joins) {
  const at = new Map(placed.map((each) => [each.name, each]));
  const points: Point[] = placed.flatMap((box) => [
    { x: box.x, y: box.y },
    { x: box.x + BOX.width, y: box.y + BOX.height },
  ]);
  for (const { from, to } of joins) {
    const [a, b] = [at.get(from), at.get(to)];
    if (a === undefined || b === undefined) continue;
    const { d, label } = drawJoin(a, b);
    // A curve keeps within its control points, which the path lists.
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2)
      points.push({ x: numbers[i] ?? 0, y: numbers[i + 1] ?? 0 });
    points.push(
      { x: label.x - LABEL.x, y: label.y - LABEL.y },
      { x: label.x + LABEL.x, y: label.y + LABEL.y },
    );
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** The boxes moved in by a margin from what's drawn, and the size of it all. */
function framed<T extends { readonly name: string }>(around: Placed<T>[], joins: Joins) {
  const { left, top, right, bottom } = extentOf(around, joins);
  const [dx, dy] = [Math.ceil(MARGIN - left), Math.ceil(MARGIN - top)];
  return {
    placed: around.map((box) => ({ ...box, x: box.x + dx, y: box.y + dy })),
    width: Math.ceil(right + dx + MARGIN),
    height: Math.ceil(bottom + dy + MARGIN),
  };
}

/**
 * On a circle whose neighbours' centres are further apart than a box's
 * diagonal, so no two boxes meet whatever the count; the first at the top.
 * Where that's wider than `fit`, the widest ellipse that fits it; where none
 * does, two columns; and where even those don't, the narrowest of them all.
 */
export function layOut<T extends { readonly name: string }>(
  boxes: readonly T[],
  joins: Joins,
  fit?: number,
): { placed: Placed<T>[]; width: number; height: number } {
  const count = boxes.length;
  const radius = count < 2 ? 0 : Math.max(110, (BOX.width + 24) / (2 * Math.sin(Math.PI / count)));
  const circle = framed(onEllipse(boxes, radius, radius), joins);
  if (fit === undefined || circle.width <= fit) return circle;

  let narrowest = circle;
  for (let across = radius - 8; across >= 0; across -= 8) {
    const needed = downFor(count, across);
    if (needed === undefined) continue;
    const drawn = framed(onEllipse(boxes, across, Math.max(radius, needed)), joins);
    if (drawn.width <= fit) return drawn;
    if (drawn.width < narrowest.width) narrowest = drawn;
  }
  const columns = framed(inColumns(boxes), joins);
  return columns.width < narrowest.width ? columns : narrowest;
}

/** A join's path, and where its label goes: a curve bending to its right; a loop for a cube to itself. */
export function drawJoin(from: Placed, to: Placed): { d: string; label: Point } {
  if (from === to) {
    const [x, y] = [from.x + BOX.width, from.y];
    const start = { x: x - 44, y };
    const end = { x, y: y + 16 };
    return {
      d: `M ${String(round(start.x))} ${String(round(start.y))} C ${String(round(start.x))} ${String(round(y - 40))}, ${String(round(x + 40))} ${String(round(y - 40))}, ${String(round(end.x))} ${String(round(end.y))}`,
      label: { x: round(x + 14), y: round(y - 30) },
    };
  }
  const [a, b] = [centreOf(from), centreOf(to)];
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = Math.hypot(dx, dy) || 1;
  // Its right-hand side: the way back bends the other way.
  const normal = { x: -dy / length, y: dx / length };
  // Bent by a sixth of its length, up to 40 px: a join between boxes far
  // apart would otherwise bow out past the pane (found by the full suite).
  const lift = Math.min(40, Math.max(28, length * 0.16));
  const bend = { x: (a.x + b.x) / 2 + normal.x * lift, y: (a.y + b.y) / 2 + normal.y * lift };
  const start = borderToward(from, bend);
  const end = borderToward(to, bend);
  const middle = {
    x: 0.25 * start.x + 0.5 * bend.x + 0.25 * end.x + normal.x * 12,
    y: 0.25 * start.y + 0.5 * bend.y + 0.25 * end.y + normal.y * 12,
  };
  return {
    d: `M ${String(round(start.x))} ${String(round(start.y))} Q ${String(round(bend.x))} ${String(round(bend.y))} ${String(round(end.x))} ${String(round(end.y))}`,
    label: { x: round(middle.x), y: round(middle.y) },
  };
}
