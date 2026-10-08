# Deploying wechart to Kubernetes

F24, AC-248, task T274. The Helm chart at `deploy/helm/wechart` runs wechart, Cube and Cube Store in one namespace. Cube's data source comes from the chart's values. On Docker Desktop, the values in `deploy/helm/values/docker-desktop.yaml` point Cube at the **northwind** database of the Superset install in the same cluster, and serve the app at **http://localhost:8089**.

## What the chart runs

| Component | Kind | Image | Service | Probes |
| --- | --- | --- | --- | --- |
| `web`: the built app, and `/api` passed to the API | Deployment | `wechart-web:<tag>` (nginx, unprivileged) | `LoadBalancer`, port `web.service.port` | `/healthz` |
| `api`: wechart's API | Deployment, `api.replicas` (2), rolled one at a time, with a PodDisruptionBudget | `wechart-api:<tag>` | ClusterIP 4100 | `/api/health` |
| `meta`: wechart's metadata database | StatefulSet with a volume | `postgres:18.6-alpine3.24` | headless 5432 | `pg_isready` over TCP |
| `cube`: Cube's API | Deployment, `cube.replicas` (2), with a PodDisruptionBudget | `ghcr.io/senthilkrajagopal/xcube:v1.7.45-256d632371@sha256:838c7096…` | ClusterIP 4000 | `/readyz` (startup, readiness, liveness) |
| `cube-refresh-worker`: Cube's refresh worker | Deployment, 1 replica | the same | ClusterIP 4000 | `/readyz` (startup, readiness, liveness) |
| `xcube-bootstrap-<hash>`: xcube's role and schema in the metadata database | Job, run once | `postgres:18.6-alpine3.24` | none | none |
| `cubestore`: Cube Store, one node | StatefulSet with a volume | `cubejs/cubestore:v1.7.45` (`-arm64v8` on arm64) | headless 3030 | `:3031/readyz`, `:3031/livez` |

Cube reads `infra/cube/cube.js`, the same file docker-compose mounts. The chart reaches it through the link `deploy/helm/wechart/files/cube.js`. Helm follows the link and prints a "found symbolic link" line each time it loads the chart (`docs/research/helm.md`, "Symlinks in 3.17.2").

That file is xcube's configuration (T447). xcube serves the model from its own schema, `xcube`, in the metadata database. The API pushes its published files there (see "The model"), and Cube never calls the API. The bootstrap Job runs the fork's `bootstrap.sql` (`infra/xcube/bootstrap.sql`, linked as `files/xcube-bootstrap.sql`) as the database's admin. It makes the role `xcube`, which owns the schema, with a password the chart generates. Each Cube pod's init container waits until it can connect as that role and the schema is there, because a Cube process started earlier exits (`docs/research/xcube-slice-2.md`, Gotcha 14). xcube then creates and migrates its tables itself. Until every model is compiled Cube's port stays closed, so a startup probe waits up to `cube.startupSeconds` (300) before the liveness probe applies.

Only the web app is published outside the cluster. The API, Cube, Cube Store and the metadata database are ClusterIP or headless Services. The API serves Cube nothing: the model store's routes went with T431. A request for `/api/cube-model/…` now reaches the API like any other, and is answered 404, or 401 with sign-in on.

## Before you start

- Docker Desktop with Kubernetes on, context `docker-desktop`.
- Helm 3.17.2 and kubectl. Helm 3.17 is documented for Kubernetes 1.29–1.32, and Docker Desktop runs 1.34.1 (`docs/research/helm.md`, "Install"). Nothing this chart uses is known to break.
- Nothing else listening on port 8089. On this machine, 8088 is Superset's, 3000 Metabase's, and 8090, 8092 and 8094 belong to another namespace.

## 1. Build the images

Both images build from the repository root with one Dockerfile, which installs the workspace from the lockfile inside the build (`docs/research/node-docker-pnpm.md`).

```sh
TAG=$(git rev-parse --short HEAD)
docker build -f deploy/Dockerfile --target api -t wechart-api:$TAG .
docker build -f deploy/Dockerfile --target web -t wechart-web:$TAG .
```

Cube runs v1.7.45, unmodified, with the user's fork's package xcube. xcube adds the data-source introspection API that wechart generates cubes with (T275, T413–T415, T417; `docs/research/cube/introspection-api.md`). From the fork's commit `83cb9f0888` it also serves the model (T447; `docs/research/xcube-slice-2.md`), and from `c0610bb768` it serves it as items: names resolved in folders, compiled in modules (T449; `docs/research/xcube-slice-3a.md`, `xcube-slice-3b.md`). From `ed08180c37` it carries slices 4–6: the folder gate and RS256 tokens, overlays for previews, and data-source connections (T420, R31; `docs/research/xcube-slice-4.md`, `-5.md`, `-6.md`, `xcube-overlay-data-sources.md`). Each model's rollups built once more on that image's first start, in a schema of the model's own. From `e53cf2a8b8`, `GET …/items` names each cube's bound data source, a cube bound to any data source but `default` gets an SQL alias naming it, and each instance re-reports its connections' health on a heartbeat (T459; `docs/research/xcube-22132c309c.md`, `xcube-e53cf2a8b8.md`). From `919cff8c6e`, a data source changed in place is served from its new target at once, as a new epoch: no answer from its old target's cache or rollups once every Cube instance reports it live. A cube keeps its names, SQL and rollup tables while its data source is at the target it was first served with, and takes an alias only once that target changes (R38, AC-328). A query into a folder the token's groups don't reach answers `403` by `GET /v1/sql` and `/v1/dry-run` too (T501; `docs/research/xcube-4754c2c960.md`, `xcube-bc18f82c01.md`, `xcube-2d5ac86f24.md`, `xcube-919cff8c6e.md`). From `89628a0e88`, xcube runs read-only SQL on a data source's connection, a workspace overlay's own, or Cube Store, and cancels a run on whichever instance runs it (T532, R50; `docs/research/xcube-sql-runner.md`). From `6d9673ccda`, a run stopped at its time cap or cancelled answers the rows it read before the stop (T545; `docs/research/xcube-6d9673ccda.md`). From `93a5f7a73b`, the introspection routes read a workspace overlay's own data source, `?overlay=<id>` under the service credential alone (T547; `docs/research/xcube-93a5f7a73b.md`). From `2099b13f2d`, a Cube Store run stopped at its cap or cancelled answers at once with `stillRunning` and `endsBy`, since Cube Store can't stop a query; xcube follows it to its real end, and `GET …/sql/runs/{runId}` says each run's state (T548, R62; `docs/research/xcube-2099b13f2d.md`). From `46ca0ce708`, a stopped query that Cube Store's router runs, which Cube Store's timeout can't end, answers `endsBy: null` and stays `stopping` until Cube Store answers it, for up to 24 hours (T549; `docs/research/xcube-46ca0ce708.md`). From `74c933bdb8`, a building pre-aggregation build the queue's cancel takes out with `processing: true` is stopped (on PostgreSQL, its query cancelled in the source), none of it is kept, and the cancel answers what came of it: stopped, failed, finished (its version stands) or still stopping (T554; `docs/research/xcube-74c933bdb8.md`). From `256d632371`, names are one per model (R71): cubes and views share one namespace and data sources another, each compared ignoring case, and every route takes and answers bare names, with no `<folderId>__` prefix. Every reference points up its referrer's folder path (R72), and a data source named `default` is the root's alone. A refused name, data-source range or reference range says the caller's item, never where another item is (T701; `docs/research/xcube-256d632371.md`).

**Upgrading to `256d632371`:** no upgrade in place. Its schema 14 has no migration from folder-prefixed names, and the image refuses to start on a schema that holds any (`xcube-256d632371.md`). It is installed only by the fresh start of T702: wechart's metadata and xcube's schema are dropped and seeded again.

**Cube Store's query timeout:** `endsBy` is a run's start plus xcube's `XCUBE_CUBESTORE_QUERY_TIMEOUT`, which must equal Cube Store's own `CUBESTORE_QUERY_TIMEOUT`: xcube can't read it from Cube Store. Both are 120 s unset, and neither compose nor the chart sets either. A `CUBESTORE_QUERY_TIMEOUT` in the chart's `cubestore.env` is given to xcube's API instances as `XCUBE_CUBESTORE_QUERY_TIMEOUT` too. In compose, set both, or neither. Cube Store's timeout ends the work of its select workers, Cube's own queries' included, but not a query its router runs, such as one over `VALUES` or `information_schema`: only restarting Cube Store stops that (`xcube-46ca0ce708.md`).

**Upgrading to `74c933bdb8`:** from `46ca0ce708`, no migration runs: the latest is still 13 (`xcube-74c933bdb8.md`). A cancel of a building entry now waits for what came of the build, up to about 20 s, where it answered at once before. An API from before T554 offers no Stop, so it never sends one.

**Upgrading to `46ca0ce708`:** from `2099b13f2d`, no migration runs: the latest is still 13 (`xcube-46ca0ce708.md`). Upgrade the API with it or first: an API from before T549 reads a stop with `endsBy: null` as one that may still be finishing, and holds nothing.

**Upgrading to `2099b13f2d`:** from `93a5f7a73b`, xcube's migration 13 runs at the first start, additive: two nullable columns on its `sql_runs` (`xcube-2099b13f2d.md`). wechart's own migration `1758620000000_sql-run-ends-by` is additive too. Upgrade the API with it or first: an API from before T548 reads no `stillRunning`, so it says a stopped Cube Store run ended, and lets its user's next run start while it runs on.

**Upgrading to `93a5f7a73b`:** from `6d9673ccda` or `89628a0e88`, no migration runs: the latest is still 12 (`xcube-93a5f7a73b.md`, `xcube-6d9673ccda.md`). Upgrade the API with it or first: an API from before T547 passes a browser's `?overlay=` on to introspection.

**Upgrading to `89628a0e88`:** from `919cff8c6e`, xcube's migrations 9–12 run at the first start, each additive. 9 gives each data source's base its target (`465865f3fd`; `docs/research/xcube-465865f3fd.md`), so upgrade with the root `default` stored. 10 and 11 hold the build queue and quick calculations, and 12 the SQL runs going (`docs/research/xcube-sql-runner.md`). By reading, nothing is renamed or rebuilt (`xcube-465865f3fd.md`, finding 10).

**Upgrading to `919cff8c6e`:**
- From `bc18f82c01` (compose and the docker-desktop release until now), cubes on a data source wechart stores (the root's `default` among them) go back to their published names, and their rollups are built once more. Until the refresh worker has built them, a query a rollup serves answers Cube's "No pre-aggregation partitions were built yet". xcube advises upgrading the refresh worker first. The chart and compose give Cube and its worker one image, so they upgrade together, and rollup-served tiles answer "not built yet" until the worker's next run.
- From `e53cf2a8b8`, nothing is renamed or rebuilt at the first start. Migration 8 runs, Cube's result cache starts empty once for each model with data sources, and a few cubes take new aliases at each model's next publish (`xcube-4754c2c960.md`; the seed model has none). One proviso: a data source changed in place while `e53cf2a8b8` served still has rollups under its published names built from its earlier target. They serve until their refresh keys renew them (`xcube-2d5ac86f24.md`, "Upgrading from `e53cf2a8b8`").
- Don't change a data source's target while the release is rolling: until every Cube instance runs the new image, an older one would serve or build under the other names.
- A data source's first target is the one it has when this image first serves it, so on an upgrade with the root `default` already stored, the root keeps its names. Where Cube served the root from its own settings before `default` was stored (a fresh install, or after `default` is removed), the root keeps its names only if `default` reaches the host, port, database and user Cube reads from `CUBEJS_DB_*`, for PostgreSQL, Redshift or MySQL. The chart seeds `default` from `cube.dataSource`, which Cube also reads, so they match: don't set those four again in `cube.dataSource.env` or `seedFields`. For another warehouse, the seeding then renames the root's cubes and rebuilds their rollups once.
- After that, changing a data source's host, port, database, user or key holder aliases its cubes and rebuilds their rollups once; moving it back restores the names, and rebuilds the rollups if Cube dropped the old tables meanwhile, as it does by default. A new password changes nothing. A BigQuery key or Snowflake or Dremio token entered again, even the same one, counts as a change (a question for the user: `docs/phase-2/backlog.md` §6).
- ~~If the root's `default` is removed from xcube, as a data reset does, the root's cubes are aliased until it is stored again.~~ Corrected with `465865f3fd`, in this release since `89628a0e88` (`xcube-465865f3fd.md`, findings 8 and 9):
  - a data reset doesn't remove it while the root's cubes are published, since xcube refuses (`409 in_use`);
  - if it is removed, the root keeps its names where `CUBEJS_DB_*` reaches the host, port, database and user it did (PostgreSQL, Redshift, MySQL).

xcube is the package that was `cube-introspection/`, renamed at the fork's commit `a13b9cff43` with its HTTP API unchanged.

The fork's CI publishes the image for amd64 and arm64, and it is pulled by digest, never by its moving tag `v1.7.45-feat-xcube`:

```sh
docker pull ghcr.io/senthilkrajagopal/xcube:v1.7.45-256d632371@sha256:838c70961a7957ed19068cdc7bf2db37683ade2160f6095aa901b57fd13fae04
```

That is the chart's default `cube.image` and docker-compose's, for Cube and its refresh worker alike; a plain `cubejs/cube` image won't start with xcube's `cube.js`. The image's own command starts the package's server, so give Cube no `command` or `args`: `cubejs server` would start it without the introspection routes.

wechart's own images are not pushed. This cluster's node runs on the Docker engine (`kubectl get nodes -o wide` shows `docker://`), and its pods used the locally built images; Docker's own docs don't say so (`docs/research/helm.md`, "Open questions"). The chart pulls a wechart image only if it isn't there (`images.pullPolicy: IfNotPresent`). Give each build its own tag: an upgrade to the same tag doesn't restart the pods.

## 2. The data source's Secret

The chart names the Secret that holds the data source's password; the password itself never goes into a values file. For northwind, copy it from Superset's Secret without printing it:

```sh
kubectl --context docker-desktop create namespace wechart
kubectl --context docker-desktop -n superset get secret superset-postgresql \
    -o jsonpath='{.data.postgres-password}' | base64 -d |
  kubectl --context docker-desktop -n wechart create secret generic wechart-northwind \
    --from-file=password=/dev/stdin
```

This reads the `superset` namespace and changes nothing in it.

**Which role Cube uses.** Superset's own northwind connection uses the role `northwind`, which owns the database's tables. Its password is kept only inside Superset, encrypted, and not in any Kubernetes Secret. The only credential in a Secret that can read northwind is the server's superuser, `postgres`, so that is the role these values use.

A read-only role is enough for Cube's `rollup` pre-aggregations, which are built into Cube Store. `original_sql` pre-aggregations and rollups with `external: false` are built in the data source and need write access (`docs/research/cube/kubernetes.md`, "Pre-aggregations and the source DB"). To use a read-only role, have northwind's owner create one with `CONNECT` on the database and `SELECT` on its tables, put its password in the Secret, and set `cube.dataSource.user` to it.

## 3. Install or upgrade

```sh
helm upgrade --install wechart deploy/helm/wechart \
  --kube-context docker-desktop -n wechart --create-namespace \
  -f deploy/helm/values/docker-desktop.yaml --set-string images.tag=$TAG \
  --wait --timeout 10m
```

`--wait` returns when every Deployment and StatefulSet is ready, both volumes are bound, and the LoadBalancer has its address (`docs/research/helm.md`, "`--wait`").

## 4. Open the app

**http://localhost:8089**. The port is `web.service.port`. Docker Desktop published the LoadBalancer Service on the host's `localhost`, as it does Superset's on 8088; only a Docker blog post documents this (`docs/research/helm.md`, "Docker Desktop Kubernetes").

## 5. Verify

```sh
IMAGE_TAG=$TAG deploy/helm/verify.sh          # lint, render, install or upgrade, then check
deploy/helm/verify.sh --no-install            # check the release as it is
```

This is T274's test. It needs helm, kubectl, curl and jq, and it checks:

1. `helm lint` and `helm template` pass with the values.
2. After `helm upgrade --install --wait`, each of the six components is Ready.
3. The address the values name serves the app for `/`, `/explore` and a Model workspace deep link, and the app's script loads. A missing asset is a 404, and `/api/cube-model/files` is not served.
4. `/api/health` is ok, and `/api/cube-health` says Cube and its refresh worker are healthy.
5. A query from the web app reaches the data source the values name. The script publishes one cube on `public.orders` (`PROBE_TABLE`) through `/api/model/publish`, as the Model workspace does. It asks `/api/load` for the cube's count and expects more than zero. Then it removes the file again.
6. xcube serves the model (T447), checked between step 5's query and its removal:
   - **No API (D1).** With the API scaled to 0 and Cube restarted, Cube still counts the probe cube. The script asks it from inside Cube's pod, with a token it signs itself there, RS256 under the release's signing key (T437), which it passes to `node` on stdin.
   - **Two API replicas (D2).** With the API at 2, a second probe cube published through the Service is in each replica's `/api/meta` at once. The script then removes that probe and returns the API to `api.replicas`.
7. The query path survives losing one Cube instance and one API replica (T423, AC-319), with two of each. The script:
   - publishes a cube whose query sleeps 60 s in the warehouse, and asks for it;
   - on the first "Continue wait", deletes the Cube pod that took the query and the API pod that sent it. It finds them from Cube's log line for the request, which gives the caller's address. If it can't find them, the step fails;
   - keeps asking as the web app does: again on "Continue wait", and through network errors, 502, 503 and 504 for up to 90 s.

   It expects:
   - the query to return its data, between 60 and 150 s after the stop. Sooner, and the stopped instance finished it. Later, and the queue heartbeat didn't let it go;
   - with sign-in on, `/api/me` to name the same user at every answer, and never answer 401;
   - both Deployments to come back to full strength;
   - each to keep a PodDisruptionBudget that allows a disruption.

   On docker-desktop the answer came 102 s after the stop. The query ran again on the other instance after a stall of about 20 s.

The API publishes model files and never deletes them, so step 5 removes its file from the metadata database with `psql` in the `meta` pod. The official Postgres image trusts connections over its own socket (`docs/research/postgres-image.md`, "Log noise").

## Sign-in

Without it, wechart runs as phase 1 did: one user, a Super-Admin, and no sign-in (AC-254). `deploy/helm/values/docker-desktop-security.yaml`, laid over the Docker Desktop values, turns sign-in on with Dex, the development provider, running beside wechart (T324, AC-257):

```sh
helm upgrade --install wechart deploy/helm/wechart \
  --kube-context docker-desktop -n wechart --create-namespace \
  -f deploy/helm/values/docker-desktop.yaml \
  -f deploy/helm/values/docker-desktop-security.yaml --set-string images.tag=$TAG \
  --wait --timeout 10m
EXTRA_VALUES=deploy/helm/values/docker-desktop-security.yaml IMAGE_TAG=$TAG deploy/helm/verify.sh
```

- **Dex** listens at **http://localhost:5557/dex**, its issuer. Compose's Dex has 5556. Its configuration is compose's (`infra/dex/config.yaml`, linked into the chart as `files/dex-config.yaml`), with the issuer moved to 5557: memory storage and the static test users, whose passwords are in `infra/dex/test-users.json`. Development only.
- **The API** reaches that same Dex at its Service inside the cluster. `WECHART_OIDC_BACKCHANNEL_URL` rewrites only the origin, so the issuer the browser sees stays the token's `iss` (`docs/research/dex.md` §4, pattern B).
- **nginx** asks the API's `/api/auth/check` before serving any page or file of the app, and sends a page nobody is signed in to `/api/auth/login` (T321).
- **The Super-Admin group** is required with sign-in on: `security.superAdminGroup` (`wechart-super-admins` in the overlay, the group of Dex's `super` user). Without it the chart refuses to render, and an API started without `WECHART_SUPER_ADMIN_GROUP` refuses to start (T416, AC-318).
- **Generated**: the session cookie's secret and the client secret Dex and the API share, in the chart's Secret with the others (below).
- **Another provider** (Entra ID at phase end, T411; not yet tried): set `security.oidc.issuer`, `security.oidc.clientSecret.name` (a Secret you create), `security.publicUrl` and `security.superAdminGroup`, and leave `security.dex.enabled` off. The provider must list `<publicUrl>/api/auth/callback` as a redirect URI, and `<publicUrl>/` as a post-logout one. **Limits today:** an `https` `publicUrl` makes the API require `WECHART_TRUST_PROXY`, which the chart doesn't set yet, and the chart's nginx forwards its own `$scheme`, so a TLS terminator in front of it must be handled too. T411 settles both.

`verify.sh` then also checks that `/explore` without a session goes to sign-in and `/api/me` answers 401, signs `writer` in through Dex's form and finds them in `/api/me`, and runs its other checks signed in as `super`.

## The model

This release's model starts empty. The API seeds its model store from `WECHART_MODEL_DIR`, which the API image sets to an empty directory. The Cube pods have no model directory of their own, and the sample database's cubes are not shipped. wechart's sample dashboards stay off (`api.seed: false`), because they name those cubes. With an empty model, Cube answers `/v1/meta` with no cubes.

Build the model in the browser's **Model** workspace, then the dashboards.
- **Checking a publish.** xcube's dry run compiles the change and plans each cube's rollups without storing anything, and it refuses any break (T445).
- **Sending it.** Once committed to wechart's store, the API sends the whole model to xcube as items, each plain YAML file one root item, with the folder tree (T419, T446, T449). It also sends it when it starts and every 60 seconds, if xcube's items hash differs from wechart's. The tree is put again when the API starts and after every folder change. The model's id is `api.xcubeModel` (`wechart`). The API calls xcube with its service credential, under the key the chart generates (T420).
- **Every query token** names that model and the revision last recorded, so an answer never comes from an older one (T421).
- **With the API stopped**, Cube still serves the published model.

### Items mode, and the way back

The first API to start against the `c0610bb768` image moves the model from slice 2's file set to items mode with one items snapshot (T449). Nothing stored in wechart changes, and the root's cubes keep their names (AC-336).
- **Rollback in place is not possible.** From then on xcube refuses a file set for the model (`409 mode`), and the slice-2 image refuses to start on the schema (`needs xcube schema version 2 or later to read it`), which the new image migrates on its first start (`docs/research/xcube-slice-3b.md`, "Rollback").
- **The way back** to the slice-2 release, as the user decided in R30:
  1. Stop Cube and its refresh worker.
  2. Drop xcube's schema: `DROP SCHEMA xcube CASCADE` in the metadata database, as its owner.
  3. Re-run the bootstrap (`infra/xcube/bootstrap.sql`; in the chart, the `xcube-bootstrap-<hash>` Job).
  4. Deploy the slice-2 release: Cube on `xcube:v1.7.45-83cb9f0888`, and the API built before T449. That image was built locally and never published (the fork's CI publishes from `20bf014bb1` on), so build it from the fork at that commit:

     ```sh
     git -C ~/Work/bi/cube worktree add /tmp/xcube-83cb9f0888 83cb9f0888
     cd /tmp/xcube-83cb9f0888/xcube
     docker build -t xcube:v1.7.45-83cb9f0888 .
     ```

  xcube starts with a new generation and no models. The slice-2 API sends its file set at start, after each publish and on its 60 s reconcile, and a query token naming a revision the new generation lacks is answered from its current one (`xcube-slice-3b.md`, "The ways back").

## xcube's public key

Data-source credentials are sealed in the browser to xcube's public key, and only xcube can open them. The API is given that key as a JWK, `{"kty":"OKP","crv":"X25519","x":…,"kid":…}`, in `WECHART_XCUBE_PUBLIC_KEY`, where `kid` is the key's RFC 7638 thumbprint. It won't start without one, or with one that isn't an X25519 public key under its own thumbprint or that holds a private key, naming the setting and the problem. It also won't start until xcube says it holds a credential key with that `kid` (`GET /v1/semantic/credential-keys`), waiting while xcube can't be reached (T455).

**In the chart the key is made once, by a Job** (`templates/xcube-credential-key.yaml`; T455; research `kubernetes-job-generated-secret.md`). It runs xcube's own keygen in xcube's image and writes:
- **`<release>-xcube-credential-keys`**, a Secret holding `<kid>.pem` and its sample credential `<kid>.check`. It is mounted read-only into Cube's API instances and refresh worker, and into nothing of wechart's.
- **`<release>-xcube-public-key`**, a ConfigMap holding `jwk` and `kid`. The API reads `jwk`, and Cube's pods name the key by `kid` in `XCUBE_CREDENTIAL_KEY_IDS`.

Until the Job has run, the Cube pods wait for the Secret and the API pod waits for the ConfigMap. Neither object belongs to the release:
- `helm uninstall` leaves both, so a reinstall keeps the key the stored credentials were sealed to.
- **Back up the Secret**, apart from the metadata database. A lost key means every data source's secrets must be entered again: wechart can't recover them, by design.
- If the Secret is gone while the ConfigMap remains, the Job refuses to make a new key and says to restore the Secret.
- **To bring your own key,** create the Secret before installing, with one `<kid>.pem` and its `<kid>.check` from `xcube-keygen <dir> <key.pem>`. The Job then publishes its public half.

**Upgrading a release installed before this Job** moves it from the development key its values gave the API to its own. Any data source saved under the development key would need its secrets entered again. Upgrades made before data sources existed hold none.

Compose runs the development key pair in `infra/xcube/` instead (`infra/xcube/README.md`), and the Playwright configs give the API its public half.

## Pointing Cube at another data source

Everything about the data source is in `cube.dataSource`:

```yaml
cube:
  dataSource:
    type: postgres            # Cube's driver: CUBEJS_DB_TYPE
    host: db.example.internal # CUBEJS_DB_HOST
    port: 5432                # CUBEJS_DB_PORT
    database: sales           # CUBEJS_DB_NAME
    user: cube_reader         # CUBEJS_DB_USER
    passwordSecret:           # CUBEJS_DB_PASS, from a Secret in the release's namespace
      name: sales-db
      key: password
    env:                      # any other CUBEJS_DB_* variable, as a plain value
      CUBEJS_DB_SSL: 'true'
    secretEnv:                # any other CUBEJS_DB_* variable, from a Secret
      CUBEJS_DB_SSL_CA: { name: sales-db, key: ca.pem }
```

Only `type` is required. `host`, `port`, `database` and `user` are set only when they have a value, for drivers that take other settings. The variables each driver reads are in `docs/research/cube/data-sources.md`. Cube reads its environment only when it starts, and changing the values rolls the Cube pods. `cube.env` passes anything else to both Cube instances, such as `CUBEJS_LOG_LEVEL` or `CUBEJS_TELEMETRY`. `cubestore.env` does the same for Cube Store.

## What the chart generates

At the first install the chart generates these secrets:
- Cube's API secret;
- the metadata database's password;
- xcube's role password, and the URL Cube connects to xcube's schema by;
- wechart's service key pair (T420): the API signs its own calls to Cube and xcube with the private half, and Cube's API instance is given a certificate of the public half. It replaced xcube's static admin token, which an upgrade drops;
- wechart's query signing key (T437): an RSA key, 4096 bits. The API signs every query token RS256 with it, and pushes its public half to xcube when it starts. xcube isn't given it by configuration. From that first push on, the model takes RS256 tokens only. To rotate it, give the API the new key as `WECHART_SIGNING_NEXT_KEY` beside the current one. The API pushes both, signs with the new one, and drops the old one from xcube an hour and a minute later. Then make the new key the Secret's `signing-key.pem` and remove the setting;
- for sign-in, the session cookie's secret and the OIDC client secret its Dex shares with the API. It keeps them in the Secret `wechart-secrets`. Every upgrade reads them back, so they never change (`docs/research/helm.md`, "Pattern: generate-once Secret").

The Secret is kept on uninstall (`helm.sh/resource-policy: keep`). The metadata database's volume outlives an uninstall too, and its password was set when the database was first initialised, so a new password would lock the API out. A reinstall with the same release name and namespace takes the kept Secret back.

## Uninstall

```sh
helm --kube-context docker-desktop -n wechart uninstall wechart
```

The following stay: the two volumes (`data-wechart-meta-0` and `data-wechart-cubestore-0`), the Secret `wechart-secrets`, the data source's Secret, and the namespace. A reinstall picks them up where they were. To remove everything, including dashboards and the model, delete the namespace: `kubectl --context docker-desktop delete namespace wechart`.

## Choices and limits

- **The folder gate (T436).** With sign-in on, the API sends xcube every folder's allowed groups and turns its folder gate on for the release's model. It does this when it starts, after every folder or permission change, and every 60 s. Cube then refuses a folder's cubes to a token none of whose groups the folder allows. That first start is one-way for xcube's schema: turning security on for any model raises the oldest xcube version that may read the schema to slice 4 (`docs/research/xcube-slice-4.md`, Gotcha 13). An older xcube image then refuses to start on it, so going back means dropping xcube's schema and letting the API send everything again. While an older xcube is still connected, the API sends the groups without turning the gate on, and tries again at the next push.

- **Two API replicas and two Cube instances** (T423, AC-319). Any API replica serves any request: sessions, the model and the metadata live in the database or xcube, and Cube calls nothing of the API's. Cube's instances share one queue in Cube Store; the refresh worker stays at one (`docs/research/cube/ha-topology.md` §1, §2). On a stop:
  - **The preStop sleep.** Each sleeps 5 s before it is told to stop, so the Service stops sending it requests first.
  - **The API** finishes its requests under way for up to 15 s.
  - **Cube** refuses new requests with 503 (`CUBEJS_GRACEFUL_SHUTDOWN=15`) and finishes those under way.
  - **A query a stopped Cube instance was running** runs again elsewhere after four missed queue heartbeats. The heartbeat is 5 s, in `cube.js`, the plan's 5–10 s.
  - **Runtime settings.** Every Cube process has 4 transpile threads and a 4 GB heap (`cube.transpileThreads`, `cube.heapMegabytes`).
  - **Only process loss is tested.** Docker Desktop is one node, so no anti-affinity is set, and a node's loss is not covered. Web, the metadata database, Cube Store and Dex stay single.
- **Cube's probes.** With `contextToAppId` configured, `/readyz` answers as soon as Cube's server is up, and tests neither the data source nor Cube Store. `/livez` does test them, and a restart doesn't mend a data source outage. So both probes use `/readyz`, and step 5 of `verify.sh` checks the data path (`docs/research/cube/kubernetes.md`, Gotchas 1 and 2).
- **Cube Store is one node.** Cube calls single-instance Cube Store "usually unsuitable for production"; production runs a router and workers. Its data (metastore, cache store and pre-aggregations) lives on its volume at `/cube/.cubestore/data`. Cube Store stops on SIGINT only, so a `preStop` hook sends it one.
- **Cube Store has no authentication.** It is reachable only inside the cluster, on its HTTP port. The chart adds no NetworkPolicy.
- **Security contexts.** nginx runs as uid 101, the API as 1000, and Cube as 1000; each has a read-only root filesystem. Cube Store and Postgres start as root, as their images do. Postgres's entrypoint then drops to its own user, and chowns its data directory, which `fsGroup` can't do on Docker Desktop's `hostPath` volumes.
- **Sizes.** Both volumes are 8Gi, the size Superset's database has in this cluster, and no container has requests or limits. Set `meta.storage`, `cubestore.storage` and the `resources` values for the cluster the chart runs in. Cube's production guidance is in `docs/research/cube/kubernetes.md`, "Cube's Kubernetes guidance". A StatefulSet's volume size can't be changed by an upgrade.
- **Upstream defaults kept as docker-compose has them.** Cube's and Cube Store's telemetry is on, and Cube's log level is unset (`info` in source). Set them through `cube.env` and `cubestore.env`.

## Observed on Docker Desktop (2026-09-25)

- Every component was Ready about 20 seconds after the install, with no restarts. Cube ran as uid 1000 with a read-only root filesystem.
- `/api/load` counted the 830 rows of northwind's `orders` through the web app's address.
- With the model empty, the API's `/api/meta` returned no cubes.
- A deleted Cube Store pod stopped in about 1 second with the `preStop` hook. Its replacement reopened the existing metastore.
- After `helm uninstall` and a reinstall, the kept Secret was taken back and the metadata database skipped initialisation. The API connected to it, and `verify.sh` passed again.
