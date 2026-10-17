import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../shell/ThemeProvider';
import { SecuritySurface } from './SecuritySurface';

/**
 * T500 (AC-295, AC-265; design 08 of 2026-09-27, state D; T500's review):
 * Security's gate. A Super-Admin opens its tabs; anyone else signed in gets
 * the same Not found as a missing page; with sign-in off, the same tabs, the
 * single user's (security-Q1, T699); and when who is signed in can't be read,
 * nothing of it.
 */
function answering(me: { status: number; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/me') return Response.json(me.body ?? {}, { status: me.status });
      if (url === '/api/model/files') return Response.json({ files: [] });
      return Response.json({}, { status: 404 });
    }),
  );
}
const signedIn = (superAdmin: boolean) => ({
  status: 200,
  body: { name: 'Someone', groups: [], superAdmin, security: 'oidc' },
});
const single = {
  status: 200,
  body: { name: 'admin', groups: [], superAdmin: true, security: 'off' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function open(tab: 'policies' | 'preview' | 'tokens' | undefined) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider initial="light">
        <SecuritySurface tab={tab} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
const heading = async () => (await screen.findByRole('heading', { level: 1 })).textContent;

describe('Security’s gate (T500)', () => {
  it('opens its tabs to a Super-Admin', async () => {
    answering(signedIn(true));
    open('preview');
    expect(await heading()).toBe('Security');
  });

  it('is Not found to anyone else signed in', async () => {
    answering(signedIn(false));
    open('policies');
    expect(await heading()).toBe('Not found');
    expect(screen.queryByRole('table', { name: 'Access policies' })).toBeNull();
  });

  it('opens Access tokens to a Super-Admin, and to no one else (T772, AC-470)', async () => {
    answering(signedIn(true));
    open('tokens');
    expect(await heading()).toBe('Security');
    expect(screen.getByRole('link', { name: 'Access tokens' }).getAttribute('aria-current')).toBe(
      'page',
    );
    cleanup();
    answering(signedIn(false));
    open('tokens');
    expect(await heading()).toBe('Not found');
  });

  it('has no Access tokens tab with sign-in off: there is one user (T772; design 18, H)', async () => {
    answering(single);
    open('tokens');
    expect(await heading()).toBe('Not found');
  });

  it('is Not found, never open, when who is signed in can’t be read', async () => {
    answering({ status: 500, body: { error: 'down' } });
    open('policies');
    expect(await heading()).toBe('Not found');
  });

  /** T699 (security-Q1, R76): with sign-in off, the same tabs as a Super-Admin's. */
  it('opens its tabs with sign-in off, Preview as groups at its address', async () => {
    answering(single);
    open('policies');
    expect(await heading()).toBe('Security');
  });

  it('opens Preview as groups with sign-in off, but no address it doesn’t know', async () => {
    answering(single);
    open('preview');
    expect(await heading()).toBe('Security');
    expect(screen.getByRole('region', { name: 'Preview as groups' }).tagName).toBe('SECTION');
    cleanup();
    answering(single);
    open(undefined);
    expect(await heading()).toBe('Not found');
  });

  it('says it is loading while who is signed in is asked', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    open('policies');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });
});
