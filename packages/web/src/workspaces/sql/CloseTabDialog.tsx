import { useEffect, useId, useRef } from 'react';

import { useFocusTrap } from '../../shell/useFocusTrap';

/** Esc, while a dialog of the tabs' is open, answers it with `then`. */
export function useEscape(then: () => void) {
  const latest = useRef(then);
  useEffect(() => {
    latest.current = then;
  }, [then]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}

/**
 * Asked before a tab closes over text that is neither saved nor the SQL of
 * its last run (T800, AC-450; design 17, D2), or before Close other tabs
 * closes any such. Focus starts on keeping it open, the answer that loses
 * nothing; Esc keeps it open too (rule 85).
 */
export function CloseTabDialog({
  name,
  others,
  onKeep,
  onClose,
}: {
  /** The tab's name, when one tab is closing. */
  readonly name?: string;
  /** How many tabs that would lose text, when Close other tabs asks. */
  readonly others?: number;
  readonly onKeep: () => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => keep.current?.focus(), []);
  useEscape(onKeep);
  const many = others !== undefined;
  const losing = others === 1 ? 'One of them holds' : `${String(others)} of them hold`;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="dialog"
      >
        <h2 id={`${ids}-title`}>{many ? 'Close the other tabs?' : `Close ${name ?? 'this tab'}?`}</h2>
        <p id={`${ids}-body`}>
          {many
            ? `${losing} SQL that isn’t saved, and isn’t the SQL last run there. Closing loses the text. Their runs stay in History.`
            : 'Its SQL isn’t saved, and isn’t the SQL it last ran. Closing it loses the text. Its runs stay in History.'}
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn" ref={keep} onClick={onKeep}>
            {many ? 'Keep them open' : 'Keep it open'}
          </button>
          <button type="button" className="btn-primary dialog__destructive" onClick={onClose}>
            {many ? 'Close tabs' : 'Close tab'}
          </button>
        </div>
      </div>
    </div>
  );
}
