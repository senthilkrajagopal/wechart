import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T542 (AC-281; the user's answer "Rebind in the workspace", R53), against
 * compose's xcube: a workspace dashboard's tile saved against a folder's
 * cube keeps that name. Once the workspace makes its own cube of that name,
 * to go to another folder, off the first one's path, the tile's preview
 * answers from the workspace's cube, under the name the tile holds. The
 * folder's own dashboard still answers from the folder's.
 *
 * `super` makes two folders `writer` (`sales-rw`) writes, and publishes the
 * cube in the first.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FIRST = `Rebind ${RUN}`;
const SECOND = `Rebind elsewhere ${RUN}`;
const CUBE = `t542_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const cubeOf = (n: number) =>
  `cubes:\n  - name: ${CUBE}\n    sql: SELECT ${String(n)} AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const made = { first: '', second: '', xcubeId: '', project: '', board: '', chart: '', shared: '' };
const member = () => `${made.xcubeId}__${CUBE}.n`;

async function answered(request: APIRequestContext, kind: 'dashboard', id: string) {
  const answer = await request.post('/api/load', {
    data: { query: { measures: [member()] }, for: { kind, id } },
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBe(200);
  const [row] = ((await answer.json()) as { data: Record<string, unknown>[] }).data;
  return Number(row?.[member()]);
}

test.describe.configure({ mode: 'serial' });

test.describe('a workspace tile’s stored name, rebound to the workspace’s own cube (T542, AC-281)', () => {
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
        if (made.project !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.project}`);
        }
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
        if (made.second !== '') await request.delete(`/api/documents/folder/${made.second}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folders and publishes the cube in the first', async ({ page }) => {
      const { request } = page;
      for (const [key, title] of [
        ['first', FIRST],
        ['second', SECOND],
      ] as const) {
        const folder = await request.post('/api/documents', {
          data: { kind: 'folder', title, folderId: 'root' },
        });
        made[key] = ((await folder.json()) as { id: string }).id;
        const access = await request.put(`/api/folders/${made[key]}/access`, {
          data: { readOnly: [], readWrite: ['sales-rw'] },
        });
        expect(access.status()).toBe(200);
      }
      made.xcubeId = `f${made.first.replaceAll('-', '')}`;
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

    test('a tile saved against the folder’s cube answers from it, then from the workspace’s own once made', async ({
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
          source: { cube: `${made.xcubeId}__${CUBE}` },
          wells: { measures: [member()], dimensions: [], timeDimensions: [] },
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

      // The workspace's own cube of the name, to go to the second folder.
      const saved = await request.post('/api/model/publish', {
        data: {
          folderId: made.project,
          files: [{ path: PATH, content: cubeOf(5) }],
          targetFolderId: made.second,
        },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      expect(await answered(request, 'dashboard', made.board)).toBe(5);
      // The folder's own dashboard answers from the folder's cube still.
      expect(await answered(request, 'dashboard', made.shared)).toBe(1);
    });
  });
});
