import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';
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
});
