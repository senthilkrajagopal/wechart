/**
 * Where a chart tile's badges go (T402, AC-201, amended; the user's answers
 * to questions 27 and 29): the marked-items badge, and "Updating…" with the
 * freshness badge, sit in the tile's head beside its title where the head has
 * room for them and a whole title, and otherwise go under the chart, whole.
 * Measured from the head itself, not guessed from the tile's width: a long
 * marking name or a busy head needs room a width can't foresee (T402's
 * review).
 */
export interface BadgePlace {
  readonly inFoot: boolean;
  /** What the badges took in the head when they left it: the room they need back. */
  readonly moved: number;
}

/**
 * They leave the head once its items, the title at its whole width, no
 * longer fit; they come back only once it has room for all they took, so
 * that, back, everything fits and they stay.
 */
export function nextPlace(
  place: BadgePlace,
  measured: { readonly room: number; readonly badges: number },
): BadgePlace {
  if (!place.inFoot)
    return measured.room < 0 && measured.badges > 0
      ? { inFoot: true, moved: measured.badges }
      : place;
  return measured.room >= place.moved ? { inFoot: false, moved: 0 } : place;
}

const BADGES = ':scope > .mark-badge, :scope > .tile-busy, :scope > .tile-freshness';

/** Rounding in layout is no reason to move a badge. */
const SLACK = 0.5;

/**
 * An item's width in the head: the title's whole text, and every other item
 * as drawn — the freshness badge gives way first by design, down to its least
 * width, before the title is cut (T250).
 */
function ownWidth(item: Element): number {
  const drawn = item.getBoundingClientRect().width;
  if (!item.classList.contains('tile-head__title')) return drawn;
  const range = document.createRange();
  range.selectNodeContents(item);
  return typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect().width
    : drawn;
}

/**
 * The head's room left once the title has its whole text: below 0, the title
 * is cut — which is what the badges leave the head for.
 */
export function roomIn(head: HTMLElement): number {
  const style = getComputedStyle(head);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const items = [...head.children];
  const used =
    items.reduce((sum, item) => sum + ownWidth(item), 0) + gap * Math.max(0, items.length - 1);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const room = head.clientWidth - padding - used;
  return Math.abs(room) < SLACK ? 0 : room;
}

/** What the badges in the head take there, each with its gap. */
export function badgesIn(head: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(head).columnGap) || 0;
  return [...head.querySelectorAll(BADGES)].reduce((sum, item) => sum + ownWidth(item) + gap, 0);
}
