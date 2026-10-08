import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken } from '../api-process';
import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T435 (AC-273, AC-310, AC-328; AC-161's first half), reworked by T730 to
 * R71's one name per data source and R72's path rule: a model's cube is
 * bound at publish, by xcube, to the one data source of the name it gives,
 * which must be kept in its folder or an ancestor; a cube naming none, to
 * the shared root's `default`; and nothing is rebound when other things
 * land, or when a folder is renamed or moved.
 *
 * Against compose's xcube and its sample database, through the API as
 * `super`. Which connection a cube is bound to shows in what it answers: each
 * cube is `SELECT current_database()`, and each data source signs in to the
 * sample database's server as its superuser, into one of its databases. The
 * root's `default` reads `sample`, which no data source here reads, so no
 * binding here can pass for it.
 *
 *   /A          wh_<run>   → postgres
 *   /A/B        (the cubes)
 *   /A/B/C      deep_<run> → template1  (a descendant of /A/B: never /A/B's)
 *   /S          side_<run> → template1  (a sibling branch: never /A/B's)
 *   /N          nothing
 *   the root    <run>_root → template1 (later)
 */
const RUN = `b${Math.random().toString(36).slice(2, 7)}`;
const MODEL = 'e2e-security';
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const SOURCES = { a: `wh_${RUN}`, c: `deep_${RUN}`, s: `side_${RUN}`, root: `${RUN}_root` };
const ids = { a: '', b: '', c: '', s: '', n: '' };
const sources: string[] = [];
const published: { folderId: string; name: string }[] = [];
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

/** A data source in a folder, signing in to the sample server's `database`: its answer. */
async function dataSourceAnswer(
  request: APIRequestContext,
  folderId: string,
  name: string,
  database: string,
) {
  const fields = { host: 'sample-db', port: 5432, database, user: 'sample', ssl: false };
  return request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, 'sample') },
    }),
  });
}

async function dataSource(
  request: APIRequestContext,
  folderId: string,
  name: string,
  database: string,
) {
  const made = await dataSourceAnswer(request, folderId, name, database);
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

/** A cube saved in My workspace to go to `target`: the save's refusal messages. */
async function refusedAt(request: APIRequestContext, target: string, name: string, uses: string) {
  const project = await request.post('/api/documents', {
    data: { kind: 'folder', title: `Refused ${name}`, folderId: 'mine' },
  });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = ((await project.json()) as { id: string }).id;
  try {
    const refused = await request.post('/api/model/publish', {
      data: {
        folderId: projectId,
        targetFolderId: target,
        files: [{ path: `cubes/${name}.yml`, content: cubeYaml(name, { dataSource: uses }) }],
      },
      timeout: 90_000,
    });
    expect(refused.status(), await refused.text()).toBe(422);
    return ((await refused.json()) as { errors: { message: string }[] }).errors.map(
      (error) => error.message,
    );
  } finally {
    await request.delete(`/api/documents/folder/${projectId}`);
  }
}

/** The database a published cube reads, by its own name. */
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

const admin = (request: APIRequestContext, path: string) =>
  request.get(`${CUBE}/v1/semantic/models/${MODEL}${path}`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
  });

test.describe.configure({ mode: 'serial' });

test.describe('data sources bound at publish by name, on the cube’s path (T435, T730; AC-273, AC-310, AC-328)', () => {
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

  test('binds the one data source of its name on its path, and one that extends another reads its parent’s', async ({
    page,
  }) => {
    const request = page.request;
    ids.a = await folder(request, `Binding A ${RUN}`, 'root');
    ids.b = await folder(request, `Binding B ${RUN}`, ids.a);
    ids.c = await folder(request, `Binding C ${RUN}`, ids.b);
    ids.s = await folder(request, `Binding S ${RUN}`, 'root');
    ids.n = await folder(request, `Binding N ${RUN}`, 'root');
    await dataSource(request, ids.a, SOURCES.a, 'postgres');
    await dataSource(request, ids.c, SOURCES.c, 'template1');
    await dataSource(request, ids.s, SOURCES.s, 'template1');

    await published200(request, ids.b, `${RUN}_where`, { dataSource: SOURCES.a });
    // /A's, by its name: the only one of it.
    expect(await readsFrom(request, `${RUN}_where`)).toBe('postgres');

    // In /A/B/C, which keeps a data source of its own, a cube extending /A/B's
    // reads what its parent was bound to (AC-273).
    await published200(request, ids.c, `${RUN}_child`, { extends: `${RUN}_where` });
    expect(await readsFrom(request, `${RUN}_child`)).toBe('postgres');
  });

  test('refuses a data source kept only beneath it or in a sibling branch, and one no folder holds, naming it', async ({
    page,
  }) => {
    // Written in My workspace to go to /A/B (T451, AC-278): its overlay is
    // checked as the folder would be, so the save says it.
    const request = page.request;
    for (const kept of [SOURCES.c, SOURCES.s])
      expect(await refusedAt(request, ids.b, `${RUN}_off_${kept}`, kept)).toEqual([
        `It uses the data source "${kept}", which isn't in its folder or one of its ancestors`,
      ]);
    expect(await refusedAt(request, ids.b, `${RUN}_lost`, `lost_${RUN}`)).toEqual([
      `It uses the data source "lost_${RUN}", which the model doesn't hold`,
    ]);
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
          const health = await admin(page.request, `/connections/${SOURCES.a}/health`);
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

  test('rebinds nothing when something else lands, nor when the cube is published again', async ({
    page,
  }) => {
    const request = page.request;
    // Another publish in the model between: nothing it resolves reaches
    // what was published before (T435's review).
    await published200(request, ids.n, `${RUN}_other`);
    expect(await readsFrom(request, `${RUN}_where`)).toBe('postgres');
    expect(await readsFrom(request, `${RUN}_child`)).toBe('postgres');

    await published200(request, ids.b, `${RUN}_where`, {
      dataSource: SOURCES.a,
      title: 'Published again',
    });
    expect(await readsFrom(request, `${RUN}_where`)).toBe('postgres');
    expect(await readsFrom(request, `${RUN}_child`)).toBe('postgres');
  });

  test('gives a cube naming none the shared root’s `default`, which no other folder may hold (AC-310)', async ({
    page,
  }) => {
    const request = page.request;
    // No folder but the root holds `default`, in any case (T708).
    for (const [folderId, name] of [
      [ids.a, 'default'],
      [ids.b, 'Default'],
    ] as const) {
      const refused = await dataSourceAnswer(request, folderId, name, 'template1');
      expect(refused.status(), await refused.text()).toBe(400);
      expect(await refused.json()).toEqual({
        error: 'Only the shared root may have a data source named default.',
      });
    }
    // A cube naming none, deep in /A/B/C and in /N: the root's, `sample`.
    await published200(request, ids.c, `${RUN}_plain`);
    expect(await readsFrom(request, `${RUN}_plain`)).toBe('sample');
    await published200(request, ids.n, `${RUN}_rooted`);
    expect(await readsFrom(request, `${RUN}_rooted`)).toBe('sample');
  });

  test('publishes a data source under its own name in its folder’s xcube id, which neither renaming nor moving /A changes (AC-328)', async ({
    page,
  }) => {
    const request = page.request;
    const ours = async () =>
      (
        (await (await admin(request, '/connections')).json()) as {
          connections: { name: string; folderId: string }[];
        }
      ).connections
        .filter((each) => Object.values(SOURCES).includes(each.name))
        .map(({ name, folderId }) => ({ name, folderId }))
        .sort((one, other) => one.name.localeCompare(other.name));
    expect(await ours()).toEqual(
      [
        { name: SOURCES.a, folderId: xcubeIdOf(ids.a) },
        { name: SOURCES.c, folderId: xcubeIdOf(ids.c) },
        { name: SOURCES.s, folderId: xcubeIdOf(ids.s) },
      ].sort((one, other) => one.name.localeCompare(other.name)),
    );

    // One in the shared root, by its own name in `froot`, and a cube in /N
    // naming it reads it.
    await dataSource(request, 'root', SOURCES.root, 'template1');
    expect(await ours()).toContainEqual({ name: SOURCES.root, folderId: 'froot' });
    await published200(request, ids.n, `${RUN}_viaroot`, { dataSource: SOURCES.root });
    expect(await readsFrom(request, `${RUN}_viaroot`)).toBe('template1');

    const before = await ours();
    expect(
      (
        await request.patch(`/api/documents/folder/${ids.a}`, {
          data: { title: `Binding A renamed ${RUN}` },
        })
      ).status(),
    ).toBe(200);
    // /A beneath /S: every cube under it keeps its data source on its path.
    const moved = await request.patch(`/api/documents/folder/${ids.a}`, {
      data: { folderId: ids.s },
    });
    expect(moved.status(), await moved.text()).toBe(200);
    // Seen in xcube's tree: /A/B now reaches /S's data source.
    await published200(request, ids.b, `${RUN}_via_side`, { dataSource: SOURCES.s });
    expect(await readsFrom(request, `${RUN}_via_side`)).toBe('template1');

    // The same names in the same xcube ids; what was published answers as it did.
    expect(await ours()).toEqual(before);
    expect(await readsFrom(request, `${RUN}_where`)).toBe('postgres');
    expect(await readsFrom(request, `${RUN}_child`)).toBe('postgres');
  });
});
