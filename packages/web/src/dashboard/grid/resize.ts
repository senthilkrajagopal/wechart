import { COLUMNS, ROW_UNIT_PX, pitchOf } from './geometry';

/**
 * Resizing a tile by dragging an edge or a corner (AC-055, direction.md rule
 * 36).
 *
 * There are no width or height fields anywhere in the editor, so this gesture
 * is the *only* way a tile changes size with a pointer — the keyboard's
 * Shift+arrows (T063) being the other. That is why the arithmetic lives here
 * rather than inside a component: two callers, one rule, and the invariant
 * AC-054 states about tiles has to survive both.
 *
 * The size is a function of where the pointer started and where it is now,
 * never of accumulated deltas. Accumulating rounds at every intermediate move,
 * so a slow drag and a quick one over the same distance would end on different
 * sizes, and dragging out and back would not return to where it began.
 */
export type ResizeDirection = 'e' | 's' | 'se';

/**
 * The smallest a tile may be dragged.
 *
 * Both numbers come from the dashboard prototype in `docs/design/prototype`,
 * which clamps a resize to `Math.max(2, …)` columns and to `minH` row units.
 * direction.md fixes the grid, the gutter and the starting sizes but names no
 * minimum, so the prototype is the only place this was ever decided — said
 * plainly here rather than presented as though the design document settled it.
 *
 * The prototype's `minH` is per kind: 10 for everything, 5 for a link tile. A
 * link tile does not exist yet, so only the general floor is here; AC-064's
 * task is where the exception belongs, with the tile it describes.
 */
export const MIN_COLUMNS = 2;

export const MIN_ROWS = 10;

/**
 * And the ceiling, from the same prototype line as the floor
 * (`Math.min(120, …)`): 120 row units is 960 px, about a screen. Taken
 * together with the minimum rather than separately, because citing half of a
 * source and inventing the other half is how the floor went wrong once.
 */
export const MAX_ROWS = 120;

export interface ResizeStart {
  readonly direction: ResizeDirection;
  readonly pointerX: number;
  readonly pointerY: number;
  /** The tile's width in columns when the drag began. */
  readonly w: number;
  /** The tile's height in row units when the drag began. */
  readonly h: number;
  readonly canvasWidth: number;
}

export interface TileSize {
  readonly w: number;
  readonly h: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function resizeTo(start: ResizeStart, pointerX: number, pointerY: number): TileSize {
  // A canvas that has not been laid out measures zero, and the column pitch
  // with it — at which point the first pixel of a drag flings the tile to one
  // end of the grid or the other. With no width to count against there is no
  // horizontal answer to give, so the width stays where it was.
  const measured = start.canvasWidth > 0;

  // An edge is one axis. A pointer never travels in a straight line, so an
  // edge that took both would resize the other axis on every drag.
  const widens = start.direction !== 's' && measured;
  const heightens = start.direction !== 'e';

  const columns = widens ? Math.round((pointerX - start.pointerX) / pitchOf(start.canvasWidth)) : 0;
  const rows = heightens ? Math.round((pointerY - start.pointerY) / ROW_UNIT_PX) : 0;

  return {
    w: clamp(start.w + columns, MIN_COLUMNS, COLUMNS),
    h: clamp(start.h + rows, MIN_ROWS, MAX_ROWS),
  };
}

/**
 * The live readout, exactly as direction.md section 2 writes it:
 * "6 / 12 cols · 50% · 320 px".
 *
 * All three parts are named in rule 36, and each answers a different question:
 * columns is what the document stores, the percentage is what the tile will
 * look like at any canvas width, and pixels is what the reader is looking at
 * right now.
 */
export function readoutFor(w: number, h: number): string {
  const percent = Math.round((w / COLUMNS) * 100);
  return `${String(w)} / ${String(COLUMNS)} cols · ${String(percent)}% · ${String(h * ROW_UNIT_PX)} px`;
}
