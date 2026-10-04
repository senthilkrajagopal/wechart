import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';
import { buildServer } from '../server';
import type { RefreshModule, RefreshWorker } from '../xcube/refresh-worker';
import { healthOf, refreshWorkerStateOf } from './health';

/**
 * T162 / AC-156: THE SYSTEM SHALL show the refresh worker's state and the
 * Cube deployment's health, and mark the deployment as down when Cube's
 * health endpoint does not report healthy.
 * Fails when: the indicator stays healthy while Cube reports otherwise.
 *
 * Cube's `/readyz` and `/livez` answer `200 {"health":"HEALTH"}` or
 * `500 {"health":"DOWN"}`, need no auth and sit outside the API's base path;
 * the refresh worker answers its own (research/cube/refresh-jobs-caching.md
 * §F, and "Observed locally").
 */
type Answer = { status: number; body: unknown } | 'unreachable';

/** Each URL answered as `answers` says; an unlisted one, healthy. */
function reaching(answers: Record<string, Answer>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: string) => {
    asked.push(input);
    const answer = answers[input] ?? { status: 200, body: { health: 'HEALTH' } };
    if (answer === 'unreachable') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, asked };
}

const DOWN = { status: 500, body: { health: 'DOWN' } };

describe('the Cube deployment’s health', () => {
  it('is healthy only when Cube says so, ready and live', async () => {
    const { fetchImpl, asked } = reaching({});

    expect(
      await healthOf({ cube: 'http://cube:4000', worker: 'http://worker:4000' }, fetchImpl),
    ).toEqual({ cube: 'healthy', worker: 'healthy' });
    expect(asked.sort()).toEqual([
      'http://cube:4000/livez',
      'http://cube:4000/readyz',
      'http://worker:4000/livez',
      'http://worker:4000/readyz',
    ]);
  });

  it.each([
    ['not ready', { 'http://cube:4000/readyz': DOWN }],
    ['not live', { 'http://cube:4000/livez': DOWN }],
    ['unreachable', { 'http://cube:4000/readyz': 'unreachable' as const }],
    ['answering 200 but not HEALTH', { 'http://cube:4000/readyz': { status: 200, body: {} } }],
  ])('is down when Cube is %s', async (_why, answers) => {
    const { fetchImpl } = reaching(answers as Record<string, Answer>);

    expect(
      (await healthOf({ cube: 'http://cube:4000', worker: 'http://worker:4000' }, fetchImpl)).cube,
    ).toBe('down');
  });

  it('says the refresh worker is down on its own answer, and unwatched when not configured', async () => {
    const { fetchImpl } = reaching({ 'http://worker:4000/livez': DOWN });

    expect(
      await healthOf({ cube: 'http://cube:4000', worker: 'http://worker:4000' }, fetchImpl),
    ).toEqual({ cube: 'healthy', worker: 'down' });
    expect(await healthOf({ cube: 'http://cube:4000' }, fetchImpl)).toEqual({
      cube: 'healthy',
      worker: 'unwatched',
    });
  });
});

/** A real server on a free port, answering as `answer` does — or never. */
async function serving(
  answer: ((response: ServerResponse) => void) | 'never',
): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    if (answer !== 'never') answer(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('Cube’s probes, over the wire (T162’s review)', () => {
  it('reads a Cube that takes the request and never answers as down, within its time', async () => {
    const hung = await serving('never');
    const started = Date.now();

    const health = await healthOf({ cube: hung.base }, fetch, 200);

    expect(health.cube).toBe('down');
    expect(Date.now() - started).toBeLessThan(2000);
    await hung.close();
  });

  it('reads DOWN, and a non-200 even saying HEALTH, as down', async () => {
    const down = await serving((response) => {
      response.writeHead(500, { 'content-type': 'application/json' }).end('{"health":"DOWN"}');
    });
    const odd = await serving((response) => {
      response.writeHead(503, { 'content-type': 'application/json' }).end('{"health":"HEALTH"}');
    });
    const healthy = await serving((response) => {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"health":"HEALTH"}');
    });

    expect((await healthOf({ cube: down.base }, fetch, 1000)).cube).toBe('down');
    expect((await healthOf({ cube: odd.base }, fetch, 1000)).cube).toBe('down');
    expect((await healthOf({ cube: healthy.base }, fetch, 1000)).cube).toBe('healthy');
    await Promise.all([down.close(), odd.close(), healthy.close()]);
  });
});

/**
 * T553 / AC-393 (design 16, state F and Q4): the refresh worker's state as
 * xcube's refresh-worker route reports it: running, with when it last ran;
 * behind, while every worker refreshes an older revision than the model's;
 * failing, while a module's last error is later than its last good run; or
 * none, when no worker has run the model.
 */
describe('the refresh worker, as xcube reports it (T553, AC-393)', () => {
  const module = (over: Partial<RefreshModule> = {}): RefreshModule => ({
    module: 'all',
    revision: 12,
    lastTickAt: '2026-10-04T14:39:52.000Z',
    finished: true,
    lastOkAt: '2026-10-04T14:39:52.000Z',
    lastError: null,
    ...over,
  });
  const worker = (over: Partial<RefreshWorker> = {}): RefreshWorker => ({
    instance: 'cube-refresh-0',
    revision: 12,
    servedKey: 'xcube:dev:12:a^b',
    lastTickAt: '2026-10-04T14:39:52.000Z',
    modules: [module()],
    ...over,
  });
  const ERROR = {
    message: 'Refresh Scheduler Error: connect ETIMEDOUT',
    at: '2026-10-04T14:39:00.000Z',
  };

  it('is running, with its last run, on the model’s revision', () => {
    expect(
      refreshWorkerStateOf({
        revision: 12,
        workers: [
          worker(),
          // A stopped one, at an older revision, listed for a day: not the one running.
          worker({ instance: 'old', revision: 11, lastTickAt: '2026-10-04T09:00:00.000Z' }),
        ],
      }),
    ).toEqual({ state: 'running', lastRunAt: '2026-10-04T14:39:52.000Z' });
  });

  it('is behind while every worker refreshes an older revision than the model’s', () => {
    expect(
      refreshWorkerStateOf({
        revision: 12,
        workers: [worker({ revision: 11 }), worker({ instance: 'older', revision: 10 })],
      }),
    ).toEqual({
      state: 'behind',
      lastRunAt: '2026-10-04T14:39:52.000Z',
      revision: 11,
      of: 12,
    });
  });

  it('is failing while a module’s last error is later than its last good run, by how many', () => {
    expect(
      refreshWorkerStateOf({
        revision: 12,
        workers: [
          worker({
            modules: [
              module({ module: 'commons' }),
              module({
                module: 'm8be41d07a2',
                lastOkAt: '2026-10-04T13:52:00.000Z',
                lastError: ERROR,
              }),
              module({ module: 'm3f9a01c2be', lastOkAt: null, lastError: ERROR }),
            ],
          }),
        ],
      }),
    ).toEqual({ state: 'failing', lastRunAt: '2026-10-04T14:39:52.000Z', modules: 2 });
  });

  it('is running again once a module’s last good run is later than its last error', () => {
    expect(
      refreshWorkerStateOf({
        revision: 12,
        workers: [worker({ modules: [module({ lastError: ERROR })] })],
      }).state,
    ).toBe('running');
  });

  it('reads each module by its latest run: a restarted worker’s, not the stopped one’s', () => {
    expect(
      refreshWorkerStateOf({
        revision: 12,
        workers: [
          worker({
            instance: 'stopped',
            lastTickAt: '2026-10-04T14:00:00.000Z',
            modules: [
              module({ lastTickAt: '2026-10-04T14:00:00.000Z', lastOkAt: null, lastError: ERROR }),
            ],
          }),
          worker({ instance: 'restarted' }),
        ],
      }).state,
    ).toBe('running');
  });

  it('is none when no worker has run the model', () => {
    expect(refreshWorkerStateOf({ revision: 12, workers: [] })).toEqual({ state: 'none' });
  });
});

describe('asking the API for Cube’s health', () => {
  it('refuses a worker address that is not an http(s) URL, rather than reading it down forever', () => {
    expect(() =>
      loadConfig({ CUBE_API_SECRET: 's', CUBE_WORKER_URL: 'cube-refresh-worker:4000' }),
    ).toThrow(ConfigError);
  });

  it('probes the Cube API’s own origin, not its base path, and the worker it is told of', async () => {
    const config = loadConfig({
      CUBE_API_SECRET: 's',
      CUBE_API_URL: 'http://localhost:54000/cubejs-api',
      CUBE_WORKER_URL: 'http://localhost:54001/',
    });
    const { fetchImpl, asked } = reaching({ 'http://localhost:54001/readyz': DOWN });
    const app = buildServer({ config, healthFetch: fetchImpl });

    const response = await app.inject({ method: 'GET', url: '/api/cube-health' });

    expect(response.json()).toEqual({ cube: 'healthy', worker: 'down' });
    expect(asked.sort()).toEqual([
      'http://localhost:54000/livez',
      'http://localhost:54000/readyz',
      'http://localhost:54001/livez',
      'http://localhost:54001/readyz',
    ]);
    await app.close();
  });
});
