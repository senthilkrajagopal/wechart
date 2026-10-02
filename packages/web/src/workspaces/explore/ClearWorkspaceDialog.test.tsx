import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClearWorkspaceDialog, heldText } from './ClearWorkspaceDialog';

/**
 * T522 (AC-367; design 14, states F2 and F3): Clear My workspace asks first,
 * naming how much it removes, by kind, and each open proposal it withdraws;
 * cleared, it says what went.
 */
const HELD = {
  items: 14,
  folders: 3,
  dashboards: 5,
  charts: 6,
  models: 2,
  dataSources: 1,
};
const PROPOSALS = [
  {
    id: 'p1',
    kind: 'dashboard',
    title: 'Revenue overview',
    targetFolderId: 'emea',
    targetPath: 'Sales / EMEA',
    proposedAt: '2026-09-29T10:00:00.000Z',
  },
  {
    id: 'p2',
    kind: 'data-source',
    title: 'emea_replica',
    targetFolderId: 'emea',
    targetPath: 'Sales / EMEA',
    proposedAt: '2026-09-30T10:00:00.000Z',
  },
];

function shown(
  held: Record<string, unknown> = { ...HELD, proposals: PROPOSALS },
  { clearFails = false } = {},
) {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST')
        return Promise.resolve(
          clearFails
            ? new Response(JSON.stringify({ error: 'The database went away.' }), { status: 500 })
            : new Response(JSON.stringify({ ...HELD, withdrawn: 2 })),
        );
      return Promise.resolve(new Response(JSON.stringify(held)));
    }),
  );
  const onCleared = vi.fn();
  const onFailed = vi.fn();
  const onClose = vi.fn();
  render(<ClearWorkspaceDialog onCleared={onCleared} onFailed={onFailed} onClose={onClose} />);
  return { sent, onCleared, onFailed, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Clear My workspace (T522, AC-367; design 14, F2)', () => {
  it('names how much it removes, by kind, and each open proposal it withdraws, before anything goes', async () => {
    const { sent } = shown();
    const dialog = screen.getByRole('alertdialog', { name: 'Clear My workspace?' });
    expect(
      await within(dialog).findByText(
        'This removes everything in My workspace: 14 items and 3 folders (5 dashboards, 6 charts, 2 models, 1 data source).',
      ),
    ).not.toBeNull();
    expect(within(dialog).getByText('It withdraws 2 open proposals')).not.toBeNull();
    const rows = within(dialog).getByRole('list', { name: 'It withdraws 2 open proposals' });
    expect(
      within(rows)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringMatching(/^Waiting for review Revenue overview → Sales \/ EMEA · /) as unknown,
      expect.stringMatching(/^Waiting for review emea_replica → Sales \/ EMEA · /) as unknown,
    ]);
    expect(dialog.textContent).toContain(
      'Nothing outside My workspace changes: what’s already approved stays in its folder.',
    );
    expect(dialog.textContent).toContain('You can’t undo this.');
    // Cancel, which loses nothing, has focus; nothing was cleared.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sent).toEqual(['GET /api/workspace/clear']);
  });

  it('clears it once confirmed, saying what went', async () => {
    const { sent, onCleared } = shown();
    const dialog = screen.getByRole('alertdialog', { name: 'Clear My workspace?' });
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Clear My workspace' }),
    );
    await vi.waitFor(() => {
      expect(onCleared).toHaveBeenCalledWith(
        'Cleared My workspace: 14 items and 3 folders removed, 2 proposals withdrawn.',
      );
    });
    expect(sent).toEqual(['GET /api/workspace/clear', 'POST /api/workspace/clear']);
  });

  it('says why where it fails, and has what it may have changed read afresh (T522’s review)', async () => {
    const { onCleared, onFailed } = shown(undefined, { clearFails: true });
    const dialog = screen.getByRole('alertdialog', { name: 'Clear My workspace?' });
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Clear My workspace' }),
    );
    expect(await within(dialog).findByText('The database went away.')).not.toBeNull();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('leaves the proposals out where none is open', async () => {
    shown({ ...HELD, proposals: [] });
    const dialog = screen.getByRole('alertdialog', { name: 'Clear My workspace?' });
    await within(dialog).findByRole('button', { name: 'Clear My workspace' });
    expect(dialog.textContent).not.toContain('withdraws');
  });
});

describe('what it holds, as the confirmation says it', () => {
  it('names only the kinds it holds, each in the singular where one', () => {
    expect(
      heldText({ items: 2, folders: 1, dashboards: 1, charts: 0, models: 0, dataSources: 1 }),
    ).toBe('2 items and 1 folder (1 dashboard, 1 data source)');
    expect(
      heldText({ items: 1, folders: 0, dashboards: 0, charts: 1, models: 0, dataSources: 0 }),
    ).toBe('1 item (1 chart)');
    expect(
      heldText({ items: 0, folders: 2, dashboards: 0, charts: 0, models: 0, dataSources: 0 }),
    ).toBe('2 folders');
  });
});
