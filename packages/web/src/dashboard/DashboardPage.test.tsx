import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';
import { StaleSaveError } from './edit/save';

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

function serve(
  answer: (method: string, url: string, body: string | undefined) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      answer(
        init?.method ?? 'GET',
        String(input),
        typeof init?.body === 'string' ? init.body : undefined,
      ),
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

  /**
   * T198 / AC-015: WHEN two browser sessions edit the same dashboard and the
   * second saves over a newer version, THE SYSTEM SHALL refuse the save and
   * tell the user the dashboard changed.
   *
   * The case these add: the dashboard fetched again while an edit is open —
   * the library does so on reconnecting, once the data is stale — bringing in
   * someone else's save. The edit began before their change, so its save must
   * be checked against the version it began from; checked against theirs, it
   * went through and overwrote their change without a word.
   *
   * The server here is the real one's rule: a save is refused unless it names
   * the version stored, and otherwise stored, moving the version on.
   */
  function dashboardServer() {
    const stored = { version: 1, title: 'Revenue' };
    const sent: { version: number; title: string }[] = [];
    let held: Promise<void> | undefined;
    serve(async (method, url, body) => {
      if (method === 'PUT') {
        const request = JSON.parse(body ?? 'null') as { version: number; body: { title: string } };
        sent.push({ version: request.version, title: request.body.title });
        if (held !== undefined) await held;
        if (request.version !== stored.version) return json(409, { message: 'stale' });
        stored.version += 1;
        stored.title = request.body.title;
        return json(200, { version: stored.version });
      }
      return url === '/api/documents/dashboard/d1'
        ? json(200, { id: 'd1', body: dashboardBody(stored.title), version: stored.version })
        : json(404, { error: 'Not found' });
    });
    return {
      stored,
      sent,
      /** Someone else's save, straight to the server. */
      savedElsewhere(title: string) {
        stored.version += 1;
        stored.title = title;
      },
      /** Holds every save until the returned function lets them through. */
      holdSaves() {
        let release = () => {};
        held = new Promise((resolve) => {
          release = resolve;
        });
        return () => {
          held = undefined;
          release();
        };
      },
    };
  }

  /** The dashboard fetched again, as the library does on its own — and heard by the page. */
  async function fetchedAgain(client: QueryClient) {
    await act(async () => {
      await client.refetchQueries({ queryKey: ['dashboard', 'd1'] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  const conflict = new StaleSaveError('dashboard').message;

  async function rename(to: string) {
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, to);
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  }

  it('refuses an edit session’s save over a version fetched in after it began', async () => {
    const server = dashboardServer();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client, 'd1'));
    await screen.findByRole('heading', { name: 'Revenue' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    server.savedElsewhere('Revenue (theirs)');
    await fetchedAgain(client);
    // Their version is what the page now holds.
    expect(client.getQueryData<{ version: number }>(['dashboard', 'd1'])?.version).toBe(2);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByTestId('save-failed')).textContent).toBe(conflict);
    expect(server.sent).toEqual([{ version: 1, title: 'Revenue' }]);
    expect(server.stored.title).toBe('Revenue (theirs)');
  });

  it('refuses a view-mode settings save over a version fetched in after the page opened', async () => {
    // The settings page keeps what it opened with as its draft, so its save
    // is an edit begun then, and checked against the version of then.
    const server = dashboardServer();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client, 'd1'));
    await screen.findByRole('heading', { name: 'Revenue' });
    await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));

    server.savedElsewhere('Revenue (theirs)');
    await fetchedAgain(client);
    expect(client.getQueryData<{ version: number }>(['dashboard', 'd1'])?.version).toBe(2);

    await rename('Renamed');

    expect((await screen.findByTestId('save-failed')).textContent).toBe(conflict);
    expect(server.sent).toEqual([{ version: 1, title: 'Renamed' }]);
    expect(server.stored.title).toBe('Revenue (theirs)');
  });

  it('checks an edit session begun while a view-mode save was still out against its own start', async () => {
    /**
     * A rename saved from the settings page in view mode, and Edit pressed
     * before that save has answered: the session begins from the document
     * before the rename. Once the rename lands, the session's save must be
     * refused — it would put the old name back — not waved through because
     * the rename's success forgot where the session began.
     */
    const server = dashboardServer();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client, 'd1'));
    await screen.findByRole('heading', { name: 'Revenue' });

    const letThrough = server.holdSaves();
    await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    await rename('Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    letThrough();
    await vi.waitFor(() => {
      expect(server.stored.title).toBe('Renamed');
    });
    await fetchedAgain(client);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByTestId('save-failed')).textContent).toBe(conflict);
    expect(server.sent).toEqual([
      { version: 1, title: 'Renamed' },
      { version: 1, title: 'Revenue' },
    ]);
    expect(server.stored.title).toBe('Renamed');
  });

  it('checks a view-mode save after a session against the version stored now', async () => {
    /**
     * An edit begun after a session has saved begins from what that save
     * stored: checked against the ended session's version, it would be
     * refused as stale over the very save before it.
     */
    const server = dashboardServer();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client, 'd1'));
    await screen.findByRole('heading', { name: 'Revenue' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Edit' });

    await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    await rename('Renamed');

    // Stored: the server took it.
    await vi.waitFor(() => {
      expect(server.stored).toEqual({ version: 3, title: 'Renamed' });
    });
    expect(server.sent).toEqual([
      { version: 1, title: 'Revenue' },
      { version: 2, title: 'Renamed' },
    ]);
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
