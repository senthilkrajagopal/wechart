---
library: xcube slice 3a (the user's Cube fork)
packages: [xcube]
version: 'xcube at 36aedeb6c4 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29
  - https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/README.md
  - https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/runtime/runtime.ts
  - https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/store/revisions.ts
  - https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/store/migrations.ts
  - https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/test/integration/items.test.ts
  - https://github.com/senthilkrajagopal/cube/actions/runs/36250938899
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/expr.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/snapshot.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/index.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/transpilers/CubePropContextTranspiler.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeToMetaTransformer.js (1.7.45)
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-2.md
  - /Users/srajagopal/Work/wechart/docs/research/cube/prefixed-names.md
  - https://github.com/nodejs/node/blob/main/doc/api/crypto.md#hashupdatedata-inputencoding
---
# xcube slice 3a (xcube at 36aedeb6c4 on Cube v1.7.45)

**Provenance. Read this first: the fork's working tree is *not* at 36aedeb6c4.**

- **The ref.** `.git/HEAD` is `ref: refs/heads/feat/xcube`, and that ref is `36aedeb6c498af3ebc2e5d37eef64ee3838a2f29` ([head]). `refs/remotes/fork/feat/xcube` holds the same SHA ([fork-ref]). The reflog's last entry is `commit: feat(xcube): folders, items and names (slice 3a)`, whose parent is `83cb9f0888…` ([reflog] L4).
- **What the commit contains.** 15 files, +2731 −33 ([gh-patch]):
  - `README.md`, `src/admin/routes.ts`, `src/index.ts`;
  - the new `src/names/{expr,items,publish,rewrite}.ts`;
  - `src/runtime/runtime.ts`, `src/store/{migrations,revisions}.ts`;
  - `test/image/serving.sh`, the new `test/integration/items.test.ts`, `test/integration/store.test.ts`, the new `test/unit/names.test.ts`, `test/unit/runtime.test.ts`.
- **The working tree carries uncommitted slice-3b work.**
  - `xcube/src/modules/graph.ts` and `xcube/test/unit/routing.test.ts` are not in `.git/index` (grep).
  - The commit's `xcube/src` has no `modules` directory ([gh-src]).
  - The working-tree README has a "Modules" section and `XCUBE_MODULE_PACK_MIN`/`_MAX`. The committed README has neither ([readme@c], fetched and checked).
  - `runtime.ts`, `revisions.ts`, `migrations.ts`, `settings.ts` and `gateway.ts` mention modules in the working tree (grep).
- **How I cite.** Bash wasn't available, so I read committed text through raw.githubusercontent.com at the full SHA.
  - **Line numbers.** Files that the working tree still holds as committed are cited with working-tree line numbers: `names/*.ts`, `admin/routes.ts`, `test/unit/names.test.ts`, `model/snapshot.ts` and `store/migrate.ts`. How I checked each one:
    - `names/*.ts`: the working-tree line counts (164/236/322/333) equal the commit's additions for these new files.
    - `items.ts`, `publish.ts`, `rewrite.ts`, `routes.ts` and `names.test.ts`: passages fetched from the commit match the working tree.
    - `snapshot.ts` and `migrate.ts`: neither is in the 3a diff, and both match the slice-2 doc's line citations.
    - These files were compared, not byte-compared.
  - **`items.test.ts`** is cited with **committed** line numbers. The commit lacks the working tree's L103 (`modules: { packMin: 50, packMax: 300 },`); the settings object and all 7 test titles were compared. So the committed line is the working-tree line minus 1, from L104 on.
  - **By symbol, not line.** `runtime.ts`, `revisions.ts`, `migrations.ts` and `README.md` differ in the working tree, so they are cited at the commit by method or section name. The fetch tool's own line numbers proved unreliable: it placed one constant after code that follows it.
- **Cube.** Cube's behaviour is cited from `xcube/node_modules/@cubejs-backend/*` at 1.7.45, as in [x2].
- **Sibling docs.** `docs/research/cube/prefixed-names.md` has a supersession note that conflicts with this slice (Open question 1). No sibling doc corrects an xcube 3a claim.

## Summary

Slice 3a adds a second way to publish a model: **items mode**.
- The client (wechart) sends its **folder tree** and its **items**. Each item is one cube or one view, in one folder, as YAML.
- xcube resolves every short name an item uses, ~~nearest-first from the item's folder, rewrites it to the full name,~~ and records the binding. *Corrected:* a name means the one item of that name model-wide, matched exactly, and is not rewritten; bindings are `{ name: name }` (R71 3.1, 3.3; `rewrite.ts` L16-33) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- It compiles the whole model as one file set and stores it as a revision, as in slice 2 ([readme@c] "Serving models", "Folders and names", "Admin API"; [pub] L196-305, L307-310).
- Cube itself, the query path, tokens, headers and `cube.js` are unchanged. `config.ts`, `gateway.ts`, `auth.ts`, `settings.ts` and `bootstrap.sql` are not in the 3a diff ([gh-patch]).

What it means for wechart, with the input's IDs:

1. **Names (AC-328, AC-329).**
   - Root items keep bare names (`orders`), ~~and folder items become `<folderId>__<shortName>`~~ ([items] L62-64). *Corrected:* every item, in any folder, is served under its bare name; `fullName` equals `name` (R71 1.1; `items.ts` L270) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - ~~Folder items get `title` from the short name and a short `sql_alias`.~~ *Corrected:* xcube writes no `title`, and a `sql_alias` only where Cube's own would go wrong, in any folder (R71 1.2; `publish.ts` L165-188) ([`xcube-256d632371.md`](./xcube-256d632371.md)). Every item gets `meta.xcube = { folderId, shortName }`, root items included ([pub] L87-115; [t-names] L98; [t-items@c] L170).
2. **Switch once.** Send one items snapshot (`PUT …/snapshot` with `items`). After that, a files snapshot is `409 mode`, and the model never returns to files mode ([rt@c] `importSnapshot`; [rev@c] `write`).
3. **Publish (T426).** Publish with `POST …/changesets` (optionally `?dryRun=true`), on a base revision. Retries that are already in answer `200` whatever their base ([rt@c] `publishItems`).
4. **Reconcile.** Compare wechart's items hash with `GET …/revision`'s `current.itemsHash`. It is SHA-256 over `JSON.stringify` of the items sorted by `` `${folderId}/${name}` `` ([pub] L312-322; [rev@c] `status`).
5. **No rebinding (AC-275).** ~~An item keeps its bindings until it is itself published again~~ ([pub] L222-231, L290-294; [t-names] L168-178; [t-items@c] L272-287). *Corrected:* there is nothing to rebind: a name has one item model-wide, and a folder move changes no binding (R71 3.2, 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
6. **Binding charts (AC-272, AC-141).**
   - `POST …/resolve` answers ~~nearest-first~~ from the current items. *Corrected:* it answers each name with the item holding it in any case, by its stored name, or `null`; the folder is only checked to be in the tree (R71 3.3; `runtime.ts` `resolveNames`) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - `GET …/items` gives each item's recorded `bindings`.
   - xcube itself refuses to delete or rename an item another item is bound to ([rt@c] `resolveNames`, `itemsOf`; [pub] L249-267).
7. **YAML only (AC-332).** Items are YAML only, and Jinja is refused whatever `XCUBE_FILE_TYPES` says ([items] L182-190).

## Install

- **No npm dependency in wechart.** As in slice 2, the only import is `require('xcube')` inside the Cube image ([x2] "Install").
- **Image.**
  - With the slice-2 build command run from a tree at this commit, the tag is `xcube:v1.7.45-36aedeb6c4` ([readme@c] "Running it"; [head]).
  - **The current working tree is not that tree** (Provenance), and the tag comes from `git rev-parse HEAD`. A build from it would carry uncommitted 3b code under the 3a tag ([x2] Gotcha 19).
  - CI builds and boots the image but doesn't publish it ([ci] L1-5, L84-128).
- **Schema migration 2 (`items`)** runs on first start under the slice-2 advisory lock ([mig@c]; [migrate] L109-125). It adds:
  - `models.mode text NOT NULL DEFAULT 'files' CHECK (mode IN ('files','items'))`;
  - `revisions.items_hash char(64)` (lower-case hex);
  - table `folders (model, id CHECK '^f[a-z0-9]{1,40}$', parent_id)`;
  - table `revision_items (model, rev, folder_id, name, kind, full_name, authored_hash, bindings jsonb)`, unique on `(model, rev, full_name)`.
- **No way back to the slice-2 image.** Migration 2 has `minReader: 2`, commented "Readers before 2 would prune authored item contents they don't know about, so they may not run on this schema" ([mig@c]).
  - A slice-2 process then exits at start with `xcube: schema <schema> needs xcube schema version 2 or later to read it; this is 1` ([migrate] L95-100).
  - Once any 3a process has started against a database, the slice-2 image can't run on it.
- **No new environment variables.** The committed README's table lists the same variables as slice 2 ([readme@c]; [x2] "Environment"). `bootstrap.sql` is unchanged ([gh-patch]).

## Init / auth pattern

- **Unchanged from slice 2** ([x2] "Init / auth pattern"): `cube.js` calls `require('xcube').config({ modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' }, {...})`. `config.ts` is not in the 3a diff ([gh-patch]).
- **Admin routes.** Every new route uses the same `Authorization: Bearer <XCUBE_ADMIN_TOKENS entry>` middleware and the same `{basePath}/v1/semantic/models/:model` base ([routes] L204-206, L247, L256, L330, L338, L368, L377).
- **Query tokens.** Unchanged. Folder items are queried by ~~full name, for example `fsales__orders.total`~~ ([t-items@c] L179-183; [t-img] L95-104). *Corrected:* by their bare name, `orders.total`, in every folder (R71 1.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)).

## API surface we will use

### Common

- **Body parsing.** Bodies go through a route-level `bodyParser.json({ limit: CUBEJS_MAX_REQUEST_SIZE })` ([routes] L205).
- **Joi.** Validation uses `abortEarly: true`. A failure is `400 { error: "Invalid request: …", code: "bad_request" }` ([routes] L132-138).
- **Errors.** Errors are `{ error, code, ...details }` ([routes] L208-245). New in 3a:
  - `invalid_folders` → 400 with `problems: string[]` ([routes] L219-221)
  - `folder_in_use` → 409 with `folders: string[]` ([routes] L222-224)
  - `mode` → 409 ([routes] L151-152, L296-297)
  - `invalid_items` → 422 ([routes] L158-162)
- **Unchanged from slice 2.** `busy` 503 with `Retry-After`, `unavailable` 503, `internal` 500, and `SnapshotError` 400/413 ([routes] L216-236).

**Shapes** ([items] L25-56; [rt@c] `ItemRef`, `ItemsOutcome`, `ItemsCheck`):
```ts
type Folder = { id: string; parentId: string | null };
type Item = { folderId: string; name: string; kind: 'cube' | 'view'; yaml: string };
type ItemRef = { folderId: string; name: string; fullName: string };
type ItemError = { folderId: string | null; name: string | null; line?: number; column?: number;
                   kind: 'yaml' | 'item' | 'reference' | 'alias' | 'compile' | 'folder'; message: string };
```

**Request limits (Joi)** ([routes] L60-119):
- `id`, `parentId`, `folderId` and `name` are strings of at most 64 characters.
- `yaml` is a string, and may be `''`.
- ≤ 100,000 folders.
- ≤ 20,000 upserts, ≤ 20,000 deletes, ≤ 20,000 snapshot items.
- ≤ 1,000 resolve names.
- ≤ 1,000 probes; `securityContext` ≤ 16,384 bytes of JSON.
- `source` ≤ 4,096 bytes.

The compiled file set is also checked: at most **10,000** files (one per item, fixed), 4 MiB per resolved item, and `XCUBE_MAX_SNAPSHOT_BYTES` in all. Going over answers `413 too_large` ([rt@c] `publishItems` → `checkedSnapshot`; [snap] L40-45, L71-104).

### `PUT …/folders`

- **Request.** `{ folders: Folder[] }`. It replaces the model's folder tree, and creates the model row if there is none ([rev@c] `putFolders`).
- **200.** `{ model, hash }`, where `hash` is the folder-tree hash below ([routes] L330-336; [rt@c] `putFolders`).
- **400 `invalid_folders`.** `problems` holds every problem found ([items] L110-147):
  - `Invalid folder id "<id>": f followed by 1 to 40 lower-case letters and digits`;
  - `Folder <id> is listed twice`;
  - `The root folder froot has no parent`;
  - `Folder <id> has no parent; only froot is a root`;
  - `The tree has no root folder froot`;
  - `Folder <id> has an unknown parent <p>`;
  - `Folder <id> is in a cycle`.
- **409 `folder_in_use`.** `{ error: "Folders still holding items can't be removed: <ids>", code, folders }`. The folders are those holding items in the *current* revision that the new tree drops ([rev@c] `replaceFolders`, `FolderInUseError`; [t-items@c] L243-244). *Corrected:* also a folder holding a data source; and a tree that would strand a cube's data source or a reference is `409 data_source_range` / `reference_range` with `{ cubes, items }` (R71 4.3, R72; `runtime.ts` `putFolders`) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Nothing is served differently.** It creates no revision and changes nothing Cube serves, ~~only how later publishes and `resolve` read names~~ ([readme@c] "PUT …/folders"; [rev@c] `putFolders`: no `pg_notify`). *Corrected:* a folder move changes no name or binding; it is checked against R71 4 and R72 only (R71 3.2) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Folder-tree hash** ([rev@c] `folderTreeHash`):
  ```ts
  sha256hex(JSON.stringify([...folders].sort((a, b) => (a.id < b.id ? -1 : 1)).map(({ id, parentId }) => ({ id, parentId }))))
  ```

### `PUT …/snapshot` with items (the switch, and recovery)

- **Dispatch.** A body whose `items` is an array takes this path ([routes] L260-271).
- **Request.** `{ baseRevision: number ≥ 1 | null (required), folders: Folder[], items: Item[], source?: object }` ([routes] L81-90).
- **`?dryRun`.** Any `dryRun` value answers `400 bad_request` "An items snapshot has no dry run; check a changeset instead" ([routes] L261-263).
- **What happens** ([rt@c] `importItemsSnapshot`, `publishItems`; [rev@c] `write`):
  1. The folder tree is checked (400 `invalid_folders`).
  2. Every item is resolved afresh (`replaceAll`).
  3. A stale base answers `409 conflict`, unless the result equals the head.
  4. Item errors answer `422 invalid_items`.
  5. The result compiles as a candidate.
  6. It is stored with the new tree in one transaction. The model's `mode` becomes `items`.
- **No mode check.** It never answers `409 mode`. This is how a files-mode model switches.
- **Answers** ([routes] L149-176):
  - `201`/`200`: `{ model, generation, revision, created, contentHash, itemsHash, items: ItemRef[] }`, with every item.
  - `200` means the same items and resolved content as the head. The folder tree is still replaced ([rev@c] `write`: `replaceFolders` runs before the `same` return).

### `POST …/changesets`

- **Request.** `{ baseRevision: number ≥ 1 | null (required), upserts?: Item[] = [], deletes?: { folderId, name }[] = [], source?: object }` ([routes] L92-101).
- **Guards first.** A model whose head is in files mode answers `409 mode` "Model "<m>" holds a file set; send an items snapshot first". A model with no folder tree answers `400 invalid_folders` (`Model "<m>" has no folder tree yet: put its folders first`) ([rt@c] `applyChangeset`; [routes] L151-152).
- **A new model.** A model with no revision at all takes a changeset with `baseRevision: null`, once its folders are put (by reading [rt@c] `applyChangeset`; not tested).
- **Answers**, in this order ([rt@c] `publishItems`):
  - **`409 conflict`** `{ error, code, currentRevision, currentItemsHash }` when the base is stale. This holds unless the changeset applied to the current items gives exactly the head: same `itemsHash` *and* same resolved `contentHash`. On a stale base, deletes of missing items are ignored, so a retried delete counts as already in ([routes] L153-157; [pub] L226; [t-items@c] L232, L261-264).
  - **`422 invalid_items`** `{ error, code, errors: ItemError[], cubeMessage: string | null }`, only on the current base ([routes] L158-162).
  - **`200`** with `created: false` when the result equals the head. This covers a retry, whatever its base ([t-items@c] L251-254, L258-260).
  - **`201`** `{ model, generation, revision, created: true, contentHash, itemsHash, items }`. `items` is `ItemRef[]` for the **upserted** items only. Deletes are not listed ([rt@c] `refs`; [t-items@c] L177, L256-257).
- **Where errors are placed.** Cube's compile errors go on the item whose `<fullName>.yml` they name. Otherwise `folderId` and `name` are `null` ([rt@c] `itemErrors`).

### `POST …/changesets?dryRun=true`

- **Request.** The changeset fields, with `baseRevision` optional and ignored, plus `securityContext` (default `{}`) and `probes: { id, query, compare? }[]` as in slice 2. `dryRun` other than `true`/`false` answers 400 ([routes] L103-114, L341-359).
- **200** `{ model, valid, errors, cubeMessage, probes, itemsHash, currentRevision, items }` ([rt@c] `ItemsCheck`, `publishItems`):
  - `itemsHash` is the hash of the resulting whole item set, or `null` when there are errors.
  - `currentRevision` is the **database head**. It is not this instance's active revision, as in the slice-2 files dry run.
  - `items` holds the upserted items with their would-be full names ([t-items@c] L216-219).
- **Probes.** Probe queries use ~~full names~~ ([t-items@c] L221-225). *Corrected:* bare names, which are the full names now (R71 1.1; integration `items.test.ts` "a dry run checks a changeset …") ([`xcube-256d632371.md`](./xcube-256d632371.md)). Probes run only when the items are valid, through the slice-2 `validate` path ([rt@c] `publishItems`).
- **Still apply:** `409 mode` and `400 invalid_folders`, which are checked before the dry-run branch ([rt@c] `applyChangeset`), and `413`/`503`.

### `GET …/items`

- **200** ~~`{ model, revision, mode, items: { folderId, name, kind, fullName, bindings: Record<shortName, fullName> }[] }`~~ for the database head ([rt@c] `itemsOf`; [t-items@c] L193-201). *Corrected:* `fullName` is the name, `bindings` is `{ name: name }`, plus `dataSource?` and `extends?` (R71 3.3; README "GET …/items") ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Files mode.** `mode: 'files'` and `items: []` ([rt@c] `itemsAt`).
- **404 `unknown_model`** for a model with no revision, including one that only has folders ([routes] L368-375; [rev@c] `head` inner-joins `revisions`).

### `POST …/resolve`

- **Request.** `{ folderId, names: string[] }` ([routes] L116-119).
- **200** `{ model, revision, folderId, names: Record<name, fullName | null> }` ([rt@c] `resolveNames`; [t-items@c] L203-206). *Corrected:* each value is the holding item's stored (bare) name, matched in any case, e.g. `{ "Customers": "customers" }`; `overlay` echoed when given (`runtime.ts` `resolveNames`; integration `items.test.ts` L202-218) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - Resolution is ~~nearest-first from the folder itself up to `froot`~~, over the database head's items. It uses no item's recorded bindings. *Corrected:* each name → the item holding it in any case, by its stored name, or `null`, from any folder; with `overlay`, the overlay's items first (R71 3.3; `runtime.ts` `resolveNames`) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - Names are not checked against the short-name rule.
- **400 `invalid_folders`** `Folder <id> is not in the folder tree`. This is also the answer for an unknown model ([rt@c] `resolveNames`).

### `GET …/revision`

- **200** `{ model, generation, mode: 'files' | 'items', current: { revision, contentHash, itemsHash: string | null, files, bytes, createdAt, source } | null, instance }` ([rev@c] `status`; [rt@c] `status`).
- **`itemsHash`** is `null` for files-mode revisions ([rev@c] `write` inserts `itemsHash ?? null`).
- **What the counts mean in items mode.**
  - `files` is the number of items.
  - `contentHash` and `bytes` are over the **resolved** files `<fullName>.yml`, not the authored YAML ([rev@c] `importItems` → `write(files: filesOf(items))`; [pub] L307-310).
- **Not documented in the README.** The README's example of this route shows neither `mode` nor `itemsHash` ([readme@c] "GET …/revision"). The code returns both.

### Slice-2 routes after the switch

- **Files import.** `PUT …/snapshot` with `files` answers `409 mode` "Model "<m>" holds items; send changesets or an items snapshot". This is checked before the unchanged and conflict checks ([rt@c] `importSnapshot`; [routes] L296-297; [t-items@c] L240-241).
- **Files dry run.** `PUT …/snapshot?dryRun=true` with `files` has **no mode check**. It compiles the given files as a candidate and answers 200 ([rt@c] `dryRun`).

## Items mode

- **Switch.** `write()` stores a revision with `mode: 'items'` and sets `models.mode = 'items'` in the same `UPDATE` as `current_rev` ([rev@c] `write`).
- **Irreversible.** `write()` with `mode: 'files'` returns `mode` when the current revision is in items mode ([rev@c] `write`). No other code sets `models.mode`: the working-tree grep of `UPDATE … models` plus the fetched `write` show this, and I found no route that sets `mode: 'files'`.
  - Retention keeps at least the current revision (`keepRevisions ≥ 1`), so an items model always has an items head ([rev@c] `write`; [x2] "Environment").
  - Only a new `generation` (xcube's schema emptied) starts the model over.
- **What's stored.** The authored YAML of each item is stored once per content, and `revision_items.authored_hash` points to it. The resolved file is stored under `<fullName>.yml` ([rev@c] `write`, `items`).
- **Serving.** A revision is served from `revision_files` exactly as in files mode ([rt@c] `filesFor`).
- **Test coverage.** No test switches a model that already holds a files revision. `items.test.ts` and `serving.sh` both start fresh models with an items snapshot ([t-items@c] L159-163; [t-img] L84-89).

## Names

| Rule | Exact value | Source |
| --- | --- | --- |
| Short name | ~~`/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/`~~, length ≤ 40, so never `__` and never a leading `_` *Corrected:* `^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$`, ≤ 40, upper case allowed, compared in any case (`nameKey`); data sources the same grammar (R71 2.2; `items.ts` L19-21, L37-40) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L10-17, L66-70 |
| Reserved | ~~33 Python keywords refused~~ *Corrected:* the 32 listed words (the count said 33) plus `None`, `True`, `False`, and Cube's `CUBE`, `TABLE`, `SECURITY_CONTEXT`, `securityContext`, `FILTER_PARAMS`, `FILTER_GROUP`, `SQL_UTILS`, `USER_CONTEXT`, `COMPILE_CONTEXT`, all in any case; not for data sources (R71 2.2; `items.ts` L29-35, L96-105) ([`xcube-256d632371.md`](./xcube-256d632371.md)): `and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield`; message `"<name>" is a reserved word and can't be a name` | [items] L19-23, L71-73 |
| Invalid-name message | ~~`"<name>" is not a valid name: lower-case letters, digits and single underscores, starting with a letter, at most 40 characters`~~ *Corrected:* `"<name>" is not a valid name: a letter, then letters, digits and single underscores, not ending in one, at most 40 characters` (`items.ts` L83-89) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L67-69 |
| Folder id | `/^f[a-z0-9]{1,40}$/` (2–41 characters); root `froot`; enforced again by a DB `CHECK` | [items] L5-8; [mig@c] |
| Full name | `froot` → `name`; ~~otherwise `` `${folderId}__${name}` ``~~ *Corrected:* the name, in every folder (R71 1.1; `items.ts` L61-62, L270) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L62-64 |
| Item identity | ~~`(folderId, name)`~~, whatever the `kind` *Corrected:* the name, in any case (`itemKey`); the folder is where it is, not what it is (R71 2.6, 2.7; `items.ts` L78-81) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L58-60 |
| Item content | YAML with exactly one top-level key, `cubes` or `views` matching `kind`, holding exactly one mapping whose `name` equals the item's name; no `{{ }} {% %}` | [items] L172-213 |

Messages: `The YAML must hold only cubes: with exactly one cube`, and `The cube is named "<x>", but the item is "<y>"` ([items] L204-212). A YAML syntax error gives `kind: 'yaml'` with a 1-based line and column in the **authored** text ([items] L192-197; [t-names] L190-205).

- **An over-long name is a 422, not a 400.** Joi lets up to 64 characters through, so names and folder ids over the xcube limits answer `422` (`item` or `folder`), not 400 ([routes] L65-75; [pub] L205-209).
- **An upsert into a folder not in the tree** is `422` with kind `folder`: `Folder <id> is not in the folder tree` ([pub] L205-209; [t-names] L180-188; [t-items@c] L237-238).
- **Hand-written full names.** *Corrected:* removed; there are no full names to write by hand (R71 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)). ~~`"<x>" is a full name; refer to it by its short name` is raised~~ when a reference contains `__`, names an existing item, and isn't the item's own full name ([rw] L157-162; [t-names] L518-526). A `__` name that matches no item is left for Cube's compile to report.

## Resolution at publish

~~`Scope.resolve` walks `FolderTree.chain(folderId)`: the folder, then each parent up to `froot`. It takes the first item of that name~~ ([rw] L34-42; [items] L96-104). *Corrected:* `Scope.resolve` is an exact lookup of the one item of that name; R72 then refuses a reference to an item off the referrer's folder path (`reference_range`) (`rewrite.ts` L16-33; `publish.ts` L360-390) ([`xcube-256d632371.md`](./xcube-256d632371.md)). Only upserted items are resolved. Kept items keep their resolved YAML and bindings ([pub] L222-231, L269-294). Expressions are read with Cube's own `Python3Lexer`, so names inside string literals, lambda parameters and keyword arguments are never chains ([expr] L1-2, L20-79; [t-names] L74-86).

The rewritten fields are the ones Cube 1.7.45 transpiles (`transpiledFieldsPatterns`), matched on camelized paths, plus explicit rules ([rw] L98-111, L242-267; [c-cpct] L43-82):

| Construct | How | Test |
| --- | --- | --- |
| `joins[].name` | ~~Nearest *other* item when it is the item's own name (`bindOther`). Unresolved: `422 reference` `The join to "<x>" names no cube in a folder on this item's path`~~ *Corrected:* the one item of that name; unresolved: `The join to "<x>" names no cube of the model` (`rewrite.ts` L208-214) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [rw] L142-155, L274-282; [t-names] L115-118, L124, L152-156 |
| `sql`, `sql_table`, `joins[].sql`, and any `…sql` | f-string chains. The first name is cube-first; after a cube, member-first; `.sql` stays the cube's SQL | [rw] L197-233, L263-265; [t-names] L115-117, L391, L498-507 |
| `extends` | ~~`bindOther`. Unresolved: `422` `It extends "<x>", which no folder on this item's path holds`~~ *Corrected:* the one item of that name; `It extends itself` for its own name; unresolved: `It extends "<x>", which is no cube or view of the model` (R71 3.4; `rewrite.ts` L255-264) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [rw] L322-330; [t-names] L386, L509-516 |
| View `cubes[].join_path`, `folders[].includes[].join_path` | Every segment bound; ~~the first by `bindOther`~~. Unresolved: `422` `The join path names "<x>", …` *Corrected:* every segment is the one item of its name (`…, which is no cube of the model`), each held to R72's path rule (`rewrite.ts` L108-118) ([`xcube-256d632371.md`](./xcube-256d632371.md)) | [rw] L172-183, L260-262; [t-names] L146-149, L400-403, L515 |
| `FILTER_PARAMS.<cube>…` | The second segment is bound | [rw] L198-204; [t-names] L120, L393 |
| Pre-aggregation `measures`, `dimensions`, `segments`, `time_dimension(s)`, `rollups`, `indexes[].columns`, legacy `*_references` | Chains | [c-cpct] L55-58; [t-names] L121 (prefixed), L395 (`rollups`, root only), L482-496 |
| `drill_members` | Chains | [t-names] L119 |
| `hierarchies[].levels` | Chains | [t-names] L394 (root only) |
| `default_filters[].member` / `.unless` | Literal path: only the first name; `values` skipped | [rw] L185-195, L254-259; [t-names] L404 |
| `access_policy[].row_level.filters…member` | Chains; `values` skipped | [c-cpct] L68-69; [t-names] L396 |
| `access_policy[].member_level`/`member_masking` `.includes`/`.excludes` | Literal path | [rw] L248-250; [t-names] L397 |
| `access_policy[].conditions[].if`, `links[].url`/`params`, `mask.sql`, `case.switch`, `time_shift[].time_dimension`, `order_by[].sql`, `reduce_by`/`group_by`… | Chains, where transpiled | [c-cpct] L47-76; untested except `links` (root, [t-names] L392) |
| Never rewritten | `meta` subtrees, string literals, lambda parameters, keyword arguments, `values`, and the symbols `CUBE TABLE FILTER_PARAMS FILTER_GROUP SQL_UTILS SECURITY_CONTEXT security_context securityContext COMPILE_CONTEXT` | [rw] L11-14, L313; [expr] L26-79; [t-names] L389, L393 |

- **Unresolved names.** An unresolved name outside joins, `extends` and join paths is left as written. Cube's compile then refuses it (`422`, kind `compile`) ([rw] L113-119, L212-217). ~~A name found nowhere on the item's path but present at the root binds to the root's.~~ *Corrected:* a name binds to the one item of that name wherever it is; one off the item's path is then refused (`reference_range`, R72) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Overrides.** ~~`fsales/orders` with `extends: orders` binds the root `orders`. A view `fops/orders` over `join_path: orders` binds the root cube~~ ([t-names] L509-516). *Corrected:* no item may share another's name in any folder (`name_in_use`), and `extends` of its own name is `It extends itself` (R71 2.1, 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - ~~Because items are keyed by `(folderId, name)`, a view can share its cube's short name only when that cube is in an ancestor folder~~ ([items] L58-60). *Corrected:* cubes and views share one namespace model-wide; a view never shares a cube's name (R71 2.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Bindings.** Each item records one ~~`Record<shortName, fullName>`~~ of every name it bound, including itself (`orders: 'orders'` at the root, [t-names] L99). *Corrected:* `{ name: name }`, the items it refers to as written (R71 3.3; `rewrite.ts` L92-98) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - ~~A name that means both the item itself (in an expression) and its ancestor's namesake (in `extends`) keeps whichever was bound last. `extends` is bound last~~ ([rw] L129-135, L320-330). Found by reading; no test. *Corrected:* no ancestor namesake is possible (R71 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **No rebinding.** ~~A nearer namesake added later changes nothing until the item is republished. Republishing it rebinds~~ ([t-names] L168-178; [t-items@c] L272-287). *Corrected:* no nearer namesake can exist, and republishing rebinds nothing (R71 3.4: rebinding removed) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Republishing unchanged.** It gives a new revision only if the resolved text changes. Otherwise it answers `200 created: false` ([rt@c] `publishItems` `sameAsHead`; [rev@c] `write` `same`).

## The items hash

xcube's function ([pub] L312-322; [items] L58-60), which wechart can reproduce in Node:
```ts
import { createHash } from 'node:crypto';
type Item = { folderId: string; name: string; kind: 'cube' | 'view'; yaml: string };
export function itemsHash(items: Item[]): string {
  const sorted = [...items]
    .sort((a, b) => (`${a.folderId}/${a.name}` < `${b.folderId}/${b.name}` ? -1 : 1))
    .map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml }));
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}
```
- **What's hashed.** The whole item set of the revision, not just the changeset ([rt@c] `publishItems` hashes `published.items`).
- **`yaml`** is the **authored** text exactly as sent. For kept items it is the stored authored content ([rev@c] `items`, `write`).
- **Serialization.**
  - Key order is `folderId, name, kind, yaml`.
  - `JSON.stringify` adds no whitespace.
  - The encoding is UTF-8. Node enforces UTF-8 for a string with no encoding, and xcube passes `'utf8'` explicitly ([node-hash]).
  - The output is lower-case hex, which the column's `CHECK '^[0-9a-f]{64}$'` enforces ([mig@c]).
- **Sort.**
  - The key is `` `${folderId}/${name}` ``, compared with JS `<`; don't use `localeCompare`.
  - Both parts are limited to ~~`[a-z0-9_]`~~, and `/` (0x2F) sorts below all of them. *Corrected:* names may now hold upper case (`[A-Za-z0-9_]`), all still above `/`; the sort is byte order (R71 2.2; README "PUT …/snapshot with items") ([`xcube-256d632371.md`](./xcube-256d632371.md)). So this equals sorting by folder id, then name, in ASCII order.
  - Duplicates are refused before hashing: `The item is in the changeset twice` ([pub] L210-217).
- **The folder tree is not in the items hash.** No route reads the tree back. Only `PUT …/folders` answers its hash ([rev@c] `folderTreeHash`).
- **No test vector.** The fork has no golden vector. `items.test.ts` checks the response against xcube's own `itemsHash` ([t-items@c] L163).

## Titles, aliases and meta

- **Folder items (`folderId !== 'froot'`)** ([pub] L87-102): *Corrected:* folder and root items are treated alike now (R71 1.2) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - ~~`title = titleOf(shortName)` unless authored.~~ `titleOf` is `inflection.titleize(name)` with `Id`→`ID` ([pub] L40-43). *Corrected:* xcube writes no `title`; Cube's own title from the name applies, and an authored one is kept (R71 1.2; `publish.ts` L220-224) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
  - Cube prefixes member titles with the cube title, so `fsales__orders.big` shows as "Orders Big" ([c-meta] L56, L262-266; [t-items@c] L188-189).
  - ~~`sql_alias` is set unless authored: the full name if it is ≤ 20 characters, else `x` + 7 base32 characters of SHA-256(fullName)~~ ([pub] L18-48; [t-names] L114, L207-218). *Corrected:* unless authored, only for upper case (lower-case form), a non-default data source (`<name>_<hash4>` or `x<hash7>`), a cube that `extends`, or a too-long stem or member alias (`x<hash7>`) (R71 1.2; `publish.ts` L165-188) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Every item, root included:** `meta = { ...authoredMeta, xcube: { folderId, shortName } }`. An authored non-object `meta` is replaced ([pub] L113-114). Cube's `/v1/meta` returns cube-level `meta` for cubes and views alike ([c-meta] L96-105; [t-items@c] L170).
- **Root items** get no `title` and ~~no `sql_alias`~~ ([t-names] L90-100). *Corrected:* a root item gets a `sql_alias` under the same rules as any other (R71 1.2) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Views with `prefix` or `split`** get `alias` = the last segment of the *authored* `join_path`. Prefixed view members therefore keep short names (`fsales__summary.customers_name`) ([pub] L103-112; [t-names] L146-149, L417). *Corrected:* the view is served as `summary`, and a `split` view's `<view>_<alias>` name counts in the namespace (R71 1.1, 2.1; `publish.ts` L286-297) ([`xcube-256d632371.md`](./xcube-256d632371.md)).

## Removal and renames

- **Removal.** Any kept item bound to a full name that would no longer exist gives `422 invalid_items`, one error per removed target ([pub] L249-267; [t-names] L159-165; [t-items@c] L234-235):
  ```
  { folderId, name, kind: 'reference', message: "<folderId>/<name> can't be removed or renamed: <a/b>, <c/d> refer to it" }
  ```
  Referrers appear only in the message text, as sorted ~~`folder/name` pairs~~. *Corrected:* the message is `<name> can't be removed: <b>, <d> refer(s) to it`, bare names only (`publish.ts` L497-505; integration `items.test.ts` "refusals: …") ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Renames and moves.** There is no rename operation. A rename or move is a delete plus an upsert, and gets the same check. *Corrected:* a landed name never changes, not even its case (`name_in_use`); a delete of `A/orders` plus an upsert of `B/orders` in one changeset is a move of the same item (R71 2.7, 5.1) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **What counts.** Only item-to-item bindings count. Chart references are wechart's to check (input L39).
- **Folders.** Changing a folder's parent changes no full name; ~~later publishes resolve differently~~ ([items] L62-64). A folder holding items can't be removed (`409 folder_in_use`). *Corrected:* nothing resolves differently; a move that would strand a reference or a cube's data source is refused (`409 reference_range` / `data_source_range`), and a folder holding a data source can't be removed either (R71 3.2, 4.3, R72) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
- **Deleting a missing item** on the current base answers `422` `There is no such item to delete` ([pub] L225-229).

## Identifier-length and alias refusals (~~folder items only, except uniqueness~~ *Corrected:* every item, root included: R71 1.2, [`xcube-256d632371.md`](./xcube-256d632371.md))

All of these are `422 invalid_items` with kind `alias` ([pub] L139-194):
- **Cube aliases are unique across the model:** `Its SQL alias "<a>" is also <fullName>'s` (L146-151).
- **Rollup table stems.** A stem `<cubeAlias>_<preAggAlias>` over 25 characters ("fits Postgres's 63 with Cube's version suffix", L18-19) is handled in this order:
  1. The cube gets the hash alias (L95-99).
  2. A pre-aggregation with no `sql_alias` and no `indexes` gets `p` + 6 base32 characters (L156-163).
  3. Otherwise: `Pre-aggregation <pa>'s rollup table name would be too long: shorten its name to at most <25 − alias − 1> characters` (L164-171; [t-names] L443-480, "at most 16").
- **Rollup tables are unique:** `Pre-aggregation <pa> would share its table <t> with <owner>` (L173-178).
- **Member aliases.** `<alias>__<member>`, plus 8 for time dimensions, over 63 gives `Member <m>'s SQL alias would be longer than 63 characters; shorten the name`. No number is given. View members are checked with their prefixed names (L181-191; [t-names] L528-538).
- The sibling doc's Postgres budgets are in [w-pn] L183-191.

## What Cube serves: root vs folder items

| | Root items (vs slice-2 files) | Folder items |
| --- | --- | --- |
| Cube and member names in `/v1/load`, `/v1/meta`, jobs | Unchanged | ~~`<folderId>__<short>`~~ ([t-items@c] L179-183) *Corrected:* the bare name, as for root items (R71 1.1, [`xcube-256d632371.md`](./xcube-256d632371.md)) |
| `title` | Cube's default, unchanged | ~~`titleOf(short)`~~ *Corrected:* Cube's default, as for root items (R71 1.2, [`xcube-256d632371.md`](./xcube-256d632371.md)) |
| SQL table and column aliases, rollup table names | Unchanged: no alias added ([pub] L88, L153-156) | From `sql_alias` / `p…` aliases *Corrected:* one rule for both columns: an alias only where R71 1.2 calls for one ([`xcube-256d632371.md`](./xcube-256d632371.md)) |
| `/v1/meta` cube `meta` | **Gains `xcube`** | Gains `xcube` |
| Access policies | Unchanged; groups untouched | ~~Member references → full names~~; groups untouched ([t-names] L396-397) *Corrected:* references stay as written (R71 1.1, [`xcube-256d632371.md`](./xcube-256d632371.md)) |
| Compiled file | `<name>.yml`, a `js-yaml` dump of the parsed item, not the authored text ([pub] L73-75, L300, L307-310) | ~~`<full>.yml`~~ *Corrected:* `<name>.yml` (`publish.ts` L586-589, [`xcube-256d632371.md`](./xcube-256d632371.md)) |
| `contentHash` | Changes at the switch (new paths and content) | — |
| New refusals | Short-name rules, one cube or view per item, alias and table uniqueness | Plus the identifier-length checks |

- **Unchanged in 3a.** Token handling, pinning, `x-xcube-*` headers, the jobs routes and the refresh contexts: `gateway.ts`, `config.ts`, `lane.ts` and `listener.ts` are not in the 3a diff ([gh-patch]). Revisions are served from their stored files as before ([rt@c] `filesFor`).
- **Not verified at runtime:** the jobs API's pre-aggregation names for folder items, and unchanged rollup versions for root items across the switch (Open questions 5-6).

## Tests and CI

- **Unit, `test/unit/names.test.ts`**, 20 tests ([t-names]):
  - lexer (L74-86);
  - root names (L90-100) and prefix/title/alias/nearest-first (L102-125);
  - views (L127-150);
  - unresolved join and removal (L152-166) and no rebinding (L168-178);
  - unknown folder (L180-188) and one cube or view per item in plain YAML (L190-205);
  - aliases (L207-218) and compiles in Cube (L220-238);
  - rewrite corpus (L380-408) and corpus compile (L410-419);
  - indexes (L443-480), legacy `*_references` (L482-496), `.sql` (L498-507);
  - overrides (L509-516), hand-written full names (L518-526), view member length (L528-538).
- **Integration, `test/integration/items.test.ts`** (committed lines), which runs against real Postgres with DuckDB ([t-items@c]):
  - snapshot, root bare, meta (L159-171);
  - changeset, prefix, query, titles (L173-190);
  - items and resolve (L192-207);
  - dry run (L209-229);
  - refusals: stale, referenced delete, unknown folder, file set `mode`, `folder_in_use`, cycle (L231-248);
  - idempotent retry, retried delete, stale-and-invalid 409 (L250-270);
  - republish rebinds (L272-288).
- **Image, `test/image/serving.sh` L78-105** ([t-img]): folders, items snapshot, changeset, and a query of `fsub__doubled.total` through a real image.
- **Not tested:**
  - the files→items switch of an existing files model;
  - Python-keyword and 40-character refusals;
  - folder-id format errors other than a cycle;
  - `resolve` on an unknown folder;
  - `GET …/items` 404;
  - a dry run on a files-mode model;
  - `meta.xcube` on views and folder items;
  - `conditions.if` rewriting;
  - an items-hash golden vector (grep of `test/`).
- **CI.** The `xcube` workflow ran on the push of `36aedeb6c4` and concluded **success** ([ci-run]).
  - Job `test` ran 15:09:22–15:11:15 and job `image` ran 15:11:17–15:12:48 ([ci-checks]).
  - `test` runs `npm test` with `XCUBE_TEST_DATABASE_URL` set against Postgres 18, so the Postgres-backed suites run instead of skipping ([ci] L27-82; [t-items@c] L19-20; `jest.config.js` runs everything under `test/`).
  - Per-test output was not visible (the job page wouldn't load its log). No tests were run here.

## Gotchas

1. **Build the image from the commit, not the working tree.** The working tree holds uncommitted 3b modules code, which a build would tag `xcube:v1.7.45-36aedeb6c4` (Provenance; [x2] Gotcha 19).
2. **There is no rollback to the slice-2 image after the first 3a start.** Migration 2's `minReader: 2` makes slice-2 processes exit ([mig@c]; [migrate] L95-100).
3. **The switch can't be dry-run.**
   - Items snapshots refuse `?dryRun` ([routes] L261-263).
   - A changeset (dry run or not) on a files-mode model is `409 mode` ([rt@c] `applyChangeset`).
   - The first items snapshot is its own check: a `422` stores nothing ([rt@c] `publishItems`).
4. **A slice-2 client keeps running after the switch.**
   - Its files import gets `409 mode`.
   - Its files dry run still answers 200 about files that are no longer served ([rt@c] `dryRun`).
   - `current.contentHash` becomes a hash of resolved files, so a slice-2 reconcile never matches and would retry the import forever. Stop the slice-2 publish path when switching.
5. **`PUT …/folders` creates the model row.** Afterwards `GET …/revision` answers `200 { current: null, mode: 'files' }` instead of `404`, and `GET …/items` stays `404` until a revision exists ([rev@c] `putFolders`, `status`, `head`). Treat `current: null` like the 404: the base is `null`.
6. **The items hash ignores folders.** No route reads the tree back. Re-`PUT` the tree, whose answer is idempotent, and compare its `hash` ([rev@c] `folderTreeHash`).
7. **"Already in" means "changes nothing now".**
   - Any changeset that leaves the items as they are answers `200` on any base, an empty one included.
   - A retry after the same items were changed again, ~~or after a nearer namesake appeared,~~ is `409` ([rt@c] `publishItems`). *Corrected:* no nearer namesake can appear (R71 3.4) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
8. **Items are keyed by ~~`(folderId, name)`~~, not by kind.** Upserting a view where a cube of that name sits replaces the cube ([items] L58-60; [pub] L210-231). *Corrected:* keyed by the name in any case; the same name in another folder is `name_in_use` unless the changeset deletes the landed one (R71 2.3, 2.7; `publish.ts` L456-463) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
9. **Root items must obey the short-name rules too**, including the ~~33~~ reserved words ([items] L66-75). *Corrected:* every item obeys R71's grammar and its 44 reserved words, in any case (R71 2.2; `items.ts` L29-35) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
   - The seed's cube and view names all fit (`customers`, `products`, `orders`, `monthly_orders`, `product_catalog`, `order_summary`, `secured_orders`; grep of `infra/cube/model`).
   - `templated_example.yml` is Jinja, which parseItem refuses; wechart already never sends it ([w-te] L1-5).
10. **Error positions.**
    - Cube's compile errors carry line and column in the **resolved** `<fullName>.yml`, a `js-yaml` dump, not in the authored YAML ([rt@c] `itemErrors`; [pub] L73-75, L307-310).
    - Only xcube's own YAML errors point at the authored text ([items] L192-197).
11. **A missing name outside joins, `extends` and join paths is a compile error.** It is not a `reference` error. ~~A missing name present at the root binds the root's~~ ([rw] L113-119, L212-217). *Corrected:* a name binds the one item of that name wherever it is, then R72 refuses one off the path (`reference_range`) ([`xcube-256d632371.md`](./xcube-256d632371.md)).
12. **`resolve` ≠ bindings.** `resolve` reads the current items. ~~An item's `bindings` are frozen at its publish.~~ *Corrected:* bindings are `{ name: name }`, and both name the one item of each name (resolve matching in any case) (R71 3.3) ([`xcube-256d632371.md`](./xcube-256d632371.md)). Bind secondary cubes through the source item's `bindings`, as the input says ([rt@c] `resolveNames`; [pub] L290-294).
13. **Capacity.** A model holds at most **10,000 items** (the compiled-file cap) even though Joi allows 20,000 per request. Each resolved item may be at most 4 MiB ([snap] L40-45, L72-74; [routes] L88, L98).
14. **Authored `sql_alias` / `title` / `meta.xcube`.** An authored `sql_alias` or `title` is kept as written, and may then collide (`alias` error). An authored `meta.xcube` is overwritten ([pub] L90-93, L113-114, L146-151).
15. **The folder tree is read outside the publish transaction** ([rt@c] `applyChangeset` reads `store.folders` before `write`). A concurrent `PUT …/folders` can remove a folder between the read and the write. Found by reading; not tested.

## Open questions / unverified

1. **Conflict with a sibling doc (for the spec).** `prefixed-names.md`'s supersession note says the root is prefixed "like every folder (R28 Q1)" and that "xcube sets a short, stable `sql_alias` on every cube and pre-aggregation" ([w-pn] L37-47). xcube 3a differs on both counts:
   - it keeps root names bare;
   - it aliases only folder items;
   - it aliases pre-aggregations only when the stem is too long ([items] L62-64; [pub] L87-102, L154-163).
   The input's decision 1 (amend AC-328) matches the code. That doc and the spec need updating.
2. **Which tree does the user intend to deploy?** 36aedeb6c4, or the working tree with uncommitted 3b? This doc covers only the commit.
3. **UNVERIFIED: titles.** `titleOf` (`inflection.titleize(name)`) and Cube's `titleize` (camelCase, then underscore, then titleize) take different steps ([pub] L40-43; [c-meta] L16-21). They may differ for names with digit-only words (`sales_2023`). This was not executed.
4. **UNVERIFIED: the rollup-stem budget.** xcube's 25-character stem budget against partitioned rollups (a partition suffix of up to 12 characters, [w-pn] L150, L189) was not checked at runtime.
5. **UNVERIFIED: root rollup tables across the switch.** Whether root items' rollup tables keep their version suffixes, and so aren't rebuilt, depends on Cube's version hashing of unchanged SQL. Not observed.
6. **UNVERIFIED: jobs for folder items.** `POST /v1/pre-aggregations/jobs` selectors for folder items (`fsales__orders.main`) are not tested in the fork.
7. **UNVERIFIED: the files→items switch of a model holding files revisions.** It was checked by reading only (Items mode).
8. **UNVERIFIED: a golden items-hash vector.** None exists in the fork. A cross-check needs a live xcube.
9. **Not in 36aedeb6c4: 3b.** The input's 3b claims (modules, "changes nothing wechart sees", transparent routing) aren't in the commit. The uncommitted README says `GET …/revision` will list modules, an additive field.
10. **UNVERIFIED: the input's §4.7 file list.** Only `rollupReferences.ts:204` was checked (it skips names containing `__`, [w-rr] L203-204). The other listed files were not.

## Input claims checked

The input is `docs/inputs/2026-09-26-xcube-slice-3a-contract.md`, cited by line.

| # | Claim (input line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Root items bare; others `<folderId>__<shortName>` (L9-10) | ~~Verified~~ *Corrected:* every item bare (R71 1.1, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L62-64; [t-names] L90-125; [t-items@c] L159-190 |
| 2 | Nothing a dashboard names changes; existing dashboards render unchanged (L11) | Partly | Names unchanged; `/v1/meta` gains `meta.xcube` on root cubes ([pub] L113-114; [t-items@c] L170); AC amendments are spec decisions; rendering UNVERIFIED |
| 3 | T430 comparison still runs (L12) | n/a | wechart task |
| 4 | 3a: the whole model compiles as one (L14) | Verified | [pub] L307-310; no `modules` dir at the commit ([gh-src]) |
| 5 | 3b changes nothing but speed; modules routed transparently (L15-16) | UNVERIFIED | Not in the commit; the uncommitted README adds modules to `GET …/revision` |
| 6 | Commit 36aedeb6c4; README sections authoritative (L20) | Verified (ref and sections) | [head]; [fork-ref]; [readme@c]; working tree dirty (Provenance) |
| 7 | Files → items with the first items snapshot, never back (L22) | Verified by reading; untested for a model with files revisions | [rev@c] `write`; [rt@c] `importItemsSnapshot`, `importSnapshot`, `applyChangeset` |
| 8 | xcube holds the tree and items; one cube or view each; YAML as written (L23-24) | Verified | [mig@c]; [items] L172-213; [rev@c] `write` |
| 9 | Short-name regex, ≤ 40, never `__` (L27) | ~~Verified; also refuses 33 Python keywords~~ *Corrected:* R71's grammar with upper case, 44 reserved words in any case (R71 2.2, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [items] L15-23, L66-75 |
| 10 | Folder id `f` + 1–40 `[a-z0-9]`; root `froot` (L28) | Verified | [items] L6-8, L110-147; [mig@c] |
| 11 | Injective encoding; UUID fine; `ws:a.b`/`ws:ab` collide (L29-31) | xcube part verified | Lower-case only; `f` + 32 hex = 33 characters fits ([t-names] L208); a collision within one tree answers 400 `listed twice` ([items] L116-118); injectivity is wechart's |
| 12 | Resolution at publish, nearest-first, rewritten to the full name (L32) | ~~Verified~~ *Corrected:* one item per name, exact match, no rewrite (R71 3.1, 3.4, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [rw] L34-42, L129-135; [pub] L269-278 |
| 13 | Covers joins, `{…}`, `extends`, `join_path`, `FILTER_PARAMS`, rollups/dimensions, drill members, hierarchies, default filters, access policies (L33-34) | Verified by reading; tested except prefixed rollups/hierarchies and `conditions.if` | Resolution table |
| 14 | No rebinding until published again (L36) | ~~Verified~~ *Corrected:* rebinding removed; nothing to rebind (R71 3.4, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [pub] L222-231, L290-294; [t-names] L168-178; [t-items@c] L272-283 |
| 15 | Republishing unchanged rebinds "(a new revision)" (L36) | ~~Partly~~ *Corrected:* it rebinds nothing (R71 3.4, [`xcube-256d632371.md`](./xcube-256d632371.md)) | Rebinds ([t-items@c] L284-287); a new revision only if the resolved text changes, else 200 `created: false` ([rt@c] `publishItems`; [rev@c] `write`) |
| 16 | Override extends its ancestor's namesake; a view named as its cube (L37) | ~~Verified~~ *Corrected:* no namesake allowed anywhere; `It extends itself` (R71 2.1, 3.4, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [rw] L58-75, L142-155; [t-names] L509-516; only across folders ([items] L58-60) |
| 17 | Full names by hand refused (L38) | ~~Verified with a limit~~ *Corrected:* refusal removed; no full names exist (R71 3.4, [`xcube-256d632371.md`](./xcube-256d632371.md)) | Only when naming an existing other item ([rw] L157-162; [t-names] L518-526) |
| 18 | Removal or rename refused, naming referrers (L39) | Verified | In the message text ([pub] L249-267; [t-items@c] L234-235) |
| 19 | Folder item `title` from the short name; "Orders Count" (L40) | ~~Verified~~ *Corrected:* xcube writes no `title`; Cube's own from the name is the same text (R71 1.2, [`xcube-256d632371.md`](./xcube-256d632371.md)) | [pub] L40-43, L87-92; [c-meta] L262-266; [t-items@c] L188-189 |
| 20 | `meta.xcube = { folderId, shortName }` on every cube and view (L40) | Verified, root included | [pub] L113-114; [t-names] L98; [t-items@c] L170 |
| 21 | Routes under the model base, slice-2 admin token (L44) | Verified | [routes] L204-206, L247-381 |
| 22 | `PUT …/folders`; 400 `invalid_folders`; 409 `folder_in_use` (L48) | Verified | Answers 200 `{ model, hash }`; creates the model row ([routes] L330-336, L219-224; [rev@c]; [t-items@c] L243-247) |
| 23 | `PUT …/snapshot` `{ baseRevision, folders, items, source }` (L49) | Verified | `?dryRun` → 400; never `409 mode` ([routes] L81-90, L260-271) |
| 24 | `POST …/changesets` body (L50) | Verified | `baseRevision` required (null allowed); lists default `[]` ([routes] L92-101) |
| 25 | Dry run: no `baseRevision`, plus `securityContext`, `probes`; full names (L51) | Partly | `baseRevision` accepted and ignored; `compare` accepted; `409 mode`/`400` still apply ([routes] L103-114; [rt@c]; [t-items@c] L221-225) |
| 26 | `GET …/items` shape (L52) | Verified | Plus `model`; 404 with no revision ([rt@c] `itemsOf`; [routes] L368-375) |
| 27 | `POST …/resolve` (L53) | Verified | Plus `model`, `revision`, `folderId`; unknown folder or model → 400 ([rt@c] `resolveNames`) |
| 28 | `GET …/revision` plus `mode`, `current.itemsHash` (L54) | Verified | [rev@c] `status`; the README example omits both |
| 29 | `201 { revision, contentHash, itemsHash, items }` (L57) | Verified | Plus `model`, `generation`, `created`; `items` = upserts only ([routes] L163-174) |
| 30 | `200` when already in, whatever the base, retried delete included (L58) | Verified | Means "applying it changes nothing now" ([rt@c] `publishItems`; [t-items@c] L251-260) |
| 31 | `409 conflict` on a stale base even when invalid; `409 mode` in files mode (L59) | Verified | Body `currentRevision`, `currentItemsHash` ([routes] L151-157; [t-items@c] L261-264) |
| 32 | `422 invalid_items` errors shape, current base only (L60) | Verified | Plus `cubeMessage`; `folderId`/`name` may be null ([items] L49-56; [rt@c] `itemErrors`) |
| 33 | Postgres identifier refusals; the message says how short (L61) | Partly | Number only for pre-aggregations; member message says "shorten the name" ([pub] L164-191) |
| 34 | Dry run `200 { valid, errors, probes, items, itemsHash, currentRevision }` (L63) | Verified | Plus `model`, `cubeMessage`; `currentRevision` = DB head ([rt@c] `ItemsCheck`) |
| 35 | Items hash definition (L65) | Verified | Key `` `${folderId}/${name}` ``, JS `<`, compact JSON, UTF-8, hex ([pub] L312-322) |
| 36 | §4.1 push the tree on start-up and changes (L69) | Compatible | Idempotent `PUT`; tree not readable back |
| 37 | §4.2 `model_files` → root items; split multi-cube files; nothing Cube serves changes (L70-73) | Partly | Splitting required ([items] L203-206); names, SQL and rollups kept; `meta.xcube`, file names and `contentHash` change |
| 38 | §4.3 changesets with dry run (L74) | Compatible | — |
| 39 | §4.4 reconcile by `itemsHash` (L75) | Compatible | Excludes the folder tree |
| 40 | §4.5 `resolve` at chart publish; secondaries via bindings (L76-78) | Compatible | `resolve` ≠ frozen bindings; one map per item ([rw] L129-155) |
| 41 | §4.6 check deletes with `GET …/items` (L79) | Compatible | xcube refuses item→item removals itself |
| 42 | §4.7 fix `rollupReferences.ts:204` etc. (L80-82) | Line 204 confirmed; the rest not checked | [w-rr] L203-204 |
| 43 | §4.8 plain YAML only; Jinja/JS/Python refused (L83) | Verified | Whatever `XCUBE_FILE_TYPES` says ([items] L182-190; [routes] L65-70) |
| 44 | §5 3b (L87-89) | UNVERIFIED | Not in the commit |

[head]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (36aedeb6c498af3ebc2e5d37eef64ee3838a2f29)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[gh-patch]: https://github.com/senthilkrajagopal/cube/commit/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29.patch ("15 files changed, 2731 insertions(+), 33 deletions(-)")
[gh-src]: https://api.github.com/repos/senthilkrajagopal/cube/contents/xcube/src?ref=36aedeb6c498af3ebc2e5d37eef64ee3838a2f29
[readme@c]: https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/README.md
[rt@c]: https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/runtime/runtime.ts
[rev@c]: https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/store/revisions.ts
[mig@c]: https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/src/store/migrations.ts
[t-items@c]: https://github.com/senthilkrajagopal/cube/blob/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/xcube/test/integration/items.test.ts (committed lines; working tree = +1 from L103)
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
[expr]: /Users/srajagopal/Work/bi/cube/xcube/src/names/expr.ts
[rw]: /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
[snap]: /Users/srajagopal/Work/bi/cube/xcube/src/model/snapshot.ts
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
[t-names]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
[t-img]: /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
[ci]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[ci-run]: https://github.com/senthilkrajagopal/cube/actions/runs/36250938899
[ci-checks]: https://api.github.com/repos/senthilkrajagopal/cube/commits/36aedeb6c498af3ebc2e5d37eef64ee3838a2f29/check-runs
[c-cpct]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/transpilers/CubePropContextTranspiler.js
[c-meta]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeToMetaTransformer.js
[node-hash]: https://github.com/nodejs/node/blob/main/doc/api/crypto.md#hashupdatedata-inputencoding
[x2]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-2.md
[w-pn]: /Users/srajagopal/Work/wechart/docs/research/cube/prefixed-names.md
[w-rr]: /Users/srajagopal/Work/wechart/packages/api/src/model/rollupReferences.ts
[w-te]: /Users/srajagopal/Work/wechart/infra/cube/model/cubes/templated_example.yml
