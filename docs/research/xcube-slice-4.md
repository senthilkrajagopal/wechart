---
library: xcube slice 4, the folder gate and RS256 tokens (the user's Cube fork)
packages: [xcube]
version: 'xcube at 6d1e2e3ba1 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962
  - https://github.com/senthilkrajagopal/cube/commit/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962.diff
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962
  - https://github.com/senthilkrajagopal/cube/blob/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/README.md
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/runtime/runtime.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/store/revisions.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/security/verifier.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/test/image/serving.sh
  - https://github.com/senthilkrajagopal/cube/actions/runs/36259417372
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions
  - https://github.com/users/senthilkrajagopal/packages/container/package/xcube
  - /Users/srajagopal/Work/bi/cube/xcube/src/security/gate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/security/marker.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/security/tokens.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/security/verifier.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/listener.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/security.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/permissions.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/security.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/gateway.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/config.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/CompilerApi.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/adapter/BaseQuery.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/rust/cube/cubeorchestrator/src/query_result_transform.rs (fork source at v1.7.45)
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-testing/test/smoke-rbac.test.ts
  - /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-slice-4-contract.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1200-slice-4-built.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3b.md
  - /Users/srajagopal/Work/wechart/docs/research/cube/generated-policies.md
  - /Users/srajagopal/Work/wechart/docs/research/cube/tokens-and-service-credential.md
---
# xcube slice 4: the folder gate and RS256 tokens (xcube at 6d1e2e3ba1 on Cube v1.7.45)

This doc is the sibling of [x3a] and [x3b]. It covers one commit, `6d1e2e3ba1`, "feat(xcube): folder gate and RS256 tokens (slice 4)". It checks every claim in the raw input [in] (`docs/inputs/2026-09-26-xcube-slice-4-contract.md`) and in xcube's summary [sum]. It also lists what slice 4 changes in [x3a] and [x3b], and what it confirms or contradicts in [w-gp] and [w-tok].

## Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube`.
  - That ref and `refs/remotes/fork/feat/xcube` are both `6d1e2e3ba1bc3bdeab1f96412015757bb22b2962` ([head]; [fork-ref]).
  - The reflog's last entry is `commit: feat(xcube): folder gate and RS256 tokens (slice 4)`, whose parent is `c0610bb768…` ([reflog] L8).
  - The author date is 2026-09-26T17:32:53Z ([c4]).
- **What the commit contains.** 26 files, +2808 −83 ([p4], the diffstat):
  - `README.md`, and `package.json` (version `1.7.45-2` → `1.7.45-3`, [d4]);
  - `src/admin/auth.ts`, `src/admin/routes.ts`, `src/config.ts`, `src/gateway.ts`, `src/server.ts` and `src/names/items.ts`;
  - `src/runtime/listener.ts`, `src/runtime/runtime.ts` (+355 −10) and `src/runtime/settings.ts`;
  - `src/store/db.ts`, `src/store/migrations.ts` and `src/store/revisions.ts`;
  - the new `src/security/gate.ts`, `marker.ts`, `tokens.ts` and `verifier.ts`;
  - `test/image/serving.sh`;
  - the new `test/integration/permissions.test.ts`, `test/integration/security.test.ts` and `test/unit/security.test.ts`;
  - changes to `test/unit/admin.test.ts`, `config.test.ts`, `gateway.test.ts` and `runtime.test.ts`.
- **The working tree is not at the commit.** It carries uncommitted work:
  - **Slice-5 overlays.**
    - `src/overlays/rollups.ts` and `test/unit/overlays.test.ts` exist (Glob) but aren't in the commit ([p4]).
    - The working `migrations.ts` has a migration 5, `overlays` (working L163-188). The commit's migrations hunk ends at migration 4 ([d4] `@@ -123,6 +123,43 @@`).
    - "overlay" appears 231 times in 16 working-tree files (Grep). The committed `runtime.ts`, `revisions.ts` and `verifier.ts` contain none of it ([rt@c], [rev@c] and [ver@c], each fetched and searched).
  - **At least two other post-commit edits.**
    - The working-tree `unverified` also strips `xcubeModule` from a security context. The committed one strips only `xcubeRole` ([rt@c] `unverified`).
    - The working tree loads a model's permissions before serving it (working `runtime.ts` L1807-1810). The fetched commit has no such text ([rt@c], searched for "Never served before its permissions are known").
  - **So don't build this tree.** Use the published image (Install).
- **How I cite.**
  - **Files unchanged since the commit** are cited with working-tree lines, which are the commit's. How I checked each:
    - `security/gate.ts`, `marker.ts` and `tokens.ts` are new files. Their working-tree line counts (71, 80, 221) equal their additions in [p4].
    - `admin/auth.ts`: its hunk `@@ -1,37 +1,55 @@` is the whole 55-line file, and the text matches ([d4]).
    - `server.ts`, `store/db.ts`, `gateway.ts` and `names/items.ts`: every hunk's position and text match the working tree ([d4]).
    - `store/migrate.ts` is not in the diff ([p4]).
    - `test/integration/permissions.test.ts` (192 lines) and `security.test.ts` (375 lines) are new files whose line counts equal their additions. Neither contains "overlay" (Grep).
    - The slice-4 block of `test/image/serving.sh`, fetched at the commit, matches working-tree L143-170 ([sh@c]).
  - **Files that differ** are cited with the **commit's** line numbers. I computed them from the diff's hunk headers, after checking each hunk's text against the working tree:
    - `admin/routes.ts`: the working tree is the commit + 7 lines for L15-142, and + 14 from L145.
    - `config.ts`: + 7 from L19.
    - `runtime/settings.ts`: + 2 at L33, + 21 for L35-133, and + 27 from L134.
    - `security/verifier.ts`: + 2 for L29-166, + 3 for L167-173, and + 5 from L174. The commit has 206 lines ([p4]).
    - `runtime/listener.ts` and `store/migrations.ts`: the hunk lines.
  - **By symbol.** `runtime.ts`, `revisions.ts` and `README.md` are cited by method or section at the commit, from the raw files fetched at the full SHA.
  - **Unit tests.** `test/unit/security.test.ts`, `gateway.test.ts` and `config.test.ts` are cited by test title. The working-tree `unit/security.test.ts` has 238 lines against the commit's 230.
  - **A caution about the fetch tool.** Asked to reproduce the `revisions.ts` diff, it returned a second half that matches neither the working tree nor the raw committed file. For example, it showed a `permissions()` returning `version: 0`. I used diff reproductions only where the working tree matched them independently, and read `revisions.ts` from the raw committed file.
  - **Nothing was run.** Bash wasn't available, so no `git status`, no build and no tests were run here.
- **Cube.** Cube's behaviour is cited from two places:
  - `xcube/node_modules/@cubejs-backend/*` at 1.7.45 (`native` is 1.7.45, [c-native] L3);
  - the fork's own Rust source, whose CHANGELOG tops at 1.7.45 ([c-chlog] L6).

## Summary

**What slice 4 builds** ([c4] message; [readme@c] "Permissions and tokens"):
1. **A folder gate inside Cube.**
   - xcube adds a reserved policy, `group: xcube.folder-gate`, to every cube and view it publishes. That group matches nobody ([marker] L11, L52-80).
   - A `CompilerApi` subclass then gates `getApplicablePolicies` by the item's own folder:
     - a context the folder doesn't admit gets no policy, so Cube denies it;
     - an admitted context gets the item's own policies, or all members and rows when the item has none ([gate] L47-70; [srv] L48-59).
   - Permissions are held in memory and read on every check, so a change needs no compile ([gate] L37-45; [t-sec] L300-315).
2. **Folder groups and `security`**, sent with `PUT …/folders` ([routes] L68-72, L86-89, L373-385), stored in the new `folder_groups` table ([mig] L138-143).
3. **RS256 tokens.**
   - User tokens are verified against keys pushed per model with `PUT …/keys` ([routes] L387-404; [ver] L118-177).
   - A service credential's public keys come from `XCUBE_SERVICE_KEYS(_FILE)` ([set] L36-56; [ver] L105-115, L189-205).
   - HS256 goes to Cube's own check, and only until the model has keys ([rt@c] `checkAuth`, `unverified`).
4. **Scopes by role** ([gw] L73-80, L292-329):
   - users never get `jobs`, `introspection` or `graphql`;
   - the service credential gets `jobs` and `introspection` only.
5. **`GET …/meta`**, an unfiltered field list behind admin auth ([routes] L415-425; [gw] L366-404).
6. **Other changes:**
   - `CUBEJS_PLAYGROUND_AUTH_SECRET` is ignored while serving ([srv] L68-74);
   - refused tokens are logged as fingerprints ([gw] L352-358);
   - migration 4 ([mig] L126-162).

**What it means for wechart** (the IDs are from [sum] L4 and [w-spec]):
- **AC-320 (T436).**
  - Send `allowedGroups` on every folder with `PUT …/folders`, and in items snapshots.
  - Turn `security` on with `PUT …/folders`. An items snapshot can't carry it (Gotcha 1).
  - Security needs an items-mode model, and wechart's xcube client is still files-mode today ([w-xc] L111-213).
- **AC-326, AC-008 (T437).**
  - Sign user tokens RS256 with the claims under "User tokens".
  - Push the key set with a rising `version`.
  - Use the service token for admin routes, jobs and introspection.
  - Every current `CubeClient` token is HS256 ([w-client] L357-385), and after the model's first key push each one is refused.
- **AC-166, AC-167, AC-168.**
  - A preview becomes an RS256 user token. Only its `groups` reach Cube ([ver] L167-176). Today a preview passes arbitrary claims ([w-client] L373-375, L407-414).
  - A denied query still answers 500 "You requested hidden member", which wechart already reads as "unavailable" ([w-tile] L1-18).
- **Jobs and Schedules (AC-149 and T155's builds).**
  - Read `GET …/meta?extended=true`.
  - Post jobs, and read their state, with the service token. A user token no longer has `jobs` ([t-sec] L317-322).
- **AC-250.** Introspection moves to the service token. wechart's HS256 introspection token names the model, so it is refused once that model has keys ([w-client] L248; [rt@c] `unverified`).
- **AC-145.** `/cubejs-system/*` is not served ([t-sec] L260-261). T151's plan to read partitions from it no longer works ([w-tasks] L2784-2791). There is no xcube replacement route ([routes] L373-427 lists none).
- **AC-333.** A new image, by digest (Install).

## Install

- **No npm dependency in wechart for xcube.** The only import is still `require('xcube')` in the Cube image's `cube.js` ([w-cube] L17). wechart signs with `jose` 6.2.12, which [w-tok] "Install" covers. This doc adds no package.
- **The image.** Pull by digest:
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-6d1e2e3ba1@sha256:8df2c818d1670a7cd226b6951a8c448c2e8632a338706e155d5d8948700a174e
  ```
  - **The digest.** The package page shows this version tagged both `v1.7.45-6d1e2e3ba1` and `v1.7.45-feat-xcube`. The package is public ([ghcr]; [ghcr-pkg]).
  - **Platform manifests** ([ghcr-pkg]):
    - linux/amd64 `sha256:3f7fc1b13b22c2d5ed69dbfc49f26cf42a70b6b2fb901ae89ea848dd2fa835ef`;
    - linux/arm64 `sha256:45b780518aae9d65a8adf8e2af67201c99099ec6f3e027f860b8ccf14957f86c`;
    - an "unknown/unknown" `sha256:7f030caba6…`. UNVERIFIED that it is a build attestation.
  - **CI.** Run 36259417372 concluded success ([checks]; [run-jobs]):
    - job `test` ran 17:33:00–17:35:21Z, including the step "Test, with the live-database suites";
    - job `image` ran 17:35:23–17:37:17Z, including "Serves models from xcube's schema, imported through its admin API", "Publish, for amd64 and arm64" and "Name what was published".
    - Per-test output and the step summary were not viewed.
  - **What that image check covers.** `serving.sh` pushes keys and folder groups with a service token, then checks each of these ([sh@c]; [t-img] L143-170):
    - a `g_sub` user reads;
    - a `nobody` user is refused;
    - that user's `/v1/meta` is `{"cubes":[]}`;
    - an HS256 token for the keyed model is 403;
    - `GET …/meta` lists the cube.
  - **wechart's image references are still slice 2.** compose (L153, L183) and Helm (`values.yaml` L66; `docker-desktop.yaml` L25) pin `xcube:v1.7.45-83cb9f0888` ([w-compose]; [w-helm-values]; [w-helm-dd]).
- **Schema migration 4 (`permissions`)** runs on first start ([mig] L126-162). It adds:
  - the table `folder_groups (model, folder_id, groups text[])`, keyed `(model, folder_id)` (L138-143);
  - on `models`: `security boolean NOT NULL DEFAULT false`, `permissions_version bigint NOT NULL DEFAULT 0` and `permissions_hash char(64)` (L147-149);
  - on `models`: `keys_version bigint` and `keys_issuer text` (L153-154);
  - the table `model_keys (model, kid, jwk jsonb)`, keyed `(model, kid)` (L155-160).
- **`minReader`.** Migration 4 declares `minReader: 2` (L132). Turning security on for any model runs `UPDATE schema_migrations SET min_reader = GREATEST(min_reader, 4) WHERE version = 4` ([rev@c] `putFolders`). No code lowers it (Grep of `src` for `min_reader`).
  - **Before security is ever on:** a 3a or 3b image logs "the schema has migrations newer than this xcube; running on" and runs ([migrate] L101-107).
    - Code before version 4 replaces a tree by deleting and inserting `folders` rows. That leaves `folder_groups` intact ([mig] L134-137; [t-perm] L117-120).
  - **After:** a 3a or 3b image exits at start with `xcube: schema <s> needs xcube schema version 4 or later to read it; this is 3` ([migrate] L95-100).
  - The only way back is the one [x3b] "Rollback" gives: drop the `xcube` schema, re-bootstrap and re-import.
- **Connection names.** Connections are now named `xcube:v4:<instanceId>` and `xcube-listen:v4:<instanceId>` ([db] L22-24, L40, L50). `SCHEMA_VERSION` is 4 at the commit ([mig] L166; the working tree says 5). That is how `older_instances` recognises older code.
- **New environment variables** ([set] L36-65, L79-85, L134-143; [readme@c] "Token-Related Environment Variables"):

| Variable | Default | Meaning |
| --- | --- | --- |
| `XCUBE_SERVICE_KEYS` | `''` | The service credential's public keys: a JWK set `{"keys":[…]}`, or PEM public keys or certificates |
| `XCUBE_SERVICE_KEYS_FILE` | unset | A file holding them instead. It wins over `XCUBE_SERVICE_KEYS` ([ver] L105-115) and is re-read on each poll ([rt@c] `refreshSecurity`) |
| `XCUBE_SERVICE_AUDIENCE` | `xcube-admin` | The `aud` of service tokens |
| `XCUBE_SERVICE_ISSUER` | unset | When set, the `iss` service tokens must carry |
| `XCUBE_TOKEN_AUDIENCE` | `xcube` | The `aud` of user tokens |
| `XCUBE_TOKEN_CLOCK_TOLERANCE_S` | `60` | Skew allowed on `exp`, `iat` and `nbf` |
| `XCUBE_TOKEN_MAX_LIFETIME_S` | `3600` (at least 1) | The longest `exp - iat`, for user **and** service tokens ([ver] L157-162, L189-195) |
| `XCUBE_HS256` | `until-keys` | `until-keys` or `off`; anything else throws at start ([set] L79-85) |

  - **Start-up.** A service key that doesn't parse stops the process at start: `xcube: the service credential's keys (XCUBE_SERVICE_KEYS[_FILE]) can't be read: …` ([rt@c] `start`).
    - Later, an unreadable file keeps the keys it had, with a warning ([rt@c] `refreshSecurity`).
  - **Admin routes** are served when `XCUBE_SERVICE_KEYS`, `XCUBE_SERVICE_KEYS_FILE` or `XCUBE_ADMIN_TOKENS` is set, and are off otherwise ([routes] L228-233).
  - `XCUBE_ADMIN_TOKENS`' rules are unchanged: at least 32 of `[A-Za-z0-9._~-]`, and never `CUBEJS_API_SECRET` ([set] L102-110).

## Init / auth pattern

### `cube.js`

- **`config()` is called as before.** `require('xcube').config({ modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' }, {...})` ([w-cube] L17-18). `config()` now always sets two things:
  - **`contextToGroups`:** `cube.js`'s own when given, else `context.securityContext.groups`. Either way it keeps only strings and drops `xcube.folder-gate` ([cfg] L70-76, L83; [t-cfg] "composes contextToGroups…").
  - **`checkSqlAuth`:** when `cube.js` has one, it is wrapped so its context loses `xcubeRole` and is refused for a model with keys ([cfg] L105-111; [t-cfg] "the SQL API's checkSqlAuth…").
- **wechart's `contextToGroups`** ([w-cube] L25-28) returns what the default returns, so it can go.
- **wechart's `contextToApiScopes`** ([w-cube] L46-51) needs no change for RS256 tokens:
  - xcube returns `['jobs', 'introspection']` for a service context, whatever `cube.js` says ([gw] L319-321);
  - for a user context it removes `jobs`, `introspection` and `graphql` from what `cube.js` grants ([gw] L323-325).
  - Its `wechartIntrospection` branch still decides HS256 introspection tokens until the cutover ([gw] L294-313; unit test "while xcube serves, grants a verified context by role…").

### Cube's environment

- **Every Cube process runs the slice-4 image before security is turned on:** both API instances and the refresh worker. `older_instances` counts every `xcube:`/`xcube-listen:` connection to the database ([rev@c] `olderInstances`). The worker holds its own ([w-compose] L182-188).
- **`XCUBE_SERVICE_KEYS` (or `_FILE`) goes on the Cube API instances.** These serve the admin routes, jobs and introspection ([gw] L118-139). By reading, the worker verifies no token wechart sends: wechart calls only its `/readyz` and `/livez` ([w-compose] L189-192).
- **Keep `XCUBE_ADMIN_TOKENS`** until wechart's admin client uses the service token. Both are accepted while it is set ([auth] L18-40; [t-sec] L198).
- **Keep `CUBEJS_API_SECRET`.** Cube requires it with a custom check ([w-tok] Gotcha 10). It still verifies HS256 tokens until the model has keys ([rt@c] `checkAuth`).
- **Leave `CUBEJS_PLAYGROUND_AUTH_SECRET` unset.** xcube ignores it anyway ([srv] L68-74). wechart doesn't set it (Grep of `docker-compose.yml` and `deploy/helm`).
- **Keep `CUBEJS_DEV_MODE=false`.** Dev mode keeps hidden members in `/v1/meta` ([c-gw] L489-493). wechart sets `false` ([w-compose] L27; [w-helm-helpers] L153-154).
- **Leave `CUBEJS_WEB_SOCKETS` and `CUBEJS_PG_SQL_PORT` unset**, as wechart does (Grep). [readme@c] "Permissions and tokens" puts websockets and the SQL port outside the token rules.

### wechart's API: the order at start and at cutover

This is from [in] L136 and L89-90, checked against the code:
1. **Sign a service token.** RS256 with the service private key; the header carries `kid`; the claims are `aud: "xcube-admin"`, `role: "service"`, `iat`, `exp` (at most 3600 s after `iat`), and optionally `wechartModel` ([ver] L189-205; [tok] L182-221).
2. **`PUT …/keys`** with `{ version, issuer, keys }`. The answering instance loads the set before it answers ([rt@c] `putKeys` awaits `loadKeys`).
3. **Sign user tokens RS256 from then on.** From the push on, that model refuses HS256 ([rt@c] `unverified`; [t-sec] L250-251). HS256 tokens already in flight are refused at once, not at their `exp`.
4. **`PUT …/folders`** with `allowedGroups` on every folder. Add `security: true` once every Cube process runs this image.

Token shapes, as xcube checks them (load-bearing):
```jsonc
// user token (and "Preview as")
header:  { "alg": "RS256", "kid": "<kid of a key pushed for this model>" }
payload: { "aud": "xcube", "role": "user", "iat": 1790445000, "exp": 1790445300,
           "groups": ["g-sales"], "iss": "<the key set's issuer, when it names one>",
           "wechartModel": "<model>", "wechartRevision": 12 }
// service token
header:  { "alg": "RS256", "kid": "<kid in XCUBE_SERVICE_KEYS, or the PEM key's RFC 7638 thumbprint>" }
payload: { "aud": "xcube-admin", "role": "service", "iat": 1790445000, "exp": 1790445120,
           "wechartModel": "<optional: confines it to this model>" }
```
Sources: [tok] L182-221; [ver] L118-177, L189-205; [t-sec] L158-167.

## API surface we will use

### Common

- **Admin authentication** ([auth] L18-55). Every admin route takes either kind of credential:
  - `Authorization: Bearer <XCUBE_ADMIN_TOKENS entry>`, compared in constant time (L27-31);
  - `Authorization: Bearer <service token>`, when service keys are configured (L32-39).
  - **Refusals:**
    - `401 { error: "The service credential or an xcube admin token is required", code: "unauthorized" }` with `WWW-Authenticate: Bearer realm="xcube"` (L41-46);
    - `403 { error: "This service token is for model \"<m>\"", code: "forbidden" }` for a model-named service token on another model's route (L48-52).
  - **Tested** ([t-sec] L198-206):
    - a user token, an HS256 token and an expired or wrong-`aud`/`role` service token are 401;
    - a model-named service token works for its model and is 403 on another.
- **Errors** are `{ error, code, ...details }` ([routes] L239-288). New codes:

| Code | Status | Details | When | Source |
| --- | --- | --- | --- | --- |
| `invalid_permissions` | 400 | `problems: string[]` | With security on, a folder allows a group its parent doesn't | [routes] L256-258; [rev@c] `PermissionsError` L100-105, `touchPermissions` |
| `older_instances` | 409 | `instances: string[]` (application names) | Turning security on while pre-v4 xcube connections exist | [routes] L259-261; [rev@c] L107-112, `olderInstances` |
| `mode` | 409 | — | Security on for a model holding a file-set revision | [routes] L262-264; [rev@c] L114-119 |
| `invalid_keys` | 400 | — | A key that isn't an RSA public key ≥ 2048 bits for RS256 signatures, or a duplicate kid | [routes] L253-255; [rt@c] `putKeys` |
| `service_kid` | 400 | — | A pushed key's kid is a service key's | [rt@c] `putKeys`; [t-sec] L243 |
| `stale_keys` | 409 | `model, version, issuer, kids` of the stored set | A lower `version` | [routes] L397-398 |
| `conflict` | 409 | the same | The same `version` with another set | [routes] L399-400 |
| `no_keys` | 404 | — | `GET …/keys` with no set | [routes] L409-411 |
| `not_found` | 404 | — | `GET …/meta` where the gateway gave no reader | [routes] L417-419 |
| `bad_request` | 400 | — | Joi failures, including 0 or more than 10 keys (Gotcha 2) | [routes] L156-162 |

### `PUT …/folders`

- **Request** ([routes] L65-72, L86-89):
  ```ts
  { folders: { id: string; parentId: string | null; allowedGroups?: string[] }[]; security?: boolean }
  ```
  - A folder has at most 10,000 groups, each 1-256 characters. The tree still has at most 100,000 folders. `[]` is allowed.
- **What it does** ([rt@c] `putFolders`; [rev@c] `putFolders`, `replaceFolders`, `touchPermissions`). In one transaction, under the model's row lock:
  1. The tree is checked as in 3a (`400 invalid_folders`), and the model row is created if missing.
  2. With `security: true` on a model whose current revision is files-mode, the answer is `409 mode`. A model with no revision yet may turn security on.
  3. With `security: true` on a model where it is off, and any pre-v4 connection present, the answer is `409 older_instances`.
  4. **The tree is replaced, and groups are set:**
     - a folder with `allowedGroups` gets them, deduplicated and sorted;
     - a folder without them **keeps its stored groups**, unless its `parentId` changed, in which case they are deleted;
     - a new folder has none;
     - a folder removed from the tree loses its row.
  5. `security` is set when given. With `true`, `min_reader` for migration 4 is raised to 4.
  6. **The check.** With security on, every folder's groups must be a subset of its parent's. Otherwise the answer is `400 invalid_permissions`. Each problem reads `"<id> allows <up to 5 groups>, which its parent <p> doesn't"`, and the whole transaction rolls back.
     - With security off, wider child sets are stored. Turning security on later then fails ([t-perm] L124-131).
  7. **The permissions version.** A SHA-256 over `[security, [[id, groups]…]]` is compared with the stored one. Only a change bumps `permissions_version` and sends `pg_notify(<schema>_revision, {"model", "permissions": <n>})`.
- **200** `{ model, hash, permissionsVersion, security }` ([routes] L384).
  - `hash` is the 3a folder-tree hash over `{id, parentId}` only ([rev@c] `folderTreeHash`).
  - `security` is the value now in force.
- **The answering instance** reloads the permissions before it answers ([rt@c] `putFolders`: `await this.loadPermissions(model)`).
- **Tested:**
  - groups kept and sorted, and the version moving only on change ([t-perm] L89-105);
  - a moved folder losing its groups ([t-perm] L107-116);
  - the subset rule ([t-perm] L124-131);
  - `older_instances` ([t-perm] L133-143);
  - `409 mode` for a files-mode model ([t-sec] L357-366);
  - the route answer's `model` and `security` ([t-sec] L265-266).

### Items snapshot `folders`

- An items snapshot's `folders` take `allowedGroups` too, under the same rules. Its store write runs `replaceFolders` then `touchPermissions` before the unchanged check, so an unchanged snapshot can still change groups ([routes] L105-114; [rev@c] `write`).
- **The snapshot schema has no `security` key** ([routes] L105-114). Joi refuses unknown keys by default, so an items snapshot carrying `security` answers `400 bad_request` (Gotcha 1).
- **After an items snapshot** the answering instance does **not** reload permissions before answering. It learns them from its own notification, like the others ([rt@c]: `loadPermissions` is called from `putFolders`, `notified`, `refreshSecurity` and `validate`, not after `importItems`).

### `PUT …/keys` and `GET …/keys`

- **Request** ([routes] L91-103):
  ```ts
  { version: number /* integer, 1..Number.MAX_SAFE_INTEGER */; issuer?: string | null /* 1-256 chars */; keys: object[] /* 1..10 */ }
  ```
- **Checks, in order** ([rt@c] `putKeys`; [tok] L33-86):
  1. 1 to 10 keys. This is checked again in the runtime (`invalid_keys`), but the route's Joi refuses first with `bad_request`.
  2. **Each key:**
     - a JSON object;
     - `kid` of 1-128 `[A-Za-z0-9._~:+/=-]`;
     - `kty: "RSA"`;
     - `alg` `RS256` or absent;
     - `use` `sig` or absent;
     - `key_ops`, if present, only `["verify"]`;
     - no private member (`d p q dp dq qi oth k`), named but never echoed;
     - `n` and `e` present and forming a valid key of ≥ 2048 bits.
     - Failures are `400 invalid_keys`, and a kid appearing twice is `Key "<kid>" appears twice`.
  3. No kid may be a configured service kid (`400 service_kid`).
  4. **What's stored.** Each key is stored normalised as `{ kty: "RSA", kid, n, e, alg: "RS256", use: "sig" }`.
- **Versioning** ([rev@c] `putKeys`, `keySetId`). Under the model row lock, which it creates if missing:
  - a stored set with a higher `version` → `stale`;
  - the same `version` and the same identity (issuer plus the sorted `kid|kty|n|e` of each key) → `unchanged`;
  - the same `version` otherwise → `conflict`;
  - a higher `version` → the set is replaced and `pg_notify(…, {"model", "keys": <version>})` is sent.
- **Answers** ([routes] L387-404):
  - `200 { model, version, issuer, kids, applied }`, where `applied` is `false` for `unchanged`;
  - `409 stale_keys` and `409 conflict` carry the **stored** `version`, `issuer` and `kids`.
- **`GET …/keys`:** `200 { model, version, issuer, keys }`, the stored public JWKs, or `404 no_keys` ([routes] L406-413).
- **Tested** ([t-sec] L222-247; [t-perm] L183-191):
  - `404`, then `applied: true`, then `false`;
  - `409 conflict`, and `409 stale_keys` with `version: 2`;
  - the stored JWK's members;
  - refusals: `service_kid`, private members, 1024 bits;
  - two different sets pushed at once with the same version: exactly one is kept.
- **No route deletes keys.** Once a model has keys it never takes HS256 again, short of editing the database (routes L373-427 have no `DELETE …/keys`).

### `GET …/meta` and `GET …/meta?extended=true`

- **Auth.** Admin auth, as above. A user token is 401 ([t-sec] L345).
- **What it returns** ([gw] L366-404):
  - It builds an admin context `{ wechartModel: <model> }`, pinned to the active revision ([rt@c] `adminContext`).
  - It asks each module, or `all`, for `metaConfig(…, { skipVisibilityPatch: true })`, so **no policy and no gate** is applied.
  - It keeps public (`isVisible`) members only, and drops cubes left with none (`publicMembersOf`, L53-68).
  - It merges across modules as `/v1/meta` does (L205-282).
- **Shapes.**
  - Plain: `{ cubes, viewGroups?, compilerId }`.
  - `extended=true`: `{ cubes }`, with Cube's extended transforms (joins, pre-aggregations) (L383-401).
  - `extended` other than `true`/`false` is `400 bad_request` ([routes] L420-422).
- **An unknown or not-yet-loaded model** answers `403` or `503` as a query would ([readme@c] "GET …/meta"; [routes] L272-274 maps `CubejsHandlerError`).
- **Tested.** Every cube is listed, `compilerId` is a UUID, and `?extended=true` carries `preAggregations` and `joins` ([t-sec] L337-346).

### User tokens (Cube's REST routes)

- **The routing** ([gw] L336-346; [rt@c] `checkAuth`). While xcube serves models, a token whose header says `alg: RS256` goes to xcube's verifier. Any other token goes to Cube's own check, then `unverified`.
- **The verifier's checks, in order** ([ver] L118-177; [tok] L182-221):
  1. `alg` is `RS256`, and `kid` is a non-empty string.
  2. **A service kid** is verified as a service token (below).
  3. **An unknown kid** makes the instance re-read keys once, then refuses with `No key has the token's kid` ([ver] L130-136; [rt@c] `rereadKeys`).
  4. **The model.** When the token names `wechartModel`, that model must hold the kid; otherwise `The token's key is not one of its model's`.
     - When it names none, the kid must belong to exactly one model, which becomes the model.
     - Otherwise `The token must name its model in wechartModel` ([ver] L145-155).
  5. **The signature** is checked (RSA-SHA256), then the claims:
     - `exp` and `iat` numeric and present;
     - `now ≤ exp + 60`, `iat ≤ now + 60`;
     - `nbf` honoured with the same tolerance;
     - `exp - iat ≤ 3600`, with no tolerance;
     - `aud` equal to, or an array containing, `xcube`;
     - `iss` equal to the key set's issuer when one is stored ([tok] L187-219; [ver] L157-162).
  6. `role` must be `user` ([ver] L163-165).
- **The security context** is exactly `{ wechartModel, groups, wechartRevision? , xcubeRole: "user" }` ([ver] L166-176):
  - `groups` is the string members of `groups`, and `[]` when the claim is missing or not an array, so **`groups` is not enforced**;
  - `sub`, `email` and every other claim are dropped (unit test "a user's token: its model, groups and revision, and nothing else of it").
- **Refusals** are `403 { error: "Invalid token: <reason>" }` ([rt@c] `checkAuth`).
- **Tested** ([t-sec] L249-262; unit tests "a token is bound to the model whose key signed it", "a kid two models share needs the model named", "a model's key signs user tokens only…", "refuses a token signed otherwise, or with claims out of bounds"). Refused:
  - a token naming another model;
  - a wrong `iss`;
  - `role: service` under a model key;
  - an expired token;
  - a token issued in the future;
  - a lifetime of 7200 s.

### The service token

- **Its keys** are configured, never pushed ([tok] L92-132; [ver] L105-115):
  - a JWK set: each key follows the model-key rules and needs a `kid`;
  - or one or more PEM public keys or certificates: each `kid` is the RFC 7638 thumbprint, base64url SHA-256 of `{"e","kty":"RSA","n"}` ([tok] L23-27, L109-131).
  - Private PEM (`PRIVATE KEY`) is refused, and so are non-RSA keys.
  - The thumbprint is checked against RFC 7638's own example vector (unit test "RFC 7638's thumbprint, as jose computes a kid").
- **Verification.** `aud` is `xcube-admin` (or `XCUBE_SERVICE_AUDIENCE`), `iss` if `XCUBE_SERVICE_ISSUER` is set, and `role: "service"`. The context is `{ wechartModel?, xcubeRole: "service" }`: groups and everything else are dropped ([ver] L189-205; unit test "a model's key signs user tokens only; the service key service tokens only").
- **On Cube's routes** it has `jobs` and `introspection` only ([gw] L74, L319-321):
  - `/v1/load` answers `scope is missing: data` ([t-sec] L327);
  - introspection answers 200 ([t-sec] L328).
- **A model-named service token:**
  - is 403 on another model's admin routes ([auth] L48-52);
  - on `POST /v1/pre-aggregations/jobs` with `action: "post"`, every `selector.contexts[].securityContext.wechartModel` must equal its model. Otherwise the answer is `403 { error: "This service token is for model \"<m>\" and builds only its pre-aggregations" }`, with no `code` ([gw] L128-136, L146-162; [t-sec] L330-333).
  - `action: "get"` is not confined (L147).

### HS256 during and after the cutover

- **Every accepted HS256 context** goes through `unverified` ([rt@c] `unverified`):
  - `XCUBE_HS256=off` → `403 Invalid token: only RS256 tokens are taken`;
  - `xcubeRole` is removed (at the commit, `xcubeModule` is **not**: Gotcha 9);
  - a context naming a model that has keys → `403 Invalid token: model "<m>" takes RS256 tokens only`;
  - a context naming no model, once **any** model has keys → `403 Invalid token: only RS256 tokens are taken`.
- **Tested.** Security off and no keys reads as before ([t-sec] L209-220). After the push the model's HS256 is 403, and so is a no-model HS256 token ([t-sec] L250-253).
- **An `xcubeRole` claim in an HS256 token** grants nothing ([t-sec] L216-219).

### Scopes by role ([gw] L292-329)

| Context | Scopes | Test |
| --- | --- | --- |
| Service (xcube-verified) | `['jobs', 'introspection']`, ignoring `cube.js` | unit "while xcube serves, grants a verified context by role…" |
| User (xcube-verified) | `cube.js`'s, minus `jobs`, `introspection`, `graphql`; with wechart's `cube.js`: `meta`, `data`, `sql` | same; [t-sec] L321-322 |
| HS256 (no role) | `cube.js`'s; less `graphql` when the context's model has security on | same |
| Not serving (no xcube runtime) | a role in a context means nothing | unit "without xcube serving, a role in a context is nothing" |

### What the gate does on Cube's routes

**The mechanism** ([gate] L57-70; [marker] L40-43; [c-capi] L272-302):
- An item is "xcube's" when its compiled definition has a string `meta.xcube.folderId` and the reserved policy. Anything else, such as files-mode files or the disk model, gets Cube's own rules (L58-63).
- **Not admitted** → `[]`.
- **Admitted, and the item has only the reserved policy** → `[{}]`, which is allow-all.
- **Admitted, with authored policies** → Cube's own `getApplicablePolicies`, where the reserved policy matches nobody.
- **The gate runs before Cube's RBAC cache**, which is keyed by cube and context hash ([c-capi] L273-275). That is why a change applies at once ([t-sec] L300-315 compares compiler-cache keys before and after).

**`admits`** ([gate] L16-35):
- permissions not yet read on this instance → **false**;
- security off → true;
- a folder with no or empty allowed set, or a token with no groups → false;
- otherwise the intersection is non-empty.

| Route | A token none of whose groups the item's folder allows | Source |
| --- | --- | --- |
| `/v1/meta`, `/v1/meta?extended` | The item is left out. Every member is invisible, and a cube with no visible member is dropped, outside dev mode | [c-capi] L748-821, L855-862; [c-gw] L489-503; [t-sec] L272-275; [t-img] L164-165 |
| `/v1/load` | **500** with "You requested hidden member: '…'" (below) | By reading; tests assert non-200 plus the message ([t-sec] L276-278) |
| `/v1/sql` | **200**, with the item's SQL and `1 = 0` | [c-capi] L552-560; [t-sec] L279-283 |
| `/v1/dry-run` | **200**: RLS adds the `rlsAccessDenied` segment and throws nothing | [c-gw] L1330-1351, L1070; by reading, untested in the fork |
| `/graphql` | No user gets the scope, and no context on a secured model does | [gw] L323-327 |
| Jobs builds, introspection | Not policy-evaluated | [w-gp] §4 |

**How the `/v1/load` 500 happens:**
1. The query runs with `1 = 0` ([c-capi] L552-560).
2. The result is empty.
3. Cube's Rust transform checks every requested member against the annotation. The annotation is built from the visibility-filtered meta ([c-gw] L1560-1571).
4. The check fails with "You requested hidden member: '<m>'. Please make it visible using `public: true`. …" ([c-qrt] L303-318, L320-352, L374-377).
5. That plain error reaches `handleError`'s last branch, status **500** ([c-gw] L1603-1609, L1893-1901).

**Views.**
- Cube's RLS runs for every cube whose members the compiled query names ([c-capi] L227, L336-360; [c-bq] L3029-3036). Those include a view's underlying cubes, and cube and view row filters both apply ([c-rbac] L151).
- So a view query needs admission to the view's folder **and** to each underlying cube's folder. By reading; the fork tests only a view refused while its cube is admitted ([t-sec] L286-291).
- Metadata judges a view by its own folder only ([c-capi] L754-791).

### How a change reaches every instance

- **Notifications.** `PUT …/folders`, an items snapshot's folders, and `PUT …/keys` send `pg_notify` with `permissions` or `keys` ([rev@c] `touchPermissions`, `putKeys`; [lst] L3-8, L93-105).
- **On a notice** ([rt@c] `notified`, `persistently`):
  - a notice naming a new version reloads that model's permissions or keys;
  - a failed read retries after 1, 2, 4 and 8 s.
- **The poll.** Each poll runs `refreshSecurity`, which compares every model's `permissions_version` and `keys_version` and re-reads what changed, plus the service key file ([rt@c] `syncAll`, `refreshSecurity`).
  - Polls run every `XCUBE_POLL_INTERVAL_MS` (60 s) while the listener is up, and every `XCUBE_POLL_INTERVAL_DOWN_MS` (**10 s**) while it is down ([set] L116-117; [rt@c] `schedulePoll`).
- **At start**, before serving, `start()` reads every model's permissions and keys ([rt@c] `start`).
- **An unknown kid** re-reads every model's keys, at most once a second, sharing any re-read in flight ([rt@c] `rereadKeys`).
- **Tested.** A notification reaches another instance and a listener-less instance gets it by poll ([t-perm] L145-156). An instance that hasn't heard reads keys for the token that needs them ([t-perm] L164-181).

## What wechart calls today, and what slice 4 changes

| wechart code (today) | Today | Under slice 4 |
| --- | --- | --- |
| `CubeClient.#token` ([w-client] L357-385) | HS256 over `CUBE_API_SECRET`: the configured context, preview or model claims, `iat`, `exp` (300 s, L80) | Refused for the model once it has keys. Needs RS256 with `kid`, `aud`, `role`, `iat`, `exp`, and `iss` if pushed |
| `load`, `sql` with `preview` ([w-client] L133-167; [w-server] L455-456, L543) | Arbitrary preview claims (less `wechart…` and token claims, L398-414) | Only `groups` reach Cube ([ver] L167-176). AC-166 already says groups only ([w-spec] L693) |
| `buildPreAggregations`, `jobStatuses` ([w-client] L183-210; [w-build] L135, L149) | User or configured HS256 token with `jobs` from `cube.js` | Users lose `jobs`: use the service token. Contexts must name the model if the token does ([gw] L146-162) |
| `metaExtended` for Jobs, Schedules, the rollup list, and after a publish ([w-build] L128; [w-sched] L149; [w-publish] L183) | `/v1/meta?extended=true` with wechart's context | Own-behalf: use `GET …/meta?extended=true` with the service token. A user token sees only admitted items; the service token has no `meta` |
| `metaExtended` plus `dryRun` for the acceleration panel ([w-server] L518) | wechart's token | A user token keeps `meta` and `data`, filtered by the gate ([gw] L323-325) |
| `introspect` ([w-client] L238-253; [w-intro] L74) | HS256 with `wechartIntrospection: true` plus model claims | Refused once the model has keys. Use the service token, which gets `introspection` ([gw] L319-321) |
| `ask`, the scope probes ([w-client] L260-275; [w-server] L354) | HS256 | RS256 user tokens get no `jobs`, `introspection` or `graphql` |
| `cancel` ([w-client] L222-226; [w-server] L433) | wechart's token | Checks no scope ([w-tok] "Route scopes"); any accepted token |
| `xcubeAdmin` ([w-xc] L92-110; [w-main] L60-67; [w-config] L175-198) | Static `WECHART_XCUBE_ADMIN_TOKEN`; files-mode `revision`, `check`, `snapshot` | Still accepted while `XCUBE_ADMIN_TOKENS` is set. Security needs an items-mode model, and a secured model refuses files snapshots |
| `checkWithXcube` probes ([w-check] L41-71) | Files dry run with a `securityContext` | Probes run through the gate with that context, minus `xcubeRole` ([rt@c] `validate`). Files carry no `meta.xcube`, so files-mode probes are not gated ([marker] L63-67) |
| `TileUnavailable` ([w-tile] L1-18) | Reads the 500 "hidden member" as unavailable | Unchanged: the gate gives the same error |
| compose ([w-compose] L19, L27, L153, L167, L183) | Slice-2 image; `XCUBE_ADMIN_TOKENS` on `cube` only | New image; add `XCUBE_SERVICE_KEYS` to `cube`; keep `CUBEJS_API_SECRET` and `CUBEJS_DEV_MODE=false` |
| Helm ([w-helm-cube] L95-115; [w-helm-helpers] L141-174; [w-helm-api] L89-110; [w-helm-secrets] L28-48) | `XCUBE_ADMIN_TOKENS` on API Cube pods; `CUBE_API_SECRET` and `WECHART_XCUBE_ADMIN_TOKEN` on the API | Add the service and user key pairs as Secrets. The public service half goes to the Cube API pods as `XCUBE_SERVICE_KEYS` or a mounted `_FILE`; the private halves go to the API |
| T151 / AC-145 ([w-tasks] L2784-2791; [w-spec] L510-533) | Planned on `/cubejs-system/v1/pre-aggregations/partitions` | Not served ([srv] L68-74; [t-sec] L261). Needs an xcube route that doesn't exist |

## Gotchas

1. **Put `security` in `PUT …/folders` only.** The items snapshot's Joi schema has no `security` key, and Joi refuses unknown keys, so such a snapshot is `400 bad_request` ([routes] L105-114, L156-162).
   - [in] L152 reads as if both carried it.
   - By reading; untested.
2. **0 or more than 10 keys is `400 bad_request`, not `invalid_keys`.** The route's Joi limits (`.min(1).max(10)`, [routes] L98-102) run before the runtime's `invalid_keys` check ([rt@c] `putKeys`).
3. **A moved folder loses its groups when sent without them** ([rev@c] `replaceFolders`; [t-perm] L107-116). A 3a-style client that moves folders therefore does change permissions. Send `allowedGroups` on every folder, every time.
4. **No route reads folder groups back.**
   - The answer's `hash` covers only `{id, parentId}` ([rev@c] `folderTreeHash`).
   - The `permissionsVersion` is a counter: it doesn't say what the groups are.
   - wechart reconciles by resending the whole tree with groups, which is idempotent and doesn't bump the version when nothing changed ([t-perm] L98-99).
5. **An empty set closes a folder to everyone, Super-Admins included** ([gate] L25-27). Send the Super-Admin group on every folder ([in] L30).
6. **An instance that hasn't read a model's permissions admits no one to its published items, security on or off** ([gate] L17-19).
   - At the commit, permissions are read at start, on notices and on each poll ([rt@c] `start`, `notified`, `syncAll`). There is no read before a new model is first served.
   - The working tree adds one (uncommitted, working `runtime.ts` L1807-1810).
   - For a new model, pushing its folders before its first items snapshot sends the permissions notice ahead of any revision ([rev@c] `touchPermissions`).
   - The race is by reading, not observed.
7. **Security doesn't require keys.** With security on and no keys pushed, HS256 tokens still read the model, and the gate trusts their `groups` ([rt@c] `unverified`; [t-sec] L209-214). Anyone holding `CUBEJS_API_SECRET` can then claim any group. Push keys first ([in] L136).
8. **Trimming `groups` must keep folder groups.** The gate matches the token's `groups` against folder allowed sets ([gate] L64; [cfg] L73-75). [in] L103 and AC-326 speak of groups "some policy names". A group that is only in a folder's allowed set must still be in the token, or its members are refused (Open question 3).
9. **`xcubeModule` in HS256 contexts.**
   - At the commit, `unverified` strips `xcubeRole` only ([rt@c] `unverified`). A pre-cutover HS256 preview can still carry `xcubeModule` ([x3b] Gotcha 4).
   - RS256 contexts are built from scratch and can't ([ver] L168-176).
   - The working tree strips it too (uncommitted).
10. **Probes are gated.**
    - A changeset dry run's probes run with the given `securityContext` through the gate ([rt@c] `validate`).
    - A denied probe still answers `status: 200`, because `/v1/sql` gives `1 = 0` ([c-capi] L552-560).
    - With security on, send a context whose groups every probed folder admits, such as the Super-Admin group. Otherwise probes pass vacuously. By reading.
11. **The rotation's re-read is rate-limited.** An instance re-reads keys for an unknown kid at most once a second, and shares a re-read already in flight ([rt@c] `rereadKeys`).
    - A token signed with a new key can be refused on an instance whose last re-read began before the push committed, until that instance gets the `keys` notice.
    - The notice normally takes milliseconds. By reading.
12. **HS256 ends for all of a model's tokens at once.** In-flight HS256 tokens are refused at the push, not at their `exp` ([in] L136 says "which lasts at most their lifetime", meaning the refusals can occur for that long).
13. **"No rollback past slice 4" is schema-wide and permanent.**
    - Turning security on for **any** model raises migration 4's `min_reader` for the whole schema. Nothing lowers it, even with security turned off again ([rev@c] `putFolders`; Grep).
    - The check runs only at start ([migrate] L95-100). `older_instances` covers pre-v4 processes already connected ([rev@c] `olderInstances`).
14. **`older_instances` relies on `pg_stat_activity`.** Every xcube process connects as the `xcube` role (the bootstrap), so it sees the others' `application_name`. UNVERIFIED: Postgres's column visibility across roles was not checked.
15. **Security on makes the file-set path `409 mode` for a new model too.** A secured model with no revision refuses a files snapshot with the message "holds items; send changesets or an items snapshot" ([rev@c] `write`; [routes] L340).
16. **Cube's RBAC path now runs for every published item, even with security off.**
    - The reserved policy is always added ([rt@c] `filesOf` → `withGate`), so `isRbacEnabled()` is true for items-mode models.
    - Each `/v1/load` and `/v1/meta` then plans RLS and patches visibility over every item ([w-gp] §5).
    - `/v1/meta`'s `compilerId` is mixed with a per-context visibility hash ([c-capi] L842-847). wechart doesn't read `compilerId` (Grep of `packages`).
    - Stored `revision_files` are unchanged: the policy is added when serving, so `contentHash` doesn't move ([rt@c] `filesOf`).
17. **Dev mode shows hidden members** in `/v1/meta` ([c-gw] L489-493). Keep `CUBEJS_DEV_MODE=false`.
18. **`GET …/meta` is unfiltered by design.** Anything Jobs or Schedules show per user is wechart's to filter ([gw] L360-365).
19. **The SQL port's default check isn't wrapped.** Only a `cube.js` `checkSqlAuth` is ([cfg] L105-111). Cube's default gives a context with no model ([readme@c] "The SQL API"). Keep `CUBEJS_PG_SQL_PORT` unset.

## Corrections to xcube-slice-3a.md and xcube-slice-3b.md

| Statement | Now (6d1e2e3ba1) |
| --- | --- |
| [x3a] "Init / auth pattern": every route uses the `XCUBE_ADMIN_TOKENS` bearer middleware | Also the service credential. Admin routes are served when either is configured. The 401 text changed, and a model-named service token is 403 on another model ([auth] L18-55; [routes] L228-235) |
| [x3a] "`PUT …/folders`": request `{ folders }`, 200 `{ model, hash }` | Request `{ folders: [{ id, parentId, allowedGroups? }], security? }`; 200 `{ model, hash, permissionsVersion, security }`; new `400 invalid_permissions`, `409 mode`, `409 older_instances` ([routes] L68-72, L86-89, L373-385) |
| [x3a] "Nothing is served differently… no `pg_notify`" | A folders push can change what Cube serves, through groups and security, and notifies `permissions` when they change. Names still don't change ([rev@c] `touchPermissions`) |
| [x3a] "Common": the error list | Adds `invalid_permissions`, `older_instances`, security `mode`, `invalid_keys`, `service_kid`, `stale_keys`, keys `conflict`, `no_keys`, `forbidden`, `not_found` (table above) |
| [x3a] "Request limits" | Plus `allowedGroups` ≤ 10,000 per folder, each 1-256 characters; keys 1-10 ([routes] L65-72, L91-103) |
| [x3a] "Query tokens. Unchanged", and "Unchanged in 3a: token handling… the jobs routes" | Token handling changed (RS256, HS256 per model), and the jobs route gained a model check for service tokens ([gw] L128-162) |
| [x3a] "Item content" and "Names" rules | Plus: an access policy naming `xcube.folder-gate` → `422` (kind `item`) "Access policies may not name the group xcube.folder-gate…" ([items] L217-219; [t-sec] L348-353) |
| [x3a] "What Cube serves": access policies "Unchanged; groups untouched" | What Cube compiles gets one more policy, `{ group: xcube.folder-gate }`, appended under the author's key, or under both keys when both are set. `meta.xcube.folderId` is now load-bearing ([marker] L52-80) |
| [x3a] Gotcha 5: `PUT …/folders` creates the model row | `PUT …/keys` does too ([rev@c] `putKeys`) |
| [x3b] Summary: "What wechart sends is unchanged… token claims are as in 3a"; "Init / auth": "Admin routes, admin tokens and query tokens are unchanged" | Changed by slice 4 (this doc) |
| [x3b] Install: the image `…c0610bb768@sha256:d787e67c…` | `…6d1e2e3ba1@sha256:8df2c818…` ([ghcr]) |
| [x3b] `config()` gains `compilerCacheSize` and a `queryRewrite` wrapper | Also `contextToGroups` (always) and a `checkSqlAuth` wrapper ([cfg] L70-76, L105-111) |
| [x3b] `/v1/meta` merged across modules | Also gate-filtered for each context. `GET …/meta` gives the unfiltered merge ([gw] L366-404) |
| [x3b] Gotcha 4: `xcubeModule` is honoured from a previewed context | Only for HS256 contexts at the commit. RS256 contexts can't carry it ([ver] L168-176; [rt@c] `unverified`) |
| [x3b] Jobs API fan-out | Preceded by the service token's model check. Needs `jobs`, which users no longer get ([gw] L128-136, L323-325) |
| [x3b] Open question 6: the slice-4 folder check and admin meta route are design intent | Built at 6d1e2e3ba1 (this doc) |
| [x3b] input rows 8, 22 and 25: "Slice 4 is UNVERIFIED" | Verified here: gated `/v1/meta`, `GET …/meta`, the reserved policy |
| [x3b] "Rollback": the 3a image runs on a 3b schema | It also runs on a v4 schema until security is first turned on. After that, 3a and 3b images exit at start ([migrate] L95-100; [rev@c] `putFolders`) |
| [x2] input row 16: "Slice 4 replaces the token", UNVERIFIED | The service credential authenticates admin routes, and `XCUBE_ADMIN_TOKENS` still works while set ([auth] L18-40) |

Everything else in [x3a] and [x3b] about names, resolution, bindings, modules, routing and the items hash still holds. `rewrite.ts`, `expr.ts`, `publish.ts`, `snapshot.ts`, `graph.ts` and `lane.ts` are not in the slice-4 diff, and `items.ts` changed only by the `Folder.allowedGroups` field and the reserved-group refusal ([p4]; [d4]).

## What this slice confirms or contradicts in the Cube research docs

| Doc and claim | Verdict | Source |
| --- | --- | --- |
| [w-gp] Recommendation: option C, a `CompilerApi` subclass gating `getApplicablePolicies`, a reserved marker on every cube and view, no group lists in the model, no recompile | **Confirmed** | [gate] L47-70; [srv] L48-59; [marker] L52-80; [t-sec] L300-315 |
| [w-gp] "With security off, nothing is injected and the gate is off" | **Contradicted.** The marker is always injected for published items, and with security off the gate admits everyone, once permissions are known | [rt@c] `filesOf`; [gate] L17-23 |
| [w-gp] sketch: folder from a `cube.name → folder` map per compiler version; deny when unknown | **Differs.** The folder comes from the compiled `meta.xcube.folderId`. An item without one, or without the marker, gets Cube's own rules | [marker] L40-43; [gate] L58-63 |
| [w-gp] memoise `getGroupsFromContext`; a startup canary; a post-compile marker invariant | **Not built.** `getGroupsFromContext` is called per check. Grep finds no canary or invariant | [gate] L64 |
| [w-gp] `contextToGroups` strips the reserved name; publishes naming it are refused | **Confirmed** | [cfg] L72-76; [items] L217-219 |
| [w-gp] §3 denied-token table (`/v1/meta` out, `/v1/load` 500 hidden member, `/v1/sql` 200 with `1 = 0`, `/v1/dry-run` 200, GraphQL lists all) | **Confirmed** for meta and sql by test, for load by test (non-200) and source (500), for dry-run by source. GraphQL is closed by scope | [t-sec] L272-284; [c-qrt] L303-318; [gw] L323-327 |
| [w-gp] §4: own-behalf model reads through an xcube admin route with `skipVisibilityPatch`; the service credential not admitted to the gate | **Confirmed** | [gw] L366-404, L319-321 |
| [w-gp] no Super-Admin bypass of authored policies | **Confirmed.** No group is special in the gate | [gate] L16-70 |
| [w-gp] Gotcha: metadata judges a view by its own policies | **Confirmed**, and restated by [in] L61 | [c-capi] L754-791 |
| [w-tok] Recommended: a verifier inside xcube; RS256 pinned; `kid`, `exp` and `iat` required; tolerance explicit; separate user and service key sets; public service key by configuration | **Confirmed** | [gw] L336-346; [tok] L182-221; [ver] L40-45; [set] L36-56 |
| [w-tok] separating kinds by `typ` | **Differs.** `typ` isn't checked. Kinds are kept apart by key set, `aud` and `role` | [tok] L136-140, L182-221; [ver] L163-165, L196-198 |
| [w-tok] service scopes `[...base, 'jobs', 'introspection']` | **Differs.** Exactly `['jobs', 'introspection']`, with no `meta` or `data` | [gw] L74, L319-321 |
| [w-tok] the verifier uses `jsonwebtoken` (open question: whether it resolves in the image) | **Resolved.** xcube verifies with `node:crypto` alone | [tok] L1-6 |
| [w-tok] Gotcha 7: rejected tokens are logged whole | **Resolved.** They are logged as `sha256:<16 hex>` | [gw] L352-358; unit "logs a refused token as a fingerprint…" |
| [w-tok] Gotcha 11: a service context without groups sees nothing behind generated policies | **Resolved** by `GET …/meta` | [gw] L366-404 |
| [w-tok] Gotcha 5 and its open question: unset the playground secret, and re-home system partitions | **Confirmed**, the secret is ignored. System partitions are **not re-homed** | [srv] L68-74; [routes] L373-427 |
| [w-tok] Gotcha 16: a whole-set replace with a monotonic version | **Confirmed** | [rev@c] `putKeys`; [t-perm] L183-191 |
| [w-tok] R28 note: "The plan also lets it [the service credential] assert a preview context (AC-166–168)" | **Contradicted.** A service context is `{ wechartModel?, xcubeRole }` with no data or meta scope. Previews must be user tokens | [ver] L201-204; [gw] L319-321 |
| [w-tok] Gotcha 17: the SQL API's default `checkSqlAuth` gives `{}` | **Confirmed.** xcube wraps only a `cube.js` one | [cfg] L105-111 |

## Open questions / unverified

1. **UNVERIFIED by running:**
   - the **500** for a denied `/v1/load`: tests assert non-200 and the message; the status comes from Cube's source;
   - `/v1/dry-run` answering 200 under denial;
   - a view denied because an underlying cube's folder refuses the token. Under wechart's parent ⊇ child sets this can't arise.
2. **The race in Gotcha 6** at 6d1e2e3ba1. Does the working tree's load-before-serve guard ship in a later image?
3. **For the user (requirements):** does "groups that some access policy names" (AC-008, AC-326; [in] L103) include groups that appear only in folder allowed sets? The gate needs them in the token (Gotcha 8).
4. **For the spec:** where AC-145's partition list comes from now that `/cubejs-system/*` isn't served. xcube offers no route for it ([in] L140 says one is needed "when wechart needs them").
5. **For the spec:** which context wechart's dry-run probes send once security is on (Gotcha 10).
6. **UNVERIFIED:**
   - that `jose`'s `calculateJwkThumbprint` of a PEM public key equals xcube's `thumbprintOf` for the same key. Both follow RFC 7638, and xcube's matches the RFC's example vector; jose was not run;
   - that the "unknown/unknown" manifest is an attestation;
   - Postgres's `pg_stat_activity` column visibility (Gotcha 14);
   - [readme@c]'s claim that Cube checks a websocket's token once, at connect. Cube's websocket source was not read here.
7. **Not in 6d1e2e3ba1:**
   - the working tree's overlays (migration 5, `/overlays` routes, `overlayClaim` in the verifier);
   - its `xcubeModule` stripping;
   - its permissions guard.

   This doc covers only the commit.
8. **Not viewed:** the CI step summary and per-test output ([run-jobs]).

## Input claims checked

[in] is `docs/inputs/2026-09-26-xcube-slice-4-contract.md`, cited by line; [sum] is xcube's summary note.

| # | Claim ([in] line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Option C: Cube refuses a folder's items to a token with none of its groups; model policies still apply; no group list in the model (L9) | Verified | [gate] L47-70; [marker] L52-80; [t-sec] L264-298 |
| 2 | RS256 now; xcube never fetches keys and holds no signing key; service credential; HS256 secret and static token retired (L10) | Partly | No fetch code; private keys refused ([tok] L54-58, L113-117). "Retired" is per model after keys, or with `XCUBE_HS256=off`; static tokens work while set ([auth] L27-31) |
| 3 | Keys in Kubernetes Secrets generated by the chart (L11) | n/a | wechart's decision |
| 4 | No Super-Admin bypass (L12) | Verified by reading | No special group in [gate] L16-70 |
| 5 | Commit 6d1e2e3ba1; README sections (L16) | Verified | [head]; [readme@c] "Permissions and tokens", "Admin API"; working tree dirty (Provenance) |
| 6 | Image tag; pull by digest (L18) | Verified | [ghcr]; [ghcr-pkg]; digest `8df2c818…` |
| 7 | `PUT …/folders` body (L22-26) | Verified | [routes] L65-72, L86-89 |
| 8 | xcube takes the set as given, never combines folders (L29) | Verified | [rev@c] `touchPermissions` checks, never merges; [gate] L24 reads one folder |
| 9 | Empty set → nobody admitted (L30) | Verified | [gate] L25-27; unit "admits a context holding one of the folder's allowed groups…" |
| 10 | Without `allowedGroups` a folder keeps its groups; a slice-3a client changes no permission (L31) | Partly | Keeps them unless it moved ([rev@c] `replaceFolders`; [t-perm] L98-116) |
| 11 | New or moved folder has none (L32) | Verified | [t-perm] L101-103, L107-116 |
| 12 | Same for an items snapshot's folders (L33) | Verified by reading | [rev@c] `write` → `replaceFolders`; untested with groups |
| 13 | `allowedGroups: []` clears (L34) | Verified by reading | Stored as `{}` → [gate] L25-27 |
| 14 | Security on: a child may allow no group its parent doesn't → `400 invalid_permissions` with `problems` (L35) | Verified | [rev@c] `touchPermissions`; [routes] L256-258; [t-perm] L124-131 |
| 15 | wechart's rule satisfies it; the gate relies on it (L36-37) | Verified by derivation | [w-gp] §2; [rev@c] `touchPermissions` comment |
| 16 | `security` omitted is unchanged; a new model is off; then every folder admits everyone (L38) | Partly | Default false ([mig] L147); admits all only once permissions are read on the instance (Gotcha 6) |
| 17 | `409 mode` for security on a file-set model; a secured model refuses a file set (L39-41) | Verified | [rev@c] `putFolders`, `write`; [t-sec] L354-366 (the file-set refusal is tested only on an items model) |
| 18 | `409 older_instances`; retry once all run this image (L42) | Verified | [rev@c] `olderInstances`; [t-perm] L133-143 |
| 19 | Answer `{ model, hash, permissionsVersion, security }`; the version rises only on change (L43) | Verified | [routes] L384; [rev@c] `putFolders`; [t-perm] L98-99 |
| 20 | Answering instance applies before answering; others by notification or next poll "(60 s while notifications are down)"; no compile (L44) | Partly | True for `PUT …/folders` ([rt@c] `putFolders`), not items snapshots. The poll is **10 s** while the listener is down and 60 s while it is up ([set] L116-117). No compile: [t-sec] L300-315 |
| 21 | Denied: `/v1/meta` omits it; `/v1/load` 500 "hidden member"; `/v1/sql` 200 with `1 = 0`; `/v1/dry-run` 200 (L52) | Verified, partly by reading | meta and sql tested ([t-sec] L272-284); load non-200 tested, 500 by source ([c-qrt] L303-318; [c-gw] L1893-1901); dry-run by source |
| 22 | Admitted, no own policy → every member and row (L53) | Verified | [gate] L67-69; [t-sec] L267 |
| 23 | Admitted, own policies → those policies (L54) | Verified | [t-sec] L293-298 |
| 24 | Security off: every token admitted; only model policies (L56) | Partly | As 16; [t-sec] L209-215 |
| 25 | Per item; a `/A/B` view over an `/A` cube needs both; AC-320 tested; meta judges a view by its own folder (L58-61) | Verified, partly by reading | [c-capi] L336-360, L754-791; [c-rbac] L151; [t-sec] L264-270, L286-291 |
| 26 | Reserved group `xcube.folder-gate` refused at publish (422) (L64) | Verified | [items] L217-219; [t-sec] L348-353 |
| 27 | No rollback past slice 4 once security is on; drop and re-import (L65) | Verified | [rev@c] `putFolders`; [t-sec] L368-374; [migrate] L95-100 |
| 28 | `PUT …/keys` body (L69-73) | Verified | [routes] L91-103 |
| 29 | Lower version → `409 stale_keys` with current `version`; same set → 200 `applied: false`; else `409 conflict` (L75-78) | Verified | [rev@c] `putKeys`; [routes] L396-402; [t-sec] L225-233 |
| 30 | Key rules: RSA ≥ 2048, `alg` RS256 or absent, `use` sig or absent, public only, unique kid (L79-84) | Verified | [tok] L33-86. Also: kid charset, `key_ops` verify only, not a service kid |
| 31 | 1 to 10 keys, otherwise `400 invalid_keys` (L85) | Partly | Through the route it is `400 bad_request` (Gotcha 2) |
| 32 | `issuer` is required as `iss` in every user token (L86) | Verified | [ver] L157-162; [t-sec] L257 |
| 33 | `GET …/keys` returns the set, public keys only (L87) | Verified | [routes] L406-413; [t-sec] L234-236 (normalised members) |
| 34 | Rotation: push `[current, next]`, sign with next after the push; unknown kid re-read; then `[next]` (L88-90) | Partly | Re-read is rate-limited (Gotcha 11); [t-perm] L164-181 |
| 35 | User token header and required claims `aud`, `role`, `iat`, `exp`, `groups` (L96-97) | Partly | `groups` isn't enforced (missing → `[]`, [ver] L167) |
| 36 | `iss` when named; `wechartModel`; `wechartRevision` (L98) | Verified | `wechartModel` may be omitted when the kid belongs to one model ([ver] L145-155) |
| 37 | Lifetime ≤ 3600 s; skew 60 s (L99) | Verified | [set] L58-65; [tok] L201-212; configurable. The lifetime check has no skew |
| 38 | Cube receives exactly `{ wechartModel, groups, wechartRevision?, xcubeRole: "user" }` (L101) | Verified | [ver] L166-176; unit "a user's token: its model, groups and revision…" |
| 39 | Model bound to key (L102) | Verified | [ver] L145-155; [t-sec] L255-256 |
| 40 | Trim `groups` to those some policy names (L103) | n/a (wechart) | Keep folder groups too (Gotcha 8) |
| 41 | Service token header and claims (L105-110) | Verified | [ver] L189-205. Also ≤ 3600 s; `iss` if `XCUBE_SERVICE_ISSUER` |
| 42 | `XCUBE_SERVICE_KEYS`: JWK set, PEM or certificate; PEM kid = RFC 7638 thumbprint; `_FILE` re-read each poll; private keys refused (L112-116) | Verified | [tok] L23-27, L92-132; [rt@c] `refreshSecurity`; unit "configured keys…" |
| 43 | It authenticates every admin route, keys included; `XCUBE_ADMIN_TOKENS` still works while set (L117) | Verified | [auth] L18-55; [t-sec] L198-205 |
| 44 | A model-named service token: other models' admin routes 403; posted jobs' contexts must name it; one naming none serves all (L118-122) | Verified | [auth] L48-52; [gw] L146-162; [t-sec] L204-206, L330-333. The `get` action isn't confined |
| 45 | Scopes: user = `cube.js` minus `jobs`, `introspection`, `graphql`; service = `jobs`, `introspection`; HS256 = `cube.js` less `graphql` when secured (L124-130) | Verified | [gw] L292-329; unit scopes tests; [t-sec] L317-335 |
| 46 | HS256 until the first key push, then 403 "model … takes RS256 tokens only"; no-model tokens refused once any model has keys; `XCUBE_HS256=off` (L132-135) | Verified | [rt@c] `unverified`; [t-sec] L250-253; `off` by reading |
| 47 | Cutover; introspection moves to the service token (L136-137) | Verified by reading | wechart's introspection token names the model ([w-client] L248) |
| 48 | Playground secret ignored; `/cubejs-system/*` not served; AC-145 needs an xcube route (L140) | Verified | [srv] L68-74; [t-sec] L260-261; no such route ([routes] L373-427) |
| 49 | Refused tokens logged as `sha256:<16 hex>` (L141) | Verified | [gw] L352-358; unit "logs a refused token as a fingerprint…" |
| 50 | Websockets and the SQL port are outside this; keep both off, as wechart does (L142) | Verified for wechart; README for Cube | Grep of compose and Helm; [readme@c] "Websockets", "The SQL API" |
| 51 | `GET …/meta`: merged, unfiltered, service credential; `/v1/meta` with the service token has no `meta` (L146-148) | Verified | [gw] L366-404, L319-321; [t-sec] L337-346 |
| 52 | T436: `allowedGroups` and `security` in `PUT …/folders` and items snapshots (L152) | Partly | `security` only in `PUT …/folders` (Gotcha 1) |
| 53 | T437: RS256, key push, `XCUBE_SERVICE_KEYS` in compose and chart, service token for admin, jobs, introspection (L153-157) | Compatible | Also `jobStatuses` and the after-publish `metaExtended` ([w-build] L149; [w-publish] L183) |
| 54 | Jobs and Schedules read `GET …/meta?extended=true` (L158) | Compatible | [w-build] L128; [w-sched] L149 |
| 55 | `cube.js`: `contextToGroups` can go; the `introspection` branch only until the cutover; keep `CUBEJS_API_SECRET` (L159) | Verified | [cfg] L72-76; [gw] L319-321; [w-tok] Gotcha 10 |
| 56 | A denied `/v1/load` is a 500 "hidden member", not a 403 (L160) | Verified by source | As 21; wechart already handles it ([w-tile] L1-18) |
| 57 | [sum] L39: "No token does [get GraphQL] on a model with security on" | Verified | [gw] L319-327 |
| 58 | [sum] L49-52: CI with the security steps passed; published for amd64 and arm64 | Verified | [run-jobs]; [ghcr-pkg] |
| 59 | [sum] L58-66: tested in one Cube process, across instances, and in the image | Verified | [t-sec]; [t-perm]; [t-img] L143-170 |

[head]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (6d1e2e3ba1bc3bdeab1f96412015757bb22b2962)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[c4]: https://api.github.com/repos/senthilkrajagopal/cube/commits/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962
[d4]: https://github.com/senthilkrajagopal/cube/commit/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962.diff
[p4]: https://github.com/senthilkrajagopal/cube/commit/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962.patch ("26 files changed, 2808 insertions(+), 83 deletions(-)")
[readme@c]: https://github.com/senthilkrajagopal/cube/blob/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/README.md
[rt@c]: https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/runtime/runtime.ts
[rev@c]: https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/store/revisions.ts (class lines L100-119 from the verified first hunk)
[ver@c]: https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/src/security/verifier.ts
[sh@c]: https://raw.githubusercontent.com/senthilkrajagopal/cube/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/xcube/test/image/serving.sh
[checks]: https://api.github.com/repos/senthilkrajagopal/cube/commits/6d1e2e3ba1bc3bdeab1f96412015757bb22b2962/check-runs
[run-jobs]: https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36259417372/jobs
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions
[ghcr-pkg]: https://github.com/users/senthilkrajagopal/packages/container/package/xcube
[gate]: /Users/srajagopal/Work/bi/cube/xcube/src/security/gate.ts (= commit)
[marker]: /Users/srajagopal/Work/bi/cube/xcube/src/security/marker.ts (= commit)
[tok]: /Users/srajagopal/Work/bi/cube/xcube/src/security/tokens.ts (= commit)
[ver]: /Users/srajagopal/Work/bi/cube/xcube/src/security/verifier.ts (commit lines; working tree +2/+3/+5, Provenance)
[auth]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts (= commit)
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (commit lines; working tree +7 for L15-142, +14 from L145)
[cfg]: /Users/srajagopal/Work/bi/cube/xcube/src/config.ts (commit lines; working tree +7 from L19)
[gw]: /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts (= commit)
[srv]: /Users/srajagopal/Work/bi/cube/xcube/src/server.ts (= commit)
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts (commit lines; working tree +21 for L35-133, +27 from L134)
[lst]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/listener.ts (commit lines from [d4])
[db]: /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts (= commit)
[mig]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts (commit lines; the working tree adds migration 5)
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts (not in the diff)
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts (= commit)
[t-sec]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/security.test.ts (= commit)
[t-perm]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/permissions.test.ts (= commit)
[t-img]: /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh (slice-4 block = commit)
[t-usec]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/security.test.ts (by test title)
[t-gw]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/gateway.test.ts (by test title)
[t-cfg]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/config.test.ts (by test title)
[c-capi]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/CompilerApi.js (1.7.45)
[c-gw]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
[c-bq]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/adapter/BaseQuery.js (1.7.45)
[c-native]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/native/package.json
[c-qrt]: /Users/srajagopal/Work/bi/cube/rust/cube/cubeorchestrator/src/query_result_transform.rs
[c-rbac]: /Users/srajagopal/Work/bi/cube/packages/cubejs-testing/test/smoke-rbac.test.ts
[c-chlog]: /Users/srajagopal/Work/bi/cube/CHANGELOG.md
[in]: /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-slice-4-contract.md
[sum]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1200-slice-4-built.md
[x2]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-2.md
[x3a]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
[x3b]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3b.md
[w-gp]: /Users/srajagopal/Work/wechart/docs/research/cube/generated-policies.md
[w-tok]: /Users/srajagopal/Work/wechart/docs/research/cube/tokens-and-service-credential.md
[w-cube]: /Users/srajagopal/Work/wechart/infra/cube/cube.js
[w-client]: /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
[w-xc]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.ts
[w-check]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/check.ts
[w-main]: /Users/srajagopal/Work/wechart/packages/api/src/main.ts
[w-config]: /Users/srajagopal/Work/wechart/packages/api/src/config.ts
[w-server]: /Users/srajagopal/Work/wechart/packages/api/src/server.ts
[w-build]: /Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts
[w-sched]: /Users/srajagopal/Work/wechart/packages/api/src/jobs/schedules.ts
[w-publish]: /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
[w-intro]: /Users/srajagopal/Work/wechart/packages/api/src/model/introspection.ts
[w-tile]: /Users/srajagopal/Work/wechart/packages/web/src/tiles/TileUnavailable.tsx
[w-compose]: /Users/srajagopal/Work/wechart/docker-compose.yml
[w-helm-values]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
[w-helm-dd]: /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
[w-helm-cube]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/cube.yaml
[w-helm-helpers]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/_helpers.tpl
[w-helm-api]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/api.yaml
[w-helm-secrets]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/secrets.yaml
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md
[w-tasks]: /Users/srajagopal/Work/wechart/docs/tasks.md
