---
library: xcube slice 2 (the user's Cube fork)
packages: [xcube]
version: 'xcube at 83cb9f0888 on Cube v1.7.45'
researched: 2026-09-26
sources:
  - /Users/srajagopal/Work/bi/cube/xcube/README.md
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/snapshot.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/validate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/model/errors.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/lane.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/runtime/listener.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/bin/server.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
  - /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
  - /Users/srajagopal/Work/bi/cube/xcube/bootstrap.sql
  - /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
  - /Users/srajagopal/Work/bi/cube/xcube/package.json
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/snapshot.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/admin.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/runtime.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/config.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/gateway.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/unit/errors.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/revisions.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/integration/store.test.ts
  - /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
  - /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
  - /Users/srajagopal/Work/bi/cube/packages/cubejs-docker/latest.Dockerfile
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server/dist/src/server.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server/dist/src/server/container.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/shared/dist/src/env.js (1.7.45)
  - /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/{CompileError,DataSchemaCompiler,YamlCompiler}.js (1.7.45)
  - https://github.com/nodejs/node/blob/main/doc/api/crypto.md#hashupdatedata-inputencoding
---
> **Saved 2026-09-26** from the integration-researcher's report, verbatim below this note. It verifies docs/inputs/2026-09-26-xcube-slice-2-contract.md against the fork. The decisions it marks for the user are asked in round R29 (docs/requirements.md).

# xcube slice 2 (xcube at 83cb9f0888 on Cube v1.7.45)

**Provenance.**
- Bash wasn't available, so I read the fork's working tree with Read and Grep. `.git/HEAD` is `ref: refs/heads/feat/xcube`, and that ref is `83cb9f088801fe22dfef3b62d100f7153a900fe8` ([head]).
- I could not run `git status`, so uncommitted edits in the working tree can't be ruled out. Every xcube citation below is "the `feat/xcube` working tree whose tip is 83cb9f0888".
- Cube's own behaviour is cited from `xcube/node_modules/@cubejs-backend/*` at 1.7.45, the versions xcube pins ([pkg] L23-37). The published `cubejs/cube:v1.7.45` image the Dockerfile builds on was not inspected.
- The `docs/research` siblings that touch this subject are `per-folder-models.md` (superseded, [w-pfm] L24-35), `whole-model-publish.md` (one point conflicts with the input; see Open questions) and `ha-topology.md`. None of them corrects an xcube claim made here.

## Summary

xcube is a package over an unmodified Cube 1.7.45. It runs in every Cube process (API instances and the refresh worker) and does three things:
- It serves one or more **models**, each a whole wechart data model, from its own Postgres schema. Each import makes an immutable, numbered **revision**. Every process compiles a revision before switching to it, and pins each request to one compiled revision ([readme] L56-86; [rt] L166-170).
- It adds token-protected admin routes for importing and checking snapshots ([routes] L88-99).
- It keeps its introspection API ([readme] L222-374).

Nothing in xcube's source calls wechart: a grep of `xcube/src` for `fetch(`, `http.request`, `https.request`, `axios` and `undici` finds nothing.

What the contract requires of wechart, in order. The user's open decisions are marked **Decision**.

1. **Deploy.**
   - Run `bootstrap.sql` once per database with `psql`, as a role that may create roles and schemas ([boot] L5-10).
   - Set `XCUBE_DATABASE_URL` on every Cube process, and `XCUBE_ADMIN_TOKENS` on API instances only ([readme] L117-125; [routes] L106-110).
   - Make `infra/cube/cube.js` a call to `require('xcube').config(…)` with no `contextToAppId`, `repositoryFactory` or `schemaVersion` ([cfg] L21, L49-53).
   - Run the new image for both the API and the worker ([readme] L51-54).
2. **Make the whole published file set importable.**
   - Every path must match xcube's path rule (see "Path rules" below).
   - Every file must be plain YAML with no `{{`, `}}`, `{%` or `%}` anywhere in its content, unless Cube runs with `XCUBE_FILE_TYPES=all` ([snap] L20-25, L86-92).
   - **Decision:** wechart's seeded model holds a Jinja file, `infra/cube/model/cubes/product_catalog.yml` ([w-pc] L4, L7), and `AC-140` depends on such files ([w-spec] L495). Under the default setting, xcube refuses every whole-model snapshot that contains it.
3. **Import.**
   - Read `GET …/revision`. A `404 unknown_model` means the model has never been imported, so the base is `null` ([routes] L149-156).
   - Compare `current.contentHash` with the hash of the files ([snap] L119-121).
   - Otherwise `PUT …/snapshot` with `baseRevision`, and handle 201/200/409/422/400/413/401/503/500 ([routes] L116-215).
4. **Check a publish before importing it** with `PUT …/snapshot?dryRun=true`: `files`, `securityContext`, and optionally `probes` with `compare` ([routes] L162-175; [rt] L1089-1108).
5. **Sign query tokens as today (HS256, `CUBEJS_API_SECRET`), adding the claims.**
   - `wechartModel` names the model. `wechartRevision` names the oldest revision the answer may come from ([cfg] L55-59; [rt] L384-405).
   - Handle `503` with `Retry-After: 2`, and `403` ([rt] L464-473, L501-505).
6. **Record what xcube acknowledged:** `generation`, `revision` and `contentHash`. When `generation` changes, the recorded revision no longer means anything ([mig] L22-28; [t-store] L196-202; Gotcha 8).

## Install

wechart installs no npm package: it talks to xcube over HTTP and through Cube's JWT claims. The one import is `require('xcube')` in `infra/cube/cube.js`, which runs inside the image, where the package is `/cube/node_modules/xcube` ([df] L26-31); hence `packages: [xcube]` (T447, 2026-09-26).

**Image.**
- Build from `~/Work/bi/cube/xcube` with `docker build -t xcube:v1.7.45-$(git rev-parse --short=10 HEAD) .` ([df] L5-7; [readme] L48).
- With HEAD at `83cb9f088801…` the tag is `xcube:v1.7.45-83cb9f0888` ([head]).
- The image is `FROM cubejs/cube:${CUBE_VERSION}` (`v1.7.45`). It copies the package's compiled `dist/src` and its `package.json`, and nothing from its `node_modules`.
- `CMD` is `node /cube/node_modules/xcube/dist/src/bin/server.js` ([df] L12, L26-31). Don't give the services a `command`; wechart's compose already says so ([w-dc] L78-80).
- The server refuses to start on any Cube other than the `peerDependencies` version, `1.7.45` ([bin] L17-29; [pkg] L23-30).

**User.**
- Neither xcube's Dockerfile ([df]) nor the fork's `packages/cubejs-docker/latest.Dockerfile` ([c-docker] L26-60) sets `USER`, so the image runs as whatever the runtime picks. That is root, unless the runtime overrides it; this is an inference from the Dockerfiles, and the published image wasn't inspected.
- CI boots it `--user 1000`, "as the non-root user Helm runs it as" ([ci] L111-117; [t-img] L39).

**Database bootstrap** ([boot] L1-16):
```sql
SELECT 'CREATE ROLE xcube LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xcube') \gexec
ALTER ROLE xcube WITH LOGIN PASSWORD :'xcube_password' CONNECTION LIMIT 64;
SELECT format('GRANT CONNECT ON DATABASE %I TO xcube', current_database()) \gexec
CREATE SCHEMA IF NOT EXISTS xcube AUTHORIZATION xcube;
```
- Run it as `psql -v ON_ERROR_STOP=1 -v xcube_password=… -d wechart_meta -f bootstrap.sql` ([boot] L8; [readme] L95).
- It needs `psql`, because it uses `\gexec` and the psql variable `:'xcube_password'` ([boot] L6, L13-15).
- "Running it again changes nothing but the password" ([boot] L10).
- It also grants `CONNECT` on the current database and sets `CONNECTION LIMIT 64` ([boot] L14-15).
- The schema name `xcube` is hard-coded, so a non-default `XCUBE_DATABASE_SCHEMA` needs its own bootstrap ([boot] L16; [set] L70).
- xcube's own CI runs this script against Postgres 18 ([t-img] L29-32; [ci] L88-92, L127-128).

**Migrations.** On start, xcube creates and migrates its own tables under the advisory lock `pg_try_advisory_lock(hashtext('<schema>.migrate'))`, so any number of processes may start together. It waits up to 5 minutes for another process's lock ([migrate] L24-54; [t-store] L43).

**Environment** ([set] L52-87; [readme] L121-137):

| Variable | Default | Where |
| --- | --- | --- |
| `XCUBE_DATABASE_URL` | unset: introspection only, no model serving | every Cube process (API and worker) |
| `XCUBE_ADMIN_TOKENS` | unset: admin routes off | API instances only |
| `XCUBE_DATABASE_SCHEMA` | `xcube` (`^[a-z_][a-z0-9_]{0,62}$`, [db] L6) | |
| `XCUBE_MIGRATE` | `true` | |
| `XCUBE_POLL_INTERVAL_MS` / `_DOWN_MS` | `60000` / `10000` | |
| `XCUBE_RETIRE_GRACE_MS` | `300000` | |
| `XCUBE_KEEP_REVISIONS` | `50` (minimum 1) | |
| `XCUBE_MAX_SNAPSHOT_BYTES` | `33554432` | |
| `XCUBE_FILE_TYPES` | `yaml` (`yaml` or `all`, any case; anything else stops start-up) | |
| `XCUBE_MAX_MODELS` | `1000` | |
| `XCUBE_COMPILE_QUEUE` / `XCUBE_COMPILE_WAIT_MS` | `4` / `120000` | |
| `XCUBE_CATCH_UP_MS` | `10000` | |
| `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT` | the entry point sets `'2'` when it is unset (`??=`). This is not a Dockerfile `ENV` ([bin] L34-35) | |

**Connections.** Each process opens a pool of at most 4 connections plus one `LISTEN` client ([db] L27-40), against the role's limit of 64 ([boot] L14). Every connection sets `statement_timeout=30000` and `idle_in_transaction_session_timeout=60000` ([db] L16-25).

**Start-up** ([bin] L31-55; [rt] L255-338; [srv] L115-118):
1. It checks the Cube version.
2. With `XCUBE_DATABASE_URL` set, it builds the runtime and `start()`s it before Cube loads `cube.js`.
   - It connects and migrates, retrying with backoff (1 s doubling to 30 s, with jitter) for as long as it takes.
   - It exits (code 1) on these errors instead: a migration checksum mismatch, a schema that needs a newer xcube, `XCUBE_MIGRATE=false` while migrations are pending, or `schema … does not exist and this role may not create it … run the xcube bootstrap` ([rt] L264-279; [migrate] L56-68, L86-114; [bin] L52-55).
   - It then starts `LISTEN xcube_revision` and reads every model's head ([rt] L283-301).
3. Cube starts. `listen()` first calls `attach()`:
   - If `cube.js` did not call `config()`, attach throws `xcube: XCUBE_DATABASE_URL is set, but cube.js does not use require('xcube').config()`. Cube prints `Fatal error during server start` and exits 1 ([rt] L321-326; [c-cont] L152-162; [t-rt] L485).
   - Otherwise it runs each known model's sync (compile and switch). A model that fails to compile is logged, not fatal, and an earlier revision is tried as a fallback ([rt] L328-337, L943-956).
   - Only then does Cube listen on its port ([srv] L115-118).
4. Environment errors stop the process before anything listens ([set] L59-66; [bin] L37, L52-55): an admin token shorter than 32 characters or outside `[A-Za-z0-9._~-]`, a token equal to `CUBEJS_API_SECRET`, or a bad number.

## Init / auth pattern

### cube.js

The signature is `config(options?: { modelClaim?: string; revisionClaim?: string; withoutModel?: 'disk' | 'refuse' }, cube?: Record<string, any>): Record<string, any>` ([cfg] L7-18, L106-114). The defaults are `xcubeModel`, `xcubeRevision` and `disk` ([cfg] L55-59). The input's file, verified against this:

```js
module.exports = require('xcube').config(
  { modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' },
  {
    contextToGroups: ({ securityContext }) =>
      securityContext && Array.isArray(securityContext.groups)
        ? securityContext.groups.filter((group) => typeof group === 'string')
        : [],
    contextToApiScopes: async (securityContext, defaultScopes) => {
      const defaults = defaultScopes.filter((scope) => scope !== 'introspection');
      if (securityContext && securityContext.wechartIntrospection === true) return ['introspection'];
      return [...defaults, 'jobs'];
    },
  },
);
```

- **Keys xcube owns.** `contextToAppId`, `repositoryFactory` and `schemaVersion` throw `xcube.config(): <key> belongs to xcube; remove it from cube.js` ([cfg] L21, L49-53; [t-cfg] L38-42).
- **Composed with xcube's.**
  - `extendContext`: the user's result is kept, minus any `xcubePin` or `xcubeCandidate` ([cfg] L85-90; [t-cfg] L62-71).
  - `scheduledRefreshContexts`: the user's list is kept, each entry pinned to its model's active revision; entries naming a model with no active revision are dropped ([cfg] L91; [rt] L565-591; [t-rt] L321-343).
  - The default refresh list is `{ securityContext: {} }` (the disk model, when `withoutModel` is `disk`) plus `{ securityContext: { wechartModel: <m> } }` for each model active on this process ([rt] L568-575; [t-rev] L366-372).
- **Passed through.** Everything else is passed through with `...cube`, including `contextToGroups` and `contextToApiScopes` ([cfg] L71-72; [t-cfg] L52-57).
  - xcube's gateway takes `introspection` out of what `contextToApiScopes` grants before Cube checks the rest, and puts it back afterwards ([gw] L91-115).
  - Cube's other allowed scopes are `graphql`, `meta`, `data`, `sql` and `jobs`, and its defaults are `graphql, meta, data, sql` ([c-gw] L114, L2085).
- **`allowNodeRequire`** defaults to `false` ([cfg] L92; [t-cfg] L57-59).
- **Compiler-cache TTL.** `maxCompilerCacheKeepAlive` and `updateCompilerCacheKeepAlive` are neither refused nor overridden: xcube's source never mentions them (grep), and they pass through.
  - Cube sets its LRU `ttl` from them ([c-core] L116-122, L134-136).
  - On a miss, `getCompilerApi` builds a new `CompilerApi` from `repositoryFactory` ([c-core] L373-396). An expired active revision is therefore recompiled from memory on the request path, outside xcube's compile lane.
  - Removing both options, as the input proposes, is consistent with this. xcube does not enforce it.
- **Retiring.** xcube itself retires a replaced revision once `XCUBE_RETIRE_GRACE_MS` (5 min) has passed. It checks every 30 s, and never while a refresh run holds the revision ([rt] L906-909, L958-972; [srv] L91-102).
- **Without the database.** `config()` without `XCUBE_DATABASE_URL` throws `require('xcube').config() needs the xcube server, started with XCUBE_DATABASE_URL set` ([cfg] L106-113; [t-cfg] L27-29).
- **A token with no model** gets Cube's own `schemaPath` directory (`cube.schemaPath` or `CUBEJS_SCHEMA_PATH`, default `model`) through `FileRepository` ([cfg] L65-66, L74-78; [c-env] L211-213). With `withoutModel: 'refuse'` it gets `403 The security context names no model` ([rt] L441-446, L490-493).

### Admin authentication

- Send `Authorization: Bearer <one of XCUBE_ADMIN_TOKENS>`. The header must match `/^Bearer\s+(\S+)$/i` ([auth] L18-19).
- Each configured token is compared by SHA-256 digest with `timingSafeEqual`, without an early exit ([auth] L4-27).
- A failure answers `401`, with header `WWW-Authenticate: Bearer realm="xcube"` and body `{ "error": "A valid xcube admin token is required", "code": "unauthorized" }` ([auth] L28-33).
- A Cube JWT is refused: tested with `jwt.sign({}, TOKEN)` ([t-admin] L36).
- **Token format.** `XCUBE_ADMIN_TOKENS` (plural; there is no singular variable) is split on `,`, and each entry is trimmed with empties dropped. Each token must be at least 32 characters of `[A-Za-z0-9._~-]` and not equal to `CUBEJS_API_SECRET` ([set] L58-66).
  - This is checked only when `XCUBE_DATABASE_URL` is set ([set] L53-56).
  - Only `CUBEJS_API_SECRET` is compared ([set] L63).
- **Cube's routes.** The admin routes are registered before Cube's and without `checkAuth`, so Cube's authentication and scopes don't apply to them ([gw] L75-84; [routes] L96-98).
  - An admin token on a Cube route goes through Cube's JWT `checkAuth`. A non-JWT answers `403 { "error": "Invalid token" }` ([t-gw] L158-164). No test sends an admin token itself to a Cube route.
- **Admin routes off.** With no tokens (the worker), the routes are not registered and answer 404 ([routes] L106-110; [t-admin] L42-46).

### Query tokens

- Nothing in xcube changes how Cube authenticates: its own `checkAuth` verifies the JWT ([readme] L21-30).
- xcube's tests sign HS256 with the API secret ([t-img] L64-69; [t-rev] L184). wechart keeps signing as today.
- The claims are read from `securityContext`, or `authInfo` ([rt] L384-405, L440).

## API surface we will use

- The base is `{basePath}/v1/semantic/models/:model`. Cube's `basePath` defaults to `/cubejs-api` ([routes] L114; [readme] L141-145, L244-245).
- wechart's `CUBE_API_URL` defaults to `http://localhost:4000/cubejs-api` ([w-cfg] L129).
- The route parameter must match `MODEL_ID`, or the route answers `400 { error, code: "invalid_model_id" }` ([routes] L78-84; [t-admin] L56-57).
- Bodies are parsed by Cube's global `bodyParser.json({ limit: CUBEJS_MAX_REQUEST_SIZE })`. The default limit is `50mb`; the allowed range is 100 KB to 64 MB ([c-srv] L60; [c-env] L198-207).
- xcube's own image check sends `Content-Type: application/json` ([t-img] L57).

### Error body

- Admin errors are `{ error: string, code: string, ...details }` ([routes] L121-145). The codes:

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `bad_request` | Joi validation, or a bad `dryRun` value |
| 400 | `invalid_model_id` | the model id |
| 400 | `invalid_path` | a file path |
| 400 | `duplicate_path` | the same path twice |
| 400 | `invalid_file_type` | a file type the setting refuses |
| 401 | `unauthorized` | the admin token |
| 404 | `unknown_model` | GET of a model with no row |
| 409 | `conflict` | the base isn't the current revision |
| 413 | `too_large` | a limit |
| 422 | `invalid_snapshot` | the files don't compile |
| 503 | `busy` | the compile lane is full; sets `Retry-After = ceil(retryAfterMs/1000)` and body `retryAfterMs` |
| 503 | `unavailable` | a `CubejsHandlerError` 503, or a database error (Postgres codes `08*`, `57P*`, `53*`, or connection errors) |
| 500 | `internal` | anything else |

- `SnapshotError` checks stop at the first problem: file count, then per file in order its path, duplicate, type and size, then total bytes ([snap] L71-107).
- Joi uses `abortEarly: true` ([routes] L70-76).
- **Malformed JSON and bodies over `CUBEJS_MAX_REQUEST_SIZE`** fail in Cube's global parser, before xcube's handler runs. Cube's error middleware is registered last ([c-gw] L474). Its `handleError` answers anything that isn't a `CubejsHandlerError`, an orchestrator error or a `UserError` with `500 { error: e.toString() }` ([c-gw] L1843-1903).
  - Expected result: `500`, not `400`/`413`. By reading only; UNVERIFIED at runtime.

### `PUT …/snapshot`: import

Request ([routes] L18-42):
```ts
{
  baseRevision: number | null;   // required; an integer ≥ 1, or null. Missing → 400; 0 → 400 ([t-admin] L91-92)
  files: { path: string; content: string }[];  // required; may be []; content may be ""
  source?: object;               // a JSON object of ≤ 4096 bytes (JSON.stringify, UTF-8); default {}
}
```
Unknown keys, such as `probes`, answer 400 ([t-admin] L94). `?dryRun=false` or no `dryRun` means import. Any value other than `true` or `false` answers 400 `dryRun is true or false` ([routes] L162, L176-178).

What happens ([rt] L1115-1147; [rev] L166-265):
1. The files are checked (paths, types, limits) and hashed.
2. The head is read.
   - The same `contentHash` as the current revision gives `200`, whatever the base.
   - `(head?.revision ?? null) !== baseRevision` gives `409`.
3. The files are compiled as a throwaway candidate: `securityContext` `{ [modelClaim]: model }`, no probes, compile priority `Import`.
4. The files are stored in one transaction under `SELECT … FOR UPDATE` on the model row, with `lock_timeout 10s`. The same unchanged and conflict rules run again inside the transaction.
5. `pg_notify('xcube_revision', '{"model":…,"rev":…}')` fires on commit.

Responses:
- **201** `{ model, generation, revision, created: true, contentHash }` ([routes] L206-212; [t-admin] L76-79)
- **200** the same fields with `created: false` ([t-rev] L224-227; [t-store] L149-166)
- **409** `{ error: "The model changed since the snapshot's base revision", code: "conflict", currentRevision: number | null, currentContentHash: string | null }` ([routes] L185-190)
- **422** `{ error: "The model does not compile", code: "invalid_snapshot", contentHash, errors: ModelError[], cubeMessage: string | null }`. Nothing is stored ([routes] L191-197; [t-rev] L246-269)
- **400 / 413 / 401 / 503 / 500**: see the table above.

Revision numbers are `max(rev) + 1` per model. The first import with `baseRevision: null` creates the model row and revision 1 ([rev] L172, L196-200; [t-store] L134-147; [t-rev] L199-201). An empty `files` is stored as a revision ([t-store] L190-194).

**Retention.** Only the newest `XCUBE_KEEP_REVISIONS` revisions are kept. Each distinct content is stored once per model ([rev] L239-255).

`ModelError` ([err] L6-13):
```ts
{ path: string | null; line?: number; column?: number; kind: 'yaml' | 'compile'; message: string }
```
- **YAML errors.** Every plain YAML file (a `.yml`/`.yaml` file with no Jinja tag) is parsed with `js-yaml` first. If any fails, only the YAML errors return: `line` and `column` are 1-based, from `e.mark` when present, and `cubeMessage` is `null` ([val] L56-60; [err] L23-42; [t-rev] L253-256). Cube's own YAML compiler also uses `js-yaml` ([c-yc] L40).
- **Compile errors** are parsed from the text of Cube's `CompileError` ([err] L109-145).
  - The `<file> Errors:` group heading sets `path`, but only when the path is one of the snapshot's own.
  - `line` comes from the code frame's `> N |` line, and `column` from the caret.
  - `path: null` errors whose message starts `<name> cube` or `<name> view` are moved to the file that defines that name in a top-level `cubes:`/`views:` list, or in a `cube(`/`view(` call in JS ([err] L44-89; [t-err] L43-70).
  - If nothing parses, the result is a single `{ path: null, kind: 'compile', message }` ([val] L69-80).
- **`cubeMessage`** is `String(e)` ([val] L73, L80). Cube's `CompileError extends Error` with message `Compile errors:\n…` ([c-ce] L4-11), so this is `Error: Compile errors:\n…`.
  - `/v1/meta` answers the same error as `500 { error: e.toString(), … }` ([c-gw] L1893-1901).
  - The integration test asserts the prefix ([t-rev] L265).

### `PUT …/snapshot?dryRun=true`: check only

Request ([routes] L44-57):
```ts
{
  files: { path: string; content: string }[];     // required
  securityContext?: object;                         // ≤ 16384 bytes of JSON; default {}
  probes?: { id: string /* ≤ 512 chars */; query: object /* ≤ 16384 bytes of JSON */; compare?: boolean /* default false */ }[]; // ≤ 1000; default []
  baseRevision?: number | null; source?: object;    // accepted, and ignored by dryRun ([rt] L1089-1094)
}
```
It answers `200` with ([rt] L1095-1107):
```ts
{ model, contentHash, currentRevision: number | null, sameAsCurrent: boolean,
  valid: boolean, errors: ModelError[], cubeMessage: string | null,
  probes: { id: string;
            candidate: { status: number; error?: string };
            current?: { status: number | null; error?: string; revision?: number; skipped?: 'no_current_revision' } }[],
  durationMs: number }
```
- **Checks and errors.** The path, type and limit checks, and the `busy`/`unavailable` errors, apply as for an import ([rt] L1095, L1022-1030).
- **The current revision is this instance's.** `currentRevision` and `sameAsCurrent` describe the revision active on the answering Cube process, not the database head ([rt] L1097, L1103-1104).
- **How probes run** ([rt] L139-151, L1031, L1054-1077; [val] L56-91):
  - Probes run only when the files are valid, one at a time, inside the same compile-lane slot as the candidate's compile.
  - Each calls Cube's `ApiGateway.sql({ query, context, res })`, the method the `GET` and `POST /v1/sql` routes call ([c-gw] L259-292).
  - The context's `securityContext` and `authInfo` are the body's `securityContext` with `[modelClaim]: model` set over it. It carries `xcubeCandidate`, so it resolves to the candidate.
  - `sql()` asserts the `sql` scope through `contextToApiScopes` ([c-gw] L1123, L2102-2108). `getNormalizedQueries` applies `applyRowLevelSecurity` (access policies) and then `queryRewrite` ([c-gw] L1070-1072). `getSql` generates SQL ([c-gw] L1125).
  - Probes do not pass through Cube's `checkAuth`, `contextRejectionMiddleware` or the user's `extendContext` ([rt] L1055-1060).
- **What a probe reports.**
  - `status` is the status `handleError` chose, or 200. `error` is the body's `error` ([rt] L145-148).
  - `400` is a `UserError` or orchestrator error ([c-gw] L1869-1891).
  - A `CubejsHandlerError` keeps its own status, for example `403 API scope is missing: sql` ([c-gw] L1851-1858, L2106).
  - Anything else is `500`. `500 "No answer"` means `res` was never called ([rt] L141).
- **`compare: true`.**
  - It runs only when the candidate's status is not 200 (any non-200, not only 400) ([rt] L1062).
  - It re-runs the probe pinned to this instance's active revision, giving `current: { status, error?, revision }`. With no active revision it gives `{ status: null, skipped: 'no_current_revision' }` ([rt] L1063-1076).
- **Word-for-word refusals.** The integration test checks that a candidate refusal equals `/v1/sql`'s `error` word for word once that model is live ([t-rev] L294-301). The probes' compare path is tested at L271-293.

### `GET …/revision`

- `200` `{ model, generation, current: { revision, contentHash, files, bytes, createdAt, source } | null, instance }` ([rev] L104-128; [rt] L1011-1014).
  - `instance` is `{ revision: number | null, state: 'active' | 'activating' | 'failed' | 'none', error?: string }`, which is what *the answering process* serves ([rt] L109-113, L999-1009).
  - `current` is `null` only when a model row exists with no revision. `404 { error: 'Unknown model "<id>"', code: "unknown_model" }` is the answer for a model never imported ([routes] L152-154; [t-rev] L221).

### Token claims (query path)

- **`wechartModel`** must be a string matching `MODEL_ID`. `null` or absent means "no model", which gets the disk model and the response header `x-xcube-revision: disk` ([rt] L384-393, L490-495; [t-rev] L314-317).
- **Invalid values give 403.**
  - A non-string or invalid model id: `403 Invalid model id in the security context` ([rt] L389-391; [t-rev] L323).
- **`wechartRevision`** may be a safe integer ≥ 1 or a digit string. Anything else is `403 Invalid revision in the security context` ([rt] L395-405; [t-rev] L324; [t-rt] L300-301).
- **Serving** ([rt] L512-562):
  - The active revision serves the request if it is at least `wechartRevision`, or if there is no claim.
  - Otherwise the request triggers a fresh database read and sync (including the compile) and waits up to `XCUBE_CATCH_UP_MS` (10 s).
  - If still behind, it answers `503 Model "<m>" revision <n> is not active on this instance yet` with `Retry-After: 2` ([rt] L501-505, L557-560; [t-rt] L264-289).
  - After a successful fresh read, a revision higher than the database's current is answered from the current one, provided this process is active on it ([rt] L523-528; [t-rev] L327-330).
- **Unknown model.** `403 Unknown model "<m>"` is answered only after a database read found no such model. That result is cached for 60 s per process, and a notification for the model clears it ([rt] L464-473, L536-538, L613-618, L757-766; [t-rt] L291-308; [t-rev] L319-321).
- **Other 503s.**
  - Database unreachable, or model not loaded yet: `503 Model "<m>" is not loaded on this instance yet`.
  - Model known but no revision compiles here: `503 … has no revision that compiles on this instance yet` ([rt] L464-473).
  - Every 503 from `pinFor` carries `Retry-After: 2` ([rt] L501-505).
- **Response headers.** `x-xcube-revision: <model>@<revision>` and `x-xcube-generation: <uuid>` are set on success for model tokens. Only `x-xcube-revision: disk` is set for tokens with no model ([rt] L494, L507-508; [t-rev] L207-208).
  - They are set by `extendContext`, which Cube calls from `requestContextMiddleware` ([c-gw] L1806-1817, L2160-2176). Only requests through that middleware carry them, and xcube's own 403/503 answers do not.
- **Cube's error body.** On Cube's routes errors are `{ error: e.message }`, with no `code` ([c-gw] L1851-1858).

## Path rules for folder-qualified file names

The rule ([snap] L20-22, L80-92):
```
FILE_PATH = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:ya?ml|js|jinja|py)$/
MAX_PATH_LENGTH = 512   (path.length)
with XCUBE_FILE_TYPES=yaml, also: /\.ya?ml$/ on the path and no /{%|%}|{{|}}/ in the content
```
- **Segments.** Each `/`-separated segment starts with `[A-Za-z0-9_]` and continues with `[A-Za-z0-9_.-]`. The last segment ends in a lower-case `.yml` or `.yaml`. The regex has no `i` flag, so `.YML` is refused.
- **Case.** Paths are case-sensitive, and duplicates are exact-string matches ([snap] L83-85).
- **Order.** The hash sorts with JS `<`, which is byte order for these ASCII paths: `-` < `.` < `/` < digits < upper case < `_` < lower case ([snap] L15-19, L57-64; [t-snap] L25-28).

| Path | Result | Source |
| --- | --- | --- |
| `a.yml`, `cubes/orders.yaml`, `_a/b-c.d.yml` | accepted | [t-snap] L43-45 |
| `0123456789abcdef0123456789abcdef/orders.yml` (a 32-hex segment) | accepted | regex |
| `froot/cubes/orders.yml`, `f1a2…/x.yml` | accepted | regex |
| a UUID with hyphens as a segment | accepted | regex |
| `a.b/c.yml`, `a..b.yml` (dots inside a segment) | accepted | regex |
| `x/y/z.js`, `m.jinja`, `p.py` | pass `FILE_PATH`. Refused `400 invalid_file_type` under `yaml`, accepted under `all` | [t-snap] L43-45, L55-67 |
| `../a.yml`, `a/../b.yml`, `.hidden.yml` (any segment starting with `.`, including `.` and `..`) | `400 invalid_path` | [t-snap] L48-51 |
| `/a.yml` (leading slash), `a/` (trailing slash), `a//b.yml`, `""` | `400 invalid_path` | [t-snap] L49 |
| `a b.yml`, `ü.yml` (space, non-ASCII) | `400 invalid_path` | [t-snap] L49 |
| `u@x/a.yml` (`@`), `~u/a.yml` (`~`), `-x/a.yml` (segment starting with `-`) | `400 invalid_path` | regex |
| `a.txt`; 513 or more characters | `400 invalid_path` | [t-snap] L49, L52 |
| a YAML file whose content has `{{`, `}}`, `{%` or `%}` anywhere, comments and strings included | `400 invalid_file_type` under `yaml` | [snap] L25, L86-92 |

- The `invalid_file_type` message is `<path>: only plain YAML models are taken (no JavaScript, Python or Jinja)` ([snap] L87-91).
- The Jinja pattern is the one Cube uses to decide whether to render a YAML file as Jinja ([c-dsc] L24). wechart's `publish.ts` uses the same pattern ([w-pub] L55).
- **Limits** ([snap] L40-45; [set] L76-80):
  - at most 10,000 files (fixed);
  - at most 4 MiB of UTF-8 content per file (fixed);
  - at most `XCUBE_MAX_SNAPSHOT_BYTES` (32 MiB) of content in all;
  - the whole HTTP body within `CUBEJS_MAX_REQUEST_SIZE`.
- **wechart's own rule differs.** `MODEL_PATH = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ya?ml$/` ([w-pub] L33):
  - it accepts segments starting with `-`, which xcube refuses;
  - it refuses `.` inside a segment, which xcube accepts;
  - it has no length cap.

## Gotchas

1. **The whole snapshot is refused over one file.** The seed reads `.js`, `.py`, `.jinja` and dot-files from the model directory into `model_files` ([w-rd] L6-11, L29-40; [w-main] L42-43). The shipped model holds the Jinja file `cubes/product_catalog.yml` ([w-pc] L4, L7). Pushing "the whole published file set" under the default `XCUBE_FILE_TYPES=yaml` answers `400 invalid_file_type` for every import until this is resolved ([snap] L86-92).
2. **Jinja detection covers `}}` and `%}` as well as `{{` and `{%`.** It scans the whole content, so a nested YAML flow mapping (`{a: {b: 1}}`) or a description containing `}}` is refused ([snap] L25).
3. **The import answers before the switch.** `201` returns when the database commits. The importing process then switches asynchronously ([rt] L1142-1146). To read its own write, even on the same Cube process, wechart's token needs `wechartRevision`.
4. **A never-imported model is a 404.** `GET …/revision` answers `404 unknown_model` for it, not `current: null` ([routes] L152-154). Treat that 404 as "base `null`".
5. **Dry-run results are per instance.** `currentRevision`, `sameAsCurrent` and `compare` use the answering instance's *active* revision ([rt] L1097, L1064). The database head is `GET …/revision`'s `current`.
6. **The unknown-model result is cached for 60 s.** If a process read the database before the first import and then missed the notification, it answers `403 Unknown model` for up to 60 s, even to a token with `wechartRevision`: the absent check comes before the fresh read ([rt] L536-538, L764).
7. **A revision that failed to compile on one process.** Tokens naming it get `503` at once on that process until the retry backoff (30 s × 4ⁿ, capped at 10 min), not after the 10 s wait ([rt] L781-783, L919-928; [t-rt] L444). Without the claim, that process would keep serving the previous revision ([rt] L520-521).
8. **A new generation.** Emptying or recreating xcube's schema restarts the revisions at 1 with a new `generation` ([t-store] L196-202). A wechart recorded revision above the new current makes *every* request on every process do a database read and wait for it ([rt] L520-555). Reset the recorded revision when `generation` changes.
9. **Catch-up time includes the compile.** Each process has one compile lane: `Activate` runs before `Import`, which runs before `DryRun`, and a running compile is never interrupted ([lane] L1-9, L31-35).
   - A dry run's compile and all of its probes hold the lane together ([val] L63-90). A large check can push a catch-up past 10 s, which answers `503`.
   - `busy` sets `Retry-After` to `ceil(XCUBE_COMPILE_WAIT_MS/1000)`, 120 by default. That is the configured wait, not an estimate ([lane] L71-72; [routes] L127-130; [t-admin] L117-119).
10. **Compile count per import.** The receiving process compiles an import twice: once as a candidate, then again to activate it. Every other process compiles it once ([rt] L1133, L1022-1086, L829-882).
11. **The query path can read the database.** It reads nothing when the active revision satisfies the request ([t-rev] L390-403). A request that names a newer revision, or a model not active here, triggers a read ([rt] L540-551). A process that restarts can't come up without the database ([rt] L264-279). A SIGUSR1 reload recompiles from memory ([t-rt] L345-359).
12. **The compiler-cache TTL is not enforced.** xcube passes `maxCompilerCacheKeepAlive` and `updateCompilerCacheKeepAlive` through; remove them from `cube.js` (see `cube.js` above; [c-core] L116-122, L373-396).
13. **`config()` needs the database URL.** It throws without `XCUBE_DATABASE_URL` ([cfg] L106-113), so the new `cube.js` and `XCUBE_DATABASE_URL` go together on every Cube process. "Without `XCUBE_DATABASE_URL` it behaves as today" holds only with a `cube.js` that doesn't call `config()`.
14. **Bootstrap must finish before Cube starts.** If the role exists but the schema doesn't, and the role may not create it, the process exits instead of retrying ([rt] L273-275; [migrate] L61-66).
15. **The connection limit is 64.** At up to 5 connections per process ([db] L27-40; [boot] L14), that is about 12 Cube processes per database.
16. **Only the first problem comes back.** A `400`/`413` names only the first bad file or limit ([snap] L71-107).
17. **Lock timeout on import.** The row lock uses `lock_timeout 10s` ([rev] L171). A lock-timeout error (SQLSTATE `55P03`) doesn't match the `unavailable` patterns ([routes] L134), so by reading it answers `500 internal`.
18. **Probes differ from live requests.** They skip `checkAuth` and the user's `extendContext` ([rt] L1055-1060), so a check under `securityContext` is not a byte-for-byte replay of a live token's context. A probe needs the `sql` scope ([c-gw] L1123).
19. **The image tag names only the commit.** It comes from `git rev-parse HEAD` ([df] L7), so a dirty working tree is built under the clean commit's tag.
20. **`per-folder-models.md`'s folder-chain claim is refused.** That doc proposed `wechartModel: "f12.f3.f1"` ([w-pfm] L112), and it is superseded ([w-pfm] L24-35). `MODEL_ID` refuses `.`, so such a claim is a `403` ([snap] L13). A model id is one wechart instance, and folders go in file paths.

## Open questions / unverified

1. **Decision for the user: non-YAML files.** Non-YAML and Jinja files in `model_files` (the Jinja file `product_catalog.yml`; `AC-140` [w-spec] L495; `AC-332` [w-spec] L1152). The options are to leave them out of the snapshot (so model tokens no longer see `product_catalog`), to remove or convert the sample, or to run with `XCUBE_FILE_TYPES=all`, which lets whoever may import run code in Cube ([readme] L132).
2. **Conflict: `compare` probes.** The input's step 3 sends `compare: true` probes. `whole-model-publish.md` says AD 6 supersedes "refuse only new failures" and "the second probe can go" ([w-wmp] L449). xcube supports both.
3. **Conflict: when the model routes go.** The input removes `/api/cube-model/*`, the `CUBE` class and `publish_drafts` in slice 2. `tasks.md` places that removal in slice 3 (T431, [w-tasks] L6103), and so does `ha-topology.md` ([w-ha] L40).
4. **UNVERIFIED: clean working tree.** Git couldn't be run, so it is unconfirmed that the working tree has no changes beyond 83cb9f0888 (the ref is confirmed).
5. **UNVERIFIED: the golden vector.** `43efbceb…5045` was not recomputed, because no code could be executed. It is xcube's own test assertion ([t-snap] L12-19), and wechart has no test with this vector yet (grep).
6. **UNVERIFIED: an empty snapshot through the real Cube compile.** The store accepts it ([t-store] L190-194), and the Joi schema allows it ([routes] L40). No integration test compiles zero files.
7. **UNVERIFIED at runtime: malformed or oversized bodies.** The status of a malformed or oversized admin body (expected `500`, by reading), and whether a 32 MiB content snapshot fits a 50 MB body after JSON escaping.
8. **UNVERIFIED: the input's §4 test counts.** "218 tests", "7 MySQL and Trino", "four switches under load" and "two API instances and a refresh worker as uid 1000" were not checked.
   - The load test I found performs three imports ([t-rev] L351-358).
   - The container check boots one instance ([t-img] L39-47).
   - Tests were not run.
9. **UNVERIFIED: what changed since the current image.** The introspection-only behaviour of `83cb9f0888` against the currently deployed `a13b9cff43` ([w-dc] L82) was not diffed. It is "exactly as today" only if nothing else changed.
10. **Credential keys are outside slice 2.** Compose mounts `/run/secrets/xcube-credential-keys/…` ([w-dc] L124-131), but `xcube/src` at this commit has no credential code (grep for `credential`: none).
11. **UNVERIFIED: start-up time.** The input suggests allowing "a few minutes" for a Helm `startupProbe` on `/readyz`. That depends on connect and compile time, which was not measured. The port stays closed until then ([srv] L115-118).

## Input claims checked

The input is `docs/inputs/2026-09-26-xcube-slice-2-contract.md`, cited below by its line numbers. Line references in the Source column are to xcube files unless marked `w-`.

| # | Claim (input line) | Verdict | Source / note |
| --- | --- | --- | --- |
| 1 | Built at `~/Work/bi/cube`, `feat/xcube`, `xcube/`, `83cb9f0888` (L7) | Verified (ref) | [head]; working tree assumed clean (Open question 4) |
| 2 | Reference is README "Serving models" and "Admin API" (L7) | Verified | [readme] L56, L139 |
| 3 | Cube itself is unchanged (L7) | Verified per README and Dockerfile | [readme] L21; [df] L26-31 |
| 4 | Every process (API and worker) serves each model from xcube's schema (L9) | Verified | [readme] L64-72, L117-119 |
| 5 | Follows revisions by NOTIFY plus a poll (L11) | Verified | [rt] L283-301, L639-654; [rev] L258; [set] L72-73 |
| 6 | Compiles before switching; pins each request (L12-13) | Verified | [rt] L829-917, L485-510; [cfg] L85-90 |
| 7 | Never calls wechart (L14) | Verified | no HTTP client in `xcube/src` (grep) |
| 8 | Nothing on the query path reads the DB, so Cube answers with wechart and Postgres down (L16) | Partly wrong | true when the active revision satisfies the request ([t-rev] L390-403); catch-up and unknown models read the DB ([rt] L532-561); a restart needs the DB ([rt] L264-279) |
| 9 | Build command, tag `xcube:v1.7.45-83cb9f0888` (L18) | Verified | [df] L5-7; [head] |
| 10 | Without `XCUBE_DATABASE_URL`, exactly as today's image, introspection only (L18) | Partly | introspection only ([bin] L37-43; [gw] L79-82); but `config()` then throws ([cfg] L106-113); "exactly as `a13b9cff43`" UNVERIFIED |
| 11 | Model id is 1–63 of `a-z0-9_-`, starting with a letter or digit (L22) | Verified | [snap] L13; [mig] L23; [t-snap] L97-104 |
| 12 | Base path `{CUBE_API_URL}/v1/semantic/models/{model}` (L26) | Verified | [routes] L114; [w-cfg] L129 |
| 13 | Bearer token ≥ 32 characters of `[A-Za-z0-9._~-]`, not the API secret, comma-separated list (L27) | Verified; the variable is `XCUBE_ADMIN_TOKENS` only (no `XCUBE_ADMIN_TOKEN`); compared to `CUBEJS_API_SECRET`; checked only with the DB URL set | [set] L53-66; [t-admin] L28-40, L165-168 |
| 14 | Cube JWT refused on admin routes (L28) | Verified | [auth] L14-37; [t-admin] L36 |
| 15 | Admin token refused on Cube's routes (L29) | Verified by Cube's `checkAuth` (`403 Invalid token` for a non-JWT) | [t-gw] L158-164; no test sends an admin token itself |
| 16 | Slice 4 replaces the token (L30) | UNVERIFIED | a plan statement; nothing in source |
| 17 | Errors are `{error, code}` (L31) | Verified for admin routes; plus details on 409/422/503 | [routes] L116-145 |
| 18 | PUT snapshot body and 201/200/409/422/400/413/503 (L35) | Verified; missing: `401 unauthorized`, `400 invalid_model_id`, `500 internal`; 422 also carries `contentHash` | [routes] L34-42, L116-215; [t-admin] L60-125 |
| 19 | dryRun body and 200 shape (L36) | Verified; `currentRevision` and `sameAsCurrent` are the answering instance's active revision; 400/413/503 also apply | [routes] L44-57; [rt] L1089-1108 |
| 20 | GET revision shape, or `404 unknown_model` (L37) | Verified; `instance.revision` may be `null`; a never-imported model gives 404, not `current: null` | [routes] L149-156; [rev] L104-128; [rt] L999-1014 |
| 21 | `baseRevision` required, `null` for a new model (L40) | Verified | [routes] L35-39; [t-admin] L91-92; [rt] L1129 |
| 22 | `files` may be empty (L41) | Verified for validation and store; the real compile is UNVERIFIED | [routes] L40; [t-store] L190-194 |
| 23 | Paths are "ASCII segments ending `.yml`/`.yaml`, no `..`" (L42) | Imprecise | exact regex and 512-character cap: [snap] L20-22 (see "Path rules") |
| 24 | Limits: 10,000 files, 4 MiB each, 32 MiB total (L42) | Verified; the total is configurable; the body is also bounded by `CUBEJS_MAX_REQUEST_SIZE` | [snap] L40-45; [set] L76-80; [c-env] L198-207 |
| 25 | Plain YAML only; JS, Jinja, Python, or YAML with `{{`/`{%` → `400 invalid_file_type`; `XCUBE_FILE_TYPES=all` (L43) | Verified; incomplete: `}}` and `%}` also refuse | [snap] L25, L86-92; [set] L43-49; [t-snap] L55-67 |
| 26 | `source` ≤ 4 KiB of JSON (L44) | Verified; must be an object | [routes] L24-32, L41; [t-admin] L95 |
| 27 | Hash: SHA-256 of the files sorted by path, as `[{"fileName","content"}]` (L45) | Verified | [snap] L57-64, L109-121 |
| 28 | Equals `versionOf` without `.slice(0,16)` (L45) | Verified, given sorted input: `versionOf` doesn't sort, but both call sites pass byte-ordered arrays; Node hashes strings as UTF-8 | [w-pub] L57-65, L252-254; [w-mf] L15-22; [node-hash] |
| 29 | Golden vector `43efbceb…5045` (L46) | Verified as xcube's test assertion; not recomputed | [t-snap] L12-19 |
| 30 | Error shape `{path, line?, column?, kind, message}` (L47) | Verified | [err] L6-13 |
| 31 | All YAML syntax errors, with line and column, before compiling (L48) | Verified (plain YAML files; line and column when js-yaml gives a mark) | [val] L56-60; [err] L23-42; [t-rev] L246-256 |
| 32 | Cube's errors placed in the defining file (L49) | Verified with a limit: only messages starting `<name> cube` or `<name> view` | [err] L76-89; [t-err] L59-70 |
| 33 | `path: null` otherwise; wechart's `placeOf` places them (L50) | xcube part verified; wechart's `placeOf` is module-private (not exported) | [val] L69-80; [w-val] L38-45 |
| 34 | `cubeMessage` equals `/v1/meta`'s text; `compileErrorsOf` works as a fallback (L51) | Verified by reading; `null` for YAML errors | [val] L59, L73; [c-gw] L1893-1901; [c-ce] L4-11; [w-val] L31 |
| 35 | Probes use `/v1/sql` code: scopes, `queryRewrite`, access policies, model claim set; nothing sent to the warehouse (L52) | Verified (`sql()` only generates SQL); skips `checkAuth` and the user's `extendContext` | [rt] L139-151, L1031, L1054-1060; [c-gw] L1070-1072, L1120-1142 |
| 36 | Probe result shape; 400 = refusal word for word; other non-200 = couldn't be asked (L53) | Verified; a 403 scope error is also Cube's refusal | [val] L13-25; [t-rev] L294-301; [c-gw] L1851-1891 |
| 37 | `compare` runs against current when the candidate refuses; `skipped: 'no_current_revision'` (L54) | Verified; triggered by any non-200; "current" is this instance's active revision | [rt] L1062-1076 |
| 38 | Probes only when valid (L55) | Verified | [val] L57-60, L66-83; [t-rev] L304-312 |
| 39 | `instance` states (L56) | Verified | [rt] L109-113, L999-1009 |
| 40 | Tokens stay HS256 with `CUBE_API_SECRET` (L60) | Compatible: xcube leaves Cube's auth unchanged | [readme] L21-30; [t-img] L64-69 |
| 41 | No `wechartModel` → disk model (L62) | Verified; "the security suite relies on that" not checked (wechart-side) | [cfg] L58; [rt] L440-445; [t-rev] L314-317 |
| 42 | `wechartRevision` is the oldest revision; catch up for up to 10 s; else 503 `Retry-After: 2` (L63-65) | Verified; the wait includes compile; a revision that failed here gets 503 at once | [set] L83; [rt] L501-505, L512-561; [t-rt] L264-289, L444 |
| 43 | A revision the DB doesn't have is answered from current (L66) | Verified, if the fresh read succeeds and this instance is active on the current revision | [rt] L523-528; [t-rev] L327-330 |
| 44 | *Every* response carries `x-xcube-revision` and `x-xcube-generation` (L68) | Partly wrong: generation only for model tokens; not on xcube's own 403/503; only routes that use `requestContextMiddleware` | [rt] L494, L501-508; [c-gw] L2160-2176 |
| 45 | Unknown model → `403 Unknown model` (L71) | Verified; the text is `Unknown model "<id>"`; only after a DB read (cached 60 s); 503 when the DB is unreachable | [rt] L464-473, L536-538, L757-766 |
| 46 | Invalid model id or non-positive revision → 403 (L72) | Verified; digit strings are accepted as revisions | [rt] L384-405; [t-rev] L323-324 |
| 47 | Previews, introspection and jobs tokens carry `wechartModel`, set by wechart (L73) | wechart design; xcube reads the claim from any context | [rt] L440 |
| 48 | `config()` call shape, with `contextToGroups` and `contextToApiScopes` (L80-94) | Verified | [cfg] L106-114, L71-72; [gw] L91-115; [t-cfg] L52-57 |
| 49 | `contextToAppId`, `repositoryFactory`, `schemaVersion` refused (L97) | Verified | [cfg] L21, L49-53; [t-cfg] L38-42 |
| 50 | Keep-alive settings must go; xcube retires 5 min after a switch (L98) | Reasoning verified; not enforced by xcube; retirement at ≥ 5 min, checked every 30 s, never while a refresh run holds it | [c-core] L116-122, L373-396; [rt] L906-909, L958-972 |
| 51 | `scheduledRefreshContexts` defaults to disk plus each active model (L99) | Verified | [rt] L565-591; [t-rev] L366-372 |
| 52 | Bootstrap: role `xcube` owns schema `xcube`, "nothing else", idempotent; the psql command (L103-107) | Verified; it also grants `CONNECT` and sets `CONNECTION LIMIT 64`; a rerun changes only the password | [boot] L1-16 |
| 53 | Tables created and migrated on start under an advisory lock (L109) | Verified | [migrate] L38-54; [t-store] L43 |
| 54 | `XCUBE_DATABASE_URL` format (L111) | Compatible (`pg` connection string) | [db] L16-25 |
| 55 | `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT=2`; the image sets it when unset (L112) | Verified; set by the entry point, not a Dockerfile `ENV` | [bin] L34-35 |
| 56 | Admin tokens on API instances only; the worker's routes are off (L113) | Verified | [routes] L106-110; [readme] L125 |
| 57 | Same image and `cube.js` everywhere; the worker needs xcube (L114) | Verified | [readme] L51-54, L117-119; [cfg] L106-113 |
| 58 | Refuses to start with a `cube.js` not using `config()` (L115) | Verified | [rt] L321-326; [c-cont] L152-162; [t-rt] L485 |
| 59 | Port opens only after every model's current revision compiled (L115) | Partly: after each was *tried*; failures are logged, with a fallback | [rt] L328-337, L943-956; [srv] L115-118 |
| 60 | Retries the DB indefinitely (L115) | Verified, except fatal migration or schema errors | [rt] L264-279 |
| 61 | `startupProbe` should allow a few minutes (L115) | UNVERIFIED (advice) | — |
| 62 | §3.1 flow: GET before `model_files`, then PUT with `current?.revision ?? null` (L121-123) | Compatible, but a never-imported model is a 404 | [routes] L152-154 |
| 63 | §3.3 one dryRun replaces the three draft uses (L127-130) | Compatible; `compare` conflicts with AD 6 (Open question 2) | [w-wmp] L449 |
| 64 | §3.4 metadata cache keyed by `x-xcube-revision` (L134) | Header verified for model tokens | [rt] L507 |
| 65 | §3.5 remove the model store in slice 2 (L135-138) | Conflicts with T431 (slice 3) | [w-tasks] L6103; [w-ha] L40 |
| 66 | §4 test counts, reviews, two-instance containers (L149-162) | UNVERIFIED; "four switches" is three in the test found | [t-rev] L351-358; [t-img] L39-47 |
| 67 | §4 each fix "has a test" (L157) | Tests found for switch ordering ([t-rt] L372, L393), identical concurrent imports ([t-store] L158-166), DB error ≠ compile failure ([t-rt] L424), notification model ids ([rt] L613-617; [t-rt] L460), plain-YAML default ([t-snap] L55-67); "reload drains before detaching" is in code ([srv] L120-124), but I found no test for it | — |
| 68 | CI boots the image both ways on every change (L162) | Verified, for changes under `xcube/**` | [ci] L8-16, L111-128 |

[head]: /Users/srajagopal/Work/bi/cube/.git/HEAD → /Users/srajagopal/Work/bi/cube/.git/refs/heads/feat/xcube (83cb9f088801fe22dfef3b62d100f7153a900fe8)
[readme]: /Users/srajagopal/Work/bi/cube/xcube/README.md
[auth]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/auth.ts
[routes]: /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts
[snap]: /Users/srajagopal/Work/bi/cube/xcube/src/model/snapshot.ts
[val]: /Users/srajagopal/Work/bi/cube/xcube/src/model/validate.ts
[err]: /Users/srajagopal/Work/bi/cube/xcube/src/model/errors.ts
[rt]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/runtime.ts
[set]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/settings.ts
[lane]: /Users/srajagopal/Work/bi/cube/xcube/src/runtime/lane.ts
[cfg]: /Users/srajagopal/Work/bi/cube/xcube/src/config.ts
[srv]: /Users/srajagopal/Work/bi/cube/xcube/src/server.ts
[bin]: /Users/srajagopal/Work/bi/cube/xcube/src/bin/server.ts
[gw]: /Users/srajagopal/Work/bi/cube/xcube/src/gateway.ts
[rev]: /Users/srajagopal/Work/bi/cube/xcube/src/store/revisions.ts
[mig]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrations.ts
[migrate]: /Users/srajagopal/Work/bi/cube/xcube/src/store/migrate.ts
[db]: /Users/srajagopal/Work/bi/cube/xcube/src/store/db.ts
[boot]: /Users/srajagopal/Work/bi/cube/xcube/bootstrap.sql
[df]: /Users/srajagopal/Work/bi/cube/xcube/Dockerfile
[pkg]: /Users/srajagopal/Work/bi/cube/xcube/package.json
[t-snap]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/snapshot.test.ts
[t-admin]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/admin.test.ts
[t-rt]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/runtime.test.ts
[t-cfg]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/config.test.ts
[t-gw]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/gateway.test.ts
[t-err]: /Users/srajagopal/Work/bi/cube/xcube/test/unit/errors.test.ts
[t-rev]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/revisions.test.ts
[t-store]: /Users/srajagopal/Work/bi/cube/xcube/test/integration/store.test.ts
[t-img]: /Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh
[ci]: /Users/srajagopal/Work/bi/cube/.github/workflows/xcube.yml
[c-docker]: /Users/srajagopal/Work/bi/cube/packages/cubejs-docker/latest.Dockerfile
[c-gw]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/api-gateway/dist/src/gateway.js
[c-srv]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server/dist/src/server.js
[c-cont]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server/dist/src/server/container.js
[c-core]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/server-core/dist/src/core/server.js
[c-env]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/shared/dist/src/env.js
[c-ce]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CompileError.js
[c-dsc]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/DataSchemaCompiler.js
[c-yc]: /Users/srajagopal/Work/bi/cube/xcube/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/YamlCompiler.js
[node-hash]: https://github.com/nodejs/node/blob/main/doc/api/crypto.md#hashupdatedata-inputencoding ("If `encoding` is not provided, and the `data` is a string, an encoding of `'utf8'` is enforced"; same text on v24.x)
[w-pub]: /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
[w-val]: /Users/srajagopal/Work/wechart/packages/api/src/model/validate.ts
[w-mf]: /Users/srajagopal/Work/wechart/packages/api/src/repos/model-files.ts
[w-rd]: /Users/srajagopal/Work/wechart/packages/api/src/model/read-dir.ts
[w-main]: /Users/srajagopal/Work/wechart/packages/api/src/main.ts
[w-cfg]: /Users/srajagopal/Work/wechart/packages/api/src/config.ts
[w-pc]: /Users/srajagopal/Work/wechart/infra/cube/model/cubes/product_catalog.yml
[w-dc]: /Users/srajagopal/Work/wechart/docker-compose.yml
[w-spec]: /Users/srajagopal/Work/wechart/docs/spec.md
[w-tasks]: /Users/srajagopal/Work/wechart/docs/tasks.md
[w-wmp]: /Users/srajagopal/Work/wechart/docs/research/cube/whole-model-publish.md
[w-ha]: /Users/srajagopal/Work/wechart/docs/research/cube/ha-topology.md
[w-pfm]: /Users/srajagopal/Work/wechart/docs/research/cube/per-folder-models.md
