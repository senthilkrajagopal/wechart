import { CLICK_SLOP_PX } from './itemClick';
import type { Point, Shape } from './hitTest';

/**
 * The drag that marks a rectangle, or a lasso with Alt held (AC-088,
 * direction.md rule 47).
 *
 * **Complementary to `itemClicks`, by construction.** Both watch the same
 * press and release, and they split on the same threshold: under
 * `CLICK_SLOP_PX` is a click, at or over it is a drag. Exactly one fires for
 * any movement. Two thresholds written separately would eventually disagree,
 * and both ways of disagreeing are AC-088's failing states — a gesture that
 * counted as both would mark twice, and one that counted as neither would
 * leave the marking untouched while the user watched a rectangle appear.
 *
 * The shape is reported; drawing it is the overlay's job at the call site, and
 * the prototype draws it as DOM above the canvas so that plain clicks still
 * reach the chart underneath.
 */
export interface DragEvent {
  readonly x: number;
  readonly y: number;
  /** Alt was held: a lasso rather than a rectangle (Spotfire's gesture). */
  readonly alt: boolean;
}

export interface DragGesture {
  readonly down: (event: DragEvent) => void;
  readonly move: (event: DragEvent) => void;
  readonly up: (event: DragEvent) => void;
}

export function dragGesture(onShape: (shape: Shape) => void): DragGesture {
  let from: DragEvent | null = null;
  let path: Point[] = [];
  let dragging = false;

  const reset = () => {
    from = null;
    path = [];
    dragging = false;
  };

  return {
    down(event) {
      from = event;
      path = [[event.x, event.y]];
      dragging = false;
    },

    move(event) {
      if (from === null) return;

      /**
       * Once a drag, always a drag. Without this, dragging out and coming
       * back would end as a click and mark whatever happened to be under the
       * release — the opposite of what the user drew.
       */
      if (!dragging && Math.hypot(event.x - from.x, event.y - from.y) >= CLICK_SLOP_PX) {
        dragging = true;
      }
      if (dragging) path.push([event.x, event.y]);
    },

    up(event) {
      const start = from;
      const drawn = path;
      const wasDragging = dragging;
      reset();

      if (start === null || !wasDragging) return;

      if (start.alt) {
        onShape({ kind: 'lasso', points: drawn });
        return;
      }

      // A rectangle is defined by where it began and where it ended, whatever
      // route the pointer took between them.
      onShape({ kind: 'rect', x0: start.x, y0: start.y, x1: event.x, y1: event.y });
    },
  };
}
