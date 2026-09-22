import { COLUMNS } from './geometry';
import { MAX_ROWS, MIN_COLUMNS, MIN_ROWS, type TileSize } from './resize';

/**
 * What a key does to the focused tile (AC-057, direction.md rule 39).
 *
 * A pure decision, separate from the component, for the same reason the
 * resize arithmetic is: the keyboard and the pointer must be able to reach
 * exactly the same sizes. The document records what size a tile is, never how
 * it came to be that size, so a limit that applied to a drag and not to
 * Shift+Arrow would let one route produce a tile the other could not.
 *
 * The keys follow the dashboard prototype in `docs/design/prototype`: Enter
 * opens the tile's Properties, as the prototype's does, and E the chart
 * editor, as the criterion names it.
 */
export type TileKeyAction =
  | { readonly kind: 'move'; readonly by: -1 | 1 }
  | { readonly kind: 'resize'; readonly size: TileSize }
  | { readonly kind: 'edit' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'properties' }
  | null;

export interface KeyPress {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const STEP: Readonly<Record<string, { readonly columns: number; readonly rows: number }>> = {
  ArrowRight: { columns: 1, rows: 0 },
  ArrowLeft: { columns: -1, rows: 0 },
  ArrowDown: { columns: 0, rows: 1 },
  ArrowUp: { columns: 0, rows: -1 },
};

export function actionFor(
  event: KeyPress,
  tile: TileSize,
  /**
   * Whether this element carries a size of its own. A header, a divider and a
   * filter are as tall as their content, so Shift and an arrow key moves them
   * instead of resizing — the prototype's own fallthrough. A rule enforced on
   * the pointer and not here would be worse than no rule: two keystrokes
   * would put a header into a state the model says cannot exist.
   */
  sized = true,
): TileKeyAction {
  // A modifier other than Shift belongs to the browser or the operating
  // system. Claiming ⌘E or Ctrl+E would break find-again, and worse, a screen
  // reader's own shortcuts.
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (event.key === 'Delete' || event.key === 'Backspace') return { kind: 'delete' };
  if (event.key === 'e' || event.key === 'E') return { kind: 'edit' };
  // This tile's Properties, as the prototype opens them (T182, AC-176).
  if (event.key === 'Enter') return { kind: 'properties' };

  const step = STEP[event.key];
  if (step === undefined) return null;

  if (!event.shiftKey || !sized) {
    // Left and Up go earlier in the container, Right and Down later. On a
    // wrapping grid "later" is the next position in document order, which is
    // what the drag produces too.
    return { kind: 'move', by: step.columns + step.rows < 0 ? -1 : 1 };
  }

  return {
    kind: 'resize',
    size: {
      w: clamp(tile.w + step.columns, MIN_COLUMNS, COLUMNS),
      h: clamp(tile.h + step.rows, MIN_ROWS, MAX_ROWS),
    },
  };
}
