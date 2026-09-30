import { describe, expect, it } from 'vitest';

import { allowedGroups } from './allowed';
import type { AccessFolder } from './effective';

/**
 * T436 (AC-320): a folder's allowed groups, the set xcube's folder gate
 * admits a token by, are the groups granted on it, on an ancestor or on a
 * descendant, and the Super-Admin group. A folder no group reaches carries
 * the Super-Admin group alone, since an empty set admits nobody (research
 * `xcube-slice-4.md`, Gotcha 5). Every folder's set is then within its
 * parent's, which xcube requires with security on.
 */
const SUPER = 'wechart-super-admins';
const TREE: AccessFolder[] = [
  { id: 'root', parentId: null, access: { readOnly: ['everyone'], readWrite: null } },
  { id: 'a', parentId: 'root', access: { readOnly: null, readWrite: ['a-rw'] } },
  { id: 'b', parentId: 'a', access: { readOnly: ['b-ro'], readWrite: null } },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: 'root', access: { readOnly: null, readWrite: null } },
  { id: 'e', parentId: 'd', access: { readOnly: ['e-ro'], readWrite: ['e-rw'] } },
];

describe('a folder’s allowed groups (T436, AC-320)', () => {
  it('are those granted on it, above it and below it, with the Super-Admin group', () => {
    const allowed = allowedGroups(TREE, SUPER);
    expect(allowed.get('b')).toEqual(['a-rw', 'b-ro', 'everyone', SUPER]);
    // Below /A/B: the grants on /A/B and /A reach it; none below it.
    expect(allowed.get('c')).toEqual(['a-rw', 'b-ro', 'everyone', SUPER]);
    // Above /A/B: its grant reaches up, so /A/B's members get /A's cubes.
    expect(allowed.get('a')).toEqual(['a-rw', 'b-ro', 'everyone', SUPER]);
    // The root: every group granted anywhere.
    expect(allowed.get('root')).toEqual(['a-rw', 'b-ro', 'e-ro', 'e-rw', 'everyone', SUPER]);
    // A sibling branch's grants don't reach across.
    expect(allowed.get('d')).toEqual(['e-ro', 'e-rw', 'everyone', SUPER]);
  });

  it('gives a folder no group reaches the Super-Admin group alone', () => {
    const allowed = allowedGroups(
      [
        { id: 'root', parentId: null },
        { id: 'x', parentId: 'root' },
      ],
      SUPER,
    );
    expect(allowed.get('root')).toEqual([SUPER]);
    expect(allowed.get('x')).toEqual([SUPER]);
  });

  it('keeps each folder’s set within its parent’s', () => {
    const allowed = allowedGroups(TREE, SUPER);
    for (const folder of TREE) {
      if (folder.parentId === null) continue;
      const parent = new Set(allowed.get(folder.parentId));
      for (const group of allowed.get(folder.id) ?? [])
        expect(parent.has(group), `${folder.id}: ${group}`).toBe(true);
    }
  });

  it('names every folder in the tree, and none outside it; a cycle in bad data ends', () => {
    const allowed = allowedGroups(
      [
        { id: 'root', parentId: null },
        { id: 'p', parentId: 'q', access: { readOnly: ['loop'], readWrite: null } },
        { id: 'q', parentId: 'p' },
      ],
      SUPER,
    );
    expect([...allowed.keys()].sort()).toEqual(['p', 'q', 'root']);
    expect(allowed.get('root')).toEqual([SUPER]);
  });
});
