import { describe, expect, it } from 'vitest';

import { xcubeQueue } from './queue';

/**
 * T376 / AC-151: xcube's build queue and its cancel, under the service
 * credential (research `xcube-jobs-schedules-routes.md` §1; checked against
 * compose's xcube, 2026-10-02: an entry as below, and `gone` for a key no
 * longer queued).
 */
const ENTRY = {
  key: '91025dbeeb27107d26431ca51c579515',
  dataSource: 'default',
  preAggregation: 'monthly_orders.by_status_month',
  table: 'prod_pre_aggregations_e2e_6d8749c4fe00.monthly_orders_by_status_month20260101',
  targetTable:
    'prod_pre_aggregations_e2e_6d8749c4fe00.monthly_orders_by_status_month20260101_ydcdx3er_inzfhwft_1lbuvqi',
  partition: { start: '2026-01-01T00:00:00.000', end: '2026-08-29T00:00:00.000' },
  status: 'processing',
  stalled: false,
  addedAt: '2026-10-02T09:54:26.066Z',
  requestId: 'wechart-probe-t376',
  startedBy: 'jobs',
  job: '115221984f78ad0c1efd7b80d09d9300',
};

function served(answer: (path: string, body: unknown) => Response) {
  const asked: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  const queue = xcubeQueue({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'e2e',
    token: async () => 'service-token',
    fetch: (async (url: string, init?: RequestInit) => {
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      asked.push({
        url,
        method: init?.method ?? 'GET',
        auth: new Headers(init?.headers).get('authorization'),
        body,
      });
      return answer(new URL(url).pathname, body);
    }) as typeof fetch,
  });
  return { queue, asked };
}

describe('xcube’s queue (T376, AC-151)', () => {
  it('lists the model’s entries as xcube gives them, with the service credential', async () => {
    const { queue, asked } = served(() => Response.json({ model: 'e2e', queue: [ENTRY] }));

    expect(await queue.list()).toEqual([ENTRY]);
    expect(asked).toEqual([
      {
        url: 'http://cube.invalid/cubejs-api/v1/semantic/models/e2e/pre-aggregations/queue',
        method: 'GET',
        auth: 'Bearer service-token',
        body: undefined,
      },
    ]);
  });

  it('leaves out an entry without a key, a pre-aggregation or a state, rather than guess', async () => {
    const { queue } = served(() =>
      Response.json({
        model: 'e2e',
        queue: [ENTRY, { ...ENTRY, key: undefined }, { ...ENTRY, status: 7 }, { key: 'k' }],
      }),
    );

    expect(await queue.list()).toEqual([ENTRY]);
  });

  it('cancels by key, a queued entry only unless told otherwise, and says what xcube did', async () => {
    const { queue, asked } = served(() =>
      Response.json({
        model: 'e2e',
        cancelled: [{ key: 'a', preAggregation: 'p.r', status: 'queued' }],
        notCancelled: [
          { key: 'b', reason: 'processing' },
          { key: 'c', reason: 'gone' },
        ],
      }),
    );

    expect(await queue.cancel(['a', 'b', 'c'])).toEqual({
      cancelled: ['a'],
      builds: new Map(),
      notCancelled: [
        { key: 'b', reason: 'processing' },
        { key: 'c', reason: 'gone' },
      ],
    });
    expect(asked[0]).toMatchObject({
      url: 'http://cube.invalid/cubejs-api/v1/semantic/models/e2e/pre-aggregations/queue/cancel',
      method: 'POST',
      body: { keys: ['a', 'b', 'c'], processing: false },
    });
    // Stopping one building is asked for in so many words (T554).
    await queue.cancel(['d'], { processing: true });
    expect(asked[1]?.body).toEqual({ keys: ['d'], processing: true });
  });

  /**
   * T554 (research xcube-74c933bdb8.md): a building entry taken out with
   * `processing: true` is answered with what came of its build: stopped,
   * failed of its own, or still stopping; one that had finished is refused
   * `finished`.
   */
  it('says what came of each building one stopped, and refuses one that had finished', async () => {
    const { queue } = served(() =>
      Response.json({
        model: 'e2e',
        cancelled: [
          { key: 'a', preAggregation: 'p.r', status: 'processing', build: 'stopped' },
          { key: 'b', preAggregation: 'p.r', status: 'processing', build: 'failed' },
          { key: 'c', preAggregation: 'p.r', status: 'processing', build: 'stopping' },
          // A build word xcube may one day add: read as still stopping, never as stopped.
          { key: 'd', preAggregation: 'p.r', status: 'processing', build: 'paused' },
        ],
        notCancelled: [{ key: 'e', reason: 'finished' }],
      }),
    );

    expect(await queue.cancel(['a', 'b', 'c', 'd', 'e'], { processing: true })).toEqual({
      cancelled: ['a', 'b', 'c', 'd'],
      builds: new Map([
        ['a', 'stopped'],
        ['b', 'failed'],
        ['c', 'stopping'],
        ['d', 'stopping'],
      ]),
      notCancelled: [{ key: 'e', reason: 'finished' }],
    });
  });

  it('throws xcube’s refusal, with its status and code', async () => {
    const { queue } = served(() =>
      Response.json({ error: 'no such model', code: 'unknown_model' }, { status: 404 }),
    );

    await expect(queue.list()).rejects.toMatchObject({ status: 404, code: 'unknown_model' });
  });
});
