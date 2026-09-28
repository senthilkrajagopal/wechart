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
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';

/**
 * T355 (AC-287; design 05 of 2026-09-27, states C, D and E): the Reviews
 * page's two lists. "To review" holds every open proposal the user may
 * decide, their own included and marked as theirs, and none they may not.
 * "My proposals" holds theirs in every state: waiting, rejected with who
 * and why, approved as the version it landed as. The top bar's count is
 * the first list's length.
 *
 * `writer` (`sales-rw`) and `many` (`g01`) write /Sales; `manager`
 * (`managers`) writes /Finance; `reader` (`sales-ro`) only reads /Sales.
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

const MARK = `revs${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = {
  sales: '',
  finance: '',
  emea: '',
  ledger: '',
  waiting: '',
  rejected: '',
  approved: '',
  elsewhere: '',
};
const keys: Record<string, string> = {};
let app: FastifyInstance;

/** A folder with its groups, or inheriting its parent's when given none. */
async function folder(
  title: string,
  readOnly: string[] | null,
  readWrite: string[] | null,
  parent = 'root',
) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: {
      owner: 'admin',
      title,
      folderId: parent,
      ...(readOnly === null || readWrite === null ? {} : { access: { readOnly, readWrite } }),
    },
  });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A new chart in `who`'s workspace, proposed to `target`; the proposal's id. */
async function proposed(who: string, title: string, target: string, description?: string) {
  const chart = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'chart', title, folderId: 'mine', targetFolderId: target },
  });
  expect(chart.statusCode, chart.body).toBe(201);
  const stored = (await docs().get('chart', chart.json<{ id: string }>().id))!;
  keys[who] = (stored.body['folderId'] as string).slice('ws:'.length);
  const answer = await as(who, {
    method: 'POST',
    url: '/api/proposals',
    payload: {
      kind: 'chart',
      id: chart.json<{ id: string }>().id,
      ...(description === undefined ? {} : { description }),
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
}

interface Row {
  id: string;
  kind: string;
  title: string;
  targetFolderId: string;
  targetPath: string[];
  author: { key: string; name: string };
  description: string | null;
  status: string;
  yours: boolean;
  includes: { kind: string; title: string }[];
  replaces: { version: number } | null;
  decision: { by: { name: string }; reason: string | null } | null;
  landedVersion: number | null;
}
const reviews = async (who: string) => {
  const answer = await as(who, { method: 'GET', url: '/api/reviews' });
  expect(answer.statusCode, answer.body).toBe(200);
  const lists = answer.json<{ toReview: Row[]; mine: Row[] }>();
  // Only this file's, whatever else the database holds.
  const ours = (rows: Row[]) =>
    rows.filter((row) => [ids.sales, ids.finance, ids.emea].includes(row.targetFolderId));
  return { toReview: ours(lists.toReview), mine: ours(lists.mine) };
};

beforeAll(async () => {
  ids.sales = await folder(`Sales ${MARK}`, ['sales-ro'], ['sales-rw', 'g01']);
  ids.finance = await folder(`Finance ${MARK}`, [], ['managers']);
  // Below Sales, inheriting its groups; and one only `writer` writes.
  ids.emea = await folder(`EMEA ${MARK}`, null, null, ids.sales);
  ids.ledger = await folder(`Ledger ${MARK}`, [], ['sales-rw']);
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
  });
  for (const who of ['writer', 'many', 'manager', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
  ids.approved = await proposed('writer', `Margin ${MARK}`, ids.sales);
  expect(
    (await as('many', { method: 'POST', url: `/api/proposals/${ids.approved}/approve` }))
      .statusCode,
  ).toBe(200);
  ids.rejected = await proposed('writer', `Churn ${MARK}`, ids.sales);
  expect(
    (
      await as('many', {
        method: 'POST',
        url: `/api/proposals/${ids.rejected}/reject`,
        payload: { reason: 'Keep the median.' },
      })
    ).statusCode,
  ).toBe(200);
  ids.waiting = await proposed('writer', `Pipeline ${MARK}`, ids.sales, 'Adds the stages.');
  ids.elsewhere = await proposed('manager', `Budget ${MARK}`, ids.finance);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  for (const target of [ids.sales, ids.finance, ids.emea, ids.ledger]) {
    if (target === '') continue;
    await db.deleteFrom('proposals').where('target_folder_id', '=', target).execute();
    await db.deleteFrom('audit_records').where('folder_id', '=', target).execute();
    await db.deleteFrom('item_versions').where('folder_id', '=', target).execute();
    await db.deleteFrom('documents').where('folder_id', '=', target).execute();
  }
  for (const key of Object.values(keys))
    await db.deleteFrom('documents').where('folder_id', '=', `ws:${key}`).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

describe('the Reviews lists (T355, AC-287)', () => {
  it('lists for a decider every open proposal they may decide, and none they may not', async () => {
    const { toReview, mine } = await reviews('many');
    expect(toReview.map((row) => row.id)).toEqual([ids.waiting]);
    expect(mine).toEqual([]);
    const [row] = toReview;
    expect([row!.kind, row!.title, row!.status, row!.yours, row!.description]).toEqual([
      'chart',
      `Pipeline ${MARK}`,
      'open',
      false,
      'Adds the stages.',
    ]);
    expect(row!.targetPath).toEqual(['Shared', `Sales ${MARK}`]);
    expect(row!.author.key).toBe(keys['writer']);
    expect([row!.includes, row!.replaces, row!.decision, row!.landedVersion]).toEqual([
      [],
      null,
      null,
      null,
    ]);
  });

  it('lists the author’s own among those they may decide, marked as theirs, and theirs in every state', async () => {
    const { toReview, mine } = await reviews('writer');
    expect(toReview.map((row) => [row.id, row.yours])).toEqual([[ids.waiting, true]]);
    // Newest first.
    expect(mine.map((row) => [row.id, row.status])).toEqual([
      [ids.waiting, 'open'],
      [ids.rejected, 'rejected'],
      [ids.approved, 'approved'],
    ]);
    const rejected = mine.find((row) => row.id === ids.rejected)!;
    expect(rejected.decision?.reason).toBe('Keep the median.');
    const decider = await as('many', { method: 'GET', url: '/api/me' });
    expect(rejected.decision?.by.name).toBe(decider.json<{ name: string }>().name);
    // Approved as the version it landed as.
    expect(mine.find((row) => row.id === ids.approved)!.landedVersion).toBe(1);
  });

  it('gives a Super-Admin every open one, and a reader none', async () => {
    const all = await reviews('super');
    expect(all.toReview.map((row) => row.id).toSorted()).toEqual(
      [ids.waiting, ids.elsewhere].toSorted(),
    );
    expect(all.toReview.find((row) => row.id === ids.elsewhere)!.targetPath).toEqual([
      'Shared',
      `Finance ${MARK}`,
    ]);
    expect(await reviews('reader')).toEqual({ toReview: [], mine: [] });
    const finance = await reviews('manager');
    expect(finance.toReview.map((row) => row.id)).toEqual([ids.elsewhere]);
  });

  it('never carries an item’s content', async () => {
    const answer = await as('super', { method: 'GET', url: '/api/reviews' });
    expect(answer.body).not.toContain('"snapshot"');
  });

  it('lists a dashboard only for those who may write every folder it lands in, by its path, with what goes with it', async () => {
    const make = async (payload: Record<string, unknown>) => {
      const answer = await as('writer', { method: 'POST', url: '/api/documents', payload });
      expect(answer.statusCode, answer.body).toBe(201);
      return answer.json<{ id: string }>().id;
    };
    // Into EMEA, below Sales; showing its own chart, and a library chart
    // that lands in Ledger, which `many` doesn't write.
    const board = await make({
      kind: 'dashboard',
      title: `Bundle ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.emea,
    });
    const library = await make({
      kind: 'chart',
      title: `Ledger chart ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.ledger,
    });
    const own = randomUUID();
    made.push({ kind: 'chart', id: own });
    await docs().create({
      kind: 'chart',
      id: own,
      body: { owner: keys['writer'], title: `Own ${MARK}`, localToDashboardId: board },
    });
    const stored = (await docs().get('dashboard', board))!;
    await docs().update({
      kind: 'dashboard',
      id: board,
      body: {
        ...stored.body,
        // What it holds, which no list may carry.
        notes: `CANARY-${MARK}`,
        pages: [
          {
            id: 'p1',
            items: [
              { id: 't1', kind: 'chart', chartId: library },
              { id: 't2', kind: 'chart', chartId: own },
            ],
          },
        ],
        charts: [own],
      },
      expectedVersion: stored.version,
    });
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: board },
    });
    expect(answer.statusCode, answer.body).toBe(201);
    const bundle = answer.json<{ id: string }>().id;

    // `writer` writes EMEA and Ledger; `super` writes all; `many` not Ledger.
    const row = (await reviews('writer')).toReview.find((each) => each.id === bundle)!;
    expect(row.targetPath).toEqual(['Shared', `Sales ${MARK}`, `EMEA ${MARK}`]);
    // Its own chart is part of it; the library chart goes with it.
    expect(row.includes).toEqual([{ kind: 'chart', title: `Ledger chart ${MARK}` }]);
    expect((await reviews('super')).toReview.map((each) => each.id)).toContain(bundle);
    expect((await reviews('many')).toReview.map((each) => each.id)).not.toContain(bundle);
    // The list agrees with who may decide it (T351).
    for (const who of ['writer', 'many']) {
      const opened = await as(who, { method: 'GET', url: `/api/proposals/${bundle}` });
      const listed = (await reviews(who)).toReview.some((each) => each.id === bundle);
      expect(
        opened.statusCode === 200 && opened.json<{ mayApprove: boolean }>().mayApprove,
        who,
      ).toBe(listed);
    }
    for (const who of ['super', 'writer', 'many', 'manager', 'reader'])
      expect((await as(who, { method: 'GET', url: '/api/reviews' })).body, who).not.toContain(
        `CANARY-${MARK}`,
      );
  });

  it('counts for the top bar what To review lists', async () => {
    for (const who of ['super', 'writer', 'many', 'manager', 'reader']) {
      const listed = (await as(who, { method: 'GET', url: '/api/reviews' })).json<{
        toReview: unknown[];
      }>().toReview.length;
      const counted = await as(who, { method: 'GET', url: '/api/reviews/count' });
      expect(counted.statusCode).toBe(200);
      expect(counted.json<{ waiting: number }>().waiting, who).toBe(listed);
    }
  });
});
