import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { ownCubeFile, PUBLISHED } from './model-files';

const RUN = Math.random().toString(36).slice(2, 8);
const KEY = JSON.parse(
  readFileSync(new URL('../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
/** Compose's sample database, by its development login. */
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };

// One at a time: a data source landing in xcube while a model publishes has
// the publish refused, and the two tests here do each.
test.describe.configure({ mode: 'serial' });

/**
 * T497 (AC-158, AC-161; design 03 of 2026-09-27, states B and C): with
 * sign-in off there is one user and no workspace to copy into, so a data
 * source changes in place: a new name saved without a test, a change to
 * where it connects only from a passing test of exactly it.
 */
test('with sign-in off, a data source changes in place: renamed without a test, its connection once tested', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const name = `in_place_${testInfo.project.name}_${RUN}`;
  const settings = {
    folderId: 'root',
    driver: 'postgres',
    authMethod: 'password',
    fields: FIELDS,
    sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
  };
  const run = await request.post('/api/data-sources/test', { data: settings, timeout: 90_000 });
  expect(run.status(), await run.text()).toBe(200);
  const { testId } = (await run.json()) as { testId: string };
  const made = await request.post('/api/data-sources', {
    data: { ...settings, name, testId },
  });
  expect(made.status(), await made.text()).toBe(201);
  const id = ((await made.json()) as { id: string }).id;

  try {
    await page.goto(`/explore/data-sources/${encodeURIComponent(id)}`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(name);
    // Changed where it is: there is no copy to make.
    await expect(main.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
    const tabs = main.getByRole('tablist', { name: 'Data source' });
    const save = main.getByRole('button', { name: 'Save', exact: true });

    // A new name, and what it is for, need no test (state B; T499's description).
    await tabs.getByRole('tab', { name: 'General' }).click();
    await main.getByLabel(/^Name/).fill(`${name}_eu`);
    await expect(main.locator('.source-settings__count')).toHaveText(
      '1 unsaved change · no test needed for a name',
    );
    await main.getByLabel(/^Description/).fill('Read replica for EMEA order cubes.');
    await expect(main.locator('.source-settings__count')).toHaveText(
      '2 unsaved changes · no test needed',
    );
    await main.getByRole('button', { name: 'Save 2 changes' }).click();
    await expect(main.locator('.source-settings__foot')).toContainText('Saved 2 changes.');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(`${name}_eu`);

    // Where it connects: saved only once a test of it passes (state C, AC-158).
    await tabs.getByRole('tab', { name: 'Connection' }).click();
    const panel = main.getByRole('tabpanel');
    await expect(panel.getByText('Stored · encrypted')).toBeVisible();
    await panel.getByLabel('Database').fill('postgres');
    await expect(save).toBeDisabled();
    await main.getByRole('button', { name: 'Test connection' }).click();
    await expect(main.getByRole('region', { name: 'Test to save' })).toContainText(
      'Every check passed',
      { timeout: 90_000 },
    );
    await save.click();
    await expect(main.locator('.source-settings__foot')).toContainText('Saved 1 change.');
    expect(
      await (await request.get(`/api/data-sources/${encodeURIComponent(id)}`)).json(),
    ).toMatchObject({
      name: `${name}_eu`,
      description: 'Read replica for EMEA order cubes.',
      fields: { database: 'postgres' },
    });
  } finally {
    await request.delete(`/api/data-sources/${encodeURIComponent(id)}`);
  }
});

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

  // Picked from the data sources Cube has (T481), once they are read.
  const source = form.getByLabel('Data source', { exact: true });
  await expect(source).toHaveJSProperty('tagName', 'SELECT');
  await source.selectOption('default');
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
