import { describe, expect, it } from 'vitest';

import { applyToggleOrAdd } from './apply';
import { EMPTY_PREDICATE, withItem, withRange, type MarkedItem } from './predicate';

/**
 * T095 / AC-089: WHEN the user Ctrl-drags or ⌘-drags a shape, THE SYSTEM SHALL
 * toggle the enclosed items when all or none of them are marked, and otherwise
 * add them (direction.md rule 47).
 * `Fails when: a Ctrl-drag over a partly marked set unmarks items instead of
 * adding them.`
 *
 * Spotfire's ToggleOrAdd, quoted in `references-markings.md` from the Mods
 * API: it "will behave like toggle if all or no rows in the set are marked,
 * otherwise it is an add operation."
 *
 * **Two of the three cases look identical from outside, which is the trap.**
 * With none marked, toggling marks them all; with some marked, adding marks
 * them all. Both end with everything marked, so an implementation that simply
 * toggled each item one by one passes both — and then fails the third, where
 * it unmarks exactly the items the user had already collected. That third case
 * is the criterion's failing state, and it is the only one that tells the two
 * implementations apart.
 */
const item = (status: string): MarkedItem => [{ member: 'orders.status', value: status }];

const paid = item('paid');
const shipped = item('shipped');
const refunded = item('refunded');

const names = (predicate: { items: readonly MarkedItem[] }) =>
  predicate.items.map((one) => one[0]?.value).sort();

describe('Ctrl-dragging a shape over some items', () => {
  it('marks them all when none of them were marked', () => {
    const after = applyToggleOrAdd(withItem(EMPTY_PREDICATE, refunded), [paid, shipped]);

    expect(names(after)).toEqual(['paid', 'refunded', 'shipped']);
  });

  it('unmarks them all when every one of them was marked', () => {
    // The toggle half. This is the only case that distinguishes ToggleOrAdd
    // from a plain add, so it is the one that keeps the name honest.
    const before = withItem(withItem(withItem(EMPTY_PREDICATE, paid), shipped), refunded);

    const after = applyToggleOrAdd(before, [paid, shipped]);

    expect(names(after)).toEqual(['refunded']);
  });

  it('adds the rest when only some of them were marked, and unmarks nothing', () => {
    /**
     * The criterion's failing state, and the case a per-item toggle gets
     * wrong: it would unmark `paid` — the very item the user had already
     * collected — while marking `shipped`. Dragging over a group to gather it
     * would then quietly scatter half of it.
     */
    const before = withItem(EMPTY_PREDICATE, paid);

    const after = applyToggleOrAdd(before, [paid, shipped]);

    expect(names(after)).toEqual(['paid', 'shipped']);
  });

  it('leaves everything alone when the shape enclosed nothing', () => {
    // An empty set is vacuously "all marked" and vacuously "none marked", so
    // the rule has to say which. Doing nothing is the only answer that does
    // not destroy a marking because someone dragged over blank space.
    const before = withItem(withItem(EMPTY_PREDICATE, paid), shipped);

    const after = applyToggleOrAdd(before, []);

    expect(names(after)).toEqual(['paid', 'shipped']);
    expect(after).toBe(before);
  });

  it('keeps marked ranges, because a Ctrl-drag adjusts rather than restarts', () => {
    // Same reasoning as a Ctrl-click: the modifier means "and also", so what
    // was already marked by a range stays marked.
    const range = { member: 'orders.count', from: 1, to: 9 };
    const before = withRange(withItem(EMPTY_PREDICATE, paid), range);

    const after = applyToggleOrAdd(before, [shipped]);

    expect(after.ranges).toEqual([range]);
  });

  it('does not add the same item twice when it is enclosed twice', () => {
    // A shape can enclose two representations of one item — a stacked bar and
    // its label, say. Marked twice, it would need two toggles to clear.
    const after = applyToggleOrAdd(EMPTY_PREDICATE, [paid, paid, shipped]);

    expect(names(after)).toEqual(['paid', 'shipped']);
  });

  it('recognises enclosed items whose parts come in a different order', () => {
    // The same reason `applyItemClick` compares parts as sets: the order is
    // whatever order a chart listed its dimensions in.
    const asDrawn: MarkedItem = [
      { member: 'orders.status', value: 'paid' },
      { member: 'orders.category', value: 'Components' },
    ];
    const asEnclosed: MarkedItem = [
      { member: 'orders.category', value: 'Components' },
      { member: 'orders.status', value: 'paid' },
    ];

    // All of them marked, so this toggles: the item comes off rather than
    // being added a second time.
    const after = applyToggleOrAdd(withItem(EMPTY_PREDICATE, asDrawn), [asEnclosed]);

    expect(after.items).toEqual([]);
  });
});
