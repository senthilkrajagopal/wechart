import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessTokensPage } from './AccessTokensPage';
import { claudeCodeCommand, TokenShownOnce } from './TokenShownOnce';

/**
 * T770 (AC-430; design 18, screen 3 and state C): the one moment a token's
 * text is on screen. After Create token, the dialog shows the text, Copy,
 * and the Claude Code command filled in. Done or Esc before any Copy asks
 * first; after a Copy they close at once. Once it's closed, no page state
 * and no request can show the text again.
 */
const TEXT = `wct_${'7f'.repeat(32)}_0badf00d`;
const MADE = {
  token: {
    id: 'pat-9',
    name: 'Claude Code · desktop',
    scopes: ['read', 'workspace-edit'] as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    lastUsedAt: null,
  },
  text: TEXT,
};
const SERVER = 'http://localhost:3000/mcp';
const COMMAND = `claude mcp add --transport http wechart ${SERVER} --header "Authorization: Bearer ${TEXT}"`;

let copied: string[] = [];
beforeEach(() => {
  copied = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (said: string) => {
        copied.push(said);
      },
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

function open() {
  const onClose = vi.fn();
  render(<TokenShownOnce made={MADE} serverUrl={SERVER} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Copy your token now' }) };
}

describe('the token, shown once (T770, AC-430; design 18, screen 3)', () => {
  it('says what was made, warns it is shown only now, and shows the text and the command', () => {
    const { dialog } = open();
    expect(within(dialog).getByTestId('made').textContent).toContain('Claude Code · desktop');
    expect(within(dialog).getByTestId('made').textContent).toContain('Read, Workspace edit');
    expect(within(dialog).getByText(/This is the only time wechart shows it\./)).toBeTruthy();
    // Each in a labelled, read-only field (design 18's keyboard and screen-reader row).
    const text = within(dialog).getByRole('textbox', { name: 'Your token' });
    expect(text).toHaveProperty('value', TEXT);
    expect(text).toHaveProperty('readOnly', true);
    const command = within(dialog).getByRole('textbox', {
      name: 'Add wechart to Claude Code, in a terminal',
    });
    expect(command).toHaveProperty('value', COMMAND);
    expect(command).toHaveProperty('readOnly', true);
    expect(within(dialog).getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
    expect(within(dialog).getAllByRole('button', { name: 'Copy command' })).toHaveLength(1);
  });

  it('copies the text, and the button then reads Copied, said politely', async () => {
    const { dialog } = open();
    const said = within(dialog).getByRole('status');
    expect(said.getAttribute('aria-live')).toBe('polite');
    expect(said.textContent).toBe('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(copied).toEqual([TEXT]);
    expect(await within(dialog).findAllByRole('button', { name: 'Copied' })).toHaveLength(1);
    expect(said.textContent).toBe('Copied');
  });

  it('says so when the browser refuses the copy, and still asks before closing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'It couldn’t be copied here: select it and copy it yourself.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.getAllByRole('alertdialog', { name: 'Close without copying?' })).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks the browser before the page is left with it uncopied, and not once copied', async () => {
    const { dialog } = open();
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await within(dialog).findByRole('button', { name: 'Copied' });
    expect(leave()).toBe(false);
  });

  it('copies the command with the token in it', async () => {
    const { dialog } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy command' }));
    expect(copied).toEqual([COMMAND]);
  });

  it('asks before Done closes it uncopied; Go back keeps it, Close closes it', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(onClose).not.toHaveBeenCalled();
    const asking = screen.getByRole('alertdialog', { name: 'Close without copying?' });
    expect(asking.textContent).toContain('You won’t be able to see this token again.');
    // Focus starts on the answer that loses nothing.
    const back = within(asking).getByRole('button', { name: 'Go back and copy it' });
    expect(document.activeElement).toBe(back);
    await userEvent.click(back);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Your token' })).toHaveProperty(
      'value',
      TEXT,
    );

    // Esc before any Copy asks too.
    await userEvent.keyboard('{Escape}');
    expect(screen.getAllByRole('alertdialog', { name: 'Close without copying?' })).toHaveLength(1);
    // Esc at the question goes back.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Close' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once on Done after a Copy', async () => {
    const first = open();
    await userEvent.click(within(first.dialog).getByRole('button', { name: 'Copy command' }));
    await userEvent.click(within(first.dialog).getByRole('button', { name: 'Done' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('closes at once on Esc after a Copy', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('once closed, the text is gone (T770, AC-430; design 18, C3)', () => {
  it('leaves no page state, cache or request that shows it again', async () => {
    const LISTED = { tokens: [MADE.token], stopped: [] };
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? 'GET'} ${url}`);
        if (url === '/api/me')
          return Response.json({
            name: 'Wren Writer',
            groups: ['sales-rw'],
            superAdmin: false,
            readWrite: true,
            security: 'oidc',
          });
        if (url === '/api/account/tokens' && init?.method === 'POST')
          return Response.json(MADE, { status: 201 });
        if (url === '/api/account/tokens')
          return Response.json(
            asked.includes('POST /api/account/tokens') ? LISTED : { tokens: [] },
          );
        return Response.json({}, { status: 404 });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AccessTokensPage />
      </QueryClientProvider>,
    );
    await screen.findByText('No tokens yet');
    await userEvent.click(screen.getByRole('button', { name: 'New token' }));
    const making = screen.getByRole('dialog', { name: 'New access token' });
    await userEvent.type(within(making).getByRole('textbox', { name: /^Name/ }), MADE.token.name);
    await userEvent.click(within(making).getByRole('button', { name: 'Create token' }));

    // Create token turns the dialog into the shown-once one, the new row behind it.
    const shown = await screen.findByRole('dialog', { name: 'Copy your token now' });
    expect(within(shown).getByRole('textbox', { name: 'Your token' })).toHaveProperty(
      'value',
      TEXT,
    );
    expect(
      within(shown).getByRole('textbox', { name: 'Add wechart to Claude Code, in a terminal' }),
    ).toHaveProperty('value', claudeCodeCommand(`${window.location.origin}/mcp`, TEXT));
    await screen.findByRole('table', { name: 'Your tokens' });

    await userEvent.click(within(shown).getByRole('button', { name: 'Copy' }));
    await userEvent.click(within(shown).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Focus goes back to New token, which opened it all (rule 85).
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New token' }));

    expect(document.body.textContent).not.toContain(TEXT);
    expect(document.body.innerHTML).not.toContain(TEXT.slice(4, 68));
    // Nothing the page keeps holds it: no query, and no mutation's result.
    const kept = JSON.stringify([
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      client
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ]);
    expect(kept).not.toContain(TEXT.slice(4, 68));
    // The one request that answered it was the POST that made it.
    expect(asked.filter((each) => each.startsWith('POST'))).toEqual(['POST /api/account/tokens']);
  });
});
