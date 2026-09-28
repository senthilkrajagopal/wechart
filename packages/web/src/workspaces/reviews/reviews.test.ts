import { describe, expect, it } from 'vitest';

import { folderText, includesText, proposedText, statusOf, type ReviewRow } from './reviews';

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
  });

  it('says each state in words, with who decided it, and the version it landed as', () => {
    expect(statusOf(row({}))).toEqual({ kind: 'run', text: 'Waiting for review' });
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
    expect(proposedText(new Date(2026, 8, 24, 9, 0).toISOString(), now)).toBe('Sep 24');
    expect(proposedText(new Date(2025, 11, 30, 9, 0).toISOString(), now)).toBe('Dec 30, 2025');
  });
});
