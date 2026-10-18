import { readFileSync } from 'node:fs';

import type { Browser, Page } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * F42's Make a cube… and Make a chart… (R78; design 17 §6), with sign-in on,
 * against compose's xcube and the sample database.
 *
 * As `many`, a read-write member of this file's folder through `g01`: no
 * other spec runs SQL as them, so one run per person (AC-379) never meets
 * another spec's run, and their My workspace is this file's alone.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const SOURCE = `sqlmk_${RUN}`;
const CUBE = `sqlcube_${RUN}`;
const CHART_CUBE = `sqlchart_${RUN}`;
const world = { folderId: '', sourceId: '', chartId: '' };
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const SQL = "SELECT g AS id, 'c' || g AS customer, g * 1.5 AS total FROM generate_series(1, 3) AS g";

test.describe.configure({ mode: 'default' });

async function signedIn(browser: Browser, role: 'super' | 'many') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signInThroughDex(page, role);
  return { context, page };
}

test.beforeAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    const made = await admin.page.request.post('/api/documents', {
      data: { kind: 'folder', title: `Make a cube ${RUN}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    world.folderId = ((await made.json()) as { id: string }).id;
    const access = await admin.page.request.put(`/api/folders/${world.folderId}/access`, {
      data: { readOnly: [], readWrite: ['g01'] },
    });
    expect(access.status()).toBe(200);
    const request = admin.page.request;
    const source = await request.post('/api/data-sources', {
      data: await testedSource(request, {
        folderId: world.folderId,
        name: SOURCE,
        driver: 'postgres',
        authMethod: 'password',
        fields: FIELDS,
        sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
      }),
    });
    expect(source.status(), await source.text()).toBe(201);
    world.sourceId = ((await source.json()) as { id: string }).id;
    const on = await request.put(`/api/data-sources/${world.sourceId}/sql-runner`, {
      data: { on: true, readOnlyConfirmed: true },
    });
    expect(on.status(), await on.text()).toBe(200);
  } finally {
    await admin.context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const many = await signedIn(browser, 'many');
  try {
    if (world.chartId !== '')
      await many.page.request.delete(`/api/documents/chart/${encodeURIComponent(world.chartId)}`);
    for (const name of [CUBE, CHART_CUBE])
      await many.page.request.delete(
        `/api/model/files?folder=mine&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
      );
  } finally {
    await many.context.close();
  }
  const admin = await signedIn(browser, 'super');
  try {
    if (world.sourceId !== '') await admin.page.request.delete(`/api/data-sources/${world.sourceId}`);
    if (world.folderId !== '')
      await admin.page.request.delete(`/api/documents/folder/${world.folderId}`);
  } finally {
    await admin.context.close();
  }
});

const editor = (page: Page) => page.locator('.sql-editor .cm-content');
async function typeSql(page: Page, sql: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(sql);
}
async function runOn(page: Page, sql: string) {
  await page.getByRole('complementary', { name: 'Data source and schema' })
    .getByRole('button', { name: /^Data source (?!and)/ })
    .click();
  await page
    .getByRole('listbox', { name: 'Data sources' })
    .getByRole('option', { name: new RegExp(SOURCE) })
    .click();
  await typeSql(page, sql);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished/);
}

/**
 * T820 (AC-462): Make a cube… opens the pane on the run; Add to My workspace
 * adds an unpublished draft cube with a `count` measure to the workspace
 * model, holding the SQL that ran, and nothing to any folder. With T819's
 * reason on an EXPLAIN (AC-461).
 */
test('Make a cube… adds a draft cube, with count and the SQL that ran, to My workspace and to no folder (T820, AC-462)', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, 'many');
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sql');

    // An EXPLAIN offers neither, saying why (AC-461).
    await runOn(page, `EXPLAIN ${SQL}`);
    const head = page.getByTestId('sql-result-head');
    await expect(head.getByRole('button', { name: 'Make a cube…' })).toHaveAttribute('aria-disabled', 'true');
    await expect(head.getByTestId('sql-make-why')).toHaveText('An EXPLAIN’s plan isn’t data to model.');

    await typeSql(page, SQL);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Result: 3 rows, 3 columns' })).toBeVisible();
    await head.getByRole('button', { name: 'Make a cube…' }).click();

    const pane = page.getByRole('dialog', { name: 'Make a cube from this query · in My workspace' });
    await expect(pane).toBeVisible();
    await expect(pane.getByTestId('make-cube-sql')).toHaveText(SQL);
    await expect(pane.getByTestId('make-cube-source')).toHaveText(`${SOURCE} · Shared / Make a cube ${RUN}`);
    // The folder starts at the data source's own, which they may write.
    await expect(pane.getByRole('treeitem', { selected: true })).toHaveText(`Make a cube ${RUN}`);
    const rows = pane.getByRole('table', { name: 'Columns' }).getByRole('row');
    await expect(rows.nth(1).getByRole('combobox', { name: /Cube type/ })).toHaveValue('number');
    await expect(rows.nth(2).getByRole('combobox', { name: /Cube type/ })).toHaveValue('string');
    await expect(rows.nth(3).getByRole('combobox', { name: /Dimension or measure/ })).toHaveValue('measure');
    await expect(rows.nth(3).getByRole('combobox', { name: /Cube type/ })).toHaveValue('sum');

    // An ungrammatical name is refused before anything is sent.
    const name = pane.getByRole('textbox', { name: 'Cube name' });
    await name.fill('two words');
    await expect(pane.getByTestId('make-cube-name-error')).toContainText('isn’t a name');
    await name.fill(CUBE);
    await expect(pane.getByTestId('make-cube-name-error')).toHaveCount(0);
    await pane.getByRole('button', { name: 'Add to My workspace' }).click();

    const said = page.getByTestId('sql-made');
    await expect(said).toContainText(`${CUBE} is in My workspace, unpublished · Open in Model`);
    await expect(pane).toBeHidden();

    // In My workspace's model: the SQL that ran, its source, and count.
    const files = (await (await page.request.get('/api/model/files?folder=mine')).json()) as {
      files: { path: string; content: string }[];
    };
    const file = files.files.find((each) => each.path === `cubes/${CUBE}.yml`);
    expect(file, JSON.stringify(files.files.map((each) => each.path))).toBeDefined();
    expect(file!.content).toContain(`name: ${CUBE}`);
    expect(file!.content).toContain(SQL);
    expect(file!.content).toContain(`data_source: ${SOURCE}`);
    expect(file!.content).toMatch(/- name: count\n\s+type: count/);
    // And nothing in the folder it is to go to, without a proposal.
    const folderFiles = (await (
      await page.request.get(`/api/model/files?folder=${world.folderId}`)
    ).json()) as { files: { path: string; content: string }[] };
    expect(folderFiles.files.filter((each) => each.content.includes(CUBE))).toEqual([]);

    // A second cube of the name is refused, as AC-422 checks it.
    await head.getByRole('button', { name: 'Make a cube…' }).click();
    await pane.getByRole('textbox', { name: 'Cube name' }).fill(CUBE);
    await expect(pane.getByTestId('make-cube-name-error')).toHaveText(`The name “${CUBE}” is already in use.`);
  } finally {
    await context.close();
  }
});

/**
 * T821 (AC-463): Make a chart… then Add and make a chart saves the cube as
 * Make a cube does, then opens the chart editor on a new chart in My
 * workspace whose target folder is the cube's, the new cube chosen, nothing
 * placed, and "← Back to SQL runner" back to the same tab.
 */
test('Make a chart… saves the cube and opens the editor on a new chart over it, nothing placed, with a way back (T821, AC-463)', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser, 'many');
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sql');
    await runOn(page, SQL);
    await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
    const tab = new URL(page.url()).searchParams.get('tab') ?? '';
    await page.getByTestId('sql-result-head').getByRole('button', { name: 'Make a chart…' }).click();

    const pane = page.getByRole('dialog', { name: 'Make a cube from this query · in My workspace' });
    await pane.getByRole('textbox', { name: 'Cube name' }).fill(CHART_CUBE);
    await expect(pane.getByRole('treeitem', { selected: true })).toHaveText(`Make a cube ${RUN}`);
    await pane.getByRole('button', { name: 'Add and make a chart' }).click();

    await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?/);
    const chartId = decodeURIComponent(/\/explore\/charts\/([^/]+)\/edit/.exec(page.url())![1]!);
    world.chartId = chartId;
    // The new cube chosen in the field tree, its fields listed, none placed.
    await expect(page.getByRole('button', { name: /^Cube or view\b/ })).toHaveAttribute('data-value', CHART_CUBE);
    await expect(page.locator('[data-testid^="in-measures-"], [data-testid^="in-dimensions-"]')).toHaveCount(0);

    // A chart in My workspace, to go to the cube's folder.
    const stored = (await (await page.request.get(`/api/documents/chart/${encodeURIComponent(chartId)}`)).json()) as {
      body: { folderId?: string; targetFolderId?: string };
    };
    expect(stored.body.folderId).toBe('mine');
    expect(stored.body.targetFolderId).toBe(world.folderId);
    // The cube is in My workspace's model, as Make a cube saves it.
    const files = (await (await page.request.get('/api/model/files?folder=mine')).json()) as {
      files: { path: string }[];
    };
    expect(files.files.map((each) => each.path)).toContain(`cubes/${CHART_CUBE}.yml`);

    // And back to the SQL runner, on the same tab, its SQL still there.
    await page.getByTestId('editor-back').click();
    await expect(page).toHaveURL(new RegExp(`/sql\\?tab=${tab}$`));
    await expect(editor(page)).toHaveText(SQL);
  } finally {
    await context.close();
  }
});
