import { useEffect, useState } from 'react';

/**
 * Gives focus back to what opened a dialog, panel or popover once it closes
 * (T405, AC-176; direction.md rule 85; the WAI-ARIA APG dialog pattern).
 *
 * What had focus as it first rendered is its opener: read then, before any
 * effect moves focus into it, and kept, as StrictMode's second run of the
 * effects would otherwise read the dialog's own field (T405's review). After
 * it closes, focus goes back there only if it fell to the page with the
 * dialog. A close that moved focus on purpose (to a toast's action, to the
 * item made) is left alone, and so is an opener that has gone.
 */
export function useReturnFocus(): void {
  const [opener] = useState(() =>
    typeof document === 'undefined' ? null : document.activeElement,
  );
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (!(opener instanceof HTMLElement) || !opener.isConnected) return;
        if (now === null || now === document.body) opener.focus();
      });
    },
    [opener],
  );
}
