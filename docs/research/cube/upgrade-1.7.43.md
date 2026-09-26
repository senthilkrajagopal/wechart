---
library: Cube (cubejs/cube, cubejs/cubestore)
packages: []
version: 1.7.43
researched: 2026-09-24
sources:
  - https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.43
  - https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.44
  - https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.45
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
  - https://api.github.com/repos/cube-js/cube/compare/v1.7.42...v1.7.43
  - https://github.com/cube-js/cube/commits/v1.7.44
  - https://github.com/cube-js/cube/commits/v1.7.45
  - https://github.com/cube-js/cube/pull/11629
  - https://github.com/cube-js/cube/commit/42bfe75a5628b9a9f882362a63771239a0c6d1a9
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
  - https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
  - https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-api-gateway/src/gateway.ts
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
  - https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=50&name=v1.7.4
  - https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=50&name=v1.7.4
---

# Cube upgrade: v1.7.42 to v1.7.43, with v1.7.44 and v1.7.45 assessed

> **Historical in one place, 2026-09-25** (architecture decision 1, [docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)): "the compile path that wechart's draft check and `repositoryFactory` feed" (:59) is replaced by xcube's own store and whole-model check.

## Summary

**Recommendation: pin v1.7.44.** That means `cubejs/cube:v1.7.44` for the API and the refresh worker, and `cubejs/cubestore:v1.7.44-arm64v8` for Cube Store on arm64 (`cubejs/cubestore:v1.7.44` on amd64). The user approved v1.7.43, so going one patch further needs their go-ahead. v1.7.43 alone is still a sound upgrade from v1.7.42, and it fixes the defect that prompted it.

**What v1.7.43 changes.** Only one change is on wechart's path: PR #11629, "don't report failed pre-agg build jobs as done" ([changelog]).

- On 1.7.42, a jobs-API status was `done` whenever the partition's table existed ([pa-42]). That table is created before the rows are imported, and a failed or killed import leaves it behind ([pr-11629]).
- On 1.7.43, a recorded build outcome ranks above the table. A failed build reports `failure: <error>`, and a build whose process died reports `failure: the build has not completed` ([pa-43], [ref-43]).
- The docs sentence "Job records are kept for 24 hours" was added by that same commit. It is not in the v1.7.42 tag's docs ([ref-42], [c-42bfe75]).
- The `get` response shape is unchanged.
- No migration, env var or `cube.js` change is needed.

**Why go past 1.7.43, on correctness.** v1.7.44 fixes three defects that 1.7.43 still has, each on a surface wechart exposes:

1. **Silent wrong answer.** When a calendar time shift was served from a rollup that stores only the unshifted measure, "a prior-year measure silently returned the current period" ([c-f177d5d], [pr-11979]). wechart's model editor offers the cube-level `calendar` flag (`packages/web/src/workspaces/model/form/schema.ts:242`). Its quick calculations are `multi_stage` measures with `time_shift` (`docs/research/cube/spike-model-store-and-quick-calcs.md`).
2. **Refresh-worker heap growth until OOM.** It happens when a partitioned rollup's build range moves with time ([i-11860], [pr-11896]). wechart's model editor offers `build_range_start` and `build_range_end` (`schema.ts:575-576`).
3. **Oversized job failure strings.** 1.7.43's new failure reporting passes the raw build error into `failure: <error>`. Before #11961, Cube Store create-table errors could include the full `CREATE TABLE` DDL and, with S3 storage, presigned S3 URLs. 1.7.44 shortens them to "Error during create table <schema.table>: <error>" ([pr-11961]). wechart shows these strings in its Builds panel and records build outcomes (AC-150).

**Risk of v1.7.44.**

- It was published 2026-09-24T17:33Z ([rel-44]).
- The issue search found no issue filed against it ([issues-since]), and v1.7.45 contains no fix for a 1.7.44 regression ([changelog]).
- Its matcher changes either refuse unsafe rollup matches or retry "the same matching predicate over a subset of candidates, so it can only produce plans the matcher already sanctioned" ([pr-11812], [c-f177d5d]).
- As a result, some queries on calendar cubes or `sql`-defined granularities move from a rollup to the source. That is correct behaviour, but wechart's acceleration badge and "why no rollup" explanation may then read differently for those queries.

**Why not v1.7.45.**

- It was published 2026-09-25T04:55Z, hours before this research ([rel-45]).
- It fixes nothing wechart is known to hit. Its depth failures need chains of about 24 or more stages, or deep nesting ([c-8a32446]); wechart's quick calcs chain two measures.
- It changes more sensitive internals:
  - Cube Store's parser and decoder recursion limits, and its thread stack size ([c-8a32446]).
  - A validation-result cache and a YAML transpile fast path in the schema compiler, with one stated output change ([pr-11995]). This is the compile path that wechart's draft check and `repositoryFactory` feed.

## Release and images

**Releases after 1.7.42.** The newest release listed is v1.7.45; there is no 1.8.x ([rel-list]).

| Version | GitHub release published (UTC) | Changelog date | `cubejs/cube` (multi-arch) pushed | `cubejs/cubestore:-arm64v8` pushed | Sources |
| --- | --- | --- | --- | --- | --- |
| v1.7.43 | 2026-09-21T15:27:05Z, not a prerelease | 2026-09-21 | 2026-09-21T16:03:12Z | 2026-09-21T15:45:30Z | [rel-43], [changelog], [hub-cube], [hub-cs] |
| v1.7.44 | 2026-09-24T17:33:34Z, not a prerelease | 2026-09-24 | 2026-09-24T18:10:15Z | 2026-09-24T17:52:34Z | [rel-44], [changelog], [hub-cube], [hub-cs] |
| v1.7.45 | 2026-09-25T04:55:42Z, not a prerelease | 2026-09-25 | 2026-09-25T05:31:55Z | 2026-09-25T05:13:06Z | [rel-45], [changelog], [hub-cube], [hub-cs] |

**Images and per-platform digests** (Docker Hub `images[].digest` values, [hub-cube], [hub-cs]):

| Tag | Platform(s) | Digest(s) |
| --- | --- | --- |
| `cubejs/cube:v1.7.43` | linux/amd64, linux/arm64 | amd64 `sha256:de2cb8c6ba485a35d7cd702aab5b8ab5e1c0f63db40ef8defc62dfd37a12c05f`; arm64 `sha256:b20c80dc835115818d971c98223c88f6891a9f81629be90afc9cbdd72728f063` |
| `cubejs/cubestore:v1.7.43-arm64v8` | linux/arm64 | `sha256:41236fe75116014e7a98a5594c248500c59c9a35501c2ea8e53468490cc50684` |
| `cubejs/cubestore:v1.7.43` | linux/amd64 only | `sha256:f233f42f4cd33e0f03147cfb724f4d69102eddcd2e7c15f271897293f19b5c42` |
| `cubejs/cube:v1.7.44` | linux/amd64, linux/arm64 | amd64 `sha256:32bbe218715bd9917ca04a35bff14d3292be6648bddcbab40ab51b3bea5c3083`; arm64 `sha256:164b462316d8e5d9bc55145eb4b537cba2d62f9b743775e9f49b1d274e83217b` |
| `cubejs/cubestore:v1.7.44-arm64v8` | linux/arm64 | `sha256:665d0bc03d3df86c301cea3bcd21cf365863cf13bbaf7a10ab2b4229f7745bb4` |
| `cubejs/cubestore:v1.7.44` | linux/amd64 only | `sha256:5280e10820fe2bcea2609c042433d0ae5cd5f1ffe710923a03cd20f4b2866040` |
| `cubejs/cube:v1.7.45` | linux/amd64, linux/arm64 | amd64 `sha256:1f21645e40d033e80a3c9396f4a68dd5908df1f96434a4bf9d34a0487a30498c`; arm64 `sha256:ec2d562aa9d63aa0ce3e9908955b35b9bc6b34939e64948612b9fed53f678427` |
| `cubejs/cubestore:v1.7.45-arm64v8` | linux/arm64 | `sha256:48532e1736d0f77eb7a08237236fd8d74a107b23942e0a9260e6d4fada308630` |
| `cubejs/cubestore:v1.7.45` | linux/amd64 only | `sha256:2732eaca04915c044bb9c0f0dbcf4e79d19c817ba08070ec429e64e001aeff63` |

- The `-arm64v8` tag format that wechart uses exists for all three versions. The plain `cubejs/cubestore` tags are still amd64-only ([hub-cs]).
- `-jdk` and `-non-avx` variants also exist for each version ([hub-cube], [hub-cs]).
- At v1.7.43 the Cube image base is unchanged at `node:24.21.0-trixie-slim` ([dockerfile-43]). The image installs Cube from the monorepo's root `yarn.lock`, not from npm ([dockerfile-43]), and its `package.json` pins every `@cubejs-backend/*` package, including `postgres-driver`, to `1.7.43` ([docker-pkg-43]).
- wechart imports no `@cubejs-*` npm package (no match in any `package.json`), so only the Docker tags change.

**What to change in `/Users/srajagopal/Work/wechart/docker-compose.yml`.** These are the only places the version is pinned outside docs and comments. `/Users/srajagopal/Work/wechart/.github/workflows/ci.yml` has no Cube or `CUBESTORE_IMAGE` reference.

- Line 57: `${CUBESTORE_IMAGE:-cubejs/cubestore:v1.7.44-arm64v8}`, or `v1.7.43-arm64v8`.
- Lines 65 and 114: `cubejs/cube:v1.7.44`, or `v1.7.43`.
- Line 54, the comment naming `v1.7.42`.
- `/Users/srajagopal/Work/wechart/infra/cube/cube.js` needs no change: none of the changes below touch an option it sets.

## Changes that touch wechart

### v1.7.42 to v1.7.43: all 13 commits

The compare lists 13 commits, all ahead and none behind ([cmp-42-43]).

| # | Commit / PR | What changed | Touches wechart? |
| --- | --- | --- | --- |
| 1 | `42bfe75` / #11629, fix(query-orchestrator): don't report failed pre-agg build jobs as done | Job status is derived from a recorded build outcome. A failed external upload drops its partial table. REST reference docs updated ([c-42bfe75]). | **Yes, and it changes behaviour.** Jobs API status, every pre-aggregation build (refresh worker included), and Cube Store table cleanup. See "PR #11629". |
| 2 | `2d9c13a` / #11931, fix(cubestore): Point a shed query at multi-cluster instead of env knobs | Only the text of two Cube Store planning-throttle errors changes. Before, they named `CUBESTORE_QUERY_TIMEOUT`, `CUBESTORE_MAX_CONCURRENT_QUERY_PLANS` and `CUBESTORE_MAX_QUERY_PLANS`; now they suggest "a multi-router Cube Store deployment, or increasing the number of clusters". One file, `planning_throttle.rs` ([c-2d9c13a]). | Cube Store, and only when planning is throttled. Message text only. No wechart code matches on it (grep of `packages/**/src`, `e2e`, `infra`). |
| 3 | `82f4a70` / #11950, feat(cubesql): Upgrade lru 0.13.0 to 0.18.4 | Cargo manifest and lockfiles only (`rust/cubesql`, `cubejs-backend-native`) ([c-82f4a70]). | No behaviour change stated. wechart does not use the SQL API. |
| 4 | `152bedc` / #11947, feat(snowflake-driver): snowflake-sdk 3.3.0 | Snowflake driver `package.json`, plus `yarn.lock` (AWS SDK and axios moved transitively) ([c-152bedc]). | No. wechart uses Postgres. The lockfile is image-wide ([dockerfile-43]), but the Postgres driver package is not edited. |
| 5 | `15b2088` / #11948, feat: Update deps to pass open security advisories | `yarn.lock` only: `http-proxy-middleware` 3.0.5 to 3.0.7 (which `cubejs-api-gateway` declares), socks, ip-address and the sigstore family ([c-15b2088]). | Indirectly, through api-gateway dependencies. The commit calls it "Lockfile-only". No behaviour change stated. |
| 6 | `deb8d4f` / #11943, chore(backend-native): post-installer ^0.2.0 | Install-time helper, lockfile pruning ([c-deb8d4f]). | No. |
| 7 | `971eb57` / #11944, refactor(playground): Drop @ant-design/compatible | Playground only ([c-971eb57]). | No. wechart runs production mode with no Playground. |
| 8 | `b2bb213` / #10975, chore(cubestore): bump tar 0.4.38 to 0.4.46 | Cube Store `Cargo.lock` and the `cubestore-sql-tests` `Cargo.toml` ([c-b2bb213]). The `cubestore` crate declares no direct `tar` dependency ([cs-cargo-43]). | No. |
| 9 | `d9c6a4c` / #11946, chore(playground): styled-components | Playground only ([c-d9c6a4c]). | No. |
| 10 | `08af5ed` / #11949, chore(cubesqlplanner): testcontainers 0.23 to 0.27 | A dev-dependency of the Tesseract planner crate ([c-08af5ed]). | No. |
| 11 | `4c6bc91` / #11932, docs: agent LLM list | `docs-mintlify/admin/ai/index.mdx` ([c-4c6bc91]). | No (Cloud AI docs). |
| 12 | `d5fed3d` / #11933, docs(ai): BYOM providers | `docs-mintlify/admin/ai/bring-your-own-model.mdx` ([c-d5fed3d]). | No (Cloud AI docs). |
| 13 | `a7e05bd`, v1.7.43 | Only `package.json` version bumps, per-package `CHANGELOG.md` files and `lerna.json` ([c-a7e05bd]). | No. |

The changelog marks nothing as breaking; neither `!` nor `BREAKING CHANGE` appears ([changelog]). The one behaviour change on wechart's path is #11629.

### v1.7.43, by the areas wechart uses

- **REST API.**
  - `/v1/pre-aggregations/jobs` `get`: the status semantics change inside the orchestrator ([pa-43]). The gateway handler and the response shape are unchanged; no commit in the range touches `gateway.ts`, per the file lists above ([gw-43]).
  - The jobs scope probe's `400 "No job description provided"` is still thrown verbatim ([gw-43]).
  - `/v1/load`, `/v1/meta?extended=true`, `/v1/sql`, `/readyz` and `/livez` are unchanged, because no commit touches api-gateway or server-core source.
- **Pre-aggregations and the refresh worker.** Every build now writes a build-status record, and a failed external upload drops its partial table ([c-42bfe75]). Nothing changes for `refresh_key` (`every`, cron, timezone), partition planning or lambda rollups.
- **Access policies and config hooks.** `contextToApiScopes`, `checkAuth`, `queryRewrite`, `scheduledRefreshContexts`, `repositoryFactory`, `schemaVersion` and `contextToGroups` are untouched: no server-core or schema-compiler source is in the range.
- **Query features.** Multi-stage measures, `ungrouped`, `total`, `timezone` and compare date range are untouched: no schema-compiler or cubesqlplanner source is in the range.
- **Postgres driver.** Only the version bump ([c-a7e05bd]).
- **Cube Store.** One source file, the error text ([c-2d9c13a]), plus new tests that pin behaviour already present ([c-42bfe75]).

### v1.7.43 to v1.7.44

The changelog lists 9 fixes and 2 features ([changelog]). The compare page reports 37 commits ([cmp-43-44-html]); 35 are listed on the commits page ([commits-44]). The rest are docs, CI, and test-snapshot chores, including #11993, which only updates test snapshots for the v1.7.0 numeric-strings wire format ([pr-11993]).

| Change | Touches wechart? |
| --- | --- |
| **api-gateway**: enforce `meta` scope on `/v1/graphql-to-json` (#11939). Before, it had no scope check. `/graphql`, `/v1/meta`, `/v1/load` and `/v1/sql` are unchanged ([pr-11939]). | wechart does not call it. Security hardening. |
| **cubestore**: keep create table error messages concise (#11961). This affects `CubeStoreDriver` create-table and upload errors, and `table_creator.rs` timeout and orphaned errors ([pr-11961]). | **Yes.** These strings become job `failure: <error>` text. wechart only tests the `failure` prefix (`packages/api/src/jobs/build.ts:19-27`). |
| **query-orchestrator**: bound cached pre-aggregation partition plans (#11896, closes #11860). The PR describes it as having "no public API or configuration changes" ([pr-11896]). #11860 reports heap growth of about 84 MB per hour until the refresh worker is OOM-killed, with day-partitioned rollups whose build range moves with time, on 1.6.20 and 1.7.37 ([i-11860]). | **Yes.** Refresh worker, for rollups with moving build ranges. |
| **query-orchestrator**: don't report a cancelled query as a query error (#11759). A cancelled query is now logged as `cancellationError` with a warning on the orphan event, not as "Error while querying" ([pr-11759]). | Logs only. wechart cancels through `DELETE /v1/running-query/:id` (`packages/api/src/server.ts:251`) but does not read Cube's logs. |
| **tesseract**: never serve a calendar time shift from a plain rollup (#11979). A calendar-shifted stage is never served by offsetting a stored column, and falls back to the source. A granularity defined with `sql` is served only by a rollup that stores exactly that granularity ([c-f177d5d]). | **Yes.** It fixes a silent wrong answer for calendar cubes with time shifts, and changes rollup matching for them. |
| **tesseract**: retry pre-aggregation matching within one external type (#11812). Multi-stage queries whose stages matched rollups of different external types now retry within one type instead of falling to the source ([pr-11812]). | Multi-stage (quick calcs), and only when some rollup sets `external: false`. |
| **tesseract**: render FILTER_PARAMS on the measure side of a join back (#11814). Results were correct before, but the measure-side copy scanned the unfiltered table, risking memory exhaustion ([pr-11814]). | Only models that use `FILTER_PARAMS`. wechart's seed model does not. |
| schema-compiler: MSSQL pushdown joins (#11778); testing: MSSQL readiness (#11917); cli: agent evals (#11953); hive-driver: thrift (#11969) ([changelog]) | No. |

### v1.7.44 to v1.7.45

v1.7.45 has four non-release commits ([commits-45]).

| Change | Touches wechart? |
| --- | --- |
| **Report query depth instead of failing or crashing (#11815).** ([c-8a32446], [pr-11815]) New budgets, each with an env var: `CUBESTORE_SQL_PARSER_RECURSION_LIMIT` (128), `CUBESTORE_MAX_QUERY_PLAN_DEPTH` (150), `CUBESTORE_MAIN_STACK_SIZE` (8 MiB) and `CUBEJS_MAX_MULTI_STAGE_DEPTH`. The squashed message says the last defaults to 32, but the shipped `DEFAULT_MAX_MULTI_STAGE_DEPTH` is 150. Before this change, Cube Store rejected grouped rollup queries at about 24 chained stages, and long multi-stage chains crashed the process. After it, "Queries between the old caps and the new budgets now execute where they used to be refused", and a multi-stage chain deeper than the budget is refused with an error naming the knob. The commit also advises "Deploy workers before routers". | Cube Store and multi-stage measures. Behaviour changes at depths wechart's quick calcs don't reach. wechart runs one Cube Store node, so the rollout order does not apply. |
| **perf(schema-compiler): faster validation, meta and YAML transpilation (#11995).** It adds an LRU of validator results keyed by cube-definition fingerprints, memoizes `/v1/meta` titleize and camelize, and adds a YAML fast path. One stated output change: trailing `f`, `F`, `fr` and `rf` text runs, which the old lexer dropped, are now kept ([pr-11995]). | `/v1/meta` and YAML compile, which wechart's model store and drafts feed. |
| **feat(cubejs-cli): deprecate cubejs CLI (#11965).** Warnings are printed for `auth`, `deploy` and bare runs. `server` (the image entrypoint), `create`, `generate`, `token`, `typegen` and `validate` stay silent. `CUBEJS_CLI_NO_DEPRECATION_WARNING=true` suppresses the warnings ([pr-11965]). | No (wechart does not use the CLI). |
| docs: Databricks Metric View sync (#11988) ([commits-45]) | No. |

### Open issues on features wechart uses, not fixed in 1.7.43 to 1.7.45

- **#11973: `total: true` crashes when the count query returns no row** (open, 2026-09-23). The unguarded `total.data[0]` access is still on master ([i-11973]).
- **#11945: wrong UTC bounds near DST transitions for local `dateRange` with `timezone`** (open, 2026-09-21). Reported on v1.7.42 with Postgres and Tesseract ([i-11945]).

## PR #11629

**Identity and timing.**

- "fix(query-orchestrator): don't report failed pre-agg build jobs as done". It was merged 2026-09-18T17:16:20Z as `42bfe75a5628b9a9f882362a63771239a0c6d1a9` ([pr-11629]).
- The v1.7.42 images were pushed earlier that day, at about 15:56Z ([hub-cube]).
- The commit is the first one in v1.7.42...v1.7.43 ([cmp-42-43]), and the 1.7.43 changelog lists it ([changelog]).
- The earlier analysis is **verified on both points**: the 1.7.42 defect is fixed in 1.7.43, and the docs sentence was added in the same commit. Details follow.

**Before (v1.7.42), `isPartitionExist`** ([pa-42]):

1. If a table with the target versioned name exists, the status is `done`.
2. Otherwise, if the queue result carries an error, it is `failure: <error>`.
3. Otherwise it is `missing_partition`.

The job record `PRE_AGG_JOB_<token>` is rewritten with the status, with a TTL of 86400 s, whenever the queue returned a result.

Why that reports false successes, in the PR's words: the target table "is created *before* the rows are imported into it and is left behind when the import fails or the process is killed". In the reporter's incident (#11609), jobs showed `done` about 17 minutes before the source queries finished, and three of four partitions ended up empty ([pr-11629], [i-11609]).

**After (v1.7.43)** ([pa-43], [pal-43]):

1. A recorded `failure` gives `failure: <recorded error>`.
2. A recorded `building` gives `processing`. If the build has run longer than `2 × (executionTimeout || CUBEJS_DB_QUERY_TIMEOUT)`, it gives `failure: the build has not completed` instead. `CUBEJS_DB_QUERY_TIMEOUT` defaults to `10m` and is converted to seconds ([env-43]). With default timeouts that is 20 minutes; this is derived, not observed.
3. Otherwise, if the table exists, the status is `done`.
4. Otherwise, if the queue result carries an error, it is `failure: <error>`.
5. Otherwise it is `missing_partition`.

**The build-status record** ([pa-43], [pal-43], [c-42bfe75]):

- Its cache key is `SQL_PRE_AGGREGATIONS_BUILD_STATUS` plus the table name, with a TTL of 86400 s. It is stored in the cache driver, which is Cube Store in wechart's production-mode compose.
- The type is `{ status: 'building' | 'failure', error?, startedAt? }`.
- `building` (with `startedAt`) is written when any build starts. That covers refresh-worker and query builds too, not just jobs; the code comment says "Recorded for every build, not just for the ones a job started".
- `failure` is written if the build throws before its rows land.
- The record is removed once the rows land. "A finished build is recorded by the absence of a record."
- Errors from cleanup after the rows have landed (orphaned tables, temp-table drop) do not mark the build failed.

**Other code changes** ([pa-43], [pal-43]):

- A failed external upload now drops the table it was creating, unconditionally, because "`CREATE TABLE` carries no `IF NOT EXISTS`".
- The job record is now rewritten only when it exists and its status has changed. Each rewrite resets the 86400 s TTL.

**Unchanged** ([gw-43]):

- The gateway still returns a stored status starting with `done` or `failure` as-is. So once a token has reported `failure`, it stays failed ("the gateway caches a failure for the lifetime of the job", [c-42bfe75]); to try again, post a new job.
- Otherwise the gateway checks the queue first (`toProcess` gives `scheduled`, `active` gives `processing`, other raw states pass through). Then it calls `isPartitionExist`, and returns `pre_agg_not_found` if the pre-aggregation has left the model.
- The response is still `[{ token, table, status, selector: { cubes, preAggregations, contexts, timezones, dataSources } }]`, or `{ token, status: 'not_found' }` for an unknown token. `resType: 'object'` still gives a map.
- No status keyword was added or removed. The new specific string is `failure: the build has not completed`.

**Docs.**

- The v1.7.42 status table lists 4 statuses, including "`missing_partition` | The job has failed" and "`done` | The job has successfully completed". It does not contain "Job records are kept for 24 hours" ([ref-42]).
- The v1.7.43 table lists 7 statuses: `scheduled`, `processing`, `done` ("The build has completed and its data has landed in the pre-aggregation storage"), `failure: <error>`, `missing_partition` ("No table exists for this partition and no build outcome is recorded for it. Trigger the job again"), `not_found` ("The token is unknown, or the job record has expired. Job records are kept for 24 hours") and `pre_agg_not_found` ([ref-43]).
- v1.7.43 also adds two notes ([ref-43]):
  - "Builds run in the process that receives the request, even on an instance that never builds pre-aggregations while serving queries. Restarting that instance interrupts any build it is running; such a build is reported as `failure`, so re-trigger the job for those partitions."
  - "`done` … doesn't mean the partition has any rows: a partition with no matching source data is built and reported as `done` with zero rows."

**Where the PR description and the shipped code disagree.** The shipped code wins in each case:

- The PR body says "Build jobs honour the `externalRefresh` guard … Such an instance now refuses the job" ([pr-11629]). The squashed commit reverses this ("let build jobs run regardless of externalRefresh", [c-42bfe75]), and v1.7.43's loader still starts with `if (this.isJob || (!this.externalRefresh && …))` ([pal-43]).
- The PR body says the outcome is "tracked for build jobs only". The shipped code records it for every build ([pal-43]).
- The PR body says the partial table is dropped "unless that table was already there". The shipped code drops it unconditionally ([pal-43]).

**Not fixed, and still in effect.**

- Issue #11609 is still open ([i-11609]), although the PR says it fixes it.
- A `done` partition can legitimately have zero rows ([ref-43]).
- On the `CubeStoreDriver.importRows` path, a table is still visible while empty. That case is now handled in the orchestrator, while the `CREATE TABLE … LOCATION` import paths are published atomically by Cube Store ([pr-11629]).

**What this means for wechart's code.**

- `isFinished` (`/Users/srajagopal/Work/wechart/packages/api/src/jobs/build.ts:19-27`) already treats any `failure` prefix, `missing_partition`, `not_found` and `pre_agg_not_found` as final. That matches the 1.7.43 docs.
- wechart posts jobs to the API container, so the build runs there ([ref-43]).
- If that container restarts mid-build, a 1.7.43 poller sees `processing` until the abandoned window passes, then `failure: the build has not completed`. With default timeouts that is about 20 minutes (derived). On 1.7.42 the same case reported `done` or `missing_partition` ([pa-42]).

## Migration/rebuild needs

1. **Cube Store data migration: none.**
   - The changelog and release notes for 1.7.43, 1.7.44 and 1.7.45 contain no upgrade or migration notes ([changelog], [rel-43], [rel-44], [rel-45]).
   - In v1.7.43 the only Cube Store source change is one error-text file ([c-2d9c13a]). No 1.7.43 commit touches `DEPRECATION.md`; all 13 commits' file lists are enumerated above.
2. **Cache store: nothing to prepare.** The new build-status keys are written as builds run, and when a key is absent the status falls back to checking the table ([pa-43]).
   - Inference from the code: builds still running in the 1.7.42 containers at upgrade time leave no build-status record. After the upgrade they are judged the 1.7.42 way (table exists gives `done`). So upgrade when no builds are in flight, or re-post jobs for any that were.
3. **Pre-aggregation rebuild: not required by the release, but advised for partitions a 1.7.42 job may have falsely reported `done`.**
   - The fix does not repair empty tables left earlier: orphaned-table cleanup "always keeps the newest version per table name, so without this the half-built table lives forever" ([pr-11629]).
   - The reporter in #11609 recovered by dropping the table and letting scheduled refresh rebuild it ([i-11609]).
   - Locally, recreating the `wechart-cubestore-data` volume removes every stored partition, and the refresh worker then rebuilds.
   - UNVERIFIED: whether a jobs-API rebuild of the same partition always writes a newer versioned table that supersedes the empty one.
4. **Config and env vars: none for 1.7.43 or 1.7.44.** 1.7.45 adds only optional variables with defaults ([c-8a32446], [pr-11965]); they are listed under v1.7.45 above. `CUBEJS_MAX_MULTI_STAGE_DEPTH` is unset by default ([env-45]) and the planner's own default is 150 ([c-8a32446]).
5. **Image base:** unchanged at Node 24.21.0 for 1.7.43 ([dockerfile-43]).

## Corrections to sibling docs

Claims that v1.7.43 changes:

- **`/Users/srajagopal/Work/wechart/docs/research/cube/refresh-jobs-caching.md`**
  - **Frontmatter `version`, line 4, and the Install section, line 49:** move the images to the new pin (digests above).
  - **Line 223, `CUBEJS_PRE_AGGREGATIONS_BUILDER`:** add that jobs-API builds bypass it (`this.isJob ||`, [pal-43]). This is now documented ([ref-43]). The behaviour itself is not new: the #11629 diff doesn't touch that condition ([c-42bfe75]).
  - **Lines 246-254, status values:**
    - `processing` can also come from a recorded build.
    - `done` now means no failure or in-progress record and the table exists.
    - `failure:` also comes from a recorded outcome, including `failure: the build has not completed`.
    - `missing_partition` is now documented as "no table and no recorded outcome; trigger again", not "the job has failed" ([pa-43], [ref-43]).
  - **Line 252, `not_found`:** the 86400 s TTL still holds. The record is now rewritten, and its TTL reset, only when the status changes ([pa-43]).
  - **Line 397, gotcha 3:** fixed in 1.7.43 (see "PR #11629").
  - **Line 398, gotcha 4:** the docs now list 7 statuses and explain `missing_partition` ([ref-43]). Only the raw queue-state passthrough is still undocumented ([gw-43]).
- **`/Users/srajagopal/Work/wechart/docs/research/cube/configuration-deployment.md`**
  - **Lines 65-79 and 765:** images and digests to the new pin.
  - **Line 775, gotcha 12:** #11609's "`done` hides ghost partitions" is fixed in 1.7.43 for failed or interrupted builds. Its "jobs-API builds run in-process on API instances" was kept on purpose and is now documented ([pr-11629], [c-42bfe75], [ref-43]). The issue is still open ([i-11609]).
- **`/Users/srajagopal/Work/wechart/docs/research/cube/pre-aggregations.md`, line 352:** "Statuses are `scheduled`, `processing`, `missing_partition` and `done`" should list 7 statuses ([ref-43]). The version pins at lines 27 and 50-59 also need moving.
- **`/Users/srajagopal/Work/wechart/docs/research/scheduler.md`, line 97:** add `pre_agg_not_found` to the statuses to persist ([ref-43]). The quoted "Job records are kept for 24 hours" is absent from the v1.7.42 tag ([ref-42]) and first appears at v1.7.43 ([ref-43]). It became true of the pinned version only with this upgrade.
- **`/Users/srajagopal/Work/wechart/docs/research/cube-capabilities.md`:** version pins on lines 4, 10, 12 and 134.

Claims that change only if the pin is v1.7.44 or later:

- **`/Users/srajagopal/Work/wechart/docs/research/cube/data-apis.md` line 133 and `/Users/srajagopal/Work/wechart/docs/research/cube/api-scope-probes.md` line 103:** `/v1/graphql-to-json` requires `meta` ([pr-11939]).
- **`/Users/srajagopal/Work/wechart/docs/research/cube/pre-aggregations.md` (matching rules):** add the #11979 refusals and the #11812 retry ([c-f177d5d], [pr-11812]).

Claims that change only if the pin is v1.7.45:

- **`/Users/srajagopal/Work/wechart/docs/research/cube/configuration-deployment.md` lines 101-108:** the cubejs CLI deprecation warnings ([pr-11965]).

Not research docs, but they carry the same 1.7.42 claim:

- `/Users/srajagopal/Work/wechart/packages/web/src/workspaces/jobs/BuildPanel.tsx:359-363`, a user-facing note saying 1.7.42 reports `done` once the table exists.
- `/Users/srajagopal/Work/wechart/docs/tasks.md:2610`.
- `/Users/srajagopal/Work/wechart/docker-compose.yml`:
  - Lines 108-112 say the API instance "builds none itself". That is true only for query-triggered builds; jobs-API builds run there ([ref-43]).
  - Lines 54-55 say "CI sets CUBESTORE_IMAGE", but `.github/workflows/ci.yml` does not.
- `/Users/srajagopal/Work/wechart/docs/requirements.md:75,156`, version pins.

No 1.7.43 commit touches api-gateway source, server-core, schema-compiler, Tesseract or the Postgres driver (see the commit table). So claims in the following docs are not affected by 1.7.43:

- `access-control.md`
- `access-policy-evaluation.md`
- `data-modeling.md`
- `spike-model-store-and-quick-calcs.md`
- `rollup-references.md`
- `markings-query-support.md`
- `meta-extended-pre-aggregations.md`
- `data-sources.md`
- `cloud-product-features.md`

I checked these by grep for version-specific and job-status claims, not by reading them line by line.

Unrelated to 1.7.43: `cube-capabilities.md` line 72 names `renewQuery` for "Refresh now", but `refresh-jobs-caching.md` line 298 records that `renewQuery` was removed in 1.7.0.

## UNVERIFIED items

- **Nothing here was observed on a running container.** The 1.7.43 statuses and the abandoned window are read from source and docs.
  - Suggested checks after the upgrade: post a job and see `processing` then `done`; restart `cube` mid-build and see `processing` until the window passes, then `failure: the build has not completed`.
  - A throwaway container with a short `CUBEJS_DB_QUERY_TIMEOUT` shortens that window.
- **The 20-minute abandoned window** assumes the pre-aggregation queue's `executionTimeout` resolves to 600 s. I did not trace what `preAggregationsOptions.queueOptions(dataSource)` returns in wechart's configuration.
- **How exposed wechart was on 1.7.42.** I did not trace which import path Postgres-to-Cube Store builds take (`importRows` versus `CREATE TABLE … LOCATION`). Only `importRows` leaves a visible empty table on a failed import ([pr-11629]).
- **No mass rebuild on upgrade (inferred).** No build-SQL or driver source changed in 1.7.43, so table versions should stay the same. Not observed.
- **Two commits in v1.7.43...v1.7.44 are not enumerated.** The compare says 37 commits, the commits page lists 35 ([cmp-43-44-html], [commits-44]). The GitHub API rate limit blocked the full list.
- **Whether #11979 covers interval-based quick-calc shifts.** The commit says "every calendar-cube time dimension" ([c-f177d5d]). I did not test whether a quick calc with `interval`/`type` over a calendar cube's time dimension goes down this path.
- **#11860's state.** Its page showed it open at fetch time even though #11896 "closes" it ([i-11860], [changelog]).
- **Whether #11973 applies to Postgres.** It would need Postgres's `count(*)` to return no row, which I did not check against Cube's generated total query ([i-11973]).
- **Digests are per-platform.** The multi-arch index digest of `cubejs/cube:v1.7.4x` was not fetched, so digest pins for the API image would need that index digest ([hub-cube]).
- **Image base for 1.7.44 and 1.7.45.** Not checked; only 1.7.43's Dockerfile was read ([dockerfile-43]).
- **Context7 lookup.** `/websites/cube_dev` returned no job-status content, so tag-pinned GitHub sources were used throughout.

[rel-list]: https://api.github.com/repos/cube-js/cube/releases?per_page=10
[rel-43]: https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.43
[rel-44]: https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.44
[rel-45]: https://api.github.com/repos/cube-js/cube/releases/tags/v1.7.45
[changelog]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/CHANGELOG.md
[cmp-42-43]: https://api.github.com/repos/cube-js/cube/compare/v1.7.42...v1.7.43
[cmp-43-44-html]: https://github.com/cube-js/cube/compare/v1.7.43...v1.7.44
[commits-44]: https://github.com/cube-js/cube/commits/v1.7.44
[commits-45]: https://github.com/cube-js/cube/commits/v1.7.45
[hub-cube]: https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=50&name=v1.7.4
[hub-cs]: https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=50&name=v1.7.4
[pr-11629]: https://github.com/cube-js/cube/pull/11629
[c-42bfe75]: https://github.com/cube-js/cube/commit/42bfe75a5628b9a9f882362a63771239a0c6d1a9
[pa-42]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[pa-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[pal-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[gw-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-api-gateway/src/gateway.ts
[ref-42]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[ref-43]: https://raw.githubusercontent.com/cube-js/cube/v1.7.43/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[env-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-backend-shared/src/env.ts
[env-45]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[dockerfile-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-docker/latest.Dockerfile
[docker-pkg-43]: https://github.com/cube-js/cube/blob/v1.7.43/packages/cubejs-docker/package.json
[cs-cargo-43]: https://github.com/cube-js/cube/blob/v1.7.43/rust/cubestore/cubestore/Cargo.toml
[c-2d9c13a]: https://github.com/cube-js/cube/commit/2d9c13a44e01466ffdccfdc065e5ecddc8189930
[c-82f4a70]: https://github.com/cube-js/cube/commit/82f4a7056351ea83e4da6d22b6c0a80673b7b0ce
[c-152bedc]: https://github.com/cube-js/cube/commit/152bedc0be20b09bf7e49730c88e203b475413e0
[c-15b2088]: https://github.com/cube-js/cube/commit/15b2088a56f9038bfa2eb15dfbeecce5bcef11b7
[c-deb8d4f]: https://github.com/cube-js/cube/commit/deb8d4f6b6d40a5e8aa9aae4ab29057fd87c8454
[c-971eb57]: https://github.com/cube-js/cube/commit/971eb575dc8f8152b5353071031836fc8e828123
[c-b2bb213]: https://github.com/cube-js/cube/commit/b2bb2130aee9948f3c0f27ac10f532877a0c06d3
[c-d9c6a4c]: https://github.com/cube-js/cube/commit/d9c6a4cb76905225123c95709aaf88926bf35270
[c-08af5ed]: https://github.com/cube-js/cube/commit/08af5edaeba227a2486095b4f5f8a6b34f3278c8
[c-4c6bc91]: https://github.com/cube-js/cube/commit/4c6bc915c2b9584323fb1efddca8fc1bcd6b05ba
[c-d5fed3d]: https://github.com/cube-js/cube/commit/d5fed3d9d72aa94be1862e74da05232f07b14fbe
[c-a7e05bd]: https://github.com/cube-js/cube/commit/a7e05bd785cf372c1ed2f36f610a81becff64707.patch
[pr-11939]: https://github.com/cube-js/cube/pull/11939
[pr-11961]: https://github.com/cube-js/cube/pull/11961
[pr-11896]: https://github.com/cube-js/cube/pull/11896
[pr-11759]: https://github.com/cube-js/cube/pull/11759
[pr-11979]: https://github.com/cube-js/cube/pull/11979
[c-f177d5d]: https://github.com/cube-js/cube/commit/f177d5d8713b738154cab5fe7eb63f334c8452c1
[pr-11812]: https://github.com/cube-js/cube/pull/11812
[pr-11814]: https://github.com/cube-js/cube/pull/11814
[pr-11993]: https://github.com/cube-js/cube/pull/11993
[pr-11815]: https://github.com/cube-js/cube/pull/11815
[c-8a32446]: https://github.com/cube-js/cube/commit/8a32446e1ba2553c33bd05c33f9f861ec1ce8549.patch
[pr-11995]: https://github.com/cube-js/cube/pull/11995
[pr-11965]: https://github.com/cube-js/cube/pull/11965
[i-11609]: https://github.com/cube-js/cube/issues/11609
[i-11860]: https://github.com/cube-js/cube/issues/11860
[i-11973]: https://github.com/cube-js/cube/issues/11973
[i-11945]: https://github.com/cube-js/cube/issues/11945
[issues-since]: https://api.github.com/search/issues?q=repo:cube-js/cube+is:issue+created:>=2026-09-18&sort=created&order=desc&per_page=50
