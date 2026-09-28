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
      'Revenue overview',
      'Dashboard',
      'Sales / EMEA',
      'Wren Writer',
      'Today 14:05',
      '+1 chart',
      'Waiting for review',
    ]);
    expect(within(rows[1]!).getAllByRole('cell')[0]!.textContent).toBe('sales_dwYours');
    expect(within(rows[1]!).getAllByRole('cell')[4]!.textContent).toBe('Yesterday');
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
    expect(within(summary).getByTestId('review-by').textContent).toBe(
      'Proposed by Wren Writer · Today 14:05',
    );
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
});
