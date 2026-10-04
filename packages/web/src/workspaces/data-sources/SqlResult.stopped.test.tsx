import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SqlResult, type SqlOutcome } from './SqlResult';

/**
 * T545 (AC-378, AC-379; design 15's Q6, answered "Show them, marked cut",
 * R51): a run stopped at 30 seconds, or cancelled, shows the rows that came
 * back before the stop, marked as cut and naming why, as a cut result does
 * for the row limit (state C). With none, it says nothing came back.
 */
const AT = new Date(2026, 9, 2, 9, 15, 0);
const COLUMNS = [
  { name: 'g', type: 'int4' },
  { name: 'slept', type: 'text' },
];
const ROWS = [
  [1, null],
  [2, null],
  [3, null],
];
const show = (result: SqlOutcome, onDownload = vi.fn()) =>
  render(<SqlResult result={result} sql="SELECT 1" startedAt={AT} onDownload={onDownload} />);

describe('a stopped or cancelled run’s rows (T545, AC-378, AC-379)', () => {
  it('shows the rows that came back before 30 seconds, marked stopped, and offers them as a CSV', () => {
    const onDownload = vi.fn();
    show(
      {
        outcome: 'timeout',
        durationMs: 30_002,
        columns: COLUMNS,
        rows: ROWS,
        rowCount: 3,
        truncated: 'stopped',
      },
      onDownload,
    );
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Stopped at 30 seconds 3 rows · at 09:15:00Download CSV · 3 rows',
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so it was stopped on the database. These are the 3 rows that came back before it was stopped.',
    );
    const grid = screen.getByRole('table', { name: 'Result: 3 rows, 2 columns' });
    expect(
      within(grid)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['11NULL', '22NULL', '33NULL']);
    expect(screen.getByTestId('sql-result-cut').textContent).toBe(
      'Stopped at 30 seconds. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
    screen.getByRole('button', { name: 'Download CSV · 3 rows' }).click();
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('shows the rows a cancelled run had, marked cancelled', () => {
    show({
      outcome: 'cancelled',
      durationMs: 1_503,
      columns: COLUMNS,
      rows: ROWS.slice(0, 2),
      rowCount: 2,
      truncated: 'stopped',
    });
    expect(screen.getByTestId('sql-result-head').textContent).toBe(
      'Cancelled after 1.5 s 2 rows · at 09:15:00Download CSV · 2 rows',
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'You cancelled the run, and it was stopped on the database. These are the 2 rows that came back before it was stopped.',
    );
    expect(screen.getByRole('table', { name: 'Result: 2 rows, 2 columns' })).toBeTruthy();
    expect(screen.getByTestId('sql-result-cut').textContent).toBe(
      'Cancelled before it finished. Run it again to see every row.',
    );
  });

  it('says nothing came back where no row had, with no grid', () => {
    show({
      outcome: 'timeout',
      durationMs: 30_001,
      columns: [{ name: 'slept', type: 'text' }],
      rows: [],
      rowCount: 0,
      truncated: 'stopped',
    });
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so it was stopped on the database. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /Download CSV/ })).toBeNull();
  });
});
