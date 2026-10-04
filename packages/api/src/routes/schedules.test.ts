import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import pg from 'pg';
import { PgBoss, TestClock } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, databaseUrl, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { buildHistory } from '../repos/build-history';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import {
  RUN_QUEUE,
  scheduleStore,
  wechartScheduler,
  type WechartScheduler,
} from '../scheduler/schedules';
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
/** This file's folders, by a letter of its own: wechart's ids, and xcube's. */
const ids: Record<string, string> = {};
const xcubeIds: Record<string, string> = {};
let app: FastifyInstance;
let boss: PgBoss;
let scheduler: WechartScheduler;
/** Pre-aggregations whose jobs posts the stub Cube refuses, as for one the model no longer has. */
const refusing = new Set<string>();
/** Folders whose cube the stub meta leaves out: their rollups are gone from the model. */
const unlisted = new Set<string>();
const REMOVED =
  "A user's selector doesn't match any of the pre-aggregations defined in the data model.";
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

/**
 * A folder of this file's, published, its cube's rollup listed: made by the
 * test that uses it, so nothing another test does to a folder reaches it.
 */
async function place(key: string, access: { readOnly: string[]; readWrite: string[] }) {
  ids[key] = await folder(`${key.toUpperCase()} ${MARK}`, access);
  xcubeIds[key] = `f${ids[key].replaceAll('-', '')}`;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

const preAggIn = (key: string) => `${xcubeIds[key] ?? ''}__orders.by_month`;

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
  /** As Schedules shows it (T552): by its short name, with its folder. */
  shortName?: string;
  folderPath?: string[];
  when?: string;
  runs?: string[];
  lastRun?: { id: string; outcome: string | null; startedAt: string } | null;
}

const fields = (key: string, over: Record<string, unknown> = {}) => ({
  name: `Morning ${MARK}`,
  preAggregation: preAggIn(key),
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
        ? answer.json<Listed[]>().filter((each) => Object.values(ids).includes(each.folderId ?? ''))
        : [],
  };
};

/** pg-boss's own schedule for one of wechart's, as its times are laid. */
const laid = async (id: string) =>
  (await boss.getSchedules(RUN_QUEUE)).find((each) => each.key === id);

beforeAll(async () => {
  await place('a', { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'managers'] });
  await place('c', { readOnly: [], readWrite: ['g01'] });
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
          cubes: Object.keys(xcubeIds)
            .filter((key) => !unlisted.has(key))
            .map((key) => cube(`${xcubeIds[key]!}__orders`, xcubeIds[key]!)),
        });
      if (asked.pathname.endsWith('/v1/pre-aggregations/jobs')) {
        const body = JSON.parse(String(init?.body)) as { selector: { preAggregations: string[] } };
        const named = body.selector.preAggregations;
        if (named.some((each) => refusing.has(each)))
          return Response.json({ error: REMOVED }, { status: 400 });
        if (named.some((each) => Object.keys(ids).some((key) => each === preAggIn(key))))
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
  scheduler = wechartScheduler({
    boss,
    // This file's schedules alone: another file's, in the same database, aren't its to run.
    store: scheduleStore(getDb(), { named: MARK }),
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
        ...Object.keys(ids).map((key) => [ids[key]!, xcubeIds[key]!] as [string, string]),
      ]),
      parents: new Map<string, string | null>([
        ['root', null],
        ...Object.values(ids).map((id) => [id, 'root'] as [string, string]),
      ]),
    }),
    buildHistory: buildHistory(getDb()),
    schedules: scheduler,
    // Changes and Run now's starts in the trail (T505, T555).
    audit: auditStore(getDb()),
    // Next runs are counted from pg-boss's clock (T552).
    now: () => new Date(clock.now()),
  });
  for (const who of ['writer', 'manager', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (boss !== undefined) await boss.stop({ graceful: false, close: true });
  const db = getDb();
  await db.deleteFrom('schedules').where('name', 'like', `%${MARK}%`).execute();
  await db
    .deleteFrom('build_runs')
    .where('pre_aggregation', 'in', Object.keys(ids).map(preAggIn))
    .execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', Object.values(ids)).execute();
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
    const stored = await docs().get('folder', ids['a']!);
    await docs().update({
      kind: 'folder',
      id: ids['a']!,
      body: { ...stored!.body, access: { readOnly: ['sales-ro'], readWrite: ['managers'] } },
      expectedVersion: stored!.version,
    });
    // Theirs no longer: another test file's folder may still be one they write.
    expect((await listed('writer')).rows).toEqual([]);

    // 05:00 in London is 04:00 UTC in October. Only this test's run counts.
    // The clock is brought to it and held there, a second at a time, never
    // past its minute: pg-boss's passes, timed in real time, come late under load.
    posted.length = 0;
    await clock.setTime(new Date('2026-10-06T03:59:58Z'));
    const deadline = Date.now() + 30_000;
    for (let ticks = 0; posted.length === 0 && Date.now() < deadline; ticks += 1) {
      if (ticks < 40) await clock.tick(1000);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    // Its record, once written: the post comes before it.
    const runsOf = async () =>
      (
        await buildHistory(getDb()).list({
          within: undefined,
          filters: { starter: { kind: 'schedule', id: own.id } },
        })
      ).records;
    const recorded = Date.now() + 10_000;
    let runs = await runsOf();
    while (runs.length === 0 && Date.now() < recorded) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      runs = await runsOf();
    }

    expect(posted).toEqual([[preAggIn('a')]]);
    expect(runs).toHaveLength(1);
    // Still named as its maker.
    const kept = (await listed('manager')).rows.find((each) => each.id === own.id);
    expect(kept?.createdBy).toEqual(own.createdBy);
    // With how its last run went (T552, AC-154): under way still, so no outcome.
    expect([kept?.lastRun?.id, kept?.lastRun?.outcome]).toEqual([runs[0]?.id, null]);
    expect(
      (await as('manager', { method: 'DELETE', url: `/api/wechart-schedules/${own.id}` }))
        .statusCode,
    ).toBe(204);
  });
});

describe('Schedules’ wechart rows, and the form’s preview (T552, AC-234, AC-154)', () => {
  it('lists each by its short name and folder, in words, with its next five runs and no last run yet', async () => {
    // 03:00 UTC, before 05:00 in London (04:00 UTC).
    await clock.setTime(new Date('2026-10-05T03:00:00Z'));
    // In a folder of this test's own, the manager's.
    await place('d', { readOnly: [], readWrite: ['managers'] });
    const own = (
      await as('manager', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('d', { name: `Listed ${MARK}` }),
      })
    ).json<Listed>();

    const row = (await listed('manager')).rows.find((each) => each.id === own.id);

    // The made schedule is answered as the list has it, so the page can show it at once.
    expect(own).toEqual(row);
    expect({
      shortName: row?.shortName,
      folderPath: row?.folderPath,
      when: row?.when,
      runs: row?.runs,
      lastRun: row?.lastRun,
    }).toEqual({
      shortName: 'orders',
      folderPath: ['Shared', `D ${MARK}`],
      when: 'At 05:00 every day.',
      runs: [
        '2026-10-05T04:00:00.000Z',
        '2026-10-06T04:00:00.000Z',
        '2026-10-07T04:00:00.000Z',
        '2026-10-08T04:00:00.000Z',
        '2026-10-09T04:00:00.000Z',
      ],
      lastRun: null,
    });
    // And a change, likewise.
    const changed = (
      await as('manager', {
        method: 'PUT',
        url: `/api/wechart-schedules/${own.id}`,
        payload: fields('d', { name: `Listed ${MARK}`, cron: '0 6 * * *' }),
      })
    ).json<Listed>();
    expect(changed).toEqual((await listed('manager')).rows.find((each) => each.id === own.id));
    expect(changed.when).toBe('At 06:00 every day.');
    expect(
      (await as('manager', { method: 'DELETE', url: `/api/wechart-schedules/${own.id}` }))
        .statusCode,
    ).toBe(204);
  });

  it('previews a cron as it is typed: in words, the refresh-key note, and its next runs across a clock change', async () => {
    await clock.setTime(new Date('2026-10-02T12:00:00Z'));
    const preview = async (who: string, cron: string, timezone: string) => {
      const answer = await as(who, {
        method: 'GET',
        url: `/api/wechart-schedules/preview?${new URLSearchParams({ cron, timezone }).toString()}`,
      });
      return { status: answer.statusCode, body: answer.json<unknown>() };
    };

    // As the manager, who writes a folder of this test's own.
    await place('e', { readOnly: [], readWrite: ['managers'] });
    // D4: 07:00 stays 07:00 when Berlin's clocks go back on 25 Oct.
    expect(await preview('manager', '0 7 * 10,11 1', 'Europe/Berlin')).toEqual({
      status: 200,
      body: {
        ok: true,
        words: 'At 07:00 every Monday in October and November.',
        refreshKeyCould: false,
        timezone: 'Europe/Berlin',
        runs: [
          '2026-10-05T05:00:00.000Z',
          '2026-10-12T05:00:00.000Z',
          '2026-10-19T05:00:00.000Z',
          '2026-10-26T06:00:00.000Z',
          '2026-11-02T06:00:00.000Z',
        ],
        change: { at: '2026-10-25T01:00:00.000Z', back: true, before: 3 },
      },
    });
    // D2: one a refresh key could run; with no zone yet, no runs.
    expect(await preview('manager', '0 6 * * *', '')).toEqual({
      status: 200,
      body: { ok: true, words: 'At 06:00 every day.', refreshKeyCould: true, runs: [] },
    });
    // D3: one it can't read, named, and which field is wrong; and a zone it doesn't know.
    expect(await preview('manager', '0 25 * * 1-5', 'Europe/Berlin')).toEqual({
      status: 200,
      body: { ok: false, field: 'cron', problem: 'The hour is 25; it must be 0 to 23.' },
    });
    expect(await preview('manager', '0 6 * * *', 'Mars/Olympus')).toEqual({
      status: 200,
      body: {
        ok: false,
        field: 'timezone',
        problem: '“Mars/Olympus” isn’t a time zone wechart knows.',
        // The cron still read back, under its own field.
        words: 'At 06:00 every day.',
      },
    });
    // Schedules is for those who write a folder, and a Super-Admin (T371).
    expect((await preview('reader', '0 6 * * *', 'UTC')).status).toBe(403);
  });
});

describe('Suspended after its failed runs in a row, and Resume (T379, AC-155)', () => {
  it('lists one suspended with when, Cube’s last error and its count, and resumes it from its next time with the count at 0', async () => {
    await clock.setTime(new Date('2026-10-07T03:00:00Z'));
    await place('g', { readOnly: [], readWrite: ['managers'] });
    // The model no longer has its pre-aggregation: Cube refuses each run (design 16, E4).
    refusing.add(preAggIn('g'));
    const own = (
      await as('manager', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('g', { name: `Suspended ${MARK}`, suspendAfter: 1 }),
      })
    ).json<Listed & { suspendAfter: number }>();
    expect(own.suspendAfter).toBe(1);
    // Gone from the model's list too.
    unlisted.add('g');

    await scheduler.run(own.id, `job-${MARK}-g`).catch(() => undefined);

    const row = (await listed('manager')).rows.find((each) => each.id === own.id) as
      (Listed & Record<string, unknown>) | undefined;
    expect([
      row?.['suspendedAt'],
      row?.['suspendedError'],
      row?.['failuresInARow'],
      row?.['inModel'],
    ]).toEqual(['2026-10-07T03:00:00.000Z', REMOVED, 1, false]);
    expect(await laid(own.id)).toBeUndefined();

    // A member of another folder may not resume it; one of its folder may.
    expect(
      (await as('many', { method: 'POST', url: `/api/wechart-schedules/${own.id}/resume` }))
        .statusCode,
    ).toBe(403);
    // Back in the model, then resumed.
    refusing.delete(preAggIn('g'));
    unlisted.delete('g');
    const resumed = await as('manager', {
      method: 'POST',
      url: `/api/wechart-schedules/${own.id}/resume`,
    });
    expect(resumed.statusCode).toBe(200);
    const after = resumed.json<Listed & Record<string, unknown>>();
    expect([after['suspendedAt'], after['failuresInARow'], after.runs?.[0]]).toEqual([
      null,
      0,
      // 05:00 in London, 04:00 UTC: today's, still ahead.
      '2026-10-07T04:00:00.000Z',
    ]);
    expect((await laid(own.id))?.cron).toBe('0 5 * * *');
    expect(
      (await as('manager', { method: 'DELETE', url: `/api/wechart-schedules/${own.id}` }))
        .statusCode,
    ).toBe(204);
  });

  it('suspends after 3 unless set, and refuses a number that isn’t a whole one of 1 or more', async () => {
    await place('h', { readOnly: [], readWrite: ['managers'] });
    const made = await as('manager', {
      method: 'POST',
      url: '/api/wechart-schedules',
      payload: fields('h', { name: `Three ${MARK}` }),
    });
    expect(made.json<{ suspendAfter: number }>().suspendAfter).toBe(3);
    for (const suspendAfter of [0, 2.5, 'never'])
      expect(
        (
          await as('manager', {
            method: 'POST',
            url: '/api/wechart-schedules',
            payload: fields('h', { name: `Bad ${MARK}`, suspendAfter }),
          })
        ).json(),
        String(suspendAfter),
      ).toEqual({ error: 'Suspend it after a whole number of failed runs in a row, 1 or more.' });
    await as('manager', {
      method: 'DELETE',
      url: `/api/wechart-schedules/${made.json<{ id: string }>().id}`,
    });
  });
});

/**
 * T555 (AC-395; design 16, P2; R59): Run now starts the schedule's build at
 * once through Cube's jobs API, every partition as its runs do, recorded in
 * Run history as Run now on the schedule, by the user, and in the trail as a
 * Build started (AC-294). The schedule's times are left alone. A Run now that
 * fails doesn't count toward its suspension, nor start the count again; and
 * it is offered on a suspended schedule.
 */
describe('Run now (T555, AC-395)', () => {
  const runNow = (who: string, id: string) =>
    as(who, { method: 'POST', url: `/api/wechart-schedules/${id}/run` });

  it('starts its build at once, as Run now on the schedule by the user, in the trail too, and leaves its times alone', async () => {
    await clock.setTime(new Date('2026-10-08T03:00:00Z'));
    await place('r', { readOnly: [], readWrite: ['managers'] });
    const made = (
      await as('manager', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('r', { name: `Run now ${MARK}` }),
      })
    ).json<Listed>();
    const before = await laid(made.id);
    posted.length = 0;

    const answer = await runNow('manager', made.id);

    expect(answer.statusCode, answer.body).toBe(200);
    const { runId } = answer.json<{ runId: string }>();
    expect(posted).toEqual([[preAggIn('r')]]);
    // The manager, as the schedule they made names them.
    const me = made.createdBy;
    const record = await buildHistory(getDb()).get(runId);
    expect([record?.via, record?.partitions, record?.starter]).toEqual([
      'run-now',
      null,
      {
        kind: 'schedule',
        id: made.id,
        name: `Run now ${MARK}`,
        by: { key: me.key, name: me.name },
      },
    ]);
    // Its times as they were: pg-boss's schedule, and its next five runs.
    const after = await laid(made.id);
    expect([after?.cron, after?.timezone, after?.key]).toEqual([
      before?.cron,
      before?.timezone,
      before?.key,
    ]);
    const row = (await listed('manager')).rows.find((each) => each.id === made.id);
    expect(row?.runs).toEqual(made.runs);
    // The trail: a build started, by Run now on the schedule (AC-294).
    const [kept] = (
      await auditStore(getDb()).list({ events: ['build-started'], folderIds: [ids['r']!] })
    ).records;
    expect([kept?.actor?.key, kept?.summary, kept?.details]).toEqual([
      me.key,
      `Run now · Run now ${MARK}`,
      {
        preAggregation: preAggIn('r'),
        via: 'run-now',
        partitions: null,
        granularity: 'month',
        runId,
        schedule: { id: made.id, name: `Run now ${MARK}` },
      },
    ]);
  });

  it('counts a failed Run now toward no suspension, and runs a suspended schedule now too (R59)', async () => {
    await place('s', { readOnly: [], readWrite: ['managers'] });
    const made = (
      await as('manager', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('s', { name: `Refused now ${MARK}`, suspendAfter: 1 }),
      })
    ).json<Listed>();
    refusing.add(preAggIn('s'));

    const refused = await runNow('manager', made.id);

    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ error: string }>().error).toContain(REMOVED);
    // Recorded failed, Cube's words and all, and not counted: still running.
    const runs = (
      await buildHistory(getDb()).list({
        within: undefined,
        filters: { starter: { kind: 'schedule', id: made.id } },
      })
    ).records;
    expect(runs.map((each) => [each.via, each.outcome, each.error?.includes(REMOVED)])).toEqual([
      ['run-now', 'failed', true],
    ]);
    const row = (await listed('manager')).rows.find((each) => each.id === made.id) as
      (Listed & Record<string, unknown>) | undefined;
    expect([row?.['suspendedAt'], row?.['failuresInARow']]).toEqual([null, 0]);

    // A scheduled run refused: suspended, at its number.
    await scheduler.run(made.id, `job-${MARK}-s`).catch(() => undefined);
    refusing.delete(preAggIn('s'));
    // Run now on it, suspended: it runs, and the schedule stays suspended, its count as it was.
    expect((await runNow('manager', made.id)).statusCode).toBe(200);
    const suspended = (await listed('manager')).rows.find((each) => each.id === made.id) as
      (Listed & Record<string, unknown>) | undefined;
    expect([typeof suspended?.['suspendedAt'], suspended?.['failuresInARow']]).toEqual([
      'string',
      1,
    ]);
  });

  it('refuses a member of another folder and a reader, before Cube is asked', async () => {
    const made = (
      await as('manager', {
        method: 'POST',
        url: '/api/wechart-schedules',
        payload: fields('a', { name: `Not theirs ${MARK}` }),
      })
    ).json<Listed>();
    posted.length = 0;

    expect((await runNow('many', made.id)).statusCode).toBe(403);
    expect((await runNow('reader', made.id)).statusCode).toBe(403);
    expect((await runNow('manager', randomUUID())).statusCode).toBe(404);
    expect(posted).toEqual([]);
  });
});
