import { EMPTY_PREDICATE, limitingMarkings, withItem } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  allLimitsEmpty,
  defaultNothingMarkedMessage,
  NothingMarked,
  NOTHING_MARKED_DEFAULT,
} from './NothingMarked';

/**
 * T115 / AC-109: WHEN every marking limiting a tile is empty, THE SYSTEM SHALL
 * show the tile's nothing-marked state: all data, an empty visualization, or a
 * message on an empty background, as set on the tile (direction.md rule 33).
 * `Fails when: the tile shows a state other than the one configured.`
 *
 * This is the decision T113 deliberately refused to make. `limitRowsBy`
 * returns *every* row when nothing is marked anywhere, precisely so that this
 * setting can choose — returning none there would have made "All data"
 * impossible to implement.
 *
 * **Message is the default**, a user decision of 2026-09-19 recorded in
 * direction.md. That matters more than it looks: a details tile that silently
 * showed everything would be read as unfiltered data, and one that silently
 * showed nothing as a broken tile. Saying "nothing is marked in X" is the only
 * state that explains itself.
 *
 * The message itself is *stored on the tile*, not composed here. Rule 58 (and
 * §7a) call it "pre-filled with the master tiles' names" — rule 33 lists only
 * the three options — and pre-filled text is text the user can then edit.
 * Composing it at render would quietly discard that edit, so this file tests
 * the two halves separately: the component renders what the tile holds, and
 * `defaultNothingMarkedMessage` supplies the pre-fill that T116 (AC-110)
 * writes into a newly limited tile.
 *
 * **Scope note.** Nothing in this file demonstrates AC-110, which needs its
 * own trigger (a tile being limited for the first time), nor AC-109 end to
 * end, which needs a tile that stores the setting and a renderer that reads
 * it. These tests cover the component and the pre-fill only.
 */
const paid = withItem(EMPTY_PREDICATE, [{ member: 'orders.status', value: 'paid' }]);

describe('when the nothing-marked state applies', () => {
  it('applies when every limiting marking is empty', () => {
    expect(allLimitsEmpty([EMPTY_PREDICATE, EMPTY_PREDICATE])).toBe(true);
  });

  it('does not apply when one of them holds something', () => {
    /**
     * The other half of T113's skip-empty rule. One non-empty marking limits
     * the tile normally; the nothing-marked state is for when there is nothing
     * at all to follow.
     */
    expect(allLimitsEmpty([EMPTY_PREDICATE, paid])).toBe(false);
  });

  it('does not apply to a tile that no marking limits', () => {
    // An unlimited tile is not waiting on anything, so it has no
    // nothing-marked state to be in.
    expect(allLimitsEmpty([])).toBe(false);
  });

  it('is false for the output of core’s limitingMarkings, which is the trap', () => {
    /**
     * `limitingMarkings` keeps only the *non-empty* markings, so the natural
     * composition `allLimitsEmpty(limitingMarkings(xs))` can never be true and
     * the nothing-marked state would simply never appear — a silent failure
     * with no error to trace. Pinned here so the two functions cannot drift
     * into looking composable.
     */
    expect(allLimitsEmpty(limitingMarkings([EMPTY_PREDICATE, EMPTY_PREDICATE]))).toBe(false);
    expect(allLimitsEmpty(limitingMarkings([EMPTY_PREDICATE, paid]))).toBe(false);
  });
});

describe('what the tile shows', () => {
  it('defaults to the message, as the user decided', () => {
    /**
     * A regression guard on a user decision (2026-09-19, rule 58), not a
     * demonstration: it asserts a constant against the literal it is declared
     * with. What AC-110 actually requires — that a tile *first limited* gets
     * this state — is T116's to demonstrate.
     */
    expect(NOTHING_MARKED_DEFAULT).toBe('message');
  });

  it('renders the message the tile holds, not one it composes', () => {
    /**
     * The point of the split. A user who rewrote the pre-filled text must see
     * their own words; a component that rebuilt the sentence from the master
     * names would overwrite them on every render and the edit would look like
     * it had not saved.
     */
    render(<NothingMarked state="message" message="Pick a region on the map first." />);

    expect(screen.getByTestId('nothing-marked').textContent).toBe(
      'Pick a region on the map first.',
    );
  });

  it('shows an empty visualisation with no message when that is the setting', () => {
    // The state set on the tile wins over the message it happens to hold, so
    // a tile switched to "Empty visualization" does not leak its old text.
    render(<NothingMarked state="empty" message="Nothing is marked in Orders by status." />);

    expect(screen.getByTestId('nothing-marked-empty')).toBeTruthy();
    expect(screen.queryByTestId('nothing-marked')).toBeNull();
  });

  it('renders nothing at all for "all data", leaving the tile to draw', () => {
    /**
     * The criterion's failing state is showing a state other than the one
     * configured, and "All data" means the tile draws normally — so this
     * component must get out of the way entirely rather than render an empty
     * wrapper the tile then has to reason about.
     */
    const { container } = render(
      <NothingMarked state="all" message="Nothing is marked in Orders by status." />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('keeps the three states distinct given identical input', () => {
    // Each renders something the others do not, so a tile set to one cannot be
    // mistaken for a tile set to another.
    const message = 'Nothing is marked in Orders by status.';

    const { container: all } = render(<NothingMarked state="all" message={message} />);
    expect(all.firstChild).toBeNull();

    const { container: empty } = render(<NothingMarked state="empty" message={message} />);
    expect(empty.textContent).toBe('');

    const { container: shown } = render(<NothingMarked state="message" message={message} />);
    expect(shown.textContent).toBe(message);
  });
});

describe('the pre-filled message', () => {
  it('names the master tiles', () => {
    /**
     * "Pre-filled with the master tiles' names" (rule 58). Without them the
     * message says a thing is waiting and not what to do about it — and the
     * tile the user must go and click may be on another page tab.
     */
    const message = defaultNothingMarkedMessage(['Orders by status', 'Revenue by region']);

    expect(message).toContain('Orders by status');
    expect(message).toContain('Revenue by region');
  });

  it('still reads as a sentence when the master tiles have no names', () => {
    /**
     * The branch is reachable: a tile keeps its `limitedBy` when the master
     * tile is deleted, and a marking no tile marks with is legal.
     *
     * Asserting the exact string rather than the absence of "in ." — the
     * earlier negative assertion passed happily on "Nothing is marked. Mark
     * something there to fill this tile.", where "there" points at nothing.
     * A test that can only see a malformed sentence cannot see an unreadable
     * one.
     */
    expect(defaultNothingMarkedMessage([])).toBe(
      'Nothing is marked yet. Mark something in a master tile to fill this tile.',
    );
  });

  it('never says "there" without naming somewhere', () => {
    // The word is only safe once the names precede it.
    const nameless = defaultNothingMarkedMessage([]);

    expect(nameless).not.toContain('there');
    expect(defaultNothingMarkedMessage(['Orders by status'])).toContain('there');
  });

  it('is never empty, which AC-110 names as its failing state', () => {
    // AC-110 `Fails when: … the message is empty`. T116 stores whatever this
    // returns, so an empty return here would be that failure. This does not
    // demonstrate AC-110 — that needs T116's trigger, a tile being limited
    // for the first time.
    expect(defaultNothingMarkedMessage([]).trim().length).toBeGreaterThan(0);
    expect(defaultNothingMarkedMessage(['Orders by status']).trim().length).toBeGreaterThan(0);
  });
});
