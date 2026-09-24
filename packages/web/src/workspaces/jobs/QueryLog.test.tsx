import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FIRST_ASK, QUERY_LOG_PAGE, QueryLog, queryStringOf, type QueryRecord } from './QueryLog';

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

/**
 * T240 / AC-230: THE SYSTEM SHALL let the user narrow the query log by
 * outcome, source and time range and sort it, keep its column headers in view
 * while it scrolls, and render no more than a page of rows at a time.
 * `Fails when: the headers scroll out of view, a filter does not narrow the
 * rows, or more than one page of rows is rendered at once.`
 */
describe('narrowing, sorting and paging the query log (AC-230)', () => {
  /** The second page of sixty: what the API answers for page 1. */
  const secondPage = Array.from({ length: QUERY_LOG_PAGE }, (_, index) =>
    record({ id: 26 + index, durationMs: 100 + index }),
  );
  const bodyRows = () => screen.getAllByRole('row').slice(1);

  it('renders the page it is given, and says which of how many in the whole log', () => {
    render(<QueryLog records={secondPage} total={60} ask={{ ...FIRST_ASK, page: 1 }} />);
    expect(bodyRows()).toHaveLength(QUERY_LOG_PAGE);
    // The log's own count, not the rows loaded.
    expect(screen.getByTestId('query-log-range').textContent).toBe('26–50 of 60');
    expect(screen.getByTestId('query-log-range').getAttribute('aria-live')).toBe('polite');
  });

  it('asks for the next and the previous page, and for none past either end', async () => {
    const onAsk = vi.fn();
    const { rerender } = render(
      <QueryLog records={secondPage} total={60} ask={FIRST_ASK} onAsk={onAsk} />,
    );
    const previous = screen.getByRole('button', { name: 'Previous page' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(previous);
    expect(onAsk).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onAsk).toHaveBeenLastCalledWith({ ...FIRST_ASK, page: 1 });

    rerender(
      <QueryLog records={secondPage} total={60} ask={{ ...FIRST_ASK, page: 2 }} onAsk={onAsk} />,
    );
    const next = screen.getByRole('button', { name: 'Next page' });
    // Still focusable at the end, so focus is not dropped to the page.
    expect(next.hasAttribute('disabled')).toBe(false);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onAsk).toHaveBeenLastCalledWith({ ...FIRST_ASK, page: 1 });
    expect(onAsk).toHaveBeenCalledTimes(2);
  });

  it('asks for the log narrowed by outcome, by source and by time range, from its first page', async () => {
    const onAsk = vi.fn();
    const at = { ...FIRST_ASK, page: 2 };
    render(<QueryLog records={secondPage} total={60} ask={at} onAsk={onAsk} />);
    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'failed');
    expect(onAsk).toHaveBeenLastCalledWith({ ...at, outcome: 'failed', page: 0 });
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'accelerated');
    expect(onAsk).toHaveBeenLastCalledWith({ ...at, source: 'accelerated', page: 0 });
    await userEvent.selectOptions(screen.getByLabelText('Time range'), 'day');
    expect(onAsk).toHaveBeenLastCalledWith({ ...at, range: 'day', page: 0 });
  });

  it('asks for a sort by duration, and back, and says the order on the header and caption', async () => {
    const onAsk = vi.fn();
    const { rerender } = render(
      <QueryLog records={secondPage} total={60} ask={FIRST_ASK} onAsk={onAsk} />,
    );
    const table = () => screen.getByRole('table');
    expect(table().querySelector('caption')?.textContent).toBe(
      'Queries wechart has issued, newest first',
    );
    await userEvent.click(
      within(screen.getByRole('columnheader', { name: /Duration/ })).getByRole('button'),
    );
    const longest = { ...FIRST_ASK, sort: 'duration', descending: true } as const;
    expect(onAsk).toHaveBeenLastCalledWith(longest);

    rerender(<QueryLog records={secondPage} total={60} ask={longest} onAsk={onAsk} />);
    const duration = screen.getByRole('columnheader', { name: /Duration/ });
    expect(duration.getAttribute('aria-sort')).toBe('descending');
    expect(table().querySelector('caption')?.textContent).toBe(
      'Queries wechart has issued, longest first',
    );
    await userEvent.click(within(duration).getByRole('button'));
    expect(onAsk).toHaveBeenLastCalledWith({ ...longest, descending: false });

    rerender(
      <QueryLog
        records={secondPage}
        total={60}
        ask={{ ...longest, sort: 'when', descending: false }}
        onAsk={onAsk}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /When/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(table().querySelector('caption')?.textContent).toBe(
      'Queries wechart has issued, oldest first',
    );
  });

  it('says so when a filter leaves nothing, keeping the filters to change', () => {
    render(<QueryLog records={[]} total={0} ask={{ ...FIRST_ASK, outcome: 'failed' }} />);
    expect(screen.getByText('No query matches these filters.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect((screen.getByLabelText('Outcome') as HTMLSelectElement).value).toBe('failed');
  });

  it('asks the API for exactly what is shown', () => {
    expect(queryStringOf(FIRST_ASK)).toBe('sort=when&order=desc&offset=0&limit=25');
    expect(
      queryStringOf({
        outcome: 'failed',
        source: 'live',
        range: 'day',
        sort: 'duration',
        descending: false,
        page: 2,
      }),
    ).toBe('outcome=failed&source=live&within=day&sort=duration&order=asc&offset=50&limit=25');
  });
});
