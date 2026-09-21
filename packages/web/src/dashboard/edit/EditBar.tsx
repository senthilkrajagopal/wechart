import { useId, useRef, useState } from 'react';

/**
 * The dashboard edit bar (AC-053, direction.md section 2).
 *
 * Undo, Redo, "Discard (n changes)" and Save. This component only shows them
 * and says whether each one has anything to act on; the session above it owns
 * the history.
 */
export interface EditBarProps {
  /** Changes still in effect since editing began. Drives Discard's label. */
  readonly changes: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  /**
   * Why Save is held back, when it is — shown beside it and tied to it for
   * assistive technology. A disabled control with no explanation is the most
   * frustrating kind (T114): nobody can tell whether it is broken, forbidden,
   * or waiting on something they have not done.
   */
  readonly saveBlocked?: string | undefined;
  /**
   * A save is under way (AC-184). Save reads "Saving…" and nothing on the bar
   * can be pressed: a second Save would send the session twice, and Undo or
   * Discard now would change a document the save has already taken.
   */
  readonly saving?: boolean;
}

/**
 * "Discard (1 change)", not "(1 changes)". The count is on the visible label
 * rather than in an aria-label because a visible label that the accessible
 * name does not contain fails WCAG 2.5.3, and because the count is exactly the
 * thing a screen-reader user wants to hear before discarding.
 */
function discardLabel(changes: number): string {
  if (changes === 0) return 'Discard';
  return `Discard (${String(changes)} ${changes === 1 ? 'change' : 'changes'})`;
}

interface Control {
  /** Stable across label changes — "Save" becoming "Saving…" must not remount the button and lose focus. */
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly run: () => void;
  readonly className?: string;
  /** The id of the text explaining why the control is disabled. */
  readonly describedBy?: string;
}

export function EditBar({
  changes,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDiscard,
  onSave,
  saveBlocked,
  saving = false,
}: EditBarProps) {
  const [focused, setFocused] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const reasonId = useId();

  const controls: readonly Control[] = [
    { id: 'undo', label: 'Undo', disabled: saving || !canUndo, run: onUndo },
    { id: 'redo', label: 'Redo', disabled: saving || !canRedo, run: onRedo },
    {
      id: 'discard',
      label: discardLabel(changes),
      disabled: saving || changes === 0,
      run: onDiscard,
    },
    {
      id: 'save',
      label: saving ? 'Saving…' : 'Save',
      disabled: saving || saveBlocked !== undefined,
      run: onSave,
      className: 'edit-bar__save',
      ...(saveBlocked === undefined ? {} : { describedBy: reasonId }),
    },
  ];

  /**
   * The APG toolbar pattern: the bar is one tab stop and the arrow keys move
   * within it. Declaring `role="toolbar"` is a promise that this is how it
   * behaves — a screen-reader user who hears "toolbar" and presses Tab expects
   * to leave it, not to walk through four buttons.
   */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = controls.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % controls.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + controls.length) % controls.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;

    event.preventDefault();
    setFocused(next);
    buttons.current[next]?.focus();
  };

  return (
    <>
      <div role="toolbar" aria-label="Dashboard editing" className="edit-bar">
        {controls.map((control, index) => (
          <button
            key={control.id}
            type="button"
            ref={(node) => {
              buttons.current[index] = node;
            }}
            /**
             * `aria-disabled`, not `disabled`: a toolbar item that drops out of
             * the tab order when it has nothing to do makes the bar's shape
             * change under the user, and AC-053 asks that these controls be
             * *there*. The handler is what refuses.
             */
            aria-disabled={control.disabled}
            aria-describedby={control.describedBy}
            tabIndex={index === focused ? 0 : -1}
            className={control.className}
            onFocus={() => setFocused(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => {
              if (!control.disabled) control.run();
            }}
          >
            {control.label}
          </button>
        ))}
      </div>
      {/* Outside the toolbar: a toolbar holds controls, and arrow keys moving
        through it should not land on a sentence. */}
      {/* Always in the document, with its text changing: a live region that
          appears together with its words is announced unreliably, and
          someone returning from the chart editor, with focus on a tile,
          would otherwise not learn that Save is now held back. */}
      <p id={reasonId} className="edit-bar__blocked" data-testid="save-blocked" role="status">
        {saveBlocked ?? ''}
      </p>
    </>
  );
}
