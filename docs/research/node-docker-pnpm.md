---
library: Node.js Docker image and pnpm in Docker
packages: [pnpm]
version: 'node:26.10.0-trixie-slim; pnpm 12.5.1'
researched: 2026-09-25
sources:
  - https://hub.docker.com/_/node
  - https://github.com/nodejs/docker-node/blob/main/README.md
  - https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
  - https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile
  - https://github.com/nodejs/docker-node/blob/main/26/alpine3.24/Dockerfile
  - https://github.com/nodejs/docker-node/blob/main/versions.json
  - https://nodejs.org/dist/index.json
  - https://nodejs.org/en/blog/release/v26.10.0
  - https://github.com/nodejs/node/blob/main/doc/contributing/distribution.md
  - https://pnpm.io/docker
  - https://pnpm.io/installation
  - https://pnpm.io/cli/deploy
  - https://pnpm.io/cli/install
  - https://pnpm.io/cli/fetch
  - https://pnpm.io/filtering
  - https://pnpm.io/settings/build
  - https://pnpm.io/settings/store
  - https://pnpm.io/settings/node-modules
  - https://pnpm.io/settings/dependency-resolution
  - https://pnpm.io/settings/cli
  - https://pnpm.io/lockfile
  - https://pnpm.io/configuring
  - https://pnpm.io/blog/releases/12.0
  - https://github.com/pnpm/pnpm/releases/tag/v12.5.1
  - https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile
  - https://docs.docker.com/reference/dockerfile/
  - https://docs.docker.com/build/concepts/context/
  - https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
---
# Node.js Docker image and pnpm in Docker (`node:26.10.0-trixie-slim`; pnpm 12.5.1)

> Note on sources: I read the pnpm.io pages from their source markdown in [github.com/pnpm/pnpm.io](https://github.com/pnpm/pnpm.io/tree/main/docs) (main branch) on 2026-09-25. Links below point to the published pnpm.io URLs. Where a link points at a file in this repo, that file is the evidence.

## Summary

This doc covers building the two container images that the F24 Helm chart deploys (AC-248):

- **`@wechart/api`**: Fastify, bundled by `vite build -c vite.build.config.ts` into `packages/api/dist/main.js`, run with `node dist/main.js`. It reads migrations from `packages/api/src/db/migrations`.
- **`@wechart/web`**: the Vite SPA, built into `packages/web/dist`.

Both come from this pnpm 12.5.1 workspace on the official Node.js 26 image.

**Pinned versions**

- **Base image `node:26.10.0-trixie-slim`**
  - Docker Hub reports index digest `sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1`, with linux/arm64/v8 and linux/amd64 variants ([Hub API](https://hub.docker.com/v2/repositories/library/node/tags/26.10.0-trixie-slim)). `26.10.0-slim` and `26-trixie-slim` have the same digest ([Hub API](https://hub.docker.com/v2/repositories/library/node/tags/26.10.0-slim), [Hub API](https://hub.docker.com/v2/repositories/library/node/tags/26-trixie-slim)).
  - 26.10.0 is the newest 26.x release. The dist index dates it 2026-09-21 and says it bundles npm 11.19.1 ([dist index](https://nodejs.org/dist/index.json)); the release post is dated 2026-09-22 and calls the line "Current" ([release notes](https://nodejs.org/en/blog/release/v26.10.0)).
  - Node 26 becomes LTS on 2026-10-28 and reaches end of life on 2029-04-30 ([versions.json](https://github.com/nodejs/docker-node/blob/main/versions.json)).
- **pnpm 12.5.1**
  - This is the root `packageManager` value. The lockfile also records it in its leading env document under `packageManagerDependencies` (see `/Users/srajagopal/Work/wechart/pnpm-lock.yaml` lines 1–11).
  - The registry `latest` is now 12.6.0 ([registry](https://registry.npmjs.org/pnpm/latest)). The image must still carry exactly 12.5.1 (see `pmOnFail` under Gotchas).
  - pnpm 12 is a Rust rewrite shipped as a native binary. The 12.0 release post says the commands, flags, settings and lockfile format of pnpm 11 all carry over ([12.0 post](https://pnpm.io/blog/releases/12.0), [installation](https://pnpm.io/installation)).

**Answers at a glance**

1. **Corepack is not in Node 25+ or in the node:26 image.** Install pnpm 12.5.1 without Corepack. I recommend copying the binary out of `ghcr.io/pnpm/pnpm:12.5.1`. The documented alternatives are `npx get-pnpm` and the standalone script. `npm install -g pnpm@12.5.1` also works; see Install.
2. **Install flags**
   - `--frozen-lockfile` fails if the lockfile is out of sync. It is on by default only when CI is detected, and a `docker build` doesn't set the CI variables, so pass it explicitly.
   - `pnpm fetch` needs only `pnpm-lock.yaml` (plus `pnpm-workspace.yaml` in the documented example). Follow it with `pnpm install --offline`.
   - `--prod` skips devDependencies.
   - Whether `--filter` narrows a shared-lockfile install is UNVERIFIED for 12.5.1.
3. **`pnpm deploy` has not required `injectWorkspacePackages` since v12.2.0.** pnpm 10–12.1 required it; `--legacy` still selects the old implementation.
   - `--prod` omits devDependencies.
   - By default deploy copies **all files of the package**. A `files` field, or a package-local `.npmignore`/`.gitignore`, narrows that.
   - Add `"files": ["dist", "src/db/migrations"]` to `packages/api/package.json`. That makes `dist/` and the `.cjs` migrations reliably present.
   - `node-pg-migrate` must move from devDependencies to `dependencies`, or `--prod` drops it.
4. **`strictDepBuilds` defaults to true.** An install exits non-zero on any dependency build script not listed in `allowBuilds`, with or without `--frozen-lockfile`. This repo lists `'@ibm/plex-mono': false`, which counts as reviewed.
   - On the node image the store is `~/.local/share/pnpm/store` unless `PNPM_HOME` is set.
   - Set `PNPM_HOME=/pnpm` so the documented `--mount=type=cache,id=pnpm,target=/pnpm/store` really is the store.
5. **Runtime conventions**
   - Run as uid 1000 and write it numerically (`USER 1000:1000`) so Kubernetes `runAsNonRoot` can verify it.
   - Set `NODE_ENV=production` in the runtime stage only. pnpm ≥10 ignores it for installs.
   - Use exec-form `CMD ["node","dist/main.js"]`, not `pnpm start`.
   - Node as PID 1 does receive SIGTERM when the app installs a handler, which close-with-grace does. Still add `tini` as the entrypoint, because the image, not Kubernetes, has to supply an init.
   - In `.dockerignore`, use `**/node_modules` and `**/dist`. A bare `node_modules` only matches at the context root.
6. **Native bindings**
   - The committed lockfile already lists every platform's rolldown and lightningcss bindings, including `linux-arm64` glibc and musl. pnpm installs only the current platform's by default, so no `supportedArchitectures` setting is needed.
   - The failure to guard against is host (darwin-arm64) `node_modules` getting into the build context.

## Install

### Base image variants for Node 26.10.0 (checked 2026-09-25)

| Tag | Base OS / libc | Architectures (Docker Hub) | Compressed size, arm64 (Hub API) | Notes |
|---|---|---|---|---|
| `26.10.0-trixie-slim` (= `26.10.0-slim`) | Debian 13 "trixie", glibc | amd64, arm64/v8, ppc64le, s390x | ~85.9 MB | Official nodejs.org glibc tarball, verified with GPG ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile)). Trixie is Debian's current stable ([Debian releases](https://wiki.debian.org/DebianReleases)). **Recommended.** |
| `26.10.0-bookworm-slim` | Debian 12 "bookworm", glibc | amd64, arm64/v8, ppc64le | ~83.8 MB | Bookworm's regular security support ended 2026-07-12; it is now in LTS until 2028-06-30 ([Debian releases](https://wiki.debian.org/DebianReleases), [Hub API](https://hub.docker.com/v2/repositories/library/node/tags/26.10.0-bookworm-slim)). |
| `26.10.0-alpine3.24` (also `alpine3.23`) | Alpine, musl | amd64, arm64/v8 | ~67.5 MB | The amd64 build downloads an unofficial-builds musl tarball. **The arm64 build compiles Node from source** inside the Dockerfile ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/alpine3.24/Dockerfile)). The README says "`musl` builds for `amd64` are listed under support tier 'Experimental'" and "`musl` builds for other architectures, including `arm64`, are not tested before release"; it also says glibc applications generally won't run under musl ([README](https://github.com/nodejs/docker-node/blob/main/README.md)). |

Supporting sources: architecture lists from [versions.json](https://github.com/nodejs/docker-node/blob/main/versions.json) and the Hub API ([trixie-slim](https://hub.docker.com/v2/repositories/library/node/tags/26.10.0-trixie-slim), [alpine3.24](https://hub.docker.com/v2/repositories/library/node/tags/26.10.0-alpine3.24)). The slim images contain "only the minimal packages needed to run `node`" ([README](https://github.com/nodejs/docker-node/blob/main/README.md)).

**Why trixie-slim over the others**

- On Apple silicon (arm64), the Alpine arm64 Node is source-built and untested before release.
- Bookworm is past regular security support.
- Trixie-slim uses the official, GPG-verified glibc binary on every architecture.

**What the node:26 image contains**

- No Corepack and no Yarn. The trixie-slim Dockerfile only unpacks the Node tarball into `/usr/local` and runs `node --version` and `npm --version`; there is no Corepack or Yarn step ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile)).
  - Node.js: "corepack was added in Node.js 14.9.0 and 16.9.0. It is no longer distributed as of Node.js 25.0.0" ([distribution.md](https://github.com/nodejs/node/blob/main/doc/contributing/distribution.md)).
  - The docker-node README: "Yarn v1 is not bundled into `node` images as of Node.js 26.0.0" ([README](https://github.com/nodejs/docker-node/blob/main/README.md)).
  - A third-party report shows `node:25-alpine` without `corepack` ([novaedge#533](https://github.com/azrtydxb/novaedge/issues/533), issue tracker).
- A `node` user and group, both uid/gid 1000 (`groupadd --gid 1000 node && useradd --uid 1000 --gid node …`) ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile)).
- `ENTRYPOINT ["docker-entrypoint.sh"]`, `CMD ["node"]`. The entrypoint script ends in `exec "$@"` ([docker-entrypoint.sh](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/docker-entrypoint.sh)).
- No `curl` or `wget` at runtime. The Dockerfile installs `curl wget … libatomic1` for the build, marks every package auto, re-marks as manual only the libraries that `/usr/local` executables link against, then runs `apt-get purge --auto-remove` ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile)). That curl and wget are removed as a result is my inference from that script.
- `libatomic1` stays. Node ≥25 requires `libatomic.so.1` on Linux ([nodejs/node#60790](https://github.com/nodejs/node/issues/60790)), and the Dockerfile runs `node --version` after the purge. That it survives is my inference from those two facts.

### Getting pnpm 12.5.1 into the image

pnpm's installation page for v12 says: "pnpm 12 is a native executable and does not require Node.js after it is installed. Installing it through npm requires Node.js 22.13 or newer." It documents two routes:

- the standalone script, with `PNPM_VERSION` to pick a version;
- `npx get-pnpm`.

It no longer mentions Corepack or `npm install -g pnpm` ([installation](https://pnpm.io/installation)). Linux prebuilt binaries exist for glibc (x64, arm64, riscv64, ppc64le, s390x) and musl (x64, arm64) ([installation](https://pnpm.io/installation)). pnpm.io/docker says that if you use your own Node base image, you should "keep the rest of each recipe and install pnpm into that image instead" ([docker](https://pnpm.io/docker)).

| Option | How | Evidence | Assessment |
|---|---|---|---|
| **A (recommended). Copy the binary from the official pnpm image** | `FROM ghcr.io/pnpm/pnpm:12.5.1 AS pnpm-dist` … `COPY --from=pnpm-dist /opt/pnpm /opt/pnpm` + `ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm` | The image is based on `debian:stable-slim` and contains only the standalone binary. Its `<version>` tags are "Exact, immutable"; platforms are linux/amd64 and linux/arm64 ([docker](https://pnpm.io/docker)). Its Dockerfile downloads `pnpm-linux-${arch}.tar.gz` from the GitHub release, checks the SHA-256, extracts to `/opt/pnpm`, symlinks `/opt/pnpm/pnpm` into `/usr/local/bin`, and asserts `pnpm --version` ([pnpm docker/Dockerfile](https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile)). Tag `12.5.1` exists; the package page shows digest `sha256:0a4219f2ae582bce0e52073876c20e6387147f0809d8546744d87243797633ed` ([ghcr versions](https://github.com/pnpm/pnpm/pkgs/container/pnpm/versions)). | Pinned to an exact, immutable tag. Multi-arch (resolves to the target platform). The binary is SHA-256-verified upstream. No npm lifecycle scripts, and no `curl` needed in our image. It is the **glibc** build, so it suits Debian bases only; Alpine would need the `pnpm-linux-*-musl.tar.gz` asset ([v12.5.1 assets](https://github.com/pnpm/pnpm/releases/expanded_assets/v12.5.1)). The `/opt/pnpm` path is an implementation detail of that image, fixed for the immutable tag. |
| B. `npx get-pnpm` | `npx --yes get-pnpm@0.0.5 12.5.1` with `PNPM_HOME` set | `get-pnpm` 0.0.5 (maintainer zkochan) needs Node ≥22.13. It takes an exact version argument (`npx get-pnpm 11.20.0`), downloads the platform executable from the npm registry, "Checks npm's signature over the package's checksum, then the download against that checksum", installs into `PNPM_HOME` and runs `pnpm setup` ([registry](https://registry.npmjs.org/get-pnpm/latest), [README](https://github.com/pnpm/get.pnpm.io/tree/main/get-pnpm)) | Documented and verified. It runs `pnpm setup`, which edits shell rc files that Docker never reads, so `PATH` must be set with `ENV`. Where exactly it puts the binary under `PNPM_HOME` is UNVERIFIED. |
| C. `npm install -g pnpm@12.5.1` | `npm install -g --allow-scripts=pnpm pnpm@12.5.1` | The `pnpm@12.5.1` package declares 14 `@pnpm/exe.*` optionalDependencies (including `linux-arm64` and `linux-arm64-musl`), with `preinstall`/`postinstall` both running `node install.js` ([package.json](https://unpkg.com/pnpm@12.5.1/package.json)). If the platform package is missing, `install.js` errors: "If your package manager skipped optional dependencies or blocked build scripts, enable them and reinstall" ([install.js](https://unpkg.com/pnpm@12.5.1/install.js)). npm 11 (the image has 11.19.1) runs unapproved install scripts with a notice ([npm v11 config](https://docs.npmjs.com/cli/v11/using-npm/config)). npm 12 (registry `latest` is 12.1.0) blocks them unless allowed, e.g. `npm install -g --allow-scripts=…` ([GitHub changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/), [npm v12 docs](https://docs.npmjs.com/cli/v12/commands/npm-install-scripts/)). | Works today, but depends on npm installing the optional dependency and running the script. pnpm.io no longer documents it for v12. |
| D. Standalone script | `curl -fsSL https://get.pnpm.io/install.sh \| env PNPM_VERSION=12.5.1 sh -` | Documented ([installation](https://pnpm.io/installation)). For v12+ it downloads `@pnpm/exe.<platform>-<arch>[-musl]` from the npm registry, verifies the npm signature and SHA-512, installs to `PNPM_HOME`, and runs `pnpm setup --force` ([install.sh](https://github.com/pnpm/get.pnpm.io/blob/main/install.sh)). | Needs `curl` or `wget`, which trixie-slim purges. The script itself is fetched unpinned at build time. |
| E. Corepack | `npm install -g corepack` then `corepack enable` | Not shipped with Node 25+ ([distribution.md](https://github.com/nodejs/node/blob/main/doc/contributing/distribution.md)). pnpm 11 stopped honouring `COREPACK_ENABLE_STRICT` ([v11.0.0](https://github.com/pnpm/pnpm/releases/tag/v11.0.0)). pnpm's own issue calls it "(now-deprecated) `corepack`" ([pnpm#11300](https://github.com/pnpm/pnpm/issues/11300)). | Not recommended. pnpm 12 does its own version management through `packageManager` and `pmOnFail` (see Gotchas). |

**Peer and runtime requirements**

- pnpm 12 supports Node 18, 20, 22, 24 and 26 ([installation](https://pnpm.io/installation)).
- The `pnpm` npm package declares `engines.node >=18.*` ([registry](https://registry.npmjs.org/pnpm/12.5.1)).
- Vite 8's rolldown binding declares `engines: {node: ^20.19.0 || >=22.12.0}` (lockfile, `/Users/srajagopal/Work/wechart/pnpm-lock.yaml` line 754). Node 26.10.0 satisfies it.

## Init / auth pattern

No auth is needed: every package comes from the public npm registry, and the repo has no `.npmrc`.

### Changes these images need in `packages/api/package.json`

- **Move `node-pg-migrate` from `devDependencies` to `dependencies`.** The built bundle imports it: `import { runner } from "node-pg-migrate";` at line 8 of `/Users/srajagopal/Work/wechart/packages/api/dist/main.js`. `pnpm deploy --prod` means "Packages in `devDependencies` won't be installed" ([deploy](https://pnpm.io/cli/deploy)).
- **Add `"files": ["dist", "src/db/migrations"]`.** This makes the deployed directory deterministic; see `pnpm deploy` below.

For reference, the last local build's bare imports are exactly `close-with-grace`, `kysely`, `pg`, `node-pg-migrate`, `fastify` and `yaml`, plus `node:` builtins (`/Users/srajagopal/Work/wechart/packages/api/dist/main.js` lines 1–12). All of these must be in `@wechart/api`'s `dependencies`.

### `.dockerignore` (repo root)

Docker matches ignore patterns relative to the context root, and only `**` matches across directories ([build context](https://docs.docker.com/build/concepts/context/)). So pnpm's documented example (`node_modules`, `.git`, `.gitignore`, `*.md`, `dist`; see [docker](https://pnpm.io/docker)) would miss `packages/*/node_modules` and `packages/*/dist` in this monorepo. Use:

```text
**/node_modules
**/dist
**/dist-demo
**/coverage
**/test-results
**/playwright-report
**/.vite
.git
.gitignore
.claude
.env
.env.*
**/.DS_Store
```

Keep `e2e/` and every workspace `package.json` in the context, since `pnpm-workspace.yaml` lists `e2e`. I did not verify how pnpm 12.5.1 behaves under `--frozen-lockfile` when a listed workspace project is missing; see Open questions. Excluding `.gitignore` follows pnpm's own example and keeps it from affecting `pnpm deploy`.

### Dockerfile (repo root): API image and web build

This is based on pnpm.io/docker "Example 2: Build multiple Docker images in a monorepo" ([docker](https://pnpm.io/docker)), with pnpm added to the node base image as that page allows.

```dockerfile
# syntax=docker/dockerfile:1

# Source of the pnpm 12.5.1 glibc binary only (multi-arch: amd64, arm64).
FROM ghcr.io/pnpm/pnpm:12.5.1 AS pnpm-dist

FROM node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS base
COPY --from=pnpm-dist /opt/pnpm /opt/pnpm
RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm \
 && test "$(pnpm --version)" = "12.5.1"
# Makes the store /pnpm/store (storeDir default is $PNPM_HOME/store), matching the cache mount.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME/bin:$PATH
WORKDIR /src

FROM base AS deps
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS api-build
RUN pnpm --filter @wechart/api build
# Mount the store again: a cache mount exists only for the RUN that declares it.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @wechart/api --prod deploy /app

FROM node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS api
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# Same absolute path as the deploy target.
COPY --from=api-build /app /app
# Numeric, so Kubernetes runAsNonRoot can verify it (node = 1000:1000).
USER 1000:1000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

FROM deps AS web-build
RUN pnpm --filter @wechart/web build
# Output: /src/packages/web/dist. The serving image is an open question.
```

Build it with `docker build --target api -t wechart-api:<tag> .`, the same way pnpm's example builds `--target app1` ([docker](https://pnpm.io/docker)).

Where each piece comes from:

- `ghcr.io/pnpm/pnpm` layout and verification: [pnpm docker/Dockerfile](https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile).
- `PNPM_HOME` → store at `$PNPM_HOME/store`: [store settings](https://pnpm.io/settings/store).
- Cache mount id and target: [docker](https://pnpm.io/docker).
- Deploy flags: [deploy](https://pnpm.io/cli/deploy).
- tini binary at `/usr/bin/tini` in Debian trixie, available for amd64 and arm64: [filelist](https://packages.debian.org/trixie/arm64/tini/filelist), [package](https://packages.debian.org/trixie/tini).
- `USER` numeric requirement: see the Node runtime section.

Web packages: `@wechart/web`'s workspace dependencies (`charts`, `core`, `recommender`, `ui`) have `"main": "./src/index.ts"` and no `build` script (repo `packages/*/package.json`). `pnpm --filter @wechart/web build` therefore only runs `vite build` in `packages/web`.

## API surface we will use

### `pnpm install`

```
pnpm install [--frozen-lockfile | --no-frozen-lockfile] [--prod|-P] [--dev|-D] [--no-optional] [--offline] [--prefer-offline] [--ignore-scripts] [--filter <selector>]
```

- **`--frozen-lockfile`**: "If `true`, pnpm doesn't generate a lockfile and fails to install if the lockfile is out of sync with the manifest / an update is needed or no lockfile is present."
  - Default: `false` outside CI, `true` in CI if a lockfile is present.
  - CI is detected from variables such as `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_NUMBER` and `RUN_ID` ([install](https://pnpm.io/cli/install)).
  - The node image sets only `ENV NODE_VERSION` ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile)), so the flag must be passed explicitly in `docker build`.
  - pnpm 12: "`pnpm install --frozen-lockfile false` is no longer supported. Use `pnpm install --no-frozen-lockfile`" ([v12.0.0](https://github.com/pnpm/pnpm/releases/tag/v12.0.0)).
  - Since v11.23.0, if the pinned pnpm version is missing from the lockfile or doesn't match it, a frozen install fails with `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` ([lockfile](https://pnpm.io/lockfile)).
- **`--prod, -P`**: "If `true`, pnpm will not install any package listed in `devDependencies` and will remove those insofar they were already installed" ([install](https://pnpm.io/cli/install)).
- **`--offline`**: "pnpm will use only packages already available in the store. If a package won't be found locally, the installation will fail" ([install](https://pnpm.io/cli/install)).
- **Inside a workspace**, `pnpm install` "installs all dependencies in all the projects" unless `recursive-install` is `false` ([install](https://pnpm.io/cli/install)).
- **`NODE_ENV` has no effect.** pnpm 10.0.0: "All dependencies are now installed even if `NODE_ENV=production`" ([v10.0.0](https://github.com/pnpm/pnpm/releases/tag/v10.0.0), [pnpm#8839](https://github.com/pnpm/pnpm/pull/8839)).

### `--filter <selector>`

- `pnpm --filter foo... <cmd>` selects foo "and its dependencies (direct and non-direct)".
- `foo^...` selects only the dependencies.
- `--filter-prod` "omits `devDependencies` when selecting dependency projects from the workspace" ([filtering](https://pnpm.io/filtering)).
- Commands take the filter first, e.g. `pnpm --filter=<pkg> --prod deploy <dir>` ([deploy](https://pnpm.io/cli/deploy)).
- **UNVERIFIED for 12.5.1:** whether `pnpm install --filter @wechart/web...` with the shared lockfile limits `node_modules` to the selected projects.
  - Earlier issues report that filtered installs still install every workspace project's dependencies ([pnpm#7387](https://github.com/pnpm/pnpm/issues/7387), closed as not planned; [pnpm#8318](https://github.com/pnpm/pnpm/issues/8318)).
  - The 12.5.0 changelog only says "`pnpm install --filter <selector>` now installs only the Python projects the selection asks for" ([v12.5.0](https://github.com/pnpm/pnpm/releases/tag/v12.5.0)).
  - The Dockerfile above therefore does a full frozen install in the build stage, which is never shipped, and uses `--filter` only for `build` and `deploy`.

### `pnpm fetch` (layer caching without BuildKit cache mounts)

- "Fetch packages from a lockfile into virtual store, package manifest is ignored." Options: `--prod`, `--dev`.
- "Local `file:` protocol dependencies are skipped during `pnpm fetch`" ([fetch](https://pnpm.io/cli/fetch)).
- pnpm documents this for CI, where "BuildKit cache mounts might not be available"; the layer cache "will only be lost when you change the dependencies" ([docker](https://pnpm.io/docker)).

Documented monorepo pattern ([fetch](https://pnpm.io/cli/fetch)):

```dockerfile
# pnpm fetch does require only lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY . ./
RUN pnpm install -r --offline --prod
```

For our build stage, drop `--prod` from both commands, because Vite and TypeScript are devDependencies. Copy `pnpm-workspace.yaml` too: since pnpm 11, non-auth settings such as `allowBuilds` live there, not in `.npmrc` ([v11.0.0](https://github.com/pnpm/pnpm/releases/tag/v11.0.0), [settings](https://pnpm.io/settings)).

### `pnpm deploy`

```
pnpm --filter=<package name> [--prod|-P] [--dev|-D] [--no-optional] [--legacy] deploy <target directory>
```

- **Workspace injection is no longer required.** "Since v12.2.0, `pnpm deploy` no longer requires `injectWorkspacePackages`. A linked workspace dependency is rewritten to a `file:` dependency in the dedicated deploy lockfile… Before those releases the command refused every non-injected workspace up front. `--legacy`, or `forceLegacyDeploy: true`, still selects the older implementation" ([deploy](https://pnpm.io/cli/deploy), [12.2–12.3 post](https://pnpm.io/blog/releases/12.2-12.3)).
  - pnpm 10.0.0 had introduced the `inject-workspace-packages=true` requirement ([v10.0.0](https://github.com/pnpm/pnpm/releases/tag/v10.0.0)). The pnpm.io/docker Example 2 still sets `injectWorkspacePackages: true`, which 12.5.1 no longer needs.
  - `@wechart/core` (`workspace:*`) is therefore deployed as a `file:` dependency.
  - Ambiguous peers fail with `ERR_PNPM_DEPLOY_AMBIGUOUS_PEER` ([deploy](https://pnpm.io/cli/deploy)).
- **`--prod`**: "Packages in `devDependencies` won't be installed." Build first, then deploy with `--prod` ([deploy](https://pnpm.io/cli/deploy)).
- **Files copied:** "By default, all the files of the project are copied during deployment but this can be modified in _one_ of the following ways which are resolved in order:
  1. The project's `package.json` may contain a "files" field to list the files and directories that should be copied.
  2. If there is an `.npmignore` file in the application directory then any files listed here are ignored.
  3. If there is a `.gitignore` file in the application directory then any files listed here are ignored." ([deploy](https://pnpm.io/cli/deploy))

  Applied to `@wechart/api`:
  - With `"files": ["dist", "src/db/migrations"]`, step 1 applies, and `dist/` and `src/db/migrations/*.cjs` are copied regardless of any `.gitignore`.
  - Without it, the result depends on which `.gitignore` files pnpm 12 reads. The repo root `.gitignore` contains `dist/`; `packages/api` has none.
  - An older report says only a package-local `.gitignore` affected deploy, not the root one ([pnpm#7286](https://github.com/pnpm/pnpm/issues/7286), open). A pnpm discussion reply says a gitignored `dist` must be included "via files or ignore-file rules" ([discussion #10148](https://github.com/orgs/pnpm/discussions/10148)). Neither is confirmed for the Rust 12.x implementation.
  - The migrations lookup in `packages/api/src/db/migrate.ts` walks up from `dist/` to the nearest `package.json`. In the deployed layout (`/app/package.json`, `/app/dist/main.js`, `/app/src/db/migrations`) it resolves to `/app/src/db/migrations`. `WECHART_MIGRATIONS_DIR` overrides it.
- **Virtual store:** when `enableGlobalVirtualStore` is set, deploy "ignores it and always creates a localized virtual store within the deploy directory" ([deploy](https://pnpm.io/cli/deploy)). The deployed `node_modules` is therefore self-contained.
- **Bins:** since 12.5.0, deploy links workspace dependencies' commands into `node_modules/.bin` ([v12.5.0](https://github.com/pnpm/pnpm/releases/tag/v12.5.0)).
- **Target path:** pnpm's examples deploy to `/prod/app1` and copy it to the same path in the final stage ([docker](https://pnpm.io/docker)). The Dockerfile above does the same with `/app`.

### `allowBuilds` / `strictDepBuilds`

- **`strictDepBuilds`** (default `true`, added v10.3.0): "the installation will exit with a non-zero exit code if any dependencies have unreviewed build scripts (aka postinstall scripts)" ([build settings](https://pnpm.io/settings/build)).
- **`allowBuilds`** (added v10.26.0): a map from package matcher to `true` or `false`.
  - "Packages not listed in `allowBuilds` are disallowed by default and are treated as unreviewed. By default, an error is printed… If `strictDepBuilds` is set to `false`, a warning is printed instead."
  - "During install, dependencies with ignored builds that are not yet listed in `allowBuilds` are automatically added to `pnpm-workspace.yaml` with a placeholder value" ([build settings](https://pnpm.io/settings/build)).
- **pnpm 11** made `strictDepBuilds` default to true and replaced `onlyBuiltDependencies`, `neverBuiltDependencies` and related settings with `allowBuilds` ([v11.0.0](https://github.com/pnpm/pnpm/releases/tag/v11.0.0)).
- **In Docker:** the documented failure depends on `strictDepBuilds`, not on the lockfile mode. A frozen install in the image **does** exit non-zero on an unreviewed build script, and any placeholder it writes to `pnpm-workspace.yaml` is lost with the build container.
  - This repo's `allowBuilds: {'@ibm/plex-mono': false}` is an explicit review, so it produces no error.
  - The Linux-only packages installed in the image (e.g. `@rolldown/binding-linux-arm64-gnu`, `lightningcss-linux-arm64-gnu`) replace their darwin counterparts. I did not check whether any Linux-only package carries an install script (UNVERIFIED); if one does, the build fails loudly rather than silently.
- `dangerouslyAllowAllBuilds` exists but is flagged by pnpm as a security risk ([build settings](https://pnpm.io/settings/build)). Don't use it.

### Store and BuildKit cache mount

- **`storeDir` default:** `$PNPM_HOME/store` if `PNPM_HOME` is set; otherwise `$XDG_DATA_HOME/pnpm/store`, otherwise `~/.local/share/pnpm/store` on Linux ([store settings](https://pnpm.io/settings/store)).
  - The official pnpm image sets `PNPM_HOME=/pnpm`, "so the store the cache mounts target is at `/pnpm/store`" ([docker](https://pnpm.io/docker), [pnpm docker/Dockerfile](https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile)).
  - On `node:26…` nothing sets it, so set `ENV PNPM_HOME=/pnpm` as above.
  - Settings can also come from `pnpm_config_*` environment variables; pnpm no longer reads `npm_config_*` ([configuring](https://pnpm.io/configuring)). The exact name `pnpm_config_store_dir` is inferred from that pattern (UNVERIFIED).
- **Mount:** `RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile` ([docker](https://pnpm.io/docker)).
  - Mount options and defaults: `id` defaults to the target, `sharing` defaults to `shared`, `uid`/`gid` default to 0.
  - "Cache mounts should only be used for better performance. Your build should work with any contents of the cache directory" ([Dockerfile reference](https://docs.docker.com/reference/dockerfile/)).
- **Linking:** the store on a cache mount is a different filesystem from `/src`, and "hard links are only possible on the same filesystem", so pnpm copies ([store settings](https://pnpm.io/settings/store)). In pnpm 12, `packageImportMethod: auto` tries hardlinks first on Linux ([v12.0.0](https://github.com/pnpm/pnpm/releases/tag/v12.0.0)).
- **Security:** "keep the pnpm store cache scoped to mutually trusted builds. A store cache that can be written by an untrusted build should not be reused by trusted builds" ([docker](https://pnpm.io/docker)).
- **Don't bake a warm store into a layer:** overlayfs copies up hardlinked files, so it "does not make linking free" ([docker](https://pnpm.io/docker), [node-modules settings](https://pnpm.io/settings/node-modules)).
- **`enableGlobalVirtualStore`** defaults to **false** ("If pnpm detects that it is running in CI, this setting is automatically disabled") ([node-modules settings](https://pnpm.io/settings/node-modules)). A plain install therefore keeps `node_modules/.pnpm` inside the project, so copying the project directory keeps its symlink targets.

### `supportedArchitectures`

- "You can specify architectures for which optional dependencies should be installed, even if they don't match the current system's architecture."
  - Mapping form: `os`, `cpu`, `libc`; the keyword `current` means the running system.
  - Since v12.5.0 there is also a list form such as `- linux-arm64` / `- linux-x64-musl` ([dependency-resolution](https://pnpm.io/settings/dependency-resolution), [v12.5.0](https://github.com/pnpm/pnpm/releases/tag/v12.5.0)).
- **Not needed for these images.**
  - The committed lockfile, generated on macOS, already records every platform variant with `os`/`cpu`/`libc` metadata. For example, `@rolldown/binding-linux-arm64-gnu@1.2.9` has `libc: [glibc]` and `@rolldown/binding-linux-arm64-musl@1.2.9` has `libc: [musl]`; `lightningcss-linux-arm64-gnu`/`-musl@1.33.0` are there too (`/Users/srajagopal/Work/wechart/pnpm-lock.yaml` lines 716–806, 1755–1825).
  - A frozen install inside the linux/arm64 container picks the matching one.
  - The lockfile has no `esbuild` entries; this Vite 8 install resolves rolldown and lightningcss bindings.
- It would only matter if one `node_modules` had to work on both macOS and Linux, such as a host `node_modules` bind-mounted into a container. The `.dockerignore` above prevents that for image builds.

### Node image runtime conventions

- **User:** "the node images provide a `node` user with uid 1000", and the recommended Dockerfile form is `USER 1000  # node` ([BestPractices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)).
  - kubelet's `verifyRunAsNonRoot` rejects a non-numeric image user when `runAsNonRoot` is set and there is no `runAsUser`: `"container has runAsNonRoot and image has non-numeric user (%s), cannot verify user is non-root"` ([kubelet source](https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/kuberuntime/security_context_others.go)).
  - Hence `USER 1000:1000`, or `runAsUser: 1000` in the Helm values.
  - Files from `COPY` without `--chown` are owned by UID/GID 0 ([Dockerfile reference](https://docs.docker.com/reference/dockerfile/)), which makes `/app` read-only to uid 1000.
- **`NODE_ENV`:** "Run with `NODE_ENV` set to `production`" ([BestPractices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)). Set it in the runtime stage only.
- **CMD, exec form:** `CMD ["node","index.js"]` "ensures exit signals reach Node.js rather than being intercepted by npm" ([BestPractices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)). The shell form "does not pass signals… will not be the container's `PID 1`" ([Dockerfile reference](https://docs.docker.com/reference/dockerfile/)).
- **PID 1 and SIGTERM:**
  - docker-node: "Node.js was not designed to run as PID 1… a Node.js process running as PID 1 will not respond to `SIGINT` (`CTRL-C`) and similar signals". It recommends `docker run --init` (tini) or adding tini to the Dockerfile ([BestPractices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)).
  - Kernel: "Only signals for which the 'init' process has established a signal handler can be sent to the 'init' process…"; SIGKILL and SIGSTOP from an ancestor namespace are forcibly delivered ([pid_namespaces(7)](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)).
  - Node: SIGTERM and SIGINT have default handlers; "If one of these signals has a listener installed, its default behavior will be removed" ([process docs](https://nodejs.org/docs/latest-v26.x/api/process.html)).
  - close-with-grace listens for SIGHUP, SIGINT, SIGQUIT, SIGTERM, SIGUSR2 (and others). Its default `delay` is 10000 ms, after which it calls `process.exit(1)` ([close-with-grace README](https://github.com/mcollina/close-with-grace)). `packages/api/src/main.ts` calls it with `delay: 5_000`.
  - Kubernetes sends "a TERM (aka. SIGTERM) signal, with a grace period timeout, to the main process in each container"; the default grace period is 30 s, "Once the grace period has expired, the KILL signal is sent" ([pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)).
  - **Conclusion (inference from these sources):** because close-with-grace installs SIGTERM listeners, Node as PID 1 does receive and handle SIGTERM, and 5 s fits inside the 30 s grace period.
  - `--init` is a `docker run` flag, and the Kubernetes termination flow I read describes no init injection. Use `tini` as `ENTRYPOINT` anyway: it gives normal signal behaviour even for signals without listeners, and it reaps zombies. Debian describes it as "tiny but valid init for containers" that "reaps zombies, and forwards signals" ([Debian tini](https://packages.debian.org/trixie/tini)). docker-node's own multi-stage examples use `dumb-init` for the same purpose ([BestPractices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md); Debian [dumb-init](https://packages.debian.org/trixie/dumb-init) is also available for arm64 and amd64).

## Gotchas

1. **The image's pnpm must be exactly 12.5.1.**
   - `pmOnFail` defaults to `download`: when the running pnpm doesn't match the declared version, pnpm will "download and run the declared pnpm version" ([cli settings](https://pnpm.io/settings/cli)).
   - A mismatched pnpm in the image would quietly fetch 12.5.1 over the network during the build.
   - Separately, a frozen install fails with `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` when the `packageManager` pin and the lockfile's `packageManagerDependencies` disagree ([lockfile](https://pnpm.io/lockfile)).
   - Bumping to 12.6.0 means changing `packageManager` and regenerating the lockfile together.
2. **`node-pg-migrate` is a devDependency but a runtime import.** With `deploy --prod` it will be missing from `/app/node_modules`, and `node dist/main.js` will fail to resolve it. I haven't reproduced this, but it follows from the deploy `--prod` semantics and `dist/main.js` line 8. Move it to `dependencies`.
3. **`dist/` in the deployed API relies on deploy's file-selection rules.** Declare `"files": ["dist", "src/db/migrations"]` in `packages/api/package.json` (see `pnpm deploy`). Then check the stage output, e.g. `RUN test -f /app/dist/main.js && ls /app/src/db/migrations/*.cjs`.
4. **`.dockerignore` needs `**/` patterns.** A bare `node_modules` or `dist` only matches at the context root ([build context](https://docs.docker.com/build/concepts/context/)). The host's `packages/*/node_modules` hold darwin-arm64 binaries and symlinks into the host's `.pnpm`.
5. **`--frozen-lockfile` is not automatic in `docker build`.** No CI variable is set there ([install](https://pnpm.io/cli/install)).
6. **Store path on the node image.** Without `PNPM_HOME=/pnpm`, the store lives at `/root/.local/share/pnpm/store` ([store settings](https://pnpm.io/settings/store)), and the documented `target=/pnpm/store` mount caches nothing.
7. **A cache mount is per-`RUN`.** Mount it on the `deploy` step as well as the install step, otherwise deploy downloads again. This is my inference from Docker's per-instruction mount semantics ([Dockerfile reference](https://docs.docker.com/reference/dockerfile/)). pnpm's Example 2 omits it on `deploy`.
8. **Don't use `CMD ["pnpm","start"]`**, as pnpm's recipes do ([docker](https://pnpm.io/docker)).
   - The runtime image doesn't need pnpm at all.
   - Whether pnpm 12 forwards SIGTERM to its child is UNVERIFIED.
   - pnpm 12.6.0 fixed "`pnpm deploy` no longer triggers an install when running scripts in a read-only deployed filesystem" ([12.6 post](https://pnpm.io/blog/releases/12.6)). So in 12.5.1, running scripts inside a deployed directory under `readOnlyRootFilesystem` can attempt an install.
9. **Alpine arm64.** The node image's arm64 Alpine Node is compiled from source in the image build and "not tested before release" ([Dockerfile](https://github.com/nodejs/docker-node/blob/main/26/alpine3.24/Dockerfile), [README](https://github.com/nodejs/docker-node/blob/main/README.md)). Copying from `ghcr.io/pnpm/pnpm` (option A) also gives a glibc pnpm, which won't run on musl.
10. **Bookworm** has been out of Debian regular security support since 2026-07-12 ([Debian releases](https://wiki.debian.org/DebianReleases)).
11. **Cross-architecture builds.**
    - Docker builds for the host platform by default. Other platforms need `--platform`, and QEMU emulation "can be much slower than native builds". Multi-platform images need an image store that supports manifest lists; Docker Desktop uses containerd by default ([multi-platform](https://docs.docker.com/build/building/multi-platform/)).
    - On Apple silicon, images come out linux/arm64, which suits docker-desktop Kubernetes.
    - For an amd64 cluster, the web build output (static files) could come from a `FROM --platform=$BUILDPLATFORM` build stage. The API's `deploy` stage should run on the target platform so any platform-specific optional dependency matches.
12. **`NODE_ENV` in build stages.** pnpm ≥10 ignores it for installs ([v10.0.0](https://github.com/pnpm/pnpm/releases/tag/v10.0.0)). npm, however, defaults `omit` to `dev` when `NODE_ENV=production` ([npm v11 config](https://docs.npmjs.com/cli/v11/using-npm/config)). Keep `NODE_ENV=production` out of any stage that runs npm.
13. **npm 12 blocks install scripts by default** ([GitHub changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)). This only matters if option C (`npm install -g pnpm`) is chosen and a future Node 26 image ships npm 12. `--allow-scripts=pnpm` covers it.
14. **pnpm 12 rejects unknown settings in `pnpm-workspace.yaml`** with `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` ([v12.0.0](https://github.com/pnpm/pnpm/releases/tag/v12.0.0)). The current file only has `packages` and `allowBuilds`.
15. **Frozen-install fixes after 12.5.1.** 12.6.0 fixed frozen installs "when an optional dependency was unresolvable and skipped by the install that wrote the lockfile" and a regression that installed importers no longer listed in `pnpm-workspace.yaml` ([12.6 post](https://pnpm.io/blog/releases/12.6), [pnpm#15248](https://github.com/pnpm/pnpm/issues/15248)). They are not in the pinned 12.5.1. Whether to upgrade is the user's call.

## Open questions / unverified

- **Web serving image and `/api` routing.** Which server hosts `packages/web/dist` in the web image is not decided, and no research doc covers one. The browser calls same-origin `/api` (`packages/web/vite.config.ts` proxies it only in dev and preview), so production routing through the static server or an ingress must be decided for the Helm chart (AC-248). Needs a user decision and a separate research doc.
- **Migration step in Kubernetes.** `migrate.ts` says migrations run "as its own step before the API starts, never inside the API process". The images support this with the same `/app` layout, but whether it is a Job or an initContainer, and its entry command, is a spec/Helm decision.
- **Target cluster architectures.** Is it only docker-desktop on arm64, or amd64 too? This decides whether the build must be multi-platform (`docker buildx build --platform linux/amd64,linux/arm64`).
- **UNVERIFIED: filtered installs.** Whether `pnpm install --filter <pkg>...` in 12.5.1 limits installed dependencies to the selection with a shared lockfile. Tried: pnpm.io install and filtering docs (silent on this), issues #7387 and #8318 (older versions), and the 12.5.0 changelog (Python-only note).
- **UNVERIFIED: `.gitignore` scope for deploy.** Whether pnpm 12's Rust `deploy` reads `.gitignore` files above the package directory. Tried: the deploy doc (says "in the application directory") and issue #7286 (pre-12). Using `files` makes this moot.
- **UNVERIFIED: missing workspace project.** How `pnpm install --frozen-lockfile` behaves if a project listed in `pnpm-workspace.yaml` (e.g. `e2e`) is excluded from the build context. Keep it in the context.
- **UNVERIFIED: install scripts on Linux.** Whether any Linux-only optional package in the lockfile has an install script that `allowBuilds` would need to review. Tried: the lockfile doesn't record script presence. A frozen install would fail loudly if one did.
- **UNVERIFIED: pnpm and `libatomic.so.1`.** Whether the pnpm 12.5.1 Linux binary needs `libatomic.so.1`. The official pnpm image installs `libatomic1` ([pnpm docker/Dockerfile](https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile)). The node:26 slim image should keep it because Node ≥25 needs it (inference above). The `test "$(pnpm --version)" = "12.5.1"` line in the Dockerfile checks this at build time.
- **UNVERIFIED: `get-pnpm` details.** The exact install path of the binary under `PNPM_HOME` (option B), and whether `pnpm_config_store_dir` is the environment spelling of `storeDir`.
- **UNVERIFIED: pnpm signal forwarding.** Whether `pnpm start` (pnpm 12) forwards SIGTERM to the Node child. It is avoided by using `CMD ["node","dist/main.js"]`.
- **Digests.** The ghcr digest `sha256:0a4219f2…33ed` for `ghcr.io/pnpm/pnpm:12.5.1` was read from the GitHub Packages page. Confirm it before pinning by digest with `docker buildx imagetools inspect ghcr.io/pnpm/pnpm:12.5.1` (the command pnpm's own Dockerfile uses for its base, [pnpm docker/Dockerfile](https://github.com/pnpm/pnpm/blob/main/docker/Dockerfile)). Do the same for the node image digest above.
