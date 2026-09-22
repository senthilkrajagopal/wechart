import { describe, expect, it } from 'vitest';

import { lossOf } from './lossCheck';
import { withObject } from './sync';

/**
 * T140 / AC-134: IF switching from code to form would lose information, such
 * as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be
 * lost before applying the change (direction.md rule 20).
 * Fails when: comments disappear from a file with no warning.
 *
 * A form edit is written into the file in place (T139), which keeps every
 * comment and anchor it does not touch; what one edit would still take with
 * it is found by comparing the file before and after it.
 */
const FILE = `# The sample warehouse's orders.
cubes:
  - name: orders
    sql_table: public.orders
    # Kept for the finance team.
    title: Orders
    measures:
      - name: count
        type: count
    dimensions: &shared
      - name: status
        sql: status  # as the source writes it
        type: string
  - name: returns
    sql_table: public.returns
    dimensions: *shared
`;

/** The cubes' places in FILE. */
const ORDERS = 0;
const RETURNS = 1;

describe('what a form edit would lose', () => {
  it('is nothing for an edit that keeps every comment, anchor and alias', () => {
    const after = withObject(FILE, 'cubes', ORDERS, {
      name: 'orders',
      sql_table: 'public.orders_2026',
      title: 'Orders',
      measures: [{ name: 'count', type: 'count' }],
      dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
    });

    expect(lossOf(FILE, after)).toEqual([]);
  });

  it('names the comment on a key the edit removes', () => {
    const after = withObject(FILE, 'cubes', ORDERS, {
      name: 'orders',
      sql_table: 'public.orders',
      measures: [{ name: 'count', type: 'count' }],
      dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
    });

    expect(lossOf(FILE, after)).toEqual([{ kind: 'comment', text: 'Kept for the finance team.' }]);
  });

  it('names the alias an edit through it writes over', () => {
    const after = withObject(FILE, 'cubes', RETURNS, {
      name: 'returns',
      sql_table: 'public.returns',
      dimensions: [{ name: 'status', sql: 'status', type: 'string', title: 'Status' }],
    });

    expect(lossOf(FILE, after)).toEqual([{ kind: 'alias', text: 'shared' }]);
  });

  it('names a comment written after an alias, which goes with it', () => {
    // `yaml` puts a comment after an alias on the alias node.
    const commented = FILE.replace('dimensions: *shared', 'dimensions: *shared # the same list');
    const after = withObject(commented, 'cubes', RETURNS, {
      name: 'returns',
      sql_table: 'public.returns',
      dimensions: [{ name: 'status', sql: 'status', type: 'string', title: 'Status' }],
    });

    expect(lossOf(commented, after)).toEqual([
      { kind: 'alias', text: 'shared' },
      { kind: 'comment', text: 'the same list' },
    ]);
  });

  it('names an anchor on a key the edit removes', () => {
    const anchored = FILE.replace('    title: Orders\n', '    title: &t Orders\n');
    const after = withObject(anchored, 'cubes', ORDERS, {
      name: 'orders',
      sql_table: 'public.orders',
      measures: [{ name: 'count', type: 'count' }],
      dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
    });

    expect(lossOf(anchored, after)).toEqual([
      { kind: 'comment', text: 'Kept for the finance team.' },
      { kind: 'anchor', text: 't' },
    ]);
  });

  it('names a comment whose lines are all still there as kept, however they are grouped', () => {
    // A block written back split in two, or two merged, loses no line: nothing to name.
    expect(lossOf('a: 1\n# one\n# two\nb: 2\n', 'a: 1 # one\n# two\nb: 2\n')).toEqual([]);
  });

  it('is nothing for a member added to an anchored list: the list keeps its comments and anchor', () => {
    const after = withObject(FILE, 'cubes', ORDERS, {
      name: 'orders',
      sql_table: 'public.orders',
      title: 'Orders',
      measures: [{ name: 'count', type: 'count' }],
      dimensions: [
        { name: 'status', sql: 'status', type: 'string' },
        { name: 'region', sql: 'region', type: 'string' },
      ],
    });

    expect(lossOf(FILE, after)).toEqual([]);
  });

  it('names each comment inside a member the edit removes', () => {
    const two = FILE.replace(
      '      - name: count\n        type: count\n',
      '      - name: count\n        type: count  # once per line\n      - name: total\n        type: sum\n',
    );
    const after = withObject(two, 'cubes', ORDERS, {
      name: 'orders',
      sql_table: 'public.orders',
      title: 'Orders',
      measures: [{ name: 'total', type: 'sum' }],
      dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
    });

    expect(lossOf(two, after)).toEqual([{ kind: 'comment', text: 'once per line' }]);
  });

  it('names nothing twice that the file has twice and keeps once', () => {
    const twice = 'a: 1 # same\nb: 2 # same\n';

    expect(lossOf(twice, 'a: 1 # same\nb: 2\n')).toEqual([{ kind: 'comment', text: 'same' }]);
  });
});
