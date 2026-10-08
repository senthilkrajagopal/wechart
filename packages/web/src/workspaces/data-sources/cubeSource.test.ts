import { describe, expect, it } from 'vitest';

import { cubeSourceOf } from './cubeSource';

/**
 * T492's review: Generate cubes browses a data source by its connection's
 * name in Cube. T710 (AC-328): that name is its own in every folder, as
 * xcube names every data source (research `xcube-256d632371.md`, 1.1).
 */
describe('a data source’s name in Cube (T492, T710)', () => {
  it('is its own in the shared root', () => {
    expect(cubeSourceOf({ name: 'default', folderId: 'root', inWorkspace: false })).toBe('default');
    expect(cubeSourceOf({ name: 'default', folderId: null, inWorkspace: false })).toBe('default');
  });

  it('is its own in any other folder too, with no folder in it', () => {
    expect(
      cubeSourceOf({
        name: 'sales_dw',
        folderId: '0F3A9C2E-1B2D-4E5F-8A9B-0C1D2E3F4A5B',
        inWorkspace: false,
      }),
    ).toBe('sales_dw');
    expect(cubeSourceOf({ name: 'sales_dw', folderId: 'seed-sales', inWorkspace: false })).toBe(
      'sales_dw',
    );
  });

  it('is none Cube lists for one in My workspace', () => {
    expect(cubeSourceOf({ name: 'default', folderId: 'mine', inWorkspace: true })).toBe(undefined);
  });
});
