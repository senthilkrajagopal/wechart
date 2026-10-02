import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataSourcesPage } from './DataSourcesPage';

/**
 * T363 (AC-158): the Data sources page offers "+ Data source", as the
 * approved prototype does (admin-sources.js), to those with a workspace. It
 * makes the source in My workspace, asking where it is to go (AC-282).
 */
function serve(me: Record<string, unknown>) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      if (url === '/api/me') return Response.json(me);
      if (url === '/api/data-sources') return Response.json([]);
      if (url === '/api/folders/targets')
        return Response.json([{ id: 'f-sales', path: ['Finance', 'Sales'] }]);
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const page = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DataSourcesPage />
    </QueryClientProvider>,
  );

describe('adding a data source from Data sources (T363)', () => {
  it('opens the wizard in My workspace, with the folders it may go to', async () => {
    const user = userEvent.setup();
    const asked = serve({
      name: 'Writer',
      groups: ['sales-rw'],
      superAdmin: false,
      readWrite: true,
      security: 'oidc',
    });
    page();
    await user.click(await screen.findByRole('button', { name: '+ Data source' }));
    const wizard = await screen.findByRole('dialog', { name: 'New data source' });
    expect(asked).toContain('/api/folders/targets');
    // Its steps, the first current (T471, design 01).
    const steps = within(wizard).getByRole('list', { name: 'Steps' });
    expect(within(steps).getAllByRole('listitem')[0]?.textContent).toBe('1Type');
    expect(
      within(steps).getByText('Type').closest('[aria-current]')?.getAttribute('aria-current'),
    ).toBe('step');
  });

  it.each([
    // Read-only everywhere: no workspace (AC-277).
    ['a read-only user', { superAdmin: false, readWrite: false, security: 'oidc' }],
  ])('offers none to %s, who has no workspace to make one in', async (_who, me) => {
    serve({ name: 'Someone', groups: [], ...me });
    page();
    expect(await screen.findByRole('heading', { name: 'Data sources' })).toBeDefined();
    await screen.findByText(/Every data source you can see/i);
    expect(screen.queryByRole('button', { name: '+ Data source' })).toBeNull();
  });

  /**
   * With sign-in off since R52 ("Workspace-only now"): the single user makes
   * one in My workspace and proposes it, as a signed-in user does (T359,
   * AC-254). Phase 1 offered none: its data sources were Cube's environment's.
   */
  it('offers the single user one, with sign-in off, made in My workspace', async () => {
    const user = userEvent.setup();
    const asked = serve({
      name: 'admin',
      groups: [],
      superAdmin: true,
      readWrite: true,
      security: 'off',
    });
    page();
    await user.click(await screen.findByRole('button', { name: '+ Data source' }));
    expect(await screen.findByRole('dialog', { name: 'New data source' })).toBeDefined();
    expect(asked).toContain('/api/folders/targets');
  });
});
