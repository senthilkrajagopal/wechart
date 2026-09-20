import { useEffect, useRef, useState } from 'react';

import type { ContainerKey } from '../model/document';

/**
 * "Move to" — the way to move a tile without dragging it (AC-056).
 *
 * Not a convenience. WCAG 2.2 SC 2.5.7 forbids a path that can only be
 * travelled by dragging, and `docs/research/dashboard-grid.md` makes this menu
 * a condition of building the drag ourselves rather than taking a library:
 * "whichever option wins, SC 2.5.7 forbids drag-only paths; the ⋯ 'Move to'
 * menu must stay." A grip that is the only route would fail that at AA.
 *
 * It is deliberately only Move to for now. direction.md has this menu also
 * offering Duplicate and Delete, which are AC-062 and AC-060 and belong with
 * their own tasks; a menu item that did nothing would be worse than an absent
 * one.
 */
export interface MoveToMenuProps {
  readonly tileId: string;
  readonly tileLabel: string;
  /** Every container, and the one this tile is already in. */
  readonly containers: readonly { readonly key: ContainerKey; readonly title: string }[];
  readonly currentKey: ContainerKey;
  readonly onMove: (to: ContainerKey) => void;
}

export function MoveToMenu({ tileId, tileLabel, containers, currentKey, onMove }: MoveToMenuProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  /**
   * Escape closes it and gives focus back, and a press elsewhere dismisses it.
   * A menu opened by a WCAG conformance measure that then trapped a keyboard
   * user inside it would be its own accessibility failure.
   */
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  // Its current container is not somewhere to move it to (direction.md:
  // "excluding its current container").
  const elsewhere = containers.filter((container) => container.key !== currentKey);

  return (
    <div className="tile-menu" ref={wrapper}>
      <button
        type="button"
        ref={trigger}
        aria-label={`Actions for ${tileLabel}`}
        aria-expanded={open}
        data-testid={`tile-menu-${tileId}`}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <ul className="tile-menu__list" aria-label={`Move ${tileLabel} to`}>
          {elsewhere.length === 0 ? (
            <li className="tile-menu__empty">Nowhere else to move it yet.</li>
          ) : (
            elsewhere.map((container) => (
              <li key={container.key}>
                <button
                  type="button"
                  data-testid={`move-${tileId}-to-${container.key}`}
                  onClick={() => {
                    setOpen(false);
                    onMove(container.key);
                  }}
                >
                  {container.title}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
