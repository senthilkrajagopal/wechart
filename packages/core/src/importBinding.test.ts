import { describe, expect, it } from 'vitest';

import { rebound, sourcesNamedIn } from './importBinding';

/**
 * T721 (AC-358; from T671's WIP): an import binds its models to the data
 * source chosen for each of the file's. A cube names its data source by
 * `data_source` or `dataSource`; one naming none, and extending no other,
 * binds to `default` (research `xcube-slice-6.md`); one extending another
 * takes its parent's. Mapped to another name, the cubes naming it are given
 * that name; nothing else in the file changes. Names compare in any case
 * (R71).
 */
const orders = [
  '# Orders, from the replica.',
  'cubes:',
  '  - name: orders',
  '    sql_table: public.orders',
  '    data_source: warehouse',
  '    measures:',
  '      - name: count',
  '        type: count',
  '  - name: lines',
  '    sql_table: public.lines',
  '    dataSource: Warehouse',
  '  - name: products',
  '    sql_table: public.products',
  '  - name: big_orders',
  '    extends: orders',
  '  - name: sales_orders',
  '    sql_table: public.orders',
  '    data_source: sales_dw',
  'views:',
  '  - name: overview',
  '    cubes:',
  '      - join_path: orders',
  '        includes: "*"',
  '',
].join('\n');

describe('the data sources a model’s cubes name (T721)', () => {
  it('reads data_source and dataSource, default for a cube naming none, and nothing for one extending another', () => {
    expect(sourcesNamedIn(orders)).toEqual([
      { cube: 'orders', source: 'warehouse' },
      { cube: 'lines', source: 'Warehouse' },
      { cube: 'products', source: 'default' },
      { cube: 'sales_orders', source: 'sales_dw' },
    ]);
    expect(sourcesNamedIn('not: [yaml')).toEqual([]);
  });
});

describe('a model rebound to the data sources chosen (T721, AC-358)', () => {
  it('gives each cube naming the file’s one, in any case, the name of the one it was mapped to, in the key it uses, and changes nothing else', () => {
    const after = rebound(orders, new Map([['warehouse', 'dw_main']]));
    expect(sourcesNamedIn(after)).toEqual([
      { cube: 'orders', source: 'dw_main' },
      { cube: 'lines', source: 'dw_main' },
      { cube: 'products', source: 'default' },
      { cube: 'sales_orders', source: 'sales_dw' },
    ]);
    expect(after).toContain('    data_source: dw_main\n');
    expect(after).toContain('    dataSource: dw_main\n');
    // Its comment, its measures, the cube extending another and the view, as they were.
    expect(after.split('\n').filter((line) => !line.includes('dw_main'))).toEqual(
      orders.split('\n').filter((line) => !/warehouse/i.test(line)),
    );
  });

  it('names the one chosen for default on a cube that named none, and not on one extending another', () => {
    const after = rebound(orders, new Map([['default', 'dw_main']]));
    expect(sourcesNamedIn(after).filter((each) => each.source === 'dw_main')).toEqual([
      { cube: 'products', source: 'dw_main' },
    ]);
    expect(after).not.toMatch(/big_orders\n\s+extends: orders\n\s+data_source/);
  });

  // The research says names are unique in any case, not that a cube binds in any case: so the stored spelling.
  it('gives a cube naming it in another case the one’s own spelling', () => {
    const after = rebound(orders, new Map([['warehouse', 'warehouse']]));
    expect(sourcesNamedIn(after).slice(0, 2)).toEqual([
      { cube: 'orders', source: 'warehouse' },
      { cube: 'lines', source: 'warehouse' },
    ]);
  });

  it('leaves a file as it is where every name chosen is the one it names, a new one created under its own', () => {
    expect(rebound(orders, new Map([['sales_dw', 'sales_dw']]))).toBe(orders);
    expect(rebound(orders, new Map())).toBe(orders);
    expect(rebound('not: [yaml', new Map([['default', 'dw_main']]))).toBe('not: [yaml');
  });
});
