import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QueryLog, type QueryRecord } from './QueryLog';

/**
 * AC-016: … and expose those records in the Jobs workspace.
 * Fails when: a rendered chart produces no query record, or the record lacks
 * duration or acceleration.
 *
 * The recording half is asserted in the api package; this is the exposure half.
 */
const record = (over: Partial<QueryRecord> = {}): QueryRecord => ({
  id: 1,
  requestId: 'req-1',
  query: { measures: ['Orders.count'] },
  durationMs: 412,
  accelerated: true,
  preAggregation: 'orders.main',
  error: null,
  createdAt: '2026-09-19T12:00:00.000Z',
  ...over,
});

describe('query log in Jobs (AC-016)', () => {
  it('shows the duration and the acceleration of each record', () => {
    render(<QueryLog records={[record()]} />);

    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByTestId('duration-1').textContent).toBe('412 ms');
    expect(row.textContent).toContain('orders.main');
  });

  it('shows a non-accelerated query as live', () => {
    render(<QueryLog records={[record({ accelerated: false, preAggregation: null })]} />);

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('Live');
  });

  it('reveals the query that was issued', () => {
    render(<QueryLog records={[record()]} />);

    expect(screen.getByText(/"Orders.count"/)).toBeTruthy();
  });

  it('lists a failed query with its message', () => {
    render(<QueryLog records={[record({ error: "Can't find join path", durationMs: 4300 })]} />);

    const row = screen.getAllByRole('row')[1]!;
    expect(row.textContent).toContain("Can't find join path");
    expect(within(row).getByTestId('duration-1').textContent).toBe('4.3 s');
  });

  /**
   * T158 / AC-152: THE SYSTEM SHALL show every job and schedule with an icon
   * and a text label for its state, never colour alone. A query in the log
   * ended one of two ways, and says which in words, with its icon — the words
   * read to a screen reader, "Failed" included (T158's review).
   */
  it('shows each query’s outcome as an icon and words, never colour alone', () => {
    render(
      <QueryLog
        records={[record(), record({ id: 2, error: "Can't find join path", accelerated: false })]}
      />,
    );

    const succeeded = screen.getByTestId('query-outcome-1');
    expect(succeeded.textContent).toBe('Succeeded');
    expect(succeeded.querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
    expect(succeeded.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const failed = screen.getByTestId('query-outcome-2');
    expect(failed.textContent).toBe("Failed: Can't find join path");
    expect(failed.querySelector('svg')?.getAttribute('data-icon')).toBe('err');
  });

  it('says so when nothing has run yet, rather than showing an empty table', () => {
    render(<QueryLog records={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/no queries yet/i)).toBeTruthy();
  });

  it('renders one row per record', () => {
    render(<QueryLog records={[record({ id: 1 }), record({ id: 2 }), record({ id: 3 })]} />);

    // Header row plus three.
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});
