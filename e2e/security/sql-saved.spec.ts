import { readFileSync } from 'node:fs';

import type { Browser, Page } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T813 (AC-458): the Saved tab lists the user's own saved queries by name,
 * each with its data source and "Only me" as an icon and a label, with Open,
 * Rename…, Duplicate and Delete on its ⋯, Delete followed by an Undo toast.
 * Nobody else, a Super-Admin included, lists, opens, renames, deletes or
 * finds one, and none is in Explore's search, a proposal or a bookmark.
 *
 * Fails when: another user, a Super-Admin included, sees or opens someone's
 * saved query by any route; one appears in Explore, a folder, a proposal or
 * a bookmark; or a deleted one can't be brought back from the toast.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const world = { folderId: '', source: '' };
const SOURCE = `sqlsaved_${RUN}`;
const NAME = `Top customers ${RUN}`;
const SQL = 'SELECT * FROM customers WHERE country = {{c}}';
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };

test.describe.configure({ mode: 'default' });

async function signedIn(browser: Browser, role: 'super' | 'writer') {
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
    const request = admin.page.request;
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `SQL saved ${RUN}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    world.folderId = ((await made.json()) as { id: string }).id;
    const access = await request.put(`/api/folders/${world.folderId}/access`, {
      data: { readOnly: [], readWrite: ['sales-rw'] },
    });
    expect(access.status()).toBe(200);
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
    world.source = ((await source.json()) as { id: string }).id;
    const on = await request.put(`/api/data-sources/${world.source}/sql-runner`, {
      data: { on: true, readOnlyConfirmed: true },
    });
    expect(on.status(), await on.text()).toBe(200);
  } finally {
    await admin.context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const writer = await signedIn(browser, 'writer');
  try {
    const listed = (await (await writer.page.request.get('/api/sql/saved')).json()) as {
      queries: { id: string; name: string }[];
    };
    for (const each of listed.queries.filter((query) => query.name.includes(RUN)))
      await writer.page.request.delete(`/api/sql/saved/${each.id}`);
  } finally {
    await writer.context.close();
  }
  const admin = await signedIn(browser, 'super');
  try {
    if (world.source !== '') await admin.page.request.delete(`/api/data-sources/${world.source}`);
    if (world.folderId !== '')
      await admin.page.request.delete(`/api/documents/folder/${world.folderId}`);
  } finally {
    await admin.context.close();
  }
});

const saved = (page: Page) => page.getByRole('complementary', { name: 'Saved and History' });
const rowOf = (page: Page, name: string) =>
  saved(page)
    .getByRole('list', { name: 'Saved queries' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name, exact: true }) });

test.describe('the Saved tab (T813, AC-458)', () => {
  test('lists the owner’s saved query with its source and “Only me”; Open, Rename…, Duplicate, and Delete with Undo; nobody else reaches it', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    let id = '';
    try {
      const made = await page.request.post('/api/sql/saved', {
        data: {
          name: NAME,
          description: 'For the check',
          sourceId: world.source,
          sql: SQL,
          parameters: [{ name: 'c', type: 'text', value: 'France' }],
        },
      });
      expect(made.status(), await made.text()).toBe(201);
      id = ((await made.json()) as { id: string }).id;

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      const row = rowOf(page, NAME);
      await expect(row).toContainText(`${SOURCE} · Shared / SQL saved ${RUN}`);
      await expect(row.locator('.sql-saved__only')).toHaveText('Only me');
      await expect(row.locator('.sql-saved__only svg[aria-hidden="true"]')).toHaveCount(1);
      await expect(row).toContainText('1 parameter');

      // The ⋯: Open, Rename…, Duplicate and Delete.
      const actions = row.getByRole('button', { name: `Actions for ${NAME}` });
      await actions.click();
      const menu = page.getByRole('menu', { name: `Actions for ${NAME}` });
      await expect(menu.getByRole('menuitem')).toHaveText(['Open', 'Rename…', 'Duplicate', 'Delete']);

      // Open: a tab named after it, on its source, with its SQL and its value.
      await menu.getByRole('menuitem', { name: 'Open' }).click();
      const tab = page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab', { name: new RegExp(`^${NAME}, `) });
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.sql-editor .cm-content')).toHaveText(SQL);
      await expect(
        page.getByRole('group', { name: 'Parameters' }).getByRole('textbox', { name: 'c, value' }),
      ).toHaveValue('France');
      await expect(page.getByText('Saved query · Only me')).toBeVisible();

      // Rename…: renamed in the list, and in its open tab.
      const renamed = `${NAME} renamed`;
      await actions.click();
      await page.getByRole('menuitem', { name: 'Rename…' }).click();
      const dialog = page.getByRole('dialog', { name: `Rename ${NAME}` });
      await dialog.getByRole('textbox', { name: 'Name' }).fill(renamed);
      await dialog.getByRole('button', { name: 'Rename' }).click();
      await expect(rowOf(page, renamed)).toHaveCount(1);
      await expect(
        page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab', { name: new RegExp(`^${renamed}, `) }),
      ).toHaveCount(1);

      // Duplicate: a copy, its own.
      await rowOf(page, renamed).getByRole('button', { name: `Actions for ${renamed}` }).click();
      await page.getByRole('menuitem', { name: 'Duplicate' }).click();
      await expect(rowOf(page, `${renamed} (copy)`)).toHaveCount(1);

      // Delete, then Undo: back under its own id.
      await rowOf(page, renamed).getByRole('button', { name: `Actions for ${renamed}` }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      const toast = page.getByTestId('undo-toast');
      await expect(toast).toContainText(`Deleted “${renamed}”.`);
      await expect(rowOf(page, renamed)).toHaveCount(0);
      expect((await page.request.get(`/api/sql/saved/${id}`)).status()).toBe(404);
      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect(rowOf(page, renamed)).toHaveCount(1);
      const back = await page.request.get(`/api/sql/saved/${id}`);
      expect(back.status()).toBe(200);
      expect(await back.json()).toMatchObject({ name: renamed, sql: SQL, sourceId: world.source });
    } finally {
      await context.close();
    }

    // Nobody else, a Super-Admin included, reaches it by any route.
    const admin = await signedIn(browser, 'super');
    try {
      const request = admin.page.request;
      const theirs = await request.get('/api/sql/saved');
      expect(theirs.status()).toBe(200);
      expect(await theirs.text()).not.toContain(RUN);
      expect((await request.get(`/api/sql/saved/${id}`)).status()).toBe(404);
      expect(
        (
          await request.put(`/api/sql/saved/${id}`, {
            data: { name: `Taken ${RUN}`, description: '', sourceId: world.source, sql: 'SELECT 1', parameters: [] },
          })
        ).status(),
      ).toBe(404);
      expect((await request.delete(`/api/sql/saved/${id}`)).status()).toBe(404);
      // Not in search (Explore's and ⌘K's), and not in proposals.
      const search = await request.get(`/api/search?q=${encodeURIComponent(NAME)}`);
      expect(search.status()).toBe(200);
      expect(await search.text()).not.toContain(RUN);
      const proposals = await request.get('/api/proposals');
      expect(await proposals.text()).not.toContain(RUN);
      // The Saved tab in their own workspace lists none of it.
      await admin.page.setViewportSize({ width: 1440, height: 900 });
      await admin.page.goto('/sql');
      await expect(saved(admin.page).locator('.sql-saved')).toBeVisible();
      await expect(saved(admin.page)).not.toContainText(RUN);
    } finally {
      await admin.context.close();
    }

    // The owner's own search, Explore's and ⌘K's, and their proposals hold none either.
    const writer = await signedIn(browser, 'writer');
    try {
      const search = await writer.page.request.get(`/api/search?q=${encodeURIComponent(NAME)}&limit=5000`);
      expect(search.status()).toBe(200);
      expect(await search.text()).not.toContain(RUN);
      expect(await (await writer.page.request.get('/api/proposals')).text()).not.toContain(RUN);
    } finally {
      await writer.context.close();
    }
  });
});
