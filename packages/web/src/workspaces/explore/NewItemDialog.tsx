import { nameProblem } from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { DiscardQuestion } from '../../shell/DiscardQuestion';
import { InfoBar } from '../../shell/InfoBar';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { useReturnFocus } from '../../shell/useReturnFocus';
import { inTreeOrder, TargetTree } from '../data-sources/TargetTree';
import { SHARED_ROOT } from './roots';

/**
 * A dashboard or chart made in the workspace takes its name and the shared
 * folder it is to go to first (T345, AC-282; direction.md rule 74;
 * references.md "New in My workspace"): one of the folders where its author
 * has read-write access, by path, chosen for them when there is only one. It
 * goes there by a proposal (T349).
 */
export interface Target {
  readonly id: string;
  /** Its folders from the root down; none for the shared root. */
  readonly path: readonly string[];
}

export const targetLabel = (target: Target) =>
  target.path.length === 0 ? SHARED_ROOT.title : target.path.join(' / ');

/** "More than about ten" read-write folders, past which the tree has a filter (design 04, state B). */
const MANY = 10;

export function NewItemDialog({
  kind,
  defaultTitle,
  targets,
  onCreate,
  onClose,
  busy = false,
}: {
  /** A cube or view is a model's (T347, AC-282): its name is the one its file gives it. */
  kind: 'dashboard' | 'chart' | 'cube' | 'view';
  defaultTitle: string;
  targets: readonly Target[];
  onCreate: (title: string, targetFolderId: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const naming = useRef<HTMLInputElement>(null);
  useFocusTrap(box);
  const [title, setTitle] = useState(defaultTitle);
  const [chosen, setChosen] = useState(targets.length === 1 ? targets[0]!.id : '');
  const chosenTarget = targets.find((target) => target.id === chosen);
  /**
   * Design 04, state B: more than about ten folders, and a filter heads the
   * tree, matching any part of a path. Type to filter, arrows to move,
   * Enter to choose, as the design notes it.
   */
  const many = targets.length > MANY;
  const [match, setMatch] = useState('');
  const filtering = many && match.trim() !== '';
  const shown = inTreeOrder(
    filtering
      ? targets.filter((target) =>
          targetLabel(target).toLowerCase().includes(match.trim().toLowerCase()),
        )
      : targets,
  );
  const onFilterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (event.key === 'Enter') {
      // Enter chooses the folder the arrows are on, and makes nothing yet.
      event.preventDefault();
      // A choice the filter hides gives way to the first match (T692's review).
      if (!shown.some((target) => target.id === chosen) && shown[0] !== undefined)
        setChosen(shown[0].id);
      return;
    }
    if (step === 0 || shown.length === 0) return;
    event.preventDefault();
    const at = shown.findIndex((target) => target.id === chosen);
    const next = at < 0 ? (step > 0 ? 0 : shown.length - 1) : at + step;
    setChosen(shown[Math.min(Math.max(next, 0), shown.length - 1)]!.id);
  };
  /** A cube's or view's name is one xcube takes for an item (T347's review), said before Create. */
  const named = title.trim();
  // R72's grammar, core's one rule, as the API and xcube hold it (T703, AC-426).
  const misnamed =
    (kind === 'cube' || kind === 'view') && named !== '' ? nameProblem(named, kind) : undefined;

  // Focus goes back to what opened it (T405, rule 85).
  useReturnFocus();
  /**
   * Escape and Cancel close it, asking first where a name was typed (T405,
   * rule 85); Escape over the question keeps editing. Focus starts on the name.
   */
  const [asking, setAsking] = useState(false);
  const keepEditing = () => {
    setAsking(false);
    naming.current?.focus();
  };
  const requestClose = () => {
    if (title !== defaultTitle) setAsking(true);
    else onClose();
  };
  const escape = useRef(requestClose);
  useEffect(() => {
    escape.current = asking ? keepEditing : requestClose;
  });
  useEffect(() => {
    naming.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escape.current();
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog new-item-dialog"
      >
        <h2 id={heading}>New {kind} in My workspace</h2>
        <div className="field">
          <label htmlFor={`${heading}-name`}>
            <span>Name</span>
            {/* Said to a screen reader by `aria-required`, as the tree's label is by its own. */}
            <span className="field__req" aria-hidden="true">
              {' '}
              · required
            </span>
          </label>
          <input
            id={`${heading}-name`}
            ref={naming}
            aria-required="true"
            value={title}
            aria-invalid={misnamed !== undefined ? 'true' : undefined}
            aria-describedby={misnamed !== undefined ? `${heading}-name-rule` : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          {misnamed !== undefined ? (
            <p id={`${heading}-name-rule`} className="field__error">
              {misnamed}
            </p>
          ) : null}
        </div>
        {targets.length === 0 ? (
          <InfoBar>
            <p>You have read-write access to no shared folder, so there is nowhere for it to go.</p>
          </InfoBar>
        ) : (
          <div className="new-item-dialog__target">
            {/* Design 04, state A: a tree of full paths; state B: past about
                ten, a filter over it (T692). */}
            <TargetTree
              targets={filtering ? shown : targets}
              chosen={chosen}
              onChoose={setChosen}
              describedBy={`${heading}-target-help`}
              fullPaths
              {...(filtering ? { match: match.trim() } : {})}
              {...(many
                ? {
                    filter: (
                      <span className="new-item-dialog__find">
                        {/* Design 04 state B's search icon at its head. */}
                        <svg
                          data-icon="search"
                          viewBox="0 0 16 16"
                          width="14"
                          height="14"
                          aria-hidden="true"
                        >
                          <circle
                            cx="7"
                            cy="7"
                            r="4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                          <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                        <input
                          type="search"
                          className="new-item-dialog__filter"
                          aria-label="Filter folders"
                          placeholder="Filter folders"
                          value={match}
                          onChange={(event) => {
                            setMatch(event.target.value);
                          }}
                          onKeyDown={onFilterKey}
                        />
                      </span>
                    ),
                  }
                : {})}
            />
            <p id={`${heading}-target-help`} className="field__help">
              {filtering
                ? `${String(shown.length)} of ${String(targets.length)} folders where you have read-write access.`
                : 'Only folders where you have read-write access.'}
            </p>
          </div>
        )}
        <p className="new-item-dialog__note">
          It stays private in My workspace until you propose it to{' '}
          {chosenTarget === undefined ? 'its folder' : <b>{targetLabel(chosenTarget)}</b>}.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={chosen === '' || title.trim() === '' || misnamed !== undefined || busy}
            onClick={() => {
              onCreate(title.trim(), chosen);
            }}
          >
            Create
          </button>
        </div>
      </div>
      {asking ? (
        <DiscardQuestion
          body="The name you typed isn’t kept."
          onKeep={keepEditing}
          onDiscard={onClose}
        />
      ) : null}
    </div>
  );
}
