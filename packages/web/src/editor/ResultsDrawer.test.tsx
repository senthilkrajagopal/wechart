import type { MemberGranularities } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultsDrawer, type DrawerView } from './ResultsDrawer';

/**
 * AC-036: WHEN the user opens the results drawer, THE SYSTEM SHALL show the
 * result rows, the underlying rows, and the Cube query JSON for the current
 * chart.
 * Fails when: any of the three views is missing, or shows data from a
 * different query than the chart rendered.
 *
 * The editor's end-to-end test covers the three views against a live Cube.
 * This file covers what that test cannot reach cheaply: the failure branches,
 * and the truncation notice that keeps a capped table from reading as
 * disagreement with the chart.
 */
const RESULT_ROWS = [
  { 'orders.status': 'completed', 'orders.count': '80' },
  { 'orders.status': 'processing', 'orders.count': '80' },
];

const QUERY = { measures: ['orders.count'], dimensions: ['orders.status'] };
const UNDERLYING_QUERY = {
  measures: ['orders.count'],
  dimensions: ['orders.status'],
  ungrouped: true,
  limit: 100,
};

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

/** A row of underlying data, numbered so a capped page is recognisable. */
const underlyingRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    'orders.status': 'completed',
    'orders.count': String(index),
  }));

function respondWith(rows: readonly Record<string, unknown>[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: rows }),
  } as unknown as Response);
}

function drawer({
  rows = RESULT_ROWS,
  view = 'result' as DrawerView,
  open = true,
  formats = {},
  granularities = {},
}: {
  rows?: readonly Record<string, unknown>[];
  view?: DrawerView;
  open?: boolean;
  formats?: Readonly<Record<string, string>>;
  granularities?: MemberGranularities;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ResultsDrawer
        rows={rows}
        query={QUERY}
        underlyingQuery={UNDERLYING_QUERY}
        open={open}
        view={view}
        formats={formats}
        granularities={granularities}
        onOpenChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('its values (AC-046)', () => {
  /**
   * T195. The criterion names tables among the places a value wears its
   * member's format; the drawer printed every cell raw, so a currency measure
   * read "76900" beside a chart reading "$76,900.00".
   */
  const rows = [{ 'orders.id': '1234', 'orders.total_amount': '76900', 'orders.share': '0.25' }];

  it('writes each value the way its member declares', () => {
    drawer({
      rows,
      formats: { 'orders.total_amount': 'currency', 'orders.share': 'percent' },
    });

    const cells = [...screen.getByTestId('drawer-result-rows').querySelectorAll('td')].map(
      (cell) => cell.textContent,
    );
    // A member with no declared format is shown as it came — an id is not a
    // quantity, and "1,234" would misstate it.
    // Cube's currency format, `$,.2~f` (T201, the user's choice).
    expect(cells).toEqual(['1234', '$76,900', '25%']);
  });

  /**
   * T206 / AC-188: a time value in a table is written by its granularity,
   * never as Cube's raw timestamp. The result rows carry it twice, as Cube
   * sends it — under the member and under `member.granularity`
   * (research/cube/data-apis.md) — and the underlying rows carry each row's
   * own time, ungrouped, which is written with the time of day.
   */
  const AT = 'orders.ordered_at';

  it('writes a time value by its granularity (AC-188)', () => {
    drawer({
      rows: [{ [AT]: '2026-01-02T00:00:00.000', [`${AT}.day`]: '2026-01-02T00:00:00.000' }],
      granularities: { [AT]: 'day' },
    });

    const cells = [...screen.getByTestId('drawer-result-rows').querySelectorAll('td')].map(
      (cell) => cell.textContent,
    );
    expect(cells).toEqual(['Jan 2, 2026', 'Jan 2, 2026']);
  });

  it('writes an ungrouped time value with its time of day (AC-188)', async () => {
    respondWith([{ [AT]: '2026-01-02T15:04:05.000' }]);
    drawer({ view: 'underlying', granularities: { [AT]: 'day' } });

    const table = await screen.findByTestId('drawer-underlying-rows');
    const cells = [...table.querySelectorAll('td')].map((cell) => cell.textContent);
    expect(cells).toEqual(['Jan 2, 2026, 3:04:05 PM']);
  });
});

describe('the three views', () => {
  it('offers all three by their tabs, and shows none of them before the drawer is opened', () => {
    // The strip is always there, as the prototype's drawer is (T257).
    drawer({ open: false });

    expect(screen.queryByTestId('drawer-result-rows')).toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Results',
      'Underlying rows',
      'Cube query',
      'Acceleration',
    ]);
    expect(
      screen.getByRole('button', { name: 'Show the results' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('shows the rows it was given, rather than fetching its own', () => {
    drawer();

    expect(screen.getByTestId('drawer-result-rows')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
    // The result view must never issue a query: a second fetch is how the
    // drawer and the chart come to disagree.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * T393's review, AC-301: the result table heads its columns as the chart's
   * own table does, in the wells' order, which its query keeps: time and
   * dimensions, then measures.
   */
  it('heads the result’s columns in the order its query names them', () => {
    drawer({ rows: [{ 'orders.count': '3', 'orders.status': 'completed' }] });

    expect(
      within(screen.getByTestId('drawer-result-rows'))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['orders.status', 'orders.count']);
  });

  it('shows the chart’s own query as JSON', () => {
    drawer({ view: 'query' });

    expect(JSON.parse(screen.getByTestId('drawer-query').textContent ?? '')).toEqual(QUERY);
  });

  it('asks for the underlying rows only once that view is open', async () => {
    respondWith(underlyingRows(3));
    drawer({ view: 'result' });

    expect(fetchMock).not.toHaveBeenCalled();

    drawer({ view: 'underlying' });
    expect(await screen.findByTestId('drawer-underlying-rows')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('when the underlying rows cannot be shown', () => {
  it('says so instead of showing an empty table', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "'orders.id' not found" }),
    } as unknown as Response);

    drawer({ view: 'underlying' });

    expect((await screen.findByRole('alert')).textContent).toContain("'orders.id' not found");
    expect(screen.queryByTestId('drawer-underlying-rows')).toBeNull();
  });

  it('reports a query that matched nothing', async () => {
    respondWith([]);
    drawer({ view: 'underlying' });

    expect((await screen.findByTestId('drawer-underlying-rows-empty')).textContent).toContain(
      'No rows.',
    );
  });
});

/**
 * A table that stops at 100 rows while the chart reports 240 reads as the two
 * disagreeing. Both tables are capped, so both have to say so.
 */
describe('truncation', () => {
  it('says how many of the result rows it is showing', () => {
    drawer({ rows: underlyingRows(240) });

    expect(screen.getByTestId('drawer-result-rows-truncated').textContent).toContain(
      'Showing the first 100 of 240 rows.',
    );
    expect(screen.getAllByRole('row')).toHaveLength(101); // 100 rows plus the header
  });

  it('stays quiet when nothing was cut', () => {
    drawer({ rows: underlyingRows(12) });

    expect(screen.queryByTestId('drawer-result-rows-truncated')).toBeNull();
  });

  it('warns that a full page of underlying rows may not be all of them', async () => {
    respondWith(underlyingRows(100));
    drawer({ view: 'underlying' });

    expect((await screen.findByTestId('drawer-underlying-rows-truncated')).textContent).toContain(
      'There may be more.',
    );
  });

  it('does not warn when the underlying query came back short of the cap', async () => {
    respondWith(underlyingRows(99));
    drawer({ view: 'underlying' });

    await screen.findByTestId('drawer-underlying-rows');
    expect(screen.queryByTestId('drawer-underlying-rows-truncated')).toBeNull();
  });
});

describe('opening and closing', () => {
  it('reports the open state to the editor rather than keeping it', async () => {
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ResultsDrawer
          rows={RESULT_ROWS}
          query={QUERY}
          underlyingQuery={UNDERLYING_QUERY}
          open={false}
          view="result"
          onOpenChange={onOpenChange}
          onViewChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Show the results' }));

    // Held by the editor, so emptying a well cannot shut a drawer the user
    // opened.
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('opens on the view whose tab is chosen while it is closed (T257)', async () => {
    const onOpenChange = vi.fn();
    const onViewChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ResultsDrawer
          rows={RESULT_ROWS}
          query={QUERY}
          underlyingQuery={UNDERLYING_QUERY}
          open={false}
          view="result"
          onOpenChange={onOpenChange}
          onViewChange={onViewChange}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Cube query' }));

    expect(onViewChange).toHaveBeenCalledWith('query');
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('sets a measure’s column right, as figures are (T257)', () => {
    drawer();

    const table = screen.getByTestId('drawer-result-rows');
    expect(table.querySelector('th:last-child')?.className).toBe('num');
    expect(table.querySelector('td:last-child')?.className).toBe('num');
    expect(table.querySelector('td:first-child')?.className).toBe('');
  });
});
