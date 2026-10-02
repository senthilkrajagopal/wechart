import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T347 (AC-323, AC-281, AC-280, AC-278's model half, AC-222): My workspace's
 * models and data sources are its overlay in compose's xcube. A shared model
 * is copied in with "Edit in my workspace", and changed there; the
 * workspace's previews answer from the copy, the folder's own from what it
 * published. A data source copied in and pointed at another database answers
 * the workspace's previews from there, the folder's from its own. The chart
 * editor of a workspace chart offers the workspace's cube first. Once the
 * workspace holds neither, its previews are the published model's again.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes, publishes a cube and a
 * data source in it, and a cube bound to that data source.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Overlay ${RUN}`;
const CUBE = `t347_${RUN}`;
const DB_CUBE = `t347db_${RUN}`;
const SOURCE = `wh_${RUN}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const fieldsOf = (database: string) => ({
  host: 'sample-db',
  port: 5432,
  database,
  user: 'sample',
  ssl: false,
});
const made = {
  folder: '',
  xcubeId: '',
  source: '',
  shared: '',
  /** The writer's workspace items, and the project folders they went into. */
  board: '',
  chart: '',
  projects: [] as string[],
  modelCopy: { folderId: '', path: '' },
  sourceCopy: '',
};
const full = (name: string) => `${made.xcubeId}__${name}`;

/** Through My workspace and a proposal `super` approves (T451, AC-278). */
async function publish(request: APIRequestContext, path: string, content: string) {
  expect(await landed(request, made.folder, [{ path, content }])).toEqual([{ path, content }]);
}

/** A query of the item, as its tiles ask: the rows Cube answered. */
async function rows(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  id: string,
  query: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const answer = await request.post('/api/load', {
    data: { query, for: { kind, id } },
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { data: Record<string, unknown>[] }).data;
}

test.describe.configure({ mode: 'serial' });

test.describe('My workspace’s overlay (T347, AC-323)', () => {
  test.afterAll(async ({ browser }) => {
    // Two sign-ins, and deletes each checked by xcube.
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer') {
        if (made.modelCopy.path !== '')
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.modelCopy.folderId)}&path=${encodeURIComponent(made.modelCopy.path)}`,
          );
        if (made.sourceCopy !== '') await request.delete(`/api/data-sources/${made.sourceCopy}`);
        for (const [kind, id] of [
          ['dashboard', made.board],
          ['chart', made.chart],
        ] as const)
          if (id !== '') await request.delete(`/api/documents/${kind}/${id}`);
        for (const project of made.projects)
          await request.delete(`/api/documents/folder/${project}`);
      }
      if (who === 'super' && made.folder !== '') {
        for (const path of [`cubes/${CUBE}.yml`, `cubes/${DB_CUBE}.yml`])
          await request.delete(
            `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(path)}`,
            { timeout: 90_000 },
          );
        if (made.source !== '') await request.delete(`/api/data-sources/${made.source}`);
        if (made.shared !== '') await request.delete(`/api/documents/dashboard/${made.shared}`);
        await request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, its cube, its data source and a cube bound to it', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      made.xcubeId = `f${made.folder.replaceAll('-', '')}`;
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      await publish(
        request,
        `cubes/${CUBE}.yml`,
        `cubes:\n  - name: ${CUBE}\n    sql: SELECT 1 AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
      );
      const source = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: made.folder,
          name: SOURCE,
          driver: 'postgres',
          authMethod: 'password',
          fields: fieldsOf('sample'),
          sealed: {
            password: await sealSecretV1(KEY, 'postgres', 'password', fieldsOf('sample'), 'sample'),
          },
        }),
        timeout: 90_000,
      });
      expect(source.status(), await source.text()).toBe(201);
      made.source = ((await source.json()) as { id: string }).id;
      await publish(
        request,
        `cubes/${DB_CUBE}.yml`,
        `cubes:\n  - name: ${DB_CUBE}\n    sql: SELECT current_database()::text AS db, 1 AS n\n    data_source: ${SOURCE}\n    dimensions:\n      - name: db\n        sql: db\n        type: string\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
      );
      const shared = await request.post('/api/documents', {
        data: { kind: 'dashboard', title: `Shared ${RUN}`, folderId: made.folder },
      });
      made.shared = ((await shared.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('copies the shared model into My workspace with Edit in my workspace, and changes it there (AC-278, AC-222)', async ({
      page,
    }) => {
      await page.goto(
        `/explore/folders/${made.folder}/models/${encodeURIComponent(`cubes/${CUBE}.yml`)}`,
      );
      await expect(page.getByText(`Read-only · in ${FOLDER}`)).toBeVisible();
      await page.getByRole('button', { name: 'Edit in my workspace' }).click();

      // Its copy opens in its project folder, changed there and saved there.
      await expect(page).not.toHaveURL(new RegExp(made.folder));
      await expect(page).toHaveURL(/\/explore\/folders\/[0-9a-f-]{36}\/models\/cubes%2F/);
      const project = /\/explore\/folders\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
      expect(project).not.toBe(made.folder);
      made.projects.push(project);
      made.modelCopy = { folderId: project, path: `cubes/${CUBE}.yml` };
      await expect(page.getByText('Read-only')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
      // In My workspace, New cube and New view are offered beside its files (AC-222).
      const tree = page.getByRole('navigation', { name: 'Model files' });
      for (const name of [/New cube/, /New view/])
        await expect(tree.getByRole('button', { name })).toBeVisible();
      // Each asks first for its name and where it is to go (AC-282).
      await tree.getByRole('button', { name: /New view/ }).click();
      const asking = page.getByRole('dialog', { name: 'New view in My workspace' });
      await expect(asking.getByRole('combobox', { name: 'Target folder' })).toBeVisible();
      await asking.getByRole('button', { name: 'Cancel' }).click();
      await expect(asking).toHaveCount(0);

      const saved = await page.request.post('/api/model/publish', {
        data: {
          folderId: project,
          files: [
            {
              path: `cubes/${CUBE}.yml`,
              content: `cubes:\n  - name: ${CUBE}\n    sql: SELECT 7 AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
            },
          ],
        },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      // Explore says where it goes, and what it was copied from (design 04, pin 3).
      await page.goto(`/explore?folder=${project}`);
      await expect(page.getByText(`Goes to ${FOLDER} · copied from version 1`)).toBeVisible();
    });

    test('makes a new model in My workspace only with the folder it is to go to, and saves it there (AC-282)', async ({
      page,
    }) => {
      const project = made.modelCopy.folderId;
      await page.goto(`/explore?folder=${project}`);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Model/ }).click();
      const dialog = page.getByRole('dialog', { name: 'New cube in My workspace' });
      await dialog.getByRole('textbox', { name: 'Name' }).fill(`t347new_${RUN}`);
      const create = dialog.getByRole('button', { name: 'Create' });
      // The folders it may go to: those the writer writes, this one among them (rule 74).
      const target = dialog.getByRole('combobox', { name: 'Target folder' });
      await expect(target.locator(`option[value="${made.folder}"]`)).toHaveText(FOLDER);
      await target.selectOption(made.folder);
      await create.click();

      const path = `cubes/t347new_${RUN}.yml`;
      await expect(page).toHaveURL(
        `/explore/folders/${project}/models/${encodeURIComponent(path)}`,
      );
      await expect(page.getByText('New file · not saved')).toBeVisible();
      const reads = page
        .getByRole('region', { name: 'Form editor' })
        .getByRole('group', { name: 'Reads from' });
      await reads.getByRole('button', { name: 'SQL query' }).click();
      await reads.getByLabel('SQL query', { exact: true }).fill('SELECT 3 AS id');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Saved. Previews in My workspace use it now.')).toBeVisible({
        timeout: 60_000,
      });

      // Stored where it was asked to go, which Explore says (design 04, pin 3).
      const listed = (await (
        await page.request.get(`/api/folders/${project}/contents`)
      ).json()) as { kind: string; id: string; targetFolderId?: string; origin?: unknown }[];
      expect(listed.find((item) => item.kind === 'model' && item.id === path)).toEqual(
        expect.objectContaining({ targetFolderId: made.folder, origin: null }),
      );
      await page.goto(`/explore?folder=${project}`);
      await expect(page.getByText(`Goes to ${FOLDER} · new`)).toBeVisible();
      // Away again, so the workspace holds the copy alone for what follows.
      const removed = await page.request.delete(
        `/api/model/files?folder=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`,
        { timeout: 90_000 },
      );
      expect(removed.status(), await removed.text()).toBe(200);
    });

    test('answers the workspace’s previews from its copy, and the folder’s from what it published (AC-281, AC-323)', async ({
      page,
    }) => {
      const { request } = page;
      const board = await request.post('/api/documents', {
        data: {
          kind: 'dashboard',
          title: `Mine ${RUN}`,
          folderId: made.modelCopy.folderId,
          targetFolderId: made.folder,
        },
      });
      expect(board.status(), await board.text()).toBe(201);
      made.board = ((await board.json()) as { id: string }).id;

      const query = { measures: [`${full(CUBE)}.n`] };
      expect(await rows(request, 'dashboard', made.board, query)).toEqual([
        { [`${full(CUBE)}.n`]: '7' },
      ]);
      expect(await rows(request, 'dashboard', made.shared, query)).toEqual([
        { [`${full(CUBE)}.n`]: '1' },
      ]);
    });

    test('offers the workspace’s cube first in a workspace chart’s picker (AC-329, AC-323)', async ({
      page,
    }) => {
      const chart = await page.request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `Mine ${RUN}`,
          folderId: made.modelCopy.folderId,
          targetFolderId: made.folder,
        },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      await page.goto(`/explore/charts/${made.chart}/edit?new=true`);

      const picker = page.getByRole('combobox', { name: 'Cube or view' });
      // This run's own, by its full name: other specs, running beside this
      // one, add cubes of their own to the same writer's workspace (T543's
      // report), so the group's count isn't this test's to know.
      const mine = picker.locator(`optgroup[label="My workspace"] option[value="${full(CUBE)}"]`);
      await expect(mine).toHaveCount(1);
      await expect(mine).toHaveAttribute('value', full(CUBE));
    });

    test('answers from a data source copied in and pointed at another database, the folder’s from its own (AC-280)', async ({
      page,
    }) => {
      const { request } = page;
      const copied = await request.post(`/api/data-sources/${made.source}/copy`, {
        data: { timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      const { id, folderId } = (await copied.json()) as { id: string; folderId: string };
      made.sourceCopy = id;
      if (folderId !== 'mine') made.projects.push(folderId);
      const tried = await request.post(`/api/data-sources/${id}/test`, {
        data: { fields: fieldsOf('postgres') },
        timeout: 90_000,
      });
      expect(tried.status(), await tried.text()).toBe(200);
      const { ok, testId } = (await tried.json()) as { ok: boolean; testId: string };
      expect(ok).toBe(true);
      const changed = await request.put(`/api/data-sources/${id}`, {
        data: { fields: fieldsOf('postgres'), testId },
      });
      expect(changed.status(), await changed.text()).toBe(200);

      const query = { dimensions: [`${full(DB_CUBE)}.db`] };
      expect(await rows(request, 'dashboard', made.board, query)).toEqual([
        { [`${full(DB_CUBE)}.db`]: 'postgres' },
      ]);
      expect(await rows(request, 'dashboard', made.shared, query)).toEqual([
        { [`${full(DB_CUBE)}.db`]: 'sample' },
      ]);
    });

    test('answers from the published model once the workspace holds neither (AC-323)', async ({
      page,
    }) => {
      const { request } = page;
      const removed = await request.delete(
        `/api/model/files?folder=${encodeURIComponent(made.modelCopy.folderId)}&path=${encodeURIComponent(made.modelCopy.path)}`,
        { timeout: 90_000 },
      );
      expect(removed.status(), await removed.text()).toBe(200);
      made.modelCopy = { folderId: '', path: '' };
      expect((await request.delete(`/api/data-sources/${made.sourceCopy}`)).status()).toBe(204);
      made.sourceCopy = '';

      expect(
        await rows(request, 'dashboard', made.board, { measures: [`${full(CUBE)}.n`] }),
      ).toEqual([{ [`${full(CUBE)}.n`]: '1' }]);
      expect(
        await rows(request, 'dashboard', made.board, { dimensions: [`${full(DB_CUBE)}.db`] }),
      ).toEqual([{ [`${full(DB_CUBE)}.db`]: 'sample' }]);
    });
  });
});
