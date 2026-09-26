import { execFile, execFileSync } from 'node:child_process';
import { createServer, request as ask, type Server } from 'node:http';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { startApi, stopApi, type ApiProcess } from './api-process';

/**
 * T431, AC-327: THE SYSTEM SHALL publish, query, refresh and test connections
 * with no request from Cube or xcube to wechart. `Fails when: any request
 * from a Cube or xcube process reaches wechart during a publish, a query, a
 * refresh or a connection test; wechart serves a route for Cube to read a
 * model or a connection from; or the browser makes a request to Cube or
 * xcube.` Connections wait for slice 4 (T420), which moves them into xcube.
 *
 * A recorder stands on wechart's port: an API of this test's own is reached
 * only through it, and it is the address the model store's settings gave
 * Cube (`WECHART_CUBE_STORE_URL`), so a wechart that still handed Cube its
 * address would be called there. Every request this test makes carries a
 * mark; any other the recorder sees came from Cube or xcube. One unmarked
 * request from inside Cube's container shows first that it would be seen.
 */
const MARK = 'x-e2e-caller';

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly caller: string | undefined;
}

/** A proxy on `port` to the API on `target`, noting every request it passes on. */
async function recorder(port: number, target: number): Promise<{ server: Server; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((incoming, outgoing) => {
    const caller = incoming.headers[MARK];
    seen.push({
      method: incoming.method ?? '',
      url: incoming.url ?? '',
      caller: typeof caller === 'string' ? caller : undefined,
    });
    const passed = ask(
      {
        host: '127.0.0.1',
        port: target,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers,
      },
      (answer) => {
        outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(outgoing);
      },
    );
    passed.on('error', () => outgoing.writeHead(502).end());
    incoming.pipe(passed);
  });
  // Every address: Cube's container reaches the host's at host.docker.internal.
  await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
  return { server, seen };
}

const psql = (sql: string) =>
  execFileSync(
    'docker',
    ['exec', '-i', 'wechart-meta', 'psql', '-U', 'wechart', '-d', 'wechart_meta', '-At', '-f', '-'],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

test.describe.serial('Cube and xcube call nothing of wechart’s (T431, AC-327)', () => {
  test.setTimeout(300_000);
  let database = '';
  let api: ApiProcess | undefined;
  let record: { server: Server; seen: Seen[] } | undefined;
  let wechart = '';

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    const { name } = testInfo.project;
    database = `wechart_no_callbacks_${name}`;
    const apiPort = 4500 + testInfo.parallelIndex;
    const port = 4520 + testInfo.parallelIndex;
    psql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    psql(`CREATE DATABASE ${database}`);
    record = await recorder(port, apiPort);
    wechart = `http://localhost:${String(port)}`;
    api = await startApi(apiPort, {
      database,
      model: `e2e-no-callbacks-${name}`,
      // The store's settings, pointing at the recorder: nothing reads them now.
      settings: {
        WECHART_MODEL_KEY: 'dev-model-key',
        WECHART_CUBE_STORE_URL: `http://host.docker.internal:${String(port)}`,
      },
    });
  });

  test.afterAll(async () => {
    await stopApi(api?.process);
    await new Promise((resolve) => record?.server.close(resolve) ?? resolve(undefined));
    if (database !== '') psql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  /** A request of this test's, marked, to the API through the recorder. */
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`${wechart}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { [MARK]: 'test', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
  };

  test('a publish, a query and a refresh reach wechart from nothing but this test', async () => {
    const testInfo = test.info();
    const port = new URL(wechart).port;
    // Shown first: a request from inside Cube's container reaches the
    // recorder. Asked without blocking: the recorder answers from this process.
    await promisify(execFile)('docker', [
      'exec',
      'wechart-cube',
      'node',
      '-e',
      `fetch('http://host.docker.internal:${port}/api/health', { signal: AbortSignal.timeout(10000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(2))`,
    ]);
    expect(record!.seen).toEqual([{ method: 'GET', url: '/api/health', caller: undefined }]);
    record!.seen.length = 0;

    // A publish, checked by xcube's dry run and pushed to xcube (T445, T419).
    const cube = `e2e_no_callbacks_${testInfo.project.name}`;
    const published = await call('/api/model/publish', {
      files: [
        {
          path: `cubes/${cube}.yml`,
          content: `cubes:\n  - name: ${cube}\n    sql_table: public.products\n\n    measures:\n      - name: count\n        type: count\n`,
        },
      ],
    });
    expect(published.status).toBe(200);

    // A query on it, asked again while Cube says "Continue wait".
    await expect
      .poll(
        async () => {
          const answered = await call('/api/load', { query: { measures: [`${cube}.count`] } });
          const rows = (answered.body as { data?: Record<string, unknown>[] } | null)?.data;
          return Number(rows?.[0]?.[`${cube}.count`]);
        },
        { timeout: 60_000, intervals: [1000] },
      )
      .toBeGreaterThan(0);

    // A refresh: the seed's rollup built through Cube's jobs API, to done.
    const built = await call('/api/builds', {
      preAggregation: 'monthly_orders.by_status_month',
    });
    expect(built.status).toBe(200);
    const { tokens } = built.body as { tokens: string[] };
    expect(tokens.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          ((await call('/api/builds/status', { tokens })).body as { status: string }[]).map(
            (each) => each.status,
          ),
        { timeout: 60_000, intervals: [1000] },
      )
      .toEqual(tokens.map(() => 'done'));

    // The field list, as the browser reads it after a publish.
    expect((await call('/api/meta')).status).toBe(200);

    // Cube's model routes are gone: nothing for Cube to read the model through.
    for (const path of ['files', 'version', 'drafts/d1'])
      expect((await call(`/api/cube-model/${path}`)).status, path).toBe(404);

    // A refresh worker cycle and the API's reconcile have had their chance
    // too; every request the recorder saw was this test's.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    expect(record!.seen.filter((each) => each.caller !== 'test')).toEqual([]);
    expect(record!.seen.length).toBeGreaterThan(0);
  });
});

/**
 * AC-327: `… or the browser makes a request to Cube or xcube.` A dashboard
 * drawn, and the model editor opened, with every request the page makes noted.
 */
test('the browser asks wechart alone, never Cube or xcube', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (request) => asked.push(request.url()));

  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await expect(page.locator('[data-tile="tile-status"]').getByTestId('chart-canvas')).toBeVisible();
  await page.goto('/model');
  await expect(page.getByRole('region', { name: 'cubes/orders.yml' })).toBeVisible();

  const origin = new URL(page.url()).origin;
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.filter((url) => !url.startsWith(`${origin}/`))).toEqual([]);
  expect(asked.filter((url) => /:5400[01]\b|cubejs-api|\/v1\/semantic\//.test(url))).toEqual([]);
});
