import { describe, expect, it } from 'vitest';

import {
  conditionsText,
  groupsText,
  maskingText,
  membersText,
  policiesOf,
  rowsText,
} from './policies';

/**
 * T171 / AC-165: THE SYSTEM SHALL list every access policy in the model with
 * its role, member-level rules, row-level filters, conditions and masking, as
 * declared.
 * Fails when: a declared policy or rule is missing from the listing.
 *
 * Read from the model files, since Cube's metadata does not return policies
 * (research/cube/access-control.md, "`/v1/meta?extended`"); their shape is
 * the research's ("Data model: `access_policy` on cubes and views"). The
 * "role" is Cube's `group` or `groups` (roles were renamed groups in 1.7.0).
 */
const SECURED = `views:
  - name: secured_orders
    cubes:
      - join_path: orders
        includes: [count, total_amount, status]
    access_policy:
      - group: managers
        member_level:
          includes: '*'
        row_level:
          allow_all: true
      - group: sales
        conditions:
          - if: '{ securityContext.is_employee }'
        member_level:
          includes: '*'
          excludes: [total_amount]
        row_level:
          filters:
            - member: status
              operator: equals
              values: [shipped]
            - or:
                - member: count
                  operator: gt
                  values: ['0']
                - member: status
                  operator: set
      - groups: [auditors, finance]
        member_level:
          includes: [count, status]
        member_masking:
          includes: [total_amount]
cubes:
  - name: orders
    sql_table: public.orders
`;

describe('the access policies a file declares', () => {
  it('reads each policy’s groups, members, rows, conditions and masking as written', () => {
    const read = policiesOf('views/secured_orders.yml', SECURED);

    expect(read.policies.map((policy) => policy.object)).toEqual([
      'secured_orders',
      'secured_orders',
      'secured_orders',
    ]);
    const [managers, sales, auditors] = read.policies;
    expect(managers).toMatchObject({ kind: 'view', groups: ['managers'] });
    expect(sales?.conditions).toEqual(['{ securityContext.is_employee }']);
    expect(auditors?.groups).toEqual(['auditors', 'finance']);
    expect(auditors?.memberMasking).toEqual({ includes: ['total_amount'] });

    // In words, as declared.
    expect(read.policies.map((policy) => groupsText(policy))).toEqual([
      'managers',
      'sales',
      'auditors, finance',
    ]);
    expect(read.policies.map((policy) => membersText(policy.memberLevel))).toEqual([
      'all',
      'all except total_amount',
      'count, status',
    ]);
    expect(read.policies.map((policy) => rowsText(policy.rowLevel))).toEqual([
      'all rows',
      'status equals shipped and (count gt 0 or status set)',
      'all rows (none declared)',
    ]);
    expect(read.policies.map((policy) => conditionsText(policy.conditions))).toEqual([
      'none',
      '{ securityContext.is_employee }',
      'none',
    ]);
    expect(read.policies.map((policy) => maskingText(policy.memberMasking))).toEqual([
      'none',
      'none',
      'total_amount',
    ]);
  });

  it('lists the cubes and views with no policy as open', () => {
    expect(policiesOf('views/secured_orders.yml', SECURED).open).toEqual([
      { kind: 'cube', name: 'orders' },
    ]);
  });

  it('reads a group of any, and a member level written as one member', () => {
    const read = policiesOf(
      'cubes/c.yml',
      `cubes:
  - name: c
    access_policy:
      - group: '*'
        member_level:
          includes: status
          excludes: '*'
`,
    );
    expect(groupsText(read.policies[0]!)).toBe('any group');
    expect(membersText(read.policies[0]?.memberLevel)).toBe('status, except all');
  });

  /**
   * Found by T171's review. Cube reads snake_case and camelCase keys alike
   * (research/cube/data-modeling.md, "Formatting and aliases"), so a policy
   * written in camelCase is still a policy.
   */
  it('reads a policy written with camelCase keys', () => {
    const read = policiesOf(
      'cubes/c.yml',
      `cubes:
  - name: c
    accessPolicy:
      - group: managers
        memberLevel:
          includes: '*'
        rowLevel:
          allowAll: true
      - group: auditors
        memberLevel:
          includes: [count]
        memberMasking:
          includes: [amount]
`,
    );
    expect(read.open).toEqual([]);
    expect(read.policies.map((policy) => membersText(policy.memberLevel))).toEqual([
      'all',
      'count',
    ]);
    expect(rowsText(read.policies[0]?.rowLevel)).toBe('all rows');
    expect(maskingText(read.policies[1]?.memberMasking)).toBe('amount');
  });

  it('reads an empty member level as all members, as Cube does', () => {
    // research/cube/access-control.md: "`member_level: {}` is treated as
    // `includes: '*'`", and so is one that only excludes.
    expect(membersText({})).toBe('all');
    expect(membersText({ excludes: ['amount'] })).toBe('all except amount');
  });

  it('says what a masking rule that only excludes declares, as written', () => {
    // No source says what masking excludes on its own mean, so it is not read
    // as "all except": it is said as written.
    expect(maskingText({ excludes: ['amount'] })).toBe('excludes amount');
    expect(maskingText({})).toBe('none declared');
  });

  it('keeps a condition that is not text, and says when no row filter is listed', () => {
    const read = policiesOf(
      'cubes/c.yml',
      `cubes:
  - name: c
    access_policy:
      - group: sales
        conditions:
          - if: true
        row_level:
          filters: []
`,
    );
    expect(conditionsText(read.policies[0]!.conditions)).toBe('true');
    expect(rowsText(read.policies[0]?.rowLevel)).toBe('no filters listed');
  });

  it('reads a filter written with dimension, and keeps a value holding a comma whole', () => {
    expect(
      rowsText({
        filters: [{ dimension: 'region', operator: 'equals', values: ['North, East', 'South'] }],
      }),
    ).toBe('region equals "North, East", South');
  });

  it('names a file whose policies it cannot read, rather than leaving them out silently', () => {
    expect(policiesOf('cubes/c.js', 'cube(`c`, {})')).toEqual({
      policies: [],
      open: [],
      code: 'JavaScript',
    });
    expect(policiesOf('cubes/t.yml', 'cubes:\n  - name: {{ name }}\n').code).toBe('Jinja');
    expect(policiesOf('cubes/bad.yml', 'cubes: [').problem).toMatch(/line/);
  });
});
