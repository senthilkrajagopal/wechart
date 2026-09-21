import type { Marking } from '@wechart/core';

/**
 * Announcing marking changes (AC-101, direction.md rule 52).
 *
 * Marking is otherwise an entirely visual event — items fade, an outline
 * appears, a badge updates — so this is the only channel carrying it to
 * someone who is not watching the chart. That is why the criterion's failing
 * state singles out the count: "Marking changed" is an announcement, and tells
 * a screen-reader user nothing they can act on.
 *
 * Polite rather than assertive, because marking is something the user has just
 * done. Interrupting someone to report their own action is the behaviour that
 * makes people switch live regions off.
 */
export interface MarkingAnnouncement {
  readonly marking: Marking;
  readonly markedCount: number;
  /** The tile the change came from, when it came from one. */
  readonly tileName?: string;
}

/** What to say when a marking changes. */
export function announceMarking({ marking, markedCount, tileName }: MarkingAnnouncement): string {
  const where = tileName === undefined ? '' : ` in ${tileName}`;

  /**
   * "0 items marked" is arithmetically right and reads as a failure. Clearing
   * is something the user did on purpose — Escape, a click on empty space —
   * so the announcement confirms the act rather than reporting a quantity.
   * The marking is still named, because four can be live at once and
   * "cleared" alone would leave them guessing which one went.
   */
  if (markedCount <= 0) return `${marking.name} cleared${where}`;

  const items = markedCount === 1 ? '1 item marked' : `${String(markedCount)} items marked`;

  return `${marking.name}: ${items}${where}`;
}

export interface MarkingAnnouncerProps {
  readonly message: string;
}

export function MarkingAnnouncer({ message }: MarkingAnnouncerProps) {
  return (
    /**
     * Rendered even when empty. A live region has to be in the document
     * *before* its text arrives — assistive technology watches the node, and a
     * region added at the same moment as its content is commonly not announced
     * at all. `aria-atomic` so "3 items" becoming "4 items" is read as a
     * sentence rather than as the word that changed.
     */
    <p
      className="visually-hidden"
      data-testid="marking-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </p>
  );
}
