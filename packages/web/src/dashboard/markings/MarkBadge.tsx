import type { Marking } from '@wechart/core';

/**
 * The badge a tile shows while it is marking something (AC-098, direction.md
 * rule 50: "Every tile using a non-empty marking shows 'n marked' beside the
 * marking's swatch").
 *
 * **This is what makes the marking palette defensible**, not a courtesy.
 * direction.md's colour audit records dark-mode `mk1`↔`mk4` at ΔE 6.8 under
 * colour-blindness simulation — inside the 6–8 floor band, which is "legal
 * only with secondary encoding, which chips and badges provide by always
 * naming the marking". Take the name and the count away and the colours stop
 * being allowed.
 *
 * So the swatch is decorative and the text carries the meaning: a reader that
 * ignored every colour still learns which marking is in play and how much of
 * the tile is in it.
 */
export interface MarkBadgeProps {
  readonly marking: Marking;
  /** The marking's own colour, from its slot. */
  readonly colour: string;
  readonly markedCount: number;
  /**
   * Whose share the tile shows, where its items are all only partly marked
   * (T935, AC-098, rule 50 as R81 amends it): "EMEA" reads "EMEA's share
   * shown", in place of a count that would be 0 of the tile's own items.
   */
  readonly shareShown?: string | undefined;
}

export function MarkBadge({ marking, colour, markedCount, shareShown }: MarkBadgeProps) {
  // Rule 50 is about tiles using a *non-empty* marking. "0 marked" on every
  // tile of an untouched dashboard is noise that would teach people to ignore
  // the badge — which is the one thing it cannot afford.
  if (markedCount <= 0) return null;

  return (
    <span className="mark-badge" data-testid="mark-badge">
      <span
        className="mark-badge__swatch"
        data-testid="mark-swatch"
        aria-hidden="true"
        style={{ background: colour }}
      />
      {shareShown === undefined
        ? // Grouped, as the 1,000-item limit it is read against is (AC-102).
          `${marking.name}: ${markedCount.toLocaleString('en-GB')} marked`
        : // "EMEA's", but "3 items'" (T935's review).
          `${marking.name}: ${shareShown}${shareShown.endsWith('items') ? "'" : "'s"} share shown`}
    </span>
  );
}
