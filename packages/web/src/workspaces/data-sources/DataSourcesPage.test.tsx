import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataSourcesPage } from './DataSourcesPage';

/**
 * T363 (AC-158): the Data sources page offers "+ Data source", as the
 * approved prototype does (admin-sources.js), to those with a workspace. It
 * makes the source in My workspace, asking where it is to go (AC-282).
 */
function serve(
  me: Record<string, unknown>,
  /** What `GET /api/cube-store` answers (T536): none is `404`, not this user's. */
  cubeStore: Record<string, unknown> | null = null,
) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      if (url === '/api/me') return Response.json(me);
      if (url === '/api/data-sources') return Response.json([]);
      if (url === '/api/folders/targets')
        return Response.json([{ id: 'f-sales', path: ['Finance', 'Sales'] }]);
      if (url === '/api/cube-store')
        return cubeStore === null
          ? Response.json({ error: 'There’s no such data source.' }, { status: 404 })
          : Response.json(cubeStore);
      // Its switch, turned on: the page reads it again.
      if (url === '/api/cube-store/sql-runner' && cubeStore !== null) {
        Object.assign(cubeStore, { on: true, runs: true });
        return Response.json({ on: true });
      }
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

/**
 * T536 (AC-384; design 15's P5 and H1): Cube Store in Data sources. While
 * off, its switch is in the page's header ⋯, for Super-Admins only, and it is
 * listed nowhere. Once on, it is a row of its own, "Cube Store · Shared ·
 * Cube Store · every folder's rollups", to whoever may use it.
 */
const SUPER = {
  name: 'Ada Admin',
  groups: ['wechart-super-admins'],
  superAdmin: true,
  readWrite: true,
  security: 'oidc',
};
const WRITER = {
  name: 'Writer',
  groups: ['sales-rw'],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
};

describe('Cube Store in Data sources (T536, AC-384)', () => {
  it('offers a Super-Admin Turn on… for Cube Store in the header ⋯ while off, and lists it nowhere', async () => {
    const user = userEvent.setup();
    serve(SUPER, { on: false, runs: false });
    page();
    await user.click(await screen.findByRole('button', { name: 'More actions for Data sources' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Turn on the SQL runner for Cube Store…' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Turn on the SQL runner for Cube Store?' }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Cube Store' })).toBeNull();
  });

  it('once turned on there, lists it, with focus on its row: the ⋯ is gone (T536’s review)', async () => {
    const user = userEvent.setup();
    serve(SUPER, { on: false, runs: false });
    page();
    await user.click(await screen.findByRole('button', { name: 'More actions for Data sources' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Turn on the SQL runner for Cube Store…' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Turn on the SQL runner for Cube Store?' });
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    const link = await screen.findByRole('link', { name: 'Cube Store' });
    await waitFor(() => {
      expect(document.activeElement).toBe(link);
    });
    expect(screen.queryByRole('button', { name: 'More actions for Data sources' })).toBeNull();
  });

  it('lists Cube Store once on, to one who may use it, opening its page; no switch for them', async () => {
    serve(WRITER, { on: true, confirmedBy: { name: 'Ada Admin' }, runs: true });
    page();
    const link = await screen.findByRole('link', { name: 'Cube Store' });
    expect(link.getAttribute('href')).toBe('/explore/data-sources/cubestore');
    expect(screen.getByTestId('source-cubestore').textContent).toBe(
      'Cube StoreSharedCube Storeevery folder’s rollups',
    );
    expect(screen.queryByRole('button', { name: 'More actions for Data sources' })).toBeNull();
  });

  it('shows neither to one it isn’t for', async () => {
    serve(WRITER);
    page();
    await screen.findByText(/Every data source you can see/i);
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Cube Store' })).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'More actions for Data sources' })).toBeNull();
  });
});
