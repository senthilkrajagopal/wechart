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
