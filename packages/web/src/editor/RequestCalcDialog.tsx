import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from '../shell/useFocusTrap';

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

  // Escape closes it, as every dialog here closes; focus starts in the description.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    writing.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const said = GROUPS.flatMap(([group, label]) =>
    fields[group].length === 0 ? [] : [`${label}: ${fields[group].map(titleOf).join(', ')}`],
  ).join(' · ');
  const written = description.trim();
  const over = written.length > DESCRIPTION_LIMIT;

  return (
    <div className="dialog-backdrop">
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
          <button type="button" className="btn" onClick={onClose}>
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
    </div>
  );
}
