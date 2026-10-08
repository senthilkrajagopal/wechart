import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import { startApi, stopApi, type ApiProcess } from './api-process';

/**
 * T437 (AC-008, as amended for R49): WHEN wechart queries Cube, THE SYSTEM
 * SHALL attach the configured security context's groups to every query, the
 * only part of a context a query token carries.
 * `Fails when: a query made for no signed-in user reaches Cube without the
 * configured context's groups …`
 *
 * Against compose's Cube, on the sample's secured view, whose policies give
 * `managers` every order and any group none of them names nothing (Cube's
 * default deny reads as a hidden member; research/cube/access-control.md,
 * "Observed locally"). The suite's own API is configured with no context, so
 * its query is refused; an API of this spec's own, configured with the
 * `managers` group and a claim beside it, is answered every status. The
 * claim beside it never reaches Cube (`cube/client.test.ts`, "RS256 query
 * tokens"). That API runs on a database and a model of its own.
 */

/** SQL in the metadata Postgres, as its admin, on stdin. */
const psql = (database: string, sql: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

const QUERY = { measures: ['secured_orders.count'], dimensions: ['secured_orders.status'] };

/** wechart's answer to the query, asked again while Cube says "Continue wait". */
async function answerOf(
  url: string,
): Promise<{ status: number; rows: { [member: string]: unknown }[]; error: unknown }> {
  for (let ask = 0; ; ask += 1) {
    const response = await fetch(`${url}/api/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { [member: string]: unknown }[];
      error?: unknown;
    };
    if (body.error === 'Continue wait' && ask < 60) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    return { status: response.status, rows: body.data ?? [], error: body.error };
  }
}

test.describe.serial('the configured security context’s groups (T437, AC-008)', () => {
  test.setTimeout(300_000);
  let database = '';
  let api: ApiProcess | undefined;

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    database = `wechart_configured_context_${testInfo.project.name}`;
    // A new database each run: migrated and seeded by the API's first start.
    psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    psql('wechart_meta', `CREATE DATABASE ${database}`);
    api = await startApi(4560 + testInfo.parallelIndex, {
      database,
      model: `e2e-configured-context-${testInfo.project.name}`,
      settings: { WECHART_SECURITY_CONTEXT: '{"groups":["managers"],"tenant":"acme"}' },
    });
  });

  test.afterAll(async () => {
    await stopApi(api?.process);
    if (database !== '') psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  test('reach Cube on a query made for no one signed in, and its policies apply to them', async () => {
    // The suite's API (playwright.config.ts), configured with no context: no
    // group, so no policy grants it.
    const none = await answerOf('http://localhost:4100');
    expect(none.rows).toEqual([]);
    expect(String(none.error)).toContain('hidden member');

    // Configured with `managers`: every status, as that group's policy gives.
    await expect
      .poll(async () => (await answerOf(api!.url)).status, { timeout: 120_000, intervals: [2000] })
      .toBe(200);
    const managers = await answerOf(api!.url);
    const statuses = managers.rows.map((row) => row['secured_orders.status']);
    expect(statuses.length).toBeGreaterThan(1);
    expect(statuses).toContain('shipped');
    expect(statuses).toContain('completed');
  });
});
