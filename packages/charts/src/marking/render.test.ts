import { EMPTY_PREDICATE, withItem, type MarkedItem } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { MARKED_OUTLINE_PX, UNMARKED_OPACITY, markedItemStyle } from './render';

/**
 * T102 / AC-096: WHEN a tile shows a marking, THE SYSTEM SHALL draw marked
 * items in their own colour with an outline in the marking's colour and fade
 * unmarked items (direction.md rule 49).
 * `Fails when: unmarked items render at full strength, or marked items carry
 * no outline.`
 *
 * Three things have to be true at once and each is separately losable: the
 * item keeps **its own** colour (so a marking does not destroy the series
 * identity the legend promises), gains an outline in the **marking's** colour
 * (so two markings are told apart), and everything else **fades**.
 *
 * The case that matters most is the one the criterion does not mention:
 * nothing marked at all. Read naively, "fade unmarked items" fades every item
 * on a dashboard where nobody has marked anything — which is every dashboard,
 * most of the time.
 */
const paid: MarkedItem = [{ member: 'orders.status', value: 'paid' }];
const shipped: MarkedItem = [{ member: 'orders.status', value: 'shipped' }];

const rows = {
  paid: { 'orders.status': 'paid', 'orders.count': 3 },
  shipped: { 'orders.status': 'shipped', 'orders.count': 5 },
};

const marking = { predicate: withItem(EMPTY_PREDICATE, paid), colour: '#151107' };

describe('drawing a tile that shows a marking', () => {
  it('keeps a marked item in its own colour', () => {
    // The series colour is what the legend promised; a marking that repainted
    // it would break the legend's own contract (AC-039).
    const style = markedItemStyle(rows.paid, '#2a78d6', marking);

    expect(style.color).toBe('#2a78d6');
  });

  it('outlines a marked item in the marking’s colour', () => {
    const style = markedItemStyle(rows.paid, '#2a78d6', marking);

    expect(style.borderColor).toBe('#151107');
    expect(style.borderWidth).toBe(MARKED_OUTLINE_PX);
  });

  it('leaves a marked item at full strength', () => {
    expect(markedItemStyle(rows.paid, '#2a78d6', marking).opacity).toBe(1);
  });

  it('fades an unmarked item', () => {
    // The criterion's first failing state.
    const style = markedItemStyle(rows.shipped, '#eb6834', marking);

    expect(style.opacity).toBe(UNMARKED_OPACITY);
  });

  it('gives an unmarked item no outline', () => {
    // An outline on an unmarked item says it belongs to the marking, which is
    // the opposite of what is true.
    const style = markedItemStyle(rows.shipped, '#eb6834', marking);

    expect(style.borderWidth).toBe(0);
  });

  it('keeps an unmarked item in its own colour too', () => {
    // Faded, not greyed: which series it belongs to is still readable.
    expect(markedItemStyle(rows.shipped, '#eb6834', marking).color).toBe('#eb6834');
  });

  describe('when nothing is marked', () => {
    const nothing = { predicate: EMPTY_PREDICATE, colour: '#151107' };

    it('fades nothing', () => {
      /**
       * The case the criterion does not mention and the one that would be
       * most visible if it were wrong. "Fade unmarked items" taken literally
       * fades every item on a dashboard nobody has marked — which is most
       * dashboards, most of the time. An empty marking means the tile is not
       * showing a marking at all.
       */
      expect(markedItemStyle(rows.paid, '#2a78d6', nothing).opacity).toBe(1);
      expect(markedItemStyle(rows.shipped, '#eb6834', nothing).opacity).toBe(1);
    });

    it('outlines nothing', () => {
      expect(markedItemStyle(rows.paid, '#2a78d6', nothing).borderWidth).toBe(0);
    });
  });

  describe('two markings on one dashboard', () => {
    it('outlines each in its own colour', () => {
      // Four markings can be live at once (AC-084), and the outline is the
      // only thing saying which one an item belongs to.
      const second = { predicate: withItem(EMPTY_PREDICATE, shipped), colour: '#2d025e' };

      expect(markedItemStyle(rows.shipped, '#eb6834', second).borderColor).toBe('#2d025e');
    });
  });

  it('uses the values direction.md fixes, not ones invented at the call site', () => {
    // Both are stated in direction.md (opacity 0.28, outline 1.5 px) and both
    // are noted there as derived by us rather than taken from Spotfire — so
    // they belong in one place rather than being spelled out per chart type.
    expect(UNMARKED_OPACITY).toBe(0.28);
    expect(MARKED_OUTLINE_PX).toBe(1.5);
  });
});
