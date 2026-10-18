import { useLayoutEffect, useRef } from 'react';

/**
 * The dashboard's title in the compact row (AC-485; design 19 pin 2, state
 * G): the page's `h1` at `text-lg`, cut short with "…" when the row has no
 * room for it — by CSS, so its text, and so its accessible name, stays whole —
 * with the whole of it in its tooltip.
 *
 * It says whether the row has cut it (`onCut`), measured as laid out and
 * again whenever its box changes size: the sheet then starts with it whole.
 *
 * "Editing ‹name›" while editing (AC-206): the word is for the eye; the
 * heading still names the dashboard, and the edit bar — a toolbar named
 * "Dashboard editing" — says the mode to a screen reader.
 */
export function HeaderTitle({
  title,
  editing,
  onCut,
}: {
  readonly title: string;
  readonly editing: boolean;
  readonly onCut: (cut: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const element = heading.current;
    if (element === null) return undefined;
    const measure = () => {
      onCut(element.scrollWidth > element.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [title, editing, onCut]);

  return (
    <h1 ref={heading} title={title}>
      {editing ? (
        <span className="dashboard__editing" aria-hidden="true">
          Editing{' '}
        </span>
      ) : null}
      {title}
    </h1>
  );
}
