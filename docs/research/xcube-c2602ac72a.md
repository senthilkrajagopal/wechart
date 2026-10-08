---
library: xcube-c2602ac72a
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube c2602ac72a; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-c2602ac72a@sha256:c7334a52800d8fe30faa7277e9b0ebcc68701b6f10ad394ad267e5e361871884 (amd64, arm64)'
researched: 2026-10-08
sources:
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-08-1745-folder-tree-catchup.md
  - /Users/srajagopal/Work/bi/cube (git show c2602ac72a, its commit message)
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts (at c2602ac72a, `folderTree`)
  - docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-c2602ac72a (run 2026-10-08)
  - docs/research/xcube-2e611eae61.md (the image before it)
---

# xcube c2602ac72a: a read of xcube's folder tree, so a start catches up a folder deleted while xcube missed it

This is T765's research doc (AC-330). It covers the one change on top of `2e611eae61` that wechart needs. Each claim is checked against the fork at that commit, or against xcube's answer where the fork can't show it.

**Short names for the sources:**
- **[answer]** `~/Work/xcube-exchange/to-wechart/2026-10-08-1745-folder-tree-catchup.md`.
- **[rt]** `xcube/src/runtime/runtime.ts` at c2602ac72a.
- **[commit]** `git show c2602ac72a`.

## The image

- `ghcr.io/senthilkrajagopal/xcube:v1.7.45-c2602ac72a@sha256:c7334a52800d8fe30faa7277e9b0ebcc68701b6f10ad394ad267e5e361871884`, an index for amd64 and arm64 (`docker buildx imagetools inspect`, 2026-10-08).
- **No migration:** the schema is still 14 ([answer]). Changing the image is the whole upgrade from `2e611eae61`.
- **What else it changes:** nothing on top of `2e611eae61` but this read and the snapshot's refusal below (the coordinator, relaying xcube, 2026-10-08; CI run 37817284441, 504 passed, 5 skipped, `root-rollups` included).

## Why wechart needs it

T765's e2e found it (tasks.md, T765). A folder was deleted in wechart while xcube missed the change, and xcube still held a cube and its data source in it. At the next start:
- wechart's tree was refused, `409 folder_in_use`;
- then its new folders' data sources ("Folder … is not in the folder tree");
- then its items snapshot ("It uses the data source …, which the model doesn't hold");
- and the 60 s reconcile failed the same way.

xcube's head gives no folder's parent, so wechart couldn't keep the old folder in its tree while it moved the items off ([commit]).

## `GET /v1/semantic/models/{model}/folders`

It returns the tree as xcube holds it ([answer]; [rt] `folderTree`, L3624-3650):

```json
{ "model": "dev", "revision": 42, "security": true, "permissionsVersion": 7, "hash": "…",
  "folders": [
    { "id": "fold", "parentId": "froot", "allowedGroups": ["g-sales"], "items": 1, "dataSources": 1 },
    { "id": "froot", "parentId": null, "allowedGroups": ["g-sales"], "items": 3, "dataSources": 1 }
  ] }
```

- `items` counts the current revision's items in the folder (0 for a model still holding a file set). `dataSources` counts its connections ([rt] L3632-3647).
- Either above 0 keeps the folder from going: it is "in use" ([answer]).
- `allowedGroups` is the folder's set as xcube holds it, empty where none ([rt] L3645).
- `hash` is what `PUT …/folders` answers for the same tree ([answer]).
- An unknown model is `404 unknown_model` ([answer]). In the code, a model with no permissions row answers none ([rt] L3627-3629).
- It takes the service credential, as every admin route does.

## The snapshot's new refusal

An items snapshot whose tree drops a folder holding a data source is now refused `409 folder_in_use`, as `PUT …/folders` refuses it, and nothing of it is taken. Before, it dropped the folder and left the data source orphaned ([answer]; [commit]).

## The catch-up, in xcube's order

Each step is valid on its own, so a catch-up cut short resumes from the start ([answer], "The catch-up, in order"):
1. `GET …/folders`.
2. `PUT …/folders` with wechart's tree, plus each folder xcube holds anything in (`items` or `dataSources` above 0), under its parent there.
   - Where a folder is in both trees, wechart's parent is used.
   - A kept folder's own parent may itself be one wechart deleted: the chain is kept up to a folder of wechart's.
3. `PUT …/connections/{name}` for wechart's data sources.
4. `PUT …/snapshot` with wechart's items and step 2's tree. The old folders' items go.
   - With wechart's own tree here, a folder still holding a data source is refused (`409 folder_in_use`).
5. `DELETE …/connections/{name}` for each data source wechart doesn't have. They are unused now.
6. `PUT …/folders` with wechart's tree. The old folders go.

**One limit:** step 2 can be refused, `reference_range` or `data_source_range`, when a folder was moved in a way that would strand a published item's reference or data source. That is no different from any of wechart's pushes ([answer]).

## Tested upstream ([answer] "Tested")

- `test/integration/connections.test.ts`, "a folder deleted while xcube missed it, still holding a cube and its data source, is caught up in one pass".
  - wechart's tree pushed as it is answers `409 folder_in_use` `["fold"]`.
  - The snapshot with wechart's own tree at step 4 is refused, and the one with step 2's tree lands.
  - Afterwards xcube's tree is wechart's, and the new cube answers from its new data source.
- CI run 37817284441, with Postgres, MySQL, Trino and Cube Store: 504 passed, 5 skipped.

## For wechart

- Pin compose's Cube and refresh worker, Helm's `cube.image` (the chart's values and docker-desktop's), `infra/xcube/fresh-start.sh` and `cube-image.test.ts` to this image, by digest, in place of `2e611eae61`.
- Compose's Cube and refresh worker are recreated to take it. The schema is unchanged, so no reset is needed.
- Catch up at start, and on the reconcile, when the tree is refused `folder_in_use`: T765 (AC-330).
