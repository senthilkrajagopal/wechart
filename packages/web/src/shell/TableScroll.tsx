import type { ReactNode } from 'react';

import { useNarrowWindow } from '../dashboard/useNarrowWindow';

/**
 * A workspace table's own sideways scroll below 1,024 px (T396, AC-304): a
 * table wider than a phone's screen scrolls in this box, and the page
 * doesn't; the table keeps its own role and its full width, where a table
 * made a block box to scroll risks both (T396's review). The stylesheet
 * gives the box its scroll only there.
 *
 * There it is a named region the keyboard reaches, as a scrolling box must
 * be: the keyboard has no other way to scroll it (WCAG 2.1.1; DataTable's
 * region, T182). Wider it is a plain box: no tab stop, no landmark, and
 * nothing clipped, so a sticky header still sticks to the page.
 */
export function TableScroll({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const narrow = useNarrowWindow();
  return narrow ? (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="table-scroll-narrow" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  ) : (
    <div className="table-scroll-narrow">{children}</div>
  );
}
