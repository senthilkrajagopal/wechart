---
library: xcube slice 6, connections with sealed credentials (the user's Cube fork)
packages: [xcube]
version: 'xcube at fddc376f25 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233
  - https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233.patch
  - https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233.diff
  - https://github.com/senthilkrajagopal/cube/commit/282f825c59f49b26e990344f4303e0fde0acceb7.diff
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/fddc376f251c0ff83bb4d2ed52a5ddd8b1d2dd89
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/5c46e57c1fda28d00db4ec583a07431bdc36726b
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/1249dda9ca7570cb7218ab2cdd4a28065fa15058
  - https://api.github.com/repos/senthilkrajagopal/cube/commits/917402f94502cd8cafc5fb8da03a343c81141034
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/README.md
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/runtime/runtime.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/connections/connections.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/config.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/server.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/store/revisions.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/gateway.ts
  - https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/test/integration/connections.test.ts
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
  - https://github.com/users/senthilkrajagopal/packages/container/xcube/1299277445?tag=v1.7.45-fddc376f25
  - https://github.com/users/senthilkrajagopal/packages/container/package/xcube
  - https://www.rfc-editor.org/rfc/rfc9180.txt
  - /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
  - /Users/srajagopal/Work/bi/cube/xcube/src/credentials/credentials.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/credentials/hpke.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/connections/switchable.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/bin/keygen.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/credentials.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/hpke.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/image/drivers-env.js
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OrchestratorStorage.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
  - /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-slice-6-contract.md
  - /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-connections-drivers.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1700-slice-6-built.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1800-tls-target-keys.md
---
# xcube slice 6: connections with sealed credentials (xcube at fddc376f25 on Cube v1.7.45)

This doc is the sibling of [x3a], [x3b] and [x4]. It covers slice 6a (`49581da2f1`) and 6b (`282f825c59`), the CI fix `fddc376f25`, and the commits either side that change what wechart sees:
- the partitions route `917402f945`;
- slice 8 `5c46e57c1f`;
- the TLS target keys `1249dda9ca`.

It checks every claim in the raw inputs [in6] and [indrv] and in xcube's notes [sum6] and [sumtls], against wechart's own [w-cs], and against [w-drv].

**Headline findings**
1. **The published image named for this slice doesn't carry the user's TLS decision.** `fddc376f25` binds secrets to `host, port` only for postgres, redshift, mysql and mssql, and to `host, port, url` for dremio. Only `1249dda9ca` adds the TLS fields, and it has its own image. Envelopes sealed under one binding don't open under the other.
2. **`917402f945` (the partitions route) is not "later".** It is the parent of 6a, so every slice-6 image carries it.
3. **Per-instance health can't prove "every instance uses the new settings" (AC-161) as built.**
   - Rows from instances that are gone are never removed.
   - Only instances that have built a driver for the connection report at all.
4. **"No environment reaches a connection" has gaps:**
   - Redshift's catalog queries use `CUBEJS_DB_NAME`.
   - Snowflake's and BigQuery's constructors read the export-bucket variables.

## Provenance

- **The ref.**
  - `.git/HEAD` is `ref: refs/heads/feat/xcube` ([head]).
  - `refs/heads/feat/xcube` and `refs/remotes/fork/feat/xcube` are both `1249dda9ca7570cb7218ab2cdd4a28065fa15058` ([ref]; [fork-ref]).
- **Full SHAs, from the reflog** ([reflog] L10-15). The reflog is linear. Each entry is a `commit:` whose old SHA is the previous entry's new one. The GitHub API gives the same parents ([a6a]; [a6b]; [afd]; [a8]; [atls]).

| Reflog | SHA | Message | Author date (UTC) | CI run: `test` / `image` | Image |
| --- | --- | --- | --- | --- | --- |
| L10 | `917402f94502cd8cafc5fb8da03a343c81141034` | a model's pre-aggregation partitions on the admin API | 18:23:44 ([apart]) | published ([ghcr]) | `v1.7.45-917402f945@sha256:08eb4f6f4846967968aa9502a2a8805cf2d6260c510b543a998245c8f004bded` |
| L11 | `49581da2f140e8f577de2726b4cea7cdf63f2233` | connections with sealed credentials (slice 6a) | 19:08:31 ([a6a]) | run 36265008587: success / **cancelled** ([r6a]) | none |
| L12 | `282f825c59f49b26e990344f4303e0fde0acceb7` | bind data sources at publish; connections in use and introspection (slice 6b) | 19:12:09 ([a6b]) | run 36265224499: success / **failure** ([r6b]) | none |
| L13 | `fddc376f251c0ff83bb4d2ed52a5ddd8b1d2dd89` | image check doesn't chmod the credential key files on Linux | 19:18:32 ([afd]) | run 36265603448: success / success ([rfd]) | `v1.7.45-fddc376f25@sha256:1c676ae2110d9f7ca49a94c38326d61e3a9686e7ee589cd348edbdbf12cf7300` |
| L14 | `5c46e57c1fda28d00db4ec583a07431bdc36726b` | contract checks for Cube upgrades and a faster queue heartbeat (slice 8) | 19:27:19 ([a8]) | run 36266112398: **failure** / skipped ([r8]) | none |
| L15 | `1249dda9ca7570cb7218ab2cdd4a28065fa15058` | bind each driver's TLS settings into a sealed secret's target | 19:43:30 ([atls]) | run 36267036958: success / success ([rtls]) | `v1.7.45-1249dda9ca@sha256:460c1ab1126993ce71e587919f1037319c06e0819845e717545a1354e68a6265` |

- **Why some commits have no image.**
  - The workflow cancels an in-progress run when the same ref is pushed again (`concurrency … cancel-in-progress: true`, [wf] L23-25). 6b was pushed about 6 s after 6a's image job started. That explains 6a's cancelled image job; this is an inference from the timestamps.
  - 282f825c59's image check failed ([r6b]). fddc376f25 changes one line of `serving.sh`, dropping `chmod -R a+rX "$keys/credential"` ([afd] patch).
  - 5c46e57c1f's own test job failed ([r8]). 1249dda9ca's message says its tests now wait for the health report, "a race CI lost" ([atls]).
- **The fddc376f25 image, confirmed on GitHub** ([ghcr-fd]):
  - tag `v1.7.45-fddc376f25`;
  - digest `sha256:1c676ae2…7300`;
  - linux/amd64 `sha256:1e956785cfcabf43aaf99493f1ce71288c0e49b840b038e42b23383c89d7aa25`;
  - linux/arm64 `sha256:80faa469218d284454d2318e655bedf4ab1a9e3ad073912de7a7272cbcdd1b06`;
  - "unknown/unknown" `sha256:10c92d6e46f4469e24d5142446b52109537bffce6390ac7a14dabeee79c60b1e`.

  The package is public ([ghcr-pkg]).
- **The 1249dda9ca image** ([ghcr]; [ghcr-pkg]):
  - tags `v1.7.45-1249dda9ca` and the moving `v1.7.45-feat-xcube` ([wf] L141-145);
  - digest `sha256:460c1ab1…6265`;
  - linux/amd64 `sha256:2a82422b8a8973ed58164435d9c6767a50e40eef32b93acf1b30a7a4428939b3`;
  - linux/arm64 `sha256:623b4e082cd6fafc898672df926fad83491e16ff247a7b3b556f5e2727e6687e`;
  - "unknown/unknown" `sha256:0c4e57fb36f4e3b8708194f848c5fdc31d10df3f78df30ae93f02b441dde7d0e`.
- **Which image carries what:**

| Change | Commit | Images that carry it |
| --- | --- | --- |
| Partitions route | 917402f945 | `…-917402f945`, `…-fddc376f25`, `…-1249dda9ca` |
| Slice 6a and 6b | 49581da2f1, 282f825c59 | `…-fddc376f25`, `…-1249dda9ca` |
| Slice 8: 8 s queue heartbeat, `override` contract checks, two-sided driver check | 5c46e57c1f | `…-1249dda9ca` only |
| TLS fields in the v1 target keys | 1249dda9ca | `…-1249dda9ca` only |
| Overlays bringing their own data sources (AC-280, migration 7) | **none**: uncommitted in the working tree | none |

- **What the commits contain.**
  - **6a:** 29 files, +3102 −13 ([p6a]). They include:
    - new `src/credentials/{credentials,hpke}.ts`, `src/connections/{connections,drivers,switchable}.ts` and `src/bin/keygen.ts`;
    - `admin/routes.ts` +90, `runtime/runtime.ts` +150, `config.ts` +58, `server.ts` +43;
    - `store/migrations.ts` +36 and `store/revisions.ts` +98;
    - the new tests `unit/{credentials,hpke,connections}.test.ts`, `integration/{connections,connection-drivers}.test.ts`, `image/drivers-env.js` and `fixtures/hpke-oracle.mjs`.
  - **6b:** +230 −28 in `names/publish.ts`, `runtime.ts`, `gateway.ts`, `routes.ts`, `connections.ts`, the README and two tests ([a6b]; [d6b]).
  - **1249dda9ca:** +53 −26 in `drivers.ts`, the README, `integration/connections.test.ts` and `unit/credentials.test.ts` ([atls]). `credentials.ts` is **not** touched; `secretAadV1` reads `DRIVERS[driver].target` ([cred] L42-48).
- **The working tree is not at any commit, and it was changing while this was read.**
  - It carries uncommitted work on overlays with their own data sources:
    - `src/overlays/connections.ts` returns 404 at 1249dda9ca ([raw-ovc]);
    - migration 7 `overlay connections` ([mig] L229-241);
    - overlay code in `connections.ts`, `config.ts`, `server.ts`, `runtime.ts`, `revisions.ts`, the README and two tests (Grep for `overlayConnection|overlayDriverFor|OverlayConnection|withDataSourceMark|boundDataSource`).
  - Two reads of `runtime.ts` minutes apart gave the same code at lines two apart.
  - **Don't build this tree.** Use a published image.
- **How I cite.**
  - **Files equal to 1249dda9ca**, cited with working-tree lines:
    - `credentials.ts` (227 lines) and `hpke.ts` (136) are new in 6a, touched by no later commit, and their line counts equal their 6a additions ([p6a]).
    - `switchable.ts` (227) and `keygen.ts` (30) likewise.
    - `unit/credentials.test.ts` is 122 lines = 115 + 9 − 2 ([p6a]; [atls]).
    - `hpke.test.ts` (67), `hpke-oracle.mjs` (18) and `unit/connections.test.ts` (162) match their additions.
    - `drivers-env.js` is 127 = 103 + 44 − 20 ([p6a]; [a8]).
    - `drivers.ts` is 295 = 288 + 14 − 7, and each 1249dda9ca hunk position matches ([p6a]; [atls]).
    - `names/publish.ts` and `gateway.ts`: 6b's hunk positions (`@@ -207,7 +214,52 @@`, `@@ -586,6 +586,12 @@`) match the working tree ([d6b]).
    - `auth.ts`, `settings.ts` and `migrate.ts` hold no uncommitted marker, and no commit after 6a touches them ([a8]; [atls]).
  - **Files with uncommitted edits**, cited with the **commit's** lines. I computed these from hunk headers and checked the text against the raw file fetched at `1249dda9ca`:
    - `connections.ts`: the commit is 481 lines (6a +481; 6b +1 −1). Commit = working for L1-286, working − 4 for working L292-336, and working − 24 from working L358 ([raw-conn]).
    - `routes.ts`: commit = working − 5 from working L186 to L591. The working tree's L181-185 are uncommitted. The offset agrees with 6a's hunk `@@ -270,6 +295,12 @@` and 6b's `@@ -296,7 +296,7 @@` ([d6a]; [d6b]).
    - `migrations.ts`: commit = working for L1-228; at the commit, `];` is L229 and `SCHEMA_VERSION` is L232.
    - `runtime.ts`: lines come from 6a's and 6b's hunk headers. `runtime.ts` is unchanged after 6b ([a8]; [atls]).
      - The connections block is L1495-1646, and `start()` loads keys at L517-522.
      - 6b's binding hunks are at L1290, L1365-1368, L1425, L1565-1604, L2700 and L2720.
      - The method bodies were checked verbatim against [raw-rt].
  - **By symbol only:** `config.ts`, `server.ts` and `revisions.ts`, checked verbatim in [raw-cfg], [raw-srv] and [raw-rev].
  - **README:** by section, at 1249dda9ca ([raw-readme]).
  - **Integration tests:** by title, at 1249dda9ca ([raw-tconn]).
  - **A caution about the fetch tool.** It numbered lines wrongly when asked to reproduce a raw file. I used fetched files only for their text, never for their line numbers.
  - **Nothing was run.** Bash wasn't available: no build, no tests and no image pull.
- **Cube.** Behaviour is cited from two places:
  - `xcube/node_modules/@cubejs-backend/*` at 1.7.45;
  - the fork's own `packages/*` source at version 1.7.45 (for example `packages/cubejs-bigquery-driver/package.json` L5), for drivers that aren't installed under `xcube/node_modules`.

## Summary

**What slice 6 builds** ([c6a] message; [raw-readme] "Connections", "Admin API"):
1. **Sealing, scheme v1, on `node:crypto`.**
   - HPKE base mode, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM ([hpke] L3-13).
   - `info` is `wechart/data-source-secret/v1` ([cred] L17).
   - The AAD is `secretAadV1` over the driver's target keys ([cred] L42-48).
   - The plaintext is padded to 256-byte buckets ([cred] L50-67).
   - Envelopes are `{ v: 1, kid, enc, ct }` ([cred] L27-33).
   - It matches RFC 9180 A.1 ([t-hpke] L13-39), and interoperates with `hpke` 1.1.7 both ways ([t-hpke] L53-66; [t-cred] L105-121).
2. **Credential keys.**
   - Loaded at start from `XCUBE_CREDENTIAL_KEY_DIR`/`_KEY_IDS`/`_ACTIVE_KID`, with self-checks ([set] L105-115; [cred] L97-137).
   - `xcube-keygen` makes them ([kg]).
   - `GET /v1/semantic/credential-keys` and `POST /v1/semantic/credentials/rewrap` ([routes@c] L529-539).
3. **Connections per model:**
   - `PUT`/`GET`/`DELETE …/connections/{name}` and `…/health`;
   - `POST …/connections/test` ([routes@c] L541-586);
   - stored in the new tables `connections` and `connection_reports` (migration 6, [mig] L193-228);
   - served to Cube through a swappable driver per connection ([sw]; [conn@c] L298-387).
4. **Eight drivers** ([drv] L12, L89-291).
5. **Binding at publish.** It applies to models with connections only ([pub] L217-258, L353-358; [rt@c] L1568-1574).
6. **Per-model orchestrators and pre-aggregation schemas** ([raw-cfg] `contextToOrchestratorId`, `preAggregationsSchema`).
7. **Slice 8 (in the 1249dda9ca image only).** The queue heartbeat is 8 s, and a two-sided image check verifies that every field reaches its driver ([a8]).
8. **The partitions route** (917402f945). `POST …/pre-aggregations/partitions` takes and answers what Cube's `/cubejs-system/v1/pre-aggregations/partitions` does, under admin auth ([gw] L361-407; [routes@c] L463-470).

**What it means for wechart** (details in "What wechart must change"):
- **Pin `v1.7.45-1249dda9ca@sha256:460c1ab1…`.**
  - The TLS binding the user chose ([ans6] L8-15) exists only there ([atls]).
  - Compose and Helm still pin `c0610bb768` ([w-compose] L152, L182; [w-helm-values] L67; [w-helm-dd] L23).
- **AC-160 and `drivers.ts` become eight drivers.** Target flags must equal xcube's `target` lists at 1249dda9ca, not those in [w-cs] L188-197 or [indrv] L33-37.
- **AC-324.**
  - xcube refuses to start on a bad key, but it starts with no key at all when `XCUBE_CREDENTIAL_KEY_IDS` is unset ([set] L106-109).
  - wechart's development key has no `.check` yet ([w-infra-readme] L20-21; Glob of `infra/xcube/`).
- **AC-161 needs a rule for stale instance rows** (Gotcha 4).
- **AC-145 is unblocked** by an xcube route. It needs no playground secret.
- **After this image, every model's rollup tables move to `prod_pre_aggregations_<model>_<hash>`.** `e2e/jobs.spec.ts` L59-61 asserts the old schema.

## Install

- **No npm dependency in wechart for xcube.** The only import is `require('xcube')` in the image's `cube.js` ([w-cube] L17). The browser's `hpke` 1.1.7 is [w-cs]'s package, not this doc's.
- **xcube adds no runtime package for HPKE.**
  - `hpke` 1.1.7 is a devDependency only, used by the test oracle ([pkg] L66; [lock] L7624-7628, `"dev": true`; [oracle] L1-18).
  - The Dockerfile copies only `dist/src`, `package.json`, `NOTICE` and `README.md` ([df] L34-35).
- **The image.** For TLS-bound secrets, pull by digest:
  ```
  ghcr.io/senthilkrajagopal/xcube:v1.7.45-1249dda9ca@sha256:460c1ab1126993ce71e587919f1037319c06e0819845e717545a1354e68a6265
  ```
  `v1.7.45-fddc376f25@sha256:1c676ae2…7300` is slice 6 without the TLS binding (Gotcha 1).
- **What CI checked on the published images** ([wf] L75-83, L131-134; [rfd]; [rtls]):
  - the unit and integration suites against live Postgres 18 and MySQL 8.4 (plus Trino);
  - `serving.sh`, whose slice-6 block pushes a sealed `default` connection, queries through it and reads `"state":"live"` from health ([serving] L198-228);
  - `drivers-env.js` inside the image ([denv]).
  - **Dremio is not in CI.** Its suite runs only when `XCUBE_TEST_DREMIO_URL` is set, and the workflow doesn't set it ([t-drv] L7, L151-152; [wf] L77-83).
- **Environment variables** (read only when `XCUBE_DATABASE_URL` is set, [bin] L37-43):

| Variable | Default | Meaning | Source |
| --- | --- | --- | --- |
| `XCUBE_CREDENTIAL_KEY_IDS` | unset | Comma-separated kids to load. **Unset means no keys load and xcube starts anyway**; connections then fail with "xcube holds no credential key" | [set] L105-109; [conn@c] L220-222 |
| `XCUBE_CREDENTIAL_ACTIVE_KID` | the only kid | The kid re-wrap seals to. Required with several kids; must be one of them | [set] L110-113; [cred] L101-103 |
| `XCUBE_CREDENTIAL_KEY_DIR` | `/run/secrets/xcube-credential-keys` | Where `<kid>.pem` and `<kid>.check` are | [set] L114 |

- **Start-up refusals** (AC-324). Each throws from `start()`, before the database and before Cube loads ([rt@c] L517-522; [bin] L42, L52-55: exit 1):
  - `the active credential key <k> is not among XCUBE_CREDENTIAL_KEY_IDS` ([cred] L101-103);
  - `credential key <kid>: can't read <file> (<code>)` ([cred] L105-111);
  - `credential key <kid>: not an X25519 key` ([cred] L112-114);
  - `credential key <kid>: the key file doesn't match its id`, where the kid is the RFC 7638 thumbprint ([cred] L115-119, L69-72);
  - `credential key <kid>: can't read its sample credential <kid>.check (…)` ([cred] L121-126);
  - `credential key <kid> can't decrypt its sample credential` ([cred] L127-134).

  The sample is opened with `info` `wechart/xcube-key-check/v1`, AAD = the kid's bytes, and must unpad to `xcube-key-check` ([cred] L20-21, L128-129). Tested in [t-cred] L61-78.
- **Schema migration 6, `connections`** ([mig] L193-228). `minReader: 2`, additive (L196-197):
  - `connection_versions` sequence;
  - `connections (model → models ON DELETE CASCADE, name, folder_id, driver, auth_method, fields jsonb, sealed jsonb, revisions jsonb default '{}', version bigint, updated_at)`, keyed `(model, name)` (L202-214);
  - `connection_reports (model, name, instance, version, state, error, reported_at)`, keyed `(model, name, instance)` (L217-226).
  - `SCHEMA_VERSION` is 6 at these commits ([mig] L232 at the commit). So xcube's Postgres connections are named `xcube:v6:<instanceId>` ([db] L22-24).
  - No slice-6 code raises `min_reader`. The only `min_reader` write in `src` is slice 4's ([rev] L388, Grep).
- **Rollback.**
  - **Schema.** A slice-5 or earlier image reads a v6 schema. [migrate] L101-107 logs "newer than this xcube; running on". It refuses only when `min_reader` exceeds its version (L95-100); slice 4's rule still applies if security was ever turned on ([x4] Gotcha 13).
  - **Data, by reading.** Older code ignores `connections`. Cubes already published with bound full names (`data_source: fsales__warehouse`) then go to Cube's environment. With `CUBEJS_DATASOURCES` unset, Cube maps any name to the default connection's variables ([bind] §2; [c-env] L80-89). **So after a rollback they silently query the default database.**
  - **Rollups** go back to `prod_pre_aggregations` and build again there, unless old tables survived. UNVERIFIED whether Cube dropped them.
  - The working tree's migration 7 (`minReader: 2`, additive) is not in any image ([mig] L229-241).

## Init / auth pattern

### xcube's credential key, for compose and Helm

1. **Make the `.check` for wechart's existing development key.**
   - The key was made with `openssl genpkey` ([w-infra-readme] L8-9). `xcube-keygen <dir> <key.pem>` "makes the files for an existing key" ([kg] L7-9, L22-25).
   - In the image there is no `xcube-keygen` on `PATH`: the Dockerfile copies files and links no bin ([df] L34-37). CI runs it as below ([serving] L65-66):
     ```sh
     docker run --rm --user 1000 -v "$PWD/infra/xcube:/in:ro" -v "$SCRATCH:/keys" --entrypoint node \
       ghcr.io/senthilkrajagopal/xcube:v1.7.45-1249dda9ca@sha256:460c1ab1… \
       /cube/node_modules/xcube/dist/src/bin/keygen.js /keys /in/dev-credential-key.pem
     ```
   - It writes `<kid>.pem` (mode 0600, re-exported PKCS#8) and `<kid>.check`, prints the public JWK `{ kty: "OKP", crv: "X25519", x, kid }` on stdout, and a note on stderr ([kg] L22-27; [cred] L201-216).
   - The printed `kid` must equal `uYWeMx6i173fsiolFp1xi-qiav50k52AGinM56Y8JEw` ([w-jwk] L1). wechart's thumbprint serialises the same bytes as xcube's: `JSON.stringify({ crv, kty, x })` against the template `{"crv":"X25519","kty":"OKP","x":"…"}` ([w-key] L28-32; [cred] L70-72).
   - Commit only the `.check`. The sample envelope holds the fixed string `xcube-key-check` ([cred] L21, L209).
2. **Mount both files into `cube` and `cube-refresh-worker`**, beside today's `.pem` secret ([w-compose] L44-46, L173, L195). Then set `XCUBE_CREDENTIAL_KEY_IDS=uYWeMx6i173fsiolFp1xi-qiav50k52AGinM56Y8JEw` on both.
   - The worker builds rollups through connections, so it needs the keys ([raw-readme] "Credential keys": "Mount the Secret into every Cube process").
3. **Helm has no Cube-side key Secret yet.** Grep of `deploy/helm` finds only the public JWK ([w-helm-values] L37; [w-helm-api] L107). Add a Secret with `<kid>.pem` and `<kid>.check`, mounted into the Cube API and refresh-worker pods only, plus the env above ([w-cs] "xcube's private key in Kubernetes").
4. **Keep in the Cube environment:**
   - `CUBEJS_DATASOURCES` unset ([raw-readme] "Names and the environment"; Gotcha 10);
   - no `CUBEJS_DB_EXPORT_BUCKET*` (Gotcha 9).

   wechart's compose sets neither (Grep).
5. **`cube.js` is unchanged.** `config()` now also sets `contextToOrchestratorId`, `preAggregationsSchema` and `driverFactory` ([raw-cfg]). wechart's `cube.js` sets none of the three (Grep of `infra/cube/cube.js`).

### wechart's API: the order of calls

1. **Cross-check the kid.** At start and on a timer, call `GET /cubejs-api/v1/semantic/credential-keys` with a service token that names **no** model (or an admin token). Its configured kid must be listed, and `active: true` ([routes@c] L529-532; [cred] L140-142; [auth] L48-52).
   - This is [w-cs]'s "the only real pin", and T333's open note ([w-tasks] L5460).
   - `{ "keys": [] }` means xcube runs without keys (Install).
2. **Push folders** (`PUT …/folders`) before any non-root connection. A connection's folder must already be in the tree ([rt@c] L1506-1548: `Folder … is not in the folder tree`).
3. **Push connections** before publishing cubes that name them (Gotcha 5).
4. **Publish** (changesets or an items snapshot). xcube binds `data_source`.

## API surface we will use

All routes sit under Cube's `basePath` (`/cubejs-api`) and take admin auth: an `XCUBE_ADMIN_TOKENS` entry, or the RS256 service token ([auth] L18-55; [x4] "Admin authentication"). Model routes are `{basePath}/v1/semantic/models/{model}/…` ([routes] L284).

### Errors added by slice 6 ([routes@c] L298-303; 6b changed the status rule, [d6b])

| Code | Status | Body | When | Source |
| --- | --- | --- | --- | --- |
| `invalid_connection` | 400 | `error`, `problems: string[]` | Unknown driver or auth method; a field not of the driver and auth method; a secret sent in `fields`; a required field missing; an envelope's shape; a bad name for its folder; folder not in the tree; the driver's config refusing (e.g. port) | [conn@c] L169-216, L239-251; [rt@c] L1512-1548 |
| `in_use` | 409 | `error`, `problems` | Dropping a connection published cubes use | [rt@c] L1595-1601 |
| `driver_change` | 409 | `error`, `problems` | PUT with a driver other than the stored one's | [rt@c] L1512-1548 |
| `invalid_secret` | 422 | `error` | An envelope doesn't open for this target, **or** its kid isn't held, or the secret is empty | [conn@c] L219-236; [cred] L152-172 |
| `invalid_connection_name` | 400 | `error` | `{name}` isn't `^[a-z0-9_]{1,128}$` | [routes@c] L541-546 |
| `unknown_connection` | 404 | `error` | Health of a missing connection | [routes@c] L571-578 |
| `bad_request` | 400 | — | Joi failures | [routes@c] L155-176 |

### `GET /v1/semantic/credential-keys` (not per model)

- **Answer:** `200 { keys: [{ kid, x, active }] }`, from the loaded keys; `[]` without any ([routes@c] L529-532; [cred] L140-142).
- **Tested** ([t-conn] "the client gets xcube's credential key to seal to").
- **A service token naming a model is 403** here and on rewrap. `req.params.model` is undefined on these routes, and auth refuses any model mismatch ([auth] L48-52; [raw-readme] "Admin API").

### `POST /v1/semantic/credentials/rewrap` (not per model)

- **Request** ([routes@c] L167-176): `{ items: [{ ref: string ≤256, driver: string ≤64, field: string ≤64, fields: object, envelope: object }] }`, with 1 to 1,000 items.
- **Answer** ([routes@c] L534-539; [rt@c] L1627-1646): `200 { items: [{ ref, envelope } | { ref, error }] }`.
  - Each envelope is opened with its own kid and the AAD from `driver`, `field` and `fields`, then sealed to the active key with **the same `info` and AAD** ([cred] L175-197).
  - Errors are short texts: `xcube holds no credential key`, `unknown driver …`, `<field>: doesn't open for this connection target`, `can't be re-wrapped`.
  - It never returns plaintext ([t-conn] "a secret is re-wrapped…", which asserts `hunter2` is absent).
- **An envelope already under the active kid is sealed again** (new `enc`/`ct`). Nothing short-circuits ([cred] L175-197).

### `PUT …/connections/{name}`

- **Request** ([routes@c] L155-165):
  ```ts
  { folderId: string /* ≤64 */; driver: string; authMethod: string;
    fields?: Record<string, string | number | boolean | null>; sealed?: Record<string, SealedV1>;
    revisions?: Record<string, string /* ≤128 */> }
  ```
- **The name** ([rt@c] L1512-1524; [items] L7-16, L65-67):
  - it must be `fullNameOf(folderId, short)`: the short name when `folderId` is `froot`, `<folderId>__<short>` otherwise;
  - the short name must match `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`;
  - the folder must be `froot` or in the model's current tree.
  - Tested: `fnope__other` in an unknown folder is 400 ([t-conn] test 2).
- **Checks, in order:**
  1. **The driver can't change** (`409 driver_change`) ([rt@c] L1512-1548).
  2. **`Connections.validate`** ([conn@c] L169-216):
     - only the driver's connection fields and the auth method's non-secret fields;
     - a secret in `fields` is refused;
     - values are string, number, boolean or null, strings ≤ 64 KiB;
     - required non-secret fields must be non-empty;
     - `sealed` keys must be the auth method's secret fields, each passing `envelopeProblem`;
     - required secrets must be present.
  3. **Every present secret opens** for `(driver, field, fields)`. An empty required secret is refused ([conn@c] L219-236).
  4. **The driver config builds** ([conn@c] L239-251). **Nothing connects.**
- **Envelope shape** (`envelopeProblem`, [conn@c] L80-96):
  - keys exactly `ct, enc, kid, v`, with `v === 1`;
  - `kid` a string of 1-128 characters;
  - `enc` unpadded base64url (`^[A-Za-z0-9_-]+$`) of 32 bytes;
  - `ct` the same alphabet, 272 ≤ bytes ≤ 65,552, with `(bytes − 16) % 256 === 0`.
  - Tested in [t-uconn] L114-122.
- **Stored** ([raw-rev] `putConnection`). An upsert under a transaction:
  - it creates the model row if missing;
  - **`version = nextval(connection_versions)` on every PUT, changed or not**;
  - it sends `pg_notify(<schema>_revision, {model, connection, version})`.
- **Answer:** `200 { model, name, folderId, driver, authMethod, fields, secrets: [secret field names], revisions, version, updatedAt }`. It carries no `sealed` and no `enc` ([rt@c] L1550-1562; [routes@c] L562-569; [t-conn] test 2).
- **Applying it** ([conn@c] L340-387; [sw]):
  - the answering instance calls `connections.changed`; the others do so on the notification ([rt@c] `notified`) or on the poll's `connections.refresh()` ([rt@c] L1045-1046; [conn@c] L394-419);
  - for each live stable driver (per orchestrator and pre-aggregation flag), a newer version is built and tested (`testConnection()`, 30 s), then swapped in;
  - calls in flight, and streams they handed out, finish on the old driver, which is released when idle or after 30 min ([sw] L35, L63-70, L91-99, L122-163);
  - a failure keeps the old driver and reports `failed` ([conn@c] L366-385);
  - one change at a time per connection, never to an older version ([conn@c] L340-352, L362).
  - Tested: a PUT with another role and password is served with no restart ([t-conn] "a changed connection is swapped in while Cube runs, with no restart").

### `GET …/connections`, `DELETE …/connections/{name}`

- **`GET`:** `200 { model, connections: [<the PUT answer's view>] }`, ordered by name ([routes@c] L548-551; [raw-rev] `connections`).
- **`DELETE`** ([routes@c] L580-586; [rt@c] L1576-1605):
  - It refuses with `409 in_use` when any published cube (items mode only) is bound to the name. For `default`, that is any cube with no `data_source` that doesn't `extends`.
  - `problems` holds one string listing up to 20 `folderId/name`s ("froot/orders uses it").
  - Otherwise it deletes the row and that connection's reports, notifies, and answers **204 whether or not it existed**.
  - Live drivers then refuse calls with `Connection "<name>" was removed` ([sw] L73-76, L201-203).
  - Re-pushing restores them ([conn@c] L366-373).
  - Tested: [t-conn] "…nor can one published cubes use be dropped" and "a dropped connection pushed again serves again, with no restart".

### `GET …/connections/{name}/health`

- **Answer** ([routes@c] L571-578; [rt@c] L1607-1621; [raw-rev] `connectionReports`):
  ```ts
  { model, name, version /* stored */, revisions /* stored, current */,
    instances: [{ instance: string /* `${hostname}/${pid}/${6 hex}` */, version: number | null,
                  state: 'live' | 'failed', error: string | null, reportedAt: string, current: boolean }] }
  ```
  - The instance id format is from [rt] L408.
  - `current` is `version === stored version`.
  - `error` is `null`, not absent, when there is none.
- **When a row is written** ([conn@c] L281-284, L298-332, L366-385):
  - **only when an instance builds a driver**: first use, or a swap;
  - asynchronously, not awaited. The 1249dda9ca test polls for it ([t-conn] `reported`).
  - A failed swap writes `failed` **with the new version**, so `current: true`, while the old driver keeps serving.
- **No code removes rows of instances that are gone.** Only a `DELETE` of the connection removes rows ([raw-rev] `deleteConnection`; Grep of `connection_reports`: 3 statements).

### `POST …/connections/test`

- **Request:** `{ driver, authMethod, fields?, sealed? }` ([routes@c] L155-160, L553-560). The model in the path is used only for auth.
- **Answer:** always `200 { ok, checks: [{ id, status: 'passed' | 'failed' | 'skipped', durationMs, error? }] }` unless Joi refuses ([conn@c] L28-33, L426-480).

| Check | Does | Source |
| --- | --- | --- |
| `secrets` | `validate`, then opens each secret. Validation problems (even an unknown driver) fail here | [conn@c] L443-449 |
| `config` | `DRIVERS[d].config(...)` and `CubejsServerCore.createDriver(type, { …config, dataSource: 'xcube_connection_test', maxPoolSize: 1 })` | [conn@c] L456-461 |
| `connect` | `driver.testConnection()`, 30 s timeout | [conn@c] L467 |
| `schemas` | `driver.getSchemas()` if the driver has it, 30 s timeout; else skipped | [conn@c] L468-473 |

- A failed check skips the rest. The driver is released afterwards ([conn@c] L474-479).
- **Redaction** ([conn@c] L38-75). Each opened secret of 3 or more characters is replaced, as `[redacted]`, in these forms:
  - raw, JSON-escaped, URL-encoded, base64 and base64url;
  - the same forms of any string value of 8 or more characters inside a JSON secret (BigQuery's `private_key`).
  - Errors are cut to 2,000 characters.
  - Tested in [t-uconn] L88-103 and [t-conn] "the test route connects as Cube would, and never echoes a secret". A wrong Postgres password gives `/password authentication failed/`, and the secret is absent.

### Binding at publish (6b; T435, AC-273, AC-310)

- **When** ([rt@c] L1568-1574, L1290, L1365-1368, L1425, L2700, L2720):
  - every publish of a model **with at least one connection**: changesets, items snapshots and overlays;
  - `dataSources` is each connection's `{ folderId, short name }`;
  - with none, `data_source` is left as written ([t-names] L612-615).
- **`bindDataSource`**, for `kind === 'cube'` only, on items this publish resolves ([pub] L217-258, L353-358):
  - `data_source` (or `dataSource`) must be a non-empty string.
  - **A full name (containing `__`) is refused:** "is a full name; name the data source by its short name".
  - The name binds to the first folder on `tree.chain(folderId)` (the cube's folder, then its ancestors) that holds it, written as the full name. None found gives "It uses the data source "<n>", which no folder on this item's path holds" (`kind: 'reference'`, so the publish answers 422).
  - **No `data_source` and no `extends`:** the nearest `default`. When that is the root's (`default`), nothing is written.
  - **Views are not bound** (`def.kind === 'cube'`).
  - Tested in [t-names] L581-610 and [t-conn] "…bound at publish to the nearest one (AC-273)".
- **No rebinding.** Items not in the changeset keep their resolved YAML ([pub] L347-362; [raw-readme] "Binding at publish").

### Serving: which driver Cube gets (6a; [raw-cfg]; [raw-srv])

- **`driverFactory`** (type only) and **`resolveDriver`** (the driver), for a context naming a model:
  - a connection of that name gets its driver type and xcube's stable proxy;
  - otherwise, in a model with connections, any name but `default` throws `Data source "<n>" of model "<m>" has no connection`;
  - otherwise it is `cube.js`'s `driverFactory`, or Cube's environment (`CUBEJS_DB_TYPE`, …).
- **`contextToOrchestratorId`:** `STANDALONE_<model>` when the model has connections, else `STANDALONE` ([raw-cfg]).
  - Cube's `OrchestratorStorage` is an LRU of 100 by default. An evicted orchestrator is released: its drivers and queues go, and are rebuilt on next use ([c-os] L8-22; [c-srv] L68, L413-436).
- **`preAggregationsSchema`:** `modelSchema(base, model)` = `${base.slice(0,29)}_${model→[a-z0-9_], ≤20}_${sha256(model).hex[0..12]}`, for **every** context naming a model ([raw-cfg]; [t-uconn] L148-155: `prod_pre_aggregations_dev_<12 hex>`).
  - `base` is `cube.js`'s, else `CUBEJS_PRE_AGGREGATIONS_SCHEMA`, else `dev_`/`prod_pre_aggregations` ([raw-cfg]).
- **Introspection** lists the model's connections as data sources, beside the declared ones and those the model names ([gw] L582-613; [t-conn] AC-273 test).
  - Only when the context names the model (`modelOfContext`, [rt@c] L1497-1504).

### `POST …/pre-aggregations/partitions` (917402f945; AC-145)

- **Request:** `{ query: <Cube's partitions query> }`. It is optional: `req.body?.query ?? {}` ([routes@c] L463-470).
  - The keys are Cube's, validated by Cube: `preAggregations[{id, …}]`, `timezones`/`timezone`, `expand`, `metadata` ([w-sp] "Request and response shape").
- **What it does** ([gw] L361-407):
  - the context is `adminContext(model)`, pinned to the active revision, `{ wechartModel: model }` with no groups ([rt] `adminContext`);
  - named ids are routed to the modules owning their cubes; with none named, every module is asked with `preAggregations: []` (Cube reads `[]` as "all", [w-sp] L139);
  - each module's answer comes from Cube's own `getPreAggregationPartitions` ([c-gw] L641-684);
  - results are merged, keeping the first item per `preAggregation.id`;
  - the first module answering non-200 is returned as is.
- **Answer:** `200 { preAggregationPartitions: Item[] }`, with Cube's item shape ([w-sp] L149-184; [c-gw] L657-678).
- **Tested** ([t-switch] L205-220):
  - one named rollup gives one item with partitions and some `versionEntries`;
  - unnamed gives every module's rollups once.
- **Compared with Cube's system route** ([w-sp]):

| | `/cubejs-system/v1/pre-aggregations/partitions` | xcube `…/models/{model}/pre-aggregations/partitions` |
| --- | --- | --- |
| Served | Only with `CUBEJS_PLAYGROUND_AUTH_SECRET` ([w-sp] L48); xcube ignores that secret while serving ([x4] L120) | Whenever admin routes are on |
| Auth | HS256 over the playground secret; payload = security context | Admin token or RS256 service token |
| Path | Origin root, not under `basePath` | Under `basePath` |
| Context | The token's payload | The model's admin context; per module |
| Missing `query` | 400 `Query param is required` ([c-gw] L1786-1789) | Treated as `{}` |
| `preAggregations` omitted | 500 in practice ([w-sp] L139) | "All" (xcube sends `[]`) |
| "Continue wait" | HTTP 200 `{ error: 'Continue wait' }` ([c-gw] L1860-1867) | That module is **dropped silently** from the merge (Gotcha 11) |
| Schema and orchestrator | The token's context | The model's own schema; its own orchestrator when it has connections |

### The eight drivers, against wechart's `drivers.ts`

xcube's `DRIVERS` ([drv] L89-291). The field keys of the five kept drivers match [w-drv] L67-236 key for key. Differences in **bold**.

| Driver | Connection fields (required*) | Auth methods: fields (secret†) | v1 target @1249dda9ca | Target @fddc376f25 | wechart `target: true` today |
| --- | --- | --- | --- | --- | --- |
| postgres | host*, port (5432), database*, ssl (true), sslRejectUnauthorized (true), sslCa | password: user*, password†; client-certificate: user*, sslCert*, sslKey†, sslPassphrase† (optional) | host, port, **ssl, sslRejectUnauthorized, sslCa** ([drv] L97) | host, port ([drv@fd] L90) | host, port ([w-drv] L72-73) |
| redshift (new) | host*, port (5439), database*, ssl (true), sslRejectUnauthorized, sslCa | password: user*, password† | host, port, ssl, sslRejectUnauthorized, sslCa ([drv] L113) | host, port (L106) | absent |
| mysql (new) | host*, port (3306), database*, ssl (**false**), sslRejectUnauthorized, sslCa | password; client-certificate (as postgres) | host, port, ssl, sslRejectUnauthorized, sslCa ([drv] L132) | host, port (L125) | absent |
| snowflake | account*, region, warehouse*, role, database* | key-pair: username*, privateKey†, privateKeyPass† (optional); oauth: oauthToken†; password: username*, password† | account, region, warehouse ([drv] L157) | same | same ([w-drv] L106-108) |
| bigquery | projectId*, location | service-account: credentials† (a `service_account` JSON only) | projectId ([drv] L181) | same | same ([w-drv] L164) |
| mssql | host*, port (1433), database*, encrypt (false), trustServerCertificate (false) | sql-login: user*, password†; ntlm: domain*, user*, password†; entra-service-principal: tenantId*, clientId*, clientSecret† | host, port, **encrypt, trustServerCertificate** ([drv] L221) | host, port (L214) | host, port ([w-drv] L179-180) |
| oracle | connectString, host, port (1521), database | password: user*, password† | connectString, database, host, port ([drv] L246) | same | same ([w-drv] L220-226) |
| dremio (new) | url, host, port (9047), ssl (false), database | token: token†; password: user*, password† | host, port, url, **ssl** ([drv] L270) | host, port, url (L263) | absent |
| ~~databricks-jdbc~~ | — | — | not served ([drv] L12) | — | url ([w-drv] L131-159) |

- **Extra rules in `config()`**, refused as `400 invalid_connection` ([conn@c] L245-249):
  - oracle needs `connectString`, **or `host` and `database`** ([drv] L249-251). T360 handed on "connect string or host" ([w-tasks] L5627).
  - dremio needs `url` or `host`, and a `url` takes only `token` ([drv] L273-278).
  - port must be an integer 1-65535 ([drv] L44-50).
  - bigquery JSON must have `type: service_account`, `client_email` and `private_key`. Only those plus `private_key_id` and `project_id` pass through ([drv] L182-208; [t-uconn] L130-138).
- **Defaults are applied in `config()`, after the AAD** ([drv] L51, L54-67; [cred] L37-48). The binding sees the values as sent.

### Sealing, scheme v1, against [w-cs]

| Item | [w-cs] | xcube at 1249dda9ca | Verdict |
| --- | --- | --- | --- |
| Suite | base, KEM 0x0020, KDF 0x0001, AEAD 0x0001 (L130-131) | `KEM_ID 0x0020`, `KDF_ID 0x0001`, `AEAD_ID 0x0001`, base mode (`0x00` in `keySchedule`) ([hpke] L11-13, L72-82) | Match |
| `info` | UTF-8 `wechart/data-source-secret/v1` (L133) | [cred] L17 | Match |
| AAD | `JSON.stringify(["wechart/data-source-secret/v1", driver, field, sortedPairs])`, `""` for absent/null, `String(v)` (L184-187, L420-426) | [cred] L42-48, with keys from `DRIVERS[driver].target` | Same function; **the key lists differ** (table above) |
| Padding | `0x01 ‖ uint32be(len) ‖ UTF-8 ‖ zeros`, 256-byte buckets; strict unpad (L137-139, L428-444) | [cred] L50-67 (adds `pt.length >= 5`) | Match |
| Envelope | `{ v: 1, kid, enc (32), ct }` base64url (L141) | [cred] L27-33; shape rules above | Match. xcube requires **unpadded** base64url and **exactly** these four keys |
| kid | RFC 7638 thumbprint of `{"crv","kty","x"}` (L142-144) | [cred] L69-72 | Match; also [w-key] L28-32 |
| RFC 9180 A.1 | Known-answer test proposed (L131-132, L539) | [t-hpke] L13-39: opens A.1 seq 0, and seals it with `skEm` to exactly `pkEm` and `ct`. Every constant matches the RFC ([rfc]: info, pkEm, skEm, pkRm, skRm, pt, aad `436f756e742d30`, ct `f938558b…3c512a`) | Verified by source; not run here |
| `hpke` 1.1.7 interop | Cross-implementation test proposed (L180) | `hpke` 1.1.7 seals and xcube opens; xcube seals and `hpke` opens ([t-hpke] L53-66; [oracle]). Snowflake PEM through `hpke` ([t-cred] L105-121) | Verified by source; CI test job passed ([rfd]; [rtls]) |
| Low-order `enc` | RFC 9180 §7.1.4 ([w-x25519] L14) | `diffieHellman` throw → `Malformed envelope` ([hpke] L94-99); tested with all-zero `enc` ([t-uconn] L157-162) | Refused. Relies on OpenSSL's throw, observed on Node 26 in [w-x25519] L20; Node 24 not observed |
| Rotation | Re-wrap, same AAD (L284-298) | [cred] L175-197 | Match |

## What wechart must change

| Task / AC | Today | Under slice 6 (image 1249dda9ca) |
| --- | --- | --- |
| **Image pin** (compose, Helm) | `…-c0610bb768@sha256:d787e67c…` ([w-compose] L152, L182; [w-helm-values] L67; [w-helm-dd] L23) | `…-1249dda9ca@sha256:460c1ab1…`. It also brings slice 4, slice 5 and slice 8 ([x4]; [a8]) |
| **T333** (done; AC-324, AC-298) | `.pem` mounted by kid into both Cube services ([w-compose] L44-46, L173, L195); `.check` left to xcube ([w-infra-readme] L20-21) | Add `<kid>.check` via `keygen.js <dir> <existing.pem>` (Init step 1). Mount it; set `XCUBE_CREDENTIAL_KEY_IDS` on `cube` and `cube-refresh-worker`. Add the kid cross-check against `GET …/credential-keys` ([w-tasks] L5460). Helm needs the Cube-side Secret. AC-324's xcube half holds only with `XCUBE_CREDENTIAL_KEY_IDS` set (Gotcha 7) |
| **AC-160, T360, `drivers.ts`** | Six types incl. `databricks-jdbc` ([w-drv] L16-23; [w-spec] L674) | Eight types: add redshift, mysql, dremio with the fields above; drop databricks-jdbc ([indrv] L28-35). Needs the spec gate first (AC-160's text) |
| **AC-312, T335** | "host, port, account, workspace, warehouse, project or connect string" ([w-spec] L1102-1103; [w-tasks] L5476) | xcube refuses a changed TLS field too (`422 invalid_secret`, [t-conn] test 2). wechart's clearing rule must use the same keys: add ssl, sslRejectUnauthorized, sslCa (postgres, redshift, mysql), encrypt and trustServerCertificate (mssql), url and ssl (dremio); drop "workspace". The user decided it ([ans6] L8-15); AC-312's text needs amending |
| **T441** (AC-325, AC-298) | Plan: `V1_TARGET_KEYS` as [w-cs] L408-415 | `V1_TARGET_KEYS` = xcube's `target` at 1249dda9ca, frozen. The five AAD strings in [t-cred] L33-48 are ready-made cross-checks. Golden AAD and envelope vectors cover all eight drivers and the TLS fields ([ans6] L17-25). Envelopes must be unpadded base64url with exactly `v, kid, enc, ct`. A secret is ≤ 65,531 UTF-8 bytes (`ct` ≤ 65,552, [conn@c] L91-92). Seal and store `fields` exactly as the browser had them (Gotcha 2) |
| **T442** (AC-161, AC-327) | Not built (Grep of `packages/api/src/xcube`: no connections code) | `PUT/GET/DELETE /cubejs-api/v1/semantic/models/{model}/connections/{name}`, name = `fullNameOf(folder's xcube id, short name)`. Push folders first; PUT only on a real change (Gotcha 3); map the error table; reconcile from `GET …/connections` (fields, `secrets`, `revisions`, `version`); on delete, handle `409 in_use`. Every call is from wechart's server (AC-327) |
| **T361** (AC-159) | Path `POST /v1/semantic/connections/test` ([w-tasks] L5630) | `POST /cubejs-api/v1/semantic/models/{model}/connections/test`, `{ driver, authMethod, fields, sealed }`. The answer is 200 with `ok: false` on failures; allow at least 60 s (two 30 s steps). The "SQLSTATE 28P01" expectation is UNVERIFIED: xcube's test asserts only "password authentication failed". Redshift's `schemas` check reads Cube's `CUBEJS_DB_NAME` (Gotcha 8) |
| **T365** (AC-161) | "Waiting… until xcube reports every instance on the new settings" ([w-tasks] L5650-5657); path `PUT /v1/semantic/connections/{name}` | Per-model path. "Every instance live and current" needs a rule for rows of instances that are gone, and for instances that never built a driver (Gotcha 4; Open question 1). A type change is `409 driver_change`: it lands as a new data source name plus a republish of the cubes bound to the old one. xcube has no in-place type change |
| **T346** (AC-280) | Byte copy of the ciphertext ([w-tasks] L5536-5545) | Works for tests and pushes while the target is unchanged, since the AAD has no id ([cred] L42-48). Previews using a workspace's copies are **in no commit or image** (uncommitted migration 7 and overlay code) |
| **T435** (AC-273, AC-310) | Depends on T442 ([w-tasks] L6764-6772) | Built by xcube for models with connections. The e2e test must push folders and connections before publishing. Short names only: a hand-written full name is refused. Adding a nearer `default` or source later doesn't move published cubes until they are republished (Gotcha 5; Open question 3). Views aren't bound; `extends` inherits |
| **T443** (AC-310) | Seed from Helm values ([w-tasks] L6773-6779) | PUT `default` in `froot`, with a sealed password. How the Helm value gets sealed without wechart holding it is [w-cs] Open question 8. xcube's dist exports `sealSecretV1` "for tests and tools" ([cred] L218-227), and CI seals with it through `node -e` in the image ([serving] L198-211). Until seeded, the root `default` is Cube's `CUBEJS_DB_*` ([w-compose] L11-16) |
| **AC-145, T151 → T375** | Planned on the system route and playground secret ([w-tasks] L2784-2796, L5722-5725) | Use `POST /cubejs-api/v1/semantic/models/{model}/pre-aggregations/partitions` with the service token. Drop the playground secret. Keep [w-sp]'s derivation and zone rules (same Cube code). Treat a missing module result as possible (Gotcha 11). Rebuilds still go through the jobs API with the service token ([x4] "Jobs and Schedules") |
| **Pre-aggregation schema** | `e2e/jobs.spec.ts` L59-61 expects `prod_pre_aggregations.monthly_orders_by_status_month` | Becomes `prod_pre_aggregations_<model>_<12 hex>.…`. Rollups build again after the upgrade ([raw-readme] "Pre-aggregation schemas") |

## Gotchas

1. **Pin 1249dda9ca for TLS-bound secrets.**
   - At fddc376f25, postgres, redshift, mysql and mssql bind `host, port` only, and dremio `host, port, url` ([drv@fd] L90, L106, L125, L214, L263).
   - The AAD from wechart's TLS-bound keys then differs from xcube's, and every such envelope answers `422 invalid_secret` ([cred] L42-48, L152-172).
   - Snowflake, BigQuery and Oracle are unaffected.
   - Both sides keep the label `v1`. No envelope has been stored under the older keys, since T441 isn't built ([w-tasks] L6748).
2. **The AAD sees the values as sent, before defaults.**
   - An absent `ssl` binds as `""`, and `ssl: true` as `"true"`, though the driver treats both as on ([sumtls] L37-39; [cred] L42-48; [drv] L54-67).
   - wechart's API must not normalise `fields` between the browser and xcube: no default-filling, no dropping `false`, no trimming.
   - Any change of representation after sealing must still `String()` to the same value.
3. **Every PUT is a new version.** There is no "unchanged" answer ([raw-rev] `putConnection`: `nextval` on conflict too). Each PUT makes every instance holding a driver build, test and swap one ([conn@c] L354-387). PUT only on a real change.
4. **Health can't prove AC-161 as built:**
   - an instance reports only when it builds a driver ([conn@c] L281-332, L366-385; README "Each instance that built a driver…");
   - reports are written in the background;
   - **rows of instances that stopped are never deleted.** Instance ids change with every process start (`hostname/pid/random`, [rt] L408), so after a pod restart a stale row shows `current: false` forever ([raw-rev]; Grep);
   - a failed swap reads `current: true, state: 'failed'` while the old driver still serves ([conn@c] L378-385).
   - Require `live` **and** `current`, and settle stale rows with xcube (Open question 1).
5. **Binding is at publish, and nothing rebinds** ([pub] L347-362):
   - a cube published before its connection existed keeps `data_source` as written;
   - once the model has any connection, a non-`default` name that isn't a root connection fails at query time ([raw-srv] `resolveDriver`; [raw-cfg] `driverFactory`);
   - adding a nearer `default` doesn't move cubes already bound to the root's.
   - Push connections first, and republish the affected cubes.
6. **Only `default` may come from Cube's environment** in a model with connections ([raw-cfg]). wechart's compose `CUBEJS_DB_*` (sample-db) serves the root `default` until a root `default` connection exists ([w-compose] L11-16).
7. **xcube starts without keys when `XCUBE_CREDENTIAL_KEY_IDS` is unset** ([set] L105-109). Connections then fail at use with "xcube holds no credential key…" ([conn@c] L220-222). AC-324's refusal needs the variable set on every Cube process. wechart's cross-check catches an empty list.
8. **Redshift's catalog reads use Cube's `CUBEJS_DB_NAME`.**
   - `RedshiftPlainCredentialsProvider` gets `dbName` from the environment, not from the config ([c-rs] L99-120; [c-rscp] L7-16).
   - `getSchemas()` runs `SHOW SCHEMAS FROM DATABASE ${getDbName()}`, and external-schema listings do likewise ([c-rs] L202, L206, L228).
   - xcube's catalog view doesn't override `getSchemas` for Redshift ([views] L331-351).
   - So the test route's `schemas` check and introspection of a Redshift connection name compose's `sample` database (or `undefined`).
   - The image check doesn't see it: it inspects `config`, `options`, `poolConfig` and `getCredentials()` only ([denv] L101-107).
   - By reading; no Redshift was run (Open question 2).
9. **Export-bucket variables can stop drivers from building.**
   - BigQuery's constructor checks `CUBEJS_DB_EXPORT_BUCKET_TYPE` against `['gcp']` ([c-bq] L155-159).
   - Snowflake's constructor builds an export bucket from the environment and throws if it is incomplete, before xcube's `exportBucket: undefined` overrides it ([c-sf] L232-256, L360-384).
   - Keep all `CUBEJS_DB_EXPORT_BUCKET*` unset. The README names BigQuery only.
10. **Keep `CUBEJS_DATASOURCES` unset.** `assertDataSource` throws for undeclared names ([c-env] L80-89). That includes every connection name and the test route's `xcube_connection_test` ([conn@c] L456-461).
11. **The partitions route can hide "Continue wait".**
    - Cube answers it as HTTP 200 `{ error }` ([c-gw] L1860-1867).
    - `ownPartitions` treats any 200 as success and merges `body.preAggregationPartitions ?? []`, dropping that module's items with no error ([gw] L385-404).
    - By reading. Retry when a requested id is missing.
12. **Rollups rebuild once, and the old tables stay behind.** Every model's schema changes ([raw-cfg]). Whether Cube removes `prod_pre_aggregations.*` tables no model uses any more is UNVERIFIED.
13. **More than 100 models with connections on one process** evicts orchestrators. Their drivers and queues are released and rebuilt ([c-os] L8-22). This is churn, not failure.
14. **Races, by reading.**
    - `DELETE` checks users, then deletes, in separate steps with no lock against a concurrent publish ([rt@c] L1595-1605).
    - `DELETE default` with no `default` connection still answers `409 in_use` while any cube names none ([rt@c] L1576-1593).
15. **A name reused with another driver after a DELETE.**
    - PUT accepts it, since nothing is stored under the name ([rt@c] L1512-1548).
    - Instances that held the old driver report `failed` with "its driver changed … Cube must compile the model again", and keep refusing calls ([conn@c] L362-365; [sw] L201-203).
16. **`422 invalid_secret` covers three cases:** a changed target, an unknown kid (rotation) and an empty secret. Only the message tells them apart ([cred] L156-167; [conn@c] L229-232).
17. **Redaction limits.**
    - Secrets under 3 characters are not redacted ([conn@c] L68).
    - Error text is cut at 2,000 characters (L74).
    - Hex forms are not redacted; [w-cs] Gotcha 12 didn't ask for them.
18. **The test route answers 200 for almost everything.** Unknown drivers, bad fields and shapes come back as a failed `secrets` check, not 400 ([conn@c] L443-449).
19. **Dremio Cloud's `url` scheme is not checked.** An `http://` URL would send the token in clear ([drv] L271-288; [c-dremio] L93-94, L124-133). The scheme is bound, so changing it needs the token again.
20. **Introspection lists connections only for contexts naming the model** ([gw] L589-594). A service token for introspection must carry `wechartModel` ([x4] "The service token").
21. **Rolling upgrades.** `putConnection` has no `older_instances` guard ([rt@c] L1512-1548). A pre-slice-6 process serving the model ignores connections. Roll every Cube process first.
22. **"Always verifies"** for Snowflake and BigQuery rests on their SDKs' defaults. xcube passes no insecure option ([drv] L158-175, L201-207), and Cube's drivers have no TLS knob (Grep of both drivers' source). Whether the SDKs read environment variables that weaken verification is UNVERIFIED.
23. **Pool sizes and timeouts still come from Cube's environment** ([raw-readme] "Connections").

## Corrections

| Statement | Now | Source |
| --- | --- | --- |
| Caller's brief: the partitions route (917402f945) is a "later commit" | It is 6a's parent: reflog L10-11, and 6a's parent SHA is `917402f9…`. Images `…-917402f945`, `…-fddc376f25` and `…-1249dda9ca` carry it | [reflog]; [a6a] |
| Caller's brief: some later commits may have no image | 1249dda9ca has `v1.7.45-1249dda9ca@sha256:460c1ab1…`. Commits with no image of their own: 49581da2f1, 282f825c59 and 5c46e57c1f | [ghcr]; runs table |
| [w-cs] L188-197 and L408-415: `V1_TARGET_KEYS` (postgres/mssql host, port; databricks url) | xcube's `target` at 1249dda9ca (table above); databricks removed | [drv]; [atls] |
| [indrv] L33-37: add `redshift`/`mysql: ['host','port']`, `dremio: ['host','port','url']`; "scheme v1 stands" unchanged for existing drivers | Superseded by 1249dda9ca: TLS fields are added to postgres, redshift, mysql, mssql and dremio. The label stays `v1` | [atls]; [t-cred] L33-48 |
| [w-cs] L159-180, L374-379, Gotchas 10 and 15: `hpke` 1.1.7 in xcube, copied into the image; pass a `KeyPair` | xcube opens with its own RFC 9180 code on `node:crypto`. `hpke` is a test-only devDependency | [hpke] L1-9; [pkg] L66; [lock] L7628 |
| [w-cs] L541-546, L303, L287: proposed routes (`[{kid,x,active}]`; test body `{ driver, connection, authMethod, nonSecretAuthFields, sealed }`; re-wrap `{ ref, envelope, driver, field, target }`) | `{ keys: [...] }`; `{ driver, authMethod, fields, sealed }`; `{ ref, driver, field, fields, envelope }` ≤ 1,000 | [routes@c] L155-176, L529-560 |
| [w-cs] Open question 1 (TLS in the binding) | Answered: bound | [ans6] L8-15; [atls] |
| [w-cs] Open question 9 (does xcube store data sources?) | Yes: `xcube.connections`. The start check opens only `.check` files | [mig] L193-228; [cred] L97-137 |
| [w-cs] L327: instances report "the revision ids its live drivers were built from" | Each instance reports xcube's connection `version`. `revisions` is the stored connection's current map | [rt@c] L1607-1621 |
| [x4] L141 and Open question 4: AC-145 has no xcube replacement route | Built in 917402f945 | [apart]; [gw] L361-407 |
| [x4] L177: connections named `xcube:v4:…` | `xcube:v6:…` at these commits | [mig] L232 (commit); [db] L22-24 |
| [bind] §2 (via [x3a]/[x3b]): xcube passes `data_source` through | Still true in models without connections; bound in models with connections | [pub] L217-258; [t-names] L612-615 |
| [w-sp] Install / Init: the playground secret and the `wechartStore` token | Not used under xcube, which ignores the secret while serving ([x4] L120). The xcube route takes admin auth. Cube's response shape and derivation still apply | [routes@c] L463-470; [gw] L361-407 |
| [w-ct] Summary finding 3: drivers merge Cube's environment | Addressed by complete configs, checked in the image. Remaining: Redshift catalog `dbName`, export-bucket constructor checks, pools and timeouts | [drv] L1-10; [denv]; Gotchas 8, 9, 23 |
| [w-ct] finding 4 (Databricks needs the amd64-only JDK image) | Moot: Databricks is dropped | [indrv] L24; [drv] L12 |
| [w-tasks] T361, T365 paths `/v1/semantic/connections/…` | `/cubejs-api/v1/semantic/models/{model}/connections/…` | [routes@c] L553-578 |
| [w-infra-readme] L20-21: xcube's side makes the `.check` | wechart runs xcube's keygen on its own PEM ([in6] L44-45 asks wechart to commit a key made this way) | [kg] L7-9 |
| [in6] L79 and [sum6]: health `{ version, revisions, instances: [{ …, error?, … }] }` | Also `model` and `name`; `error` is `null` when none | [routes@c] L571-578; [raw-rev] `connectionReports` |

## Open questions / unverified

1. **For xcube (through the Cube-expert agent):** expire `connection_reports` of instances no longer connected (e.g. against `pg_stat_activity`'s `xcube:v6:` names), or add a heartbeat, so "every instance" is decidable (Gotcha 4). **For the user:** until then, what should AC-161's UI show with stale rows present?
2. **For xcube:** Redshift's `getSchemas` uses `CUBEJS_DB_NAME` (Gotcha 8). A fix could set the provider's `dbName`, or override `getSchemas` in the catalog view. UNVERIFIED by running; no Redshift, Snowflake, BigQuery, SQL Server or Oracle server was connected by xcube's tests ([c6a] message: PostgreSQL, MySQL 8.4, Dremio).
3. **For the user (AC-310, AC-273):** when a nearer `default` or source is added, or one is dropped from the path, should wechart republish the cubes it would now bind differently? xcube never rebinds on its own (Gotcha 5).
4. **For the user:** the image pin. The frontmatter names fddc376f25 as the caller asked, but the TLS decision needs 1249dda9ca, which also brings slice 8.
5. **For xcube:** report "Continue wait" from the partitions route rather than dropping the module (Gotcha 11).
6. **For the user:** require `https:` for Dremio Cloud URLs, and for Dremio Software `ssl: true` (Gotcha 19)?
7. **Seeding the root `default`** (T443) without wechart holding the password ([w-cs] Open question 8, still open).
8. **UNVERIFIED:**
   - the Dremio Software run: not in CI ([wf] L77-83); only [c6a]'s message claims it;
   - the "unknown/unknown" manifests are attestations;
   - Node 24.21.0 in the image throws on an all-zero X25519 result (observed only on Node 26 in [w-x25519] L20; tested in xcube's unit suite on CI's Node 24, [wf] L68-70);
   - `SQLSTATE 28P01` appearing in Cube's Postgres error text (T361);
   - Cube cleaning old `prod_pre_aggregations` tables;
   - the partitions route on a model with security on;
   - whether Snowflake's and Google's SDKs can be made to skip verification through their own environment variables;
   - an envelope `ct` at exactly the 65,552-byte cap passing Cube's request-size limit (`CUBEJS_MAX_REQUEST_SIZE`, [routes] L283).
9. **Not in any commit:** the working tree's overlay data sources (AC-280): migration 7, `overlayDriverFor`, `…_O_<overlay>_<version>` orchestrators. The input's "Not built yet" still holds for every image.
10. **Not viewed:** CI step logs and per-test output; the slice-8 failure's log ([r8]).

## Input claims checked

[in6] is `docs/inputs/2026-09-26-xcube-slice-6-contract.md`; [indrv] is `…-connections-drivers.md`; [sum6] and [sumtls] are xcube's notes. Lines are the input's.

| # | Claim (source line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Commits 49581da2f1 (6a) and 282f825c59 (6b); README "Connections", "Admin API" ([in6] L7) | Verified | [reflog] L11-12; [raw-readme] |
| 2 | Scheme v1 exactly: suite, `info`, `secretAadV1`, 256-byte padding, `{ v: 1, kid, enc, ct }` base64url ([in6] L11-16; [sum6] L12-16) | Verified; target lists differ from [w-cs] | [hpke] L11-13; [cred] L17, L27-67; table "Sealing" |
| 3 | Own RFC 9180 code on `node:crypto`, no new package; A.1 byte for byte; `hpke` 1.1.7 both ways, tested ([in6] L17) | Verified by source and CI; not run here | [hpke]; [t-hpke] L13-66; [rfc]; [pkg] L66; [rfd] |
| 4 | Drivers: the eight ([in6] L18) | Verified | [drv] L12 |
| 5 | Tested against PostgreSQL with a live swap, and MySQL 8.4 ([in6] L19-20) | Verified | [t-conn] swap test; [t-drv] L172-173; [wf] L44-54, L79 |
| 6 | Tested against Dremio Software ([in6] L21) | UNVERIFIED | Suite exists ([t-drv] L151-152) but runs only with `XCUBE_TEST_DREMIO_URL`, unset in CI |
| 7 | Test route per [w-ct] option (a): Cube's drivers, explicit config, staged checks, redacted errors ([in6] L22) | Verified | [conn@c] L426-480, L38-75 |
| 8 | No environment reaches a connection; image check under poisoned `CUBEJS_DB_*`/`PG*` ([in6] L23) | Partly | Config complete ([drv] L1-10) and checked in the image ([denv]; [wf] L133-134). Gaps: Gotchas 8, 9, 23. The two-sided check is in 5c46e57c1f only |
| 9 | BigQuery takes only a `service_account` key rebuilt from five fields ([in6] L24) | Verified | [drv] L182-208; [t-uconn] L130-138 |
| 10 | Empty secrets refused ([in6] L25) | Verified | [conn@c] L229-232; [t-uconn] L124-128 |
| 11 | Golden vectors requested; xcube will add a test ([in6] L26) | n/a (future) | [ans6] L17-25 |
| 12 | TLS fields bound (1249dda9ca); a change needs the secret again; the per-driver keys ([in6] L27-35; [sumtls] L8-21) | Verified, **at 1249dda9ca only** | [drv] L69-74, L97, L113, L132, L221, L270; [t-conn] test 2; [t-cred] L33-48 |
| 13 | Snowflake, BigQuery and Oracle have no setting that turns verification off ([in6] L35; [sumtls] L31-33) | Verified for Cube's drivers and xcube's configs; SDK internals UNVERIFIED | Grep of both drivers' source; [drv] L158-261 |
| 14 | Keys `<kid>.pem` (PKCS#8) and `<kid>.check` in `XCUBE_CREDENTIAL_KEY_DIR` (default `/run/secrets/xcube-credential-keys`), named by `…_KEY_IDS` ([in6] L39) | Verified | [set] L105-115; [cred] L104-126 |
| 15 | kid = RFC 7638 thumbprint ([in6] L40) | Verified | [cred] L69-72, L115-119 |
| 16 | Start refuses a missing file, a non-X25519 key, a thumbprint mismatch, or a `.check` that doesn't open (`info` `wechart/xcube-key-check/v1`, AAD the kid, padded `xcube-key-check`) ([in6] L41) | Verified; only when `…_KEY_IDS` is set (Gotcha 7) | [cred] L97-137, L20-21; [t-cred] L61-78; [bin] L42, L52-55 |
| 17 | `XCUBE_CREDENTIAL_ACTIVE_KID` names the key re-wrap seals to ([in6] L42) | Verified | [set] L110-113; [cred] L175-197 |
| 18 | `xcube-keygen <dir>` writes both files and prints the JWK; in the image `node /cube/node_modules/xcube/dist/src/bin/keygen.js <dir>` ([in6] L43) | Verified; `xcube-keygen` is not on the image's `PATH` | [kg] L16-27; [cred] L201-216; [serving] L65-66; [df] L34-37 |
| 19 | Given an existing PEM, it writes the `.check` ([in6] L44) | Verified; it writes a `.pem` too | [kg] L7-9, L22-25 |
| 20 | The Secret goes into every Cube process ([in6] L46) | Verified (README) | [raw-readme] "Credential keys" |
| 21 | `GET /v1/semantic/credential-keys` answers `{ keys: [{ kid, x, active }] }` ([in6] L47) | Verified | [routes@c] L529-532; [t-conn] test 1 |
| 22 | PUT body ([in6] L51-58) | Verified | [routes@c] L155-165 |
| 23 | Name: short in the root, `<folderId>__<name>` elsewhere ([in6] L60) | Verified | [rt@c] L1512-1524; [items] L65-67 |
| 24 | `fields` as the browser sealed with, secrets excepted; secrets bound to them ([in6] L61) | Verified | [conn@c] L169-216; [cred] L152-172 |
| 25 | Only the driver's and auth method's fields; required present; every secret opens; nothing connects ([in6] L62) | Verified | [conn@c] L239-251 |
| 26 | Answers `200` (secrets named), `400 invalid_connection`, `422 invalid_secret`, `409 driver_change` ([in6] L63-67) | Verified; also `400 invalid_connection_name` and `bad_request` | [routes@c] L298-303, L541-569; [t-conn] tests 2, 7 |
| 27 | Every Cube process applies it without a restart; built and tested, then swapped; running queries finish on the old driver; a failure keeps the old one ([in6] L68-71) | Verified; applies to instances holding a driver, others build on use | [conn@c] L354-387; [sw]; [t-conn] test 4; [t-uconn] L41-86 |
| 28 | `GET …/connections` without secrets ([in6] L73) | Verified | [rt@c] L1550-1566; [t-conn] test 2 |
| 29 | `DELETE` answers 204; Cube refuses its queries at once ([in6] L75) | Verified; "at once" on the answering instance, the others on notice | [routes@c] L580-586; [sw] L73-76; [raw-rev] `deleteConnection` |
| 30 | `409 in_use` naming the cubes; for root `default`, every cube naming none ([in6] L76) | Verified; ≤ 20 names in one problem string | [rt@c] L1576-1601; [t-conn] test 7 |
| 31 | Re-pushed, a dropped connection serves again with no restart ([in6] L77) | Verified | [conn@c] L366-373; [t-conn] test 8 |
| 32 | Health `{ version, revisions, instances: [{ instance, version, state, error?, reportedAt, current }] }` ([in6] L79) | Partly | Also `model` and `name`; `error` is `null` ([routes@c] L571-578) |
| 33 | "Every instance uses the new settings" = every instance `current: true` and `live` ([in6] L80) | Partly | Stale and absent rows (Gotcha 4) |
| 34 | Test route `{ driver, authMethod, fields, sealed }` → `{ ok, checks }` in order secrets, config, connect, schemas ([in6] L82-90) | Verified | [conn@c] L426-480; [t-conn] test 5 |
| 35 | Errors redacted of the connection's secrets ([in6] L91) | Verified, with limits (Gotcha 17) | [conn@c] L38-75; [t-uconn] L88-103 |
| 36 | Unsaved secrets: send stored envelopes; open only if the target is unchanged ([in6] L92) | Verified by design | [cred] L152-172; [t-conn] test 5 (`unopened`) |
| 37 | A service token naming a model can't use credential-keys or rewrap ([in6] L94) | Verified by reading | [auth] L48-52 |
| 38 | Rewrap `{ items: [{ ref, driver, field, fields, envelope }] }` ≤ 1,000 → `{ items: [{ ref, envelope } \| { ref, error }] }`, active key, same binding, no plaintext ([in6] L96) | Verified | [routes@c] L167-176, L534-539; [rt@c] L1627-1646; [t-conn] test 6 |
| 39 | A model's data sources are its connections; only `default` falls back to `CUBEJS_DB_*`; others refused; models without connections use the environment ([in6] L100-102) | Verified | [raw-cfg] `driverFactory`; [raw-srv] `resolveDriver` |
| 40 | A model with connections gets its own orchestrator; Cube keeps at most 100 ([in6] L103-104) | Verified; exceeding means LRU eviction | [raw-cfg] `contextToOrchestratorId`; [c-os] L8-22; [c-srv] L68 |
| 41 | Every model gets `<schema>_<model>_<hash>`; rollups rebuild after upgrading ([in6] L105-106) | Verified | [raw-cfg]; [t-uconn] L148-155 |
| 42 | Keep `CUBEJS_DATASOURCES` unset ([in6] L107) | Verified | [c-env] L80-89 |
| 43 | An export bucket type such as `s3` stops BigQuery from building ([in6] L108) | Verified; Snowflake is affected too (Gotcha 9) | [c-bq] L155-159; [c-sf] L360-384 |
| 44 | Binding nearest-first, never a sibling's or descendant's; the full name is written; unknown and hand-written full names refused (422) ([in6] L113-115) | Verified | [pub] L217-258; [t-names] L581-596; [t-conn] AC-273 test |
| 45 | No `data_source` → nearest `default`; root's → nothing written ([in6] L116) | Verified | [pub] L250-256; [t-names] L598-610 |
| 46 | `extends` inherits ([in6] L117) | Verified | [pub] L250; [t-names] L604-609 |
| 47 | No rebinding ([in6] L118) | Verified by reading | [pub] L347-362 |
| 48 | Changesets, snapshots and overlays all bind ([in6] L119) | Verified by reading | [rt@c] L1290, L1365-1368, L1425, L2700, L2720 |
| 49 | Introspection lists a model's connections ([in6] L121) | Verified | [gw] L589-594; [t-conn] AC-273 test |
| 50 | AC-280 in previews not built ([in6] L125; [sum6] L45) | Verified for every commit and image | [raw-readme] (no mention); working tree only |
| 51 | Cube 1.7.45 ships `@cubejs-backend/dremio-driver`, in Cube's image ([indrv] L11) | Verified | Fork `packages/cubejs-dremio-driver/package.json` L5; the in-image driver check builds `dremio` ([denv] L59-60; [rfd]) |
| 52 | Databricks needs the amd64-only JDK image ([indrv] L24) | Not re-checked | [w-ct] finding 4 |
| 53 | Redshift fields and defaults (5439, ssl true, verify true) ([indrv] L44-55) | Verified | [drv] L108-124, L54-67 |
| 54 | Redshift IAM only from the environment ([indrv] L57) | Verified | [c-rs] L99-113 |
| 55 | MySQL fields and defaults (3306, ssl false) ([indrv] L59-74) | Verified | [drv] L82-87, L125-145 |
| 56 | Target keys `host`, `port` for Redshift and MySQL ([indrv] L76) | Superseded by 1249dda9ca | [drv] L113, L132 |
| 57 | Dremio shapes, fields, "url or host"; Cloud takes a token only ([indrv] L78-96) | Verified | [drv] L262-290; [c-dremio] L52-105 |
| 58 | Dremio targets `host, port, url` ([indrv] L98) | Superseded: + `ssl` | [drv] L270 |
| 59 | Dremio has no custom CA option ([indrv] L100; [sumtls] L27-29) | Verified | [c-dremio] L52-105 |
| 60 | `V1_TARGET_KEYS` additions; the existing drivers' binding unchanged ([indrv] L33-37) | Superseded (Corrections) | [atls] |
| 61 | Image `…-fddc376f25@sha256:1c676ae2…`, amd64 and arm64; slice 6 plus a CI fix; 282f825c59 published nothing ([sum6] L49-51) | Verified | [ghcr-fd]; [afd]; [r6b] |
| 62 | Asked: are TLS fields outside the binding acceptable? ([sum6] L41) | Answered: bound | [ans6] L8-15 |
| 63 | 1249dda9ca: a test turns `sslRejectUnauthorized` off with the stored envelope and gets 422 ([sumtls] L8) | Verified | [t-conn] test 2 (`unverified`) |
| 64 | MySQL passes the three fields as its `ssl` object ([sumtls] L25) | Verified | [drv] L133-143; [c-my] L139-153 |
| 65 | Pairs sorted, values as sent before defaults, absent is `""`; the example AAD string ([sumtls] L37-40) | Verified | [cred] L42-48; [t-cred] L37-39 |

[head]: /Users/srajagopal/Work/bi/cube/.git/HEAD
[ref]: /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (1249dda9ca7570cb7218ab2cdd4a28065fa15058)
[fork-ref]: /Users/srajagopal/Work/bi/cube/.git/refs/remotes/fork/feat/xcube (same SHA)
[reflog]: /Users/srajagopal/Work/bi/cube/.git/logs/refs/heads/feat/xcube
[c6a]: https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233
[p6a]: https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233.patch ("29 files changed, 3102 insertions(+), 13 deletions(-)")
[d6a]: https://github.com/senthilkrajagopal/cube/commit/49581da2f140e8f577de2726b4cea7cdf63f2233.diff
[a6a]: https://api.github.com/repos/senthilkrajagopal/cube/commits/49581da2f140e8f577de2726b4cea7cdf63f2233
[a6b]: https://api.github.com/repos/senthilkrajagopal/cube/commits/282f825c59f49b26e990344f4303e0fde0acceb7
[d6b]: https://github.com/senthilkrajagopal/cube/commit/282f825c59f49b26e990344f4303e0fde0acceb7.diff
[afd]: https://api.github.com/repos/senthilkrajagopal/cube/commits/fddc376f251c0ff83bb4d2ed52a5ddd8b1d2dd89
[a8]: https://api.github.com/repos/senthilkrajagopal/cube/commits/5c46e57c1fda28d00db4ec583a07431bdc36726b
[atls]: https://api.github.com/repos/senthilkrajagopal/cube/commits/1249dda9ca7570cb7218ab2cdd4a28065fa15058
[apart]: https://api.github.com/repos/senthilkrajagopal/cube/commits/917402f94502cd8cafc5fb8da03a343c81141034
[r6a]: https://api.github.com/repos/senthilkrajagopal/cube/commits/49581da2f140e8f577de2726b4cea7cdf63f2233/check-runs (run 36265008587)
[r6b]: https://api.github.com/repos/senthilkrajagopal/cube/commits/282f825c59f49b26e990344f4303e0fde0acceb7/check-runs (run 36265224499)
[rfd]: https://api.github.com/repos/senthilkrajagopal/cube/commits/fddc376f251c0ff83bb4d2ed52a5ddd8b1d2dd89/check-runs (run 36265603448)
[r8]: https://api.github.com/repos/senthilkrajagopal/cube/commits/5c46e57c1fda28d00db4ec583a07431bdc36726b/check-runs (run 36266112398)
[rtls]: https://api.github.com/repos/senthilkrajagopal/cube/commits/1249dda9ca7570cb7218ab2cdd4a28065fa15058/check-runs (run 36267036958)
[ghcr]: https://github.com/users/senthilkrajagopal/packages/container/xcube/versions?filters%5Bversion_type%5D=tagged
[ghcr-fd]: https://github.com/users/senthilkrajagopal/packages/container/xcube/1299277445?tag=v1.7.45-fddc376f25
[ghcr-pkg]: https://github.com/users/senthilkrajagopal/packages/container/package/xcube (latest: v1.7.45-1249dda9ca, version 1299332765)
[raw-readme]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/README.md
[raw-rt]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/runtime/runtime.ts
[raw-conn]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/connections/connections.ts
[raw-cfg]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/config.ts (`modelSchema`; `createConfig` → `contextToOrchestratorId`, `preAggregationsSchema`, `driverFactory`)
[raw-srv]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/server.ts (`createOrchestratorApi`, `resolveDriver`; no `orchestratorStorage` override)
[raw-rev]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/store/revisions.ts (`connections`, `putConnection`, `deleteConnection`, `reportConnection`, `connectionReports`)
[raw-tconn]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/test/integration/connections.test.ts
[raw-ovc]: https://raw.githubusercontent.com/senthilkrajagopal/cube/1249dda9ca7570cb7218ab2cdd4a28065fa15058/xcube/src/overlays/connections.ts (404)
[rfc]: https://www.rfc-editor.org/rfc/rfc9180.txt (Appendix A.1.1)
[cred]: /Users/srajagopal/Work/bi/cube/xcube/src/credentials/credentials.ts (= 1249dda9ca)
[hpke]: /Users/srajagopal/Work/bi/cube/xcube/src/credentials/hpke.ts (= 1249dda9ca)
[drv]: /Users/srajagopal/Work/bi/cube/xcube/src/connections/drivers.ts (= 1249dda9ca)
[drv@fd]: the same file at fddc376f25: working − 7 from L76 (hunk `@@ -66,6 +66,13 @@`, [atls])
[conn@c]: /Users/srajagopal/Work/bi/cube/xcube/src/connections/connections.ts at 1249dda9ca (commit lines, Provenance)
[sw]: /Users/srajagopal/Work/bi/cube/xcube/src/connections/switchable.ts (= 1249dda9ca)
[kg]: /Users/srajagopal/Work/bi/cube/xcube/src/bin/keygen.ts (= 1249dda9ca)
[bin]: /Users/srajagopal/Work/bi/cube/xcube/src/bin/server.ts
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
[auth]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts (working tree)
[routes@c]: the same file at 1249dda9ca (commit lines, Provenance)
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts (working tree; `instanceId`, `adminContext`)
[rt@c]: runtime.ts at 1249dda9ca (= 282f825c59; lines from the 6a and 6b hunk headers, text checked in [raw-rt])
[mig]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts (L1-228 = commit; L229-241 uncommitted)
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
[db]: /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
[rev]: /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts (working tree)
[pub]: /Users/srajagopal/Work/bi/cube/xcube/src/names/publish.ts (= 1249dda9ca)
[items]: /Users/srajagopal/Work/bi/cube/xcube/src/names/items.ts
[gw]: /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts (= 1249dda9ca)
[views]: /Users/srajagopal/Work/bi/cube/xcube/src/catalog/views.ts
[pkg]: /Users/srajagopal/Work/bi/cube/xcube/package.json
[lock]: /Users/srajagopal/Work/bi/cube/xcube/package-lock.json
[df]: /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
[wf]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[t-cred]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/credentials.test.ts (= 1249dda9ca)
[t-hpke]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/hpke.test.ts
[oracle]: /Users/srajagopal/Work/bi/cube/xcube/test/fixtures/hpke-oracle.mjs
[t-uconn]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/connections.test.ts
[t-names]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/names.test.ts
[t-conn]: xcube/test/integration/connections.test.ts at 1249dda9ca, by title ([raw-tconn])
[t-drv]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/connection-drivers.test.ts
[t-switch]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/switch.test.ts
[denv]: /Users/srajagopal/Work/bi/cube/xcube/test/image/drivers-env.js (= 1249dda9ca)
[serving]: /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
[c-os]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/OrchestratorStorage.js (1.7.45)
[c-srv]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js (1.7.45)
[c-gw]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
[c-env]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/shared/dist/src/env.js (1.7.45)
[c-bq]: /Users/srajagopal/Work/bi/cube/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts (1.7.45)
[c-rs]: /Users/srajagopal/Work/bi/cube/packages/cubejs-redshift-driver/src/RedshiftDriver.ts (1.7.45)
[c-rscp]: /Users/srajagopal/Work/bi/cube/packages/cubejs-redshift-driver/src/RedshiftCredentialsProvider.ts
[c-sf]: /Users/srajagopal/Work/bi/cube/packages/cubejs-snowflake-driver/src/SnowflakeDriver.ts (1.7.45)
[c-dremio]: /Users/srajagopal/Work/bi/cube/packages/cubejs-dremio-driver/driver/DremioDriver.js (1.7.45)
[c-my]: /Users/srajagopal/Work/bi/cube/packages/cubejs-mysql-driver/src/MySqlDriver.ts (1.7.45)
[in6]: /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-xcube-slice-6-contract.md
[indrv]: /Users/srajagopal/Work/wechart/docs/inputs/2026-09-26-connections-drivers.md
[sum6]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1700-slice-6-built.md
[sumtls]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1800-tls-target-keys.md
[ans6]: /Users/srajagopal/Work/xcube-exchange/to-xcube/2026-09-26-1730-slice-6-answers.md
[bind]: /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-09-26-1030-data-source-binding.md
[x3a]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3a.md
[x3b]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-3b.md
[x4]: /Users/srajagopal/Work/wechart/docs/research/xcube-slice-4.md
[w-cs]: /Users/srajagopal/Work/wechart/docs/research/credential-sealing.md
[w-ct]: /Users/srajagopal/Work/wechart/docs/research/connection-testing.md
[w-sp]: /Users/srajagopal/Work/wechart/docs/research/cube/system-partitions.md
[w-x25519]: /Users/srajagopal/Work/wechart/docs/research/x25519-public-key-checks.md
[w-drv]: /Users/srajagopal/Work/wechart/packages/core/src/data-sources/drivers.ts
[w-key]: /Users/srajagopal/Work/wechart/packages/api/src/secrets/xcube-key.ts
[w-jwk]: /Users/srajagopal/Work/wechart/infra/xcube/dev-credential-key.pub.jwk
[w-infra-readme]: /Users/srajagopal/Work/wechart/infra/xcube/README.md
[w-cube]: /Users/srajagopal/Work/wechart/infra/cube/cube.js
[w-compose]: /Users/srajagopal/Work/wechart/docker-compose.yml
[w-helm-values]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml
[w-helm-dd]: /Users/srajagopal/Work/wechart/deploy/helm/values/docker-desktop.yaml
[w-helm-api]: /Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/api.yaml
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md
[w-tasks]: /Users/srajagopal/Work/wechart/docs/tasks.md
