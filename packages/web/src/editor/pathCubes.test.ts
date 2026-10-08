import { describe, expect, it } from 'vitest';

import type { FolderNode } from '../workspaces/explore/FolderTree';
import type { CubeSummary } from './fields';
import { cubesOnPath, pickerGroupsOf } from './pathCubes';

/**
 * T429, AC-329: WHEN the user picks a cube for a chart or dashboard, THE
 * SYSTEM SHALL offer only the cubes found on the item's own folder path, each
 * by its title with its folder path beside it.
 *
 * The folders: /A (`fa`), /A/B (`fab`), /A/B/C (`fabc`) beneath it, and /A/D
 * (`fad`), /A/B's sibling.
 */
const folders: FolderNode[] = [
  { id: 'a', title: 'A', parentId: 'root', itemCount: 0, xcubeId: 'fa' },
  { id: 'b', title: 'B', parentId: 'a', itemCount: 0, xcubeId: 'fab' },
  { id: 'c', title: 'C', parentId: 'b', itemCount: 0, xcubeId: 'fabc' },
  { id: 'd', title: 'D', parentId: 'a', itemCount: 0, xcubeId: 'fad' },
];

/**
 * T710 (AC-329, AC-328): with one name per item (R71) each cube is under its
 * own name in every folder, so the path's cubes are those its folders keep,
 * each once: the root's `sales` and `customers`, /A's `a_orders`, /A/B's
 * `ab_lines`; /A/B/C's `deep` is beneath /A/B, and /A/D's `widgets` its
 * sibling's.
 */
const kept = (folderId: string, name: string, title: string): CubeSummary => ({
  name,
  title,
  isView: false,
  xcube: { folderId, shortName: name },
});
const onPaths = [
  kept('froot', 'sales', 'Sales'),
  kept('froot', 'customers', 'Customers'),
  kept('fa', 'a_orders', 'A orders'),
  kept('fab', 'ab_lines', 'AB lines'),
  kept('fabc', 'deep', 'Deep'),
  kept('fad', 'widgets', 'Widgets'),
];

describe('the cubes on an item’s folder path (T429, T710; AC-329, AC-328)', () => {
  it('offers each cube its path’s folders keep, by its own name with its folder path, never a descendant’s or a sibling’s, and none hidden', () => {
    expect(cubesOnPath(onPaths, 'b', folders)).toEqual([
      { ...kept('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...kept('froot', 'customers', 'Customers'), folderPath: 'Shared' },
      { ...kept('fa', 'a_orders', 'A orders'), folderPath: 'Shared / A' },
      { ...kept('fab', 'ab_lines', 'AB lines'), folderPath: 'Shared / A / B' },
    ]);
  });

  it('offers the root’s alone for an item in the root', () => {
    expect(cubesOnPath(onPaths, 'root', folders)).toEqual([
      { ...kept('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...kept('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  // T429's review: My workspace isn't served by xcube until slice 5.
  it('offers an item in My workspace the shared root’s cubes, under the shared root’s name', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'Drafts', parentId: 'mine', itemCount: 0, xcubeId: 'fw' },
    ];

    expect(cubesOnPath(onPaths, 'w', inWorkspace)).toEqual([
      { ...kept('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...kept('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  /**
   * T347 (AC-329's workspace path, AC-281): for an item in My workspace, the
   * path is the workspace, then its target's. The workspace's own cubes come
   * first, wherever its overlay places them; its copy of a cube is that
   * cube's one name, so the landed one isn't offered beside it.
   */
  it('offers a workspace item its workspace’s cubes first, then its target’s path, each name once', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'project-2026-10-01-0900', parentId: 'mine', itemCount: 0, xcubeId: null },
    ];
    const mine = (folderId: string, name: string, title: string): CubeSummary => ({
      ...kept(folderId, name, title),
      inWorkspace: true,
    });
    const withWorkspace = [
      ...onPaths,
      mine('fab', 'ab_lines', 'AB lines (mine)'),
      mine('fad', 'gadgets', 'Gadgets'),
    ];

    expect(cubesOnPath(withWorkspace, 'w', inWorkspace, 'b')).toEqual([
      { ...mine('fab', 'ab_lines', 'AB lines (mine)'), folderPath: 'My workspace' },
      { ...mine('fad', 'gadgets', 'Gadgets'), folderPath: 'My workspace' },
      { ...kept('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...kept('froot', 'customers', 'Customers'), folderPath: 'Shared' },
      { ...kept('fa', 'a_orders', 'A orders'), folderPath: 'Shared / A' },
    ]);
    // With no target, the shared root's path, after the workspace's own.
    expect(cubesOnPath(withWorkspace, 'w', inWorkspace)).toEqual([
      { ...mine('fab', 'ab_lines', 'AB lines (mine)'), folderPath: 'My workspace' },
      { ...mine('fad', 'gadgets', 'Gadgets'), folderPath: 'My workspace' },
      { ...kept('froot', 'sales', 'Sales'), folderPath: 'Shared' },
      { ...kept('froot', 'customers', 'Customers'), folderPath: 'Shared' },
    ]);
  });

  it('offers every cube, as it was, where the model says nothing of folders or the item’s folder is unknown', () => {
    const plain = { name: 'orders', title: 'Orders', isView: false };

    expect(cubesOnPath([plain], 'b', folders)).toEqual([plain]);
    expect(cubesOnPath(onPaths, undefined, folders)).toEqual(onPaths);
  });
});

/**
 * T475 (AC-329), as T718 has it (AC-428; R71, R72; AC-342 retired): one item
 * of a name, so nothing on a path is hidden. A workspace item's own new
 * cubes come first; the user's copy of a landed cube is listed in the landed
 * one's place, marked as theirs.
 */
describe('the cube picker’s groups (T475, T718, AC-428)', () => {
  const shown = (groups: ReturnType<typeof pickerGroupsOf>) =>
    groups.map((group) => ({
      label: group.label,
      rows: group.rows.map((row) => `${row.cube.title}${row.yours === true ? ' · Your copy' : ''}`),
    }));

  it('groups the path’s cubes nearest first, each folder’s own, none hidden', () => {
    expect(shown(pickerGroupsOf(onPaths, 'b', folders))).toEqual([
      { label: 'A / B', rows: ['AB lines'] },
      { label: 'A', rows: ['A orders'] },
      { label: 'Shared', rows: ['Sales', 'Customers'] },
    ]);
  });

  it('says nothing of a descendant’s or a sibling’s cubes', () => {
    const rows = pickerGroupsOf(onPaths, 'b', folders).flatMap((group) => group.rows);
    expect(rows.map((row) => row.cube.name)).not.toContain('deep');
    expect(rows.map((row) => row.cube.name)).not.toContain('widgets');
  });

  /**
   * As the API answers a workspace item (T475's review): its overlay's meta
   * holds the copy in place of the landed cube, under the same name; the
   * folders' own meta, `published`, holds the landed one.
   */
  it('lists a workspace item’s copy in the landed cube’s place, marked as theirs, and its new cubes first', () => {
    const inWorkspace: FolderNode[] = [
      ...folders,
      { id: 'w', title: 'project-2026-10-01-0900', parentId: 'mine', itemCount: 0, xcubeId: null },
    ];
    const copy: CubeSummary = {
      ...kept('fa', 'a_orders', 'A orders (mine)'),
      inWorkspace: true,
    };
    const newOne: CubeSummary = { ...kept('fab', 'my_lines', 'My lines'), inWorkspace: true };
    const overlay = [...onPaths.filter((each) => each.name !== 'a_orders'), copy, newOne];
    const groups = pickerGroupsOf(overlay, 'w', inWorkspace, 'b', onPaths);
    expect(shown(groups)).toEqual([
      { label: 'My workspace', rows: ['My lines'] },
      { label: 'A / B', rows: ['AB lines'] },
      { label: 'A', rows: ['A orders (mine) · Your copy'] },
      { label: 'Shared', rows: ['Sales', 'Customers'] },
    ]);
    // `a_orders` once, the copy; each row its own key.
    const rows = groups.flatMap((group) => group.rows);
    expect(rows.filter((row) => row.cube.name === 'a_orders')).toHaveLength(1);
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists every cube in one group with no label where the model says nothing of folders', () => {
    const plain = { name: 'orders', title: 'Orders', isView: false };
    expect(shown(pickerGroupsOf([plain], 'b', folders))).toEqual([
      { label: undefined, rows: ['Orders'] },
    ]);
  });
});
