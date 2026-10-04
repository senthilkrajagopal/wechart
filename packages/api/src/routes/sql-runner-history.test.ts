import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore, type AuditRecord } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { sqlRuns } from '../repos/sql-runs';
import { buildServer } from '../server';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { xcubeSqlRunner } from '../xcube/sql-runner';

/**
 * T534 (AC-381, AC-382; R50-12, R50-13): each user's runs kept, and listed
 * to them alone, newest first, a data source's by default or all; and every
 * run an audit event with who, the data source and its folder, when, the
 * outcome, the rows, the duration and the SQL with every literal replaced.
 * The database's own words, which may quote a literal, never reach the trail.
 *
 * Against the stub xcube, whose `redactedSql` replaces strings and numbers.
 * `writer` (`sales-rw`) writes /Sales; `super` is a Super-Admin.
 */
const MARK = `sqlh${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlh-${MARK}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});

let folder = '';
const sourceIds: string[] = [];
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());
const audit = () => auditStore(getDb());

beforeAll(async () => {
  // A run a test cut short left going holds its user up no more.
  await getDb()
    .updateTable('sql_runs')
    .set({ finished_at: new Date(), outcome: 'lost' })
    .where('finished_at', 'is', null)
    .execute();
  folder = randomUUID();
  await docs().create({
    kind: 'folder',
    id: folder,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  for (const name of ['one', 'two']) {
    const made = await sources().create({
      folderId: folder,
      name: `${name}_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed(name) },
    });
    sourceIds.push(made.id);
    await switches().on(made.id, { key: 'super', name: 'Super' });
  }
  stub = fakeXcube();
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
    dataSources: sources(),
    audit: audit(),
    sqlRunnerSwitches: switches(),
    sqlRuns: sqlRuns(getDb()),
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      model: MODEL,
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [folder, 'fsales'],
      ]),
      parents: new Map([
        ['root', null],
        [folder, 'root'],
      ]),
    }),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const id of sourceIds) {
    await switches().off(id);
    await getDb().deleteFrom('sql_runs').where('data_source_id', '=', id).execute();
    await sources().remove(id);
  }
  if (folder !== '') await docs().remove('folder', folder);
  await closeDb();
});

beforeEach(() => {
  stub.answerSql(undefined);
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const run = (who: string, id: string, sql: string) =>
  as(who, { method: 'POST', url: `/api/data-sources/${id}/sql`, payload: { sql } });
const listOf = async (who: string, query = '') =>
  (await as(who, { method: 'GET', url: `/api/sql-runs${query}` })).json<{
    runs: { id: string; sql: string; dataSource: { id: string } | null }[];
    next?: string;
  }>();
/** The SQL-run events of this test's folder, newest first. */
const events = async (): Promise<AuditRecord[]> =>
  (await audit().list({ events: ['sql-run'], folderIds: [folder], limit: 200 })).records;

describe('a user’s own runs (T534, AC-381)', () => {
  it('are listed to them alone, newest first, with the SQL, data source, time, outcome and rows', async () => {
    expect((await run('writer', sourceIds[0]!, `SELECT 'first ${MARK}'`)).statusCode).toBe(200);
    expect((await run('writer', sourceIds[1]!, `SELECT 'second ${MARK}'`)).statusCode).toBe(200);
    expect((await run('super', sourceIds[0]!, `SELECT 'supers ${MARK}'`)).statusCode).toBe(200);

    const mine = await as('writer', { method: 'GET', url: '/api/sql-runs' });
    expect(mine.statusCode, mine.body).toBe(200);
    const listed = mine
      .json<{ runs: Record<string, unknown>[] }>()
      .runs.filter((each) => String(each['sql']).includes(MARK));
    expect(listed).toEqual([
      {
        id: expect.any(String),
        sql: `SELECT 'second ${MARK}'`,
        dataSource: {
          id: sourceIds[1],
          name: `two_${MARK}`,
          folderPath: [{ id: folder, title: `Sales ${MARK}` }],
          inWorkspace: false,
        },
        // Not Cube Store's (T536).
        cubeStore: false,
        startedAt: expect.any(String),
        outcome: 'finished',
        rowCount: 1,
        durationMs: 1,
        truncated: null,
        statement: 'select',
      },
      expect.objectContaining({ sql: `SELECT 'first ${MARK}'`, outcome: 'finished' }),
    ]);
    // Never another's.
    expect(mine.body).not.toContain(`supers ${MARK}`);
  });

  it('are a data source’s alone when asked for its', async () => {
    const listed = await listOf('writer', `?dataSource=${sourceIds[0]!}`);
    expect(listed.runs.length).toBeGreaterThan(0);
    expect(listed.runs.every((each) => each.dataSource?.id === sourceIds[0])).toBe(true);
  });
});

describe('every run, an audit event (T534, AC-382)', () => {
  it('records who, the data source and its folder, when, the outcome, the rows, the duration, and the SQL with every literal replaced', async () => {
    const sql = `SELECT * FROM orders WHERE region = 'EMEA-${MARK}' AND amount > 4242`;
    expect((await run('writer', sourceIds[0]!, sql)).statusCode).toBe(200);
    const [event] = await events();
    expect(event).toMatchObject({
      event: 'sql-run',
      actor: { key: expect.any(String), name: 'Wren Writer' },
      folderId: folder,
      item: { kind: 'data-source', id: sourceIds[0], title: `one_${MARK}` },
      // As design 15's state J words it.
      summary: 'Finished · 1 row · 0 s',
      details: {
        outcome: 'finished',
        rowCount: 1,
        durationMs: 1,
        truncated: null,
        statement: 'select',
        sql: 'SELECT * FROM orders WHERE region = ? AND amount > ?',
        inWorkspace: false,
      },
    });
    expect(event!.at).toEqual(expect.any(Date));
    expect(event!.actor?.name).toBe('Wren Writer');
    expect(JSON.stringify(event)).not.toContain(`EMEA-${MARK}`);
    expect(JSON.stringify(event)).not.toContain('4242');
  });

  it('records a refused run as not run, and a failed one without the database’s words, which may quote a literal', async () => {
    stub.answerSql((ask) =>
      ask.sql.startsWith('DELETE')
        ? {
            status: 400,
            body: {
              error: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
              code: 'not_read_only',
              statement: 'delete',
              redactedSql: 'DELETE FROM t WHERE a = ?',
            },
          }
        : {
            status: 422,
            body: {
              error: `invalid input syntax for type integer: "abc${MARK}"`,
              code: 'query_failed',
              statement: 'select',
              redactedSql: 'SELECT ?::int',
              durationMs: 3,
            },
          },
    );
    expect(
      (await run('writer', sourceIds[1]!, `DELETE FROM t WHERE a = 'gone${MARK}'`)).statusCode,
    ).toBe(400);
    expect((await run('writer', sourceIds[1]!, `SELECT 'abc${MARK}'::int`)).statusCode).toBe(422);
    const [failed, refused] = (await events()).filter((each) => each.item?.id === sourceIds[1]);
    expect(refused).toMatchObject({
      summary: 'Not run · a DELETE',
      details: {
        outcome: 'refused',
        rowCount: null,
        durationMs: null,
        sql: 'DELETE FROM t WHERE a = ?',
      },
    });
    expect(failed).toMatchObject({
      summary: 'Database error',
      details: { outcome: 'failed', rowCount: null, durationMs: 3, sql: 'SELECT ?::int' },
    });
    expect([failed?.event, refused?.event]).toEqual(['sql-run', 'sql-run']);
    for (const literal of [`gone${MARK}`, `abc${MARK}`])
      expect(JSON.stringify([failed, refused])).not.toContain(literal);
  });

  it('records a stopped run, and one xcube refused or didn’t answer, each as what it was (T534’s review)', async () => {
    stub.answerSql((ask) =>
      ask.sql === 'stop'
        ? {
            status: 422,
            body: {
              error: 'The statement ran past 30 s and was stopped',
              code: 'timeout',
              statement: 'select',
              redactedSql: 'SELECT pg_sleep(?)',
              durationMs: 30_002,
            },
          }
        : { status: 500, body: { error: 'Boom', code: 'internal' } },
    );
    expect((await run('writer', sourceIds[1]!, 'stop')).statusCode).toBe(422);
    const refusedByXcube = await run('writer', sourceIds[1]!, 'odd');
    expect(refusedByXcube.statusCode).toBe(502);
    expect(refusedByXcube.json()).toMatchObject({ outcome: 'unavailable' });
    const [odd, stopped] = (await events()).filter((each) => each.item?.id === sourceIds[1]);
    expect(stopped).toMatchObject({
      summary: 'Stopped at 30 seconds',
      details: { outcome: 'timeout', durationMs: 30_002, sql: 'SELECT pg_sleep(?)' },
    });
    expect(odd).toMatchObject({
      summary: 'Not run · xcube refused it',
      details: { outcome: 'unavailable', sql: null },
    });
  });

  it('records the rows a stopped run read before its stop, in its history and its event (T545, AC-378)', async () => {
    stub.answerSql(() => ({
      status: 422,
      body: {
        error: 'The run was cancelled',
        code: 'cancelled',
        statement: 'select',
        redactedSql: `SELECT g FROM generate_series(?, ?) g`,
        durationMs: 1_503,
        columns: [{ name: 'g', type: 'int4' }],
        rows: [[1], [2]],
        rowCount: 2,
        truncated: 'stopped',
      },
    }));
    const sql = `SELECT g FROM generate_series(1, 9) g -- ${MARK} stopped`;
    expect((await run('writer', sourceIds[0]!, sql)).statusCode).toBe(422);
    const listed = (await listOf('writer')).runs.find((each) => each.sql === sql);
    expect(listed).toMatchObject({ outcome: 'cancelled', rowCount: 2 });
    const [event] = (await events()).filter((each) => each.item?.id === sourceIds[0]);
    expect(event).toMatchObject({
      summary: 'Cancelled · 2 rows',
      details: { outcome: 'cancelled', rowCount: 2 },
    });
  });

  it('records a run its server never finished, as it counts it lost at its user’s next run (T534’s review)', async () => {
    expect((await run('writer', sourceIds[0]!, 'SELECT 1')).statusCode).toBe(200);
    const { user_key: writerKey } = await getDb()
      .selectFrom('sql_runs')
      .select('user_key')
      .where('data_source_id', '=', sourceIds[0]!)
      .orderBy('started_at', 'desc')
      .executeTakeFirstOrThrow();
    // An API instance stopped mid-run: its row never finished.
    const lost = randomUUID();
    await getDb()
      .insertInto('sql_runs')
      .values({
        id: lost,
        user_key: writerKey,
        data_source_id: sourceIds[1]!,
        data_source_name: `two_${MARK}`,
        sql: `SELECT 'kept${MARK}'`,
        started_at: new Date(Date.now() - 10 * 60_000),
      })
      .execute();
    expect((await run('writer', sourceIds[0]!, 'SELECT 2')).statusCode).toBe(200);
    const [event] = (await events()).filter((each) => each.details?.['outcome'] === 'lost');
    expect(event).toMatchObject({
      actor: { name: 'Wren Writer' },
      folderId: folder,
      item: { kind: 'data-source', id: sourceIds[1], title: `two_${MARK}` },
      summary: 'Not finished · its server stopped mid-run',
      details: { outcome: 'lost', rowCount: null, durationMs: null, sql: null },
    });
    expect(JSON.stringify(event)).not.toContain(`kept${MARK}`);
  });
});

describe('a run on a data source one no longer sees (T534’s review)', () => {
  it('is listed under the name it had, not its new one', async () => {
    const hidden = await sources().create({
      folderId: folder,
      name: `hidden_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('hidden') },
    });
    sourceIds.push(hidden.id);
    await switches().on(hidden.id, { key: 'super', name: 'Super' });
    expect((await run('writer', hidden.id, `SELECT 'h${MARK}'`)).statusCode).toBe(200);
    // Moved where the writer can't see it, and renamed there.
    const elsewhere = randomUUID();
    await docs().create({
      kind: 'folder',
      id: elsewhere,
      body: {
        owner: 'admin',
        title: `Elsewhere ${MARK}`,
        folderId: 'root',
        access: { readOnly: null, readWrite: ['managers'] },
      },
    });
    try {
      await getDb()
        .updateTable('data_sources')
        .set({ folder_id: elsewhere, name: `renamed_${MARK}` })
        .where('id', '=', hidden.id)
        .execute();
      const listed = (await listOf('writer', `?dataSource=${hidden.id}`)).runs;
      expect(listed.map((each) => each.dataSource)).toEqual([
        { id: hidden.id, name: `hidden_${MARK}`, folderPath: null, inWorkspace: false },
      ]);
    } finally {
      await getDb()
        .updateTable('data_sources')
        .set({ folder_id: folder })
        .where('id', '=', hidden.id)
        .execute();
      await docs().remove('folder', elsewhere);
    }
  });
});
