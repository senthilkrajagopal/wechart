import { matchesPredicate, EMPTY_PREDICATE, withItem } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { legendFor } from '../legend';
import { markFromLegend } from './legendMark';

/**
 * T096 / AC-090: WHEN the user clicks a legend entry's text in a tile that
 * marks, THE SYSTEM SHALL mark every item of that category, and Ctrl-click or
 * ⌘-click SHALL add further categories; series visibility SHALL be changed
 * elsewhere.
 * `Fails when: a legend click hides the series, or does not mark it.`
 *
 * The first failing state is ECharts' *default* behaviour — a legend click
 * hides the series unless `selectedMode: false` is set — so it is not reached
 * by anyone writing a bug, but by anyone not writing the line that prevents
 * it. `legendFor` has set it since AC-038; this pins it to this criterion too,
 * because a future change made for AC-038's reasons would silently break
 * AC-090's.
 *
 * This is also where `references-markings.md` records a conflict it resolved:
 * direction.md §6 originally said a legend click "toggles a series", which
 * contradicts Spotfire, Looker and Qlik, where it marks. The spec follows the
 * marking reading and moves visibility to the Customize panel.
 */
const rows = [
  { 'orders.status': 'paid', 'orders.category': 'Components', 'orders.count': 3 },
  { 'orders.status': 'paid', 'orders.category': 'Instruments', 'orders.count': 4 },
  { 'orders.status': 'shipped', 'orders.category': 'Components', 'orders.count': 5 },
];

const paid = { member: 'orders.status', value: 'paid' };
const shipped = { member: 'orders.status', value: 'shipped' };

describe('clicking a legend entry', () => {
  it('marks every item of that category, not one of them', () => {
    /**
     * A legend names a category, and every row in it belongs to the mark. A
     * one-member tuple is what makes that true: it matches on the category
     * alone, whatever else varies across the rows.
     */
    const marked = markFromLegend(EMPTY_PREDICATE, paid, { add: false });

    expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual([rows[0], rows[1]]);
  });

  it('replaces what was marked, as a plain click elsewhere does', () => {
    const before = withItem(EMPTY_PREDICATE, [shipped]);

    const marked = markFromLegend(before, paid, { add: false });

    expect(marked.items).toEqual([[paid]]);
  });

  it('adds a further category on Ctrl-click, keeping the first', () => {
    // AC-090 says "add further categories" rather than "toggle", which is a
    // real difference from AC-087's Ctrl-click on an item — see the note on
    // the task.
    const before = markFromLegend(EMPTY_PREDICATE, paid, { add: false });

    const marked = markFromLegend(before, shipped, { add: true });

    expect(marked.items).toEqual([[paid], [shipped]]);
    expect(rows.filter((row) => matchesPredicate(marked, row))).toEqual(rows);
  });

  it('does not add a category twice', () => {
    // Clicking an already-marked entry again is not a request for a duplicate
    // that would need two clicks to undo.
    const before = markFromLegend(EMPTY_PREDICATE, paid, { add: false });

    expect(markFromLegend(before, paid, { add: true }).items).toEqual([[paid]]);
  });

  it('keeps the granularity of a time category', () => {
    const march = { member: 'orders.created', granularity: 'month', value: '2026-03-01' };

    expect(markFromLegend(EMPTY_PREDICATE, march, { add: false }).items).toEqual([[march]]);
  });
});

describe('what a legend click must not do', () => {
  it('does not hide the series, which is ECharts’ own default', () => {
    /**
     * The criterion's other failing state. ECharts toggles series visibility
     * on a legend click unless `selectedMode` is false, so this is a line that
     * has to be there rather than a bug that has to be avoided — and it is
     * asserted here, against AC-090, as well as wherever AC-038 put it.
     */
    const option = legendFor({
      chartType: 'bar',
      encoding: { x: ['orders.status'], y: ['orders.count'], color: ['orders.category'] },
      rows,
    });

    expect((option.legend as { selectedMode?: unknown }).selectedMode).toBe(false);
  });
});
