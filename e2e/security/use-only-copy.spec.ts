import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T543 (AC-283; the user's answer "Yes, use-only copy", R53), as T717 has it
 * (R73), against compose's xcube on the R71 image: `writer` (`sales-rw`)
 * writes /Parent/Child and so reads every kind of item in /Parent, which
 * `managers` write. They copy /Parent's model into My workspace to use,
 * asked for no folder. Its previews use it, Explore says it is for use only
 * and proposed to no folder, and offers no Propose…; the API refuses its
 * proposal. Its page offers "Request a change", a calculation request for
 * its cube with no chart; and a chart on it still offers "Request a
 * calculation…" (AC-050).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const PARENT = `Parent ${RUN}`;
const CHILD = `Child ${RUN}`;
const CUBE = `t543_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const cubeOf = (n: number) =>
  `cubes:\n  - name: ${CUBE}\n    sql: SELECT ${String(n)} AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const made = { parent: '', child: '', project: '', board: '', chart: '' };

/**
 * AC-283's first sentence (T737's coordinator, item 2): every kind of item
 * in a folder the user may see is usable from their workspace, and none in
 * one they may not. "Used" is read as T543 reads it: resolved and previewed
 * there. A dashboard is used by being opened, its tiles answering; copying
 * one from a folder its copier only reads stays refused
 * (`workspace-copy.test.ts`, "copies nothing from a folder its copier only
 * reads"). Beside the model above, `super` gives /Parent a data source, a
 * library chart on the cube and a dashboard showing it. /Hidden, which only
 * `managers` see, gets the same four kinds.
 */
const HIDDEN = `Hidden ${RUN}`;
const HIDDEN_CUBE = `t543_hid_${RUN}`;
const HIDDEN_PATH = `cubes/${HIDDEN_CUBE}.yml`;
const SOURCE = `t543_src_${RUN}`;
const HIDDEN_SOURCE = `t543_hid_src_${RUN}`;
const DRAFT = `t543_ds_${RUN}`;
const HIDDEN_DRAFT = `t543_ds_hid_${RUN}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const kinds = {
  hidden: '',
  source: '',
  hiddenSource: '',
  chart: '',
  hiddenChart: '',
  board: '',
  hiddenBoard: '',
  /** Writer's: a workspace dashboard going to /Parent/Child, and a project folder for drafts. */
  workspaceBoard: '',
  workspaceProject: '',
};
/** A table of a cube's `n`. */
const tableOf = (cube: string) => ({
  source: { cube },
  wells: { measures: [`${cube}.n`], dimensions: [], timeDimensions: [] },
  chartType: 'table',
});

/** A load's first row's value of `member`, as a number. */
const firstOf = async (answer: APIResponse, member: string) =>
  Number(((await answer.json()) as { data: Record<string, unknown>[] }).data[0]?.[member]);

async function createdId(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

async function dataSourceIn(request: APIRequestContext, folderId: string, name: string) {
  const answer = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
    }),
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

/** A library chart on `cube`, given its definition by an approved copy (T502, AC-278). */
async function libraryChart(
  request: APIRequestContext,
  folderId: string,
  title: string,
  cube: string,
) {
  const id = await createdId(request, { kind: 'chart', title, folderId });
  await changeShared(request, 'chart', id, (body) => ({ ...body, chart: tableOf(cube) }));
  return id;
}

/** A dashboard showing `chartId` on its one tile, given it by an approved copy. */
async function dashboardShowing(
  request: APIRequestContext,
  folderId: string,
  title: string,
  chartId: string,
) {
  const id = await createdId(request, { kind: 'dashboard', title, folderId });
  await changeShared(request, 'dashboard', id, (body) => ({
    ...body,
    pages: [{ id: 'p', title: 'P', items: [{ id: 'tile', kind: 'chart', chartId, w: 6, h: 30 }] }],
  }));
  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('a model of a folder one may only read, used in My workspace (T543, AC-283)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer') {
        if (kinds.workspaceBoard !== '')
          await request.delete(`/api/documents/dashboard/${kinds.workspaceBoard}`);
        if (kinds.workspaceProject !== '') {
          for (const draft of [DRAFT, HIDDEN_DRAFT])
            await request.delete(
              `/api/model/files?folder=${encodeURIComponent(kinds.workspaceProject)}&path=${encodeURIComponent(`cubes/${draft}.yml`)}`,
              { timeout: 90_000 },
            );
          await request.delete(`/api/documents/folder/${kinds.workspaceProject}`);
        }
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        if (made.board !== '') await request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.project !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.project}`);
        }
      }
      if (who === 'super') {
        for (const [kind, id] of [
          ['dashboard', kinds.board],
          ['dashboard', kinds.hiddenBoard],
          ['chart', kinds.chart],
          ['chart', kinds.hiddenChart],
        ] as const)
          if (id !== '') await request.delete(`/api/documents/${kind}/${id}`);
        for (const id of [kinds.source, kinds.hiddenSource])
          if (id !== '') await request.delete(`/api/data-sources/${id}`, { timeout: 90_000 });
        if (kinds.hidden !== '') {
          await request.delete(
            `/api/model/files?folder=${kinds.hidden}&path=${encodeURIComponent(HIDDEN_PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${kinds.hidden}`);
        }
        if (made.child !== '') await request.delete(`/api/documents/folder/${made.child}`);
        if (made.parent !== '') {
          await request.delete(
            `/api/model/files?folder=${made.parent}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.parent}`);
        }
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folders and publishes the model in /Parent', async ({ page }) => {
      const { request } = page;
      const parent = await request.post('/api/documents', {
        data: { kind: 'folder', title: PARENT, folderId: 'root' },
      });
      made.parent = ((await parent.json()) as { id: string }).id;
      const child = await request.post('/api/documents', {
        data: { kind: 'folder', title: CHILD, folderId: made.parent },
      });
      made.child = ((await child.json()) as { id: string }).id;
      for (const [id, access] of [
        [made.parent, { readOnly: [], readWrite: ['managers'] }],
        [made.child, { readOnly: [], readWrite: ['sales-rw'] }],
      ] as const) {
        const answer = await request.put(`/api/folders/${id}/access`, { data: access });
        expect(answer.status(), await answer.text()).toBe(200);
      }
      // Through My workspace and a proposal `super` approves (T451, AC-278).
      const file = { path: PATH, content: cubeOf(3) };
      expect(await landed(request, made.parent, [file])).toEqual([file]);
    });

    test('gives /Parent a data source, a library chart and a dashboard, and /Hidden the four kinds', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const { request } = page;
      kinds.hidden = await createdId(request, { kind: 'folder', title: HIDDEN, folderId: 'root' });
      const access = await request.put(`/api/folders/${kinds.hidden}/access`, {
        data: { readOnly: [], readWrite: ['managers'] },
      });
      expect(access.status(), await access.text()).toBe(200);
      const hiddenFile = {
        path: HIDDEN_PATH,
        content: `cubes:\n  - name: ${HIDDEN_CUBE}\n    sql: SELECT 4 AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
      };
      expect(await landed(request, kinds.hidden, [hiddenFile])).toEqual([hiddenFile]);
      kinds.source = await dataSourceIn(request, made.parent, SOURCE);
      kinds.hiddenSource = await dataSourceIn(request, kinds.hidden, HIDDEN_SOURCE);
      kinds.chart = await libraryChart(request, made.parent, `Parent chart ${RUN}`, CUBE);
      kinds.hiddenChart = await libraryChart(
        request,
        kinds.hidden,
        `Hidden chart ${RUN}`,
        HIDDEN_CUBE,
      );
      kinds.board = await dashboardShowing(
        request,
        made.parent,
        `Parent board ${RUN}`,
        kinds.chart,
      );
      kinds.hiddenBoard = await dashboardShowing(
        request,
        kinds.hidden,
        `Hidden board ${RUN}`,
        kinds.hiddenChart,
      );
    });
  });

  test.describe('as writer, before any copy', () => {
    test.use({ role: 'writer' });

    test('uses each kind of /Parent’s items from My workspace, and none of /Hidden’s (AC-283)', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const { request } = page;
      kinds.workspaceBoard = await createdId(request, {
        kind: 'dashboard',
        title: `Workspace board ${RUN}`,
        folderId: 'mine',
        targetFolderId: made.child,
      });
      const preview = (member: string) =>
        request.post('/api/load', {
          data: {
            query: { measures: [member] },
            for: { kind: 'dashboard', id: kinds.workspaceBoard },
          },
          timeout: 90_000,
        });

      // Models: /Parent's cube answers a workspace preview; /Hidden's is refused,
      // and its model can't be copied in to use.
      const parentCube = await preview(`${CUBE}.n`);
      expect(parentCube.status(), await parentCube.text()).toBe(200);
      expect(await firstOf(parentCube, `${CUBE}.n`)).toBe(3);
      const hiddenCube = await preview(`${HIDDEN_CUBE}.n`);
      expect(hiddenCube.status(), await hiddenCube.text()).toBe(403);
      const hiddenCopy = await request.post('/api/workspace/copies', {
        data: { kind: 'model', folderId: kinds.hidden, path: HIDDEN_PATH, timeZone: 'UTC' },
      });
      expect(hiddenCopy.status(), await hiddenCopy.text()).toBe(404);

      // Data sources: a draft going to /Parent/Child binds /Parent's, and
      // previews from it; one naming /Hidden's is refused, and nothing stored.
      kinds.workspaceProject = await createdId(request, {
        kind: 'folder',
        title: `Use ${RUN}`,
        folderId: 'mine',
      });
      const draftOf = (name: string, source: string, n: number) => ({
        path: `cubes/${name}.yml`,
        content: `cubes:\n  - name: ${name}\n    sql: SELECT ${String(n)} AS n\n    data_source: ${source}\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
      });
      const saveDraft = (name: string, source: string, n: number) =>
        request.post('/api/model/publish', {
          data: {
            folderId: kinds.workspaceProject,
            targetFolderId: made.child,
            files: [draftOf(name, source, n)],
          },
          timeout: 90_000,
        });
      const bound = await saveDraft(DRAFT, SOURCE, 5);
      expect(bound.status(), await bound.text()).toBe(200);
      const fromSource = await preview(`${DRAFT}.n`);
      expect(fromSource.status(), await fromSource.text()).toBe(200);
      expect(await firstOf(fromSource, `${DRAFT}.n`)).toBe(5);
      const unbound = await saveDraft(HIDDEN_DRAFT, HIDDEN_SOURCE, 6);
      expect(unbound.status(), await unbound.text()).toBe(422);
      // Said of the data source it names, and nothing of where that is (AC-424).
      expect(await unbound.text()).toContain(HIDDEN_SOURCE);
      expect(await unbound.text()).not.toContain(HIDDEN);
      expect(await unbound.text()).not.toContain(kinds.hidden);
      const stored = (await (
        await request.get(`/api/model/files?folder=${kinds.workspaceProject}`)
      ).json()) as { files: { path: string }[] };
      expect(stored.files.map((each) => each.path)).toEqual([`cubes/${DRAFT}.yml`]);

      // Charts: /Parent's library chart, shown on the workspace dashboard,
      // answers there; /Hidden's can't be opened.
      const board = (await (
        await request.get(`/api/documents/dashboard/${kinds.workspaceBoard}`)
      ).json()) as { body: Record<string, unknown>; version: number };
      const shown = await request.put(`/api/documents/dashboard/${kinds.workspaceBoard}`, {
        data: {
          version: board.version,
          body: {
            ...board.body,
            pages: [
              {
                id: 'p',
                title: 'P',
                items: [{ id: 'tile', kind: 'chart', chartId: kinds.chart, w: 6, h: 30 }],
              },
            ],
          },
        },
      });
      expect(shown.status(), await shown.text()).toBe(200);
      await page.goto(`/explore/dashboards/${kinds.workspaceBoard}`);
      await expect(page.locator('[data-tile="tile"]').getByRole('table')).toContainText('3', {
        timeout: 60_000,
      });
      expect((await request.get(`/api/documents/chart/${kinds.hiddenChart}`)).status()).toBe(404);

      // Dashboards: /Parent's opens, its tile answering; /Hidden's is a 404.
      await page.goto(`/explore/dashboards/${kinds.board}`);
      await expect(page.locator('[data-tile="tile"]').getByRole('table')).toContainText('3', {
        timeout: 60_000,
      });
      expect((await request.get(`/api/documents/dashboard/${kinds.hiddenBoard}`)).status()).toBe(
        404,
      );
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('uses /Parent’s model in My workspace, asked for no folder, proposed to none', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.parent}/models/${encodeURIComponent(PATH)}`);
      await expect(page.getByText(`Read-only · in ${PARENT}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Use in my workspace' }).click();
      const dialog = page.getByRole('dialog', { name: `Use ${CUBE}.yml in My workspace` });
      await expect(dialog.getByTestId('use-note')).toHaveText(
        `You may only read ${PARENT}, so this copy is for use in My workspace only: it can’t be proposed to any folder. To change the shared cube, send ${PARENT} a request from the copy’s page.`,
      );
      await expect(dialog.getByRole('combobox')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Copy to My workspace' }).click();

      // The copy opens in its project folder in My workspace.
      await expect(page).not.toHaveURL(new RegExp(made.parent));
      await expect(page).toHaveURL(/\/explore\/folders\/[0-9a-f-]{36}\/models\/cubes%2F/);
      made.project = /\/explore\/folders\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

      // Explore says it goes nowhere, and offers no Propose… for it.
      await page.goto(`/explore?folder=${made.project}`);
      await expect(
        page.getByText('A copy for use only of version 1 · proposed to no folder'),
      ).toBeVisible();
      await page.getByRole('button', { name: `Actions for ${CUBE}.yml` }).click();
      const menu = page.getByRole('menu', { name: `Actions for ${CUBE}.yml` });
      await expect(menu.getByRole('menuitem', { name: 'Open' })).toBeVisible();
      // None, named for a target or not (T694).
      await expect(menu.getByRole('menuitem', { name: /^Propose/ })).toHaveCount(0);
    });

    test('previews with it, and its proposal is refused, saying why', async ({ page }) => {
      const { request } = page;
      // A changed copy, previewed in a workspace dashboard going to /Parent/Child.
      const saved = await request.post('/api/model/publish', {
        data: { folderId: made.project, files: [{ path: PATH, content: cubeOf(8) }] },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      const board = await request.post('/api/documents', {
        data: {
          kind: 'dashboard',
          title: `Board ${RUN}`,
          folderId: made.project,
          targetFolderId: made.child,
        },
      });
      made.board = ((await board.json()) as { id: string }).id;
      // Its one name, its original's (R71): the copy stands in for it.
      const member = `${CUBE}.n`;
      const answer = await request.post('/api/load', {
        data: { query: { measures: [member] }, for: { kind: 'dashboard', id: made.board } },
        timeout: 90_000,
      });
      expect(answer.status(), await answer.text()).toBe(200);
      const [row] = ((await answer.json()) as { data: Record<string, unknown>[] }).data;
      expect(Number(row?.[member])).toBe(8);

      const files = await request.get(`/api/folders/${made.project}/contents`);
      const [file] = ((await files.json()) as { kind: string; fileId?: string }[]).filter(
        (each) => each.kind === 'model',
      );
      const proposed = await request.post('/api/proposals', {
        data: { kind: 'model', id: file!.fileId },
      });
      expect(proposed.status(), await proposed.text()).toBe(409);
      expect(((await proposed.json()) as { error: string }).error).toBe(
        `“${PATH}” is a copy for use only, so it can’t be proposed to any folder. To change “${CUBE}”, send its folder a request from the copy’s page.`,
      );
    });

    test('asks /Parent for a change from the copy’s page, with no chart (R73)', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.project}/models/${encodeURIComponent(PATH)}`);
      await page.getByRole('button', { name: 'Request a change' }).click();
      const dialog = page.getByRole('dialog', { name: 'Request a change' });
      await expect(dialog.getByTestId('request-note')).toHaveText(
        `Describe the change you need to ${CUBE}. It goes to the people who may change the model that defines it.`,
      );
      await dialog
        .getByRole('textbox', { name: 'What should change?' })
        .fill(`A margin measure ${RUN}`);
      const sent = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/calc-requests') && response.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Send request' }).click();
      expect((await sent).status()).toBe(201);
      await expect(dialog.getByRole('status')).toHaveText(
        'Sent. It’s listed for them under Reviews › Calculation requests.',
      );
    });

    test('still offers "Request a calculation…" from a chart on it (AC-050)', async ({ page }) => {
      const { request } = page;
      const created = await request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `On the copy ${RUN}`,
          folderId: made.project,
          targetFolderId: made.child,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      made.chart = ((await created.json()) as { id: string }).id;
      const stored = (await (await request.get(`/api/documents/chart/${made.chart}`)).json()) as {
        body: Record<string, unknown>;
        version: number;
      };
      const saved = await request.put(`/api/documents/chart/${made.chart}`, {
        data: {
          version: stored.version,
          body: {
            ...stored.body,
            chart: {
              source: { cube: CUBE },
              wells: { measures: [`${CUBE}.n`], dimensions: [], timeDimensions: [] },
            },
          },
        },
      });
      expect(saved.status(), await saved.text()).toBe(200);

      await page.goto(`/explore/charts/${made.chart}/edit`);
      const pill = page.getByTestId(`in-measures-${CUBE}.n`);
      await expect(pill).toBeVisible();
      await pill.getByRole('button', { name: /^Calculations on / }).click();
      await expect(page.getByRole('menuitem', { name: 'Request a calculation…' })).toBeVisible();
    });
  });
});
