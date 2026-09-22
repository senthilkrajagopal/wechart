import { describe, expect, it } from 'vitest';

import { joinGraphOf } from './joinGraph';

/**
 * T144 / AC-138: WHEN the user opens the join editor for a cube, THE SYSTEM
 * SHALL show the join graph with each relationship's direction and let the
 * user add a join by choosing the target cube, the relationship and the
 * condition.
 * Fails when: the diagram omits a declared join, or shows a direction the
 * model does not declare.
 *
 * A join is declared on the cube it starts from and names the cube it goes
 * to (research Y.5): the edge runs from the declaring cube to the target.
 */
const ORDERS = {
  path: 'cubes/orders.yml',
  content: `cubes:
  - name: orders
    joins:
      - name: customers
        relationship: many_to_one
        sql: '{CUBE}.customer_id = {customers}.id'
      - name: products
        relationship: belongs_to
        sql: '{CUBE}.product_id = {products}.id'
    dimensions:
      - name: id
        sql: id
        type: number
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
`,
};
const CUSTOMERS = {
  path: 'cubes/customers.yml',
  content: 'cubes:\n  - name: customers\n    measures:\n      - name: count\n        type: count\n',
};
const PRODUCTS = { path: 'cubes/products.yml', content: 'cubes:\n  - name: products\n' };

describe('the join graph', () => {
  it('has each cube once, with where it is and what it holds', () => {
    const graph = joinGraphOf([ORDERS, CUSTOMERS, PRODUCTS]);

    expect(graph.cubes).toEqual([
      { name: 'orders', path: 'cubes/orders.yml', dimensions: 2, measures: 1 },
      { name: 'customers', path: 'cubes/customers.yml', dimensions: 0, measures: 1 },
      { name: 'products', path: 'cubes/products.yml', dimensions: 0, measures: 0 },
    ]);
  });

  it('has every declared join, from the cube declaring it to the one it names', () => {
    const graph = joinGraphOf([ORDERS, CUSTOMERS, PRODUCTS]);

    expect(graph.joins).toEqual([
      { from: 'orders', to: 'customers', relationship: 'many_to_one' },
      { from: 'orders', to: 'products', relationship: 'belongs_to' },
    ]);
  });

  it('keeps a join to a cube no file defines, so none is left out', () => {
    const graph = joinGraphOf([ORDERS]);

    expect(graph.joins.map((join) => join.to)).toEqual(['customers', 'products']);
    expect(graph.missing).toEqual(['customers', 'products']);
  });

  it('reads no cube from a file that isn’t plain YAML', () => {
    const graph = joinGraphOf([
      {
        path: 'cubes/generated.yml',
        content: 'cubes:\n{% for n in ["a"] %}\n  - name: {{ n }}\n{% endfor %}\n',
      },
      { path: 'cubes/broken.yml', content: 'cubes: [\n' },
    ]);

    expect(graph).toEqual({ cubes: [], joins: [], missing: [] });
  });
});
