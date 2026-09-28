import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
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
import { buildServer } from '../server';

/**
 * T349 (AC-284): a workspace item proposed into its target folder is
 * recorded with what it would land — a dashboard with the charts it shows
 * from the workspace, each to its own folder — as it was when proposed, the
 * folder, the author, the time and an optional description of at most 1,000
 * characters. Each item names what it would replace where it lands: the item
 * of the same kind and name (AC-288), and whether it was copied from that
 * (rule 75). The folders keep serving what they had until approval. An item
 * waits in one open proposal at a time, as its item or going with another's.
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) only reads it
 * and has no workspace; /Hidden is `managers`' alone.
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

const MARK = `prop${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = {
  sales: '',
  hidden: '',
  board: '',
  local: '',
  library: '',
  other: '',
  source: '',
  copy: '',
};
const sealed: SealedV1 = {
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
};
let app: FastifyInstance;
let writerKey = '';

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
            { id: 't2', kind: 'chart', chartId: ids.local },
          ],
        },
      ],
      charts: [ids.local],
    },
    ids.board,
  );
  ids.other = await doc('dashboard', {
    schemaVersion: 1,
    title: `Pipeline ${MARK}`,
    folderId: ids.sales,
    pages: [],
  });
  ids.source = (
    await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed },
    })
  ).id;

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    connectionTests: connectionTestStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
  });
  cookies['writer'] = await signIn(app, USERS['writer']!);
  cookies['reader'] = await signIn(app, USERS['reader']!);
  ids.copy = await copyOf('dashboard', ids.board);
  writerKey = ((await docs().get('dashboard', ids.copy))!.body['folderId'] as string).slice(
    'ws:'.length,
  );
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db
    .deleteFrom('proposals')
    .where('target_folder_id', 'in', [ids.sales, ids.hidden])
    .execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', [ids.sales, ids.hidden]).execute();
  if (writerKey !== '') {
    await db
      .deleteFrom('documents')
      .where('kind', 'in', ['dashboard', 'chart'])
      .where('folder_id', '=', `ws:${writerKey}`)
      .execute();
    await db.deleteFrom('data_sources').where('folder_id', '=', `ws:${writerKey}`).execute();
    await db
      .deleteFrom('documents')
      .where('kind', '=', 'chart')
      .where('local_to_dashboard_id', 'is not', null)
      .where('owner', '=', writerKey)
      .execute();
  }
  if (ids.source !== '') await sources().remove(ids.source);
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const propose = (who: string, body: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/proposals', payload: body });

/** The writer's copy of a shared dashboard or library chart. */
async function copyOf(kind: 'dashboard' | 'chart', id: string): Promise<string> {
  const answer = await as('writer', {
    method: 'POST',
    url: '/api/workspace/copies',
    payload: { kind, id },
  });
  expect(answer.statusCode, answer.body).toBeLessThan(300);
  return answer.json<{ id: string }>().id;
}

/** A dashboard or chart made new in the writer's workspace, to go to `target`. */
async function made_(kind: 'dashboard' | 'chart', title: string, target = ids.sales) {
  const answer = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind, title, folderId: 'mine', targetFolderId: target },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
}

/** The writer's GET of a shared document, as the folder serves it. */
const served = async (kind: string, id: string) =>
  (await as('writer', { method: 'GET', url: `/api/documents/${kind}/${id}` })).json<unknown>();

type Replacing = { id: string; version: number; copiedFrom: boolean } | null;
interface Answer {
  id: string;
  kind: string;
  itemId: string;
  title: string;
  targetFolderId: string;
  author: { key: string; name: string };
  description: string | null;
  proposedAt: string;
  status: string;
  replaces: Replacing;
  items: {
    kind: string;
    id: string;
    title: string;
    version: number;
    landsIn: string;
    replaces: Replacing;
    snapshot?: Record<string, unknown>;
  }[];
}

describe('proposing a workspace item (T349, AC-284)', () => {
  it('records a dashboard with the charts it shows from the workspace, what each replaces, the author, the time and the description', async () => {
    const copy = ids.copy;
    const stored = (await docs().get('dashboard', copy))!;
    const shown = (await docs().withOrigin('chart', ids.library, [`ws:${writerKey}`]))[0]!;
    const local = (await docs().withOrigin('chart', ids.local))[0]!;
    const before = {
      board: await served('dashboard', ids.board),
      library: await served('chart', ids.library),
      local: await served('chart', ids.local),
    };
    const original = (await docs().get('dashboard', ids.board))!;

    const at = Date.now();
    const answer = await propose('writer', {
      kind: 'dashboard',
      id: copy,
      description:
        'Adds a monthly EMEA revenue chart by country.\nAvg order value now uses the mean.',
    });
    expect(answer.statusCode, answer.body).toBe(201);
    const proposal = answer.json<Answer>();
    expect(proposal).toMatchObject({
      kind: 'dashboard',
      itemId: copy,
      title: `Revenue ${MARK}`,
      targetFolderId: ids.sales,
      author: { key: writerKey },
      description:
        'Adds a monthly EMEA revenue chart by country.\nAvg order value now uses the mean.',
      status: 'open',
      replaces: { id: ids.board, version: original.version, copiedFrom: true },
    });
    expect(new Date(proposal.proposedAt).getTime()).toBeGreaterThanOrEqual(at - 1000);
    // The item first, then the charts it shows from the workspace, each
    // naming where it lands and what it replaces there.
    expect(
      proposal.items.map((item) => [
        item.kind,
        item.id,
        item.version,
        item.landsIn,
        item.replaces?.id ?? null,
        item.replaces?.copiedFrom ?? null,
      ]),
    ).toEqual([
      ['dashboard', copy, stored.version, ids.sales, ids.board, true],
      ['chart', shown.id, shown.version, ids.sales, ids.library, true],
      ['chart', local.id, local.version, ids.sales, ids.local, true],
    ]);

    // As it was when proposed: a later save isn't in it (design 05, state M).
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/dashboard/${copy}`,
      payload: {
        body: { ...stored.body, folderId: 'mine', title: `Revenue ${MARK} v2` },
        version: stored.version,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const kept = (await proposalStore(getDb()).get(proposal.id))!;
    expect(kept.items[0]!.snapshot['title']).toBe(`Revenue ${MARK}`);
    expect(kept.author.name).not.toBe('');

    // The folder keeps serving what it had: the dashboard and both its charts.
    expect(await served('dashboard', ids.board)).toEqual(before.board);
    expect(await served('chart', ids.library)).toEqual(before.library);
    expect(await served('chart', ids.local)).toEqual(before.local);

    // Recorded in the audit trail (T368's note), holding no credential.
    const records = await auditStore(getDb()).list({
      events: ['proposal'],
      folderIds: [ids.sales],
    });
    const record = records.records.find((each) => each.item?.id === copy);
    expect(record).toMatchObject({
      actor: { key: writerKey },
      event: 'proposal',
      folderId: ids.sales,
      item: { kind: 'dashboard', id: copy, title: `Revenue ${MARK}` },
      details: { proposalId: proposal.id },
    });
    expect(record!.summary).toBe(
      `Proposed to Sales ${MARK}, replacing version ${String(original.version)}, with 2 charts`,
    );

    // One open proposal at a time: the item itself, and a chart going with it.
    const again = await propose('writer', { kind: 'dashboard', id: copy });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json<{ proposalId: string }>().proposalId).toBe(proposal.id);
    const chart = await propose('writer', { kind: 'chart', id: shown.id });
    expect(chart.statusCode, chart.body).toBe(409);
    expect(chart.json<{ proposalId: string }>().proposalId).toBe(proposal.id);
  });

  it('refuses a description over 1,000 characters, and records nothing; a blank one is none', async () => {
    const id = await made_('chart', `Long ${MARK}`);
    const answer = await propose('writer', { kind: 'chart', id, description: 'a'.repeat(1001) });
    expect(answer.statusCode).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'A description is at most 1,000 characters: this one has 1,001.',
    );
    expect(await proposalStore(getDb()).openFor('chart', id)).toBeNull();
    expect((await propose('writer', { kind: 'chart', id, description: 42 })).statusCode).toBe(400);
    // 1,000 fits.
    const fits = await propose('writer', { kind: 'chart', id, description: 'a'.repeat(1000) });
    expect(fits.statusCode, fits.body).toBe(201);

    const blank = await made_('chart', `Blank ${MARK}`);
    const none = await propose('writer', { kind: 'chart', id: blank, description: '  \n ' });
    expect(none.statusCode, none.body).toBe(201);
    expect(none.json<Answer>().description).toBeNull();
  });

  it('replaces the item of the same kind and name, saying when it wasn’t copied from it, and none for a new name', async () => {
    // Made new, under a name the folder has.
    const same = await made_('dashboard', `Revenue ${MARK}`);
    const replacing = await propose('writer', { kind: 'dashboard', id: same });
    expect(replacing.statusCode, replacing.body).toBe(201);
    const current = (await docs().get('dashboard', ids.board))!;
    expect(replacing.json<Answer>().replaces).toEqual({
      id: ids.board,
      version: current.version,
      copiedFrom: false,
    });

    // A copy renamed: the name decides, not what it was copied from (AC-288).
    const renamed = await copyOf('dashboard', ids.other);
    const stored = (await docs().get('dashboard', renamed))!;
    await docs().update({
      kind: 'dashboard',
      id: renamed,
      body: { ...stored.body, title: `Forecast ${MARK}` },
      expectedVersion: stored.version,
    });
    const answer = await propose('writer', { kind: 'dashboard', id: renamed });
    expect(answer.statusCode, answer.body).toBe(201);
    expect(answer.json<Answer>().replaces).toBeNull();
  });

  it('keeps a data source’s credentials sealed, byte for byte, in what it would land (AC-298)', async () => {
    const copy = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${ids.source}/copy`,
    });
    expect(copy.statusCode, copy.body).toBe(201);
    const id = copy.json<{ id: string }>().id;
    const answer = await propose('writer', { kind: 'data-source', id });
    expect(answer.statusCode, answer.body).toBe(201);
    const original = (await sources().get(ids.source))!;
    expect(answer.json<Answer>().replaces).toEqual({
      id: ids.source,
      version: original.version,
      copiedFrom: true,
    });
    const kept = (await proposalStore(getDb()).get(answer.json<Answer>().id))!;
    expect(kept.items[0]!.snapshot).toMatchObject({
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: original.fields,
      sealed: { password: sealed },
    });
    // Opened by a decider (T351), its settings show, and each credential only
    // as stored (rule 83).
    const opened = await as('writer', {
      method: 'GET',
      url: `/api/proposals/${answer.json<Answer>().id}`,
    });
    expect(opened.statusCode, opened.body).toBe(200);
    const shown = opened.json<{ items: { snapshot: Record<string, unknown> }[] }>().items[0]!;
    expect(shown.snapshot['secrets']).toEqual(['password']);
    expect([shown.snapshot['name'], shown.snapshot['driver'], shown.snapshot['fields']]).toEqual([
      `warehouse_${MARK}`,
      'postgres',
      original.fields,
    ]);
    expect(Object.keys(shown.snapshot)).not.toContain('sealed');
    expect(Object.keys(shown.snapshot)).not.toContain('revisions');

    // Never sent back to the browser, nor kept in the audit trail.
    const records = await auditStore(getDb()).list({
      events: ['proposal'],
      folderIds: [ids.sales],
    });
    const record = JSON.stringify(records.records.find((each) => each.item?.id === id));
    for (const text of [answer.body, opened.body, record])
      for (const part of [sealed.ct.slice(0, 16), sealed.enc.slice(0, 16), '"kid-1"'])
        expect(text).not.toContain(part);
  });

  it('refuses a chart it shows that goes to a folder the author can’t propose into', async () => {
    const elsewhere = await doc('chart', {
      schemaVersion: 1,
      title: `Churn ${MARK}`,
      folderId: `ws:${writerKey}`,
      targetFolderId: ids.hidden,
      owner: writerKey,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const board = await doc('dashboard', {
      schemaVersion: 1,
      title: `Mixed ${MARK}`,
      folderId: `ws:${writerKey}`,
      targetFolderId: ids.sales,
      owner: writerKey,
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: elsewhere }] }],
    });
    const answer = await propose('writer', { kind: 'dashboard', id: board });
    expect(answer.statusCode, answer.body).toBe(403);
    expect(answer.json<{ error: string }>().error).toContain(`Churn ${MARK}`);
    expect(await proposalStore(getDb()).openFor('dashboard', board)).toBeNull();
  });

  it('refuses what isn’t the user’s own workspace item to propose', async () => {
    // A shared item is changed through a copy.
    const shared = await propose('writer', { kind: 'dashboard', id: ids.board });
    expect(shared.statusCode).toBe(400);
    // A chart on a dashboard goes with its dashboard.
    const local = (await docs().withOrigin('chart', ids.local))[0]!;
    expect((await propose('writer', { kind: 'chart', id: local.id })).statusCode).toBe(400);
    // One that isn't there, or isn't theirs to see.
    expect((await propose('writer', { kind: 'dashboard', id: randomUUID() })).statusCode).toBe(404);
    // Someone with no workspace, as the copy route says it (AC-277).
    expect((await propose('reader', { kind: 'dashboard', id: ids.board })).statusCode).toBe(403);
    // A kind that can't be proposed, or no id.
    expect((await propose('writer', { kind: 'folder', id: ids.sales })).statusCode).toBe(400);
    expect((await propose('writer', { kind: 'dashboard' })).statusCode).toBe(400);
  });

  it('refuses a target the author may no longer write, or one no longer there', async () => {
    const hidden = await doc('dashboard', {
      schemaVersion: 1,
      title: `Elsewhere ${MARK}`,
      folderId: `ws:${writerKey}`,
      targetFolderId: ids.hidden,
      owner: writerKey,
      pages: [],
    });
    expect((await propose('writer', { kind: 'dashboard', id: hidden })).statusCode).toBe(403);
    const gone = await doc('dashboard', {
      schemaVersion: 1,
      title: `Gone ${MARK}`,
      folderId: `ws:${writerKey}`,
      targetFolderId: randomUUID(),
      owner: writerKey,
      pages: [],
    });
    expect((await propose('writer', { kind: 'dashboard', id: gone })).statusCode).toBe(404);
  });
});

describe('proposals with sign-in off', () => {
  it('are not there, as workspaces aren’t (T359 brings them)', async () => {
    const off = buildServer({
      config: { ...secured, security: 'off' as const },
      documents: docs(),
      catalog: catalog(getDb()),
      proposals: proposalStore(getDb()),
    });
    try {
      const answer = await off.inject({
        method: 'POST',
        url: '/api/proposals',
        payload: { kind: 'dashboard', id: ids.board },
      });
      expect(answer.statusCode).toBe(404);
      expect(answer.json<{ error: string }>().error).toBe('Proposals need sign-in.');
      // Nor is a proposal to open (T351's review), reject (T353), or show on an item.
      for (const [method, url] of [
        ['GET', `/api/proposals/${randomUUID()}`],
        ['POST', `/api/proposals/${randomUUID()}/reject`],
        ['GET', `/api/proposals?kind=dashboard&itemId=${ids.board}`],
      ] as const) {
        const answer = await off.inject({ method, url });
        expect(answer.statusCode, url).toBe(404);
        expect(answer.json<{ error: string }>().error, url).toBe('Proposals need sign-in.');
      }
    } finally {
      await off.close();
    }
  });
});
