import { describe, expect, it } from 'vitest';

import {
  conditionHolds,
  conditionsText,
  effectiveAccess,
  groupsText,
  maskingText,
  membersText,
  policiesOf,
  rowsText,
  UNREAD,
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
      reaches: {},
      code: 'JavaScript',
    });
    expect(policiesOf('cubes/t.yml', 'cubes:\n  - name: {{ name }}\n').code).toBe('Jinja');
    expect(policiesOf('cubes/bad.yml', 'cubes: [').problem).toMatch(/line/);
  });
});

/**
 * T241 / AC-232: WHEN the user opens Security, THE SYSTEM SHALL … list every
 * cube and view with the access the current context gives it and why …
 * `Fails when: effective access is missing …`
 */
describe('what a context gets, and why (AC-232)', () => {
  /**
   * By Cube 1.7.42's own evaluation (research/cube/access-policy-evaluation.md):
   * a policy applies when a group matches and its conditions hold; members are
   * unioned; a view's rows are also filtered by its cubes' policies.
   */
  const modelOf = (files: readonly [string, string][]) => {
    const reads = files.map(([path, text]) => ({ path, read: policiesOf(path, text) }));
    return {
      declared: reads.flatMap(({ path, read }) =>
        read.policies.map((policy) => ({ policy, path })),
      ),
      open: reads.flatMap(({ read }) => read.open),
      reaches: Object.assign({}, ...reads.map(({ read }) => read.reaches)) as Record<
        string,
        readonly string[]
      >,
    };
  };
  const model = modelOf([['views/secured.yml', SECURED]]);
  const accessOf = (context: Record<string, unknown>, object = 'secured_orders') =>
    effectiveAccess(model, context).find((each) => each.object === object);

  it('reads which cubes each view reaches', () => {
    expect(model.reaches).toEqual({ secured_orders: ['orders'] });
  });

  it('gives every member and row to a group whose policy allows all', () => {
    expect(
      effectiveAccess(model, { groups: ['managers'] }).map(({ object, access }) => [
        object,
        access,
      ]),
    ).toEqual([
      ['orders', 'full'],
      ['secured_orders', 'full'],
    ]);
  });

  it('gives some members or rows to a group whose policy limits them, and says which', () => {
    const secured = accessOf({ groups: ['finance'] });
    expect(secured?.access).toBe('limited');
    expect(secured?.why).toContain('count, status');
    // And what it sees masked rather than not at all.
    expect(secured?.why).toContain('masked: total_amount');
    expect(secured?.paths).toEqual(['views/secured.yml']);
  });

  it('denies a view to a group no policy names, naming the groups that are', () => {
    const secured = accessOf({ groups: ['marketing'] });
    expect(secured?.access).toBe('denied');
    expect(secured?.why).toContain('managers');
    expect(secured?.why).toContain('sales');
  });

  it('applies a conditional policy only while its condition holds (T241’s review)', () => {
    // The sales preset alone: the condition is unset, so nothing is granted —
    // as Cube answers it (access-control.md, "Observed locally").
    const unset = accessOf({ groups: ['sales'] });
    expect(unset?.access).toBe('denied');
    expect(unset?.why).toContain('only if { securityContext.is_employee }');
    const employed = accessOf({ groups: ['sales'], is_employee: true });
    expect(employed?.access).toBe('limited');
    expect(employed?.why).toContain('all except total_amount');
    expect(accessOf({ groups: ['sales'], is_employee: false })?.access).toBe('denied');
  });

  it('says a condition it cannot read is Cube’s to decide, rather than guessing', () => {
    const odd = modelOf([
      [
        'cubes/odd.yml',
        `cubes:
  - name: odd
    sql_table: t
    access_policy:
      - group: sales
        conditions:
          - if: '{ securityContext.region == "EU" }'
`,
      ],
    ]);
    const [access] = effectiveAccess(odd, { groups: ['sales'] });
    expect(access?.access).toBe('unknown');
    expect(access?.why).toContain('{ securityContext.region == "EU" }');
  });

  it('unions members across the policies that apply, and full access wins over masking', () => {
    const both = accessOf({ groups: ['managers', 'finance'] });
    expect(both?.access).toBe('full');
    expect(both?.why).not.toContain('masked');
  });

  it('reads member_level {} and excludes [] as every member, as Cube does', () => {
    const lenient = modelOf([
      [
        'cubes/lenient.yml',
        `cubes:
  - name: lenient
    sql_table: t
    access_policy:
      - group: '*'
        member_level: {}
      - group: staff
        member_level:
          includes: '*'
          excludes: []
`,
      ],
    ]);
    // '*' applies to a context with no groups at all.
    expect(effectiveAccess(lenient, {}).map(({ access }) => access)).toEqual(['full']);
    expect(effectiveAccess(lenient, { groups: ['staff'] })[0]?.why).not.toContain('Some');
  });

  it('filters a view’s rows by its cube’s policies too, and gives nothing when none applies', () => {
    const layered = modelOf([
      [
        'views/summary.yml',
        `views:
  - name: summary
    cubes:
      - join_path: orders.customers
        includes: [country]
      - join_path: orders
        includes: [count]
`,
      ],
      [
        'cubes/orders.yml',
        `cubes:
  - name: orders
    sql_table: t
    access_policy:
      - group: sales
        row_level:
          filters:
            - member: status
              operator: equals
              values: [shipped]
`,
      ],
    ]);
    expect(layered.reaches).toEqual({ summary: ['customers', 'orders'] });
    const sales = effectiveAccess(layered, { groups: ['sales'] }).find(
      (each) => each.object === 'summary',
    );
    expect(sales?.access).toBe('limited');
    expect(sales?.why).toContain('orders: status equals shipped');
    expect(sales?.paths).toEqual(['cubes/orders.yml']);
    const others = effectiveAccess(layered, { groups: ['marketing'] }).find(
      (each) => each.object === 'summary',
    );
    expect(others?.access).toBe('denied');
    expect(others?.why).toContain('no rows');
  });

  it('leaves a cube with no policy open to every context', () => {
    const [orders] = effectiveAccess(model, {});
    expect(orders).toEqual({
      object: 'orders',
      kind: 'cube',
      access: 'full',
      why: 'No access policy: open to every context.',
      paths: [],
    });
  });
});

describe('a YAML condition, read against a context (AC-232)', () => {
  const context = { is_employee: true, groups: ['sales'], region: 'EU', user: { admin: false } };

  it('reads a claim, `not`, `and`, `or` and `.includes(…)`', () => {
    expect(conditionHolds('{ securityContext.is_employee }', context)).toBe(true);
    expect(conditionHolds('{ not securityContext.user.admin }', context)).toBe(true);
    expect(
      conditionHolds('{ securityContext.is_employee and securityContext.user.admin }', context),
    ).toBe(false);
    expect(
      conditionHolds('{ securityContext.user.admin or securityContext.is_employee }', context),
    ).toBe(true);
    expect(conditionHolds("{ securityContext.groups.includes('sales') }", context)).toBe(true);
    expect(conditionHolds('{ securityContext.missing }', context)).toBeUndefined();
  });

  it('declines what YAML cannot say, rather than guessing', () => {
    expect(conditionHolds('{ securityContext.region == "EU" }', context)).toBe(UNREAD);
    expect(conditionHolds('not a template', context)).toBe(UNREAD);
    // `.includes` on nothing: Cube's evaluation throws, so it is Cube's call.
    expect(conditionHolds("{ securityContext.missing.includes('x') }", context)).toBe(UNREAD);
  });
});
