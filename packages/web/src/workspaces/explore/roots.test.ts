import { describe, expect, it } from 'vitest';

import { folderChain } from './folders';
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
    expect(visibleRoots({ root: 3, mine: 1 }).map((root) => root.id)).toEqual(['root', 'mine']);
    expect(visibleRoots({ root: 3 }).map((root) => root.id)).toEqual([SHARED_ROOT.id]);
    // Until the counts come: the shared root alone, not a workspace that may not be theirs.
    expect(visibleRoots(undefined).map((root) => root.id)).toEqual([SHARED_ROOT.id]);
  });
});
