import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryPanel } from './HistoryPanel';

/**
 * T357 (AC-289; design 06, pins 2–8, states E and F; rule 80): an item's
 * last 10 versions beside it, newest first: its number, the current one
 * tagged, when, by whom and who approved it (or "self-approved"), and its
 * description, clamped. View draws a version; "Propose restoring…" asks for
 * a draft of it, to propose. The limit is said once. Esc closes it.
 */
const history = {
  current: 8,
  versions: [
    {
      version: 8,
      at: new Date(2026, 8, 28, 15, 2).toISOString(),
      title: 'Revenue overview',
      author: { key: 'mo', name: 'Mo Manager' },
      approver: { key: 'ada', name: 'Ada Admin' },
      description: 'Adds the EMEA revenue chart by country.',
      current: true,
    },
    {
      version: 7,
      at: new Date(2026, 8, 22, 10, 14).toISOString(),
      title: 'Revenue overview',
      author: { key: 'ada', name: 'Ada Admin' },
      approver: { key: 'ada', name: 'Ada Admin' },
      description: null,
      current: false,
    },
    {
      version: 1,
      at: new Date(2026, 7, 25, 17, 30).toISOString(),
      title: 'Revenue overview',
      author: null,
      approver: null,
      description: null,
      current: false,
    },
  ],
};

function shown(status = 200, onView = vi.fn(), onRestore = vi.fn(), onClose = vi.fn()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(status === 200 ? history : { error: 'Nope.' }), { status }),
      ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <button type="button">History</button>
      <HistoryPanel
        kind="dashboard"
        id="d1"
        onView={onView}
        onRestore={onRestore}
        onClose={onClose}
        now={new Date(2026, 8, 28, 18, 0)}
      />
    </QueryClientProvider>,
  );
  return { onView, onRestore, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('an item’s history (T357, AC-289)', () => {
  it('lists its versions newest first, who made each and who let it in, the current one tagged', async () => {
    shown();
    const panel = screen.getByRole('complementary', { name: 'History' });
    const rows = await within(panel).findAllByRole('listitem');
    expect(rows.map((row) => within(row).getByTestId('version-head').textContent)).toEqual([
      'Version 8Current',
      'Version 7',
      'Version 1',
    ]);
    expect(rows.map((row) => within(row).getByTestId('version-by').textContent)).toEqual([
      // No comma between a day and its time (T477; Q8).
      'Today 15:02 by Mo Manager · approved by Ada Admin',
      '22 Sep 10:14 by Ada Admin · self-approved',
      '25 Aug 17:30 · before proposals',
    ]);
    expect(within(rows[1]!).getByTestId('version-description').textContent).toBe('No description');
    expect(panel.textContent).toContain(
      'Only the last 10 versions are kept. Restoring one is proposed and approved like any change.',
    );
    // The current one is what the item shows: nothing to restore.
    expect(within(rows[0]!).queryByRole('button', { name: /Propose restoring/ })).toBeNull();
  });

  it('views a version, and asks to restore one', async () => {
    const { onView, onRestore } = shown();
    const rows = await screen.findAllByRole('listitem');
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'View version 7' }));
    expect(onView).toHaveBeenCalledWith(7);
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Propose restoring version 7…' }),
    );
    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ version: 7, approvedText: 'approved 22 Sep by Ada Admin' }),
    );
  });

  it('takes focus as it opens, and closes on Escape', async () => {
    const { onClose } = shown();
    await screen.findAllByRole('listitem');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'History' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('says so, with Retry, when it can’t be read', async () => {
    shown(500);
    expect(await screen.findByText('Couldn’t load this item’s history.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
