import { useEffect, useId, useRef, useState } from 'react';

import { InfoBar } from '../../shell/InfoBar';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { targetLabel, type Target } from '../explore/NewItemDialog';

/**
 * "Use in my workspace" (T543, AC-283; the user's answer "Yes, use-only
 * copy", R53): a model of a folder the user may only read is copied into My
 * workspace to use. It can never be proposed back to that folder, so it asks
 * which folder they write it goes to instead, as a new model there, as a new
 * model's dialog asks (rule 74): chosen for them where there is one.
 */
export function UseInWorkspaceDialog({
  path,
  folderWords,
  targets,
  onCopy,
  onClose,
  busy = false,
  failure,
}: {
  readonly path: string;
  /** The folder it is in, as Explore says it; none until the folders are read. */
  readonly folderWords: string | undefined;
  readonly targets: readonly Target[];
  readonly onCopy: (targetFolderId: string) => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
  /** Why the copy was refused, in the API's words. */
  readonly failure?: string | undefined;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const choosing = useRef<HTMLSelectElement>(null);
  useFocusTrap(box);
  const [chosen, setChosen] = useState(targets.length === 1 ? targets[0]!.id : '');
  const name = path.slice(path.lastIndexOf('/') + 1);

  // Escape closes it, as every dialog here closes; focus starts on the folder.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    choosing.current?.focus();
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog new-item-dialog"
      >
        <h2 id={heading}>Use {name} in My workspace</h2>
        <p className="new-item-dialog__note" data-testid="use-note">
          You may only read {folderWords ?? 'its folder'}, so this copy can’t be proposed back
          there. Choose a folder you may write: it goes there as a new model when you propose it.
        </p>
        {targets.length === 0 ? (
          <InfoBar>
            <p>You have read-write access to no shared folder, so there is nowhere for it to go.</p>
          </InfoBar>
        ) : (
          <div className="field">
            <label htmlFor={`${heading}-target`}>Target folder</label>
            <select
              id={`${heading}-target`}
              ref={choosing}
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
        {failure === undefined ? null : (
          <p role="alert" className="field__error">
            {failure}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={chosen === '' || busy}
            onClick={() => {
              onCopy(chosen);
            }}
          >
            {busy ? 'Copying…' : 'Copy to My workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
