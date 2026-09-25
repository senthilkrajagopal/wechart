import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TileLoadError } from '../query/loadTile';
import { TileError } from './TileError';

/**
 * AC-012: IF Cube returns an error for a query, THEN THE SYSTEM SHALL show the
 * tile in an error state with Cube's message and a control that reveals the
 * query JSON.
 * Fails when: the tile shows an empty chart, or the message and query JSON are
 * not reachable from the tile.
 *
 * Cube's own message is the useful part — "Can't find join path between Orders
 * and Suppliers" tells an author what to change, where "Something went wrong"
 * tells them to file a ticket. So these assert the message survives intact
 * rather than being replaced by a friendlier generic one.
 */
const query = { measures: ['Orders.count'], dimensions: ['Suppliers.name'] };
const error = new TileLoadError("Can't find join path between Orders and Suppliers", query, 400);

describe('tile error state (AC-012)', () => {
  it('shows Cube’s own message, not a generic one', () => {
    render(<TileError error={error} />);

    expect(screen.getByRole('alert').textContent).toContain(
      "Can't find join path between Orders and Suppliers",
    );
  });

  it('reveals the exact query that was sent, and the error, in its Details (T251)', async () => {
    render(<TileError error={error} />);

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');

    const shown = screen.getByTestId('tile-error-query').textContent ?? '';
    expect(JSON.parse(shown)).toEqual(query);
    expect(screen.getByTestId('tile-error-detail').textContent).toBe(
      "Can't find join path between Orders and Suppliers (HTTP 400)",
    );
  });

  it('keeps the query out of the way until asked for', () => {
    render(<TileError error={error} />);

    expect(screen.queryByTestId('tile-error-query')).toBeNull();
  });

  it('is not an empty chart: the state announces itself', () => {
    const { container } = render(<TileError error={error} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(container.textContent?.trim()).not.toBe('');
  });

  it('pairs the state with an icon and a label, never colour alone', () => {
    render(<TileError error={error} />);

    const alert = screen.getByRole('alert');
    // direction.md rule 3 / AC-177.
    expect(alert.querySelector('[data-icon]')).toBeTruthy();
    expect(alert.textContent).toMatch(/could not load/i);
  });

  it('handles an error that carries no query, without hiding the message', () => {
    render(<TileError error={new Error('Network unreachable')} />);

    expect(screen.getByRole('alert').textContent).toContain('Network unreachable');
    // No Details to open: there is no query behind it (T251 renamed the control).
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });
});
