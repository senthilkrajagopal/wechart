import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T541 (AC-388; R52, the user's answer: "No edits on something that was
 * submitted.. if it has to change revert the submission, make changes and
 * submit again"): while a workspace item waits in an open proposal, every
 * change to it is refused, saying it was submitted and that withdrawing the
 * proposal lets it be changed. Once withdrawn, it saves again.
 *
 * `writer` (`sales-rw`) proposes into /Sales.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
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
};

const MARK = `frz${randomUUID().slice(0, 8)}`;
const SUBMITTED = {
  error:
    'This was submitted for review, so it can’t be changed. Withdraw its proposal to change it, then propose it again.',
  code: 'submitted',
};
const sealed: SealedV1 = {
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let cookie = '';
let superCookie = '';
const ids = { sales: '', source: '', board: '', chart: '', copy: '' };
let app: FastifyInstance;

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie } });
const stored = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;

async function mine(kind: 'dashboard' | 'chart', title: string) {
  const answer = await as({
    method: 'POST',
    url: '/api/documents',
    payload: { kind, title: `${title} ${MARK}`, folderId: 'mine', targetFolderId: ids.sales },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind, id });
  return id;
}
async function propose(kind: string, id: string) {
  const answer = await as({ method: 'POST', url: '/api/proposals', payload: { kind, id } });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
}
const withdraw = async (proposalId: string) => {
  const answer = await as({
    method: 'POST',
    url: `/api/proposals/${proposalId}/reject`,
    payload: {},
  });
  expect(answer.statusCode, answer.body).toBe(200);
};

beforeAll(async () => {
  ids.sales = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      title: `Sales ${MARK}`,
      folderId: 'root',
      owner: 'admin',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    },
  });
  made.push({ kind: 'folder', id: ids.sales });
  ids.source = (
    await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed },
    })
  ).id;
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    connectionTests: connectionTestStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
  });
  cookie = await signIn(app, USERS['writer']!);
  superCookie = await signIn(app, USERS['super']!);
  ids.board = await mine('dashboard', 'Board');
  ids.chart = await mine('chart', 'Chart');
  const copied = await as({
    method: 'POST',
    url: `/api/data-sources/${ids.source}/copy`,
    payload: { timeZone: TEST_TIME_ZONE },
  });
  expect(copied.statusCode, copied.body).toBeLessThan(300);
  ids.copy = copied.json<{ id: string }>().id;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  if (ids.copy !== '') await sources().remove(ids.copy);
  if (ids.source !== '') await sources().remove(ids.source);
  await removeProjectFolders();
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

describe('a submitted item is frozen until its proposal is withdrawn (T541, AC-388)', () => {
  it('refuses every change to a dashboard waiting in an open proposal, then saves once withdrawn', async () => {
    const proposalId = await propose('dashboard', ids.board);
    const before = await stored('dashboard', ids.board);
    const changed = { ...before.body, title: `Changed ${MARK}` };
    const attempts = [
      as({
        method: 'PUT',
        url: `/api/documents/dashboard/${ids.board}`,
        payload: { body: changed, version: before.version },
      }),
      as({
        method: 'PUT',
        url: `/api/dashboards/${ids.board}`,
        payload: { dashboard: { body: changed, version: before.version }, charts: [] },
      }),
      as({
        method: 'PATCH',
        url: `/api/documents/dashboard/${ids.board}`,
        payload: { title: `Renamed ${MARK}` },
      }),
      as({
        method: 'POST',
        url: `/api/dashboards/${ids.board}/charts`,
        payload: { chartId: ids.chart },
      }),
    ];
    for (const answer of await Promise.all(attempts)) {
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual(SUBMITTED);
    }
    expect(await stored('dashboard', ids.board)).toEqual(before);

    await withdraw(proposalId);
    const saved = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.board}`,
      payload: { body: changed, version: before.version },
    });
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('refuses a chart’s change while it waits, then saves once withdrawn', async () => {
    const proposalId = await propose('chart', ids.chart);
    const before = await stored('chart', ids.chart);
    const changed = { ...before.body, title: `Changed ${MARK}` };
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/chart/${ids.chart}`,
      payload: { body: changed, version: before.version },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(SUBMITTED);
    await withdraw(proposalId);
    const saved = await as({
      method: 'PUT',
      url: `/api/documents/chart/${ids.chart}`,
      payload: { body: changed, version: before.version },
    });
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('freezes a dashboard’s own chart with it, and a reviewer’s rejection frees both', async () => {
    const board = await mine('dashboard', 'With own');
    const own = randomUUID();
    const before = await stored('dashboard', board);
    const made = await as({
      method: 'PUT',
      url: `/api/dashboards/${board}`,
      payload: {
        dashboard: {
          body: {
            ...before.body,
            pages: [
              { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: own }] },
            ],
          },
          version: before.version,
        },
        charts: [
          {
            id: own,
            body: { schemaVersion: 1, title: `Own ${MARK}`, localToDashboardId: board },
            version: 0,
          },
        ],
      },
    });
    expect(made.statusCode, made.body).toBe(200);
    const proposalId = await propose('dashboard', board);
    const chart = await stored('chart', own);
    const changed = { ...chart.body, title: `Changed ${MARK}` };
    const save = () =>
      as({
        method: 'PUT',
        url: `/api/documents/chart/${own}`,
        payload: { body: changed, version: chart.version },
      });
    const refused = await save();
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toEqual(SUBMITTED);

    // Decided by a reviewer, it is the author's to change again.
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposalId}/reject`,
      payload: { reason: `Not yet ${MARK}` },
      headers: { cookie: superCookie },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const saved = await save();
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('answers one who may not open a frozen item as for one that isn’t there, never “submitted”', async () => {
    const frozen = await mine('chart', 'Hidden frozen');
    await propose('chart', frozen);
    const chart = await stored('chart', frozen);
    // A Super-Admin sees no one else's workspace (AC-276).
    const direct = await app.inject({
      method: 'PUT',
      url: `/api/documents/chart/${frozen}`,
      payload: { body: chart.body, version: chart.version },
      headers: { cookie: superCookie },
    });
    expect(direct.statusCode, direct.body).toBe(404);
    // Nor through a dashboard of their own that names it.
    const theirs = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'dashboard',
        title: `Super's ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.sales,
      },
      headers: { cookie: superCookie },
    });
    expect(theirs.statusCode, theirs.body).toBe(201);
    const theirsId = theirs.json<{ id: string }>().id;
    made.push({ kind: 'dashboard', id: theirsId });
    const board = await stored('dashboard', theirsId);
    const named = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/${theirsId}`,
      payload: {
        dashboard: { body: board.body, version: board.version },
        charts: [{ id: frozen, body: chart.body, version: chart.version }],
      },
      headers: { cookie: superCookie },
    });
    expect(named.statusCode, named.body).toBe(404);
  });

  it('refuses a data source’s change while it waits, then saves once withdrawn', async () => {
    const proposalId = await propose('data-source', ids.copy);
    const answer = await as({
      method: 'PUT',
      url: `/api/data-sources/${ids.copy}`,
      payload: { description: `Changed ${MARK}` },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(SUBMITTED);
    expect((await sources().get(ids.copy))!.description).not.toBe(`Changed ${MARK}`);
    await withdraw(proposalId);
    const saved = await as({
      method: 'PUT',
      url: `/api/data-sources/${ids.copy}`,
      payload: { description: `Changed ${MARK}` },
    });
    expect(saved.statusCode, saved.body).toBe(200);
  });
});
