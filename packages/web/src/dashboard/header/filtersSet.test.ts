import { describe, expect, it } from 'vitest';

import type { DashboardFilter, FilterValues } from '../../filters/model';
import { valueKeyOf } from '../../filters/model';
import { filtersSet } from './filtersSet';

/**
 * T831 (AC-486): the toggle's count is the dashboard's filters holding a
 * value plus the filters made from a marking (AC-113), out of all of them,
 * named in the bar's order.
 */
const TITLES: Record<string, string> = {
  'orders.ordered_at': 'Ordered at',
  'customers.country': 'Country',
  'products.category': 'Category',
  'orders.status': 'Status',
  'products.name': 'Product',
};
const titleOf = (member: string) => TITLES[member] ?? member;

const FILTERS: readonly DashboardFilter[] = [
  { id: 'f-date', widget: 'dateRange', member: 'orders.ordered_at' },
  { id: 'f-country', widget: 'list', member: 'customers.country' },
  { id: 'f-category', widget: 'checkbox', member: 'products.category' },
  { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
];
const at = (id: string) => valueKeyOf(FILTERS.find((each) => each.id === id) as DashboardFilter);

describe('the filters set', () => {
  it('counts the filters holding a value and those made from a marking, of them all, named in the bar’s order', () => {
    const values: FilterValues = {
      [at('f-date')]: { kind: 'preset', preset: 'last 30 days' },
      [at('f-country')]: { kind: 'values', values: ['Norway'] },
      [at('f-category')]: { kind: 'values', values: ['Beverages', 'Produce'] },
    };

    expect(filtersSet(FILTERS, values, [{ members: ['products.name'] }], titleOf)).toEqual({
      set: 4,
      of: 5,
      names: ['Ordered at', 'Country', 'Category', 'Product'],
    });
  });

  it('counts a value that filters nothing as not set', () => {
    const values: FilterValues = {
      [at('f-country')]: { kind: 'values', values: [] },
      [at('f-date')]: { kind: 'dates', from: '', to: '' },
    };

    expect(filtersSet(FILTERS, values, [], titleOf)).toEqual({ set: 0, of: 4, names: [] });
  });

  it('leaves out a filter with no field, which a reader is not shown', () => {
    expect(filtersSet([{ id: 'f-new', widget: 'list' }], {}, [], titleOf)).toEqual({
      set: 0,
      of: 0,
      names: [],
    });
  });

  it('leaves out a filter on a field the model no longer has, which the bar does not show (T831’s review)', () => {
    const known = (member: string) => (member === 'orders.status' ? 'Status' : undefined);
    const values: FilterValues = {
      [at('f-country')]: { kind: 'values', values: ['Norway'] },
      [at('f-status')]: { kind: 'values', values: ['shipped'] },
    };

    expect(filtersSet(FILTERS, values, [], known)).toEqual({
      set: 1,
      of: 1,
      names: ['Status'],
    });
  });

  it('names a filter made from a marking on two fields by both', () => {
    expect(
      filtersSet([], {}, [{ members: ['customers.country', 'products.category'] }], titleOf),
    ).toEqual({ set: 1, of: 1, names: ['Country and Category'] });
  });
});
