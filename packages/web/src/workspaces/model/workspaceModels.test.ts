import { describe, expect, it } from 'vitest';

import { filesBeside } from './workspaceModels';

const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;

/**
 * T451's switch (AC-138, AC-224): a model in My workspace joins and picks
 * from its folder's other files and the shared files on the path of the
 * folder it goes to, a name the workspace declares being its own.
 */
describe('the files beside a workspace model', () => {
  const shared = [
    // On the path, at the open file's path, but another cube: kept.
    { folderId: 'root', path: 'cubes/orders.yml', content: cube('ledger') },
    // On the path, a name the workspace declares: the workspace's.
    { folderId: 'root', path: 'cubes/customers.yml', content: cube('customers') },
    { folderId: 'root', path: 'cubes/products.yml', content: cube('products') },
    // Off the path.
    { folderId: 'f-other', path: 'cubes/stores.yml', content: cube('stores') },
  ];
  const own = [
    { path: 'cubes/orders.yml', content: cube('orders') },
    { path: 'cubes/customers.yml', content: cube('customers') },
  ];

  it('takes the path’s files, the open file’s path too where they declare another cube', () => {
    expect(
      filesBeside({ open: 'cubes/orders.yml', own, shared, onPath: new Set(['root']) }),
    ).toEqual([
      { path: 'cubes/customers.yml', content: cube('customers') },
      { folderId: 'root', path: 'cubes/orders.yml', content: cube('ledger') },
      { folderId: 'root', path: 'cubes/products.yml', content: cube('products') },
    ]);
  });

  it('takes none of the path’s while no target is known', () => {
    expect(filesBeside({ open: 'cubes/orders.yml', own, shared, onPath: new Set() })).toEqual([
      { path: 'cubes/customers.yml', content: cube('customers') },
    ]);
  });
});
