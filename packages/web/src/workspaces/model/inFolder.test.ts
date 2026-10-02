import { describe, expect, it } from 'vitest';

import { rollupHref } from './inFolder';

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
