import { readFileSync } from 'node:fs';

import type { APIRequestContext, Page } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T331: Explore and the top bar, shaped by role.
 *
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists Explore to every user; Data sources, Jobs and
 * Schedules to Super-Admins and read-write members; and Security to
 * Super-Admins. It SHALL list no Model workspace.
 * Fails when: the switcher shows a "Dashboards" or "Model" entry, omits an
 * entry the user's role may use, or shows one it may not.
 *
 * AC-192: WHEN the user opens a folder in Explore, THE SYSTEM SHALL show a
 * breadcrumb of its ancestors, the folder's name as the page heading (with
 * Rename beside it for those who may rename it), the Explore search box, and
 * a single "New" menu. In a shared folder the menu offers Folder to the
 * folder's read-write members; in the user's workspace it offers Dashboard,
 * Chart, Model, Data source and Folder, and, under a divider, Import a
 * dashboard…
 * Fails when: the folder's name is not the page heading, a breadcrumb
 * ancestor does not open that folder, creating is offered other than through
 * the New menu, or a shared folder's New menu offers anything but Folder.
 *
 * AC-194: THE SYSTEM SHALL show the folder tree as a full-height pane headed
 * "Folders", with a "+ Folder" action for those who may create one. It holds
 * the shared root, showing only the folders the user may see, and "My
 * workspace" for users who have a workspace. Each folder shows how many items
 * it and its subfolders hold, counting only items the user may see.
 * Fails when: a folder the user may not see appears; "My workspace" is
 * missing for a user who has a workspace, or shown to one who doesn't; a
 * count includes items the user may not see, or leaves out items in
 * subfolders; or the tree scrolls away with the contents.
 *
 * Rule 69: every folder header shows the user's access there as a chip with
 * icon and label: Super-Admin, Read-write or View only.
 *
 * The fixture, made by `super`: "Roles" (read-write `sales-rw`, so `writer`;
 * read-only `sales-ro`, so `reader`) holds a dashboard, a model and "Inner";
 * Inner holds a dashboard and a data source. Beside it, "Hidden" is only
 * `managers`', and "Alone" no group's. `nobody` is in no group.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const CUBE = `roles_${RUN}`;
const MODEL = `cubes/${CUBE}.yml`;
const made = {
  roles: '',
  inner: '',
  hidden: '',
  alone: '',
  boards: [] as string[],
  source: '',
  model: false,
};
const names = {
  roles: `Roles ${RUN}`,
  inner: `Inner ${RUN}`,
  hidden: `Hidden ${RUN}`,
  alone: `Alone ${RUN}`,
};

async function folder(
  request: APIRequestContext,
  title: string,
  parent: string,
  access?: { readOnly: string[] | null; readWrite: string[] | null },
) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  const id = ((await answer.json()) as { id: string }).id;
  if (access !== undefined)
    expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(200);
  return id;
}

async function board(request: APIRequestContext, title: string, folderId: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'dashboard', title, folderId },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  const id = ((await answer.json()) as { id: string }).id;
  made.boards.push(id);
  return id;
}

const pane = (page: Page) => page.getByRole('complementary', { name: 'Folders' });
const tree = (page: Page) => pane(page).getByRole('tree');
const node = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });
const countOf = (page: Page, name: string) =>
  node(page, name).locator('.folder-tree__count').first();
const contents = (page: Page) => page.getByTestId('explore-contents');
const head = (page: Page) => contents(page).locator('.explore__head');
const newButton = (page: Page) => contents(page).getByRole('button', { name: 'New', exact: true });
const plusFolder = (page: Page) => pane(page).getByRole('button', { name: '+ Folder' });
const chip = (page: Page) => head(page).getByTestId('access-chip');
const switcher = (page: Page) =>
  page.getByRole('banner').getByRole('navigation', { name: 'Workspaces' }).first();

/** Explore with its roots' counts read, which say which roots the user has. */
async function explore(page: Page, folderId?: string) {
  const counted = page.waitForResponse((answer) => answer.url().includes('/api/folder-roots'));
  await page.goto(folderId === undefined ? '/explore' : `/explore?folder=${folderId}`);
  await counted;
}

/** Opens a folder from the tree, and waits for its heading. */
async function open(page: Page, name: string) {
  await node(page, name).getByRole('button').first().click();
  await expect(contents(page).getByRole('heading', { level: 1 })).toHaveText(name);
}

/** What the New menu offers, in order. */
async function offered(page: Page) {
  await newButton(page).click();
  const menu = page.getByRole('menu', { name: 'New' });
  const items = await menu.getByRole('menuitem').allTextContents();
  await page.keyboard.press('Escape');
  return items;
}

/**
 * The workspace switcher's entries, once who is signed in is known: never a
 * Model or Dashboards entry, for anyone (AC-001).
 */
async function entries(page: Page) {
  await expect(switcher(page).getByRole('link', { name: 'Explore' })).toBeVisible();
  await expect(switcher(page).getByRole('link', { name: /Model|Dashboards/ })).toHaveCount(0);
  await expect(page.getByTestId('narrow-menu').getByText(/^(Model|Dashboards)$/)).toHaveCount(0);
  return switcher(page).getByRole('link').allTextContents();
}

test.describe.configure({ mode: 'serial' });

test.describe('Explore and the top bar by role (T331; AC-001, AC-192, AC-194)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // The model first, then the data source: xcube keeps one a cube is bound to.
    if (made.model)
      await request.delete(
        `/api/model/files?folder=${made.roles}&path=${encodeURIComponent(MODEL)}`,
      );
    if (made.source !== '') await request.delete(`/api/data-sources/${made.source}`);
    for (const id of made.boards) await request.delete(`/api/documents/dashboard/${id}`);
    for (const id of [made.inner, made.roles, made.hidden, made.alone].filter((id) => id !== ''))
      await request.delete(`/api/documents/folder/${id}`);
    await context.close();
  });

  test.describe('as super, a Super-Admin', () => {
    test.use({ role: 'super' });

    test('makes the folders, and the items each role may or may not see', async ({ page }) => {
      const { request } = page;
      made.roles = await folder(request, names.roles, 'root', {
        readOnly: ['sales-ro'],
        readWrite: ['sales-rw'],
      });
      made.inner = await folder(request, names.inner, made.roles);
      made.hidden = await folder(request, names.hidden, 'root', {
        readOnly: null,
        readWrite: ['managers'],
      });
      made.alone = await folder(request, names.alone, 'root');
      await board(request, `Roles board ${RUN}`, made.roles);
      await board(request, `Inner board ${RUN}`, made.inner);
      // A model in Roles, and a data source in Inner: folder items that a
      // read-only member may not see (AC-263).
      const published = await request.post('/api/model/publish', {
        data: {
          folderId: made.roles,
          files: [
            {
              path: MODEL,
              content: [
                'cubes:',
                `  - name: ${CUBE}`,
                '    sql_table: public.orders',
                '    measures:',
                '      - name: count',
                '        type: count',
                '',
              ].join('\n'),
            },
          ],
        },
      });
      expect(published.status(), await published.text()).toBe(200);
      made.model = true;
      const source = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: made.inner,
          name: `roles_${RUN}`,
          driver: 'postgres',
          authMethod: 'password',
          fields: FIELDS,
          sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
        }),
      });
      expect(source.status(), await source.text()).toBe(201);
      made.source = ((await source.json()) as { id: string }).id;
    });

    test('lists every workspace but Model in the bar, and keeps Model’s address', async ({
      page,
    }) => {
      await explore(page);
      expect(await entries(page)).toEqual([
        'Explore',
        'Data sources',
        'Jobs',
        'Schedules',
        'Security',
      ]);
      // Below 1,024 px the menu holds the same.
      expect(await page.getByTestId('narrow-menu').locator('a').allTextContents()).toEqual([
        'Explore',
        'Data sources',
        'Jobs',
        'Schedules',
        'Security',
      ]);
      // A link into the Model workspace still opens it (T331).
      await page.goto('/model');
      await expect(page.getByRole('heading', { level: 1, name: 'Model' })).toBeVisible();
      await expect(switcher(page).getByRole('link', { name: 'Model' })).toHaveCount(0);
    });

    test('opens a root model from its row in Explore, in the model editor', async ({ page }) => {
      await explore(page);
      const row = contents(page).getByTestId('item-cubes/orders.yml');
      await expect(row.getByRole('cell').nth(0)).toHaveText('Model');
      await row.getByRole('button', { name: 'orders.yml' }).click();
      // In its folder, the root, named in the address beside the file (T342, AC-222).
      await expect(page).toHaveURL(/\/explore\/folders\/root\/models\/cubes%2Forders\.yml$/);
      await expect(page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' })).toContainText(
        'name: orders',
      );
    });

    test('sees every folder, each counting all it and its subfolders hold, models and data sources too', async ({
      page,
    }) => {
      await explore(page);
      await expect(pane(page).getByRole('heading', { level: 2 })).toHaveText('Folders');
      await expect(node(page, 'My workspace')).toHaveAttribute('aria-level', '1');
      await expect(node(page, 'Shared')).toHaveAttribute('aria-level', '1');
      for (const name of [names.roles, names.inner, names.hidden, names.alone])
        await expect(node(page, name)).toBeVisible();
      // Roles: its dashboard and model, and Inner's dashboard and data source.
      await expect(countOf(page, names.roles)).toHaveText('4');
      await expect(countOf(page, names.inner)).toHaveText('2');
      await expect(plusFolder(page)).toBeVisible();
    });

    test('is a Super-Admin in each shared folder, where New makes a folder alone', async ({
      page,
    }) => {
      await explore(page);
      await expect(chip(page)).toHaveText('Your access: Super-Admin');
      await expect(chip(page).locator('svg[data-icon="shield"]')).toHaveCount(1);
      expect(await offered(page)).toEqual(['▣Folder']);

      await open(page, names.roles);
      await expect(chip(page)).toHaveText('Your access: Super-Admin');
      expect(await offered(page)).toEqual(['▣Folder']);
      await expect(head(page).getByRole('button', { name: 'Rename' })).toBeVisible();
      await expect(plusFolder(page)).toBeVisible();
      await expect(contents(page)).toContainText(
        'To add a dashboard, chart, model or data source here, create it in My workspace with this folder as its target.',
      );

      // A folder no group reaches: only Super-Admins see it (rule 63).
      await open(page, names.alone);
      await expect(head(page).getByTestId('only-super-admins')).toHaveText(
        'Only Super-Admins can see this folder',
      );
      await expect(
        head(page).getByTestId('only-super-admins').locator('svg[data-icon="lock"]'),
      ).toHaveCount(1);
    });

    test('makes every kind in My workspace, with Import a dashboard… under a divider', async ({
      page,
    }) => {
      await explore(page);
      await open(page, 'My workspace');
      // The band says whose it is: no chip.
      await expect(chip(page)).toHaveCount(0);
      // AC-192's Model, between Chart and Data source, is T347's: a model
      // made in the workspace needs its target and its overlay first.
      expect(await offered(page)).toEqual([
        '▦Dashboard',
        '◢Chart',
        '◍Data source',
        '▣Folder',
        '⤒Import a dashboard…from a file',
      ]);
      await newButton(page).click();
      const menu = page.getByRole('menu', { name: 'New' });
      await expect(menu.getByRole('separator')).toHaveCount(1);
      const [separator, folderItem, importItem] = await Promise.all([
        menu.getByRole('separator').boundingBox(),
        menu.getByRole('menuitem', { name: /Folder/ }).boundingBox(),
        menu.getByRole('menuitem', { name: /Import a dashboard/ }).boundingBox(),
      ]);
      expect(separator!.y).toBeGreaterThan(folderItem!.y);
      expect(importItem!.y).toBeGreaterThan(separator!.y);
      await page.keyboard.press('Escape');
      await expect(plusFolder(page)).toBeVisible();
    });

    test('keeps the tree in view, full height, while the contents scroll', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 500 });
      await explore(page);
      const aside = pane(page);
      await expect(node(page, 'Shared')).toBeVisible();
      const box = await aside.boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(500 - 24);
      const before = box?.y ?? 0;
      const scroller = contents(page).getByRole('table').locator('..');
      await expect
        .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeGreaterThan(200);
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);
      expect((await aside.boundingBox())?.y).toBeCloseTo(before, 0);
      await expect(node(page, 'Shared')).toBeInViewport();
    });
  });

  test.describe('as writer, a read-write member of Roles', () => {
    test.use({ role: 'writer' });

    test('lists Explore, Data sources, Jobs and Schedules in the bar, and no Model or Security', async ({
      page,
    }) => {
      await explore(page);
      expect(await entries(page)).toEqual(['Explore', 'Data sources', 'Jobs', 'Schedules']);
    });

    test('sees Roles and Inner, counted with its models and data sources, and nothing of Hidden', async ({
      page,
    }) => {
      await explore(page);
      await expect(node(page, 'My workspace')).toBeVisible();
      await expect(node(page, 'Shared')).toBeVisible();
      await expect(countOf(page, names.roles)).toHaveText('4');
      await expect(countOf(page, names.inner)).toHaveText('2');
      await expect(node(page, names.hidden)).toHaveCount(0);
      await expect(node(page, names.alone)).toHaveCount(0);
    });

    test('views the root, and makes only folders in Roles, where they are Read-write', async ({
      page,
    }) => {
      await explore(page);
      // The root is theirs to view, as the ancestor of their folder (AC-262).
      await expect(chip(page)).toHaveText('Your access: View only');
      await expect(chip(page).locator('svg[data-icon="eye"]')).toHaveCount(1);
      await expect(newButton(page)).toHaveCount(0);
      await expect(plusFolder(page)).toHaveCount(0);

      await open(page, names.roles);
      await expect(chip(page)).toHaveText('Your access: Read-write');
      await expect(chip(page).locator('svg[data-icon="pencil"]')).toHaveCount(1);
      expect(await offered(page)).toEqual(['▣Folder']);
      await expect(plusFolder(page)).toBeVisible();
      await expect(head(page).getByRole('button', { name: 'Rename' })).toBeVisible();
      await expect(contents(page)).toContainText(
        'To add a dashboard, chart, model or data source here, create it in My workspace with this folder as its target.',
      );

      // New's Folder makes one in Roles, named in the heading ready to type.
      await newButton(page).click();
      await page
        .getByRole('menu', { name: 'New' })
        .getByRole('menuitem', { name: /Folder/ })
        .click();
      const name = contents(page).getByRole('textbox', { name: 'Folder name' });
      await expect(name).toBeFocused();
      await name.fill(`Made by writer ${RUN}`);
      await name.press('Enter');
      await expect(contents(page).getByRole('heading', { level: 1 })).toHaveText(
        `Made by writer ${RUN}`,
      );
      const crumbs = contents(page).getByRole('navigation', { name: 'Breadcrumb' });
      await expect(crumbs.getByRole('button')).toHaveText([
        'Shared',
        names.roles,
        `Made by writer ${RUN}`,
      ]);
      const listed = (await (
        await page.request.get(`/api/folders/${made.roles}/contents`)
      ).json()) as {
        kind: string;
        id: string;
        title: string;
      }[];
      const mine = listed.find((item) => item.title === `Made by writer ${RUN}`);
      expect(mine?.kind).toBe('folder');
      expect((await page.request.delete(`/api/documents/folder/${mine!.id}`)).status()).toBe(204);
    });

    test('makes every kind in My workspace', async ({ page }) => {
      await explore(page);
      await open(page, 'My workspace');
      await expect(chip(page)).toHaveCount(0);
      expect(await offered(page)).toEqual([
        '▦Dashboard',
        '◢Chart',
        '◍Data source',
        '▣Folder',
        '⤒Import a dashboard…from a file',
      ]);
    });
  });

  test.describe('as reader, a read-only member of Roles', () => {
    test.use({ role: 'reader' });

    test('lists Explore alone in the bar', async ({ page }) => {
      await explore(page);
      expect(await entries(page)).toEqual(['Explore']);
    });

    test('sees Roles and Inner counted by their dashboards alone, and no My workspace', async ({
      page,
    }) => {
      await explore(page);
      await expect(node(page, 'Shared')).toBeVisible();
      await expect(node(page, 'My workspace')).toHaveCount(0);
      // Neither the model nor the data source: a reader sees dashboards (AC-263).
      await expect(countOf(page, names.roles)).toHaveText('2');
      await expect(countOf(page, names.inner)).toHaveText('1');
      await expect(node(page, names.hidden)).toHaveCount(0);
      await expect(node(page, names.alone)).toHaveCount(0);
    });

    test('views Roles and Inner, with nothing to make or rename', async ({ page }) => {
      await explore(page);
      await expect(chip(page)).toHaveText('Your access: View only');
      await expect(newButton(page)).toHaveCount(0);
      await expect(plusFolder(page)).toHaveCount(0);

      for (const name of [names.roles, names.inner]) {
        await open(page, name);
        await expect(chip(page)).toHaveText('Your access: View only');
        await expect(newButton(page)).toHaveCount(0);
        await expect(plusFolder(page)).toHaveCount(0);
        await expect(head(page).getByRole('button', { name: 'Rename' })).toHaveCount(0);
        await expect(contents(page)).not.toContainText('create it in My workspace');
      }
      // Its breadcrumb's ancestor opens that folder (AC-192).
      await contents(page)
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('button', { name: names.roles })
        .click();
      await expect(contents(page).getByRole('heading', { level: 1 })).toHaveText(names.roles);

      // No row offers a change (rule 68; design 04, state G): the dashboard's
      // ⋯ holds Export… alone, and Inner's row has none.
      await expect(
        contents(page)
          .getByTestId(`item-${made.inner}`)
          .getByRole('button', { name: /^Actions for/ }),
      ).toHaveCount(0);
      await contents(page)
        .getByTestId(`item-${made.boards[0]!}`)
        .getByRole('button', { name: /^Actions for/ })
        .click();
      await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Export…']);
      await page.keyboard.press('Escape');
    });

    test('is offered nothing at My workspace’s address, having none', async ({ page }) => {
      await explore(page, 'mine');
      await expect(node(page, 'My workspace')).toHaveCount(0);
      await expect(node(page, 'Shared')).toBeVisible();
      await expect(newButton(page)).toHaveCount(0);
      await expect(plusFolder(page)).toHaveCount(0);
    });
  });

  test.describe('as nobody, in no group', () => {
    test.use({ role: 'nobody' });

    test('lists Explore alone in the bar', async ({ page }) => {
      await explore(page);
      expect(await entries(page)).toEqual(['Explore']);
    });

    test('has no root, no My workspace, nothing to make, and a note on where access comes from', async ({
      page,
    }) => {
      await explore(page);
      await expect(pane(page).getByRole('heading', { level: 2 })).toHaveText('Folders');
      await expect(
        contents(page).getByRole('heading', {
          level: 1,
          name: 'You don’t have access to any folders yet.',
        }),
      ).toBeVisible();
      await expect(contents(page)).toContainText(
        'wechart gives access through AD groups; ask whoever manages the folder you need to add one of your groups.',
      );
      await expect(pane(page).getByRole('tree')).toHaveCount(0);
      await expect(pane(page).getByRole('treeitem')).toHaveCount(0);
      await expect(plusFolder(page)).toHaveCount(0);
      await expect(newButton(page)).toHaveCount(0);
      await expect(chip(page)).toHaveCount(0);
      for (const name of Object.values(names)) await expect(page.getByText(name)).toHaveCount(0);
    });
  });
});
