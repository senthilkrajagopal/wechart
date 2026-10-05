import { describe, expect, it } from 'vitest';

import { addedMeasures, joinPathCubesOf } from './added-measures';

/**
 * T385 / AC-052: WHEN a requested measure is added to the model and its
 * proposal is approved into the folder, THE SYSTEM SHALL mark the request as
 * resolved and name the member that resolves it.
 *
 * What a landed model file adds: each cube's measures it has and the file it
 * replaced didn't, by cube.
 */
const BEFORE = `cubes:
  - name: orders
    sql_table: public.orders
    measures:
      - name: count
        type: count
`;

describe('the measures a landed model adds (T385, AC-052)', () => {
  it('names each measure new to its cube', () => {
    const after = `${BEFORE}      - name: margin
        sql: amount - cost
        type: sum
      - name: margin_share
        sql: "{margin} / {count}"
        type: number
`;

    expect(addedMeasures(BEFORE, after)).toEqual(new Map([['orders', ['margin', 'margin_share']]]));
  });

  it('names every measure of a cube the file adds, and none of one it leaves as it was', () => {
    expect(addedMeasures(null, BEFORE)).toEqual(new Map([['orders', ['count']]]));
    expect(addedMeasures(BEFORE, BEFORE)).toEqual(new Map());
  });

  it('names nothing for a file that doesn’t read as YAML, or a view', () => {
    expect(addedMeasures(BEFORE, 'cubes: [')).toEqual(new Map());
    expect(
      addedMeasures(null, 'views:\n  - name: summary\n    cubes:\n      - join_path: orders\n'),
    ).toEqual(new Map());
  });
});

/**
 * T590 / AC-052 (amended 2026-10-04, R64): a request on a view is resolved by
 * a measure added to any cube on the view's join paths. Every segment of a
 * view's `cubes[].join_path` names a cube (`cube/data-modeling.md`, Y.10a;
 * `xcube-slice-3a.md`, the resolution table).
 */
describe('the cubes on a view’s join paths (T590, AC-052)', () => {
  it('names every cube each of a view’s join paths passes through, once each, in order', () => {
    const view = `views:
  - name: summary
    cubes:
      - join_path: orders
        includes: "*"
      - join_path: orders.customers
        includes:
          - name
      - join_path: orders.line_items.products
        prefix: true
        includes: "*"
`;

    expect(joinPathCubesOf(view)).toEqual(
      new Map([['summary', ['orders', 'customers', 'line_items', 'products']]]),
    );
  });

  it('names none for a cube’s file, or one that doesn’t read as YAML', () => {
    expect(joinPathCubesOf(BEFORE)).toEqual(new Map());
    expect(joinPathCubesOf('views: [')).toEqual(new Map());
  });
});
