import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

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
const made = {
  parent: '',
  folder: '',
  hidden: '',
  sources: [] as string[],
  cubes: [] as { folderId: string; name: string }[],
};

/** A cube naming its data source by its short name, published into a folder (T459). */
async function cube(
  request: APIRequestContext,
  folderId: string,
  name: string,
  source: string,
  title?: string,
) {
  const content = [
    'cubes:',
    `  - name: ${name}`,
    ...(title === undefined ? [] : [`    title: ${title}`]),
    '    sql: SELECT 1 AS n',
    `    data_source: ${source}`,
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');
  const answer = await request.post('/api/model/publish', {
    data: { folderId, files: [{ path: `cubes/${name}.yml`, content }] },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  if (!made.cubes.some((each) => each.folderId === folderId && each.name === name))
    made.cubes.push({ folderId, name });
}

async function folder(request: APIRequestContext, title: string, parent: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(answer.status()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

async function dataSource(request: APIRequestContext, folderId: string, name: string) {
  const answer = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
    }),
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
    // The cubes first: xcube keeps a data source a published cube is bound to.
    for (const { folderId, name } of made.cubes)
      await context.request.delete(
        `/api/model/files?folder=${folderId}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
      );
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
      // Made from its passing test, which is its health from the start (T363, AC-163).
      const parent = table.getByRole('row').filter({ hasText: `parent_${RUN}` });
      await expect(parent.getByTestId('source-health')).toHaveAttribute('data-state', 'ok');
      await expect(parent.getByTestId('source-health')).toHaveText(/^Passed · /);

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

  /**
   * T459 (AC-157): beside each data source, the cubes xcube bound to it at
   * publish. A cube in the sales folder naming `parent_…` binds its parent's;
   * a nearer `parent_…` added after rebinds nothing (AC-273), so the cube
   * stays beside the first. A root data source's cube in managers' folder is
   * no business of `writer`'s.
   */
  test.describe('the cubes bound to each', () => {
    test.describe('as super, who publishes them', () => {
      test.use({ role: 'super' });

      test('publishes a cube on the parent’s, then adds a nearer one of that name, and a cube only managers reach', async ({
        page,
      }) => {
        const request = page.request;
        await cube(request, made.folder, `uses_${RUN}`, `parent_${RUN}`);
        await dataSource(request, made.folder, `parent_${RUN}`);
        await dataSource(request, 'root', `root_${RUN}`);
        await cube(request, made.hidden, `secret_${RUN}`, `root_${RUN}`);

        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        // Super sees every folder, managers' cube included.
        await expect(
          table
            .getByRole('row')
            .filter({ hasText: `root_${RUN}` })
            .getByTestId('source-used-by'),
        ).toHaveText(`secret_${RUN} · Sources hidden ${RUN}`);
      });
    });

    test.describe('as writer', () => {
      test.use({ role: 'writer' });

      test('sees each cube beside the source it was bound to, never rebound, and none it can’t reach', async ({
        page,
      }) => {
        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        const rowOf = (name: string, folder: string) =>
          table
            .getByRole('row')
            .filter({ hasText: name })
            .filter({ has: page.getByRole('link', { name: folder, exact: true }) });

        await expect(
          rowOf(`parent_${RUN}`, `Sources parent ${RUN}`).getByTestId('source-used-by'),
        ).toHaveText(`uses_${RUN} · Sources parent ${RUN} / Sources ${RUN}`);
        await expect(
          rowOf(`parent_${RUN}`, `Sources parent ${RUN} / Sources ${RUN}`).getByTestId(
            'source-used-by',
          ),
        ).toHaveText('No cube');
        // Managers' cube counted, never named (as AC-322 counts what can't be seen).
        await expect(rowOf(`root_${RUN}`, 'Shared').getByTestId('source-used-by')).toHaveText(
          '1 cube in a folder you can’t see',
        );
        await expect(page.getByRole('main')).not.toContainText(`secret_${RUN}`);
      });
    });

    test.describe('as super, again', () => {
      test.use({ role: 'super' });

      test('publishes the cube again, which binds it to the nearer one', async ({ page }) => {
        await cube(page.request, made.folder, `uses_${RUN}`, `parent_${RUN}`, 'Uses, again');
      });
    });

    test.describe('as writer, again', () => {
      test.use({ role: 'writer' });

      test('sees it beside the nearer one once it’s published again, and the first with none', async ({
        page,
      }) => {
        await page.goto('/data-sources');
        const table = page.getByRole('main').getByRole('table', { name: 'Data sources' });
        const usedBy = (folder: string) =>
          table
            .getByRole('row')
            .filter({ hasText: `parent_${RUN}` })
            .filter({ has: page.getByRole('link', { name: folder, exact: true }) })
            .getByTestId('source-used-by');

        await expect(usedBy(`Sources parent ${RUN} / Sources ${RUN}`)).toHaveText(
          `uses_${RUN} · Sources parent ${RUN} / Sources ${RUN}`,
        );
        await expect(usedBy(`Sources parent ${RUN}`)).toHaveText('No cube');
      });
    });
  });
});
