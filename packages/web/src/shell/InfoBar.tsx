import type { ReactNode } from 'react';

import { StatusIcon } from './StatusIcon';

/**
 * A page's note, or a dialog's: the prototype's info bar, with its "i" —
 * one pattern wherever a surface says what it is for (T466, UX-109). Not a
 * state: the clock is "idle", a state, and was drawn on notes that meant
 * nothing of the sort.
 */
export function InfoBar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="info-bar" role="note">
      <StatusIcon kind="info" />
      <div>{children}</div>
    </div>
  );
}
