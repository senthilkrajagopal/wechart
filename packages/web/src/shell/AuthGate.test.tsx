import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthGate } from './AuthGate';

/**
 * T321 (AC-251, AC-316): WHERE security is enabled, WHEN a request without a
 * signed-in session reaches a wechart page …, THE SYSTEM SHALL send it to the
 * configured OIDC provider's sign-in … returning no wechart content.
 * `Fails when: any page renders wechart content … without a signed-in session.`
 *
 * The page half in the app: nothing of it renders until `/api/me` has said who
 * is signed in; a 401 goes to sign-in, carrying where the user was. A session
 * that ends mid-work (AC-316's 12 hours) says so in a modal (references.md ›
 * Surface 1, "Session ended mid-work"), with only the product mark, that
 * sentence and Sign in, nothing of wechart behind it (direction.md rule 60).
 */
const answer = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const signedIn = { name: 'Wren Writer', groups: ['sales-rw'], superAdmin: false, security: 'oidc' };

describe('the page gate (T321, AC-251)', () => {
  it('renders nothing of the app until the API says who is signed in', async () => {
    let settle: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (settle = resolve))),
    );
    render(
      <AuthGate navigate={vi.fn()}>
        <p>wechart content</p>
      </AuthGate>,
    );
    expect(screen.queryByText('wechart content')).toBeNull();
    // Meanwhile the product mark and a state in words, with its icon (rule 3,
    // rule 60), rather than an empty page (T321's review).
    const opening = screen.getByRole('status');
    expect(opening.textContent).toContain('Opening wechart…');
    expect(opening.querySelector('svg[data-icon="run"]')).not.toBeNull();
    expect(screen.getByTestId('brand-mark')).toBeTruthy();
    await act(async () => {
      settle(new Response(JSON.stringify(signedIn), { status: 200 }));
      await Promise.resolve();
    });
    expect(await screen.findByText('wechart content')).toBeTruthy();
  });

  it('sends a request without a session to sign-in, returning to where it was, and renders nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(401, { error: 'unauthenticated' })),
    );
    window.history.replaceState(null, '', '/explore/dashboards/d1?page=2');
    const go = vi.fn();
    render(
      <AuthGate navigate={go}>
        <p>wechart content</p>
      </AuthGate>,
    );
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith(
        `/api/auth/login?returnTo=${encodeURIComponent('/explore/dashboards/d1?page=2')}`,
      );
    });
    expect(screen.queryByText('wechart content')).toBeNull();
  });

  it('renders the app with security off, and when the API can’t say who (it guards its own data)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => answer(500)),
    );
    render(
      <AuthGate navigate={vi.fn()}>
        <p>wechart content</p>
      </AuthGate>,
    );
    expect(await screen.findByText('wechart content')).toBeTruthy();
  });
});

describe('a session that ends mid-work (T321, AC-316)', () => {
  it('says so over the page when an API call answers 401, and signs in again from where the user was', async () => {
    const fetchMock = vi.fn((url: string) =>
      url === '/api/me' ? answer(200, signedIn) : answer(401, { error: 'unauthenticated' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/explore');
    const go = vi.fn();
    render(
      <AuthGate navigate={go}>
        <p>wechart content</p>
      </AuthGate>,
    );
    await screen.findByText('wechart content');
    // Some tile asks the API after the session has lapsed.
    await act(async () => {
      await fetch('/api/load');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Your session has ended' });
    // Described by its sentence, which focus on Sign in would otherwise skip.
    const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(
      'Sign in again to continue. Changes you haven’t saved in this editor will be lost.',
    );
    expect(dialog.textContent).toContain(
      'Sign in again to continue. Changes you haven’t saved in this editor will be lost.',
    );
    // Only the product mark, the sentence and the action: nothing of wechart
    // behind it (direction.md rule 60), and nobody sent away until they act.
    expect(screen.queryByText('wechart content')).toBeNull();
    expect(screen.getByTestId('brand-mark')).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(go).toHaveBeenCalledWith(`/api/auth/login?returnTo=${encodeURIComponent('/explore')}`);
  });

  it('takes only wechart’s own 401 for a session ending, not Cube’s passed on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/me'
          ? answer(200, signedIn)
          : answer(401, { error: 'Invalid token', source: 'cube' }),
      ),
    );
    render(
      <AuthGate navigate={vi.fn()}>
        <p>wechart content</p>
      </AuthGate>,
    );
    await screen.findByText('wechart content');
    await act(async () => {
      await fetch('/api/load');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('wechart content')).toBeTruthy();
  });

  it('ignores a 401 from sign-in’s own routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/me' ? answer(200, signedIn) : answer(401, { error: 'unauthenticated' }),
      ),
    );
    render(
      <AuthGate navigate={vi.fn()}>
        <p>wechart content</p>
      </AuthGate>,
    );
    await screen.findByText('wechart content');
    await act(async () => {
      await fetch('/api/auth/logout');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
