import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { buildServer } from '../server';
import {
  removeProjectFolders,
  TEST_TIME_ZONE,
  workspaceFoldersOf,
  workspaceKeyOf,
} from './project-folder.fixture';

/**
 * T358 (AC-284; design 05 of 2026-09-27, states A, B and F): the Propose
 * dialog's check as it opens. `POST /api/proposals/check` answers what
 * proposing would record (the target by its path, each item, where it
 * lands and what it replaces, and whether that is what it was copied from),
 * or the refusal proposing would give, and records nothing.
 *
 * `writer` (`sales-rw`) writes /Sales, and /Sales/EMEA below it; `reader`
 * only reads it.
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

const MARK = `chk${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '', emea: '', shared: '' };
let writerKey = '';
let app: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>) {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const check = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/proposals/check', payload });

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
  });
  ids.emea = await doc('folder', { title: `EMEA ${MARK}`, folderId: ids.sales });
  ids.shared = await doc('chart', {
    schemaVersion: 1,
    title: `Margin ${MARK}`,
    folderId: ids.emea,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', 'in', [ids.emea, ids.sales]).execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', [ids.emea, ids.sales]).execute();
  if (writerKey !== '')
    await db.deleteFrom('documents').where('folder_id', '=', `ws:${writerKey}`).execute();
  await removeProjectFolders();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

interface Checked {
  targetFolderId: string;
  targetPath: string[];
  items: {
    kind: string;
    id: string;
    title: string;
    landsIn: string;
    landsInPath: string[];
    replaces: { id: string; version: number; copiedFrom: boolean } | null;
  }[];
}

describe('checking what a proposal would do (T358, AC-284)', () => {
  it('answers the target by its path and what the item replaces there, recording nothing', async () => {
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'chart', id: ids.shared, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copy = copied.json<{ id: string }>().id;
    // Its project folder's workspace (T523).
    writerKey = await workspaceKeyOf((await docs().get('chart', copy))!.body['folderId'] as string);

    const answer = await check('writer', { kind: 'chart', id: copy });
    expect(answer.statusCode, answer.body).toBe(200);
    const checked = answer.json<Checked>();
    expect(checked.targetFolderId).toBe(ids.emea);
    expect(checked.targetPath).toEqual(['Shared', `Sales ${MARK}`, `EMEA ${MARK}`]);
    expect(checked.items).toEqual([
      {
        kind: 'chart',
        id: copy,
        title: `Margin ${MARK}`,
        landsIn: ids.emea,
        landsInPath: ['Shared', `Sales ${MARK}`, `EMEA ${MARK}`],
        replaces: { id: ids.shared, version: 1, copiedFrom: true },
      },
    ]);
    // What it holds is never sent, and nothing was recorded.
    expect(answer.body).not.toContain('"snapshot"');
    expect(await proposalStore(getDb()).latestFor('chart', copy)).toBeNull();
  });

  it('says a new one replaces nothing', async () => {
    const drafted = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'chart', title: `New ${MARK}`, folderId: 'mine', targetFolderId: ids.emea },
    });
    const answer = await check('writer', { kind: 'chart', id: drafted.json<{ id: string }>().id });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<Checked>().items[0]!.replaces).toBeNull();
  });

  it('refuses as proposing would: waiting already, no workspace, a malformed ask', async () => {
    const drafted = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Waiting ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.emea,
      },
    });
    const id = drafted.json<{ id: string }>().id;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'chart', id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const waiting = await check('writer', { kind: 'chart', id });
    expect(waiting.statusCode).toBe(409);
    expect(waiting.json<{ error: string; proposalId: string }>()).toEqual({
      error: 'It is waiting for review already: its proposal must be decided first.',
      proposalId: proposed.json<{ id: string }>().id,
    });

    const reader = await check('reader', { kind: 'chart', id });
    expect(reader.statusCode).toBe(403);
    // A folder is proposed by nothing (T350 made a model a kind that is).
    expect((await check('writer', { kind: 'folder', id })).statusCode).toBe(400);
    // A chart's id is no model file of theirs.
    expect((await check('writer', { kind: 'model', id })).statusCode).toBe(404);
  });
});

describe('a proposal as its review view reads it (T356’s review)', () => {
  it('says the version the folder has now, where it moved on since the proposal', async () => {
    const shared = await doc('chart', {
      schemaVersion: 1,
      title: `Moved ${MARK}`,
      folderId: ids.emea,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const copy = (
      await as('writer', {
        method: 'POST',
        url: '/api/workspace/copies',
        payload: { kind: 'chart', id: shared, timeZone: TEST_TIME_ZONE },
      })
    ).json<{ id: string }>().id;
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'chart', id: copy },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    // Changed in its folder since.
    const stored = (await docs().get('chart', shared))!;
    await docs().update({
      kind: 'chart',
      id: shared,
      body: { ...stored.body, description: 'Changed in place.' },
      expectedVersion: stored.version ?? 1,
    });
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}`,
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const item = answer.json<{
      items: { replaces: { version: number } | null; replacesNow: number | null }[];
    }>().items[0]!;
    expect([item.replaces?.version, item.replacesNow]).toEqual([1, 2]);
  });

  it('names a target deleted since as such, never as Shared', async () => {
    const gone = await doc('folder', { title: `Gone ${MARK}`, folderId: ids.sales });
    const drafted = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'chart', title: `Orphan ${MARK}`, folderId: 'mine', targetFolderId: gone },
    });
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'chart', id: drafted.json<{ id: string }>().id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    await docs().remove('folder', gone);
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}`,
    });
    expect(answer.json<{ targetPath: string[] }>().targetPath).toEqual([
      'Shared',
      'A deleted folder',
    ]);
    await getDb().deleteFrom('proposals').where('target_folder_id', '=', gone).execute();
  });
});

describe('an item that went with another’s proposal (T358’s review)', () => {
  it('is found by its own id, with where each item lands, in its lookup and in My proposals', async () => {
    // A shared dashboard in /Sales showing the library chart in /Sales/EMEA,
    // both copied into the workspace: the dashboard's proposal takes the chart.
    const board = await doc('dashboard', {
      schemaVersion: 1,
      title: `Board ${MARK}`,
      folderId: ids.sales,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: ids.shared }] }],
    });
    const copy = async (kind: string, id: string) => {
      const answer = await as('writer', {
        method: 'POST',
        url: '/api/workspace/copies',
        payload: { kind, id, timeZone: TEST_TIME_ZONE },
      });
      expect(answer.statusCode, answer.body).toBeLessThan(300);
      return answer.json<{ id: string }>().id;
    };
    const boardCopy = await copy('dashboard', board);
    const chartCopy = (
      await docs().withOrigin('chart', ids.shared, await workspaceFoldersOf(writerKey))
    )[0]?.id;
    const shownCopy = chartCopy ?? (await copy('chart', ids.shared));
    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: boardCopy },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;

    const latest = await as('writer', {
      method: 'GET',
      url: `/api/proposals?kind=chart&itemId=${shownCopy}`,
    });
    expect(latest.statusCode, latest.body).toBe(200);
    const shown = latest.json<{
      id: string;
      targetPath: string[];
      items: { kind: string; id: string; landsInPath: string[] }[];
    }>();
    expect(shown.id).toBe(proposalId);
    expect(shown.targetPath).toEqual(['Shared', `Sales ${MARK}`]);
    expect(shown.items.map((item) => [item.kind, item.id, item.landsInPath])).toEqual([
      ['dashboard', boardCopy, ['Shared', `Sales ${MARK}`]],
      ['chart', shownCopy, ['Shared', `Sales ${MARK}`, `EMEA ${MARK}`]],
    ]);

    // My proposals names every item in it, so the chart's row finds it too.
    const reviews = await as('writer', { method: 'GET', url: '/api/reviews' });
    const row = reviews
      .json<{ mine: { id: string; items: { kind: string; id: string }[] }[] }>()
      .mine.find((each) => each.id === proposalId);
    expect(row?.items).toEqual([
      { kind: 'dashboard', id: boardCopy },
      { kind: 'chart', id: shownCopy },
    ]);
  });
});
