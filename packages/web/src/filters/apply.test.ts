import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../dashboard/model/document';
import { activeFilters, filteredCharts, withFilters } from './apply';
import { DATE_PRESETS, valueKeyOf, type DashboardFilter, type FilterValues } from './model';

/**
 * T084 / AC-078: WHEN a filter value changes, THE SYSTEM SHALL re-query every
 * tile in its scope and leave tiles outside the scope unchanged.
 * Fails when: a tile outside the scope re-queries, or a tile inside it keeps
 * the previous result.
 *
 * Which charts a filter's value reaches, and what it adds to their queries.
 */
const status: DashboardFilter = { id: 'f-status', widget: 'list', member: 'orders.status' };
const amount: DashboardFilter = { id: 'f-amount', widget: 'range', member: 'orders.amount' };
const ordered: DashboardFilter = {
  id: 'f-ordered',
  widget: 'dateRange',
  member: 'orders.ordered_at',
};

const values = (entries: [DashboardFilter, FilterValues[string]][]): FilterValues =>
  Object.fromEntries(entries.map(([filter, value]) => [valueKeyOf(filter), value]));

describe('which filters are in effect', () => {
  it('those with a field and a value; not those without either', () => {
    const noField: DashboardFilter = { id: 'f-new', widget: 'list' };
    expect(
      activeFilters(
        [status, amount, noField, ordered],
        values([
          [status, { kind: 'values', values: ['completed'] }],
          [noField, { kind: 'values', values: ['x'] }],
        ]),
      ).map((active) => active.filter.id),
    ).toEqual(['f-status']);
  });

  it('not two dates still to be chosen', () => {
    expect(
      activeFilters([ordered], values([[ordered, { kind: 'dates', from: '', to: '' }]])),
    ).toEqual([]);
  });

  it('not a value held for the field the filter was on before', () => {
    const moved = { ...status, member: 'orders.region' };
    expect(
      activeFilters([moved], values([[status, { kind: 'values', values: ['completed'] }]])),
    ).toEqual([]);
  });
});

describe('what a filter adds to a query', () => {
  const base = {
    measures: ['orders.count'],
    dimensions: ['orders.status'],
    filters: [{ member: 'orders.region', operator: 'equals', values: ['EU'] }],
  };

  it('picked values: equals, beside the chart’s own filters', () => {
    expect(
      withFilters(base, [{ filter: status, value: { kind: 'values', values: ['a', 'b'] } }]),
    ).toEqual({
      ...base,
      filters: [
        { member: 'orders.region', operator: 'equals', values: ['EU'] },
        { member: 'orders.status', operator: 'equals', values: ['a', 'b'] },
      ],
    });
  });

  it('a numeric range: gte and lte, either end left open', () => {
    expect(
      withFilters({ measures: ['orders.count'] }, [
        { filter: amount, value: { kind: 'range', min: 10, max: 99 } },
      ]),
    ).toEqual({
      measures: ['orders.count'],
      filters: [
        { member: 'orders.amount', operator: 'gte', values: ['10'] },
        { member: 'orders.amount', operator: 'lte', values: ['99'] },
      ],
    });
    expect(
      withFilters({ measures: ['orders.count'] }, [
        { filter: amount, value: { kind: 'range', max: 5 } },
      ]),
    ).toEqual({
      measures: ['orders.count'],
      filters: [{ member: 'orders.amount', operator: 'lte', values: ['5'] }],
    });
  });

  it('a date range on a time dimension the chart groups by: its dateRange', () => {
    expect(
      withFilters(
        {
          measures: ['orders.count'],
          timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'month' }],
        },
        [{ filter: ordered, value: { kind: 'preset', preset: 'last 30 days' } }],
      ),
    ).toEqual({
      measures: ['orders.count'],
      timeDimensions: [
        { dimension: 'orders.ordered_at', granularity: 'month', dateRange: 'last 30 days' },
      ],
    });
  });

  it('a date range on a time dimension the chart does not use: a time dimension of its own', () => {
    expect(
      withFilters({ measures: ['orders.count'] }, [
        { filter: ordered, value: { kind: 'dates', from: '2026-01-01', to: '2026-03-31' } },
      ]),
    ).toEqual({
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.ordered_at', dateRange: ['2026-01-01', '2026-03-31'] }],
    });
  });

  it('a date range where the chart already limits that time dimension: both hold', () => {
    const limited = {
      measures: ['orders.count'],
      timeDimensions: [
        { dimension: 'orders.ordered_at', granularity: 'day', dateRange: 'this year' },
      ],
    };
    expect(
      withFilters(limited, [
        { filter: ordered, value: { kind: 'preset', preset: 'last 30 days' } },
      ]),
    ).toEqual({
      ...limited,
      filters: [{ member: 'orders.ordered_at', operator: 'inDateRange', values: ['last 30 days'] }],
    });
  });

  it('one end of a date range: on or after, or on or before', () => {
    expect(
      withFilters({ measures: ['orders.count'] }, [
        { filter: ordered, value: { kind: 'dates', from: '2026-01-01', to: '' } },
      ]),
    ).toEqual({
      measures: ['orders.count'],
      filters: [{ member: 'orders.ordered_at', operator: 'afterOrOnDate', values: ['2026-01-01'] }],
    });
    expect(
      withFilters({ measures: ['orders.count'] }, [
        { filter: ordered, value: { kind: 'dates', from: '', to: '2026-03-31' } },
      ]),
    ).toEqual({
      measures: ['orders.count'],
      filters: [
        { member: 'orders.ordered_at', operator: 'beforeOrOnDate', values: ['2026-03-31'] },
      ],
    });
  });

  /**
   * T089 / AC-083: WHEN a date filter uses a relative preset such as "last 30
   * days", THE SYSTEM SHALL send it to Cube as that relative range rather than
   * as fixed dates.
   * Fails when: the query contains fixed dates for a relative preset.
   */
  it('every preset as its own words, wherever it goes — never as dates', () => {
    for (const preset of DATE_PRESETS) {
      const value = { kind: 'preset', preset } as const;
      expect(withFilters({ measures: ['orders.count'] }, [{ filter: ordered, value }])).toEqual({
        measures: ['orders.count'],
        timeDimensions: [{ dimension: 'orders.ordered_at', dateRange: preset }],
      });
      // Where the chart already limits the field, as an inDateRange filter.
      expect(
        withFilters(
          {
            measures: ['orders.count'],
            timeDimensions: [{ dimension: 'orders.ordered_at', dateRange: 'this year' }],
          },
          [{ filter: ordered, value }],
        )['filters'],
      ).toEqual([{ member: 'orders.ordered_at', operator: 'inDateRange', values: [preset] }]);
    }
  });

  it('nothing, and the same query back, when no filter applies', () => {
    expect(withFilters(base, [])).toBe(base);
  });
});

describe('which charts a value reaches', () => {
  const DOC: DashboardDocument = {
    schemaVersion: 1,
    title: 'Sales',
    settings: { width: 'full' },
    pages: [
      { id: 'sales', title: 'Sales', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6 }] },
      { id: 'ops', title: 'Ops', items: [{ id: 't2', kind: 'chart', chartId: 'c2', w: 6 }] },
    ],
  };

  it('every chart in scope, with the filters that reach it; none outside', () => {
    const onSales = { ...status, scope: { kind: 'page', pageId: 'sales' } } as const;
    const everywhere = { ...amount };
    const reached = filteredCharts(DOC, [
      { filter: onSales, value: { kind: 'values', values: ['completed'] } },
      { filter: everywhere, value: { kind: 'range', min: 1 } },
    ]);
    expect(
      Object.fromEntries(
        Object.entries(reached).map(([chartId, applied]) => [
          chartId,
          applied.map((each) => each.filter.id),
        ]),
      ),
    ).toEqual({ c1: ['f-status', 'f-amount'], c2: ['f-amount'] });
  });

  it('no chart at all when no filter is in effect', () => {
    expect(filteredCharts(DOC, [])).toEqual({});
  });
});
