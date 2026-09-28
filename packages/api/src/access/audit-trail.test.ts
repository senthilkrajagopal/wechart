import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T369 (AC-295; design 08 of 2026-09-27, pins 2–9): the audit trail's API.
 * A Super-Admin gets the records newest first, filtered by user, event,
 * folder (with its subfolders when asked) and time, a page at a time, each
 * with its folder's path, and the retention the deployment keeps them for.
 * Nobody else gets anything.
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
  auditRetentionDays: 90,
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const MARK = `trail${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const audit = () => auditStore(getDb());
const ids = { sales: '', emea: '' };
const ada = { key: `ada-${MARK}`, name: 'Ada Admin', identity: `ada-${MARK}@corp.example` };
const wren = { key: `wren-${MARK}`, name: 'Wren Writer', identity: `wren-${MARK}@corp.example` };
const cy = { key: `cy-${MARK}`, name: 'Cy Writer' };
let app: FastifyInstance;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  for (const [key, title, parent] of [
    ['sales', `Sales ${MARK}`, 'root'],
    ['emea', 'EMEA', ''],
  ] as const) {
    ids[key] = randomUUID();
    await docs().create({
      kind: 'folder',
      id: ids[key],
      body: { owner: 'admin', title, folderId: parent === '' ? ids.sales : parent },
    });
  }
  const at = (iso: string) => new Date(iso);
  for (const entry of [
    {
      at: at('2026-09-20T10:00:00Z'),
      actor: ada,
      event: 'approval' as const,
      folderId: ids.sales,
      summary: 'Approved version 7',
    },
    {
      at: at('2026-09-25T10:00:00Z'),
      actor: wren,
      event: 'data-source-change' as const,
      folderId: ids.emea,
      summary: 'Host changed; password replaced',
    },
    {
      at: at('2026-09-26T10:00:00Z'),
      actor: ada,
      event: 'access-change' as const,
      folderId: ids.emea,
      summary: 'Added read-write group emea-analysts',
    },
    {
      at: at('2026-09-27T10:00:00Z'),
      actor: wren,
      event: 'sign-in' as const,
      folderId: null,
      summary: 'Signed in',
    },
  ])
    await audit().record({ ...entry, item: null });

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    audit: audit(),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb()
    .deleteFrom('audit_records')
    .where('actor_key', 'in', [ada.key, wren.key, cy.key])
    .execute();
  await docs().remove('folder', ids.emea);
  await docs().remove('folder', ids.sales);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
type Page = {
  records: {
    summary: string;
    at: string;
    folderPath: { id: string; title: string }[] | null;
    inWorkspace?: true;
    actor: { key: string; name: string; identity?: string } | null;
  }[];
  next?: string;
  total: number;
  retentionDays: number;
};
/** This file's records alone, others' kept out by naming its two people unless a query names one. */
const trail = async (query: string) => {
  const users = query.includes('users=') ? '' : `users=${ada.key},${wren.key}&`;
  const answer = await as('super', { method: 'GET', url: `/api/audit?${users}${query}` });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<Page>();
};
const summaries = async (query: string) => (await trail(query)).records.map((r) => r.summary);

describe('the audit trail’s API (T369, AC-295)', () => {
  it('lists the records newest first, each with its folder’s path, and the retention', async () => {
    const page = await trail('');
    expect(page.records.map((record) => record.summary)).toEqual([
      'Signed in',
      'Added read-write group emea-analysts',
      'Host changed; password replaced',
      'Approved version 7',
    ]);
    expect(page.records[1]).toMatchObject({
      at: '2026-09-26T10:00:00.000Z',
      actor: ada,
      folderPath: [
        { id: ids.sales, title: `Sales ${MARK}` },
        { id: ids.emea, title: 'EMEA' },
      ],
    });
    expect(page.records[0]?.folderPath).toBeNull();
    expect(page.retentionDays).toBe(90);
  });

  it('filters by user, events, a folder with or without its subfolders, and time, together', async () => {
    expect(await summaries(`users=${wren.key}`)).toEqual([
      'Signed in',
      'Host changed; password replaced',
    ]);
    expect(await summaries('events=access-change,approval')).toEqual([
      'Added read-write group emea-analysts',
      'Approved version 7',
    ]);
    expect(await summaries(`folder=${ids.sales}`)).toEqual(['Approved version 7']);
    expect(await summaries(`folder=${ids.sales}&subfolders=true`)).toEqual([
      'Added read-write group emea-analysts',
      'Host changed; password replaced',
      'Approved version 7',
    ]);
    expect(
      await summaries(
        `folder=${ids.sales}&subfolders=true&since=2026-09-25T00:00:00Z&until=2026-09-26T00:00:00Z`,
      ),
    ).toEqual(['Host changed; password replaced']);
  });

  it('pages, the next page from where the last ended, each saying how many match in all', async () => {
    const first = await trail('limit=3');
    expect(first.records).toHaveLength(3);
    expect(first.total).toBe(4);
    expect((await trail(`folder=${ids.sales}&subfolders=true`)).total).toBe(3);
    const second = await trail(`limit=3&after=${encodeURIComponent(first.next ?? '')}`);
    expect(second.records.map((record) => record.summary)).toEqual(['Approved version 7']);
    expect(second.next).toBeUndefined();
  });

  it('refuses what it can’t read, rather than guessing', async () => {
    for (const query of [
      'events=nonsense',
      'since=yesterday',
      'limit=0',
      'limit=many',
      // T369's review: none of these may widen or narrow the trail unasked.
      'after=not-a-page',
      `folder=${ids.sales}&folder=${ids.emea}`,
      `folder=${ids.sales}&subfolders=yes`,
      'events=,',
      'users=,',
      'limit=3&limit=4',
    ])
      expect(
        (await as('super', { method: 'GET', url: `/api/audit?${query}` })).statusCode,
        query,
      ).toBe(400);
  });

  it('says where each record happened: Shared, a workspace at any depth, or a folder no longer there', async () => {
    const workspaceFolder = randomUUID();
    await docs().create({
      kind: 'folder',
      id: workspaceFolder,
      body: { owner: cy.key, title: 'Drafts', folderId: `ws:${cy.key}` },
    });
    try {
      // A second apart, so newest first is one order.
      for (const [second, folderId, summary] of [
        [1, 'root', 'In Shared'],
        [2, `ws:${cy.key}`, 'In the workspace'],
        [3, workspaceFolder, 'In a workspace folder'],
        [4, randomUUID(), 'In a folder since deleted'],
      ] as const)
        await audit().record({
          at: new Date(Date.UTC(2026, 8, 27, 12, 0, second)),
          actor: cy,
          event: 'data-source-change',
          folderId,
          item: null,
          summary,
        });
      const page = await trail(`users=${cy.key}`);
      expect(
        page.records.map((record) => [record.summary, record.folderPath, record.inWorkspace]),
      ).toEqual([
        ['In a folder since deleted', null, undefined],
        ['In a workspace folder', null, true],
        ['In the workspace', null, true],
        ['In Shared', [], undefined],
      ]);
    } finally {
      await docs().remove('folder', workspaceFolder);
    }
  });

  it('names everyone the records name, for the User filter', async () => {
    const answer = await as('super', { method: 'GET', url: '/api/audit/people' });
    expect(answer.statusCode).toBe(200);
    const people = answer
      .json<{ key: string }[]>()
      .filter((person) => [ada.key, wren.key].includes(person.key));
    expect(people).toEqual([ada, wren]);
  });

  it('shows nothing to anyone but a Super-Admin', async () => {
    for (const url of ['/api/audit', '/api/audit/people'])
      expect((await as('writer', { method: 'GET', url })).statusCode, url).toBe(403);
  });
});
