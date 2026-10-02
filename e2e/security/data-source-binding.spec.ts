import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken } from '../api-process';
import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T435 (AC-273, AC-310, AC-328; AC-161's first half): a model's data sources
 * are bound at publish, by xcube, nearest first from the model's folder up to
 * the root, and never rebound until the cube is published again.
 *
 * Against compose's xcube and its sample database, through the API as
 * `super`. Which connection a cube is bound to shows in what it answers: each
 * cube is `SELECT current_database()`, and each data source signs in to the
 * sample database's server as its superuser, into one of its databases.
 * Cube's own environment, which a model falls back to where no `default` is
 * on the path, reads `sample`, so no binding here reads `sample` but that
 * fallback: a binding lost can't pass for one made (T435's review).
 *
 *   /A          warehouse → postgres,  default → template1 (later)
 *   /A/B        warehouse → template1 (later), default → postgres (later)
 *   /A/B/C      warehouse → template1  (a descendant of /A/B: never /A/B's)
 *   /S          warehouse → template1  (a sibling branch: never /A/B's)
 *   /N          nothing                 (a path holding no `warehouse`)
 *   the root    <run>_root → template1 (later)
 */
const RUN = `b${Math.random().toString(36).slice(2, 7)}`;
const MODEL = 'e2e-security';
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const ids = { a: '', b: '', c: '', s: '', n: '' };
const sources: string[] = [];
const published: { folderId: string; name: string }[] = [];
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;
const full = (folderId: string, name: string) => `${xcubeIdOf(folderId)}__${name}`;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

/** A data source in a folder, signing in to the sample server's `database`. */
async function dataSource(
  request: APIRequestContext,
  folderId: string,
  name: string,
  database: string,
) {
  const fields = { host: 'sample-db', port: 5432, database, user: 'sample', ssl: false };
  const made = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, 'sample') },
    }),
  });
  expect(made.status(), await made.text()).toBe(201);
  sources.push(((await made.json()) as { id: string }).id);
}

/** A cube answering the database it reads; `data_source` or `extends` as given. */
const cubeYaml = (name: string, { dataSource, extends: parent, title }: CubeOptions = {}) =>
  [
    'cubes:',
    `  - name: ${name}`,
    ...(title === undefined ? [] : [`    title: ${title}`]),
    ...(parent === undefined
      ? ['    sql: SELECT current_database() AS db, 1 AS n']
      : [`    extends: ${parent}`]),
    ...(dataSource === undefined ? [] : [`    data_source: ${dataSource}`]),
    ...(parent === undefined
      ? [
          '    measures:',
          '      - name: count',
          '        type: count',
          '    dimensions:',
          '      - name: db',
          '        sql: db',
          '        type: string',
        ]
      : []),
    '',
  ].join('\n');
type CubeOptions = { dataSource?: string; extends?: string; title?: string };

/**
 * Published, and kept to remove after: through My workspace and a proposal
 * `super` approves, as a shared folder's model changes now (T451, AC-278).
 */
async function published200(
  request: APIRequestContext,
  folderId: string,
  name: string,
  options?: CubeOptions,
) {
  if (!published.some((each) => each.folderId === folderId && each.name === name))
    published.push({ folderId, name });
  const file = { path: `cubes/${name}.yml`, content: cubeYaml(name, options) };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/** The database a published cube reads, by its full name. */
async function readsFrom(request: APIRequestContext, cube: string) {
  // Asked afresh: the same SQL, bound anew, must not be answered from Cube's
  // cache of what it read before, so each read filters out a value of its own.
  const answer = await request.post('/api/load', {
    data: {
      query: {
        measures: [`${cube}.count`],
        dimensions: [`${cube}.db`],
        filters: [
          { member: `${cube}.db`, operator: 'notEquals', values: [`fresh-${Math.random()}`] },
        ],
      },
    },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  const rows = ((await answer.json()) as { data: Record<string, string>[] }).data;
  return rows[0]?.[`${cube}.db`];
}

const admin = (request: APIRequestContext, path: string, init: { data?: unknown } = {}) =>
  init.data === undefined
    ? request.get(`${CUBE}/v1/semantic/models/${MODEL}${path}`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      })
    : request.post(`${CUBE}/v1/semantic/models/${MODEL}${path}`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
        data: init.data,
      });

test.describe.configure({ mode: 'serial' });

test.describe('data sources bound at publish, nearest first (T435, AC-273, AC-310, AC-328)', () => {
  test.use({ role: 'super' });

  // Signed in afresh: a hook has no role's page (fixtures.ts), and a context
  // made here would otherwise carry whatever the suite's last one held.
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // Each removal said where it fails, so nothing is left unseen.
    const removed = async (what: string, answer: Promise<APIResponse>) => {
      const response = await answer;
      if (![200, 204, 404].includes(response.status()))
        console.warn(`${what}: ${String(response.status())} ${await response.text()}`);
    };
    // What extends goes first, then the rest, then what they used.
    for (const { folderId, name } of [...published].reverse())
      await removed(
        `cubes/${name}.yml`,
        request.delete(
          `/api/model/files?folder=${folderId}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
        ),
      );
    for (const id of sources) await removed(id, request.delete(`/api/data-sources/${id}`));
    for (const id of [ids.c, ids.b, ids.a, ids.s, ids.n].filter((each) => each !== ''))
      await removed(`folder ${id}`, request.delete(`/api/documents/folder/${id}`));
    await context.close();
  });

  test('binds the nearest on its path, never a descendant’s or a sibling’s, and one that extends another reads its parent’s', async ({
    page,
  }) => {
    const request = page.request;
    ids.a = await folder(request, `Binding A ${RUN}`, 'root');
    ids.b = await folder(request, `Binding B ${RUN}`, ids.a);
    ids.c = await folder(request, `Binding C ${RUN}`, ids.b);
    ids.s = await folder(request, `Binding S ${RUN}`, 'root');
    ids.n = await folder(request, `Binding N ${RUN}`, 'root');
    await dataSource(request, ids.a, 'warehouse', 'postgres');
    await dataSource(request, ids.c, 'warehouse', 'template1');
    await dataSource(request, ids.s, 'warehouse', 'template1');

    await published200(request, ids.b, `${RUN}_where`, { dataSource: 'warehouse' });
    // /A's: /A/B has none; /A/B/C's is beneath it and /S's beside it.
    expect(await readsFrom(request, full(ids.b, `${RUN}_where`))).toBe('postgres');

    // In /A/B/C, where a `warehouse` is nearer, a cube extending /A/B's
    // reads what its parent was bound to (AC-273).
    await published200(request, ids.c, `${RUN}_child`, { extends: `${RUN}_where` });
    expect(await readsFrom(request, full(ids.c, `${RUN}_child`))).toBe('postgres');
  });

  test('refuses a name found nowhere on the model’s path, naming it', async ({ page }) => {
    // Written in My workspace to go there (T451, AC-278): its overlay binds
    // it as the folder would, so the save says it.
    const { request } = page;
    const project = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Lost ${RUN}`, folderId: 'mine' },
    });
    expect(project.status(), await project.text()).toBe(201);
    const projectId = ((await project.json()) as { id: string }).id;
    try {
      const refused = await request.post('/api/model/publish', {
        data: {
          folderId: projectId,
          targetFolderId: ids.n,
          files: [
            {
              path: `cubes/${RUN}_lost.yml`,
              content: cubeYaml(`${RUN}_lost`, { dataSource: 'warehouse' }),
            },
          ],
        },
        timeout: 90_000,
      });
      expect(refused.status()).toBe(422);
      // xcube's refusal at binding, not a driver's for a name bound to nothing.
      const { errors } = (await refused.json()) as { errors: { message: string }[] };
      expect(errors.map((error) => error.message)).toEqual([
        'It uses the data source "warehouse", which no folder on this item\'s path holds',
      ]);
    } finally {
      await request.delete(`/api/documents/folder/${projectId}`);
    }
  });

  test('reports the connection a cube queried live on every instance serving it (AC-161)', async ({
    page,
  }) => {
    // Written as the driver is built, and, from xcube bc18f82c01, by every
    // instance that switches to a new connection, the refresh worker's among
    // them (T501; research xcube-bc18f82c01.md, "Connection health after a
    // change"): each one reporting says live, and current.
    await expect
      .poll(
        async () => {
          const health = await admin(
            page.request,
            `/connections/${full(ids.a, 'warehouse')}/health`,
          );
          const body = (await health.json()) as {
            instances?: { state: string; current: boolean; error: string | null }[];
          };
          return [
            ...new Set(
              (body.instances ?? []).map(({ state, current, error }) =>
                JSON.stringify({ state, current, error }),
              ),
            ),
          ];
        },
        { timeout: 30_000 },
      )
      .toEqual([JSON.stringify({ state: 'live', current: true, error: null })]);
  });

  test('rebinds nothing published when a nearer one is added, until the cube is published again', async ({
    page,
  }) => {
    const request = page.request;
    await dataSource(request, ids.b, 'warehouse', 'template1');
    // Another publish in the model between: nothing it resolves reaches
    // what was published before (T435's review).
    await published200(request, ids.n, `${RUN}_other`);
    expect(await readsFrom(request, full(ids.b, `${RUN}_where`))).toBe('postgres');
    expect(await readsFrom(request, full(ids.c, `${RUN}_child`))).toBe('postgres');

    await published200(request, ids.b, `${RUN}_where`, {
      dataSource: 'warehouse',
      title: 'Published again',
    });
    expect(await readsFrom(request, full(ids.b, `${RUN}_where`))).toBe('template1');
    // The cube that extends it reads its parent's, as its parent now is (AC-273).
    expect(await readsFrom(request, full(ids.c, `${RUN}_child`))).toBe('template1');
  });

  test('gives a cube naming none the nearest `default`, and Cube’s own where no folder on its path has one (AC-310)', async ({
    page,
  }) => {
    const request = page.request;
    await dataSource(request, ids.a, 'default', 'template1');
    await published200(request, ids.c, `${RUN}_plain`);
    expect(await readsFrom(request, full(ids.c, `${RUN}_plain`))).toBe('template1');

    // A nearer one binds it only once it is published again.
    await dataSource(request, ids.b, 'default', 'postgres');
    expect(await readsFrom(request, full(ids.c, `${RUN}_plain`))).toBe('template1');
    await published200(request, ids.c, `${RUN}_plain`, { title: 'Published again' });
    expect(await readsFrom(request, full(ids.c, `${RUN}_plain`))).toBe('postgres');

    // No `default` on /N's path: the root's, which is Cube's own here.
    await published200(request, ids.n, `${RUN}_rooted`);
    expect(await readsFrom(request, full(ids.n, `${RUN}_rooted`))).toBe('sample');
  });

  test('publishes a folder’s data source as <folderId>__<name> and the root’s by its short name, which neither renaming nor moving /A changes (AC-328)', async ({
    page,
  }) => {
    const request = page.request;
    const ours = async () =>
      (
        (await (await admin(request, '/connections')).json()) as { connections: { name: string }[] }
      ).connections
        .map((each) => each.name)
        .filter(
          (name) =>
            name === `${RUN}_root` ||
            Object.values(ids).some((id) => name.startsWith(`${xcubeIdOf(id)}__`)),
        )
        .sort();
    expect(await ours()).toContain(full(ids.a, 'warehouse'));

    // One in the shared root is published under its short name alone, and a
    // cube in /N naming it reads it.
    await dataSource(request, 'root', `${RUN}_root`, 'template1');
    expect(await ours()).toContain(`${RUN}_root`);
    await published200(request, ids.n, `${RUN}_viaroot`, { dataSource: `${RUN}_root` });
    expect(await readsFrom(request, full(ids.n, `${RUN}_viaroot`))).toBe('template1');

    // A cube only /S holds, which /A resolves once xcube has /A beneath /S.
    await published200(request, ids.s, `${RUN}_only_s`);
    const before = await ours();
    expect(
      (
        await request.patch(`/api/documents/folder/${ids.a}`, {
          data: { title: `Binding A renamed ${RUN}` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(`/api/documents/folder/${ids.a}`, { data: { folderId: ids.s } })
      ).status(),
    ).toBe(200);
    await expect
      .poll(
        async () =>
          (
            (await (
              await admin(request, '/resolve', {
                data: { folderId: xcubeIdOf(ids.a), names: [`${RUN}_only_s`] },
              })
            ).json()) as { names?: Record<string, string | null> }
          ).names?.[`${RUN}_only_s`] ?? null,
        { timeout: 30_000 },
      )
      .toBe(full(ids.s, `${RUN}_only_s`));

    // The same names, and none more; what was published answers as it did,
    // and a cube published again from the moved path binds as before.
    expect(await ours()).toEqual(before);
    expect(await readsFrom(request, full(ids.b, `${RUN}_where`))).toBe('template1');
    await published200(request, ids.b, `${RUN}_where`, {
      dataSource: 'warehouse',
      title: 'Published after the move',
    });
    expect(await readsFrom(request, full(ids.b, `${RUN}_where`))).toBe('template1');
    expect(await readsFrom(request, full(ids.c, `${RUN}_child`))).toBe('template1');
    expect(await ours()).toEqual(before);
  });
});
