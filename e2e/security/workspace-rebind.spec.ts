import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T542 (AC-281; the user's answer "Rebind in the workspace", R53), as T731
 * reworks it to one name per item (R71; T716), against compose's xcube on the
 * R71 image: a workspace dashboard's tile saved against a folder's cube holds
 * its one name. Once the workspace holds its own copy of that cube, changed,
 * the tile's preview answers from the copy — the workspace's overlay first —
 * under the name the tile holds, which nothing rebinds. The folder's own
 * dashboard still answers from the folder's cube.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes, and publishes the cube
 * in it.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FIRST = `Rebind ${RUN}`;
const CUBE = `t542_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const MEMBER = `${CUBE}.n`;
const cubeOf = (n: number) =>
  `cubes:\n  - name: ${CUBE}\n    sql: SELECT ${String(n)} AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const made = { first: '', project: '', copyFolder: '', board: '', chart: '', shared: '' };

async function answered(request: APIRequestContext, kind: 'dashboard', id: string) {
  const answer = await request.post('/api/load', {
    data: { query: { measures: [MEMBER] }, for: { kind, id } },
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBe(200);
  const [row] = ((await answer.json()) as { data: Record<string, unknown>[] }).data;
  return Number(row?.[MEMBER]);
}

test.describe.configure({ mode: 'serial' });

test.describe('a workspace tile’s one name, answered from the workspace’s copy first (T542, AC-281)', () => {
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
        if (made.board !== '') await request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        if (made.copyFolder !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.copyFolder)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          if (made.copyFolder !== 'mine')
            await request.delete(`/api/documents/folder/${made.copyFolder}`);
        }
        if (made.project !== '') await request.delete(`/api/documents/folder/${made.project}`);
      }
      if (who === 'super') {
        if (made.shared !== '') await request.delete(`/api/documents/dashboard/${made.shared}`);
        if (made.first !== '') {
          await request.delete(
            `/api/model/files?folder=${made.first}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.first}`);
        }
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder and publishes the cube in it', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FIRST, folderId: 'root' },
      });
      made.first = ((await folder.json()) as { id: string }).id;
      const access = await request.put(`/api/folders/${made.first}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status()).toBe(200);
      // Through My workspace and a proposal `super` approves (T451, AC-278).
      const file = { path: PATH, content: cubeOf(1) };
      expect(await landed(request, made.first, [file])).toEqual([file]);
      const shared = await request.post('/api/documents', {
        data: { kind: 'dashboard', title: `Shared ${RUN}`, folderId: made.first },
      });
      made.shared = ((await shared.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('a tile saved against the folder’s cube answers from it, then from the workspace’s copy, its name as it was', async ({
      page,
    }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: `project-${RUN}`, folderId: 'mine' },
      });
      expect(folder.status(), await folder.text()).toBe(201);
      made.project = ((await folder.json()) as { id: string }).id;
      const create = async (kind: 'chart' | 'dashboard', title: string) => {
        const answer = await request.post('/api/documents', {
          data: { kind, title, folderId: made.project, targetFolderId: made.first },
        });
        expect(answer.status(), await answer.text()).toBe(201);
        return ((await answer.json()) as { id: string }).id;
      };
      const change = async (
        kind: 'chart' | 'dashboard',
        id: string,
        with_: (body: Record<string, unknown>) => Record<string, unknown>,
      ) => {
        const stored = (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as {
          body: Record<string, unknown>;
          version: number;
        };
        const answer = await request.put(`/api/documents/${kind}/${id}`, {
          data: { body: with_(stored.body), version: stored.version },
        });
        expect(answer.status(), await answer.text()).toBe(200);
      };
      made.chart = await create('chart', `Tile ${RUN}`);
      await change('chart', made.chart, (body) => ({
        ...body,
        chart: {
          source: { cube: CUBE },
          wells: { measures: [MEMBER], dimensions: [], timeDimensions: [] },
        },
      }));
      made.board = await create('dashboard', `Board ${RUN}`);
      await change('dashboard', made.board, (body) => ({
        ...body,
        pages: [
          { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: made.chart }] },
        ],
      }));
      expect(await answered(request, 'dashboard', made.board)).toBe(1);

      // The workspace's own copy of the cube, changed: the overlay answers first.
      const copied = await request.post('/api/workspace/copies', {
        data: { kind: 'model', folderId: made.first, path: PATH, timeZone: 'UTC' },
        timeout: 90_000,
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      const copy = (await copied.json()) as { folderId: string; path: string };
      made.copyFolder = copy.folderId;
      const saved = await request.post('/api/model/publish', {
        data: { folderId: copy.folderId, files: [{ path: copy.path, content: cubeOf(5) }] },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      expect(await answered(request, 'dashboard', made.board)).toBe(5);
      // Its tile holds the name it was saved with: nothing rebound it.
      const tile = (await (await request.get(`/api/documents/chart/${made.chart}`)).json()) as {
        body: { chart: { source: { cube: string } } };
      };
      expect(tile.body.chart.source.cube).toBe(CUBE);
      // The folder's own dashboard answers from the folder's cube still.
      expect(await answered(request, 'dashboard', made.shared)).toBe(1);
    });
  });
});
