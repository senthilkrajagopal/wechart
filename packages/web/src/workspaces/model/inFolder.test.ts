import { describe, expect, it } from 'vitest';

import { SHARED_ROOT } from '../explore/roots';
import { homesOf, publishedIn, rollupHref, shownMemberOf } from './inFolder';

/**
 * T530 (AC-222): a pre-aggregation's link from Schedules, Jobs, "Data as of"
 * and search opens its file where it is: a folder's at the folder's own model
 * address, under its short name; the root's in the Model workspace, as before.
 */
describe('a pre-aggregation’s link to its file (T530, AC-222)', () => {
  it('opens a folder’s file in its folder, on its cube by the name the file declares', () => {
    expect(
      rollupHref({
        fileName: 'cubes/orders.yml',
        fileFolderId: 'f-1',
        cube: 'orders',
        member: 'main',
      }),
    ).toBe(
      '/explore/folders/f-1/models/cubes%2Forders.yml?cube=orders&tab=pre_aggregations&member=main',
    );
  });

  it('opens the root’s in the Model workspace, as before', () => {
    expect(rollupHref({ fileName: 'cubes/orders.yml', cube: 'orders' })).toBe(
      '/model/files/cubes%2Forders.yml?cube=orders&tab=pre_aggregations',
    );
  });

  it('has none for a pre-aggregation with no file', () => {
    expect(rollupHref({ cube: 'orders' })).toBeUndefined();
  });
});

/**
 * T738 (AC-141, AC-329): a member a save's warning lists is named with its
 * cube's folder only where that cube is published elsewhere. A copy of the
 * root's `orders.yml` in a project folder of My workspace keeps the cube's
 * name (R71), and is never its home, even where xcube holds an id for that
 * folder: whichever file is read first, `orders` is the root's.
 */
describe('a cube’s home, for the members a save’s warning lists (T738, AC-141)', () => {
  const folders = [
    { id: 'project-1', title: 'project-2026-10-08-1231', parentId: 'mine', xcubeId: 'fproject' },
    { id: 'sales', title: 'Sales', parentId: null, xcubeId: 'fsales' },
    { id: 'drafts', title: 'Drafts', parentId: null, xcubeId: null },
  ];
  const orders = 'cubes:\n  - name: orders\n    sql_table: public.orders\n';
  const lines = 'cubes:\n  - name: lines\n    sql_table: public.lines\n';

  it('is never a folder in My workspace, whichever file is read first', () => {
    const homeOf = homesOf(
      [
        { path: 'cubes/orders.yml', content: orders, folderId: 'project-1' },
        { path: 'cubes/orders.yml', content: orders },
        { path: 'cubes/lines.yml', content: lines, folderId: 'sales' },
      ],
      publishedIn(folders),
    );
    expect(homeOf('orders')).toBe(SHARED_ROOT.id);
    expect(homeOf('lines')).toBe('sales');
    expect(shownMemberOf('orders.count', SHARED_ROOT.id, folders, homeOf)).toBe('orders.count');
  });

  it('is the root, and a shared folder xcube serves; never one it doesn’t, nor My workspace', () => {
    const published = publishedIn(folders);
    expect(published(SHARED_ROOT.id)).toBe(true);
    expect(published('sales')).toBe(true);
    expect(published('drafts')).toBe(false);
    expect(published('project-1')).toBe(false);
    expect(published('mine')).toBe(false);
  });
});
