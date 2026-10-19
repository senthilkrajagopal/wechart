import type { DashboardParameter, MarkingPredicate } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { markFilterFrom, type MarkFilter } from '../markings/filterToMarked';
import type { DashboardDocument } from '../model/document';
import { viewFor } from './applyBookmark';
import { summariseMarking } from '../markings/MarkChip';
import { viewStateFrom, type ViewState } from './viewState';

/**
 * T128 / AC-122, T129 / AC-123: what a bookmark or a link says a dashboard
 * showed, read back. It is JSON anyone can have written — a link is pasted and
 * edited by hand — so each part is taken only if it is one, as the URL's
 * filters are (AC-081), and anything else is dropped rather than trusted.
 */
const PROCESSING: MarkingPredicate = {
  items: [[{ member: 'orders.status', value: 'processing' }]],
  ranges: [],
};

/** A "Filter to marked" filter as the dashboard makes one, from its marking's predicate. */
function madeFrom(predicate: MarkingPredicate, negate: boolean, id: string): MarkFilter {
  const made = markFilterFrom(predicate, negate, {
    id,
    markingName: 'Marking',
    summary: summariseMarking(predicate, undefined, 3),
  });
  if ('refused' in made) throw new Error(made.refused);
  return made;
}

const STATE: ViewState = {
  page: 'second',
  filters: {
    'f-status orders.status': { kind: 'values', values: ['shipped', 'completed'] },
    'f-ordered orders.ordered_at': { kind: 'preset', preset: 'this year' },
  },
  marks: {
    m1: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
  },
  markFilters: [madeFrom(PROCESSING, true, 'mark-filter-1')],
  from: { m1: 'tile-status' },
};

/**
 * T900 / AC-121: WHEN the user saves a bookmark, THE SYSTEM SHALL store …
 * each dashboard parameter's value (F46) …, and applying it SHALL set them
 * all. `Fails when: applying the bookmark restores a different … parameter
 * value.`
 */
describe('a bookmark’s parameter values (T900, AC-121)', () => {
  const metric: DashboardParameter = {
    id: 'p-metric',
    name: 'Metric to show',
    kind: 'fieldSwitch',
    role: 'measure',
    choices: [
      { member: 'orders.revenue', label: 'Revenue' },
      { member: 'orders.count', label: 'Orders' },
    ],
    default: 'orders.revenue',
  };
  const saved: ViewState = { ...STATE, parameters: { 'p-metric': 'orders.count' } };

  it('stores Metric to show at Orders, and reads it back as stored', () => {
    expect(viewStateFrom(JSON.parse(JSON.stringify(saved)))?.parameters).toEqual({
      'p-metric': 'orders.count',
    });
  });

  it('sets it back, from Revenue, when applied; one the dashboard no longer has is dropped', () => {
    const document: DashboardDocument = {
      schemaVersion: 1,
      title: 'Sales',
      settings: { width: 'fixed' },
      parameters: [metric],
      pages: [{ id: 'second', title: 'Second', items: [] }],
    };
    const applied = viewFor(document, {
      ...saved,
      parameters: { 'p-metric': 'orders.count', 'p-gone': 'orders.x' },
    });
    expect(applied.parameters).toEqual({ 'p-metric': 'orders.count' });
  });

  it('drops a value that isn’t a member’s name, as anything else read back is', () => {
    expect(
      viewStateFrom({ ...JSON.parse(JSON.stringify(STATE)), parameters: { a: 3, b: 'x.y' } })
        ?.parameters,
    ).toEqual({ b: 'x.y' });
  });
});

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

  /**
   * T128's review: a restored "Filter to marked" filter is made again from its
   * marking's predicate, checked as a mark is, so the filter asked and the
   * words its chip says are the predicate's — never a filter or words the
   * JSON carries, which could say one thing and filter by another, or be no
   * filter at all.
   */
  it('makes a "Filter to marked" filter again from its predicate, taking nothing else it says', () => {
    const lying = {
      ...STATE.markFilters[0],
      summary: 'Status: shipped',
      filter: { member: 'orders.amount', operator: 'gt', values: ['0'] },
      members: ['orders.amount'],
    };
    const broken = { ...lying, id: 'mark-filter-2', filter: { and: [null] } };
    const unpredicated = { ...lying, id: 'mark-filter-3', predicate: { items: [[]], ranges: [] } };

    expect(
      viewStateFrom({ ...STATE, markFilters: [lying, broken, unpredicated] })?.markFilters,
    ).toEqual([STATE.markFilters[0], madeFrom(PROCESSING, true, 'mark-filter-2')]);
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
