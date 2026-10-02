import { describe, expect, it } from 'vitest';

import { cubeSourceOf } from './cubeSource';

/**
 * T492's review: Generate cubes browses a data source by its connection's
 * name in Cube, which is its own only in the shared root.
 */
describe('a data source’s name in Cube (T492)', () => {
  it('is its own in the shared root', () => {
    expect(cubeSourceOf({ name: 'default', folderId: 'root', inWorkspace: false })).toBe('default');
    expect(cubeSourceOf({ name: 'default', folderId: null, inWorkspace: false })).toBe('default');
  });

  it('carries a folder’s xcube id elsewhere', () => {
    expect(
      cubeSourceOf({
        name: 'sales_dw',
        folderId: '0F3A9C2E-1B2D-4E5F-8A9B-0C1D2E3F4A5B',
        inWorkspace: false,
      }),
    ).toBe('f0f3a9c2e1b2d4e5f8a9b0c1d2e3f4a5b__sales_dw');
  });

  it('is none Cube lists for one in My workspace, or in a folder of a seed’s id', () => {
    expect(cubeSourceOf({ name: 'default', folderId: 'mine', inWorkspace: true })).toBe(undefined);
    expect(cubeSourceOf({ name: 'sales_dw', folderId: 'seed-sales', inWorkspace: false })).toBe(
      undefined,
    );
  });
});
