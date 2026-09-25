import { describe, expect, it } from 'vitest';

import { effectiveGroups, folderAccess, type AccessFolder } from './effective';

/**
 * T312: each folder's effective read-only and read-write groups.
 *
 * - AC-260: WHILE a folder leaves its read-only or its read-write setting
 *   unset, THE SYSTEM SHALL use the parent's effective setting for it, each
 *   setting inherited on its own, and show the inherited groups with the folder
 *   they come from.
 * - AC-261: WHEN an AD group has access to a folder, set or inherited, THE
 *   SYSTEM SHALL give its members the same access to every descendant folder,
 *   whatever groups the descendant sets.
 * - AC-255: a user in 20 AD groups gets access through every one of them.
 */
const tree: AccessFolder[] = [
  { id: 'root', parentId: null, access: { readOnly: ['everyone'], readWrite: null } },
  { id: 'A', parentId: 'root', access: { readOnly: null, readWrite: ['sales-rw'] } },
  { id: 'B', parentId: 'A', access: { readOnly: ['emea-ro'], readWrite: ['emea-rw'] } },
  { id: 'C', parentId: 'B', access: { readOnly: null, readWrite: null } },
  { id: 'D', parentId: 'root' },
];

const groupsOf = (grants: readonly { group: string }[]) => grants.map((grant) => grant.group);

describe('an unset setting takes the parent’s effective groups, each setting on its own (AC-260)', () => {
  it('inherits the read-only setting while the read-write one is set', () => {
    const a = effectiveGroups(tree, 'A');
    // A sets read-write only: its read-only groups are the root's.
    expect(groupsOf(a.readOnly)).toEqual(['everyone']);
    expect(groupsOf(a.readWrite)).toEqual(['sales-rw']);
  });

  it('inherits the read-write setting while the read-only one is set', () => {
    const withReadOnly: AccessFolder[] = [
      ...tree,
      { id: 'E', parentId: 'A', access: { readOnly: ['east-ro'], readWrite: null } },
    ];
    const e = effectiveGroups(withReadOnly, 'E');
    expect(groupsOf(e.readOnly)).toEqual(['east-ro', 'everyone']);
    expect(groupsOf(e.readWrite)).toEqual(['sales-rw']);
  });

  it('treats a folder with no access at all as leaving both unset', () => {
    const d = effectiveGroups(tree, 'D');
    expect(groupsOf(d.readOnly)).toEqual(['everyone']);
    expect(d.readWrite).toEqual([]);
  });

  it('names the folder every inherited group comes from, and marks the ones set here', () => {
    const c = effectiveGroups(tree, 'C');
    expect(c.readOnly).toEqual([
      { group: 'emea-ro', from: 'B', setHere: false },
      { group: 'everyone', from: 'root', setHere: false },
    ]);
    expect(c.readWrite).toEqual([
      { group: 'emea-rw', from: 'B', setHere: false },
      { group: 'sales-rw', from: 'A', setHere: false },
    ]);
    expect(effectiveGroups(tree, 'B').readWrite).toEqual([
      { group: 'emea-rw', from: 'B', setHere: true },
      { group: 'sales-rw', from: 'A', setHere: false },
    ]);
  });

  it('lists a group set at two levels once, from the nearer folder', () => {
    const repeated: AccessFolder[] = [
      { id: 'root', parentId: null, access: { readOnly: null, readWrite: ['ops'] } },
      { id: 'X', parentId: 'root', access: { readOnly: null, readWrite: ['ops'] } },
    ];
    expect(effectiveGroups(repeated, 'X').readWrite).toEqual([
      { group: 'ops', from: 'X', setHere: true },
    ]);
  });
});

describe('a grant reaches every descendant, whatever groups the descendant sets (AC-261)', () => {
  it('gives a member of the group granted on /A read-write in /A/B/C, although /A/B sets another group', () => {
    expect(folderAccess(tree, 'C', ['sales-rw'])).toBe('write');
    expect(folderAccess(tree, 'B', ['sales-rw'])).toBe('write');
  });

  it('gives read-only members read access, and read-write members write access', () => {
    expect(folderAccess(tree, 'C', ['emea-ro'])).toBe('read');
    expect(folderAccess(tree, 'C', ['emea-rw'])).toBe('write');
    expect(folderAccess(tree, 'C', ['everyone'])).toBe('read');
  });

  it('gives no grant from grants on another branch, or on a descendant', () => {
    expect(folderAccess(tree, 'D', ['sales-rw'])).toBe(null);
    // A grant on B gives no grant *level* on its ancestor A. Seeing A view-only
    // (AC-262) is visibility, T313's, not a grant.
    expect(folderAccess(tree, 'A', ['emea-rw'])).toBe(null);
  });

  it('takes the higher of a user’s grants', () => {
    expect(folderAccess(tree, 'C', ['everyone', 'emea-rw'])).toBe('write');
  });

  it('keeps read-write below a descendant that names the same group read-only (never less access there)', () => {
    const lowered: AccessFolder[] = [
      { id: 'root', parentId: null },
      { id: 'A', parentId: 'root', access: { readOnly: null, readWrite: ['g'] } },
      { id: 'B', parentId: 'A', access: { readOnly: ['g'], readWrite: null } },
      { id: 'C', parentId: 'B' },
    ];
    expect(folderAccess(lowered, 'B', ['g'])).toBe('write');
    expect(folderAccess(lowered, 'C', ['g'])).toBe('write');
  });
});

describe('a user in 20 groups (AC-255)', () => {
  it('has access through the last of them alone', () => {
    const twenty = Array.from(
      { length: 20 },
      (_, index) => `g${String(index + 1).padStart(2, '0')}`,
    );
    const only20th: AccessFolder[] = [
      { id: 'root', parentId: null },
      { id: 'F', parentId: 'root', access: { readOnly: null, readWrite: ['g20'] } },
    ];
    expect(folderAccess(only20th, 'F', twenty)).toBe('write');
    expect(folderAccess(only20th, 'F', twenty.slice(0, 19))).toBe(null);
  });
});

describe('a folder that isn’t in the tree, and bad data', () => {
  it('has no groups and gives no access', () => {
    expect(effectiveGroups(tree, 'nowhere')).toEqual({ readOnly: [], readWrite: [] });
    expect(folderAccess(tree, 'nowhere', ['everyone'])).toBe(null);
  });

  it('stops at a cycle in the parents rather than walking forever', () => {
    const cyclic: AccessFolder[] = [
      { id: 'P', parentId: 'Q', access: { readOnly: null, readWrite: ['p'] } },
      { id: 'Q', parentId: 'P', access: { readOnly: null, readWrite: ['q'] } },
    ];
    expect(groupsOf(effectiveGroups(cyclic, 'P').readWrite)).toEqual(['p', 'q']);
  });
});
