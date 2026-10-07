import type { ReactNode } from 'react';

import { StatusIcon } from './StatusIcon';

/**
 * A page's note, or a dialog's: the prototype's info bar, with its "i" —
 * one pattern wherever a surface says what it is for (T466, UX-109). Not a
 * state: the clock is "idle", a state, and was drawn on notes that meant
 * nothing of the sort.
 */
export function InfoBar({
  children,
  label,
}: {
  readonly children: ReactNode;
  /** Its name, where a surface has more than one note: Jobs' scope note's (T559). */
  readonly label?: string;
}) {
  return (
    <div className="info-bar" role="note" aria-label={label}>
      <StatusIcon kind="info" />
      <div>{children}</div>
    </div>
  );
}
