import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BYTE_ORDER_MARK } from '../TileViewMenu';
import { MarkedRows, type RowsAnswer } from './MarkedRows';

/**
 * T120 / AC-114: WHEN the user chooses "View marked rows", THE SYSTEM SHALL
 * show the underlying rows behind the marked items, state the total number of
 * rows, and offer an export of them (direction.md rule 53).
 * `Fails when: the rows shown do not match the marking, or the total is absent.`
 *
 * The dialog alone: it shows the rows its query answers, the total Cube
 * counts, and writes them as CSV. Which rows the query asks for is the
 * dashboard's (the e2e shows them on a real marking).
 */
const ROWS = [
  { 'orders.id': '3', 'orders.status': 'shipped', 'orders.amount': '72.5' },
  { 'orders.id': '6', 'orders.status': 'shipped', 'orders.amount': '95' },
];

type Load = (limit: number, signal: AbortSignal) => Promise<RowsAnswer>;

function dialog(load: Load = vi.fn<Load>(async () => ({ rows: ROWS, total: 80 }))) {
  const saved: { name: string; text: string }[] = [];
  const onClose = vi.fn();
  render(
    <MarkedRows
      title="By status"
      heading="Marked rows"
      load={load}
      measures={['orders.amount']}
      titles={{ 'orders.id': 'Id', 'orders.status': 'Status', 'orders.amount': 'Amount' }}
      onClose={onClose}
      save={(name: string, text: string) => {
        saved.push({ name, text });
      }}
    />,
  );
  return { saved, onClose };
}

describe('the rows behind a tile', () => {
  it('shows the rows, headed by their titles, and how many there are in all', async () => {
    const load = vi.fn<Load>(async () => ({ rows: ROWS, total: 80 }));
    dialog(load);

    const table = await screen.findByRole('table');
    expect([...table.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual([
      'Id',
      'Status',
      'Amount',
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: 'Marked rows: By status' }).textContent).toContain(
      'Showing 2 of 80 rows',
    );
    // The first page asked for, not every row.
    expect(load).toHaveBeenCalledWith(100, expect.any(AbortSignal));
  });

  it('downloads the rows as CSV, asking for them all up to Cube’s limit', async () => {
    const load = vi.fn<Load>(async (limit) =>
      limit > 100 ? { rows: [...ROWS, ...ROWS], total: 4 } : { rows: ROWS, total: 4 },
    );
    const { saved } = dialog(load);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]?.name).toBe('By status - marked rows.csv');
    const text = saved[0]?.text ?? '';
    expect(text.startsWith(BYTE_ORDER_MARK)).toBe(true);
    const lines = text.slice(BYTE_ORDER_MARK.length).split('\r\n');
    expect(lines[0]).toBe('Id,Status,Amount,Amount (raw)');
    expect(lines).toHaveLength(5);
    expect(load).toHaveBeenLastCalledWith(10_000, expect.any(AbortSignal));
    // Said: how many, and that they are all of them.
    expect((await screen.findByRole('status')).textContent).toContain('Downloaded 4 rows');
  });

  it('says so when the rows cannot be had, rather than showing none', async () => {
    dialog(vi.fn<Load>(async () => Promise.reject(new Error('Cube answered 400.'))));

    expect((await screen.findByText('Cube answered 400.')).textContent).toBe('Cube answered 400.');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says when the total could not be read, rather than pass the page for it (T120’s review)', async () => {
    dialog(vi.fn<Load>(async () => ({ rows: ROWS, total: undefined })));
    await screen.findByRole('table');

    expect(screen.getByTestId('rows-count').textContent).toBe(
      'Showing 2 rows. The total could not be read.',
    );
  });

  it('stops a download still being read when it is closed, and saves nothing', async () => {
    let asked: AbortSignal | undefined;
    const load = vi.fn<Load>((limit, signal) => {
      if (limit <= 100) return Promise.resolve({ rows: ROWS, total: 2 });
      asked = signal;
      return new Promise<RowsAnswer>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve({ rows: ROWS, total: 2 });
        });
      });
    });
    const { saved } = dialog(load);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    cleanup();

    expect(asked?.aborted).toBe(true);
    await Promise.resolve();
    expect(saved).toHaveLength(0);
  });

  it('closes on Escape', async () => {
    const { onClose } = dialog();
    await screen.findByRole('table');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
