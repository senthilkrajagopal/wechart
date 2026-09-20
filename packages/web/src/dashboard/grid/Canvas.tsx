import { useRef, useState, type ReactNode } from 'react';

import { COLUMNS, GUTTER_PX, ROW_UNIT_PX, heightOf, type GridTile } from './geometry';
import {
  readoutFor,
  resizeTo,
  type ResizeDirection,
  type ResizeStart,
  type TileSize,
} from './resize';

/**
 * The dashboard canvas (AC-054): a 12-column grid that every tile lands on.
 *
 * Tiles are laid out by CSS grid flow rather than by absolute coordinates.
 * That is a deliberate departure from react-grid-layout, which positions
 * items with transforms — `docs/research/dashboard-grid.md` records why:
 * AC-059's nested tree (page tabs → sections → tab groups → tiles) is flow,
 * and a library that owns absolute positions cannot nest that way.
 */
export type { GridTile };

export interface CanvasProps {
  readonly tiles: readonly GridTile[];
  readonly editing: boolean;
  /**
   * Called once, when a resize drag ends (AC-055). Without it the tiles have
   * no handles: a canvas in view mode, or one whose owner cannot accept a
   * change, must not offer a gesture that goes nowhere.
   */
  readonly onResize?: ((id: string, size: TileSize) => void) | undefined;
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

/** A drag in progress: which tile, where it started, and where it is now. */
interface Dragging {
  readonly id: string;
  readonly start: ResizeStart;
  readonly size: TileSize;
  readonly pointer: { readonly x: number; readonly y: number };
}

/**
 * The edges and corner a tile can be dragged by (direction.md section 2: "drag
 * the tile's right edge, bottom edge or corner"). They are `aria-hidden`
 * because a pointer handle is nothing a screen reader can use; the keyboard
 * route to the same change is Shift+arrows on the focused tile (T063), which
 * rule 39 requires and which is where the accessible name for resizing
 * belongs.
 */
const HANDLES: readonly ResizeDirection[] = ['e', 's', 'se'];

export function Canvas({ tiles, editing, onResize, children }: CanvasProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);

  const resizable = editing && onResize !== undefined;

  const begin = (event: React.PointerEvent, tile: GridTile, direction: ResizeDirection) => {
    // The canvas's own width, measured now: the pitch a drag is counted in
    // depends on it, and a dashboard is fixed-width or full-width by setting.
    const width = canvas.current?.getBoundingClientRect().width ?? 0;
    event.preventDefault();
    event.stopPropagation();
    // Capture keeps the move and up events coming to this handle even when the
    // pointer leaves it, which a resize drag always does. Guarded because it
    // is not implemented everywhere a component is rendered — jsdom has no
    // pointer capture — and losing capture degrades the drag rather than
    // breaking it.
    event.currentTarget.setPointerCapture?.(event.pointerId);

    setDragging({
      id: tile.id,
      start: {
        direction,
        pointerX: event.clientX,
        pointerY: event.clientY,
        w: tile.w,
        h: tile.h,
        canvasWidth: width,
      },
      size: { w: tile.w, h: tile.h },
      pointer: { x: event.clientX, y: event.clientY },
    });
  };

  const move = (event: React.PointerEvent) => {
    if (dragging === null) return;
    setDragging({
      ...dragging,
      size: resizeTo(dragging.start, event.clientX, event.clientY),
      pointer: { x: event.clientX, y: event.clientY },
    });
  };

  const end = () => {
    if (dragging === null) return;
    const { id, size, start } = dragging;
    setDragging(null);

    // A press and release with no movement is not a resize. Reporting it would
    // put a change on the edit history that changed nothing, so Undo would
    // light up for a click.
    if (size.w === start.w && size.h === start.h) return;
    onResize?.(id, size);
  };

  /**
   * An interrupted gesture is abandoned, not committed. `pointercancel` means
   * the browser took the pointer away — a touch became a scroll, say — and the
   * size under the pointer at that moment is not a size anyone chose.
   */
  const cancel = () => {
    setDragging(null);
  };

  return (
    <div
      ref={canvas}
      data-testid="grid-canvas"
      className="grid-canvas"
      data-gridlines={editing ? 'true' : undefined}
      data-resizing={dragging === null ? undefined : 'true'}
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
        // While this tile is being dragged it follows the pointer, so the
        // reader sees the size they are choosing rather than the one they
        // started from.
        const live = dragging?.id === tile.id ? { ...tile, ...dragging.size } : tile;
        const { columns, height } = onGrid(live);

        return (
          <div
            key={tile.id}
            data-testid="grid-tile"
            data-tile={tile.id}
            className="grid-tile"
            style={{ gridColumn: `span ${String(columns)}`, height: `${String(height)}px` }}
          >
            {children(tile)}
            {resizable
              ? HANDLES.map((direction) => (
                  <div
                    key={direction}
                    aria-hidden="true"
                    className={`grid-tile__handle grid-tile__handle--${direction}`}
                    data-testid={`resize-${tile.id}-${direction}`}
                    onPointerDown={(event) => {
                      begin(event, tile, direction);
                    }}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={cancel}
                  />
                ))
              : null}
          </div>
        );
      })}

      {dragging === null ? null : (
        <output
          data-testid="resize-readout"
          className="resize-readout"
          style={{
            left: `${String(dragging.pointer.x + 14)}px`,
            top: `${String(dragging.pointer.y + 14)}px`,
          }}
        >
          {readoutFor(dragging.size.w, dragging.size.h)}
        </output>
      )}
    </div>
  );
}
