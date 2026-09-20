import { useEffect } from 'react';

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
  useEffect(() => {
    if (message === '' || afterMs <= 0) return undefined;

    const timer = setTimeout(onDismiss, afterMs);
    return () => {
      clearTimeout(timer);
    };
    // `onDismiss` is re-made each render by its owner; re-arming the timer on
    // every render would mean it never fired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, afterMs]);

  if (message === '') return null;

  return (
    <div className="undo-toast" role="status" data-testid="undo-toast">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
