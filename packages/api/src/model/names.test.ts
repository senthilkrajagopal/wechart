import { describe, expect, it } from 'vitest';

import { heldIn, landedNamesOf, namesDeclaredIn } from './names';

/**
 * T704 (AC-421): one namespace for cubes and views, another for data
 * sources, each name once across every landed item, compared in any case; a
 * view's `split: true` cubes, `<view>_<cube alias>`, count as names too
 * (research `xcube-256d632371.md`, "Two namespaces, compared in any case").
 */
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const splitView = [
  'views:',
  '  - name: overview',
  '    cubes:',
  '      - join_path: orders',
  '        includes: "*"',
  '        split: true',
  '      - join_path: orders.customers',
  '        alias: buyers',
  '        includes: "*"',
  '        split: true',
  '      - join_path: products',
  '        includes: "*"',
  '',
].join('\n');

describe('the names a model file declares (T704, AC-421)', () => {
  it('are its cube’s or view’s, and each split view’s `<view>_<cube alias>`', () => {
    expect(namesDeclaredIn(cube('Orders'))).toEqual(['Orders']);
    expect(namesDeclaredIn(splitView)).toEqual(['overview', 'overview_orders', 'overview_buyers']);
    expect(namesDeclaredIn('cubes: [\n')).toEqual([]);
  });
});

describe('the landed names (T704, AC-421, AC-422)', () => {
  it('are the shared model files’ names and the data sources’, but those a change replaces', () => {
    const files = [
      { id: 'f1', content: cube('orders') },
      { id: 'f2', content: splitView },
    ];
    const dataSources = [
      { id: 'd1', name: 'warehouse' },
      { id: 'd2', name: 'lake' },
    ];
    expect(landedNamesOf({ files, dataSources })).toEqual({
      items: ['orders', 'overview', 'overview_orders', 'overview_buyers'],
      dataSources: ['warehouse', 'lake'],
    });
    // An edit copy of f1, and a change of d2, keep the names they replace.
    expect(
      landedNamesOf({
        files,
        dataSources,
        except: { files: new Set(['f1']), dataSources: new Set(['d2']) },
      }),
    ).toEqual({
      items: ['overview', 'overview_orders', 'overview_buyers'],
      dataSources: ['warehouse'],
    });
  });
});

describe('a name already landed, in its namespace (T704, AC-421)', () => {
  const landed = {
    items: ['orders', 'overview', 'overview_orders'],
    dataSources: ['warehouse'],
  };

  it('is held in any case, and a split view’s name too', () => {
    expect(heldIn(landed, { items: ['Orders'], dataSources: [] })).toEqual(['Orders']);
    expect(heldIn(landed, { items: ['OVERVIEW_orders'], dataSources: [] })).toEqual([
      'OVERVIEW_orders',
    ]);
    expect(heldIn(landed, { items: ['lines'], dataSources: ['Warehouse'] })).toEqual(['Warehouse']);
  });

  it('keeps cubes and views apart from data sources: one of each may share a name', () => {
    expect(heldIn(landed, { items: ['warehouse'], dataSources: ['orders'] })).toEqual([]);
  });

  it('names each held name once, in the order asked', () => {
    expect(heldIn(landed, { items: ['orders', 'ORDERS', 'lines'], dataSources: [] })).toEqual([
      'orders',
    ]);
  });
});
