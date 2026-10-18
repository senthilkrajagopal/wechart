import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dayOf } from '../../shell/formatTime';
import { AccessTokensTab } from './AccessTokensTab';

/**
 * T772 (AC-470; design 18, screen 4 and state F): Security › Access tokens,
 * every user's tokens to a Super-Admin. The owner first, then the same
 * fields as the owner's own list; filters by user, state and scope, and a
 * search over names; Revoke on any working row, naming owner and token.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const WREN = { key: 'u-wren', name: 'Wren Writer' };
const ADA = { key: 'u-ada', name: 'Ada Admin' };
const FINN = { key: 'u-finn', name: 'Finn Writer' };
const working = {
  state: 'working',
  stoppedAt: null,
  revokedBy: null,
  yours: false,
};

const LAPTOP = {
  ...working,
  id: 't-1',
  name: 'Claude Code · laptop',
  owner: WREN,
  scopes: ['read', 'workspace-edit'],
  createdAt: inDays(-15),
  expiresAt: inDays(15),
  lastUsedAt: now.toISOString(),
};
const ADMIN_BOX = {
  ...working,
  id: 't-2',
  name: 'Claude Code · admin box',
  owner: ADA,
  yours: true,
  scopes: ['read', 'proposals-and-jobs'],
  createdAt: inDays(-7),
  expiresAt: inDays(20),
  lastUsedAt: null,
};
const CURSOR = {
  ...working,
  id: 't-3',
  name: 'Cursor',
  owner: FINN,
  scopes: ['read', 'workspace-edit'],
  createdAt: inDays(-11),
  expiresAt: inDays(19),
  lastUsedAt: null,
};
const CI = {
  ...LAPTOP,
  id: 't-4',
  name: 'CI experiment',
  state: 'revoked',
  stoppedAt: inDays(-3),
  // Revoked by the viewer, Ada: "by you" (F2).
  revokedBy: { name: 'Ada Admin', yours: true },
};
const OLD = {
  ...CURSOR,
  id: 't-5',
  name: 'Old laptop',
  state: 'expired',
  expiresAt: inDays(-10),
  stoppedAt: inDays(-10),
};

function serve(lists: unknown[][], mcpUrl: string | null = null) {
  let listed = 0;
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url === '/api/security/tokens') {
        const tokens = lists[Math.min(listed, lists.length - 1)]!;
        listed += 1;
        return Response.json({ tokens, mcpUrl });
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
      <AccessTokensTab />
    </QueryClientProvider>,
  );
}

const table = () => screen.getByRole('table', { name: 'Everyone’s tokens' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const names = () => bodyRows().map((row) => within(row).getAllByRole('cell')[1]!.textContent);

describe('Security › Access tokens (T772, AC-470; design 18, screen 4)', () => {
  it('lists every user’s working tokens, owner first, with the owner’s list’s fields', async () => {
    serve([[LAPTOP, ADMIN_BOX, CURSOR, CI, OLD]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    expect(
      within(within(table()).getAllByRole('row')[0]!)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Owner', 'Name', 'Scopes', 'Made', 'Expires', 'Last used', 'Actions']);
    // Working, at the start (screen 4's State: Working).
    expect(names()).toEqual(['Claude Code · laptop', 'Claude Code · admin box', 'Cursor']);
    const [laptop, admin] = bodyRows().map((row) => within(row).getAllByRole('cell'));
    expect(laptop![0]!.textContent).toBe('Wren Writer');
    expect(admin![0]!.textContent).toBe('Ada Admin · you');
    expect(
      within(laptop![2]!)
        .getAllByRole('listitem')
        .map((tag) => tag.textContent),
    ).toEqual(['Read', 'Workspace edit']);
    expect(laptop![3]!.textContent).toBe(dayOf(new Date(LAPTOP.createdAt)));
    expect(laptop![4]!.textContent).toContain('in 15 days');
    expect(laptop![5]!.textContent).toMatch(/^Today \d\d:\d\d$/);
    expect(admin![5]!.textContent).toBe('Never');
    expect(
      screen.getByText('3 working tokens · 3 people · newest first').getAttribute('role'),
    ).toBe('status');
    expect(screen.getByText(/A token’s text is never shown here,/)).toBeTruthy();
  });

  it('filters by owner and by state, and clears them', async () => {
    serve([[LAPTOP, ADMIN_BOX, CURSOR, CI, OLD]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'User' }), 'Wren Writer');
    expect(names()).toEqual(['Claude Code · laptop']);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'State' }),
      'No longer working',
    );
    expect(names()).toEqual(['CI experiment']);
    const [ci] = bodyRows().map((row) => within(row).getAllByRole('cell'));
    expect(ci![4]!.textContent).toBe(`Revoked · by you, ${dayOf(new Date(CI.stoppedAt))}`);
    // A stopped token can't be revoked again.
    expect(within(bodyRows()[0]!).queryByRole('button')).toBeNull();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'User' }), 'Anyone');
    expect(names()).toEqual(['CI experiment', 'Old laptop']);
    expect(within(bodyRows()[1]!).getAllByRole('cell')[4]!.textContent).toBe(
      `Expired · ${dayOf(new Date(OLD.stoppedAt))}`,
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(names()).toEqual(['Claude Code · laptop', 'Claude Code · admin box', 'Cursor']);
  });

  it('filters by scope, and searches names', async () => {
    serve([[LAPTOP, ADMIN_BOX, CURSOR]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Scope' }),
      'Proposals and jobs',
    );
    expect(names()).toEqual(['Claude Code · admin box']);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), 'Any');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search token names' }), 'curs');
    expect(names()).toEqual(['Cursor']);
  });

  it('says when no token matches, with Clear filters, which brings them back (F3)', async () => {
    serve([[LAPTOP]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search token names' }), 'zzz');
    const none = screen.getByText(/^No token matches these filters\./);
    expect(screen.queryByRole('table', { name: 'Everyone’s tokens' })).toBeNull();
    await userEvent.click(within(none).getByRole('button', { name: 'Clear filters' }));
    expect(names()).toEqual(['Claude Code · laptop']);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'User' }));
  });

  it('says so when nobody has a token (D1’s words)', async () => {
    serve([[]]);
    open();
    expect(await screen.findByText('No access tokens')).toBeTruthy();
  });

  it('sends focus to the next row’s Revoke after a revoke', async () => {
    serve([[LAPTOP, CURSOR], [CURSOR]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke Wren Writer’s Claude Code · laptop' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Revoke Finn Writer’s Cursor' }),
      ),
    );
  });

  it('asks about one’s own token as one’s own, with its facts', async () => {
    serve([[ADMIN_BOX]]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke Ada Admin’s Claude Code · admin box' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('It can’t be turned back on; you can make a new one.');
    expect(within(dialog).getByRole('definition', { name: 'Scopes' }).textContent).toBe(
      'Read, Proposals and jobs',
    );
    expect(within(dialog).getByRole('definition', { name: 'Last used' }).textContent).toBe('Never');
    // No "‹owner› sees" for one's own.
    expect(within(dialog).queryByRole('definition', { name: /sees$/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Revoke Ada Admin’s Claude Code · admin box' }),
    );
  });

  it('reads the list again when a revoke is refused', async () => {
    const STOPPED = { ...LAPTOP, state: 'expired', stoppedAt: now.toISOString() };
    let lists = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE')
          return Response.json({ error: 'That token already no longer works.' }, { status: 409 });
        if (url === '/api/security/tokens') {
          lists += 1;
          return Response.json({ tokens: [lists === 1 ? LAPTOP : STOPPED] });
        }
        return Response.json({}, { status: 404 });
      }),
    );
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke Wren Writer’s Claude Code · laptop' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That token already no longer works.',
    );
    await waitFor(() => expect(lists).toBe(2));
  });

  it('Revoke names the owner and the token, and revokes it', async () => {
    const asked = serve([
      [LAPTOP, CURSOR],
      [CURSOR, { ...LAPTOP, state: 'revoked', stoppedAt: now.toISOString(), revokedBy: ADA }],
    ]);
    open();
    await screen.findByRole('table', { name: 'Everyone’s tokens' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke Wren Writer’s Claude Code · laptop' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Revoke Wren Writer’s token “Claude Code · laptop”?',
    });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(dialog.textContent).toContain(
      'Every MCP client using it stops working at once: wechart answers it with 401 and runs nothing. It can’t be turned back on; Wren can make a new one.',
    );
    expect(within(dialog).getByRole('definition', { name: 'Scopes' }).textContent).toBe(
      'Read, Workspace edit',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke token' }));
    await waitFor(() => expect(names()).toEqual(['Cursor']));
    expect(asked).toContain('DELETE /api/security/tokens/t-1');
    expect(
      await screen.findByText(
        'Revoked Wren Writer’s “Claude Code · laptop”. Clients using it now get 401.',
      ),
    ).toBeTruthy();
  });

  it('says MCP isn’t set up where no host is named (T774, AC-476)', async () => {
    serve([[LAPTOP]], null);
    open();
    expect(
      (await screen.findByText(/^MCP isn’t set up on this deployment\./)).textContent,
    ).toContain('No host is named for it in the Helm values');
    expect(screen.queryByRole('textbox', { name: 'Server URL' })).toBeNull();
  });

  it('gives the server URL where a host is named (T774, AC-476)', async () => {
    serve([[LAPTOP]], 'https://mcp.wechart.example.com/mcp');
    open();
    expect(
      ((await screen.findByRole('textbox', { name: 'Server URL' })) as HTMLInputElement).value,
    ).toBe('https://mcp.wechart.example.com/mcp');
    expect(screen.queryByText(/MCP isn’t set up/)).toBeNull();
  });

  it('says so when the tokens couldn’t be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 500 })),
    );
    open();
    expect(await screen.findByText('The tokens couldn’t be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
