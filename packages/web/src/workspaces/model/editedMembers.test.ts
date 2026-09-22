import { describe, expect, it } from 'vitest';

import { editedMembersOf } from './editedMembers';

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list.
 *
 * The members a save edits, across the whole model: each one it changes or
 * takes away, by every name charts use for it — the cube's own, a view's
 * that exposes it (by alias, with a prefix, through `"*"`), a cube's that
 * extends it. One only added is used by nothing yet.
 */
const ORDERS = `cubes:
  - name: orders
    measures:
      - name: count
        type: count
      - name: total
        sql: amount
        type: sum
    dimensions:
      - name: status
        sql: status
        type: string
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
`;
const SUMMARY = `views:
  - name: summary
    cubes:
      - join_path: orders
        includes:
          - count
          - name: status
            alias: order_status
`;

const model = (orders: string, ...others: { path: string; content: string }[]) => [
  { path: 'cubes/orders.yml', content: orders },
  ...others,
];

describe('the members a save edits', () => {
  it('are none when nothing changes', () => {
    expect(editedMembersOf(model(ORDERS), model(ORDERS))).toEqual([]);
  });

  it('are those changed and those taken away, not those added', () => {
    const after = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n')
      .replace('      - name: shipped\n        sql: "{CUBE}.status = \'shipped\'"\n', '')
      .replace(
        '    dimensions:\n',
        '    dimensions:\n      - name: region\n        sql: region\n        type: string\n',
      );

    expect(editedMembersOf(model(ORDERS), model(after))).toEqual([
      'orders.total',
      'orders.shipped',
    ]);
  });

  it('are every member of a cube renamed', () => {
    const after = ORDERS.replace('  - name: orders\n', '  - name: sales\n');

    expect(editedMembersOf(model(ORDERS), model(after))).toEqual([
      'orders.count',
      'orders.total',
      'orders.status',
      'orders.shipped',
    ]);
  });

  it('are a view’s too, in another file, where it exposes a member edited', () => {
    const view = { path: 'views/summary.yml', content: SUMMARY };
    const after = ORDERS.replace(
      '      - name: count\n        type: count\n',
      '      - name: count\n        type: count_distinct\n        sql: id\n',
    );

    expect(editedMembersOf(model(ORDERS, view), model(after, view))).toEqual([
      'orders.count',
      'summary.count',
    ]);
  });

  it('are a view’s by the names it gives them: an alias, a prefix, everything through "*"', () => {
    const view = {
      path: 'views/all.yml',
      content: `views:
  - name: everything
    cubes:
      - join_path: orders
        prefix: true
        includes: "*"
        excludes:
          - shipped
`,
    };
    const after = ORDERS.replace('        type: string\n', '        type: number\n');

    expect(editedMembersOf(model(ORDERS, view), model(after, view))).toEqual([
      'orders.status',
      'everything.orders_status',
    ]);
  });

  it('are all a view’s members whose names a change of prefix changes', () => {
    const before = { path: 'views/summary.yml', content: SUMMARY };
    const after = {
      path: 'views/summary.yml',
      content: SUMMARY.replace(
        '      - join_path: orders\n',
        '      - join_path: orders\n        prefix: true\n',
      ),
    };

    expect(editedMembersOf(model(ORDERS, before), model(ORDERS, after))).toEqual(['summary.count']);
  });

  it('are an extending cube’s, where it takes the member edited as it is', () => {
    const child = {
      path: 'cubes/big_orders.yml',
      content:
        'cubes:\n  - name: big_orders\n    extends: orders\n    measures:\n      - name: total\n        sql: amount * 10\n        type: sum\n',
    };
    const after = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n').replace(
      '        type: count\n',
      '        type: count\n        title: Lines\n',
    );

    // big_orders.total is its own, so changing orders.total leaves it be.
    expect(editedMembersOf(model(ORDERS, child), model(after, child))).toEqual([
      'orders.count',
      'orders.total',
      'big_orders.count',
    ]);
  });

  it('are none from a file that doesn’t parse: nothing is saved from it', () => {
    expect(editedMembersOf(model(ORDERS), model('cubes: [\n'))).toEqual([]);
  });
});
