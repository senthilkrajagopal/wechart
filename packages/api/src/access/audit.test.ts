import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore, type AuditRecord } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T368 (AC-294, AC-298; design 08 of 2026-09-27): a sign-in, a folder's
 * access changed, and a data source made, changed or removed are each
 * recorded with who, what, which folder and when. A data-source change says
 * what changed, a secret only "replaced", never its value or its envelope.
 * (Proposals, approvals, rejections and restores are recorded as each is
 * built: T349, T352, T353, T354.)
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

const MARK = `audit${randomUUID().slice(0, 8)}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const PASSING = { ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] };
const FIELDS = { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true };

const docs = () => documents(getDb());
const audit = () => auditStore(getDb());
const started = new Date();
let app: FastifyInstance;
const cookies: Record<string, string> = {};
let folderId = '';

beforeAll(async () => {
  folderId = randomUUID();
  await docs().create({
    kind: 'folder',
    id: folderId,
    body: {
      owner: 'admin',
      title: `Audited ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () => PASSING as never,
    audit: audit(),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('data_sources').where('name', 'like', `${MARK}%`).execute();
  await getDb().deleteFrom('audit_records').where('folder_id', '=', folderId).execute();
  // And the sign-ins this file made, which name no folder.
  await getDb()
    .deleteFrom('audit_records')
    .where('event', '=', 'sign-in')
    .where('at', '>=', started)
    .where('actor_identity', 'in', [USERS['super']!.email, USERS['writer']!.email])
    .execute();
  await docs().remove('folder', folderId);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
/** The records since this file began, of these events, newest first. */
const recorded = async (events: AuditRecord['event'][]) =>
  (await audit().list({ events: [...events], since: started })).records;

describe('a data source copied into a workspace (T368’s review)', () => {
  it('is recorded where its original is, from the version it was copied from', async () => {
    const held = await dataSourceStore(getDb()).create({
      folderId,
      name: `${MARK}_held`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('held') },
    });
    const copied = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${held.id}/copy`,
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copyId = copied.json<{ id: string }>().id;
    try {
      const [record] = (await recorded(['data-source-change'])).filter(
        (each) => each.item?.id === copyId,
      );
      expect(record).toMatchObject({
        actor: { identity: USERS['writer']!.email },
        folderId,
        item: { kind: 'data-source', id: copyId, title: `${MARK}_held` },
        summary: 'Copied into a workspace, from version 1',
      });
    } finally {
      await dataSourceStore(getDb()).remove(copyId);
    }
  });
});

describe('what the audit trail records (T368, AC-294)', () => {
  it('records each sign-in, by whom', async () => {
    const signIns = await recorded(['sign-in']);
    for (const who of ['super', 'writer'])
      expect(
        signIns.some((record) => record.actor?.identity === USERS[who]!.email),
        who,
      ).toBe(true);
    expect(
      signIns.find((record) => record.actor?.identity === USERS['writer']!.email),
    ).toMatchObject({ folderId: null, item: null, summary: 'Signed in' });
  });

  it('records a folder’s access changed, with its groups before and after', async () => {
    const changed = await as('super', {
      method: 'PUT',
      url: `/api/folders/${folderId}/access`,
      payload: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'emea-analysts'] },
    });
    expect(changed.statusCode, changed.body).toBe(200);

    const [record] = (await recorded(['access-change'])).filter(
      (each) => each.folderId === folderId,
    );
    expect(record).toMatchObject({
      actor: { identity: USERS['super']!.email },
      event: 'access-change',
      folderId,
      item: { kind: 'folder', id: folderId, title: `Audited ${MARK}` },
      summary: 'Added read-write group emea-analysts',
      details: {
        readOnly: { before: ['sales-ro'], after: ['sales-ro'] },
        readWrite: { before: ['sales-rw'], after: ['sales-rw', 'emea-analysts'] },
      },
    });
  });

  it('records a data source made, changed and removed, a secret only said replaced', async () => {
    const name = `${MARK}_replica`;
    const settings = {
      folderId,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('first') },
    };
    const trial = await as('writer', {
      method: 'POST',
      url: '/api/data-sources/test',
      payload: settings,
    });
    const made = await as('writer', {
      method: 'POST',
      url: '/api/data-sources',
      payload: { ...settings, name, testId: trial.json<{ testId: string }>().testId },
    });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json<{ id: string }>().id;

    const change = { fields: { ...FIELDS, host: 'db2' }, sealed: { password: sealed('second') } };
    // Refused, as untested: nothing done, so nothing recorded.
    const untested = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload: change,
    });
    expect(untested.statusCode).toBe(422);
    expect(
      (await recorded(['data-source-change'])).filter((each) => each.item?.id === id),
    ).toHaveLength(1);
    const tested = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${id}/test`,
      payload: change,
    });
    const saved = await as('writer', {
      method: 'PUT',
      url: `/api/data-sources/${id}`,
      payload: { ...change, testId: tested.json<{ testId: string }>().testId },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(
      (await as('writer', { method: 'DELETE', url: `/api/data-sources/${id}` })).statusCode,
    ).toBe(204);

    const records = (await recorded(['data-source-change'])).filter((each) => each.item?.id === id);
    expect(records.map((record) => record.summary)).toEqual([
      'Removed',
      'Host changed; password replaced',
      'Made, from a passing test',
    ]);
    expect(records[1]).toMatchObject({
      actor: { identity: USERS['writer']!.email },
      folderId,
      item: { kind: 'data-source', id, title: name },
      details: {
        changes: [
          { setting: 'Host', before: 'db', after: 'db2' },
          { setting: 'Password', before: null, after: 'replaced' },
        ],
      },
    });
    // Saved from its passing test, which the record names (design 08 state A).
    expect(records[1]?.details).toMatchObject({
      testId: tested.json<{ testId: string }>().testId,
    });
    // No credential is kept (AC-298): no envelope's key id, nor any stretch of
    // its ciphertext or key, in any record this file made.
    const kept = JSON.stringify(
      (await audit().list({ since: started, limit: 500 })).records.filter(
        (record) => record.folderId === folderId || record.event === 'sign-in',
      ),
    );
    expect(kept).not.toContain('kid-1');
    for (const tag of ['first', 'second'])
      for (const part of [sealed(tag).ct, sealed(tag).enc])
        for (let at = 0; at + 16 <= part.length; at += 16)
          expect(kept).not.toContain(part.slice(at, at + 16));
  });
});
