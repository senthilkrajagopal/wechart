import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { PUBLISHED } from './model-files';

/**
 * T342, with sign-in off: one user, who changes a model in place in any
 * folder, as phase 1 had it (rule 71 needs sign-in; T359 works through the
 * workspace with it off).
 *
 * AC-222: WHILE a model is open, THE SYSTEM SHALL show its folder's model
 * files beside the editor, open the chosen file in place with its folder and
 * name in the URL, … and mark each file that has problems.
 *
 * AC-141: WHEN the user edits a member that charts use, THE SYSTEM SHALL
 * list the charts and dashboards that reference it before saving.
 * `Fails when: a referencing chart is missing from that list.`
 * With models in folders, a chart in a folder is bound to its cube's full
 * name, `<xcubeId>__<name>` (AC-328), and a folder's view names a root cube
 * along its path (AC-272).
 *
 * AC-329, the model page's part: a member is said by its short name, never
 * its prefixed one.
 */

async function folderOf(request: APIRequestContext, title: string): Promise<string> {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

async function publish(
  request: APIRequestContext,
  folderId: string,
  files: { path: string; content: string }[],
) {
  const published = await request.post('/api/model/publish', {
    data: folderId === 'root' ? { files } : { folderId, files },
    timeout: 90_000,
  });
  expect(published.status(), await published.text()).toBe(200);
}

/** A folder's id in xcube, which prefixes its items' names (AC-328). */
async function xcubeIdOf(request: APIRequestContext, folderId: string): Promise<string> {
  const folders = (await (await request.get('/api/folders')).json()) as {
    id: string;
    xcubeId?: string | null;
  }[];
  const xcubeId = folders.find((folder) => folder.id === folderId)?.xcubeId;
  expect(xcubeId).toMatch(/^f[0-9a-z]+$/);
  return xcubeId!;
}

/** A chart saved in a folder on one measure, bound there as a save binds it (AC-272); its id. */
async function chartOn(
  request: APIRequestContext,
  folderId: string,
  title: string,
  cube: string,
  measure: string,
): Promise<string> {
  const created = await request.post('/api/documents', {
    data: { kind: 'chart', title, folderId },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`/api/documents/chart/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`/api/documents/chart/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.${measure}`], dimensions: [], timeDimensions: [] },
          chartType: 'kpi',
          filters: [],
        },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return id;
}

async function measuresOf(request: APIRequestContext, chartId: string): Promise<string[]> {
  const stored = (await (await request.get(`/api/documents/chart/${chartId}`)).json()) as {
    body: { chart: { wells: { measures: string[] } } };
  };
  return stored.body.chart.wells.measures;
}

async function cleanUp(
  request: APIRequestContext,
  charts: string[],
  files: { folderId: string; path: string }[],
  folders: string[],
) {
  // What uses a cube first: its charts, then what includes it, then it.
  for (const id of charts) await request.delete(`/api/documents/chart/${id}`);
  for (const { folderId, path } of files)
    await request.delete(`/api/model/files?folder=${folderId}&path=${encodeURIComponent(path)}`);
  for (const id of folders) await request.delete(`/api/documents/folder/${id}`);
}

const tree = (page: Page) => page.getByRole('navigation', { name: 'Model files' });
const yaml = (page: Page, path: string) => page.getByRole('textbox', { name: `${path}, as YAML` });
const cube = (name: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');

/** Renames `count` in the open file's YAML: the member charts use is taken away. */
async function renameCount(page: Page) {
  await page.locator('.cm-line', { hasText: '- name: count' }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('_all');
}

test('a folder’s model opens beside its files, one after another in place, a file with problems marked', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const folderId = await folderOf(
    request,
    `T342 files ${testInfo.project.name} ${String(Date.now())}`,
  );
  const files = [
    { path: 'cubes/t342_a.yml', content: cube('t342_a') },
    { path: 'cubes/t342_b.yml', content: cube('t342_b') },
  ];
  try {
    await publish(request, folderId, files);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/explore?folder=${folderId}`);
    await page
      .getByTestId('item-cubes/t342_a.yml')
      // Its name, not its ⋯ "Actions for t342_a.yml" (T526).
      .getByRole('button', { name: 't342_a.yml', exact: true })
      .click();

    // The folder and the file in the address, the folder's files beside it.
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folderId}/models/cubes%2Ft342_a\\.yml$`),
    );
    await expect(yaml(page, 'cubes/t342_a.yml')).toContainText('name: t342_a');
    await expect(tree(page).getByRole('link')).toHaveCount(2);
    // Its own panes, full height: the page itself never scrolls (AC-223).
    expect(
      await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return root.scrollHeight > root.clientHeight;
      }),
    ).toBe(false);

    // Another of its files, in place.
    await page.evaluate(() => {
      (window as unknown as { stayed?: boolean }).stayed = true;
    });
    await tree(page)
      .getByRole('link', { name: /^t342_b\.yml/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folderId}/models/cubes%2Ft342_b\\.yml$`),
    );
    await expect(yaml(page, 'cubes/t342_b.yml')).toContainText('name: t342_b');
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(
      true,
    );

    // A file that stops parsing is marked in the tree, in words; the other isn't.
    await page.locator('.cm-line', { hasText: 'sql_table:' }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(': x');
    await expect(tree(page).getByRole('link', { name: /^t342_b\.yml/ })).toContainText('problems');
    await expect(tree(page).getByRole('link', { name: /^t342_a\.yml/ })).not.toContainText(
      'problems',
    );

    // New cube makes a file in this folder; discarded, the folder's model opens.
    await tree(page).getByRole('button', { name: 'New cube' }).click();
    await page
      .getByRole('alertdialog', { name: 'Leave with unpublished changes?' })
      .getByRole('button', { name: 'Leave without publishing' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folderId}/models/cubes%2Fnew_cube_1\\.yml$`),
    );
    await expect(tree(page).getByRole('link', { name: /^new_cube_1\.yml/ })).toContainText(
      'unpublished',
    );
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/folders/${folderId}/models$`));
    await expect(tree(page).getByRole('link')).toHaveCount(2);
  } finally {
    await cleanUp(
      request,
      [],
      files.map(({ path }) => ({ folderId, path })),
      [folderId],
    );
  }
});

test('saving a folder’s file lists the charts bound to its members’ full names, said by short name', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const title = `T342 edit ${testInfo.project.name} ${String(Date.now())}`;
  const folderId = await folderOf(request, title);
  const path = 'cubes/t342_edited.yml';
  const charts: string[] = [];
  try {
    await publish(request, folderId, [{ path, content: cube('t342_edited') }]);
    const xcubeId = await xcubeIdOf(request, folderId);
    const chart = await chartOn(request, folderId, `${title} chart`, 't342_edited', 'count');
    charts.push(chart);
    // Bound in its folder: to the cube's full name there.
    expect(await measuresOf(request, chart)).toEqual([`${xcubeId}__t342_edited.count`]);

    await page.goto(`/explore/folders/${folderId}/models/${encodeURIComponent(path)}`);
    await expect(yaml(page, path)).toContainText('name: t342_edited');
    await renameCount(page);
    await page.getByRole('button', { name: 'Save & reload Cube' }).click();

    const warning = page.getByRole('alert').filter({ hasText: 'This save changes members' });
    await expect(warning).toBeVisible(PUBLISHED);
    await expect(warning.getByRole('list', { name: 'Charts' })).toContainText(
      `${title} chart — uses t342_edited.count`,
    );
    await expect(warning).not.toContainText(`${xcubeId}__`);
    await warning.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await cleanUp(request, charts, [{ folderId, path }], [folderId]);
  }
});

test('a root edit lists the charts bound to a folder’s view of it, by that folder’s name', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const title = `T342 view ${testInfo.project.name} ${String(Date.now())}`;
  const folderId = await folderOf(request, title);
  // The root is every browser's: a cube of this browser's own.
  const rootCube = `t342_root_${testInfo.project.name}`;
  const rootPath = `cubes/${rootCube}.yml`;
  const viewPath = 'views/t342_view.yml';
  const charts: string[] = [];
  const files: { folderId: string; path: string }[] = [];
  try {
    await publish(request, 'root', [{ path: rootPath, content: cube(rootCube) }]);
    files.unshift({ folderId: 'root', path: rootPath });
    await publish(request, folderId, [
      {
        path: viewPath,
        content: [
          'views:',
          '  - name: t342_view',
          '    cubes:',
          `      - join_path: ${rootCube}`,
          '        includes: [count]',
          '',
        ].join('\n'),
      },
    ]);
    files.unshift({ folderId, path: viewPath });
    const xcubeId = await xcubeIdOf(request, folderId);
    const chart = await chartOn(request, folderId, `${title} chart`, 't342_view', 'count');
    charts.push(chart);
    expect(await measuresOf(request, chart)).toEqual([`${xcubeId}__t342_view.count`]);

    // The root's file, in the Model workspace as it always opened.
    await page.goto(`/model/files/${encodeURIComponent(rootPath)}`);
    await expect(yaml(page, rootPath)).toContainText(`name: ${rootCube}`);
    await renameCount(page);
    await page.getByRole('button', { name: 'Save & reload Cube' }).click();

    const warning = page.getByRole('alert').filter({ hasText: 'This save changes members' });
    await expect(warning).toBeVisible(PUBLISHED);
    await expect(warning.getByRole('list', { name: 'Charts' })).toContainText(
      `${title} chart — uses t342_view.count (${title})`,
    );
    await expect(warning).not.toContainText(`${xcubeId}__`);
    await warning.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await cleanUp(request, charts, files, [folderId]);
  }
});
