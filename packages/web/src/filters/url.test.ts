import { describe, expect, it } from 'vitest';

import { valueKeyOf, type FilterValues } from './model';
import { valuesFromSearch, valuesToSearch } from './url';

/**
 * T087 / AC-081: WHEN filters are active, THE SYSTEM SHALL include them in the
 * dashboard's URL so that opening that URL reproduces them.
 * Fails when: opening the URL in a new session produces different filter
 * values.
 *
 * The filter values as they are written into the URL's search, and read back.
 */
const key = (id: string, member: string) => valueKeyOf({ id, widget: 'list', member });

const VALUES: FilterValues = {
  [key('f-status', 'orders.status')]: {
    kind: 'values',
    values: ['completed', 'a "quoted", value'],
  },
  [key('f-ordered', 'orders.ordered_at')]: { kind: 'preset', preset: 'last 30 days' },
  [key('f-between', 'orders.shipped_at')]: { kind: 'dates', from: '2026-01-01', to: '2026-03-31' },
  [key('f-amount', 'orders.amount')]: { kind: 'range', min: 10 },
};

describe('filter values in the URL', () => {
  it('read back exactly as written', () => {
    const written = valuesToSearch(VALUES);
    // Through the URL as the router writes it: JSON.
    expect(valuesFromSearch(JSON.parse(JSON.stringify(written)))).toEqual(VALUES);
  });

  it('are left out of the URL when none is set', () => {
    expect(valuesToSearch({})).toBeUndefined();
  });

  it('say which filter and which field each value is for', () => {
    expect(
      valuesToSearch({ [key('f-status', 'orders.status')]: { kind: 'preset', preset: 'today' } }),
    ).toEqual([
      { id: 'f-status', member: 'orders.status', value: { kind: 'preset', preset: 'today' } },
    ]);
  });

  /** A URL is typed, pasted and edited by hand: what it says is checked, never trusted. */
  it('drop what is not a value, and keep what is', () => {
    expect(
      valuesFromSearch([
        { id: 'ok', member: 'orders.status', value: { kind: 'values', values: ['a'] } },
        {
          id: 'bad-preset',
          member: 'orders.ordered_at',
          value: { kind: 'preset', preset: 'next century' },
        },
        {
          id: 'bad-dates',
          member: 'orders.ordered_at',
          value: { kind: 'dates', from: 'yesterday', to: '' },
        },
        { id: 'bad-values', member: 'orders.status', value: { kind: 'values', values: [1, 2] } },
        { id: 'bad-range', member: 'orders.amount', value: { kind: 'range', min: '10' } },
        { id: 'no-member', value: { kind: 'values', values: ['a'] } },
        'not an entry',
        null,
      ]),
    ).toEqual({ [key('ok', 'orders.status')]: { kind: 'values', values: ['a'] } });
  });

  it('are none at all when the parameter is not a list', () => {
    expect(valuesFromSearch(undefined)).toEqual({});
    expect(valuesFromSearch('filters')).toEqual({});
    expect(valuesFromSearch({ id: 'x' })).toEqual({});
  });
});
