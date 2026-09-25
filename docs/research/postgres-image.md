---
library: PostgreSQL official Docker image
packages: []
version: postgres:18.6-alpine3.24
researched: 2026-09-25
sources:
  - https://hub.docker.com/_/postgres
  - https://github.com/docker-library/docs/blob/master/postgres/content.md
  - https://github.com/docker-library/postgres/blob/master/18/alpine3.24/Dockerfile
  - https://github.com/docker-library/postgres/blob/master/18/alpine3.24/docker-entrypoint.sh
  - https://github.com/docker-library/postgres/blob/master/18/alpine3.24/docker-ensure-initdb.sh
  - https://github.com/docker-library/official-images/blob/master/library/postgres
  - https://www.postgresql.org/docs/18/app-pg-isready.html
  - https://www.postgresql.org/docs/18/server-shutdown.html
  - https://www.postgresql.org/docs/18/app-initdb.html
  - https://www.postgresql.org/docs/18/release-18.html
  - https://www.postgresql.org/docs/18/runtime-config-resource.html
  - https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
  - https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
---
# PostgreSQL official Docker image 18.6-alpine3.24

## Summary

`postgres:18.6-alpine3.24` is the Docker Official Image for PostgreSQL 18.6 on Alpine 3.24. wechart's API keeps dashboards, charts and Cube model files in its own Postgres, the "metadata DB". F24 / AC-248 need that DB to run in Kubernetes as a single-replica StatefulSet with a PersistentVolumeClaim, and to be Ready after `helm install --wait`. The existing persistence-across-restart constraint `[R5]` (AC-014, AC-015, AC-181) also applies.

- **Current version.**
  - 18.6 is the current PostgreSQL 18 minor release. PostgreSQL 18 is supported until 2030-11-14 ([pg-versioning]).
  - 18.6 was released on 2026-08-13 ([pg-rel186]).
- **Tags.** The library manifest maps directory `18/alpine3.24` to these tags: `18.6-alpine3.24, 18-alpine3.24, alpine3.24, 18.6-alpine, 18-alpine, alpine` ([official-images]).
  - The repo's `docker-compose.yml` uses `18-alpine`, which today resolves to 18.6 on Alpine 3.24.
  - `18-alpine` moves to new minors and new Alpine releases. `18.6-alpine3.24` is the most specific tag.
  - `18.6-alpine3.23` also exists ([official-images]).
- **Multi-arch, arm64 included.**
  - The manifest lists `amd64, arm32v6, arm32v7, arm64v8, i386, ppc64le, riscv64, s390x` for 18/alpine3.24 ([official-images]).
  - Docker Hub reports an `arm64 v8` image for tag `18.6-alpine3.24` ([hub-tag]).
- **Digest.** The tag is rebuilt in place: `last_updated` is 2026-09-21T01:08:42Z ([hub-tag]).
  - Docker Hub reports the tag digest as `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` ([hub-tag]).
  - The linux/arm64 image digest is `sha256:89f747171c4b0af0eacf5984550060be79786dbe286eb60cfa691d79d1e8b23f` ([hub-tag]).
  - To reproduce a build exactly, pin `postgres:18.6-alpine3.24@sha256:<index digest>`. Confirm the index digest with `docker buildx imagetools inspect` before pinning (see Open questions).

### Verdict on the compose comment in the repo

The comment reads: "postgres:18+ wants a single mount at /var/lib/postgresql … Mounting the old path makes the container exit on start". It is **verified, with qualifications**:

- **"Single mount at /var/lib/postgresql": true.**
  - The Dockerfile has `VOLUME /var/lib/postgresql` and `ENV PGDATA /var/lib/postgresql/18/docker` ([dockerfile]).
  - The Dockerfile comment says: "in 18+, PGDATA has changed to match the pg_ctlcluster standard directory structure, and the VOLUME has moved from /var/lib/postgresql/data to /var/lib/postgresql" ([dockerfile]).
- **"Subdirectory so pg_upgrade --link doesn't cross a mount boundary": true.** The entrypoint's own error text says: "The suggested container configuration for 18+ is to place a single mount at /var/lib/postgresql which will then place PostgreSQL data in a subdirectory, allowing usage of "pg_upgrade --link" without mount point boundary issues" ([entrypoint]). The change came in PR #1259, merged 2025-06-06 ([pr1259]).
- **"Container exits on start": true, but only when all of these hold** (all read from the `docker_setup_env` and `_main` code in [entrypoint]):
  - (a) `PGDATA` is left at its default. The check is inside `elif [ "$PGDATA" = "/var/lib/postgresql/$PG_MAJOR/docker" ]`, so an explicit `PGDATA` skips it.
  - (b) No cluster exists yet at `$PGDATA`. `-s "$PGDATA/PG_VERSION"` sets `DATABASE_ALREADY_EXISTS`, and the error only runs on the init path.
  - (c) The image includes PR #1409, merged 2026-04-21 ([pr1409]). That PR added an `/proc/self/mountinfo` fallback because BusyBox `mountpoint` on Alpine missed an empty mount at `/var/lib/postgresql/data`. Before it, Alpine images silently initialized into the anonymous volume and lost data on re-creation ([i1400]).
  - The current 18/alpine3.24 entrypoint has the fallback: `mountpoint -q /var/lib/postgresql/data || awk '$5 == "/var/lib/postgresql/data" …' /proc/self/mountinfo` ([entrypoint]).
  - When the check trips, `docker_error_old_databases` prints the error and runs `exit 1` ([entrypoint]).

## Install

- **No npm packages.** The image is pulled by the container runtime: `docker pull postgres:18.6-alpine3.24`. In Kubernetes, the kubelet pulls it from the pod spec.
- **Host requirement for Alpine ≥ 3.20 images.** Their `fchmodat2` syscall is only allowed by Docker's seccomp profile from Docker 26.0.0, 25.0.3, 24.0.10 and 23.0.10, and needs libseccomp 2.5.5 or later ([oi16829]).
  - Older hosts fail with "Operation not permitted". Issue #1417 was exactly this, with Alpine 3.23/3.24 images on an old Docker host ([i1417]).
  - UNVERIFIED: the Docker Desktop version on the host was not checked.
- **What the image contains.**
  - It runs as uid/gid 70. The Dockerfile runs `addgroup -g 70 -S postgres` and `adduser -u 70 -S -D -G postgres -H -h /var/lib/postgresql` with the comment "70 is the standard uid/gid for "postgres" in Alpine" ([dockerfile]).
  - It includes `gosu` (`GOSU_VERSION 1.19`) ([dockerfile]).
  - It includes `nss_wrapper`, on every arch except ppc64le ([dockerfile]).
  - It builds with `make install-world-bin`, so `pg_isready` is included ([dockerfile]).
  - It uses `--with-liburing`, `--with-llvm`, `--with-icu` and `--with-openssl` ([dockerfile]).
  - It sets `ENV LANG en_US.utf8` ([dockerfile]).
  - It has no `HEALTHCHECK` instruction ([dockerfile]).
- **For comparison, Debian variants run as uid/gid 999** (`groupadd -r postgres --gid=999`, `useradd … --uid=999`) ([dockerfile-trixie]).

## Init / auth pattern

### What the entrypoint does

All of this is from `docker-entrypoint.sh` for 18/alpine3.24 ([entrypoint]).

1. If the first argument starts with `-`, `postgres` is prepended. Only `postgres` (without `--help` or `--version`) triggers setup.
2. `docker_setup_env` resolves `POSTGRES_PASSWORD`, `POSTGRES_USER` (default `postgres`), `POSTGRES_DB` (default `$POSTGRES_USER`) and `POSTGRES_INITDB_ARGS` through `file_env`.
   - It sets `DATABASE_ALREADY_EXISTS` if `$PGDATA/PG_VERSION` is non-empty.
   - It fills `OLD_DATABASES`, as described in the Summary.
3. `docker_create_db_directories` does `mkdir -p "$PGDATA"` and `chmod 00700 "$PGDATA"` on every start.
   - As root, it also chowns anything in `$PGDATA` and `/var/run/postgresql` not owned by `postgres`.
   - It chowns only `$PGDATA`, not `/var/lib/postgresql` or `/var/lib/postgresql/18`.
4. If running as uid 0, it runs `exec gosu postgres "$BASH_SOURCE" "$@"`, so the rest runs as uid 70.
5. **On the init path only** (`DATABASE_ALREADY_EXISTS` empty):
   - It runs `docker_verify_minimum_env` (password required unless `POSTGRES_HOST_AUTH_METHOD=trust`) and `docker_error_old_databases`.
   - It runs `initdb --username="$POSTGRES_USER" --pwfile=<(printf "%s\n" "$POSTGRES_PASSWORD") $POSTGRES_INITDB_ARGS`.
   - `pg_setup_hba_conf` appends `host all all all <auth>`. `<auth>` defaults to the server's `password_encryption`.
   - It starts a **temporary server with `-c listen_addresses=''`**, then runs `CREATE DATABASE :"db"` if that database is missing.
   - It runs `/docker-entrypoint-initdb.d/*` and stops the temporary server with `pg_ctl -m fast -w stop`.
6. Otherwise it prints "PostgreSQL Database directory appears to contain a database; Skipping initialization".
7. It runs `unset "${!POSTGRES_@}"`, then `exec "$@"`. `postgres` becomes PID 1 of the container.

### Illustrative StatefulSet

The numbers and names below are **illustrative, not decided**. The chart's values decide them.

```yaml
apiVersion: v1
kind: Service
metadata: { name: wechart-meta }
spec:
  clusterIP: None # StatefulSets "currently require a Headless Service" (k8s-sts)
  selector: { app: wechart-meta }
  ports: [{ name: postgres, port: 5432 }]
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: wechart-meta }
spec:
  serviceName: wechart-meta
  replicas: 1
  selector: { matchLabels: { app: wechart-meta } }
  template:
    metadata: { labels: { app: wechart-meta } }
    spec:
      terminationGracePeriodSeconds: 60 # illustrative; see Gotchas "Graceful shutdown"
      containers:
        - name: postgres
          image: postgres:18.6-alpine3.24 # optionally @sha256:<index digest>
          env: # do NOT set PGDATA; the default /var/lib/postgresql/18/docker is intended
            - { name: POSTGRES_USER, value: wechart }
            - { name: POSTGRES_DB, value: wechart_meta }
            - { name: POSTGRES_PASSWORD_FILE, value: /run/secrets/postgres/password }
          ports: [{ name: postgres, containerPort: 5432 }]
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql } # parent of PGDATA, never .../data
            - { name: pw, mountPath: /run/secrets/postgres, readOnly: true }
          startupProbe: # covers first-time init; no other probe runs until it passes
            exec:
              {
                command:
                  [pg_isready, -h, 127.0.0.1, -p, '5432', -U, wechart, -d, wechart_meta, -t, '2'],
              }
            periodSeconds: 5
            timeoutSeconds: 3 # must exceed pg_isready -t; probe default is 1s
            failureThreshold: 60
          readinessProbe:
            exec:
              {
                command:
                  [pg_isready, -h, 127.0.0.1, -p, '5432', -U, wechart, -d, wechart_meta, -t, '2'],
              }
            periodSeconds: 10
            timeoutSeconds: 3
      volumes:
        - name: pw
          secret: { secretName: wechart-meta, items: [{ key: password, path: password }] }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: [ReadWriteOnce]
        resources: { requests: { storage: 1Gi } } # illustrative
```

- **Security context.** This pattern keeps the image default: start as root, then `gosu` drops to uid 70. The entrypoint then chowns `$PGDATA` itself, whatever the volume's ownership ([entrypoint]). A non-root variant is under "Running as uid 70" below.
- **Optional init container.** `docker-ensure-initdb.sh` ships in the image. Its header describes it "as a Kubernetes "init container" to ensure the provided database directory is initialized; see also "startup probes" for an alternative solution (no-op if database is already initialized)" ([ensure-initdb]).
  - Run as an `initContainers` entry with the same image, env and volume mounts, and `command: [docker-ensure-initdb.sh]`, it does the whole init.
  - The main container then goes straight to `exec postgres` and listens on TCP at once.
  - The script runs the same `docker_setup_env` → `gosu` → init sequence as `_main` ([ensure-initdb]).
- **Persistence.** "Deleting and/or scaling a StatefulSet down will *not* delete the volumes associated with the StatefulSet." `.spec.persistentVolumeClaimRetentionPolicy` controls that, and the default is `Retain` ([k8s-sts]).

## API surface we will use

### Paths

| Item                     | Value in 18/alpine3.24                                                                                                                                                                                                                                                           | Source                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `PGDATA` default         | `/var/lib/postgresql/18/docker`. "Later versions will replace `18` with their respective major version"                                                                                                                                                                                                | [dockerfile], [docs-content]           |
| `VOLUME`                 | `/var/lib/postgresql`                                                                                                                                                                                                                                                             | [dockerfile]                           |
| Mount target to use      | `/var/lib/postgresql`. Docs: "Mounts and volumes should be targeted at the updated location to allow users upgrading between PostgreSQL major releases"                                                                                                                                  | [docs-content]                         |
| `/var/lib/postgresql/data` | The 17-and-below target. On 18 with the default `PGDATA`, the first start exits 1 with "Error: in 18+, these Docker images are configured to store database data in a format which is compatible with "pg_ctlcluster"… there appears to be PostgreSQL data in: /var/lib/postgresql/data (unused mount/volume)" | [entrypoint], [pr1409]                 |
| Unix socket dir          | `/var/run/postgresql`. `DEFAULT_PGSOCKET_DIR` is patched to it "(matching Debian)", and the directory is created with mode 3777                                                                                                                                                       | [dockerfile]                           |
| `listen_addresses` (real server) | `'*'`, set by a sed on `postgresql.conf.sample`                                                                                                                                                                                                              | [dockerfile]                           |

### Environment variables

- **`POSTGRES_PASSWORD`**
  - "required … It must not be empty or undefined" ([docs-content]).
  - It is only used on the init path: it is passed to `initdb --pwfile` ([entrypoint]).
  - Docs: it "defines the superuser password … as set by the `initdb` script during initial container startup" ([docs-content]).
  - **Changing it later does not change an existing cluster's password.** On restart `DATABASE_ALREADY_EXISTS` is set and `docker_init_database_dir` is skipped ([entrypoint]). "any pre-existing database will be left untouched on container startup" ([docs-content]).
  - To rotate the password, run `ALTER ROLE … PASSWORD` against the running server. That follows from the code; no image doc says it.
- **`POSTGRES_USER`**: default `postgres` ([entrypoint]). It "is used in conjunction with POSTGRES_PASSWORD to set a user and its password" ([docs-content]). initdb creates it as the bootstrap superuser (`initdb --username`) ([entrypoint]).
- **`POSTGRES_DB`**: default `$POSTGRES_USER`. It is created once on the init path by `docker_setup_db` ([entrypoint]).
- **`POSTGRES_INITDB_ARGS`**: "a space separated string of arguments as `postgres initdb` would expect them" ([docs-content]). It is `eval`ed into the initdb command line ([entrypoint]).
- **`POSTGRES_INITDB_WALDIR`**: optional separate WAL location. As root, the entrypoint chowns it ([entrypoint], [docs-content]).
- **`POSTGRES_HOST_AUTH_METHOD`**: sets the auth method of the appended `host all all all …` line. If unspecified, the image uses `scram-sha-256` "(in 14+; `md5` in older releases)" ([docs-content], [entrypoint]).
- **`PGDATA`**: it has no `_FILE` form. The docs note "Because the variable is used by the `postgres` server binary, the entrypoint script takes it into account" ([docs-content]).
- **The `_FILE` suffix.** The docs list `POSTGRES_INITDB_ARGS`, `POSTGRES_PASSWORD`, `POSTGRES_USER` and `POSTGRES_DB` as supported ([docs-content]).
  - `file_env` reads the file with `val="$(< "${!fileVar}")"`, exports the value and unsets `X_FILE` ([entrypoint]).
  - It exits with an error if both `X` and `X_FILE` are set: `error: both %s and %s are set (but are exclusive)` ([entrypoint]).
  - Bash command substitution deletes trailing newlines ([bash-cmdsub]), so a newline at the end of a Secret file is harmless.
  - In the root-start path, the file is read as root before `gosu`, and the re-exec'd process inherits the exported value ([entrypoint]).
- **Init runs only on an empty data directory.** "scripts in `/docker-entrypoint-initdb.d` are only run if you start the container with a data directory that is empty" ([docs-content]). The test is `[ -s "$PGDATA/PG_VERSION" ]` ([entrypoint]).

### Running as uid 70 directly (`runAsUser: 70`, `fsGroup: 70`)

- **The image supports it.** "As of docker-library/postgres#253, this image supports running as a (mostly) arbitrary user via `--user`"; "As of docker-library/postgres#1018, this is also the case for the Alpine variants" ([docs-content]).
  - "`postgres` doesn't care what UID it runs as (as long as the owner of `PGDATA` matches), but `initdb` *does* care", and "`initdb` needs the user to exist in `/etc/passwd`" ([docs-content]).
  - uid 70 exists in the Alpine image ([dockerfile]), so no nss_wrapper is needed. For any other uid, the entrypoint preloads `libnss_wrapper.so` when it is present ([entrypoint]).
- **Code path.** When `id -u` is not 0, the entrypoint skips every `chown` and the `gosu` re-exec ([entrypoint]). `mkdir -p "$PGDATA"` must therefore succeed as uid 70, so the volume root `/var/lib/postgresql` must be writable by uid 70 or gid 70.
- **What `fsGroup` does.** "Some volume types allow the Kubelet to change the ownership of that volume to be owned by the pod":
  - "The owning GID will be the FSGroup."
  - "The setgid bit of the directory will be set."
  - "Permission bits of the directory will be OR'd with rw-rw----" ([k8s-pod-api]).
  - "This field only applies to volume types that support `fsGroup` controlled ownership and permissions" ([k8s-secctx]).
  - For `fsGroupChangePolicy`, "If not specified, "Always" is used" ([k8s-pod-api]).
  - `OnRootMismatch` means "Only change permissions and ownership if the permission and the ownership of root directory does not match with expected permissions" ([k8s-secctx]).
- **Interaction with PostgreSQL's permission check.**
  - The kubelet's recursive change applies `rwMask = 0660` to files, plus setgid and `0110` to directories ([k8s-volume-linux]).
  - PostgreSQL refuses to start if the data directory has `PG_MODE_MASK_GROUP` bits: `S_IWGRP | S_IRWXO`. The error is "data directory … has invalid permissions … Permissions should be u=rwx (0700) or u=rwx,g=rx (0750)" ([miscinit], [file-perm]).
  - The entrypoint runs `chmod 00700 "$PGDATA"` on every start ([entrypoint]). That resets the one directory PostgreSQL checks ([miscinit]).
  - With the mount at `/var/lib/postgresql`, the kubelet's root-mismatch check looks at the mount root, not `PGDATA`, so `OnRootMismatch` stops the recursive change on later mounts. That follows from the code; no doc states it.
- **hostPath volumes.** `fsGroup` has no effect on them. `hostPathMounter.GetAttributes()` returns `Managed: false`, and `SetUp` never calls `SetVolumeOwnership` ([k8s-hostpath-go]). Upstream issue: [k8s-i138411].
  - Kubernetes docs: "Some files or directories created on the underlying hosts might only be accessible by root", and you may need to "modify the file permissions on the host" ([k8s-volumes]).
  - The image-default root start sidesteps this, because the entrypoint chowns `$PGDATA` itself ([entrypoint]).
  - UNVERIFIED: whether Docker Desktop's default `hostpath` StorageClass provisions `hostPath`-type PVs, and with what directory mode (see Open questions).

### The `lost+found` problem

- Block volumes formatted with ext4 have `lost+found` at the mount root. If that root is `PGDATA`, initdb fails with:
  - `directory "%s" exists but is not empty`
  - "It contains a lost+found directory, perhaps due to it being a mount point."
  - "Using a mount point directly as the data directory is not recommended. Create a subdirectory under the mount point." ([initdb-c])
- PostgreSQL's docs: "it is not advisable to try to use the secondary volume's topmost directory (mount point) as the data directory. Best practice is to create a directory within the mount-point directory…". This "avoids permissions problems, particularly for operations such as pg_upgrade" ([pg-creating-cluster]).
- With the mount at `/var/lib/postgresql` and `PGDATA=/var/lib/postgresql/18/docker`, `PGDATA` is a fresh subdirectory of the mount, so `lost+found` never ends up in it ([dockerfile], [entrypoint]).

### `pg_isready` (readiness)

- **Exit codes** ([pg-isready]):
  - `0`: the server is accepting connections normally.
  - `1`: the server is rejecting connections, "for example during startup".
  - `2`: no response to the connection attempt.
  - `3`: no attempt was made, "for example due to invalid parameters".
- **Options** ([pg-isready]):
  - `-h`: host, or a socket directory if it begins with `/`.
  - `-p`: port. Default `PGPORT`, else the compiled default, usually 5432.
  - `-U`, `-d`: user and database. `-d` may be a connection string.
  - `-t`: timeout. The default is 3 seconds; 0 disables it.
  - `-q`: quiet.
- **Wrong names still report ready.** "It is not necessary to supply correct user name, password, or database name values to obtain the server status; however, if incorrect values are provided, the server will log a failed connection attempt" ([pg-isready]).
- **Probe timeout.** Kubernetes probe `timeoutSeconds` "Defaults to 1 second" ([k8s-pod-api]). Set it above `pg_isready -t`, or the probe can time out before `pg_isready` answers.
- **Exec probe semantics.**
  - "Exit status of 0 is treated as live/healthy". The command "is simply exec'd, it is not run inside a shell" ([k8s-pod-api]).
  - `startupProbe`: "If specified, no other probes are executed until this completes successfully. If this probe fails, the Pod will be restarted" ([k8s-pod-api]).
  - Without a `readinessProbe`, "The default is Success" ([k8s-pod-api]). A container with no probe is Ready as soon as it starts, even while initdb is running.
- **First-init gotcha, confirmed.**
  - `docker_temp_server_start` appends `-c listen_addresses=''`, with the comment "internal start of server in order to allow setup using psql client / does not listen on external TCP/IP" ([entrypoint]).
  - The image docs: "the temporary daemon started for these initialization scripts listens only on the Unix socket" ([docs-content]).
  - Therefore:
    - **`pg_isready -h 127.0.0.1` returns 2 for the whole init**, including initdb, CREATE DATABASE and the init scripts. It returns 1 or 0 only once the real server (`listen_addresses='*'`) is up ([entrypoint], [dockerfile], [pg-isready]).
    - **`pg_isready` without `-h` uses the Unix socket**, because libpq's default is the socket directory "specified when PostgreSQL was built" ([libpq-connect]), and this image builds it as `/var/run/postgresql` ([dockerfile]). It can return 0 while the *temporary* server is up, before init scripts finish and before the server restarts.
  - The repo's compose healthchecks (`pg_isready -U wechart -d wechart_meta`, and the same for `sample-db`) have no `-h`, so they can report healthy mid-init. That follows from the sources above; it was not tested.
- **Log noise.**
  - `127.0.0.1` is trusted. `pg_hba.conf.sample` puts `host all all 127.0.0.1/32 @authmethodhost@` before the entrypoint's appended line ([pg-hba-sample], [entrypoint]).
  - initdb's `--auth` "`trust` is the default" ([pg-initdb]), and the entrypoint passes no `--auth` unless `POSTGRES_INITDB_ARGS` does ([entrypoint]).
  - So a probe with the right `-U`/`-d` authenticates cleanly. A wrong `-d` would log a failure on every probe ([pg-isready]).
  - For password methods, a client that disconnects without sending a password is not logged: "If the client just disconnects without offering a password, don't make a log entry" ([auth-c]).
- **A `tcpSocket` probe works too, but is weaker.** It is also correct during init, since nothing listens on TCP. But it cannot tell "starting up" (exit 1) from accepting connections, so `pg_isready` is the better signal. That is an inference from the exit codes ([pg-isready]).

### Stop signal

- `STOPSIGNAL SIGINT`. The Dockerfile comment: "We set the default STOPSIGNAL to SIGINT, which corresponds to what PostgreSQL calls "Fast Shutdown mode" wherein new connections are disallowed and any in-progress transactions are aborted, allowing PostgreSQL to stop cleanly and flush tables to disk" ([dockerfile]).
- Debian variants use the same signal ([dockerfile-trixie]).
- Fast shutdown: "The server disallows new connections and sends all existing server processes SIGTERM, which will cause them to abort their current transactions and exit promptly. It then waits for all server processes to exit and finally shuts down" ([pg-shutdown]).

## Gotchas

1. **Mount `/var/lib/postgresql`, never `/var/lib/postgresql/data`, and leave `PGDATA` unset.**
   - Mounting the old path exits 1 on first start, as described in the Summary ([entrypoint]).
   - Setting `PGDATA` explicitly disables that guard (the `elif` on the default path) ([entrypoint]).
   - PR #1409 (2026-04-21) fixed the silent-data-loss variant on Alpine ([pr1409], [i1400]).
   - Issue #1393 (closed 2026-01-29) reported a CloudNativePG mount failure at `/var/lib/postgresql/data` on `18-alpine`, caused by a symlink ([i1393]). The current 18/alpine3.24 Dockerfile has no symlink at that path; its only `ln -sT` is for `docker-enforce-initdb.sh` ([dockerfile]).
2. **Changing the major version is guarded.** With the default `PGDATA`, a future `postgres:19` image on the same volume scans `/var/lib/postgresql/*/docker`, finds the 18 cluster and exits with the OLD_DATABASES error ([entrypoint]).
   - It does not silently initialize an empty 19 cluster. A major upgrade needs `pg_upgrade`, and the entrypoint's error points to issue #37 for that ([entrypoint]).
   - Minor updates (18.6 → 18.x) "do not require a dump and restore; you simply stop the database server, install the updated binaries, and restart the server" ([pg-versioning]).
   - The 18.6 notes say "A dump/restore is not required for those running 18.X". They also flag post-update steps for GIN indexes, `btree_gist`/`ltree` reindexing, and upgrades from before 18.2 ([pg-rel186]).
3. **Interrupted first init leaves a partial cluster.**
   - `PG_VERSION` exists once initdb completes. `CREATE DATABASE $POSTGRES_DB` and the init scripts run afterwards ([entrypoint]).
   - If the container is killed in between, the next start takes the "Skipping initialization" path and never creates `POSTGRES_DB`. That follows from the code; no doc states it.
   - Give the `startupProbe` enough budget (`failureThreshold × periodSeconds`) that it cannot restart the pod during init, and don't add a liveness probe that runs during init. Alternatively, do init in the `docker-ensure-initdb.sh` init container ([ensure-initdb]).
4. **The API cannot connect over TCP during first init**, because the temporary server has `listen_addresses=''` ([entrypoint]). The wechart API's connection logic must tolerate `ECONNREFUSED` at start-up. The image docs warn that this "may cause issues when using automation tools, such as `docker compose`, that start several containers simultaneously" ([docs-content]).
5. **Loopback is trusted, and all containers in a Pod share it.**
   - initdb's default `trust` applies to `127.0.0.1/32` and `::1/128` ([pg-hba-sample], [pg-initdb]).
   - "Every container in a Pod shares the network namespace", and containers "can communicate with one another using `localhost`" ([k8s-pods]).
   - Any sidecar in the DB pod could therefore connect as the superuser without a password. Connections from other pods hit `host all all all scram-sha-256` ([entrypoint], [docs-content]).
6. **Secrets.**
   - The entrypoint unsets `POSTGRES_*` before `exec postgres` ([entrypoint]), but the values still sit in the pod spec if passed as plain env.
   - Prefer a Secret-mounted file with `POSTGRES_PASSWORD_FILE` ([docs-content]).
   - When running as uid 70 without the root start, the Secret file must be readable by uid 70, because `file_env` reads it as that user ([entrypoint]).
7. **PG 18: data checksums are on by default.**
   - "Change initdb default to enable data checksums… Checksums can be disabled with the new initdb option `--no-data-checksums`" ([pg-rel18]).
   - initdb docs: "This is enabled by default" ([pg-initdb]). The code has `static bool data_checksums = true;` ([initdb-c]).
   - The image docs' example `POSTGRES_INITDB_ARGS="--data-checksums"` ([docs-content]) is now redundant.
   - "pg_upgrade requires matching cluster checksum settings" ([pg-rel18]). This matters only when importing a pre-18 non-checksum cluster.
8. **PG 18: asynchronous I/O.**
   - `io_method` accepts `worker`, `io_uring` or `sync`; the default is `worker`. `io_uring` "requires a build with `--with-liburing`". "This parameter can only be set at server start" ([pg-resource]).
   - `io_workers` defaults to 3 ([pg-resource]).
   - The Alpine image is built `--with-liburing` ([dockerfile]).
   - Docker 25+ blocks `io_uring_*` syscalls in its default seccomp profile ([moby-46762]). Leave `io_method=worker` unless seccomp has been checked.
   - UNVERIFIED: the seccomp profile the docker-desktop Kubernetes pods get.
9. **PG 18 deprecates MD5.** "Support for MD5 passwords will be removed in a future major version release" ([pg-rel18]). The image's host auth already defaults to `scram-sha-256` ([docs-content]).
10. **/dev/shm is 64 MiB and matters only for dynamic shared memory.**
    - containerd's CRI defines `defaultShmSize = int64(1024 * 1024 * 64)`, commented "the default size of the sandbox shm" ([containerd-helpers]).
    - When the pod does not use host IPC, it mounts a tmpfs with `mode=1777,size=%d` of that size ([containerd-sandbox]).
    - The size is not settable through the CRI. containerd issue #3654 says: "you will have to modify volume specs for each container you run" ([containerd-3654]).
    - Docker's default is also 64MB ([docs-content]).
    - **What uses /dev/shm:**
      - PostgreSQL's *main* shared memory, including `shared_buffers`, is "a very small amount of System V shared memory, as well as a much larger amount of anonymous `mmap` shared memory" ([pg-kernel]). It does not live in /dev/shm.
      - *Dynamic* shared memory defaults to `posix` (`shm_open`) ([pg-resource]). On Linux, POSIX shm objects live in tmpfs "normally mounted under /dev/shm" ([shm-overview]), and musl's `shm_open` hardcodes `"/dev/shm/"` ([musl-shm]).
      - Parallel query creates "a dynamic shared memory segment which will last for the lifetime of the parallel operation" ([readme-parallel]).
      - Exhausting /dev/shm produces `ERROR: could not resize shared memory segment . . . : No space left on device` ([docs-content], [i416]).
    - **Remedy.** Mount an `emptyDir` with `medium: Memory` at `/dev/shm`.
      - Kubernetes "mounts a tmpfs", and "files you write count against the memory limit" ([k8s-volumes]).
      - "If no size is specified, memory-backed volumes are sized to node allocatable memory", so set `sizeLimit` ([k8s-volumes]).
      - Alternatively, cap parallelism with the `max_parallel_workers_per_gather` setting.
      - Whether wechart's metadata queries ever exceed 64 MiB is UNVERIFIED (see Open questions).
    - Blog post ([blog-optimizer]) claims /dev/shm must be sized to `shared_buffers`. That contradicts the PostgreSQL docs above ([pg-kernel]); don't size from it.
11. **Graceful shutdown.**
    - Kubernetes: "Many container runtimes respect the `STOPSIGNAL` value defined in the container image and, if different, send the container image configured STOPSIGNAL instead of TERM" ([k8s-lifecycle]).
    - containerd's `StopContainer` uses the CRI-config signal first, then `container.StopSignal`, then the image config's `StopSignal`, then `SIGTERM` ([containerd-stop]).
    - Docker's default is "defined by `STOPSIGNAL` in the image, or `SIGTERM`" ([docker-run]).
    - SIGINT reaches the postmaster directly, because the entrypoint `exec`s into `postgres` as PID 1 ([entrypoint]).
    - The default grace is 30 seconds: "By default, all deletes are graceful within 30 seconds" ([k8s-lifecycle]). After it, processes "are forcibly halted with a kill signal" ([k8s-pod-api]).
    - A kill before shutdown finishes is survivable: "in the event of a crash we will be able to recover the database using the log" ([pg-wal-intro]). Immediate shutdown similarly "will lead to recovery (by replaying the WAL log) upon next start-up" ([pg-shutdown]).
    - UNVERIFIED: there is no official `terminationGracePeriodSeconds` figure for this image or for PostgreSQL. The fast-shutdown checkpoint time depends on the workload. Choose the value by measurement, not from a doc.
    - `lifecycle.stopSignal` (the `ContainerStopSignals` feature gate) is not needed, since the image's STOPSIGNAL is honoured ([k8s-lifecycle]).
12. **The home directory `/var/lib/postgresql` can be root-owned.** Issue #1420 is open as of 2026-09-10 ([i1420]).
    - When the mount root is created by root, only `$PGDATA` gets chowned ([entrypoint]).
    - This affects files in the postgres user's home, such as `.psql_history`. It does not affect the server ([i1420]).
13. **arm64 / Alpine regressions.** Issue #1389 is open: "postgres:17-alpine crashes with SIGSEGV on ARM64 (Apple Silicon) – Alpine 3.23 regression", with no maintainer reply ([i1389]). No report was found for `18.6-alpine3.24` on arm64. Verify on the host (see Open questions).
14. **`helm install --wait`.** Helm 4.3.0 documents `--wait` as waiting "until resources are ready (up to --timeout)", with a default `--timeout` of 5m0s ([helm-install]).
    - First-time initdb and CREATE DATABASE have to fit inside that timeout alongside the other components.
    - `--wait` strategies are Helm's own topic and are not covered here.

## Alternatives considered

The caller did not ask for a comparison.

## Open questions / unverified

- **Index digest.** Docker Hub's tag API reports `sha256:77f5851…a1873` as the tag digest ([hub-tag]). UNVERIFIED that this is the multi-arch index digest rather than a platform digest. Check with `docker buildx imagetools inspect postgres:18.6-alpine3.24` before pinning `@sha256`.
- **Docker Desktop storage.** UNVERIFIED: what PV type and directory mode Docker Desktop's default StorageClass provisions, and so whether `fsGroup` applies. No primary Docker doc was found; docker/for-mac#2460 has no staff statement. Check with `kubectl get sc` and `kubectl get pv <pv> -o yaml`: look for `spec.hostPath` and inspect the directory mode.
- **Docker Desktop runtime.** UNVERIFIED: whether docker-desktop Kubernetes uses containerd CRI or cri-dockerd, which decides which 64 MiB /dev/shm code path and STOPSIGNAL path applies. Both documented runtimes default to 64 MB and honour STOPSIGNAL ([containerd-helpers], [containerd-stop], [docker-run]), but the cri-dockerd path was not read.
- **Host checks.** UNVERIFIED: the host's Docker Desktop version (the seccomp `fchmodat2` requirement, [oi16829]) and whether `postgres:18.6-alpine3.24` runs cleanly on this arm64 host (issue #1389 context). Check with `docker run --rm postgres:18.6-alpine3.24 postgres --version`.
- **/dev/shm need.** UNVERIFIED: whether wechart's metadata-DB queries ever plan parallel workers with enough dynamic shared memory to exceed 64 MiB. No official sizing rule exists. Deciding between an `emptyDir` `medium: Memory` mount at `/dev/shm`, parallelism limits, or neither is the caller's call.
- **SCRAM support.** UNVERIFIED here: node-postgres's SCRAM-SHA-256 support. `docs/research/db-access.md` does not mention SCRAM, and the image's remote auth defaults to `scram-sha-256` ([docs-content]).
- **Grace period.** No official figure exists; see Gotcha 11.

[hub]: https://hub.docker.com/_/postgres
[hub-tag]: https://hub.docker.com/v2/repositories/library/postgres/tags/18.6-alpine3.24
[docs-content]: https://github.com/docker-library/docs/blob/master/postgres/content.md
[official-images]: https://github.com/docker-library/official-images/blob/master/library/postgres
[dockerfile]: https://github.com/docker-library/postgres/blob/master/18/alpine3.24/Dockerfile
[dockerfile-trixie]: https://github.com/docker-library/postgres/blob/master/18/trixie/Dockerfile
[entrypoint]: https://github.com/docker-library/postgres/blob/master/18/alpine3.24/docker-entrypoint.sh
[ensure-initdb]: https://github.com/docker-library/postgres/blob/master/18/alpine3.24/docker-ensure-initdb.sh
[pr1259]: https://github.com/docker-library/postgres/pull/1259
[pr1409]: https://github.com/docker-library/postgres/pull/1409
[i1400]: https://github.com/docker-library/postgres/issues/1400
[i1393]: https://github.com/docker-library/postgres/issues/1393
[i1420]: https://github.com/docker-library/postgres/issues/1420
[i1389]: https://github.com/docker-library/postgres/issues/1389
[i1417]: https://github.com/docker-library/postgres/issues/1417
[i416]: https://github.com/docker-library/postgres/issues/416
[oi16829]: https://github.com/docker-library/official-images/issues/16829
[pg-isready]: https://www.postgresql.org/docs/18/app-pg-isready.html
[libpq-connect]: https://www.postgresql.org/docs/18/libpq-connect.html
[pg-initdb]: https://www.postgresql.org/docs/18/app-initdb.html
[pg-creating-cluster]: https://www.postgresql.org/docs/18/creating-cluster.html
[pg-shutdown]: https://www.postgresql.org/docs/18/server-shutdown.html
[pg-wal-intro]: https://www.postgresql.org/docs/18/wal-intro.html
[pg-resource]: https://www.postgresql.org/docs/18/runtime-config-resource.html
[pg-kernel]: https://www.postgresql.org/docs/18/kernel-resources.html
[pg-rel18]: https://www.postgresql.org/docs/18/release-18.html
[pg-rel186]: https://www.postgresql.org/docs/18/release-18-6.html
[pg-versioning]: https://www.postgresql.org/support/versioning/
[initdb-c]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/initdb/initdb.c
[pg-hba-sample]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/libpq/pg_hba.conf.sample
[miscinit]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/init/miscinit.c
[file-perm]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/include/common/file_perm.h
[auth-c]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/libpq/auth.c
[readme-parallel]: https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/README.parallel
[shm-overview]: https://man7.org/linux/man-pages/man7/shm_overview.7.html
[musl-shm]: https://git.musl-libc.org/cgit/musl/tree/src/mman/shm_open.c
[bash-cmdsub]: https://www.gnu.org/software/bash/manual/html_node/Command-Substitution.html
[containerd-helpers]: https://github.com/containerd/containerd/blob/main/internal/cri/server/podsandbox/helpers_linux.go
[containerd-sandbox]: https://github.com/containerd/containerd/blob/main/internal/cri/server/podsandbox/sandbox_run_linux.go
[containerd-stop]: https://github.com/containerd/containerd/blob/main/internal/cri/server/container_stop.go
[containerd-3654]: https://github.com/containerd/containerd/issues/3654
[docker-run]: https://docs.docker.com/reference/cli/docker/container/run/
[moby-46762]: https://github.com/moby/moby/pull/46762
[k8s-volumes]: https://kubernetes.io/docs/concepts/storage/volumes/
[k8s-secctx]: https://kubernetes.io/docs/tasks/configure-pod-container/security-context/
[k8s-pod-api]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
[k8s-lifecycle]: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
[k8s-sts]: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
[k8s-pods]: https://kubernetes.io/docs/concepts/workloads/pods/
[k8s-hostpath-go]: https://github.com/kubernetes/kubernetes/blob/master/pkg/volume/hostpath/host_path.go
[k8s-volume-linux]: https://github.com/kubernetes/kubernetes/blob/master/pkg/volume/volume_linux.go
[k8s-i138411]: https://github.com/kubernetes/kubernetes/issues/138411
[helm-install]: https://helm.sh/docs/helm/helm_install/
[blog-optimizer]: https://the-optimizer.medium.com/cracking-the-shared-buffers-how-dev-shm-impacts-postgresql-performance-on-kubernetes-8225fe4a6d59
