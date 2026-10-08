import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewRow, Reviews } from './reviews';
import { ReviewsPage, type ReviewsView } from './ReviewsPage';

/**
 * T355 (AC-287; design 05 of 2026-09-27, states D and E): the Reviews page.
 * "To review" lists every open proposal the user may decide, theirs marked
 * "Yours"; "My proposals" lists theirs in every state. A row opens its
 * summary in the inspector beside the list. Approve and Reject are the
 * review view's (T356), never here.
 */
const NOW = new Date(2026, 8, 27, 18, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'd1',
  title: 'Revenue overview',
  targetFolderId: 'emea',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  author: { key: 'wren', name: 'Wren Writer' },
  description: 'Adds a monthly EMEA revenue chart by country.\nAvg order value now uses the mean.',
  proposedAt: at(27, 14, 5),
  status: 'open',
  yours: false,
  includes: [{ kind: 'chart', title: 'Margin' }],
  replaces: { id: 'd0', version: 7 },
  decision: null,
  landedVersion: null,
  ...over,
});

const LISTS: Reviews = {
  toReview: [
    row({}),
    row({
      id: 'p2',
      kind: 'data-source',
      title: 'sales_dw',
      targetPath: ['Shared', 'Sales'],
      author: { key: 'ada', name: 'Ada Admin' },
      description: null,
      proposedAt: at(26, 9),
      yours: true,
      includes: [],
      replaces: null,
    }),
  ],
  mine: [
    row({
      id: 'p2',
      kind: 'data-source',
      title: 'sales_dw',
      targetPath: ['Shared', 'Sales'],
      proposedAt: at(26, 9),
      yours: true,
      includes: [],
      replaces: null,
    }),
    row({
      id: 'p3',
      kind: 'chart',
      title: 'Churn watch',
      targetPath: ['Shared', 'Finance'],
      proposedAt: at(25, 10),
      yours: true,
      status: 'rejected',
      decision: {
        by: { key: 'ada', name: 'Ada Admin' },
        at: at(26, 16, 40),
        reason: 'Keep the median.',
      },
    }),
    row({
      id: 'p4',
      kind: 'chart',
      title: 'Top products',
      targetPath: ['Shared', 'Sales'],
      proposedAt: at(24, 10),
      yours: true,
      status: 'approved',
      landedVersion: 3,
      decision: { by: { key: 'ada', name: 'Ada Admin' }, at: at(24, 12), reason: null },
    }),
  ],
};

const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function serve(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => (url === '/api/reviews' ? answer(status, body) : answer(404, {}))),
  );
}

function Page({ start }: { start: ReviewsView }) {
  const [view, setView] = useState(start);
  return <ReviewsPage view={view} onView={setView} now={NOW} />;
}

const shown = (start: ReviewsView = { tab: 'to-review' }) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page start={start} />
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Reviews page (T355, AC-287)', () => {
  it('lists what the user may decide, with the surface’s columns, theirs marked Yours', async () => {
    serve(200, LISTS);
    shown();
    const table = await screen.findByRole('table', { name: 'To review' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Item', 'Kind', 'Target folder', 'Author', 'Proposed', 'Includes', 'Status']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      within(rows[0]!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '▦Revenue overview',
      'Dashboard',
      'Sales / EMEA',
      'Wren Writer',
      'Today 14:05',
      '+1 chart',
      'Waiting for review',
    ]);
    expect(within(rows[1]!).getAllByRole('cell')[0]!.textContent).toBe('◍sales_dwYours');
    expect(within(rows[1]!).getAllByRole('cell')[4]!.textContent).toBe('Yesterday');
    // Each item with its kind's icon before its title (state D; T699, SEC-24), and
    // waiting with the idle clock (SEC-20).
    expect(rows.map((row) => row.querySelector('.itemicon')?.textContent)).toEqual(['▦', '◍']);
    expect(
      within(rows[0]!).getAllByRole('cell')[6]!.querySelector('svg')?.getAttribute('data-icon'),
    ).toBe('idle');
    // The tab says how many.
    expect(screen.getByRole('tab', { name: 'To review 2' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('opens a proposal’s summary beside the list, with no decision to make there', async () => {
    serve(200, LISTS);
    shown();
    await userEvent.click(await screen.findByRole('button', { name: 'Revenue overview' }));
    const summary = screen.getByRole('region', { name: 'Revenue overview' });
    expect(within(summary).getByTestId('review-where').textContent).toBe(
      'Dashboard → Sales / EMEA · replaces version 7 · with +1 chart',
    );
    // As state D draws it (T699, SEC-23): its kind's icon in the head; Proposed by
    // and What changed as sections; Open review last.
    expect(summary.querySelector('header .itemicon')?.textContent).toBe('▦');
    expect(
      within(summary)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Proposed by', 'What changed']);
    expect(within(summary).getByTestId('review-by').textContent).toBe('Wren Writer · Today 14:05');
    const open = within(summary).getByRole('link', { name: 'Open review' });
    expect(summary.lastElementChild?.contains(open)).toBe(true);
    // As written, its lines kept.
    expect(within(summary).getByTestId('review-description').textContent).toBe(
      'Adds a monthly EMEA revenue chart by country.\nAvg order value now uses the mean.',
    );
    expect(within(summary).queryByRole('button', { name: /Approve|Reject/ })).toBeNull();
    // Chosen again, it closes.
    await userEvent.click(screen.getByRole('button', { name: 'Revenue overview' }));
    expect(screen.queryByRole('region', { name: 'Revenue overview' })).toBeNull();
  });

  it('hands focus back to its row as the summary closes, by × or Escape (T355’s review)', async () => {
    serve(200, LISTS);
    shown();
    const item = await screen.findByRole('button', { name: 'Revenue overview' });
    await userEvent.click(item);
    await userEvent.click(screen.getByRole('button', { name: 'Close the summary' }));
    expect(screen.queryByRole('region', { name: 'Revenue overview' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Revenue overview' }));
    await userEvent.click(screen.getByRole('button', { name: 'Revenue overview' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Revenue overview' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Revenue overview' }));
  });

  it('keeps the proposal chosen when its own tab is chosen again', async () => {
    serve(200, LISTS);
    shown({ tab: 'to-review', selected: 'p1' });
    await screen.findByRole('region', { name: 'Revenue overview' });
    await userEvent.click(screen.getByRole('tab', { name: 'To review 2' }));
    expect(screen.getByRole('region', { name: 'Revenue overview' })).not.toBeNull();
  });

  it('says a new one lands new, and one without a description has none', async () => {
    serve(200, LISTS);
    shown({ tab: 'to-review', selected: 'p2' });
    const summary = await screen.findByRole('region', { name: 'sales_dw' });
    expect(within(summary).getByTestId('review-where').textContent).toBe(
      'Data source → Sales · new in this folder',
    );
    expect(within(summary).getByTestId('review-description').textContent).toBe('No description');
  });

  it('lists the user’s own in every state, rejected with who and why', async () => {
    serve(200, LISTS);
    shown();
    await userEvent.click(await screen.findByRole('tab', { name: 'My proposals' }));
    const table = screen.getByRole('table', { name: 'My proposals' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Item', 'Target', 'Proposed', 'Status']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((each) => within(each).getAllByRole('cell')[3]!.textContent),
    ).toEqual(['Waiting for review', 'Rejected by Ada Admin', 'Approved as version 3']);
    await userEvent.click(screen.getByRole('button', { name: 'Churn watch' }));
    const summary = screen.getByRole('region', { name: 'Churn watch' });
    expect(within(summary).getByTestId('review-decision').textContent).toBe(
      'Rejected by Ada Admin · Yesterday',
    );
    expect(within(summary).getByTestId('review-reason').textContent).toBe('Keep the median.');
  });

  it('says so when a list is empty', async () => {
    serve(200, { toReview: [], mine: [] });
    shown();
    expect(await screen.findByText('Nothing is waiting for you to review.')).not.toBeNull();
    // No count at 0, as the top bar's pill hides it (state C; security-Q5, T699).
    expect(
      screen.getByRole('tab', { name: 'To review' }).querySelector('.reviews__tab-count'),
    ).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'My proposals' }));
    expect(
      screen.getByText(
        'You haven’t proposed anything yet. Proposals start from items in My workspace.',
      ),
    ).not.toBeNull();
  });

  it('says why when the proposals can’t be read', async () => {
    serve(404, { error: 'Proposals need sign-in.' });
    shown();
    expect((await screen.findByRole('alert')).textContent).toBe('Proposals need sign-in.');
  });

  /**
   * T383 / AC-050: a calculation request is shown to the read-write members
   * of the folder whose model defines the chart's cube, under its own tab.
   */
  it('shows the calculation requests asked of the user’s folders under their own tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/reviews'
          ? answer(200, LISTS)
          : url === '/api/calc-requests'
            ? answer(200, { requests: [] })
            : answer(404, {}),
      ),
    );
    shown();
    await userEvent.click(await screen.findByRole('tab', { name: 'Calculation requests' }));

    expect(
      screen.getByRole('tab', { name: 'Calculation requests' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect((await screen.findByTestId('requests-none')).textContent).toBe(
      'No calculations have been asked of the folders you may change.',
    );
  });

  /** T383's review: the request opens beside the list, as a proposal's summary does. */
  it('opens a calculation request beside the list, as a proposal’s summary opens', async () => {
    const request = {
      id: 'r1',
      chart: null,
      cube: 'fsales__orders',
      folderId: 'sales',
      folderPath: ['Sales'],
      modelPath: 'cubes/orders.yml',
      fields: { measures: [], dimensions: [], timeDimensions: [], filters: [] },
      unseenFields: 0,
      description: 'Margin',
      requestedBy: 'Manager',
      requestedAt: at(27, 9),
      status: 'open',
      resolution: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/reviews'
          ? answer(200, LISTS)
          : url === '/api/calc-requests'
            ? answer(200, { requests: [request] })
            : answer(404, {}),
      ),
    );
    const { container } = shown({ tab: 'requests' });
    await userEvent.click(await screen.findByRole('button', { name: 'orders' }));

    const summary = screen.getByRole('region', { name: 'Calculation on orders' });
    expect(screen.getByRole('tabpanel').contains(summary)).toBe(false);
    expect(summary.parentElement).toBe(container.querySelector('.reviews'));
  });
});
