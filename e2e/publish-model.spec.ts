import { expect, test } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';

/**
 * T143 / AC-137: WHEN a valid model is published, THE SYSTEM SHALL make the
 * new members available to the chart builder without restarting Cube.
 * Fails when: a published member is missing from the field list while Cube
 * reports the new schema version.
 *
 * On the real Cube, which reads this API's model store through
 * infra/cube/cube.js and recompiles when the store's version changes
 * (`schemaVersion`); nothing restarts it here.
 */
test('a measure published in the Model workspace is in the chart builder’s field list', async ({
  page,
  context,
}, testInfo) => {
  const cube = `e2e_published_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  const members = async () =>
    (
      (await (await page.request.get('/api/meta')).json()) as {
        cubes: { name: string; measures: { name: string }[] }[];
      }
    ).cubes
      .find((each) => each.name === cube)
      ?.measures.map((each) => each.name) ?? [];
  // wechart's own cache holds the model before the publish, as it would.
  expect(await members()).not.toContain(`${cube}.published`);

  // Another tab with the builder open before the publish: its model is loaded.
  const other = await context.newPage();
  await other.goto('/explore/charts/seed-chart-empty/edit');
  await other.getByLabel('Cube or view').selectOption({ value: cube });
  await expect(other.getByTestId(`member-${cube}.count`)).toBeVisible();

  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.getByRole('button', { name: 'Add measure' }).click();
  await form.locator('.model-member__name', { hasText: /^measure_1$/ }).click();
  const measure = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^measure_1$/ }) });
  const own = (key: string) =>
    // In its named group (T236, AC-225).
    measure.locator(
      `.model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key="${key}"]`,
    );
  await own('type').getByLabel('Type', { exact: true }).selectOption('count');
  await own('name').getByLabel('Name', { exact: true }).fill('published');
  await page.getByRole('button', { name: 'Save & reload Cube' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toBeVisible(PUBLISHED);

  // The chart builder, which reads the model from Cube's /v1/meta through wechart.
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ value: cube });
  await expect(page.getByTestId(`member-${cube}.published`)).toBeVisible();

  // And the other tab, opening the builder again within the app — no reload,
  // its model already cached: the new member is there too.
  await other.evaluate(() => {
    window.history.pushState({}, '', '/explore');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(other.getByLabel('Cube or view')).toHaveCount(0);
  await other.evaluate(() => {
    window.history.pushState({}, '', '/explore/charts/seed-chart-empty/edit');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await other.getByLabel('Cube or view').selectOption({ value: cube });
  await expect(other.getByTestId(`member-${cube}.published`)).toBeVisible();
  expect(await members()).toContain(`${cube}.published`);
});
