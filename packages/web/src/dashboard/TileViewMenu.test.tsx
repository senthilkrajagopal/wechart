import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TileViewMenu, csvFileName } from './TileViewMenu';

/**
 * T177 / AC-171: WHEN the user exports a chart, THE SYSTEM SHALL produce a
 * CSV whose rows and columns match what the tile shows.
 *
 * From the tile's ⋯ menu in view mode, as the prototype's is ("Download
 * CSV"): the file is the tile's render spec as CSV (`csvOf`).
 */
const SPEC: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [
    { 'orders.status': 'shipped', 'orders.count': '3' },
    { 'orders.status': 'completed', 'orders.count': '5' },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a tile’s view-mode menu', () => {
  it('downloads the tile’s rows and columns as CSV, named by its chart', async () => {
    const saved: { name: string; text: string }[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="Orders by status"
        spec={SPEC}
        save={(name, text) => {
          saved.push({ name, text });
        }}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Actions for Orders by status' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));

    expect(saved).toEqual([
      {
        name: 'Orders by status.csv',
        // The tile's table, after the mark telling a spreadsheet it is UTF-8.
        text: '﻿orders.status,orders.count\r\nshipped,3\r\ncompleted,5',
      },
    ]);
    // Closed, and focus back where it was opened.
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  /**
   * T178 / AC-172: WHEN an export exceeds the row limit Cube returns, THE
   * SYSTEM SHALL say how many rows were exported and that the result was
   * truncated. Fails when: a truncated export claims to be complete.
   */
  it('says how many rows it wrote, and that Cube cut them short past its limit', async () => {
    const order: string[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => {
          order.push('counted');
          return { returned: 10_000, total: 12_345 };
        }}
        save={() => {
          order.push('saved');
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));

    const note = await screen.findByText(/^Downloaded 2 rows\. Truncated:/);
    expect(note.textContent).toBe(
      'Downloaded 2 rows. Truncated: the query has 12,345 rows, and Cube returned the first 10,000.',
    );
    expect(note.getAttribute('role')).toBe('status');
    // The file first, at the click; the count after.
    expect(order).toEqual(['saved', 'counted']);
  });

  it('says nothing was cut short when Cube returned every row', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => ({ returned: 2, total: 2 })}
        save={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));

    expect((await screen.findByText(/Nothing was cut short/)).textContent).toBe(
      'Downloaded 2 rows. Nothing was cut short: Cube returned all 2 rows of the query.',
    );
  });

  it('says it could not tell when the count fails or cannot be had', async () => {
    for (const countRows of [async () => Promise.reject(new Error('down')), undefined]) {
      const { unmount } = render(
        <TileViewMenu tileId="t1" title="T" spec={SPEC} countRows={countRows} save={vi.fn()} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));
      expect((await screen.findByText(/Could not tell/)).textContent).toBe(
        'Downloaded 2 rows. Could not tell whether Cube cut the result short.',
      );
      unmount();
    }
  });

  /** From T178's review: an earlier download's count, arriving late, is not said of the last. */
  it('says only the latest download’s count, letting go of the one before', async () => {
    const counts: {
      signal: AbortSignal;
      answer: (counted: { returned: number; total: number }) => void;
    }[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={(signal) =>
          new Promise((answer) => {
            counts.push({ signal, answer });
          })
        }
        save={vi.fn()}
      />,
    );
    for (let time = 0; time < 2; time += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));
    }
    expect(counts[0]?.signal.aborted).toBe(true);

    // The last download's count, truncated, and then the first's, late.
    counts[1]?.answer({ returned: 10_000, total: 12_345 });
    await screen.findByText(/Truncated/);
    counts[0]?.answer({ returned: 2, total: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Nothing was cut short/)).toBeNull();
    expect(screen.getByText(/Truncated/)).toBeTruthy();
  });

  it('puts the note away when the menu is opened, so neither covers the other', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => ({ returned: 2, total: 2 })}
        save={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for T' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));
    await screen.findByText(/Nothing was cut short/);

    // From the keyboard, where focus went back to.
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Download CSV' })).toBeTruthy();
    expect(screen.queryByText(/Nothing was cut short/)).toBeNull();
  });

  it('offers no download while the tile’s newest answer is on its way (T177’s review)', async () => {
    const save = vi.fn();
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} asking save={save} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));

    const download = screen.getByRole('menuitem', { name: 'Download CSV' });
    // A menu item says it is off as the APG menu has it, and stays focusable (T266).
    expect(download.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(download);
    expect(save).not.toHaveBeenCalled();
    // Why, in words beside it (T182, AC-176): a disabled button takes no
    // focus, so a tooltip on it was out of the keyboard's reach.
    const why = screen.getByText('Its newest answer is still on its way.').closest('p');
    expect(download.getAttribute('aria-describedby')).toBe(why?.id);
    expect(download.hasAttribute('title')).toBe(false);
  });

  it('closes on a press elsewhere', async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  /**
   * T267 / AC-247: WHILE the tile's marking holds items, THE SYSTEM SHALL
   * head the tile's menu with the marking's name, the marked values by their
   * members' titles, and the count marked out of the tile's items.
   * `Fails when: the heading omits the values, or either count differs from
   * the marked items or the tile's items.`
   */
  it('heads its marked group with the marking, its values by title, and how many of the tile’s items', async () => {
    const marked = { name: 'Marking', count: 2, onUnmark: vi.fn() };
    const { rerender } = render(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{ ...marked, values: 'Country: Norway, Spain', of: 6 }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));

    expect(
      screen.getByRole('group', { name: 'Marking · Country: Norway, Spain · 2 of 6 marked' }),
    ).toBeTruthy();

    // A tile whose items cannot be counted — a table marks rows — says how
    // many are marked, and no "of".
    rerender(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{ ...marked, values: 'Country: Norway, Spain' }}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Marking · Country: Norway, Spain · 2 marked' }),
    ).toBeTruthy();
  });

  it('closes on Escape, giving focus back to its trigger', async () => {
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Actions for T' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('the CSV file’s name', () => {
  it('is the chart’s title, without characters a file system refuses', () => {
    expect(csvFileName('Sales / region: 2026?')).toBe('Sales - region- 2026-.csv');
    expect(csvFileName('   ')).toBe('chart.csv');
  });
});
