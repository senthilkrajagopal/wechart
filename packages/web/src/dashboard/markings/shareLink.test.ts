import { describe, expect, it } from 'vitest';

import type { ViewState } from '../bookmarks/viewState';
import { linkWithMarks, viewFromLink } from './shareLink';

/**
 * T129 / AC-123: WHEN the user copies a link with marks, THE SYSTEM SHALL
 * produce a URL that reproduces the current filters and marks when opened.
 * Fails when: opening the link produces different marks or filters.
 *
 * The link is the dashboard's own URL, its filters as AC-081 writes them and
 * the rest of the reader's view — page tab, marks, the filters "Filter to
 * marked" made — in a `view` parameter; opened, the router hands both back as
 * JSON (research/router-search-history.md, Q1), read here as a bookmark is.
 */
const VIEW: ViewState = {
  page: 'second',
  filters: { 'f-status orders.status': { kind: 'values', values: ['shipped', 'completed'] } },
  marks: { m1: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] } },
  markFilters: [
    {
      id: 'mark-filter-2',
      negate: false,
      markingName: 'Marking',
      summary: 'Status: processing',
      filter: { member: 'orders.status', operator: 'equals', values: ['processing'] },
      members: ['orders.status'],
    },
  ],
  from: { m1: 'tile-status' },
};

/** The link opened: each parameter as the router parses it, as JSON. */
function opened(link: string) {
  const url = new URL(link);
  const read = (key: string) => {
    const raw = url.searchParams.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  };
  return { url, search: { filters: read('filters'), view: read('view') } };
}

describe('a link with marks', () => {
  it('reproduces the filters, the marks and the page tab when opened', () => {
    const link = linkWithMarks(
      'http://localhost:5273/explore/dashboards/d1?edit=tile-1&filters=%5B%5D&editing=true',
      VIEW,
    );

    const { url, search } = opened(link);

    expect(url.pathname).toBe('/explore/dashboards/d1');
    // Nothing of the author's session: no chart open in the editor, no edit mode.
    expect([...url.searchParams.keys()].sort()).toEqual(['filters', 'view']);
    expect(viewFromLink(search)).toEqual(VIEW);
  });

  it('carries no filters where none is set, and still its marks', () => {
    const { url, search } = opened(
      linkWithMarks('http://localhost:5273/explore/dashboards/d1', { ...VIEW, filters: {} }),
    );

    expect(url.searchParams.has('filters')).toBe(false);
    expect(viewFromLink(search)).toEqual({ ...VIEW, filters: {} });
  });

  it('is no view at all without its view', () => {
    expect(viewFromLink({ filters: [], view: undefined })).toBeUndefined();
  });
});
