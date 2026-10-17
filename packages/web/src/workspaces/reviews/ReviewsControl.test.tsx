import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewsControl } from './ReviewsControl';

/**
 * T355 (AC-287; design 05 of 2026-09-27, state C; rule 76): the top bar's
 * Reviews control, shown only to those who may decide something, its count
 * the number waiting in "To review", hidden at 0.
 */
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function serve(me: Record<string, unknown>, waiting: number) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/me') return answer(200, me);
    // The count alone, never the lists (T355's review).
    if (url === '/api/reviews/count') return answer(200, { waiting });
    return answer(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const shown = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <p>bar</p>
      <ReviewsControl />
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

const writer = {
  name: 'Wren Writer',
  groups: ['sales-rw'],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
};

describe('the Reviews control (T355, AC-287)', () => {
  it('links to Reviews with the number waiting, said in its name', async () => {
    serve(writer, 3);
    shown();
    const link = await screen.findByRole('link', { name: 'Reviews, 3 waiting' });
    expect(link.getAttribute('href')).toBe('/reviews');
    expect(screen.getByTestId('reviews-count').textContent).toBe('3');
    // The inbox, as design 09 and 05 state C draw it (T696, SEC-19).
    expect(link.querySelector('svg')?.getAttribute('data-icon')).toBe('inbox');
  });

  it('hides the count when nothing is waiting', async () => {
    serve(writer, 0);
    shown();
    await screen.findByRole('link', { name: 'Reviews' });
    expect(screen.queryByTestId('reviews-count')).toBeNull();
  });

  it('is shown to a Super-Admin', async () => {
    serve({ ...writer, superAdmin: true, readWrite: false }, 1);
    shown();
    expect(await screen.findByRole('link', { name: 'Reviews, 1 waiting' })).not.toBeNull();
  });

  it('is not there for one who may decide nothing', async () => {
    const fetchMock = serve({ ...writer, readWrite: false }, 2);
    shown();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.anything());
    });
    await screen.findByText('bar');
    expect(screen.queryByRole('link', { name: /Reviews/ })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/reviews/count');
  });

  /**
   * T359 (AC-254): with sign-in off, the single user holds every permission,
   * as a Super-Admin does, and approves their own proposals.
   */
  it('is shown to the single user, with sign-in off', async () => {
    serve({ name: 'admin', groups: [], superAdmin: true, security: 'off' }, 2);
    shown();
    const link = await screen.findByRole('link', { name: 'Reviews, 2 waiting' });
    expect(link.getAttribute('href')).toBe('/reviews');
  });
});
