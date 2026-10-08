import type { APIRequestContext } from '@playwright/test';

import { CUBE, serviceToken } from '../api-process';
import { approvedBy, modelFilesIn, proposedModel } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T702 (AC-421, AC-424): xcube `256d632371`, asked directly under wechart's
 * service credential, holds one name per item model-wide, compared in any
 * case. A cube `Orders` landed in a folder while the root's `orders` has
 * landed is refused on the caller's own item, `name_in_use`; nothing of it
 * lands, and the answer holds no folder of the item holding the name
 * (research `xcube-256d632371.md`, "The error kinds", 2.3).
 */
const MODEL = 'e2e-security';
const RUN = `g${Math.random().toString(36).slice(2, 7)}`;
const ROUTES = `${CUBE}/v1/semantic/models/${MODEL}`;
const headers = () => ({ authorization: `Bearer ${serviceToken()}` });
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;

const revisionOf = async (request: APIRequestContext) => {
  const answer = await request.get(`${ROUTES}/revision`, { headers: headers() });
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { current: { revision: number } | null }).current?.revision;
};

test.describe('one name per item, held by xcube (T702, AC-421, AC-424)', () => {
  test.use({ role: 'super' });

  test('refuses `Orders` in a folder while the root’s `orders` has landed, landing nothing and naming no folder of the holder', async ({
    page,
  }) => {
    const request = page.request;
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Global names ${RUN}`, folderId: 'root' },
    });
    expect(made.status(), await made.text()).toBe(201);
    const folderId = ((await made.json()) as { id: string }).id;
    const xcubeId = xcubeIdOf(folderId);
    try {
      const items = async () =>
        (
          (await (await request.get(`${ROUTES}/items`, { headers: headers() })).json()) as {
            items: { folderId: string; name: string }[];
          }
        ).items;
      // The root's `orders`, from the seeded model.
      expect(await items()).toEqual(
        expect.arrayContaining([expect.objectContaining({ folderId: 'froot', name: 'orders' })]),
      );

      const upsert = {
        folderId: xcubeId,
        name: 'Orders',
        kind: 'cube',
        yaml: 'cubes:\n  - name: Orders\n    sql: SELECT 1 AS n\n',
      };
      // The new folder reaches xcube's tree as the API pushes it (T452).
      let answer: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
      let before: number | undefined;
      await expect
        .poll(
          async () => {
            before = await revisionOf(request);
            const sent = await request.post(`${ROUTES}/changesets`, {
              headers: headers(),
              data: { baseRevision: before ?? null, upserts: [upsert], deletes: [] },
            });
            answer = {
              status: sent.status(),
              body: (await sent.json()) as Record<string, unknown>,
            };
            const errors = (answer.body['errors'] ?? []) as { kind: string }[];
            return errors.some((error) => error.kind === 'folder')
              ? 'not in the tree yet'
              : 'asked';
          },
          { timeout: 20_000 },
        )
        .toBe('asked');

      expect(answer.status, JSON.stringify(answer.body)).toBe(422);
      expect(answer.body).toMatchObject({ code: 'invalid_items' });
      expect(answer.body['errors']).toEqual([
        {
          folderId: xcubeId,
          name: 'Orders',
          kind: 'name_in_use',
          message: 'The name "Orders" is already in use',
        },
      ]);
      // Nothing of the holder's folder: the root's id is nowhere in it.
      expect(JSON.stringify(answer.body)).not.toContain('froot');

      // Nothing of it landed.
      expect(await revisionOf(request)).toBe(before);
      expect((await items()).filter((item) => item.name.toLowerCase() === 'orders')).toEqual([
        expect.objectContaining({ folderId: 'froot', name: 'orders' }),
      ]);
    } finally {
      await request.delete(`/api/documents/folder/${encodeURIComponent(folderId)}`);
    }
  });
});

/**
 * T704 (AC-422, AC-421, AC-424): no name is reserved. Two workspaces each
 * propose a draft of one new name; the first approval lands it, and the
 * second is refused, saying only that the name is in use, with nothing of it
 * landed. `super` and `writer` (`sales-rw`) each draft in their own My
 * workspace, to a folder both write; `super` approves.
 */
test.describe('the first approval of a new name lands it (T704, AC-422)', () => {
  test.use({ role: 'super' });

  test('a second workspace’s draft of that name is refused at approval, and lands nothing', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const LANDING = { timeout: 90_000 };
    const twin = `twin_${RUN}`;
    const cubeOf = (sql: string) => `cubes:\n  - name: ${twin}\n    sql: ${sql}\n`;
    const superRequest = page.request;
    const folder = await superRequest.post('/api/documents', {
      data: { kind: 'folder', title: `Twins ${RUN}`, folderId: 'root' },
    });
    expect(folder.status(), await folder.text()).toBe(201);
    const target = ((await folder.json()) as { id: string }).id;
    const access = await superRequest.put(`/api/folders/${target}/access`, {
      data: { readOnly: [], readWrite: ['sales-rw'] },
    });
    expect(access.status(), await access.text()).toBe(200);

    const writerContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await writerContext.newPage(), 'writer');
    const writerRequest = writerContext.request;

    /** A draft of `twin` at `path` in this user's My workspace, going to the target, proposed. */
    const drafted: { request: APIRequestContext; folderId: string; path: string }[] = [];
    const proposals: { request: APIRequestContext; id: string }[] = [];
    const draftAndPropose = async (request: APIRequestContext, path: string, sql: string) => {
      const project = await request.post('/api/documents', {
        data: { kind: 'folder', title: `Twin draft ${RUN}`, folderId: 'mine' },
      });
      expect(project.status(), await project.text()).toBe(201);
      const folderId = ((await project.json()) as { id: string }).id;
      drafted.push({ request, folderId, path });
      const saved = await request.post('/api/model/publish', {
        data: { folderId, targetFolderId: target, files: [{ path, content: cubeOf(sql) }] },
        ...LANDING,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      const proposed = await proposedModel(request, folderId, path);
      expect(proposed.status(), await proposed.text()).toBe(201);
      const id = ((await proposed.json()) as { id: string }).id;
      proposals.push({ request, id });
      return id;
    };
    const filesOfTarget = async () =>
      (await modelFilesIn(superRequest, target)).map(({ path, content }) => ({ path, content }));

    try {
      const first = await draftAndPropose(writerRequest, `cubes/${twin}.yml`, 'SELECT 1 AS n');
      const second = await draftAndPropose(superRequest, `cubes/${twin}_b.yml`, 'SELECT 2 AS n');

      const landedFirst = await approvedBy(superRequest, first);
      expect(landedFirst.status(), await landedFirst.text()).toBe(200);
      const before = await filesOfTarget();
      expect(before).toEqual([{ path: `cubes/${twin}.yml`, content: cubeOf('SELECT 1 AS n') }]);

      const refused = await approvedBy(superRequest, second);
      expect(refused.status(), await refused.text()).toBe(409);
      expect(((await refused.json()) as { error: string }).error).toBe(
        `The name “${twin}” is already in use, so nothing was approved.`,
      );
      expect(await filesOfTarget()).toEqual(before);
    } finally {
      for (const { request, id } of proposals)
        await request.post(`/api/proposals/${id}/reject`, { data: {} });
      for (const { request, folderId, path } of drafted) {
        await request.delete(
          `/api/model/files?folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}`,
          LANDING,
        );
        await request.delete(`/api/documents/folder/${folderId}`);
      }
      await superRequest.delete(
        `/api/model/files?folder=${encodeURIComponent(target)}&path=${encodeURIComponent(`cubes/${twin}.yml`)}`,
        LANDING,
      );
      await superRequest.delete(`/api/documents/folder/${target}`);
      await writerContext.close();
    }
  });
});
