import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyOf, declaredNameOf, filesBeside, namesFixedFor } from './workspaceModels';

/**
 * T722's review (AC-423; T706's API): a file's cube and view names are fixed
 * where it has landed, and in an edit copy of it; a draft's, and a use-only
 * copy's, which the API lets change, are not. While it isn't yet known which
 * a saved workspace file is, or can't be read, they are held fixed.
 */
describe('whether a model file’s names are fixed (T722)', () => {
  it('fixes a landed file’s and an edit copy’s, not a draft’s nor a use-only copy’s', () => {
    expect(namesFixedFor({ inWorkspace: false, published: true, copy: undefined })).toBe(true);
    expect(namesFixedFor({ inWorkspace: true, published: true, copy: { useOnly: false } })).toBe(
      true,
    );
    expect(namesFixedFor({ inWorkspace: true, published: true, copy: { useOnly: true } })).toBe(
      false,
    );
    expect(namesFixedFor({ inWorkspace: true, published: true, copy: null })).toBe(false);
    expect(namesFixedFor({ inWorkspace: true, published: false, copy: undefined })).toBe(false);
  });

  it('holds them fixed while a saved workspace file’s kind isn’t known', () => {
    expect(namesFixedFor({ inWorkspace: true, published: true, copy: undefined })).toBe(true);
  });
});

/**
 * T722 (AC-423): a saved workspace file that copies a landed one keeps its
 * original's name; a draft of its own doesn't. A use-only copy says so too.
 */
describe('whether a saved workspace file is a copy of a landed one', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says an edit copy, a use-only copy, and a draft of its own apart', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { kind: 'model', id: 'cubes/orders.yml', origin: { id: 'f1', folderId: 'sales' } },
          {
            kind: 'model',
            id: 'cubes/stock.yml',
            origin: { id: 'f2', folderId: 'ops', useOnly: true },
          },
          { kind: 'model', id: 'cubes/fresh.yml', origin: null },
        ]),
      ),
    );
    expect(await copyOf('mine', 'cubes/orders.yml')).toEqual({ useOnly: false });
    expect(await copyOf('mine', 'cubes/stock.yml')).toEqual({ useOnly: true });
    expect(await copyOf('mine', 'cubes/fresh.yml')).toBeNull();
    expect(await copyOf('mine', 'cubes/gone.yml')).toBeNull();
  });
});

/**
 * T717's review (AC-283): "Request a change" asks about the cube or view the
 * copy's saved file declares, a view's included, never the form's unsaved
 * text.
 */
describe('the name a saved model file declares', () => {
  it('is its cube’s, or its view’s where it declares only a view', () => {
    expect(declaredNameOf('cubes:\n  - name: regions\n    sql_table: public.regions\n')).toBe(
      'regions',
    );
    expect(
      declaredNameOf('views:\n  - name: sales_view\n    cubes:\n      - join_path: orders\n'),
    ).toBe('sales_view');
  });

  it('is none for text that declares nothing, or doesn’t parse', () => {
    expect(declaredNameOf('')).toBeUndefined();
    expect(declaredNameOf('cubes: [')).toBeUndefined();
  });
});

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
