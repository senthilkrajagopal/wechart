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
