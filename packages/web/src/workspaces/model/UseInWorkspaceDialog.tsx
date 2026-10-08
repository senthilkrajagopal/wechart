import { useEffect, useId, useRef } from 'react';

import { useFocusTrap } from '../../shell/useFocusTrap';

/**
 * "Use in my workspace" (T543, AC-283; the user's answer "Yes, use-only
 * copy", R53), as T717 has it (R73): a model of a folder the user may only
 * read is copied into My workspace to use. It is proposed to no folder, so
 * no folder is asked for; a change to the shared cube is asked of its folder
 * from the copy's page, "Request a change".
 */
export function UseInWorkspaceDialog({
  path,
  folderWords,
  onCopy,
  onClose,
  busy = false,
  failure,
}: {
  readonly path: string;
  /** The folder it is in, as Explore says it; none until the folders are read. */
  readonly folderWords: string | undefined;
  readonly onCopy: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
  /** Why the copy was refused, in the API's words. */
  readonly failure?: string | undefined;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const copying = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  const name = path.slice(path.lastIndexOf('/') + 1);
  const folder = folderWords ?? 'its folder';

  // Escape closes it, as every dialog here closes; focus starts on Copy.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    copying.current?.focus();
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
          You may only read {folder}, so this copy is for use in My workspace only: it can’t be
          proposed to any folder. To change the shared cube, send {folder} a request from the copy’s
          page.
        </p>
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
            ref={copying}
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              onCopy();
            }}
          >
            {busy ? 'Copying…' : 'Copy to My workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
