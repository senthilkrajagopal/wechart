import { describe, expect, it } from 'vitest';

import { XcubeError } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { xcubeSqlRunner } from './sql-runner';

/**
 * T532: xcube's SQL runner, as wechart's server calls it (research
 * `xcube-sql-runner.md`, "The routes"): a stored connection by its name, an
 * overlay's own with `?overlay=`, or Cube Store; each answer read into what
 * it is, and a cancel by run id. A data source is named by its own name in
 * every folder: /Sales's `warehouse` is `warehouse` (T709; research
 * `xcube-256d632371.md`, 1.1).
 */
const MODEL = 'sql-model';
const ASK = { sql: 'SELECT 1', runId: 'run-1', maxRows: 10_000, timeoutMs: 30_000, maxBytes: 1 };

const runnerOn = (stub: ReturnType<typeof fakeXcube>, token = FAKE_ADMIN_TOKEN) =>
  xcubeSqlRunner({
    cubeApiUrl: 'http://xcube.test/cubejs-api/',
    model: MODEL,
    token,
    fetch: stub.fetch,
  });

describe('a run asked of xcube (T532)', () => {
  it('names a stored connection, sends the SQL with its run id and caps, and reads its rows', async () => {
    const stub = fakeXcube();
    const answer = await runnerOn(stub).run({ connection: 'warehouse' }, ASK);
    expect(answer).toEqual({
      kind: 'ran',
      columns: [{ name: 'one', type: 'int4' }],
      rows: [[1]],
      rowCount: 1,
      truncated: null,
      durationMs: 1,
      statement: 'select',
      redactedSql: 'SELECT ?',
    });
    const [call] = stub.calls;
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe(`/cubejs-api/v1/semantic/models/${MODEL}/connections/warehouse/sql`);
    expect(call?.authorization).toBe(`Bearer ${FAKE_ADMIN_TOKEN}`);
    expect(call?.body).toEqual(ASK);
  });

  it('names an overlay’s own connection with ?overlay=, and Cube Store by its own route', async () => {
    const stub = fakeXcube();
    const runner = runnerOn(stub);
    // No such overlay: xcube never falls back to a landed connection.
    expect(await runner.run({ connection: 'warehouse', overlay: 'ws-1' }, ASK)).toEqual({
      kind: 'missing',
      code: 'unknown_overlay',
      error: 'No overlay "ws-1": it expired, was dropped, or never was',
    });
    expect(stub.calls[0]?.path).toBe(
      `/cubejs-api/v1/semantic/models/${MODEL}/connections/warehouse/sql?overlay=ws-1`,
    );
    expect((await runner.run({ cubeStore: true }, ASK)).kind).toBe('ran');
    expect(stub.calls[1]?.path).toBe(`/cubejs-api/v1/semantic/models/${MODEL}/cubestore/sql`);
  });

  it('reads a cut result as cut, and each refusal and failure as what it is', async () => {
    const stub = fakeXcube();
    const runner = runnerOn(stub);
    const answers: Record<string, { status: number; body: Record<string, unknown> }> = {
      cut: {
        status: 200,
        body: {
          columns: [{ name: 'g', type: null }],
          rows: [['1']],
          rowCount: 1,
          truncated: 'bytes',
          durationMs: 3,
          statement: 'explain',
          redactedSql: 'EXPLAIN SELECT ?',
        },
      },
      insert: {
        status: 400,
        body: {
          error: 'Only a SELECT or an EXPLAIN runs here: this is an INSERT statement',
          code: 'not_read_only',
          statement: 'insert',
          redactedSql: 'INSERT INTO t VALUES (?)',
        },
      },
      two: {
        status: 400,
        body: {
          error: 'Only one statement runs at a time',
          code: 'several_statements',
          statement: null,
          redactedSql: 'SELECT ?; SELECT ?',
        },
      },
      // With the rows read before the stop, from 6d9673ccda (T545; research xcube-6d9673ccda.md).
      timeout: {
        status: 422,
        body: {
          error: 'The statement ran past 30 s and was stopped',
          code: 'timeout',
          statement: 'select',
          redactedSql: 'SELECT pg_sleep(?)',
          durationMs: 30_001,
          columns: [
            { name: 'g', type: 'int4' },
            { name: 'slept', type: 'text' },
          ],
          rows: [
            [1, null],
            [2, null],
          ],
          rowCount: 2,
          truncated: 'stopped',
        },
      },
      cancelled: {
        status: 422,
        body: {
          error: 'The run was cancelled',
          code: 'cancelled',
          statement: 'select',
          redactedSql: 'SELECT pg_sleep(?)',
          durationMs: 1_200,
          columns: [],
          rows: [],
          rowCount: 0,
          truncated: 'stopped',
        },
      },
      failed: {
        status: 422,
        body: {
          error: 'invalid input syntax for type integer: "abc"',
          code: 'query_failed',
          statement: 'select',
          redactedSql: 'SELECT ?::int',
          durationMs: 0,
        },
      },
      // T650 (xcube 636ffa04b2): a Cube Store join its router would run, refused before it runs.
      routerJoin: {
        status: 400,
        body: {
          error:
            'Cube Store’s router would run this query’s join itself, and nothing stops that work once it starts, not even Cube Store’s own timeout: join Cube Store’s tables, whose joins run on its select workers, or read one catalog or system table without a join',
          code: 'not_read_only',
          reason: 'cubestore_router_join',
          statement: 'select',
          redactedSql: 'SELECT * FROM (VALUES (?)) a CROSS JOIN (VALUES (?)) b',
        },
      },
      unconnected: {
        status: 502,
        body: {
          error: 'password authentication failed',
          code: 'connect_failed',
          statement: 'select',
          redactedSql: 'SELECT ?',
        },
      },
      busy: {
        status: 503,
        body: { error: 'Busy', code: 'busy', statement: null, redactedSql: null },
      },
    };
    stub.answerSql((ask) => answers[ask.sql]);
    const run = (sql: string) => runner.run({ connection: 'c' }, { ...ASK, sql });

    expect(await run('cut')).toMatchObject({
      kind: 'ran',
      truncated: 'bytes',
      statement: 'explain',
      columns: [{ name: 'g', type: null }],
    });
    expect(await run('insert')).toEqual({
      kind: 'refused',
      code: 'not_read_only',
      reason: 'Only a SELECT or an EXPLAIN runs here: this is an INSERT statement',
      statement: 'insert',
      redactedSql: 'INSERT INTO t VALUES (?)',
    });
    expect(await run('two')).toMatchObject({
      kind: 'refused',
      code: 'several_statements',
      statement: null,
    });
    // Its reason read by `reason`, never by `error`'s text (T650; xcube's answer).
    expect(await run('routerJoin')).toMatchObject({
      kind: 'refused',
      code: 'not_read_only',
      statement: 'select',
      routerJoin: true,
    });
    expect(await run('insert')).not.toHaveProperty('routerJoin');
    expect(await run('timeout')).toEqual({
      kind: 'stopped',
      how: 'timeout',
      statement: 'select',
      redactedSql: 'SELECT pg_sleep(?)',
      durationMs: 30_001,
      columns: [
        { name: 'g', type: 'int4' },
        { name: 'slept', type: 'text' },
      ],
      rows: [
        [1, null],
        [2, null],
      ],
      rowCount: 2,
      // A data source's stop is real: nothing runs on (T548).
      stillRunning: false,
      endsBy: null,
    });
    expect(await run('cancelled')).toEqual({
      kind: 'stopped',
      how: 'cancelled',
      statement: 'select',
      redactedSql: 'SELECT pg_sleep(?)',
      durationMs: 1_200,
      columns: [],
      rows: [],
      rowCount: 0,
      stillRunning: false,
      endsBy: null,
    });
    expect(await run('failed')).toEqual({
      kind: 'failed',
      code: 'query_failed',
      error: 'invalid input syntax for type integer: "abc"',
      statement: 'select',
      redactedSql: 'SELECT ?::int',
      durationMs: 0,
    });
    expect(await run('unconnected')).toMatchObject({
      kind: 'failed',
      code: 'connect_failed',
      durationMs: null,
    });
    expect(await run('busy')).toEqual({ kind: 'busy' });
  });

  it('throws on a 400 that refuses the request, not the SQL: never said as “only SELECT and EXPLAIN”', async () => {
    const stub = fakeXcube();
    for (const code of ['bad_request', 'invalid_overlay_id', 'invalid_connection_name']) {
      stub.answerSql(() => ({
        status: 400,
        body: { error: `Refused: ${code}`, code, statement: null, redactedSql: null },
      }));
      await expect(runnerOn(stub).run({ connection: 'c' }, ASK), code).rejects.toBeInstanceOf(
        XcubeError,
      );
    }
  });

  it('throws on an answer it can’t read as any of those: a credential xcube won’t take', async () => {
    const stub = fakeXcube();
    await expect(
      runnerOn(stub, 'not-the-token').run({ connection: 'c' }, ASK),
    ).rejects.toBeInstanceOf(XcubeError);
  });
});

describe('a Cube Store run stopped, and a run’s state (T548; xcube 2099b13f2d)', () => {
  it('reads a stop Cube Store runs on: still running, until when at the latest', async () => {
    const stub = fakeXcube();
    stub.answerSql(() => ({
      status: 422,
      body: {
        error:
          "The statement ran past 30 s and was stopped; Cube Store can't stop a query, and runs it on until it ends, by 2026-10-04T18:02:36.304Z at the latest",
        code: 'timeout',
        statement: 'select',
        redactedSql: 'SELECT ?',
        durationMs: 32_004,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        stillRunning: true,
        endsBy: '2026-10-04T18:02:36.304Z',
      },
    }));
    expect(await runnerOn(stub).run({ cubeStore: true }, ASK)).toEqual({
      kind: 'stopped',
      how: 'timeout',
      statement: 'select',
      redactedSql: 'SELECT ?',
      durationMs: 32_004,
      columns: [],
      rows: [],
      rowCount: 0,
      stillRunning: true,
      endsBy: '2026-10-04T18:02:36.304Z',
    });
  });

  it('reads a stop its router runs to its end: still running, with no end (T549; xcube 46ca0ce708)', async () => {
    const stub = fakeXcube();
    stub.answerSql(() => ({
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
    }));
    expect(await runnerOn(stub).run({ cubeStore: true }, ASK)).toEqual({
      kind: 'stopped',
      how: 'timeout',
      statement: 'select',
      redactedSql: 'SELECT ?',
      durationMs: 32_004,
      columns: [],
      rows: [],
      rowCount: 0,
      stillRunning: true,
      endsBy: null,
    });
  });

  it('reads a data source’s stop as ended: its stop is real', async () => {
    const stub = fakeXcube();
    stub.answerSql(() => ({
      status: 422,
      body: {
        error: 'The run was cancelled',
        code: 'cancelled',
        statement: 'select',
        redactedSql: 'SELECT ?',
        durationMs: 10,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
      },
    }));
    expect(await runnerOn(stub).run({ connection: 'c' }, ASK)).toMatchObject({
      kind: 'stopped',
      stillRunning: false,
      endsBy: null,
    });
  });

  it('asks a run’s state by its run id: running, stopping until when, or ended', async () => {
    const stub = fakeXcube();
    stub.answerSqlState((runId) =>
      runId === 'finishing'
        ? { state: 'stopping', endsBy: '2026-10-04T18:02:36.304Z' }
        : runId === 'unbounded'
          ? { state: 'stopping' }
          : runId === 'garbled'
            ? { state: 'stopping', endsBy: 'not a time' }
            : { state: 'ended' },
    );
    const runner = runnerOn(stub);
    expect(await runner.state('finishing')).toEqual({
      state: 'stopping',
      endsBy: '2026-10-04T18:02:36.304Z',
    });
    expect(stub.calls.at(-1)?.path).toBe(
      `/cubejs-api/v1/semantic/models/${MODEL}/sql/runs/finishing`,
    );
    expect(stub.calls.at(-1)?.method).toBe('GET');
    // Its router's: nothing bounds it (T549).
    expect(await runner.state('unbounded')).toEqual({ state: 'stopping', endsBy: null });
    // A time it can't read is none, never shown (T549's review).
    expect(await runner.state('garbled')).toEqual({ state: 'stopping', endsBy: null });
    expect(await runner.state('done')).toEqual({ state: 'ended', endsBy: null });
  });

  it('throws where xcube won’t say a run’s state: no state is guessed', async () => {
    const stub = fakeXcube();
    await expect(runnerOn(stub, 'not-the-token').state('x')).rejects.toBeInstanceOf(XcubeError);
  });
});

describe('a cancel asked of xcube (T533)', () => {
  it('says whether the run was going, by its run id', async () => {
    const stub = fakeXcube();
    const runner = runnerOn(stub);
    stub.holdSql(true);
    const going = runner.run({ connection: 'c' }, { ...ASK, runId: 'held' });
    await expect.poll(() => stub.sqlGoing()).toEqual(['held']);
    expect(await runner.cancel('held')).toBe(true);
    expect(await going).toMatchObject({ kind: 'stopped', how: 'cancelled' });
    expect(await runner.cancel('held')).toBe(false);
    expect(stub.calls.at(-1)?.path).toBe(`/cubejs-api/v1/semantic/models/${MODEL}/sql/cancel`);
    expect(stub.calls.at(-1)?.body).toEqual({ runId: 'held' });
  });
});
