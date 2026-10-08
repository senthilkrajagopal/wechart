import type { APIRequestContext } from '@playwright/test';

import { landed, modelFilesIn } from '../model-files';
import {
  BASE_URL,
  expect,
  projectFolderOf,
  removeProjectFolder,
  signInThroughDex,
  test,
} from './fixtures';
import { changeShared } from './shared-change';

/**
 * T763 (AC-279, AC-368; design 04, state D): "Edit in my workspace" on a
 * shared dashboard offers the models its charts use, unticked, beside its
 * data sources. AC-279: THE SYSTEM SHALL copy it with its local charts and
 * the library charts it uses, and no models or data sources unless the user
 * also chooses them. `Fails when: the copy lacks a chart it shows, or brings
 * a model or data source the user didn't choose.` A model ticked goes into
 * the dashboard copy's project folder (AC-368).
 *
 * `super` makes a folder `writer` (`sales-rw`) writes, lands a cube there,
 * and two dashboards each showing a library chart on it. `writer` copies the
 * first with nothing ticked, and the second with its model ticked.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Models along ${RUN}`;
const CUBE = `t763_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const CONTENT = `cubes:\n  - name: ${CUBE}\n    sql: SELECT 1 AS n\n    dimensions:\n      - name: n\n        sql: n\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`;
const made = {
  folder: '',
  chart: '',
  boards: [] as string[],
  copies: [] as string[],
  projects: [] as string[],
};

/** A shared document, made as `super` makes one, given its content by an approval (T502). */
async function shared(request: APIRequestContext, kind: 'chart' | 'dashboard', title: string) {
  const answer = await request.post('/api/documents', {
    data: { kind, title, folderId: made.folder },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

test.describe.configure({ mode: 'serial' });

test.describe('a dashboard’s models in Edit in my workspace (T763, AC-279)', () => {
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
        for (const project of made.projects)
          for (const file of await modelFilesIn(request, project))
            await request.delete(
              `/api/model/files?folder=${project}&path=${encodeURIComponent(file.path)}`,
              { timeout: 90_000 },
            );
        for (const copy of made.copies) await request.delete(`/api/documents/dashboard/${copy}`);
        for (const project of made.projects) {
          const contents = (await (
            await request.get(`/api/folders/${project}/contents`)
          ).json()) as { kind: string; id: string }[];
          for (const item of contents)
            if (item.kind === 'chart') await request.delete(`/api/documents/chart/${item.id}`);
          await removeProjectFolder(request, project);
        }
      }
      if (who === 'super' && made.folder !== '') {
        for (const board of made.boards) await request.delete(`/api/documents/dashboard/${board}`);
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        await request.delete(
          `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(PATH)}`,
          {
            timeout: 90_000,
          },
        );
        await request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, its cube, a chart on it, and two dashboards showing the chart', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const access = await request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status()).toBe(200);
      expect(await landed(request, made.folder, [{ path: PATH, content: CONTENT }])).toEqual([
        { path: PATH, content: CONTENT },
      ]);
      made.chart = await shared(request, 'chart', `Count ${RUN}`);
      await changeShared(request, 'chart', made.chart, (body) => ({
        ...body,
        chart: {
          source: { cube: CUBE },
          wells: { measures: [`${CUBE}.count`], dimensions: [], timeDimensions: [] },
        },
      }));
      for (const title of [`Plain ${RUN}`, `With model ${RUN}`]) {
        const board = await shared(request, 'dashboard', title);
        made.boards.push(board);
        await changeShared(request, 'dashboard', board, (body) => ({
          ...body,
          pages: [
            {
              id: 'p1',
              title: 'Page 1',
              items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: made.chart }],
            },
          ],
        }));
      }
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    /** Edit in my workspace on a dashboard, its model ticked or not; the copy's project folder. */
    const copied = async (
      page: import('@playwright/test').Page,
      board: string,
      tickModel: boolean,
    ) => {
      await page.goto(`/explore/dashboards/${board}`);
      await page
        .locator('.dashboard__header')
        .getByRole('button', { name: 'Edit in my workspace' })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Edit in my workspace' });
      await expect(dialog.getByTestId('always-copied')).toHaveText(
        'Always copied: the dashboard and the 1 library chart it shows.',
      );
      // Its model, offered unticked with its folder (state D).
      const model = dialog.getByRole('checkbox', { name: new RegExp(`${CUBE}\\.yml`) });
      await expect(model).not.toBeChecked();
      await expect(dialog.locator('label', { hasText: `${CUBE}.yml` })).toContainText(
        `Model · ${FOLDER}`,
      );
      if (tickModel) await model.check();
      await dialog.getByRole('button', { name: 'Copy and edit' }).click();
      await page.waitForURL(
        (url) =>
          /\/explore\/dashboards\/[0-9a-f-]{36}/.test(url.pathname) &&
          !url.pathname.endsWith(board),
      );
      const copy = /\/explore\/dashboards\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
      expect(copy).toMatch(/^[0-9a-f-]{36}$/);
      made.copies.push(copy);
      const project = await projectFolderOf(page.request, 'dashboard', copy);
      made.projects.push(project);
      return project;
    };
    const contentsOf = async (request: APIRequestContext, project: string) =>
      (
        (await (await request.get(`/api/folders/${project}/contents`)).json()) as {
          kind: string;
        }[]
      )
        .map((item) => item.kind)
        .sort();

    test('copies the dashboard and the chart it shows, and no model it didn’t choose', async ({
      page,
    }) => {
      const project = await copied(page, made.boards[0]!, false);
      // Every chart it shows, and nothing it didn't choose: no model, no data source.
      expect(await contentsOf(page.request, project)).toEqual(['chart', 'dashboard']);
      expect(await modelFilesIn(page.request, project)).toEqual([]);
    });

    test('with its model ticked, copies the model into the same project folder', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const project = await copied(page, made.boards[1]!, true);
      await expect
        .poll(async () => (await modelFilesIn(page.request, project)).map((file) => file.path), {
          timeout: 60_000,
        })
        .toEqual([PATH]);
      // Its chart is the writer's copy already made with the first dashboard,
      // never a second (T344's review), so this folder holds the dashboard and
      // the model.
      expect(await contentsOf(page.request, project)).toEqual(['dashboard', 'model']);
      const copy = (await (
        await page.request.get(`/api/documents/dashboard/${made.copies.at(-1)!}`)
      ).json()) as { body: { pages: { items: { chartId?: string }[] }[] } };
      const shown = copy.body.pages[0]!.items[0]!.chartId!;
      expect(shown).not.toBe(made.chart);
      const chart = (await (await page.request.get(`/api/documents/chart/${shown}`)).json()) as {
        body: { origin?: { id: string } };
      };
      expect(chart.body.origin?.id).toBe(made.chart);
    });
  });
});
