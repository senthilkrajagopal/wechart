/**
 * A dashboard's markings, and the three rules that always hold of them
 * (AC-084, direction.md rules 43 and 57).
 *
 * - at least one marking
 * - exactly one of them is the default
 * - at most one per colour slot, and there are four slots
 *
 * They are invariants, not validations run at the door. Every function here
 * takes a valid set and returns a valid set, so a dashboard is never briefly
 * without a default while something else is being decided — which matters
 * because rule 43 says new chart tiles use the default, so a moment without
 * one is a moment when a new tile has nothing to mark with.
 *
 * The cap is four because direction.md defines four marking colours, mk1 to
 * mk4 ("Four slots exist"), each validated against every series colour. A
 * fifth marking would have no colour to be, which is the real constraint —
 * so `MAX_MARKINGS` is derived from the slots rather than written as a 4.
 */
export const MARKING_SLOTS = ['mk1', 'mk2', 'mk3', 'mk4'] as const;

export type MarkingSlot = (typeof MARKING_SLOTS)[number];

export const MAX_MARKINGS = MARKING_SLOTS.length;

export interface Marking {
  readonly id: string;
  readonly name: string;
  /** Which of direction.md's four marking colours this one wears. */
  readonly slot: MarkingSlot;
  /** Exactly one marking in a dashboard has this set. */
  readonly isDefault: boolean;
}

/** direction.md rule 57: one marking named "Marking", set as the default. */
export function defaultMarkings(): readonly Marking[] {
  return [{ id: 'mk1', name: 'Marking', slot: 'mk1', isDefault: true }];
}

/** Whether there is a free colour slot for another marking. */
export function canAddMarking(markings: readonly Marking[]): boolean {
  return freeSlot(markings) !== undefined;
}

const freeSlot = (markings: readonly Marking[]): MarkingSlot | undefined =>
  MARKING_SLOTS.find((slot) => !markings.some((marking) => marking.slot === slot));

/**
 * One more marking, in the first free colour slot.
 *
 * Refused by returning what it was given, the way `moveTile` refuses a move it
 * cannot make: the caller compares identity rather than catching. A throw here
 * would make "the button is disabled" and "the model refuses" two different
 * mechanisms for one rule.
 */
export function addMarking(markings: readonly Marking[], name?: string): readonly Marking[] {
  const slot = freeSlot(markings);
  if (slot === undefined) return markings;

  return [
    ...markings,
    {
      id: slot,
      // Named after its slot by default, so the list stays readable without
      // asking the user to name something before they have used it.
      name: name ?? `Marking ${String(markings.length + 1)}`,
      slot,
      // Adding a marking is not a decision about which one new tiles use.
      isDefault: markings.length === 0,
    },
  ];
}

/**
 * One fewer marking, with the default moved if it was the one removed.
 *
 * Removing the last is refused: "at least one marking" is half the criterion,
 * and deleting is the only way to reach zero.
 */
export function removeMarking(markings: readonly Marking[], id: string): readonly Marking[] {
  if (markings.length <= 1) return markings;

  const left = markings.filter((marking) => marking.id !== id);
  if (left.length === markings.length) return markings;

  return withOneDefault(left);
}

/** The same markings with a different one as the default, and only one. */
export function setDefaultMarking(markings: readonly Marking[], id: string): readonly Marking[] {
  if (!markings.some((marking) => marking.id === id)) return markings;

  return markings.map((marking) => ({ ...marking, isDefault: marking.id === id }));
}

/**
 * Markings as they came back from the database, made to hold the invariants.
 *
 * A repair rather than a throw. These are persisted, so they can arrive
 * violating every rule here — hand-edited, or written by a build that did not
 * have them — and a dashboard whose markings are wrong is otherwise a
 * perfectly good dashboard. Refusing to open it would lose more than the
 * markings.
 */
export function markingsFrom(stored: readonly Marking[] | undefined): readonly Marking[] {
  if (stored === undefined || stored.length === 0) return defaultMarkings();

  // One per slot, and never more than there are slots.
  const seen = new Set<MarkingSlot>();
  const kept = stored.filter((marking) => {
    if (seen.has(marking.slot)) return false;
    seen.add(marking.slot);
    return true;
  });

  return kept.length === 0 ? defaultMarkings() : withOneDefault(kept);
}

/** Exactly one default: the first that claims it, or the first there is. */
function withOneDefault(markings: readonly Marking[]): readonly Marking[] {
  const chosen = markings.find((marking) => marking.isDefault) ?? markings[0];

  return markings.map((marking) => ({ ...marking, isDefault: marking.id === chosen?.id }));
}

/**
 * What is wrong with a set of markings, in words, or nothing when they hold.
 *
 * Exists so the rules have one statement that both the repair above and any
 * test can point at, rather than each restating them.
 */
export function problemsWith(markings: readonly Marking[]): readonly string[] {
  const problems: string[] = [];
  const defaults = markings.filter((marking) => marking.isDefault);

  if (markings.length === 0) problems.push('no markings');
  if (markings.length > MAX_MARKINGS) problems.push(`more than ${String(MAX_MARKINGS)} markings`);
  if (markings.length > 0 && defaults.length === 0) problems.push('no default marking');
  if (defaults.length > 1) problems.push('more than one default marking');

  const slots = new Set(markings.map((marking) => marking.slot));
  if (slots.size !== markings.length) problems.push('two markings in one colour slot');

  return problems;
}
