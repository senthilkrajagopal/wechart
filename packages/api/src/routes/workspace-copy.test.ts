import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T344 (AC-278, AC-279): "Edit in my workspace" copies a shared dashboard
 * into the user's workspace with its local charts and the library charts it
 * shows, each copy pointing at the others and naming its origin, and targets
 * the origin's folder. A second copy opens the first. The original is never
 * changed, and no model or data source comes with it (T346, T347 make theirs).
 *
 * `writer` (group `sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it
 * and has no workspace (AC-277); /Hidden is `managers`' alone.
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

const MARK = `copy${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;
const ids = { sales: '', hidden: '', board: '', local: '', library: '', hiddenBoard: '' };

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
  ids.hidden = await doc('folder', {
    title: `Hidden ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['managers'] },
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
            {
              id: 's1',
              kind: 'section',
              items: [{ id: 't2', kind: 'chart', chartId: ids.local }],
            },
          ],
        },
      ],
      charts: [ids.local],
    },
    ids.board,
  );
  ids.hiddenBoard = await doc('dashboard', {
    schemaVersion: 1,
    title: `Hidden board ${MARK}`,
    folderId: ids.hidden,
    pages: [],
  });

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // The copies, made in writer's workspace by the route.
  const copies = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .execute();
  for (const { kind, id } of copies) await docs().remove(kind as DocumentKind, id);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const copy = (who: string, kind: string, id: string) =>
  as(who, { method: 'POST', url: '/api/workspace/copies', payload: { kind, id } });
const chartIdsIn = (body: unknown): string[] => {
  const found: string[] = [];
  const read = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(read);
    else if (value !== null && typeof value === 'object')
      for (const [key, each] of Object.entries(value)) {
        if (key === 'chartId' && typeof each === 'string') found.push(each);
        else read(each);
      }
  };
  read(body);
  return found;
};

describe('Edit in my workspace (T344, AC-278, AC-279)', () => {
  it('copies a dashboard with its local and library charts, each pointing at the copies and naming its origin', async () => {
    const original = (await docs().get('dashboard', ids.board))!;
    const answer = await copy('writer', 'dashboard', ids.board);
    expect(answer.statusCode, answer.body).toBe(201);
    const { id, created } = answer.json<{ id: string; created: boolean }>();
    expect(created).toBe(true);
    expect(id).not.toBe(ids.board);

    const board = (await docs().get('dashboard', id))!;
    expect(board.body['folderId']).toMatch(/^ws:/);
    expect(board.body['targetFolderId']).toBe(ids.sales);
    expect(board.body['origin']).toEqual({
      kind: 'dashboard',
      id: ids.board,
      version: original.version,
      folderId: ids.sales,
    });
    expect(board.body['title']).toBe(`Revenue ${MARK}`);

    // Its tiles show the copies, never the originals; the structure is kept.
    const [libraryCopy, localCopy] = chartIdsIn(board.body['pages']);
    expect([libraryCopy, localCopy]).not.toContain(ids.library);
    expect([libraryCopy, localCopy]).not.toContain(ids.local);
    expect(board.body['charts']).toEqual([localCopy]);

    const library = (await docs().get('chart', libraryCopy!))!;
    expect(library.body['folderId']).toBe(board.body['folderId']);
    expect(library.body['targetFolderId']).toBe(ids.sales);
    expect(library.body['origin']).toMatchObject({ kind: 'chart', id: ids.library });
    expect(library.body['chart']).toEqual({
      source: { cube: 'orders' },
      wells: { measures: ['orders.count'] },
    });

    const local = (await docs().get('chart', localCopy!))!;
    expect(local.body['localToDashboardId']).toBe(id);
    expect(local.body['origin']).toMatchObject({ kind: 'chart', id: ids.local });

    // The originals are untouched.
    expect((await docs().get('dashboard', ids.board))!.version).toBe(original.version);
    expect((await docs().get('chart', ids.local))!.body['localToDashboardId']).toBe(ids.board);
  });

  it('opens the copy already there, rather than making a second', async () => {
    const first = await copy('writer', 'dashboard', ids.board);
    const again = await copy('writer', 'dashboard', ids.board);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({
      kind: 'dashboard',
      id: first.json<{ id: string }>().id,
      created: false,
    });
  });

  it('copies a library chart alone, into the workspace, naming its origin and its folder as target', async () => {
    const lone = await doc('chart', {
      schemaVersion: 1,
      title: `Lone ${MARK}`,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const answer = await copy('writer', 'chart', lone);
    expect(answer.statusCode, answer.body).toBe(201);
    const chart = (await docs().get('chart', answer.json<{ id: string }>().id))!;
    expect(chart.body['folderId']).toMatch(/^ws:/);
    expect(chart.body['targetFolderId']).toBe(ids.sales);
    expect(chart.body['origin']).toMatchObject({
      kind: 'chart',
      id: lone,
      folderId: ids.sales,
    });

    // The dashboard's library chart was copied with it: that copy opens.
    const board = (await copy('writer', 'dashboard', ids.board)).json<{ id: string }>().id;
    const boardsCopy = chartIdsIn((await docs().get('dashboard', board))!.body['pages'])[0];
    const library = await copy('writer', 'chart', ids.library);
    expect(library.statusCode).toBe(200);
    expect(library.json()).toEqual({ kind: 'chart', id: boardsCopy, created: false });
  });

  it('copies only what the user may propose back: never for a user with no workspace, a folder they only read, or one they can’t see', async () => {
    // reader reads /Sales, and has no workspace (AC-277).
    expect((await copy('reader', 'dashboard', ids.board)).statusCode).toBe(403);
    expect((await copy('writer', 'dashboard', ids.hiddenBoard)).statusCode).toBe(404);
    expect((await copy('writer', 'dashboard', randomUUID())).statusCode).toBe(404);
    // A local chart goes with its dashboard, never alone.
    expect((await copy('writer', 'chart', ids.local)).statusCode).toBe(400);
    // What is already in the workspace is edited there.
    const first = await copy('writer', 'dashboard', ids.board);
    expect((await copy('writer', 'dashboard', first.json<{ id: string }>().id)).statusCode).toBe(
      400,
    );
  });
});

/** T344's review: what a dashboard shows, beyond its own local and library charts. */
describe('the charts a copied dashboard shows (T344’s review, AC-279)', () => {
  const extra = { readOnly: '', otherBoard: '', otherLocal: '' };
  /** A dashboard in `folderId` whose one tile shows `chartId`. */
  const showing = (title: string, folderId: string, chartId: string) =>
    doc('dashboard', {
      schemaVersion: 1,
      title: `${title} ${MARK}`,
      folderId,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId }] }],
    });
  const chart = (title: string, body: Record<string, unknown>) =>
    doc('chart', {
      schemaVersion: 1,
      title: `${title} ${MARK}`,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
      ...body,
    });
  const own = async () => {
    const board = (await copy('writer', 'dashboard', ids.board)).json<{ id: string }>().id;
    return String((await docs().get('dashboard', board))!.body['folderId']);
  };
  const copiesOf = (originId: string) => docs().withOrigin('chart', originId);

  beforeAll(async () => {
    extra.readOnly = await doc('folder', {
      title: `Read only ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-rw'], readWrite: ['managers'] },
    });
    extra.otherBoard = randomUUID();
    extra.otherLocal = await chart('Other local', { localToDashboardId: extra.otherBoard });
    await doc(
      'dashboard',
      { schemaVersion: 1, title: `Other ${MARK}`, folderId: ids.sales, pages: [] },
      extra.otherBoard,
    );
  });

  it('makes another dashboard’s local chart the copy’s own local chart, never one still governed by that dashboard', async () => {
    const board = await showing('Cross', ids.sales, extra.otherLocal);
    const made = (await copy('writer', 'dashboard', board)).json<{ id: string }>().id;
    const [shown] = chartIdsIn((await docs().get('dashboard', made))!.body['pages']);
    expect(shown).not.toBe(extra.otherLocal);
    const copied = (await docs().get('chart', shown!))!;
    expect(copied.body['localToDashboardId']).toBe(made);
    expect(copied.body).not.toHaveProperty('folderId');
    expect(copied.body['origin']).toMatchObject({ kind: 'chart', id: extra.otherLocal });
  });

  it('makes a library chart from a folder its copier can’t write the copy’s own local chart, naming no folder it can’t see', async () => {
    const readOnlyChart = await chart('Read-only library', { folderId: extra.readOnly });
    const hiddenChart = await chart('Hidden library', { folderId: ids.hidden });
    for (const [library, folderSeen] of [
      [readOnlyChart, true],
      [hiddenChart, false],
    ] as const) {
      const board = await showing('Borrowing', ids.sales, library);
      const made = (await copy('writer', 'dashboard', board)).json<{ id: string }>().id;
      const [shown] = chartIdsIn((await docs().get('dashboard', made))!.body['pages']);
      const copied = (await docs().get('chart', shown!))!;
      expect(copied.body['localToDashboardId']).toBe(made);
      expect(copied.body).not.toHaveProperty('targetFolderId');
      expect(copied.body).not.toHaveProperty('folderId');
      const origin = copied.body['origin'] as Record<string, unknown>;
      expect(origin['id']).toBe(library);
      expect('folderId' in origin).toBe(folderSeen);
    }
  });

  it('refuses a dashboard that shows a chart its copier can’t open, copying nothing (AC-276)', async () => {
    const workspaceChart = await chart('Phase one draft', { folderId: 'mine' });
    const board = await showing('Showing a draft', ids.sales, workspaceChart);
    const refused = await copy('writer', 'dashboard', board);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      error: 'It shows a chart you can’t open, so it can’t be copied into your workspace.',
    });
    expect(await docs().withOrigin('dashboard', board)).toEqual([]);
  });

  it('refuses a dashboard that shows a chart this version can’t read, rather than showing the original', async () => {
    // Stored as a newer wechart would: the store itself won't write one.
    const unreadable = randomUUID();
    made.push({ kind: 'chart', id: unreadable });
    await getDb()
      .insertInto('documents')
      .values({
        kind: 'chart',
        id: unreadable,
        body: JSON.stringify({
          schemaVersion: 999,
          title: `From the future ${MARK}`,
          folderId: ids.sales,
          owner: 'admin',
        }),
      })
      .execute();
    const board = await showing('Showing the future', ids.sales, unreadable);
    expect((await copy('writer', 'dashboard', board)).statusCode).toBe(422);
    expect(await docs().withOrigin('dashboard', board)).toEqual([]);
  });

  it('shows the copier’s copy of a library chart already there, making no second', async () => {
    const lone = await chart('Reused', { folderId: ids.sales });
    const first = (await copy('writer', 'chart', lone)).json<{ id: string }>().id;
    const board = await showing('Reusing', ids.sales, lone);
    const made = (await copy('writer', 'dashboard', board)).json<{ id: string }>().id;
    expect(chartIdsIn((await docs().get('dashboard', made))!.body['pages'])).toEqual([first]);
    expect((await copiesOf(lone)).map((each) => each.id)).toEqual([first]);
    // The library original is untouched.
    expect((await docs().get('chart', lone))!.version).toBe(1);
  });

  it('copies nothing from a folder its copier only reads', async () => {
    const board = await showing('Read-only board', extra.readOnly, ids.library);
    const refused = await copy('writer', 'dashboard', board);
    expect(refused.statusCode).toBe(403);
    expect(await docs().withOrigin('dashboard', board)).toEqual([]);
  });

  it('keeps a copy’s origin as stored through a save, as its target is', async () => {
    const made = (await copy('writer', 'dashboard', ids.board)).json<{ id: string }>().id;
    const stored = (await docs().get('dashboard', made))!;
    const { origin: _origin, ...rest } = stored.body;
    void _origin;
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${made}`,
      payload: { body: { ...rest, folderId: 'mine' }, version: stored.version },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('dashboard', made))!.body['origin']).toEqual(stored.body['origin']);
    expect(await own()).toMatch(/^ws:/);
  });
});
