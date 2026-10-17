import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dayOf } from '../shell/formatTime';
import { AccessTokensPage } from './AccessTokensPage';

/**
 * T769 (AC-430, AC-468, AC-469, AC-479; design 18, screen 1 and states D,
 * H): the user's own tokens. Each working token's row shows its name, its
 * scopes as text tags, when it was made, when it expires and when it was
 * last used, and never any part of its text. New token opens the dialog;
 * a token made there is listed.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const TEXT = `wct_${'c0ffee'.repeat(10)}abcd_0badf00d`;
const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const LAPTOP = {
  id: 'pat-1',
  name: 'Claude Code · laptop',
  scopes: ['read', 'workspace-edit'],
  createdAt: inDays(-15),
  expiresAt: inDays(15),
  lastUsedAt: now.toISOString(),
};
const READING = {
  id: 'pat-2',
  name: 'Reading only',
  scopes: ['read'],
  createdAt: inDays(-2),
  expiresAt: inDays(5),
  lastUsedAt: null,
};
const ME = {
  name: 'Wren Writer',
  identity: 'wren@corp.example',
  groups: ['sales-rw'],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
};

function serve(
  lists: { tokens: unknown[]; stopped?: unknown[] }[],
  me: Record<string, unknown> = ME,
  made?: unknown,
) {
  let listed = 0;
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/me') return Response.json(me);
      if (url === '/api/account/tokens' && init?.method === 'POST')
        return Response.json(made, { status: 201 });
      if (url.startsWith('/api/account/tokens/') && init?.method !== undefined)
        return new Response(null, { status: 204 });
      if (url === '/api/account/tokens') {
        const list = lists[Math.min(listed, lists.length - 1)]!;
        listed += 1;
        return Response.json({ stopped: [], ...list });
      }
      return Response.json({}, { status: 404 });
    }),
  );
  return asked;
}

function open() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccessTokensPage />
    </QueryClientProvider>,
  );
}

const rows = () => within(screen.getByRole('table', { name: 'Your tokens' })).getAllByRole('row');

describe('the Access tokens page (T769, AC-430; design 18, screen 1)', () => {
  it('lists each working token with its name, scopes as tags, made, expires and last used', async () => {
    serve([{ tokens: [READING, LAPTOP] }]);
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Access tokens' })).toBeTruthy();
    await screen.findByRole('table', { name: 'Your tokens' });
    const [head, ...body] = rows();
    expect(
      within(head!)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Name', 'Scopes', 'Made', 'Expires', 'Last used', 'Actions']);
    expect(body).toHaveLength(2);
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell');
    const [reading, laptop] = body.map(cells);
    expect(reading![0]!.textContent).toBe('Reading only');
    expect(laptop![0]!.textContent).toBe('Claude Code · laptop');
    // Scopes as text tags, never colour alone.
    expect(
      within(laptop![1]!)
        .getAllByRole('listitem')
        .map((tag) => tag.textContent),
    ).toEqual(['Read', 'Workspace edit']);
    // When it expires, with how long is left.
    expect(laptop![3]!.textContent).toContain('in 15 days');
    expect(reading![3]!.textContent).toContain('in 5 days');
    // Last used: a moment, or Never until a client calls.
    expect(laptop![4]!.textContent).toMatch(/^Today \d\d:\d\d$/);
    expect(reading![4]!.textContent).toBe('Never');
    expect(laptop![2]!.textContent).toBe(dayOf(new Date(LAPTOP.createdAt)));
    expect(reading![2]!.textContent).toBe(dayOf(new Date(READING.createdAt)));
  });

  it('never shows any part of a token’s text', async () => {
    serve([{ tokens: [LAPTOP] }]);
    open();
    await screen.findByRole('table', { name: 'Your tokens' });
    expect(document.body.textContent).not.toMatch(/wct_/);
    expect(screen.getByText(/A token’s text is shown once, when it’s made\./)).toBeTruthy();
  });

  it('says so when there are no tokens yet', async () => {
    serve([{ tokens: [] }]);
    open();
    expect(await screen.findByText('No tokens yet')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Your tokens' })).toBeNull();
  });

  it('says so when the tokens couldn’t be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/me' ? Response.json(ME) : Response.json({}, { status: 500 }),
      ),
    );
    open();
    expect(await screen.findByText('Your tokens couldn’t be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('opens New token, and lists a token made there', async () => {
    const MADE = { ...READING, id: 'pat-3', name: 'Claude Code · desktop' };
    const asked = serve([{ tokens: [LAPTOP] }, { tokens: [MADE, LAPTOP] }], ME, {
      token: MADE,
      text: TEXT,
    });
    open();
    await screen.findByRole('table', { name: 'Your tokens' });
    await userEvent.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = screen.getByRole('dialog', { name: 'New access token' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), MADE.name);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(asked).toContain('POST /api/account/tokens');
    expect(within(rows()[1]!).getAllByRole('cell')[0]!.textContent).toBe('Claude Code · desktop');
    // The text the API answered is nowhere in the list: only the shown-once
    // dialog over it holds it (T770).
    expect(screen.getByRole('table', { name: 'Your tokens' }).innerHTML).not.toContain(TEXT);
    expect(screen.getByRole('dialog', { name: 'Copy your token now' }).textContent).toContain(TEXT);
  });

  it('gives a read-only user’s dialog the other scopes disabled (AC-469)', async () => {
    serve([{ tokens: [] }], { ...ME, readWrite: false, groups: ['sales-ro'] });
    open();
    await screen.findByText('No tokens yet');
    await userEvent.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = screen.getByRole('dialog', { name: 'New access token' });
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: /^Workspace edit/ })).toHaveProperty(
        'disabled',
        true,
      ),
    );
  });
});

const REVOKED = {
  ...LAPTOP,
  id: 'pat-8',
  name: 'CI experiment',
  state: 'revoked',
  stoppedAt: inDays(-5),
  revokedBy: { name: 'Ada Admin' },
};
const EXPIRED = {
  ...READING,
  id: 'pat-9',
  name: 'Old laptop',
  expiresAt: inDays(-47),
  state: 'expired',
  stoppedAt: inDays(-47),
  revokedBy: null,
};
const stoppedRows = () =>
  within(screen.getByRole('table', { name: 'No longer working' })).getAllByRole('row');

describe('revoking, and No longer working (T771, AC-431; design 18, states D and E)', () => {
  it('revokes a token from its row, asked first, with a toast and no Undo', async () => {
    const STOPPED = { ...LAPTOP, state: 'revoked', stoppedAt: now.toISOString(), revokedBy: ME };
    const asked = serve([{ tokens: [LAPTOP, READING] }, { tokens: [READING], stopped: [STOPPED] }]);
    open();
    await screen.findByRole('table', { name: 'Your tokens' });
    const revoke = within(rows()[1]!).getByRole('button', { name: 'Revoke' });
    expect(revoke.getAttribute('aria-label')).toBeNull();
    await userEvent.click(revoke);
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke “Claude Code · laptop”?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke token' }));

    expect(
      await screen.findByText('Revoked “Claude Code · laptop”. Clients using it now get 401.'),
    ).toBeTruthy();
    expect(asked).toContain('DELETE /api/account/tokens/pat-1');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    // It moves under No longer working.
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(stoppedRows()[0]!).getAllByRole('cell')[0]!.textContent).toBe(
      'Claude Code · laptop',
    );
  });

  it('Cancel revokes nothing', async () => {
    const asked = serve([{ tokens: [LAPTOP] }]);
    open();
    await screen.findByRole('table', { name: 'Your tokens' });
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(asked.filter((each) => each.startsWith('DELETE'))).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Revoke' }));
  });

  it('lists revoked and expired tokens with their state, when, and who revoked one', async () => {
    serve([{ tokens: [LAPTOP], stopped: [REVOKED, EXPIRED] }]);
    open();
    expect(await screen.findByRole('heading', { name: 'No longer working' })).toBeTruthy();
    const [revoked, expired] = stoppedRows().map((row) => within(row).getAllByRole('cell'));
    expect(revoked![0]!.textContent).toBe('CI experiment');
    expect(revoked![3]!.textContent).toBe(
      `Revoked · by Ada Admin, ${dayOf(new Date(REVOKED.stoppedAt))}`,
    );
    expect(revoked![3]!.querySelector('svg[data-icon="err"]')).not.toBeNull();
    expect(expired![0]!.textContent).toBe('Old laptop');
    expect(expired![3]!.textContent).toBe(`Expired · ${dayOf(new Date(EXPIRED.stoppedAt))}`);
    expect(expired![3]!.querySelector('svg[data-icon="idle"]')).not.toBeNull();
    // Neither can be revoked again: each offers Remove alone.
    for (const row of stoppedRows()) {
      expect(
        within(row)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Remove']);
    }
  });

  it('Remove takes a stopped token off the list', async () => {
    const asked = serve([
      { tokens: [], stopped: [REVOKED, EXPIRED] },
      { tokens: [], stopped: [EXPIRED] },
    ]);
    open();
    await screen.findByRole('table', { name: 'No longer working' });
    await userEvent.click(within(stoppedRows()[0]!).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(stoppedRows()).toHaveLength(1));
    expect(asked).toContain('POST /api/account/tokens/pat-8/remove');
    expect(within(stoppedRows()[0]!).getAllByRole('cell')[0]!.textContent).toBe('Old laptop');
  });

  it('shows no No longer working section when nothing has stopped', async () => {
    serve([{ tokens: [LAPTOP] }]);
    open();
    await screen.findByRole('table', { name: 'Your tokens' });
    expect(screen.queryByRole('heading', { name: 'No longer working' })).toBeNull();
  });
});

describe('with sign-in off (T769, AC-479; design 18, state H)', () => {
  it('says a token acts as the single user', async () => {
    serve([{ tokens: [] }], { name: 'admin', groups: [], superAdmin: true, security: 'off' });
    open();
    expect(
      await screen.findByText(/Sign-in is off\. A token acts as wechart’s single user/),
    ).toBeTruthy();
    expect(screen.queryByText(/groups from your latest sign-in/)).toBeNull();
  });

  it('says signed in that a token uses the groups of the latest sign-in', async () => {
    serve([{ tokens: [] }]);
    open();
    expect(
      await screen.findByText(/Your tokens use the groups from your latest sign-in/),
    ).toBeTruthy();
  });
});
