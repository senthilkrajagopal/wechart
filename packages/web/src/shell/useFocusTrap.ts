import { useEffect, type RefObject } from 'react';

/**
 * What can take focus by Tab. Disabled controls and `tabindex="-1"` cannot,
 * and neither can anything under `hidden` or `inert`, ruled out below — the
 * two ways this app takes a control away.
 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');

/**
 * Keeps Tab and Shift+Tab inside a modal dialog while it is open (T182,
 * AC-176; the WAI-ARIA APG dialog pattern). `aria-modal` tells a screen
 * reader the page behind is out of reach, but moves nothing: without this,
 * Tab walks out of the dialog onto controls under its backdrop, where the
 * focus ring cannot be seen.
 *
 * Only the trap. Where focus starts, and where it goes back to on closing,
 * each dialog already decides for itself: the safe answer, the opener.
 */
export function useFocusTrap(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const box = dialog.current;
      if (event.key !== 'Tab' || box === null) return;

      const stops = [...box.querySelectorAll<HTMLElement>(TABBABLE)].filter(
        (stop) => stop.tabIndex >= 0 && stop.closest('[hidden], [inert]') === null,
      );
      const first = stops[0];
      const last = stops.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }

      const at = document.activeElement;
      const inside = at !== null && box.contains(at);
      // In another modal, opened over this one — search over a dialog: its
      // Tab is that modal's to keep, not this one's to take back.
      if (!inside && at?.closest('[aria-modal="true"]') != null) return;
      // On something inside that Tab doesn't stop at — a heading that took
      // focus as it opened, a log that did: at the edge where the browser
      // would leave it, with no control before (Shift) or after it (T640).
      const atEdge =
        inside &&
        !stops.includes(at as HTMLElement) &&
        !stops.some((stop) => {
          const where = stop.compareDocumentPosition(at);
          return event.shiftKey
            ? (where & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
            : (where & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
        });
      if (event.shiftKey ? !inside || at === first || atEdge : !inside || at === last || atEdge) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dialog]);
}
