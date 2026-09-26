import { describe, expect, it } from 'vitest';

import {
  MARKING_SLOTS,
  MAX_MARKINGS,
  addMarking,
  canAddMarking,
  defaultMarkings,
  markingModeOf,
  markingsFrom,
  problemsWith,
  setMarkingMode,
  removeMarking,
  renameMarking,
  setDefaultMarking,
  setMarkingSlot,
  type Marking,
} from './model';

/**
 * T090 / AC-084: THE SYSTEM SHALL give every dashboard at least one marking and
 * exactly one default marking, and SHALL allow at most four markings per
 * dashboard (direction.md rules 43, 57).
 * `Fails when: a dashboard has no default marking, or a fifth marking can be
 * created.`
 *
 * Three invariants, and they are invariants rather than checks run at the
 * door: a dashboard is never briefly without a default while something else
 * is decided. So every operation here is tested for what it does to all three,
 * not only for the one it is about — deleting a marking is where "exactly one
 * default" is most easily lost, and it is not the operation anyone thinks of
 * as being about defaults.
 *
 * The cap is four because direction.md defines four marking colour slots,
 * mk1 to mk4 (its token table, "Four slots exist"). A fifth marking would have
 * no colour, which is the real constraint; `MAX_MARKINGS` is derived from the
 * slots rather than written as a 4 so the two cannot drift.
 */
const named = (markings: readonly Marking[]) => markings.map((marking) => marking.name);
const defaults = (markings: readonly Marking[]) => markings.filter((marking) => marking.isDefault);

/** Fill every slot, so the next add is the one the criterion forbids. */
const full = () => {
  let markings = defaultMarkings();
  while (canAddMarking(markings)) markings = addMarking(markings);
  return markings;
};

describe('a dashboard’s markings', () => {
  it('starts with one marking, named as direction.md names it, and it is the default', () => {
    const markings = defaultMarkings();

    expect(markings).toHaveLength(1);
    expect(markings[0]?.name).toBe('Marking');
    expect(markings[0]?.isDefault).toBe(true);
    expect(markings[0]?.slot).toBe('mk1');
  });

  it('caps at one marking per colour slot', () => {
    const markings = full();

    expect(markings).toHaveLength(MAX_MARKINGS);
    expect(MAX_MARKINGS).toBe(MARKING_SLOTS.length);
    // Every slot used once: a fifth marking is impossible because there is no
    // fifth colour for it, not because of a number written down somewhere.
    expect(new Set(markings.map((marking) => marking.slot)).size).toBe(MAX_MARKINGS);
  });

  it('refuses a fifth, which is the criterion’s failing state', () => {
    const markings = full();

    expect(canAddMarking(markings)).toBe(false);
    // Refused by returning what it was given, the way the dashboard model
    // refuses a move it cannot make: the caller compares identity.
    expect(addMarking(markings)).toBe(markings);
  });

  it('keeps exactly one default as markings are added', () => {
    let markings = defaultMarkings();
    markings = addMarking(markings);
    markings = addMarking(markings);

    expect(markings).toHaveLength(3);
    expect(defaults(markings)).toHaveLength(1);
    // The first one stays the default: adding a marking is not a decision
    // about which one new tiles use (rule 43).
    expect(defaults(markings)[0]?.name).toBe('Marking');
  });

  it('moves the default when the default is the one deleted', () => {
    /**
     * The case where "exactly one default" is most easily lost, because
     * deleting is not an operation anyone thinks of as being about defaults.
     * Without this the dashboard is left with markings and no default, and
     * every new chart tile has nothing to mark with (rule 43).
     */
    let markings = addMarking(defaultMarkings());
    const first = markings[0];
    if (first === undefined) throw new Error('fixture');

    markings = removeMarking(markings, first.id);

    expect(markings).toHaveLength(1);
    expect(defaults(markings)).toHaveLength(1);
  });

  it('refuses to delete the last marking', () => {
    const markings = defaultMarkings();
    const only = markings[0];
    if (only === undefined) throw new Error('fixture');

    // "At least one marking" is the other half of the criterion, and deleting
    // is the only way to reach zero.
    expect(removeMarking(markings, only.id)).toBe(markings);
  });

  it('frees the slot a deleted marking held, so the fifth add is not permanent', () => {
    const before = full();
    const last = before[before.length - 1];
    if (last === undefined) throw new Error('fixture');

    const after = addMarking(removeMarking(before, last.id));

    expect(after).toHaveLength(MAX_MARKINGS);
    expect(new Set(after.map((marking) => marking.slot)).size).toBe(MAX_MARKINGS);
  });

  it('moves the default rather than adding a second one', () => {
    let markings = addMarking(defaultMarkings());
    const second = markings[1];
    if (second === undefined) throw new Error('fixture');

    markings = setDefaultMarking(markings, second.id);

    expect(defaults(markings)).toHaveLength(1);
    expect(defaults(markings)[0]?.id).toBe(second.id);
  });

  it('gives each marking a distinct name, so the list can be read', () => {
    const markings = full();

    expect(new Set(named(markings)).size).toBe(markings.length);
  });

  describe('reading what was stored', () => {
    it('repairs a dashboard stored with no default', () => {
      /**
       * Markings are persisted, so they arrive from the database and can
       * violate every invariant here — hand-edited, or written by a build that
       * did not have this rule. Rendering a dashboard whose tiles have no
       * default to mark with is the failure this prevents, and it has to be a
       * repair rather than a throw: the dashboard is otherwise fine.
       */
      const stored = [
        { id: 'a', name: 'One', slot: 'mk1' as const, isDefault: false },
        { id: 'b', name: 'Two', slot: 'mk2' as const, isDefault: false },
      ];

      const read = markingsFrom(stored);

      expect(defaults(read)).toHaveLength(1);
      expect(read).toHaveLength(2);
    });

    it('repairs a dashboard stored with several defaults', () => {
      const stored = [
        { id: 'a', name: 'One', slot: 'mk1' as const, isDefault: true },
        { id: 'b', name: 'Two', slot: 'mk2' as const, isDefault: true },
      ];

      const read = markingsFrom(stored);

      expect(defaults(read)).toHaveLength(1);
      expect(defaults(read)[0]?.id).toBe('a');
    });

    it('repairs a dashboard stored with none at all', () => {
      expect(markingsFrom([])).toEqual(defaultMarkings());
      expect(markingsFrom(undefined)).toEqual(defaultMarkings());
    });

    it('drops the ones past the fourth rather than failing to open', () => {
      const stored = [
        ...full(),
        { id: 'x', name: 'Fifth', slot: 'mk1' as const, isDefault: false },
      ];

      expect(markingsFrom(stored)).toHaveLength(MAX_MARKINGS);
    });
  });

  describe('the invariants themselves', () => {
    it('reports a set with no default', () => {
      const broken = [{ id: 'a', name: 'One', slot: 'mk1' as const, isDefault: false }];

      expect(problemsWith(broken)).toContain('no default marking');
    });

    it('reports a set with more than one default', () => {
      const broken = [
        { id: 'a', name: 'One', slot: 'mk1' as const, isDefault: true },
        { id: 'b', name: 'Two', slot: 'mk2' as const, isDefault: true },
      ];

      expect(problemsWith(broken)).toContain('more than one default marking');
    });

    it('reports an empty set and an over-full one', () => {
      expect(problemsWith([])).toContain('no markings');
      expect(
        problemsWith([...full(), { id: 'x', name: 'Fifth', slot: 'mk1', isDefault: false }]),
      ).toContain('more than 4 markings');
    });

    it('finds nothing wrong with a set this module built', () => {
      // The positive control: every case above asserts a problem is found, and
      // a `problemsWith` that always complained would satisfy all of them.
      expect(problemsWith(defaultMarkings())).toEqual([]);
      expect(problemsWith(full())).toEqual([]);
    });
  });
});

/**
 * T218 / AC-198: … let the user add a marking (up to four), rename, recolour,
 * delete and make one the default …
 *
 * Recolouring keeps "one per colour" (direction.md's four validated slots):
 * choosing a colour another marking wears swaps the two.
 */
describe('renaming and recolouring a marking (AC-198)', () => {
  it('renames one marking and no other', () => {
    const two = addMarking(defaultMarkings());
    expect(named(renameMarking(two, 'mk2', 'Region'))).toEqual(['Marking', 'Region']);
  });

  it('recolours to a free colour, and swaps with the marking that wears a taken one', () => {
    const two = addMarking(defaultMarkings());
    const free = setMarkingSlot(two, 'mk1', 'mk3');
    expect(free.map((marking) => marking.slot)).toEqual(['mk3', 'mk2']);

    const swapped = setMarkingSlot(two, 'mk1', 'mk2');
    expect(swapped.map((marking) => marking.slot)).toEqual(['mk2', 'mk1']);
    expect(problemsWith(swapped)).toEqual([]);
  });

  it('gives a new marking an id no marking has, even after recolouring', () => {
    // mk1 recoloured to mk2 frees mk1's colour, but its id stays "mk1".
    const moved = setMarkingSlot(defaultMarkings(), 'mk1', 'mk2');
    const added = addMarking(moved);
    const ids = added.map((marking) => marking.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(added.map((marking) => marking.slot)).toEqual(['mk2', 'mk1']);
  });

  it('takes an id from the caller, so a deleted marking’s id is never worn again (T218’s review)', () => {
    const added = addMarking(defaultMarkings(), undefined, 'mk-fresh');
    expect(added[1]?.id).toBe('mk-fresh');
  });

  it('names a new marking with a name no marking has', () => {
    // "Marking 2" deleted from three: the next is not a second "Marking 3".
    const three = addMarking(addMarking(defaultMarkings()));
    const left = removeMarking(three, three[1]?.id ?? '');
    expect(named(addMarking(left))).toEqual(['Marking', 'Marking 3', 'Marking 4']);
  });
});

/**
 * T386, AC-093: WHILE a marking is in range mode, a drag along an axis marks a
 * continuous range (references-markings.md: Spotfire's "Marking mode >
 * Range-based", set per marking).
 */
describe('a marking’s mode (T386, AC-093)', () => {
  it('marks items until set to range mode, one marking at a time', () => {
    const two = addMarking(defaultMarkings());
    expect(two.map(markingModeOf)).toEqual(['items', 'items']);

    const ranged = setMarkingMode(two, 'mk2', 'range');
    expect(ranged.map(markingModeOf)).toEqual(['items', 'range']);
    expect(problemsWith(ranged)).toEqual([]);

    // And back: items is no mode stored at all, as a marking made before modes.
    const back = setMarkingMode(ranged, 'mk2', 'items');
    expect(back[1]).toEqual(two[1]);
  });

  it('keeps its mode when it is renamed or recoloured', () => {
    const ranged = setMarkingMode(defaultMarkings(), 'mk1', 'range');
    expect(markingModeOf(renameMarking(ranged, 'mk1', 'Periods')[0]!)).toBe('range');
    expect(markingModeOf(setMarkingSlot(ranged, 'mk1', 'mk3')[0]!)).toBe('range');
  });
});
