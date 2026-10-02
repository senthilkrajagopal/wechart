import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T502 (AC-278): with sign-in on, a shared folder's dashboard, chart or data
 * source is never changed in place, by anyone, a Super-Admin too: its content
 * changes through a copy in the workspace, proposed and approved. A `PUT` of
 * content answers `409`, "Edit in my workspace", and changes nothing. The
 * same in a workspace saves. Moving and renaming are as they were, and so are
 * a folder's settings. With sign-in off too, since R52 (T359, AC-254).
 *
 * `writer` (`sales-rw`) and `super` write /Sales.
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...base,
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

const MARK = `sip${randomUUID().slice(0, 8)}`;
const REFUSED = (noun: string) => ({
  error: `This ${noun} is shared: it changes only through a proposal. Choose Edit in my workspace, change your copy there, and propose it.`,
  code: 'shared_in_place',
});
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = {
  sales: '',
  also: '',
  board: '',
  local: '',
  library: '',
  source: '',
  mine: '',
  copy: '',
};
let app: FastifyInstance;
let open: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  // Another shared folder writer writes, to move into.
  ids.also = await doc('folder', {
    title: `Also ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.board = randomUUID();
  ids.library = await doc('chart', {
    schemaVersion: 1,
    title: `Library ${MARK}`,
    folderId: ids.sales,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  ids.local = await doc('chart', {
    schemaVersion: 1,
    title: `Local ${MARK}`,
    localToDashboardId: ids.board,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.total'] } },
  });
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title: `Revenue ${MARK}`,
      folderId: ids.sales,
      pages: [
        {
          id: 'p1',
          items: [
            { id: 't1', kind: 'chart', chartId: ids.library },
            { id: 't2', kind: 'chart', chartId: ids.local },
          ],
        },
      ],
      charts: [ids.local],
    },
    ids.board,
  );
  ids.source = (
    await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('sales') },
    })
  ).id;

  const wiring = {
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
  };
  app = buildServer({ config: secured, ...wiring });
  open = buildServer({ config: base, ...wiring });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);

  // writer's own dashboard, in their workspace, to go to /Sales.
  const mine = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'dashboard',
      title: `Mine ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.sales,
    },
  });
  ids.mine = mine.json<{ id: string }>().id;
  made.push({ kind: 'dashboard', id: ids.mine });
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (open !== undefined) await open.close();
  if (ids.copy !== '') await sources().remove(ids.copy);
  await removeProjectFolders();
  if (ids.source !== '') await sources().remove(ids.source);
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const stored = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;
const put = (
  who: string,
  kind: DocumentKind,
  id: string,
  body: Record<string, unknown>,
  version: number,
) => as(who, { method: 'PUT', url: `/api/documents/${kind}/${id}`, payload: { body, version } });

describe('a shared item is never changed in place (T502, AC-278)', () => {
  it('refuses a shared dashboard’s content, a Super-Admin’s too, and leaves it as it was', async () => {
    const before = await stored('dashboard', ids.board);
    for (const who of ['writer', 'super']) {
      const answer = await put(
        who,
        'dashboard',
        ids.board,
        { ...before.body, pages: [{ id: 'p1', title: `Changed ${MARK}`, items: [] }] },
        before.version,
      );
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual(REFUSED('dashboard'));
    }
    expect(await stored('dashboard', ids.board)).toEqual(before);
  });

  it('refuses a shared library chart’s content, and a shared dashboard’s own chart’s', async () => {
    for (const id of [ids.library, ids.local]) {
      const before = await stored('chart', id);
      const answer = await put(
        'writer',
        'chart',
        id,
        {
          ...before.body,
          title: before.body['title'],
          chart: { source: { cube: 'orders' }, wells: { measures: ['orders.avg'] } },
        },
        before.version,
      );
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual(REFUSED('chart'));
      expect(await stored('chart', id)).toEqual(before);
    }
  });

  it('refuses saving a shared dashboard with its charts', async () => {
    const board = await stored('dashboard', ids.board);
    const local = await stored('chart', ids.local);
    const answer = await as('writer', {
      method: 'PUT',
      url: `/api/dashboards/${ids.board}`,
      payload: {
        dashboard: { body: { ...board.body, title: `Renamed ${MARK}` }, version: board.version },
        charts: [
          {
            id: ids.local,
            body: { ...local.body, title: `Edited ${MARK}` },
            version: local.version,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(REFUSED('dashboard'));
    expect([await stored('dashboard', ids.board), await stored('chart', ids.local)]).toEqual([
      board,
      local,
    ]);
  });

  it('refuses a shared library chart saved with a workspace dashboard that shows it', async () => {
    const attached = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${ids.mine}/charts`,
      payload: { chartId: ids.library },
    });
    expect(attached.statusCode, attached.body).toBe(204);
    const mine = await stored('dashboard', ids.mine);
    const library = await stored('chart', ids.library);
    const answer = await as('writer', {
      method: 'PUT',
      url: `/api/dashboards/${ids.mine}`,
      payload: {
        dashboard: { body: mine.body, version: mine.version },
        charts: [
          {
            id: ids.library,
            body: { ...library.body, title: `Edited ${MARK}` },
            version: library.version,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(REFUSED('chart'));
    expect(await stored('chart', ids.library)).toEqual(library);
  });

  it('refuses adding a chart to a shared dashboard', async () => {
    const before = await stored('dashboard', ids.board);
    const other = await doc('chart', {
      schemaVersion: 1,
      title: `Other ${MARK}`,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const answer = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${ids.board}/charts`,
      payload: { chartId: other },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(REFUSED('dashboard'));
    expect(await stored('dashboard', ids.board)).toEqual(before);
  });

  it('refuses a shared data source’s settings and description, and leaves them as they were', async () => {
    const before = (await sources().get(ids.source))!;
    for (const change of [
      { fields: { ...before.fields, host: 'elsewhere-db' } },
      { driver: 'mysql' },
      { authMethod: 'iam' },
      { sealed: { password: sealed('new') } },
      { description: `For ${MARK}` },
    ]) {
      const answer = await as('writer', {
        method: 'PUT',
        url: `/api/data-sources/${ids.source}`,
        payload: change,
      });
      expect(answer.statusCode, answer.body).toBe(409);
      expect(answer.json()).toEqual(REFUSED('data source'));
    }
    expect(await sources().get(ids.source)).toEqual(before);
  });

  it('saves the same in a workspace: a dashboard, and a copied data source', async () => {
    const mine = await stored('dashboard', ids.mine);
    const saved = await put(
      'writer',
      'dashboard',
      ids.mine,
      { ...mine.body, pages: [{ id: 'p1', title: `Mine changed ${MARK}`, items: [] }] },
      mine.version,
    );
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await stored('dashboard', ids.mine)).body['pages']).toEqual([
      { id: 'p1', title: `Mine changed ${MARK}`, items: [] },
    ]);

    // With a chart made on it in the same save, as the editor saves a new
    // one: shown on it though it isn't stored until this save.
    const board = await stored('dashboard', ids.mine);
    const madeHere = randomUUID();
    made.push({ kind: 'chart', id: madeHere });
    const withChart = await as('writer', {
      method: 'PUT',
      url: `/api/dashboards/${ids.mine}`,
      payload: {
        dashboard: {
          body: {
            ...board.body,
            pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: madeHere }] }],
          },
          version: board.version,
        },
        charts: [
          {
            id: madeHere,
            body: {
              schemaVersion: 1,
              title: `Made here ${MARK}`,
              localToDashboardId: ids.mine,
              chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
            },
            version: 0,
          },
        ],
      },
    });
    expect(withChart.statusCode, withChart.body).toBe(200);
    expect((await stored('chart', madeHere)).body['localToDashboardId']).toBe(ids.mine);

    const copied = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${ids.source}/copy`,
      payload: { timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    ids.copy = copied.json<{ id: string }>().id;
    const described = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${ids.copy}`,
      payload: { description: `Mine ${MARK}` },
    });
    expect(described.statusCode, described.body).toBe(200);
    expect((await sources().get(ids.copy))?.description).toBe(`Mine ${MARK}`);
  });

  it('refuses a chart made into a shared folder, or moved there, by a workspace dashboard’s save (T502’s review)', async () => {
    const mine = await stored('dashboard', ids.mine);
    const smuggled = randomUUID();
    const answer = await as('writer', {
      method: 'PUT',
      url: `/api/dashboards/${ids.mine}`,
      payload: {
        dashboard: {
          body: {
            ...mine.body,
            pages: [{ id: 'p1', items: [{ id: 't9', kind: 'chart', chartId: smuggled }] }],
          },
          version: mine.version,
        },
        charts: [
          {
            id: smuggled,
            body: {
              schemaVersion: 1,
              title: `Smuggled ${MARK}`,
              folderId: ids.sales,
              chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
            },
            version: 0,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(await docs().get('chart', smuggled)).toBeNull();
    expect(await stored('dashboard', ids.mine)).toEqual(mine);
  });

  it('refuses deleting a shared dashboard’s own chart, part of it (T502’s review)', async () => {
    const before = await stored('chart', ids.local);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/chart/${ids.local}`,
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json()).toEqual(REFUSED('dashboard'));
    expect(await stored('chart', ids.local)).toEqual(before);
  });

  it('still moves and renames a shared item, and saves a folder’s settings', async () => {
    const moved = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.board}`,
      payload: { folderId: ids.also },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect((await stored('dashboard', ids.board)).body['folderId']).toBe(ids.also);
    const back = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.board}`,
      payload: { folderId: ids.sales },
    });
    expect(back.statusCode, back.body).toBe(200);

    const renamed = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/dashboard/${ids.board}`,
      payload: { title: `Revenue renamed ${MARK}` },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect((await stored('dashboard', ids.board)).body['title']).toBe(`Revenue renamed ${MARK}`);

    // A PUT that only renames it is a rename.
    const board = await stored('dashboard', ids.board);
    const retitled = await put(
      'writer',
      'dashboard',
      ids.board,
      { ...board.body, title: `Revenue ${MARK}` },
      board.version,
    );
    expect(retitled.statusCode, retitled.body).toBe(200);
    expect((await stored('dashboard', ids.board)).body['title']).toBe(`Revenue ${MARK}`);

    const source = (await sources().get(ids.source))!;
    const sourceRenamed = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${ids.source}`,
      payload: { name: `store_${MARK}` },
    });
    expect(sourceRenamed.statusCode, sourceRenamed.body).toBe(200);
    expect((await sources().get(ids.source))?.name).toBe(`store_${MARK}`);
    expect((await sources().get(ids.source))?.fields).toEqual(source.fields);

    const folder = await stored('folder', ids.sales);
    const settled = await put(
      'super',
      'folder',
      ids.sales,
      { ...folder.body, title: `Sales settled ${MARK}` },
      folder.version,
    );
    expect(settled.statusCode, settled.body).toBe(200);
  });

  /**
   * With sign-in off too, since R52 ("Workspace-only now"): the single user
   * changes a shared item through My workspace and a proposal they approve
   * themselves (T359, AC-254). It was saved in place until then.
   */
  it('refuses it with sign-in off too: the single user changes it in My workspace', async () => {
    const before = await stored('dashboard', ids.board);
    const answer = await open.inject({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.board}`,
      payload: {
        body: { ...before.body, pages: [{ id: 'p1', title: `Open ${MARK}`, items: [] }] },
        version: before.version,
      },
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ code: string }>().code).toBe('shared_in_place');
    expect(await stored('dashboard', ids.board)).toEqual(before);
  });
});
