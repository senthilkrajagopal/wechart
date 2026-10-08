import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { refusalSentence, SqlResult, type SqlOutcome } from './SqlResult';

/**
 * T535 (AC-380, AC-377, AC-378, AC-379, AC-375; design 15's screen 1 and
 * states B–E): a run's result. A finished run's grid is headed by each
 * column's name and its type as the database names it, with the row count
 * and the time it took; a cut one says which limit; a stopped, cancelled or
 * refused one says so, and why.
 */
const AT = new Date(2026, 9, 1, 14, 32, 5);
const finished = (
  extra: Partial<Extract<SqlOutcome, { outcome: 'finished' }>> = {},
): SqlOutcome => ({
  outcome: 'finished',
  columns: [
    { name: 'order_id', type: 'int8' },
    { name: 'status', type: 'text' },
  ],
  rows: [
    ['100482', 'shipped'],
    ['100590', null],
  ],
  rowCount: 2,
  truncated: null,
  durationMs: 840,
  statement: 'select',
  ...extra,
});
const show = (result: SqlOutcome, sql = 'SELECT 1', onDownload = vi.fn()) =>
  render(<SqlResult result={result} sql={sql} startedAt={AT} onDownload={onDownload} />);

describe('a finished run (T535, AC-380)', () => {
  it('heads each column with its name and its database type, and says the rows and the time', () => {
    show(finished());
    // Captioned with its size, as design 15's keyboard table reads it.
    const grid = screen.getByRole('table', { name: 'Result: 2 rows, 2 columns' });
    const heads = within(grid).getAllByRole('columnheader');
    expect(heads.map((head) => head.textContent)).toEqual(['#', 'order_idint8', 'statustext']);
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Finished 2 rows · 0.84 s · at 14:32:05Download CSV',
    );
    const cells = within(grid)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    // As they came: numbers as text, NULL said.
    expect(cells).toEqual([
      ['1', '100482', 'shipped'],
      ['2', '100590', 'NULL'],
    ]);
  });

  it('offers its rows as a CSV, from the result in hand', () => {
    const onDownload = vi.fn();
    show(finished(), 'SELECT 1', onDownload);
    screen.getByRole('button', { name: 'Download CSV' }).click();
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('says a run with no rows returned none', () => {
    show(finished({ rows: [], rowCount: 0 }));
    expect(screen.getByTestId('sql-result-head').textContent).toContain('Finished · no rows');
    expect(screen.getByText('The query returned no rows.')).toBeTruthy();
  });

  it('right-aligns a column of numbers by its database type, and says a very short run’s time (pin 9)', () => {
    show(finished({ durationMs: 4 }));
    const [, idHead, statusHead] = screen.getAllByRole('columnheader');
    expect(idHead?.className).toBe('sql-result__num');
    expect(statusHead?.className).toBe('');
    const firstRow = within(
      screen.getByRole('table', { name: 'Result: 2 rows, 2 columns' }),
    ).getAllByRole('row')[1]!;
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((cell) => cell.className),
    ).toEqual(['sql-result__n', 'sql-result__num', '']);
    expect(screen.getByTestId('sql-result-head').textContent).toContain('2 rows · under 0.01 s');
  });

  it('heads a column of no known type by its name alone (Cube Store)', () => {
    show(finished({ columns: [{ name: 'table_name', type: null }], rows: [['t']], rowCount: 1 }));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      '#',
      'table_name',
    ]);
  });
});

describe('a cut run (T535, AC-377)', () => {
  it('says it was limited to 10,000 rows, at its head, its note and its last row', () => {
    show(finished({ truncated: 'rows', rowCount: 2 }));
    expect(screen.getByTestId('sql-result-head').textContent).toContain('Limited to 10,000 rows');
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The query returned more than 10,000 rows. These are the first 2, in the order the database sent them.',
    );
    expect(screen.getByTestId('sql-result-cut').textContent).toBe(
      'Limited to 10,000 rows. Narrow the query with WHERE, or group it, to see the rest.',
    );
    expect(screen.getByRole('button', { name: 'Download CSV · 2 rows' })).toBeTruthy();
  });

  it('says it was limited to 10 MB', () => {
    show(finished({ truncated: 'bytes', rowCount: 2 }));
    expect(screen.getByTestId('sql-result-head').textContent).toContain('Limited to 10 MB');
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The query returned more than 10 MB. These are the first 2 rows, as many as fit in 10 MB.',
    );
    expect(screen.getByTestId('sql-result-cut').textContent).toBe(
      'Limited to 10 MB. Choose fewer or smaller columns to see more rows.',
    );
  });
});

describe('a run stopped, cancelled, refused or failed (T535, AC-378, AC-379, AC-375)', () => {
  it('says a run stopped at 30 seconds was stopped on the database, and that nothing came back', () => {
    show({ outcome: 'timeout', durationMs: 30_002 });
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Stopped at 30 seconds at 14:32:05',
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so it was stopped on the database. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  });

  it('says a cancelled run was stopped on the database, after how long', () => {
    show({ outcome: 'cancelled', durationMs: 8_200 });
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Cancelled after 8.2 s at 14:32:05',
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'You cancelled the run, and it was stopped on the database. Nothing came back.',
    );
  });

  it('says a refused run wasn’t run, that only SELECT and EXPLAIN run, and what it found', () => {
    show(
      {
        outcome: 'refused',
        error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
        reason: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
        statement: 'delete',
      },
      "DELETE FROM sales.orders WHERE status = 'test'",
    );
    expect(screen.getByTestId('sql-result-head').textContent).toBe('Not run at 14:32:05');
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'Only SELECT and EXPLAIN run here, one statement at a time. This is a DELETE statement. Nothing reached the database.',
    );
  });

  it('says a run with no answer may have run, rather than that it didn’t (T535’s review)', () => {
    show({
      outcome: 'unavailable',
      error: 'xcube didn’t answer in time, so whether it ran isn’t known. Try again.',
    });
    expect(screen.getByTestId('sql-result-head').textContent).toBe('No answer at 14:32:05');
    // Refused by wechart before it went anywhere, or xcube too busy to take it.
    show({
      outcome: 'error',
      error: 'Only Super-Admins and read-write members of its own folder run SQL on it.',
    });
    expect(screen.getAllByTestId('sql-result-head')[1]!.textContent).toBe('Not run at 14:32:05');
    show({ outcome: 'busy', error: 'xcube is running as many SQL runs as it takes at once.' });
    expect(screen.getAllByTestId('sql-result-head')[2]!.textContent).toBe('Not run at 14:32:05');
  });

  it('gives the database’s error as it gave it', () => {
    show({
      outcome: 'failed',
      error: 'cannot execute nextval() in a read-only transaction',
      durationMs: 10,
    });
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Database error 0.01 s · at 14:32:05',
    );
    expect(screen.getByTestId('sql-result-error').textContent).toBe(
      'cannot execute nextval() in a read-only transaction',
    );
  });
});

describe('a run on Cube Store (T536, AC-384; design 15’s H3)', () => {
  it('names a refused command as a command, and says nothing reached Cube Store', () => {
    render(
      <SqlResult
        result={{
          outcome: 'refused',
          error: 'On Cube Store, only SELECT and EXPLAIN run, one statement at a time.',
          reason: 'Only a SELECT or an EXPLAIN runs on Cube Store: this is a QUEUE command',
          statement: 'queue',
        }}
        sql="QUEUE LIST"
        startedAt={AT}
        onDownload={vi.fn()}
        onCubeStore
      />,
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'On Cube Store, only SELECT and EXPLAIN run, one statement at a time. This is a QUEUE command. Nothing reached Cube Store.',
    );
  });

  // T650 (R64; xcube 636ffa04b2): refused before it ran, which nothing could
  // have stopped; never said as a SELECT that writes, nor as one that reached Cube Store.
  it('says a join Cube Store’s router would run wasn’t run, why, and what to run instead', () => {
    render(
      <SqlResult
        result={{
          outcome: 'refused',
          error:
            'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout.',
          reason:
            'Cube Store’s router would run this query’s join itself, and nothing stops that work once it starts, not even Cube Store’s own timeout: join Cube Store’s tables, whose joins run on its select workers, or read one catalog or system table without a join',
          statement: 'select',
          routerJoin: true,
        }}
        sql="SELECT * FROM (VALUES (1)) a CROSS JOIN (VALUES (2)) b"
        startedAt={AT}
        onDownload={vi.fn()}
        onCubeStore
      />,
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'Not run: Cube Store’s router would run this join itself, and nothing could stop it once it started, not even Cube Store’s own timeout. Join Cube Store’s tables, whose joins its workers run, or read one catalog or system table without a join.',
    );
  });

  it('gives xcube’s own words where it says why, as for system.cache, and after a SHOW (T536’s review)', () => {
    const say = (statement: string, reason: string, sql: string) =>
      refusalSentence({ statement, reason }, sql, true);
    // As compose's xcube answers them (T536's probe).
    expect(
      say(
        'select',
        'system.cache holds Cube’s cached results and queued queries: it isn’t read here',
        'SELECT * FROM system.cache LIMIT 1',
      ),
    ).toBe('system.cache holds Cube’s cached results and queued queries: it isn’t read here.');
    expect(
      say(
        'show',
        'Read Cube Store’s tables instead, with a LIMIT: information_schema.tables and .columns, system.tables, system.partitions, system.chunks, system.indexes',
        'SHOW SCHEMAS',
      ),
    ).toBe(
      'This is a SHOW command. Read Cube Store’s tables instead, with a LIMIT: information_schema.tables and .columns, system.tables, system.partitions, system.chunks, system.indexes.',
    );
    expect(
      say(
        'queue',
        'Only a SELECT or an EXPLAIN runs here: this is a QUEUE statement',
        'QUEUE TRUNCATE',
      ),
    ).toBe('This is a QUEUE command.');
  });
});

/**
 * T548 (AC-378, AC-379; R62, "Say it, and hold Run"): Cube Store can't stop
 * a query (xcube 2099b13f2d). A run stopped at 30 seconds runs on in it until
 * its own timeout at the latest, which the result says, until it has ended.
 */
describe('a Cube Store run stopped but run on (T548, AC-378, AC-379)', () => {
  const ENDS_BY = new Date(2026, 9, 1, 14, 34, 5).toISOString();
  const stopped = (
    outcome: 'timeout' | 'cancelled',
    endsBy: string | null = ENDS_BY,
  ): SqlOutcome => ({
    outcome,
    durationMs: 32_004,
    columns: [],
    rows: [],
    rowCount: 0,
    truncated: 'stopped',
    stillRunning: true,
    endsBy,
  });
  const showOnCubeStore = (result: SqlOutcome, ended = false) =>
    render(
      <SqlResult
        result={result}
        sql="SELECT 1"
        startedAt={AT}
        onDownload={vi.fn()}
        onCubeStore
        ended={ended}
      />,
    );

  it('says the query is still finishing in Cube Store, until when at the latest, and that the next run waits', () => {
    showOnCubeStore(stopped('timeout'));
    expect(screen.getByTestId('sql-result-head').textContent).toContain('Stopped at 30 seconds');
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it is still finishing this one, until 14:34:05 at the latest. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  });

  it('says it has since ended, once it has', () => {
    showOnCubeStore(stopped('timeout'), true);
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it finished this one on its own: it has since ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  });

  it('says one its router runs is run to its end, with no time, and then that it has ended (T549)', () => {
    const router = stopped('timeout', null);
    const { unmount } = showOnCubeStore(router);
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store runs this query to its end; it can’t be stopped. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
    unmount();
    showOnCubeStore(router, true);
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it finished this one on its own: it has since ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  });

  it('says one stopped by an xcube that says nothing of its run on may still be finishing (T548’s review)', () => {
    showOnCubeStore({ outcome: 'timeout', durationMs: 30_000 });
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it may still be finishing this one. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  });

  it('says a cancelled one is still finishing too', () => {
    showOnCubeStore(stopped('cancelled'));
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'You cancelled the run, so wechart stopped waiting for it. Cube Store can’t stop a query, so it is still finishing this one, until 14:34:05 at the latest. Your next run waits until it has ended. Nothing came back.',
    );
  });
});

describe('the second sentence of a refusal (design 15, E2)', () => {
  const refused = (statement: string | null, reason: string) => ({ statement, reason });
  it('names what was found', () => {
    expect(refusalSentence(refused('insert', ''), 'INSERT INTO t VALUES (1)')).toBe(
      'This is an INSERT statement.',
    );
    expect(refusalSentence(refused('create', ''), 'CREATE TABLE t (a int)')).toBe(
      'This is a CREATE statement.',
    );
    expect(
      refusalSentence(
        refused('select', 'The statement holds INTO, which isn’t a read'),
        'SELECT 1 INTO t',
      ),
    ).toBe('This SELECT creates a table (SELECT … INTO).');
    expect(
      refusalSentence(
        refused('select', 'The statement holds UPDATE'),
        'SELECT * FROM t FOR UPDATE',
      ),
    ).toBe('This SELECT locks rows (FOR UPDATE).');
    expect(
      refusalSentence(
        refused('select', 'The statement holds DELETE'),
        'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d',
      ),
    ).toBe('Its WITH holds a DELETE.');
    expect(
      refusalSentence(
        refused('explain', 'EXPLAIN ANALYZE runs the statement'),
        'EXPLAIN ANALYZE SELECT 1',
      ),
    ).toBe('EXPLAIN ANALYZE runs the statement. Use EXPLAIN on its own.');
    // Another driver's EXPLAIN is refused for its own reason (T535's review):
    // Oracle's EXPLAIN PLAN writes PLAN_TABLE; SQL Server and BigQuery have none.
    expect(
      refusalSentence(
        refused('explain', 'EXPLAIN PLAN writes to PLAN_TABLE'),
        'EXPLAIN PLAN FOR SELECT 1 FROM dual',
      ),
    ).toBe('wechart couldn’t run this EXPLAIN: EXPLAIN PLAN writes to PLAN_TABLE.');
    expect(
      refusalSentence(refused(null, 'Only one statement runs at a time'), 'SELECT 1; SELECT 2'),
    ).toBe('This holds more than one statement. Run them one at a time.');
    // Anything else: xcube's own words.
    expect(refusalSentence(refused(null, 'A string is not closed'), "SELECT 'a")).toBe(
      'wechart couldn’t read it as a SELECT or EXPLAIN: A string is not closed.',
    );
  });
});
