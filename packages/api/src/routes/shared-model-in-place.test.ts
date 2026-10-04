import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { workspaceOverlayIdOf } from '../xcube/overlays';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T451, AC-278's model half (`[R52]`): now a model lands through an
 * approval, a shared folder's model changes only that way, as a dashboard, a
 * chart or a data source does. Its content isn't published in place, by a
 * member or a Super-Admin: it is copied into My workspace, changed there and
 * proposed. With sign-in off too, by the single user (T451's switch; AC-254):
 * their workspace holds models as a signed-in user's does, saved through its
 * overlay in xcube, which its previews name.
 *
 * Against the suite's database, the stub xcube and a stub Cube recording
 * each token.
 */
const MARK = `smp${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `smpn-${MARK}`;
const CUBE = `${MARK}_orders`;
const PATH = `cubes/${CUBE}.yml`;
const cube = (name: string, extra = '') =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${extra}`;
const MEASURED = cube(
  CUBE,
  '    measures:\n      - name: margin\n        sql: amount\n        type: sum\n',
);

let app: FastifyInstance;
let solo: FastifyInstance;
let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
const asked: { claims: Record<string, unknown> }[] = [];
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const ids = { sales: '', soloProject: '', soloChart: '' };

beforeAll(async () => {
  cubeServer = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}',
    ) as Record<string, unknown>;
    asked.push({ claims });
    const overlay = claims['wechartOverlay'];
    response.writeHead(200, {
      'content-type': 'application/json',
      ...(typeof overlay === 'string'
        ? { 'x-xcube-overlay': `${overlay}@${String(stub.overlay(MODEL, overlay)?.version ?? 0)}` }
        : {}),
    });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;
  ids.sales = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  await files().write([{ folderId: ids.sales, path: PATH, content: cube(CUBE) }]);
  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
  ]);
  stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl,
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
  const shared = {
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  };
  const base = { cubeApiUrl, cubeApiSecret: 'secret', securityContext: {}, port: 0, modelDir: '' };
  // The single user's, with sign-in off.
  solo = buildServer({ ...shared, config: base });
  app = buildServer({
    ...shared,
    config: {
      ...base,
      security: 'oidc',
      publicUrl: PUBLIC_URL,
      sessionSecret: 'a-test-session-secret-at-least-32-characters',
      superAdminGroup: 'wechart-super-admins',
      oidc: {
        issuer: 'http://localhost:5556/dex',
        clientId: 'wechart',
        clientSecret: 'dev-oidc-secret',
        groupsClaim: 'groups',
        scopes: 'openid profile email groups',
        allowHttp: true,
      },
    },
    sessions: pgSessionStore(getDb()),
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  for (const server of [app, solo]) if (server !== undefined) await server.close();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('path', 'like', `cubes/${CUBE}%`).execute();
  // The single user's chart and project folder, in `mine`.
  if (ids.soloChart !== '') await docs().remove('chart', ids.soloChart);
  if (ids.soloProject !== '') await docs().remove('folder', ids.soloProject);
  await docs().remove('folder', ids.sales);
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const publishIn = (folderId: string, content: string) => ({
  method: 'POST' as const,
  url: '/api/model/publish',
  payload: { folderId, files: [{ path: PATH, content }] },
});
const salesFile = async () =>
  (await files().inFolders([ids.sales])).find((file) => file.path === PATH);

describe('a shared model changes only through a proposal, with sign-in on (T451, AC-278)', () => {
  it('isn’t published in place, by a member or a Super-Admin', async () => {
    for (const who of ['writer', 'super']) {
      const answer = await as(who, publishIn(ids.sales, MEASURED));
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual({
        error:
          'This model is shared: it changes only through a proposal. Choose Edit in my workspace, change your copy there, and propose it.',
        code: 'shared_in_place',
      });
    }
    expect((await salesFile())?.content).toBe(cube(CUBE));
  });

  it('is changed in a copy in My workspace instead, and the folder’s left as it was', async () => {
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'model', folderId: ids.sales, path: PATH, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const saved = await as(
      'writer',
      publishIn(copied.json<{ folderId: string }>().folderId, MEASURED),
    );
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await salesFile())?.content).toBe(cube(CUBE));
  });
});

describe('with sign-in off, by the single user too (T451’s switch; AC-254, R52)', () => {
  it('isn’t published in place, in a folder or the root', async () => {
    for (const folderId of [ids.sales, 'root']) {
      const answer = await solo.inject(publishIn(folderId, MEASURED));
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json<{ code: string }>().code).toBe('shared_in_place');
    }
    expect((await salesFile())?.content).toBe(cube(CUBE));
  });

  it('is copied into their workspace, changed there through its overlay, and previewed through it', async () => {
    const copied = await solo.inject({
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'model', folderId: ids.sales, path: PATH, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    ids.soloProject = copied.json<{ folderId: string }>().folderId;
    const saved = await solo.inject(publishIn(ids.soloProject, MEASURED));
    expect(saved.statusCode, saved.body).toBe(200);
    // In xcube, the single user's workspace's overlay holds it.
    const overlay = stub.overlay(MODEL, workspaceOverlayIdOf('mine'));
    expect(overlay?.upserts.map(({ folderId, name, yaml }) => ({ folderId, name, yaml }))).toEqual([
      { folderId: 'fsales', name: CUBE, yaml: MEASURED },
    ]);

    // A chart of theirs drawn on its new measure names that overlay.
    const chart = await solo.inject({
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Margin ${MARK}`,
        folderId: ids.soloProject,
        targetFolderId: ids.sales,
      },
    });
    expect(chart.statusCode, chart.body).toBe(201);
    ids.soloChart = chart.json<{ id: string }>().id;
    asked.length = 0;
    const load = await solo.inject({
      method: 'POST',
      url: '/api/load',
      payload: {
        query: { measures: [`fsales__${CUBE}.margin`] },
        for: { kind: 'chart', id: ids.soloChart },
      },
    });
    expect(load.statusCode, load.body).toBe(200);
    expect(asked.at(-1)?.claims['wechartOverlay']).toBe(workspaceOverlayIdOf('mine'));
    // The folder's own is as it was until a proposal lands it.
    expect((await salesFile())?.content).toBe(cube(CUBE));
  });

  /**
   * AC-249 in My workspace, where Generate cubes adds now (T492, with T451's
   * switch): a generated cube is refused where the folder it goes to has its
   * name or its file's path, naming that, and nothing is saved; one the
   * folder hasn't is saved.
   */
  it('refuses a generated cube the folder it goes to has, by name or path, saving nothing', async () => {
    const generate = (path: string, name: string) =>
      solo.inject({
        method: 'POST',
        url: '/api/model/publish',
        payload: {
          folderId: 'mine',
          targetFolderId: ids.sales,
          files: [{ path, content: cube(name) }],
          create: [path],
        },
      });
    const mine = async () => (await files().inFolders(['mine'])).map((file) => file.path);
    // The copy the test before made, out of the workspace: its overlay holds a name once.
    const removed = await solo.inject({
      method: 'DELETE',
      url: `/api/model/files?folder=${ids.soloProject}&path=${encodeURIComponent(PATH)}`,
    });
    expect(removed.statusCode, removed.body).toBe(200);

    const byName = await generate(`cubes/${CUBE}_again.yml`, CUBE);
    expect(byName.statusCode, byName.body).toBe(422);
    expect(byName.json()).toEqual({
      errors: [
        {
          path: `cubes/${CUBE}_again.yml`,
          message: `\`${CUBE}\` is already a cube in ${PATH}.`,
        },
      ],
    });
    const byPath = await generate(PATH, `${CUBE}_other`);
    expect(byPath.statusCode, byPath.body).toBe(422);
    expect(byPath.json<{ errors: { message: string }[] }>().errors).toEqual([
      expect.objectContaining({ message: `${PATH} is already in the model store.` }),
    ]);
    expect(await mine()).not.toContain(`cubes/${CUBE}_again.yml`);
    expect(await mine()).not.toContain(PATH);
    expect((await salesFile())?.content).toBe(cube(CUBE));

    // One of a name and path the folder hasn't: saved, in My workspace.
    const fresh = await generate(`cubes/${CUBE}_fresh.yml`, `${CUBE}_fresh`);
    expect(fresh.statusCode, fresh.body).toBe(200);
    expect(await mine()).toContain(`cubes/${CUBE}_fresh.yml`);
  });
});
