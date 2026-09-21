import { EMPTY_PREDICATE, withItem, withRange } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import type { Tile } from '../model/document';
import { clearTileMarking } from './clear';
import { markingOf, withMarking, type MarkingState } from './store';

/**
 * T100 / AC-094: WHEN the user clicks an empty plot area, or presses Escape on
 * a focused tile, THE SYSTEM SHALL unmark that tile's marking and leave other
 * markings unchanged.
 * `Fails when: another marking is cleared, or the marking survives.`
 *
 * The two failing states are opposite over-reaches: clearing too much and
 * clearing too little. Four markings can be live at once (AC-084), so "unmark"
 * has to mean one of them — the one *this tile* marks with — and a dashboard
 * where Escape wiped every marking would be one nobody would risk pressing
 * Escape on.
 *
 * direction.md draws the distinction this criterion rests on: Escape unmarks
 * all markings, but "Esc on a focused tile unmarks its marking". AC-094 is the
 * focused case; the global one has no criterion and is not built.
 */
const tile = (marksWith?: string): Tile => ({
  id: 't1',
  kind: 'chart',
  w: 6,
  h: 40,
  ...(marksWith === undefined ? {} : { marksWith }),
});

const paid = [{ member: 'orders.status', value: 'paid' }];
const shipped = [{ member: 'orders.status', value: 'shipped' }];

const both = (): MarkingState =>
  withMarking(
    withMarking({}, 'mk1', withItem(EMPTY_PREDICATE, paid)),
    'mk2',
    withItem(EMPTY_PREDICATE, shipped),
  );

describe('unmarking from a tile', () => {
  it('clears the marking that tile marks with', () => {
    // The criterion's second failing state: the marking must not survive.
    const after = clearTileMarking(both(), tile('mk1'));

    expect(markingOf(after, 'mk1')).toEqual(EMPTY_PREDICATE);
  });

  it('leaves every other marking exactly as it was', () => {
    // The first failing state, and the one that would make Escape frightening.
    const after = clearTileMarking(both(), tile('mk1'));

    expect(markingOf(after, 'mk2').items).toEqual([shipped]);
  });

  it('clears ranges as well as items, because unmark means unmark', () => {
    // A range left behind would go on marking rows after the user asked for
    // nothing to be marked.
    const state = withMarking(
      {},
      'mk1',
      withRange(EMPTY_PREDICATE, {
        member: 'orders.count',
        from: 1,
        to: 9,
      }),
    );

    expect(markingOf(clearTileMarking(state, tile('mk1')), 'mk1')).toEqual(EMPTY_PREDICATE);
  });

  it('does nothing for a tile that marks with nothing', () => {
    /**
     * A "(None)" tile cannot be marked (direction.md rule 44), so it has no
     * marking to clear — and clearing something would mean picking one, which
     * is exactly the over-reach the criterion forbids.
     */
    const before = both();

    const after = clearTileMarking(before, tile(undefined));

    expect(after).toBe(before);
  });

  it('does nothing when that marking is already empty', () => {
    // Returned by identity, so pressing Escape twice is not two changes for
    // anything downstream to react to.
    const state = withMarking({}, 'mk1', EMPTY_PREDICATE);

    expect(clearTileMarking(state, tile('mk1'))).toBe(state);
  });

  it('does not mutate the state it was given', () => {
    const before = both();

    clearTileMarking(before, tile('mk1'));

    expect(markingOf(before, 'mk1').items).toEqual([paid]);
  });
});
