import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { sqlRuns } from './sql-runs';

/**
 * T534 / AC-381: a user's own past SQL runs, kept in wechart: each with its
 * SQL as they wrote it, its data source, when, its outcome and its rows,
 * newest first, 50 at a time; its data source's alone, or all of them; kept
 * as long as audit records are. Against the real Postgres.
 */
const runs = () => sqlRuns(getDb());
const users: string[] = [];
const userOf = () => {
  const key = `sqlhist-${randomUUID()}`;
  users.push(key);
  return key;
};

afterAll(async () => {
  await getDb().deleteFrom('sql_runs').where('user_key', 'in', users).execute();
  await closeDb();
});

/** A run started and finished as `user`, on `dataSourceId`, `secondsAgo` before now. */
async function ran(
  user: string,
  dataSourceId: string | null,
  sqlText: string,
  secondsAgo: number,
  done: Parameters<ReturnType<typeof sqlRuns>['finish']>[1] = { outcome: 'finished', rowCount: 1 },
) {
  const runId = randomUUID();
  await runs().start({
    runId,
    userKey: user,
    dataSourceId,
    dataSourceName: dataSourceId ?? 'Cube Store',
    sql: sqlText,
  });
  await runs().finish(runId, done);
  await getDb()
    .updateTable('sql_runs')
    .set({ started_at: sql<Date>`now() - make_interval(secs => ${secondsAgo})` })
    .where('id', '=', runId)
    .execute();
  return runId;
}

describe('a user’s run history (T534, AC-381)', () => {
  it('lists their own runs alone, newest first, each with its SQL, data source, time, outcome and rows', async () => {
    const [me, other] = [userOf(), userOf()];
    const older = await ran(me, 'ds-a', "SELECT * FROM t WHERE a = 'x'", 30, {
      outcome: 'finished',
      rowCount: 12,
      durationMs: 840,
      truncated: null,
      statement: 'select',
    });
    const newer = await ran(me, 'ds-b', 'DELETE FROM t', 10, {
      outcome: 'refused',
      statement: 'delete',
    });
    await ran(other, 'ds-a', 'SELECT 2', 5);

    const page = await runs().list({ userKey: me });
    expect(page.next).toBeUndefined();
    expect(page.runs).toEqual([
      {
        id: newer,
        sql: 'DELETE FROM t',
        dataSourceId: 'ds-b',
        dataSourceName: 'ds-b',
        startedAt: expect.any(Date),
        outcome: 'refused',
        rowCount: null,
        durationMs: null,
        truncated: null,
        statement: 'delete',
      },
      {
        id: older,
        sql: "SELECT * FROM t WHERE a = 'x'",
        dataSourceId: 'ds-a',
        dataSourceName: 'ds-a',
        startedAt: expect.any(Date),
        outcome: 'finished',
        rowCount: 12,
        durationMs: 840,
        truncated: null,
        statement: 'select',
      },
    ]);
  });

  it('lists one data source’s runs alone when asked', async () => {
    const me = userOf();
    await ran(me, 'ds-a', 'SELECT 1', 20);
    const onB = await ran(me, 'ds-b', 'SELECT 2', 10);
    await ran(me, null, 'SELECT 3', 5);
    expect(
      (await runs().list({ userKey: me, dataSourceId: 'ds-b' })).runs.map((run) => run.id),
    ).toEqual([onB]);
  });

  it('gives 50 at a time, and the next 50 from where the last page ended', async () => {
    const me = userOf();
    const ids: string[] = [];
    for (let at = 0; at < 55; at += 1)
      ids.push(await ran(me, 'ds', `SELECT ${String(at)}`, 100 - at));
    const first = await runs().list({ userKey: me });
    expect(first.runs).toHaveLength(50);
    expect(first.runs[0]!.id).toBe(ids[54]);
    expect(first.next).toEqual(expect.any(String));
    const second = await runs().list({ userKey: me, after: first.next });
    expect(second.runs.map((run) => run.id)).toEqual(ids.slice(0, 5).reverse());
    expect(second.next).toBeUndefined();
  });

  it('lists no run still going, and forgets runs from before the audit retention', async () => {
    const me = userOf();
    const kept = await ran(me, 'ds', 'SELECT 1', 60);
    const old = await ran(me, 'ds', 'SELECT 2', 400 * 86_400);
    await runs().start({
      runId: randomUUID(),
      userKey: me,
      dataSourceId: 'ds',
      dataSourceName: 'ds',
      sql: 'SELECT 3',
    });
    expect((await runs().list({ userKey: me })).runs.map((run) => run.id)).toEqual([kept, old]);

    const removed = await runs().removeBefore(new Date(Date.now() - 365 * 86_400_000));
    expect(removed).toBeGreaterThanOrEqual(1);
    expect((await runs().list({ userKey: me })).runs.map((run) => run.id)).toEqual([kept]);
  });

  it('forgets a run its instance never finished once it is past the retention too, holding its SQL no longer (T534’s review)', async () => {
    const me = userOf();
    const abandoned = randomUUID();
    await runs().start({ runId: abandoned, userKey: me, dataSourceId: 'ds', sql: "SELECT 'x'" });
    await getDb()
      .updateTable('sql_runs')
      .set({ started_at: sql<Date>`now() - interval '400 days'` })
      .where('id', '=', abandoned)
      .execute();
    const going = randomUUID();
    await runs().start({ runId: going, userKey: userOf(), dataSourceId: 'ds', sql: 'SELECT 1' });

    await runs().removeBefore(new Date(Date.now() - 365 * 86_400_000));
    const left = await getDb()
      .selectFrom('sql_runs')
      .select('id')
      .where('id', 'in', [abandoned, going])
      .execute();
    expect(left.map((row) => row.id)).toEqual([going]);
  });

  it('counts a user’s runs left going lost once, saying which, so each can be recorded (T534’s review)', async () => {
    const me = userOf();
    const lost = randomUUID();
    await runs().start({
      runId: lost,
      userKey: me,
      dataSourceId: 'ds-l',
      dataSourceName: 'lost_one',
      sql: 'SELECT 1',
    });
    await getDb()
      .updateTable('sql_runs')
      .set({ started_at: sql<Date>`now() - interval '10 minutes'` })
      .where('id', '=', lost)
      .execute();
    expect(await runs().markLost(me)).toEqual([
      {
        runId: lost,
        dataSourceId: 'ds-l',
        dataSourceName: 'lost_one',
        startedAt: expect.any(Date),
      },
    ]);
    // Counted once.
    expect(await runs().markLost(me)).toEqual([]);
  });
});
