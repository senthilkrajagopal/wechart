import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { publishedTree, treeHashOf, xcubeIdOf } from './folders';

/**
 * T425 / AC-328: each folder's name in xcube is a stored id, `f` plus letters
 * and digits, never reused and never changed by a rename or a move; the root
 * is `froot`. The tree wechart publishes holds each published folder's id and
 * its parent's, and no workspace (`xcube-slice-3a.md`, "PUT …/folders" and
 * "Names"; R30: stored ids, workspaces out of the tree until slice 5).
 */
describe('a folder’s xcube id', () => {
  it('is `froot` for the shared root', () => {
    expect(xcubeIdOf('root')).toBe('froot');
  });

  it('is `f` and the 32 hex digits of a folder named by a UUID, in lower case', () => {
    expect(xcubeIdOf('3F2A9C4E-1B7D-4E8A-9C0B-5D6E7F8A9B0C')).toBe(
      'f3f2a9c4e1b7d4e8a9c0b5d6e7f8a9b0c',
    );
  });

  it('is none of its own for any other folder, a seed’s or a workspace’s: one is given it', () => {
    expect(xcubeIdOf('seed-folder-0')).toBeUndefined();
    expect(xcubeIdOf('ws:someone')).toBeUndefined();
  });

  it('fits xcube’s rule', () => {
    for (const id of ['root', '3f2a9c4e-1b7d-4e8a-9c0b-5d6e7f8a9b0c'])
      expect(xcubeIdOf(id)).toMatch(/^f[a-z0-9]{1,40}$/);
  });
});

describe('the published folder tree', () => {
  const ids = new Map([
    ['root', 'froot'],
    ['a', 'fa1'],
    ['b', 'fb1'],
    ['c', 'fc1'],
    ['w', 'fw1'],
    ['orphan', 'fo1'],
  ]);
  const folders = [
    { id: 'a', parentId: 'root' },
    { id: 'b', parentId: 'a' },
    { id: 'c', parentId: 'b' },
    // My workspace's, and one whose parent is gone: never published.
    { id: 'w', parentId: 'mine' },
    { id: 'orphan', parentId: 'gone' },
  ];

  it('holds the root and each folder reaching it, by xcube id, with its parent’s', () => {
    expect(publishedTree(folders, ids)).toEqual([
      { id: 'froot', parentId: null },
      { id: 'fa1', parentId: 'froot' },
      { id: 'fb1', parentId: 'fa1' },
      { id: 'fc1', parentId: 'fb1' },
    ]);
  });

  it('holds no workspace, and no folder cut off from the root', () => {
    const published = publishedTree(folders, ids).map((folder) => folder.id);

    expect(published).not.toContain('fw1');
    expect(published).not.toContain('fo1');
  });

  it('is the same tree after a rename or a move leaves the ids as they were', () => {
    // A move of c from b to a: its id stays, its parent's changes.
    const moved = folders.map((folder) =>
      folder.id === 'c' ? { ...folder, parentId: 'a' } : folder,
    );

    expect(publishedTree(moved, ids).find((folder) => folder.id === 'fc1')).toEqual({
      id: 'fc1',
      parentId: 'fa1',
    });
  });

  it('holds no folder whose parent it doesn’t hold, however deep (T425’s review)', () => {
    // p reaches the root but has no id yet: c and its child g wait with it.
    const partial = new Map([
      ['root', 'froot'],
      ['c', 'fc1'],
      ['g', 'fg1'],
    ]);
    const deep = [
      { id: 'p', parentId: 'root' },
      { id: 'c', parentId: 'p' },
      { id: 'g', parentId: 'c' },
    ];

    const tree = publishedTree(deep, partial);

    expect(tree).toEqual([{ id: 'froot', parentId: null }]);
    const held = new Set(tree.map((folder) => folder.id));
    for (const folder of tree)
      if (folder.parentId !== null) expect(held.has(folder.parentId)).toBe(true);
  });

  it('never loops on a cycle in bad data', () => {
    const cycle = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];

    expect(publishedTree(cycle, ids)).toEqual([{ id: 'froot', parentId: null }]);
  });
});

describe('the tree’s hash, as xcube answers it', () => {
  it('is SHA-256 of the tree sorted by id, as `{ id, parentId }` (xcube-slice-3a.md, "Folder-tree hash")', () => {
    const tree = [
      { id: 'fb1', parentId: 'froot' },
      { id: 'froot', parentId: null },
    ];
    const expected = createHash('sha256')
      .update(
        JSON.stringify([
          { id: 'fb1', parentId: 'froot' },
          { id: 'froot', parentId: null },
        ]),
      )
      .digest('hex');

    expect(treeHashOf(tree)).toBe(expected);
    expect(treeHashOf([...tree].reverse())).toBe(expected);
  });
});
