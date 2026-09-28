import { useEffect } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import { TOAST_MS } from '../edit/UndoToast';

/**
 * The file downloaded (T511; design 13, state E): what it holds, said
 * politely, needing no action, and gone after the undo toast's time. The
 * browser's own download list says where the file went.
 */
export function ExportedToast({
  message,
  onDismiss,
  afterMs = TOAST_MS,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
  readonly afterMs?: number;
}) {
  useEffect(() => {
    if (message === '' || afterMs <= 0) return undefined;
    const timer = setTimeout(onDismiss, afterMs);
    return () => {
      clearTimeout(timer);
    };
    // Re-armed for each message only: its owner makes `onDismiss` anew each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, afterMs]);
  return (
    // Kept mounted, empty, so each message is announced as it arrives.
    <div role="status" className={message === '' ? 'visually-hidden' : 'undo-toast export-toast'}>
      {message === '' ? null : (
        <>
          <StatusIcon kind="ok" />
          <span>{message}</span>
        </>
      )}
    </div>
  );
}
