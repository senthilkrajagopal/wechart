import { useRef, useState } from 'react';

import { dropTargetAt, type DropCandidate, type DropTarget, type Rect } from './dropTarget';

/**
 * Dragging a tile by its grip (AC-056).
 *
 * The state lives above every canvas rather than inside one, because a tile
 * can be dropped into a different container from the one it started in, or
 * onto a page-tab or tab-group label that is not inside any canvas at all.
 * A per-canvas drag could not see those, which is the same limitation
 * `docs/research/dashboard-grid.md` records for dnd-kit's nested contexts.
 *
 * Candidates are read from the DOM at the moment they are needed. The
 * alternative — a registry components write themselves into — has to be kept
 * in step with rendering, and a stale entry there is a drop that lands
 * somewhere the user was not shown.
 */
export const DRAG_THRESHOLD_PX = 5;

interface Dragging {
  readonly id: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly moved: boolean;
  readonly target: DropTarget | null;
}

const rectOf = (element: Element): Rect => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
};

/**
 * Everywhere a tile could be dropped, as the document names it.
 *
 * Exported so a test can see what the DOM contract is: a container carries
 * `data-container="<key>"` and its tiles `data-tile`, and a label that accepts
 * a drop carries `data-droptab="<key>"`.
 */
export function candidatesIn(root: ParentNode): DropCandidate[] {
  const labels = [...root.querySelectorAll('[data-droptab]')].map((element): DropCandidate => ({
    kind: 'tab-label',
    key: element.getAttribute('data-droptab') ?? '',
    box: rectOf(element),
  }));

  const containers = [...root.querySelectorAll('[data-container]')].map(
    (element): DropCandidate => ({
      kind: 'container',
      key: element.getAttribute('data-container') ?? '',
      box: rectOf(element),
      // Only this container's own tiles: a nested canvas has its own entry,
      // and counting its tiles here too would put a drop between two tiles
      // that are not siblings.
      tiles: [...element.children]
        .filter((child) => child.hasAttribute('data-tile'))
        .map((child) => ({ id: child.getAttribute('data-tile') ?? '', box: rectOf(child) })),
    }),
  );

  return [...labels, ...containers];
}

/**
 * What a screen reader is told, as the gesture happens.
 *
 * `docs/research/dashboard-grid.md` makes this a condition of building the
 * drag in-house rather than taking dnd-kit: "the in-house implementation must
 * ship dnd-kit's accessibility baseline — role/aria-roledescription on the
 * grip, persistent screen-reader instructions referenced by aria-describedby,
 * and polite live-region announcements on pick-up, move, drop, cancel".
 * Without it a drag is a silent change to the document.
 */
export const DRAG_INSTRUCTIONS_ID = 'dashboard-drag-instructions';

export const DRAG_INSTRUCTIONS =
  'Press and hold, then move the pointer to reposition this tile. ' +
  'To move it without dragging, use the tile’s actions menu.';

export interface TileDrag {
  /** The tile being dragged, once the pointer has actually moved. */
  readonly draggingId: string | null;
  /** What to paint, and where. */
  readonly marker: Rect | null;
  /** The current state of the gesture, for a polite live region. */
  readonly announcement: string;
  /**
   * Put something else into that same region — what a keyboard move, resize
   * or delete did. One region rather than two, so a reader is never told two
   * things at once, and so the keyboard is as well narrated as the pointer:
   * the research doc makes announcements a condition, and the keyboard is
   * exactly where dnd-kit would have supplied them.
   */
  readonly say: (message: string) => void;
  readonly onGripPointerDown: (event: React.PointerEvent, tileId: string) => void;
}

export interface UseTileDragOptions {
  readonly onMove: (tileId: string, to: { key: string; index: number | null }) => void;
  /** Where to look for drop targets. Defaults to the whole document. */
  readonly root?: () => ParentNode;
  /**
   * A readable name for a tile id or a container key, for the announcements.
   * Without one they fall back to ids, which is a poor thing to read aloud.
   */
  readonly nameOf?: ((idOrKey: string) => string) | undefined;
}

export function useTileDrag({ onMove, root, nameOf }: UseTileDragOptions): TileDrag {
  const [dragging, setDragging] = useState<Dragging | null>(null);

  /**
   * The authoritative drag, kept beside the state that renders it.
   *
   * The commit used to happen inside a `setDragging` updater, which is not
   * allowed to have side effects: StrictMode invokes updaters twice, and
   * `onMove` builds a fresh document each time, so one drop put *two* entries
   * on the undo stack — the first Undo would then appear to do nothing. It was
   * also a cross-component `setState` reached from inside another component's
   * updater, which is exactly what React warns about.
   */
  const live = useRef<Dragging | null>(null);
  const set = (next: Dragging | null) => {
    live.current = next;
    setDragging(next);
  };

  /** What the polite live region is saying. */
  const [announcement, setAnnouncement] = useState('');
  const name = (idOrKey: string) => nameOf?.(idOrKey) ?? idOrKey;

  const onGripPointerDown = (event: React.PointerEvent, tileId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const from = { x: event.clientX, y: event.clientY };
    set({ id: tileId, from, moved: false, target: null });
    setAnnouncement(`Picked up ${name(tileId)}.`);

    const node = event.currentTarget;

    const move = (moveEvent: PointerEvent) => {
      const travelled = Math.hypot(moveEvent.clientX - from.x, moveEvent.clientY - from.y);
      // Below the threshold this is a click on the grip, not a drag. Without
      // it, every press would show a drop marker and a shaky hand would move
      // a tile the user only meant to touch.
      if (travelled < DRAG_THRESHOLD_PX) return;

      const current = live.current;
      if (current === null) return;

      const where = root?.() ?? document;
      const target = dropTargetAt(
        { x: moveEvent.clientX, y: moveEvent.clientY },
        candidatesIn(where),
        current.id,
      );
      set({ ...current, moved: true, target });

      // Only when the destination changes, or the region repeats itself on
      // every pointer event and says nothing useful.
      if (target?.key !== current.target?.key) {
        setAnnouncement(
          target === null
            ? `${name(current.id)}: nowhere to drop it here.`
            : `${name(current.id)}: drop into ${name(target.key)}.`,
        );
      }
    };

    const finish = (commit: boolean) => () => {
      // All three, not only the one that fired: a gesture that ends in
      // `pointercancel` would otherwise leave the `pointerup` listener behind
      // waiting for an event that is never coming.
      node.removeEventListener('pointermove', move as EventListener);
      node.removeEventListener('pointerup', up as EventListener);
      node.removeEventListener('pointercancel', cancel as EventListener);

      // Read the drag, clear it, and only then report: the commit is a plain
      // statement rather than something happening inside a state updater.
      const current = live.current;
      set(null);

      if (current === null) return;

      if (commit && current.moved && current.target !== null) {
        onMove(current.id, { key: current.target.key, index: current.target.index });
        setAnnouncement(`Moved ${name(current.id)} into ${name(current.target.key)}.`);
      } else if (current.moved) {
        setAnnouncement(`${name(current.id)} was not moved.`);
      } else {
        setAnnouncement('');
      }
    };

    const up = finish(true);
    const cancel = finish(false);

    node.addEventListener('pointermove', move as EventListener);
    node.addEventListener('pointerup', up as EventListener);
    node.addEventListener('pointercancel', cancel as EventListener);
  };

  return {
    draggingId: dragging?.moved === true ? dragging.id : null,
    marker: dragging?.moved === true ? (dragging.target?.marker ?? null) : null,
    announcement,
    say: setAnnouncement,
    onGripPointerDown,
  };
}
