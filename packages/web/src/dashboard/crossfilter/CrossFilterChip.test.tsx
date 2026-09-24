import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CrossFilterChips } from './CrossFilterChip';
import type { CrossSelection } from './apply';

/**
 * T125 / AC-119: WHEN a cross-filter is active, THE SYSTEM SHALL show a chip
 * naming the member and value and the source tile, and clear it when the chip
 * is dismissed or Escape is pressed.
 * `Fails when: the chip omits the source tile, or dismissing it leaves a tile
 * filtered.`
 *
 * The chip is what tells a reader why the dashboard is showing less than it
 * was, and which tile to click again to undo it — Superset names the emitting
 * chart for the same reason (`docs/research/cross-highlight.md` §5).
 */
const shipped: CrossSelection = { from: 'tile-status', member: 'orders.status', value: 'shipped' };
const beverages: CrossSelection = {
  from: 'tile-category',
  member: 'products.category',
  value: 'Beverages',
};

const chips = (selections: readonly CrossSelection[], onClear = vi.fn()) => {
  render(
    <CrossFilterChips
      selections={selections}
      onClear={onClear}
      memberTitle={(member) => (member === 'orders.status' ? 'Orders Status' : 'Products Category')}
      tileName={(tileId) => (tileId === 'tile-status' ? 'By status' : 'By category')}
    />,
  );
  return onClear;
};

describe('a cross-filter chip', () => {
  it('names the member, the value and the tile it came from', () => {
    chips([shipped]);

    const chip = screen.getByTestId('cross-filter-chip');
    expect(chip.textContent).toContain('Orders Status');
    expect(chip.textContent).toContain('shipped');
    // The source tile, which the criterion names as its failing state.
    expect(chip.textContent).toContain('By status');
  });

  it('is dismissed by its own button, naming what it clears', async () => {
    const onClear = chips([shipped, beverages]);

    await userEvent.click(screen.getByRole('button', { name: 'Clear Orders Status = shipped' }));

    expect(onClear).toHaveBeenCalledWith(shipped);
  });

  it('offers to clear them all at once when there are several', async () => {
    const onClear = chips([shipped, beverages]);
    expect(screen.getAllByTestId('cross-filter-chip')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /^Clear all/ }));

    // Named nothing is "all of them", so the owner needs no second callback.
    expect(onClear).toHaveBeenCalledWith();
  });

  it('says how to clear them, since Escape is not visible anywhere else', () => {
    chips([shipped]);

    expect(screen.getByRole('button', { name: /^Clear all/ }).textContent).toContain('Esc');
  });

  it('shows nothing at all when no cross-filter is active', () => {
    chips([]);

    expect(screen.queryByTestId('cross-filter-chip')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Clear all/ })).toBeNull();
  });
});
