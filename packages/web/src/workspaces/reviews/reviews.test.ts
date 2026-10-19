import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  folderText,
  includesText,
  proposedText,
  refreshReviews,
  REVIEWS_QUERY,
  statusOf,
  type Reviews,
  type ReviewRow,
} from './reviews';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Lane FIX (propose.spec:83's "Draft" under load): a change to proposals made
 * while Reviews' first read is still on its way. Invalidated, TanStack Query
 * reuses a first fetch that has no data yet (tanstack-query-mutations.md), so
 * the lists would keep the answer from before the change.
 */
describe('refreshReviews', () => {
  it('asks again for a first read still on its way, rather than keeping its answer from before the change', async () => {
    let firstRead: ((response: Response) => void) | undefined;
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url !== '/api/reviews') return Promise.resolve(new Response('{}', { status: 404 }));
        reads += 1;
        if (reads === 1)
          return new Promise<Response>((resolve) => {
            firstRead = resolve;
          });
        return Promise.resolve(
          new Response(JSON.stringify({ toReview: [], mine: [{ id: 'p1' }] }), { status: 200 }),
        );
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stop = new QueryObserver(client, REVIEWS_QUERY).subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(firstRead).toBeDefined();
    });

    const refreshed = refreshReviews(client);
    // The read from before the change arrives only now.
    firstRead?.(new Response(JSON.stringify({ toReview: [], mine: [] }), { status: 200 }));
    await refreshed;

    expect(client.getQueryData<Reviews>(['reviews'])?.mine.map((each) => each.id)).toEqual(['p1']);
    stop();
  });
});

/**
 * T355 (AC-287; design 05 of 2026-09-27, states D and E): how the Reviews
 * lists write a proposal's folder, what goes with it, its state and when.
 */
const row = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'd1',
  title: 'Revenue overview',
  targetFolderId: 'emea',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  author: { key: 'wren', name: 'Wren Writer' },
  description: null,
  proposedAt: '2026-09-27T14:05:00Z',
  status: 'open',
  yours: false,
  includes: [],
  replaces: null,
  decision: null,
  landedVersion: null,
  ...over,
});

describe('the Reviews lists’ words (T355)', () => {
  it('names a folder from below Shared, and the root as Shared', () => {
    expect(folderText(['Shared', 'Sales', 'EMEA'])).toBe('Sales / EMEA');
    expect(folderText(['Shared'])).toBe('Shared');
  });

  it('counts what goes with it by kind', () => {
    expect(includesText([])).toBe('');
    expect(includesText([{ kind: 'chart', title: 'Margin' }])).toBe('+1 chart');
    expect(
      includesText([
        { kind: 'chart', title: 'Margin' },
        { kind: 'chart', title: 'Churn' },
        { kind: 'data-source', title: 'sales_dw' },
      ]),
    ).toBe('+2 charts, +1 data source');
    // The models a dashboard resolves through (T350; design 05, state D's "+1 model").
    expect(includesText([{ kind: 'model', title: 'cubes/sales.yml' }])).toBe('+1 model');
    expect(
      includesText([
        { kind: 'model', title: 'cubes/sales.yml' },
        { kind: 'model', title: 'cubes/regions.yml' },
      ]),
    ).toBe('+2 models');
  });

  it('says each state in words, with who decided it, and the version it landed as', () => {
    // With the idle clock, as design 05 draws waiting, not running work's arc (T699, SEC-20).
    expect(statusOf(row({}))).toEqual({ kind: 'idle', text: 'Waiting for review' });
    expect(statusOf(row({ status: 'approved', landedVersion: 3 }))).toEqual({
      kind: 'ok',
      text: 'Approved as version 3',
    });
    expect(
      statusOf(
        row({
          status: 'rejected',
          decision: { by: { key: 'ada', name: 'Ada Admin' }, at: '', reason: null },
        }),
      ),
    ).toEqual({ kind: 'err', text: 'Rejected by Ada Admin' });
    expect(statusOf(row({ status: 'withdrawn' }))).toEqual({ kind: 'idle', text: 'Withdrawn' });
  });

  it('says when as today’s time, yesterday, or the day', () => {
    const now = new Date(2026, 8, 27, 18, 0);
    expect(proposedText(new Date(2026, 8, 27, 14, 5).toISOString(), now)).toBe('Today 14:05');
    expect(proposedText(new Date(2026, 8, 26, 9, 0).toISOString(), now)).toBe('Yesterday');
    // Day first, as design 05 draws it (T477; Q6).
    expect(proposedText(new Date(2026, 8, 24, 9, 0).toISOString(), now)).toBe('24 Sep');
    expect(proposedText(new Date(2025, 11, 30, 9, 0).toISOString(), now)).toBe('30 Dec 2025');
  });
});
