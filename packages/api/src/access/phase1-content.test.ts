import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { imageStore } from '../repos/images';
import { buildServer } from '../server';

/**
 * T328, AC-267: WHEN security is first enabled on a deployment holding phase-1
 * content, THE SYSTEM SHALL keep that content as the shared tree with no groups
 * set, visible only to Super-Admins until groups are assigned.
 *
 * Phase-1 content is shaped as phase 1 wrote it (`seed.ts`): folders at the
 * shared root holding dashboards and charts, with no `access` on any folder and
 * no root setting. Security is switched on over it as it stands, with no
 * migration: a folder without `access` reads as unset (`repos/folder-access.ts`).
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

/** A word no other test's titles carry, so search finds only this test's items. */
const MARK = `phaseone${randomUUID().slice(0, 8)}`;

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids = {
  finance: '',
  operations: '',
  dashboard: '',
  chart: '',
  localChart: '',
  otherDashboard: '',
  // Most of phase 1's content sits at the root itself (T328's review).
  rootDashboard: '',
  rootChart: '',
};
/** The root's groups, set aside so the root holds none, as in phase 1. */
let rootBefore: StoredDocument | null = null;

/** Written as phase 1 wrote documents: no `access` anywhere. */
async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  ids.finance = await make('folder', { title: `Finance ${MARK}`, folderId: 'root' });
  ids.operations = await make('folder', { title: `Operations ${MARK}`, folderId: 'root' });
  ids.dashboard = await make('dashboard', {
    title: `Finance dashboard ${MARK}`,
    folderId: ids.finance,
  });
  ids.chart = await make('chart', { title: `Finance chart ${MARK}`, folderId: ids.finance });
  ids.localChart = await make('chart', {
    title: `Finance dashboard's own chart ${MARK}`,
    folderId: ids.finance,
    localToDashboardId: ids.dashboard,
  });
  ids.otherDashboard = await make('dashboard', {
    title: `Operations dashboard ${MARK}`,
    folderId: ids.operations,
  });
  ids.rootDashboard = await make('dashboard', {
    title: `Root dashboard ${MARK}`,
    folderId: 'root',
  });
  ids.rootChart = await make('chart', { title: `Root chart ${MARK}`, folderId: 'root' });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
    images: imageStore(getDb()),
  });
  for (const who of ['super', 'writer', 'reader', 'nobody'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  // Built last in beforeAll: cleaned up even if that stopped short.
  if (app !== undefined) await app.close();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const folderIds = async (who: string) =>
  (await as(who, { method: 'GET', url: '/api/folders' })).json<{ id: string }[]>().map((f) => f.id);
const rootIds = async (who: string) =>
  (await as(who, { method: 'GET', url: '/api/folders/root/contents' }))
    .json<{ id: string }[]>()
    .map((row) => row.id);
const open = (who: string, kind: string, id: string) =>
  as(who, { method: 'GET', url: `/api/documents/${kind}/${id}` });
const found = async (who: string) => {
  const response = await as(who, { method: 'GET', url: `/api/search?q=${MARK}` });
  expect(response.statusCode, `${who} searches`).toBe(200);
  return response.json<{ id: string }[]>().map((hit) => hit.id);
};

describe('phase 1’s content with security first on, and no groups set (T328, AC-267)', () => {
  it('shows a Super-Admin all of it, where it was', async () => {
    const folders = await folderIds('super');
    expect(folders).toEqual(expect.arrayContaining([ids.finance, ids.operations]));
    expect(await rootIds('super')).toEqual(expect.arrayContaining([ids.finance, ids.operations]));
    expect(await rootIds('super')).toEqual(
      expect.arrayContaining([ids.rootDashboard, ids.rootChart]),
    );
    for (const [kind, id] of [
      ['dashboard', ids.dashboard],
      ['chart', ids.chart],
      ['chart', ids.localChart],
      ['dashboard', ids.rootDashboard],
      ['chart', ids.rootChart],
    ] as const) {
      expect((await open('super', kind, id)).statusCode, `${kind} ${id}`).toBe(200);
    }
    expect(await found('super')).toEqual(
      expect.arrayContaining([
        ids.dashboard,
        ids.chart,
        ids.otherDashboard,
        ids.rootDashboard,
        ids.rootChart,
      ]),
    );
  });

  it('shows nobody else any of it: not listed, not opened, not found', async () => {
    for (const who of ['writer', 'reader', 'nobody']) {
      const listed = await folderIds(who);
      const atRoot = await rootIds(who);
      for (const id of [ids.finance, ids.operations]) {
        expect(listed, `${who} lists ${id}`).not.toContain(id);
      }
      // Nothing at the root at all: no grant anywhere reaches it.
      expect(atRoot, `${who} sees the root's contents`).toEqual([]);
      const roots = await as(who, { method: 'GET', url: '/api/folder-roots' });
      expect(roots.json(), `${who}'s root counts`).toEqual({ root: 0, mine: 0 });
      for (const [kind, id] of [
        ['folder', ids.finance],
        ['dashboard', ids.dashboard],
        ['chart', ids.chart],
        ['chart', ids.localChart],
        ['dashboard', ids.rootDashboard],
        ['chart', ids.rootChart],
      ] as const) {
        expect((await open(who, kind, id)).statusCode, `${who} opens ${kind} ${id}`).toBe(404);
      }
      expect(await found(who), `${who} finds`).toEqual([]);
    }
  });

  /**
   * What reaches up from Finance to the root's own items follows R12 (a grant
   * shows its folder's ancestors): asked of the user, not asserted here.
   */
  it('shows Finance to a group’s members once a Super-Admin assigns it, and nothing of Operations', async () => {
    const set = await as('super', {
      method: 'PUT',
      url: `/api/folders/${ids.finance}/access`,
      payload: { readOnly: ['sales-ro'], readWrite: null },
    });
    expect(set.statusCode).toBe(200);

    expect(await folderIds('reader')).toContain(ids.finance);
    expect((await open('reader', 'dashboard', ids.dashboard)).statusCode).toBe(200);
    const readerFinds = await found('reader');
    expect(readerFinds).toContain(ids.dashboard);
    expect(readerFinds).not.toContain(ids.otherDashboard);
    // Nothing of Operations, still unassigned, and nothing for the others.
    expect(await folderIds('reader')).not.toContain(ids.operations);
    expect((await open('reader', 'dashboard', ids.otherDashboard)).statusCode).toBe(404);
    for (const who of ['writer', 'nobody']) {
      expect(await folderIds(who), who).not.toContain(ids.finance);
      expect((await open(who, 'dashboard', ids.dashboard)).statusCode, who).toBe(404);
    }
  });
});
