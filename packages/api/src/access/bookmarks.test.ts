import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
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
 * T366, AC-292: WHEN a user saves a bookmark, THE SYSTEM SHALL keep it theirs,
 * listed on the dashboard for them alone.
 * `Fails when: another user sees a bookmark its owner hasn't shared.`
 *
 * Through the routes, signed in: a dashboard `writer` and `reader` may both
 * open, and a Super-Admin too, each saving and listing their own.
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

const STATE = { page: 'p1', filters: {}, marks: {} };

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
let dashboard = '';

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  const folder = await make('folder', { title: 'Bookmarks T366', folderId: 'root' });
  // writer's group writes here, reader's reads (infra/dex/test-users.json).
  await folderAccessStore(getDb()).set(folder, {
    readOnly: ['sales-ro'],
    readWrite: ['sales-rw'],
  });
  dashboard = await make('dashboard', { title: 'Bookmarked', folderId: folder });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // A dashboard's bookmarks go with it.
  await bookmarkStore(getDb()).removeFor(dashboard);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const save = (who: string, name: string, state: Record<string, unknown> = STATE) =>
  as(who, {
    method: 'POST',
    url: `/api/dashboards/${dashboard}/bookmarks`,
    payload: { name, state },
  });
const listed = async (who: string) => {
  const response = await as(who, { method: 'GET', url: `/api/dashboards/${dashboard}/bookmarks` });
  expect(response.statusCode, `${who} lists`).toBe(200);
  return response.json<{ bookmarks: { name: string; state: { page: string } }[] }>().bookmarks;
};

describe('each bookmark its saver’s own, signed in (T366, AC-292)', () => {
  it('lists a bookmark for the one who saved it, and for nobody else, Super-Admins included', async () => {
    expect((await save('writer', 'My view')).statusCode).toBe(201);

    expect((await listed('writer')).map((each) => each.name)).toEqual(['My view']);
    expect(await listed('reader')).toEqual([]);
    expect(await listed('super')).toEqual([]);
  });

  it('keeps names each owner’s: the same name saved by another is theirs, and changes nothing of the first', async () => {
    expect((await save('reader', 'My view', { ...STATE, page: 'p2' })).statusCode).toBe(201);

    expect((await listed('reader')).map((each) => [each.name, each.state.page])).toEqual([
      ['My view', 'p2'],
    ]);
    expect((await listed('writer')).map((each) => [each.name, each.state.page])).toEqual([
      ['My view', 'p1'],
    ]);
  });
});

/**
 * The migration: the bookmarks phase 1 saved named no owner, and were its one
 * user's, `admin`.
 */
describe('phase 1’s bookmarks (T366)', () => {
  it('are given to phase 1’s one user', async () => {
    const id = randomUUID();
    const dashboardId = `d-${randomUUID()}`;
    // As phase 1 saved them: no owner. And one saved since, whose owner stays.
    await docs().create({
      kind: 'bookmark',
      id,
      body: { dashboardId, title: 'Old', state: STATE },
    });
    made.push({ kind: 'bookmark', id });
    const owned = randomUUID();
    await docs().create({
      kind: 'bookmark',
      id: owned,
      body: { dashboardId, title: 'Since', state: STATE, owner: 'writer' },
    });
    made.push({ kind: 'bookmark', id: owned });

    const migration = createRequire(import.meta.url)(
      '../db/migrations/1758270000000_bookmark-owners.cjs',
    ) as { up: (pgm: { sql: (text: string) => void }) => void };
    const statements: string[] = [];
    migration.up({ sql: (text) => statements.push(text) });
    for (const statement of statements) await sql.raw(statement).execute(getDb());

    expect((await bookmarkStore(getDb()).list(dashboardId, 'admin')).map((b) => b.name)).toEqual([
      'Old',
    ]);
    expect((await bookmarkStore(getDb()).list(dashboardId, 'writer')).map((b) => b.name)).toEqual([
      'Since',
    ]);
  });
});
