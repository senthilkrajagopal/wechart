import { expect, test } from '@playwright/test';

import { CUBE, SECRET, serviceToken } from './api-process';
import { queryToken } from './tokens';

/**
 * T176 / AC-170: THE SYSTEM SHALL show which API scopes the configured
 * context has, and mark a screen as unavailable when its scope is missing.
 * Fails when: a screen fails with an error instead of reporting the missing
 * scope.
 *
 * The compose Cube grants wechart's own context the default scopes and
 * `jobs` (infra/cube/cube.js `contextToApiScopes`), probed end to end. A
 * context lacking one is not one the suite can configure beside it, so that
 * answer is given to the page as the API gives it (`/api/cube-scopes`, whose
 * reading of Cube's refusal is tested in `packages/api/src/cube/scopes.test.ts`,
 * and observed against the compose Cube in research/cube/api-scope-probes.md).
 */
/**
 * AC-250 (amended 2026-09-25): THE SYSTEM SHALL grant Cube's `introspection`
 * scope only to wechart's service credential, used to browse a data source
 * and generate cubes, never to a user's token.
 * `Fails when: a user's token is granted introspection …`
 *
 * Asked of the compose Cube, xcube with wechart's `infra/cube/cube.js`, with
 * tokens shaped as the API signs them: its service token (T420), and RS256
 * query tokens under the signing key the suite's API pushed for its model at
 * start (T437, `e2e/tokens.ts`). The HS256 token with T420's
 * `wechartIntrospection` claim, retired with HS256, is refused outright.
 */
test('the real Cube lets the service credential browse sources, and no user’s token', async ({
  request,
}) => {
  const browse = (token: string) =>
    request.get(`${CUBE}/v1/introspection/data-sources`, {
      headers: { authorization: `Bearer ${token}` },
    });

  const introspecting = await browse(serviceToken());
  expect(introspecting.status()).toBe(200);
  expect(((await introspecting.json()) as { dataSources: unknown[] }).dataSources).toContainEqual({
    dataSource: 'default',
    dbType: 'postgres',
  });
  // And the service token does nothing else: it reads no model and loads no
  // data (research xcube-slice-4.md, "Scopes by role").
  const service = { authorization: `Bearer ${serviceToken()}` };
  const meta = await request.get(`${CUBE}/v1/meta`, { headers: service });
  expect([meta.status(), await meta.json()]).toEqual([
    403,
    { error: 'API scope is missing: meta' },
  ]);
  const load = await request.get(
    `${CUBE}/v1/load?query=${encodeURIComponent(JSON.stringify({ measures: ['orders.count'] }))}`,
    { headers: service },
  );
  expect([load.status(), await load.json()]).toEqual([
    403,
    { error: 'API scope is missing: data' },
  ]);
  // A query's token as the API signs one, naming its model (T421), and a
  // signed-in user's, with their groups.
  for (const claims of [
    { wechartModel: 'e2e' },
    { wechartModel: 'e2e', wechartRevision: 1 },
    { wechartModel: 'e2e', wechartRevision: 1, groups: ['managers'] },
  ]) {
    const refused = await browse(queryToken(claims));
    expect(refused.status(), JSON.stringify(claims)).toBe(403);
    expect(await refused.json()).toEqual({ error: 'API scope is missing: introspection' });
  }
  // T420's introspection token, HS256 with its claim: its model takes RS256
  // tokens only, so it reaches no scope at all.
  const { createHmac } = await import('node:crypto');
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ wechartIntrospection: true, wechartModel: 'e2e', iat: now, exp: now + 60 })}`;
  const retired = await browse(
    `${unsigned}.${createHmac('sha256', SECRET).update(unsigned).digest('base64url')}`,
  );
  expect([retired.status(), await retired.json()]).toEqual([
    403,
    { error: 'Invalid token: model "e2e" takes RS256 tokens only' },
  ]);
});

test('the Security workspace lists the API scopes wechart has, probing the real Cube', async ({
  page,
}) => {
  await page.goto('/security');
  const table = page.getByRole('table', { name: 'Cube API scopes' });
  // Queries' scopes, as wechart's RS256 query token has them, and jobs, as
  // its service credential builds (T437).
  for (const scope of ['meta', 'data', 'sql', 'jobs'])
    await expect(table.getByTestId(`scope-${scope}`)).toHaveText('Granted', { timeout: 15_000 });
  // xcube gives no query token GraphQL (research xcube-slice-4.md, "Scopes by
  // role"): said as missing, as Cube says it.
  await expect(table.getByTestId('scope-graphql')).toHaveText('Missing', { timeout: 15_000 });
});

test('the Jobs build panel says it is unavailable when wechart lacks the jobs scope', async ({
  page,
}) => {
  await page.route('**/api/cube-scopes', (route) =>
    route.fulfill({
      json: {
        meta: 'granted',
        data: 'granted',
        sql: 'granted',
        graphql: 'granted',
        jobs: 'missing',
      },
    }),
  );
  await page.goto('/jobs');

  const said = page.getByTestId('scope-unavailable');
  await expect(said).toContainText('Building pre-aggregations is unavailable');
  await expect(said).toContainText('jobs');
  await expect(page.getByRole('button', { name: /^Build / })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // And the Security workspace says the same scope is missing.
  await page.goto('/security');
  await expect(page.getByTestId('scope-jobs')).toHaveText('Missing');
});
