import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { CUBE, serviceToken } from './api-process';
import { inMyWorkspace, landed, modelFilesIn, PUBLISHED } from './model-files';
import { chooseTarget, myModelCopy, sharedIn } from './workspace';

/**
 * T342, with sign-in off: one user, who changes a shared folder's model only
 * through a copy in My workspace and a proposal they approve, as a
 * Super-Admin does with sign-in on (T451's switch; AC-254, AC-278, R52).
 *
 * AC-222: WHILE a model is open, THE SYSTEM SHALL show its folder's model
 * files beside the editor, open the chosen file in place with its folder and
 * name in the URL, offer New cube and New view in the user's workspace, and
 * mark each file that has problems.
 * `Fails when: … New cube or New view is missing in the workspace, or
 * offered in a shared folder; or a file with an error carries no mark.`
 *
 * AC-141, as amended (R55): a model saved in My workspace lists, before it
 * is saved, the shared charts and dashboards that landing it would change
 * in the folder it goes to, naming that folder (T546). With models in
 * folders, a chart in a folder is bound to its cube's or view's own name,
 * with no folder prefix (AC-328; reworked by T728 to R71), and a folder's
 * view names a root cube along its path (AC-272).
 *
 * AC-329, the model page's part: a member is said by its own name.
 *
 * Every name is this browser's own: the browsers share the single user's
 * workspace, whose overlay holds a name once.
 */

async function folderOf(request: APIRequestContext, title: string): Promise<string> {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

/** Files put in a shared folder as the single user puts them: through My workspace and a proposal. */
async function publish(
  request: APIRequestContext,
  folderId: string,
  files: { path: string; content: string }[],
) {
  expect(await landed(request, folderId, files)).toEqual(files);
}

/** Where xcube holds an item of this name: its folder's xcube id (AC-328). */
async function heldIn(request: APIRequestContext, name: string) {
  return (
    (await (
      await request.get(`${CUBE}/v1/semantic/models/e2e/items`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      })
    ).json()) as { items: { folderId: string; name: string }[] }
  ).items
    .filter((item) => item.name === name)
    .map(({ folderId, name: held }) => ({ folderId, name: held }));
}

/** A folder's id in xcube, which holds its items (AC-328). */
async function xcubeIdOf(request: APIRequestContext, folderId: string): Promise<string> {
  const folders = (await (await request.get('/api/folders')).json()) as {
    id: string;
    xcubeId?: string | null;
  }[];
  const xcubeId = folders.find((folder) => folder.id === folderId)?.xcubeId;
  expect(xcubeId).toMatch(/^f[0-9a-z]+$/);
  return xcubeId!;
}

/**
 * A chart in a folder on one measure, bound there as an approval binds it
 * (AC-272): put there as the single user shares one, through My workspace
 * and a proposal they approve (T359, AC-254). Its id.
 */
async function chartOn(
  request: APIRequestContext,
  folderId: string,
  title: string,
  cube: string,
  measure: string,
): Promise<string> {
  // `sharedIn` holds the make, the save and the approval to their statuses.
  const id = await sharedIn(request, 'chart', folderId, {
    title,
    chart: {
      source: { cube },
      wells: { measures: [`${cube}.${measure}`], dimensions: [], timeDimensions: [] },
      chartType: 'kpi',
      filters: [],
    },
  });
  // Landed in the folder itself, not left in My workspace.
  const stored = await request.get(`/api/documents/chart/${id}`);
  expect(stored.status()).toBe(200);
  expect(((await stored.json()) as { body: { folderId?: string } }).body.folderId).toBe(folderId);
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

/** The warning a workspace save gives before it saves (T546, AC-141). */
const warningOf = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'this changes members that' });

test('a folder’s model opens beside its files, one after another in place, read-only; in My workspace a file with problems is marked', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const project = testInfo.project.name;
  const folderId = await folderOf(request, `T342 files ${project} ${String(Date.now())}`);
  const [a, b] = [`t342_a_${project}`, `t342_b_${project}`];
  const files = [
    { path: `cubes/${a}.yml`, content: cube(a) },
    { path: `cubes/${b}.yml`, content: cube(b) },
  ];
  // Two of its own in My workspace, going to the folder: where a file is edited.
  const [c, d] = [`t342_c_${project}`, `t342_d_${project}`];
  let own: Awaited<ReturnType<typeof inMyWorkspace>> | undefined;
  /** The copy "Edit in my workspace" makes, in a project folder of its own. */
  let copyFolder = '';
  try {
    await publish(request, folderId, files);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/explore?folder=${folderId}`);
    await page
      .getByTestId(`item-cubes/${a}.yml`)
      // Its name, not its ⋯ "Actions for <file>" (T526).
      .getByRole('button', { name: `${a}.yml`, exact: true })
      .click();

    // The folder and the file in the address, the folder's files beside it.
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folderId}/models/cubes%2F${a}\\.yml$`),
    );
    await expect(yaml(page, `cubes/${a}.yml`)).toContainText(`name: ${a}`);
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
      .getByRole('link', { name: new RegExp(`^${b}\\.yml`) })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folderId}/models/cubes%2F${b}\\.yml$`),
    );
    await expect(yaml(page, `cubes/${b}.yml`)).toContainText(`name: ${b}`);
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(
      true,
    );
    // Shared: read-only, nothing made here, and Edit in my workspace offered (rule 71).
    await expect(yaml(page, `cubes/${b}.yml`)).toHaveAttribute('aria-readonly', 'true');
    for (const name of [/New cube/, /New view/])
      await expect(tree(page).getByRole('button', { name })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit in my workspace' })).toBeEnabled();
    // Pressed: the single user's copy in a project folder of My workspace,
    // open there to edit and save, the folder's file unchanged (AC-278, AC-254).
    await page.getByRole('button', { name: 'Edit in my workspace' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/(?!${folderId})[^/]+/models/cubes%2F${b}\\.yml$`),
    );
    copyFolder = decodeURIComponent(new URL(page.url()).pathname.split('/')[3] ?? '');
    await expect(yaml(page, `cubes/${b}.yml`)).toContainText(`name: ${b}`);
    await expect(yaml(page, `cubes/${b}.yml`)).not.toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    expect(
      (await modelFilesIn(request, folderId)).find((file) => file.path === `cubes/${b}.yml`)
        ?.content,
    ).toBe(cube(b));

    // In My workspace: a file that stops parsing is marked in the tree, in
    // words; the other isn't.
    own = await inMyWorkspace(request, folderId, [
      { path: `cubes/${c}.yml`, content: cube(c) },
      { path: `cubes/${d}.yml`, content: cube(d) },
    ]);
    const projectFolder = own.folderOf(`cubes/${c}.yml`);
    await page.goto(
      `/explore/folders/${projectFolder}/models/${encodeURIComponent(`cubes/${d}.yml`)}`,
    );
    await expect(yaml(page, `cubes/${d}.yml`)).toContainText(`name: ${d}`);
    await expect(tree(page).getByRole('link')).toHaveCount(2);
    await page.locator('.cm-line', { hasText: 'sql_table:' }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(': x');
    await expect(tree(page).getByRole('link', { name: new RegExp(`^${d}\\.yml`) })).toContainText(
      'problems',
    );
    await expect(
      tree(page).getByRole('link', { name: new RegExp(`^${c}\\.yml`) }),
    ).not.toContainText('problems');

    // New cube makes a file in this folder of My workspace, going where it is
    // asked to (AC-282); discarded, the folder's model opens.
    await tree(page).getByRole('button', { name: 'New cube' }).click();
    const asking = page.getByRole('dialog', { name: 'New cube in My workspace' });
    await chooseTarget(asking, folderId);
    await asking.getByRole('button', { name: 'Create' }).click();
    await page
      .getByRole('alertdialog', { name: 'Leave with unpublished changes?' })
      .getByRole('button', { name: 'Leave without publishing' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${projectFolder}/models/cubes%2Fnew_cube_1\\.yml$`),
    );
    await expect(tree(page).getByRole('link', { name: /^new_cube_1\.yml/ })).toContainText(
      'unpublished',
    );
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/folders/${projectFolder}/models$`));
    await expect(tree(page).getByRole('link')).toHaveCount(2);
  } finally {
    await own?.drop();
    await cleanUp(
      request,
      [],
      [
        ...(copyFolder === '' ? [] : [{ folderId: copyFolder, path: `cubes/${b}.yml` }]),
        ...files.map(({ path }) => ({ folderId, path })),
      ],
      [...(copyFolder === '' ? [] : [copyFolder]), folderId],
    );
  }
});

test('saving a copy of a folder’s file lists the charts bound to its members there, said by their own names (T546)', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const title = `T342 edit ${testInfo.project.name} ${String(Date.now())}`;
  const folderId = await folderOf(request, title);
  // This run's: a name is one item across the system, and an earlier run's
  // charts on it would be counted too (T728).
  const name = `t342_edited_${testInfo.project.name}_${Date.now().toString(36)}`;
  const path = `cubes/${name}.yml`;
  const charts: string[] = [];
  let copy: Awaited<ReturnType<typeof myModelCopy>> | undefined;
  try {
    await publish(request, folderId, [{ path, content: cube(name) }]);
    const xcubeId = await xcubeIdOf(request, folderId);
    const chart = await chartOn(request, folderId, `${title} chart`, name, 'count');
    charts.push(chart);
    // Bound in its folder by the cube's own name: no folder prefix (T728; AC-328, AC-272).
    expect(await measuresOf(request, chart)).toEqual([`${name}.count`]);
    expect(await heldIn(request, name)).toEqual([{ folderId: xcubeId, name }]);

    // Changed in a copy in My workspace, as a shared model is.
    copy = await myModelCopy(request, path, folderId);
    await page.goto(copy.href);
    await expect(yaml(page, path)).toContainText(`name: ${name}`);
    await renameCount(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const warning = warningOf(page);
    await expect(warning).toBeVisible(PUBLISHED);
    await expect(warning.locator('.model-references__lead')).toHaveText(
      `Landed in ${title}, this changes members that 1 chart and 0 dashboards use.`,
    );
    await expect(warning.getByRole('list', { name: 'Charts' })).toContainText(
      `${title} chart — uses ${name}.count`,
    );
    // Nothing of the folder's xcube id in what it says.
    await expect(warning).not.toContainText(xcubeId);
    await warning.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await cleanUp(
      request,
      charts,
      [{ folderId, path }, ...(copy === undefined ? [] : [copy])],
      [folderId, ...(copy === undefined ? [] : [copy.folderId])],
    );
  }
});

test('a copy of a root file lists the charts bound to a folder’s view of it, by that folder’s name (T546)', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const title = `T342 view ${testInfo.project.name} ${String(Date.now())}`;
  const folderId = await folderOf(request, title);
  // The root is every browser's: a cube of this browser's own.
  // This run's: an earlier run's charts on it would be counted too (T728).
  const rootCube = `t342_root_${testInfo.project.name}_${Date.now().toString(36)}`;
  const rootPath = `cubes/${rootCube}.yml`;
  const view = `t342_view_${testInfo.project.name}_${Date.now().toString(36)}`;
  const viewPath = `views/${view}.yml`;
  const charts: string[] = [];
  const files: { folderId: string; path: string }[] = [];
  let copy: Awaited<ReturnType<typeof myModelCopy>> | undefined;
  try {
    await publish(request, 'root', [{ path: rootPath, content: cube(rootCube) }]);
    files.unshift({ folderId: 'root', path: rootPath });
    await publish(request, folderId, [
      {
        path: viewPath,
        content: [
          'views:',
          `  - name: ${view}`,
          '    cubes:',
          `      - join_path: ${rootCube}`,
          '        includes: [count]',
          '',
        ].join('\n'),
      },
    ]);
    files.unshift({ folderId, path: viewPath });
    const xcubeId = await xcubeIdOf(request, folderId);
    const chart = await chartOn(request, folderId, `${title} chart`, view, 'count');
    charts.push(chart);
    // A folder's view, published and bound under its own name (T728; AC-328, AC-272).
    expect(await measuresOf(request, chart)).toEqual([`${view}.count`]);
    expect(await heldIn(request, view)).toEqual([{ folderId: xcubeId, name: view }]);
    const served = (
      (await (await request.get('/api/meta')).json()) as { cubes?: { name: string }[] }
    ).cubes?.map((each) => each.name);
    expect(served).toContain(view);
    expect(served?.filter((each) => each.includes('__'))).toEqual([]);

    // The root's file, changed in a copy in My workspace, going to the root.
    copy = await myModelCopy(request, rootPath);
    await page.goto(copy.href);
    await expect(yaml(page, rootPath)).toContainText(`name: ${rootCube}`);
    await renameCount(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const warning = warningOf(page);
    await expect(warning).toBeVisible(PUBLISHED);
    await expect(warning.locator('.model-references__lead')).toHaveText(
      'Landed in Shared, this changes members that 1 chart and 0 dashboards use.',
    );
    await expect(warning.getByRole('list', { name: 'Charts' })).toContainText(
      `${title} chart — uses ${view}.count (${title})`,
    );
    // Nothing of the folder's xcube id in what it says.
    await expect(warning).not.toContainText(xcubeId);
    await warning.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await cleanUp(
      request,
      charts,
      [...(copy === undefined ? [] : [copy]), ...files],
      [folderId, ...(copy === undefined ? [] : [copy.folderId])],
    );
  }
});
