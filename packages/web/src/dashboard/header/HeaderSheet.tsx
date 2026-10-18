import type { ReactNode } from 'react';

/**
 * The header sheet (F43; design 19 screen 2; direction.md §7g): what the
 * compact row folds away — the description, the ownership line and the filter
 * bar — directly after the row in the DOM, a region named "Filters and
 * details" that the Filters toggle's `aria-controls` names.
 *
 * Closed, it is `hidden`, so nothing in it is focused or read (AC-487). It
 * stays mounted while closed: the filter bar's state — a value being picked,
 * the options it has read — is kept for when it opens again.
 */
export function HeaderSheet({
  id,
  open,
  children,
}: {
  readonly id: string;
  readonly open: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="header-sheet"
      role="region"
      aria-label="Filters and details"
      hidden={!open}
    >
      {children}
    </div>
  );
}
