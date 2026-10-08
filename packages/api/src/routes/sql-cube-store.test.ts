import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { CUBE_STORE_TARGET, sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { sqlRuns } from '../repos/sql-runs';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { xcubeSqlRunner } from '../xcube/sql-runner';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';

/**
 * T536 (AC-384, AC-374; design 15's state H, P5, Q7 and Q9): Cube Store's
 * SQL runner. It has a switch of its own, a Super-Admin's alone, turned on
 * only by confirming that everyone allowed may read every folder's rollups.
 * Once on, it is for Super-Admins and for those allowed on a data source in
 * a folder whose runner a Super-Admin switched on; a data source in My
 * workspace doesn't count (Q7). xcube runs SELECT and EXPLAIN on it alone.
 *
 * Against the stub xcube. `writer` (`sales-rw`) writes /Sales; `reader`
 * (`sales-ro`) reads it; `manager` writes /Sales/Sub, below it; `super` is a
 * Super-Admin.
 */
const MARK = `sqlcs${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlcs-${MARK}`;
const CAPS = { maxRows: 10_000, timeoutMs: 30_000, maxBytes: 10 * 1024 * 1024 };
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const FIELDS = { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false };

const folders = { sales: '', sub: '' };
let source = '';
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());
const audit = () => auditStore(getDb());
let started = new Date();

beforeAll(async () => {
  started = new Date();
  // A run a test cut short left going holds its user up no more.
  await getDb()
    .updateTable('sql_runs')
    .set({ finished_at: new Date(), outcome: 'lost' })
    .where('finished_at', 'is', null)
    .execute();
  await switches().off(CUBE_STORE_TARGET);
  for (const [key, parent, access] of [
    ['sales', 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['sub', 'sales', { readOnly: null, readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    folders[key] = id;
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: parent === 'root' ? 'root' : folders[parent],
        access,
      },
    });
  }
  source = (
    await sources().create({
      folderId: folders.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('sales') },
    })
  ).id;
  stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://xcube.test/cubejs-api',
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fsub', parentId: 'fsales' },
  ]);
  // A head, which a workspace's overlay is pushed over (T347).
  stub.holdItems(MODEL, []);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
      security: 'oidc',
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
    },
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: sources(),
    audit: audit(),
    sqlRunnerSwitches: switches(),
    sqlRuns: sqlRuns(getDb()),
    xcube: admin,
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      model: MODEL,
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [folders.sales, 'fsales'],
        [folders.sub, 'fsub'],
      ]),
      parents: new Map([
        ['root', null],
        [folders.sales, 'root'],
        [folders.sub, folders.sales],
      ]),
    }),
  });
  for (const who of ['super', 'writer', 'reader', 'manager'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await switches().off(CUBE_STORE_TARGET);
  await removeProjectFolders();
  const made = await getDb()
    .selectFrom('data_sources')
    .select('id')
    .where('name', 'like', `%${MARK}%`)
    .execute();
  for (const { id } of made) {
    await switches().off(id);
    await sources().remove(id);
  }
  await getDb()
    .deleteFrom('sql_runs')
    .where('data_source_id', 'is', null)
    .where('sql', 'like', `%${MARK}%`)
    .execute();
  await docs().remove('folder', folders.sub);
  await docs().remove('folder', folders.sales);
  await closeDb();
});

beforeEach(() => {
  stub.answerSql(undefined);
  stub.answerSqlState(undefined);
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const stateOf = (who: string) => as(who, { method: 'GET', url: '/api/cube-store' });
const run = (who: string, sql = `SELECT '${MARK}'`) =>
  as(who, { method: 'POST', url: '/api/cube-store/sql', payload: { sql } });
const turn = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'PUT', url: '/api/cube-store/sql-runner', payload });
const turnOn = () => turn('super', { on: true, readOnlyConfirmed: true });
/** The audit trail's events about Cube Store since this file began. */
const cubeStoreEvents = async () =>
  (await audit().list({ folderIds: ['root'], since: started, limit: 200 })).records.filter(
    (record) => record.item?.kind === 'cube-store',
  );

describe('Cube Store’s switch (T536, AC-374; design 15’s Q9)', () => {
  it('starts off, and only a Super-Admin turns it on, confirming everyone allowed may read every folder’s rollups', async () => {
    const off = await stateOf('super');
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json()).toEqual({ on: false, runs: false });

    expect((await turn('writer', { on: true, readOnlyConfirmed: true })).statusCode).toBe(403);
    const unconfirmed = await turn('super', { on: true });
    expect(unconfirmed.statusCode).toBe(400);
    expect(unconfirmed.json<{ error: string }>().error).toBe(
      'Confirm that what wechart reaches Cube Store with can only read, and that everyone allowed may read every folder’s rollups, before turning the SQL runner on.',
    );
    expect(await switches().of(CUBE_STORE_TARGET)).toBeUndefined();

    const on = await turnOn();
    expect(on.statusCode, on.body).toBe(200);
    // Kept with who confirmed it and when, as the page is told it: by name, never a key.
    const kept = (await switches().of(CUBE_STORE_TARGET))!;
    expect(on.json()).toEqual({
      on: true,
      confirmedBy: { name: kept.confirmedBy.name },
      confirmedAt: kept.confirmedAt.toISOString(),
    });
    const off2 = await turn('super', { on: false });
    expect(off2.statusCode).toBe(200);
    expect(off2.json()).toEqual({ on: false });
    expect(await switches().of(CUBE_STORE_TARGET)).toBeUndefined();

    // Both in the audit trail, at the root (design 15's P4), by the one who confirmed it.
    const events = await cubeStoreEvents();
    expect(events.map((record) => [record.event, record.summary])).toEqual([
      ['data-source-change', 'Turned the SQL runner off for Cube Store'],
      [
        'data-source-change',
        'Turned the SQL runner on for Cube Store, confirming everyone allowed may read every folder’s rollups',
      ],
    ]);
    expect(events.map((record) => record.actor?.key)).toEqual([
      kept.confirmedBy.key,
      kept.confirmedBy.key,
    ]);
  });
});

describe('Cube Store, listed and run (T536, AC-384; design 15’s state H and Q7)', () => {
  // What the page lists Cube Store by: its state, answered only to those who may see it.
  it('while off, runs for nobody, and is shown to nobody but a Super-Admin', async () => {
    const before = stub.sqlAsked().length;
    const superRun = await run('super');
    expect(superRun.statusCode, superRun.body).toBe(403);
    expect(superRun.json<{ error: string }>().error).toBe(
      'The SQL runner is off for Cube Store: a Super-Admin turns it on in Data sources.',
    );
    for (const who of ['writer', 'reader', 'manager']) {
      expect((await stateOf(who)).statusCode, who).toBe(404);
      expect((await run(who)).statusCode, who).toBe(404);
    }
    expect(stub.sqlAsked().slice(before)).toEqual([]);
    // A Super-Admin is told it is off, so as to find Turn on… (P5); nobody else is told of it.
    expect((await stateOf('super')).json()).toEqual({ on: false, runs: false });
  });

  it('once on, runs a Super-Admin’s SELECT on Cube Store, with R50’s caps', async () => {
    await turnOn();
    try {
      const before = stub.sqlAsked().length;
      const answer = await run('super');
      expect(answer.statusCode, answer.body).toBe(200);
      expect(answer.json()).toMatchObject({ outcome: 'finished', rowCount: 1 });
      const [asked] = stub.sqlAsked().slice(before);
      expect(asked).toMatchObject({
        target: { cubeStore: true },
        sql: `SELECT '${MARK}'`,
        ...CAPS,
      });
      expect((await stateOf('super')).json()).toMatchObject({ on: true, runs: true });
    } finally {
      await turn('super', { on: false });
    }
  });

  it('once on, isn’t for those allowed only on their own data source in My workspace (Q7), nor a reader', async () => {
    // The writer's copy of /Sales's data source, theirs to run SQL on with no switch (AC-383).
    const copy = await as('writer', {
      method: 'POST',
      url: `/api/data-sources/${source}/copy`,
      payload: { timeZone: TEST_TIME_ZONE },
    });
    expect(copy.statusCode, copy.body).toBe(201);
    // Even a copy's own switch on, as a Super-Admin would turn on one pointed
    // elsewhere (Q8), gives its owner no Cube Store (T536's review).
    await switches().on(copy.json<{ id: string }>().id, { key: 'super', name: 'Super' });
    await turnOn();
    try {
      const before = stub.sqlAsked().length;
      for (const who of ['writer', 'reader', 'manager']) {
        expect((await stateOf(who)).statusCode, who).toBe(404);
        expect((await run(who)).statusCode, who).toBe(404);
      }
      expect(stub.sqlAsked().slice(before)).toEqual([]);
    } finally {
      await turn('super', { on: false });
    }
  });

  it('once on, is for those allowed on a data source in a folder switched on, and not a member below it', async () => {
    await turnOn();
    await switches().on(source, { key: 'super', name: 'Super' });
    try {
      const state = await stateOf('writer');
      expect(state.statusCode, state.body).toBe(200);
      expect(state.json()).toMatchObject({ on: true, runs: true });
      expect((await run('writer')).statusCode).toBe(200);
      // `manager` sees /Sales's data source as an ancestor's: no right to run SQL on it.
      for (const who of ['manager', 'reader']) {
        expect((await stateOf(who)).statusCode, who).toBe(404);
        expect((await run(who)).statusCode, who).toBe(404);
      }
    } finally {
      await switches().off(source);
      await turn('super', { on: false });
    }
  });

  it('refuses anything but SELECT and EXPLAIN, as xcube does, saying what it found (AC-384)', async () => {
    await turnOn();
    stub.answerSql(() => ({
      status: 400,
      body: {
        error:
          'Only a SELECT or an EXPLAIN runs on Cube Store: this is a QUEUE command. Read information_schema.tables or system.tables with a LIMIT instead',
        code: 'not_read_only',
        statement: 'queue',
        redactedSql: 'QUEUE LIST',
      },
    }));
    try {
      const refused = await run('super', 'QUEUE LIST');
      expect(refused.statusCode, refused.body).toBe(400);
      expect(refused.json()).toEqual({
        outcome: 'refused',
        error: 'On Cube Store, only SELECT and EXPLAIN run, one statement at a time.',
        reason:
          'Only a SELECT or an EXPLAIN runs on Cube Store: this is a QUEUE command. Read information_schema.tables or system.tables with a LIMIT instead',
        statement: 'queue',
      });
    } finally {
      await turn('super', { on: false });
    }
  });

  /**
   * T650 (R64; xcube 636ffa04b2): a join Cube Store's router would run itself,
   * which nothing could stop once it started, is refused before it runs. Said
   * as that, never as a statement that isn't a SELECT, and audited so.
   */
  it('refuses a join Cube Store’s router would run, saying so, and audits it so', async () => {
    await turnOn();
    stub.answerSql(() => ({
      status: 400,
      body: {
        error:
          'Cube Store’s router would run this query’s join itself, and nothing stops that work once it starts, not even Cube Store’s own timeout: join Cube Store’s tables, whose joins run on its select workers, or read one catalog or system table without a join',
        code: 'not_read_only',
        reason: 'cubestore_router_join',
        statement: 'select',
        redactedSql: 'SELECT * FROM (VALUES (?)) a CROSS JOIN (VALUES (?)) b',
      },
    }));
    try {
      const sql = `SELECT * FROM (VALUES (1)) a CROSS JOIN (VALUES (2)) b -- ${MARK}`;
      const refused = await run('super', sql);
      expect(refused.statusCode, refused.body).toBe(400);
      expect(refused.json()).toEqual({
        outcome: 'refused',
        error:
          'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout.',
        reason:
          'Cube Store’s router would run this query’s join itself, and nothing stops that work once it starts, not even Cube Store’s own timeout: join Cube Store’s tables, whose joins run on its select workers, or read one catalog or system table without a join',
        statement: 'select',
        routerJoin: true,
      });
      // Its audit event says it so (AC-382), never as a SELECT that writes or locks.
      const event = (await cubeStoreEvents()).find(
        (record) =>
          record.event === 'sql-run' &&
          (record.details as { sql?: string } | undefined)?.sql ===
            'SELECT * FROM (VALUES (?)) a CROSS JOIN (VALUES (?)) b',
      );
      expect(event?.summary).toBe('Not run · a join Cube Store’s router would run');
    } finally {
      await turn('super', { on: false });
    }
  });

  it('keeps each run in its user’s history as Cube Store’s, and audits it at the root (AC-381, AC-382)', async () => {
    await turnOn();
    try {
      expect((await run('super', `SELECT 'kept ${MARK}'`)).statusCode).toBe(200);
      const listed = await as('super', { method: 'GET', url: '/api/sql-runs' });
      const mine = listed
        .json<{ runs: { sql: string; dataSource: unknown; cubeStore?: boolean }[] }>()
        .runs.find((each) => each.sql === `SELECT 'kept ${MARK}'`);
      expect(mine).toMatchObject({ dataSource: null, cubeStore: true });
      const events = (await cubeStoreEvents()).filter((record) => record.event === 'sql-run');
      expect(events[0]).toMatchObject({
        folderId: 'root',
        // As a run cut off mid-way records it (T534).
        item: { kind: 'cube-store', id: 'cubestore', title: 'Cube Store' },
        summary: 'Finished · 1 row · 0 s',
        details: {
          outcome: 'finished',
          rowCount: 1,
          durationMs: 1,
          // The stub's redaction: its literal replaced (AC-382).
          sql: 'SELECT ?',
          inWorkspace: false,
        },
      });
    } finally {
      await turn('super', { on: false });
    }
  });
});

/**
 * T548 (AC-378, AC-379; R62, "Say it, and hold Run"): Cube Store can't stop
 * a query (xcube 2099b13f2d, research xcube-2099b13f2d.md). A run stopped at
 * its cap answers at once, with `stillRunning` and `endsBy`; it is said so,
 * and its user's next run waits while xcube says it is stopping.
 */
describe('a Cube Store run stopped but run on (T548, AC-378, AC-379)', () => {
  const ENDS_BY = () => new Date(Date.now() + 90_000).toISOString();
  /** The stub's stop of a Cube Store run, as 2099b13f2d answers one at its cap. */
  const stopsRunningOn = (endsBy: string) => {
    stub.answerSql((ask) =>
      'cubeStore' in ask.target && ask.sql.includes('slow')
        ? {
            status: 422,
            body: {
              error: `The statement ran past 30 s and was stopped; Cube Store can't stop a query, and runs it on until it ends, by ${endsBy} at the latest`,
              code: 'timeout',
              statement: 'select',
              redactedSql: 'SELECT ?',
              durationMs: 32_004,
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: 'stopped',
              stillRunning: true,
              endsBy,
            },
          }
        : undefined,
    );
  };
  /** Its runs this file made, ended: none holds another file's run up. */
  const endAll = () =>
    getDb()
      .updateTable('sql_runs')
      .set({ ends_by: null })
      .where('sql', 'like', `%${MARK}%`)
      .execute();

  it('says a stopped run is still finishing in Cube Store and until when, and holds its user’s next run while xcube says so', async () => {
    await turnOn();
    await switches().on(source, { key: 'super', name: 'Super' });
    const endsBy = ENDS_BY();
    stopsRunningOn(endsBy);
    try {
      const stopped = await run('super', `SELECT 'slow ${MARK}'`);
      expect(stopped.statusCode, stopped.body).toBe(422);
      expect(stopped.json()).toEqual({
        outcome: 'timeout',
        error:
          'Stopped at 30 seconds: Cube Store can’t stop a query, so it is still finishing this one.',
        durationMs: 32_004,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        statement: 'select',
        stillRunning: true,
        endsBy,
      });
      const [stoppedId] = stub
        .sqlAsked()
        .slice(-1)
        .map((ask) => ask.runId);
      stub.answerSqlState((runId) =>
        runId === stoppedId ? { state: 'stopping', endsBy } : { state: 'ended' },
      );

      // Held: on Cube Store, and on a data source alike, nothing reaching xcube's runs.
      const before = stub.sqlAsked().length;
      for (const next of [
        () => run('super', `SELECT 'next ${MARK}'`),
        () =>
          as('super', {
            method: 'POST',
            url: `/api/data-sources/${source}/sql`,
            payload: { sql: `SELECT 'next ${MARK}'` },
          }),
      ]) {
        const held = await next();
        expect(held.statusCode, held.body).toBe(409);
        expect(held.json()).toEqual({
          outcome: 'going',
          error:
            'Cube Store is still finishing your last query. One run at a time: your next one runs once it has ended.',
          going: {
            dataSource: null,
            cubeStore: true,
            startedAt: expect.any(String),
            stopping: true,
            endsBy,
          },
        });
      }
      expect(stub.sqlAsked()).toHaveLength(before);
      expect(stub.sqlStatesAsked()).toContain(stoppedId);
      // The page is told so, to hold Run and say until when.
      expect((await as('super', { method: 'GET', url: '/api/sql-runs/going' })).json()).toEqual({
        going: {
          dataSource: null,
          cubeStore: true,
          startedAt: expect.any(String),
          stopping: true,
          endsBy,
        },
      });
      // Another user isn't held by it.
      const writersRun = await as('writer', {
        method: 'POST',
        url: `/api/data-sources/${source}/sql`,
        payload: { sql: `SELECT 'writer ${MARK}'` },
      });
      expect(writersRun.statusCode, writersRun.body).toBe(200);

      // Ended, as xcube says: the next run runs, and nothing is said going.
      stub.answerSqlState(() => ({ state: 'ended' }));
      expect((await run('super', `SELECT 'after ${MARK}'`)).statusCode).toBe(200);
      expect((await as('super', { method: 'GET', url: '/api/sql-runs/going' })).json()).toEqual({
        going: null,
      });
      // Its event keeps its end at the latest.
      const event = (await cubeStoreEvents()).find(
        (record) => record.event === 'sql-run' && record.details?.['endsBy'] === endsBy,
      );
      expect(event).toMatchObject({
        summary: 'Stopped at 30 seconds · Cube Store runs it on',
        details: { outcome: 'timeout', rowCount: 0, endsBy },
      });
    } finally {
      await endAll();
      await switches().off(source);
      await turn('super', { on: false });
    }
  });

  it('says a cancelled run is still finishing in Cube Store, and holds the next', async () => {
    await turnOn();
    const endsBy = ENDS_BY();
    stub.answerSql((ask) =>
      'cubeStore' in ask.target && ask.sql.includes('cancel me')
        ? {
            status: 422,
            body: {
              error: 'The run was cancelled',
              code: 'cancelled',
              statement: 'select',
              redactedSql: 'SELECT ?',
              durationMs: 4_100,
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: 'stopped',
              stillRunning: true,
              endsBy,
            },
          }
        : undefined,
    );
    try {
      const cancelled = await run('super', `SELECT 'cancel me ${MARK}'`);
      expect(cancelled.statusCode, cancelled.body).toBe(422);
      expect(cancelled.json()).toEqual({
        outcome: 'cancelled',
        error: 'Cancelled: Cube Store can’t stop a query, so it is still finishing this one.',
        durationMs: 4_100,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        statement: 'select',
        stillRunning: true,
        endsBy,
      });
      stub.answerSqlState(() => ({ state: 'stopping', endsBy }));
      expect((await run('super', `SELECT 'next ${MARK}'`)).statusCode).toBe(409);
      const event = (await cubeStoreEvents()).find(
        (record) => record.event === 'sql-run' && record.details?.['endsBy'] === endsBy,
      );
      expect(event?.summary).toBe('Cancelled · Cube Store runs it on');
    } finally {
      await endAll();
      await turn('super', { on: false });
    }
  });

  it('says a stop from an xcube that says nothing of its run on as maybe still finishing, holding nothing (T548’s review)', async () => {
    await turnOn();
    // An image before 2099b13f2d: no `stillRunning`, no `endsBy`.
    stub.answerSql((ask) =>
      'cubeStore' in ask.target && ask.sql.includes('older')
        ? {
            status: 422,
            body: {
              error: 'The statement ran past 30 s and was stopped',
              code: 'timeout',
              statement: 'select',
              redactedSql: 'SELECT ?',
              durationMs: 30_002,
            },
          }
        : undefined,
    );
    try {
      const stopped = await run('super', `SELECT 'older ${MARK}'`);
      expect(stopped.statusCode, stopped.body).toBe(422);
      expect(stopped.json()).toEqual({
        outcome: 'timeout',
        error:
          'Stopped at 30 seconds: Cube Store can’t stop a query, so it may still be finishing this one.',
        durationMs: 30_002,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        statement: 'select',
      });
      expect((await run('super', `SELECT 'next ${MARK}'`)).statusCode).toBe(200);
    } finally {
      await endAll();
      await turn('super', { on: false });
    }
  });

  it('holds the next run after one xcube didn’t answer, while xcube says it still runs (T548’s review)', async () => {
    await turnOn();
    stub.answerSql((ask) => {
      if ('cubeStore' in ask.target && ask.sql.includes('unanswered'))
        throw new Error('connection reset');
      return undefined;
    });
    try {
      const lost = await run('super', `SELECT 'unanswered ${MARK}'`);
      expect(lost.statusCode, lost.body).toBe(503);
      const [lostId] = stub
        .sqlAsked()
        .slice(-1)
        .map((ask) => ask.runId);
      stub.answerSqlState((runId) =>
        runId === lostId ? { state: 'running' } : { state: 'ended' },
      );
      const held = await run('super', `SELECT 'next ${MARK}'`);
      expect(held.statusCode, held.body).toBe(409);
      expect(held.json()).toMatchObject({
        outcome: 'going',
        going: { cubeStore: true, stopping: true },
      });
      // Asked about for as long as xcube follows a run, 24 hours, no time
      // guessed: it may be its router's (T549).
      const row = await getDb()
        .selectFrom('sql_runs')
        .select(['started_at', 'ends_by'])
        .where('id', '=', lostId!)
        .executeTakeFirstOrThrow();
      expect(row.ends_by!.getTime() - row.started_at.getTime()).toBeGreaterThan(24 * 3_600_000);
      // Never seen by xcube, or ended: nothing held.
      stub.answerSqlState(() => ({ state: 'ended' }));
      expect((await run('super', `SELECT 'next ${MARK}'`)).statusCode).toBe(200);
    } finally {
      await endAll();
      await turn('super', { on: false });
    }
  });

  /**
   * T549 (the coordinator's word): where xcube can't say whether it has
   * ended, the next run is held and says so, its end at the latest past or
   * not: no time is guessed. Its row long past, it holds no one.
   */
  it('holds the next run while xcube can’t say its state, saying so, past its end too', async () => {
    await turnOn();
    const endsBy = ENDS_BY();
    stopsRunningOn(endsBy);
    try {
      expect((await run('super', `SELECT 'slow ${MARK}'`)).statusCode).toBe(422);
      stub.answerSqlState(() => {
        throw new Error('xcube away');
      });
      const unconfirmed = {
        outcome: 'going',
        error:
          'xcube can’t say whether Cube Store has finished your last query. One run at a time: your next one runs once it has ended.',
        going: {
          dataSource: null,
          cubeStore: true,
          startedAt: expect.any(String),
          stopping: true,
          endsBy: null,
          unconfirmed: true,
        },
      };
      const held = await run('super', `SELECT 'next ${MARK}'`);
      expect(held.statusCode, held.body).toBe(409);
      expect(held.json()).toEqual(unconfirmed);

      // Its end at the latest past: still held, while xcube can't say.
      await getDb()
        .updateTable('sql_runs')
        .set({ ends_by: new Date(Date.now() - 1_000) })
        .where('sql', 'like', `%slow ${MARK}%`)
        .execute();
      const still = await run('super', `SELECT 'next ${MARK}'`);
      expect(still.statusCode, still.body).toBe(409);
      expect(still.json()).toEqual(unconfirmed);

      // Long past, as a lost run is: it holds no one.
      await getDb()
        .updateTable('sql_runs')
        .set({ ends_by: new Date(Date.now() - 10 * 60_000) })
        .where('sql', 'like', `%slow ${MARK}%`)
        .execute();
      const after = await run('super', `SELECT 'next ${MARK}'`);
      expect(after.statusCode, after.body).toBe(200);
    } finally {
      await endAll();
      await turn('super', { on: false });
    }
  });

  /**
   * T549 (AC-378, AC-379; xcube 46ca0ce708): a query Cube Store's router
   * runs, which its timeout can't end, is stopped with no end at the latest.
   * It is said to run to its end, and the next run waits while xcube says
   * it does, however long: for as long as xcube follows it.
   */
  it('says a stopped router query runs to its end, and holds the next run with no end said', async () => {
    await turnOn();
    stub.answerSql((ask) =>
      'cubeStore' in ask.target && ask.sql.includes('router')
        ? {
            status: 422,
            body: {
              error:
                "The statement ran past 30 s and was stopped; Cube Store can't stop a query, and runs this one, which its router runs, to its end: nothing bounds it",
              code: 'timeout',
              statement: 'select',
              redactedSql: 'SELECT ?',
              durationMs: 32_004,
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: 'stopped',
              stillRunning: true,
              endsBy: null,
            },
          }
        : undefined,
    );
    try {
      const stopped = await run('super', `SELECT 'router ${MARK}'`);
      expect(stopped.statusCode, stopped.body).toBe(422);
      expect(stopped.json()).toEqual({
        outcome: 'timeout',
        error: 'Stopped at 30 seconds: Cube Store runs this query to its end; it can’t be stopped.',
        durationMs: 32_004,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        statement: 'select',
        stillRunning: true,
        endsBy: null,
      });
      const [routerId] = stub
        .sqlAsked()
        .slice(-1)
        .map((ask) => ask.runId);
      stub.answerSqlState((runId) =>
        runId === routerId ? { state: 'stopping' } : { state: 'ended' },
      );
      const going = {
        dataSource: null,
        cubeStore: true,
        startedAt: expect.any(String),
        stopping: true,
        endsBy: null,
      };
      const held = await run('super', `SELECT 'next ${MARK}'`);
      expect(held.statusCode, held.body).toBe(409);
      expect(held.json()).toEqual({
        outcome: 'going',
        error:
          'Cube Store is still finishing your last query. One run at a time: your next one runs once it has ended.',
        going,
      });
      expect((await as('super', { method: 'GET', url: '/api/sql-runs/going' })).json()).toEqual({
        going,
      });
      // Asked about for as long as xcube follows it, 24 hours, not to any timeout.
      const row = await getDb()
        .selectFrom('sql_runs')
        .select(['started_at', 'ends_by'])
        .where('id', '=', routerId!)
        .executeTakeFirstOrThrow();
      expect(row.ends_by!.getTime() - row.started_at.getTime()).toBeGreaterThan(24 * 3_600_000);
      // Its event says it runs on, with no end.
      const event = (await cubeStoreEvents()).find(
        (record) =>
          record.event === 'sql-run' &&
          record.item?.id === CUBE_STORE_TARGET &&
          record.details?.['stillRunning'] === true &&
          record.details?.['endsBy'] === null,
      );
      expect(event).toMatchObject({
        summary: 'Stopped at 30 seconds · Cube Store runs it on',
        details: { outcome: 'timeout', rowCount: 0, stillRunning: true, endsBy: null },
      });

      // Cube Store has answered it: ended, as xcube says. The next run runs.
      stub.answerSqlState(() => ({ state: 'ended' }));
      expect((await run('super', `SELECT 'after ${MARK}'`)).statusCode).toBe(200);
    } finally {
      await endAll();
      await turn('super', { on: false });
    }
  });
});
