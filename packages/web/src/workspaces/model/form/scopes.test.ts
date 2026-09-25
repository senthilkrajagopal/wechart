import { describe, expect, it } from 'vitest';

import { canonicalOf, memberIndexOf, optionsFor } from './scopes';

/**
 * T235 / AC-224: THE SYSTEM SHALL edit every field that refers to model
 * members with a picker of the members it may refer to, and a join's target
 * with a list of cubes (direction.md §7b).
 *
 * What each picker lists, from the model's files: the cube's own members by
 * their bare names, another cube's by `cube.member` — as Cube's references
 * are written outside SQL (research/cube/data-modeling.md, Y.18).
 */
const FILES = [
  {
    path: 'cubes/orders.yml',
    content: `cubes:
  - name: orders
    sql_table: public.orders
    dimensions:
      - name: status
        sql: status
        type: string
      - name: ordered_at
        sql: ordered_at
        type: time
    measures:
      - name: count
        type: count
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
    hierarchies:
      - name: by_status
        levels: [status]
    pre_aggregations:
      - name: main
        measures: [count]
`,
  },
  {
    path: 'cubes/customers.yml',
    content: `cubes:
  - name: customers
    sql_table: public.customers
    dimensions:
      - name: city
        sql: city
        type: string
      - name: signed_up_at
        sql: signed_up_at
        type: time
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: by_city
`,
  },
  { path: 'cubes/broken.yml', content: 'cubes: [' },
  { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' },
];

describe('what a member picker lists (AC-224)', () => {
  const index = memberIndexOf(FILES);

  it('reads every cube’s members from the files that parse, and no view as a cube', () => {
    expect([...index.keys()].sort()).toEqual(['customers', 'orders']);
    expect(index.get('orders')).toEqual({
      dimensions: ['status', 'ordered_at'],
      time: ['ordered_at'],
      measures: ['count'],
      segments: ['shipped'],
      hierarchies: ['by_status'],
      preAggregations: ['main'],
    });
  });

  it('names the cube’s own members bare and another cube’s by its cube', () => {
    expect(optionsFor('measures', { index, cube: 'orders' })).toEqual(['count', 'customers.count']);
    expect(optionsFor('dimensions', { index, cube: 'orders' })).toEqual([
      'status',
      'ordered_at',
      'customers.city',
      'customers.signed_up_at',
    ]);
    expect(optionsFor('time', { index, cube: 'orders' })).toEqual([
      'ordered_at',
      'customers.signed_up_at',
    ]);
    expect(optionsFor('members', { index, cube: 'orders' })).toEqual([
      'status',
      'ordered_at',
      'count',
      'customers.city',
      'customers.signed_up_at',
      'customers.count',
    ]);
    // A segment is the cube's own; a rollup join also names other cubes' rollups.
    expect(optionsFor('segments', { index, cube: 'orders' })).toEqual(['shipped']);
    expect(optionsFor('pre-aggregations', { index, cube: 'orders' })).toEqual([
      'main',
      'customers.by_city',
    ]);
  });

  it('gives a cube that extends another that one’s members too, and a rollup no rollup of its own', () => {
    const extended = memberIndexOf([
      ...FILES,
      {
        path: 'cubes/big_orders.yml',
        content: `cubes:
  - name: big_orders
    extends: orders
    measures:
      - name: big_count
        type: count
`,
      },
    ]);
    expect(optionsFor('measures', { index: extended, cube: 'big_orders' }).slice(0, 2)).toEqual([
      'count',
      'big_count',
    ]);
    expect(
      optionsFor('pre-aggregations', { index: extended, cube: 'orders' }, { name: 'main' }),
    ).toEqual(['customers.by_city', 'big_orders.main']);
  });

  it('names a member written CUBE.x, TABLE.x or by its own cube as the member itself', () => {
    const scope = { index, cube: 'orders' };
    expect(
      ['CUBE.count', 'TABLE.count', 'orders.count', 'count'].map((name) =>
        canonicalOf(name, scope),
      ),
    ).toEqual(['count', 'count', 'count', 'count']);
    expect(canonicalOf('customers.count', scope)).toBe('customers.count');
  });

  it('lists a join’s targets as the other cubes', () => {
    expect(optionsFor('cubes', { index, cube: 'orders' })).toEqual(['customers']);
  });

  it('lists a view’s includes from the last cube of its join path', () => {
    const scope = { index, cube: undefined };
    expect(optionsFor('path', scope, { join_path: 'customers' })).toEqual([
      'city',
      'signed_up_at',
      'count',
    ]);
    expect(optionsFor('path', scope, { join_path: 'customers.orders' })).toEqual([
      'status',
      'ordered_at',
      'count',
      'shipped',
      'by_status',
    ]);
    expect(optionsFor('path', scope, { join_path: 'nowhere' })).toEqual([]);
    expect(optionsFor('path', scope, {})).toEqual([]);
  });
});
