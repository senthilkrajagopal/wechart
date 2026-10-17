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

let folder = '';

beforeAll(async () => {
  folder = await make('folder', { title: 'Bookmarks T366', folderId: 'root' });
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
  // `manager` and `nobody` may not open the dashboard (T367).
  for (const who of ['super', 'writer', 'reader', 'manager', 'nobody'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  // A dashboard's bookmarks go with it.
  for (const { kind, id } of made)
    if (kind === 'dashboard') await bookmarkStore(getDb()).removeFor(id);
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
 * T367, AC-293: WHEN a user shares a bookmark, THE SYSTEM SHALL list it for
 * everyone who may see the dashboard, labelled with who shared it. Only its
 * owner SHALL be able to change or unshare it; only its owner or a
 * Super-Admin delete it (amended 2026-10-04, R61; T580, at the end).
 * `Fails when: someone who may see the dashboard doesn't see a shared
 * bookmark, someone other than its owner can change or unshare it, or
 * someone other than its owner or a Super-Admin can delete it.`
 *
 * Rule 81: Mine before Shared, newest first within each; a new one "Only me".
 * After the tests above, `writer` and `reader` each have "My view", unshared.
 * `writer` is Dex's "Wren Writer" (infra/dex/config.yaml).
 */
describe('shared bookmarks, signed in (T367, AC-293)', () => {
  interface Listed {
    id: string;
    dashboardId: string;
    name: string;
    state: Record<string, unknown>;
    shared: boolean;
    mine: boolean;
    /** Its owner's, or a Super-Admin's on another's shared one (T580). */
    mayDelete: boolean;
    sharedBy?: string;
    /** When it was first saved (T742), kept through every change. */
    savedAt: string;
  }
  const url = (id: string, on = dashboard) => `/api/dashboards/${on}/bookmarks/${id}`;
  const all = async (who: string): Promise<Listed[]> => {
    const response = await as(who, {
      method: 'GET',
      url: `/api/dashboards/${dashboard}/bookmarks`,
    });
    expect(response.statusCode, `${who} lists`).toBe(200);
    return response.json<{ bookmarks: Listed[] }>().bookmarks;
  };
  const named = (listed: readonly Listed[]) => listed.map((each) => [each.name, each.mine]);
  const own = async (who: string, name: string) => {
    const found = (await all(who)).find((each) => each.name === name && each.mine);
    expect(found?.name, `${who}'s ${name}`).toBe(name);
    return found!;
  };
  const change = (who: string, id: string, payload: Record<string, unknown>, on = dashboard) =>
    as(who, { method: 'PATCH', url: url(id, on), payload });
  const remove = (who: string, id: string) => as(who, { method: 'DELETE', url: url(id) });
  const NOT_OWNER = { error: 'Only its owner can change a bookmark.' };
  const NO_SUCH = { error: 'No such bookmark.' };

  it('saves a new one as "Only me", whatever the save says', async () => {
    const saved = await as('writer', {
      method: 'POST',
      url: `/api/dashboards/${dashboard}/bookmarks`,
      payload: { name: 'Shared later', state: STATE, shared: true },
    });

    expect(saved.statusCode).toBe(201);
    const { id, savedAt } = saved.json<{ id: string; savedAt: string }>();
    expect(saved.json()).toEqual({
      id,
      dashboardId: dashboard,
      name: 'Shared later',
      state: STATE,
      shared: false,
      mine: true,
      mayDelete: true,
      savedAt,
    });
    // When it was saved, as a date (T742; design-10-Q2).
    expect(Number.isNaN(Date.parse(savedAt))).toBe(false);
    expect(named(await all('reader'))).toEqual([['My view', true]]);
  });

  it('shared by its owner, is listed for everyone who may open the dashboard, after their own, labelled with who shared it', async () => {
    const { id, savedAt } = await own('writer', 'Shared later');

    const shared = await change('writer', id, { shared: true });

    expect([shared.statusCode, shared.json()]).toEqual([
      200,
      {
        id,
        dashboardId: dashboard,
        name: 'Shared later',
        state: STATE,
        shared: true,
        mine: true,
        mayDelete: true,
        savedAt,
      },
    ]);
    const asOthers = {
      id,
      dashboardId: dashboard,
      name: 'Shared later',
      state: STATE,
      shared: true,
      mine: false,
      mayDelete: false,
      sharedBy: 'Wren Writer',
      savedAt,
    };
    const readers = await all('reader');
    expect(named(readers)).toEqual([
      ['My view', true],
      ['Shared later', false],
    ]);
    expect(readers[1]).toEqual(asOthers);
    // A Super-Admin may open every dashboard; not their own, so under Shared,
    // and theirs to delete (T580; AC-293, amended by R61).
    expect(await all('super')).toEqual([{ ...asOthers, mayDelete: true }]);
    // Its owner's still, under Mine, newest first.
    expect(named(await all('writer'))).toEqual([
      ['Shared later', true],
      ['My view', true],
    ]);
    // Nobody who may not open the dashboard: as a dashboard that isn't there.
    for (const who of ['manager', 'nobody'])
      expect(
        (await as(who, { method: 'GET', url: `/api/dashboards/${dashboard}/bookmarks` }))
          .statusCode,
        who,
      ).toBe(404);
  });

  it('lists each part newest first', async () => {
    expect((await save('writer', 'Shared second')).statusCode).toBe(201);
    const { id } = await own('writer', 'Shared second');
    expect((await change('writer', id, { shared: true })).statusCode).toBe(200);
    expect((await save('reader', 'Reader’s second')).statusCode).toBe(201);

    expect(named(await all('reader'))).toEqual([
      ['Reader’s second', true],
      ['My view', true],
      ['Shared second', false],
      ['Shared later', false],
    ]);
  });

  // A Super-Admin may delete it since R61 (T580, below), and change it no more than before.
  it('lets nobody but its owner change or unshare it, Super-Admins included, and no reader delete it', async () => {
    const { id } = await own('writer', 'Shared later');
    const before = (await all('reader')).find((each) => each.id === id);

    for (const who of ['reader', 'super']) {
      for (const payload of [
        { shared: false },
        { name: 'Taken over' },
        { state: { ...STATE, page: 'p9' } },
      ]) {
        const refused = await change(who, id, payload);
        expect([refused.statusCode, refused.json()], `${who} ${JSON.stringify(payload)}`).toEqual([
          403,
          NOT_OWNER,
        ]);
      }
      if (who === 'reader') {
        const deleting = await remove(who, id);
        expect([deleting.statusCode, deleting.json()], `${who} deleting`).toEqual([403, NOT_OWNER]);
      } else expect((await all(who)).find((each) => each.id === id)?.mayDelete, who).toBe(true);
    }
    // Those who may not open the dashboard are told it isn't there.
    for (const who of ['manager', 'nobody']) {
      expect((await change(who, id, { shared: false })).statusCode, who).toBe(404);
      expect((await remove(who, id)).statusCode, who).toBe(404);
    }

    expect((await all('reader')).find((each) => each.id === id)).toEqual(before);
    expect((await all('super')).find((each) => each.id === id)).toEqual({
      ...before,
      mayDelete: true,
    });
  });

  it('answers one another hasn’t shared, one that isn’t there, and one of another dashboard, as not there', async () => {
    const hidden = (await own('writer', 'My view')).id;
    for (const id of [hidden, randomUUID()]) {
      const refused = await change('reader', id, { shared: true });
      expect([refused.statusCode, refused.json()]).toEqual([404, NO_SUCH]);
      const deleting = await remove('reader', id);
      expect([deleting.statusCode, deleting.json()]).toEqual([404, NO_SUCH]);
    }
    // Its owner's own, asked through a dashboard it isn't of.
    const other = await make('dashboard', { title: 'Another', folderId: folder });
    const elsewhere = await change('writer', hidden, { name: 'Moved' }, other);
    expect([elsewhere.statusCode, elsewhere.json()]).toEqual([404, NO_SUCH]);
    expect((await own('writer', 'My view')).id).toBe(hidden);
  });

  it('lets its owner rename it, update it, stop sharing it and delete it', async () => {
    const { id, savedAt } = await own('writer', 'Shared second');

    const renamed = await change('writer', id, { name: '  Renamed  ' });
    expect([renamed.statusCode, renamed.json<Listed>().name]).toEqual([200, 'Renamed']);
    const updated = await change('writer', id, { state: { ...STATE, page: 'p7' } });
    expect([updated.statusCode, updated.json<Listed>().state]).toEqual([
      200,
      { ...STATE, page: 'p7' },
    ]);
    expect((await all('reader')).find((each) => each.id === id)).toEqual({
      id,
      dashboardId: dashboard,
      name: 'Renamed',
      state: { ...STATE, page: 'p7' },
      shared: true,
      mine: false,
      mayDelete: false,
      sharedBy: 'Wren Writer',
      savedAt,
    });

    const unshared = await change('writer', id, { shared: false });
    expect([unshared.statusCode, unshared.json<Listed>().shared]).toEqual([200, false]);
    expect((await all('reader')).map((each) => each.id)).not.toContain(id);
    expect((await own('writer', 'Renamed')).shared).toBe(false);

    const deleted = await remove('writer', id);
    expect(deleted.statusCode).toBe(204);
    expect((await all('writer')).map((each) => each.id)).not.toContain(id);
  });

  it('refuses a rename to a name its owner has there already, and a change that isn’t one', async () => {
    const { id } = await own('writer', 'Shared later');

    const taken = await change('writer', id, { name: 'My view' });
    expect([taken.statusCode, taken.json()]).toEqual([
      409,
      { error: 'You already have a bookmark of that name on this dashboard.' },
    ]);
    for (const [payload, error] of [
      [{}, 'Nothing to change: give a name, a state, or whether it is shared.'],
      [{ name: '   ' }, 'A bookmark needs a name.'],
      [{ shared: 'yes' }, 'Shared is true or false.'],
      [{ state: { page: 'p1' } }, 'A bookmark holds a page tab, filter values and marks.'],
    ] as const) {
      const refused = await change('writer', id, payload);
      expect([refused.statusCode, refused.json()], JSON.stringify(payload)).toEqual([
        400,
        { error },
      ]);
    }
    // Its own name again is no clash.
    expect((await change('writer', id, { name: 'Shared later' })).statusCode).toBe(200);
    expect((await own('writer', 'Shared later')).shared).toBe(true);
  });

  /**
   * T580 (AC-293, amended 2026-10-04 by R61): a Super-Admin may delete any
   * shared bookmark, and change none. One its owner can no longer reach is
   * removed so, and stays listed until then.
   */
  describe('a Super-Admin deleting another’s shared bookmark (T580)', () => {
    it('deletes a shared one, and is told it may; none unshared, and changes none', async () => {
      expect((await save('writer', 'For super')).statusCode).toBe(201);
      const { id } = await own('writer', 'For super');
      expect((await change('writer', id, { shared: true })).statusCode).toBe(200);
      const hidden = (await own('writer', 'My view')).id;

      // Told it may, where a reader isn't.
      const asSuper = (await all('super')).find((each) => each.id === id);
      expect([asSuper?.mine, asSuper?.mayDelete]).toEqual([false, true]);
      expect((await all('reader')).find((each) => each.id === id)?.mayDelete).toBe(false);
      // An unshared one of another's isn't there for them, a Super-Admin's included.
      const unshared = await remove('super', hidden);
      expect([unshared.statusCode, unshared.json()]).toEqual([404, NO_SUCH]);
      expect((await own('writer', 'My view')).id).toBe(hidden);

      const deleted = await remove('super', id);

      expect(deleted.statusCode, deleted.body).toBe(204);
      for (const who of ['writer', 'reader', 'super'])
        expect(
          (await all(who)).map((each) => each.id),
          who,
        ).not.toContain(id);
      // Gone, as one of its owner's own.
      const again = await remove('writer', id);
      expect([again.statusCode, again.json()]).toEqual([404, NO_SUCH]);
    });

    it('removes one whose owner can no longer open its dashboard, which stays listed until then', async () => {
      // A dashboard writer could open, then can't: its folder's groups changed.
      const lost = await make('folder', { title: 'Bookmarks T580', folderId: 'root' });
      await folderAccessStore(getDb()).set(lost, {
        readOnly: ['sales-ro'],
        readWrite: ['sales-rw'],
      });
      const board = await make('dashboard', { title: 'Left behind', folderId: lost });
      const url_ = `/api/dashboards/${board}/bookmarks`;
      const made_ = await as('writer', {
        method: 'POST',
        url: url_,
        payload: { name: 'Orphaned', state: STATE },
      });
      const { id } = made_.json<{ id: string }>();
      expect(
        (await as('writer', { method: 'PATCH', url: `${url_}/${id}`, payload: { shared: true } }))
          .statusCode,
      ).toBe(200);
      await folderAccessStore(getDb()).set(lost, { readOnly: ['sales-ro'], readWrite: [] });

      const listed = async (who: string) =>
        (await as(who, { method: 'GET', url: url_ })).json<{ bookmarks: Listed[] }>().bookmarks;
      // Its owner can neither see it nor remove it now.
      expect((await as('writer', { method: 'DELETE', url: `${url_}/${id}` })).statusCode).toBe(404);
      for (const who of ['reader', 'super'])
        expect(
          (await listed(who)).map((each) => [each.name, each.sharedBy]),
          who,
        ).toEqual([['Orphaned', 'Wren Writer']]);

      const deleted = await as('super', { method: 'DELETE', url: `${url_}/${id}` });

      expect(deleted.statusCode, deleted.body).toBe(204);
      expect(await listed('reader')).toEqual([]);
      expect(await listed('super')).toEqual([]);
    });
  });
});

/**
 * The migration: the bookmarks phase 1 saved named no owner, and were its one
 * user's, `admin`.
 */
/**
 * T762, AC-429: WHILE sign-in is on, THE SYSTEM SHALL list to Super-Admins, on
 * the dashboard each belongs to, the bookmarks saved before sign-in was turned
 * on, whose owner is phase 1's single user (`admin`), and to no one else. One
 * its user shared is listed as AC-293 lists a shared bookmark.
 */
describe('phase 1’s bookmarks with sign-in on (T762, AC-429)', () => {
  it('lists an unshared one to Super-Admins alone, and a shared one to everyone who may see the dashboard', async () => {
    const store = bookmarkStore(getDb());
    const unshared = await store.save({
      dashboardId: dashboard,
      name: 'Phase one, kept',
      state: STATE,
      owner: 'admin',
    });
    const shared = await store.save({
      dashboardId: dashboard,
      name: 'Phase one, shared',
      state: STATE,
      owner: 'admin',
    });
    expect((await store.change(dashboard, shared.id, 'admin', { shared: true }))?.shared).toBe(
      true,
    );
    try {
      const names = async (who: string) => (await listed(who)).map((each) => each.name);
      expect(await names('super')).toEqual(
        expect.arrayContaining(['Phase one, kept', 'Phase one, shared']),
      );
      // Said as saved before sign-in, theirs to apply or copy, not to delete
      // (the coordinator's call, 2026-10-08, overturnable).
      const kept = (await listed('super')).find((each) => each.name === 'Phase one, kept');
      expect(kept).toEqual(
        expect.objectContaining({
          shared: false,
          mine: false,
          mayDelete: false,
          savedBeforeSignIn: true,
        }),
      );
      for (const who of ['writer', 'reader']) {
        expect(await names(who), who).not.toContain('Phase one, kept');
        expect(await names(who), who).toContain('Phase one, shared');
      }
    } finally {
      await store.remove(dashboard, unshared.id, 'admin');
      await store.remove(dashboard, shared.id, 'admin');
    }
  });
});

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
