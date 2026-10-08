---
library: xcube-2e611eae61
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 2e611eae61; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-2e611eae61@sha256:61c095d3763c401c5530a84ee8531335170fce991ad27adacbcd88f242307312 (amd64, arm64)'
researched: 2026-10-08
sources:
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-08-1430-root-rollup-names.md
  - /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-10-08-1200-root-rollup-names-r38.md
  - /Users/srajagopal/Work/bi/cube (git show 2e611eae61, its commit message and diff)
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts (at 2e611eae61)
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts (at 2e611eae61)
  - /Users/srajagopal/Work/bi/cube/xcube/README.md (at 2e611eae61, "Folders and names")
  - /Users/srajagopal/Work/bi/cube/xcube/package.json (at 2e611eae61)
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/root-rollups.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
  - docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-2e611eae61 (run 2026-10-08)
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-08-1500-module-test-at-2e611eae61.md
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/modules.test.ts (at 2e611eae61, read 2026-10-08)
  - docs/research/xcube-256d632371.md ("Aliases and rollup tables (1.2)", corrected here)
---

# xcube 2e611eae61: an item keeps its own rollup table names again (R38 over R71's 1.2)

This is T740's research doc. It covers xcube's fix for the rename T738 found: on 256d632371, `e2e/items-switch.spec.ts` (T430, AC-336) planned the root cube `monthly_orders`'s rollup as `xx3us3fz_by_status_month`. A rebuild after the move to items mode breaks AC-336. Each claim is checked against the fork at that commit.

**Short names for the sources:**
- **[answer]** `~/Work/xcube-exchange/to-wechart/2026-10-08-1430-root-rollup-names.md`.
- **[pub]** `xcube/src/names/publish.ts` at 2e611eae61.
- **[mig]** `xcube/src/store/migrations.ts` at 2e611eae61.
- **[readme]** `xcube/README.md` at 2e611eae61.
- **[commit]** `git show 2e611eae61`.

## The image

- `ghcr.io/senthilkrajagopal/xcube:v1.7.45-2e611eae61`, index digest `sha256:61c095d3763c401c5530a84ee8531335170fce991ad27adacbcd88f242307312`. It has two manifests, `linux/amd64` and `linux/arm64` (`docker buildx imagetools inspect`, 2026-10-08) ([answer]).
- The package version is `1.7.45-33` ([commit] `xcube/package.json`).
- **No migration and no reset.** The schema is still 14: `SCHEMA_VERSION` is the last of `MIGRATIONS`, version 14, `minReader` 14 ([mig] L362-387; [answer] "It needs no new reset"). An install on 256d632371's schema is upgraded by changing the image alone.
- The only source change is `src/names/publish.ts` ([commit] stat: `publish.ts`, `README.md`, the tests, CI and the package version).

## What changed: the 63-byte check counts the names Cube really builds ([pub]; [readme] "Folders and names")

- **Before (256d632371):** every pre-aggregation's stem `<cubeAlias>_<preAggregation>` was held to `MAX_TABLE_STEM`, 25 characters, root items included. A longer one gave the cube an `x<hash7>` alias ([pub] diff of `tooLong`, `checkAliases`). `monthly_orders_by_status_month` is 30 characters, so it was hashed.
- **Now:** `longestName(cubeAlias, paAlias, pa)` measures each name Cube builds and compares it with Postgres's 63 (`MAX_IDENTIFIER`):
  - the table's name, and each index's (`<stem>_<index>`);
  - the partition's date: 8 characters, 10 by the hour, 12 by the minute (`partitionSuffix`);
  - Cube's `_<content>_<structure>_<built>` suffix, 26 characters (`VERSION_SUFFIX`).
- **It counts only a pre-aggregation built in the source database** (`inSource`): one saying `external: false`, an `original_sql` one, or any `rollup`/`rollupJoin` when Cube runs with `CUBEJS_EXTERNAL_DEFAULT=false`. A `rollupLambda` has no table, and a rollup in Cube Store, Cube's default, counts 0 ([pub] `inSource`, `longestName`).
- **Member aliases** (`<alias>__<member>`, plus 8 for a time dimension) are still held to 63 ([pub] `tooLong`).
- **So an item keeps its own name in SQL and in rollup table names unless a check fails** ([readme]: "Otherwise an item keeps its own name in SQL and in rollup table names (wechart's R38): a file-set model switched to items rebuilds nothing"). Where one fails, the cube gets `x<hash7>`, then the pre-aggregation `p<hash6>` if it has no indexes, as before ([pub] `checkAliases`).
- **This holds in every folder**, not only the root. A folder item whose rollup 256d632371 hashed now keeps its own names ([answer] §1).
- **Unchanged:**
  - a cube on a non-default data source gets an alias naming it (e53cf2a8b8);
  - a moved connection's cubes are served under an identity alias (bc18f82c01, sized by `MAX_TABLE_STEM`, which stays 25 for that alone);
  - a name with capitals gets its lower-case form;
  - the grammar, `name_in_use`, `data_source_range` and `reference_range` ([answer] §2; [pub] doc comment of `MAX_TABLE_STEM`).

## The refusal a rollup can still hit ([answer] §3; [pub] `checkAliases`)

- Only a pre-aggregation built in the source database can hit it, and only one with indexes, which can't take a `p<hash6>` alias, since Cube names its indexes after its alias.
- Kind `alias` in `422 invalid_items`: `Pre-aggregation <pa>'s rollup table name would be too long: shorten its name to at most <n> characters`, where `<n>` is 63 − 26 − the partition's date − the cube alias − 1 − the longest `_<index>`.
- The seed's `monthly_orders.by_status_month` with `external: false` would be refused, at most 10 ([answer] §3).
- **wechart's seed as it is** keeps its rollup in Cube Store (no `external`, and compose's Cube sets no `CUBEJS_EXTERNAL_DEFAULT`), so it is never refused for its names ([answer] §3).

## Tested upstream ([answer] "Tested")

- `test/integration/root-rollups.test.ts`, against Postgres and a Cube Store 1.7.45: the seed's `monthly_orders` published as a file set and built, then switched to items, plans the same table names and SQL. `/v1/load` is answered from the pre-switch table with `lastUpdatedAt` unchanged. Against 256d632371's rule, the same test plans `xx3us3fz_by_status_month`.
- `test/unit/names.test.ts`: a rollup keeps its names in Cube Store at any length; one built in the source is held to 63.
- Their CI (run 37790993205): 503 passed, 5 skipped.

## AC-321's module test

This is the evidence for AC-321's "a module the change doesn't affect is recompiled", which no wechart test can show (`xcube-slice-3b.md`, "Modules"; tasks.md, T451's verification note).

- **The test:** `xcube/test/integration/modules.test.ts`, "adding a cube compiles only its module". It upserts a fourth cube through `POST …/changesets`, then asserts `{ modules: 3, compiledModules: 1 }` on the serve log (line 231 at 2e611eae61, read in the fork). Slice 3b's doc called it "compiles 1 of 3 modules", which is what it asserts.
- **It passes at the pinned image:** in CI run 37790993205, the run that published `v1.7.45-2e611eae61` (`PASS test/integration/modules.test.ts`; the log names suites, not single tests), and alone with `--verbose`, 6 of 6 in the suite ([module answer], `to-wechart/2026-10-08-1500-module-test-at-2e611eae61.md`).

## AC-320's gate test

This is the evidence for AC-320's "a permission change recompiles a module", which no wechart test can read: compose's xcube answers `/v1/meta` with no `compilerId` (tasks.md, T764).

- **The test:** `xcube/test/integration/security.test.ts`, "a permission change applies at once on every compiled module, with no compile". It notes Cube's compiler cache keys, narrows a folder's allowed groups through `PUT …/folders`, checks the group is refused at once, puts them back, and checks the cache keys are the same as before (line 314 at 2e611eae61, read in the fork).
- **It passes at the pinned image:** in CI run 37790993205, which published `v1.7.45-2e611eae61`, and alone, 14 of 14 in its suite (xcube's answer, relayed by the coordinator on 2026-10-08).

## Corrections to earlier docs

- `xcube-256d632371.md`, "Aliases and rollup tables (1.2)": "a name whose rollup table stem (`<alias>_<pre-aggregation>`, at most 25) … would be too long: `x<hash7>`" holds no longer. From 2e611eae61, only names built in the source database count, measured with their real suffixes against 63, and a rollup in Cube Store is never hashed for its length. The table row there for "a name whose rollup stem … would be too long" is corrected by this doc.

## For wechart

- Pin compose's Cube and refresh worker, Helm's `cube.image` (chart and docker-desktop values), `infra/xcube/fresh-start.sh` and `cube-image.test.ts` to this image by digest.
- Compose's Cube and refresh worker are recreated to take it. The schema is unchanged, so no reset is needed.
- Re-run `items-switch.spec.ts` (T430, AC-336): its plan after the move should equal the plan before, with no rebuild.
