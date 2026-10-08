---
library: xcube at ed08180c37, an overlay's own data sources and the TLS binding (the user's Cube fork)
packages: [xcube]
version: 'xcube at ed08180c37 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa
  - https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa.patch
  - https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa.diff
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/ed08180c372671410d16757558719234cac055aa
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/ed08180c372671410d16757558719234cac055aa/check-runs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36269408981/jobs
  - https://github.com/senthilkrajagopal/cube/commit/1249dda9ca7570cb7218ab2cdd4a28065fa15058.patch
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/src/runtime/runtime.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/src/admin/routes.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/src/store/revisions.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/src/config.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/src/server.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/test/integration/connections.test.ts
  - https://github.com/senthilkrajagopal/cube/blob/ed08180c372671410d16757558719234cac055aa/xcube/README.md
  - https://github.com/senthilkrajagopal/cube/blob/ed08180c372671410d16757558719234cac055aa/xcube/src/overlays/connections.ts
  - https://github.com/senthilkrajagopal/cube/blob/ed08180c372671410d16757558719234cac055aa/xcube/src/connections/drivers.ts
  - https://github.com/senthilkrajagopal/cube/blob/ed08180c372671410d16757558719234cac055aa/xcube/src/credentials/credentials.ts
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/1299414474?tag=v1.7.45-ed08180c37
  - https://github.com/users/senthilkrajagopal/packages/container/package/xcube
  - /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/rollups.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/credentials/credentials.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/overlays.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/credentials.test.ts
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OrchestratorStorage.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/QueryCache.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/QueryOrchestrator.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregationLoader.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregations.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-dremio-driver/driver/DremioDriver.js (1.7.45)
  - /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-overlay-data-sources.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1800-tls-target-keys.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1900-overlay-data-sources.md
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-26-1849-driver-change-answer.md
  - /Users/srajagopal/Work/wechart/docs/handoff.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-5.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-6.md
  - /Users/srajagopal/Work/wechart/docs/research/cube/xcube-runtime.md
  - /Users/srajagopal/Work/wechart/docs/research/credential-sealing.md
---
# xcube at ed08180c37: an overlay's own data sources, and the TLS binding (on Cube v1.7.45)

This doc is the sibling of [x5] (overlays, `d26ff4238e`) and [x6] (connections, `49581da2f1`…`1249dda9ca`). It covers two things:
- **Commit `ed08180c37`**, "an overlay's own data sources, previewed apart from the published ones (AC-280)".
- **The TLS binding from `1249dda9ca`**, "bind each driver's TLS settings into a sealed secret's target". The image now pinned carries it.

It checks every claim in the raw input [in] and in xcube's notes [n-ov] and [n-tls]. It corrects [x5] and [x6] where this commit changes them (Corrections).

## Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube` ([head]).
  - `refs/heads/feat/xcube` and `refs/remotes/fork/feat/xcube` are both `ed08180c372671410d16757558719234cac055aa` ([ref]; [fork-ref]).
  - The reflog's L16 is `1249dda9ca… → ed08180c37…`, "commit: feat(xcube): an overlay's own data sources, previewed apart from the published ones (AC-280)". There is no later entry ([reflog] L15-16).
  - The parent is `1249dda9ca7570cb7218ab2cdd4a28065fa15058`. The author date is 2026-09-26T20:24:19Z ([a]).
- **What the commit contains.** 14 files, +657 −53 ([p], the diffstat). The commits API's "17 files" disagrees with its own list of 14, so I use the patch.
  - `README.md` (36), `package.json` (`1.7.45-6` → `1.7.45-7`) and `package-lock.json`;
  - `src/admin/routes.ts` (13), `src/config.ts` (40), `src/connections/connections.ts` (26), `src/runtime/runtime.ts` (231) and `src/server.ts` (44);
  - the new `src/overlays/connections.ts` (+57);
  - `src/store/migrations.ts` (+13) and `src/store/revisions.ts` (56);
  - `test/integration/connections.test.ts` (157), `test/integration/permissions.test.ts` (+1) and `test/unit/overlays.test.ts` (+30).
- **Not in this commit:**
  - `drivers.ts`, `credentials.ts`, `names/publish.ts`, `overlays/rollups.ts`, `runtime/settings.ts`, `test/image/serving.sh` and `test/unit/credentials.test.ts` ([p] diffstat).
  - So the TLS target keys are exactly as `1249dda9ca` left them ([p-tls]).
- **The working tree equals the commit for the files cited.** Nothing was run (no Bash), so there was no `git status`. I checked it four ways:
  - `overlays/connections.ts` has 57 lines (= +57), and `unit/overlays.test.ts` 64 (= [x5]'s 34 + 30).
  - Migration 7 is at L229-241 (= +13 after [x6]'s commit `];` at L229).
  - **Hunk headers.** Every `@@ … +N` header I checked for `runtime.ts` (+368, +1326, +1765, +2577), `config.ts` (+154, +217), `server.ts` (+40, +82) and `README.md` (+343, +631, +667) puts its first added line at the working tree's line ([d]; [p]).
  - **Raw text.** The raw files at the full SHA quote the same text as the tree for `overlaySchema`, `checkOverlayConnections`, the `putOverlay` hash, `overlayStatus`, the store's `putOverlay`, `olderInstances`, `contextToOrchestratorId`, `driverFactory`, `orchestratorOptions`, `resolveDriver`, `createCompilerApi` and the five overlay tests ([raw-*]).
  - **So working-tree line numbers are cited as commit lines.** GitHub's `blob/ed08180c37…/<path>#L<n>` gives the same lines.
- **CI run 36269408981** ([checks]; [jobs]):
  - job `test` succeeded (20:24:25–20:26:55Z). This includes "Test, with the live-database suites" (20:25:34–20:26:50Z), which sets `XCUBE_TEST_DATABASE_URL`, so the overlay-data-source integration tests ran ([wf] L75-81; [t-conn] L24-25).
  - job `image` succeeded (20:26:57–20:29:04Z). It includes "Serves models from xcube's schema", "Each connection's driver takes its own fields" and "Publish, for amd64 and arm64".
  - Per-test output was not viewed.

## Summary

**What `ed08180c37` builds** ([c] message; [readme] L346-366, L629-682):
1. **`PUT …/overlays/{id}` takes `connections`**, at most 20 ([routes] L178-188).
   - Each is a data source as it would land: `{ folderId, name, driver, authMethod, fields, sealed }`, named by its ~~short name in its folder~~. *Corrected:* bare name, one per model; one of a published data source's name stands in for it, wherever it is; `default` only at the root (R71 1.1, 2.6) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - It is checked as `PUT …/connections/{name}` checks a connection. Every secret must open for its target, so a copy's envelopes open only while its target is the original's ([rt] L1574-1612).
   - It is stored in the overlay (migration 7, [mig] L229-241) and counted in its content hash ([rt] L1483-1489, L385-390).
2. **`GET …/overlays/{id}` lists them** with `secrets` named and no envelope ([rt] L1556-1564).
3. **Previews bind them as a publish would, ~~nearest-first~~.** *Corrected:* by name, with no nearest-first; a cube's data source must be in its folder or an ancestor (`data_source_range`) (R71 3.4, 4.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - A copy under a published ~~full~~ name (*Corrected:* the same name in any case, in any folder: `runtime.ts` `publishOverlay` `shadowed`) replaces it for every cube bound to it ([rt] L1405-1431; [pub] L223-258).
   - Those cubes' files are marked with the driver type. They compile apart, without rollups, in that dialect ([rt] L1425-1438; [ovc] L24-51; [srv] L116-128).
4. **A separate Cube orchestrator per overlay version that brings data sources**, `<base>_<model>_O_<id>_<version>` ([cfg] L160-169).
   - It has its own drivers, queues and result cache. It never builds rollups (`externalRefresh`, [cfg] L220-229).
   - It is released when the version is no longer served ([rt] L2580-2602). At most 20 are kept per process ([rt] L1660-1671), and Cube's orchestrator cache is 120 ([srv] L44).
5. **`409 older_instances`** answers a push with connections while any xcube before schema 7 is connected ([rev] L579-585).

**The TLS binding** (`1249dda9ca`, unchanged here):
- `secretAadV1` binds each secret to `DRIVERS[driver].target` ([cred] L42-48).
- For postgres, redshift and mysql the target now includes `ssl`, `sslRejectUnauthorized` and `sslCa`. For mssql it includes `encrypt` and `trustServerCertificate`, and for dremio `ssl` ([drv] L74, L97, L113, L132, L221, L270).
- Changing one makes a stored envelope refuse to open: `422 invalid_secret` ([cred] L164-167; [t-conn] L189-193, L385).

**What it means for wechart** (details in "What wechart must change"):
- **AC-280** ("the copy can't connect without the credentials being entered again" fails it, [w-spec] L1023-1024) can now hold in previews. A workspace copy pushed in its overlay is queried with its original's envelopes, so long as its target is unchanged ([t-conn] L361-379).
- **AC-312** ([w-spec] L1102-1103) must clear the secret on a change to any v1 target key, TLS fields included. AC-312's text names "host, port, account, workspace, warehouse, project or connect string", which neither xcube's keys nor wechart's `drivers.ts` match ([drv]; [w-drv] L69-226).
- **T346** copies the ciphertext byte for byte into the overlay's `connections`, under the original's ~~folder and short name~~ name. *Corrected:* the name alone makes it the original's stand-in, wherever it is (R71 2.6) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **T345** seals a new data source's secret in the browser (T441) and pushes it under its target folder.
- **T347** pushes the workspace's whole set of data sources with its items on every save.
- **T441** freezes `V1_TARGET_KEYS` to xcube's `target` lists.
- **T442** lands a data source with `PUT …/connections/{name}` before the items.
- **The user decided that a workspace refuses a driver change up front** ([handoff] L176-177; [ans-drv] L8). xcube doesn't refuse it in an overlay (Gotcha 1).

## Install

- **No npm dependency.** The only import is still `require('xcube')` in the Cube image's `cube.js` ([w-cube] L17).
- **The image.** Pull it by digest. The user chose to pin it for slices 4-6 ([handoff] L174-175; [ans-drv] L10):
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-ed08180c37@sha256:bc041aa208df0cd748b59fbfdbeca8684538f08c67f6020b0316d1efd1eb6fd8
  ```
  - The versions page lists this digest for `v1.7.45-ed08180c37`. The moving tag `v1.7.45-feat-xcube` is on the same version, 1299414474 ([ghcr]).
  - Per platform ([ghcr-v]):
    - linux/amd64 `sha256:4b661dc13d077fb1d74642971817d14ccf5948fbdcac606da651b871e80b93b7`;
    - linux/arm64 `sha256:3e611028ecbe4ca97289c3e55bccb8b5e5f56e22f0982d24a26aea77805aeda4`;
    - "unknown/unknown" `sha256:835cb8e33608481c1ffb0ee9f42d79c275aa33384bf1145e0e2b8845c1daee51`.
  - **Visibility.** The package page says "Public" ([ghcr-pkg]). The fetch tool read the version page as "private", but it could fetch that page without authentication, so I take the package page's word.
  - **What it carries.** Its ancestry includes slice 5 (`d26ff4238e`), the partitions route (`917402f945`), slices 6a/6b, slice 8 (`5c46e57c1f`) and the TLS binding (`1249dda9ca`) ([reflog] L9-16).
- **Schema migration 7, "overlay connections"** ([mig] L229-241):
  - `ALTER TABLE overlays ADD COLUMN connections jsonb NOT NULL DEFAULT '[]'::jsonb`, with `minReader: 2` (additive).
  - `SCHEMA_VERSION` is the last migration's version, 7 ([mig] L245). So xcube's Postgres connections are now named `xcube:v7:<instanceId>` and `xcube-listen:v7:<instanceId>` ([db] L22-24).
  - An older image on a v7 schema logs "the schema has migrations newer than this xcube; running on" and serves ([migrate] L95-107, via [x5]).
- **No new environment variables.** `settings.ts` is not in the diff ([p]). The two new limits are constants:
  - `MAX_OVERLAY_CONNECTIONS = 20` ([rt] L371-372);
  - `MAX_OVERLAY_ORCHESTRATORS = 20` ([ovc] L17-22).
  - Timings come from existing settings: `XCUBE_OVERLAY_IDLE_MS` (10 min) and `XCUBE_RETIRE_GRACE_MS` (5 min) ([set] L57, L156, L177).
- **Credential keys must be on every Cube API instance**, not only the refresh worker. A preview opens the copy's secrets on the API instance that serves it ([conn] L287-300, L344-356; [readme] L415-417).
- **What CI checked** (Provenance): the integration suite's five overlay-data-source tests, against live Postgres 18 ([wf] L31-33, L75-81). `serving.sh` wasn't changed, so the image check doesn't exercise overlay data sources ([p] diffstat).

## Init / auth pattern

Unchanged from [x5] and [x6]:
- **Admin routes** (`PUT/GET/DELETE …/overlays/{id}`, `…/connections/*`) take an `XCUBE_ADMIN_TOKENS` entry or the RS256 service token ([readme] L489-500).
- **Preview user tokens** carry the overlay claim. The default claim name is still `xcubeOverlay` ([cfg] L103-108).
  - wechart's `cube.js` sets only `modelClaim` and `revisionClaim` ([w-cube] L17-18), so the [x5] step still stands: add `overlayClaim: 'wechartOverlay'`.
  - xcube's own test uses the default name with HS256 tokens ([t-conn] L113, L328-330).
- **The call order for a workspace preview with data sources** (wechart's API, Node 26, over HTTP):
  1. `PUT …/folders`: a connection's folder must be in the tree ([rt] L1584-1586).
  2. Optionally, `POST …/connections/test` for a workspace data source. The push itself never connects ([conn] L238-251; [routes] L558-565).
  3. `PUT …/overlays/{id}` with `upserts`, `deletes`, the whole `connections` set, and `baseVersion`.
  4. Queries with a user token naming the overlay. Check `x-xcube-overlay: <id>@<version>` ([rt] L1875).

```ts
// wechart's API → xcube (admin credential). Shapes from [routes] L155-188, [rt] L1453-1567.
type SealedV1 = { v: 1; kid: string; enc: string; ct: string };
type OverlayConnection = {
  folderId: string;                 // ≤ 64; 'froot' or a folder in the model's tree
  name: string;                     // ≤ 64; a short name, ~~/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/~~ Corrected (xcube-256d632371.md): /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/, ≤ 40, bare and one per model in any case
  driver: string;                   // one of the eight
  authMethod: string;
  fields?: Record<string, string | number | boolean | null>; // exactly as the browser sealed with
  sealed?: Record<string, SealedV1>;
};                                  // no other key: `revisions` is refused (400 bad_request)
type PutOverlay = {
  upserts?: { folderId: string; name: string; kind: 'cube' | 'view'; yaml: string }[];
  deletes?: { folderId: string; name: string }[];
  connections?: OverlayConnection[]; // ≤ 20; default []: omitted means none
  ttlSeconds?: number;
  baseVersion?: number | null;
};
```

## API surface we will use

All model routes are `{CUBE_API_URL}/v1/semantic/models/{model}/…` ([routes] L284). Errors are `{ error, code, …details }` ([routes] L286-339).

### `PUT …/overlays/{id}`: new and changed answers

| Code | Status | Body | When | Source |
| --- | --- | --- | --- | --- |
| `bad_request` | 400 | `error` | Joi: more than 20 connections; a connection key other than the six (e.g. `revisions`); `name`/`folderId` over 64; `driver`/`authMethod` missing | [routes] L155-160, L178-188, L201-207 |
| `invalid_connection` | 400 | `error`, `problems` | Any connection check below. `error` is prefixed `Data source <folderId>/<name>: ` | [rt] L1574-1612; [routes] L303-305 |
| `invalid_secret` | 422 | `error` | An envelope doesn't open for its target (`Data source froot/default: password: the stored secret can't be used for this connection target; enter it again`); its kid isn't held; a required secret is empty; xcube holds no key | [rt] L1606-1607; [cred] L152-172; [conn] L219-236; [routes] L306-308; [t-conn] L382-384 |
| `older_instances` | 409 | `error`, `instances: string[]` | Connections present, while any xcube connection named `xcube[-listen]:` with no version or `v<7` is on the database | [rev] L403-414, L579-585; [routes] L312-314; [t-conn] L408-417 |

The slice-5 codes are unchanged: `invalid_overlay_id`, `unknown_model`, `mode`, `too_many_overlays`, `conflict`, `invalid_items`, `busy` ([routes] L593-640; [x5]).

**Connection checks** (`checkOverlayConnections`, [rt] L1574-1612), each refused as `invalid_connection`:
- `name` must match ~~`SHORT_NAME` ([items] L16): "has no valid short name"~~ *Corrected:* `checkDataSourceName` (the item grammar, ≤ 40, no reserved words), and `default` outside the root or not lower case is `400 default_outside_root` (`runtime.ts` `checkOverlayConnections`, `checkDefault`; [`xcube-256d632371.md`](./xcube-256d632371.md));
- `folderId` must be `froot` or in the tree: "is in folder …, which is not in the folder tree";
- ~~a full name may appear only once: "is brought twice"~~ *Corrected:* a name may appear once, in any case: `409 name_in_use`, `The overlay brings two data sources named "<n>"; names are one per model` (`runtime.ts` `checkOverlayConnections`; [`xcube-256d632371.md`](./xcube-256d632371.md));
- then `Connections.check` ([conn] L239-251): only the driver's and auth method's fields, no secret in `fields`, required fields present, envelope shapes and required secrets ([conn] L169-216); every secret opens for `(driver, field, fields)` ([conn] L219-236); the driver's config builds ([conn] L245-249). **Nothing connects.**
- **Not checked:** that a copy keeps the published connection's driver. `putConnection`'s `driver_change` check ([rt] L1713-1718) has no counterpart here (Gotcha 1).

**Order of `putOverlay`** ([rt] L1453-1531; [rev] L556-609):
1. No head → `unknown_model`; a files-mode head → `mode`.
2. `baseVersion` mismatch → `conflict`; a new id at the limit → `too_many_overlays`.
3. `checkOverlayConnections` → `400`/`422`.
4. The content hash.
5. `applyOverlay` → `422 invalid_items` on name or binding errors.
6. The compile, unless the stored overlay has the same hash, `validatedRevision` and tree → `422 invalid_items`.
7. The store transaction, under the model's row lock ([rev] L562-608):
   - it re-checks `baseVersion` and the limit;
   - **if there are connections, `older_instances`**;
   - it upserts, keeping the version when `content_hash` is unchanged, and sends `pg_notify`.
- **A refused push changes nothing stored.** Tested: after a `422` and a `400`, the previous version still previews `7` ([t-conn] L381-390).

**Content hash** ([rt] L1483-1489, L385-390):
- It is SHA-256 of `JSON.stringify([itemsHash(upserts), sorted "folderId/name" deletes, …(connections.length ? [connectionsHash] : [])])`.
- `connectionsHash` sorts by full name and serialises `[folderId, name, driver, authMethod, fields, sealed]` with object keys in one order. **The envelopes are in it.**
- With no connections the formula is slice 5's, so overlays without data sources keep their hash across the upgrade (by reading).
- Same hash → `200`, `created: false`, the same `version`, a new `expiresAt` ([rev] L586-606; [x5] tested same-content push). Re-sealing a secret makes a new version.

**Whole set per push.** `connections` defaults to `[]`, and the stored column is replaced by each push ([routes] L185; [rev] L592). A push that omits it drops the overlay's data sources.

**Answer:** unchanged, `{ model, id, version, created, revision, expiresAt, items }` ([routes] L630-638). `items` lists upserted items only. Cubes that are only rebound to an overlay data source are not listed ([rt] L1529).

### `GET …/overlays/{id}`

```ts
{ model, id, version, expiresAt, validatedRevision, upserts: { folderId, name, kind }[], deletes,
  connections: { folderId, name, fullName, driver, authMethod, fields, secrets: string[] /* sorted */ }[],
  instance: { revision, state: 'serving' | 'idle' } | { revision, state: 'broken', errors, cubeMessage } }
```
- Source: [rt] L1534-1567; [readme] L672-682.
- Tested: `connections` is `[{ folderId: 'froot', name: 'default', fullName: 'default', driver: 'postgres', secrets: ['password'], … }]`, and the body contains no `"enc"` ([t-conn] L372-376).

### What a preview does with them

**Binding** ([rt] L1398-1445; [pub] L223-258, L349-358):
- `sources` is the model's published connections as `{ folderId, short name }` ([rt] L1753-1758), minus any whose ~~full~~ name an overlay connection has (*Corrected:* the same name in any case, wherever either is: `runtime.ts` `publishOverlay`; [`xcube-256d632371.md`](./xcube-256d632371.md)), plus the overlay's own ([rt] L1405-1410). `publish(…, overlay: true, dataSources: sources)` binds them.
- **Only the overlay's upserted cubes are bound** ([pub] L349-358), ~~nearest-first along the cube's folder chain ([pub] L232-235). A cube naming none gets the nearest `default`, and the root's is written as nothing ([pub] L250-256).~~ *Corrected:* by name, exactly; the data source must be in the cube's folder or an ancestor (`data_source_range`, own items only); a cube naming none uses the root's `default`, the only one (R71 4.1-4.3) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Published cubes keep their stored binding.** `boundDataSource` reads it from the resolved YAML: its `data_source`, `default` when none, `null` when it `extends` ([ovc] L9-15; [t-uov] L40-47).
- **A cube, published or upserted, whose bound data source the overlay brings is "on" it** ([rt] L1425-1431):
  - its rollups are stripped, with everything reaching it and its `extends` ancestors ([rt] L1432; [rollups] L48-63);
  - its file is marked `# xcube: overlay data source <name> (<cubeType>)`, so its module's content differs and it compiles apart ([rt] L1433-1438; [ovc] L24-34).
- Tested:
  - a copy of the root `default` pointed at another database. The published cube `orders` previews `7` from it; the published model answers `42` ([t-conn] L361-370);
  - a new data source `scratch` bound by a workspace cube: preview `7`, published model unaffected ([t-conn] L392-406).

**Dialect:**
- `createCompilerApi` gives Cube a `dbType` that returns the mark's driver type for a marked data source, and otherwise asks `driverFactory` ([srv] L116-128; [ovc] L36-51).
- `driverFactory` answers the brought driver's `cubeType` for a context pinned to that overlay version ([cfg] L188-196).
- The mark is unit-tested with `snowflake` ([t-uov] L49-57). No end-to-end test uses a driver other than postgres (Gotcha 11).

**Orchestrator** ([cfg] L160-171):
- For a context whose pin is an overlay version with data sources, the id is `${base}_${model}_O_${id}_${version}`. `base` is `cube.js`'s `contextToOrchestratorId`, else `STANDALONE`. Model ids have no capitals, so `_O_` can't collide with a model's id.
- **Every module of such a preview uses it.** `pinFor` pins every request of a preview to the overlay's key ([rt] L1892, L1270-1273), and `overlayOfAppId` parses that key ([ovc] L53-57).
  - Tested: `STANDALONE_dev_O_ws-copy_<version>` is registered ([t-conn] L377-378).
- **Own result cache and queues.**
  - Cube passes `redisPrefix: orchestratorId` ([c-srv] L534). `QueryCache` keys results `${prefix}#SQL_QUERY_RESULT:<hash>` and names queues `SQL_QUERY_${prefix}_${dataSource}` ([c-qc] L43-44, L91-93, L345, L810; [c-qo] L70, L78).
  - So the separation holds with any cache driver, Cube Store included (by reading).
  - Tested both ways with the memory driver: preview `7`, published `42`, preview `7` ([t-conn] L118, L366-370).
- **It never builds rollups.** Such previews get `preAggregationsOptions.externalRefresh: true` ([cfg] L220-229). In Cube 1.7.45 that serves only already-built partitions. A missing one throws "No pre-aggregation partitions were built yet…" or yields none ([c-pal] L78-81, L90, L116-123; [c-pa] L525-529).
- **Drivers** ([srv] L80-104):
  - A data source the overlay brings gets `overlayDriverFor`: built and tested (`testConnection`, 30 s), with its secrets opened at connect and errors redacted. It is never swapped, and it reports no health ([conn] L287-300, L344-356).
  - Any other data source gets the published connection's driver. `default` falls back to Cube's environment.
  - **Any other name is refused, "has no connection", when the model has connections or the overlay brings any** ([srv] L95-101; [cfg] L197-205).
- **Limits and release.**
  - xcube keeps at most 20 overlay versions' orchestrators per process, most recently used last. The 21st retires the oldest at once; that version's next preview builds another ([rt] L1660-1671).
  - Cube's `OrchestratorStorage` is sized 120 ([srv] L43-44). A removed entry is released through `disposeAfter` ([c-os] L8-22), and xcube's wrapper then releases its connection drivers ([srv] L54-74).
  - The subclass field replaces Cube's `orchestratorStorage = new OrchestratorStorage()` ([c-srv] L68). Cube reads it lazily in `apiGateway()` ([c-srv] L332-338), by reading.
  - `retireUnused` releases the orchestrators of versions no kept revision serves, and marks their connection sets retired ([rt] L2580-2602).
    - An **idle** version (unused for `XCUBE_OVERLAY_IDLE_MS`) is retired at the next 30 s tick with **no grace** ([rt] L600, L2524-2528, L2545-2551).
    - A **replaced or dropped** version waits `XCUBE_RETIRE_GRACE_MS` (5 min) ([rt] L1252-1268; [set] L156).
  - Tested with the grace skipped: after a drop, the workspace database's connections fall to 0 ([t-conn] L421-429).
- **A retired version is never served from the published data sources.**
  - A request pinned to it answers `503` "The overlay this request was pinned to is no longer compiled here; try again" ([rt] L755-769, L1632-1653, L329-331).
  - Its dialect is still answered, since Cube asks with the compiling context ([cfg] L188-191).
  - Tested ([t-conn] L430-437).

### Landing and testing (unchanged routes)

- **Landing.** Use `PUT …/connections/{~~fullName~~}` with `{ folderId, driver, authMethod, fields, sealed, revisions }` (*Corrected:* `{name}` is the bare name, and `baseVersion` is required: `null` creates, a version edits or moves; R71 2.5; [`xcube-256d632371.md`](./xcube-256d632371.md)) ([routes] L162-165, L567-574; [rt] L1696-1732).
  - A different driver than the stored one's answers `409 driver_change` ([rt] L1713-1718).
  - Publish the items after. Binding needs the connection to exist ([x6] "the order of calls").
- **Testing.** `POST …/connections/test` with `{ driver, authMethod, fields, sealed }` → `200 { ok, checks }` ([routes] L558-565; [x6]).

### The TLS binding: v1 target keys (at `1249dda9ca`, and so at `ed08180c37`)

`secretAadV1(driver, field, fields)` is `JSON.stringify(["wechart/data-source-secret/v1", driver, field, pairs])` ([cred] L42-48):
- the pairs are `DRIVERS[driver].target` sorted with JavaScript's default sort;
- each value is `String(v)` as sent, and `""` when absent or `null`.

| Driver | `target` (declared) | Sorted as in the AAD | Source |
| --- | --- | --- | --- |
| postgres | host, port, ssl, sslRejectUnauthorized, sslCa | host, port, ssl, sslCa, sslRejectUnauthorized | [drv] L74, L97 |
| redshift | host, port, ssl, sslRejectUnauthorized, sslCa | as postgres | [drv] L113 |
| mysql | host, port, ssl, sslRejectUnauthorized, sslCa | as postgres | [drv] L132 |
| mssql | host, port, encrypt, trustServerCertificate | encrypt, host, port, trustServerCertificate | [drv] L221 |
| dremio | host, port, url, ssl | host, port, ssl, url | [drv] L270 |
| snowflake | account, region, warehouse | same | [drv] L157 |
| bigquery | projectId | same | [drv] L181 |
| oracle | connectString, database, host, port | same | [drv] L246 |

- **1249dda9ca's change** ([p-tls]): it added `TLS_TARGET` to postgres, redshift and mysql, `encrypt, trustServerCertificate` to mssql, and `ssl` to dremio. Before, those were `host, port` and `host, port, url`.
- **A changed bound field makes the open fail** with `<field>: the stored secret can't be used for this connection target; enter it again` → `422 invalid_secret` ([cred] L152-172; [routes] L306-308).
  - Tested on `PUT …/connections` by turning `sslRejectUnauthorized` off with the stored envelope ([t-conn] L189-193).
  - Tested on an overlay copy with `ssl: true, sslRejectUnauthorized: false` ([t-conn] L385).
- **Golden AAD strings** for postgres, mysql, mssql, oracle and dremio are in [t-cred] L33-48. For example, `secretAadV1('mysql','password',{ host:'h', port:3306, ssl:true, sslRejectUnauthorized:false, sslCa:'PEM' })` is `["wechart/data-source-secret/v1","mysql","password",[["host","h"],["port","3306"],["ssl","true"],["sslCa","PEM"],["sslRejectUnauthorized","false"]]]`.
- **How the drivers use these fields:**
  - MySQL passes them as its `ssl` object, and omits it when TLS is off ([drv] L133-143).
  - Dremio's `ssl` picks `https`/`http` for host and port only; a `url` (Cloud) is used as given ([drv] L279-288; [c-dremio] L93-104).

## What wechart must change

| Item | Today | At `ed08180c37` |
| --- | --- | --- |
| **Image pin** (the user's decision, [handoff] L174-175) | `…-c0610bb768@sha256:d787e67c…` in compose L152, L182, Helm `values.yaml` L67, `docker-desktop.yaml` L23, and `cube-image.test.ts` L24 ([w-compose]; [w-helm-values]; [w-helm-dd]; [w-img-test]) | `…-ed08180c37@sha256:bc041aa2…`. Everything [x5] and [x6] require for slices 4-6 still applies |
| **`cube.js`** ([w-cube] L17-18) | No `overlayClaim` | Add `overlayClaim: 'wechartOverlay'` ([x5] Gotcha 1; [cfg] L107) |
| **T347** (AC-281, AC-283, AC-323; [w-tasks] L5582-5590) | Path `/v1/semantic/overlays/{id}`; items only | Path `…/models/{model}/overlays/{id}` ([x5]). Push `connections` on every save: the workspace's whole set, ≤ 20, each with exactly `folderId, name, driver, authMethod, fields, sealed` (no `revisions`). Map `400 invalid_connection` (`problems`), `422 invalid_secret` (ask for the named data source's secret) and `409 older_instances` (keep the workspace's data sources and retry after the roll-out; a push without them still works). Retry the `503` "no longer compiled here". Key any `/v1/meta` cache by overlay ([x5] Gotcha 18) |
| **T346** (AC-280, AC-298; [w-tasks] L5572-5581) | Byte copy of the ciphertext | Push the copy with the original's `folderId` and short `name` (~~same full name~~ *Corrected:* the same name is enough, in any folder, R71 2.6, [`xcube-256d632371.md`](./xcube-256d632371.md); so it replaces the original in previews), its `driver` and `authMethod`, `fields` exactly as stored, and `sealed` byte for byte. It opens only while every target key is the original's ([rt] L1574-1612; [t-conn] L361-385). The AAD has no data-source id, so no re-seal is needed ([cred] L42-48; [w-cs] L23, L35) |
| **Driver changes** | — | The user decided a workspace copy keeps its driver ([ans-drv] L8). xcube accepts a changed driver in an overlay and would preview in the new dialect, so wechart must enforce this itself. `409 driver_change` at landing is the backstop ([rt] L1713-1718) |
| **T345** (AC-282; [w-tasks] L5568-5571) | Target folder for new items | A data source created in the workspace is pushed with `folderId` = its target folder. Its secret is sealed in the browser for its own target (T441). A new name binds only the workspace's cubes on that folder's path ([pub] L232-235, L349-358). Under an existing published ~~full~~ name it **replaces** that data source for published cubes too (Open question 1). *Corrected:* any folder; names are one per model, and a cube using it must be on its path (R71 2.6, 4.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)) |
| **AC-312** ([w-spec] L1102-1103) and its clearing rule | "host, port, account, workspace, warehouse, project or connect string" | Clear on a change to any v1 target key for the driver, TLS fields included (table above). Drop "workspace". The spec's text needs the spec gate ([x6] "What wechart must change") |
| **T441** (AC-325, AC-298; [w-tasks] L6968-6976) | `packages/core/src/data-sources/drivers.ts` marks only host/port-style targets and still lists `databricks-jdbc` ([w-drv] L19, L72-73, L131-138, L179-180) | `V1_TARGET_KEYS` = xcube's `target` per driver, frozen; golden vectors from [t-cred] L33-48. Send `fields` exactly as sealed: no defaults filled, no `false` dropped. `ssl` absent and `ssl: true` bind differently ([n-tls] L37; [cred] L42-48) |
| **T442 / landing** (AC-161, AC-327; [w-tasks] L6977-6983) | Not built | On approval, `PUT …/connections/{~~fullName~~ name}` (*Corrected:* bare name, with `baseVersion`, R71 2.5; [`xcube-256d632371.md`](./xcube-256d632371.md)) for each workspace data source first (with `revisions`), then the items, then drop the overlay |
| **Preview checks** | — | A preview with data sources can fail with the redacted `Data source "<name>" of the overlay can't be used: …` when the copy can't connect ([conn] L344-356). Surface it on the tile. Test before pushing with `POST …/connections/test` |
| **`xcubeAdmin` client** ([x5] "What wechart calls today") | `call` sends GET/PUT/POST only | Unchanged need: `DELETE` for overlays; a `putOverlay` with `connections`; `GET` overlay status with `connections` |

## Gotchas

1. **xcube doesn't refuse a driver change in an overlay.**
   - `checkOverlayConnections` has no stored-driver comparison ([rt] L1574-1612). The copy is previewed in its own dialect ([ovc] L24-51).
   - Landing it answers `409 driver_change` ([rt] L1713-1718). wechart refuses it up front, by the user's decision ([ans-drv] L8).
2. **Data sources bind by folder path, not overlay-first.**
   - Items in an overlay resolve overlay-first by short name ([x5] Gotcha 5). ~~Data sources resolve nearest-first along the cube's folder chain only ([pub] L232-235).~~ *Corrected:* data sources bind by name, held to the cube's folder path (R71 3.4, 4.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - **A copy replaces the original only with the same ~~full~~ name.** ~~That means the same `folderId` and short `name` ([rt] L1405-1410).~~ *Corrected:* the same name in any case, in any folder (R71 2.6; `runtime.ts` `publishOverlay`) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - ~~A copy placed elsewhere is a new data source. It binds only workspace cubes on that folder's path, and published cubes keep the original ([pub] L349-358).~~ *Corrected:* a copy of that name placed elsewhere still stands in for the original (R71 2.6) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
3. **Omitting `connections` drops them.** The field defaults to `[]` and replaces the stored set, so the overlay gets a new version without them ([routes] L185; [rev] L592).
4. **Only six keys per connection.** Sending `revisions`, `fullName` or any other key answers `400 bad_request` ([routes] L155-160, L182-185).
5. **Every push with connections opens every secret and re-runs the older-instances check, even with the same content** ([rt] L1482; [rev] L579-585).
   - So a push meant only to extend the expiry can be refused with `422`, after a key is removed from xcube, or with `409`, during a roll-out.
   - When that happens, the expiry is not extended.
6. **`older_instances` is checked last, and only at push time.**
   - It comes after the compile ([rev] L579-585), so a push can compile and still be refused.
   - It only prevents new pushes. An xcube before schema 7 started later (a rollback) previews such overlays on the published data sources and still answers `200` with `x-xcube-overlay`, since overlays exist from slice 5 ([readme] L362-366; [x5] `pinFor`). wechart can't tell from the answer.
7. **In a model without published connections, a preview that brings any data source refuses every other non-`default` name.**
   - A published cube naming, say, `warehouse` fails in that preview with `Data source "warehouse" of model "<m>" has no connection` ([srv] L99-101; [cfg] L202-205). That is how the model would behave once they land ([readme] L353-354).
   - By reading; untested.
8. **Such previews never build rollups.**
   - Unreached cubes keep their rollups, and the preview reads only built partitions (`externalRefresh`, [cfg] L220-229).
   - A rollup the published side hasn't built makes those queries fail with Cube's "No pre-aggregation partitions were built yet…" ([c-pal] L116-123; [c-pa] L525-529). By reading.
9. **Connection load on the copy's database.**
   - Each Cube API instance that serves a preview opens its own pool per overlay version ([conn] L344-356; [srv] L85-88), up to 20 versions per process ([rt] L1660-1671).
   - Every content change, including re-sealing, is a new version and so a new orchestrator. The old one closes after the 5-min grace ([rt] L1261-1266; [set] L156). By reading.
10. **Preview drivers write no health rows.** `overlayDriverFor` never calls `report` ([conn] L344-356). `…/connections/{name}/health` shows nothing about previews, and a connect failure appears only in the query's error.
11. **Dialect change is tested only at the unit level.**
    - The integration tests use postgres for both the original and the copy ([t-conn] L332-339, L392-401).
    - The mark and the `dbType` override are what carry another dialect ([t-uov] L49-57; [srv] L116-128).
12. **A push doesn't connect.** A wrong password passes the push, since the envelope opens, and fails at the first preview ([conn] L238-251, L287-300).
13. **Compile cost.** A copy of the root `default` marks every cube bound to it, so their modules compile for the preview without rollups ([rt] L1425-1438). With one-module packing that is the whole model ([x5] Gotcha 8).
14. **The AAD sees `String(v)`, but the content hash sees JSON.** Sending `port` as `"5432"` instead of `5432` opens the same envelope ([t-cred] L85-86) but changes the hash, and so the version ([rt] L385-390). Send stored values unchanged.
15. **The 21st overlay version with data sources evicts the least recently used one's orchestrator at once.** Its next preview reconnects ([rt] L1665-1670).
16. **A preview pinned to a version retired mid-request answers `503`** ([rt] L1646-1649, L762-765). wechart's catch-up retry doesn't match that message ([x5] "What wechart calls today").

## Corrections

| Doc and statement | Now | Source |
| --- | --- | --- |
| [x5] L91-97 (Provenance): overlay-connection work (`src/overlays/connections.ts`, migration 7, `connections` on stored overlays, a 64-line unit test) is uncommitted; "don't build this tree" | Committed in `ed08180c37`, the branch head, and published as `v1.7.45-ed08180c37@sha256:bc041aa2…`. The tree equals the commit for the cited files | [reflog] L16; [p]; [ghcr] |
| [x5] L96: "The committed migrations end at version 5" | True at `d26ff4238e`. At `ed08180c37` they end at 7 | [mig] L229-245 |
| [x5] L177, L504: `SCHEMA_VERSION` 5, `xcube:v5:`; [x6] L227, L576: 6, `xcube:v6:` | 7, `xcube:v7:` | [mig] L245; [db] L22-24 |
| [x5] L249-256: the PUT request has no `connections` | Adds `connections?: OverlayConnection[]` (≤ 20) | [routes] L178-188 |
| [x5] L262 (step 5): `contentHash` = SHA-256 of `[itemsHash, sorted deletes]` | Plus `connectionsHash` when connections are present; envelopes are in it | [rt] L1483-1489, L385-390 |
| [x5] L257-270 (order): items apply, then compile, then store | `checkOverlayConnections` runs before `applyOverlay`; the store adds `older_instances` when connections are present | [rt] L1482; [rev] L579-585 |
| [x5] L291-299: `GET` answer | Adds `connections: { folderId, name, fullName, driver, authMethod, fields, secrets }[]` | [rt] L1556-1564 |
| [x5] L383: a preview query with the same SQL as a published one shares its cached result | Still true for overlays **without** data sources. With data sources, the version has its own orchestrator and cache prefix | [cfg] L160-171; [c-qc] L91-93 |
| [x5] L397 and Gotcha 2 (L457-460): no overlay push checks for older instances; `olderInstances(client)` takes no version | `olderInstances(client, below)`; `putOverlay` calls it with 7 when connections are present. Pushes without connections are still unchecked, so Gotcha 2 stands for them | [rev] L403-414, L579-585 |
| [x5] L427 and Open question 6 (L541): workspace data sources are uncommitted work; do they wait for a later slice? | Built in `ed08180c37` | [c] |
| [x5] L503 (Corrections row): "Overlay connections (migration 7) are the tree's uncommitted work now" | Committed | [p] |
| [x5] L522 and [w-rt] L403-406: repointed data sources share result-cache entries and rollup tables | Settled for overlays that bring data sources: own orchestrator per version, rollups stripped for cubes on them, and `externalRefresh` so nothing is built | [cfg] L160-171, L220-229; [rt] L1432 |
| [x6] L109, L122-125, L233, L495, L603, L661: overlay data sources are in no commit or image | In `ed08180c37` and its image | [p]; [ghcr] |
| [x6] Install L196-200 and Summary L179: pin `…-1249dda9ca@sha256:460c1ab1…` | The user pinned `…-ed08180c37@sha256:bc041aa2…`, which carries the same TLS binding. `v1.7.45-feat-xcube` now tags it | [handoff] L174-175; [ghcr] |
| [x6] L412 and Gotcha 13: Cube's `OrchestratorStorage` is an LRU of 100 | xcube's server sizes it 120: 100 plus 20 for previews | [srv] L43-44 |
| [x6] Open question 4 (which image): open | Answered by the user: `ed08180c37` | [handoff] L174-175 |

Still true at `ed08180c37`:
- [x6]'s findings on `putConnection`: no `older_instances` guard, every PUT a new version, `driver_change` ([rt] L1696-1732).
- [x6]'s sealing table ([cred] and [drv] are unchanged since `1249dda9ca`, [p]).
- [w-cs] L23 and L35: a copy is a byte copy.

## Open questions / unverified

1. **For the user (T345):** a data source created in the workspace under the ~~full name of a published one (same folder, same short name)~~ name of a published one (*Corrected:* any folder, any case, R71 2.6; [`xcube-256d632371.md`](./xcube-256d632371.md)) replaces the published one in previews for published cubes too ([rt] L1405-1431). Should wechart allow that, or reserve replacement for copies?
2. **UNVERIFIED by running** (by reading only):
   - a preview in a different dialect (e.g. a mysql copy);
   - Gotcha 7 (a model without published connections);
   - Gotcha 8 (the `externalRefresh` error on an unbuilt rollup);
   - cache separation with Cube Store as the cache driver (the test uses `memory`, [t-conn] L116);
   - previews across several instances;
   - release after 10 minutes idle;
   - LRU eviction at the 21st version.
3. **UNVERIFIED:** the HTTP status and body Cube gives a load that fails with `Data source "<n>" of the overlay can't be used: …`. Not tested; Cube's error path wasn't read.
4. **UNVERIFIED:** a cube that `extends` one bound to an overlay data source.
   - It isn't marked, since `boundDataSource` returns `null` ([ovc] L14). It is reached, so its rollups are stripped ([rollups] L12-31).
   - Whether its module compiles in the copy's dialect when it sits in a module without a mark wasn't traced.
5. **For xcube (through the Cube-expert agent), if wanted:** report preview drivers' health (Gotcha 10).
6. **For the spec:** AC-312's key list (TLS fields, no "workspace"), and whether AC-280 names previews.
7. **Not viewed:** per-test CI output.

## Input claims checked

[in] is `docs/inputs/2026-09-26-xcube-overlay-data-sources.md`, by line. [n-ov] and [n-tls] are xcube's notes.

| # | Claim (source line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Built on `feat/xcube`, commit `ed08180c37`; README "Overlays" and "PUT …/overlays/{id}" ([in] L9) | Verified | [reflog] L16; [readme] L346-366, L629-670 |
| 2 | `PUT` takes an optional `connections`, at most 20 ([in] L13) | Verified | [routes] L182-185; [rt] L1575-1577. More than 20 is Joi's `400 bad_request` |
| 3 | The body example ([in] L15-19) | Verified | [readme] L633-638 |
| 4 | Each is a data source as it would land, by its short name in the folder it would land in; fields and envelopes of `PUT …/connections/{name}`; the whole set each push ([in] L22) | Verified, with a limit | [rt] L1574-1612; [routes] L182-185. `revisions` is **not** accepted (Gotcha 4). Omitted means none (Gotcha 3). *Corrected:* the name is bare and one per model, in any folder (R71 1.1, 2.6) ([`xcube-256d632371.md`](./xcube-256d632371.md)) |
| 5 | A copy keeps envelopes byte for byte; they open only while its target, TLS included, is the original's; otherwise `422 invalid_secret` naming the data source ([in] L23) | Verified | [rt] L1592-1607; [cred] L152-172; [t-conn] L381-385 (the error contains `froot/default`) |
| 6 | Checked as a connection is; a bad one → `400 invalid_connection` naming it; a refused push leaves the overlay ([in] L24) | Partly | [rt] L1574-1612; [t-conn] L386-389. No driver-change check (Gotcha 1) |
| 7 | The same content changes only the expiry; envelopes are in the content, so re-sealing makes a new version ([in] L25) | Verified by reading | [rt] L385-390, L1483-1489; [rev] L586-598. Secrets are re-opened and older instances re-checked (Gotcha 5) |
| 8 | `409 older_instances` while an older xcube serves; a push without connections is unaffected ([in] L26) | Verified | [rev] L579-585; [t-conn] L408-417 |
| 9 | `GET` lists `{ folderId, name, fullName, driver, authMethod, fields, secrets }`; no envelope ([in] L27) | Verified | [rt] L1556-1564; [t-conn] L372-376 |
| 10 | They bind as published data sources do, nearest-first from each cube's folder ([in] L31) | Verified | [pub] L223-258; [rt] L1411-1419. *Corrected:* ~~nearest-first~~ by name, held to the cube's folder path (R71 3.4, 4.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)) |
| 11 | A copy under a published name replaces it for every cube bound to it, published or in the workspace ([in] L32) | Verified | [rt] L1405-1431; [t-conn] L361-370 (a published cube previewed on the copy) |
| 12 | A new name binds only the workspace's own cubes ([in] L33) | Verified | [pub] L349-358; [t-conn] L392-406 |
| 13 | The cubes bound to one compile without rollups, in its dialect; a copy may change the driver ([in] L34) | Verified by reading; dialect change untested end to end | [rt] L1425-1438; [srv] L116-128; [t-uov] L49-57 |
| 14 | The publish that lands it would answer `409 driver_change` ([in] L35) | Verified | [rt] L1713-1718 |
| 15 | Previews of a version with data sources get their own orchestrator: drivers, queues, result cache ([in] L36) | Verified | [cfg] L160-171; [c-srv] L534; [c-qc] L91-93, L345 |
| 16 | Cube keys cached results by the SQL alone, so without it the caches would cross ([in] L37) | Verified by reading | Cache key = prefix + hash of the query's cache key ([c-qc] L91-93, L810); [w-rt] L395 |
| 17 | A test checks both directions against two Postgres databases ([in] L38) | Verified | [t-conn] L361-370: two databases on one server; preview 7, published 42, preview 7 |
| 18 | A copy of the root's `default` reaches every cube bound to it; those modules compile again, without rollups ([in] L40) | Verified by reading | [rt] L1425-1438; [ovc] L9-15 |
| 19 | Connections are held while previewed, and released once the version is no longer served (`XCUBE_OVERLAY_IDLE_MS`, then the retire grace) ([in] L41) | Partly | Idle versions go with **no** grace at the next 30 s tick. Replaced or dropped ones wait the grace. LRU eviction is immediate ([rt] L600, L1261-1266, L2524-2528, L1665-1670) |
| 20 | At most 20 such overlays at once, LRU; Cube's cache is 120, so previews never push out a model's ([in] L42) | Verified; "never" holds while a process has at most 100 other orchestrators | [rt] L1660-1671; [srv] L44; [readme] L454-455 |
| 21 | Binding as it would land: a model without published connections binds as one with them; only `default` may fall back ([in] L43) | Verified by reading; untested | [rt] L1405-1419; [srv] L99-101; [cfg] L202-205 (Gotcha 7) |
| 22 | Rollback caveat: the check is at push time, so an older xcube started later previews on the published data sources ([in] L44) | Verified by reading | [readme] L362-366; [rev] L579-585 |
| 23 | T346: the copy's ciphertext goes into `connections` as it is ([in] L48) | Compatible | [rt] L1592-1601 (`sealed` stored as sent) |
| 24 | T345: sealed in the browser for its own target ([in] L49) | Compatible | [cred] L42-48 |
| 25 | T347: push the data sources with the items ([in] L50) | Compatible | [routes] L178-188 |
| 26 | Landing: `PUT …/connections/{name}` first, then the items ([in] L51) | Compatible | [x6] "the order of calls"; [pub] L223-258 |
| 27 | Testing stays `POST …/connections/test` ([in] L52) | Verified | [routes] L558-565 |
| 28 | Each is `{ folderId, name, driver, authMethod, fields, sealed }` ([n-ov] L12) | Verified; exactly these keys | [routes] L155-160, L182-185 |
| 29 | Image `…-ed08180c37@sha256:bc041aa2…`, amd64 and arm64, with slice 8 and the TLS binding ([n-ov] L29-31) | Verified | [ghcr]; [ghcr-v]; [reflog] L14-16 |
| 30 | For wechart to decide: driver changes ([n-ov] L25) | Answered: refuse in the workspace | [handoff] L176-177; [ans-drv] L8 |
| 31 | TLS built in `1249dda9ca`; a changed bound TLS field → `422`; tested by turning `sslRejectUnauthorized` off ([n-tls] L8) | Verified | [p-tls]; [t-conn] L189-193 |
| 32 | The per-driver target table ([n-tls] L12-21) | Verified | [drv] L97, L113, L132, L157, L181, L221, L246, L270 |
| 33 | MySQL uses the same three fields, passed as its `ssl` object ([n-tls] L25) | Verified | [drv] L125-145 |
| 34 | Dremio has only `ssl` (http/https for Software); no verification or CA setting; Cloud's TLS is the `url` scheme, bound ([n-tls] L27-29) | Verified | [drv] L263-290; [c-dremio] L93-104 |
| 35 | Snowflake, BigQuery and Oracle have nothing that turns verification off ([n-tls] L31-33) | Verified for xcube's configs; SDK internals UNVERIFIED | [drv] L146-261; [x6] Gotcha 22 |
| 36 | Pairs sorted, values as sent before defaults, absent `""` ([n-tls] L37) | Verified | [cred] L42-48 |
| 37 | The mysql example string, in the unit test with postgres, mssql, oracle and dremio ([n-tls] L38-40) | Verified | [t-cred] L33-48 |

[head]: /Users/srajagopal/Work/bi/cube/.git/HEAD
[ref]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (ed08180c372671410d16757558719234cac055aa)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[c]: https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa
[a]: https://api.github.com/repos/senthilkrajagopal/cube/commits/ed08180c372671410d16757558719234cac055aa
[p]: https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa.patch ("14 files changed, 657 insertions(+), 53 deletions(-)")
[d]: https://github.com/senthilkrajagopal/cube/commit/ed08180c372671410d16757558719234cac055aa.diff
[p-tls]: https://github.com/senthilkrajagopal/cube/commit/1249dda9ca7570cb7218ab2cdd4a28065fa15058.patch ("4 files changed, 53 insertions(+), 26 deletions(-)")
[checks]: https://api.github.com/repos/senthilkrajagopal/cube/commits/ed08180c372671410d16757558719234cac055aa/check-runs
[jobs]: https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36269408981/jobs
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
[ghcr-v]: https://github.com/users/senthilkrajagopal/packages/container/xcube/1299414474?tag=v1.7.45-ed08180c37
[ghcr-pkg]: https://github.com/users/senthilkrajagopal/packages/container/package/xcube
[raw-*]: https://raw.githubusercontent.com/senthilkrajagopal/cube/ed08180c372671410d16757558719234cac055aa/xcube/{src/runtime/runtime.ts, src/admin/routes.ts, src/store/revisions.ts, src/config.ts, src/server.ts, test/integration/connections.test.ts}
[readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md (= ed08180c37; hunks +343, +631, +667 match)
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts (= ed08180c37)
[cfg]: /Users/srajagopal/Work/bi/cube/xcube/src/config.ts (= ed08180c37)
[srv]: /Users/srajagopal/Work/bi/cube/xcube/src/server.ts (= ed08180c37)
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (= ed08180c37)
[rev]: /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts (= ed08180c37)
[mig]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts (= ed08180c37)
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
[db]: /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts (not in the diff)
[ovc]: /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts (new, 57 lines)
[rollups]: /Users/srajagopal/Work/bi/cube/xcube/src/overlays/rollups.ts (not in the diff)
[conn]: /Users/srajagopal/Work/bi/cube/xcube/src/connections/connections.ts (= ed08180c37)
[drv]: /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts (= 1249dda9ca = ed08180c37)
[cred]: /Users/srajagopal/Work/bi/cube/xcube/src/credentials/credentials.ts (unchanged since 6a)
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts (not in the diff)
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
[t-conn]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts (= ed08180c37)
[t-uov]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/overlays.test.ts (= ed08180c37, 64 lines)
[t-cred]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/credentials.test.ts (= 1249dda9ca)
[wf]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[c-os]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OrchestratorStorage.js (1.7.45)
[c-srv]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js (1.7.45)
[c-qc]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/QueryCache.js (1.7.45)
[c-qo]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/QueryOrchestrator.js (1.7.45)
[c-pal]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregationLoader.js (1.7.45)
[c-pa]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/query-orchestrator/dist/src/orchestrator/PreAggregations.js (1.7.45)
[c-dremio]: /Users/srajagopal/Work/bi/cube/packages/cubejs-dremio-driver/driver/DremioDriver.js (1.7.45)
[in]: /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-overlay-data-sources.md
[n-ov]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1900-overlay-data-sources.md
[n-tls]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1800-tls-target-keys.md
[ans-drv]: /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-26-1849-driver-change-answer.md
[handoff]: /Users/srajagopal/Work/wechart/docs/handoff.md
[x5]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-5.md
[x6]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-6.md
[w-rt]: /Users/srajagopal/Work/wechart/docs/research/cube/xcube-runtime.md
[w-cs]: /Users/srajagopal/Work/wechart/docs/research/credential-sealing.md
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md (AC-280 L1023-1024; AC-312 L1102-1103)
[w-tasks]: /Users/srajagopal/Work/wechart/docs/tasks.md (T345 L5568; T346 L5572; T347 L5582; T441 L6968; T442 L6977)
[w-cube]: /Users/srajagopal/Work/wechart/infra/cube/cube.js
[w-compose]: /Users/srajagopal/Work/wechart/docker-compose.yml
[w-helm-values]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
[w-helm-dd]: /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
[w-img-test]: /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
