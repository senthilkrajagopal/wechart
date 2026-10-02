import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
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
 * T533 (AC-379; R50-9): one run at a time per user, and Cancel. While a
 * user's run goes, a second of theirs — on any data source — is refused,
 * naming the first, and nothing reaches xcube; another user's runs. Cancel
 * asks xcube to stop the run going, on the database, and its own request
 * then answers that it was cancelled.
 *
 * Against the stub xcube, which holds each run until it is cancelled.
 * `writer` (`sales-rw`) writes /Sales; `super` is a Super-Admin.
 */
const MARK = `sqlg${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlg-${MARK}`;
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
const runs = () => sqlRuns(getDb());
const slowToFinish: ReturnType<typeof sqlRuns> = {
  ...runs(),
  finish: async (...args: Parameters<ReturnType<typeof sqlRuns>['finish']>) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return runs().finish(...args);
  },
};

beforeAll(async () => {
  // A run a test cut short left going holds its user up no more.
  await getDb()
    .updateTable('sql_runs')
    .set({ finished_at: sql<Date>`now()`, outcome: 'lost' })
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
    sqlRunnerSwitches: switches(),
    // A run's row finished slowly, so an answer sent before it is done shows
    // it still going (T533's review).
    sqlRuns: slowToFinish,
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
  stub.holdSql(false);
  if (app !== undefined) await app.close();
  for (const id of sourceIds) {
    await switches().off(id);
    await getDb().deleteFrom('sql_runs').where('data_source_id', '=', id).execute();
    await sources().remove(id);
  }
  if (folder !== '') await docs().remove('folder', folder);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const run = (who: string, id: string, text = 'SELECT pg_sleep(20)') =>
  as(who, { method: 'POST', url: `/api/data-sources/${id}/sql`, payload: { sql: text } });
const cancel = (who: string) => as(who, { method: 'POST', url: '/api/sql-runs/cancel' });
const goingOf = (who: string) => as(who, { method: 'GET', url: '/api/sql-runs/going' });

describe('one run at a time per user, and Cancel (T533, AC-379)', () => {
  it('refuses a user’s second run while their first goes, on any data source, naming the first; another user runs', async () => {
    stub.holdSql(true);
    const first = run('writer', sourceIds[0]!);
    await expect.poll(() => stub.sqlGoing().length).toBe(1);
    const asked = stub.sqlAsked().length;

    const second = await run('writer', sourceIds[1]!, 'SELECT 1');
    expect(second.statusCode, second.body).toBe(409);
    expect(second.json()).toEqual({
      outcome: 'going',
      error: `You have a run going on one_${MARK}. One run at a time: cancel it, or wait for it to finish.`,
      going: {
        dataSource: { id: sourceIds[0], name: `one_${MARK}` },
        // Not Cube Store's (T536).
        cubeStore: false,
        startedAt: expect.any(String),
      },
    });
    expect(stub.sqlAsked()).toHaveLength(asked);

    const going = await goingOf('writer');
    expect(going.statusCode).toBe(200);
    expect(going.json()).toEqual({
      going: {
        dataSource: { id: sourceIds[0], name: `one_${MARK}` },
        cubeStore: false,
        startedAt: expect.any(String),
      },
    });
    // Another's run isn't held up by it.
    const other = run('super', sourceIds[1]!);
    await expect.poll(() => stub.sqlGoing().length).toBe(2);
    expect((await goingOf('super')).json()).toMatchObject({
      going: { dataSource: { id: sourceIds[1] } },
    });

    // Cancel stops the first on the database, by its run id, and it says so.
    const cancelled = await cancel('writer');
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json()).toEqual({ cancelled: true });
    const answer = await first;
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toMatchObject({
      outcome: 'cancelled',
      error: 'Cancelled: the run was stopped on the database.',
    });
    expect((await goingOf('writer')).json()).toEqual({ going: null });
    expect(stub.sqlGoing()).toHaveLength(1);

    expect((await cancel('super')).json()).toEqual({ cancelled: true });
    expect((await other).statusCode).toBe(422);
    stub.holdSql(false);

    // Once it is done, the next runs.
    const next = await run('writer', sourceIds[1]!, 'SELECT 1');
    expect(next.statusCode, next.body).toBe(200);
  });

  it('stops a run cancelled before xcube knows it, once xcube does (T533’s review)', async () => {
    stub.holdSql(true);
    stub.sqlKnownAfter(400);
    try {
      const first = run('writer', sourceIds[0]!);
      // wechart's row is there before xcube knows the run.
      await expect
        .poll(async () => (await goingOf('writer')).json<{ going: unknown }>().going)
        .not.toBeNull();
      const cancelled = await cancel('writer');
      expect(cancelled.statusCode, cancelled.body).toBe(200);
      expect(cancelled.json()).toEqual({ cancelled: true });
      expect((await first).json()).toMatchObject({ outcome: 'cancelled' });
    } finally {
      stub.sqlKnownAfter(0);
      stub.holdSql(false);
    }
  });

  it('says xcube can’t be reached to cancel, keeping the run going', async () => {
    stub.holdSql(true);
    const first = run('writer', sourceIds[0]!);
    await expect.poll(() => stub.sqlGoing().length).toBe(1);
    stub.down(true);
    try {
      const answer = await cancel('writer');
      expect(answer.statusCode, answer.body).toBe(503);
      expect(answer.json()).toEqual({
        error: 'xcube can’t be reached to cancel the run. Try again once it’s back.',
      });
    } finally {
      stub.down(false);
    }
    expect((await cancel('writer')).json()).toEqual({ cancelled: true });
    expect((await first).statusCode).toBe(422);
    stub.holdSql(false);
  });

  it('says there is nothing to cancel when no run of theirs goes', async () => {
    const answer = await cancel('writer');
    expect(answer.statusCode, answer.body).toBe(404);
    expect(answer.json()).toEqual({ error: 'You have no run going.' });
  });

  it('frees the user once a run finishes, whatever its outcome', async () => {
    stub.answerSql(() => ({
      status: 422,
      body: { error: 'boom', code: 'query_failed', statement: 'select', redactedSql: 'SELECT ?' },
    }));
    expect((await run('writer', sourceIds[0]!, 'SELECT 1')).statusCode).toBe(422);
    stub.answerSql(undefined);
    expect((await goingOf('writer')).json()).toEqual({ going: null });
    expect((await run('writer', sourceIds[0]!, 'SELECT 1')).statusCode).toBe(200);
  });
});
