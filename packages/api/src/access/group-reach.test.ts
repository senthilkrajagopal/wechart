import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T438 (AC-166; design 08 of 2026-09-27, state E, "What these groups
 * reach"): for the groups a Super-Admin previews as, every folder they
 * reach, by its path, and how — read-write, view only, or only the
 * dashboards of a folder above one they reach — as the folder check reckons
 * it. Anyone else gets nothing.
 *
 *   /Sales       read-only  sales-ro
 *   /Sales/EMEA  read-only  emea-viewers
 *   /Finance     read-write finance
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

const MARK = `reach${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const ids = {
  sales: randomUUID(),
  emea: randomUUID(),
  salesA: randomUUID(),
  finance: randomUUID(),
  budgets: randomUUID(),
};
const groups = {
  salesRo: `sales-ro-${MARK}`,
  emea: `emea-viewers-${MARK}`,
  finance: `finance-${MARK}`,
  // A comma is part of a name (T438's review).
  budgets: `budgets, planning-${MARK}`,
};
const cookies: Record<string, string> = {};
let app: FastifyInstance;

beforeAll(async () => {
  for (const [id, title, parent, access] of [
    [ids.sales, `Sales ${MARK}`, 'root', { readOnly: [groups.salesRo], readWrite: null }],
    [ids.emea, 'EMEA', ids.sales, { readOnly: [groups.emea], readWrite: null }],
    // A sibling whose name runs on from /Sales's, for the order.
    [ids.salesA, `Sales ${MARK}A`, 'root', { readOnly: [groups.salesRo], readWrite: null }],
    [ids.finance, `Finance ${MARK}`, 'root', { readOnly: null, readWrite: [groups.finance] }],
    // Read-write below /Finance: /Finance is seen above it, every item view only.
    [ids.budgets, 'Budgets', ids.finance, { readOnly: null, readWrite: [groups.budgets] }],
  ] as const)
    await docs().create({
      kind: 'folder',
      id,
      body: { owner: 'admin', title, folderId: parent, access },
    });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const id of [ids.emea, ids.sales, ids.salesA, ids.budgets, ids.finance])
    await docs().remove('folder', id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

interface Reached {
  id: string;
  path: string[];
  reach: 'write' | 'view' | 'above';
  write: boolean;
  kinds: 'all' | 'dashboards';
}
/** This file's folders a set of groups reaches, by path, and Shared's own row. */
async function reach(...asked: string[]) {
  const answer = await as('super', {
    method: 'GET',
    url: `/api/access/reach?${asked.map((group) => `groups=${encodeURIComponent(group)}`).join('&')}`,
  });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer
    .json<{ folders: Reached[] }>()
    .folders.filter(
      (folder) => folder.id === 'root' || (Object.values(ids) as string[]).includes(folder.id),
    )
    .map(({ path, reach: how, write, kinds }) => [path.join(' / '), how, write, kinds]);
}

describe('what a set of groups reaches (T438, AC-166)', () => {
  it('names every folder they reach by its path, and how', async () => {
    // View only: a read-only grant shows a folder's dashboards (AC-263), on
    // it and beneath it; Shared, above it, its dashboards; in tree order,
    // /Sales's own before a sibling whose name runs on.
    expect(await reach(groups.salesRo)).toEqual([
      ['Shared', 'above', false, 'dashboards'],
      [`Shared / Sales ${MARK}`, 'view', false, 'dashboards'],
      [`Shared / Sales ${MARK} / EMEA`, 'view', false, 'dashboards'],
      [`Shared / Sales ${MARK}A`, 'view', false, 'dashboards'],
    ]);
    // A folder below reaches the one above it for its dashboards alone.
    expect(await reach(groups.emea)).toEqual([
      ['Shared', 'above', false, 'dashboards'],
      [`Shared / Sales ${MARK}`, 'above', false, 'dashboards'],
      [`Shared / Sales ${MARK} / EMEA`, 'view', false, 'dashboards'],
    ]);
    // Above a read-write grant, every item, view only (AC-262; T438's review).
    // And a comma is part of the group's name.
    expect(await reach(groups.budgets)).toEqual([
      ['Shared', 'above', false, 'all'],
      [`Shared / Finance ${MARK}`, 'above', false, 'all'],
      [`Shared / Finance ${MARK} / Budgets`, 'write', true, 'all'],
    ]);
    expect(await reach()).toEqual([]);
  });

  it('is a Super-Admin’s alone', async () => {
    const answer = await as('writer', {
      method: 'GET',
      url: `/api/access/reach?groups=${groups.salesRo}`,
    });
    expect(answer.statusCode).toBe(403);
  });
});
