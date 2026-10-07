import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobsPage } from './JobsPage';

/**
 * T374 (design 16, pin 1): Run history joins Jobs' tabs, after
 * Pre-aggregations and before Queries, at its own address (`?tab=history`);
 * every tab's panel stays mounted, so a look at another tab drops nothing
 * being followed.
 */
const asked: string[] = [];

function serve(queued: unknown[] = [], preaggregations: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/preaggregations') return Response.json(preaggregations);
      // One not partitioned, built with Build now (T375, A2).
      if (url.startsWith('/api/jobs/partitions'))
        return Response.json({
          id: 'orders.main',
          name: 'orders.main',
          kind: 'whole',
          granularity: null,
          partitions: [
            { tableName: 't', start: null, end: null, state: 'built', lastBuiltAt: null },
          ],
        });
      if (url === '/api/builds') return Response.json({ tokens: ['t1'], runId: 'run-1' });
      if (url === '/api/builds/status')
        return Response.json([{ token: 't1', status: 'scheduled', finished: false }]);
      if (url === '/api/jobs/queue') return Response.json({ entries: queued, everyFolder: true });
      if (url.startsWith('/api/jobs/builds'))
        return Response.json({ records: [], starters: [], folders: [], everyFolder: true });
      if (url.startsWith('/api/jobs/queries/page')) return Response.json({ records: [], total: 0 });
      if (url === '/api/meta') return Response.json({ cubes: [] });
      if (url === '/api/cube-health') return Response.json({ cube: 'healthy', worker: 'healthy' });
      if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
}

function shown(search = '') {
  window.history.replaceState(null, '', `/jobs${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
  window.history.replaceState(null, '', '/');
});

describe('Jobs’ tabs (T374, design 16 pin 1)', () => {
  it('has Run history and Queue between Pre-aggregations and Queries', () => {
    serve();
    shown();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Pre-aggregations',
      'Run history',
      'Queue',
      'Queries',
    ]);
  });

  it('counts the queue’s entries in the user’s folders on its tab (T376, pin 1)', async () => {
    const entry = (key: string) => ({
      key,
      preAggregation: 'orders.main',
      name: 'orders.main',
      folderId: 'root',
      folderPath: ['Shared'],
      partition: null,
      granularity: null,
      state: 'queued',
      addedAt: '2026-10-02T12:00:00.000Z',
      starter: { kind: 'refresh-worker' },
      token: null,
      runId: null,
      cancellable: false,
    });
    serve([entry('a'), entry('b'), entry('c')]);
    shown();

    await vi.waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Queue/ }).textContent).toBe('Queue 3');
    });
  });

  it('opens the queue at ?tab=queue', async () => {
    serve();
    shown('?tab=queue');

    expect(screen.getByRole('tab', { name: /^Queue/ }).getAttribute('aria-selected')).toBe('true');
    expect((await screen.findByText('Nothing is queued or building')).tagName).toBe('B');
  });

  it('opens Run history at ?tab=history, and keeps every panel mounted', async () => {
    serve();
    shown('?tab=history');

    expect(screen.getByRole('tab', { name: 'Run history' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    // Its empty state's heading: Run history read, and shown.
    expect((await screen.findByText('No builds in the last 7 days')).tagName).toBe('B');
    await userEvent.click(screen.getByRole('tab', { name: 'Pre-aggregations' }));
    // Hidden, not gone.
    const panel = document.getElementById(
      screen.getByRole('tab', { name: 'Run history' }).getAttribute('aria-controls') ?? '',
    );
    expect(panel?.hidden).toBe(true);
    expect(panel?.textContent).toContain('No builds in the last 7 days');
  });

  /** T375 (design 16, pin 14 and A1): the pane's ways to Run history and to Queue. */
  it('opens Run history on the open pre-aggregation’s builds, of all time, from its pane', async () => {
    serve([], [{ id: 'orders.main', type: 'rollup' }]);
    shown('?preagg=orders.main');
    const itsBuilds = () =>
      asked.filter((url) => url === '/api/jobs/builds?preagg=orders.main&within=all').length;

    // The pane's own read of its last builds, and none yet of Run history's.
    await screen.findByText(/^None yet\./);
    expect(itsBuilds()).toBe(1);
    await userEvent.click(screen.getByRole('link', { name: 'All its builds in Run history' }));
    expect(screen.getByRole('tab', { name: 'Run history' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const panel = document.getElementById(
      screen.getByRole('tab', { name: 'Run history' }).getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    const only = await within(panel).findByRole('button', {
      name: 'Show every pre-aggregation’s builds',
    });
    expect(only.parentElement?.textContent).toContain('Only orders.main');
    expect(within(panel).getByRole<HTMLSelectElement>('combobox', { name: 'Time' }).value).toBe(
      'all',
    );
    // Run history's, narrowed to it.
    await vi.waitFor(() => {
      expect(itsBuilds()).toBe(2);
    });

    await userEvent.click(only);
    expect(
      within(panel).queryAllByRole('button', { name: 'Show every pre-aggregation’s builds' }),
    ).toHaveLength(0);

    // Back to the pane, and the same link again: narrowed to it again (T375's review).
    await userEvent.click(screen.getByRole('tab', { name: 'Pre-aggregations' }));
    await userEvent.click(screen.getByRole('link', { name: 'All its builds in Run history' }));
    expect(
      (await within(panel).findByRole('button', { name: 'Show every pre-aggregation’s builds' }))
        .parentElement?.textContent,
    ).toContain('Only orders.main');
  });

  it('says what it started, and Follow it in Queue opens the queue', async () => {
    serve([], [{ id: 'orders.main', type: 'rollup' }]);
    shown('?preagg=orders.main');

    await userEvent.click(await screen.findByRole('button', { name: 'Build now' }));
    const toast = await screen.findByText('Building orders.main.');
    expect(toast.textContent).toBe('Building orders.main.');
    // One job, so "it"; "them" for several (design 16, A1).
    await userEvent.click(screen.getByRole('button', { name: 'Follow it in Queue' }));
    expect(screen.getByRole('tab', { name: /^Queue/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('reads Run history only once its tab is opened', async () => {
    serve();
    shown();
    // Pre-aggregations read, and empty (design 16, G3; T560).
    await screen.findByText('No pre-aggregations in your folders');
    expect(asked.filter((url) => url.startsWith('/api/jobs/builds'))).toEqual([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Run history' }));
    await screen.findByText('No builds in the last 7 days');
    expect(asked.filter((url) => url.startsWith('/api/jobs/builds'))).toHaveLength(1);
  });
});
