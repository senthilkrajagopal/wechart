import { describe, expect, it } from 'vitest';

import { xcubeRefreshWorker } from './refresh-worker';

/**
 * T553 / AC-393: xcube's refresh-worker route, under the service credential
 * (research `xcube-jobs-schedules-routes.md` §3; checked against compose's
 * xcube on 2026-10-04: three workers of model `e2e`, two stopped at older
 * revisions and still listed, each with one module, `all`).
 */
const WORKER = {
  instance: '15bd6d8ebc3c/1/630763',
  revision: 2140,
  servedKey: 'xcube:e2e:2140:38c79cc7828d^6ba3d5be5a59',
  lastTickAt: '2026-10-04T20:35:44.230Z',
  modules: [
    {
      module: 'all',
      revision: 2140,
      lastTickAt: '2026-10-04T20:35:44.230Z',
      finished: true,
      lastOkAt: '2026-10-04T20:35:44.230Z',
      lastError: null,
    },
  ],
};

function served(answer: () => Response) {
  const asked: { url: string; method: string; auth: string | null }[] = [];
  const worker = xcubeRefreshWorker({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'e2e',
    token: async () => 'service-token',
    fetch: (async (url: string, init?: RequestInit) => {
      asked.push({
        url,
        method: init?.method ?? 'GET',
        auth: new Headers(init?.headers).get('authorization'),
      });
      return answer();
    }) as typeof fetch,
  });
  return { worker, asked };
}

describe('xcube’s refresh-worker route (T553, AC-393)', () => {
  it('reads the model’s revision and each worker, with the service credential', async () => {
    const { worker, asked } = served(() =>
      Response.json({ model: 'e2e', revision: 2140, workers: [WORKER] }),
    );

    expect(await worker.read()).toEqual({ revision: 2140, workers: [WORKER] });
    expect(asked).toEqual([
      {
        url: 'http://cube.invalid/cubejs-api/v1/semantic/models/e2e/refresh-worker',
        method: 'GET',
        auth: 'Bearer service-token',
      },
    ]);
  });

  it('keeps a module’s last error, and leaves out a worker or module without what it must have', async () => {
    const failing = {
      ...WORKER.modules[0]!,
      lastOkAt: null,
      lastError: {
        message: 'Refresh Scheduler Error: connect ETIMEDOUT',
        at: '2026-10-04T20:30:00.000Z',
      },
    };
    const { worker } = served(() =>
      Response.json({
        model: 'e2e',
        revision: 2140,
        workers: [
          { ...WORKER, modules: [failing, { module: 7 }] },
          { ...WORKER, instance: undefined },
          { revision: 3 },
        ],
      }),
    );

    expect(await worker.read()).toEqual({
      revision: 2140,
      workers: [{ ...WORKER, modules: [failing] }],
    });
  });

  it('has no workers for a model no worker has refreshed', async () => {
    const { worker } = served(() => Response.json({ model: 'e2e', revision: 4, workers: [] }));

    expect(await worker.read()).toEqual({ revision: 4, workers: [] });
  });

  it('says what xcube answered when it refuses', async () => {
    const { worker } = served(() => Response.json({ error: 'Unauthorized' }, { status: 401 }));

    await expect(worker.read()).rejects.toThrow('xcube answered 401: Unauthorized');
  });
});
