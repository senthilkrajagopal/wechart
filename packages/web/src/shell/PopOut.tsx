import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from './useFocusTrap';

/**
 * Moves `held` into `target`, keeping what was in view in view. A node taken
 * out of the document loses its scroll offsets, so each is read first and
 * put back after (T600's review). One scrolled to its end — an editor typed
 * in at the file's end — goes to its end in the new place, whose height
 * differs: its offset alone would leave its last lines out of view there
 * (model-popout.spec:21).
 */
function moveTo(held: HTMLElement, target: HTMLElement): void {
  const scrolled = [held, ...held.querySelectorAll<HTMLElement>('*')]
    .filter((each) => each.scrollTop !== 0 || each.scrollLeft !== 0)
    .map((each) => ({
      each,
      top: each.scrollTop,
      left: each.scrollLeft,
      atEnd: each.scrollTop > 0 && each.scrollTop + each.clientHeight >= each.scrollHeight - 1,
    }));
  target.appendChild(held);
  for (const { each, top, left, atEnd } of scrolled) {
    each.scrollTop = atEnd ? each.scrollHeight - each.clientHeight : top;
    each.scrollLeft = left;
  }
}

/**
 * A pane that pops out into a larger modal dialog and back into its place
 * (T600, AC-420; R58, the user: "you should be able to popout into modal and
 * closing should pop back into place").
 *
 * What it holds is drawn once, into an element of its own, and that element
 * is moved — into the dialog, and back to its place — rather than drawn
 * again: an editor's text, cursor and undo history, and a diagram's layout,
 * stay as they were. Esc, the dialog's Close, or the caller's own control
 * (`out` set false) puts it back, and focus goes to `returnFocus`.
 */
export function PopOut({
  out,
  onClose,
  label,
  className,
  returnFocus,
  children,
}: {
  readonly out: boolean;
  /** Asked to put it back: Esc, or the dialog's Close. */
  readonly onClose: () => void;
  /** The dialog's name and heading. */
  readonly label: string;
  /** The classes of the element that holds it, in its place and popped out alike. */
  readonly className: string;
  /** The control that popped it out, which focus goes back to. */
  readonly returnFocus?: RefObject<HTMLElement | null> | undefined;
  readonly children: ReactNode;
}) {
  // Created once for the pane's life, with its classes: moved, never drawn again.
  const [held] = useState(() => Object.assign(document.createElement('div'), { className }));
  const place = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement | null>(null);
  /**
   * The dialog's body. As the dialog goes, what it holds goes back to its
   * place first, while both are still in the document: React calls a
   * detached ref's cleanup before it takes the dialog out, and only then
   * runs the effect below — by which time `held`, still inside the removed
   * dialog, had lost its scroll offsets (model-popout.spec:21, in Chrome).
   */
  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      body.current = node;
      if (node === null) return undefined;
      return () => {
        body.current = null;
        if (held.parentElement === node && place.current !== null) moveTo(held, place.current);
      };
    },
    [held],
  );
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);

  // Into the dialog while out, else in its place; focus follows the move.
  const wasOut = useRef(false);
  useLayoutEffect(() => {
    const target = out ? body.current : place.current;
    if (target !== null && held.parentElement !== target) moveTo(held, target);
    if (out && !wasOut.current) close.current?.focus();
    else if (!out && wasOut.current) returnFocus?.current?.focus();
    wasOut.current = out;
  }, [out, held, returnFocus]);

  // Esc puts it back, unless something inside took the key for itself
  // (an editor's completion list, say).
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!out) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [out]);

  return (
    <>
      <div ref={place} className="pop-out__place">
        {out ? (
          <p className="pop-out__note">Shown in the larger view. Esc brings it back.</p>
        ) : null}
      </div>
      {createPortal(children, held)}
      {out
        ? createPortal(
            <div className="dialog-backdrop pop-out__backdrop">
              <div ref={box} role="dialog" aria-modal="true" aria-label={label} className="pop-out">
                <div className="pop-out__head">
                  <h2 className="pop-out__title">{label}</h2>
                  <button
                    ref={close}
                    type="button"
                    className="btn-ghost btn-sm pop-out__close"
                    aria-label="Close"
                    onClick={onClose}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div ref={bodyRef} className="pop-out__body" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
