---
library: xcube-0406293add
packages: []
version: 'xcube v1.7.45-0406293add (ghcr.io/senthilkrajagopal/xcube:v1.7.45-0406293add@sha256:a8aca0337d19c367b646a2240bb4c9b7b0e1e679c858d21a3a63e7a5df7968fd)'
researched: 2026-09-27
sources:
  - https://github.com/senthilkrajagopal/cube/commit/0406293addf188daa10dc04fb761c216b7ed7a0e
  - https://github.com/senthilkrajagopal/cube/commit/0406293addf188daa10dc04fb761c216b7ed7a0e.diff
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/0406293addf188daa10dc04fb761c216b7ed7a0e
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/0406293addf188daa10dc04fb761c216b7ed7a0e/check-runs
  - https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36302796658/jobs
  - https://api.github.com/repos/senthilkrajagopal/cube/compare/e53cf2a8b8dd9479eec4b720cde3ee307a7dd5e9...0406293addf188daa10dc04fb761c216b7ed7a0e
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/e53cf2a8b8dd9479eec4b720cde3ee307a7dd5e9/xcube/src/names/publish.ts
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/1300482875?tag=v1.7.45-0406293add
  - https://www.postgresql.org/docs/current/sql-syntax-lexical.html
  - /Users/srajagopal/Work/bi/cube/.git/HEAD
  - /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube
  - /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/overlays/rollups.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/package.json
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-27-0330-extends-aliases.md
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-27-0300-extends-aliases.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-e53cf2a8b8.md
  - /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.test.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/used-by.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/used-by.test.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/changesets.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/snapshot.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/check.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/folders.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/server.ts
  - /Users/srajagopal/Work/wechart/packages/api/src/main.ts
  - /Users/srajagopal/Work/wechart/e2e/security/data-source-binding.spec.ts
  - /Users/srajagopal/Work/wechart/docker-compose.yml
  - /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
  - /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
  - /Users/srajagopal/Work/wechart/docs/deploy.md
  - /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
  - /Users/srajagopal/Work/wechart/docs/spec.md
  - /Users/srajagopal/Work/wechart/docs/tasks.md
---
# xcube v1.7.45-0406293add: a cube that `extends` another is aliased by the data source it inherits, and `GET …/items` gives that source and the parent (on Cube v1.7.45)

> **Status in wechart (2026-09-27): not pinned.** Gotcha 1 (folder views lose their generated `sql_alias`) was sent back to xcube (`to-xcube/2026-09-27-0430-folder-view-aliases.md`); wechart stays on `e53cf2a8b8` until an image fixes it. T459 was committed against `e53cf2a8b8` with its `null` fallback, which this doc finds redundant only at this image.

This doc is the sibling of [xe53] (`e53cf2a8b8`). It covers the one commit from `e53cf2a8b8` to `0406293add` ([cmp]). It checks xcube's account ([ans]) against wechart's ask ([req]), which came from [xe53]'s Gotchas 2 and 3 and Open questions 1 and 2. It then says what T459 (AC-157), AC-273 and the pin need, and corrects [xe53] where it no longer holds.

**Headline findings**

1. **All three asks are built, and every claim checks out against the source, with two gaps.**
   - Aliases are now assigned after every item of a publish is resolved, and they follow `extends` ([pub] L110-121, L143-171, L429-434).
   - A kept child of a rebound parent gets its new alias in the same publish. Only its resolved YAML changes; its authored YAML and bindings stay ([pub] L445-446).
   - A child always has an alias of its own ([pub] L131-141).
   - In `GET …/items`, a child's `dataSource` is now the source it inherits, and a new `extends` key gives its parent's full name ([rt] L2898-2909; [ovc] L18-35).
   - **Gap 1: the upgrade list is incomplete.** More cubes are due a new alias than xcube's list names (Upgrade).
   - **Gap 2: "Tested with inheritance switched off" was not run here** (UNVERIFIED).
2. **A new regression, found by reading, that xcube's account doesn't mention: folder views no longer get a generated `sql_alias`.**
   - At `e53cf2a8b8`, `finish` aliased every prefixed item, views included ([raw-e53] `finish`). At `0406293add`, only `assignAliases` sets an alias, and it filters to `kind === 'cube'` ([pub] L153). `finish` sets none ([pub] L178-195).
   - xcube's own docs still say otherwise: README L197-199 and the `finish` docblock ([pub] L173-174) say every folder item gets an alias.
   - **Effect on wechart.** A wechart folder view's full name is at least 36 characters ([w-folders] L8-14, L22-25). xcube's 63-character check on member aliases ([pub] L261-271) can now refuse a folder view with ordinary names (Gotcha 1).
   - This is **the main risk of pinning `0406293add`**.
3. **"The model's next publish" means any publish.**
   - `assignAliases` runs over every entry, kept or upserted, on every changeset, snapshot, dry run and overlay ([pub] L429-434; [rt] L3039, L1465).
   - In steady state, a child's alias moves only in a publish that re-resolves one of its ancestors onto another data source. Otherwise the computed alias equals the stored one.
   - After the upgrade, the model's first publish of any item re-aliases every due cube. Even an empty changeset makes a new revision then ([rt] L3042-3053).
4. **wechart's `used-by.ts` fallback is still correct but redundant at this image.**
   - Children now arrive with a string `dataSource`, and `null` means xcube could not resolve the chain in its own revision. wechart's lookup runs over the same item list and can't do better (API surface).
   - It can be simplified to "a string matches; `null` or absent counts as none". That also removes its dependence on wechart's YAML matching what xcube published.
5. **Nothing else is new.** The range adds no route, environment variable, migration, image-check step, Dockerfile change or workflow change ([cmp] file list).
6. **The T435 e2e needs no change** (`e2e/security/data-source-binding.spec.ts`).

## Summary

### Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube` ([head]).
  - `refs/heads/feat/xcube` and `refs/remotes/fork/feat/xcube` both hold `0406293addf188daa10dc04fb761c216b7ed7a0e` ([ref]; [fork-ref]).
  - Reflog L23 moves `e53cf2a8b8` → `0406293add` at 1790493625 −0700: "fix(xcube): a cube that extends another is aliased by the data source it inherits" ([reflog] L23).
- **The commit** ([a-0406]):
  - author and committer date 2026-09-27T07:20:25Z;
  - parent `e53cf2a8b8dd9479eec4b720cde3ee307a7dd5e9`;
  - +198 −50 over 9 files.
- **The range.** `e53cf2a8b8...0406293add` is "ahead by 1, behind by 0" ([cmp]):

| File | + / − | What |
| --- | --- | --- |
| `xcube/src/names/publish.ts` | +79 −26 | `aliasedDataSource` follows `extends`. New `generatedAlias` and `assignAliases`. `finish` no longer aliases. Kept cubes can be re-aliased |
| `xcube/src/overlays/connections.ts` | +20 | New `effectiveDataSource` |
| `xcube/src/overlays/rollups.ts` | +1 −1 | `parentOf` exported |
| `xcube/src/runtime/runtime.ts` | +19 −9 | `ItemRef.extends`. `refOf` and `refs` resolve through the revision's items. `itemsOf` and `overlayStatus` use them |
| `xcube/README.md` | +17 −8 | L493-500 (children and the upgrade); L827 (changeset `items`); L864-871 (`GET …/items`) |
| `xcube/package.json`, `package-lock.json` | +3 −3 | `1.7.45-11` → `1.7.45-12` ([pkg] L3) |
| `xcube/test/unit/names.test.ts` | +41 | "a cube that extends another is aliased by the data source it inherits…" (L635-674) |
| `xcube/test/integration/connections.test.ts` | +18 −3 | The twin in the AC-273 rebind test (L548, L554-557, L572-579) |

- **The working tree equals `0406293add` at every line cited.** Each hunk of [d-0406] lands on the working tree at the lines cited here. Nothing was run (no Bash).
- **CI.** Run 36302796658. Both jobs ran on `head_sha` `0406293add…` and succeeded ([chk]; [jobs]):
  - **`test`** ran 07:20:31–07:23:05Z.
    - "Run npm run typecheck" and "Test, with the live-database suites" succeeded.
    - That step sets `XCUBE_TEST_DATABASE_URL` ([wf] L81), so the `describeWithDatabase` test holding the twin ran.
  - **`image`** ran 07:23:08–07:25:22Z.
    - "Build" succeeded, as did the three image checks: "Boots as Cube does…", "Serves models from xcube's schema…" and "Each connection's driver takes its own fields…".
    - "Tags to publish", "Publish, for amd64 and arm64" and "Name what was published" succeeded.
  - Per-test output was not viewed.
- **The image.**
  - GHCR version 1300482875 carries `v1.7.45-0406293add` and the moving `v1.7.45-feat-xcube`. `e53cf2a8b8`'s version 1300415135 now carries only its own tag ([ghcr]).
  - The version is public, with digest `sha256:a8aca0337d19c367b646a2240bb4c9b7b0e1e679c858d21a3a63e7a5df7968fd`, the one the caller gave ([ghcr-0406]).
  - Platforms ([ghcr-0406]):
    - linux/amd64 `sha256:4e314be7dce8ae8503049193dbd4146566b804d2ee1ce4cac8042a3b3327f3ed`;
    - linux/arm64 `sha256:cab388e2038dc48b475633e3285595fceb9845219d49e216a645364c87a3ba86`;
    - "unknown/unknown" `sha256:f59f489cb5ef75471599b7a7b37835020c5b1286b278e83434e612357ad2e035` (what it is: UNVERIFIED).
  - **The tag is the commit.** The workflow tags `v$cube-${GITHUB_SHA::10}` ([wf] L143), for `linux/amd64,linux/arm64` ([wf] L160).
  - **Not pulled.** Without Bash, `docker manifest inspect` was not run. The digest is verified on GitHub's package page only.

### What the commit builds

1. **Aliases after resolution.**
   - Upserted items are resolved, bound and finished first ([pub] L412-427).
   - Then every item, kept or upserted, becomes an `Entry` ([pub] L101, L429-433), and `assignAliases(entries)` runs before the model-wide alias check ([pub] L434-435).
2. **The data source an alias names.**
   - `aliasedDataSource` reads a cube's own `data_source`. Failing that, it walks `extends` through the other entries by full name, guarding against loops ([pub] L110-121).
   - `default` counts as none ([pub] L116).
3. **The alias a cube without an authored one gets** (`generatedAlias`, [pub] L131-141):
   - **A root cube on `default`:** its own name if it `extends` another, else none (L134-136).
   - **Any other cube:** `aliasOf(fullName, dataSource)`, with the short-hash form when a rollup stem would exceed 25 (L137-140; `aliasOf` L49-55).
4. **Re-aliasing kept cubes.**
   - `assignAliases` changes a cube's `sql_alias` when the computed one differs from what its doc holds ([pub] L157-163).
   - A kept cube changed this way is marked resolved and returned in `realiased` ([pub] L164-167).
   - Its item is the kept item with only `resolvedYaml` re-dumped ([pub] L445-446). It is added to `changed` ([pub] L457).
   - It covers cubes only, and only those with no authored `sql_alias`/`sqlAlias` ([pub] L153).
5. **References.**
   - `refOf(item, byFullName)` gives `dataSource: effectiveDataSource(…)` on cubes, and `extends: parentOf(item)` on cubes that have one ([rt] L2898-2909).
   - `refs` builds `byFullName` from the whole item list it is given ([rt] L2879-2884). `itemsOf` uses `refs` ([rt] L3235). So do changeset, snapshot and dry-run answers ([rt] L3053, L3065, L3079, L3121), the overlay push ([rt] L1559) and the overlay status ([rt] L1578-1579, L1597-1600).

## Install

- **No npm dependency.** wechart uses xcube only through the Cube image's `cube.js` ([xe53] "Install").
- **The image, by digest:**
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-0406293add@sha256:a8aca0337d19c367b646a2240bb4c9b7b0e1e679c858d21a3a63e7a5df7968fd
  ```
- **No schema migration.** `store/*` is not in the range ([cmp]).
- **No new environment variable.** `runtime/settings.ts` is not in the range ([cmp]).
- **No new image-check step.** The workflow and `test/image/*` are not in the range. CI ran the same three checks as at `e53cf2a8b8` ([jobs]; [xe53] "Provenance").
- **Cube is unchanged.** The Dockerfile is not in the range ([cmp]), so it is still `FROM cubejs/cube:${CUBE_VERSION}`, `v1.7.45` ([xe53] "The image").

## Init / auth pattern

- **Unchanged.** `GET …/items` is still `app.get(\`${base}/items\`, auth, …)` answering `runtime.itemsOf(model)`, or `404 unknown_model` ([routes] L529-536). `routes.ts` is not in the range ([cmp]).

## API surface we will use

### `GET …/items`: the answer at `0406293add`

```
200 {
  model: string,
  revision: number,
  mode: 'items' | 'files',
  items: (
    | { kind: 'cube', folderId, name, fullName, bindings: { [shortName]: fullName },
        dataSource: string | null, extends?: string }
    | { kind: 'view', folderId, name, fullName, bindings: { [shortName]: fullName } }   // neither key
  )[]
}
404 { error: 'Unknown model "<m>"', code: 'unknown_model' }
```

Sources: [rt] L221-235 (`ItemRef`), L2898-2909 (`refOf`), L3225-3237 (`itemsOf`); [routes] L529-536; [readme] L861-871; [t-conn] L579.

- **`extends` is a new key.**
  - **Value:** the parent's full name, read from the cube's resolved YAML by `parentOf` ([rt] L2900, L2907; [roll] L33-40). xcube's rewrite always writes that line as the parent's full name ([rw] L340-344).
    - A root parent is its bare name. A folder parent is `f<id>__<short>`.
    - xcube's test expects `{ dataSource: 'fab__warehouse', extends: 'fab__where' }` for a child ([t-conn] L579).
  - **When it appears:** on a cube that has an `extends:` line, including one that also names its own `data_source`. It is absent, not `null`, on a cube that extends nothing ([rt] L2907).
  - **Never on views**, even though xcube parses `extends` on any item ([items] L228). `refOf` asks `parentOf` only when `item.kind === 'cube'` ([rt] L2900).
- **`dataSource` is now the source a cube queries,** from `effectiveDataSource(item, byFullName)` ([rt] L2906; [ovc] L18-35):
  - Its own bound source comes first (`boundDataSource`: the resolved `data_source`, or `'default'` when it has neither `data_source` nor `extends`: [ovc] L10-16).
  - Otherwise it is the parent's, walked through `parentOf` over the revision's items, however far up.
  - **`null` only** when the walk finds no own binding: a parent missing from the list, an `extends:` line `parentOf` can't parse, or a loop ([ovc] L23-34).
  - By reading, a stored revision can't hold a child whose parent is missing:
    - a publish refuses to remove an item a kept item is bound to ([pub] L392-410);
    - an `extends` that doesn't resolve is refused ([rw] L345-346).
  - So on a valid head `null` should not occur. UNVERIFIED by running.
- **Right after the upgrade, before any publish,** `/items` already gives children their inherited source. It is computed on each read from the stored YAML ([rt] L3230-3235), so it doesn't wait for re-aliasing.
- **Key order:** `kind, folderId, name, fullName, bindings, dataSource, extends` ([rt] L3235, L2901-2908).

### Other answers carrying `ItemRef`

- The changeset, items-snapshot and dry-run `items` gain `extends` and the inherited `dataSource` ([rt] L3053-3121; [readme] L824-829).
- **They also list kept cubes that were only re-aliased**, since `changed` includes them ([pub] L457; [rt] L3041).
- The overlay status's `upserts` now spread the whole ref, and so gain `extends` ([rt] L1599).
- **wechart reads none of these.** `applyChangeset` and `itemsSnapshot` parse only `generation`, `revision`, `itemsHash` and `created` ([w-client] `stored`). The dry-run answer's `items` is not parsed either ([w-client] `ItemsCheckAnswer`). wechart has no overlay client (Grep of `packages/api/src` for `/overlays`: none).

### What this means for wechart's client and `used-by.ts` (T459)

- **`client.ts`.** As read today (the file is being edited), `items()` keeps `kind` and, on cubes, `dataSource` when it is a string or `null`, and drops everything else ([w-client] `HeldItem` L120-135, `items()` from L325).
  - That parse **stays correct**.
  - The `HeldItem` docblock "null for a cube that `extends` another and takes its parent's" (L131) **no longer describes this image.** At `0406293add`, `null` means an unresolvable chain.
  - Parsing `extends` is optional (see below).
- **`used-by.ts`.**
  - `boundOf` returns a string `dataSource` at once ([w-usedby] L50-51). It falls back to `extendsOf` (wechart's own YAML, via `extendsIn`) plus the child's `bindings` only on `null` ([w-usedby] L52-57; [w-server] L556-578).
  - **At `0406293add` that stays correct and becomes redundant:**
    - A resolvable child now arrives with a string, so the fallback is never reached for it ([rt] L2906).
    - On `null`, xcube has already failed to find the parent among the revision's items. wechart's fallback looks the parent up in the same list (`byFullName` over `held`, [w-usedby] L48, L55-56), so it can't succeed where xcube didn't.
    - It can only differ when wechart's YAML names another parent than the one xcube published, as with a publish still in flight. Then it would find a different item, which is a wrong answer, not a better one.
  - **So it can be simplified:** a string is matched through `byConnection` as now, and `null` or absence counts as none.
    - `extendsOf`, `extendsIn`, and the model-file read in `usedBy` ([w-server] L556-572) then go.
    - This removes [xe53]'s caveat that the fallback "holds only while wechart's YAML is what xcube published".
  - **If T459 is committed against `e53cf2a8b8` first,** the fallback is needed there, since children are `null` on that image ([xe53] "Resolving `null`"). Keep it until the pin moves.
  - **Tests that encode the fallback** would be rewritten to the new contract: `used-by.test.ts` L66-90 ("…through its own YAML and bindings"), L92-101 (loops) and L103-111 (`extendsIn`). That is a behaviour change for the caller to decide, not a way to get to green.
  - If wechart wants the fallback kept but grounded in what xcube published, it could use `byFullName.get(item.extends)` in place of `extendsOf`. That helps only on this image, where it is not reached.
- **The T459 sketch** ([xe53] "Mapping `dataSource`") now covers children too: `typeof item.dataSource === 'string'` holds for them.

### When a child's alias moves, and what wechart's publish path triggers

- **In xcube.**
  - Every call of `publish()` computes every cube's alias:
    - changesets (`applyChangeset` → `publishItems`, [rt] L2973-3002, L3039), dry runs included (the same path with `check`);
    - items snapshots (`importItemsSnapshot`, `replaceAll`, [rt] L3010-3027);
    - overlays (`publishOverlay`, [rt] L1453-1475).
  - Folder-tree and connection puts don't call it (Grep of `runtime.ts` for `publishItems(`, `publishOverlay(` and `applyOverlay(`).
  - **A kept cube's alias changes only when its computed alias differs from the stored one** ([pub] L157).
    - In steady state, a child's computed alias depends only on the stored `data_source` of itself and its ancestors ([pub] L110-121).
    - Those change only when that ancestor is itself re-resolved, since kept items keep their resolved YAML ([pub] L440-444).
    - So **a child's alias moves in the publish that rebinds its parent or an ancestor, and in no other**, until the next such rebind.
    - **The upgrade is the exception** (next section).
- **In wechart.**
  - **A publish or a file delete** sends its changeset through `afterPublish` → `modelSync.publish` → `apply` → `POST …/changesets` ([w-mpub] L299-303, L440-445; [w-main] L138; [w-sync] L181-192).
    - The changeset upserts only files whose YAML changed ([w-cs] L29-32).
    - So a child is re-aliased by wechart publishing its parent's file with a change that rebinds it: for example, `data_source` edited after a nearer source was added, as T435's e2e does ([w-e2e-bind] L249-262).
  - **A whole send** (`once`: start, reconcile, or a publish without a changeset) replaces everything and re-resolves every item ([w-sync] L105-153; [pub] L63-64, L363).
    - It is sent only when wechart's items hash differs from xcube's head ([w-sync] L127-134). An upgrade doesn't change that hash, which covers authored YAML only ([pub] L470-475).
  - **The check's dry run** (`checkChangeset`, [w-check] L125-129) computes aliases but stores nothing.

### The upgrade (from `ed08180c37` or `e53cf2a8b8`)

- **At start: nothing.** Stored revisions are served as stored. `resolvedYaml` is written only by a publish ([xe53] "The upgrade"; `store/*` not in the range).
- **At the model's first publish on this image, whatever it is about,** every kept cube with no authored alias whose computed alias differs from its stored one is re-dumped and counted as changed ([pub] L153-167, L445-446, L457).
  - The new revision is stored even for an empty changeset, or one re-sending identical items. `sameAsHead` compares the content hash of the resolved files, which the re-dump changes ([rt] L3042-3043, L3052-3053, L3072-3080).
  - The changeset schema allows empty `upserts` and `deletes` ([routes] L125-134).
  - Modules holding re-dumped items get new versions and are compiled again ([rt] L3147-3152, L3191-3193).

| Kept cube, no authored alias | Stored `sql_alias` | Computed at `0406293add` | SQL and rollup table names change? |
| --- | --- | --- | --- |
| Folder cube bound to a folder's source (a folder's `default` included), last published before `e53cf2a8b8` | `x`+hash(fullName) | `x`+hash(`fullName@ds`) | Yes |
| Same, last published on `e53cf2a8b8` | `x`+hash(`fullName@ds`) | the same | No |
| Root cube bound to a root source other than `default`, last published before `e53cf2a8b8` | none | `<name>_<4>` or `x`+hash(`name@ds`) | Yes |
| Cube in a model with no connections whose written `data_source` isn't `default`, last published before `e53cf2a8b8` | as above by folder | aliased by that name | Yes |
| Folder child whose inherited source isn't `default` | `x`+hash(fullName) | `x`+hash(`fullName@ds`) | Yes |
| Root child whose inherited source isn't `default` | none, so Cube gave it the parent's through the prototype ([xe53] Gotcha 3) | `aliasOf(name, ds)` | Yes |
| Root child of a root parent with an authored alias, on `default` | none, so the parent's | its own name | Yes |
| Root child of an unaliased root parent on `default` | none | its own name | **No, by reading.** Cube's `aliasName` swaps in `sqlAlias` for the cube part, which here is the same text ([c-bq] L4229-4247, L4393-4396; `cubeAlias` L3759-3763). It is still re-dumped, counted as changed and recompiled |
| Folder cube or child on `default` (inherited or not) | `x`+hash(fullName) | the same | No |
| Root cube on `default`, not a child | none | none | No |
| Views | as stored | not recomputed ([pub] L153) | No, until re-resolved (then Gotcha 1) |

Sources: [pub] L49-55, L110-141; [t-names] L617-674.

- **"Its rollups rebuild once then"** holds for the rows marked "Yes". Their pre-aggregation tables are named by the cube alias ([c-bq] L4393-4396).
  - They are built by the refresh worker or a Jobs build.
  - Compose's API instance "builds none for queries — a query a rollup would serve is refused until this has built it" ([w-compose] L196-201).
  - In wechart, **all due cubes of a model move at once, at the next publish of any file in that model** ([w-mpub] L440-445).
- **Old tables stay behind.** Whether Cube drops unused logical tables is still UNVERIFIED ([xe53] Gotcha 8).

## Gotchas

1. **Folder views lose their generated `sql_alias` (by reading; a regression; not in xcube's account).**
   - **What changed.**
     - At `e53cf2a8b8`, `finish` set `sql_alias = aliasOf(fullName)` on every prefixed item, views included: `if ((prefixed || dataSource !== undefined) && doc.sql_alias === undefined …)` ([raw-e53] `finish`).
     - At `0406293add`, `finish` sets no alias ([pub] L178-195). `assignAliases` handles cubes only ([pub] L153). No other code writes one (Grep of `xcube/src` for `sql_alias`).
     - README L197-199 still says a folder item gets "a `sql_alias` (its full name, or a stable hash when that is longer than 20 characters)". The `finish` docblock still says "its title and alias when prefixed" ([pub] L173-174). Cube's schema accepts `sqlAlias` on views as on cubes ([c-val] L1168-1178).
   - **Which views it reaches.**
     - A folder view is affected once it is upserted, or on any whole-model send, which re-resolves everything ([pub] L63-64, L363).
     - Kept views keep their stored alias, since they are neither re-aliased nor re-dumped ([pub] L153, L440-444).
   - **The effect.** The model-wide check now measures a folder view's members against its full name ([pub] L226, L261-271).
     - A wechart folder id is `f` plus 32 hex digits ([w-folders] L12-13, L22-25), so a view's full name is 35 + its short name.
     - A view's included member `m` is refused (`422`, "Member m's SQL alias would be longer than 63 characters; shorten the name") when `short.length + m.length > 26`. A time dimension declared on the view itself is refused when that sum is over 18 ([pub] L28-29, L261-271).
     - Examples: `sales_overview` including `total_revenue` (14 + 13) was accepted at `e53cf2a8b8` (alias 8 characters) and is refused now.
     - A whole-model send with one such view is refused entirely. wechart then doesn't resend the same content for 10 minutes ([w-sync] L154-160).
     - Views with `includes: "*"` list no member names for the check ([pub] L198-211), so their long aliases reach Cube. Postgres truncates identifiers to 63 bytes ([pg-ident]). What Cube then answers is UNVERIFIED.
   - **Why CI didn't catch it.** xcube's test uses the folder `fsales`. Its full name `fsales__overview` is 16 characters, where `aliasOf` returns the full name itself, so the result is the same either way ([t-names] L528-538).
   - **Not observable in wechart's suites today.** No e2e declares a view (Grep of `e2e` for `views:`: none). The seed's views are root views (`infra/cube/model/views/`), which never had an alias ([xe53] alias table).
2. **Children now move with their parent's rebind, in the same publish** ([pub] L143-171; [t-names] L661-669; [t-conn] L572-575).
   - This resolves [xe53] Gotcha 2. The rebind changes the child's SQL, so neither its result-cache key nor its rollup tables carry over from the old source.
   - xcube's integration test compares `/v1/sql` text across the rebind. That makes the check independent of the cache mode its `ask` names ([xe53] Gotcha 7 still applies to `ask`).
3. **Every child has its own alias** ([pub] L131-141; [t-names] L653-659). This resolves [xe53] Gotcha 3.
   - A root child of an aliased root parent no longer shares the parent's member aliases or inherited rollup table names.
4. **Re-aliasing can touch pre-aggregation aliases (xcube only, not wechart).**
   - A re-aliased kept entry is marked resolved ([pub] L166). So `checkAliases` may assign it a generated pre-aggregation alias ([pub] L236-243).
   - `generatedAlias` then measures stems with the stored `p…` alias, not the name ([pub] L139). For a folder cube whose full name plus `_<4>` fits in 20 characters, a kept cube can flip between the plain and hashed alias once.
   - wechart folder full names are at least 36 characters, where both forms are the same `x`+hash ([pub] L54, L140), and root cubes get no generated pre-aggregation alias ([pub] L236). So this is not reachable from wechart. By reading.
5. **Overlay previews before the first publish on this image.**
   - An overlay publish re-aliases due kept cubes too, and they count as changed there ([rt] L1424-1437).
   - So their rollups are stripped in that preview, which then reads the source ([roll] L42-63; [rt] L1437-1440).
   - wechart has no overlay client yet (Grep).
6. **Rolling upgrades (Helm runs `cube.replicas` 2, [w-deploy] L12).**
   - An `e53cf2a8b8` pod never re-aliases kept children. A child it re-resolves gets `aliasOf(fullName)` again.
   - The next publish by a `0406293add` pod re-aliases it, so each flip is another cache miss and rollup rebuild. By reading ([raw-e53] `finish`; [pub] L153-167).
7. **The first publish after the upgrade is larger than its changeset.**
   - It stores a new revision even for identical items ([rt] L3042-3053).
   - It recompiles every module holding a re-dumped item ([rt] L3191-3193).
   - It starts the rollup rebuild of every due cube at once (Upgrade).
8. **`/items` reads the head's stored YAML on every call.** A child's `dataSource` is right before any re-aliasing ([rt] L3230-3235; [ovc] L23-35).
9. **Still standing from [xe53]:** authored aliases opt out (Gotcha 4); in-place connection changes keep aliases (Gotcha 5); short root names get a 20-bit hash (Gotcha 9); `/items` lists the head only (Gotcha 12).
10. **Stale comment in xcube.** `itemsOf`'s docblock still says "each cube's data source as bound (`null`: its parent's)" ([rt] L3221-3224). The code is `effectiveDataSource` ([rt] L2906).

### The T435 e2e (`e2e/security/data-source-binding.spec.ts`)

**Nothing in it has to change.** By reading:
- **L187-208:** `<RUN>_child` in /A/B/C extends /A/B's `<RUN>_where`. At publish it is aliased by the inherited `f<A>__warehouse` ([pub] L110-121) and still reads `postgres`.
- **L245-263:** the publish of `<RUN>_other` (L252) runs `assignAliases` over the model.
  - The suite's own cubes were aliased on this image, so none are due ([pub] L157).
  - Republishing `<RUN>_where` (L256-259) rebinds it to `f<B>__warehouse`. `<RUN>_child` is re-aliased in the same publish. Both read `template1` (L260-262).
  - Its bindings are unchanged ([pub] L445-446), so "never rebound until published again" (the header, L9-13) stays true of bindings.
- **L265-282 and L284-348:** alias changes (`f<A>__default` → `f<B>__default` for `<RUN>_plain`) don't touch any assertion.
- **The fresh filter** in `readsFrom` (L123-141) is no longer needed for these reads to pass: parent and child both change SQL on the rebind. It stays harmless.
- Whether to add an identical-query read that shows AC-273's cached path is the user's call. See [xe53] Open question 4, now answerable in xcube's favour by its twin test ([t-conn] L572-575).
- If the compose xcube database still holds `e2e-security` cubes aliased by an earlier image, the first publish here re-aliases them. No assertion reads them.

## Alternatives considered

Not asked.

## Open questions / unverified

1. **For xcube (through the Cube-expert agent): restore folder views' generated `sql_alias`** (Gotcha 1).
   - Give a prefixed view `aliasOf(fullName)` as at `e53cf2a8b8` ([raw-e53] `finish`), as README L197-199 still says.
   - Add a test with a folder id as long as wechart's (33 characters) so the plain and hashed forms differ.
   - Until then, pinning `0406293add` risks refusing wechart folder views, whole-model sends included. Pinning is the user's call.
2. **For xcube:** the upgrade list in [ans] L37-39 misses some due cubes (Upgrade table):
   - root cubes on a root source other than `default`;
   - children whose inherited source is a root one;
   - cubes in models with no connections;
   - root children of unaliased parents, which are re-dumped with no SQL change.
   Confirm the table or correct it.
3. **For the user: pin `0406293add`, or stay on `e53cf2a8b8` for T459,** given item 1. The facts:
   - `e53cf2a8b8` has [xe53] Gotchas 2 and 3 (children keep their old alias and cache; root children share a parent's alias).
   - `0406293add` fixes both, and adds Gotcha 1.
4. **For the user (T459):** simplify `used-by.ts` at this pin (API surface), or keep the fallback for an image mix.
5. **UNVERIFIED:**
   - the image pulled or inspected by digest (no Bash), and what the "unknown/unknown" manifest is;
   - per-test CI output;
   - [ans] L12, xcube's reproduction at `e53cf2a8b8` ("kept the same SQL … answered from the old database"). It is consistent with [xe53] Gotcha 2 by reading, but was not run here;
   - [ans] L17, "With inheritance switched off, it doesn't" (not run);
   - Gotcha 1 end to end, including what Cube answers for a view alias Postgres truncates;
   - the checkout's `BaseQuery.js` (`aliasName`, `preAggregationTableName`, `cubeAlias`) against the v1.7.45 tag. The raw fetch of the tag's file was truncated again. The image runs `cubejs/cube:v1.7.45`, not the checkout ([xe53] "The image");
   - whether Cube drops orphaned rollup tables ([xe53] Gotcha 8).

### Input claims checked ([ans])

| # | Claim (line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Refs: `feat/xcube 0406293add`; `aliasedDataSource`, `generatedAlias`, `assignAliases`; `effectiveDataSource`; `refOf`; the README sections; the two test titles (L4) | Verified | [ref]; [pub] L110, L131, L149; [ovc] L23; [rt] L2899; [readme] L472, L861; [t-names] L635; [t-conn] L536 |
| 2 | Image `…-0406293add@sha256:a8aca033…`, amd64 and arm64 (L8) | Verified | [ghcr-0406] (plus "unknown/unknown"); [jobs] |
| 3 | A kept child kept its SQL across the parent's rebind and was answered from the old database (L12) | UNVERIFIED (xcube's run) | Consistent with [xe53] Gotcha 2 by reading; the commit message says "reproduced" ([a-0406]) |
| 4 | Aliases worked out after every item is resolved, naming the source a cube queries, inherited however far up (L15) | Verified | [pub] L110-121, L412-434 |
| 5 | A parent's rebind reaches each child not published with it in the same publish, its alias only, bindings as published (L16) | Verified, with one nuance | [pub] L143-171, L445-446; [t-names] L661-669. `checkAliases` may also generate a pre-aggregation alias on it (Gotcha 4; not reachable from wechart) |
| 6 | The child counts as changed, in `items` and module compiles (L16) | Verified | [pub] L457; [rt] L3041, L3065, L3121, L3151, L3191-3193 |
| 7 | Tested by the child's SQL, which now changes across the rebind; with inheritance off it doesn't (L17) | First half verified; second UNVERIFIED | [t-conn] L554-557, L572-575; CI `test` success ([jobs]) |
| 8 | A child always has its own alias: by inherited source when not `default`, else at the root its own name; never the parent's (L21-23) | Verified | [pub] L131-141. A folder child on `default` gets `aliasOf(fullName)`, also its own |
| 9 | Tested with a root parent on its own source and one with an authored alias (L25) | Verified | [t-names] L646-659 |
| 10 | `/items`: `dataSource` is what a cube queries (a child's is inherited); `extends` gives the parent's full name (L29) | Verified | [rt] L2898-2909, L3235; [ovc] L18-35; [rw] L340-344; [t-conn] L579 |
| 11 | `null` only when the chain can't be resolved, for example a missing parent (L30) | Verified | [ovc] L23-34. Also a loop or an unparsable line. By reading it can't occur on a valid head ([pub] L392-410; [rw] L345-346) |
| 12 | The same in changeset, dry-run and overlay answers (L31) | Verified | [rt] L1559, L1579, L1599, L3053-3121. Snapshot imports too |
| 13 | T459's `null` handling still works; it no longer comes up for children (L32) | Verified | [w-usedby] L50-58; [rt] L2906. It is also redundant (API surface) |
| 14 | A due cube gets its alias at the model's next publish, whatever it is about; its rollups rebuild once then (L36) | Verified, with precision | [pub] L153-167; [rt] L3042-3053. Rebuilds only where the alias text changes (Upgrade table) |
| 15 | The due cubes are children on a folder's source, root children of aliased parents, and cubes bound to a folder's source not republished since `e53cf2a8b8` (L37-39) | Incomplete | Also the rows listed in Open question 2 (Upgrade table) |
| — | (Not claimed) Anything about views | New finding | Gotcha 1 |

### Corrections

**Against [xe53] (`docs/research/xcube-e53cf2a8b8.md`):**

| Statement | Now | Source |
| --- | --- | --- |
| Headline 1, and Open question 6: "The image to pin is `e53cf2a8b8`" | `0406293add` is `e53cf2a8b8` plus one commit. Pinning it is the user's call, given Gotcha 1 | [cmp]; [a-0406] |
| Headline 2 and L207: views have no `dataSource`; cubes have `dataSource: string \| null`; nothing else | Cubes also have `extends?: string` (the parent's full name). Views still have neither key | [rt] L2898-2909 |
| L221: "`dataSource` is `boundDataSource(item)` … `null` if the cube has an `extends:` line" | It is `effectiveDataSource(item, byFullName)`: own binding, else inherited. `null` only for an unresolvable chain | [rt] L2906; [ovc] L18-35 |
| L229: the `null` row, "The cube `extends` another and names no `data_source` of its own" | Such a cube gets its parent's source (walked however far up) | [ovc] L23-35; [t-conn] L579 |
| L260-272: "Resolving `null`": not from `/items` alone | From `/items` alone, through `dataSource` (or `extends`). The fallback is redundant at this image | API surface |
| L255-258 and L351: the client parses `kind` and `dataSource` (`null` = child) | `null` = unresolvable; `extends` is available | [rt] L221-235 |
| L276: "`finish` sets `sql_alias` when the item is in a folder, or when it is a cube with an aliased data source" | `assignAliases` sets it, after every item is resolved, **for cubes only**. `finish` sets none | [pub] L143-171, L178-195 |
| L289: "A cube that `extends` another and names no data source: Folder `aliasOf(fullName)`; Root none; changes with the binding: No" | Folder: `aliasOf(fullName, inherited)`. Root: `aliasOf(name, inherited)`, or its own name on `default`. Changes with the parent's binding, in the same publish: **Yes** | [pub] L110-141; [t-names] L653-669 |
| L290: "Views: as before (`aliasOf(fullName)` in folders)" | Folder views re-resolved at this image get **no** generated alias | [pub] L153, L178-195; Gotcha 1 |
| Gotcha 1 (L360): "An alias moves only when its cube is resolved again" | Also when a kept cube's computed alias differs from its stored one, at any publish of the model | [pub] L153-167 |
| Gotcha 2 (L363-367) | Fixed: a child moves with its parent's rebind, in the same publish | [pub] L143-171; [t-conn] L572-575 |
| Gotcha 3 (L368-371) | Fixed: every child has its own alias | [pub] L131-141; [t-names] L653-659 |
| Gotcha 10 (L384) | Now also children flipping between old and new pods | Gotcha 6 |
| Gotcha 11 (L385) | Due kept cubes also count as changed in overlay previews until the model's first publish on this image | [rt] L1424-1437 |
| Headline 6 and L332-338: "at its next publish"; "a cube's alias moves when its YAML next changes" | At the model's next publish of any item, for every due cube at once, including children and root children | [pub] L153-167; Upgrade |
| L339-341: "An identical re-upsert makes a new revision once" | Any changeset, even an empty one, makes a new revision while a kept cube is due | [rt] L3042-3053; [routes] L125-134 |
| Headline 8 / L131-132: `overlays/*` not in the range | `overlays/connections.ts` and `overlays/rollups.ts` are in this range. There is still no route, environment variable, migration or image check | [cmp] |
| L126: `package.json` `1.7.45-11` | `1.7.45-12` | [pkg] L3 |
| Open questions 1 and 2 | Answered by xcube and verified (Input claims 4-13) | [ans] |
| Open question 4: a child's cached answer after its parent's rebind | By reading and by xcube's test, the child's SQL changes with the rebind, so no cached answer carries over | [t-conn] L572-575 |
| Input claim 12 ("Contradicted by reading") | The README text it rested on is replaced (L493-497), and the behaviour is built | [readme] L493-500 |
| L347 and L428: pin sites (`cube-image.test.ts` L28, L58) | In today's tree `cube-image.test.ts` pins at L33 and allows the tag at L63 | [w-img-test] |

**Against [x3a] (`docs/research/xcube-slice-3a.md`):**

| Statement | Now | Source |
| --- | --- | --- |
| L69: "Folder items get … a short `sql_alias`" | Folder cubes do. Folder views re-resolved at `0406293add` get none | Gotcha 1 |
| L312: "`sql_alias` is set unless authored: the full name if ≤ 20, else `x` + hash" | For cubes, `aliasOf(fullName, inherited or own data source)`. For views, not at all from `0406293add` | [pub] L49-55, L131-141, L153 |

### What wechart must change to pin it

| Item | Today (working tree, T459 uncommitted) | At `0406293add` | Sources |
| --- | --- | --- | --- |
| **Image pin** (the user pins) | `…-e53cf2a8b8@sha256:58e53294…` in compose L168 and L203, `values.yaml` L66, `docker-desktop.yaml` L20, `cube-image.test.ts` L33 (`ed08180c37` is only history text now) | `ghcr.io/senthilkrajagopal/xcube:v1.7.45-0406293add@sha256:a8aca0337d19c367b646a2240bb4c9b7b0e1e679c858d21a3a63e7a5df7968fd` at all five | [w-compose]; [w-helm-values]; [w-helm-dd]; [w-img-test]; Grep for `ed08180c37` and `e53cf2a8b8` |
| **`cube-image.test.ts`** | L63 allows only `e53cf2a8b8@`, `83cb9f0888`, `feat-xcube`. Docblock L27-30 | L63: `e53cf2a8b8@` → `0406293add@`. The docblock gains the new pin (children aliased by the source they inherit; `/items`' `extends`) | [w-img-test] L27-33, L54, L63 |
| **`docs/deploy.md`** | L12 table (`58e53294…`), L39 history and upgrade, L44 `docker pull` | New tag and digest at L12 and L44. L39: nothing rebuilds at start; at a model's next publish of any file, each cube due a new alias gets it and its rollups rebuild once (Upgrade table) | [w-deploy] L12, L39, L44 |
| **Pin comments** | compose L156-163, `values.yaml` L59-63, `docker-desktop.yaml` L13-19 | Prose only | Grep |
| **`xcube/client.ts`** | `HeldItem.dataSource` docblock says `null` = child (L131) | `null` = chain unresolvable. Optionally parse `extends` (string, cubes only) | [w-client] L120-135; [rt] L221-235 |
| **`xcube/used-by.ts`** (and `server.ts` `usedBy`) | Resolves `null` through wechart's YAML (`extendsIn`) and `bindings` | Correct but redundant; can be simplified (API surface) | [w-usedby] L50-58, L77-91; [w-server] L556-578 |
| **`client.test.ts`** L357-362 docblock | "`null` for one that `extends` another" | Reword. `null` stays a legal value, so the fixture at L385 still holds | [w-client-t] L357-397 |
| **Stub xcube** (`fake.ts`) | `/items` sends no `dataSource` or `extends` | No change needed. Optional, to mirror the image | [w-fake] L226-247 |
| **`e2e/security/data-source-binding.spec.ts`** | — | No change needed | The T435 e2e section |
| **Folder views** | No wechart check of alias lengths (Grep for `63`) | None to add in wechart. Ask xcube first (Open question 1) | Gotcha 1 |
| **Environment, migration, image checks** | — | None | [cmp] |

[head]: /Users/srajagopal/Work/bi/cube/.git/HEAD
[ref]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (0406293addf188daa10dc04fb761c216b7ed7a0e)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[a-0406]: https://api.github.com/repos/senthilkrajagopal/cube/commits/0406293addf188daa10dc04fb761c216b7ed7a0e
[d-0406]: https://github.com/senthilkrajagopal/cube/commit/0406293addf188daa10dc04fb761c216b7ed7a0e.diff
[cmp]: https://api.github.com/repos/senthilkrajagopal/cube/compare/e53cf2a8b8dd9479eec4b720cde3ee307a7dd5e9...0406293addf188daa10dc04fb761c216b7ed7a0e
[chk]: https://api.github.com/repos/senthilkrajagopal/cube/commits/0406293addf188daa10dc04fb761c216b7ed7a0e/check-runs (run 36302796658)
[jobs]: https://api.github.com/repos/senthilkrajagopal/cube/actions/runs/36302796658/jobs
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
[ghcr-0406]: https://github.com/users/senthilkrajagopal/packages/container/xcube/1300482875?tag=v1.7.45-0406293add
[raw-e53]: https://raw.githubusercontent.com/senthilkrajagopal/cube/e53cf2a8b8dd9479eec4b720cde3ee307a7dd5e9/xcube/src/names/publish.ts (`finish`, L136-166 at that commit)
[pg-ident]: https://www.postgresql.org/docs/current/sql-syntax-lexical.html ("The system uses no more than NAMEDATALEN-1 bytes of an identifier … the maximum identifier length is 63 bytes")
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
[rw]: /Users/srajagopal/Work/bi/cube/xcube/src/names/rewrite.ts
[ovc]: /Users/srajagopal/Work/bi/cube/xcube/src/overlays/connections.ts
[roll]: /Users/srajagopal/Work/bi/cube/xcube/src/overlays/rollups.ts
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (not in the range)
[readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md
[pkg]: /Users/srajagopal/Work/bi/cube/xcube/package.json
[wf]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[t-names]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
[t-conn]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/connections.test.ts
[c-bq]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js (checkout; not confirmed at the v1.7.45 tag)
[c-val]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts (checkout)
[ans]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-27-0330-extends-aliases.md
[req]: /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-27-0300-extends-aliases.md
[xe53]: /Users/srajagopal/Work/wechart/docs/research/xcube-e53cf2a8b8.md
[x3a]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
[w-client]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.ts (being edited; lines as read 2026-09-27)
[w-client-t]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/client.test.ts
[w-usedby]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/used-by.ts
[w-cs]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/changesets.ts
[w-sync]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/snapshot.ts
[w-check]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/check.ts
[w-folders]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/folders.ts
[w-fake]: /Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts
[w-mpub]: /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
[w-server]: /Users/srajagopal/Work/wechart/packages/api/src/server.ts
[w-main]: /Users/srajagopal/Work/wechart/packages/api/src/main.ts
[w-e2e-bind]: /Users/srajagopal/Work/wechart/e2e/security/data-source-binding.spec.ts
[w-compose]: /Users/srajagopal/Work/wechart/docker-compose.yml
[w-helm-values]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
[w-helm-dd]: /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
[w-img-test]: /Users/srajagopal/Work/wechart/packages/api/src/deploy/cube-image.test.ts
[w-deploy]: /Users/srajagopal/Work/wechart/docs/deploy.md
