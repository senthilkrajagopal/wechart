import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import pg from 'pg';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { buildHistory } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { RUN_QUEUE, scheduleStore, wechartScheduler } from '../scheduler/schedules';
import { buildServer } from '../server';

/**
 * T378 / AC-234, AC-297 (design 16, screen 2 and Q10): wechart's schedules
 * through the API. A read-write member of a pre-aggregation's folder makes,
 * changes and deletes one, at once and with no proposal, and changes one
 * another member made. A member of another folder is refused, and so is a
 * reader. A schedule whose maker has left the folder's groups still runs,
 * and still names them.
 *
 * `writer` (`sales-rw`) and `manager` (`managers`) write /A; `many` (`g01`)
 * writes /C; `reader` (`sales-ro`) reads /A. On pg-boss in a schema of the
 * test's own, with its TestClock, and a stub Cube.
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

const MARK = `schedroutes${randomUUID().slice(0, 8)}`;
const SCHEMA = `pgboss_${MARK}`;
const clock = new TestClock(new Date('2026-10-05T04:00:00Z'));
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { a: '', c: '' };
const xcubeIds = { a: '', c: '' };
let app: FastifyInstance;
let boss: PgBoss;
/** Every jobs post the stub Cube is sent, by the pre-aggregations it names. */
const posted: string[][] = [];

async function folder(title: string, access: { readOnly: string[]; readWrite: string[] }) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: { owner: 'admin', title, folderId: 'root', access },
  });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

const preAggIn = (place: 'a' | 'c') => `${xcubeIds[place]}__orders.by_month`;

interface Listed {
  id: string;
  name: string;
  preAggregation: string;
  folderId: string | null;
  cron: string;
  timezone: string;
  missed: string;
  createdBy: { key: string; name: string };
  updatedBy: { key: string; name: string };
}

const fields = (place: 'a' | 'c', over: Record<string, unknown> = {}) => ({
  name: `Morning ${MARK}`,
  preAggregation: preAggIn(place),
  cron: '0 5 * * *',
  timezone: 'Europe/London',
  ...over,
});

const listed = async (who: string) => {
  const answer = await as(who, { method: 'GET', url: '/api/wechart-schedules' });
  return {
    status: answer.statusCode,
    rows:
      answer.statusCode === 200
        ? answer.json<Listed[]>().filter((each) => [ids.a, ids.c].includes(each.folderId ?? ''))
        : [],
  };
};

/** pg-boss's own schedule for one of wechart's, as its times are laid. */
const laid = async (id: string) =>
  (await boss.getSchedules(RUN_QUEUE)).find((each) => each.key === id);

beforeAll(async () => {
  ids.a = await folder(`A ${MARK}`, {
    readOnly: ['sales-ro'],
    readWrite: ['sales-rw', 'managers'],
  });
  ids.c = await folder(`C ${MARK}`, { readOnly: [], readWrite: ['g01'] });
  xcubeIds.a = `f${ids.a.replaceAll('-', '')}`;
  xcubeIds.c = `f${ids.c.replaceAll('-', '')}`;
  const cube = (name: string, folderId: string) => ({
    name,
    meta: { xcube: { folderId, shortName: 'orders' } },
    preAggregations: [{ name: 'by_month', type: 'rollup', partitionGranularity: 'month' }],
  });
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    service: async () => 'service-token',
    model: { id: 'dev', revision: async () => undefined },
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const asked = new URL(url);
      if (asked.pathname.endsWith('/models/dev/meta'))
        return Response.json({
          cubes: [
            cube(`${xcubeIds.a}__orders`, xcubeIds.a),
            cube(`${xcubeIds.c}__orders`, xcubeIds.c),
          ],
        });
      if (asked.pathname.endsWith('/v1/pre-aggregations/jobs')) {
        const body = JSON.parse(String(init?.body)) as { selector: { preAggregations: string[] } };
        // This file's: its scheduler lays every stored schedule, another test file's too.
        const named = body.selector.preAggregations;
        if (named.some((each) => each === preAggIn('a') || each === preAggIn('c')))
          posted.push(named);
        return Response.json([`${MARK}-token-${String(posted.length)}`]);
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
  const scheduler = wechartScheduler({
    boss,
    store: scheduleStore(getDb()),
    history: buildHistory(getDb()),
    cube: client,
    now: () => new Date(clock.now()),
    pollingIntervalSeconds: 0.5,
  });
  await scheduler.start();
  app = buildServer({
    config: secured,
    cube: client,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [ids.a, xcubeIds.a],
        [ids.c, xcubeIds.c],
      ]),
      parents: new Map([
        ['root', null],
        [ids.a, 'root'],
        [ids.c, 'root'],
      ]),
    }),
    buildHistory: buildHistory(getDb()),
    schedules: scheduler,
  });
  for (const who of ['writer', 'manager', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (boss !== undefined) await boss.stop({ graceful: false, close: true });
  const db = getDb();
  await db.deleteFrom('schedules').where('folder_id', 'in', [ids.a, ids.c]).execute();
  await db
    .deleteFrom('build_runs')
    .where('pre_aggregation', 'in', [preAggIn('a'), preAggIn('c')])
    .execute();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.end();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

describe('wechart’s schedules through the API (T378, AC-234, AC-297)', { timeout: 120_000 }, () => {
  it('lets a read-write member make, change and delete one at once, and change one another member made', async () => {
    const createdAnswer = await as('writer', {
      method: 'POST',
      url: '/api/wechart-schedules',
      payload: fields('a'),
    });
    expect(createdAnswer.statusCode).toBe(201);
    const created = createdAnswer.json<Listed>();
    expect(created).toMatchObject({
      name: `Morning ${MARK}`,
      preAggregation: preAggIn('a'),
      folderId: ids.a,
      cron: '0 5 * * *',
      timezone: 'Europe/London',
      // Run once when wechart is back, unless chosen otherwise (Q8).
      missed: 'once',
    });
    // At once, with no proposal: its times are laid in pg-boss, in its zone.
    expect(await laid(created.id)).toMatchObject({
      cron: '0 5 * * *',
      timezone: 'Europe/London',
    });
    expect((await listed('writer')).rows.map((each) => each.id)).toEqual([created.id]);

    // Another member of the folder changes it.
    const changedAnswer = await as('manager', {
      method: 'PUT',
      url: `/api/wechart-schedules/${created.id}`,
      payload: fields('a', { cron: '30 6 * * 1-5', missed: 'skip' }),
    });
    expect(changedAnswer.statusCode).toBe(200);
    const changed = changedAnswer.json<Listed>();
    expect(changed.createdBy).toEqual(created.createdBy);
    expect(changed.updatedBy.key).not.toBe(created.createdBy.key);
    expect(await laid(created.id)).toMatchObject({ cron: '30 6 * * 1-5' });

    const deleted = await as('writer', {
      method: 'DELETE',
      url: `/api/wechart-schedules/${created.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(await laid(created.id)).toBeUndefined();
    expect((await listed('writer')).rows).toEqual([]);
  });

  it('refuses a member of another folder and a reader', async () => {
    const own = (
      await as('writer', { method: 'POST', url: '/api/wechart-schedules', payload: fields('a') })
    ).json<Listed>();

    // Making one on /A's pre-aggregation.
    for (const who of ['many', 'reader'])
      expect(
        (await as(who, { method: 'POST', url: '/api/wechart-schedules', payload: fields('a') }))
          .statusCode,
        who,
      ).toBe(403);
    // Changing and deleting /A's, and listing it.
    for (const who of ['many', 'reader']) {
      expect(
        (
          await as(who, {
            method: 'PUT',
            url: `/api/wechart-schedules/${own.id}`,
            payload: fields('a', { cron: '0 7 * * *' }),
          })
        ).statusCode,
        who,
      ).toBe(403);
      expect(
        (await as(who, { method: 'DELETE', url: `/api/wechart-schedules/${own.id}` })).statusCode,
        who,
      ).toBe(403);
    }
    expect((await listed('many')).rows).toEqual([]);
    expect((await listed('reader')).status).toBe(403);
    // Nor moved into a folder they don't write, by one who writes its own.
    expect(
      (
        await as('writer', {
          method: 'PUT',
          url: `/api/wechart-schedules/${own.id}`,
          payload: fields('c'),
        })
      ).statusCode,
    ).toBe(403);
    expect(await laid(own.id)).toMatchObject({ cron: '0 5 * * *' });
    // A Super-Admin sees every folder's.
    expect((await listed('super')).rows.map((each) => each.id)).toEqual([own.id]);
    expect(
      (await as('writer', { method: 'DELETE', url: `/api/wechart-schedules/${own.id}` }))
        .statusCode,
    ).toBe(204);
  });

  it('refuses a schedule with no zone, an unreadable cron, or a pre-aggregation that isn’t there', async () => {
    const refusal = async (payload: Record<string, unknown>) => {
      const answer = await as('writer', { method: 'POST', url: '/api/wechart-schedules', payload });
      return { status: answer.statusCode, error: answer.json<{ error: string }>().error };
    };
    expect(await refusal(fields('a', { timezone: '' }))).toEqual({
      status: 400,
      error: 'Choose the time zone its times are in.',
    });
    expect(await refusal(fields('a', { cron: '0 25 * * *' }))).toEqual({
      status: 400,
      error: 'The hour is 25; it must be 0 to 23.',
    });
    expect(await refusal(fields('a', { preAggregation: `${xcubeIds.a}__orders.gone` }))).toEqual({
      status: 404,
      error: 'There is no such pre-aggregation.',
    });
    expect((await listed('writer')).rows).toEqual([]);
  });

  it('still runs a schedule whose maker has left the folder’s groups, and still names them (Q10)', async () => {
    await clock.setTime(new Date('2026-10-06T03:58:00Z'));
    const own = (
      await as('writer', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('a', { name: `Left ${MARK}` }),
      })
    ).json<Listed>();
    // `sales-rw` taken off /A: the writer no longer writes it.
    const stored = await docs().get('folder', ids.a);
    await docs().update({
      kind: 'folder',
      id: ids.a,
      body: { ...stored!.body, access: { readOnly: ['sales-ro'], readWrite: ['managers'] } },
      expectedVersion: stored!.version,
    });
    // Theirs no longer: another test file's folder may still be one they write.
    expect((await listed('writer')).rows).toEqual([]);

    // 05:00 in London is 04:00 UTC in October. Only this test's run counts.
    posted.length = 0;
    for (let at = 0; at < 240 && posted.length === 0; at += 1) {
      await clock.tick(1000);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Its record, once written: the post comes before it.
    const runsOf = async () =>
      (
        await buildHistory(getDb()).list({
          within: undefined,
          filters: { starter: { kind: 'schedule', id: own.id } },
        })
      ).records;
    const deadline = Date.now() + 10_000;
    let runs = await runsOf();
    while (runs.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      runs = await runsOf();
    }

    expect(posted).toEqual([[preAggIn('a')]]);
    expect(runs).toHaveLength(1);
    // Still named as its maker.
    const kept = (await listed('manager')).rows.find((each) => each.id === own.id);
    expect(kept?.createdBy).toEqual(own.createdBy);
  });
});
