import { describe, expect, it } from 'vitest';

import { itemsHashOf, itemsOf } from './items';

/**
 * T449 / AC-333: wechart's published model as xcube's items (research
 * `xcube-slice-3a.md`, "The items hash" and "PUT …/snapshot with items";
 * `xcube-slice-3b.md`, the golden vector). Each file is one item (AC-337):
 * a root item until folders hold models, named for what it declares, its
 * YAML exactly as stored.
 */
describe('the items hash', () => {
  it('is xcube’s golden vector, in either order (xcube-slice-3b.md, "The golden items-hash vector")', () => {
    const items = [
      { folderId: 'froot', name: 'customers', kind: 'cube', yaml: 'cubes:\n  - name: customers\n' },
      { folderId: 'fsales', name: 'orders', kind: 'cube', yaml: 'cubes:\n  - name: orders\n' },
    ] as const;

    expect(itemsHashOf(items)).toBe(
      '49ef16c81790839fe68a0306e4942506ba81c09e060c18c32341864ff0ffeee4',
    );
    expect(itemsHashOf([...items].reverse())).toBe(
      '49ef16c81790839fe68a0306e4942506ba81c09e060c18c32341864ff0ffeee4',
    );
  });
});

describe('the published files as items', () => {
  const orders = {
    path: 'cubes/orders.yml',
    content: 'cubes:\n  - name: orders\n    sql_table: public.orders\n',
  };
  const summary = { path: 'views/order_summary.yml', content: 'views:\n  - name: order_summary\n' };

  it('makes each file one root item, named for what it declares, its YAML as stored', () => {
    expect(itemsOf([orders, summary])).toEqual([
      { folderId: 'froot', name: 'orders', kind: 'cube', yaml: orders.content },
      { folderId: 'froot', name: 'order_summary', kind: 'view', yaml: summary.content },
    ]);
  });

  it('leaves out what is never sent: a Jinja template, a file that isn’t YAML, and one declaring nothing', () => {
    const template = { path: 'cubes/t.yml', content: 'cubes:\n  - name: t\n    sql: "{{ x }}"\n' };
    const script = { path: 'cubes/a.js', content: 'cube(`a`, {})' };
    const empty = { path: 'cubes/empty.yml', content: 'cubes: []\n' };

    expect(itemsOf([orders, template, script, empty]).map((item) => item.name)).toEqual(['orders']);
  });

  // T452, AC-328: a folder's files are its items, under the xcube id stored
  // with the folder; the root's are `froot`'s.
  it('makes a folder’s file that folder’s item, and leaves out one in a folder xcube’s tree doesn’t hold', () => {
    const ids = new Map([
      ['root', 'froot'],
      ['sales-folder', 'fsales'],
    ]);
    const inSales = { ...orders, folderId: 'sales-folder' };
    // My workspace's, say, which xcube's tree leaves out until slice 5.
    const inWorkspace = { ...orders, path: 'cubes/mine.yml', folderId: 'mine' };

    expect(itemsOf([inSales, summary, inWorkspace], ids)).toEqual([
      { folderId: 'fsales', name: 'orders', kind: 'cube', yaml: orders.content },
      { folderId: 'froot', name: 'order_summary', kind: 'view', yaml: summary.content },
    ]);
    // With no folders given, the root's alone.
    expect(itemsOf([inSales, summary]).map((item) => item.name)).toEqual(['order_summary']);
  });
});
