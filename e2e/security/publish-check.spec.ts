import type { APIRequestContext } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T451 (AC-321, AC-288, AC-322; design 05, state L): a proposal's model is
 * checked by xcube's dry run of the changeset it would make when proposed,
 * and again at approval, where the changeset is applied. A break refuses
 * the approval: the review says so, naming the file, and nothing changes;
 * the folder, the proposal and the published model are as they were.
 *
 * Against compose's xcube. `super` makes a folder `writer` (`sales-rw`)
 * writes and publishes two cubes in it. `writer` copies one into My
 * workspace, joins it to the other and proposes it. `super` then deletes the
 * other, which nothing published uses, so the approval's check finds the
 * join broken; published again, the approval lands.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Checked ${RUN}`;
const CUBE = `t451_${RUN}`;
const OTHER = `t451_other_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const OTHER_PATH = `cubes/${OTHER}.yml`;
const cubeOf = (name: string) =>
  `cubes:\n  - name: ${name}\n    sql: SELECT 1 AS n\n    dimensions:\n      - name: n\n        sql: n\n        type: number\n        primary_key: true\n        public: true\n    measures:\n      - name: total\n        sql: n\n        type: sum\n`;
const JOINED = `${cubeOf(CUBE)}    joins:\n      - name: ${OTHER}\n        sql: "{CUBE}.n = {${OTHER}}.n"\n        relationship: many_to_one\n`;
const made = { folder: '', project: '', proposal: '' };

const filesOf = async (request: APIRequestContext) => {
  const answer = await request.get(`/api/model/files?folder=${made.folder}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { files: { path: string; content: string }[] }).files;
};
const publish = (request: APIRequestContext, path: string, content: string) =>
  request.post('/api/model/publish', {
    data: { folderId: made.folder, files: [{ path, content }] },
    timeout: 90_000,
  });

test.describe.configure({ mode: 'serial' });

test.describe('a proposal’s model, checked when proposed and at approval (T451)', () => {
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
        if (made.proposal !== '')
          await request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
        if (made.project !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.project}`);
        }
      }
      if (who === 'super' && made.folder !== '') {
        for (const path of [PATH, OTHER_PATH])
          await request.delete(
            `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(path)}`,
            { timeout: 90_000 },
          );
        await request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder and publishes its two cubes', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const access = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status()).toBe(200);
      for (const [path, name] of [
        [PATH, CUBE],
        [OTHER_PATH, OTHER],
      ] as const) {
        const published = await publish(page.request, path, cubeOf(name));
        expect(published.status(), await published.text()).toBe(200);
      }
    });
  });

  test.describe('as writer, its author', () => {
    test.use({ role: 'writer' });

    test('copies the cube, joins it to the other, and proposes it: the dry run passes', async ({
      page,
    }) => {
      const { request } = page;
      const copied = await request.post('/api/workspace/copies', {
        data: { kind: 'model', folderId: made.folder, path: PATH, timeZone: 'UTC' },
        timeout: 90_000,
      });
      expect(copied.status(), await copied.text()).toBe(201);
      made.project = ((await copied.json()) as { folderId: string }).folderId;
      const joined = await request.post('/api/model/publish', {
        data: { folderId: made.project, files: [{ path: PATH, content: JOINED }] },
        timeout: 90_000,
      });
      expect(joined.status(), await joined.text()).toBe(200);
      // Its id, which a proposal names it by (T350).
      const dependents = await request.get(
        `/api/model/files/dependents?folder=${made.project}&path=${encodeURIComponent(PATH)}`,
      );
      expect(dependents.status(), await dependents.text()).toBe(200);
      const fileId = ((await dependents.json()) as { fileId: string }).fileId;
      expect(fileId).toMatch(/^[0-9a-f-]{36}$/);
      const proposed = await request.post('/api/proposals', {
        data: { kind: 'model', id: fileId },
        timeout: 90_000,
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposal = ((await proposed.json()) as { id: string }).id;
    });
  });

  test.describe('as super, meanwhile', () => {
    test.use({ role: 'super' });

    test('deletes the other cube, which nothing published uses', async ({ page }) => {
      const deleted = await page.request.delete(
        `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(OTHER_PATH)}`,
        { timeout: 90_000 },
      );
      expect(deleted.status(), await deleted.text()).toBe(200);
    });
  });

  test.describe('as writer, approving their own', () => {
    test.use({ role: 'writer' });

    test('is refused by the check, naming the file, and nothing changes (state L)', async ({
      page,
    }) => {
      const before = await filesOf(page.request);
      await page.goto(`/reviews/${made.proposal}`);
      await expect(
        page.getByRole('region', { name: 'Publish check' }).getByRole('status'),
      ).toContainText('Every affected module compiled');
      await page.getByRole('button', { name: 'Approve my own proposal' }).click();
      await page.getByRole('button', { name: 'Approve and publish' }).click();
      await expect(page.getByRole('alert')).toHaveText('Can’t approve: 1 item would break', {
        timeout: 90_000,
      });
      const broken = page.locator('.review-refusal__break');
      await expect(broken).toHaveCount(1);
      await expect(broken).toContainText(`${PATH} · ${FOLDER}`);
      await expect(page.getByRole('button', { name: 'Approve my own proposal' })).toBeDisabled();

      // Every folder, the proposal and the published model as they were.
      expect(await filesOf(page.request)).toEqual(before);
      const proposal = await page.request.get(`/api/proposals/${made.proposal}`);
      expect(((await proposal.json()) as { status: string }).status).toBe('open');
    });
  });

  test.describe('as super, again', () => {
    test.use({ role: 'super' });

    test('publishes the other cube again', async ({ page }) => {
      const published = await publish(page.request, OTHER_PATH, cubeOf(OTHER));
      expect(published.status(), await published.text()).toBe(200);
    });
  });

  test.describe('as writer, approving at last', () => {
    test.use({ role: 'writer' });

    test('lands the model through the changeset: the folder’s file and the served cube are the proposed', async ({
      page,
    }) => {
      const approved = await page.request.post(`/api/proposals/${made.proposal}/approve`, {
        data: {},
        timeout: 90_000,
      });
      expect(approved.status(), await approved.text()).toBe(200);
      const landed = (await approved.json()) as { landed: { kind: string; version: number }[] };
      expect(landed.landed).toEqual([expect.objectContaining({ kind: 'model', version: 2 })]);
      made.proposal = '';
      const files = await filesOf(page.request);
      expect(files.find((each) => each.path === PATH)?.content).toBe(JOINED);
    });
  });

  test.describe('as super, reading what is served', () => {
    test.use({ role: 'super' });

    test('queries across the join the landed model makes', async ({ page }) => {
      const prefix = `f${made.folder.replaceAll('-', '')}__`;
      const load = await page.request.post('/api/load', {
        data: {
          query: { measures: [`${prefix}${CUBE}.total`], dimensions: [`${prefix}${OTHER}.n`] },
        },
        timeout: 90_000,
      });
      expect(load.status(), await load.text()).toBe(200);
      const [row] = ((await load.json()) as { data: Record<string, unknown>[] }).data;
      expect(Number(row?.[`${prefix}${CUBE}.total`])).toBe(1);
    });
  });
});
