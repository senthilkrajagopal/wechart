import { EMPTY_PREDICATE, matchesPredicate, type MarkingPredicate } from '@wechart/core';
import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from './DataTable';

/**
 * T098 / AC-092, through the table the user actually clicks.
 *
 * `rows.test.ts` holds the algebra — which rows a click and a Shift-click
 * mark, and that neither marks anything without a primary key. This holds that
 * the gesture reaches it: a criterion that begins "WHEN the user clicks a row"
 * is not demonstrated by a function nothing calls.
 */
const SPEC: RenderSpec = {
  chartType: 'table',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [
    { 'orders.id': 1, 'orders.status': 'paid' },
    { 'orders.id': 2, 'orders.status': 'paid' },
    { 'orders.id': 3, 'orders.status': 'shipped' },
  ],
};

const show = (primaryKey: string | undefined) => {
  const onMark = vi.fn();
  render(<DataTable spec={SPEC} marking={{ predicate: EMPTY_PREDICATE, primaryKey, onMark }} />);
  return onMark;
};

const markedIds = (predicate: MarkingPredicate) =>
  SPEC.rows.filter((row) => matchesPredicate(predicate, row)).map((row) => row['orders.id']);

describe('clicking a row in a table tile', () => {
  it('marks that row', async () => {
    const onMark = show('orders.id');

    await userEvent.click(screen.getAllByTestId('table-row')[1] as HTMLElement);

    expect(markedIds((onMark.mock.calls[0] as [MarkingPredicate])[0])).toEqual([2]);
  });

  it('marks the range from the anchor on Shift-click', async () => {
    // The criterion's first failing state is a Shift-click that marks one row,
    // so the range is checked through two real clicks rather than by calling
    // the algebra twice.
    const user = userEvent.setup();
    const onMark = show('orders.id');
    const rows = screen.getAllByTestId('table-row');

    await user.click(rows[0] as HTMLElement);
    await user.keyboard('{Shift>}');
    await user.click(rows[2] as HTMLElement);
    await user.keyboard('{/Shift}');

    expect(onMark).toHaveBeenCalledTimes(2);
    expect(markedIds((onMark.mock.calls[1] as [MarkingPredicate])[0])).toEqual([1, 2, 3]);
  });

  it('shows which rows are marked', async () => {
    render(
      <DataTable
        spec={SPEC}
        marking={{
          predicate: { items: [[{ member: 'orders.id', value: 2 }]], ranges: [] },
          primaryKey: 'orders.id',
          onMark: vi.fn(),
        }}
      />,
    );

    const rows = screen.getAllByTestId('table-row');
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
    expect(rows[0]?.getAttribute('aria-selected')).toBe('false');
  });

  describe('without a primary key', () => {
    it('does not mark on a click', async () => {
      // The criterion's second failing state, at the gesture rather than in
      // the algebra: the click must not reach the marking at all.
      const onMark = show(undefined);

      await userEvent.click(screen.getAllByTestId('table-row')[1] as HTMLElement);

      expect(onMark).not.toHaveBeenCalled();
    });

    it('does not claim rows are selectable', async () => {
      // `aria-selected` on a row nobody can select announces a state with no
      // way to reach it, which is worse than announcing nothing.
      show(undefined);

      expect(screen.getAllByTestId('table-row')[0]?.hasAttribute('aria-selected')).toBe(false);
    });
  });
});
