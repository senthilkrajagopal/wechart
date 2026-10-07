import { useEffect, useId, useRef, useState } from 'react';

import { DiscardQuestion } from '../shell/DiscardQuestion';
import { useFocusTrap } from '../shell/useFocusTrap';
import { useReturnFocus } from '../shell/useReturnFocus';

/**
 * "Request a calculation…" (T383, AC-050; F6, `[R7]`): a calculation the
 * quick calculations menu can't express, described in the user's words and
 * asked of the people who may change the model that defines the chart's cube
 * (its folder's read-write members). The request carries the chart and the
 * fields it has in use, shown here before it is sent.
 */
export interface RequestedFields {
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  readonly timeDimensions: readonly string[];
  readonly filters: readonly string[];
}

/** A description's length at most: the Propose dialog's (references.md, "Propose dialog"). */
export const DESCRIPTION_LIMIT = 1000;

const GROUPS: readonly [keyof RequestedFields, string][] = [
  ['measures', 'Metrics'],
  ['dimensions', 'Dimensions'],
  ['timeDimensions', 'Time'],
  ['filters', 'Filters'],
];

export function RequestCalcDialog({
  measureTitle,
  cubeTitle,
  fields,
  titleOf,
  onSend,
  onClose,
}: {
  /** The measure whose menu it was asked from. */
  readonly measureTitle: string;
  /** The chart's cube or view, as the user knows it. */
  readonly cubeTitle: string;
  readonly fields: RequestedFields;
  readonly titleOf: (member: string) => string;
  /** Sends the request with this description; a refusal's message, thrown. */
  readonly onSend: (description: string) => Promise<void>;
  readonly onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const writing = useRef<HTMLTextAreaElement>(null);
  useFocusTrap(box);
  const [description, setDescription] = useState('');
  const [state, setState] = useState<
    { kind: 'writing' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'refused'; why: string }
  >({ kind: 'writing' });

  // Focus goes back to what opened it (T639, rule 85).
  useReturnFocus();
  /**
   * Escape and Cancel close it, asking first where a description was typed
   * and not yet sent (T639, rule 85); Escape over the question keeps editing.
   * Sent or on its way, nothing is lost by closing.
   */
  const [asking, setAsking] = useState(false);
  const typed = description !== '' && (state.kind === 'writing' || state.kind === 'refused');
  const keepEditing = () => {
    setAsking(false);
    writing.current?.focus();
  };
  const requestClose = () => {
    if (typed) setAsking(true);
    else onClose();
  };
  // Focus starts in the description.
  const escape = useRef(requestClose);
  useEffect(() => {
    escape.current = asking ? keepEditing : requestClose;
  });
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    writing.current?.focus();
    /**
     * Heard first, while focus is in it or its question (or nowhere), and
     * marked handled: in a dashboard's chart editor the overlay goes back on
     * an Escape no one handled, and took the dialog with it (T639's review;
     * as the type gallery does, T230's).
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const focused = document.activeElement;
      if (focused !== null && focused !== document.body && !backdrop.current?.contains(focused))
        return;
      event.preventDefault();
      escape.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  const said = GROUPS.flatMap(([group, label]) =>
    fields[group].length === 0 ? [] : [`${label}: ${fields[group].map(titleOf).join(', ')}`],
  ).join(' · ');
  const written = description.trim();
  const over = written.length > DESCRIPTION_LIMIT;

  return (
    <div ref={backdrop} className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog new-item-dialog"
      >
        <h2 id={heading}>Request a calculation</h2>
        <p className="new-item-dialog__note" data-testid="request-note">
          Describe the calculation you need on {measureTitle}. It goes, with this chart and its
          fields, to the people who may change the model that defines {cubeTitle}.
        </p>
        <p className="new-item-dialog__note" data-testid="request-fields">
          {said}
        </p>
        <div className="field">
          <label htmlFor={`${heading}-description`}>What should it calculate?</label>
          <textarea
            id={`${heading}-description`}
            ref={writing}
            rows={4}
            value={description}
            readOnly={state.kind === 'sending' || state.kind === 'sent'}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          {/* As the Propose dialog's: counted, and nothing silently cut. */}
          <p
            className={`propose-dialog__counter${over ? ' is-over' : ''}`}
            data-testid="request-count"
          >
            {written.length.toLocaleString('en-US')} / {DESCRIPTION_LIMIT.toLocaleString('en-US')}
          </p>
          {over ? <p className="field__error">Shorten to 1,000 characters</p> : null}
        </div>
        {state.kind === 'refused' ? (
          <p role="alert" className="field__error">
            {state.why}
          </p>
        ) : null}
        {state.kind === 'sent' ? (
          <p role="status">Sent. It’s listed for them under Reviews › Calculation requests.</p>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={requestClose}>
            {state.kind === 'sent' ? 'Close' : 'Cancel'}
          </button>
          {state.kind === 'sent' ? null : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={written === '' || over || state.kind === 'sending'}
              onClick={() => {
                setState({ kind: 'sending' });
                onSend(written).then(
                  () => {
                    setState({ kind: 'sent' });
                  },
                  (failure: unknown) => {
                    setState({
                      kind: 'refused',
                      why:
                        failure instanceof Error
                          ? failure.message
                          : 'The request couldn’t be sent. Try again.',
                    });
                  },
                );
              }}
            >
              {state.kind === 'sending' ? 'Sending…' : 'Send request'}
            </button>
          )}
        </div>
      </div>
      {/* Beside the dialog, not in it, so its trap leaves Tab to the question. */}
      {asking ? (
        <DiscardQuestion
          body="The description you typed isn’t kept."
          onKeep={keepEditing}
          onDiscard={onClose}
        />
      ) : null}
    </div>
  );
}
