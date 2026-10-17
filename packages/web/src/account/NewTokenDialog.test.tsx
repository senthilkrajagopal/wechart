import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dayOf } from '../shell/formatTime';
import { NewTokenDialog } from './NewTokenDialog';

/**
 * T769 (AC-430, AC-468, AC-469; design 18, screen 2 and states A5, B): a
 * name, Read checked and locked, Workspace edit and Proposals and jobs, and
 * 7, 30 or 90 days with 30 chosen at the start. A user read-only in every
 * folder sees the other two disabled, with the reason. The API's refusal is
 * shown with its reason.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(answer: { status: number; body: unknown }) {
  const asked: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push({ url, ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return asked;
}

function open(props: { readWrite?: boolean; onMade?: () => void; onClose?: () => void } = {}) {
  const onMade = props.onMade ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewTokenDialog readWrite={props.readWrite ?? true} onMade={onMade} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onMade, onClose, dialog: screen.getByRole('dialog', { name: 'New access token' }) };
}

const MADE = {
  token: {
    id: 'pat-1',
    name: 'Claude Code · desktop',
    scopes: ['read', 'workspace-edit'],
    createdAt: '2026-10-17T12:00:00.000Z',
    expiresAt: '2026-11-16T12:00:00.000Z',
    lastUsedAt: null,
  },
  text: `wct_${'a'.repeat(64)}_0badf00d`,
};

describe('New token (T769, AC-430, AC-468, AC-469; design 18, screen 2)', () => {
  it('offers a name, Read checked and locked, and the two other scopes unchecked', () => {
    const { dialog } = open();
    const name = within(dialog).getByRole('textbox', { name: /^Name/ });
    expect(document.activeElement).toBe(name);
    const read = within(dialog).getByRole('checkbox', { name: /^Read/ });
    expect(read).toHaveProperty('checked', true);
    expect(read).toHaveProperty('disabled', true);
    expect(within(dialog).getByText('Always included')).toBeTruthy();
    for (const scope of ['Workspace edit', 'Proposals and jobs']) {
      const box = within(dialog).getByRole('checkbox', { name: new RegExp(`^${scope}`) });
      expect(box).toHaveProperty('checked', false);
      expect(box).toHaveProperty('disabled', false);
    }
    // Exactly three scopes.
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
  });

  it('offers 7, 30 or 90 days, with 30 chosen at the start, and the date it gives', async () => {
    const { dialog } = open();
    const group = within(dialog).getByRole('radiogroup', { name: 'Expires in' });
    const choices = within(group).getAllByRole('radio');
    expect(choices.map((each) => each.closest('label')?.textContent)).toEqual([
      '7 days',
      '30 days',
      '90 days',
    ]);
    expect(within(group).getByRole('radio', { name: '30 days' })).toHaveProperty('checked', true);
    const inThirty = new Date(Date.now() + 30 * 86_400_000);
    expect(within(dialog).getByTestId('expires-on').textContent).toBe(`on ${dayOf(inThirty)}`);
    expect(within(dialog).getByText('No token lasts longer than 90 days.')).toBeTruthy();
    await userEvent.click(within(group).getByRole('radio', { name: '90 days' }));
    expect(within(group).getByRole('radio', { name: '90 days' })).toHaveProperty('checked', true);
  });

  it('holds Create token until there is a name', async () => {
    const { dialog } = open();
    const create = within(dialog).getByRole('button', { name: 'Create token' });
    expect(create).toHaveProperty('disabled', true);
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), '   ');
    expect(create).toHaveProperty('disabled', true);
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'laptop');
    expect(create).toHaveProperty('disabled', false);
  });

  it('makes the token with the name, the scopes chosen and the days', async () => {
    const asked = serve({ status: 201, body: MADE });
    const { dialog, onMade } = open();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'Claude Code · desktop',
    );
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Workspace edit/ }));
    await userEvent.click(within(dialog).getByRole('radio', { name: '7 days' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(MADE));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe('/api/account/tokens');
    expect(asked[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(asked[0]!.init?.body))).toEqual({
      name: 'Claude Code · desktop',
      scopes: ['read', 'workspace-edit'],
      days: 7,
    });
  });

  it('shows a refusal from the API with its reason, and keeps what was typed', async () => {
    serve({
      status: 400,
      body: { error: 'You already have a working token named “Claude.ai connector”.' },
    });
    const { dialog, onMade } = open();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'Claude.ai connector',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'You already have a working token named “Claude.ai connector”.',
    );
    expect(onMade).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveProperty(
      'value',
      'Claude.ai connector',
    );
  });

  it('says so when wechart didn’t answer, and nothing was kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { dialog } = open();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'laptop');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'The token wasn’t made: wechart didn’t answer. Nothing was kept.',
    );
  });

  it('stops a name at 100 characters', async () => {
    const { dialog } = open();
    const name = within(dialog).getByRole('textbox', { name: /^Name/ });
    expect(name.getAttribute('maxlength')).toBe('100');
  });
});

describe('a user read-only in every folder (T769, AC-469; design 18, A5)', () => {
  it('sees Workspace edit and Proposals and jobs disabled, with the reason', () => {
    const { dialog } = open({ readWrite: false });
    for (const scope of ['Workspace edit', 'Proposals and jobs']) {
      const box = within(dialog).getByRole('checkbox', { name: new RegExp(`^${scope}`) });
      expect(box).toHaveProperty('disabled', true);
      expect(box).toHaveProperty('checked', false);
      const reason = document.getElementById(box.getAttribute('aria-describedby') ?? '');
      expect(reason?.textContent).toContain(
        'You have no My workspace, so this wouldn’t let a client do anything.',
      );
    }
    expect(within(dialog).getByRole('checkbox', { name: /^Read/ })).toHaveProperty('checked', true);
  });
});

describe('closing it (T769; rule 85)', () => {
  it('closes at once on Cancel or Esc with nothing typed', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks first when a name was typed', async () => {
    const { dialog, onClose } = open();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'laptop');
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    const asking = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    await userEvent.click(within(asking).getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps editing on Esc at the question, focus back on the name', async () => {
    const { dialog, onClose } = open();
    const name = within(dialog).getByRole('textbox', { name: /^Name/ });
    await userEvent.type(name, 'laptop');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name);
  });
});
