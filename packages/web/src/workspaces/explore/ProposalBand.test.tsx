import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProposalBand } from './ProposalBand';

/**
 * T358 (AC-290, AC-284; design 05, state M): the band on the author's
 * workspace item. Waiting: since when and where to, with a link to the
 * proposal, and a note when the item changed since. Rejected: who and when,
 * the reason as a quote (or "No reason given"), Propose again… and Dismiss,
 * which lasts until the item is proposed again (R42.1). Nothing when it was
 * never proposed, or when its rejection was dismissed.
 */
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const proposal = (over: Record<string, unknown>) => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'd1',
  status: 'open',
  proposedAt: new Date(2026, 8, 27, 14, 5).toISOString(),
  targetPath: ['Shared', 'Sales', 'EMEA'],
  items: [{ kind: 'dashboard', id: 'd1', version: 3 }],
  decision: null,
  dismissedAt: null,
  ...over,
});

let lastClient: QueryClient | undefined;

function shown(latest: unknown, status = 200, currentVersion = 3) {
  // As the API keeps it: dismissed once Dismiss is sent.
  let current = latest;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/proposals?')) return answer(status, current);
    if (url === '/api/proposals/p1/dismiss' && init?.method === 'POST') {
      current = { ...(latest as object), dismissedAt: new Date().toISOString() };
      return answer(200, current);
    }
    return answer(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  const onProposeAgain = vi.fn();
  // As the app's client keeps answers: fresh for 5 minutes (main.tsx).
  lastClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
  });
  render(
    <QueryClientProvider client={lastClient}>
      <p>page</p>
      <ProposalBand
        kind="dashboard"
        id="d1"
        currentVersion={currentVersion}
        onProposeAgain={onProposeAgain}
        now={new Date(2026, 8, 27, 18, 0)}
      />
    </QueryClientProvider>,
  );
  return { fetchMock, onProposeAgain };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the band on the author’s item (T358, AC-290)', () => {
  it('says it waits for review, since when and where to, with a link to it', async () => {
    shown(proposal({}));
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(band.textContent).toContain(
      'Waiting for review since 14:05 · proposed to Sales / EMEA.',
    );
    expect(within(band).getByRole('link', { name: 'View proposal' }).getAttribute('href')).toBe(
      '/reviews?tab=mine&selected=p1',
    );
    expect(band.textContent).not.toContain('changed it since');
  });

  it('says changes made since proposing aren’t in the proposal', async () => {
    shown(proposal({}), 200, 4);
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(band.textContent).toContain(
      'You’ve changed it since proposing; those changes aren’t in the proposal.',
    );
  });

  it('shows a rejection with who, when and the reason, and offers Propose again and Dismiss', async () => {
    const { fetchMock, onProposeAgain } = shown(
      proposal({
        status: 'rejected',
        decision: {
          by: { key: 'ada', name: 'Ada Admin' },
          at: new Date(2026, 8, 26, 16, 40).toISOString(),
          reason: 'Keep the median.',
        },
      }),
    );
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(within(band).getByTestId('band-decision').textContent).toBe(
      'Rejected by Ada Admin · Yesterday 16:40',
    );
    expect(within(band).getByRole('blockquote').textContent).toBe('Keep the median.');
    await userEvent.click(within(band).getByRole('button', { name: 'Propose again…' }));
    expect(onProposeAgain).toHaveBeenCalled();
    await userEvent.click(within(band).getByRole('button', { name: 'Dismiss' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Proposal' })).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/dismiss',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('writes an older day as design 05 does, "20 Sep, 09:15"', async () => {
    shown(
      proposal({
        status: 'rejected',
        decision: {
          by: { key: 'ada', name: 'Ada Admin' },
          at: new Date(2026, 8, 20, 9, 15).toISOString(),
          reason: null,
        },
      }),
    );
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(within(band).getByTestId('band-decision').textContent).toBe(
      'Rejected by Ada Admin · 20 Sep, 09:15',
    );
  });

  it('says so when a rejection gave no reason', async () => {
    shown(
      proposal({
        status: 'rejected',
        decision: {
          by: { key: 'ada', name: 'Ada Admin' },
          at: new Date().toISOString(),
          reason: null,
        },
      }),
    );
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(within(band).getByRole('blockquote').textContent).toBe('No reason given');
  });

  it('reads its own item when it went with another’s proposal (T358’s review)', async () => {
    // The dashboard d1 went with board b0's proposal, into its own folder.
    const { onProposeAgain } = shown(
      proposal({
        itemId: 'b0',
        targetPath: ['Shared', 'Sales'],
        items: [
          { kind: 'dashboard', id: 'b0', version: 9, landsInPath: ['Shared', 'Sales'] },
          { kind: 'dashboard', id: 'd1', version: 3, landsInPath: ['Shared', 'Sales', 'EMEA'] },
        ],
      }),
    );
    const band = await screen.findByRole('status', { name: 'Proposal' });
    expect(band.textContent).toContain('proposed to Sales / EMEA.');
    // Version 3 is d1's own, proposed as it is now: nothing changed since.
    expect(band.textContent).not.toContain('changed it since');
    expect(onProposeAgain).not.toHaveBeenCalled();
  });

  it('proposes again to where it lands, even when the check refuses (T358’s review)', async () => {
    const { onProposeAgain } = shown(
      proposal({
        status: 'rejected',
        items: [
          { kind: 'dashboard', id: 'd1', version: 3, landsInPath: ['Shared', 'Sales', 'EMEA'] },
        ],
        decision: {
          by: { key: 'ada', name: 'Ada Admin' },
          at: new Date().toISOString(),
          reason: null,
        },
      }),
    );
    const band = await screen.findByRole('status', { name: 'Proposal' });
    await userEvent.click(within(band).getByRole('button', { name: 'Propose again…' }));
    expect(onProposeAgain).toHaveBeenCalledWith(['Shared', 'Sales', 'EMEA']);
  });

  it('asks again each time the item is opened, so a decision since is shown (T358’s review)', async () => {
    const { fetchMock } = shown(proposal({}));
    await screen.findByRole('status', { name: 'Proposal' });
    const asks = () =>
      fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/proposals?')).length;
    expect(asks()).toBe(1);
    cleanup();
    // Opened again with the same cache, as navigating back does.
    render(
      <QueryClientProvider client={lastClient!}>
        <ProposalBand kind="dashboard" id="d1" onProposeAgain={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByRole('status', { name: 'Proposal' });
    await vi.waitFor(() => {
      expect(asks()).toBe(2);
    });
  });

  it('shows nothing for an item never proposed, or a dismissed rejection', async () => {
    shown({ error: 'It has not been proposed.' }, 404);
    await screen.findByText('page');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('status', { name: 'Proposal' })).toBeNull();
  });
});
