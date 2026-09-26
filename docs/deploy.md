# Deploying wechart to Kubernetes

F24, AC-248, task T274. The Helm chart at `deploy/helm/wechart` runs wechart, Cube and Cube Store in one namespace. Cube's data source comes from the chart's values. On Docker Desktop, the values in `deploy/helm/values/docker-desktop.yaml` point Cube at the **northwind** database of the Superset install in the same cluster, and serve the app at **http://localhost:8089**.

## What the chart runs

| Component | Kind | Image | Service | Probes |
| --- | --- | --- | --- | --- |
| `web`: the built app, and `/api` passed to the API | Deployment | `wechart-web:<tag>` (nginx, unprivileged) | `LoadBalancer`, port `web.service.port` | `/healthz` |
| `api`: wechart's API | Deployment, 1 replica, `Recreate` | `wechart-api:<tag>` | ClusterIP 4100 | `/api/health` |
| `meta`: wechart's metadata database | StatefulSet with a volume | `postgres:18.6-alpine3.24` | headless 5432 | `pg_isready` over TCP |
| `cube`: Cube's API | Deployment | `cubejs/cube:v1.7.45` | ClusterIP 4000 | `/readyz` |
| `cube-refresh-worker`: Cube's refresh worker | Deployment, 1 replica | `cubejs/cube:v1.7.45` | ClusterIP 4000 | `/readyz` |
| `cubestore`: Cube Store, one node | StatefulSet with a volume | `cubejs/cubestore:v1.7.45` (`-arm64v8` on arm64) | headless 3030 | `:3031/readyz`, `:3031/livez` |

Cube reads `infra/cube/cube.js`, the same file docker-compose mounts. The chart reaches it through the link `deploy/helm/wechart/files/cube.js`. Helm follows the link and prints a "found symbolic link" line each time it loads the chart (`docs/research/helm.md`, "Symlinks in 3.17.2").

Only the web app is published outside the cluster. The API, Cube, Cube Store and the metadata database are ClusterIP or headless Services. nginx answers 404 to `/api/cube-model/`, the routes Cube reads the model through; Cube reaches them through the API's own Service.

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

Cube runs v1.7.45, unmodified, with the user's fork's package xcube, which adds the data-source introspection API wechart generates cubes with (T275, T413–T415, T417; `docs/research/cube/introspection-api.md`). xcube is the package that was `cube-introspection/`, renamed at the fork's commit `a13b9cff43` with its HTTP API unchanged. Build it from the package's directory in the fork's checkout (`~/Work/bi/cube`, branch `feat/xcube`):

```sh
cd ~/Work/bi/cube/xcube
docker build -t xcube:v1.7.45-$(git rev-parse --short=10 HEAD) .
```

Tag it by the fork's commit, as with wechart's own images: a rebuild under the same tag doesn't restart the pods. The release runs `xcube:v1.7.45-a13b9cff43`. `deploy/helm/values/docker-desktop.yaml` sets `cube.image` to it, for Cube and its refresh worker alike, and docker-compose uses the same image. The image's own command starts the package's server, so give Cube no `command` or `args`: `cubejs server` would start it without the introspection routes.

Nothing is pushed. This cluster's node runs on the Docker engine (`kubectl get nodes -o wide` shows `docker://`), and its pods used the locally built images; Docker's own docs don't say so (`docs/research/helm.md`, "Open questions"). The chart pulls a wechart image only if it isn't there (`images.pullPolicy: IfNotPresent`). Give each build its own tag: an upgrade to the same tag doesn't restart the pods.

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

Build the model in the browser's **Model** workspace, then the dashboards. A publish goes from the API to Cube as a draft to compile. Cube reads the draft back from the API through `WECHART_MODEL_STORES`, and the chart sets it to the API's in-cluster address.

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

At the first install the chart generates Cube's API secret, the key Cube reads the model store with, the metadata database's password, and for sign-in the session cookie's secret and the OIDC client secret its Dex shares with the API. It keeps them in the Secret `wechart-secrets`. Every upgrade reads them back, so they never change (`docs/research/helm.md`, "Pattern: generate-once Secret").

The Secret is kept on uninstall (`helm.sh/resource-policy: keep`). The metadata database's volume outlives an uninstall too, and its password was set when the database was first initialised, so a new password would lock the API out. A reinstall with the same release name and namespace takes the kept Secret back.

## Uninstall

```sh
helm --kube-context docker-desktop -n wechart uninstall wechart
```

The following stay: the two volumes (`data-wechart-meta-0` and `data-wechart-cubestore-0`), the Secret `wechart-secrets`, the data source's Secret, and the namespace. A reinstall picks them up where they were. To remove everything, including dashboards and the model, delete the namespace: `kubectl --context docker-desktop delete namespace wechart`.

## Choices and limits

- **One API instance, replaced rather than rolled.** A publish keeps its draft in the API process while Cube reads it back through the Service, so a second instance could be the one Cube asks.
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
