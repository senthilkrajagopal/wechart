import { useContext, useRef, useState, type ReactNode } from 'react';

import { COLUMNS, GUTTER_PX, ROW_UNIT_PX, heightOf, type GridTile } from './geometry';
import { DRAG_INSTRUCTIONS_ID } from './drag';
import { ReviewMarks } from './reviewMarks';
import { sentenceOf } from './sentence';
import {
  MIN_ROWS,
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
   * What the document calls this container — `page:<id>`, `sec:<id>` or
   * `tabs:<group>:<tab>`. A drag reads it off the DOM to say where a tile
   * would land (AC-056).
   */
  readonly containerKey?: string | undefined;
  /**
   * What a key does to the focused tile (AC-057). Without it tiles are not
   * focusable, because a focus stop that answered no key would be a trap for
   * anyone tabbing through a dashboard.
   */
  readonly onTileKeyDown?: ((event: React.KeyboardEvent, tile: GridTile) => void) | undefined;
  /**
   * Whether any key answers on this tile, where only some take them — in
   * view mode outside Markings, a chart tile's menu keys and nothing else
   * (T266's review). Absent, every tile does.
   */
  readonly takesKeys?: ((id: string) => boolean) | undefined;
  /**
   * A `contextmenu` on the focused tile itself — one a keyboard makes, such
   * as VoiceOver's VO+Shift+M or the Menu key where it fires at the focused
   * element (research gotcha 2; T266's review). Not one from inside it: a
   * right-click on a chart is the chart's.
   */
  readonly onTileContextMenu?: ((event: React.MouseEvent, tile: GridTile) => void) | undefined;
  /**
   * What each item is, and which keys answer on it — so the tab stop is
   * announced for what it can actually do. A section answers none of them,
   * and a markdown tile has no chart to edit.
   */
  readonly describeItem?:
    ((id: string) => { readonly role: string; readonly keys: string }) | undefined;
  /** Selecting an item, so the next insert can land after it (AC-058). */
  readonly selection?:
    | {
        readonly id: string | null;
        /**
         * A deliberate choice, which retires any chosen "+ Add" slot.
         * `onControl`: the click landed on one of the tile's own controls —
         * its menu, its pencil — which is using the tile, not choosing it.
         */
        readonly onSelect: (id: string, onControl: boolean) => void;
        /** Merely arriving by Tab, which leaves a chosen slot alone. */
        readonly onFocusSelect: (id: string) => void;
      }
    | undefined;
  /** Aiming the next insert at the end of *this* container — the "+ Add" slot. */
  readonly addHere?:
    | {
        readonly activeKey: string | null;
        readonly onChoose: (key: string) => void;
        /** A readable name for the container, for the slot's own name. */
        readonly nameOf?: ((key: string) => string) | undefined;
      }
    | undefined;
  /** Dragging a tile by its grip. Without it, tiles have no grip. */
  readonly drag?:
    | {
        readonly onGripPointerDown: (event: React.PointerEvent, tileId: string) => void;
        readonly draggingId: string | null;
        /**
         * Which items may be picked up. AC-056 is about dragging a *tile*;
         * a section or a tab group is a container, and giving one a grip
         * created a gesture no criterion describes — one that could drop a
         * container inside itself.
         */
        readonly canDrag?: ((id: string) => boolean) | undefined;
        /** A readable name for a tile, for the grip's accessible name. */
        readonly nameOf?: ((id: string) => string) | undefined;
      }
    | undefined;
  /**
   * Called once, when a resize drag ends (AC-055). Without it the tiles have
   * no handles: a canvas in view mode, or one whose owner cannot accept a
   * change, must not offer a gesture that goes nowhere.
   */
  readonly onResize?: ((id: string, size: TileSize) => void) | undefined;
  /**
   * A tile's name, as it is announced (AC-209): its title, never its id. In
   * view mode as in edit mode — the drag's own name exists only while editing.
   */
  readonly nameOf?: ((id: string) => string) | undefined;
  readonly children: (tile: GridTile) => ReactNode;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * An add slot's words, the prototype's (T248): "Add" after what a container
 * holds, and what it takes when it holds nothing. Its accessible name starts
 * with them (T248's review).
 */
function slotWords(count: number, containerKey: string): string {
  if (count > 0) return 'Add';
  if (containerKey.startsWith('sec:')) return 'Add to this section';
  if (containerKey.startsWith('tabs:')) return 'Add to this tab';
  return 'Add a chart, section or text';
}

/**
 * The document's numbers are snapped here rather than trusted. A width of 4.7
 * can reach the canvas from an older saved format, a hand-edited body or a
 * resize that rounded the wrong way, and the criterion is about where the tile
 * ends up — so the grid is the last word, not the document.
 */
function onGrid(tile: GridTile): { columns: number; height: number | null } {
  const columns = clamp(Math.round(tile.w) || 1, 1, COLUMNS);
  // No height of its own means as tall as its contents: a section or a tab
  // group. Forcing a row count on those would cut off whatever they hold.
  if (tile.h === undefined) return { columns, height: null };

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

export function Canvas({
  tiles,
  editing,
  containerKey,
  drag,
  onResize,
  onTileKeyDown,
  takesKeys,
  onTileContextMenu,
  describeItem,
  selection,
  addHere,
  nameOf,
  children,
}: CanvasProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const reviewMarks = useContext(ReviewMarks);

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
        // Only an item with a height of its own gets resize handles, so this
        // is never the content-sized case.
        h: tile.h ?? MIN_ROWS,
        canvasWidth: width,
      },
      size: { w: tile.w, h: tile.h ?? MIN_ROWS },
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
      /** What the document calls this container, so a drop can name it. */
      data-container={containerKey}
      data-gridlines={editing ? 'true' : undefined}
      // The stronger columns "during a drag or resize" (direction.md §2): a
      // tile's resize here, or a tile being dragged anywhere (T253's review).
      data-guides={dragging === null && (drag?.draggingId ?? null) === null ? undefined : 'true'}
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
        // A tile no key answers on here is no tab stop (T266's review).
        const keys = (takesKeys?.(tile.id) ?? true) ? onTileKeyDown : undefined;

        return (
          <div
            key={tile.id}
            data-testid="grid-item"
            data-tile={tile.id}
            className="grid-tile"
            data-dragging={drag?.draggingId === tile.id ? 'true' : undefined}
            data-selected={selection?.id === tile.id ? 'true' : undefined}
            // Outlined in a review, the proposal having changed or added it (AC-341).
            data-review={reviewMarks[tile.id]}
            onFocus={
              selection === undefined
                ? undefined
                : (event) => {
                    /**
                     * Focus is selection: reaching a tile by Tab and reaching
                     * it by clicking should leave the next insert in the same
                     * place, or the keyboard and the pointer would disagree
                     * about where "after the selection" is.
                     *
                     * But merely tabbing past a tile must not retire a chosen
                     * "+ Add" slot. The sidebar follows the canvas in the tab
                     * order, so reaching the Add panel from a slot passes over
                     * every remaining tile — and each one would have discarded
                     * the aim before the user arrived.
                     */
                    if (event.target === event.currentTarget) selection.onFocusSelect(tile.id);
                  }
            }
            onClick={
              selection === undefined
                ? undefined
                : (event) => {
                    // The innermost wins. A tile inside a section sits inside
                    // that section's own element, so without this the click
                    // would select the tile and then immediately re-select
                    // the section on the way up.
                    event.stopPropagation();
                    const control = (event.target as Element).closest(
                      'button, a, input, select, textarea, [role="menuitem"], [role="tab"]',
                    );
                    selection.onSelect(
                      tile.id,
                      control !== null && event.currentTarget.contains(control),
                    );
                  }
            }
            /**
             * One tab stop per tile in edit mode, so every tile can be reached
             * and then moved, resized, edited or deleted from the keyboard
             * (AC-057, direction.md rule 39). `role="group"` with a name is
             * what makes the stop meaningful — a screen reader announces the
             * tile and the keys it answers rather than "blank".
             *
             * `jsx-a11y/no-noninteractive-tabindex` and
             * `no-static-element-interactions` do not fire here, but only
             * because their `allowExpressionValues` option exempts a value
             * that is an expression rather than a literal — so a clean lint
             * is no evidence that either rule was weighed. It is weighed
             * here instead: both assume a tabbable element is a native
             * control or a single-purpose widget, and a tile is neither. It
             * is a composite the arrow keys act on, which is the shape the
             * prototype (`docs/design/prototype/dashboard.js`) and dnd-kit
             * both use, and the keyboard contract those rules exist to
             * protect is the whole subject of `keyboard.test.ts`.
             */

            tabIndex={keys === undefined ? undefined : 0}
            role={keys === undefined ? undefined : 'group'}
            aria-roledescription={keys === undefined ? undefined : describeItem?.(tile.id).role}
            /**
             * Named for the keys that actually answer on *this* item. A
             * section answers none of them, and a markdown tile has no chart
             * to edit — promising E there would be a promise the tile does
             * not keep.
             */
            aria-label={
              keys === undefined
                ? undefined
                : [
                    // Its name, never its id (AC-209), as one sentence: a
                    // name that ends a sentence already takes no second full
                    // stop (T247, recheck-dashboard N9).
                    sentenceOf(nameOf?.(tile.id) ?? drag?.nameOf?.(tile.id) ?? 'Tile'),
                    describeItem?.(tile.id).keys ?? '',
                  ]
                    .filter((part) => part !== '')
                    .join(' ')
            }
            onKeyDown={
              keys === undefined
                ? undefined
                : (event) => {
                    /**
                     * Only when the tile itself has focus, never when a key
                     * merely bubbled up from something inside it. Otherwise
                     * Delete pressed on the ⋯ button would destroy the tile,
                     * an arrow key in the menu would move it, and typing an
                     * "e" into a future text field would leave for the chart
                     * editor mid-sentence.
                     */
                    if (event.target !== event.currentTarget) return;
                    keys(event, tile);
                  }
            }
            onContextMenu={
              keys === undefined || onTileContextMenu === undefined
                ? undefined
                : (event) => {
                    if (event.target !== event.currentTarget) return;
                    onTileContextMenu(event, tile);
                  }
            }
            style={{
              gridColumn: `span ${String(columns)}`,
              ...(height === null ? {} : { height: `${String(height)}px` }),
            }}
          >
            {reviewMarks[tile.id] === undefined ? null : (
              <span className="grid-tile__review-mark">
                {reviewMarks[tile.id] === 'new' ? 'New' : 'Changed'}
              </span>
            )}
            {drag === undefined || drag.canDrag?.(tile.id) === false ? null : (
              <button
                type="button"
                className="grid-tile__grip"
                data-testid={`grip-${tile.id}`}
                /**
                 * Not a dead stop (T182): pressed from the keyboard it hands
                 * focus to its tile, which is the keyboard's handle — the
                 * tile's arrow keys move it (AC-057) and its name says so.
                 */
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.currentTarget.closest<HTMLElement>('[data-tile]')?.focus();
                }}
                /**
                 * A real button with a name, not a bare handle: it is what a
                 * screen reader announces as the thing that moves this tile,
                 * and where T063's keyboard move will hang. Pressed, it hands
                 * focus to its tile (above), whose arrow keys move it; the ⋯
                 * menu's Move to is the other non-drag route.
                 *
                 * The role description and the instructions are the baseline
                 * `docs/research/dashboard-grid.md` makes a condition of
                 * building this drag ourselves instead of taking dnd-kit.
                 */
                aria-label={`Move ${nameOf?.(tile.id) ?? drag.nameOf?.(tile.id) ?? 'tile'}`}
                aria-roledescription="draggable tile"
                aria-describedby={DRAG_INSTRUCTIONS_ID}
                onPointerDown={(event) => {
                  drag.onGripPointerDown(event, tile.id);
                }}
              >
                <span aria-hidden="true">⠿</span>
              </button>
            )}
            {children(tile)}
            {resizable && tile.h !== undefined
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

      {/**
       * The "+ Add" slot (AC-058): a deliberate aim at the end of *this*
       * container, which the next insert goes into instead of following the
       * selection. Every container gets one, which is how an empty section
       * can be filled at all — it has no tile to select and follow.
       */}
      {addHere === undefined || containerKey === undefined ? null : (
        <button
          type="button"
          className="grid-canvas__add"
          data-testid={`add-here-${containerKey}`}
          aria-pressed={addHere.activeKey === containerKey}
          /**
           * Named for the container it fills. Every slot reading "Add here"
           * is the same name repeated down the page, with nothing for a
           * screen reader to tell them apart. It starts with the words it
           * shows, so a speech-input user saying what they see reaches it
           * (WCAG 2.5.3; T248's review).
           */
          aria-label={
            tiles.length > 0 ||
            !(containerKey.startsWith('sec:') || containerKey.startsWith('tabs:'))
              ? `${slotWords(tiles.length, containerKey)} to ${addHere.nameOf?.(containerKey) ?? 'this container'}`
              : `${slotWords(tiles.length, containerKey)}: ${addHere.nameOf?.(containerKey) ?? 'this container'}`
          }
          style={{ gridColumn: `span ${String(tiles.length === 0 ? COLUMNS : 3)}` }}
          onClick={(event) => {
            // The slot is inside whatever element holds this canvas, and that
            // element selects itself when clicked — which would retire the
            // slot the moment it was chosen.
            event.stopPropagation();
            addHere.onChoose(containerKey);
          }}
        >
          {`＋ ${slotWords(tiles.length, containerKey)}`}
        </button>
      )}

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
