import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccelerationPanel } from '../../editor/AccelerationPanel';
import { FieldList } from '../../editor/FieldList';
import { TileLoadError } from '../../query/loadTile';
import { SecurityPreview } from '../../query/securityPreview';
import { ScopeUnavailable, missingScopeOf } from '../../query/scopes';
import { TileError } from '../../tiles/TileError';
import { BuildPanel } from '../jobs/BuildPanel';
import { Scopes } from './Scopes';

/**
 * T176 / AC-170: THE SYSTEM SHALL show which API scopes the configured
 * context has, and mark a screen as unavailable when its scope is missing.
 * Fails when: a screen fails with an error instead of reporting the missing
 * scope.
 *
 * The API probes each scope with wechart's token (`/api/cube-scopes`); Cube
 * refuses a request whose scope is missing with "API scope is missing:
 * <scope>" (research/cube/api-scope-probes.md).
 */
/** `url` refused its scope as the API relays Cube's refusal; anything else answered empty. */
function refusing(url: string, scope: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === url
        ? Response.json(
            { error: `API scope is missing: ${scope}`, source: 'cube' },
            { status: 403 },
          )
        : Response.json({}),
    ),
  );
}

function answering(scopes: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/cube-scopes'
        ? Response.json(scopes)
        : new Response('not found', { status: 404 }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the API scopes wechart’s context has', () => {
  it('lists each scope with its state, as an icon and words, and what needs it', async () => {
    answering({
      meta: 'granted',
      data: 'granted',
      sql: 'granted',
      graphql: 'unknown',
      jobs: 'missing',
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Scopes />
      </QueryClientProvider>,
    );

    const table = await screen.findByRole('table', { name: 'Cube API scopes' });
    const row = async (scope: string) =>
      (await within(table).findByRole('row', { name: new RegExp(`^${scope} `) })).textContent;
    expect(await row('jobs')).toContain('Missing');
    expect(await row('jobs')).toContain('Building pre-aggregations');
    expect(await row('data')).toContain('Granted');
    expect(await row('graphql')).toContain('Unknown');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
  });
});

describe('a screen whose scope is missing', () => {
  it('reads the scope from Cube’s refusal, and nothing from any other failure', () => {
    expect(missingScopeOf(new Error('API scope is missing: jobs'))).toBe('jobs');
    expect(missingScopeOf(new Error('Invalid token'))).toBeUndefined();
    expect(missingScopeOf('API scope is missing: nonsense')).toBeUndefined();
  });

  it('is the build panel, when the probe says wechart lacks jobs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/cube-scopes')
          return Response.json({
            meta: 'granted',
            data: 'granted',
            sql: 'granted',
            graphql: 'granted',
            jobs: 'missing',
          });
        if (url === '/api/preaggregations')
          return Response.json([{ id: 'orders.by_status', type: 'rollup' }]);
        return new Response('not found', { status: 404 });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BuildPanel />
      </QueryClientProvider>,
    );

    const said = await screen.findByTestId('scope-unavailable');
    expect(said.textContent).toContain('Building pre-aggregations is unavailable');
    expect(screen.queryByRole('button', { name: /^Build / })).toBeNull();
  });

  it('is the build panel, when Cube refuses a build for jobs, rather than its error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // The probe could not tell: the refusal is what says it.
        if (url === '/api/cube-scopes')
          return Response.json({
            meta: 'granted',
            data: 'granted',
            sql: 'granted',
            graphql: 'granted',
            jobs: 'unknown',
          });
        if (url === '/api/preaggregations')
          return Response.json([{ id: 'orders.by_status', type: 'rollup' }]);
        if (url === '/api/builds')
          return Response.json({ error: 'API scope is missing: jobs' }, { status: 403 });
        return new Response('not found', { status: 404 });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BuildPanel />
      </QueryClientProvider>,
    );

    // From its pane, a row click only selecting (design 16, J; T611).
    await userEvent.click(await screen.findByRole('button', { name: /^orders\.by_status/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Build (all|now)/ }));

    const said = await screen.findByTestId('scope-unavailable');
    expect(said.textContent).toContain('jobs');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is a chart tile, when Cube refuses its query for data, rather than its error', () => {
    render(
      <TileError
        error={new TileLoadError('API scope is missing: data', { measures: ['orders.count'] }, 403)}
      />,
    );

    expect(screen.getByTestId('scope-unavailable').textContent).toContain(
      'This chart is unavailable',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * From T176's review: each screen that asks Cube, refused its scope, says
   * so — the field list (meta), the acceleration panel (sql), listing
   * pre-aggregations (meta) — and under a previewed context it is that
   * context's scope, not wechart's.
   */
  it('is the chart editor’s field list, refused meta, in Cube’s words kept', async () => {
    refusing('/api/meta', 'meta');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <FieldList />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId('scope-unavailable')).textContent).toContain(
      'The model’s fields is unavailable',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is the acceleration panel, refused sql', async () => {
    refusing('/api/acceleration', 'sql');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AccelerationPanel query={{ measures: ['orders.count'] }} />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId('scope-unavailable')).textContent).toContain('sql');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is listing pre-aggregations, refused meta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/preaggregations'
          ? Response.json({ error: 'API scope is missing: meta', source: 'cube' }, { status: 403 })
          : Response.json({ jobs: 'granted' }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BuildPanel />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId('scope-unavailable')).textContent).toContain(
      'Listing pre-aggregations is unavailable',
    );
  });

  it('names the previewed context, not wechart’s, under a preview', () => {
    render(
      <SecurityPreview.Provider value={{ groups: ['sales'] }}>
        <ScopeUnavailable scope="data" what="This chart" />
      </SecurityPreview.Provider>,
    );
    const said = screen.getByTestId('scope-unavailable').textContent;
    expect(said).toContain('this security context lacks');
    expect(said).not.toContain('wechart’s security context');
  });

  it('says it is unavailable and which scope wechart’s context lacks, not as an error', () => {
    render(<ScopeUnavailable scope="jobs" what="Building pre-aggregations" />);

    const said = screen.getByTestId('scope-unavailable');
    expect(said.textContent).toContain('Building pre-aggregations is unavailable');
    expect(said.textContent).toContain('jobs');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
