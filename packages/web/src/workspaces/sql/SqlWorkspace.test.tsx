import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { SqlWorkspace } from './SqlWorkspace';

/**
 * T796 (AC-446): WHEN a Super-Admin or a read-write member opens SQL runner,
 * THE SYSTEM SHALL show the workspace at `/sql`; and IF anyone else opens
 * `/sql`, THEN THE SYSTEM SHALL show them none of it.
 * Fails when: a read-only user sees the workspace or any of its content.
 */
const signedIn = (who: Partial<Me>): Me => ({
  name: 'Someone',
  groups: [],
  superAdmin: false,
  readWrite: false,
  security: 'oidc',
  ...who,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAs(me: Me | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me !== undefined) client.setQueryData(ME_QUERY.queryKey, me);
  render(
    <QueryClientProvider client={client}>
      <SqlWorkspace />
    </QueryClientProvider>,
  );
}

describe('the SQL runner workspace, by role (T796, AC-446)', () => {
  it('shows a read-write member the workspace', () => {
    renderAs(signedIn({ readWrite: true }));

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Not found' })).toBeNull();
  });

  it('shows a Super-Admin the workspace', () => {
    renderAs(signedIn({ superAdmin: true }));

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
  });

  it('shows the single user with sign-in off the workspace', () => {
    renderAs({ name: 'admin', groups: [], superAdmin: true, readWrite: true, security: 'off' });

    expect(screen.getByRole('region', { name: 'SQL runner' })).toBeTruthy();
  });

  it('shows a read-only user Not found and none of the workspace', () => {
    renderAs(signedIn({ groups: ['sales-ro'] }));

    expect(screen.getByRole('heading', { name: 'Not found' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
  });

  it('shows nothing of the workspace until who is signed in is known (fail closed)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderAs(undefined);

    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Not found' })).toBeNull();
  });

  it('shows Not found, and none of the workspace, when who is signed in can’t be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );
    renderAs(undefined);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'SQL runner' })).toBeNull();
  });
});
