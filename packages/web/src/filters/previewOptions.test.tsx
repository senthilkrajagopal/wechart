import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';
import { ME_QUERY } from '../shell/me';
import { openFilter } from './testing';

/**
 * T172 (AC-166): a dashboard previewed as a security context asks all of its
 * queries as that context — a filter's own values too, which the context may
 * narrow — under a banner naming it.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't-note', kind: 'markdown', w: 3, text: 'Notes' }],
    },
  ],
  filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [{ name: 'orders.status', title: 'Status', type: 'string' }],
    },
  ],
};

const loads: unknown[] = [];

beforeEach(() => {
  loads.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/meta') return new Response(JSON.stringify(META));
      // The header's breadcrumb reads the folders (AC-195); that is no query.
      if (String(input) === '/api/folders') return new Response('[]');
      loads.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify({ data: [{ 'orders.status': 'shipped' }] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a dashboard previewed as a security context', () => {
  it('asks a filter’s values as that context, under a banner naming it', async () => {
    const context = { groups: ['sales'], is_employee: true };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardView
          dashboardId="d1"
          document={DOC}
          specs={{}}
          onSave={vi.fn()}
          preview={context}
          onExitPreview={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('preview-banner').textContent).toContain(
      'Previewing as {"groups":["sales"],"is_employee":true}',
    );
    await openFilter();
    await screen.findByRole('checkbox', { name: 'shipped' });
    await waitFor(() => {
      expect(loads.length).toBeGreaterThan(0);
    });
    for (const body of loads) expect(body).toMatchObject({ context });
  });

  // T630 (AC-166; design 08, state E, as drawn): with sign-in on, the banner
  // names the groups and then the dashboard.
  it('names the dashboard after the groups, with sign-in on', () => {
    const client = new QueryClient();
    client.setQueryData(ME_QUERY.queryKey, { name: 'Super Admin', security: 'oidc' });
    render(
      <QueryClientProvider client={client}>
        <DashboardView
          dashboardId="d1"
          document={DOC}
          specs={{}}
          onSave={vi.fn()}
          preview={{ groups: ['sales-ro', 'emea-viewers'] }}
          onExitPreview={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('preview-banner').textContent).toContain(
      'Previewing as sales-ro and emea-viewers · Sales',
    );
  });
});
