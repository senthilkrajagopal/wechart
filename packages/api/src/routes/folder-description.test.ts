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
 * T524 (AC-369): a user who may change a folder gives it a description of up
 * to 1,000 characters, shown under its name in Explore's header and as the
 * second line of its row. One who may not change it can't.
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it.
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

const MARK = `desc${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const cookies: Record<string, string> = {};
const ids = { sales: '', emea: '' };
let app: FastifyInstance;

beforeAll(async () => {
  ids.sales = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      title: `Sales ${MARK}`,
      folderId: 'root',
      owner: 'admin',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  ids.emea = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.emea,
    body: { title: `EMEA ${MARK}`, folderId: ids.sales, owner: 'admin' },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
  });
  for (const who of ['writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const id of [ids.emea, ids.sales]) await docs().remove('folder', id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const describeAs = (who: string, description: unknown) =>
  as(who, {
    method: 'PATCH',
    url: `/api/documents/folder/${ids.emea}`,
    payload: { description },
  });

describe('a folder’s description (T524, AC-369)', () => {
  it('is saved by one who may change the folder, and read back with the folder and on its row', async () => {
    const text = 'Revenue, pipeline and product mix for Europe, refreshed nightly.';
    const saved = await describeAs('writer', text);
    expect(saved.statusCode, saved.body).toBe(200);

    const folders = await as('writer', { method: 'GET', url: '/api/folders' });
    expect(
      folders.json<{ id: string; description?: string | null }[]>().find((f) => f.id === ids.emea)
        ?.description,
    ).toBe(text);
    // Its row in the folder holding it (design 14's P1).
    const rows = await as('writer', { method: 'GET', url: `/api/folders/${ids.sales}/contents` });
    expect(
      rows.json<{ id: string; description: string | null }[]>().find((row) => row.id === ids.emea)
        ?.description,
    ).toBe(text);
    // Its name and place unchanged.
    expect((await docs().get('folder', ids.emea))?.body).toMatchObject({
      title: `EMEA ${MARK}`,
      folderId: ids.sales,
      description: text,
    });
  });

  it('is refused to a reader, who may not change the folder', async () => {
    const before = (await docs().get('folder', ids.emea))?.body['description'];
    const refused = await describeAs('reader', 'Mine now');
    expect(refused.statusCode).toBe(403);
    expect((await docs().get('folder', ids.emea))?.body['description']).toBe(before);
  });

  it('takes 1,000 characters, as code points, and refuses 1,001, saying how many', async () => {
    const most = 'é'.repeat(999) + '😀';
    expect((await describeAs('writer', most)).statusCode).toBe(200);
    const over = await describeAs('writer', `${most}x`);
    expect(over.statusCode).toBe(400);
    expect(over.json()).toEqual({
      error: 'A description is at most 1,000 characters: this one has 1,001.',
    });
    expect((await docs().get('folder', ids.emea))?.body['description']).toBe(most);
  });

  it('is the description route’s alone: a folder’s save keeps it as stored, and a rename keeps it (T524’s review)', async () => {
    const text = `Kept ${MARK}`;
    expect((await describeAs('writer', text)).statusCode).toBe(200);
    const stored = (await docs().get('folder', ids.emea))!;
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/documents/folder/${ids.emea}`,
      payload: {
        body: { ...stored.body, description: 'x'.repeat(5000) },
        version: stored.version,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await docs().get('folder', ids.emea))?.body['description']).toBe(text);
    const renamed = await as('writer', {
      method: 'PATCH',
      url: `/api/documents/folder/${ids.emea}`,
      payload: { title: `EMEA renamed ${MARK}` },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect((await docs().get('folder', ids.emea))?.body['description']).toBe(text);
  });

  it('is cleared by an empty one, and refused when it isn’t text', async () => {
    expect((await describeAs('writer', '   ')).statusCode).toBe(200);
    expect((await docs().get('folder', ids.emea))?.body['description']).toBeUndefined();
    expect((await describeAs('writer', 42)).statusCode).toBe(400);
  });
});
