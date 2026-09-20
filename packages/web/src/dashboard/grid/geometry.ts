/**
 * The dashboard canvas grid (AC-054, direction.md section 2 and rule 15):
 * 12 columns, an 8-pixel row unit, a 16-pixel gutter.
 *
 * Pure arithmetic, with no DOM and no React, because three callers have to
 * snap identically: a pointer resize (T061), a grip drag (T062) and the
 * keyboard (T063). A tile whose width came from a drag and a tile whose width
 * came from Shift+Arrow have to be describable by the same two integers, or
 * "every tile snaps to whole columns" is only true of whichever path was
 * tested.
 *
 * A tile's size is therefore stored as those integers — `w` columns and `h`
 * row units — never as pixels. Pixels are what the canvas is painted in; the
 * document holds the grid position, which is what makes the same dashboard
 * land on the grid again at a different canvas width.
 */
export const COLUMNS = 12;
export const ROW_UNIT_PX = 8;
export const GUTTER_PX = 16;

/**
 * Anything the canvas can lay out. The dashboard document's tiles extend this
 * rather than restating it, so there is one definition of "how big is it" and
 * the two cannot drift apart.
 */
export interface GridTile {
  readonly id: string;
  /** Width in columns. */
  readonly w: number;
  /**
   * Height in 8-pixel row units, or absent for an item that is as tall as
   * what it holds — a section or a tab group, which are sized by their
   * contents rather than dragged to a height of their own.
   */
  readonly h?: number | undefined;
}

/**
 * The width of one column at this canvas width. Twelve tracks and the eleven
 * gutters between them fill the canvas exactly.
 */
export function trackOf(canvasWidth: number): number {
  return (canvasWidth - GUTTER_PX * (COLUMNS - 1)) / COLUMNS;
}

/**
 * What a drag has to cross to gain a column: one track plus the gutter that
 * follows it. Dividing by the bare track instead is the classic error — it
 * accumulates a gutter per column and is out by 176 px by the right-hand edge
 * of a 12-column grid.
 */
export function pitchOf(canvasWidth: number): number {
  return trackOf(canvasWidth) + GUTTER_PX;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The whole number of columns nearest to a pixel width, never outside the
 * grid. `Math.round` rather than `Math.floor`: a tile dragged to 4.8 columns
 * is one the user is pulling towards 5.
 */
export function snapColumns(px: number, canvasWidth: number): number {
  const columns = Math.round((px + GUTTER_PX) / pitchOf(canvasWidth));
  return clamp(Number.isFinite(columns) ? columns : 1, 1, COLUMNS);
}

/** The whole number of row units nearest to a pixel height, at least one. */
export function snapRows(px: number): number {
  const rows = Math.round(px / ROW_UNIT_PX);
  return Math.max(1, Number.isFinite(rows) ? rows : 1);
}

/** The pixel height of a whole number of row units. */
export function heightOf(rows: number): number {
  return rows * ROW_UNIT_PX;
}
