import { describe, expect, it } from 'vitest';

import { viewStateFrom, type ViewState } from './viewState';

/**
 * T128 / AC-122, T129 / AC-123: what a bookmark or a link says a dashboard
 * showed, read back. It is JSON anyone can have written — a link is pasted and
 * edited by hand — so each part is taken only if it is one, as the URL's
 * filters are (AC-081), and anything else is dropped rather than trusted.
 */
const STATE: ViewState = {
  page: 'second',
  filters: {
    'f-status orders.status': { kind: 'values', values: ['shipped', 'completed'] },
    'f-ordered orders.ordered_at': { kind: 'preset', preset: 'this year' },
  },
  marks: {
    m1: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
  },
  markFilters: [
    {
      id: 'mark-filter-1',
      negate: true,
      markingName: 'Marking',
      summary: 'Status: processing',
      filter: { member: 'orders.status', operator: 'notEquals', values: ['processing'] },
      members: ['orders.status'],
    },
  ],
  from: { m1: 'tile-status' },
};

describe('a view state read back', () => {
  it('is what was written, when all of it is', () => {
    expect(viewStateFrom(JSON.parse(JSON.stringify(STATE)))).toEqual(STATE);
  });

  it('keeps what is a value and drops what is not, part by part', () => {
    expect(
      viewStateFrom({
        page: 7,
        filters: {
          'f-status orders.status': { kind: 'values', values: ['shipped'] },
          'no-member': { kind: 'values', values: ['x'] },
          'f-x orders.x': { kind: 'values', values: [1] },
        },
        marks: {
          m1: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
          // A tuple of nothing would mark every row.
          m2: { items: [[]], ranges: [] },
        },
        markFilters: [STATE.markFilters[0], { id: 'x', negate: 'yes' }],
        from: { m1: 'tile-status', m2: 3 },
      }),
    ).toEqual({
      page: '',
      filters: { 'f-status orders.status': { kind: 'values', values: ['shipped'] } },
      marks: { m1: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] } },
      markFilters: [STATE.markFilters[0]],
      from: { m1: 'tile-status' },
    });
  });

  it('is nothing when it is not a view at all', () => {
    for (const raw of [null, 'x', [], 3]) expect(viewStateFrom(raw)).toBeUndefined();
    expect(viewStateFrom({})).toEqual({
      page: '',
      filters: {},
      marks: {},
      markFilters: [],
      from: {},
    });
  });
});
