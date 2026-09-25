import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { DEFAULT_INTERACTIONS } from '../settings/interactionMode';
import { viewFor } from './applyBookmark';
import type { ViewState } from './viewState';

/**
 * T128 / AC-122: WHEN the user applies a bookmark, THE SYSTEM SHALL restore
 * that state without changing the dashboard's saved definition.
 * Fails when: applying a bookmark modifies the dashboard for other users.
 *
 * What a bookmark restores, fitted to the dashboard as it is now: the
 * dashboard may have changed since it was saved. The e2e applies one on the
 * real dashboard, and reads the dashboard back unchanged.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed', interactions: { ...DEFAULT_INTERACTIONS, mode: 'markings' } },
  markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
  filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
  pages: [
    { id: 'only', title: 'Only', items: [] },
    { id: 'second', title: 'Second', items: [] },
  ],
};

const SHIPPED = { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] };
const STATE: ViewState = {
  page: 'second',
  filters: { 'f-status orders.status': { kind: 'values', values: ['shipped'] } },
  marks: { m1: SHIPPED },
  markFilters: [],
  from: { m1: 'tile-status' },
};

describe('a bookmark applied', () => {
  it('restores its page tab, its filters’ values and its marks', () => {
    expect(viewFor(DOC, STATE)).toEqual(STATE);
  });

  it('keeps only what the dashboard still has: its pages, filters and markings', () => {
    expect(
      viewFor(DOC, {
        ...STATE,
        page: 'gone',
        // On the same field, another filter's value is taken on, as a link's is (AC-064).
        filters: {
          'f-old orders.status': { kind: 'values', values: ['completed'] },
          'f-old products.category': { kind: 'values', values: ['Tools'] },
        },
        marks: { m1: SHIPPED, gone: SHIPPED },
        from: { m1: 'tile-status', gone: 'tile-x' },
      }),
    ).toEqual({
      ...STATE,
      page: 'only',
      filters: { 'f-status orders.status': { kind: 'values', values: ['completed'] } },
    });
  });

  it('marks nothing on a dashboard no longer in Markings mode', () => {
    const crossFiltering: DashboardDocument = {
      ...DOC,
      settings: { width: 'fixed', interactions: { ...DEFAULT_INTERACTIONS, mode: 'crossFilter' } },
    };

    const withMarkFilter: ViewState = {
      ...STATE,
      markFilters: [
        {
          id: 'mark-filter-1',
          negate: false,
          markingName: 'Marking',
          summary: 'orders.status = shipped',
          filter: { member: 'orders.status', operator: 'equals', values: ['shipped'] },
          members: ['orders.status'],
          predicate: SHIPPED,
        },
      ],
    };

    // Nor a filter made from marks (T128's review): no marking's chips there (AC-120).
    expect(viewFor(crossFiltering, withMarkFilter)).toEqual({
      ...STATE,
      marks: {},
      markFilters: [],
      from: {},
    });
  });
});
