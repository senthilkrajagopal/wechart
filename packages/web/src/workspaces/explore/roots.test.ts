import { describe, expect, it } from 'vitest';

import { folderChain, targetPathOf } from './folders';
import { isMyWorkspace, MY_WORKSPACE, rootTitleOf, SHARED_ROOT, visibleRoots } from './roots';

/**
 * T343 (AC-276, AC-277): with sign-in on, My workspace is the signed-in
 * user's own `ws:<key>`, which the API names `mine` to the client but stores,
 * and gives back, as that id. Explore calls either "My workspace", and shows
 * the root only to a user who has one.
 */
describe('My workspace, however the API names it (T343)', () => {
  it('is `mine` or a `ws:` id, and called My workspace', () => {
    expect(isMyWorkspace('mine')).toBe(true);
    expect(isMyWorkspace('ws:CiQwOGE4Njg0Yi1kYjg4')).toBe(true);
    expect(isMyWorkspace('root')).toBe(false);
    expect(isMyWorkspace('f1')).toBe(false);
    expect(rootTitleOf('ws:CiQwOGE4Njg0Yi1kYjg4')).toBe('My workspace');
    expect(rootTitleOf('root')).toBe('Shared');
    expect(rootTitleOf('f1')).toBeUndefined();
  });

  it('heads the chain of a folder in it, never Shared', () => {
    const folders = [{ id: 'drafts', title: 'Drafts', parentId: 'ws:abc' }];
    expect(folderChain(folders, 'drafts')).toEqual([
      { id: MY_WORKSPACE.id, title: 'My workspace' },
      { id: 'drafts', title: 'Drafts' },
    ]);
  });

  it('is shown as a root only where the API counts one: none for a read-only user', () => {
    expect(visibleRoots({ root: 3, mine: 1 }).map((root) => root.id)).toEqual(['mine', 'root']);
    expect(visibleRoots({ root: 3 }).map((root) => root.id)).toEqual([SHARED_ROOT.id]);
    // Until the counts come: the shared root alone, not a workspace that may not be theirs.
    expect(visibleRoots(undefined).map((root) => root.id)).toEqual([SHARED_ROOT.id]);
  });

  it('shows the shared root only where the API counts it: none to someone no grant reaches (T331)', () => {
    // Design 09, state G: signed in with access to nothing, no tree root.
    expect(visibleRoots({})).toEqual([]);
    expect(visibleRoots({ mine: 2 }).map((root) => root.id)).toEqual(['mine']);
  });

  // T498 put it first with sign-in on; R76's explore-Q3 (T693) puts it first
  // in both modes, sign-in off included, as design 04 draws it.
  it('comes first, sign-in on or off, as design 04 draws it (T498, T693)', () => {
    expect(visibleRoots({ root: 3, mine: 1 }).map((root) => root.id)).toEqual(['mine', 'root']);
    expect(visibleRoots({ mine: 1, root: 3 }).map((root) => root.id)).toEqual(['mine', 'root']);
    expect(visibleRoots({ root: 3 }).map((root) => root.id)).toEqual(['root']);
  });
});

/** T498: a folder named as a target is, its path from under Shared, as the target picker names it. */
describe('a target folder by its path (T498)', () => {
  const folders = [
    { id: 'sales', title: 'Sales', parentId: 'root' },
    { id: 'emea', title: 'EMEA', parentId: 'sales' },
  ];

  it('is its path below Shared, or Shared itself', () => {
    expect(targetPathOf(folders, 'emea')).toBe('Sales / EMEA');
    expect(targetPathOf(folders, 'sales')).toBe('Sales');
    expect(targetPathOf(folders, 'root')).toBe('Shared');
  });

  it('is unknown for a folder the user cannot see', () => {
    expect(targetPathOf(folders, 'gone')).toBeUndefined();
  });
});
