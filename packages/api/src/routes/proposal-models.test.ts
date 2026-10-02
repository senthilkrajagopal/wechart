import { describe, expect, it } from 'vitest';

import { namesUsedIn } from './proposal-models';

/**
 * T350 (AC-285): the names a workspace model may resolve to another item,
 * read from its YAML, so the workspace models it names go in its proposal
 * too (research `xcube-slice-3a.md`'s resolution table: joins, `extends`,
 * join paths, `{…}` references, member paths).
 */
describe('the names a model file uses (T350)', () => {
  it('reads its joins, what it extends and its references', () => {
    const names = namesUsedIn(
      [
        'cubes:',
        '  - name: orders',
        '    extends: base_orders',
        '    sql_table: public.orders',
        '    joins:',
        '      - name: customers',
        '        sql: "{CUBE}.customer_id = {customers}.id"',
        '        relationship: many_to_one',
        '    measures:',
        '      - name: margin',
        '        sql: "{line_items.amount} - {costs.total}"',
        '        type: sum',
        '    pre_aggregations:',
        '      - name: by_region',
        '        measures:',
        '          - regions.count',
        '',
      ].join('\n'),
    );
    for (const name of ['base_orders', 'customers', 'line_items', 'costs', 'regions'])
      expect(names.has(name)).toBe(true);
    // Its own members' names aren't names of items.
    expect(names.has('margin')).toBe(false);
    expect(names.has('by_region')).toBe(false);
  });

  it('reads each step of a view’s join paths', () => {
    const names = namesUsedIn(
      [
        'views:',
        '  - name: summary',
        '    cubes:',
        '      - join_path: orders.customers',
        '        includes: "*"',
        '      - join_path: payments',
        '        includes:',
        '          - amount',
        '',
      ].join('\n'),
    );
    expect(
      [...names].filter((name) => ['orders', 'customers', 'payments'].includes(name)).sort(),
    ).toEqual(['customers', 'orders', 'payments']);
    expect(names.has('summary')).toBe(false);
  });

  it('reads nothing from a file that doesn’t parse', () => {
    expect([...namesUsedIn('cubes: [unclosed')]).toEqual([]);
  });
});
