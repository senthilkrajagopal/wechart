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
 * T422, AC-319: WHILE the query path runs 2 Cube instances and 2 API replicas,
 * WHEN one of each stops during use, THE SYSTEM SHALL answer every query the
 * web app retries.
 *
 * A stopped replica drops the request on its socket; a closing one answers
 * 503; a Cube instance gone mid-query answers, through the API, 502 or 503.
 * Each is retried, with the same request id, and Cube's queue joins the query
 * asked again to the one already running, by the query's own key
 * (research/cube/ha-topology.md §1).
 * Anything else is reported at once, as before.
 */
function fetchSteps(...steps: ({ status?: number; body: unknown } | Error)[]) {
  const calls: RequestInit[] = [];
  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    const next = steps.shift() ?? { body: { data: [] } };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const idsOf = (calls: RequestInit[]) =>
  calls.map((call) => new Headers(call.headers).get('x-request-id'));

describe('carrying on when an API replica or a Cube instance goes away (T422, AC-319)', () => {
  it('carries on after its socket is lost mid-poll, as the same query', async () => {
    const { impl, calls } = fetchSteps(
      { body: { error: CONTINUE_WAIT } },
      new TypeError('Failed to fetch'),
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [{ 'Orders.count': '42' }] } },
    );

    const result = await loadTile({ query, fetchImpl: impl, retryDelayMs: 0, outageDelayMs: 0 });

    expect(result).toEqual({ data: [{ 'Orders.count': '42' }] });
    expect(calls).toHaveLength(4);
    expect(new Set(idsOf(calls)).size).toBe(1);
  });

  it.each([502, 503, 504])('carries on after a %i', async (status) => {
    const { impl, calls } = fetchSteps(
      { status, body: { error: 'Server unavailable' } },
      { body: { data: [] } },
    );

    await expect(
      loadTile({ query, fetchImpl: impl, retryDelayMs: 0, outageDelayMs: 0 }),
    ).resolves.toEqual({ data: [] });
    expect(calls).toHaveLength(2);
  });

  it('still reports any other failure at once', async () => {
    const { impl, calls } = fetchSteps({ status: 500, body: { error: 'Internal error' } });

    await expect(
      loadTile({ query, fetchImpl: impl, retryDelayMs: 0, outageDelayMs: 0 }),
    ).rejects.toThrow('Internal error');
    expect(calls).toHaveLength(1);
  });

  it('gives up once the outage outlasts its budget, saying so', async () => {
    const lost = fetchSteps(...Array.from({ length: 5 }, () => new TypeError('Failed to fetch')));
    await expect(
      loadTile({
        query,
        fetchImpl: lost.impl,
        retryDelayMs: 0,
        outageDelayMs: 0,
        outageBudgetMs: 0,
      }),
    ).rejects.toThrow('Could not reach the server. Check the connection, then retry.');
    expect(lost.calls).toHaveLength(1);

    const down = fetchSteps(
      ...Array.from({ length: 5 }, () => ({ status: 503, body: { error: 'Server unavailable' } })),
    );
    await expect(
      loadTile({
        query,
        fetchImpl: down.impl,
        retryDelayMs: 0,
        outageDelayMs: 0,
        outageBudgetMs: 0,
      }),
    ).rejects.toThrow('Server unavailable');
    expect(down.calls).toHaveLength(1);
  });

  /** Runs `promise` on fake timers, a step at a time, until it settles or the steps run out. */
  async function settle(promise: Promise<unknown>, stepMs: number, maxSteps: number) {
    const outcome: { done: boolean; error?: unknown } = { done: false };
    promise.then(
      () => {
        outcome.done = true;
      },
      (error: unknown) => {
        outcome.done = true;
        outcome.error = error;
      },
    );
    for (let step = 0; step < maxSteps && !outcome.done; step += 1) {
      await vi.advanceTimersByTimeAsync(stepMs);
    }
    return outcome;
  }

  it('asks again, a delay apart, until the outage outlasts its budget, then reports it', async () => {
    vi.useFakeTimers();
    try {
      const lost = fetchSteps(
        ...Array.from({ length: 20 }, () => new TypeError('Failed to fetch')),
      );
      const outcome = await settle(
        loadTile({
          query,
          fetchImpl: lost.impl,
          retryDelayMs: 0,
          outageDelayMs: 1_000,
          outageBudgetMs: 3_000,
        }),
        500,
        40,
      );
      expect(outcome.done).toBe(true);
      expect(String(outcome.error)).toContain('Could not reach the server');
      // Asked at 0, 1, 2 and 3 s: the budget runs from the outage's first failure.
      expect(lost.calls).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a new outage the whole budget after an answer in between', async () => {
    vi.useFakeTimers();
    try {
      const { impl, calls } = fetchSteps(
        new TypeError('Failed to fetch'),
        new TypeError('Failed to fetch'),
        new TypeError('Failed to fetch'),
        { body: { error: CONTINUE_WAIT } },
        ...Array.from({ length: 20 }, () => new TypeError('Failed to fetch')),
      );
      const outcome = await settle(
        loadTile({
          query,
          fetchImpl: impl,
          retryDelayMs: 0,
          outageDelayMs: 1_000,
          outageBudgetMs: 2_500,
        }),
        500,
        40,
      );
      expect(outcome.done).toBe(true);
      // Three failures and the answer, then a fresh outage asked at 0, 1, 2 and 3 s of its own.
      expect(calls).toHaveLength(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops carrying on when the caller aborts while it waits to ask again', async () => {
    const controller = new AbortController();
    const { impl, calls } = fetchSteps(new TypeError('Failed to fetch'), { body: { data: [] } });

    const pending = loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      outageDelayMs: 1_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toThrow(/abort/i);
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

/**
 * T340 (AC-268): every query names the item it serves, which the API checks
 * before Cube is asked.
 */
describe('naming the item a query serves', () => {
  it('sends the item with the query, on every ask of a poll', async () => {
    const { impl, calls } = fetchReturning(
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [] } },
    );

    await loadTile({
      query,
      fetchImpl: impl,
      retryDelayMs: 0,
      item: { kind: 'dashboard', id: 'd-1' },
    });

    expect(calls.map((call) => JSON.parse(String(call.body)) as unknown)).toEqual([
      { query, for: { kind: 'dashboard', id: 'd-1' } },
      { query, for: { kind: 'dashboard', id: 'd-1' } },
    ]);
  });
});

/**
 * AC-048: a quick calculation is asked of Cube in the query's `calculations`
 * block, and Cube's answer read back under the measure's own name (research
 * `xcube-quick-calcs.md`; `calculations.test.ts` has the rest).
 */
describe('a query asking for quick calculations (AC-048)', () => {
  const calculated = {
    measures: ['orders.count'],
    timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'month' }],
    calculations: [{ measure: 'orders.count', kind: 'rank' }],
  };

  it('sends the block as it is, and reads the calculation’s column as the measure', async () => {
    const { impl, calls } = fetchReturning(
      { body: { error: CONTINUE_WAIT } },
      { body: { data: [{ 'orders.ordered_at.month': 'jan', 'orders.count__xc_rank': '4' }] } },
    );

    const result = await loadTile({ query: calculated, fetchImpl: impl, retryDelayMs: 0 });

    expect((JSON.parse(String(calls[0]?.body)) as { query: unknown }).query).toEqual(calculated);
    expect(result).toEqual({ data: [{ 'orders.ordered_at.month': 'jan', 'orders.count': '4' }] });
  });

  it('asks a running total over a range apart from a difference, and joins their rows', async () => {
    const ranged = {
      measures: ['orders.count', 'orders.total_amount'],
      timeDimensions: [
        { dimension: 'orders.ordered_at', granularity: 'month', dateRange: ['2026-01-01', '2026-02-28'] },
      ],
      calculations: [
        { measure: 'orders.count', kind: 'running_total' },
        { measure: 'orders.total_amount', kind: 'difference' },
      ],
    };
    const asked: unknown[] = [];
    const impl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { query: sent } = JSON.parse(String(init?.body)) as {
        query: { measures: string[] };
      };
      asked.push(sent);
      const data = sent.measures.includes('orders.count')
        ? [
            { 'orders.ordered_at.month': '2026-01', 'orders.count__xc_running_total': '30' },
            { 'orders.ordered_at.month': '2026-02', 'orders.count__xc_running_total': '58' },
          ]
        : [{ 'orders.ordered_at.month': '2026-02', 'orders.total_amount__xc_diff_month': '5757.50' }];
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const result = (await loadTile({ query: ranged, fetchImpl: impl, retryDelayMs: 0 })) as {
      data: unknown[];
    };

    expect(asked).toHaveLength(2);
    expect(asked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measures: ['orders.count'],
          calculations: [{ measure: 'orders.count', kind: 'running_total' }],
        }),
        expect.objectContaining({
          measures: ['orders.total_amount'],
          calculations: [{ measure: 'orders.total_amount', kind: 'difference' }],
        }),
      ]),
    );
    expect(result.data).toEqual([
      { 'orders.ordered_at.month': '2026-01', 'orders.count': '30' },
      {
        'orders.ordered_at.month': '2026-02',
        'orders.count': '58',
        'orders.total_amount': '5757.50',
      },
    ]);
  });
});
