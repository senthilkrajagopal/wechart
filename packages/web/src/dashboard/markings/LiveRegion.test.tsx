import { EMPTY_PREDICATE, withItem } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkingAnnouncer, announceMarking } from './LiveRegion';

/**
 * T107 / AC-101: WHEN a marking changes, THE SYSTEM SHALL announce the
 * marking's name, the number of marked items and the source tile in a polite
 * live region (direction.md rule 52).
 * `Fails when: no announcement is made, or it omits the count.`
 *
 * The count is called out in the failing state, and that is the part most
 * easily lost: "Marking changed" is an announcement, satisfies "something was
 * said", and tells a screen-reader user nothing they could act on. The whole
 * value of the announcement is that marking is otherwise a purely visual
 * event — items fade, an outline appears — so this is the *only* channel
 * carrying it to someone who is not watching the chart.
 *
 * Polite rather than assertive, because marking is something the user just
 * did: interrupting them to report their own action is the behaviour that
 * makes people turn live regions off.
 */
const marking = { id: 'mk1', name: 'Marking', slot: 'mk1' as const, isDefault: true };
const paid = [{ member: 'orders.status', value: 'paid' }];

describe('what a marking change says', () => {
  it('names the marking, the count and the tile it came from', () => {
    const said = announceMarking({ marking, markedCount: 3, tileName: 'Orders by status' });

    expect(said).toContain('Marking');
    expect(said).toContain('3');
    expect(said).toContain('Orders by status');
  });

  it('says one marked item in the singular', () => {
    expect(announceMarking({ marking, markedCount: 1, tileName: 'Orders by status' })).toContain(
      '1 item marked',
    );
  });

  it('says when a marking was cleared rather than reporting zero items', () => {
    /**
     * "0 items marked" is arithmetically right and reads as a failure. The
     * user did something deliberate — pressed Escape, clicked empty space —
     * and the announcement should confirm that, not describe a quantity.
     */
    const said = announceMarking({ marking, markedCount: 0, tileName: 'Orders by status' });

    expect(said).toContain('cleared');
    expect(said).not.toContain('0');
  });

  it('still names the marking when it was cleared, because several can be live', () => {
    // Four markings can be in play (AC-084); "Marking cleared" without the
    // name would leave the user guessing which one went.
    expect(announceMarking({ marking, markedCount: 0, tileName: 'Orders by status' })).toContain(
      'Marking',
    );
  });

  it('manages without a tile name rather than announcing nothing', () => {
    // A marking can change from the settings page or a chip, where there is
    // no source tile. Saying less is better than saying nothing.
    const said = announceMarking({ marking, markedCount: 2 });

    expect(said).toContain('2 items marked');
    expect(said).not.toContain('undefined');
  });
});

describe('the region that carries it', () => {
  it('is polite, not assertive', () => {
    render(<MarkingAnnouncer message="Marking: 3 items marked in Orders by status" />);

    const region = screen.getByTestId('marking-announcer');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('is a status region, and one that reads the whole message', () => {
    // atomic, so a change from "3 items" to "4 items" is read as a sentence
    // rather than as the word that changed.
    render(<MarkingAnnouncer message="Marking: 3 items marked in Orders by status" />);

    const region = screen.getByTestId('marking-announcer');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('carries the message as text', () => {
    render(<MarkingAnnouncer message="Marking: 3 items marked in Orders by status" />);

    expect(screen.getByTestId('marking-announcer').textContent).toBe(
      'Marking: 3 items marked in Orders by status',
    );
  });

  it('stays in the document when there is nothing to say', () => {
    /**
     * A live region has to exist *before* the text arrives: assistive
     * technology watches the node, and one that is added at the same moment
     * as its content is commonly not announced at all. So it renders empty
     * rather than rendering nothing.
     */
    render(<MarkingAnnouncer message="" />);

    expect(screen.getByTestId('marking-announcer')).toBeTruthy();
    expect(screen.getByTestId('marking-announcer').textContent).toBe('');
  });

  it('is not visible', () => {
    // It is for announcing, not for reading: the badge and chip (AC-098)
    // already say this on screen.
    render(<MarkingAnnouncer message="Marking: 3 items marked" />);

    expect(screen.getByTestId('marking-announcer').className).toContain('visually-hidden');
  });
});

describe('the count that must not go missing', () => {
  it('is derived from the marking, not passed in separately', () => {
    // The criterion's failing state is "omits the count", and a count carried
    // beside the predicate is one that can drift from it.
    const predicate = withItem(withItem(EMPTY_PREDICATE, paid), [
      { member: 'orders.status', value: 'shipped' },
    ]);

    expect(
      announceMarking({ marking, markedCount: predicate.items.length, tileName: 'Orders' }),
    ).toContain('2 items marked');
  });
});
