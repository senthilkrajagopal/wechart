import { EMPTY_PREDICATE, withItem, withRange } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarkBadge } from './MarkBadge';
import { MarkChip, summariseMarking } from './MarkChip';
import { shareShownOf, showsShareOnly } from './markedValues';

/**
 * T104 / AC-098: THE SYSTEM SHALL convey marking state by more than colour:
 * every tile using a non-empty marking shows a badge naming the marking and
 * the number of marked items, and every non-empty marking has a chip naming it
 * and summarising its values (direction.md rule 50).
 * `Fails when: a tile or chip conveys the marking only through colour.`
 *
 * This criterion is load-bearing for the palette, not just good manners.
 * direction.md's colour audit records that dark-mode `mk1`↔`mk4` sit at ΔE 6.8
 * under colour-blindness simulation — inside the 6–8 floor band, which is
 * "legal only with secondary encoding, which chips and badges provide by
 * always naming the marking". Without this, the marking colours themselves
 * stop being defensible.
 *
 * So every assertion here is about **text**, and the swatch is checked to be
 * decorative: a screen reader that ignored every colour must still learn which
 * marking is in play and how much is marked.
 */
const paid = [{ member: 'orders.status', value: 'paid' }];
const shipped = [{ member: 'orders.status', value: 'shipped' }];

const marking = { id: 'mk1', name: 'Marking', slot: 'mk1' as const, isDefault: true };

describe('the badge on a tile that uses a marking', () => {
  it('names the marking and says how many items are marked', () => {
    render(<MarkBadge marking={marking} colour="#151107" markedCount={3} />);

    const badge = screen.getByTestId('mark-badge');
    expect(badge.textContent).toContain('Marking');
    expect(badge.textContent).toContain('3 marked');
  });

  it('groups a count in the thousands, as the limit it is measured against is written', () => {
    render(<MarkBadge marking={marking} colour="#151107" markedCount={1500} />);

    expect(screen.getByTestId('mark-badge').textContent).toContain('1,500 marked');
  });

  it('counts one item in the singular, because "1 marked items" reads as a bug', () => {
    render(<MarkBadge marking={marking} colour="#151107" markedCount={1} />);

    expect(screen.getByTestId('mark-badge').textContent).toContain('1 marked');
  });

  it('keeps the swatch decorative, so the text carries the meaning', () => {
    /**
     * The swatch is the colour, and colour is exactly what this criterion says
     * cannot be the only carrier. Announced as well as drawn, a screen reader
     * would read a colour name and learn nothing.
     */
    render(<MarkBadge marking={marking} colour="#151107" markedCount={3} />);

    expect(screen.getByTestId('mark-swatch').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows nothing at all when nothing is marked', () => {
    // Rule 50 is about tiles using a *non-empty* marking. A badge reading
    // "0 marked" on every tile of an untouched dashboard is noise.
    render(<MarkBadge marking={marking} colour="#151107" markedCount={0} />);

    expect(screen.queryByTestId('mark-badge')).toBeNull();
  });
});

/**
 * T935 / AC-098 (R81): … From R81, a tile whose items are all only partly
 * marked (a graphical table, waterfall, histogram or 100 % stack showing
 * another tile's marked share) SHALL show "● ‹marking summary›'s share
 * shown", such as "● EMEA's share shown", in place of a count of 0.
 * `Fails when: … a tile whose items are all partly marked shows "0 marked",
 * or no share line.`
 */
describe('a tile that only shows a marking’s share (AC-098, R81)', () => {
  const emea = withItem(EMPTY_PREDICATE, [{ member: 'orders.region', value: 'EMEA' }]);

  it('says whose share it shows, and never a count', () => {
    render(
      <MarkBadge
        marking={marking}
        colour="#151107"
        markedCount={1}
        shareShown={shareShownOf(emea)}
      />,
    );
    const badge = screen.getByTestId('mark-badge');
    // In the spec's words, its apostrophe as written there (AC-098).
    expect(badge.textContent).toBe("Marking: EMEA's share shown");
    expect(badge.textContent).not.toMatch(/\d+ marked/);
    // The swatch still decorative: the words carry it.
    expect(screen.getByTestId('mark-swatch').getAttribute('aria-hidden')).toBe('true');
  });

  it('still counts on a tile with a whole item marked', () => {
    render(<MarkBadge marking={marking} colour="#151107" markedCount={1} />);
    expect(screen.getByTestId('mark-badge').textContent).toBe('Marking: 1 marked');
  });

  it('names the marking’s values, at most two, then how many more', () => {
    const region = (value: string) => [{ member: 'orders.region', value }];
    const two = withItem(emea, region('APAC'));
    const four = withItem(withItem(two, region('LATAM')), region('North America'));
    expect(shareShownOf(two)).toBe('EMEA and APAC');
    expect(shareShownOf(four)).toBe('EMEA, APAC +2');
    expect(
      shareShownOf(withRange(EMPTY_PREDICATE, { member: 'orders.amount', from: 100, to: 150 })),
    ).toBe('100 – 150');
    // A tuple names no one value: counted, as the chip counts it.
    expect(shareShownOf(withItem(EMPTY_PREDICATE, [...paid, ...region('EMEA')]))).toBe('1 item');
    // A tile marked whole (Mark all) counts its items, as the badge does —
    // never "0 items" (T935's review).
    const whole = { ...emea, wholes: [{ tileId: 't1', filters: [], count: 30 }] };
    expect(shareShownOf(whole)).toBe('31 items');
    expect(shareShownOf({ ...whole, items: [] })).toBe('30 items');
  });

  it('writes a count’s possessive as English does', () => {
    render(<MarkBadge marking={marking} colour="#151107" markedCount={3} shareShown="3 items" />);
    expect(screen.getByTestId('mark-badge').textContent).toBe("Marking: 3 items' share shown");
  });

  it('shows the share only on R81’s types that draw it, and only where its items are partly marked', () => {
    expect(showsShareOnly('graphicalTable', true)).toBe(true);
    expect(showsShareOnly('waterfall', true)).toBe(true);
    expect(showsShareOnly('histogram', true)).toBe(true);
    // Grouped by what the marking names: its items wholly in it or out.
    expect(showsShareOnly('graphicalTable', false)).toBe(false);
    // Today's types keep their count (AC-564 keeps a KPI's badge as it is).
    expect(showsShareOnly('bar', true)).toBe(false);
    expect(showsShareOnly('kpi', true)).toBe(false);
  });
});

describe('the chip for a non-empty marking', () => {
  it('names the marking', () => {
    render(
      <MarkChip marking={marking} colour="#151107" predicate={withItem(EMPTY_PREDICATE, paid)} />,
    );

    expect(screen.getByTestId('mark-chip').textContent).toContain('Marking');
  });

  it('summarises the values, not just the count', () => {
    // "naming it and summarising its values": a chip that said "Marking (2)"
    // would name the marking and tell you nothing about what is in it.
    render(
      <MarkChip
        marking={marking}
        colour="#151107"
        predicate={withItem(withItem(EMPTY_PREDICATE, paid), shipped)}
      />,
    );

    const chip = screen.getByTestId('mark-chip').textContent ?? '';
    expect(chip).toContain('paid');
    expect(chip).toContain('shipped');
  });

  it('shows nothing when the marking is empty', () => {
    render(<MarkChip marking={marking} colour="#151107" predicate={EMPTY_PREDICATE} />);

    expect(screen.queryByTestId('mark-chip')).toBeNull();
  });
});

describe('summarising what a marking holds', () => {
  it('lists the values of a single member', () => {
    expect(summariseMarking(withItem(withItem(EMPTY_PREDICATE, paid), shipped))).toBe(
      'orders.status = paid, shipped',
    );
  });

  it('counts instead when several members are involved', () => {
    // A tuple across two dimensions cannot be written as "member = values"
    // without misstating it, so the count is the honest summary.
    const pair = [
      { member: 'orders.status', value: 'paid' },
      { member: 'orders.category', value: 'Components' },
    ];

    expect(summariseMarking(withItem(EMPTY_PREDICATE, pair))).toBe('1 item');
  });

  it('names each member’s values where every item is one member’s (T267’s review)', () => {
    // Two single-member items on different members: each value is an item
    // of its own, so naming them per member misstates nothing.
    const two = withItem(withItem(EMPTY_PREDICATE, shipped), [
      { member: 'orders.category', value: 'Instruments' },
    ]);
    const titles: Record<string, string> = {
      'orders.status': 'Status',
      'orders.category': 'Category',
    };

    expect(summariseMarking(two, (member) => titles[member])).toBe(
      'Status: shipped; Category: Instruments',
    );
  });

  it('describes a bounded range by its bounds', () => {
    const ranged = withRange(EMPTY_PREDICATE, { member: 'orders.count', from: 1, to: 9 });

    expect(summariseMarking(ranged)).toBe('orders.count 1 to 9');
  });

  it('says both when a marking holds items and ranges', () => {
    const mixed = withRange(withItem(EMPTY_PREDICATE, paid), {
      member: 'orders.count',
      from: 1,
      to: 9,
    });

    expect(summariseMarking(mixed)).toBe('orders.status = paid, orders.count 1 to 9');
  });

  it('is empty for an empty marking', () => {
    expect(summariseMarking(EMPTY_PREDICATE)).toBe('');
  });
});

/**
 * T220 / AC-200: THE SYSTEM SHALL show each non-empty marking in the filter bar
 * as a chip bordered in the marking's colour, naming the marking, summarising
 * its values by the members' titles, naming the tile it came from, and
 * offering a menu and a control that unmarks it.
 * `Fails when: a chip shows a member's internal name, omits the source tile,
 * or cannot unmark from the chip.`
 */
describe('the marking chip, as the prototype draws it (AC-200)', () => {
  const titleOf = (member: string) =>
    ({ 'orders.status': 'Status', 'orders.count': 'Count' })[member];

  it('summarises by the members’ titles, as “Title: values”', () => {
    const mixed = withRange(withItem(withItem(EMPTY_PREDICATE, paid), shipped), {
      member: 'orders.count',
      from: 1,
      to: 9,
    });
    expect(summariseMarking(mixed, titleOf)).toBe('Status: paid, shipped, Count 1 to 9');
  });

  it('names at most a few values and counts the rest, as the prototype’s “+n”', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].reduce(
      (predicate, value) => withItem(predicate, [{ member: 'orders.status', value }]),
      EMPTY_PREDICATE,
    );
    expect(summariseMarking(many, titleOf, 2)).toBe('Status: a, b +3');
  });

  it('is bordered in its colour, names its source tile, and unmarks from its × and its menu', async () => {
    const onUnmark = vi.fn();
    render(
      <MarkChip
        marking={marking}
        colour="#151107"
        predicate={withItem(EMPTY_PREDICATE, paid)}
        titleOf={titleOf}
        from="Orders by status"
        onUnmark={onUnmark}
      />,
    );
    const chip = screen.getByTestId('mark-chip');
    expect(chip.style.borderColor).toBe('rgb(21, 17, 7)');
    expect(chip.textContent).toContain('Status: paid');
    expect(chip.textContent).not.toContain('orders.status');
    expect(chip.textContent).toContain('from Orders by status');

    await userEvent.click(screen.getByRole('button', { name: 'Unmark Marking' }));
    expect(onUnmark).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Marking menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unmark' }));
    expect(onUnmark).toHaveBeenCalledTimes(2);
  });
});
