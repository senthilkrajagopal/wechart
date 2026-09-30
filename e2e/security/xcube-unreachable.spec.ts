import { execFileSync } from 'node:child_process';

import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { proposeShared } from './shared-change';

/**
 * T457, AC-272: IF xcube can't be reached, THEN a save in a folder is
 * refused, saying so, and nothing is stored. A shared chart or dashboard is
 * saved by approving its copy (T502, AC-278), and the approval binds it
 * (`routes/proposals.ts`, `bind`): with compose's Cube (xcube) stopped, the
 * approval is refused and the item is as it was.
 *
 * Stopping Cube stops it for every spec, so this runs in a project of its
 * own, after the three browsers' (`playwright.security.config.ts`), and
 * starts Cube again whatever happens: in `finally`, and again after all.
 * Run it on its own with `--project=xcube-unreachable --no-deps`.
 */
const RUN = Math.random().toString(36).slice(2, 8);
/** Compose's Cube API instance, which serves xcube's routes. */
const CUBE_CONTAINER = 'wechart-cube';
const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Cube started again, and answering, however the test ended. */
async function cubeUp() {
  docker('start', CUBE_CONTAINER);
  await expect
    .poll(
      async () => (await fetch('http://localhost:54000/readyz').catch(() => undefined))?.status,
      { timeout: 180_000, intervals: [1_000] },
    )
    .toBe(200);
}

async function made(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

const read = async (request: APIRequestContext, kind: string, id: string) =>
  (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };

test.describe.configure({ mode: 'serial' });

test.describe('a save while xcube can’t be reached (T457, AC-272)', () => {
  test.use({ role: 'super' });
  test.setTimeout(300_000);
  const ids = { folder: '', chart: '', board: '' };

  test.afterAll(async () => {
    // Started again even when the test timed out in its `try`.
    await cubeUp();
  });

  test('refuses an approval while xcube can’t be reached, saying so, and stores nothing', async ({
    page,
  }) => {
    const request = page.request;
    ids.folder = await made(request, {
      kind: 'folder',
      title: `Unreached ${RUN}`,
      folderId: 'root',
    });
    ids.chart = await made(request, {
      kind: 'chart',
      title: `Unreached chart ${RUN}`,
      folderId: ids.folder,
    });
    ids.board = await made(request, {
      kind: 'dashboard',
      title: `Unreached board ${RUN}`,
      folderId: ids.folder,
    });
    const before = await read(request, 'chart', ids.chart);
    const boardBefore = await read(request, 'dashboard', ids.board);

    try {
      docker('stop', CUBE_CONTAINER);
      const proposed = await proposeShared(request, 'chart', ids.chart, (body) => ({
        ...body,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        },
      }));
      expect(proposed.approved.status()).toBe(502);
      expect(await proposed.approved.json()).toEqual({
        error: `xcube could not be asked where the cubes of “Unreached chart ${RUN}” are, so nothing was approved.`,
      });
      const after = await read(request, 'chart', ids.chart);
      expect(after.version).toBe(before.version);
      expect(after.body['chart']).toEqual(before.body['chart']);
      await proposed.cleanUp();

      // A dashboard's save alike: its filter's cube can't be bound.
      const filtered = await proposeShared(request, 'dashboard', ids.board, (body) => ({
        ...body,
        filters: [{ id: 'f1', widget: 'list', member: 'orders.status' }],
      }));
      expect(filtered.approved.status()).toBe(502);
      expect(await filtered.approved.json()).toEqual({
        error: `xcube could not be asked where the cubes of “Unreached board ${RUN}” are, so nothing was approved.`,
      });
      const boardAfter = await read(request, 'dashboard', ids.board);
      expect(boardAfter.version).toBe(boardBefore.version);
      expect(boardAfter.body['filters']).toEqual(boardBefore.body['filters']);
      await filtered.cleanUp();
    } finally {
      await cubeUp();
    }
  });

  test('removes what the run made', async ({ page }) => {
    const request = page.request;
    if (ids.board !== '') await request.delete(`/api/documents/dashboard/${ids.board}`);
    if (ids.chart !== '') await request.delete(`/api/documents/chart/${ids.chart}`);
    if (ids.folder !== '') await request.delete(`/api/documents/folder/${ids.folder}`);
  });
});
