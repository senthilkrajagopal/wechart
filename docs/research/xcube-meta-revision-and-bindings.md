---
library: xcube at 40efaef823, the admin field list at a least revision and item bindings in answers (the user's Cube fork)
packages: [xcube]
version: 'xcube at 40efaef823 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0
  - https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0.patch
  - https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0.diff
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/40efaef823e737ce4530a7e6d85e4989e82745d0
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/40efaef823e737ce4530a7e6d85e4989e82745d0/check-runs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36291880157/jobs
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/runtime/runtime.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/admin/routes.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/names/publish.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/names/rewrite.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/overlays/connections.ts
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/1300141991?tag=v1.7.45-40efaef823
  - https://github.com/users/senthilkrajagopal/packages/container/package/xcube
  - /Users/srajagopal/Work/bi/cube/.git/HEAD
  - /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube
  - /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/security.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/overlays.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/items.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-26-2030-meta-revision-and-bindings.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-2130-meta-revision-and-bindings.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-4.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-5.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-6.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-overlay-data-sources.md
  - /Users/srajagopal/Work/wechart/docs/spec.md
  - /Users/srajagopal/Work/wechart/docs/tasks.md
  - /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/jobs/schedules.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/server.ts
  - /Users/srajagopal/Work/wechart/docker-compose.yml
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
  - /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
---
# xcube at 40efaef823: the admin field list at a least revision, and item bindings in answers (on Cube v1.7.45)

This doc is the sibling of [xov] (`ed08180c37`), [x4] and [x5]. It covers the one commit after `ed08180c37`, which is `40efaef823`: "feat(xcube): admin field list at a least revision; item bindings in overlay and changeset answers". It checks every claim in xcube's answer [ans] against wechart's request [req]. It also says what T420, T436 and T456 need to change, and corrects the sibling docs.

## Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube` ([head]).
  - `refs/heads/feat/xcube` and `refs/remotes/fork/feat/xcube` both point at `40efaef823e737ce4530a7e6d85e4989e82745d0` ([ref]; [fork-ref]).
  - The reflog's L17 is `ed08180c37… → 40efaef823…`, "commit: feat(xcube): admin field list at a least revision; item bindings in overlay and changeset answers". There is no later entry ([reflog] L16-17).
  - So exactly one commit lies between `ed08180c37` and `40efaef823`.
  - The parent is `ed08180c372671410d16757558719234cac055aa`. The author date is 2026-09-27T03:35:57Z, which is 20:35:57 −0700 on 26 Sep ([a]; [p]).
- **What the commit contains.** 9 files, +136 −34 ([p] diffstat; [a] agrees: 170 changes):
  - `README.md` (+14 −2), `package.json` (`1.7.45-7` → `1.7.45-8`) and `package-lock.json`;
  - `src/admin/routes.ts` (+13 −3), `src/gateway.ts` (+7 −3) and `src/runtime/runtime.ts` (+70 −22);
  - `test/integration/items.test.ts` (+7 −1), `overlays.test.ts` (+6) and `security.test.ts` (+16).
- **Not in the commit:** `settings.ts`, `migrations.ts`, `config.ts`, `server.ts`, `names/*`, `overlays/connections.ts`, `store/revisions.ts`, `test/image/serving.sh`, and every unit test ([p] diffstat). So this commit adds no environment variable, no migration and no image-check step.
- **The working tree equals the commit for the files cited.** Nothing was run (no Bash). I checked two ways:
  - **Hunk headers.** Every `@@ … +N` header puts its first line at the working tree's line ([d]):
    - `runtime.ts`: +222 → `ItemRef` L221-229; +1406 → L1409; +1434 → L1437; +1547 → L1548; +1857 → L1860-1871; +2852 → L2852;
    - `routes.ts`: +259 → L261; +485 → L485-497;
    - `gateway.ts`: +412 → L415-421;
    - `README.md`: +671 → L672-681; +771 → L774-777; +793 → L796-800;
    - tests: `security` +372 → L376-390; `overlays` +225 → L228-233; `items` +217 → L217-232.
  - **Raw text at the full SHA.** The raw files match the tree on the following ([raw-rt]; [raw-routes]; [raw-pub]; [raw-rw]; [raw-ovc]):
    - `servingRevision`: the `catchUpMs` race, the 503 message and the beyond-head comment;
    - `pinFor`: `Retry-After` `'2'` and `${model}@${revision.revision}`;
    - `revisionOf`'s check and `freshRead`'s doc comment;
    - `handle`'s `CubejsHandlerError` body, and the meta route's regex and error;
    - `answerItems`' and the overlay PUT's keys;
    - `bindDataSource`, the error returns in `publish`, and `bind` in `rewrite.ts`;
    - `boundDataSource`.
  - So working-tree line numbers are cited as commit lines.
- **CI run 36291880157** passed ([checks]; [jobs]). Both jobs' `head_sha` is `40efaef823e7…`:
  - **Job `test`** ran 03:36:03–03:39:42Z. It includes "Test, with the live-database suites" (03:37:39–03:39:37Z), which sets `XCUBE_TEST_DATABASE_URL` ([wf] L81). The three changed tests are in `describeWithDatabase` suites, so they ran ([t-sec] L26-27, L83).
  - **Job `image`** ran 03:39:44–03:41:52Z, including:
    - "Serves models from xcube's schema, imported through its admin API" (`serving.sh`);
    - "Each connection's driver takes its own fields, and none of Cube's";
    - "Publish, for amd64 and arm64" (03:41:06–03:41:28Z).
  - Per-test output was not viewed.

## Summary

**What `40efaef823` builds** ([c] message; [readme] L672-681, L774-777, L796-800):
1. **`GET …/models/{model}/meta?revision=<n>`** answers from revision `n` or a newer one.
   - It waits as a user token naming `wechartRevision` does, through the same `pinFor` ([rt] L1866-1870).
   - Otherwise it answers `503 unavailable` with `Retry-After: 2` ([rt] L1891-1899; [routes] L328-330).
   - Every `200` carries `x-xcube-revision: <model>@<revision>` ([rt] L1900; [routes] L492-495).
2. **Item references carry `bindings` (and a cube's `dataSource`).** This covers `items` in these answers:
   - `POST …/changesets`, both applied and `?dryRun=true`;
   - `PUT …/snapshot` with items;
   - `PUT …/overlays/{id}`.
   - Sources: [rt] L221-229, L2852-2866.
3. **`GET …/overlays/{id}`** gives each upsert its `fullName`, `bindings` and a cube's `dataSource`, as previews bind it, over the database head named in the new `boundRevision` ([rt] L1555-1586).

**What it means for wechart:**
- **AC-334 (T420, T436).** Jobs', Schedules' and a publish's whole field list can move to `GET …/meta?extended=true&revision=<recorded>` under the service token. This is the move T420 deferred ([w-tasks] L6563-6566). It meets T436's dependency, "xcube's least revision on `GET …/meta` (its published image)" ([w-tasks] L7065).
- **AC-321, R31 (T456).** Both sides of the approval check now exist: the preview's bindings (`GET …/overlays/{id}`) and the landing's (`POST …/changesets?dryRun=true`'s `items`). Two limits apply (Gotchas 11 and 14):
  - the dry run can't carry the proposal's data sources;
  - equal revision numbers don't prove an equal folder tree or data-source set.

## Install

- **No npm dependency.** wechart's only import of xcube is still `require('xcube')` in the Cube image's `cube.js` ([xov] "Install").
- **The image.** Pull it by digest:
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-40efaef823@sha256:9bdad274ff5ce60470ba150a0424898749b1c29ffe36528c643c4bebe476c45e
  ```
  - **The tag and the digest match.** The versions page lists this digest on version 1300141991, tagged `v1.7.45-40efaef823` and `v1.7.45-feat-xcube` ([ghcr]). The version page shows the same top-level digest ([ghcr-v]).
  - **The tag is the commit.** The workflow tags `v$cube-${GITHUB_SHA::10}` and `v$cube-feat-xcube` ([wf] L135-146), and the image job ran on `40efaef823` ([jobs]).
  - **Platforms** ([ghcr-v]):
    - linux/amd64 `sha256:a95e497072b552531cb009ba507004f7d1ddc76b164357ec06c93c5e1be6cbd8`;
    - linux/arm64 `sha256:0d9d6780e3621bc9d42a4e8641b8f77c7b79988d699fffc4bed0a5a2ad3a528a`;
    - "unknown/unknown" `sha256:0ee6558569afa41985784f75cf0fe77ae146132c3c7388427b85f6446d4260e7`. What this entry is: UNVERIFIED.
  - **Public**, per both the version page and the package page ([ghcr-v]; [ghcr-pkg]).
  - **`v1.7.45-feat-xcube` moved to this version.** Pin the digest, not the moving tag.
  - **What it carries:** everything in `ed08180c37`'s image, plus this commit ([reflog] L16-17).
- **No schema migration.** `migrations.ts` is not in the diff, so `SCHEMA_VERSION` stays 7 and connections stay `xcube:v7:<instanceId>` ([p]; [xov] "Install").
- **No new environment variable.** The wait uses the existing `XCUBE_CATCH_UP_MS`, default `10000` ([set] L23-24, L165; `settings.ts` not in [p]).
- **The image check covers neither feature.** `serving.sh` isn't in the diff and never asks `meta?revision` or reads bindings ([p]; grep of `test/image`).

## Init / auth pattern

- **Unchanged from [x4]:** the admin routes take the RS256 service token (`aud: xcube-admin`, `role: service`) or an `XCUBE_ADMIN_TOKENS` entry. `GET …/meta` sits behind that `auth` ([routes] L285, L480).
- **The new test uses the service token,** as wechart will ([t-sec] L158-172, L376-390).
- A call from wechart's API (Node 26, global `fetch`):
  ```ts
  // Shapes: [routes] L480-497; [rt] L1866-1900; [x4] "GET …/meta" for the body.
  const q = new URLSearchParams({ extended: 'true' });
  if (recorded !== undefined && recorded > 0) q.set('revision', String(recorded)); // 0 → 400 (Gotcha 1)
  const res = await fetch(`${cubeApiUrl}/v1/semantic/models/${encodeURIComponent(model)}/meta?${q}`, {
    headers: { authorization: `Bearer ${await serviceToken()}` },
  });
  // 503 { code: 'unavailable' } + Retry-After: 2 → ask again (Gotcha 4).
  const served = Number(res.headers.get('x-xcube-revision')?.split('@').pop()); // "<model>@<rev>"; model ids hold no '@'
  ```

## API surface we will use

All model routes are `{CUBE_API_URL}/v1/semantic/models/{model}/…` ([routes] L287). Errors are `{ error, code, …details }` ([routes] L289-344).

### `GET …/meta[?extended=true|false][&revision=<n>]`

**Checks, in order** ([routes] L480-497):
1. `auth`, then the model id (`400 invalid_model_id`).
2. `extended`, if present, must be `true` or `false`.
3. `revision`, if present, must be a single string matching `/^[1-9]\d{0,9}$/`: 1 to 9,999,999,999, with no sign, decimal point or leading zero. A repeated parameter parses as an array and is refused.
4. `ownMeta` → `adminContext(model, { revision, res })` → `pinFor` ([gw] L415-421; [rt] L1866-1870).

**The context.**
- `adminContext` builds `{ [modelClaim]: model, [revisionClaim]: n }`, the claims a user token carries, and calls the same `pinFor` ([rt] L1867-1869).
- The diff's removed lines show that before this commit it pinned with `{ [modelClaim]: model }` alone and passed no `res` ([d]). That was the cause of the stale answers [req] L10-12 measured.

**The wait** (`servingRevision`, [rt] L1986-2036):
- **Already there.** If this instance's active revision is at least `n`, it answers at once, with no database read (L1994-1995, L2006-2009).
- **Otherwise it waits.** It starts one fresh read of the model's head, including any compile and switch it leads to ([rt] L2156-2171, L2243-2276, L2316-2325). That read races a timer of `XCUBE_CATCH_UP_MS`, 10 s by default (L2018-2025).
- **After the race:**
  - active ≥ `n` → `200`;
  - `n` beyond the database head, with the head active and the read completed → `200` from the head. The code comment says a revision the database doesn't have "can't be waited for: answer from the current one" (L1997-2002);
  - otherwise → `503`.
- **The wait can end early.** It ends as soon as the read completes, even if `n` isn't reached. For example, a head whose activation failed recently isn't retried before its `retryAt` (L2320-2322).
- **Without `revision`:** the active revision, with no wait. The body is as before ([rt] L1994-1995).

**Answers:**

| Case | Status | Body | Headers | Source |
| --- | --- | --- | --- | --- |
| Served | 200 | Plain: `{ cubes, viewGroups?, compilerId }`. `extended=true`: `{ cubes }` | `x-xcube-revision: <model>@<rev>`, `x-xcube-generation` | [rt] L1900-1901; [x4] L352-354 |
| `revision` malformed | 400 | `{ error: 'revision is a revision number', code: 'bad_request' }` | none | [routes] L488-491; [t-sec] L379-380 (`0`, `two`) |
| `extended` malformed | 400 | `{ error: 'extended is true or false', code: 'bad_request' }` | none | [routes] L485-487 |
| `n` not active in time | 503 | `{ error: 'Model "<m>" revision <n> is not active on this instance yet', code: 'unavailable' }` | `Retry-After: 2` | [rt] L2031-2033, L1894-1897; [routes] L328-330 |
| No revision active here | 503 | `… has no revision that compiles on this instance yet` or `… is not loaded on this instance yet`, `code: 'unavailable'` | `Retry-After: 2` | [rt] L952-961, L2035 |
| Model over `XCUBE_MAX_MODELS` | 503 | `Model "<m>" can't be followed on this instance`, `code: 'unavailable'` | `Retry-After: 2` | [rt] L2014-2016 |
| Unknown model | 403 | `{ error: 'Unknown model "<m>"', code: 'error' }` | none | [rt] L2010-2012, L957-958; [routes] L328-330 |

- **Tested** ([t-sec] L376-390, service token, one process):
  - `?revision=<current>` → `200` with `x-xcube-revision: dev@<rev>`;
  - `0` and `two` → `400`;
  - a `POST …/changesets` answering `201`, then `GET …/meta?revision=<new>` at once → `200`, `dev@<new>`, and the body lists the new cube `late`.
- **Not tested:** the `503`, the beyond-head case, the header without `revision`, and more than one instance.

### Item references (`ItemRef`) in answers

```ts
// [rt] L221-229, L2858-2866
type ItemRef = {
  folderId: string; name: string; fullName: string;
  bindings: Record<string, string>;   // ~~{ shortName: fullName }~~ Corrected: { name: name }, fullName == name (R71 3.3; xcube-256d632371.md): the same field GET …/items gives
  dataSource?: string | null;         // cubes only; views have no key
};
```

| Route | Answer | `items` holds | Bound | Source |
| --- | --- | --- | --- | --- |
| `POST …/changesets` → `201`/`200` | `{ model, generation, revision, created, contentHash, itemsHash, items }` | The upserted items only; deletes aren't listed | ~~Nearest-first along each item's path~~ *Corrected:* each name means the one item of that name, matched exactly (R71 3.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [rt] L2999, L3025, L3060; [routes] L218-245 |
| `POST …/changesets?dryRun=true` → `200` | `{ model, valid, errors, cubeMessage, probes, itemsHash, currentRevision, items }` | The upserted items; `[]` when names or bindings fail (Gotcha 12) | As the changeset would land them, over the database head `currentRevision` and the published data sources | [rt] L236-246, L2930-2952, L3003-3014, L3043-3045 |
| `PUT …/snapshot` with items | As changesets | Every item (`replaceAll`) | Afresh, ~~nearest-first~~ *Corrected:* by name, one item per name (R71 3.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [rt] L2956-2973 |
| `PUT …/overlays/{id}` → `201`/`200` | `{ model, id, version, created, revision, expiresAt, items }` | The upserted items | Overlay-first ([x5] Gotcha 5) | [rt] L1540-1545; [routes] L640-648 |
| `GET …/items` | Unchanged: `{ folderId, name, kind, fullName, bindings }` *Corrected:* at 256d632371 also `dataSource?` and `extends?`, with `fullName` == `name` (README "GET …/items") ([`xcube-256d632371.md`](./xcube-256d632371.md)) | Every item at the head | As stored | [rt] L3161-3173 |

**`bindings`:**
- It holds only references to other cubes and views, resolved by `rewriteReferences` ([rw] L138-173).
- A name that resolves to nothing is left out, and Cube's compile reports it. Where only a cube can stand (a join, `extends`, a join path), it is an item error instead ([rw] L131-137, L197, L296, L346).
- **Data sources are not in `bindings`.** Cubes carry them separately as `dataSource`.
- **Root vs folder targets.** ~~A full name is the short name in `froot`, and `<folderId>__<name>` elsewhere ([items] L65-67).~~ *Corrected:* every binding is `{ name: name }` in every folder; there is no prefix (R71 1.1, 3.3) ([`xcube-256d632371.md`](./xcube-256d632371.md)). So a binding to a root item is `{ customers: 'customers' }` ([t-items] L196-202, L229-232), and one to a folder item is `{ widgets: 'fc__widgets' }` ([t-ov] L231-232). An item that names nothing has `bindings: {}` ([t-items] L220-222).

**`dataSource`** is `boundDataSource(item)`, read from xcube's own YAML dump ([ovc] L4-15):
- **The cube names one:** ~~its bound full name, nearest-first along the cube's folder chain. That is `x` in the root, `<folderId>__x` in a folder~~ *Corrected:* that name, bare, the model's one data source of it (R71 1.1, 4.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)) ([pub] L223-249).
- **It names none and doesn't extend:**
  - `'default'` ~~when the nearest `default` is the root's~~, since that one is written as nothing ([pub] L250-256; [ovc] L14);
  - ~~`'<folderId>__default'` when a nearer folder holds a `default`.~~ *Corrected:* only the root holds `default` (R71 4.2) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **It extends and names none:** `null` ([ovc] L14).
- **Binding happens only when the model has published connections, or the overlay brings some** ([pub] L353-358; [rt] L1785-1790, L1446-1457). Otherwise `dataSource` is the short name as written, or `'default'`.
- Tested: `{ folderId: 'fops', name: 'returns', fullName: ~~'fops__returns'~~ 'returns', bindings: {}, dataSource: 'default' }` ([t-items] L220-222). *Corrected:* `fullName` is the name (`test/integration/items.test.ts` L233) ([`xcube-256d632371.md`](./xcube-256d632371.md)).

### `GET …/overlays/{id}`

```ts
// [rt] L1549-1599; [readme] L674-681
{ model, id, version, expiresAt, validatedRevision,
  upserts: ({ folderId, name, kind } & ({} | { fullName, bindings, dataSource? /* cubes */ }))[],
  boundRevision: number | null,
  deletes, connections, instance: { revision, state: 'serving' | 'idle' | 'broken', errors?, cubeMessage? } }
```
- **How it is computed.** Each `GET` reads the database head ([rt] L1556). If the head is in items mode, it runs `publishOverlay` over:
  - the stored folder tree;
  - the head's items;
  - the stored overlay, its `connections` included;
  - the model's published data sources.
  - This is the same function the preview's own build uses ([rt] L1409, L1558-1564).
- **The answer.** Each upsert gets its `ItemRef` fields, and `boundRevision` = `head.revision` ([rt] L1581-1586).
- **`boundRevision: null`, with no upsert fields,** when there is no head, the head is in files mode, or `publish` reports an error. Such errors are:
  - a folder not in the tree;
  - two overlay items with one ~~short~~ name *Corrected:* in any case, kind `name_in_use` (R71 2.6) ([`xcube-256d632371.md`](./xcube-256d632371.md));
  - a reference to a removed item;
  - an alias clash;
  - ~~a `data_source` found on no folder on the path.~~ *Corrected:* a `data_source` the model doesn't hold (`reference`), or one off the cube's path (`data_source_range`), and a reference off the item's path (`reference_range`) (R71 4.3, R72) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - Sources: [pub] L265-295, L317-319, L337-345, L370-372; [rt] L1558-1565.
- **It doesn't compile.** An overlay that still resolves but no longer compiles keeps its bindings and a non-null `boundRevision` (Gotcha 16).
- **Tested** ([t-ov] L222-233):
  - `boundRevision` equals the published revision;
  - ~~`fb/report`'s `bindings` contain `widgets: 'fc__widgets'`, the workspace's copy from `fc`, which isn't on `fb`'s path~~ *Corrected:* bindings are `{ widgets: 'widgets' }`, and an overlay's own item referring off its path is refused at the push (`reference_range`, R72) ([`xcube-256d632371.md`](./xcube-256d632371.md));
  - the push answer's `items` for `report` have the same `bindings`.

### Comparing a preview with a landing (T456)

- **The overlay's bindings** are over `boundRevision`, the database head at the `GET` ([rt] L1556, L1586).
- **The dry run's** are over `currentRevision`, the database head at the dry run ([rt] L2941, L3010; [x3a] L189).
- **Key items by `folderId/name`.** Compare:
  - `bindings` as maps: the same keys and the same values, since a missing key is a difference;
  - `dataSource`, and whether the key is present at all.
- Only upserted items appear in either answer. Kept items keep their stored bindings in both ([pub] L321, L376-377).

## What wechart must change

**wechart's uses:**
- **T420** ([w-tasks] L6543): "Jobs' and Schedules' field list (`GET …/meta?extended=true` in place of `/v1/meta?extended`)".
  - Its Done note ([w-tasks] L6563-6566): "Not moved: the whole field list for Jobs, Schedules and a publish's name check. It stays on `/v1/meta?extended=true` with wechart's own token naming the recorded revision… The move waits for its image, and T436 needs it."
- **T436** ([w-tasks] L7064-7065): "under the gate, wechart's own token sees only the folders its groups reach, so Jobs', Schedules' and a publish's whole field list must move to xcube's `GET …/meta` first… Depends on: … xcube's least revision on `GET …/meta` (its published image)".
- **AC-334** ([w-spec] L1170-1171). Its Fails-when: "after a publish is acknowledged, a query or the field list … answers from the previous revision … or a Cube instance's 503 while it catches up reaches the user as an error."
- **T456** ([w-tasks] L7105-7110): "Refuse an approval when any item would bind otherwise than in the proposal's preview". Its failing test: "a proposal holding a copy of `widgets` from an off-path folder, which previews bound to that copy, is refused at approval, naming the item and both bindings".
- **AC-321** ([w-spec] L1060-1061): approval is refused, "naming the items, when any item would bind to a cube or data source other than the one it bound to in the proposal's preview".

| Item | Today | At `40efaef823` |
| --- | --- | --- |
| **Image pin** (the user pins; [xov] "What wechart must change") | `…-ed08180c37@sha256:bc041aa2…` in `docker-compose.yml` L156 and L190, `values.yaml` L68, `docker-desktop.yaml` L24, and `cube-image.test.ts` L28 | `…-40efaef823@sha256:9bdad274…`. Nothing else in [xov], [x5] or [x6] changes |
| **Field list (T420/T436, AC-334).** Callers: Jobs `jobs/build.ts` L137, Schedules `jobs/schedules.ts` L172, the publish name check `model/publish.ts` L396 | `CubeClient.metaExtended()` → `/v1/meta?extended=true` with wechart's HS256 token naming the recorded revision ([w-client] L222-232) | `GET …/meta?extended=true&revision=<recorded>` with the service token. Omit `revision` when none is recorded (Gotcha 1). Retry the `503` as `#send` does (Gotcha 4). Check that `x-xcube-revision` ≥ `revision` (Gotcha 2). Leave `server.ts` L642 (the acceleration panel) on the user's token ([x4] L480) |
| **Transport** | `xcubeAdmin.call` exposes no headers and doesn't retry 503s ([w-xc] L195-207). `CubeClient.#send` retries `CATCHING_UP` 503s 3 times ([w-client] L48-58, L362-380) | Whichever client carries the field list must read `x-xcube-revision` and retry the catching-up 503. `xcubeAdmin`'s 120 s timeout covers xcube's 10 s wait ([w-xc] L165, L202) |
| **T436's dependency** | Waiting on this image ([w-tasks] L7065) | Met. The route is still unfiltered, so T371 (AC-297) is still needed before the gate ([x4] L533) |
| **`xcubeAdmin` for T456** ([w-xc] L274-307) | `checkChangeset` drops `items`; there is no overlay `GET` | Return the dry run's `items: ItemRef[]` with `currentRevision`. Add `overlay(id)` returning each upsert's `fullName`, `bindings`, `dataSource?` and `boundRevision`. Apply with `baseRevision` = the revision compared, so a publish in between answers `409 conflict` ([x3a] L178) |
| **T456's approval** | Not built | (1) `GET …/overlays/{proposal}`: on `boundRevision: null`, refuse, naming the errors. (2) The dry run with the proposal's upserts and deletes. (3) If `currentRevision` ≠ `boundRevision`, compare again or refuse ([ans] L29). (4) Compare per item: a dry run with `items: []` and `valid: false` has reference errors; name those. Otherwise name each item whose `bindings` or `dataSource` differ, with both values. (5) Apply the changeset at that base. See Gotchas 11-15 and Open question 1 |
| **T456's e2e test** ([w-tasks] L7109) | "naming the item and both bindings" | The xcube scenario (`fb/report` joins `widgets`, whose only copy is in `fc`) doesn't land a second binding. Landed, the join fails: `The join to "widgets" names no cube in a folder on this item's path`, and the dry run's `items` is `[]` ([t-ov] L67-76; [rw] L296; [rt] L3013-3014). For two full names, put a `widgets` on the item's path, such as the root |
| **Stub xcube** (`xcube/fake.ts`) | `bindingsOf` adds the item's own name (L150). No `meta?revision`, no `boundRevision`, no `ItemRef` fields | Match xcube: record only names the YAML uses ([rw] L147-153; [t-items] L220-222 `bindings: {}`). Add the meta route's 400/503 and headers, `ItemRef` in answers, and `boundRevision` |
| **Stale text** | `client.ts` L222-229 ("that route answers from whatever revision the instance has active"); T420's note (L6563-6566); T456's "xcube first" (L7107) | Superseded by this image. Edits to tasks and spec go through their gates |

## Gotchas

1. **`revision=0` is refused `400`.** wechart omits `wechartRevision` when the recorded revision is undefined or ≤ 0 ([w-client] L387-391). Omit the parameter in those cases too ([routes] L489).
2. **A revision beyond the database head answers `200` from the head.** `x-xcube-revision` then names a lower number than asked ([rt] L1997-2002). Compare the header with what you asked for.
3. **No `x-xcube-revision` on errors.** It is set only once `servingRevision` succeeds. `400`s are thrown before it runs, and `403`/`503`s come from it ([rt] L1891-1900; [routes] L485-491).
4. **The 503 messages match wechart's retry.** The three catching-up messages match `CATCHING_UP` ([w-client] L48-49), which reads `error` from the body ([w-client] L475-481).
   - These don't match: `can't be followed on this instance` ([rt] L2016), and `xcube's database is not reachable` ([routes] L331-333).
5. **The wait is per request, on the answering instance.** It is one fresh read plus any compile, raced against 10 s. It can end sooner without reaching `n` ([rt] L2014-2034, L2320-2322). Three asks by `#send` fit in about 34 s ([w-client] L50-58).
6. **The route is unfiltered,** by design ([x4] L533). Jobs and Schedules must filter per folder themselves (T371).
7. **`bindings` never holds data sources, and ~~`GET …/items` never gives `dataSource`~~** *Corrected:* at 256d632371 `GET …/items` gives a cube's `dataSource` and `extends` (R71 3.3) ([`xcube-256d632371.md`](./xcube-256d632371.md)) ([rw] L138-153; [rt] L3171). A published item's bound data source appears only in the answer that published it.
8. **What `dataSource` means depends on the model** (API surface). With no published connections, and none brought, it is the unbound name as written.
9. **Views have no `dataSource` key** ([rt] L2864, L1583). Compare presence as well as value.
10. **A copy under the same full name gives the same `dataSource` string.** A workspace copy that replaces a published data source ([xov] Gotcha 2) can't be told apart by this field.
11. **The dry run can't carry the proposal's data sources.** `changesetCheckSchema` has no `connections` ([routes] L125-147), and the dry run binds against published connections only ([rt] L2951).
    - A cube naming a data source the proposal brings will either fail (`It uses the data source "<n>", which no folder on this item's path holds`, [pub] L245-248), making `items` `[]`, ~~or bind to a farther published namesake~~ *Corrected:* the message is now `…, which the model doesn't hold`, and no namesake can exist (R71 2.1, 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
    - It compares correctly only after that data source is landed (T442). See Open question 1.
12. **A dry run whose names or bindings fail has `items: []`.** `publish` returns `changed: []` on those errors ([pub] L293-295, L317-319, L370-372; [rt] L2985-2987, L3011-3014). Compile errors still list the items ([t-items] L217-222).
13. **Dry-run deletes are strict; overlay deletes are lenient.** Deleting an absent item is an error in the dry run ("There is no such item to delete"), which empties `items` ([rt] L2985; [pub] L300-304; [rt] L1455).
14. **Equal revisions don't prove equal bindings.** `PUT …/folders` and `PUT …/connections/{name}` don't move `current_rev` ([rev] L364-396, L642-662), ~~and both change how names bind~~ *Corrected:* neither changes a binding now; both are checked under the model's lock, and a publish is stored only while the data sources and tree are as it was checked against, else `409 conflict` (R71 2.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)). wechart is their only writer, so it can serialise an approval against its own folder and data-source writes.
15. **`boundRevision` is the head at the `GET`, not what an approver saw.**
    - Previews are answered from an instance's active revision, at least `wechartRevision` ([x5] "Querying a preview").
    - Bindings are recomputed at every `GET`, independent of `validatedRevision` ([rt] L1556-1565).
16. **`boundRevision: null` means only that names don't resolve.** `GET` doesn't compile, so an overlay that no longer compiles keeps its bindings ([rt] L1558-1565). Rely on the dry run's `valid`, the `409` message or a re-push's `422` ([x5] Gotcha 7).
17. **Each `GET …/overlays/{id}` now parses every item at the head** ([pub] L308-316) and reads folders and connections ([rt] L1556-1561). The cost grows with the model's size. By reading; not measured.
18. **The stub's bindings differ from xcube's** (What wechart must change). Tests against the stub that assert a self-binding would pass against a shape xcube never sends.

## Corrections

| Doc and statement | Now | Source |
| --- | --- | --- |
| [x4] L348: `GET …/meta`'s admin context is `{ wechartModel }`, "pinned to the active revision" | With `?revision=<n>` the context also carries the revision claim, and waits as a user token does. Every `200` carries `x-xcube-revision` and `x-xcube-generation` | [rt] L1860-1871, L1900-1901; [routes] L488-495 |
| [x4] L352-356: shapes and errors of `GET …/meta` | Adds `400 bad_request` ("revision is a revision number") and `503 unavailable` with `Retry-After: 2` when `n` isn't reached | [routes] L488-491; [rt] L1894-1897, L2031-2033 |
| [x4] L479: own-behalf use of `GET …/meta?extended=true` with the service token | Add `&revision=<recorded>` for AC-334 | [t-sec] L376-390 |
| [x3a] L181: changeset `items` is `ItemRef[]` of `{ folderId, name, fullName }` | Each also has `bindings` and, for a cube, `dataSource` | [rt] L221-229, L2858-2866 |
| [x3a] L190: dry run `items` are "the upserted items with their would-be full names" | Plus bindings and `dataSource` as the changeset would land them. `[]` when names or bindings fail | [rt] L3003-3014; [t-items] L217-232 |
| [x5] L280, input row 24: `PUT …/overlays/{id}` `items` are `[{ folderId, name, fullName }]` | Plus `bindings` (overlay-first) and `dataSource` | [rt] L1544; [t-ov] L233 |
| [x5] L291-299 and input row 26: the `GET` answer | Adds `boundRevision: number \| null`. Each upsert adds `fullName`, `bindings` and `dataSource?` when the overlay resolves | [rt] L1575-1598 |
| [x5] Gotcha 14 (L486): "`upserts` are `{ folderId, name, kind }` only" | Plus the binding fields; still no YAML | [rt] L1581-1584 |
| [x5] Open question 7 (L542): how approval handles Gotcha 5 | The data now exists: overlay `GET` vs dry-run `items` (Gotchas 11-16) | This doc |
| [xov] L232: the push "answer: unchanged … `items` lists upserted items only" | Still upserted items only, now with `bindings` and `dataSource` | [rt] L1544, L2858-2866 |
| [xov] L236-240: the `GET …/overlays/{id}` shape | Adds `boundRevision` and the upserts' binding fields | [rt] L1575-1598; [readme] L674-681 |

Still true at `40efaef823`:
- [x6] L423: partitions still use `adminContext(model)`, with no revision and no headers ([gw] L370).
- [x3a] L196: `GET …/items` is unchanged ([rt] L3161-3173).
- [xov]'s overlay data-source findings: no file they cite except `runtime.ts` is in [p], and `runtime.ts`'s change there is a refactor into `publishOverlay` ([d] hunks +1406, +1434).

## Open questions / unverified

1. **For the user or spec (T456, AC-321, T442).** When a proposal brings data sources, the dry run can't bind to them until they are landed (Gotcha 11). There are two ways:
   - land them first, and then a refused approval leaves them landed, although AC-321 says a refused change leaves things "as they were";
   - or judge those cubes' `dataSource` another way.
   Which, and does approval serialise with folder and data-source writes (Gotcha 14)?
2. **For the spec.** AC-321 says "the one it bound to in the proposal's preview". `boundRevision` is the preview's binding now, not the one an approver saw earlier (Gotcha 15). Is "now" meant?
3. **UNVERIFIED by running:**
   - the `503` path and its body;
   - the beyond-head `200`;
   - `x-xcube-revision` without `revision`;
   - behaviour across several Cube instances;
   - the per-`GET` cost of `overlayStatus` on a large model;
   - a `boundRevision: null` answer (no test covers it).
4. **UNVERIFIED:** what the "unknown/unknown" manifest in the image index is ([ghcr-v] doesn't say).
5. **Not viewed:** per-test CI output, and the "Name what was published" step's log.
6. **Not verified here:** wechart's own measurement in [req] L12 (500 ms stale). Its cause, `adminContext` pinning without a revision, is confirmed by the diff's removed lines ([d]).

## Input claims checked

[ans] is `to-wechart/2026-09-26-2130-meta-revision-and-bindings.md`, cited by line.

| # | Claim ([ans] line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Refs: `feat/xcube` `40efaef823`; README "GET …/meta", "POST …/changesets", "GET …/overlays/{id}"; `adminContext`, `refOf`, `overlayStatus`; the three test titles (L4) | Verified | [ref]; [reflog] L17; [readme] L672-681, L764-777, L779-804; [rt] L1549, L1866, L2858; [t-sec] L376; [t-ov] L222; [t-items] L210 |
| 2 | Image `…-40efaef823@sha256:9bdad274…` (L8) | Verified | [ghcr]; [ghcr-v]; [wf] L143; [jobs] `head_sha` |
| 3 | For amd64 and arm64 (L8) | Verified | [ghcr-v] (plus an "unknown/unknown" entry) |
| 4 | Both changes additive; nothing wechart uses changes (L8) | Verified by reading | Only new keys, headers and a new optional parameter. No migration, no env var ([p]). The only new refusal is a malformed `revision`, which wechart doesn't send ([w-client] L230-231) |
| 5 | `?revision=<n>` answers from `n` or newer (L12) | Verified | [rt] L1994-1995, L2027-2030; [t-sec] L382-389. Except `n` beyond the head: `200` from the head (Gotcha 2) |
| 6 | Waits as a user token naming `wechartRevision` does, through the same `pinFor` (L12) | Verified | [rt] L1866-1870, L1893 |
| 7 | Up to `XCUBE_CATCH_UP_MS`, default 10 s (L12) | Verified, with a precision | [set] L165; [rt] L2018-2025. One fresh read raced against the timer; it can end sooner (Gotcha 5) |
| 8 | Otherwise `503`, `Retry-After: 2`, code `unavailable` (L12) | Verified by reading; untested | [rt] L1894-1897, L2031-2033; [routes] L328-330 |
| 9 | Every answer names its revision in `x-xcube-revision: <model>@<revision>`, with or without the parameter (L13) | Partly | Every `200` ([rt] L1900; [routes] L492-495 always pass `res`). Not on 400/403/503 (Gotcha 3). Without the parameter, by reading only |
| 10 | `revision` is a whole number from 1; anything else is `400 bad_request` (L14) | Verified | [routes] L488-491: at most 10 digits, no leading zero, one value; [t-sec] L379-380 |
| 11 | Without it, the answer is as before (L14) | Verified for the body | Plus `x-xcube-revision` and `x-xcube-generation` headers ([rt] L1900-1901) |
| 12 | Tested: a changeset followed at once by `meta?revision=<new>` holds the new cube (L15) | Verified | [t-sec] L376-390; CI passed ([jobs]). One process only; the 503 path is untested |
| 13 | Every item reference carries `bindings` `{ shortName: fullName }`, exactly as `GET …/items` gives them (L19) | Verified; *Corrected:* now `{ name: name }` (R71 3.3) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | Both come from `PublishedItem.bindings` ([rt] L2862, L3171; [items] L44-49) |
| 14 | A cube's `dataSource`: as bound; `default` when it names none; `null` when it inherits through `extends` (L19) | Partly | [ovc] L9-15. A folder's nearer `default` gives `<folderId>__default` ([pub] L250-256). With no connections anywhere it is the unbound name as written ([pub] L353) |
| 15 | Applies to `items` of changesets (applied and dry run), snapshot with items, and overlay push (L20) | Verified | [rt] L1544, L2999, L3011, L3025, L3060; [routes] L218-245, L640-648. A failed dry run's `items` is `[]` (Gotcha 12) |
| 16 | The dry run's `items` are its bindings as the changeset would land them (L21) | Verified | Same `publishItems`/`publish` path, without `overlay` ([rt] L2950-2952, L2985); [t-items] L229-232. Over the published data sources only (Gotcha 11) |
| 17 | `GET …/overlays/{id}` gives each upsert `fullName`, `bindings`, a cube's `dataSource`, as previews bind it, over `boundRevision` (L22) | Verified, with a precision | [rt] L1555-1586; [t-ov] L230-233. Recomputed at each `GET` over the database head (Gotcha 15) |
| 18 | When the overlay no longer applies, `boundRevision` is `null`, the upserts have none, and `instance` says why (L23) | Partly | Null only for resolution errors, a files-mode head or no head. A compile-only break keeps bindings (Gotcha 16). `instance` is per instance and only after trying ([x5] Gotcha 7) |
| 19 | Tested: `fb/report`'s `widgets` binds to `fc__widgets` in the overlay; landed, it would not be (L24) | Partly | The overlay side is tested ([t-ov] L228-233). The landed side is by reading: a join error with `items: []`, not another binding ([rw] L296; [t-ov] L67-76) |
| 20 | `dataSource` can bind differently in a preview than landed: the overlay brings one the landing publishes, or a published one changed meanwhile (L25) | Verified by reading, with limits | Previews bind the overlay's connections ([rt] L1446-1457); the dry run can't (Gotcha 11). A same-full-name copy is indistinguishable (Gotcha 10) |
| 21 | Compare at the same revision: `boundRevision` vs the dry run's `currentRevision`; if they differ, compare again or refuse (L29) | Partly | Both are the database head ([rt] L1556, L3010). Folder and connection writes don't move it (Gotcha 14) |

[head]: /Users/srajagopal/Work/bi/cube/.git/HEAD
[ref]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (40efaef823e737ce4530a7e6d85e4989e82745d0)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[c]: https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0
[a]: https://api.github.com/repos/senthilkrajagopal/cube/commits/40efaef823e737ce4530a7e6d85e4989e82745d0
[p]: https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0.patch ("9 files changed, 136 insertions(+), 34 deletions(-)")
[d]: https://github.com/senthilkrajagopal/cube/commit/40efaef823e737ce4530a7e6d85e4989e82745d0.diff
[checks]: https://api.github.com/repos/senthilkrajagopal/cube/commits/40efaef823e737ce4530a7e6d85e4989e82745d0/check-runs
[jobs]: https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36291880157/jobs
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
[ghcr-v]: https://github.com/users/senthilkrajagopal/packages/container/xcube/1300141991?tag=v1.7.45-40efaef823
[ghcr-pkg]: https://github.com/users/senthilkrajagopal/packages/container/package/xcube
[raw-rt]: https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/runtime/runtime.ts
[raw-routes]: https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/admin/routes.ts
[raw-pub]: https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/names/publish.ts
[raw-rw]: https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/names/rewrite.ts
[raw-ovc]: https://raw.githubusercontent.com/senthilkrajagopal/cube/40efaef823e737ce4530a7e6d85e4989e82745d0/xcube/src/overlays/connections.ts
[readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md (= 40efaef823)
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts (= 40efaef823)
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (= 40efaef823)
[gw]: /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts (= 40efaef823)
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts (not in the diff)
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts (not in the diff; raw-checked)
[rw]: /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts (not in the diff; raw-checked)
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts (not in the diff)
[ovc]: /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts (not in the diff; raw-checked)
[rev]: /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts (not in the diff)
[t-sec]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/security.test.ts (= 40efaef823)
[t-ov]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/overlays.test.ts (= 40efaef823)
[t-items]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/items.test.ts (= 40efaef823)
[wf]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[req]: /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-26-2030-meta-revision-and-bindings.md
[ans]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-2130-meta-revision-and-bindings.md
[x3a]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
[x4]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-4.md
[x5]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-5.md
[x6]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-6.md
[xov]: /Users/srajagopal/Work/wechart/docs/research/xcube-overlay-data-sources.md
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md (AC-321 L1060-1061; AC-334 L1170-1171)
[w-tasks]: /Users/srajagopal/Work/wechart/docs/tasks.md (T420 L6538-6581; T436 L7052-7065; T456 L7105-7110)
[w-client]: /Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts
[w-xc]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.ts
[w-fake]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts
