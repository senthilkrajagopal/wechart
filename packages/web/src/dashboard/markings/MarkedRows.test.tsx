import { cleanup, render, screen, within } from '@testing-library/react';
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

/**
 * T269 / AC-240: WHILE the details panel is on, WHEN the marking changes, THE
 * SYSTEM SHALL show the rows behind the newly marked items and their total,
 * and the panel SHALL be turned on and off both from the tile's menu and from
 * the panel itself. `Fails when: the panel shows rows of a previous marking
 * after the change, or either control does not toggle it.`
 *
 * The same rows, pinned open (the context-menu analysis, P3): a region
 * beside the dashboard rather than a dialog over it, so the marking can
 * change under it, asking again each time it does.
 */
describe('the details panel', () => {
  const panel = (key: string | undefined, load: Load, onFollow = vi.fn()) => (
    <MarkedRows
      title="By status"
      heading="Marked rows"
      load={load}
      follow={{ key, onChange: onFollow }}
      onClose={vi.fn()}
    />
  );

  it('asks again when the marking changes, showing the new rows and total, never the old', async () => {
    const answers: Record<string, RowsAnswer> = {
      shipped: { rows: [{ 'orders.status': 'shipped' }], total: 80 },
      returned: { rows: [{ 'orders.status': 'returned' }], total: 7 },
    };
    let marking = 'shipped';
    const load = vi.fn<Load>(async () => answers[marking] as RowsAnswer);
    const { rerender } = render(panel('shipped', load));

    const region = screen.getByRole('region', { name: 'Marked rows: By status' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await within(region).findByText('shipped')).toBeTruthy();
    expect(within(region).getByTestId('rows-count').textContent).toBe('Showing 1 of 80 rows');
    expect(region.textContent).toContain('Asked again each time the marking changes.');

    marking = 'returned';
    rerender(panel('returned', load));
    expect(await within(region).findByText('returned')).toBeTruthy();
    expect(within(region).queryByText('shipped')).toBeNull();
    expect(within(region).getByTestId('rows-count').textContent).toBe('Showing 1 of 7 rows');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops an answer for a marking already replaced', async () => {
    const pending: ((answer: RowsAnswer) => void)[] = [];
    const load = vi.fn<Load>(() => new Promise<RowsAnswer>((resolve) => pending.push(resolve)));
    const { rerender } = render(panel('first', load));
    rerender(panel('second', load));

    pending[1]?.({ rows: [{ 'orders.status': 'second' }], total: 1 });
    const region = screen.getByRole('region', { name: 'Marked rows: By status' });
    expect(await within(region).findByText('second')).toBeTruthy();
    pending[0]?.({ rows: [{ 'orders.status': 'first' }], total: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(within(region).queryByText('first')).toBeNull();
  });

  it('says nothing is marked, asking nothing, when the marking empties', () => {
    const load = vi.fn<Load>();
    render(panel(undefined, load));

    expect(screen.getByRole('region', { name: 'Marked rows: By status' }).textContent).toContain(
      'Nothing is marked.',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('is turned off from its own switch', async () => {
    const onFollow = vi.fn();
    render(
      panel(
        'shipped',
        vi.fn<Load>(async () => ({ rows: [], total: 0 })),
        onFollow,
      ),
    );

    const toggle = screen.getByRole('switch', { name: 'Details panel: follow the marking' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(toggle);
    expect(onFollow).toHaveBeenCalledWith(false);
  });

  it('is turned on from the one-off view’s switch', async () => {
    const onFollow = vi.fn();
    render(
      <MarkedRows
        title="By status"
        heading="Marked rows"
        load={vi.fn<Load>(async () => ({ rows: [], total: 0 }))}
        onFollow={onFollow}
        onClose={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Details panel: follow the marking' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    expect(onFollow).toHaveBeenCalledWith(true);
  });
});
