import { describe, expect, it } from 'vitest';

import type { FolderNode } from '../workspaces/explore/FolderTree';
import type { CubeSummary } from './fields';
import { cubesOnPath } from './pathCubes';

/**
 * T429, AC-329: WHEN the user picks a cube for a chart or dashboard, THE
 * SYSTEM SHALL offer only the cubes found on the item's own folder path, each
 * by its title with its folder path beside it, never by its prefixed name.
 *
 * /A (`fa`) holds a `sales`, /A/B (`fab`) its own, /A/B/C (`fabc`) beneath it
 * another, and /A/D (`fad`), /A/B's sibling, the only `widgets`; the root
 * holds `sales` and `customers`.
 */
const folders: FolderNode[] = [
  { id: 'a', title: 'A', parentId: 'root', itemCount: 0, xcubeId: 'fa' },
  { id: 'b', title: 'B', parentId: 'a', itemCount: 0, xcubeId: 'fab' },
  { id: 'c', title: 'C', parentId: 'b', itemCount: 0, xcubeId: 'fabc' },
  { id: 'd', title: 'D', parentId: 'a', itemCount: 0, xcubeId: 'fad' },
];
const cube = (folderId: string, shortName: string, title: string): CubeSummary => ({
  name: folderId === 'froot' ? shortName : `${folderId}__${shortName}`,
  title,
  isView: false,
  xcube: { folderId, shortName },
});
const cubes = [
  cube('froot', 'sales', 'Sales'),
  cube('froot', 'customers', 'Customers'),
  cube('fa', 'sales', 'Sales'),
  cube('fab', 'sales', 'Sales'),
  cube('fabc', 'sales', 'Sales'),
  cube('fad', 'widgets', 'Widgets'),
];

describe('the cubes on an item’s folder path (T429, AC-329)', () => {
  it('offers each name’s nearest cube on the path, never a descendant’s or a sibling’s, with its folder path', () => {
    expect(cubesOnPath(cubes, 'b', folders)).toEqual([
      { ...cube('froot', 'customers', 'Customers'), folderPath: 'Shared' },
      { ...cube('fab', 'sales', 'Sales'), folderPath: 'Shared / A / B' },
    ]);
  });

  it('offers the root’s alone for an item in the root', () => {
    expect(cubesOnPath(cubes, 'root', folders)).toEqual([
      { ...cube('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...cube('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  // T429's review: My workspace isn't served by xcube until slice 5.
  it('offers an item in My workspace the shared root’s cubes, under the shared root’s name', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'Drafts', parentId: 'mine', itemCount: 0, xcubeId: 'fw' },
    ];

    expect(cubesOnPath(cubes, 'w', inWorkspace)).toEqual([
      { ...cube('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...cube('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  it('offers every cube, as it was, where the model says nothing of folders or the item’s folder is unknown', () => {
    const plain = { name: 'orders', title: 'Orders', isView: false };

    expect(cubesOnPath([plain], 'b', folders)).toEqual([plain]);
    expect(cubesOnPath(cubes, undefined, folders)).toEqual(cubes);
  });
});
