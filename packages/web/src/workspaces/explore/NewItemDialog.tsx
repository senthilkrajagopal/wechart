import { nameProblem } from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { DiscardQuestion } from '../../shell/DiscardQuestion';
import { InfoBar } from '../../shell/InfoBar';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { useReturnFocus } from '../../shell/useReturnFocus';
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
          <label htmlFor={`${heading}-name`}>Name</label>
          <input
            id={`${heading}-name`}
            ref={naming}
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
          <div className="field">
            <label htmlFor={`${heading}-target`}>Target folder</label>
            <select
              id={`${heading}-target`}
              value={chosen}
              onChange={(event) => {
                setChosen(event.target.value);
              }}
            >
              <option value="" disabled>
                Choose a folder…
              </option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="new-item-dialog__note">
          It stays private in My workspace until you propose it to this folder.
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
