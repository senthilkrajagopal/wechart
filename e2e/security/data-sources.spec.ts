import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T364 (AC-157, AC-233): Data sources lists every data source the user may
 * see, in every folder — its folder's path, opening the folder in Explore,
 * its driver, and its health from its last connection test — and none they
 * may not; its title and a note saying what it is for, never that managing
 * them waits for a later phase.
 *
 * A folder read-write for `sales-rw` (writer) and read-only for `sales-ro`
 * (reader), under a parent of its own, made by `super`: one data source in
 * each, and one in a folder only `managers` reach. The one in the folder is
 * tested against compose's sample database (its development login).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const made = { parent: '', folder: '', hidden: '', sources: [] as string[] };

async function folder(request: APIRequestContext, title: string, parent: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(answer.status()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

async function dataSource(request: APIRequestContext, folderId: string, name: string) {
  const answer = await request.post('/api/data-sources', {
    data: {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
    },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  const id = ((await answer.json()) as { id: string }).id;
  made.sources.push(id);
  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('Data sources, as each role sees them (T364, AC-157, AC-233)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    for (const id of made.sources) await context.request.delete(`/api/data-sources/${id}`);
    for (const id of [made.folder, made.parent, made.hidden].filter((each) => each !== ''))
      await context.request.delete(`/api/documents/folder/${id}`);
    await context.close();
  });

  test.describe('as super, who makes them', () => {
    test.use({ role: 'super' });

    test('sets up a folder of sales’, its parent, and one only managers reach, each with a data source', async ({
      page,
    }) => {
      const request = page.request;
      made.parent = await folder(request, `Sources parent ${RUN}`, 'root');
      made.folder = await folder(request, `Sources ${RUN}`, made.parent);
      made.hidden = await folder(request, `Sources hidden ${RUN}`, 'root');
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await request.put(`/api/folders/${made.hidden}/access`, {
            data: { readOnly: null, readWrite: ['managers'] },
          })
        ).status(),
      ).toBe(200);
      const tested = await dataSource(request, made.folder, `sales_${RUN}`);
      await dataSource(request, made.parent, `parent_${RUN}`);
      await dataSource(request, made.hidden, `hidden_${RUN}`);
      expect(
        (
          await request.post(`/api/data-sources/${tested}/test`, { data: {}, timeout: 90_000 })
        ).status(),
      ).toBe(200);
    });
  });

  test.describe('as writer, a read-write member of the folder', () => {
    test.use({ role: 'writer' });

    test('sees theirs and their ancestors’, each with its folder, driver and health, and none of managers’', async ({
      page,
    }) => {
      await page.goto('/data-sources');
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Data sources');
      await expect(main.getByRole('note').first()).toContainText(
        'Every data source you can see, in every folder',
      );
      await expect(main).not.toContainText(/not part of this phase/i);

      const table = main.getByRole('table', { name: 'Data sources' });
      const row = table.getByRole('row').filter({ hasText: `sales_${RUN}` });
      await expect(row.getByRole('cell').nth(2)).toHaveText('PostgreSQL');
      const path = row.getByRole('link');
      await expect(path).toHaveText(`Sources parent ${RUN} / Sources ${RUN}`);
      await expect(path).toHaveAttribute('href', `/explore?folder=${made.folder}`);
      const health = row.getByTestId('source-health');
      await expect(health).toHaveAttribute('data-state', 'ok');
      await expect(health).toContainText('Passed');
      // Its parent's, view-only, and never managers'.
      await expect(table.getByRole('row').filter({ hasText: `parent_${RUN}` })).toHaveCount(1);
      await expect(table.getByRole('row').filter({ hasText: `hidden_${RUN}` })).toHaveCount(0);
      const untested = table.getByRole('row').filter({ hasText: `parent_${RUN}` });
      await expect(untested.getByTestId('source-health')).toHaveText('Not tested yet');

      // A folder's filter narrows it to that folder's.
      await main
        .getByLabel('Folder')
        .selectOption({ label: `Sources parent ${RUN} / Sources ${RUN}` });
      await expect(table.getByRole('row')).toHaveCount(2);
    });
  });

  test.describe('as reader, read-only on the folder', () => {
    test.use({ role: 'reader' });

    test('sees none, and is pointed to Explore', async ({ page }) => {
      await page.goto('/data-sources');
      const main = page.getByRole('main');
      await expect(main.getByRole('table')).toHaveCount(0);
      await expect(main.getByRole('note').nth(1)).toHaveText(
        'Data sources are available to read-write members of a folder. Your dashboards are in Explore.',
      );
      await expect(main.getByRole('link', { name: 'Open Explore' })).toHaveAttribute(
        'href',
        '/explore',
      );
    });
  });
});
