import { describe, expect, it } from 'vitest';

import { rollupProblemsOf } from './rollupReferences';

/**
 * T207 / AC-189: IF a model change being published leaves a pre-aggregation
 * naming a measure, dimension, segment, time dimension or index column that
 * the model does not have, THEN THE SYSTEM SHALL refuse to publish the change
 * and show each unknown name on that pre-aggregation's row.
 *
 * The forms below are the ones Cube resolved, and the unknown names the ones
 * it failed queries on, against a throwaway Cube v1.7.42
 * (research/cube/pre-aggregations.md, "Observed locally", 2026-09-22).
 */
const CUSTOMERS = {
  path: 'cubes/customers.yml',
  content: `cubes:
  - name: customers
    sql_table: public.customers
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: country
        sql: country
        type: string
    measures:
      - name: count
        type: count
`,
};

/** `orders`, with the rollups given under `pre_aggregations`. */
const orders = (rollups: string) => ({
  path: 'cubes/orders.yml',
  content: `cubes:
  - name: orders
    sql_table: public.orders
    joins:
      - name: customers
        sql: '{CUBE}.customer_id = {customers}.id'
        relationship: many_to_one
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: status
        sql: status
        type: string
      - name: secret_status
        sql: status
        type: string
        public: false
      - name: ordered_at
        sql: ordered_at
        type: time
    measures:
      - name: count
        type: count
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
    pre_aggregations:
${rollups}`,
});

describe('a rollup’s members, checked against the model', () => {
  it('passes every form Cube resolves', () => {
    const file = orders(`      - name: bare
        measures: [count]
        dimensions: [status]
      - name: cube
        measures: [CUBE.count]
        dimensions: [CUBE.status]
        segments: [CUBE.shipped]
        time_dimension: CUBE.ordered_at
        granularity: month
        indexes:
          - name: by_status
            columns: [CUBE.status, CUBE.ordered_at.month]
      - name: own_name
        measures: [orders.count]
        dimensions: [orders.status]
      - name: other_cube
        measures: [CUBE.count]
        dimensions: [customers.country]
      - name: join_path
        measures: [CUBE.count]
        dimensions: [CUBE.customers.country, orders.customers.country]
      - name: hidden
        measures: [CUBE.count]
        dimensions: [CUBE.secret_status, CUBE.id]
      - name: one_on_its_own
        measures: CUBE.count
        timeDimension: CUBE.ordered_at
        granularity: day
      - name: several_time_dimensions
        measures: [CUBE.count]
        time_dimensions:
          - dimension: CUBE.ordered_at
            granularity: day
      - name: table
        measures: [TABLE.count]
        dimensions: [TABLE.status]
`);
    // A cube extending another, its rollup naming what it inherits.
    const child = {
      path: 'cubes/big_orders.yml',
      content: `cubes:
  - name: big_orders
    extends: orders
    pre_aggregations:
      - name: inherited
        measures: [CUBE.count]
        dimensions: [CUBE.status]
        time_dimension: CUBE.ordered_at
        granularity: day
`,
    };
    expect(rollupProblemsOf([CUSTOMERS, file, child])).toEqual([]);
  });

  it('reads members a YAML merge key defines, as Cube does', () => {
    const merged = {
      path: 'cubes/merged.yml',
      content: `cubes:
  - &base
    name: base
    sql_table: public.orders
    dimensions:
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
  - <<: *base
    name: merged
    pre_aggregations:
      - <<: {measures: [CUBE.count, CUBE.nope_measure]}
        name: by_merged
        dimensions: [CUBE.status]
`,
    };
    // `merged` has `status` and `count` only by the merge, and its rollup
    // names `nope_measure` only by one.
    expect(rollupProblemsOf([merged])).toEqual([
      {
        path: 'cubes/merged.yml',
        cube: 'merged',
        preAggregation: 'by_merged',
        line: 15,
        unknown: [{ list: 'measures', name: 'CUBE.nope_measure' }],
      },
    ]);
  });

  it('names each unknown member on its rollup, with the list it is in', () => {
    const file = orders(`      - name: fine
        measures: [CUBE.count]
      - name: broken
        measures: [CUBE.count, CUBE.status]
        dimensions: [nope, CUBE.nope, customers.nope, nocube.status, CUBE.customers.nope, CUBE.ordered_at.day]
        segments: [CUBE.nope_seg]
        time_dimension: CUBE.nope_at
        granularity: month
        indexes:
          - name: bad
            columns: [CUBE.nope_col]
      - name: not_time
        measures: [CUBE.count]
        time_dimension: CUBE.status
        granularity: day
`);
    expect(rollupProblemsOf([CUSTOMERS, file])).toEqual([
      {
        path: 'cubes/orders.yml',
        cube: 'orders',
        preAggregation: 'broken',
        // Where its `- name: broken` is.
        line: 32,
        unknown: [
          // A dimension listed as a measure is not a measure of the model.
          { list: 'measures', name: 'CUBE.status' },
          { list: 'dimensions', name: 'nope' },
          { list: 'dimensions', name: 'CUBE.nope' },
          { list: 'dimensions', name: 'customers.nope' },
          { list: 'dimensions', name: 'nocube.status' },
          { list: 'dimensions', name: 'CUBE.customers.nope' },
          // A granularity is written only on an index column.
          { list: 'dimensions', name: 'CUBE.ordered_at.day' },
          { list: 'segments', name: 'CUBE.nope_seg' },
          { list: 'time_dimension', name: 'CUBE.nope_at' },
          { list: 'index bad', name: 'CUBE.nope_col' },
        ],
      },
      {
        path: 'cubes/orders.yml',
        cube: 'orders',
        preAggregation: 'not_time',
        line: 41,
        // A dimension, but not a time one.
        unknown: [{ list: 'time_dimension', name: 'CUBE.status' }],
      },
    ]);
  });

  it('cannot tell about a cube extending one it cannot read, and says nothing of what it inherits', () => {
    const child = {
      path: 'cubes/big_orders.yml',
      content: `cubes:
  - name: big_orders
    extends: coded_orders
    measures:
      - name: big_count
        type: count
    pre_aggregations:
      - name: inherited
        measures: [CUBE.count, CUBE.big_count]
`,
    };
    // The cube it extends is defined in JavaScript, which wechart does not run.
    const code = { path: 'cubes/coded_orders.js', content: 'cube(`coded_orders`, {});\n' };
    expect(rollupProblemsOf([CUSTOMERS, code, child])).toEqual([]);
  });

  it('cannot tell about a cube the YAML does not define, and says nothing of it', () => {
    const file = orders(`      - name: into_code
        measures: [CUBE.count]
        dimensions: [coded.region, CUBE.nope]
`);
    // A cube defined in JavaScript: wechart does not run code to read it.
    const code = { path: 'cubes/coded.js', content: 'cube(`coded`, { sql_table: `t` });\n' };
    expect(rollupProblemsOf([CUSTOMERS, code, file])).toEqual([
      {
        path: 'cubes/orders.yml',
        cube: 'orders',
        preAggregation: 'into_code',
        line: 30,
        unknown: [{ list: 'dimensions', name: 'CUBE.nope' }],
      },
    ]);
  });
});
