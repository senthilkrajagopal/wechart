import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { sqlRuns } from './sql-runs';

/**
 * T533 / AC-379: a user's SQL runs, one going at a time, across every API
 * instance: a run is a row, and a second one going for the same user isn't
 * taken. Against the real Postgres, as the other repos are.
 */
const runs = () => sqlRuns(getDb());
const users: string[] = [];
const userOf = () => {
  const key = `sqlruns-${randomUUID()}`;
  users.push(key);
  return key;
};

afterAll(async () => {
  await getDb().deleteFrom('sql_runs').where('user_key', 'in', users).execute();
  await closeDb();
});

describe('a Cube Store run stopped but run on (T548, AC-378, AC-379)', () => {
  it('keeps when Cube Store ends it at the latest, says it of its user until then, and forgets it once ended', async () => {
    const user = userOf();
    const stopped = randomUUID();
    await runs().start({ runId: stopped, userKey: user, dataSourceId: null });
    const endsBy = new Date(Date.now() + 90_000);
    await runs().finish(stopped, { outcome: 'timeout', rowCount: 0, endsBy });
    // Finished as a run: nothing goes, but Cube Store runs it on.
    expect(await runs().going(user)).toBeUndefined();
    expect(await runs().stopping(user)).toEqual([
      { runId: stopped, dataSourceId: null, startedAt: expect.any(Date), endsBy },
    ]);
    // Another user's isn't theirs.
    expect(await runs().stopping(userOf())).toEqual([]);

    await runs().ended(stopped);
    expect(await runs().stopping(user)).toEqual([]);
  });

  it('lets a run held back before it ran go, unkept, so its user may run again', async () => {
    const user = userOf();
    const held = randomUUID();
    await runs().start({ runId: held, userKey: user, dataSourceId: null, sql: 'SELECT 1' });
    await runs().release(held);
    expect(await runs().going(user)).toBeUndefined();
    expect((await runs().list({ userKey: user })).runs).toEqual([]);
    // One that ran isn't let go.
    const ran = randomUUID();
    await runs().start({ runId: ran, userKey: user, dataSourceId: null });
    await runs().finish(ran, { outcome: 'finished' });
    await runs().release(ran);
    expect((await runs().list({ userKey: user })).runs.map((run) => run.id)).toEqual([ran]);
  });

  it('says one just past its end, which xcube may still be following, and none long past it', async () => {
    const user = userOf();
    const [justPast, longPast] = [randomUUID(), randomUUID()];
    const justPastEnd = new Date(Date.now() - 1_000);
    await runs().start({ runId: justPast, userKey: user, dataSourceId: null });
    await runs().finish(justPast, { outcome: 'timeout', rowCount: 0, endsBy: justPastEnd });
    expect(await runs().stopping(user)).toEqual([
      { runId: justPast, dataSourceId: null, startedAt: expect.any(Date), endsBy: justPastEnd },
    ]);
    await runs().ended(justPast);

    await runs().start({ runId: longPast, userKey: user, dataSourceId: null });
    await runs().finish(longPast, {
      outcome: 'timeout',
      rowCount: 0,
      endsBy: new Date(Date.now() - 10 * 60_000),
    });
    expect(await runs().stopping(user)).toEqual([]);
  });
});

describe('a user’s SQL runs going (T533, AC-379)', () => {
  it('starts one, refuses a second while it goes, naming the first, and starts again once it is done', async () => {
    const user = userOf();
    const first = randomUUID();
    expect(await runs().start({ runId: first, userKey: user, dataSourceId: 'ds-a' })).toEqual({
      started: true,
    });
    expect(await runs().going(user)).toEqual({
      runId: first,
      dataSourceId: 'ds-a',
      startedAt: expect.any(Date),
    });

    const second = await runs().start({ runId: randomUUID(), userKey: user, dataSourceId: 'ds-b' });
    expect(second).toEqual({
      started: false,
      going: { runId: first, dataSourceId: 'ds-a', startedAt: expect.any(Date) },
    });

    await runs().finish(first, { outcome: 'finished' });
    expect(await runs().going(user)).toBeUndefined();
    const third = randomUUID();
    expect(await runs().start({ runId: third, userKey: user, dataSourceId: null })).toEqual({
      started: true,
    });
    expect((await runs().going(user))?.runId).toBe(third);
    await runs().finish(third, { outcome: 'cancelled' });
  });

  it('lets another user run at the same time', async () => {
    const [a, b] = [userOf(), userOf()];
    const runA = randomUUID();
    const runB = randomUUID();
    expect(await runs().start({ runId: runA, userKey: a, dataSourceId: 'ds' })).toEqual({
      started: true,
    });
    expect(await runs().start({ runId: runB, userKey: b, dataSourceId: 'ds' })).toEqual({
      started: true,
    });
    await runs().finish(runA, { outcome: 'finished' });
    await runs().finish(runB, { outcome: 'finished' });
  });

  it('takes two starts at once for one user as one run', async () => {
    const user = userOf();
    const answers = await Promise.all(
      Array.from({ length: 5 }, () =>
        runs().start({ runId: randomUUID(), userKey: user, dataSourceId: 'ds' }),
      ),
    );
    expect(answers.filter((answer) => answer.started)).toHaveLength(1);
    await runs().finish((await runs().going(user))!.runId, { outcome: 'finished' });
  });

  it('counts a run left going past any run’s time as over, so it holds no one up', async () => {
    const user = userOf();
    const lost = randomUUID();
    await runs().start({ runId: lost, userKey: user, dataSourceId: 'ds' });
    // An API instance stopped mid-run: its row never finished.
    await getDb()
      .updateTable('sql_runs')
      .set({ started_at: sql<Date>`now() - interval '10 minutes'` })
      .where('id', '=', lost)
      .execute();
    expect(await runs().going(user)).toBeUndefined();
    const next = randomUUID();
    expect(await runs().start({ runId: next, userKey: user, dataSourceId: 'ds' })).toEqual({
      started: true,
    });
    const row = await getDb()
      .selectFrom('sql_runs')
      .select(['outcome', 'finished_at'])
      .where('id', '=', lost)
      .executeTakeFirstOrThrow();
    expect(row.outcome).toBe('lost');
    expect(row.finished_at).not.toBeNull();
    await runs().finish(next, { outcome: 'finished' });
  });
});
