import { expect, test } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';

/**
 * T168 / AC-162: WHEN the user assigns a cube to a data source, THE SYSTEM
 * SHALL write `data_source` into that cube's model file.
 * Fails when: the assignment is stored only in wechart and not in the model.
 *
 * In the cube's form, as any other cube field (`data_source`, a string naming
 * a source `driverFactory` knows: research/cube/data-modeling.md); saved as
 * any model change — Cube compiles it first — into the model file, and only
 * there. Data sources themselves are configured in Cube's environment (F18,
 * deferred): the compose Cube has the one, `default`.
 */
test('a cube assigned to a data source has it in its model file, published', async ({
  page,
}, testInfo) => {
  const cube = `e2e_source_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  const yaml = page.getByRole('textbox', { name: `${path}, as YAML` });
  await expect(yaml).toContainText(`name: ${cube}`);
  await expect(yaml).not.toContainText('data_source');

  await form.getByLabel('Data source', { exact: true }).fill('default');
  await expect(yaml).toContainText('data_source: default');

  await page.getByRole('button', { name: 'Save & reload Cube' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toHaveText(
    'Published. Cube is reading the new model.',
    PUBLISHED,
  );
  // In the model file wechart serves Cube — the model itself.
  const files = (await (await page.request.get('/api/model/files')).json()) as {
    files: { path: string; content: string }[];
  };
  const stored = files.files.find((file) => file.path === path)?.content ?? '';
  // On the cube itself: a key of the list item, at its keys' indentation.
  expect(stored).toMatch(/^ {4}data_source: default$/m);
});
