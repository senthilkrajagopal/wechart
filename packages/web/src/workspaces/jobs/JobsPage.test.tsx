import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function serve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/preaggregations') return Response.json([]);
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
  it('has Run history between Pre-aggregations and Queries', () => {
    serve();
    shown();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Pre-aggregations',
      'Run history',
      'Queries',
    ]);
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

  it('reads Run history only once its tab is opened', async () => {
    serve();
    shown();
    await screen.findByText(/declares no pre-aggregations/);
    expect(asked.filter((url) => url.startsWith('/api/jobs/builds'))).toEqual([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Run history' }));
    await screen.findByText('No builds in the last 7 days');
    expect(asked.filter((url) => url.startsWith('/api/jobs/builds'))).toHaveLength(1);
  });
});
