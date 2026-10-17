import type { MemberGranularities } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

    // Each value's cell, after the row's number (T690).
    const cells = [
      ...screen.getByTestId('drawer-result-rows').querySelectorAll('td:not(:first-child)'),
    ].map((cell) => cell.textContent);
    // A member with no declared format is shown as it came — an id is not a
    // quantity, and "1,234" would misstate it.
    // Cube's currency format, `$,.2~f` (T201, the user's choice).
    expect(cells).toEqual(['1234', '$76,900', '25%']);
  });

  /**
   * T206 / AC-188: a time value in a table is written by its granularity,
   * never as Cube's raw timestamp. The result rows carry it twice, as Cube
   * sends it — under the member and under `member.granularity`
   * (research/cube/data-apis.md) — and shown once, as its bucket (T467,
   * UX-023). The underlying rows carry each row's own time, ungrouped, which
   * is written with the time of day.
   */
  const AT = 'orders.ordered_at';

  it('writes a time value by its granularity, in one column (AC-188, UX-023)', () => {
    drawer({
      rows: [{ [AT]: '2026-01-02T00:00:00.000', [`${AT}.day`]: '2026-01-02T00:00:00.000' }],
      granularities: { [AT]: 'day' },
    });

    const cells = [
      ...screen.getByTestId('drawer-result-rows').querySelectorAll('td:not(:first-child)'),
    ].map((cell) => cell.textContent);
    expect(cells).toEqual(['Jan 2, 2026']);
  });

  /**
   * AC-048 (T382's review): the result rows hold a quick calculation's values
   * under its measure's name, so they are headed and written as the chart
   * names and writes it; the underlying rows are the measure as it is.
   */
  it('writes and heads a calculated measure as the chart does, and the rows behind it as they are', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    respondWith([{ 'orders.total_amount': '125.5' }]);
    const plain = {
      formats: { 'orders.total_amount': 'currency' },
      titles: { 'orders.total_amount': 'Orders Total Amount' },
    };
    const shownAs = (view: DrawerView) => (
      <QueryClientProvider client={client}>
        <ResultsDrawer
          rows={[{ 'orders.total_amount': '0.336' }]}
          query={{ measures: ['orders.total_amount'] }}
          underlyingQuery={{ measures: ['orders.total_amount'], ungrouped: true }}
          open
          view={view}
          {...plain}
          result={{
            formats: { 'orders.total_amount': 'percent' },
            titles: { 'orders.total_amount': 'Orders Total Amount (% of total)' },
          }}
          onOpenChange={vi.fn()}
          onViewChange={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(shownAs('result'));
    // The column after the row's "#", headed with its Σ chip (T690).
    const result = screen.getByTestId('drawer-result-rows');
    expect(within(result).getAllByRole('columnheader')[1]?.textContent).toBe(
      'ΣOrders Total Amount (% of total)',
    );
    expect(result.querySelector('td:nth-child(2)')?.textContent).toBe('33.6%');

    rerender(shownAs('underlying'));
    const underlying = await screen.findByTestId('drawer-underlying-rows');
    expect(within(underlying).getAllByRole('columnheader')[1]?.textContent).toBe(
      'ΣOrders Total Amount',
    );
    expect(underlying.querySelector('td:nth-child(2)')?.textContent).toBe('$125.5');
  });

  it('writes an ungrouped time value with its time of day (AC-188)', async () => {
    respondWith([{ [AT]: '2026-01-02T15:04:05.000' }]);
    drawer({ view: 'underlying', granularities: { [AT]: 'day' } });

    const table = await screen.findByTestId('drawer-underlying-rows');
    const cells = [...table.querySelectorAll('td:not(:first-child)')].map(
      (cell) => cell.textContent,
    );
    expect(cells).toEqual(['Jan 2, 2026, 3:04:05 PM']);
  });
});

describe('the three views', () => {
  it('offers all three by their tabs, and shows none of them before the drawer is opened', () => {
    // The strip is always there, as the prototype's drawer is (T257).
    drawer({ open: false });

    expect(screen.queryByTestId('drawer-result-rows')).toBeNull();
    // Results with its count, Acceleration with its mark (T690, EDI-16).
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Results2',
      'Underlying rows',
      'Cube query',
      'Acceleration○',
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
      // The row number's "#" first, then each column with its role chip (T690).
    ).toEqual(['#', 'Aaorders.status', 'Σorders.count']);
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
    // After the row number (T690), a dimension's column is not set right.
    expect(table.querySelector('td:nth-child(2)')?.className).toBe('');
  });
});

/**
 * T690 (AC-352, AC-036, AC-301; design 02, the chart editor critique's
 * EDI-15–EDI-23): the drawer as design 02 draws it.
 */
describe('the drawer as design 02 draws it (T690)', () => {
  const props = (over: Partial<Parameters<typeof ResultsDrawer>[0]> = {}) => ({
    rows: RESULT_ROWS,
    query: QUERY,
    underlyingQuery: UNDERLYING_QUERY,
    open: true,
    view: 'result' as DrawerView,
    titles: { 'orders.status': 'Orders Status', 'orders.count': 'Orders Count' },
    elapsedMs: 42,
    onOpenChange: vi.fn(),
    onViewChange: vi.fn(),
    ...over,
  });
  const show = (over: Partial<Parameters<typeof ResultsDrawer>[0]> = {}) =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ResultsDrawer {...props(over)} />
      </QueryClientProvider>,
    );

  it('counts the result on its tab, and marks Acceleration ✓ or ○ by what served the chart (EDI-16)', () => {
    const { unmount } = show({ accelerated: true });
    expect(
      screen.getByRole('tab', { name: /^Results/ }).querySelector('.results-drawer__count')
        ?.textContent,
    ).toBe('2');
    const mark = screen
      .getByRole('tab', { name: /^Acceleration/ })
      .querySelector('.results-drawer__mark');
    expect(mark?.textContent).toBe('✓');
    expect(mark?.getAttribute('title')).toBe('Served by a pre-aggregation');
    unmount();
    show({ accelerated: false });
    expect(
      screen
        .getByRole('tab', { name: /^Acceleration/ })
        .querySelector('.results-drawer__mark')
        ?.getAttribute('title'),
    ).toBe('Not served by a pre-aggregation');
  });

  it('says the rows and the time, with Copy and Download CSV, open or collapsed (EDI-17, EDI-23)', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { rerender } = show();
    expect(screen.getByTestId('drawer-facts').textContent).toBe('2 rows · 42 ms');
    // Copy: tab-separated, its titles heading it, as it pastes into a spreadsheet.
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(
      'Orders Status\tOrders Count\ncompleted\t80\nprocessing\t80',
    );
    // Download CSV: the same rows, as a tile's CSV is written (`rowsCsvOf`, RFC 4180).
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:rows';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    // A measure's raw number beside it, as a tile's CSV has it (AC-173).
    expect(await created[0]?.text()).toBe(
      'Orders Status,Orders Count,Orders Count (raw)\r\ncompleted,80,80\r\nprocessing,80,80',
    );
    click.mockRestore();
    // Collapsed: the strip keeps the count, and ⌃ opens it again.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ResultsDrawer {...props({ open: false })} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('drawer-facts').textContent).toBe('2 rows · 42 ms');
    expect(screen.getByRole('button', { name: 'Show the results' }).textContent).toBe('⌃');
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });

  it('numbers the rows, chips each column by its role, and swatches the colour dimension (EDI-18)', () => {
    show({
      swatchOf: (column, value) =>
        column === 'orders.status' && value === 'completed' ? '#123456' : undefined,
    });
    const table = screen.getByTestId('drawer-result-rows');
    expect(table.querySelector('th')?.textContent).toBe('#');
    expect(
      [...table.querySelectorAll('tbody td:first-child')].map((cell) => cell.textContent),
    ).toEqual(['1', '2']);
    expect(
      [...table.querySelectorAll('thead .field-row__icon')].map((chip) => chip.textContent),
    ).toEqual(['Aa', 'Σ']);
    const swatches = table.querySelectorAll<HTMLElement>('.results-drawer__swatch');
    expect(swatches).toHaveLength(1);
    expect(swatches[0]?.style.background).toBe('rgb(18, 52, 86)');
  });

  it('orders the result’s columns as the wells do, not as the query names them (EDI-19, AC-301)', () => {
    show({
      query: { measures: ['orders.count'], dimensions: ['orders.status', 'products.category'] },
      rows: [{ 'orders.status': 'completed', 'products.category': 'Tools', 'orders.count': '3' }],
      columns: ['products.category', 'orders.status', 'orders.count'],
    });
    expect(
      [...screen.getByTestId('drawer-result-rows').querySelectorAll('thead th')].map(
        (header) => header.textContent,
      ),
    ).toEqual(['#', 'Aaproducts.category', 'AaOrders Status', 'ΣOrders Count']);
  });

  it('shows the Cube query as coloured JSON or Cube’s SQL, with Copy and where it was sent (EDI-20)', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ queries: [{ sql: 'SELECT status, count(*) FROM orders', params: [] }] }),
    } as unknown as Response);
    show({ view: 'query' });
    const json = screen.getByTestId('drawer-query');
    expect(JSON.parse(json.textContent ?? '')).toEqual(QUERY);
    expect(json.querySelector('.code-key')?.textContent).toBe('"measures"');
    expect(json.querySelector('.code-string')?.textContent).toBe('"orders.count"');
    expect(screen.getByTestId('drawer-query-foot').textContent).toBe(
      'Sent to POST /cubejs-api/v1/load · 42 ms · 2 rows',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(QUERY, null, 2));
    await userEvent.click(screen.getByRole('button', { name: 'SQL' }));
    expect(screen.getByRole('button', { name: 'SQL' }).getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findByTestId('drawer-sql')).textContent).toBe(
      'SELECT status, count(*) FROM orders',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenLastCalledWith('SELECT status, count(*) FROM orders');
  });

  it('says the cap as an information line, not a warning (EDI-21)', () => {
    show({ rows: underlyingRows(240) });
    const note = screen.getByTestId('drawer-result-rows-truncated');
    expect(note.className).toBe('results-drawer__dline');
    expect(note.querySelector('svg')?.getAttribute('data-icon')).toBe('info');
    expect(note.textContent).toBe('Showing the first 100 of 240 rows.');
  });

  it('opens at 240 px, drags from 160 px to half the editor, and resets on a double-click (EDI-15)', () => {
    show();
    const section = screen.getByTestId('results-drawer');
    const parent = section.parentElement!;
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ height: 800 } as DOMRect);
    // The drawer as a whole, its strip and body, as design 02 pin 1 measures it.
    const body = () => section;
    expect(body()?.style.height).toBe('240px');
    const grip = section.querySelector<HTMLElement>('.results-drawer__grip')!;
    expect(grip.getAttribute('title')).toBe('Drag to resize · double-click to reset');
    // Up 100: taller by 100.
    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 400, pointerId: 1 });
    expect(body()?.style.height).toBe('340px');
    // Far up: no more than half the editor's 800.
    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: -500, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: -500, pointerId: 1 });
    expect(body()?.style.height).toBe('400px');
    // Far down: no less than 160.
    fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 900, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 900, pointerId: 1 });
    expect(body()?.style.height).toBe('160px');
    fireEvent.doubleClick(grip);
    expect(body()?.style.height).toBe('240px');
  });
});
