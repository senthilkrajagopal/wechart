import { describe, expect, it } from 'vitest';

import { folderRoleOf, mayRenameFolder, rightFrom, type FolderRoleOf } from './folderRole';

/**
 * T761 (AC-291, amended 2026-10-08 on the user's "Yes" of 2026-09-27): a
 * folder's rename needs write on the folder holding it too, so Rename beside
 * its heading is offered only where the user may write both.
 */
describe('Rename beside a folder’s heading (T761, AC-291)', () => {
  it('is offered where they may change the folder and write the one holding it', () => {
    expect(
      mayRenameFolder({ mayChange: true, signedIn: true, inMyWorkspace: false, parent: 'write' }),
    ).toBe(true);
    // In their own workspace, every folder is theirs; with sign-in off, the single user's.
    expect(
      mayRenameFolder({ mayChange: true, signedIn: true, inMyWorkspace: true, parent: 'unknown' }),
    ).toBe(true);
    expect(
      mayRenameFolder({
        mayChange: true,
        signedIn: false,
        inMyWorkspace: false,
        parent: 'unknown',
      }),
    ).toBe(true);
  });

  it('is not offered where the one holding it is only viewed, or not yet known, nor where the folder isn’t theirs', () => {
    expect(
      mayRenameFolder({ mayChange: true, signedIn: true, inMyWorkspace: false, parent: 'read' }),
    ).toBe(false);
    expect(
      mayRenameFolder({ mayChange: true, signedIn: true, inMyWorkspace: false, parent: 'unknown' }),
    ).toBe(false);
    expect(
      mayRenameFolder({ mayChange: false, signedIn: true, inMyWorkspace: false, parent: 'write' }),
    ).toBe(false);
  });
});

/**
 * The right in a shared folder, from how its access answered (T330's route,
 * `GET /api/folders/:id/access`): given to a Super-Admin or a read-write
 * member, refused with 403 to one who sees it only, and 404 to one who can't
 * see it at all.
 */
describe('the right in a shared folder, from its access’s answer (T331)', () => {
  it('is write where it answered, read where it was refused with 403, and unknown otherwise', () => {
    expect(rightFrom({ answered: true })).toBe('write');
    expect(rightFrom({ answered: false, refusedWith: 403 })).toBe('read');
    expect(rightFrom({ answered: false, refusedWith: 404 })).toBe('unknown');
    expect(rightFrom({ answered: false, refusedWith: 500 })).toBe('unknown');
    // Still being asked.
    expect(rightFrom({ answered: false })).toBe('unknown');
  });
});

/**
 * T331: what Explore offers in the open folder, by the user's role there.
 *
 * - AC-192: in a shared folder, New offers Folder to its read-write members
 *   (Super-Admins among them) and nothing to anyone else; in the user's
 *   workspace, every kind. Rename is beside the heading for those who may
 *   rename the folder.
 * - AC-194: "+ Folder" in the tree for those who may make one here.
 * - Rule 69: the header's access chip, Super-Admin, Read-write or View only,
 *   in every shared folder; the workspace has its band instead (rule 72).
 * - Rule 68: a user with no workspace is offered nothing at its address.
 * - With sign-in off, the single user's: a Super-Admin's, with no chip (as
 *   T330 left the Access button out), since R52 (T359, AC-254).
 */
const signedIn = (more: Partial<FolderRoleOf>): FolderRoleOf => ({
  signedIn: true,
  superAdmin: false,
  inMyWorkspace: false,
  hasWorkspace: true,
  right: 'unknown',
  ...more,
});
const NOTHING = {
  access: undefined,
  creates: [],
  mayRename: false,
  mayAddFolder: false,
  inOwnWorkspace: false,
};
const EVERYTHING = {
  access: undefined,
  creates: ['dashboard', 'chart', 'folder'],
  mayRename: true,
  mayAddFolder: true,
};

describe('what the open folder offers, by role (T331; AC-192, AC-194, rules 68 and 69)', () => {
  it('offers a read-write member of a shared folder Folder alone, Rename and + Folder, and says Read-write', () => {
    expect(folderRoleOf(signedIn({ right: 'write' }))).toEqual({
      access: 'read-write',
      creates: ['folder'],
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: false,
    });
  });

  it('offers a Super-Admin the same in a shared folder, and says Super-Admin', () => {
    expect(folderRoleOf(signedIn({ superAdmin: true, right: 'write' }))).toEqual({
      access: 'super-admin',
      creates: ['folder'],
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: false,
    });
  });

  it('offers a reader nothing to create or rename, and says View only', () => {
    expect(folderRoleOf(signedIn({ hasWorkspace: false, right: 'read' }))).toEqual({
      ...NOTHING,
      access: 'view-only',
    });
    // A read-write member where they only view: an ancestor of their folder (AC-262).
    expect(folderRoleOf(signedIn({ right: 'read' }))).toEqual({ ...NOTHING, access: 'view-only' });
  });

  it('offers nothing, and says nothing, while the right there isn’t known', () => {
    expect(folderRoleOf(signedIn({ right: 'unknown' }))).toEqual(NOTHING);
  });

  it('offers every kind in the user’s own workspace, with no chip: its band says whose it is', () => {
    for (const superAdmin of [false, true]) {
      expect(folderRoleOf(signedIn({ superAdmin, inMyWorkspace: true }))).toEqual({
        ...EVERYTHING,
        inOwnWorkspace: true,
      });
    }
  });

  it('offers nothing at My workspace’s address to someone who has no workspace (rule 68)', () => {
    // A reader who types `?folder=mine`, or follows an old link to it.
    expect(folderRoleOf(signedIn({ inMyWorkspace: true, hasWorkspace: false }))).toEqual(NOTHING);
  });

  it('offers nothing until who is signed in is known, rather than phase 1’s everything', () => {
    for (const inMyWorkspace of [false, true]) {
      expect(folderRoleOf(signedIn({ signedIn: undefined, inMyWorkspace }))).toEqual(NOTHING);
    }
  });

  /**
   * With sign-in off since R52 ("Workspace-only now", T359, AC-254): the one
   * user works as a Super-Admin does, making dashboards and charts in My
   * workspace and folders anywhere, with no chip: there are no groups.
   */
  it('offers the single user, with sign-in off, a Super-Admin’s Explore with no chip', () => {
    expect(folderRoleOf(signedIn({ signedIn: false, superAdmin: true }))).toEqual({
      access: undefined,
      creates: ['folder'],
      mayRename: true,
      mayAddFolder: true,
      inOwnWorkspace: false,
    });
    expect(
      folderRoleOf(signedIn({ signedIn: false, superAdmin: true, inMyWorkspace: true })),
    ).toEqual({ ...EVERYTHING, inOwnWorkspace: true });
  });
});
