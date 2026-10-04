import { useEffect, useId, useRef } from 'react';

import { useFocusTrap } from './useFocusTrap';

/**
 * Asked before a dialog or pane closes over typed work (T405, AC-176;
 * direction.md rule 85): the app's one wording, as the dashboard settings and
 * the chart editor ask it. A modal of its own over the one it asks for, so
 * that one's trap leaves Tab to it. Focus starts on Keep editing, the answer
 * that loses nothing; Escape is its owner's to read as Keep editing.
 */
export function DiscardQuestion({
  body,
  onKeep,
  onDiscard,
}: {
  /** What would be lost, in a sentence. */
  readonly body: string;
  readonly onKeep: () => void;
  readonly onDiscard: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => keep.current?.focus(), []);
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
        <h2 id={`${ids}-title`}>Discard your changes?</h2>
        <p id={`${ids}-body`}>{body}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" ref={keep} onClick={onKeep}>
            Keep editing
          </button>
          {/* The question's one primary, destructive, in status-error (T466, UX-106). */}
          <button type="button" className="btn-primary dialog__destructive" onClick={onDiscard}>
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
