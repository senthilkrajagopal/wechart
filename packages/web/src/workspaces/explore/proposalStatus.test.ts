import { describe, expect, it } from 'vitest';

import type { ReviewRow } from '../reviews/reviews';
import { statusOfItem } from './proposalStatus';

/**
 * T358 (AC-284; design 04): a workspace row's status from the latest of its
 * author's proposals that holds it — its own, or the one it went into with
 * another item (T358's review). None is Draft, and so is one withdrawn.
 */
const row = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'p1',
  kind: 'dashboard',
  itemId: 'b1',
  title: 'Board',
  targetFolderId: 'f1',
  targetPath: ['Shared', 'Sales'],
  author: { key: 'w', name: 'Wren' },
  description: null,
  proposedAt: '2026-09-28T10:00:00Z',
  status: 'open',
  yours: true,
  includes: [],
  replaces: null,
  decision: null,
  landedVersion: null,
  items: [
    { kind: 'dashboard', id: 'b1' },
    { kind: 'chart', id: 'c1' },
  ],
  ...over,
});

describe('a workspace row’s status (T358)', () => {
  it('reads its own proposal', () => {
    expect(statusOfItem([row({})], { kind: 'dashboard', id: 'b1' })).toEqual({
      kind: 'run',
      text: 'Waiting for review',
    });
    expect(
      statusOfItem([row({ status: 'approved', landedVersion: 4 })], {
        kind: 'dashboard',
        id: 'b1',
      }),
    ).toEqual({ kind: 'ok', text: 'In folder as version 4' });
  });

  it('finds an item that went with another’s proposal, newest first', () => {
    const mine = [
      row({ id: 'p2', status: 'rejected' }),
      row({ id: 'p1', status: 'approved', landedVersion: 4 }),
    ];
    expect(statusOfItem(mine, { kind: 'chart', id: 'c1' })).toEqual({
      kind: 'err',
      text: 'Rejected',
    });
    // The version landed is the proposal's own item's, so not said for another.
    expect(
      statusOfItem([row({ status: 'approved', landedVersion: 4 })], { kind: 'chart', id: 'c1' }),
    ).toEqual({ kind: 'ok', text: 'In folder' });
  });

  // T350 (AC-285): a model row is listed by its path; its proposal names its file's id.
  it('finds a model by its file’s id', () => {
    const mine = [
      row({
        items: [
          { kind: 'dashboard', id: 'b1' },
          { kind: 'model', id: 'file-1' },
        ],
      }),
    ];
    expect(statusOfItem(mine, { kind: 'model', id: 'cubes/sales.yml', fileId: 'file-1' })).toEqual({
      kind: 'run',
      text: 'Waiting for review',
    });
    expect(statusOfItem(mine, { kind: 'model', id: 'cubes/sales.yml' })).toBeUndefined();
  });

  it('is none for an item in no proposal, or one withdrawn', () => {
    expect(statusOfItem([row({})], { kind: 'chart', id: 'other' })).toBeUndefined();
    expect(
      statusOfItem([row({ status: 'withdrawn' })], { kind: 'chart', id: 'c1' }),
    ).toBeUndefined();
    expect(statusOfItem(undefined, { kind: 'chart', id: 'c1' })).toBeUndefined();
  });
});
