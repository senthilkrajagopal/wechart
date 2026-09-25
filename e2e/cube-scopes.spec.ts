import { expect, test } from '@playwright/test';

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
 * T275 / AC-250: THE SYSTEM SHALL grant Cube's `introspection` scope only to
 * the short-lived tokens its API signs to browse a data source and generate
 * cubes, never to a draft's token or to any other request's token.
 * `Fails when: a token signed for a query, a publish or a draft is granted
 * introspection …`
 *
 * Asked of the compose Cube — the user's fork (T275) with wechart's
 * `infra/cube/cube.js` — with tokens shaped as the API signs them
 * (`packages/api/src/cube/client.ts`: the claim is its introspection token's
 * alone), signed with the suite's secret (playwright.config.ts).
 */
test('the real Cube lets the API’s introspection token browse sources, and no other token', async ({
  request,
}) => {
  const { createHmac } = await import('node:crypto');
  const sign = (claims: Record<string, unknown>) => {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ ...claims, iat: now, exp: now + 60 })}`;
    return `${unsigned}.${createHmac('sha256', 'dev-secret').update(unsigned).digest('base64url')}`;
  };
  const browse = (claims: Record<string, unknown>) =>
    request.get('http://localhost:54000/cubejs-api/v1/introspection/data-sources', {
      headers: { authorization: `Bearer ${sign(claims)}` },
    });

  const introspecting = await browse({ wechartIntrospection: true });
  expect(introspecting.status()).toBe(200);
  expect(((await introspecting.json()) as { dataSources: unknown[] }).dataSources).toContainEqual({
    dataSource: 'default',
    dbType: 'postgres',
  });
  // A query's token, a store's, a draft's — and a draft claiming it too.
  for (const claims of [
    {},
    { wechartStore: 'http://host.docker.internal:4100' },
    { wechartDraft: 'd1' },
    { wechartDraft: 'd1', wechartIntrospection: true },
  ]) {
    const refused = await browse(claims);
    expect(refused.status(), JSON.stringify(claims)).toBe(403);
    expect(await refused.json()).toEqual({ error: 'API scope is missing: introspection' });
  }
});

test('the Security workspace lists the API scopes wechart has, probing the real Cube', async ({
  page,
}) => {
  await page.goto('/security');
  const table = page.getByRole('table', { name: 'Cube API scopes' });
  for (const scope of ['meta', 'data', 'sql', 'graphql', 'jobs'])
    await expect(table.getByTestId(`scope-${scope}`)).toHaveText('Granted', { timeout: 15_000 });
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
