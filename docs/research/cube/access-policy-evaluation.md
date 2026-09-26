---
library: Cube Core access-policy evaluation — which policies apply to a context, and what they grant (read from the running 1.7.42 source)
packages: []
version: 1.7.42
researched: 2026-09-24
sources:
  [
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts,
  ]
---

# Access-policy evaluation, as Cube 1.7.42 runs it

> **Amended, 2026-09-25** (architecture decision 4, [docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)): the effective-access list built from the parsed YAML (:37–42) must also include the folder policies xcube generates. They aren't in the files wechart reads. See [generated-policies.md](./generated-policies.md).

A sibling of `access-control.md`. That note gives the documented rules, and its "Observed locally" section gives what the seed view answered. This note reads the evaluation code in the compose container (`cubejs/cube:v1.7.42`, `/cube/node_modules/@cubejs-backend/server-core/dist/src/core/CompilerApi.js` and `…/schema-compiler/dist/src/compiler/CubeEvaluator.js`), to settle the questions T241's review raised. The Security workspace's effective-access list (AC-232) is written against it.

## Which policies apply (`getApplicablePolicies`)

- A policy applies when the context's groups match **and** its conditions are met: `hasAccess && this.policyMeetsConditions(evaluatedConditions)`. [CompilerApi.js:272–302]
- **Groups:** `userHasGroup` is true when the context's groups contain the policy's group, or the policy's group is `'*'`. With `groups: [...]`, one match is enough. [CompilerApi.js:245–250]
- **Conditions:** each `if` is evaluated against the context by `evaluateContextFunction`, and the results are reduced with `&&`. [CompilerApi.js:251–259, 284]
  - With **two or more** conditions, a result that is not a boolean throws `Access policy condition must return boolean, got …`, so the request fails.
  - With **one** condition, `reduce` without an initial value returns that single result unchecked. An unset claim (`undefined`) is falsy, and the policy simply does not apply. This matches `access-control.md`'s observation that `{ groups: ["sales"] }` without `is_employee` gets no grant from the sales policy.

## What a policy grants

- **`member_level` defaults** (`CubeEvaluator.js:165–173`): `includes` defaults to `'*'` and `excludes` to `[]`. So `member_level: {}` grants every member, as `access-control.md` records from gh-11934, and `excludes` alone grants every member but those.
- **A policy with neither `member_level` nor `member_masking` grants every member:** "Policies without memberLevel and memberMasking expose everything, as do cubes reached through a view." [CompilerApi.js:456–464, 767]
- **Row level:** a policy has a row filter only when `rowLevel && !rowLevel.allowAll && rowLevel.filters?.length > 0`. With no `row_level` it has all rows. [CompilerApi.js:481]
- **Several policies:** "combining all filters for the same group with AND; combining all filters for different groups with OR; combining cube and view filters with AND". [CompilerApi.js:319–327, `applyRowLevelSecurity`]
- **Through a view:** a cube reached through a view has its own member-level rules waived (the quote above), but its row filters still AND with the view's.
  - The cubes a view reaches are the first segment of each included member's path (`cube.includedMembers[].memberPath`), i.e. the cube at the end of each `join_path`. [CompilerApi.js:343–350]
  - For each such cube with policies, Cube takes the policies that apply to the context. If **none** apply, `grantingPolicies` is empty for every member, and the query gets the segment `1 = 0` (`rlsAccessDenied`): **no rows, not an error**. [CompilerApi.js:503–556]
  - A member's rows are the OR of its granting policies' row filters, unless one of them has none. The cube's constraint is the AND over the queried members. [CompilerApi.js:482–548]
- **Masking:** a member is masked unless some granting policy gives it "unconditional full access (memberLevel + allow-all)". [CompilerApi.js:496–527]

## What wechart does with it

The effective-access list in Security (T241) works from the parsed YAML:
- It evaluates the YAML `if` forms `access-control.md` lists (`and`, `or`, `not`, `.` and `.includes(…)`) against the edited context.
- A condition it cannot read is said to depend on Cube rather than guessed.
- A view reports both its own policies and the row filters its cubes' policies add.
