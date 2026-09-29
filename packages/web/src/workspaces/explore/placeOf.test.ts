import { describe, expect, it } from 'vitest';

import type { FolderNode } from './FolderTree';
import { placeOf } from './placeOf';

/**
 * T348 (AC-278; design 04, states E and F): what a dashboard's or library
 * chart's header says of where it lives, and how it is changed. A shared
 * one: "In Sales / EMEA · version 7 · approved 22 Sep by Ada Admin", edited
 * only in a copy ("Edit in my workspace", or "Open my copy" once there is
 * one), by those who may copy it. A workspace one: where it came from and
 * where it goes, with "Propose to Sales / EMEA…".
 */
const folders: FolderNode[] = [
  { id: 'sales', title: 'Sales', parentId: 'root' },
  { id: 'emea', title: 'EMEA', parentId: 'sales' },
] as FolderNode[];

describe('where an item lives, for its header (T348)', () => {
  it('says a shared one’s folder, version and approval, and offers a copy to edit', () => {
    expect(
      placeOf({
        title: 'Revenue overview',
        folderId: 'emea',
        version: 7,
        workspace: { inWorkspace: false, mayCopy: true, copyId: null },
        folders,
        approved: 'approved 22 Sep by Ada Admin',
      }),
    ).toEqual({
      kind: 'shared',
      line: 'In Sales / EMEA · version 7 · approved 22 Sep by Ada Admin',
      copy: { label: 'Edit in my workspace', copyId: null },
    });
  });

  it('opens the user’s copy once there is one, and offers nothing to one who may not copy', () => {
    const shared = {
      title: 'Revenue overview',
      folderId: 'emea',
      version: 7,
      folders,
    };
    const copied = placeOf({
      ...shared,
      workspace: { inWorkspace: false, mayCopy: true, copyId: 'c1' },
    });
    expect(copied?.kind === 'shared' ? copied.copy : undefined).toEqual({
      label: 'Open my copy',
      copyId: 'c1',
    });
    expect(
      placeOf({ ...shared, workspace: { inWorkspace: false, mayCopy: false, copyId: null } }),
    ).toEqual({ kind: 'shared', line: 'In Sales / EMEA · version 7', copy: undefined });
  });

  it('says where a workspace copy came from and goes, and offers to propose it there', () => {
    expect(
      placeOf({
        title: 'Revenue overview',
        folderId: 'mine',
        version: 3,
        origin: { id: 'd0', version: 7, folderId: 'emea' },
        targetFolderId: 'emea',
        workspace: { inWorkspace: true, mayCopy: false, copyId: null },
        folders,
      }),
    ).toEqual({
      kind: 'workspace',
      line: 'Copied from Sales / EMEA › Revenue overview · version 7 · Target: Sales / EMEA',
      proposeTo: { label: 'Propose to Sales / EMEA…', targetPath: ['Shared', 'Sales', 'EMEA'] },
    });
  });

  it('says a new one goes to its target, and one with none can’t be proposed yet', () => {
    const inWorkspace = { inWorkspace: true, mayCopy: false, copyId: null };
    expect(
      placeOf({
        title: 'Margin',
        folderId: 'mine',
        version: 1,
        targetFolderId: 'sales',
        workspace: inWorkspace,
        folders,
      }),
    ).toEqual({
      kind: 'workspace',
      line: 'New in My workspace · Target: Sales',
      proposeTo: { label: 'Propose to Sales…', targetPath: ['Shared', 'Sales'] },
    });
    expect(
      placeOf({ title: 'Loose', folderId: 'mine', version: 1, workspace: inWorkspace, folders }),
    ).toEqual({ kind: 'workspace', line: 'In My workspace · no target yet', proposeTo: undefined });
  });

  it('says no path until the folders are read, yet still edits a shared one only in a copy (T348’s review)', () => {
    expect(
      placeOf({
        title: 'Revenue overview',
        folderId: 'emea',
        version: 7,
        workspace: { inWorkspace: false, mayCopy: true, copyId: null },
        folders: undefined,
      }),
    ).toEqual({
      kind: 'shared',
      line: undefined,
      copy: { label: 'Edit in my workspace', copyId: null },
    });
    expect(
      placeOf({
        title: 'Revenue overview',
        folderId: 'mine',
        version: 3,
        origin: { id: 'd0', version: 7, folderId: 'emea' },
        targetFolderId: 'emea',
        workspace: { inWorkspace: true, mayCopy: false, copyId: null },
        folders: undefined,
      }),
    ).toEqual({ kind: 'workspace', line: undefined, proposeTo: undefined });
  });

  it('is nothing with sign-in off, where the API says nothing of workspaces', () => {
    expect(
      placeOf({ title: 'Revenue', folderId: 'emea', version: 2, workspace: undefined, folders }),
    ).toBeUndefined();
  });
});
