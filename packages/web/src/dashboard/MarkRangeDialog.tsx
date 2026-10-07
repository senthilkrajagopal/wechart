import { useEffect, useId, useRef, useState } from 'react';

import { DiscardQuestion } from '../shell/DiscardQuestion';
import { useFocusTrap } from '../shell/useFocusTrap';
import { useReturnFocus } from '../shell/useReturnFocus';

/** One of the axis' buckets, as drawn: its value, and its words. */
export interface RangeBucket {
  readonly value: string;
  readonly label: string;
}

/**
 * "Mark range…" (T636, AC-176, AC-093; R66, the user: ""Mark range…" in tile
 * menu"): a range marked from the keyboard. It asks a from and a to among the
 * axis' buckets as the tile draws them, each by its words, the whole axis to
 * start, and marks that range as a drag over it does (`onMarkRange`), or adds
 * it, as a Ctrl-drag does.
 *
 * A modal dialog (rule 85): focus on From as it opens, Tab kept in it, Esc and
 * Cancel closing it, asking first once something was changed; focus back to
 * what opened it.
 */
export function MarkRangeDialog({
  axis,
  buckets,
  onMark,
  onClose,
}: {
  /** The axis' member, by its title: "Ordered at". */
  readonly axis: string;
  readonly buckets: readonly RangeBucket[];
  /** The range's ends, the right way round, and whether it adds. */
  readonly onMark: (range: { from: string; to: string }, add: boolean) => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  useFocusTrap(box);
  useReturnFocus();

  // The whole axis as it opened, kept, so an answer that changes while it is
  // open neither moves the start nor marks it changed (T636's review).
  const [start] = useState(() => buckets[0]?.value ?? '');
  const [end] = useState(() => buckets[buckets.length - 1]?.value ?? '');
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  /** No bucket drawn: nothing to mark (T636's review; a drag over none marks nothing). */
  const empty = buckets.length === 0;
  const [add, setAdd] = useState(false);
  const changed = from !== start || to !== end || add;

  const [asking, setAsking] = useState(false);
  const keepEditing = () => {
    setAsking(false);
    first.current?.focus();
  };
  const requestClose = () => {
    if (asking) keepEditing();
    else if (changed) setAsking(true);
    else onClose();
  };
  const escape = useRef(requestClose);
  useEffect(() => {
    escape.current = requestClose;
  });
  useEffect(() => {
    first.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      escape.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  /** As a drag's: the earlier bucket first, whichever was chosen first. */
  const mark = () => {
    if (empty) return;
    const at = (value: string) => buckets.findIndex((bucket) => bucket.value === value);
    const [low, high] = at(from) <= at(to) ? [from, to] : [to, from];
    onMark({ from: low, to: high }, add);
    onClose();
  };

  return (
    <>
      <div className="dialog-backdrop">
        <div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-title`}
          className="dialog mark-range"
        >
          <h2 id={`${ids}-title`}>Mark a range</h2>
          <p className="mark-range__axis">Along {axis}</p>
          {empty ? <p className="mark-range__none">Nothing is on the axis to mark.</p> : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mark();
            }}
          >
            <div className="mark-range__ends">
              <label className="field">
                From
                <select
                  ref={first}
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                >
                  {buckets.map((bucket) => (
                    <option key={bucket.value} value={bucket.value}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                To
                <select
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                >
                  {buckets.map((bucket) => (
                    <option key={bucket.value} value={bucket.value}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {/* A Ctrl-drag's add, said in words (AC-093, `applyAxisRange`). */}
            <label className="mark-range__add">
              <input
                type="checkbox"
                checked={add}
                onChange={(event) => {
                  setAdd(event.target.checked);
                }}
              />
              Add to what’s marked
            </label>
            <div className="dialog__actions">
              <button type="button" onClick={requestClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={empty}>
                Mark
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* Beside the dialog, never in it, so its trap leaves Tab to the question. */}
      {asking ? (
        <DiscardQuestion
          body="The range you chose isn’t marked."
          onKeep={keepEditing}
          onDiscard={onClose}
        />
      ) : null}
    </>
  );
}
