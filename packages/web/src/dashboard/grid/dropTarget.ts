import { GUTTER_PX } from './geometry';

/**
 * Where a dragged tile would land (AC-056).
 *
 * Decided against rectangles rather than against the DOM. The prototype asks
 * `document.elementFromPoint` and walks up with `closest`, which is fine in a
 * browser and untestable without one — and the rule that a tab label beats the
 * container beneath it is exactly the sort of thing that has to be pinned by a
 * test, because getting it the wrong way round produces the criterion's own
 * failing state: the drop lands in the container and the tile never changes
 * tab.
 *
 * `docs/research/dashboard-grid.md` settles why this is ours at all. A tile
 * inside a tab group and a page-tab label outside it must be able to see each
 * other, which dnd-kit's nested contexts cannot do without one shared context
 * and our own collision detection; react-grid-layout has no notion of a drop
 * target outside its own grid.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DropCandidate {
  /** A tab label receives a tile at the end; a container receives it at a position. */
  readonly kind: 'tab-label' | 'container';
  /** What the document calls this place: `page:<id>`, `sec:<id>`, `tabs:<group>:<tab>`. */
  readonly key: string;
  readonly box: Rect;
  /** The tiles already in this container, in document order. */
  readonly tiles?: readonly { readonly id: string; readonly box: Rect }[];
}

export interface DropTarget {
  readonly key: string;
  /** Where among the container's items, or null to append (a tab label). */
  readonly index: number | null;
  /** What to paint so the user can see where it will go. */
  readonly marker: Rect;
}

const contains = (box: Rect, point: Point) =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

const area = (box: Rect) => box.width * box.height;

/** How wide the insertion bar is painted. Half a gutter, centred in it. */
const MARKER_WIDTH = Math.max(2, Math.round(GUTTER_PX / 4));

export function dropTargetAt(
  point: Point,
  candidates: readonly DropCandidate[],
  draggingId: string,
): DropTarget | null {
  const under = candidates.filter((candidate) => contains(candidate.box, point));
  if (under.length === 0) return null;

  // A tab label wins over anything it sits on top of. It is small, deliberate,
  // and always inside some container, so checking containers first would mean
  // a label could never be hit at all.
  const label = under.find((candidate) => candidate.kind === 'tab-label');
  if (label !== undefined) return { key: label.key, index: null, marker: label.box };

  // Otherwise the innermost container: a section inside a page is the more
  // specific answer, and it is always the smaller box. Tab labels are excluded
  // rather than merely ranked behind — a label is the smallest box of all, so
  // a reduce over everything would hand one back here as though it were a
  // container, complete with an insertion index it has no use for.
  const containers = under.filter((candidate) => candidate.kind === 'container');
  const container = containers.reduce<DropCandidate | null>(
    (smallest, candidate) =>
      smallest === null || area(candidate.box) < area(smallest.box) ? candidate : smallest,
    null,
  );
  if (container === null) return null;

  // The tile in hand is not somewhere it can be dropped beside: counting it
  // would put the tile one place further along than the marker showed.
  const tiles = (container.tiles ?? []).filter((tile) => tile.id !== draggingId);

  /**
   * The first item that comes *after* the pointer in reading order.
   *
   * Comparing x alone is wrong the moment a grid wraps, which it does as soon
   * as a page holds more than twelve columns of items: a full-width section on
   * the next row has its midpoint near the left edge, so a pointer over on the
   * right of the row above looks past it and the drop falls to the end of the
   * container. Rows are compared first, and x only settles items sharing one.
   */
  /**
   * Rows are identified by where items *start*, not by the bands they fill.
   * Grid items are given explicit heights, so two items sharing a row share a
   * top but not a bottom — and a pointer over a short tile, below its lower
   * edge, is inside no item's band at all. Asking "does this item's box
   * contain the pointer's y" then skips that tile and the drop lands one place
   * too far along. Since T061 a row of mixed heights is one drag away.
   */
  const tops = [...new Set(tiles.map((tile) => tile.box.y))].sort((a, b) => a - b);
  const pointerRow = tops.filter((top) => top <= point.y).at(-1) ?? tops[0] ?? 0;

  const index = tiles.findIndex((tile) => {
    if (tile.box.y > pointerRow) return true;
    if (tile.box.y < pointerRow) return false;
    return point.x < tile.box.x + tile.box.width / 2;
  });
  const at = index === -1 ? tiles.length : index;

  return { key: container.key, index: at, marker: markerFor(container, tiles, at) };
}

/**
 * The bar the marker paints: in the gap before the tile the drop would push
 * along, or after the last one.
 *
 * An empty container still gets a marker. It is the one place with no tile to
 * aim at, and a marker that vanished there would say the drop was illegal
 * exactly where the user most needs telling that it is not.
 */
function markerFor(
  container: DropCandidate,
  tiles: readonly { readonly id: string; readonly box: Rect }[],
  index: number,
): Rect {
  const before = tiles[index - 1];
  const after = tiles[index];

  if (after !== undefined) {
    const x =
      before === undefined ? after.box.x : (before.box.x + before.box.width + after.box.x) / 2;
    return {
      x: x - MARKER_WIDTH / 2,
      y: after.box.y,
      width: MARKER_WIDTH,
      height: after.box.height,
    };
  }

  if (before !== undefined) {
    return {
      x: before.box.x + before.box.width + GUTTER_PX / 2 - MARKER_WIDTH / 2,
      y: before.box.y,
      width: MARKER_WIDTH,
      height: before.box.height,
    };
  }

  return {
    x: container.box.x,
    y: container.box.y,
    width: MARKER_WIDTH,
    height: container.box.height,
  };
}
