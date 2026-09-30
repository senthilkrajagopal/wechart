import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * R48 (F39): an item is deleted only when nothing depends on it, and then
 * with what is part of it.
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it.
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

const MARK = `del${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const bookmarks = () => bookmarkStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '' };
let app: FastifyInstance;

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
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarks(),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // Bookmarks on dashboards a test left standing.
  for (const { kind, id } of made) if (kind === 'dashboard') await bookmarks().removeFor(id);
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A dashboard in /Sales with one chart of its own, and a bookmark on it. */
async function boardWithOwnChart(title: string) {
  const board = randomUUID();
  const own = await doc('chart', {
    schemaVersion: 1,
    title: `Own of ${title}`,
    localToDashboardId: board,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  await doc(
    'dashboard',
    {
      schemaVersion: 1,
      title,
      folderId: ids.sales,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: own }] }],
      charts: [own],
    },
    board,
  );
  await bookmarks().save({ dashboardId: board, name: `Q3 ${MARK}`, state: {}, owner: 'someone' });
  return { board, own };
}

describe('deleting a dashboard (T518, AC-363)', () => {
  it('removes it with its own charts and its bookmarks', async () => {
    const { board, own } = await boardWithOwnChart(`Revenue ${MARK}`);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(204);
    expect(await docs().get('dashboard', board)).toBeNull();
    expect(await docs().get('chart', own)).toBeNull();
    const kept = await getDb()
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'bookmark')
      .where(({ eb, ref }) => eb(ref('body', '->>').key('dashboardId'), '=', board))
      .execute();
    expect(kept).toEqual([]);
  });

  it('removes nothing for a reader, who may not change it', async () => {
    const { board, own } = await boardWithOwnChart(`Margin ${MARK}`);
    const answer = await as('reader', {
      method: 'DELETE',
      url: `/api/documents/dashboard/${board}`,
    });
    expect(answer.statusCode, answer.body).toBe(403);
    expect((await docs().get('dashboard', board))?.id).toBe(board);
    expect((await docs().get('chart', own))?.id).toBe(own);
    expect((await bookmarks().list(board, 'someone')).map((each) => each.name)).toEqual([
      `Q3 ${MARK}`,
    ]);
  });

  it('never has another dashboard show its own chart, which goes with it (T518’s review)', async () => {
    const { own } = await boardWithOwnChart(`Pipeline ${MARK}`);
    const other = await doc('dashboard', {
      schemaVersion: 1,
      title: `Other ${MARK}`,
      folderId: ids.sales,
      pages: [],
    });
    const answer = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${other}/charts`,
      payload: { chartId: own },
    });
    expect(answer.statusCode, answer.body).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'This chart is its dashboard’s own: save it to folders to show it on another.',
    );
    expect((await docs().get('dashboard', other))?.body['pages']).toEqual([]);
  });
});
