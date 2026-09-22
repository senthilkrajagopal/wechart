import { describe, expect, it } from 'vitest';

import { editedMembersOf } from './editedMembers';

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list.
 *
 * The members a save edits: each one it changes or takes away, by the name
 * charts use (`orders.count`) — a cube's or view's own, and what a view
 * includes. One only added is used by nothing yet.
 */
const BEFORE = `cubes:
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
views:
  - name: summary
    cubes:
      - join_path: orders
        includes:
          - count
          - name: status
            alias: order_status
`;

describe('the members a save edits', () => {
  it('are none when nothing changes', () => {
    expect(editedMembersOf(BEFORE, BEFORE)).toEqual([]);
  });

  it('are those changed and those taken away, not those added', () => {
    const after = BEFORE.replace('        sql: amount\n', '        sql: amount * 2\n')
      .replace('      - name: shipped\n        sql: "{CUBE}.status = \'shipped\'"\n', '')
      .replace(
        '    dimensions:\n',
        '    dimensions:\n      - name: region\n        sql: region\n        type: string\n',
      );

    expect(editedMembersOf(BEFORE, after)).toEqual(['orders.total', 'orders.shipped']);
  });

  it('are every member of a cube renamed or removed', () => {
    const after = BEFORE.replace('  - name: orders\n', '  - name: sales\n');

    expect(editedMembersOf(BEFORE, after)).toEqual([
      'orders.count',
      'orders.total',
      'orders.status',
      'orders.shipped',
    ]);
  });

  it('are a view’s members by the names charts use, its includes too', () => {
    const after = BEFORE.replace('            alias: order_status\n', '            alias: state\n');

    expect(editedMembersOf(BEFORE, after)).toEqual(['summary.order_status']);
  });

  it('are none from a text that doesn’t parse: nothing is saved from it', () => {
    expect(editedMembersOf(BEFORE, 'cubes: [\n')).toEqual([]);
  });
});
