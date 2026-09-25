import { describe, expect, it } from 'vitest';

import { BOX, drawJoin, layOut, MARGIN, type Placed } from './joinLayout';

/**
 * The join diagram's layout (T144, AC-138), from the Superset parity run's
 * finding: "The join diagram clips nodes at the right edge". The diagram was
 * sized for a circle of boxes plus a spare band, whatever the pane: wider than
 * the pane, its right-hand boxes lay past the edge, behind a scrollbar the
 * Mac doesn't show. Shrinking it would take its text under the 12 px floor
 * (AC-004), so the boxes lie on an ellipse as wide as the pane allows, and
 * the drawing is sized to what it draws.
 */
const cubes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `cube_${String(index)}` }));
/** A ring of joins, each cube to the next: arrows on every side. */
const ring = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    from: `cube_${String(index)}`,
    to: `cube_${String((index + 1) % count)}`,
  }));

const overlap = (a: Placed, b: Placed) =>
  a.x < b.x + BOX.width &&
  b.x < a.x + BOX.width &&
  a.y < b.y + BOX.height &&
  b.y < a.y + BOX.height;

/** Points along each drawn join, and its label's corners, as the page draws them. */
function drawnPoints(placed: readonly Placed[], joins: readonly { from: string; to: string }[]) {
  const at = new Map(placed.map((each) => [each.name, each]));
  return joins.flatMap(({ from, to }) => {
    const { d, label } = drawJoin(at.get(from) as Placed, at.get(to) as Placed);
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const points = [];
    for (let i = 0; i + 1 < numbers.length; i += 2)
      points.push({ x: numbers[i] as number, y: numbers[i + 1] as number });
    // "many to one", its widest words, centred on the label point.
    return [...points, { x: label.x - 40, y: label.y - 8 }, { x: label.x + 40, y: label.y + 8 }];
  });
}

describe('the join diagram’s layout', () => {
  it('fits the pane’s width where a circle of the same cubes would not', () => {
    for (let count = 3; count <= 14; count += 1) {
      const { width } = layOut(cubes(count), ring(count), 469);
      expect(width, `${String(count)} cubes`).toBeLessThanOrEqual(469);
    }
    // As laid out before, four cubes took 528 px of a 469 px pane.
    expect(layOut(cubes(4), ring(4)).width).toBeGreaterThan(469);
  });

  /**
   * The full suite's model, many cubes one joins to every other (as orders
   * does), drew 510 px in the 469 px pane: a join between boxes far apart bent
   * out by a sixth of its length, past the pane (T144's fix, found by the e2e).
   */
  it('fits the pane’s width with joins from one cube to many far away', () => {
    for (let count = 8; count <= 30; count += 1) {
      const star = cubes(count)
        .slice(1)
        .map(({ name }) => ({ from: 'cube_0', to: name }));
      const { width } = layOut(cubes(count), star, 469);
      expect(width, `${String(count)} cubes`).toBeLessThanOrEqual(469);
    }
  });

  it('never lays one box over another, fitted to any width or not', () => {
    for (const fit of [undefined, 300, 469, 900])
      for (let count = 1; count <= 14; count += 1) {
        const { placed } = layOut(cubes(count), ring(count), fit);
        for (const [at, box] of placed.entries())
          for (const other of placed.slice(at + 1))
            expect(overlap(box, other), `${String(count)} cubes in ${String(fit)}`).toBe(false);
      }
  });

  it('is as big as what it draws — boxes, arrows and labels — and no bigger', () => {
    for (const fit of [undefined, 469])
      for (const count of [2, 4, 7, 10]) {
        const joins = [...ring(count), { from: 'cube_0', to: 'cube_0' }];
        const { placed, width, height } = layOut(cubes(count), joins, fit);
        const points = [
          ...placed.flatMap((box) => [
            { x: box.x, y: box.y },
            { x: box.x + BOX.width, y: box.y + BOX.height },
          ]),
          ...drawnPoints(placed, joins),
        ];
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const label = `${String(count)} cubes in ${String(fit)}`;
        expect(Math.min(...xs), label).toBeGreaterThanOrEqual(0);
        expect(Math.min(...ys), label).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs), label).toBeLessThanOrEqual(width);
        expect(Math.max(...ys), label).toBeLessThanOrEqual(height);
        // No empty band: what it draws comes within a margin of each edge.
        expect(width - Math.max(...xs), label).toBeLessThanOrEqual(MARGIN + 1);
        expect(height - Math.max(...ys), label).toBeLessThanOrEqual(MARGIN + 1);
      }
  });

  it('keeps a circle where the pane is wide enough, the first cube at the top', () => {
    const { placed } = layOut(cubes(6), ring(6), 1200);
    const centres = placed.map((box) => ({ x: box.x + BOX.width / 2, y: box.y + BOX.height / 2 }));
    const middle = {
      x: centres.reduce((sum, each) => sum + each.x, 0) / centres.length,
      y: centres.reduce((sum, each) => sum + each.y, 0) / centres.length,
    };
    const radii = centres.map((each) => Math.hypot(each.x - middle.x, each.y - middle.y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThanOrEqual(2);
    expect(Math.min(...centres.map((each) => each.y))).toBe(centres[0]?.y);
  });
});
