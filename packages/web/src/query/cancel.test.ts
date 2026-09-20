import { describe, expect, it, vi } from 'vitest';

import { CONTINUE_WAIT, loadTile } from './loadTile';

/**
 * AC-011: WHEN a query is superseded, because its filters, marks or dashboard
 * changed, THE SYSTEM SHALL cancel the earlier query against Cube before
 * rendering the newer result.
 * Fails when: no cancellation is issued for the superseded request, or the
 * older result replaces the newer one.
 *
 * Dropping the response client-side is not cancelling. The query keeps running
 * in Cube, holding one of the two default queue slots until its orphan timeout
 * — so a user dragging a filter can starve their own dashboard. The criterion
 * says "against Cube", and that is what these assert.
 */
interface Call {
  readonly url: string;
  readonly method: string;
  readonly requestId: string | null;
}

function recordingFetch(bodies: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      requestId: new Headers(init?.headers).get('x-request-id'),
    });
    const next = bodies.shift() ?? { body: { data: [] } };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const query = { measures: ['Orders.count'] };

describe('cancelling a superseded query (AC-011)', () => {
  it('tells Cube to stop the query it started', async () => {
    const controller = new AbortController();
    const { impl, calls } = recordingFetch([
      { body: { error: CONTINUE_WAIT } },
      { body: { error: CONTINUE_WAIT } },
    ]);

    const pending = loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      signal: controller.signal,
      onPoll: () => controller.abort(),
    });
    await expect(pending).rejects.toThrow();

    const cancellation = calls.find((call) => call.method === 'DELETE');
    expect(cancellation).toBeDefined();
    expect(cancellation?.url).toMatch(/\/api\/running-query\//);
  });

  it('cancels the request id it actually used, not a new one', async () => {
    const controller = new AbortController();
    const { impl, calls } = recordingFetch([{ body: { error: CONTINUE_WAIT } }]);

    await loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      signal: controller.signal,
      onPoll: () => controller.abort(),
    }).catch(() => undefined);

    const load = calls.find((call) => call.method === 'POST');
    const cancellation = calls.find((call) => call.method === 'DELETE');

    expect(load?.requestId).toBeTruthy();
    // A cancellation naming a different id stops nothing.
    expect(cancellation?.url).toContain(encodeURIComponent(load!.requestId!));
  });

  it('does not cancel a query that finished on its own', async () => {
    const { impl, calls } = recordingFetch([{ body: { data: [] } }]);

    await loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      signal: new AbortController().signal,
    });

    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  });

  it('still rejects the caller after cancelling, so no stale result is rendered', async () => {
    const controller = new AbortController();
    const { impl } = recordingFetch([{ body: { error: CONTINUE_WAIT } }]);

    const pending = loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      signal: controller.signal,
      onPoll: () => controller.abort(),
    });

    await expect(pending).rejects.toThrow(/abort/i);
  });
});
