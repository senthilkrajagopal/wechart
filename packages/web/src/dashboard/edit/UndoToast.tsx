import { useEffect, useRef, useState } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * The toast that offers an undo right after a delete (AC-060, direction.md
 * rule 38).
 *
 * The edit bar's Undo can already put the element back; this exists because
 * the criterion asks for both, and because they answer different questions.
 * Undo is somewhere you go when you have decided; the toast tells you a thing
 * has gone and hands you the way back in the same breath — which matters most
 * for a delete nobody quite meant.
 *
 * `role="status"`, not `alert`: a deletion the user just asked for is not an
 * emergency, and an assertive interruption would talk over them.
 */
export interface UndoToastProps {
  /** What went, and how much went with it. Empty when there is nothing to say. */
  readonly message: string;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
  /** How long it stays. Zero leaves it up, which the tests rely on. */
  readonly afterMs?: number;
}

export const TOAST_MS = 8000;

export function UndoToast({ message, onUndo, onDismiss, afterMs = TOAST_MS }: UndoToastProps) {
  /**
   * Held open while focus or the pointer is in it (T182, AC-176; WCAG 2.2.1):
   * a keyboard user who reached Undo must not have it time out under them.
   * The time starts again when they leave it.
   */
  /** The message held open, if any: a new message is a new toast, not yet held. */
  const [heldFor, setHeldFor] = useState<string | null>(null);
  const held = heldFor === message;
  const setHeld = (holding: boolean) => {
    setHeldFor(holding ? message : null);
  };
  const box = useRef<HTMLDivElement>(null);
  /** Where focus was before it came into the toast, to go back to on leaving. */
  const cameFrom = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (message === '' || afterMs <= 0 || held) return undefined;

    const timer = setTimeout(onDismiss, afterMs);
    return () => {
      clearTimeout(timer);
    };
    // `onDismiss` is re-made each render by its owner; re-arming the timer on
    // every render would mean it never fired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, afterMs, held]);

  if (message === '') return null;

  /**
   * Undo or Dismiss take the toast away with focus in it; focus goes back to
   * where it came from, not to the page (T182). After Undo that is the tile
   * the delete left focus on, still there beside what came back.
   */
  const leaving = (then: () => void) => () => {
    const back = cameFrom.current;
    const inHere = box.current?.contains(document.activeElement) === true;
    then();
    if (inHere && back !== null)
      requestAnimationFrame(() => {
        if (back.isConnected) back.focus();
      });
  };

  return (
    <div
      ref={box}
      className="undo-toast"
      role="status"
      data-testid="undo-toast"
      onFocus={(event) => {
        setHeld(true);
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from))
          cameFrom.current = from;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
      onMouseEnter={() => {
        setHeld(true);
      }}
      onMouseLeave={() => {
        if (!box.current?.contains(document.activeElement)) setHeld(false);
      }}
    >
      {/* What was done, with its icon (direction.md rule 3). */}
      <StatusIcon kind="ok" />
      <span>{message}</span>
      <button type="button" onClick={leaving(onUndo)}>
        Undo
      </button>
      <button type="button" aria-label="Dismiss" onClick={leaving(onDismiss)}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
