import type { ReactNode } from 'react';

import { COLUMNS, GUTTER_PX, ROW_UNIT_PX, heightOf } from './geometry';

/**
 * The dashboard canvas (AC-054): a 12-column grid that every tile lands on.
 *
 * Tiles are laid out by CSS grid flow rather than by absolute coordinates.
 * That is a deliberate departure from react-grid-layout, which positions
 * items with transforms — `docs/research/dashboard-grid.md` records why:
 * AC-059's nested tree (page tabs → sections → tab groups → tiles) is flow,
 * and a library that owns absolute positions cannot nest that way.
 */
export interface GridTile {
  readonly id: string;
  /** Width in columns. */
  readonly w: number;
  /** Height in 8-pixel row units. */
  readonly h: number;
}

export interface CanvasProps {
  readonly tiles: readonly GridTile[];
  readonly editing: boolean;
  readonly children: (tile: GridTile) => ReactNode;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The document's numbers are snapped here rather than trusted. A width of 4.7
 * can reach the canvas from an older saved format, a hand-edited body or a
 * resize that rounded the wrong way, and the criterion is about where the tile
 * ends up — so the grid is the last word, not the document.
 */
function onGrid(tile: GridTile): { columns: number; height: number } {
  const columns = clamp(Math.round(tile.w) || 1, 1, COLUMNS);
  const rows = Math.max(1, Math.round(tile.h) || 1);
  return { columns, height: heightOf(rows) };
}

/**
 * How tall an empty canvas is while editing. A `display: grid` box with no
 * children is zero pixels tall, so without this the gridlines would paint over
 * nothing — on a brand-new dashboard, which is where seeing the 12 columns
 * matters most.
 */
export const EMPTY_CANVAS_ROWS = 40;

export function Canvas({ tiles, editing, children }: CanvasProps) {
  return (
    <div
      data-testid="grid-canvas"
      className="grid-canvas"
      data-gridlines={editing ? 'true' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(COLUMNS)}, minmax(0, 1fr))`,
        gap: `${String(GUTTER_PX)}px`,
        ...(editing && tiles.length === 0
          ? { minHeight: `${String(EMPTY_CANVAS_ROWS * ROW_UNIT_PX)}px` }
          : {}),
      }}
    >
      {tiles.map((tile) => {
        const { columns, height } = onGrid(tile);
        return (
          <div
            key={tile.id}
            data-testid="grid-tile"
            data-tile={tile.id}
            className="grid-tile"
            style={{ gridColumn: `span ${String(columns)}`, height: `${String(height)}px` }}
          >
            {children(tile)}
          </div>
        );
      })}
    </div>
  );
}
