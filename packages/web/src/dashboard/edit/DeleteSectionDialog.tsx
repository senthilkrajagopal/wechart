import { useEffect, useRef } from 'react';

/**
 * Deleting a section that holds something asks first (AC-061).
 *
 * The question is not "are you sure" — it is *which of two different things*
 * to do, and both are reasonable: take the section and its contents, or take
 * the section and keep the contents where they were. A confirm dialog that
 * only offered "delete" and "cancel" would hide the second answer entirely.
 *
 * `alertdialog`, because it interrupts to ask a question whose answer the
 * user must give before anything happens — the same role the chart-delete
 * confirmation in `LibraryChartPage` uses.
 */
export interface DeleteSectionDialogProps {
  readonly title: string;
  /** How many things are inside, so the choice is an informed one. */
  readonly count: number;
  readonly onDeleteContents: () => void;
  readonly onKeepContents: () => void;
  readonly onCancel: () => void;
}

export function DeleteSectionDialog({
  title,
  count,
  onDeleteContents,
  onKeepContents,
  onCancel,
}: DeleteSectionDialogProps) {
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the safe answer, not the destructive one: a stray Enter should
    // not be able to destroy anything.
    first.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" data-testid="delete-section-dialog">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-section-heading"
        className="dialog"
      >
        <h2 id="delete-section-heading">Delete “{title}”?</h2>
        <p>
          It holds {count === 1 ? '1 item' : `${String(count)} items`}. They can go with it, or stay
          where they are.
        </p>

        <button type="button" ref={first} data-testid="keep-contents" onClick={onKeepContents}>
          Keep the {count === 1 ? 'item' : 'items'}
        </button>
        <button type="button" data-testid="delete-contents" onClick={onDeleteContents}>
          Delete the section and everything in it
        </button>
        <button type="button" data-testid="cancel-delete-section" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
