import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProposeFlow } from './ProposeFlow';

/**
 * T358 (AC-284; design 05, states A and F): proposing a workspace item. What
 * proposing would do is checked as the dialog opens (`POST
 * /api/proposals/check`); Propose sends it with the description; a refusal,
 * from the check or from the proposal itself, is said in the API's words.
 */
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const CHECKED = {
  targetFolderId: 'emea',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  items: [
    {
      kind: 'chart',
      id: 'c1',
      title: 'Margin',
      landsIn: 'emea',
      landsInPath: ['Shared', 'Sales', 'EMEA'],
      replaces: null,
    },
  ],
};

function shown(serve: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => serve(url, init));
  vi.stubGlobal('fetch', fetchMock);
  const onProposed = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProposeFlow
        item={{ kind: 'chart', id: 'c1', title: 'Margin' }}
        targetPath={['Shared', 'Sales', 'EMEA']}
        onProposed={onProposed}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { fetchMock, onProposed, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proposing a workspace item (T358, AC-284)', () => {
  it('checks as it opens, then proposes with the description', async () => {
    const { fetchMock, onProposed } = shown((url, init) => {
      if (url === '/api/proposals/check') return answer(200, CHECKED);
      if (url === '/api/proposals' && init?.method === 'POST')
        return answer(201, { id: 'p1', status: 'open' });
      return answer(404, {});
    });
    const dialog = await screen.findByRole('dialog', { name: 'Propose to Sales / EMEA' });
    expect((await within(dialog).findByTestId('propose-item')).textContent).toBe(
      'Chart · Margin — new in this folder',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: /What changed/ }), 'Adds it.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Propose' }));
    await vi.waitFor(() => {
      // With the target's path as checked (T357: a restore's "Proposed … to Sales / EMEA").
      expect(onProposed).toHaveBeenCalledWith({ id: 'p1', status: 'open' }, [
        'Shared',
        'Sales',
        'EMEA',
      ]);
    });
    const sent = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/proposals' && init?.method === 'POST',
    )!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({
      kind: 'chart',
      id: 'c1',
      description: 'Adds it.',
    });
  });

  it('says why it can’t be proposed, from the check, before anything is typed', async () => {
    shown((url) =>
      url === '/api/proposals/check'
        ? answer(409, {
            error: 'It is waiting for review already: its proposal must be decided first.',
          })
        : answer(404, {}),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Propose to Sales / EMEA' });
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Can’t propose: It is waiting for review already: its proposal must be decided first.',
    );
  });

  // T723 (AC-424, AC-422): a name in use, from the check or the proposal,
  // said in the API's words alone: nothing of where it is held.
  it('says a name in use as the API does, from the check and from the proposal', async () => {
    const inUse = 'The name “Margin_cube” is already in use, so it wasn’t proposed.';
    shown((url) =>
      url === '/api/proposals/check'
        ? answer(409, { error: inUse, names: ['Margin_cube'] })
        : answer(404, {}),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Propose to Sales / EMEA' });
    expect((await within(dialog).findByRole('alert')).textContent).toBe(`Can’t propose: ${inUse}`);
    cleanup();

    shown((url, init) => {
      if (url === '/api/proposals/check') return answer(200, CHECKED);
      if (url === '/api/proposals' && init?.method === 'POST')
        return answer(409, { error: inUse, names: ['Margin_cube'] });
      return answer(404, {});
    });
    const again = await screen.findByRole('dialog', { name: 'Propose to Sales / EMEA' });
    await within(again).findByTestId('propose-item');
    await userEvent.click(within(again).getByRole('button', { name: 'Propose' }));
    expect((await within(again).findByRole('alert')).textContent).toBe(inUse);
  });

  it('says a refused proposal in the API’s words, and stays open', async () => {
    const { onProposed } = shown((url, init) => {
      if (url === '/api/proposals/check') return answer(200, CHECKED);
      if (url === '/api/proposals' && init?.method === 'POST')
        return answer(409, { error: 'It is waiting for review already.' });
      return answer(404, {});
    });
    const dialog = await screen.findByRole('dialog', { name: 'Propose to Sales / EMEA' });
    await within(dialog).findByTestId('propose-item');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Propose' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'It is waiting for review already.',
    );
    expect(onProposed).not.toHaveBeenCalled();
  });
});
