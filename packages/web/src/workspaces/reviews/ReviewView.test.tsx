import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProposalDetail } from './review';
import { ReviewView } from './ReviewView';

// The dashboard drawn is DashboardView's; here only what the view asks of
// it, and the tiles it marks (AC-341).
vi.mock('../../dashboard/DashboardPage', async (importOriginal) => {
  const { useContext } = await import('react');
  const { ReviewMarks } = await import('../../dashboard/grid/reviewMarks');
  return {
    ...(await importOriginal<object>()),
    ReadOnlyDashboard: function Drawn({
      cacheKey,
      document,
    }: {
      cacheKey: string;
      document: { title: string };
    }) {
      const marks = useContext(ReviewMarks);
      return (
        <p data-testid="drawn" data-marks={JSON.stringify(marks)}>
          {cacheKey} · {document.title}
        </p>
      );
    },
  };
});

/**
 * T356 (AC-286, AC-287, AC-288; design 05's review view; rules 77–79, 85):
 * where it is in the queue, what is in it (a dashboard's own charts part of
 * it, a library chart listed with the reason), the item drawn with Proposed
 * and Current, and the inspector: who, when, what they said, and what it
 * replaces where.
 */
const proposal = (over: Partial<ProposalDetail>): ProposalDetail => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'd1',
  title: 'Revenue overview',
  targetFolderId: 'f1',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  author: { key: 'wren', name: 'Wren Writer' },
  description: 'Adds a monthly EMEA revenue chart.\nAvg order value uses the mean.',
  proposedAt: new Date(2026, 8, 27, 14, 5).toISOString(),
  status: 'open',
  replaces: { id: 'shared-d1', version: 7, copiedFrom: true },
  items: [
    {
      kind: 'dashboard',
      id: 'd1',
      title: 'Revenue overview',
      version: 3,
      landsIn: 'f1',
      landsInPath: ['Shared', 'Sales', 'EMEA'],
      replaces: { id: 'shared-d1', version: 7, copiedFrom: true },
      replacesNow: 7,
      snapshot: {
        schemaVersion: 1,
        title: 'Revenue overview v2',
        pages: [{ id: 'p1', items: [{ id: 't-new', kind: 'text', text: 'Hi' }] }],
      },
    },
    {
      kind: 'chart',
      id: 'c-local',
      title: 'Local',
      version: 1,
      landsIn: 'f1',
      landsInPath: ['Shared', 'Sales', 'EMEA'],
      replaces: null,
      snapshot: { title: 'Local', localToDashboardId: 'd1' },
    },
    {
      kind: 'chart',
      id: 'c-lib',
      title: 'Margin',
      version: 2,
      landsIn: 'f2',
      landsInPath: ['Shared', 'Sales'],
      replaces: null,
      snapshot: { title: 'Margin' },
    },
  ],
  decision: null,
  mayApprove: true,
  mayReject: true,
  yours: false,
  ...over,
});

const reviews = {
  toReview: [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }],
  mine: [],
};

function shown(detail: ProposalDetail) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === `/api/proposals/${detail.id}`
          ? new Response(JSON.stringify(detail))
          : url === '/api/reviews'
            ? new Response(JSON.stringify(reviews))
            : url === '/api/documents/dashboard/shared-d1'
              ? new Response(
                  JSON.stringify({
                    body: { schemaVersion: 1, title: 'Revenue overview', pages: [] },
                    version: 7,
                  }),
                )
              : new Response('{}', { status: 404 }),
      ),
    ),
  );
  const onOpen = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReviewView proposalId={detail.id} onOpen={onOpen} now={new Date(2026, 8, 28, 9, 0)} />
    </QueryClientProvider>,
  );
  return { onOpen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the review view (T356)', () => {
  it('heads with the item and where it goes, and steps through the queue', async () => {
    const { onOpen } = shown(proposal({}));
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Review · Revenue overview → Sales / EMEA',
    );
    expect(screen.getByRole('link', { name: '← Reviews' }).getAttribute('href')).toBe(
      '/reviews?selected=p1',
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId('review-queue').textContent).toContain('2 of 3');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onOpen).toHaveBeenCalledWith('p2');
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onOpen).toHaveBeenCalledWith('p0');
  });

  it('lists what is in it, a dashboard’s own charts part of it, with why the rest goes too', async () => {
    shown(proposal({}));
    const list = await screen.findByRole('list', { name: 'In this proposal' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Revenue overviewDashboard · replaces version 7', 'MarginChart · new in Sales']);
    expect(screen.getByTestId('review-bundle').textContent).toBe(
      'These go with the dashboard, which shows them from the author’s workspace. They’re approved or rejected together.',
    );
  });

  it('draws the proposed dashboard, and the folder’s current one on Current', async () => {
    shown(proposal({}));
    expect((await screen.findByTestId('drawn')).textContent).toBe(
      'proposal:p1:d1 · Revenue overview v2',
    );
    // Its tile the folder's version hasn't is marked new (AC-341).
    await vi.waitFor(() => {
      expect(screen.getByTestId('drawn').getAttribute('data-marks')).toBe('{"t-new":"new"}');
    });
    expect(
      screen.getByText('Drawn read-only, as readers in Sales / EMEA would see it.'),
    ).toBeTruthy();
    const current = screen.getByRole('button', { name: 'Current (version 7)' });
    expect(current.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(current);
    expect(current.getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => {
      expect(screen.getByTestId('drawn').textContent).toBe(
        'current:shared-d1:7 · Revenue overview',
      );
    });
    // The folder's own version marks nothing.
    expect(screen.getByTestId('drawn').getAttribute('data-marks')).toBe('{}');
  });

  it('says where the folder moved on since, and that approving replaces what it has now', async () => {
    const detail = proposal({});
    shown({
      ...detail,
      items: detail.items.map((each, at) => (at === 0 ? { ...each, replacesNow: 8 } : each)),
    });
    const inspector = await screen.findByRole('complementary', { name: 'About this proposal' });
    expect(within(inspector).getByTestId('review-moved-on').textContent).toBe(
      'Based on version 7; the folder now has version 8. Approving replaces version 8, which stays in History.',
    );
    expect(screen.getByRole('button', { name: 'Current (version 8)' })).toBeTruthy();
  });

  it('comes back to the row it came from, in My proposals for one not to review', async () => {
    shown(proposal({ id: 'p9', status: 'withdrawn', mayApprove: false, mayReject: false }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: '← Reviews' }).getAttribute('href')).toBe(
      '/reviews?tab=mine&selected=p9',
    );
    // Decided, it is shown as proposed, with nothing to set it against.
    expect(screen.queryByRole('group', { name: 'Which version' })).toBeNull();
    expect(screen.getByText('As proposed, read-only.')).toBeTruthy();
  });

  it('says who proposed it, when, what they said, and what it replaces where', async () => {
    shown(proposal({}));
    const inspector = await screen.findByRole('complementary', { name: 'About this proposal' });
    expect(within(inspector).getByTestId('review-author').textContent).toBe(
      'Wren Writer · 27 Sep 2026, 14:05',
    );
    expect(within(inspector).getByTestId('review-description').textContent).toBe(
      'Adds a monthly EMEA revenue chart.\nAvg order value uses the mean.',
    );
    expect(within(inspector).getByTestId('review-replaces').textContent).toBe('Replaces version 7');
    expect(within(inspector).getByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  it('shows a decided one’s decision, and no way to decide it again', async () => {
    shown(
      proposal({
        status: 'rejected',
        mayApprove: false,
        mayReject: false,
        decision: {
          by: { key: 'ada', name: 'Ada Admin' },
          at: new Date(2026, 8, 27, 16, 40).toISOString(),
          reason: 'Keep the median.',
        },
      }),
    );
    const inspector = await screen.findByRole('complementary', { name: 'About this proposal' });
    expect(within(inspector).getByTestId('review-decision').textContent).toBe(
      'Rejected by Ada Admin · 27 Sep 2026, 16:40',
    );
    expect(within(inspector).getByRole('blockquote').textContent).toBe('Keep the median.');
    expect(within(inspector).queryByRole('button', { name: /Approve|Reject/ })).toBeNull();
  });

  it('says so when there is no such proposal, or it isn’t the user’s to see', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'There is no such proposal.' }), { status: 404 }),
        ),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ReviewView proposalId="missing" onOpen={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('There is no such proposal.')).toBeTruthy();
  });
});
