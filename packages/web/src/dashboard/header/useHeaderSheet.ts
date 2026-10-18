import { useCallback, useState } from 'react';

/**
 * Whether the reader has the header sheet open (AC-490; 19-Q2, "No, always
 * start compact (Recommended)").
 *
 * - **For the visit.** It is held by the dashboard's chrome, which a change of
 *   page tab, a bookmark applied, a refresh of its data and edit mode all
 *   leave mounted, so the sheet stays as the reader left it through each.
 * - **Closed at every opening.** Opened again by a link, from Explore or by a
 *   reload, the dashboard mounts afresh, and the sheet starts closed.
 * - **Kept nowhere.** It is React state alone: not the browser's storage, not
 *   the address, not wechart's server.
 *
 * Edit mode shows the sheet open without changing this, so leaving it puts
 * back what the reader had (rule 114).
 */
export function useHeaderSheet(): {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => {
    setOpen((was) => !was);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  return { open, toggle, close };
}
