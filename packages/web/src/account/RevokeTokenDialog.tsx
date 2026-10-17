import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from '../shell/useFocusTrap';

/**
 * Revoking a token (T771, AC-431; design 18, state E, and screen 4 for a
 * Super-Admin's): asked first in a 520 px alert dialog naming it, focus on
 * Cancel. Revoke token revokes it at once; there's no Undo, since a revoked
 * token can't work again. A refusal is said here, and nothing changes.
 */
export function RevokeTokenDialog({
  title,
  revoke,
  onRevoked,
  onClose,
}: {
  /** `Revoke "Claude Code · laptop"?`, or with its owner on Security's tab. */
  readonly title: string;
  /** Revokes it; throws with the reason when it wasn't. */
  readonly revoke: () => Promise<void>;
  readonly onRevoked: () => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useFocusTrap(box);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    cancel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="dialog revoke-token"
      >
        <h2 id={`${ids}-title`}>{title}</h2>
        <p id={`${ids}-body`}>
          Every client using it stops working at once. It can’t be turned back on; you can make a
          new one.
        </p>
        {refused === null ? null : (
          <p role="alert" className="propose-dialog__refused">
            {refused}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" ref={cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary dialog__destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setRefused(null);
              revoke().then(onRevoked, (error: unknown) => {
                setBusy(false);
                setRefused(error instanceof Error ? error.message : 'The token wasn’t revoked.');
              });
            }}
          >
            Revoke token
          </button>
        </div>
      </div>
    </div>
  );
}
