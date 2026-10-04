import { describe, expect, it } from 'vitest';

import type { FolderNode } from '../workspaces/explore/FolderTree';
import type { CubeSummary } from './fields';
import { cubesOnPath, pickerGroupsOf } from './pathCubes';

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

  /**
   * T347 (AC-329's workspace path, AC-281): for an item in My workspace, the
   * path is the workspace, then its target's. The workspace's own cubes come
   * first, wherever its overlay places them, and hide a cube of the same
   * short name on the path, as names resolve in the overlay first.
   */
  it('offers a workspace item its workspace’s cubes first, then its target’s path, each name once', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'project-2026-10-01-0900', parentId: 'mine', itemCount: 0, xcubeId: null },
    ];
    const own = (folderId: string, shortName: string, title: string): CubeSummary => ({
      ...cube(folderId, shortName, title),
      inWorkspace: true,
    });
    const withWorkspace = [
      ...cubes,
      own('fab', 'sales', 'Sales (mine)'),
      own('fad', 'gadgets', 'Gadgets'),
    ];

    expect(cubesOnPath(withWorkspace, 'w', inWorkspace, 'b')).toEqual([
      { ...own('fab', 'sales', 'Sales (mine)'), folderPath: 'My workspace' },
      { ...own('fad', 'gadgets', 'Gadgets'), folderPath: 'My workspace' },
      { ...cube('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
    // With no target, the shared root's path, after the workspace's own,
    // whose `sales` hides the root's.
    expect(cubesOnPath(withWorkspace, 'w', inWorkspace)).toEqual([
      { ...own('fab', 'sales', 'Sales (mine)'), folderPath: 'My workspace' },
      { ...own('fad', 'gadgets', 'Gadgets'), folderPath: 'My workspace' },
      { ...cube('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  it('offers every cube, as it was, where the model says nothing of folders or the item’s folder is unknown', () => {
    const plain = { name: 'orders', title: 'Orders', isView: false };

    expect(cubesOnPath([plain], 'b', folders)).toEqual([plain]);
    expect(cubesOnPath(cubes, undefined, folders)).toEqual(cubes);
  });
});

/**
 * T475 (AC-329, AC-342; 2026-09-27 design 10, state D): the picker's groups,
 * by folder along the item's path, nearest first, each named by its path
 * below Shared (the root as "Shared"); a farther cube of a name a nearer one
 * holds is listed too, unselectable, saying which folder's cube hides it.
 */
describe('the cube picker’s groups (T475, AC-342)', () => {
  const shown = (groups: ReturnType<typeof pickerGroupsOf>) =>
    groups.map((group) => ({
      label: group.label,
      rows: group.rows.map((row) => `${row.cube.title}${row.hiddenBy ? ` · ${row.hiddenBy}` : ''}`),
    }));

  it('groups the path’s cubes nearest first, the farther of a name hidden by the nearer', () => {
    expect(shown(pickerGroupsOf(cubes, 'b', folders))).toEqual([
      { label: 'A / B', rows: ['Sales'] },
      { label: 'A', rows: ['Sales · hidden by Sales in A / B'] },
      { label: 'Shared', rows: ['Sales · hidden by Sales in A / B', 'Customers'] },
    ]);
  });

  it('says nothing of a descendant’s or a sibling’s cubes', () => {
    const rows = pickerGroupsOf(cubes, 'b', folders).flatMap((group) => group.rows);
    expect(rows.map((row) => row.cube.name)).not.toContain('fabc__sales');
    expect(rows.map((row) => row.cube.name)).not.toContain('fad__widgets');
  });

  /**
   * As the API answers a workspace item (T475's review): its overlay's meta
   * holds the copy in place of the folder's cube, under the same name, so
   * the published one comes from the folder's own meta, `published`.
   */
  it('puts a workspace item’s own cubes first, the published one its copy replaced “hidden by your copy”', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'project-2026-10-01-0900', parentId: 'mine', itemCount: 0, xcubeId: null },
    ];
    const copy: CubeSummary = { ...cube('fab', 'sales', 'Sales (mine)'), inWorkspace: true };
    const newOne: CubeSummary = { ...cube('fab', 'customers', 'My customers'), inWorkspace: true };
    // The overlay's meta: the copy where /A/B's was, and a new cube of the
    // root's `customers` name.
    const overlay = [...cubes.filter((each) => each.name !== 'fab__sales'), copy, newOne];
    expect(shown(pickerGroupsOf(overlay, 'w', inWorkspace, 'b', cubes))).toEqual([
      { label: 'My workspace', rows: ['Sales (mine)', 'My customers'] },
      { label: 'A / B', rows: ['Sales · hidden by your copy'] },
      { label: 'A', rows: ['Sales · hidden by your copy'] },
      {
        label: 'Shared',
        rows: ['Sales · hidden by your copy', 'Customers · hidden by My customers in My workspace'],
      },
    ]);
    // Each row its own key, the copy and its original sharing a name.
    const keys = pickerGroupsOf(overlay, 'w', inWorkspace, 'b', cubes).flatMap((group) =>
      group.rows.map((row) => row.key),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists every cube in one group with no label where the model says nothing of folders', () => {
    const plain = { name: 'orders', title: 'Orders', isView: false };
    expect(shown(pickerGroupsOf([plain], 'b', folders))).toEqual([
      { label: undefined, rows: ['Orders'] },
    ]);
  });
});
