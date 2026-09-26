---
library: Cube on Kubernetes (cubejs/cube, cubejs/cubestore)
packages: []
version: 1.7.45
researched: 2026-09-25
sources:
  - https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=50&name=v1.7.45
  - https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=50&name=v1.7.45
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/Dockerfile
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/config/mod.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/http/status.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/bin/cubestored.rs
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/container.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/deployment.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/running-in-production.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/CHANGELOG.md
  - https://github.com/gadsme/charts/tree/main/charts
---

# Cube on Kubernetes (cubejs/cube, cubejs/cubestore) 1.7.45

> **Superseded in part, 2026-09-25**, by the user's architecture decisions 1, 2, 11 and 12 ([docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)).
> - **Superseded:**
>   - `repositoryFactory` reading wechart's store (:109);
>   - an address of wechart's API that Cube pods reach (:174): Cube never calls wechart;
>   - `CUBEJS_API_SECRET` in the sketch (:167, :196): RS256 keys from xcube.
> - **To re-verify:** the `/readyz` notes tied to `contextToAppId` (:39, :205, :357).
> - **See:** [ha-topology.md](./ha-topology.md).

## Summary

This doc covers how to run three components on Kubernetes from the official images:
- the Cube API
- the Cube refresh worker
- a single-node Cube Store

It feeds **F24 / AC-248 / T274** (`docs/spec.md:818-828`, `docs/tasks.md:3996-4002`): a Helm chart that runs wechart, Cube's API, Cube's refresh worker and Cube Store, with every component Ready. Tag `v1.7.45` is tag object `bc307de5…` → commit `f2c28b80562b3e30ddfd4850d8b45ffffd95cabd`, tagged 2026-09-25T04:55:39Z ([tag]). Every line number below is at that commit.

**What changes from the v1.7.42 research:**

1. **`/readyz` checks nothing in wechart's configuration.** The readiness handler tests connections only when `this.standalone` is true ([gw] L3040-3055). `standalone` becomes `false` as soon as `contextToAppId` is configured ([core] L222-225). `infra/cube/cube.js` defines `contextToAppId`. So wechart's Cube API and refresh worker both answer `200 {"health":"HEALTH"}` on `/readyz` whenever the HTTP server is up. This settles the "standalone branch" open question in `configuration-deployment.md:798`.
2. **`/livez` is the probe that touches dependencies.** It tests, for every cached orchestrator:
   - the data sources that orchestrator has used
   - the Cube Store external driver
   - the Cube Store cache/queue connection

   Before any orchestrator exists, it returns 200 ([gw] L3056-3067, [orch-storage], [orch-api], [qo] L348-356).
3. **Cube Store probes exist only on a router.** A single node is a router. Probes are served on `:3031/livez` and `:3031/readyz` with an empty body and status 200 or 500 ([cs-status]). They are still undocumented: there is no `3031` or `CUBESTORE_STATUS` anywhere in `docs-mintlify` at v1.7.45 ([sg-docs]).
4. **wechart's compose Cube Store volume is not where Cube Store writes.** `docker-compose.yml:59-62` mounts `/cube/data` but sets neither `CUBESTORE_REMOTE_DIR` nor `CUBESTORE_DATA_DIR`. Without them, all Cube Store state goes to `/cube/.cubestore/data`, the default data dir relative to `WORKDIR /cube` ([cs-config] L1761, [cs-dockerfile], [cs-remotefs]). A Helm chart has to mount storage at the path actually used. (Derived from source; not observed.)
5. **Shutdown signals.** Cube Store handles only SIGINT. Kubernetes sends SIGTERM, and Cube Store runs as PID 1, so the TERM is dropped and the pod is SIGKILLed after the grace period (derived; see Gotchas). Cube (Node) handles SIGTERM, but it only shuts down gracefully when `CUBEJS_GRACEFUL_SHUTDOWN` is set ([container] L352, L364-404).
6. **A read-only Postgres role is enough for `rollup` pre-aggregations stored in Cube Store.** The Postgres driver defaults to `readOnly: true`, and external rollups then use the read-only streaming strategy ([pg-driver], [pal] L466-483, L781-825).
   - `original_sql` pre-aggregations and `external: false` rollups are built in the source DB, and they need write access ([cube-symbols] L771-775, [pal] L250-255, [d-using-preagg]).

### Prior claims checked at v1.7.45

| Claim (from `configuration-deployment.md`, v1.7.42) | At v1.7.45 | Source |
| --- | --- | --- |
| `/readyz` tests the default data source; returns 200 `{"health":"HEALTH"}` or 500 `{"health":"DOWN"}` | **Corrected.** The response shape is confirmed. It tests connections only when `standalone` is true, and then it tests the `default` source **plus** Cube Store (external driver and orchestrator cache). `standalone` is false whenever `contextToAppId` is set, as in wechart, so `/readyz` always returns 200. | [gw] L3017-3055, [core] L167-169, L222-225, L485, [orch-api] |
| `/livez` tests existing data-source connections | **Confirmed, and it also tests Cube Store** (external driver and cache driver) for each cached orchestrator. With no orchestrators it returns 200. | [gw] L3056-3067, [orch-storage], [qo] L348-356 |
| Cube Store has `/readyz` and `/livez` on status port 3031 (source only) | **Confirmed.** Router nodes only; empty body; still absent from the docs. | [cs-status], [cs-config] L1871-1873, [sg-docs] |
| Cube talks to Cube Store's HTTP port 3030 (`CUBEJS_CUBESTORE_HOST`/`PORT`); 3306 is MySQL | **Confirmed.** The driver opens `ws://<host>:<port>/ws`. If unset, host defaults to `127.0.0.1` and port to `3030`. | [csd] L87-95, [d-env] (`CUBESTORE_BIND_ADDR` `0.0.0.0:3306`, `CUBESTORE_HTTP_BIND_ADDR` `0.0.0.0:3030`) |
| Image sets `NODE_ENV=production`, `WORKDIR /cube/conf`, `CMD cubejs server`, no curl/wget | **Confirmed.** The final stage apt-installs only `libssl3t64 python3.13 libpython3.13-dev`. | [dockerfile] |
| `CUBEJS_REFRESH_WORKER=true` → the instance only refreshes pre-aggregations | **Confirmed** | [d-env], [env-ts] L261-279 |
| Cube Store has no authentication | **Confirmed** ("does not have any in-built authentication mechanisms") | [d-prod] |
| Single-instance Cube Store is unsuitable for production; cluster = router + workers | **Confirmed.** Exact wording: "_can_ be run in a single instance mode, but this is usually unsuitable for production deployments". | [d-prod] |

## Install

### Images (Docker Hub, pushed 2026-09-25)

| Tag | Platforms | Per-platform digest | Tag-level `digest` field |
| --- | --- | --- | --- |
| `cubejs/cube:v1.7.45` | linux/amd64, linux/arm64 | amd64 `sha256:1f21645e40d033e80a3c9396f4a68dd5908df1f96434a4bf9d34a0487a30498c`; arm64 `sha256:ec2d562aa9d63aa0ce3e9908955b35b9bc6b34939e64948612b9fed53f678427` | `sha256:c4dae518806fdedc78b623192ffd187df46d32d212985306a8adf7b1482804a1` |
| `cubejs/cube:v1.7.45-jdk` | linux/amd64 only | `sha256:8a42426ac155f5e8b5f29f990ac8abe861f921f10a6ec4462d36f4a5252b8ec8` | `sha256:2156b94b…` |
| `cubejs/cubestore:v1.7.45` | **linux/amd64 only** | `sha256:2732eaca04915c044bb9c0f0dbcf4e79d19c817ba08070ec429e64e001aeff63` | `sha256:888a9eb901b1f313836b4d5f1d19ffe035cf0e6595dafa6b6fc03a9daa28523b` |
| `cubejs/cubestore:v1.7.45-arm64v8` | linux/arm64 | `sha256:48532e1736d0f77eb7a08237236fd8d74a107b23942e0a9260e6d4fada308630` | `sha256:0ca97261cd310ccd35bb0731e85031443da1134beb7d2fc4a8c0745ab14ef085` |
| `cubejs/cubestore:v1.7.45-non-avx` | linux/amd64 | `sha256:d60d900164e40c1d55a8f49d740f5975c70e25460ac1cea549d227f8376101a4` | `sha256:1cf1d558…` |

Sources: [hub-cube], [hub-cs].

- **How the tags are built** ([publish]):
  - `cubejs/cube` is one multi-platform build (`linux/amd64,linux/arm64`) from `packages/cubejs-docker/latest.Dockerfile`.
  - The Cube Store `-arm64v8` tag is built on an `ubuntu-24.04-arm` runner for `linux/arm64`.
  - The plain Cube Store image is built with `RUSTFLAGS="-C target-feature=+avx2"` when `WITH_AVX2=1` ([cs-dockerfile]). The `-non-avx` tag exists for amd64 CPUs without AVX2 ([hub-cs]).
- **Pick the Cube Store tag by node architecture.** On arm64 nodes (for example docker-desktop on Apple Silicon), use `-arm64v8`, because the plain tag has no arm64 image ([hub-cs]; [d-deploy]: "Use the arm64v8 tag for Cube Store Docker images").
- Cube's docs advise pinning exact versions rather than `latest` ([d-deploy]).

### What is in `cubejs/cube:v1.7.45` ([dockerfile])

- **Base and packages:** `FROM node:24.21.0-trixie-slim`. The final stage apt-installs `libssl3t64 python3.13 libpython3.13-dev`, so there is no curl or wget.
- **Environment:** `ENV NODE_ENV=production`, `NODE_PATH=/cube/conf/node_modules:/cube/node_modules`, `PYTHONUNBUFFERED=1`.
- **Where Cube is installed:** `COPY --from=builder /cube .` into `/cube`. The build context is `./packages/cubejs-docker` ([publish]), and that folder has no `conf` directory ([docker-dir]). Cube's `node_modules` live at **`/cube/node_modules`**, and `cubejs` is symlinked to `/usr/local/bin/cubejs`.
- **Directory layout:** `WORKDIR /cube/conf` creates an empty directory. `EXPOSE 4000`, `CMD ["cubejs", "server"]`.
- **No `USER`, `ENTRYPOINT`, `VOLUME` or `HEALTHCHECK`.**
  - The base image's Dockerfile also has no `USER`, so the container runs as **root** ([node-df]).
  - The base image creates `node` (uid/gid 1000) for optional non-root use ([node-df], [node-bp]).
  - The inherited `ENTRYPOINT ["docker-entrypoint.sh"]` ends in `exec "$@"`, so `cubejs` (Node) becomes PID 1 ([node-df], [node-ep]).
  - `cubejs server` loads `@cubejs-backend/server` in-process; it does not spawn a child ([cli-server], [cli-proxy]).
- **Packages:** `/cube/package.json` (`@cubejs-backend/docker@1.7.45`) pins every `@cubejs-backend/*` driver, including `postgres-driver`, to `1.7.45`. It has **no `"type"` field**, so a mounted `/cube/conf/cube.js` loads as CommonJS ([docker-pkg]).

### What is in `cubejs/cubestore:v1.7.45` ([cs-dockerfile])

- `FROM debian:trixie-slim`, with `apt-get install -y libssl3t64 ca-certificates`.
- `WORKDIR /cube`, `COPY … cubestored .`, `EXPOSE 3306`, `ENV RUST_BACKTRACE=true`, `CMD ["./cubestored"]`.
- No `USER`, `ENTRYPOINT`, `VOLUME` or `HEALTHCHECK`. It runs as root, with `cubestored` as PID 1.

### Writable paths

**Cube (API and refresh worker), production mode:**

- **With wechart's config: no write path found in source.** wechart's `repositoryFactory` reads the store or the mounted directory (`infra/cube/cube.js:86-97`). The default `FileRepository` is still constructed ([core] L205-206), but in production its `dataSchemaFiles()` is called only by DevServer, which is dev mode ([sg-dsf]).
- **The default `FileRepository` does write when it is used.** If no `repositoryFactory` is set, it calls `fs.ensureDir(<cwd>/<schemaPath>)`, which creates `/cube/conf/model`. If that fails, it throws `Model files not found. Please make sure the "model" directory exists and contains model files.` ([file-repo]).
- **Dev mode only (not used by wechart):**
  - starting a local Cube Store (`CubeStoreHandler.acquire()` in official images) ([opts] L347-375)
  - DevServer writing `.env` and model files (see `configuration-deployment.md` §6)
- **Startup reads:** `/cube/conf/.env` through `dotenv.config()`; `cube.py` takes precedence over `cube.js`; `cube.ts` throws ([container] `lookupConfiguration`).
- **Unknown:** whether anything else (Node, the native module, Python) needs `/tmp` or other writable paths under `readOnlyRootFilesystem: true` or a non-root UID. See Open questions.

**Cube Store:**

- **`CUBESTORE_DATA_DIR`:** defaults to `env::current_dir()/.cubestore/data`, which is `/cube/.cubestore/data` ([cs-config] L1761, [cs-dockerfile]). It holds:
  - the metastore at `<data>/metastore` and the cachestore at `<data>/cachestore` ([cs-config] L2575-2591)
  - local copies of uploaded files: `LocalDirRemoteFs::upload_file` always moves the file into the local dir ([cs-remotefs])
- **`CUBESTORE_REMOTE_DIR`:** unset by default, which gives `FileStoreProvider::Filesystem { remote_dir: None }` ([cs-config]). With no remote dir:
  - `download_file` returns "File not found"
  - listing falls back to the local dir

  So **the data dir is the only copy** ([cs-remotefs]). When it is set, uploads are also copied there.
- **The docs' description of the two:** remote/persistent storage holds "metadata as well as … pre-aggregations as Parquet files". The data dir is "scratch space to warm up partitions by downloading Parquet files … By default, this folder should be mounted to `.cubestore/data` inside the container" ([d-prod]).
- **`CUBESTORE_DUMP_DIR`:** optional, no default ([cs-config]).

## Init / auth pattern

The runtime here is Kubernetes with images only; wechart's Node 26/Vite/React code imports no Cube package.

### 1. Cube Store as a single node (acts as router and worker)

**Env vars that decide the role:**

- **Router vs worker:** `is_router(c) = !c.worker_bind_address().is_some()` ([sg-isrouter] → [cs-config] L3183-3185). Leave `CUBESTORE_WORKER_PORT` and `CUBESTORE_WORKER_BIND_ADDR` unset and the node is a router.
- **No workers:** leave `CUBESTORE_WORKERS` unset (default empty `Vec`, [cs-config]). The worker-picking functions then return `config.server_name()` ([cs-cluster] L2284-2337). Messages to a node whose name equals `self.server_name` go over an in-process `LoopbackConnection` ([cs-cluster] L1947, L1971-1974). So one process does both jobs.
- **`CUBESTORE_META_ADDR` must not be set.** A router with it set fails validation with "Router node cannot use remote metastore. Try removing CUBESTORE_META_ADDR" ([cs-config] L286-331).
- **`CUBESTORE_META_PORT` is optional.** The metastore RPC listener is bound only if `CUBESTORE_META_BIND_ADDR` or `CUBESTORE_META_PORT` is set, as `0.0.0.0:<port>` ([cs-config]). A single node has no workers to connect to it.
- **`CUBESTORE_SERVER_NAME`** is documented as "The full name and port number of the Cube Store node … Must be unique for each instance", default `localhost` ([d-env], [cs-config]). On a single node it only names the node to itself (the comparisons above).
  - Keeping it stable across restarts while the metastore persists is an inference, not a documented rule. See Open questions.
  - wechart's compose uses `cubestore:9999` (`docker-compose.yml:60`).
  - The production doc asks for "stable addresses, which should not change" ([d-prod]).

**Listeners and their defaults** ([cs-config] L1866-1876, [d-env]):

| Listener | Env | Default bind | Needed by |
| --- | --- | --- | --- |
| MySQL protocol | `CUBESTORE_BIND_ADDR` / `CUBESTORE_PORT` | `0.0.0.0:3306` (always on) | Diagnostics only; Cube does not use it |
| HTTP / WebSocket | `CUBESTORE_HTTP_BIND_ADDR` / `CUBESTORE_HTTP_PORT` | `0.0.0.0:3030` | Cube (`CUBEJS_CUBESTORE_PORT`, default 3030) |
| Status probes | `CUBESTORE_STATUS_BIND_ADDR` / `CUBESTORE_STATUS_PORT` | `0.0.0.0:3031` | Kubernetes probes (router only) |
| Metastore RPC | `CUBESTORE_META_BIND_ADDR` / `CUBESTORE_META_PORT` | not bound unless set | Workers (none here) |

**What to persist so pre-aggregations survive a pod restart.** Both options follow from source and docs; neither has been observed on Kubernetes:

- **Option A:** a PVC at `/cube/.cubestore/data`, the default data dir, with no remote dir. Metastore, cachestore and Parquet all live there, and it is the only copy ([cs-config], [cs-remotefs]).
- **Option B:** a PVC at a path named by `CUBESTORE_REMOTE_DIR` (for example `/cube/data`, as Cube's compose and the gadsme chart do), with the data dir as scratch.
  - Files are then stored twice: in the remote dir and in the local dir ([cs-remotefs]).
  - The data dir can be an `emptyDir`, which is what the gadsme router does when `router.persistence.enabled` is false ([gad-router]).
  - Cube's docs say a local path is valid "in case all Cube Store cluster nodes are co-located on a single machine" ([d-prod]).

### 2. Cube API and refresh worker (same image, same env; the worker adds `CUBEJS_REFRESH_WORKER=true`)

- **Production prerequisites:**
  - `CUBEJS_API_SECRET`, unless `jwt.jwkUrl` is set. Otherwise startup throws `"apiSecret is required option(s)"`; the check also covers `driverFactory`/`dbType` ([opts]).
  - `CUBEJS_DEV_MODE=false`. It is the default ([env-ts] L210-212). Setting it to `true` makes the container set `NODE_ENV=development`, which switches off JWT verification ([container] `lookupConfiguration`, [d-deploy]).
  - `CUBEJS_CUBESTORE_HOST=<Cube Store Service DNS name>` and `CUBEJS_CUBESTORE_PORT=3030` ([csd] L87-95, [d-env]).
- **Config file:** `cube.js` is read once at startup from `process.cwd()`, which is `/cube/conf` ([container]).
- **Refresh worker behaviour:**
  - It ticks every 30 s unless `scheduledRefreshTimer` is set ([opts] L574-586).
  - It starts only if `configuredForQueryProcessing()` finds any `CUBEJS_DB*` env var other than `CUBEJS_DB_TYPE`, or `CUBEJS_AWS*` ([opts] L535-548, [core] L370-397).
- **wechart-specific env** (from the repo, not Cube): `WECHART_MODEL_STORES` and `WECHART_MODEL_KEY` are read by `infra/cube/cube.js:22-26`. In-cluster they must name an address of wechart's API that Cube pods can reach.

**Illustrative container fragments.** Only sourced values are shown. Probe timings are copied from the gadsme chart defaults ([gad-cube-values], [gad-cs-values]) and are not a recommendation:

```yaml
# Cube Store (single node) — StatefulSet container
image: cubejs/cubestore:v1.7.45-arm64v8     # arm64 nodes; cubejs/cubestore:v1.7.45 on amd64
env:
  - { name: CUBESTORE_SERVER_NAME, value: "cubestore:9999" }  # stable; default "localhost"
  - { name: CUBESTORE_TELEMETRY,  value: "false" }            # default true
ports:
  - { name: http,   containerPort: 3030 }
  - { name: status, containerPort: 3031 }
volumeMounts:
  - { name: data, mountPath: /cube/.cubestore/data }          # Option A
readinessProbe: { httpGet: { path: /readyz, port: status }, initialDelaySeconds: 10, periodSeconds: 30, timeoutSeconds: 3, failureThreshold: 3 }
livenessProbe:  { httpGet: { path: /livez,  port: status }, initialDelaySeconds: 10, periodSeconds: 30, timeoutSeconds: 3, failureThreshold: 3 }
---
# Cube API — Deployment container (refresh worker: same + CUBEJS_REFRESH_WORKER=true)
image: cubejs/cube:v1.7.45
env:
  - { name: CUBEJS_DEV_MODE, value: "false" }
  - { name: CUBEJS_API_SECRET, valueFrom: { secretKeyRef: { name: …, key: … } } }
  - { name: CUBEJS_DB_TYPE, value: postgres }
  - { name: CUBEJS_DB_HOST, value: … }   # + CUBEJS_DB_PORT, CUBEJS_DB_NAME, CUBEJS_DB_USER, CUBEJS_DB_PASS
  - { name: CUBEJS_CUBESTORE_HOST, value: cubestore }
  - { name: CUBEJS_CUBESTORE_PORT, value: "3030" }
  - { name: CUBEJS_TELEMETRY, value: "false" }
volumeMounts:
  - { name: cube-config, mountPath: /cube/conf/cube.js, subPath: cube.js, readOnly: true }
ports: [ { name: http, containerPort: 4000 } ]
readinessProbe: { httpGet: { path: /readyz, port: http } }   # see §API surface: always 200 with contextToAppId
livenessProbe:  { httpGet: { path: /livez,  port: http } }   # see §Gotchas: tests Postgres and Cube Store
```

## API surface we will use

### Cube API / refresh worker: `GET /readyz`, `GET /livez` (port 4000)

- **Registration:** `app.get('/readyz', guestMiddlewares, cachedHandler(this.readiness))` and the same for `/livez`, with `guestMiddlewares = []` ([gw] L329-332).
  - **No JWT, no scope.**
  - Not under `basePath`. Open issue #4808 asks for a basePath variant ([i-4808]).
- **Caching:** `cachedHandler` caches the last status and JSON for **1000 ms** and queues concurrent callers ([cached]).
- **Response:** `res.status(health === 'HEALTH' ? 200 : 500).json({ health })` ([gw] L3017-3021).
- **`readiness`** ([gw] L3040-3055):
  - When `this.standalone`, it calls `adapterApi({})`, `addDataSeenSource('default')`, `testConnection()` and `testOrchestratorConnections()`. Any throw returns `DOWN`, logged as "Internal Server Error on readiness probe".
  - `testConnection()` tests each seen data source through `driverFactory` plus the **external driver (Cube Store)**. In `rollupOnlyMode` it tests only the external driver ([orch-api]).
  - `testOrchestratorConnections()` tests the query-cache (Cube Store) connection ([orch-api], [qo] L348-356).
  - When **not** standalone, it returns `HEALTH` without testing anything.
- **Where `standalone` comes from:** `standalone = true` by default and is set to `false` when `options.contextToAppId` is provided ([core] L169, L222-225). It is passed to the gateway ([core] L474-491).
- **`liveness`** ([gw] L3056-3067): `dataSourceStorage.testConnections()` then `testOrchestratorConnections()`, where `dataSourceStorage` is `orchestratorStorage` ([core] L485-486). Each call iterates **only the orchestrators already in the LRU** ([orch-storage]).
- **Neither handler compiles the data model.** The model compiles lazily in `CompilerApi.getCompilers()`, on the first request that needs it ([compiler-api] L215-239).
- **Refresh worker:** the same gateway serves both probes. Earlier local observation (v1.7.42, compose): the worker answered `200 {"health":"HEALTH"}` on both (`refresh-jobs-caching.md:338`).

### Empty model (zero cubes)

- **Startup does not depend on the model.** Nothing compiles at startup in production; compilation happens on the first `getCompilers()` ([compiler-api] L215-239, [core]).
- **wechart's repository** returns `[]` when `/cube/conf/model` is absent (`fromDisk`, `infra/cube/cube.js:48-56`). The default `FileRepository` would instead `ensureDir` and create the directory, which needs a writable `/cube/conf` ([file-repo]).
- **The compile path has no zero-file guard.** `DataSchemaCompiler` sorts whatever `dataSchemaFiles()` returns, and the bulk transpiler returns `[]` for no files ([dsc] L255-284, L707-709). A search at v1.7.45 for "No cubes", "no cubes found", "No schema files" and similar outside tests and docs found **no match** ([sg-nocubes]).
- **`/v1/meta`** builds `{ cubes }` from `metaConfig.cubes` with no emptiness check ([gw] L770-819). Derived: with zero files it answers `{"cubes":[]}`. Not observed.

### Cube Store: `GET :3031/livez`, `GET :3031/readyz` ([cs-status])

- **Only routers serve probes.** `RouterProbes::try_new` returns `None` when `!is_router(...)`, so workers serve no probes. The gadsme chart puts none on workers ([gad-workers]).
- **Routes:** `warp::path!("livez")` and `("readyz")`, with no method filter. Replies are a bare `StatusCode`: 200 OK or 500 INTERNAL_SERVER_ERROR, with an **empty body**. Failures are logged at `warn` as `"<probe> probe failed: …"`.
- **`is_live`:** runs `SELECT 1` through `SqlService`. If that service isn't registered yet, it returns `Ok`.
- **`is_ready`:** returns `Ok` if the node uses a remote metastore (workers). Otherwise it needs the `MetaStore` service ("metastore is not ready") and a successful `get_schemas()`. The comment explains it doesn't check workers "because workers connect to the router for warmup".
- **Start order:** `serve_status_probes` runs after `configure_injector()` and before `cube_services()` ([cs-main]). So `/livez` can answer 200 before the SQL service exists (derived).
- **Issue #2779** ("Support K8s-style health check endpoints for Cube Store nodes") is still open ([i-2779]), though router probes exist in source.

### Postgres data source env (v1.7.45)

**Connection** ([d-pg], [pg-driver], [env-ts]):

| Variable | Behaviour |
| --- | --- |
| `CUBEJS_DB_TYPE=postgres` | Selects the driver. |
| `CUBEJS_DB_HOST`, `CUBEJS_DB_NAME`, `CUBEJS_DB_USER`, `CUBEJS_DB_PASS` | Required per the docs. |
| `CUBEJS_DB_PORT` | Optional. |
| The driver reads | Only `dbHost`, `dbName`, `dbPort`, `dbUser`, `dbPass`, `dbMinPoolSize`, `dbMaxPoolSize`, `dbQueryTimeout` and `dbExportBucketCsvEscapeSymbol` (plus SSL through `BaseDriver`) ([sg-pgenv]). |
| `CUBEJS_DB_SCHEMA` | **Not read by the Postgres driver.** Documented as "the schema to use as `information_schema` filter" ([d-env]). Its getter logs "`CUBEJS_DB_SCHEMA` is deprecated. Please, use the `CUBEJS_DB_NAME` instead." ([env-ts] L622-647). |
| `CUBEJS_DB_MAX_POOL` | Pool max = `maxPoolSize` or `max` or `CUBEJS_DB_MAX_POOL` or **8** ([pg-driver]; docs: "Default is `8`" [d-pg]). |
| `CUBEJS_CONCURRENCY` | Postgres default concurrency is **2** (`getDefaultConcurrency`, [pg-driver]). |
| `CUBEJS_DB_SSL=true` | Enables TLS. Optional `CUBEJS_DB_SSL_CA`, `_CERT`, `_KEY` (value or file path), `_CIPHERS`, `_PASSPHRASE`, `_SERVERNAME`. |
| `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED` | Default **`false`**, and it is copied into `ssl.rejectUnauthorized`. So `CUBEJS_DB_SSL=true` alone does not verify the server certificate ([base-driver] L209-282, [env-ts] L432-466). |
| Per-connection statements | `SET TIME ZONE '<storeTimezone or UTC>'` and `SET statement_timeout TO <executionTimeout>` ([pg-driver] `prepareConnection`). |

**Pre-aggregations and the source DB.** The source DB belongs to another app and should stay read-only.

- **Defaults for `external`:** when `external` is undefined, `rollup` and `rollupJoin` get `external = CUBEJS_EXTERNAL_DEFAULT`, whose default is `'true'`. Other types, including `original_sql`, get `false` ([cube-symbols] L771-775, [env-ts] L2078-2080).
- **External builds (Cube Store) never write to the source:**
  - The schema is created on the **external** client: `client = external ? externalDriverFactory() : driverFactory()`, then `createSchemaIfNotExists(preAggregationsSchema)` ([pal] L250-255).
  - For external builds, a read-only driver selects `refreshReadOnlyExternalStrategy` ([pal] L471-482). That strategy streams the rollup `SELECT` from the source (`downloadQueryResults`), or uses `unloadFromQuery` when supported, into Cube Store ([pal] L781-825).
  - `PostgresDriver.getInitialConfiguration` returns `{ readOnly: true }`, and `readOnly()` returns `!!this.config.readOnly` ([pg-driver]).
  - Docs: Postgres "Batching" works "with read-only mode" and is the default; Postgres has no export bucket ([d-pg]).
- **Builds that do write to the source:**
  - `original_sql` pre-aggregations "**must only** be stored in the data source" ([d-ref-preagg]).
  - The "simple" strategy uses "the source database as a temporary staging area" ([d-using-preagg]).
  - Docs: "depending on your data source, Cube may require write access to the pre-aggregations schema" ([d-preagg-index]).
  - Derived: `original_sql`, `external: false` rollups, and rollups built from them (`use_original_sql_pre_aggregations`) fail under a read-only role. `CREATE SCHEMA IF NOT EXISTS prod_pre_aggregations` also runs on the source when no version entries exist.
- **`CUBEJS_PRE_AGGREGATIONS_SCHEMA`:** default `prod_pre_aggregations` in production ([d-env]). With external rollups this schema lives in Cube Store ([pal] L250-255).

### Telemetry, logging, dev mode

**Telemetry:**

- **`CUBEJS_TELEMETRY`:** default `true` in both dev and production ([env-ts] L2013-2015, [d-env]). Disable with `CUBEJS_TELEMETRY=false` or `telemetry: false` ([d-config]).
- **Docs vs source:** the docs say collection is "for servers started in development mode" ([d-config]). The v1.7.45 source, in production mode with telemetry on, also sends:
  - `Server Start`
  - `Cube SQL Error` events
  - periodic `Load Request Success Aggregated` counts

  Source: [core] L244-277, L320-355.
- **Cube Store telemetry:** reads `CUBESTORE_TELEMETRY`, falling back to `CUBEJS_TELEMETRY`, default `"true"`. When on, it sends `Cube Store Start` ([cs-main], [d-env]).

**Logging:**

- **`CUBEJS_LOG_LEVEL`:**
  - The docs list `error`, `info`, `trace` or `warn`, with default `warn` ([d-env]).
  - In source, `createLogger(NODE_ENV === 'production', getEnv('logLevel'))` falls back to `'info'` when the variable is unset ([core] L194-200, [logger]). Set it explicitly.
- **`CUBEJS_LOG_REDACTION`:** defaults to `true` when not in dev mode ([env-ts] L217-224).
- **`CUBESTORE_LOG_LEVEL`:** default `error` ([d-env]).

**Dev mode:** keep `CUBEJS_DEV_MODE=false`. The docs comment: "Under the `cubejs` CLI and the official images, setting this to `true` also forces NODE_ENV=development, switching off JWT verification on the data APIs" ([d-deploy]).

### Mounting `cube.js` from a ConfigMap

- **The stock image's `/cube/conf` is empty.** It is only a `WORKDIR` ([dockerfile], [docker-dir]), and Cube's own `node_modules` are at `/cube/node_modules` on `NODE_PATH`. So a whole-directory mount at `/cube/conf` hides nothing from the **stock** image.
- **The docs' warning is about custom images.** Their example is `FROM cubejs/cube:latest` + `COPY . .` + `RUN npm install` into `WORKDIR /cube/conf`: "you shoudn't mount the whole current folder (`.:/cube/conf`) if you have dependencies in `package.json`", because it hides `node_modules` ("Error: Cannot find module") ([d-deploy]).
- **`subPath` mounts don't update.** "A container using a ConfigMap as a subPath volume mount will not receive ConfigMap updates" ([k8s-cm]). Cube reads `cube.js` only at startup anyway ([container]).
- **A whole-directory ConfigMap mount is read-only.** That only matters if something writes to `/cube/conf`, such as the default `FileRepository.ensureDir` (above).
- **Size limit:** ConfigMaps are capped at 1 MiB ([k8s-cm]).

### Cube's Kubernetes guidance

- **Cube's docs:** "If you'd like to deploy Cube to Kubernetes, please refer to the following resources with Helm charts: `gadsme/charts` or `OpstimizeIcarus/cubejs-helm-charts-kubernetes`" ([d-deploy]). Cube ships no chart of its own.
- **Health checks:** "Kubernetes-API compatible health check (or probe) endpoints … `/readyz` and `/livez`" ([d-deploy]).
- **Sizing guidance** ([d-deploy]):
  - at least 2 API instances with 3 GB RAM and 2 CPU each
  - refresh worker 6 GB RAM
  - router 6 GB RAM and 4 CPU
  - workers 8 GB RAM and 4 CPU

**gadsme/charts.** Apache-2.0, last push 2025-11-14 ([gad-repo]). `cube` chart 3.3.0 and `cubestore` chart 1.2.0, both with appVersion `1.5.3`, so they predate 1.7.x ([gad-cube-chart], [gad-cs-chart]).

**gadsme `cube` chart:**

- **API Deployment:**
  - Container port `http` = `config.apiPort` (4000).
  - Liveness is `httpGet /livez` and readiness is `httpGet /readyz`, both on port `http` ([gad-api]).
  - Defaults: `initialDelaySeconds 10`, `periodSeconds 30`, `timeoutSeconds 3`, `successThreshold 1`, `failureThreshold 3`.
  - Config defaults: `devMode false`, `logLevel "warn"`, `telemetry false`, Cube Store port 3030.
  - `securityContext.enabled: false`, with commented `runAsUser/fsGroup: 1001` ([gad-cube-values]).
  - Models are mounted through user `volumes`/`volumeMounts`. Examples show a ConfigMap at `/cube/conf/schema` or an init-container volume ([gad-cube-values]).
- **Refresh worker Deployment:** `CUBEJS_REFRESH_WORKER: "true"`, 1 replica, the same probes on `http` ([gad-worker]).

**gadsme `cubestore` chart:**

- **Router StatefulSet** ([gad-router]):
  - Env:
    - `CUBESTORE_SERVER_NAME=<fullname>-router:<metaPort>` (or `router.metaHost`)
    - optional `CUBESTORE_PORT`
    - `CUBESTORE_HTTP_PORT` (3030), `CUBESTORE_META_PORT` (9999), `CUBESTORE_STATUS_PORT` (3031)
    - `CUBESTORE_WORKERS=<fullname>-workers-N.<headless>:<port>`, only when `workersCount > 0`
    - `CUBESTORE_DATA_DIR=/cube/.cubestore/data`
    - `CUBESTORE_REMOTE_DIR=/cube/data` when no GCS, S3 or MinIO bucket is set
  - Probes: `httpGet /livez` and `/readyz` on port `status`.
  - Data dir: a `volumeClaimTemplates` PVC (or `emptyDir` if persistence is off).
  - Remote dir: a shared PVC `<fullname>-remote-storage` ([gad-pvc]), `ReadWriteMany` by default ([gad-cs-values]).
- **Workers StatefulSet** ([gad-workers]):
  - `CUBESTORE_SERVER_NAME=$(MY_POD_NAME).<headless>:<port>`
  - `CUBESTORE_WORKER_PORT` (9001), `CUBESTORE_WORKERS`, `CUBESTORE_META_ADDR=<router>:<metaPort>`, and the same data and remote dirs
  - **No probes.**
- **Common env:** `CUBESTORE_TELEMETRY` from `config.telemetry` (default `false`), plus log level and cloud-storage variables ([gad-common], [gad-cs-values]).

**OpstimizeIcarus chart** ([opst]):

- Deploys `cube-api` and `cube-refresh-worker` as Deployments, and `cubestore-router` and `cubestore-worker` as StatefulSets.
- Uses one shared PVC for Cube and one for Cube Store.
- Its README suggests a custom image with the model at `/cube/conf` rather than init containers.

## Gotchas

1. **`/readyz` does not reflect Postgres or Cube Store for wechart** (`contextToAppId` makes it non-standalone; [core] L222-225, [gw] L3040-3055). A Ready Cube pod is not evidence that the data source or Cube Store is reachable. AC-248's "every component Ready" needs a separate data-path check, such as T274's `/v1/load` against northwind.
2. **`/livez` fails on dependency outages** once an orchestrator exists ([gw] L3056-3067, [orch-storage]).
   - Used as a `livenessProbe`, a Postgres or Cube Store outage restarts the Cube pods.
   - Kubernetes warns that liveness probes "should be configured with caution, as incorrect settings can lead to cascading failures" ([k8s-pods-print]).
   - The gadsme chart uses `/livez` for liveness anyway ([gad-api]).
   - Open issue #5525 reports health endpoints going unresponsive while large ClickHouse results deserialize. Probes and queries share Node's event loop ([i-5525]).
3. **Cube Store does not stop cleanly on SIGTERM.**
   - It only listens for Ctrl+C: `tokio::signal::ctrl_c()`, which is SIGINT on Unix ([cs-main], [tokio-ctrlc]). There is no other `SignalKind`, `SIGTERM` or `ctrl_c` in `rust/cubestore` besides the JS wrapper ([sg-signals]), and `respawn::init` installs no handlers ([cs-respawn]).
   - `./cubestored` is PID 1 ([cs-dockerfile]). A PID-namespace init only receives signals it has handlers for; SIGKILL is forced ([pidns]).
   - Kubernetes sends TERM, then KILL after the grace period, which defaults to 30 s ([k8s-print]).
   - Derived consequence: SIGTERM is ignored, the pod takes the full grace period to stop, and `stop_processing_loops()` never runs.
   - Options, neither verified: a `preStop` exec of `kill -INT 1`, which should be deliverable because the process has a SIGINT handler; or `lifecycle.stopSignal: SIGINT`, which needs the `ContainerStopSignals` feature gate ([k8s-stopsignal]).
4. **Cube shuts down gracefully only when asked.**
   - On SIGTERM or SIGINT, Cube exits immediately with `process.exit(0)` unless `CUBEJS_GRACEFUL_SHUTDOWN` or the `gracefulShutdown` option is set.
   - When it is set, Cube calls `server.shutdown()` over that many seconds; the production default is 30 once enabled.
   - A third signal exits with code 130 ([container] L340-406, [env-ts] L304-305).
   - The server is killed at `(gracefulShutdown || 2) + 1` seconds ([server-pkg] L231-232).
   - Keep `terminationGracePeriodSeconds` above that (derived).
5. **Where Cube Store writes.** Without `CUBESTORE_DATA_DIR` or `CUBESTORE_REMOTE_DIR`, everything goes to `/cube/.cubestore/data` ([cs-config] L1761). wechart's compose volume at `/cube/data` is therefore unused, and pre-aggregations don't survive container recreation there. A pod restart without a PVC on the path actually used loses the metastore, cachestore and all rollups; the refresh worker then rebuilds them (derived).
6. **Plain `cubejs/cubestore:v1.7.45` is amd64-only.** arm64 nodes need `-arm64v8` ([hub-cs]). The amd64 build targets AVX2 ([cs-dockerfile]).
7. **Cube Store has no authentication, and MySQL 3306 is always bound on `0.0.0.0`** ([d-prod], [cs-config] L1866-1870). Restrict it to Cube pods. NetworkPolicy only works if the cluster's network plugin implements it: "Creating a NetworkPolicy resource without a controller that implements it will have no effect" ([k8s-np]). Cube needs only 3030; probes need 3031.
8. **No replication and no HA in Core.** "The router node and every worker node should always have only one instance copy … Replication will lead to undefined behavior" ([d-prod]). Run Cube Store with `replicas: 1`.
9. **`CUBEJS_CUBESTORE_HOST` must be set.** The driver otherwise dials `127.0.0.1:3030` inside the Cube pod ([csd] L89-90).
10. **`CUBEJS_DB_SSL=true` does not verify certificates** unless `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED=true` ([base-driver] L278, [env-ts] L453-466).
11. **Read-only source role.** It is fine for `rollup` (external) pre-aggregations. It breaks `original_sql`, `external: false` rollups, and rollups that reuse `original_sql` (see API surface).
12. **Telemetry and log level defaults differ from the docs.** See API surface. Set `CUBEJS_TELEMETRY=false`, `CUBESTORE_TELEMETRY=false` and an explicit `CUBEJS_LOG_LEVEL`.
13. **Deployment-relevant changes in 1.7.43–1.7.45** ([changelog]; details in `docs/research/cube/upgrade-1.7.43.md`):
    - **v1.7.45 #11815** adds `CUBESTORE_SQL_PARSER_RECURSION_LIMIT`, `CUBESTORE_MAX_QUERY_PLAN_DEPTH`, `CUBESTORE_MAIN_STACK_SIZE` and `CUBEJS_MAX_MULTI_STAGE_DEPTH` ([pr-11815]).
      - `CUBESTORE_MAIN_STACK_SIZE` sets the Tokio worker stack: default 8 MiB, raised with a warning if below 2 MiB ([cs-main]).
      - The commit's "deploy workers before routers" advice doesn't apply to a single node.
    - **v1.7.45 #11965** deprecates the `cubejs` CLI. Per the PR, `server` (the image CMD) stays silent ([pr-11965]).
    - **v1.7.44 #11939** changes `/v1/graphql-to-json` scope, not the probes.
    - Unchanged: at v1.7.45 the Dockerfile base is still `node:24.21.0-trixie-slim` ([dockerfile]), and the health handlers, ports and bind defaults are as described above.

## Alternatives considered

Not requested.

## Open questions / unverified

- **Nothing here was observed on Kubernetes.** The probe semantics, the empty-model behaviour and signal handling are read from v1.7.45 source. Suggested checks on the docker-desktop release:
  - `GET /readyz` with Postgres scaled to 0 (expect 200 because of `contextToAppId`)
  - `GET /livez` after one query with Cube Store down (expect 500)
  - `kubectl delete pod` timing for Cube Store (expect about the full grace period)
  - `GET /v1/meta` with an empty model (expect `{"cubes":[]}`)
- **UNVERIFIED: Cube with `readOnlyRootFilesystem: true` or non-root.** No write path was found for wechart's config, but I did not check Node, the native module, Python or `os.tmpdir()`. Test with an `emptyDir` at `/tmp` if needed.
- **UNVERIFIED: Cube Store as non-root.** It needs a writable data dir (and remote dir); gadsme uses `runAsUser`/`fsGroup` ([gad-router]). Not tested.
- **UNVERIFIED (inference): keep `CUBESTORE_SERVER_NAME` stable.** The claim is that changing it while the metastore persists could strand queued jobs keyed to the old node name. Only the `server_name == node_name` comparisons were read ([cs-cluster] L559, L1947); the job schema was not traced.
- **UNVERIFIED: Option A vs Option B storage on restart.** It was not traced how the metastore reopens from `<data>/metastore` versus downloading from the remote dir on restart. Both follow from the path code ([cs-config], [cs-remotefs]), but neither was run.
- **UNVERIFIED: whether Docker Hub's tag-level `digest` for `cubejs/cube:v1.7.45` is the multi-arch index digest usable for `@sha256` pinning.** Not pulled.
- **UNVERIFIED: the preStop `kill -INT 1` workaround and `stopSignal: SIGINT`.** Derived from [pidns], [tokio-ctrlc] and [k8s-stopsignal], not tried. I also did not check whether docker-desktop's Kubernetes enables `ContainerStopSignals`.
- **Not checked: the production telemetry interval length.** Only that a `setInterval` sends aggregated counts ([core] L345-348).
- **Method caveat.**
  - Most source lines were read through Sourcegraph's search API pinned to `rev:v1.7.45` (commit `f2c28b8`, matching [tag]); some files through `raw.githubusercontent.com/…/v1.7.45/…`.
  - Both go through a summarizing fetch tool. Code was requested verbatim and quoted as returned.
  - One tool reply about Kubernetes' liveness caution looked paraphrased, so it was dropped. The quoted Kubernetes text comes from Context7 (`/websites/kubernetes_io`) and kubernetes.io pages.

[tag]: https://api.github.com/repos/cube-js/cube/git/tags/bc307de58890be4c41cbba4297d486905171d9eb
[hub-cube]: https://hub.docker.com/v2/repositories/cubejs/cube/tags?page_size=50&name=v1.7.45
[hub-cs]: https://hub.docker.com/v2/repositories/cubejs/cubestore/tags?page_size=50&name=v1.7.45
[dockerfile]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
[docker-dir]: https://github.com/cube-js/cube/tree/v1.7.45/packages/cubejs-docker
[docker-pkg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/package.json
[publish]: https://github.com/cube-js/cube/blob/v1.7.45/.github/workflows/publish.yml
[cs-dockerfile]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/Dockerfile
[cs-config]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/config/mod.rs
[cs-status]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/http/status.rs
[cs-main]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/bin/cubestored.rs
[cs-cluster]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/cluster/mod.rs
[cs-remotefs]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/remotefs/mod.rs
[cs-respawn]: https://github.com/cube-js/cube/blob/v1.7.45/rust/cubestore/cubestore/src/util/respawn.rs
[gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[cached]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/cached-handler.ts
[core]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[orch-api]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorApi.ts
[orch-storage]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OrchestratorStorage.ts
[compiler-api]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
[logger]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/logger.ts
[qo]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts
[pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[dsc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[cube-symbols]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[file-repo]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/FileRepository.ts
[env-ts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[container]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server/container.ts
[server-pkg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
[cli-server]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cli/src/command/server.ts
[cli-proxy]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cli/src/command/proxy-command.ts
[csd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-cubestore-driver/src/CubeStoreDriver.ts
[pg-driver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[base-driver]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-base-driver/src/BaseDriver.ts
[d-deploy]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/deployment.mdx
[d-prod]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/cube-core/running-in-production.mdx
[d-env]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
[d-config]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[d-pg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
[d-preagg-index]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/index.mdx
[d-using-preagg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/using-pre-aggregations.mdx
[d-ref-preagg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[changelog]: https://github.com/cube-js/cube/blob/v1.7.45/CHANGELOG.md
[pr-11815]: https://github.com/cube-js/cube/pull/11815
[pr-11965]: https://github.com/cube-js/cube/pull/11965
[sg-isrouter]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+file:config/mod.rs+patterntype:regexp+pub+fn+is_router
[sg-docs]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+file:docs-mintlify/+patterntype:regexp+(3031%7CCUBESTORE_STATUS%7CCUBESTORE_SERVER_NAME%7CCUBESTORE_META_PORT)
[sg-nocubes]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+patterntype:regexp+-file:test+-file:docs+(%27No+cubes%7C%22No+cubes%7CNo+data+model%7Cno+cubes+found%7CSchema+files+not+found%7CNo+schema+files)
[sg-dsf]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+patterntype:regexp+file:packages/cubejs-(schema-compiler%7Cserver-core)/src/+dataSchemaFiles%5C(%5C)
[sg-pgenv]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+file:packages/cubejs-postgres-driver/src/+patterntype:regexp+getEnv%5C(%27%5Cw%2B%27
[sg-signals]: https://sourcegraph.com/.api/search/stream?q=repo:%5Egithub%5C.com/cube-js/cube%24+rev:v1.7.45+file:rust/cubestore/+patterntype:regexp+(SignalKind%7CSIGTERM%7Csignal::unix%7Cctrl_c)
[node-df]: https://github.com/nodejs/docker-node/blob/main/24/trixie-slim/Dockerfile
[node-ep]: https://github.com/nodejs/docker-node/blob/main/24/trixie-slim/docker-entrypoint.sh
[node-bp]: https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
[gad-repo]: https://api.github.com/repos/gadsme/charts
[gad-cube-chart]: https://github.com/gadsme/charts/blob/main/charts/cube/Chart.yaml
[gad-cs-chart]: https://github.com/gadsme/charts/blob/main/charts/cubestore/Chart.yaml
[gad-api]: https://github.com/gadsme/charts/blob/main/charts/cube/templates/api/deployment.yaml
[gad-worker]: https://github.com/gadsme/charts/blob/main/charts/cube/templates/worker/deployment.yaml
[gad-cube-values]: https://github.com/gadsme/charts/blob/main/charts/cube/values.yaml
[gad-router]: https://github.com/gadsme/charts/blob/main/charts/cubestore/templates/router/statefulset.yaml
[gad-workers]: https://github.com/gadsme/charts/blob/main/charts/cubestore/templates/workers/statefulset.yaml
[gad-pvc]: https://github.com/gadsme/charts/blob/main/charts/cubestore/templates/pvc.yaml
[gad-common]: https://github.com/gadsme/charts/blob/main/charts/cubestore/templates/common-env.tpl
[gad-cs-values]: https://github.com/gadsme/charts/blob/main/charts/cubestore/values.yaml
[opst]: https://github.com/OpstimizeIcarus/cubejs-helm-charts-kubernetes/tree/release-v0.1
[k8s-cm]: https://kubernetes.io/docs/concepts/configuration/configmap/
[k8s-np]: https://kubernetes.io/docs/concepts/services-networking/network-policies/
[k8s-print]: https://kubernetes.io/docs/concepts/workloads/_print
[k8s-pods-print]: https://kubernetes.io/docs/concepts/workloads/pods/_print
[k8s-stopsignal]: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle
[pidns]: https://man7.org/linux/man-pages/man7/pid_namespaces.7.html
[tokio-ctrlc]: https://docs.rs/tokio/latest/tokio/signal/fn.ctrl_c.html
[i-2779]: https://github.com/cube-js/cube/issues/2779
[i-4808]: https://github.com/cube-js/cube/issues/4808
[i-5525]: https://github.com/cube-js/cube/issues/5525
