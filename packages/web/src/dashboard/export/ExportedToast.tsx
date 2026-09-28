import { useEffect } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import { TOAST_MS } from '../edit/UndoToast';

/**
 * The file downloaded, or the file imported (T511, T513; design 13, states E
 * and S): what it holds, said politely, gone after the undo toast's time.
 * After Export it needs no action; after Import it offers the next step,
 * Propose, and stays until it is taken or dismissed.
 */
export function ExportedToast({
  message,
  action,
  onDismiss,
  afterMs = TOAST_MS,
}: {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onSelect: () => void } | undefined;
  readonly onDismiss: () => void;
  readonly afterMs?: number;
}) {
  const acting = action !== undefined;
  useEffect(() => {
    // Held while it offers an action: a keyboard user on their way to it
    // must not have it time out under them (WCAG 2.2.1, as UndoToast has it).
    if (message === '' || afterMs <= 0 || acting) return undefined;
    const timer = setTimeout(onDismiss, afterMs);
    return () => {
      clearTimeout(timer);
    };
    // Re-armed for each message only: its owner makes `onDismiss` anew each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, afterMs, acting]);
  return (
    // Kept mounted, empty, so each message is announced as it arrives.
    <div role="status" className={message === '' ? 'visually-hidden' : 'undo-toast export-toast'}>
      {message === '' ? null : (
        <>
          <StatusIcon kind="ok" />
          <span>{message}</span>
          {action === undefined ? null : (
            <>
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
              <button type="button" aria-label="Dismiss" onClick={onDismiss}>
                ×
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
