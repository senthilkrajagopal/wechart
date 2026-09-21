import { describe, expect, it } from 'vitest';

import { applyItemClick, isItemMarked } from './apply';
import { EMPTY_PREDICATE, withItem, withRange, type MarkedItem } from './predicate';

/**
 * T093 / AC-087: WHEN the user clicks an item in a tile that marks, THE SYSTEM
 * SHALL replace that marking with the clicked item; WHEN the user Ctrl-clicks
 * or ⌘-clicks, THE SYSTEM SHALL toggle that item and leave the rest
 * (direction.md rule 47).
 * `Fails when: a plain click adds to the marking, or a modified click replaces
 * it.`
 *
 * The two failing states are each other's opposite, which is what makes this
 * worth testing rather than reading: an implementation that got the modifier
 * backwards would behave perfectly for every single-item case and only go
 * wrong once something was already marked. So every case here starts from a
 * marking that already holds something.
 */
const paid: MarkedItem = [{ member: 'orders.status', value: 'paid' }];
const shipped: MarkedItem = [{ member: 'orders.status', value: 'shipped' }];
const refunded: MarkedItem = [{ member: 'orders.status', value: 'refunded' }];

const names = (items: readonly MarkedItem[]) => items.map((item) => item[0]?.value);

describe('clicking an item in a tile that marks', () => {
  describe('a plain click', () => {
    it('replaces what was marked', () => {
      const before = withItem(withItem(EMPTY_PREDICATE, paid), shipped);

      const after = applyItemClick(before, refunded, { toggle: false });

      expect(names(after.items)).toEqual(['refunded']);
    });

    it('replaces rather than adds even when the clicked item is already marked', () => {
      // Clicking something already marked narrows the marking to it. Treating
      // that as "no change" would make it impossible to get back to one item.
      const before = withItem(withItem(EMPTY_PREDICATE, paid), shipped);

      const after = applyItemClick(before, paid, { toggle: false });

      expect(names(after.items)).toEqual(['paid']);
    });

    it('clears marked ranges too, because replacing means replacing', () => {
      // A range left behind would go on marking rows the user just replaced.
      const before = withRange(withItem(EMPTY_PREDICATE, paid), {
        member: 'orders.count',
        from: 1,
        to: 9,
      });

      const after = applyItemClick(before, refunded, { toggle: false });

      expect(after.ranges).toEqual([]);
      expect(names(after.items)).toEqual(['refunded']);
    });
  });

  describe('a Ctrl-click or ⌘-click', () => {
    it('adds the item and leaves the rest', () => {
      const before = withItem(EMPTY_PREDICATE, paid);

      const after = applyItemClick(before, shipped, { toggle: true });

      expect(names(after.items)).toEqual(['paid', 'shipped']);
    });

    it('removes an item that was already marked, leaving the rest', () => {
      const before = withItem(withItem(EMPTY_PREDICATE, paid), shipped);

      const after = applyItemClick(before, paid, { toggle: true });

      expect(names(after.items)).toEqual(['shipped']);
    });

    it('keeps marked ranges, because toggling one item is not a fresh start', () => {
      const range = { member: 'orders.count', from: 1, to: 9 };
      const before = withRange(withItem(EMPTY_PREDICATE, paid), range);

      const after = applyItemClick(before, shipped, { toggle: true });

      expect(after.ranges).toEqual([range]);
    });

    it('can empty the marking by removing its last item', () => {
      // Nothing marked is a legitimate state — rule 47 reaches it another way
      // too, by clicking an empty plot area.
      const before = withItem(EMPTY_PREDICATE, paid);

      const after = applyItemClick(before, paid, { toggle: true });

      expect(after.items).toEqual([]);
    });

    it('starts a marking when nothing was marked', () => {
      const after = applyItemClick(EMPTY_PREDICATE, paid, { toggle: true });

      expect(names(after.items)).toEqual(['paid']);
    });
  });

  describe('recognising the item that was clicked', () => {
    it('matches a multi-member item however its parts are ordered', () => {
      /**
       * The parts come from whichever order a chart lists its dimensions, and
       * that is not a promise. Compared positionally, a toggle would fail to
       * find an item that is plainly marked and would add a duplicate — the
       * marking would then need two clicks to clear and would paint twice.
       */
      const asDrawn: MarkedItem = [
        { member: 'orders.status', value: 'paid' },
        { member: 'orders.category', value: 'Components' },
      ];
      const asClicked: MarkedItem = [
        { member: 'orders.category', value: 'Components' },
        { member: 'orders.status', value: 'paid' },
      ];

      expect(isItemMarked(withItem(EMPTY_PREDICATE, asDrawn), asClicked)).toBe(true);
      expect(
        applyItemClick(withItem(EMPTY_PREDICATE, asDrawn), asClicked, { toggle: true }).items,
      ).toEqual([]);
    });

    it('does not confuse two items that share a member value', () => {
      const paidComponents: MarkedItem = [
        { member: 'orders.status', value: 'paid' },
        { member: 'orders.category', value: 'Components' },
      ];
      const paidInstruments: MarkedItem = [
        { member: 'orders.status', value: 'paid' },
        { member: 'orders.category', value: 'Instruments' },
      ];

      expect(isItemMarked(withItem(EMPTY_PREDICATE, paidComponents), paidInstruments)).toBe(false);
    });

    it('treats the same member at different granularities as different items', () => {
      // March at month granularity is not 1 March at day granularity, even
      // where the values could be read as the same instant.
      const byMonth: MarkedItem = [
        { member: 'orders.created', granularity: 'month', value: '2026-03-01' },
      ];
      const byDay: MarkedItem = [
        { member: 'orders.created', granularity: 'day', value: '2026-03-01' },
      ];

      expect(isItemMarked(withItem(EMPTY_PREDICATE, byMonth), byDay)).toBe(false);
    });
  });
});
