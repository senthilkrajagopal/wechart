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

/**
 * T353 (AC-290; design 05 of 2026-09-27, states J, K, M): rejecting a
 * proposal leaves its folder as it was and the work in its author's
 * workspace, with the decider's reason of at most 1,000 characters, which
 * the author's item shows. The author rejecting their own withdraws it. Only
 * its deciders (T351) may; a decided one is decided. Each is in the audit
 * trail. Once decided, the item may be proposed again.
 *
 * `writer` (`sales-rw`) proposes into /Sales; `many` (`g01`) also writes it;
 * `reader` (`sales-ro`) only reads it.
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

const MARK = `rej${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const charts: string[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;
let sales = '';

beforeAll(async () => {
  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'g01'] },
    },
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
  for (const who of ['writer', 'many', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', sales).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', '=', sales).execute();
  if (charts.length > 0)
    await getDb()
      .deleteFrom('documents')
      .where('kind', '=', 'chart')
      .where('id', 'in', charts)
      .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A chart made in the writer's workspace for /Sales, and proposed there. */
async function proposed(title: string) {
  const chart = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'chart', title, folderId: 'mine', targetFolderId: sales },
  });
  expect(chart.statusCode, chart.body).toBe(201);
  const chartId = chart.json<{ id: string }>().id;
  charts.push(chartId);
  const answer = await as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'chart', id: chartId, description: `Adds ${title}.` },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return { chartId, proposalId: answer.json<{ id: string }>().id };
}

const reject = (who: string, id: string, payload: Record<string, unknown> = {}) =>
  as(who, { method: 'POST', url: `/api/proposals/${id}/reject`, payload });

interface Decided {
  status: string;
  decision: { by: { key: string; name: string }; at: string; reason: string | null } | null;
}

describe('rejecting a proposal (T353, AC-290)', () => {
  it('returns it to its author with the decider’s reason, the folder and the item as they were', async () => {
    const { chartId, proposalId } = await proposed(`Margin ${MARK}`);
    const itemBefore = await docs().get('chart', chartId);
    const before = await as('writer', { method: 'GET', url: `/api/folders/${sales}/contents` });

    const answer = await reject('many', proposalId, {
      reason: 'Please keep Avg order value as the median.',
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<Decided>()).toMatchObject({
      status: 'rejected',
      decision: { reason: 'Please keep Avg order value as the median.' },
    });
    // Decided by the member who rejected it, not its author.
    const decider = answer.json<Decided>().decision!.by;
    const author = (await proposalStore(getDb()).get(proposalId))!.author;
    expect(decider.key).not.toBe(author.key);
    expect(decider.name).not.toBe('');

    // Nothing moved: the folder serves what it did, and the work is the author's still.
    expect(
      (await as('writer', { method: 'GET', url: `/api/folders/${sales}/contents` })).body,
    ).toBe(before.body);
    expect(await docs().get('chart', chartId)).toEqual(itemBefore);

    // The author's item shows it: its latest proposal, decided, with the reason (state M).
    const latest = await as('writer', {
      method: 'GET',
      url: `/api/proposals?kind=chart&itemId=${chartId}`,
    });
    expect(latest.statusCode, latest.body).toBe(200);
    const shown = latest.json<Decided & { id: string }>();
    expect([shown.id, shown.status, shown.decision?.reason, shown.decision?.by]).toEqual([
      proposalId,
      'rejected',
      'Please keep Avg order value as the median.',
      decider,
    ]);
    expect(Number.isNaN(Date.parse(shown.decision!.at))).toBe(false);

    // In the audit trail, in the folder, naming the decider.
    const records = await auditStore(getDb()).list({ events: ['rejection'], folderIds: [sales] });
    const record = records.records.find((each) => each.item?.id === chartId);
    expect(record?.summary).toBe(
      `Rejected “Margin ${MARK}”: Please keep Avg order value as the median.`,
    );
    expect(record?.actor?.key).toBe(decider.key);

    // Decided once: a second decision is refused. And the item may be proposed again.
    expect((await reject('many', proposalId)).statusCode).toBe(409);
    const again = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'chart', id: chartId },
    });
    expect(again.statusCode, again.body).toBe(201);
  });

  it('is withdrawn when its author rejects their own, a reason optional (state K)', async () => {
    const { chartId, proposalId } = await proposed(`Churn ${MARK}`);
    const answer = await reject('writer', proposalId);
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<Decided>()).toMatchObject({
      status: 'withdrawn',
      decision: { reason: null },
    });
    const records = await auditStore(getDb()).list({ events: ['rejection'], folderIds: [sales] });
    expect(records.records.find((each) => each.item?.id === chartId)?.summary).toBe(
      `Withdrew “Churn ${MARK}”`,
    );
  });

  it('refuses a reason over 1,000 characters, and decides nothing', async () => {
    const { proposalId } = await proposed(`Long ${MARK}`);
    const answer = await reject('many', proposalId, { reason: 'a'.repeat(1001) });
    expect(answer.statusCode).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'A reason is at most 1,000 characters: this one has 1,001.',
    );
    expect((await proposalStore(getDb()).get(proposalId))!.status).toBe('open');
    expect((await reject('many', proposalId, { reason: 42 })).statusCode).toBe(400);
    // Nothing Postgres can't hold (T353's review): a NUL is refused, not a 500.
    expect((await reject('many', proposalId, { reason: 'a\u0000b' })).statusCode).toBe(400);
    // Exactly 1,000 code points fit, some outside the basic plane (T353's review).
    const fits = '😀'.repeat(10) + 'a'.repeat(990);
    const answer1000 = await reject('many', proposalId, { reason: fits });
    expect(answer1000.statusCode, answer1000.body).toBe(200);
    expect(answer1000.json<Decided>().decision?.reason).toBe(fits);
  });

  it('lets one of two decisions at once stand, and records it once (T353’s review)', async () => {
    const { chartId, proposalId } = await proposed(`Twice ${MARK}`);
    const answers = await Promise.all([
      reject('many', proposalId, { reason: 'First.' }),
      reject('many', proposalId, { reason: 'Second.' }),
    ]);
    expect(answers.map((each) => each.statusCode).toSorted()).toEqual([200, 409]);
    const records = await auditStore(getDb()).list({ events: ['rejection'], folderIds: [sales] });
    expect(records.records.filter((each) => each.item?.id === chartId)).toHaveLength(1);
  });

  it('is its deciders’ alone: anyone else finds no such proposal', async () => {
    const { proposalId } = await proposed(`Hidden ${MARK}`);
    expect((await reject('reader', proposalId)).statusCode).toBe(404);
    expect((await reject('many', randomUUID())).statusCode).toBe(404);
    expect((await proposalStore(getDb()).get(proposalId))!.status).toBe('open');
    // Nor the item's latest, which is its author's.
    const chart = (await proposalStore(getDb()).get(proposalId))!.itemId;
    expect(
      (await as('many', { method: 'GET', url: `/api/proposals?kind=chart&itemId=${chart}` }))
        .statusCode,
    ).toBe(404);
  });
});
