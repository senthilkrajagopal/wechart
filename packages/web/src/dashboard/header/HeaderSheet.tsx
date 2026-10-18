import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Where the sheet is: at rest, closed or open, or moving between them
 * (AC-488).
 */
type Motion = 'closed' | 'opening' | 'open' | 'closing';

/**
 * How long each move takes, as the CSS has it (direction.md §7g: Fluent 2's
 * `durationNormal` and `durationFast`), and a little more: if no transition
 * runs at all — the height already where it's going — the move still ends.
 */
const SETTLE_MS = { opening: 200 + 100, closing: 150 + 100 } as const;

/**
 * Only where the system says the user has no motion preference (AC-488, WCAG
 * 2.2 SC 2.3.3; `references-compact-header.md` §2). Where it can't say — no
 * `matchMedia` — nothing moves.
 */
const animates = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;

/**
 * The header sheet (F43; design 19 screen 2; direction.md §7g): what the
 * compact row folds away — the description, the ownership line and the filter
 * bar — directly after the row in the DOM, a region named "Filters and
 * details" that the Filters toggle's `aria-controls` names.
 *
 * Closed, it is `hidden`, so nothing in it is focused or read (AC-487). It
 * stays mounted while closed: the filter bar's state — a value being picked,
 * the options it has read — is kept for when it opens again.
 *
 * It opens by growing its height, over 200 ms decelerating, and closes over
 * 150 ms accelerating, its contents `inert` while it moves (AC-488; design 19
 * pin 8). With reduced motion asked for, it opens and closes at once.
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
  const [motion, setMotion] = useState<Motion>(open ? 'open' : 'closed');
  /**
   * `open` turned: start the move from here, in the same render, so the
   * sheet is never drawn a frame at rest on the wrong side of it.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setMotion(animates() ? (open ? 'opening' : 'closing') : open ? 'open' : 'closed');
  }
  const sheet = useRef<HTMLDivElement>(null);

  /**
   * The height moves from where it is to where it's going: from 0 or from
   * its full height at rest, or from part way when a move is turned back.
   * Once the height's own transition ends — not a pill's inside it — it is
   * at rest, and its height is its contents' again, so it grows as its pills
   * wrap (AC-487).
   */
  useLayoutEffect(() => {
    const node = sheet.current;
    if (node === null) return;
    if (motion === 'open' || motion === 'closed') {
      node.style.height = '';
      return;
    }
    // At rest closed, its height is set nowhere: it opens from 0.
    const from =
      motion === 'opening' && node.style.height === '' ? 0 : node.getBoundingClientRect().height;
    node.style.height = `${String(from)}px`;
    // Laid out at the start before the end is set, so the height transitions.
    void node.offsetHeight;
    node.style.height = motion === 'opening' ? `${String(node.scrollHeight)}px` : '0px';

    const settle = () => {
      setMotion(motion === 'opening' ? 'open' : 'closed');
    };
    let timer = setTimeout(settle, SETTLE_MS[motion]);
    const own = (event: Event) => event.target === node;
    // Running: it ends when it ends, however slowly the page plays it.
    const run = (event: Event) => {
      if (own(event)) clearTimeout(timer);
    };
    // Cut short with none after it: it still comes to rest.
    const cancelled = (event: Event) => {
      if (!own(event)) return;
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS[motion]);
    };
    const end = (event: Event) => {
      if (!own(event)) return;
      const property = (event as Partial<TransitionEvent>).propertyName;
      if (property !== undefined && property !== '' && property !== 'height') return;
      clearTimeout(timer);
      settle();
    };
    node.addEventListener('transitionrun', run);
    node.addEventListener('transitioncancel', cancelled);
    node.addEventListener('transitionend', end);
    return () => {
      clearTimeout(timer);
      node.removeEventListener('transitionrun', run);
      node.removeEventListener('transitioncancel', cancelled);
      node.removeEventListener('transitionend', end);
    };
  }, [motion]);

  const moving = motion === 'opening' || motion === 'closing';
  return (
    <div
      ref={sheet}
      id={id}
      className="header-sheet"
      role="region"
      aria-label="Filters and details"
      data-motion={moving ? motion : undefined}
      hidden={motion === 'closed'}
      // Nothing in it is reached while it moves (AC-488).
      inert={moving}
    >
      {children}
    </div>
  );
}
