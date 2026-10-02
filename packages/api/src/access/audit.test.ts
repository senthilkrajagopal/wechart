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
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { removeProjectFolders, TEST_TIME_ZONE } from '../routes/project-folder.fixture';
import { buildServer } from '../server';

/**
 * T368 (AC-294, AC-298; design 08 of 2026-09-27): a sign-in, a folder's
 * access changed, and a data source made, changed or removed are each
 * recorded with who, what, which folder and when. A data-source change says
 * what changed, a secret only "replaced", never its value or its envelope.
 * A proposal, its approval, a rejection, a withdrawal and a restore, which
 * T349, T352, T353 and T354 record, are driven here too, so the seven kinds
 * AC-294 named first are shown together (2026-10-02). R42's three, builds,
 * cancels and schedule changes, are T505's.
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
    // Proposals, their decisions and restores, with their versions (T349–T354).
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('data_sources').where('name', 'like', `${MARK}%`).execute();
  await removeProjectFolders();
  // What the proposals made: their records, the versions kept, and what landed
  // in the folder or was drafted in writer's workspace.
  await db.deleteFrom('proposals').where('target_folder_id', '=', folderId).execute();
  await db.deleteFrom('item_versions').where('folder_id', '=', folderId).execute();
  await db
    .deleteFrom('documents')
    .where('kind', 'in', ['dashboard', 'chart'])
    .where('title', 'like', `${MARK}%`)
    .execute();
  await db.deleteFrom('audit_records').where('folder_id', '=', folderId).execute();
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
      payload: { timeZone: TEST_TIME_ZONE },
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
    // Made in writer's workspace, to go to the audited folder: a shared one's
    // settings change only through a proposal (T502, AC-278).
    const settings = {
      folderId: 'mine',
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
      payload: {
        ...settings,
        name,
        targetFolderId: folderId,
        testId: trial.json<{ testId: string }>().testId,
      },
    });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json<{ id: string }>().id;
    const home = (await dataSourceStore(getDb()).get(id))!.folderId;
    expect(home).toMatch(/^ws:/);

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
      folderId: home,
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
        (record) =>
          record.folderId === folderId || record.folderId === home || record.event === 'sign-in',
      ),
    );
    expect(kept).not.toContain('kid-1');
    for (const tag of ['first', 'second'])
      for (const part of [sealed(tag).ct, sealed(tag).enc])
        for (let at = 0; at + 16 <= part.length; at += 16)
          expect(kept).not.toContain(part.slice(at, at + 16));
  });

  /**
   * The rest of the seven, through their routes (T349, T352, T353, T354):
   * `writer` proposes a dashboard from their workspace into the audited
   * folder and `super` approves it; a chart `super` rejects with a reason; one
   * its author withdraws; and the landed dashboard restored to its version 1.
   */
  it('records a proposal, an approval, a rejection, a withdrawal and a restore, in the folder they are of', async () => {
    const draft = async (kind: 'dashboard' | 'chart', title: string) => {
      const made = await as('writer', {
        method: 'POST',
        url: '/api/documents',
        payload: { kind, title, folderId: 'mine', targetFolderId: folderId },
      });
      expect(made.statusCode, made.body).toBe(201);
      return made.json<{ id: string }>().id;
    };
    const propose = async (kind: 'dashboard' | 'chart', id: string) => {
      const proposed = await as('writer', {
        method: 'POST',
        url: '/api/proposals',
        payload: { kind, id, description: `${MARK} proposed` },
      });
      expect(proposed.statusCode, proposed.body).toBe(201);
      return proposed.json<{ id: string }>().id;
    };
    const board = await draft('dashboard', `${MARK} board`);
    const approved = await as('super', {
      method: 'POST',
      url: `/api/proposals/${await propose('dashboard', board)}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const landed = approved.json<{ landed: { kind: string; id: string }[] }>().landed[0]!.id;
    const chart = await draft('chart', `${MARK} rejected chart`);
    const rejected = await as('super', {
      method: 'POST',
      url: `/api/proposals/${await propose('chart', chart)}/reject`,
      payload: { reason: 'Not yet' },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const withdrawnChart = await draft('chart', `${MARK} withdrawn chart`);
    const withdrawn = await as('writer', {
      method: 'POST',
      url: `/api/proposals/${await propose('chart', withdrawnChart)}/reject`,
      payload: {},
    });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    const restored = await as('writer', {
      method: 'POST',
      url: `/api/history/dashboard/${landed}/restore`,
      // writer's copy, the one proposed, is replaced by the restore's draft.
      payload: { version: 1, replaceCopy: true },
    });
    expect(restored.statusCode, restored.body).toBe(201);

    const records = await recorded(['proposal', 'approval', 'rejection', 'restore']);
    const of = (event: AuditRecord['event'], id: string) =>
      records
        .filter((record) => record.event === event && record.item?.id === id)
        .map(({ actor, folderId: folder, item, summary }) => ({
          who: actor?.identity,
          folder,
          item,
          summary,
        }));
    const writer = USERS['writer']!.email;
    const decider = USERS['super']!.email;
    expect(of('proposal', board)).toEqual([
      {
        who: writer,
        folder: folderId,
        item: { kind: 'dashboard', id: board, title: `${MARK} board` },
        summary: `Proposed to Audited ${MARK}, as new`,
      },
    ]);
    expect(of('approval', board)).toEqual([
      {
        who: decider,
        folder: folderId,
        item: { kind: 'dashboard', id: board, title: `${MARK} board` },
        summary: `Approved “${MARK} board” as version 1`,
      },
    ]);
    expect(of('rejection', chart)).toEqual([
      {
        who: decider,
        folder: folderId,
        item: { kind: 'chart', id: chart, title: `${MARK} rejected chart` },
        summary: `Rejected “${MARK} rejected chart”: Not yet`,
      },
    ]);
    expect(of('rejection', withdrawnChart)).toEqual([
      {
        who: writer,
        folder: folderId,
        item: { kind: 'chart', id: withdrawnChart, title: `${MARK} withdrawn chart` },
        summary: `Withdrew “${MARK} withdrawn chart”`,
      },
    ]);
    expect(of('restore', landed)).toEqual([
      {
        who: writer,
        folder: folderId,
        item: { kind: 'dashboard', id: landed, title: `${MARK} board` },
        summary: `Restoring “${MARK} board” to version 1, as a draft to propose`,
      },
    ]);
  });

  /**
   * AC-294 whole, for the seven kinds this task names: one of each was
   * recorded by the tests above, each with who did it, what it was done to
   * and what was done, the folder it was in, and when. A sign-in alone is of
   * no folder or item.
   */
  it('has each of the seven kinds, every record with who, what, which folder and when', async () => {
    const until = new Date();
    const records = (await audit().list({ since: started, limit: 500 })).records.filter((record) =>
      record.event === 'sign-in'
        ? [USERS['super']!.email, USERS['writer']!.email].includes(record.actor?.identity ?? '')
        : record.folderId === folderId || record.item?.title.startsWith(MARK) === true,
    );
    const kinds = [
      'sign-in',
      'access-change',
      'proposal',
      'approval',
      'rejection',
      'restore',
      'data-source-change',
    ] as const;
    expect(kinds.filter((kind) => !records.some((record) => record.event === kind))).toEqual([]);
    for (const record of records) {
      const where = `${record.event}: ${record.summary}`;
      // Who.
      expect(typeof record.actor?.key, where).toBe('string');
      expect(record.actor!.name.length, where).toBeGreaterThan(0);
      // What: the item, and what was done, in words.
      expect(record.summary.length, where).toBeGreaterThan(0);
      // When: as it was done, while this file ran.
      expect(record.at.getTime(), where).toBeGreaterThanOrEqual(started.getTime());
      expect(record.at.getTime(), where).toBeLessThanOrEqual(until.getTime());
      if (record.event === 'sign-in') {
        expect([record.folderId, record.item], where).toEqual([null, null]);
        continue;
      }
      // Which folder, and what it was done to.
      expect(typeof record.folderId, where).toBe('string');
      expect(record.folderId!.length, where).toBeGreaterThan(0);
      expect(typeof record.item?.id, where).toBe('string');
      expect(record.item!.title.length, where).toBeGreaterThan(0);
    }
  });
});
