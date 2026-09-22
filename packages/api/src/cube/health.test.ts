import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { buildServer } from '../server';
import { healthOf } from './health';

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

describe('asking the API for Cube’s health', () => {
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
