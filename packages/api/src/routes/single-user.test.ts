import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T359 (AC-254): with security off, wechart runs as one user holding every
 * permission, and workspaces and proposals work as they do with it on. That
 * user copies a shared dashboard into My workspace ("Edit in my workspace"),
 * changes it there, proposes it back to its folder, finds it in Reviews and
 * approves their own proposal, which lands it and keeps its history. Nothing
 * asks for a sign-in or refuses a permission on the way. As with sign-in on,
 * a shared item is never changed in place (amended 2026-10-01, `[R52]`:
 * "Workspace-only now").
 *
 *   /Solo <run>    a dashboard, showing a library chart kept there; a data source
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};

const MARK = `solo${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { solo: '', board: '', chart: '', source: '' };
const sealed = {
  v: 1 as const,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
let app: FastifyInstance;
/** Every answer the flow got, so none can be a sign-in or a refused permission. */
const answers: LightMyRequestResponse[] = [];

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

const ask = async (options: InjectOptions) => {
  const answer = await app.inject(options);
  answers.push(answer);
  return answer;
};

beforeAll(async () => {
  ids.solo = await doc('folder', { title: `Solo ${MARK}`, folderId: 'root' });
  ids.chart = await doc('chart', {
    schemaVersion: 1,
    title: `Orders ${MARK}`,
    folderId: ids.solo,
    chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
  });
  ids.board = await doc('dashboard', {
    schemaVersion: 1,
    title: `Revenue ${MARK}`,
    folderId: ids.solo,
    pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: ids.chart }] }],
  });
  ids.source = (
    await dataSourceStore(getDb()).create({
      folderId: ids.solo,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'solo-db', port: 5432, database: 'solo', user: 'cube', ssl: false },
      sealed: { password: sealed },
    })
  ).id;
  // As `main.ts` wires it, the folders' groups included.
  app = buildServer({
    config,
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
  });
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  if (ids.solo !== '') {
    await db.deleteFrom('proposals').where('target_folder_id', '=', ids.solo).execute();
    await db.deleteFrom('item_versions').where('folder_id', '=', ids.solo).execute();
    await db.deleteFrom('audit_records').where('folder_id', '=', ids.solo).execute();
    await db.deleteFrom('data_sources').where('folder_id', '=', ids.solo).execute();
  }
  for (const { kind, id } of made.reverse()) {
    if (kind === 'dashboard')
      for (const chart of await docs().localTo(id)) await docs().remove('chart', chart.id);
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  }
  await closeDb();
});

describe('the single user, with security off (T359, AC-254)', () => {
  // In no shared folder, seen by no reader: theirs alone, as phase 1 kept it.
  it('opens and changes an item in no folder in place, as phase 1 did', async () => {
    const id = await doc('dashboard', { schemaVersion: 1, title: `Unfiled ${MARK}`, pages: [] });
    const opened = await app.inject({ method: 'GET', url: `/api/documents/dashboard/${id}` });
    expect(opened.statusCode, opened.body).toBe(200);
    expect(opened.json<{ workspace?: unknown }>().workspace).toBeUndefined();
    const before = opened.json<{ body: Record<string, unknown>; version: number }>();
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/documents/dashboard/${id}`,
      payload: { body: { ...before.body, description: 'In place' }, version: before.version },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('dashboard', id))?.body['description']).toBe('In place');
  });

  // Never a way around a shared item's copy: none is put in no folder.
  it('moves no shared item into no folder, to be changed there', async () => {
    const board = (await docs().get('dashboard', ids.board))!;
    const { folderId: _folder, ...rest } = board.body;
    void _folder;
    for (const [method, payload] of [
      ['PATCH', { folderId: null }],
      ['PUT', { body: rest, version: board.version }],
    ] as const) {
      const answer = await app.inject({
        method,
        url: `/api/documents/dashboard/${ids.board}`,
        payload,
      });
      expect(answer.statusCode, `${method} ${answer.body}`).toBe(403);
    }
    expect(await docs().get('dashboard', ids.board)).toEqual(board);
  });

  it('never changes a shared dashboard, chart or data source in place, as with sign-in on', async () => {
    const board = (await docs().get('dashboard', ids.board))!;
    const chart = (await docs().get('chart', ids.chart))!;
    for (const [url, payload] of [
      [
        `/api/documents/dashboard/${ids.board}`,
        { body: { ...board.body, description: 'In place' }, version: board.version },
      ],
      [
        `/api/documents/chart/${ids.chart}`,
        {
          body: {
            ...chart.body,
            chart: { source: { cube: 'orders' }, wells: { measures: ['orders.total'] } },
          },
          version: chart.version,
        },
      ],
      [`/api/data-sources/${ids.source}`, { description: 'In place' }],
    ] as const) {
      const answer = await app.inject({ method: 'PUT', url, payload });
      expect(answer.statusCode, `${url} ${answer.body}`).toBe(409);
      expect(answer.json<{ code: string }>().code, url).toBe('shared_in_place');
    }
    expect(await docs().get('dashboard', ids.board)).toEqual(board);
    expect(await docs().get('chart', ids.chart)).toEqual(chart);
    expect((await dataSourceStore(getDb()).get(ids.source))?.description ?? null).toBeNull();
    // Nor moved into My workspace: shared work is changed in a copy there.
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/documents/chart/${ids.chart}`,
      payload: { folderId: 'mine' },
    });
    expect(moved.statusCode, moved.body).toBe(409);
    expect((await docs().get('chart', ids.chart))?.body['folderId']).toBe(ids.solo);
  });

  it('edits a shared dashboard through My workspace, proposes it and approves their own proposal', async () => {
    // "Edit in my workspace": offered on the shared dashboard, and made.
    const shared = await ask({ method: 'GET', url: `/api/documents/dashboard/${ids.board}` });
    expect(shared.statusCode, shared.body).toBe(200);
    expect(shared.json<{ workspace?: unknown }>().workspace).toEqual({
      inWorkspace: false,
      mayCopy: true,
      copyId: null,
    });
    const copied = await ask({
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: ids.board, timeZone: TEST_TIME_ZONE },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const { id: copyId, folderId: projectId } = copied.json<{ id: string; folderId: string }>();
    made.push({ kind: 'folder', id: projectId }, { kind: 'dashboard', id: copyId });
    // In a project folder of My workspace, the single user's.
    expect((await docs().get('folder', projectId))?.body['folderId']).toBe('mine');
    const again = await ask({ method: 'GET', url: `/api/documents/dashboard/${ids.board}` });
    expect(again.json<{ workspace?: { copyId: unknown } }>().workspace?.copyId).toBe(copyId);

    // Changed there: the shared one is as it was.
    const copy = await ask({ method: 'GET', url: `/api/documents/dashboard/${copyId}` });
    const opened = copy.json<{
      body: Record<string, unknown>;
      version: number;
      workspace?: { inWorkspace: boolean };
    }>();
    expect(opened.workspace?.inWorkspace).toBe(true);
    expect(opened.body['targetFolderId']).toBe(ids.solo);
    const saved = await ask({
      method: 'PUT',
      url: `/api/documents/dashboard/${copyId}`,
      payload: {
        body: { ...opened.body, description: `Changed ${MARK}` },
        version: opened.version,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('dashboard', ids.board))?.body['description']).toBeUndefined();

    // Proposed back to its folder.
    const checked = await ask({
      method: 'POST',
      url: '/api/proposals/check',
      payload: { kind: 'dashboard', id: copyId },
    });
    expect(checked.statusCode, checked.body).toBe(200);
    const proposed = await ask({
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: copyId, description: 'Says what it shows.' },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposalId = proposed.json<{ id: string }>().id;

    // In Reviews, theirs to decide.
    const count = await ask({ method: 'GET', url: '/api/reviews/count' });
    expect(count.statusCode, count.body).toBe(200);
    expect(count.json<{ waiting: number }>().waiting).toBeGreaterThanOrEqual(1);
    const reviews = await ask({ method: 'GET', url: '/api/reviews' });
    expect(reviews.statusCode, reviews.body).toBe(200);
    const row = reviews
      .json<{ toReview: { id: string; yours: boolean }[] }>()
      .toReview.find((each) => each.id === proposalId);
    expect(row?.yours).toBe(true);
    const opening = await ask({ method: 'GET', url: `/api/proposals/${proposalId}` });
    expect(opening.statusCode, opening.body).toBe(200);
    expect(opening.json<{ mayApprove: boolean; yours: boolean }>()).toMatchObject({
      mayApprove: true,
      yours: true,
    });
    const band = await ask({
      method: 'GET',
      url: `/api/proposals?kind=dashboard&itemId=${copyId}`,
    });
    expect(band.statusCode, band.body).toBe(200);

    // Approved by its own author: landed, and kept in its history.
    const approved = await ask({
      method: 'POST',
      url: `/api/proposals/${proposalId}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await docs().get('dashboard', ids.board))?.body['description']).toBe(`Changed ${MARK}`);
    const history = await ask({ method: 'GET', url: `/api/history/dashboard/${ids.board}` });
    expect(history.statusCode, history.body).toBe(200);
    const [newest] = history.json<{
      versions: { approver: { key: string } | null; author: { key: string } | null }[];
    }>().versions;
    expect(newest?.author?.key).toBe('admin');
    expect(newest?.approver?.key).toBe('admin');

    // Nothing asked for a sign-in or refused a permission (AC-254).
    expect(
      answers
        .filter((answer) => answer.statusCode === 401 || answer.statusCode === 403)
        .map((answer) => `${String(answer.statusCode)} ${answer.body}`),
    ).toEqual([]);
  });
});
