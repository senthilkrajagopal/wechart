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
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';

/**
 * T352 (AC-288, AC-298; design 05 of 2026-09-27, state I): approving a
 * proposal lands each item in its folder, replacing the item it names, and
 * keeps both the replaced version and the new one, with who proposed it,
 * who approved it, when and the description. A dashboard lands with its
 * charts, showing the folder's charts, never the workspace's. A data source
 * lands with its envelopes as sealed. The workspace item stays, now "in
 * folder as version n" (design 04). Only a decider who may write every
 * folder it lands in may approve (T351).
 *
 * `writer` (`sales-rw`) proposes into /Sales; `many` (`g01`) also writes it
 * and approves; `reader` (`sales-ro`) only reads it.
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

const MARK = `appr${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const versions = () => versionStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '', board: '', local: '', library: '', source: '' };
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
    versions: versions(),
  });
  for (const who of ['writer', 'many', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await db.deleteFrom('audit_records').where('folder_id', '=', ids.sales).execute();
  await db.deleteFrom('item_versions').where('folder_id', '=', ids.sales).execute();
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
      .where('owner', '=', writerKey)
      .execute();
  }
  // What approvals landed in /Sales, besides this file's own.
  await db
    .deleteFrom('documents')
    .where('kind', 'in', ['dashboard', 'chart'])
    .where('folder_id', '=', ids.sales)
    .execute();
  await db.deleteFrom('data_sources').where('folder_id', '=', ids.sales).execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const propose = async (body: Record<string, unknown>) => {
  const answer = await as('writer', { method: 'POST', url: '/api/proposals', payload: body });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
};
const approve = (who: string, id: string) =>
  as(who, { method: 'POST', url: `/api/proposals/${id}/approve`, payload: {} });

describe('approving a proposal (T352, AC-288)', () => {
  it('lands a dashboard with its charts over the folder’s, keeping the replaced version and the new', async () => {
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'dashboard', id: ids.board },
    });
    const copy = copied.json<{ id: string }>().id;
    const stored = (await docs().get('dashboard', copy))!;
    writerKey = (stored.body['folderId'] as string).slice('ws:'.length);
    // Changed in the workspace, keeping their names (AC-288 replaces by name):
    // the dashboard's description, and its library chart's measure.
    await docs().update({
      kind: 'dashboard',
      id: copy,
      body: { ...stored.body, description: `Revenue since July ${MARK}` },
      expectedVersion: stored.version,
    });
    const shown = (await docs().withOrigin('chart', ids.library, [`ws:${writerKey}`]))[0]!;
    await docs().update({
      kind: 'chart',
      id: shown.id,
      body: {
        ...shown.body,
        chart: { source: { cube: 'orders' }, wells: { measures: ['orders.total'] } },
      },
      expectedVersion: (await docs().get('chart', shown.id))!.version,
    });
    const before = (await docs().get('dashboard', ids.board))!;
    const proposalId = await propose({
      kind: 'dashboard',
      id: copy,
      description: 'Adds the monthly view.',
    });

    const answer = await approve('many', proposalId);
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<{ status: string }>().status).toBe('approved');

    // In the folder, in place of what it replaced, showing the folder's charts.
    const landed = (await docs().get('dashboard', ids.board))!;
    expect(landed.version).toBe(before.version + 1);
    expect(landed.body['description']).toBe(`Revenue since July ${MARK}`);
    expect(landed.body['folderId']).toBe(ids.sales);
    expect(landed.body['targetFolderId']).toBeUndefined();
    expect(landed.body['origin']).toBeUndefined();
    const tiles = (landed.body['pages'] as { items: { chartId: string }[] }[])[0]!.items.map(
      (tile) => tile.chartId,
    );
    expect(tiles).toEqual([ids.library, ids.local]);
    expect((await docs().get('chart', ids.library))!.body['chart']).toEqual({
      source: { cube: 'orders' },
      wells: { measures: ['orders.total'] },
    });
    expect((await docs().get('chart', ids.local))!.body['localToDashboardId']).toBe(ids.board);

    // Both versions kept: the one replaced, from before proposals, and the new.
    const kept = await versions().list('dashboard', ids.board);
    expect(
      kept.map((each) => [each.version, each.title, each.author?.key ?? null, each.description]),
    ).toEqual([
      [landed.version, `Revenue ${MARK}`, writerKey, 'Adds the monthly view.'],
      [before.version, `Revenue ${MARK}`, null, null],
    ]);
    expect(kept[0]!.approver).not.toBeNull();
    expect(kept[0]!.approver!.key).not.toBe(writerKey);
    // So is the library chart's.
    expect((await versions().list('chart', ids.library)).map((each) => each.version)).toEqual([
      (await docs().get('chart', ids.library))!.version,
      1,
    ]);
    // A dashboard's version holds its own charts.
    expect((kept[1]!.content['parts'] as { id: string }[]).map((part) => part.id)).toEqual([
      ids.local,
    ]);

    // The workspace item stays, now in the folder as that version (design 04).
    const workspaceItem = (await docs().get('dashboard', copy))!;
    expect(workspaceItem.body['origin']).toMatchObject({
      id: ids.board,
      version: landed.version,
      folderId: ids.sales,
    });

    // In the audit trail, as an approval.
    const records = await auditStore(getDb()).list({
      events: ['approval'],
      folderIds: [ids.sales],
    });
    expect(records.records.find((each) => each.item?.id === copy)?.summary).toBe(
      `Approved “Revenue ${MARK}” as version ${String(landed.version)}, with 2 charts`,
    );

    // Decided once.
    expect((await approve('many', proposalId)).statusCode).toBe(409);
  });

  it('lands a new item as a new one in the folder, its first version kept', async () => {
    const made_ = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Margin ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.sales,
      },
    });
    const chartId = made_.json<{ id: string }>().id;
    const proposalId = await propose({ kind: 'chart', id: chartId });
    const answer = await approve('many', proposalId);
    expect(answer.statusCode, answer.body).toBe(200);
    const landedId = answer.json<{ landed: { kind: string; id: string }[] }>().landed[0]!.id;
    expect(landedId).not.toBe(chartId);
    const landed = (await docs().get('chart', landedId))!;
    expect([landed.body['title'], landed.body['folderId'], landed.body['targetFolderId']]).toEqual([
      `Margin ${MARK}`,
      ids.sales,
      undefined,
    ]);
    expect((await versions().list('chart', landedId)).map((each) => each.version)).toEqual([
      landed.version,
    ]);
  });

  it('shows its reviewer where it lands and each credential unchanged or replaced, never sealed (T356)', async () => {
    // Two shared sources, each copied into the writer's workspace: one
    // proposed as copied, the other with its password entered again.
    const shared = async (name: string) =>
      (
        await sources().create({
          folderId: ids.sales,
          name,
          driver: 'postgres',
          authMethod: 'password',
          fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
          sealed: { password: sealed },
        })
      ).id;
    const kept = await shared(`kept_${MARK}`);
    const replaced = await shared(`replaced_${MARK}`);
    const copyOf = async (id: string) =>
      (await as('writer', { method: 'POST', url: `/api/data-sources/${id}/copy` })).json<{
        id: string;
      }>().id;
    const keptCopy = await copyOf(kept);
    const replacedCopy = await copyOf(replaced);
    const other: SealedV1 = {
      ...sealed,
      ct: Buffer.alloc(272, `other-${MARK}`).toString('base64url'),
    };
    await sources().update(replacedCopy, { sealed: { password: other } });

    const shown = async (id: string) => {
      const proposalId = await propose({ kind: 'data-source', id });
      const answer = await as('many', { method: 'GET', url: `/api/proposals/${proposalId}` });
      expect(answer.statusCode, answer.body).toBe(200);
      expect(answer.body).not.toContain(sealed.ct.slice(0, 16));
      expect(answer.body).not.toContain(other.ct.slice(0, 16));
      return {
        proposalId,
        ...answer.json<{
          targetPath: string[];
          items: { landsInPath: string[]; secretChanges?: Record<string, string> }[];
        }>(),
      };
    };
    const asCopied = await shown(keptCopy);
    expect(asCopied.targetPath).toEqual(['Shared', `Sales ${MARK}`]);
    expect(asCopied.items[0]!.landsInPath).toEqual(['Shared', `Sales ${MARK}`]);
    expect(asCopied.items[0]!.secretChanges).toEqual({ password: 'unchanged' });
    const entered = await shown(replacedCopy);
    expect(entered.items[0]!.secretChanges).toEqual({ password: 'replaced' });
    // Decided, there is nothing to set it against any more (T356's review):
    // what it replaced may be what it landed as.
    expect(
      (
        await as('many', {
          method: 'POST',
          url: `/api/proposals/${entered.proposalId}/reject`,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    const decided = await as('many', {
      method: 'GET',
      url: `/api/proposals/${entered.proposalId}`,
    });
    expect(decided.json<{ items: { secretChanges?: unknown }[] }>().items[0]!.secretChanges).toBe(
      undefined,
    );
  });

  it('lands a data source with its envelopes as sealed, never opened (AC-298)', async () => {
    const copied = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${ids.source}/copy`,
    });
    const copyId = copied.json<{ id: string }>().id;
    const proposalId = await propose({ kind: 'data-source', id: copyId });
    const before = (await sources().get(ids.source))!;
    const answer = await approve('many', proposalId);
    expect(answer.statusCode, answer.body).toBe(200);
    const landed = (await sources().get(ids.source))!;
    expect(landed.version).toBe(before.version + 1);
    expect(landed.folderId).toBe(ids.sales);
    expect([landed.targetFolderId, landed.origin]).toEqual([null, null]);
    expect((await sources().sealedOf(ids.source)).sealed).toEqual({ password: sealed });
    const kept = await versions().list('data-source', ids.source);
    expect(kept.map((each) => each.version)).toEqual([landed.version, before.version]);
    expect(kept[0]!.content['body']).toMatchObject({ sealed: { password: sealed } });
    // The workspace copy is now a copy of what landed, so "Edit in my
    // workspace" finds it (T352's review).
    expect((await sources().get(copyId))!.origin).toEqual({
      id: ids.source,
      version: landed.version,
      folderId: ids.sales,
    });
    // Never back to the browser, nor into the audit trail.
    expect(answer.body).not.toContain(sealed.ct.slice(0, 16));
    const recorded = await auditStore(getDb()).list({
      events: ['approval'],
      folderIds: [ids.sales],
    });
    const record = recorded.records.find((each) => each.item?.id === copyId);
    expect(record?.summary).toBe(
      `Approved “warehouse_${MARK}” as version ${String(landed.version)}`,
    );
    expect(JSON.stringify(record)).not.toContain(sealed.ct.slice(0, 16));
  });

  it('leaves it open, landing nothing, when its folder refuses it', async () => {
    // Proposed as new; a data source of its name reached /Sales meanwhile.
    const name = `ledger_${MARK}`;
    const drafted = await sources().create({
      folderId: `ws:${writerKey}`,
      targetFolderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'ledger-db', port: 5432, database: 'ledger', user: 'cube', ssl: false },
      sealed: { password: sealed },
    });
    const proposalId = await propose({ kind: 'data-source', id: drafted.id });
    const meanwhile = await sources().create({
      folderId: ids.sales,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'other-db', port: 5432, database: 'ledger', user: 'cube', ssl: false },
      sealed: { password: sealed },
    });

    const answer = await approve('many', proposalId);
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `This folder already has a data source named ${name}.`,
    );
    expect((await proposalStore(getDb()).get(proposalId))!.status).toBe('open');
    expect((await sources().inFolder(ids.sales)).filter((each) => each.name === name)).toEqual([
      await sources().get(meanwhile.id),
    ]);
    expect(await versions().list('data-source', meanwhile.id)).toEqual([]);
  });

  it('refuses what changed in its folder since it was proposed, and leaves it open', async () => {
    // One it replaces, moved elsewhere meanwhile: never pulled back over.
    const moved = await doc('chart', {
      schemaVersion: 1,
      title: `Moved ${MARK}`,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const copied = await as('writer', {
      method: 'POST',
      url: '/api/workspace/copies',
      payload: { kind: 'chart', id: moved },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const movedProposal = await propose({ kind: 'chart', id: copied.json<{ id: string }>().id });
    const elsewhere = await doc('folder', { title: `Elsewhere ${MARK}`, folderId: 'root' });
    const before = (await docs().get('chart', moved))!;
    await docs().update({
      kind: 'chart',
      id: moved,
      body: { ...before.body, folderId: elsewhere },
      expectedVersion: before.version,
    });
    const refusedMove = await approve('many', movedProposal);
    expect(refusedMove.statusCode, refusedMove.body).toBe(409);
    expect(refusedMove.json<{ error: string }>().error).toBe(
      `“Moved ${MARK}” changed in its folder since it was proposed. Propose it again.`,
    );
    expect((await docs().get('chart', moved))!.body['folderId']).toBe(elsewhere);
    expect((await proposalStore(getDb()).get(movedProposal))!.status).toBe('open');

    // A new one, whose name the folder took meanwhile: never a second of it.
    const drafted = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Twice ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.sales,
      },
    });
    const newProposal = await propose({ kind: 'chart', id: drafted.json<{ id: string }>().id });
    await doc('chart', {
      schemaVersion: 1,
      title: `Twice ${MARK}`,
      folderId: ids.sales,
      chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
    });
    const refusedNew = await approve('many', newProposal);
    expect(refusedNew.statusCode, refusedNew.body).toBe(409);
    expect(refusedNew.json<{ error: string }>().error).toBe(
      `“Twice ${MARK}” changed in its folder since it was proposed. Propose it again.`,
    );
    expect((await proposalStore(getDb()).get(newProposal))!.status).toBe('open');
  });

  it('is its deciders’ alone, and theirs only while they may write where it lands', async () => {
    const made_ = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: {
        kind: 'chart',
        title: `Hidden ${MARK}`,
        folderId: 'mine',
        targetFolderId: ids.sales,
      },
    });
    const proposalId = await propose({ kind: 'chart', id: made_.json<{ id: string }>().id });
    expect((await approve('reader', proposalId)).statusCode).toBe(404);
    expect((await approve('many', randomUUID())).statusCode).toBe(404);
    expect((await proposalStore(getDb()).get(proposalId))!.status).toBe('open');
  });
});
