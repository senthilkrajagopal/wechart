import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken } from '../api-process';
import { approvedBy, landed, modelFilesIn, proposedModel } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;

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

/**
 * T707 (AC-427): a deleted item's name lands again, and xcube takes it: a
 * cube of it landed, deleted, and a new file declaring it landed through a
 * workspace and a proposal `super` approves, then queried for its own SQL's
 * answer; and a data source made, deleted and made again under one name.
 */
test.describe('a deleted item’s name lands again (T707, AC-427)', () => {
  test.use({ role: 'super' });

  test('is taken by a new file once the cube is deleted, and xcube serves the new one', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const LANDING = { timeout: 90_000 };
    const request = page.request;
    const retake = `retake_${RUN}`;
    const cubeOf = (sql: string) =>
      `cubes:\n  - name: ${retake}\n    sql: ${sql}\n    measures:\n      - name: total\n        sql: n\n        type: sum\n`;
    const folder = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Retake ${RUN}`, folderId: 'root' },
    });
    expect(folder.status(), await folder.text()).toBe(201);
    const target = ((await folder.json()) as { id: string }).id;
    const first = { path: `cubes/${retake}.yml`, content: cubeOf('SELECT 1 AS n') };
    const second = { path: `cubes/${retake}_again.yml`, content: cubeOf('SELECT 2 AS n') };
    try {
      expect(await landed(request, target, [first])).toEqual([first]);
      const deleted = await request.delete(
        `/api/model/files?folder=${encodeURIComponent(target)}&path=${encodeURIComponent(first.path)}`,
        LANDING,
      );
      expect(deleted.status(), await deleted.text()).toBe(200);

      expect(await landed(request, target, [second])).toEqual([second]);
      const items = (
        (await (await request.get(`${ROUTES}/items`, { headers: headers() })).json()) as {
          items: { folderId: string; name: string; yaml: string }[];
        }
      ).items.filter((item) => item.name.toLowerCase() === retake);
      expect(items).toEqual([
        expect.objectContaining({ folderId: xcubeIdOf(target), name: retake }),
      ]);
      // Served as the new one: its own SQL's answer, 2, never the deleted one's 1.
      const answer = await request.post('/api/load', {
        data: { query: { measures: [`${retake}.total`] } },
        ...LANDING,
      });
      expect(answer.status(), await answer.text()).toBe(200);
      expect(((await answer.json()) as { data: Record<string, unknown>[] }).data).toEqual([
        { [`${retake}.total`]: expect.stringMatching(/^2(\.0+)?$/) },
      ]);
    } finally {
      for (const path of [first.path, second.path])
        await request.delete(
          `/api/model/files?folder=${encodeURIComponent(target)}&path=${encodeURIComponent(path)}`,
          LANDING,
        );
      await request.delete(`/api/documents/folder/${target}`);
    }
  });

  test('is taken by a new data source once the one of that name is deleted, and xcube takes it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const request = page.request;
    const name = `restage_${RUN}`;
    const folder = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Restage ${RUN}`, folderId: 'root' },
    });
    expect(folder.status(), await folder.text()).toBe(201);
    const target = ((await folder.json()) as { id: string }).id;
    const fields = {
      host: 'sample-db',
      port: 5432,
      database: 'sample',
      user: 'sample',
      ssl: false,
    };
    const make = async () =>
      request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: target,
          name,
          driver: 'postgres',
          authMethod: 'password',
          fields,
          sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, 'sample') },
        }),
        timeout: 90_000,
      });
    const held = async () =>
      (
        (await (await request.get(`${ROUTES}/connections`, { headers: headers() })).json()) as {
          connections: { name: string; folderId: string }[];
        }
      ).connections.filter((each) => each.name.toLowerCase() === name);
    try {
      const first = await make();
      expect(first.status(), await first.text()).toBe(201);
      const removed = await request.delete(
        `/api/data-sources/${((await first.json()) as { id: string }).id}`,
      );
      expect(removed.status(), await removed.text()).toBe(204);
      expect(await held()).toEqual([]);

      const again = await make();
      expect(again.status(), await again.text()).toBe(201);
      expect(await held()).toEqual([
        expect.objectContaining({ name, folderId: xcubeIdOf(target) }),
      ]);
    } finally {
      const listed = (await (await request.get('/api/data-sources')).json()) as {
        id: string;
        name: string;
      }[];
      for (const each of listed.filter((source) => source.name === name))
        await request.delete(`/api/data-sources/${each.id}`);
      await request.delete(`/api/documents/folder/${target}`);
    }
  });
});

/**
 * T723 (AC-426, AC-424, AC-422): in the model editor, a cube's name outside
 * R72's grammar is said in Problems and holds Save, so nothing is sent; one
 * the root's landed `orders` holds is refused on Save, said as in use and
 * nothing of where.
 */
test.describe('a draft cube’s name in the model editor (T723)', () => {
  test.use({ role: 'super' });

  test('holds Save for a name outside the grammar, and says a landed name only as in use', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const request = page.request;
    const held = `held_${RUN}`;
    const path = `cubes/${held}.yml`;
    const made: string[] = [];
    let project = '';
    const folderIn = async (parent: string, title: string) => {
      const answer = await request.post('/api/documents', {
        data: { kind: 'folder', title, folderId: parent },
      });
      expect(answer.status(), await answer.text()).toBe(201);
      const id = ((await answer.json()) as { id: string }).id;
      made.unshift(id);
      return id;
    };
    try {
      const target = await folderIn('root', `Held ${RUN}`);
      project = await folderIn('mine', `Held draft ${RUN}`);
      const saved = await request.post('/api/model/publish', {
        data: {
          folderId: project,
          targetFolderId: target,
          files: [
            {
              path,
              content: `cubes:\n  - name: ${held}\n    sql: SELECT 1 AS n\n    measures:\n      - name: count\n        type: count\n`,
            },
          ],
        },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);

      await page.goto(
        `/explore/folders/${encodeURIComponent(project)}/models/${encodeURIComponent(path)}`,
      );
      const name = page
        .getByRole('region', { name: `Cube ${held}` })
        .getByRole('tabpanel')
        .getByLabel('Name', { exact: true });
      const save = page.getByRole('button', { name: 'Save', exact: true });
      const problems = page.getByRole('region', { name: 'Problems' });

      await name.fill('Orders__2');
      await expect(problems.getByRole('listitem')).toContainText([
        'Cube Orders__2: “Orders__2” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.',
      ]);
      await expect(save).toBeDisabled();

      const sent: string[] = [];
      page.on('request', (each) => {
        if (each.url().endsWith('/api/model/publish')) sent.push(each.method());
      });
      await page
        .getByRole('region', { name: 'Cube Orders__2' })
        .getByRole('tabpanel')
        .getByLabel('Name', { exact: true })
        .fill('orders');
      await save.click();
      await expect(page.getByRole('alert').filter({ hasText: 'already in use' })).toHaveText(
        'The name “orders” is already in use, so nothing was saved.',
      );
      await expect(problems.getByRole('listitem')).toContainText([
        'The name “orders” is already in use.',
      ]);
      // Sent once, on Save: never for the name outside the grammar.
      expect(sent).toEqual(['POST']);
    } finally {
      if (project !== '')
        await request.delete(
          `/api/model/files?folder=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`,
        );
      for (const id of made) await request.delete(`/api/documents/folder/${id}`);
    }
  });
});
