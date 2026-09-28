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
      // Its joins' targets, for a view's join paths (T493): none here.
      joins: [],
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

  /**
   * T493 (AC-351): a view's join path is picked — each cube, and each path
   * from it that follows its directed joins, a cube once per path (Y.10a).
   */
  it('lists a view’s join paths: each cube, then the paths along its joins', () => {
    const joined = memberIndexOf([
      {
        path: 'cubes/a.yml',
        content:
          'cubes:\n  - name: a\n    joins:\n      - name: b\n        sql: x\n        relationship: many_to_one\n      - name: gone\n        sql: x\n        relationship: many_to_one\n',
      },
      {
        path: 'cubes/b.yml',
        content:
          'cubes:\n  - name: b\n    joins:\n      - name: c\n        sql: x\n        relationship: many_to_one\n      - name: a\n        sql: x\n        relationship: one_to_many\n',
      },
      { path: 'cubes/c.yml', content: 'cubes:\n  - name: c\n' },
    ]);
    // Directed: c joins nothing; a join to a cube the model lacks goes nowhere; no cycle.
    expect(optionsFor('join-paths', { index: joined, cube: undefined })).toEqual([
      'a',
      'a.b',
      'a.b.c',
      'b',
      'b.c',
      'b.a',
      'c',
    ]);
  });

  /** A cube joining the next, `c0` to `c5`, and a cube extending `c0`. */
  const chain = memberIndexOf([
    ...Array.from({ length: 6 }, (_, at) => ({
      path: `cubes/c${String(at)}.yml`,
      content: `cubes:\n  - name: c${String(at)}\n${
        at < 5
          ? `    joins:\n      - name: c${String(at + 1)}\n        sql: x\n        relationship: many_to_one\n`
          : ''
      }`,
    })),
    { path: 'cubes/x.yml', content: 'cubes:\n  - name: x\n    extends: c0\n' },
  ]);

  it('follows joins at any length, and the joins a cube inherits', () => {
    const paths = optionsFor('join-paths', { index: chain, cube: undefined });
    expect(paths).toContain('c0.c1.c2.c3.c4.c5');
    expect(paths).toContain('x.c1.c2.c3.c4.c5');
    expect(paths.filter((path) => path.startsWith('c0'))).toHaveLength(6);
  });

  it('lists each cube’s shortest path to every cube it reaches when the joins are dense', () => {
    // Twelve cubes, each joined to every other: far too many paths to list.
    const names = Array.from({ length: 12 }, (_, at) => `d${String(at)}`);
    const dense = memberIndexOf(
      names.map((name) => ({
        path: `cubes/${name}.yml`,
        content: `cubes:\n  - name: ${name}\n    joins:\n${names
          .filter((other) => other !== name)
          .map(
            (other) =>
              `      - name: ${other}\n        sql: x\n        relationship: many_to_one\n`,
          )
          .join('')}`,
      })),
    );
    const paths = optionsFor('join-paths', { index: dense, cube: undefined });
    expect(paths).toHaveLength(12 * 12);
    expect(paths.slice(0, 3)).toEqual(['d0', 'd0.d1', 'd0.d2']);
    expect(paths).toContain('d11.d0');
  });
});
