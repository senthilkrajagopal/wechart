import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';

/**
 * T354 (AC-289; design 06 of 2026-09-27; rule 80): a shared item's history,
 * its last 10 versions newest first, each with its number, time, author,
 * approver and description, is for its folder's read-write members and
 * Super-Admins alone. Restoring a version makes a draft of it in the user's
 * workspace, to go by a proposal like any change: the folder is unchanged
 * until it is approved.
 *
 * `writer` (`sales-rw`) and `many` (`g01`) write /Sales; `reader`
 * (`sales-ro`) only reads it.
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

const MARK = `hist${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const versions = () => versionStore(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '', board: '', local: '', library: '' };
const ada = { key: 'ada', name: 'Ada Admin' };
const mo = { key: 'mo', name: 'Mo Manager' };
let app: FastifyInstance;
let writerKey = '';

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

const board = (title: string, chartId: string) => ({
  schemaVersion: 1,
  title,
  folderId: ids.sales,
  pages: [
    {
      id: 'p1',
      items: [
        { id: 't1', kind: 'chart', chartId },
        { id: 't2', kind: 'chart', chartId: ids.library },
      ],
    },
  ],
  charts: [chartId],
});

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'g01'] },
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
    title: `Local now ${MARK}`,
    localToDashboardId: ids.board,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.total'] } },
  });
  // Version 2 is in the folder now; version 1 showed another local chart.
  await doc('dashboard', board(`Revenue ${MARK}`, ids.local), ids.board);
  const stored = (await docs().get('dashboard', ids.board))!;
  await docs().update({
    kind: 'dashboard',
    id: ids.board,
    body: { ...stored.body, title: `Revenue ${MARK}` },
    expectedVersion: stored.version ?? 1,
  });
  const oldLocal = randomUUID();
  await versions().keep({
    kind: 'dashboard',
    itemId: ids.board,
    version: 1,
    content: {
      body: board(`Revenue then ${MARK}`, oldLocal),
      parts: [
        {
          id: oldLocal,
          body: {
            schemaVersion: 1,
            title: `Local then ${MARK}`,
            localToDashboardId: ids.board,
            chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
          },
        },
      ],
    },
    folderId: ids.sales,
    title: `Revenue then ${MARK}`,
    author: mo,
    approver: ada,
    description: 'First version.',
    proposalId: null,
    at: new Date(2026, 8, 20, 9, 0),
  });
  await versions().keep({
    kind: 'dashboard',
    itemId: ids.board,
    version: 2,
    content: { body: board(`Revenue ${MARK}`, ids.local), parts: [] },
    folderId: ids.sales,
    title: `Revenue ${MARK}`,
    author: ada,
    approver: ada,
    description: null,
    proposalId: null,
    at: new Date(2026, 8, 27, 15, 2),
  });

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versions(),
    dataSources: sources(),
    connectionTests: connectionTestStore(getDb()),
  });
  for (const who of ['writer', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await db.deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
  await db.deleteFrom('item_versions').where('folder_id', '=', ids.sales).execute();
  await db.deleteFrom('data_sources').where('folder_id', '=', ids.sales).execute();
  // A data source's version restored as writer's draft (T515): out of their workspace.
  if (writerKey !== '')
    await db.deleteFrom('data_sources').where('folder_id', '=', `ws:${writerKey}`).execute();
  if (writerKey !== '') {
    await db
      .deleteFrom('documents')
      .where('kind', 'in', ['dashboard', 'chart'])
      .where('folder_id', '=', `ws:${writerKey}`)
      .execute();
    await db
      .deleteFrom('documents')
      .where('kind', '=', 'chart')
      .where('owner', '=', writerKey)
      .execute();
  }
  // What the approval landed in /Sales, besides this file's own.
  await db
    .deleteFrom('documents')
    .where('kind', '=', 'chart')
    .where('folder_id', 'is', null)
    .where('owner', 'in', ['admin', 'writer@wechart.test'])
    .where('id', 'not in', [ids.local, ids.library])
    .where('created_at', '>', new Date(Date.now() - 3600_000))
    .execute()
    .catch(() => undefined);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const restore = (who: string, kind: string, id: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: `/api/history/${kind}/${id}/restore`, payload });
const libraryChart = (title: string, measures: string[]) => ({
  schemaVersion: 1,
  title,
  folderId: ids.sales,
  chart: { source: { cube: 'orders' }, wells: { measures } },
});
/** A version kept as an approval keeps it, by Ada. */
const keep = (
  kind: 'dashboard' | 'chart' | 'data-source',
  itemId: string,
  version: number,
  content: Record<string, unknown>,
) =>
  versions().keep({
    kind,
    itemId,
    version,
    content,
    folderId: ids.sales,
    title: String(
      (content['body'] as { title?: unknown; name?: unknown }).title ??
        (content['body'] as { name?: unknown }).name,
    ),
    author: ada,
    approver: ada,
    description: null,
    proposalId: null,
  });

interface History {
  current: number;
  versions: {
    version: number;
    at: string;
    title: string;
    author: { name: string } | null;
    approver: { name: string } | null;
    description: string | null;
    current: boolean;
    content?: unknown;
  }[];
}

describe('an item’s history (T354, AC-289)', () => {
  it('lists its versions newest first, with who, who approved and why, the current one marked', async () => {
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/history/dashboard/${ids.board}`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const history = answer.json<History>();
    expect(history.current).toBe(2);
    expect(
      history.versions.map((each) => [
        each.version,
        each.title,
        each.author?.name,
        each.approver?.name,
        each.description,
        each.current,
      ]),
    ).toEqual([
      [2, `Revenue ${MARK}`, 'Ada Admin', 'Ada Admin', null, true],
      [1, `Revenue then ${MARK}`, 'Mo Manager', 'Ada Admin', 'First version.', false],
    ]);
    expect(history.versions[1]!.at).toBe(new Date(2026, 8, 20, 9, 0).toISOString());
    // What each held is asked for one at a time.
    expect(history.versions[0]!.content).toBeUndefined();
  });

  it('is its folder’s read-write members’ and Super-Admins’ alone', async () => {
    expect(
      (await as('super', { method: 'GET', url: `/api/history/dashboard/${ids.board}` })).statusCode,
    ).toBe(200);
    for (const url of [
      `/api/history/dashboard/${ids.board}`,
      `/api/history/dashboard/${ids.board}/versions/1`,
    ])
      expect((await as('reader', { method: 'GET', url })).statusCode, url).toBe(404);
    expect(
      (
        await as('reader', {
          method: 'POST',
          url: `/api/history/dashboard/${ids.board}/restore`,
          payload: { version: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await as('writer', { method: 'GET', url: `/api/history/dashboard/${randomUUID()}` }))
        .statusCode,
    ).toBe(404);
  });

  it('gives one version’s content, its own charts with it, to be viewed', async () => {
    const answer = await as('many', {
      method: 'GET',
      url: `/api/history/dashboard/${ids.board}/versions/1`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const version = answer.json<{
      version: number;
      content: { body: { title: string }; parts: { body: { title: string } }[] };
    }>();
    expect(version.version).toBe(1);
    expect(version.content.body.title).toBe(`Revenue then ${MARK}`);
    expect(version.content.parts.map((part) => part.body.title)).toEqual([`Local then ${MARK}`]);
    expect(
      (
        await as('many', {
          method: 'GET',
          url: `/api/history/dashboard/${ids.board}/versions/9`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('restores a version only through a proposal: a draft of it, the folder unchanged until approved', async () => {
    const restored = await as('writer', {
      method: 'POST',
      url: `/api/history/dashboard/${ids.board}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode, restored.body).toBe(201);
    const draftId = restored.json<{ kind: string; id: string }>().id;
    const draft = (await docs().get('dashboard', draftId))!;
    writerKey = (draft.body['folderId'] as string).slice(3);
    expect(draft.body['folderId']).toBe(`ws:${writerKey}`);
    // Version 1's content under the item's name now: a name changes at once,
    // never by proposal (AC-291), so the proposal replaces the item of its name.
    expect([draft.body['title'], draft.body['targetFolderId'], draft.body['origin']]).toEqual([
      `Revenue ${MARK}`,
      ids.sales,
      { kind: 'dashboard', id: ids.board, version: 2, folderId: ids.sales },
    ]);
    // Its own chart then is its own chart again; the library chart stays the folder's.
    const locals = await docs().localTo(draftId);
    expect(locals.map((chart) => chart.body['title'])).toEqual([`Local then ${MARK}`]);
    expect(JSON.stringify(draft.body)).toContain(ids.library);
    // The folder serves what it did.
    const localTitles = async () =>
      (await docs().localTo(ids.board)).map((chart) => chart.body['title']);
    expect(await localTitles()).toEqual([`Local now ${MARK}`]);
    // In the audit trail, in its folder, naming the version (AC-294).
    const records = await auditStore(getDb()).list({ events: ['restore'], folderIds: [ids.sales] });
    const record = records.records.find((each) => each.item?.id === ids.board);
    expect(record?.summary).toBe(`Restoring “Revenue ${MARK}” to version 1, as a draft to propose`);
    expect(record?.actor?.key).toBe(writerKey);

    // Proposed, it replaces version 2 as a copy of it; approved, it lands.
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: draftId, description: 'Restore version 1.' },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect(proposed.json<{ replaces: unknown }>().replaces).toEqual({
      id: ids.board,
      version: 2,
      copiedFrom: true,
    });
    expect(await localTitles()).toEqual([`Local now ${MARK}`]);
    const approved = await as('many', {
      method: 'POST',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await localTitles()).toEqual([`Local then ${MARK}`]);
    const after = (
      await as('writer', { method: 'GET', url: `/api/history/dashboard/${ids.board}` })
    ).json<History>();
    expect(after.versions.map((each) => [each.version, each.description])).toEqual([
      [3, 'Restore version 1.'],
      [2, null],
      [1, 'First version.'],
    ]);
  });

  it('refuses a version it doesn’t keep, and an ask without one', async () => {
    expect((await restore('many', 'dashboard', ids.board, { version: 7 })).statusCode).toBe(404);
    expect((await restore('many', 'dashboard', ids.board, { version: 'one' })).statusCode).toBe(
      400,
    );
  });

  it('replaces the user’s copy only when asked, and never one waiting for review (T354’s review)', async () => {
    // A library chart at version 2, with version 1 kept, and the writer's copy of it.
    const chart = await doc('chart', libraryChart(`Margin ${MARK}`, ['orders.count']));
    await docs().update({
      kind: 'chart',
      id: chart,
      body: libraryChart(`Margin ${MARK}`, ['orders.total']),
      expectedVersion: 1,
    });
    await keep('chart', chart, 1, { body: libraryChart(`Margin ${MARK}`, ['orders.count']) });
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'chart', id: chart },
    });
    const copy = copied.json<{ id: string }>().id;

    const asked = await restore('writer', 'chart', chart, { version: 1 });
    expect(asked.statusCode, asked.body).toBe(409);
    expect(asked.json()).toEqual({
      error:
        'You have a copy of it in your workspace. Restoring this version replaces what that copy holds.',
      id: copy,
      replaceable: true,
    });
    expect((await docs().get('chart', copy))?.id).toBe(copy);

    const replaced = await restore('writer', 'chart', chart, { version: 1, replaceCopy: true });
    expect(replaced.statusCode, replaced.body).toBe(201);
    const draft = (await docs().get('chart', replaced.json<{ id: string }>().id))!;
    expect((draft.body['chart'] as { wells: unknown }).wells).toEqual({
      measures: ['orders.count'],
    });
    expect(draft.body['origin']).toEqual({
      kind: 'chart',
      id: chart,
      version: 2,
      folderId: ids.sales,
    });
    expect(await docs().get('chart', copy)).toBeNull();

    // Proposed, it waits: nothing replaces it until that is decided.
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'chart', id: draft.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const waiting = await restore('writer', 'chart', chart, { version: 1, replaceCopy: true });
    expect(waiting.statusCode).toBe(409);
    expect(waiting.json()).toEqual({
      error:
        'Your copy of it is waiting for review: decide or withdraw that proposal before restoring another version.',
      id: draft.id,
      replaceable: false,
    });
    expect((await docs().get('chart', draft.id))?.id).toBe(draft.id);
  });

  it('refuses a version showing a chart the user can’t open (T354’s review)', async () => {
    const finance = await doc('folder', {
      title: `Finance ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['managers'] },
    });
    const hidden = await doc('chart', {
      ...libraryChart(`Hidden ${MARK}`, ['orders.count']),
      folderId: finance,
    });
    const second = await doc('dashboard', { ...board(`Second ${MARK}`, ids.local), charts: [] });
    await docs().update({
      kind: 'dashboard',
      id: second,
      body: { ...board(`Second ${MARK}`, ids.local), charts: [] },
      expectedVersion: 1,
    });
    await keep('dashboard', second, 1, {
      body: {
        schemaVersion: 1,
        title: `Second ${MARK}`,
        folderId: ids.sales,
        pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: hidden }] }],
      },
      parts: [],
    });
    const answer = await restore('writer', 'dashboard', second, { version: 1 });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      'That version shows a chart you can’t open, so it can’t be restored into your workspace.',
    );
  });

  it('gives a data source’s version with each credential only named (T515)', async () => {
    const sealed = {
      v: 1,
      kid: 'kid-1',
      enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
      ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
    };
    const source = await sources().create({
      folderId: ids.sales,
      name: `ledger_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed as never },
    });
    // Then: another host, and a password sealed to it.
    const sealedThen = { ...sealed, ct: Buffer.alloc(272, `then-${MARK}`).toString('base64url') };
    await keep('data-source', source.id, 1, {
      body: {
        name: `ledger_${MARK}`,
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'db-then', port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealedThen },
        revisions: { password: 'r1' },
      },
    });
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/history/data-source/${source.id}/versions/1`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.body).not.toContain(sealed.ct.slice(0, 16));
    expect(answer.body).not.toContain(sealedThen.ct.slice(0, 16));
    expect(answer.json<{ content: { body: unknown } }>().content.body).toEqual({
      name: `ledger_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db-then', port: 5432, database: 'sales', user: 'cube', ssl: false },
      secrets: ['password'],
    });
    // Its credential against the one stored now, compared sealed (design 06, state D).
    expect(answer.json<{ content: { secretChanges: unknown } }>().content.secretChanges).toEqual({
      password: 'replaced',
    });

    // Restored as a draft in the workspace: that version's settings, its
    // credentials as sealed, the folder's unchanged until it is approved.
    const restored = await restore('writer', 'data-source', source.id, { version: 1 });
    expect(restored.statusCode, restored.body).toBe(201);
    const draftId = restored.json<{ kind: string; id: string }>().id;
    const draft = (await sources().withSealed(draftId))!;
    expect(draft.source.folderId).toMatch(/^ws:/);
    expect([draft.source.name, draft.source.fields['host'], draft.source.origin?.id]).toEqual([
      `ledger_${MARK}`,
      'db-then',
      source.id,
    ]);
    expect(draft.source.targetFolderId).toBe(ids.sales);
    expect(draft.landed.sealed).toEqual({ password: sealedThen });
    expect((await sources().get(source.id))?.fields['host']).toBe('db');

    // Proposed only once a test of those settings passed (AC-158).
    const propose = () =>
      as('writer', {
        method: 'POST',
        url: '/api/proposals',
        payload: { kind: 'data-source', id: draftId, description: `Back to db-then (${MARK})` },
      });
    const untested = await propose();
    expect(untested.statusCode, untested.body).toBe(409);
    expect(untested.json<{ error: string }>().error).toBe(
      'Test its connection first: a data source’s changed settings are proposed only once a test of them passed.',
    );
    const tested = (ok: boolean, settings: string) =>
      connectionTestStore(getDb()).record(draftId, {
        ok,
        checks: [{ id: 'connect', status: ok ? 'passed' : 'failed', durationMs: 1 }],
        fields: draft.source.fields,
        asStored: true,
        settings,
        by: { key: writerKey, name: 'Wren Writer' },
      });
    // A failed test, and a passing one of other settings, are no test of these.
    await tested(false, draft.source.settingsPrint);
    expect((await propose()).statusCode).toBe(409);
    await tested(true, 'another-print');
    expect((await propose()).statusCode).toBe(409);
    await tested(true, draft.source.settingsPrint);
    const proposed = await propose();
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect((await sources().get(source.id))?.fields['host']).toBe('db');

    // Its draft waits for review: no other version restored over it meanwhile.
    const waiting = await restore('writer', 'data-source', source.id, {
      version: 1,
      replaceCopy: true,
    });
    expect(waiting.statusCode, waiting.body).toBe(409);
    expect(waiting.json()).toMatchObject({ id: draftId, replaceable: false });
    expect((await sources().get(draftId))?.id).toBe(draftId);
  });

  it('replaces the user’s copy of a data source only when asked, and refuses a version of another type (T515’s review)', async () => {
    const sealed = {
      v: 1,
      kid: 'kid-1',
      enc: Buffer.alloc(32, `enc2-${MARK}`).toString('base64url'),
      ct: Buffer.alloc(272, `ct2-${MARK}`).toString('base64url'),
    };
    const source = await sources().create({
      folderId: ids.sales,
      name: `journal_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed as never },
    });
    const body = (host: string, driver = 'postgres') => ({
      body: {
        name: `journal_${MARK}`,
        driver,
        authMethod: 'password',
        fields: { host, port: 5432, database: 'sales', user: 'cube', ssl: false },
        sealed: { password: sealed },
      },
    });
    await keep('data-source', source.id, 1, body('db-one'));
    await keep('data-source', source.id, 2, body('db-two', 'mysql'));

    const other = await restore('writer', 'data-source', source.id, { version: 2 });
    expect(other.statusCode, other.body).toBe(409);
    expect(other.json<{ error: string }>().error).toBe(
      'That version is of another type of database, and a data source’s type never changes.',
    );

    // Their copy, already there: asked about, kept, then replaced.
    const copied = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${source.id}/copy`,
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copyId = copied.json<{ id: string }>().id;
    const asked = await restore('writer', 'data-source', source.id, { version: 1 });
    expect(asked.statusCode, asked.body).toBe(409);
    expect(asked.json()).toMatchObject({ id: copyId, replaceable: true });
    expect((await sources().get(copyId))?.fields['host']).toBe('db');
    const replaced = await restore('writer', 'data-source', source.id, {
      version: 1,
      replaceCopy: true,
    });
    expect(replaced.statusCode, replaced.body).toBe(201);
    expect(await sources().get(copyId)).toBeUndefined();
    const draft = (await sources().get(replaced.json<{ id: string }>().id))!;
    expect([draft.fields['host'], draft.origin?.id]).toEqual(['db-one', source.id]);
  });

  it('tags the newest version current when a rename has moved the item on since (T354’s review)', async () => {
    const stored = (await docs().get('dashboard', ids.board))!;
    await docs().update({
      kind: 'dashboard',
      id: ids.board,
      body: { ...stored.body, title: `Revenue renamed ${MARK}` },
      expectedVersion: stored.version ?? 1,
    });
    const history = (
      await as('writer', { method: 'GET', url: `/api/history/dashboard/${ids.board}` })
    ).json<History>();
    expect(history.versions.map((each) => each.current)).toEqual([true, false, false]);
  });

  it('has none with sign-in off, as proposals don’t', async () => {
    const off = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      versions: versions(),
    });
    expect(
      (await off.inject({ method: 'GET', url: `/api/history/dashboard/${ids.board}` })).statusCode,
    ).toBe(404);
    await off.close();
  });
});
