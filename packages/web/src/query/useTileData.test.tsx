import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTINUE_WAIT } from './loadTile';
import { useTileData } from './useTileData';

/**
 * AC-010, from the tile's side: the tile is in a loading state for the whole
 * poll and shows no error, and the result arrives when Cube finishes.
 */
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function respondWith(...bodies: { status?: number; body: unknown }[]) {
  globalThis.fetch = vi.fn(async () => {
    const next = bodies.shift() ?? { body: { data: [] } };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const query = { measures: ['Orders.count'] };

describe('tile data (AC-010)', () => {
  it('stays loading through Continue wait, then delivers the result', async () => {
    respondWith(
      { body: { error: CONTINUE_WAIT } },
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [{ 'Orders.count': '42' }] } },
    );

    const { result } = renderHook(() => useTileData({ tileId: 't1', query }), { wrapper });

    // Loading, and specifically not an error, while Cube is still working.
    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);

    // Two Continue waits at the real 500 ms poll delay, so this genuinely takes
    // about a second; waitFor's 1 s default would cut it off mid-poll.
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(result.current.data).toEqual({ data: [{ 'Orders.count': '42' }] });
    expect(result.current.isError).toBe(false);
  });

  it('never passes through an error state for a slow query', async () => {
    respondWith({ body: { error: CONTINUE_WAIT } }, { body: { data: [] } });

    const { result } = renderHook(() => useTileData({ tileId: 't2', query }), { wrapper });

    const seen: boolean[] = [];
    await waitFor(
      () => {
        seen.push(result.current.isError);
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 5000 },
    );

    expect(seen.some(Boolean)).toBe(false);
  });

  it('surfaces a real Cube failure as an error carrying its message (AC-012)', async () => {
    respondWith({ status: 400, body: { error: "Can't find join path" } });

    const { result } = renderHook(() => useTileData({ tileId: 't3', query }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('join path');
  });
});
