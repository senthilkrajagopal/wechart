import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

/**
 * T197 / AC-184 on the page that owns the save: an edit session kept after a
 * failed save — or at any time — must not be taken down by the page itself.
 *
 * The page answers from a server stubbed per URL. Every call is answered from
 * what the test says the server holds at that moment.
 */
const dashboardBody = (title: string) => ({
  schemaVersion: 1,
  title,
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Overview', items: [] }],
});

function serve(answer: (method: string, url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      answer(init?.method ?? 'GET', String(input)),
    ),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function page(client: QueryClient, dashboardId: string) {
  return (
    <QueryClientProvider client={client}>
      <DashboardPage dashboardId={dashboardId} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the dashboard page', () => {
  it('keeps the dashboard, and an edit session on it, when fetching it again fails', async () => {
    /**
     * The library fetches a query again on its own — on reconnecting, once
     * its data is stale (installed query-core, `queryClient.ts` 1032–1034 and
     * `queryObserver.ts` 862–875) — and a failed fetch keeps the data it had
     * (research, Answer 4). The page put an error in place of the whole
     * dashboard all the same, taking an edit session with it: AC-184's
     * failing state, reached without a save.
     */
    let reachable = true;
    serve((_method, url) =>
      url === '/api/documents/dashboard/d1' && reachable
        ? json(200, { id: 'd1', body: dashboardBody('Revenue'), version: 1 })
        : json(500, { error: 'Internal error' }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client, 'd1'));

    await screen.findByRole('heading', { name: 'Revenue' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    reachable = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['dashboard', 'd1'] });
      // The page hears of it a moment later: the library tells a query's
      // users on a timeout (research, Answer 7).
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The fetch did fail: this is the state the page is answering.
    expect(client.getQueryState(['dashboard', 'd1'])?.status).toBe('error');

    expect(screen.queryByTestId('dashboard-error')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Dashboard editing' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
  });

  it('does not carry one dashboard’s save failure onto the next', async () => {
    serve((method, url) => {
      if (method === 'PUT') return json(409, { message: 'stale' });
      if (url === '/api/documents/dashboard/d1')
        return json(200, { id: 'd1', body: dashboardBody('Revenue'), version: 1 });
      if (url === '/api/documents/dashboard/d2')
        return json(200, { id: 'd2', body: dashboardBody('Costs'), version: 1 });
      return json(404, { error: 'Not found' });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Costs opened first, so it is already in hand when the user comes back
    // to it: the page moves straight to it, with no loading step between.
    const { rerender } = render(page(client, 'd2'));
    await screen.findByRole('heading', { name: 'Costs' });
    rerender(page(client, 'd1'));
    await screen.findByRole('heading', { name: 'Revenue' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByTestId('save-failed');

    rerender(page(client, 'd2'));
    await screen.findByRole('heading', { name: 'Costs' });

    expect(screen.queryByTestId('save-failed')).toBeNull();
  });
});
