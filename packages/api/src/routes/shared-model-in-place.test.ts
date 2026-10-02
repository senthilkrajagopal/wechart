import { randomUUID } from 'node:crypto';

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
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T451, AC-278's model half (`[R52]`): now a model lands through an
 * approval, a shared folder's model changes only that way with sign-in on,
 * as a dashboard, a chart or a data source does. Its content isn't
 * published in place, by a member or a Super-Admin: it is copied into My
 * workspace, changed there and proposed.
 *
 * Against the suite's database and the stub xcube.
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
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const ids = { sales: '' };

beforeAll(async () => {
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
  const stub = fakeXcube();
  const cubeApiUrl = 'http://127.0.0.1:1/cubejs-api';
  const admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
  app = buildServer({
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
    config: {
      cubeApiUrl,
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
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
  if (app !== undefined) await app.close();
  await removeProjectFolders();
  await getDb().deleteFrom('model_files').where('path', '=', PATH).execute();
  await docs().remove('folder', ids.sales);
  await closeDb();
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
    const saved = await as('writer', publishIn(copied.json<{ folderId: string }>().folderId, MEASURED));
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await salesFile())?.content).toBe(cube(CUBE));
  });
});
