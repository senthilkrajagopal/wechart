import { describe, expect, it } from 'vitest';

import type { AccessFolder } from './effective';
import { folderRights, isSuperAdmin, type FolderRight } from './visibility';

/**
 * T313: what each user may see and change in each folder.
 *
 * - AC-262: WHEN a group has read-write access to a folder, THE SYSTEM SHALL
 *   let its members see, view-only, every dashboard, chart, model and data
 *   source in each ancestor folder up to the root.
 * - AC-263: WHILE a user has only read-only access, THE SYSTEM SHALL show them
 *   the dashboards, and the charts on those dashboards, in the folders they may
 *   see (the folder, its descendants and its ancestors), and no models, data
 *   sources or library charts.
 * - AC-264: a user in no group that reaches a folder (set, inherited, or
 *   reaching up from a grant on a descendant) gets nothing for it.
 * - AC-256, AC-265: members of the configured Super-Admin group write everywhere.
 */
const tree: AccessFolder[] = [
  { id: 'root', parentId: null },
  { id: 'A', parentId: 'root' },
  { id: 'B', parentId: 'A', access: { readOnly: ['emea-ro'], readWrite: ['emea-rw'] } },
  { id: 'C', parentId: 'B' },
  { id: 'S', parentId: 'A' },
  { id: 'Z', parentId: 'root', access: { readOnly: ['z-ro'], readWrite: null } },
];

const WRITE: FolderRight = { see: true, write: true, kinds: 'all' };
const VIEW_ALL: FolderRight = { see: true, write: false, kinds: 'all' };
const DASHBOARDS: FolderRight = { see: true, write: false, kinds: 'dashboards' };

const rightsOf = (groups: string[], superAdmin = false) =>
  Object.fromEntries(folderRights(tree, { groups, superAdmin }));

describe('a read-write member sees their folder’s ancestors, view-only, every kind of item (AC-262)', () => {
  it('writes in /A/B and below, sees /A and the root view-only, and nothing beside them', () => {
    expect(rightsOf(['emea-rw'])).toEqual({ B: WRITE, C: WRITE, A: VIEW_ALL, root: VIEW_ALL });
  });
});

describe('a read-only member sees dashboards in their folder, below it and above it (AC-263)', () => {
  it('sees dashboards only in /A/B, /A/B/C, /A and the root, and never another kind', () => {
    expect(rightsOf(['emea-ro'])).toEqual({
      B: DASHBOARDS,
      C: DASHBOARDS,
      A: DASHBOARDS,
      root: DASHBOARDS,
    });
  });

  it('takes the wider of two grants: read-write in one folder beats read-only reaching up to it', () => {
    const rights = rightsOf(['emea-ro', 'z-ro']);
    expect(rights['Z']).toEqual(DASHBOARDS);
    expect(rights['root']).toEqual(DASHBOARDS);
    expect(rightsOf(['emea-rw', 'emea-ro'])['A']).toEqual(VIEW_ALL);
  });
});

describe('combining grants: the widest right wins (T313’s review)', () => {
  it('lets read-write on /A/B widen what read-only on /A shows in /A and the root', () => {
    const mixed: AccessFolder[] = [
      { id: 'root', parentId: null },
      { id: 'A', parentId: 'root', access: { readOnly: ['ro'], readWrite: null } },
      { id: 'B', parentId: 'A', access: { readOnly: null, readWrite: ['rw'] } },
      { id: 'S', parentId: 'A' },
    ];
    expect(
      Object.fromEntries(folderRights(mixed, { groups: ['ro', 'rw'], superAdmin: false })),
    ).toEqual({
      root: VIEW_ALL,
      A: VIEW_ALL,
      B: WRITE,
      S: DASHBOARDS,
    });
  });

  it('never lowers read-write inherited from above with a read-only grant below', () => {
    const lowered: AccessFolder[] = [
      { id: 'root', parentId: null },
      { id: 'A', parentId: 'root', access: { readOnly: null, readWrite: ['g'] } },
      { id: 'B', parentId: 'A', access: { readOnly: ['g'], readWrite: null } },
    ];
    const rights = Object.fromEntries(folderRights(lowered, { groups: ['g'], superAdmin: false }));
    expect(rights['B']).toEqual(WRITE);
    expect(rights['A']).toEqual(WRITE);
  });

  it('gives a folder in a cycle of bad data the same right whatever order it is listed in', () => {
    const cycle: AccessFolder[] = [
      { id: 'X', parentId: 'Y', access: { readOnly: null, readWrite: ['x'] } },
      { id: 'Y', parentId: 'X' },
    ];
    const viewer = { groups: ['x'], superAdmin: false };
    const forward = Object.fromEntries(folderRights(cycle, viewer));
    const reversed = Object.fromEntries(folderRights([...cycle].reverse(), viewer));
    expect(forward).toEqual(reversed);
    expect(forward['Y']).toEqual(WRITE);
  });
});

describe('a user no group reaches gets nothing (AC-264)', () => {
  it('sees no folder at all', () => {
    expect(rightsOf([])).toEqual({});
    expect(rightsOf(['someone-else'])).toEqual({});
  });

  it('does not see a sibling of the folder they were granted', () => {
    const rights = rightsOf(['emea-rw']);
    expect(rights['S']).toBeUndefined();
    expect(rights['Z']).toBeUndefined();
  });
});

describe('Super-Admins write everywhere (AC-256, AC-265)', () => {
  it('writes in every folder, whatever groups are set', () => {
    const rights = rightsOf([], true);
    for (const folder of tree) expect(rights[folder.id], folder.id).toEqual(WRITE);
  });

  it('get nothing in anyone’s workspace, which only its owner reaches (AC-276)', () => {
    const withWorkspace: AccessFolder[] = [...tree, { id: 'ws:writer', parentId: null }];
    const rights = folderRights(withWorkspace, { groups: [], superAdmin: true });
    expect(rights.has('ws:writer')).toBe(false);
    expect(rights.get('root')).toEqual(WRITE);
  });

  it('are the members of the configured group, and only them', () => {
    expect(isSuperAdmin(['x', 'wechart-super-admins'], 'wechart-super-admins')).toBe(true);
    expect(isSuperAdmin(['wechart-super-admins-2'], 'wechart-super-admins')).toBe(false);
    expect(isSuperAdmin(['wechart-super-admins'], undefined)).toBe(false);
  });
});
