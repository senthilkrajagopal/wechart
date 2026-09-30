import { describe, expect, it } from 'vitest';

import { namedGroups, policyGroupsOf } from './named-groups';

/**
 * T437 (AC-008, AC-326): a signed-in user's token carries only their groups
 * that some access policy names, or some folder's allowed set holds, since
 * xcube's folder gate matches the token's groups against those sets
 * (requirements "A token's groups"; research `xcube-slice-4.md`, Gotcha 8).
 * A folder's allowed set is the groups granted on it, an ancestor or a
 * descendant, and the Super-Admin group, so every group granted anywhere and
 * the Super-Admin group are named.
 */
describe('the groups a policy names (T437, AC-008)', () => {
  it('reads `group` and `groups` from every cube’s and view’s access policies, `*` apart', () => {
    const content = `cubes:
  - name: orders
    sql_table: public.orders
    access_policy:
      - group: managers
        row_level:
          allow_all: true
      - groups: [sales, emea]
      - group: '*'
views:
  - name: sales_view
    accessPolicy:
      - groups:
          - finance
          - 7
`;
    expect(policyGroupsOf('orders.yml', content).sort()).toEqual([
      'emea',
      'finance',
      'managers',
      'sales',
    ]);
  });

  it('reads nothing from a file it can’t read as YAML, or one with no policy', () => {
    expect(policyGroupsOf('broken.yml', 'cubes: [ {')).toEqual([]);
    expect(policyGroupsOf('orders.js', 'cube(`orders`, { access_policy: [] })')).toEqual([]);
    expect(policyGroupsOf('open.yml', 'cubes:\n  - name: open\n    sql_table: t\n')).toEqual([]);
  });
});

describe('the groups a token may carry (T437, AC-008, AC-326)', () => {
  const tree = [
    { id: 'root', parentId: null, access: { readOnly: ['all-staff'], readWrite: null } },
    { id: 'a', parentId: 'root', access: { readOnly: null, readWrite: ['sales-rw'] } },
    { id: 'b', parentId: 'a', access: { readOnly: ['sales-ro', 'emea'], readWrite: null } },
    { id: 'c', parentId: 'root', access: { readOnly: null, readWrite: null } },
  ];
  const files = [
    {
      folderId: 'root',
      path: 'orders.yml',
      content: 'cubes:\n  - name: o\n    access_policy:\n      - group: managers\n',
    },
    {
      folderId: 'a',
      path: 'x.yml',
      content: 'views:\n  - name: v\n    access_policy:\n      - groups: [finance]\n',
    },
  ];

  it('are every group some folder grants, the Super-Admin group, and those the model’s policies name', async () => {
    const named = namedGroups({
      tree: async () => tree,
      files: async () => files,
      revision: async () => 3,
      superAdminGroup: 'wechart-super-admins',
    });
    expect([...(await named())].sort()).toEqual([
      'all-staff',
      'emea',
      'finance',
      'managers',
      'sales-ro',
      'sales-rw',
      'wechart-super-admins',
    ]);
  });

  it('reads the tree for every token, and the model’s files again only when its revision moves or a minute has passed', async () => {
    let revision = 3;
    let at = 0;
    const reads = { tree: 0, files: 0 };
    const current = [...files];
    const named = namedGroups({
      tree: async () => {
        reads.tree += 1;
        return tree;
      },
      files: async () => {
        reads.files += 1;
        return current;
      },
      revision: async () => revision,
      now: () => at,
    });
    await named();
    await named();
    expect(reads).toEqual({ tree: 2, files: 1 });

    // A publish: its policy's group is named once the revision it made is recorded.
    current.push({
      folderId: 'root',
      path: 'hr.yml',
      content: 'cubes:\n  - name: hr\n    access_policy:\n      - group: hr\n',
    });
    expect([...(await named())]).not.toContain('hr');
    revision = 4;
    expect([...(await named())]).toContain('hr');
    expect(reads.files).toBe(2);

    // Whatever the revision, a minute bounds it (as AC-009 bounds metadata).
    at = 59_000;
    await named();
    expect(reads.files).toBe(2);
    at = 60_001;
    await named();
    expect(reads.files).toBe(3);
  });
});
