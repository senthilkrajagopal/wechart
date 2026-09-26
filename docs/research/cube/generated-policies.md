---
library: Cube Core access policies used as a folder gate that xcube generates (access_policy, contextToGroups, queryRewrite, CompilerApi policy evaluation)
packages: []
version: 1.7.45
researched: 2026-09-25
sources: [/Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/CompilerApi.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/gateway.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/server.ts, /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/RefreshScheduler.ts, /Users/srajagopal/Work/bi/cube/rust/cube/cubeorchestrator/src/query_result_transform.rs, /Users/srajagopal/Work/bi/cube/docs-mintlify/docs/data-modeling/data-access-policies.mdx, /Users/srajagopal/Work/bi/cube/docs-mintlify/reference/data-modeling/data-access-policies.mdx, /Users/srajagopal/Work/bi/cube/docs-mintlify/reference/configuration/config.mdx, /Users/srajagopal/Work/bi/cube/docs-mintlify/docs/data-modeling/access-policies-viewer.mdx, /Users/srajagopal/Work/bi/cube/cube-introspection/README.md, /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30.json, https://raw.githubusercontent.com/nodejs/node/main/doc/api/cli.md]
---

# Cube 1.7.45: a folder gate that xcube generates

> **Where this was read.** Everything comes from the local checkout at `/Users/srajagopal/Work/bi/cube`, on branch `spike/xcube-feasibility`, where `@cubejs-backend/server-core` is version 1.7.45 ([pkg] L5). Line numbers are that checkout's. Docs are its `docs-mintlify` sources.
>
> **What it builds on.** `access-control.md` and `access-policy-evaluation.md`, both written against 1.7.42. Anything here that corrects them is listed under Gotchas, "Corrections to sibling docs".

## Summary

**What this covers.** AC-320 (F26) asks that Cube itself refuse a query for a folder's cubes unless the token carries one of that folder's allowed groups. Those are the groups granted on the folder, on an ancestor or on a descendant, plus the Super-Admin group. A folder no group reaches admits only Super-Admins. Row-level policies written in the model still apply within [w-spec] L953–954, [w-req] L474–479.

Other criteria in play:
- **AC-263:** read-only users' dashboards query the cubes their charts were bound to, "which Cube's generated policies admit them to" [w-spec] L941.
- **AC-008 (F1):** a group's policy must apply to its members, and own-behalf calls use the service credential [w-spec] L87–88.
- **AC-326 (F37):** tokens carry groups only [w-spec] L1129–1130.
- **AC-255:** a user in 20 groups [w-spec] L917.

**Findings:**

1. **Cube's default deny holds only for cubes that have at least one policy.**
   - A cube or view with no `access_policy` is "fully open" [d-apv] L46. RBAC runs for a cube only when `cube.accessPolicy?.length` is set [ceval] L1105–1107.
   - Several matching policies are combined with OR [d-dap] L104–115, [capi] L670–753.
   - So a generated policy added *beside* authored ones widens them. It can't give the AND that AC-320 asks for.
2. **All policy evaluation goes through one protected method, `CompilerApi.getApplicablePolicies`** [capi] L424–460.
   - Queries reach it through `applyRowLevelSecurity` [capi] L537. Metadata reaches it through `patchVisibilityByAccessPolicy` [capi] L1001.
   - For queries it runs for every cube the query touches, including cubes reached through a view.
3. **Recommendation:** have xcube gate `getApplicablePolicies` by each cube's folder, in a `CompilerApi` subclass. xcube already subclasses Cube's server core through protected factories ([x-server] L18–45), and `createCompilerApi` is one of those ([core] L761–767).
   - Add a reserved-group marker policy to every cube and view that xcube serves to Cube, so Cube evaluates policies for all of them.
   - The gate is ANDed with authored policies, by construction.
   - No group lists go into the model, so a permission change needs no recompile.
   - A Cube process without the subclass denies every cube that has no authored policy.
4. **What a denied token sees:**
   - `/v1/meta`: the cube is left out.
   - `/v1/load`: an error.
   - `/v1/sql`: 200, with the cube's SQL and `1 = 0`.
   - `/v1/dry-run`: 200.
   - `/graphql`: its schema lists every cube.
5. **Service calls:**
   - Builds, the jobs API, system partitions and introspection never evaluate policies.
   - The refresh worker's group-less contexts are unaffected.
   - The service credential should *not* be admitted by the gate. Own-behalf model reads should move to an xcube admin route.
   - The Super-Admin group gets in through the allowed sets wechart sends. Authored policies still apply to it.
6. **Scale:** the gate is one set lookup per cube per request. Cube's own per-request costs dominate: it patches visibility over every cube with a policy on each `/v1/meta` *and* `/v1/load`. Mitigations are under Scale.

## Options compared

### 1. Mechanisms (Q1)

**Facts from Cube 1.7.45:**

- **Default deny.** "When you define access policies for specific groups, access is automatically denied to all other groups" [r-dap] L19–23.
  - In code: when no applicable policy grants a queried member, the query gets the segment `1 = 0` (`rlsAccessDenied`) and `denied: true` [capi] L693–701, L755–763.
  - That applies only to cubes with policies. With none, RBAC is off for the cube [ceval] L1105–1107, and it is "fully open" [d-apv] L46.
  - `isRbacEnabled()` is model-wide and cached for each compile [ceval] L1109–1116. When it is false, `applyRowLevelSecurity` and the meta patch return at once [capi] L501–503, L994–996.
- **`group:` / `groups:`.**
  - A policy matches when the context's groups contain its group, or any of its `groups`, or `'*'` [capi] L393–398, L443–455.
  - Joi requires exactly one of `group` and `groups` [cval] L1141–1153.
  - Conditions (`if`) see only `securityContext`, not the output of `contextToGroups` [csym] L1179–1193.
- **`contextToGroups`** supplies the group set. When it is unset, the set is empty [capi] L386–391.
  - It is called on each cache miss, per cube, per request [capi] L424–428.
  - It can't deny anything by itself. It only feeds policy matching [r-cfg] L1501–1526.
- **`queryRewrite`** runs *after* `applyRowLevelSecurity`, and is skipped when that denied [gw] L1480–1490.
  - Throwing blocks the query [r-cfg] L967–987.
  - "There's no built-in way to access the data model metadata in `query_rewrite`" [r-cfg] L989–995.
  - It doesn't touch `/v1/meta` ([gw] L771–821 never calls it).
- **Views** are a boundary for *members*: through a view, a cube's member-level rules are skipped [capi] L510–525, L640–646, [d-dap] L185–187.
  - The cube's policies still have to *apply* to the user. If none do, `grantingPolicies` is empty and the query is denied [capi] L693–701.
  - Row filters of the view and its cubes are ANDed [capi] L765–771, L791–797, [t-rbac] L151–159.
- **`public` via `COMPILE_CONTEXT`** is evaluated once per `contextToAppId` key [r-ctxvars] L831. A per-group-set `public` would mean one compile per distinct group set.

**How xcube can apply each option without editing authors' files.**
- xcube serves the published model to Cube (AD 1, through `repositoryFactory`), so it can add policy blocks to what Cube compiles while wechart keeps the authored versions.
- Config hooks (`contextToGroups`, `checkAuth`, `queryRewrite`) are functions in `cube.js`, which xcube can supply.
- A `CompilerApi` subclass goes in through `createCompilerApi` [core] L761–794.

| Option | How xcube applies it | ANDed with authored policies? | Hides from `/v1/meta`? | Permission change | Fails… |
|---|---|---|---|---|---|
| **A. Baked gate policy** (`groups: [allowed(F)]` on each cube and view) | Injected into served files | **No.** It's ORed. An allowed user gets every member and row even where authored rules restrict them [capi] L739–741 | Yes | Regenerate and **recompile the whole model** on every Cube instance | Closed (group lists are in the model) |
| **A′. A + authored `group(s)` moved into conditions over `securityContext.groups`** | Rewrite every authored policy | Yes, unless something inherited through `extends` (below) | Yes | Recompile | Closed; group names must be escaped inside expressions |
| **B. Admission list in the security context + gate condition** (`checkAuth` writes the admitted folder ids; each policy gets `if: "{ securityContext.<key>.includes('<folderId>') }"`; a gate-only policy goes on cubes without policies) | Injected into served files, plus a custom `checkAuth` (and `checkSqlAuth` if the SQL wire API is on) | Yes for the cube's own policies. **Not for policies inherited through cross-folder `extends`** [csym] L497–509 | Yes | No recompile | Closed, by `TypeError` (a 500 rather than a clean deny) if the key is missing |
| **C. `CompilerApi` subclass gating `getApplicablePolicies`, plus a reserved-group marker on every cube and view** | Subclass through `createCompilerApi`; marker injected into served files | **Yes, including `extends` and views**: gated by the cube's own name | Yes | No recompile | Closed for cubes that have only the marker (the reserved group matches nobody). Authored-policy cubes fall back to their authored rules only if the subclass is missing |
| **D. `queryRewrite` wrapper** (member-name prefix to folder) | Config function | n/a (a separate check) | **No** | Immediate | Doesn't see a view's cubes or the cubes referenced inside member-expression SQL; skipped on denial [gw] L1487–1490 |
| **E. Synthetic groups from `contextToGroups`** (`xcube:f:<id>` per admitted folder) | Config function | Only for cubes without authored policies; can't AND | Yes | No recompile | Subsumed by C |
| **F. `public` + `COMPILE_CONTEXT` per group set** | `contextToAppId` per group set | n/a | Yes | Recompile for each group set | Not viable: each compile of the 6,000-cube spike model took 13.8–46.7 s and peaked at 1.2–5.5 GB [x-cm] L7–8, [x-lc] L10, L12 |

**Notes on A, B and D:**

- **A widens authored rules.**
  - A member granted by any allow-all policy has no row restriction [capi] L736–741. A user allowed by the gate would therefore bypass an authored `row_level`.
  - A also puts `|allowed(F)|` group names into every cube and view. Added size ≈ (cubes + views) × |allowed| × (name length + ~4) bytes. For example, with the spike's 7,200 cubes and views, 100 groups of 30 characters each add about 24 MB to a 13.9 MB model (arithmetic, [x-cm] L7).
- **B leaks through `extends`.**
  - A cube's effective policies are its parent's policies followed by its own, concatenated [csym] L497–509.
  - A child in `/A/B` that extends a parent in `/A` inherits policies gated on `/A`. `allowed(/A)` ⊇ `allowed(/A/B)` (see §2), so the inherited policies admit users the child's own gate would refuse.
  - A condition can't name "the cube I'm evaluated for": cube references are refused in conditions [csym] L1185–1187.
  - So B needs cross-folder `extends` of any cube with policies refused at publish.
- **D can't be the gate.**
  - Metadata stays visible.
  - It sees only the surface of the query, while Cube's own check uses the compiled query's `memberNames` [capi] L505–508.
  - It would be a second implementation of the rule, one that can drift from the first.

### 2. Composition with authored policies (Q2)

**Cube's rules as they stand:**
- Across matching policies, **members are unioned**.
- Each member's rows are the OR of its granting policies' row filters, and rows are **intersected across queried members** [d-dap] L104–115, [capi] L670–753.
- A policy with no `row_level` means all rows [d-dap] L172–177.
- Within one policy, several filters are ANDed [capi] L659–664.
- Cube and view row filters are ANDed [d-dap] L197–204, [t-rbac] L151–159.
- `queryRewrite` filters are ANDed with policy filters [d-dap] L199–201.
- Member-level rules are ANDed with `public` [d-dap] L179–183.
- Through a view, only the view's member-level rules apply [d-dap] L185–187.

**Why the gate must sit outside Cube's OR.** Any policy sitting beside authored ones is ORed with them. An AND therefore needs one of:
- conditions on every policy (option B); or
- a filter in front of `getApplicablePolicies` (option C).

**With C, for a cube K in folder F:**
- The effective policies are
  `gate(F, groups) ? (authored(K) is non-empty ? CubeApplicable(authored(K)) : [allow-all]) : []`.
- Authored `group: "*"` applies only after the gate.
- A policy naming the reserved marker group matches nobody, because `contextToGroups` strips that name. xcube can also refuse publishes that name it.
- Inherited policies are gated by the *child's* folder, because the gate keys on `cube.name`.

**Views.** For a view V in F over a cube K in F′:
- V's gate and K's gate both apply, because `applyRowLevelSecurity` runs for every cube in `queryCubes`, including the view's cubes [capi] L533–537.
- V's member-level rules apply, K's are skipped, and both sets of row filters apply.
- If K's authored policies don't match the user, the query is denied even through V [capi] L693–701. That is Cube's existing behaviour, not something the gate adds.

**Why the gate never refuses a cube the binding rules let a user reach.** This is derived from the requirement text:
- `allowed(F)` = grants on F, on F's ancestors and on F's descendants, plus the Super-Admin group [w-req] L475–477.
- For any ancestor F′ of F, every folder counted for F is also counted for F′, so `allowed(F′) ⊇ allowed(F)`.
- Items bind names only along their own folder path, nearest first, never to a descendant [w-req] L542–548.
- So every cube reachable from a cube or view in F lives in F or an ancestor. Admission to F implies admission to all of them, and AC-320's second "Fails when" (a `/A/B` member refused the `/A` cube their chart uses) can't happen.

### 3. What a token that a generated policy denies sees (Q3)

| Endpoint | Denied cube or view | Source |
|---|---|---|
| `/v1/meta`, `?extended`, `onlyViews`, SQL-API schema | **Left out.** No applicable policy hides every member. A cube with no visible measure, dimension or segment is dropped. View groups are pruned to visible names. `compilerId` is mixed with a visibility hash | [capi] L986–1072, L1100–1109; [gw] L721–736, L744–769, L799–806, L823–856; [sqlsrv] L166–196 |
| Measured in spike A (policies on all 6,000 cubes + 1,200 views) | A token for about 10% of folders saw 1,908 of 7,200 cubes and views | [x-res30] L38–43, [x-bench] L43–47, L86–87 |
| `/v1/load` (production) | The SQL runs with `1 = 0`: a round trip to the source, or to Cube Store if a rollup matches [t-denied] L4–8, L54–80. Then the result transform fails with "You requested hidden member: '…'", because the member isn't in the visibility-filtered annotation. HTTP 500 was observed on 1.7.42 [w-ac] L263; this path has not changed (no 403 message exists in the 1.7.45 source) | [gw] L2132–2170; [qrt] L303–352, L374–377, L383–388 |
| `/v1/load` in dev mode | Data with zero rows, or a `count` of `"0"`, not an error. In dev mode the annotation holds every member | [gw] L722–724; [t-rbac] L1832–1839; snapshot L94–97 |
| `/v1/cubesql`, SQL wire API | The table is missing from the SQL-API schema. Through `sqlApiLoad`, an empty result | [gw] L2232–2254; [w-ac] L383 |
| `/v1/sql` | **200**, with the cube's full generated SQL (tables, expressions, joins) plus `1 = 0`. No annotation check runs | [gw] L1557–1599; [capi] L755–763 |
| `/v1/dry-run` | **200**. RLS runs without throwing. The returned `normalizedQueries` probably carry the `rlsAccessDenied` segment (see Corrections). A cube that doesn't exist errors instead, so dry-run tells denied names from missing ones | [gw] L1463–1485, L1532, L1819–1850 |
| `/graphql` | **Every cube is listed.** The schema is built unfiltered and cached ("Cache unfiltered schema - RBAC enforcement happens at query execution time"). Execution goes through load and is denied | [gw] L339–373 |

### 4. Super-Admin, service credential, refresh worker (Q4)

**Super-Admin group: admit it through the allowed sets, and add no bypass.**
- wechart works out each allowed set, including the Super-Admin group, and sends it with the tree [w-req] L474–477. xcube then needs no special case.
- Requirements say authored row-level policies "still apply inside" [w-req] L479, and name no Super-Admin exception.
- A bypass would make a Super-Admin token a key to every row, whatever the authors wrote.
- If Super-Admins should get past authored policies too, the subclass could return allow-all for that group. That is a requirement change (Open questions).

**Service credential: don't admit it to the gate.**
- None of its own-behalf calls go through policy evaluation:
  - `applyRowLevelSecurity` has one caller, `getNormalizedQueries` [gw] L1481. It serves only `sql`, `dryRun`, `stream`, `load` and `sqlApiLoad` [gw] L1573, L1825, L2066, L2133, L2247.
  - Builds call `compilerApi.getSql` directly [rs] L150, L382.
  - Data-source introspection uses no model, `queryRewrite` or policy [w-intro] L257.
  - System-partition routes are authorized by the playground secret, and `preview` skips row filters [w-sp] L48, L344.
- **The exception is model metadata.** wechart's Jobs and Schedules read `/v1/meta?extended` today (`packages/api/src/jobs/schedules.ts` L13–16). With the gate on every cube, a service context without groups would see nothing there. Two ways to handle it:
  - **Recommended:** serve own-behalf model reads from an xcube admin route. It reads the compiled model in-process with `metaConfig({ skipVisibilityPatch: true })` [capi] L1081–1098, behind xcube's admin auth. Cube's query and meta path then has no bypass at all.
  - **Alternative:** the subclass returns allow-all for a verified service context, and `contextToApiScopes` gives that context no `data`, `sql` or `graphql` scope. This puts a bypass inside the policy path.

**Refresh worker.**
- Its contexts carry no groups, and it doesn't need them: pre-aggregations are built without RLS [rs] L150, L382.
- Row filters and the denial segment apply on top of rollups at query time [t-denied] L4–8. The gate adds no filter, so it doesn't change rollup matching.
- For one flat model, a single `scheduledRefreshContexts` entry is enough; the hook's purpose is to supply contexts for app ids that depend on the security context [r-cfg] L855–868.
- The worker still serves the whole REST API [w-sp] L362. Run it from xcube's image ([x-readme] L35–37 allows either image) and keep its API unreachable.

### 5. Scale (Q5): 100–200 folders, hundreds of groups per user

**Cost of the gate itself (option C):**
- Per request, per cube with a policy that Cube evaluates:
  - one map lookup, cube to folder;
  - one admission check, memoized per request and folder: the intersection of the user's groups with `allowed(F)`, iterating the smaller set.
- At most about 200 such checks per request, each with at most min(|user groups|, |allowed(F)|) set lookups.
- No group lists in the model, so no recompile on permission change.
- These are operation counts, not timings. Timings are unmeasured (Open questions).

**Cube's own costs, which already apply once any cube has a policy (wechart's seed `secured_orders` has one):**
- `applyRowLevelSecurity` plans the query once more, just to collect member names [capi] L505–508.
- **Every `/v1/load` and `sqlApiLoad` patches visibility over every cube with a policy**, not only the queried ones [gw] L2146–2151, L2250–2254, [capi] L998–1057. That includes:
  - one `getApplicablePolicies` per cube, and with it one `contextToGroups` plus a new `Set` per cube [capi] L386–391, L424–428;
  - a sorted `JSON.stringify` over every member's visibility, then a sha256 [capi] L1054–1057.
  - That this makes `/v1/load` cost about as much as `/v1/meta` is an inference; only `/v1/meta` was measured.
- **Measured end-to-end `/v1/meta`** at 6,000 cubes + 1,200 views, all with policies of 2–4 groups:

  | Token | Warm | Visible cubes and views | Response size |
  |---|---|---|---|
  | 26 groups | 207 ms | 1,908 | 14 MB |
  | 201 groups | 470 ms | 7,200 | 55 MB |

  Sources: [x-res30] L38–50, [x-bench] L44–47, [x-gen] L77–98, L121–124.
- **The RBAC cache doesn't help across requests.** It is an LRU of 10,000 entries with a 5-minute TTL [ccache] L18–21, keyed by cube plus an md5 of the whole context [capi] L417–427. The context includes a `requestId` taken from `x-request-id` or `traceparent`, or else a fresh uuid [rp] L14–16, [gw] L2481–2494. One meta call over 7,200 cubes fills 72% of the cache.

**Mitigations, all in the subclass:**
- Memoize `getGroupsFromContext` per context object.
- Memoize the patched `metaConfig` per (compiler version, stable hash of the security context without `exp`/`iat`/`nbf`, permission-map version). Tokens carry groups only, so in practice the key is the group set.
- Both need a benchmark before they're relied on.

**Option A's recompile cost, for comparison.** Every permission change would recompile the whole model: 12.4 s for the spike's version switch [x-res30] L56–60, L72–77. Requests after a version change wait for the new compile [capi] L216–240.

**Group counts:**
- 20 groups (AC-255) cost nothing noticeable.
- Hundreds of groups mainly threaten **token size**. Node's default HTTP header limit is 16 KiB [node-cli], and the search found no `maxHeaderSize` setting in Cube's packages.
- Arithmetic: a JWT payload grows by 4/3 when base64url-encoded, so roughly 12 KB of JSON reaches the limit. With 30-character group names that is about 370 groups.
- This belongs to `tokens-and-service-credential.md` (Open questions).

## Recommendation

Use **option C**. It is the only one that is ANDed with authored policies exactly, including through `extends` and views, and that fails closed. It needs no recompile when permissions change, and keeps group lists out of the model.

1. **Marker.**
   - With security on, xcube appends `- group: <reserved name>` (for example `xcube.folder-gate`) to the `access_policy` of every cube and view in the files it serves Cube. It appends into the author's existing list, under the author's own key (see Gotchas on `access_policy`/`accessPolicy`).
   - This makes `isRbacEnabledForCube` true everywhere [ceval] L1105–1116. Joi accepts a policy with only `group` [cval] L1141–1153.
   - With security off, nothing is injected and the gate is off [w-req] L478.
2. **Invariant at publish.**
   - After xcube's whole-model compile (AD 6), assert that every compiled cube and view's `accessPolicy` contains the marker. Refuse the publish if one doesn't.
   - This also covers files xcube can't rewrite. wechart's editor authors YAML (spec F15); whether JS, Python or Jinja models may be published is an open question.
3. **Gate.** `IntrospectionServerCore` overrides `createCompilerApi` [core] L761–767 to return the subclass below. This sketch is untested; the signatures are the load-bearing part.
   ```ts
   class FolderGateCompilerApi extends CompilerApi {
     private readonly groupsByContext = new WeakMap<object, Promise<Set<string>>>();

     // CompilerApi.ts L386–391: memoize per request context
     protected override getGroupsFromContext(context: any): Promise<Set<string>> {
       let groups = this.groupsByContext.get(context);
       if (!groups) { groups = super.getGroupsFromContext(context); this.groupsByContext.set(context, groups); }
       return groups;
     }

     // CompilerApi.ts L424–460
     protected override async getApplicablePolicies(cube: EvaluatedCube, context: any, compilers: Compiler): Promise<any[]> {
       if (!gate.enabled) return super.getApplicablePolicies(cube, context, compilers);
       const folder = gate.folderOf(this.compilerVersion, cube.name); // map from the compiled model version
       if (folder === undefined) return [];                          // unknown to xcube: deny
       if (!gate.admits(folder, await this.getGroupsFromContext(context))) return [];
       const authored = (cube.accessPolicy ?? []).filter((p) => p.group !== GATE_MARKER);
       return authored.length > 0 ? super.getApplicablePolicies(cube, context, compilers) : [ALLOW_ALL]; // ALLOW_ALL = Object.freeze({})
     }
   }
   ```
   - An empty policy `{}` grants every member on every row, in queries [capi] L640–643, L666–668, L703–708 and in metadata [capi] L1010–1013.
   - `compilerVersion` is the schema version the instance compiled [capi] L137, L231–237.
4. **`contextToGroups`** stays as in `infra/cube/cube.js` L111–114, plus dropping the reserved name.
5. **Self-test at startup.**
   - Compile a canary model and check that the override runs: a canary cube with authored `group: "*"` must be denied to a context that isn't admitted.
   - xcube already pins one Cube version and refuses others [x-readme] L22–24. Its typecheck catches changed protected methods [x-readme] L208–211, and `override` makes a renamed method a compile error.
6. **Scopes.** Drop `graphql` from user tokens unless wechart uses it: its schema lists every cube [gw] L350–360.
7. **Service credential and refresh worker:** as in §4.

**Tests that should fail first (TDD), against a compose Cube running xcube:**
1. A group granted only on `/A/B` gets rows from the `/A` cube its chart is bound to (AC-320).
2. A token with no allowed group:
   - `/v1/meta` lacks the cube and its views;
   - `/v1/load` errors;
   - `/v1/sql` contains `1 = 0`.
3. An authored row-level policy on an admitted folder filters rows. An admitted user outside the authored group is denied. A non-admitted user inside the authored group is denied.
4. A child in `/A/B` that extends an `/A` cube with authored policies is denied to a user admitted only to `/A`.
5. A `/A/B` view over an `/A` cube is denied to a user admitted only to `/A`, and is absent from their `/v1/meta`.
6. A 20-group token, whose last group is the only one granted, is admitted (AC-255).
7. A permission change reaches every Cube instance without a publish, with no recompile in the logs.
8. A plain `cubejs/cube` process with the marked model denies cubes that have only the marker.
9. A Super-Admin is admitted to a folder no group reaches, and is still filtered by authored row policies.
10. A service-credential `/v1/meta` shows no gated cube, while jobs still build.

## Gotchas

- **Having no policy means open.** Put the marker on views too. Otherwise a `/A/B` view over `/A` cubes is queryable, and listed in metadata, for anyone admitted to `/A` [d-apv] L46, [capi] L533–537.
- **Keep one policy key per cube.** `camelizeCube` renames `access_policy` to `accessPolicy` by assignment, so a YAML cube carrying both keys loses one of the lists [cutils] L63–71. `CubeSymbols` also prefers `accessPolicy` when both are set [csym] L500. Append into the key the author used.
- **`extends` concatenates the parent's policies before the child's** [csym] L497–509. Harmless under C. Under B it widens.
- **Conditions:**
  - Every policy's `if` is evaluated *before* its group is checked [capi] L439–455. An `if` that throws fails the request for every user.
  - Only the second and later conditions are type-checked; the first never is [capi] L400–410.
  - Under B, the gate condition must be appended last, or a single authored condition returning `undefined` (for example a claim tokens no longer carry) starts throwing.
- **Dev mode and the playground secret get past the metadata filter.**
  - `CUBEJS_DEV_MODE` and a playground-signed `dev-token` see hidden members [gw] L721–725.
  - Keep `CUBEJS_DEV_MODE=false` and `NODE_ENV=production` (compose L105–106).
  - The playground secret accepts *any* security context on the main API, and its `preview` route skips row filters [w-sp] L344–348. Whoever holds it can claim the Super-Admin group, so it gets around the gate.
- **REST denial is a 500 with "You requested hidden member"**, not a 403 [qrt] L303–318. In dev mode it's empty data instead [t-rbac] L1832–1839.
- **A denied query still runs `WHERE 1 = 0`** against the source or Cube Store [gw] L2153–2166, [t-denied] L54–80.
- **`/v1/sql` exposes a denied cube's SQL, and `/v1/dry-run` distinguishes denied from missing names** (§3). Only wechart's server calls Cube (AD 10), and it authorizes first.
- **Cubes used only as a join hop may skip their policies (inferred, not tested).**
  - `memberNames` gathers member references, including those in join SQL [bq] L2881–2891, L3328–3344, L3350–3356.
  - A join written `{CUBE}.x = {b}.id` names the cube `b`, not one of its members. So `b` may never enter `queryCubes`, and its authored policies may not run.
  - The gate is still implied through ancestors (§2), but authored policies on hop cubes may not apply.
- **HA.** The gate is evaluated in each Cube process. Allowed-set pushes must reach every instance, and revocation takes effect as each instance receives the push (AD 11).
- **The gate protects cubes, not tables.** An author can write a new cube over any table a data source on their path can read.
- **Metadata judges a view by its own policies**, not its cubes' [capi] L998–1040. If binding ever let a view include a cube from off its path, the view would be listed while its queries came back empty.
- **Corrections to sibling docs:**
  - **`access-control.md` L304, L359, L380** say `/v1/dry-run` returns queries "before RLS". But `applyRowLevelSecurity` pushes the denial segment and the RLS filter onto the normalized query **in place** [capi] L755–761, L794–797. That same object is what dry-run returns [gw] L1463–1466, L1481–1485, L1532, L1825. The upstream 1.7.42 source mutates in place too (checked on GitHub).
    - So dry-run's queries should carry the policies' filters and the `rlsAccessDenied` segment. Only a `queryRewrite` that returns a new object would be missing.
    - This is inferred and should be checked with a probe. Don't rely on either reading.
  - **`access-policy-evaluation.md` L22–23**, on which conditions are type-checked: the rule is position, not count. The first condition is never checked and later ones are [capi] L400–410. Also, conditions are evaluated for policies whose group doesn't match [capi] L439–441.
  - **`access-policy-evaluation.md` line references** point at the 1.7.42 compiled `dist` files. The 1.7.45 TypeScript lines are the ones cited here.

## Open questions / unverified

- **UNVERIFIED by running:** the view-cube denial (test 5), the dry-run contents, the `/v1/sql` 200 on denial, the 500 on 1.7.45, and join-hop policies. All are read from source only.
- **UNVERIFIED timings:** the admission check, and `/v1/load`'s whole-model visibility patch at 6,000 cubes. The spike measured `/v1/meta` only. `plan-probe.js` has no results file.
- **Decision for the user:** should Super-Admins get past *authored* policies? Requirements name no exception [w-req] L479.
- **Decision for `tokens-and-service-credential.md`:**
  - an xcube admin route versus an allow-all service context for own-behalf model reads;
  - tokens with hundreds of groups against Node's 16 KiB header limit, including whether wechart may leave out groups that no grant and no authored policy names (AC-326 says "their groups").
- **Overlays (AD 8):** each overlay item's folder must be in the cube-to-folder map. The overlay's own audience check (author, the target folder's read-write members, Super-Admins) is a separate gate, not covered here.
- **Other model formats:** whether JS, Python or Jinja files may be published. Marker injection is defined here for YAML. For the rest, the publish-time invariant refuses them rather than handling them.
- **Pushes:** how allowed-set pushes reach every Cube instance, and in what order. That belongs to xcube's admin-API research.
- **GraphQL:** whether wechart needs the `graphql` scope on user tokens at all.

[pkg]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/package.json
[capi]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/CompilerApi.ts
[core]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/server.ts
[rs]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/RefreshScheduler.ts
[ceval]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[csym]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[cval]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[cutils]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/utils.ts
[ccache]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CompilerCache.ts
[bq]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[gw]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/gateway.ts
[rp]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/request-parser.ts
[sqlsrv]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/sql-server.ts
[qrt]: /Users/srajagopal/Work/bi/cube/rust/cube/cubeorchestrator/src/query_result_transform.rs
[t-rbac]: /Users/srajagopal/Work/bi/cube/packages/cubejs-testing/test/smoke-rbac.test.ts
[t-denied]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/test/integration/postgres/pre-aggregations-access-denied-segment.test.ts
[d-dap]: /Users/srajagopal/Work/bi/cube/docs-mintlify/docs/data-modeling/data-access-policies.mdx
[r-dap]: /Users/srajagopal/Work/bi/cube/docs-mintlify/reference/data-modeling/data-access-policies.mdx
[d-apv]: /Users/srajagopal/Work/bi/cube/docs-mintlify/docs/data-modeling/access-policies-viewer.mdx
[r-cfg]: /Users/srajagopal/Work/bi/cube/docs-mintlify/reference/configuration/config.mdx
[r-ctxvars]: /Users/srajagopal/Work/bi/cube/docs-mintlify/reference/data-modeling/context-variables.mdx
[x-readme]: /Users/srajagopal/Work/bi/cube/cube-introspection/README.md
[x-server]: /Users/srajagopal/Work/bi/cube/cube-introspection/src/server.ts
[x-gen]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/gen.js
[x-bench]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/server-bench.js
[x-res30]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30.json
[x-cm]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/compile-matrix.jsonl
[x-lc]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/linux-compile.jsonl
[node-cli]: https://raw.githubusercontent.com/nodejs/node/main/doc/api/cli.md
[w-req]: /Users/srajagopal/Work/wechart/docs/requirements.md
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md
[w-ac]: /Users/srajagopal/Work/wechart/docs/research/cube/access-control.md
[w-sp]: /Users/srajagopal/Work/wechart/docs/research/cube/system-partitions.md
[w-intro]: /Users/srajagopal/Work/wechart/docs/research/cube/introspection-api.md
