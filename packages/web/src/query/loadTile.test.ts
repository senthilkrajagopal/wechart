import { describe, expect, it, vi } from 'vitest';

import { CONTINUE_WAIT, TileLoadError, loadTile } from './loadTile';

/**
 * AC-010: WHILE Cube replies "Continue wait" for a query, THE SYSTEM SHALL keep
 * the request open, show the tile in a loading state, and deliver the result
 * when it arrives.
 * Fails when: the tile shows an error, or the result never renders although
 * Cube completed the query.
 *
 * Cube answers a query that is still running with HTTP **200** and a body of
 * `{"error":"Continue wait"}` — an error-shaped body that is not an error. A
 * client that trusts the status code renders nothing; one that trusts the word
 * "error" shows a failure for a query that is merely slow. Both are the
 * failure this criterion describes.
 */
function fetchReturning(...responses: { status?: number; body: unknown }[]) {
  const calls: RequestInit[] = [];
  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    const next = responses.shift() ?? { body: { data: [] } };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const query = { measures: ['Orders.count'] };

describe('long-polling a slow query (AC-010)', () => {
  it('keeps asking while Cube says Continue wait, then returns the result', async () => {
    const { impl, calls } = fetchReturning(
      { body: { error: CONTINUE_WAIT } },
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [{ 'Orders.count': '42' }] } },
    );

    const result = await loadTile({ query, fetchImpl: impl, retryDelayMs: 0 });

    expect(result).toEqual({ data: [{ 'Orders.count': '42' }] });
    expect(calls).toHaveLength(3);
  });

  it('never treats Continue wait as an error', async () => {
    const { impl } = fetchReturning({ body: { error: CONTINUE_WAIT } }, { body: { data: [] } });

    await expect(loadTile({ query, fetchImpl: impl, retryDelayMs: 0 })).resolves.toBeDefined();
  });

  it('carries the same request id across the whole poll, so Cube sees one query', async () => {
    const { impl, calls } = fetchReturning(
      { body: { error: CONTINUE_WAIT } },
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [] } },
    );

    await loadTile({ query, fetchImpl: impl, retryDelayMs: 0 });

    const ids = calls.map((call) => new Headers(call.headers).get('x-request-id'));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
  });

  it('reports a real failure as an error rather than polling forever', async () => {
    const { impl } = fetchReturning({
      status: 400,
      body: { error: "Can't find join path between Orders and Suppliers" },
    });

    await expect(loadTile({ query, fetchImpl: impl, retryDelayMs: 0 })).rejects.toBeInstanceOf(
      TileLoadError,
    );
  });

  it('keeps Cube’s message and the query on the error, for the tile to show', async () => {
    const { impl } = fetchReturning({ status: 400, body: { error: 'Something specific' } });

    const error = await loadTile({ query, fetchImpl: impl, retryDelayMs: 0 }).then(
      () => null,
      (e: unknown) => e as TileLoadError,
    );

    expect(error?.message).toContain('Something specific');
    expect(error?.query).toEqual(query);
  });

  it('gives up after the poll limit rather than hanging forever', async () => {
    const forever = Array.from({ length: 50 }, () => ({ body: { error: CONTINUE_WAIT } }));
    const { impl, calls } = fetchReturning(...forever);

    await expect(
      loadTile({ query, fetchImpl: impl, retryDelayMs: 0, maxPolls: 5 }),
    ).rejects.toThrow(/still running/i);
    expect(calls).toHaveLength(5);
  });

  it('stops polling when the caller aborts', async () => {
    const controller = new AbortController();
    const { impl, calls } = fetchReturning(
      { body: { error: CONTINUE_WAIT } },
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [] } },
    );

    const pending = loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      signal: controller.signal,
      onPoll: () => controller.abort(),
    });

    await expect(pending).rejects.toThrow(/abort/i);
    // The first load went out and nothing followed it. The abort also fires a
    // cancellation (AC-011, T012), which is why this counts loads rather than
    // every request.
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 */
describe('asking past the cache', () => {
  it('sends Cube’s cache policy when given one, and nothing when not', async () => {
    const { impl, calls } = fetchReturning(
      { body: { data: [], lastRefreshTime: '2026-09-21T10:00:00.000Z' } },
      { body: { data: [] } },
    );

    const answer = await loadTile({ query, fetchImpl: impl, cache: 'no-cache' });
    await loadTile({ query, fetchImpl: impl });

    expect(calls.map((call) => JSON.parse(String(call.body)) as unknown)).toEqual([
      { query, cache: 'no-cache' },
      { query },
    ]);
    // Cube's answer whole: its `lastRefreshTime` is the data's as-of time.
    expect(answer).toEqual({ data: [], lastRefreshTime: '2026-09-21T10:00:00.000Z' });
  });
});

/**
 * T172 / AC-166: WHEN the user edits a security context and previews a
 * dashboard, THE SYSTEM SHALL run that dashboard's queries with the edited
 * context.
 */
describe('asking as a previewed security context', () => {
  it('sends the context with the query, and none when there is no preview', async () => {
    const { impl, calls } = fetchReturning({ body: { data: [] } }, { body: { data: [] } });

    await loadTile({ query, fetchImpl: impl, context: { groups: ['sales'] } });
    await loadTile({ query, fetchImpl: impl });

    expect(calls.map((call) => JSON.parse(String(call.body)) as unknown)).toEqual([
      { query, context: { groups: ['sales'] } },
      { query },
    ]);
  });
});
