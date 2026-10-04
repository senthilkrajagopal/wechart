import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { auditStore, type AuditRecord } from '../repos/audit';
import { buildHistory } from '../repos/build-history';
import { scheduleStore, wechartScheduler, type WechartScheduler } from '../scheduler/schedules';
import { xcubeQueue, type QueueEntry } from '../xcube/queue';
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

/**
 * T505 (AC-294; design 16, state I, Q12; R42.8): builds started from Jobs,
 * cancels in the queue and changes to wechart's own schedules are recorded,
 * each with who, what, the pre-aggregation's folder and when; a suspension
 * by "wechart's scheduler". A run a schedule starts isn't: Run history has it.
 *
 * On a stub Cube and xcube queue, and pg-boss in a schema of this file's own.
 */
describe(
  'builds, cancels and schedule changes in the trail (T505, AC-294)',
  { timeout: 120_000 },
  () => {
    const SCHEMA = `pgboss_${MARK}`;
    const clock = new TestClock(new Date('2026-10-05T03:00:00Z'));
    const ids = { folder: '', xcube: '' };
    const rollup = () => `${ids.xcube}__orders.by_month`;
    const whole = () => `${ids.xcube}__orders.by_status`;
    const REMOVED =
      "A user's selector doesn't match any of the pre-aggregations defined in the data model.";
    const refusing = new Set<string>();
    /** xcube's queue: entries wechart started, as each test lays them. */
    let queued: QueueEntry[] = [];
    let built: FastifyInstance;
    let boss: PgBoss;
    let scheduler: WechartScheduler;
    const signedIn: Record<string, string> = {};
    const asWriter = (options: InjectOptions) =>
      built.inject({ ...options, headers: { ...options.headers, cookie: signedIn['writer']! } });
    /** The records of these events in this describe's folder, oldest first. */
    const kept = async (events: AuditRecord['event'][]) =>
      (await recorded(events)).filter((record) => record.folderId === ids.folder).reverse();
    /** Who, as the trail names them: the identity the provider sent, else the name. */
    const WRITER = USERS['writer']!.email;
    const brief = (record: AuditRecord) => ({
      who: record.actor?.identity ?? record.actor?.name ?? null,
      event: record.event,
      item: record.item,
      summary: record.summary,
    });

    beforeAll(async () => {
      ids.folder = randomUUID();
      ids.xcube = `f${ids.folder.replaceAll('-', '')}`;
      await docs().create({
        kind: 'folder',
        id: ids.folder,
        body: {
          owner: 'admin',
          title: `Built ${MARK}`,
          folderId: 'root',
          access: { readOnly: [], readWrite: ['sales-rw'] },
        },
      });
      const client = new CubeClient({
        apiUrl: secured.cubeApiUrl,
        apiSecret: secured.cubeApiSecret,
        securityContext: {},
        service: async () => 'service-token',
        model: { id: 'dev', revision: async () => undefined },
        fetchImpl: (async (url: string, init?: RequestInit) => {
          const path = new URL(url).pathname;
          if (path.endsWith('/models/dev/meta'))
            return Response.json({
              cubes: [
                {
                  name: `${ids.xcube}__orders`,
                  meta: { xcube: { folderId: ids.xcube, shortName: 'orders' } },
                  preAggregations: [
                    { name: 'by_month', type: 'rollup', partitionGranularity: 'month' },
                    { name: 'by_status', type: 'rollup' },
                  ],
                },
              ],
            });
          if (path.endsWith('/v1/pre-aggregations/jobs')) {
            const body = JSON.parse(String(init?.body)) as {
              selector: { preAggregations: string[] };
            };
            if (body.selector.preAggregations.some((each) => refusing.has(each)))
              return Response.json({ error: REMOVED }, { status: 400 });
            return Response.json([`${MARK}-token-${randomUUID()}`]);
          }
          return Response.json({}, { status: 404 });
        }) as typeof fetch,
      });
      boss = new PgBoss({
        connectionString: databaseUrl(),
        schema: SCHEMA,
        clock,
        cronMonitorIntervalSeconds: 1,
        cronWorkerIntervalSeconds: 1,
        supervise: false,
      });
      scheduler = wechartScheduler({
        boss,
        store: scheduleStore(getDb(), { named: MARK }),
        history: buildHistory(getDb()),
        cube: client,
        audit: audit(),
        now: () => new Date(clock.now()),
        pollingIntervalSeconds: 0.5,
      });
      await scheduler.start();
      built = buildServer({
        config: secured,
        cube: client,
        sessions: pgSessionStore(getDb()),
        documents: docs(),
        catalog: catalog(getDb()),
        folderAccess: folderAccessStore(getDb()),
        folders: async () => ({
          ids: new Map([
            ['root', 'froot'],
            [ids.folder, ids.xcube],
          ]),
          parents: new Map([
            ['root', null],
            [ids.folder, 'root'],
          ]),
        }),
        audit: audit(),
        buildHistory: buildHistory(getDb()),
        buildQueue: xcubeQueue({
          cubeApiUrl: secured.cubeApiUrl,
          model: 'dev',
          token: async () => 'service-token',
          fetch: (async (url: string, init?: RequestInit) => {
            if (new URL(url).pathname.endsWith('/queue/cancel')) {
              const { keys } = JSON.parse(String(init?.body)) as { keys: string[] };
              return Response.json({
                model: 'dev',
                cancelled: keys.map((key) => ({ key, preAggregation: rollup(), status: 'queued' })),
                notCancelled: [],
              });
            }
            return Response.json({ model: 'dev', queue: queued });
          }) as typeof fetch,
        }),
        schedules: scheduler,
        now: () => new Date(clock.now()),
      });
      signedIn['writer'] = await signIn(built, USERS['writer']!);
    });

    afterAll(async () => {
      if (built !== undefined) await built.close();
      if (boss !== undefined) await boss.stop({ graceful: false, close: true });
      const db = getDb();
      await db.deleteFrom('schedules').where('name', 'like', `%${MARK}%`).execute();
      await db
        .deleteFrom('build_runs')
        .where('pre_aggregation', 'in', [rollup(), whole()])
        .execute();
      await db.deleteFrom('audit_records').where('folder_id', '=', ids.folder).execute();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(SCHEMA)} CASCADE`.execute(db);
      await docs().remove('folder', ids.folder);
    });

    it('records Build now, Build all and Rebuild selected as Build started, with the pre-aggregation, its folder and the partitions', async () => {
      const runIds: string[] = [];
      for (const payload of [
        { preAggregation: whole() },
        { preAggregation: rollup() },
        {
          preAggregation: rollup(),
          partitions: ['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'],
        },
      ]) {
        const started = await asWriter({ method: 'POST', url: '/api/builds', payload });
        expect(started.statusCode, started.body).toBe(200);
        runIds.push(started.json<{ runId: string }>().runId);
      }

      const records = await kept(['build-started']);
      expect(records.map((record) => record.folderId)).toEqual([
        ids.folder,
        ids.folder,
        ids.folder,
      ]);
      expect(records.map(brief)).toEqual([
        {
          who: WRITER,
          event: 'build-started',
          item: { kind: 'pre-aggregation', id: whole(), title: 'orders.by_status' },
          summary: 'Build now · whole',
        },
        {
          who: WRITER,
          event: 'build-started',
          item: { kind: 'pre-aggregation', id: rollup(), title: 'orders.by_month' },
          summary: 'Build all · every partition',
        },
        {
          who: WRITER,
          event: 'build-started',
          item: { kind: 'pre-aggregation', id: rollup(), title: 'orders.by_month' },
          // Months of one year say the year once, as Run history does (design 16, B1).
          summary: 'Rebuild selected · Sep, Aug 2026',
        },
      ]);
      expect(records.map((record) => record.details)).toEqual([
        {
          preAggregation: whole(),
          via: 'build-all',
          partitions: null,
          granularity: null,
          runId: runIds[0],
        },
        {
          preAggregation: rollup(),
          via: 'build-all',
          partitions: null,
          granularity: 'month',
          runId: runIds[1],
        },
        {
          preAggregation: rollup(),
          via: 'rebuild-selected',
          partitions: ['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'],
          granularity: 'month',
          runId: runIds[2],
        },
      ]);
      // Each start its own run in Run history, which its record names.
      expect(new Set(runIds).size).toBe(3);
    });

    it('records a cancel as Build cancelled, with the partition and its state then', async () => {
      const answer = await asWriter({
        method: 'POST',
        url: '/api/builds',
        payload: { preAggregation: rollup(), partitions: ['2026-08-01T00:00:00.000'] },
      });
      const { runId, tokens } = answer.json<{ runId: string; tokens: string[] }>();
      const run = await buildHistory(getDb()).get(runId);
      const key = `${MARK}-key-${randomUUID()}`;
      queued = [
        {
          key,
          dataSource: 'default',
          preAggregation: rollup(),
          table: 'prod_pre_aggregations.orders_by_month20260801',
          targetTable: 'prod_pre_aggregations.orders_by_month20260801_aaaa_bbbb_cccc',
          partition: { start: '2026-08-01T00:00:00.000', end: '2026-08-31T23:59:59.999' },
          status: 'queued',
          stalled: false,
          addedAt: new Date(clock.now()).toISOString(),
          requestId: run!.requestId,
          startedBy: 'jobs',
          job: tokens[0]!,
        },
      ];

      const cancel = await asWriter({
        method: 'POST',
        url: '/api/jobs/queue/cancel',
        payload: { key },
      });

      expect(cancel.json()).toEqual({ cancelled: true });
      const [record] = (await kept(['build-cancelled'])).reverse();
      expect(brief(record!)).toEqual({
        who: WRITER,
        event: 'build-cancelled',
        item: { kind: 'pre-aggregation', id: rollup(), title: 'orders.by_month' },
        summary: 'Queued · Aug 2026',
      });
      expect(record?.details).toEqual({
        preAggregation: rollup(),
        partition: '2026-08-01T00:00:00.000',
        state: 'queued',
        runId,
      });
    });

    it('records making, changing, suspending, resuming and deleting a schedule as Schedule change, a suspension by wechart’s scheduler; a run it starts isn’t recorded', async () => {
      const made = await asWriter({
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: {
          name: `Morning ${MARK}`,
          preAggregation: rollup(),
          cron: '0 5 * * *',
          timezone: 'UTC',
          suspendAfter: 1,
        },
      });
      const { id } = made.json<{ id: string }>();
      expect(
        (
          await asWriter({
            method: 'PUT',
            url: `/api/wechart-schedules/${id}`,
            payload: {
              name: `Morning ${MARK}`,
              preAggregation: rollup(),
              cron: '0 6 * * *',
              timezone: 'UTC',
            },
          })
        ).statusCode,
      ).toBe(200);
      // A run it starts: Run history's, not the trail's.
      const before = (await kept(['build-started'])).length;
      await scheduler.run(id, `job-${MARK}-ran`);
      // It started a build, which Run history has (T505's review)…
      const ran = await buildHistory(getDb()).startsFor({
        requestIds: [`wechart-schedule-job-${MARK}-ran`],
        tokens: [],
      });
      expect(ran.map((start) => start.starter)).toEqual([
        { kind: 'schedule', id, name: `Morning ${MARK}` },
      ]);
      // …and the trail doesn't.
      expect((await kept(['build-started'])).length).toBe(before);
      // Refused once, at its number: suspended by wechart's scheduler.
      refusing.add(rollup());
      await clock.setTime(clock.now() + 60_000);
      const suspendedAt = new Date(clock.now()).toISOString();
      await scheduler.run(id, `job-${MARK}-refused`).catch(() => undefined);
      refusing.delete(rollup());
      expect(
        (await asWriter({ method: 'POST', url: `/api/wechart-schedules/${id}/resume` })).statusCode,
      ).toBe(200);
      expect(
        (await asWriter({ method: 'DELETE', url: `/api/wechart-schedules/${id}` })).statusCode,
      ).toBe(204);

      const records = await kept(['schedule-change']);
      const item = { kind: 'schedule', id, title: `Morning ${MARK}` };
      expect(records.map(brief)).toEqual([
        { who: WRITER, event: 'schedule-change', item, summary: 'Made · 0 5 * * *' },
        { who: WRITER, event: 'schedule-change', item, summary: 'Changed · cron' },
        {
          who: 'wechart’s scheduler',
          event: 'schedule-change',
          item,
          summary: 'Suspended after 1 failure',
        },
        { who: WRITER, event: 'schedule-change', item, summary: 'Resumed' },
        { who: WRITER, event: 'schedule-change', item, summary: 'Deleted' },
      ]);
      expect(records.map((record) => record.folderId)).toEqual(Array(5).fill(ids.folder));
      // Each with its settings before and after, and what changed.
      const settings = (cron: string) => ({
        name: `Morning ${MARK}`,
        preAggregation: rollup(),
        cron,
        timezone: 'UTC',
        missed: 'once',
        suspendAfter: 1,
      });
      /** Each setting as the inspector's "What changed" shows it, before and after. */
      const rows = (before: string | null, after: string | null) => {
        const shown = (cron: string | null) =>
          cron === null
            ? [null, null, null, null, null, null]
            : [`Morning ${MARK}`, 'orders.by_month', cron, 'UTC', 'Run once', '1'];
        const [was, is] = [shown(before), shown(after)];
        return [
          'Name',
          'Pre-aggregation',
          'Cron',
          'Time zone',
          'A missed run',
          'Suspend after',
        ].map((setting, at) => ({ setting, before: was[at], after: is[at] }));
      };
      const what = { preAggregation: rollup(), shownName: 'orders.by_month' };
      expect(records[0]?.details).toEqual({
        change: 'made',
        ...what,
        before: null,
        after: settings('0 5 * * *'),
        settings: rows(null, '0 5 * * *'),
      });
      expect(records[1]?.details).toEqual({
        change: 'changed',
        ...what,
        before: settings('0 5 * * *'),
        after: settings('0 6 * * *'),
        settings: rows('0 5 * * *', '0 6 * * *'),
      });
      // After how many failures, with Cube's last words (Q12).
      expect(records[2]?.details).toEqual({
        change: 'suspended',
        ...what,
        failures: 1,
        error: REMOVED,
      });
      // Resumed from its suspension: since when, and with what error (T505's review).
      expect(records[3]?.details).toEqual({
        change: 'resumed',
        ...what,
        suspendedAt,
        error: REMOVED,
      });
      expect(records[4]?.details).toEqual({
        change: 'deleted',
        ...what,
        before: settings('0 6 * * *'),
        after: null,
        settings: rows('0 6 * * *', null),
      });
    });
  },
);
