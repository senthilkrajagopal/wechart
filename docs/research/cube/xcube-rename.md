---
library: xcube, the fork's Cube package renamed from cube-introspection (fork senthilkrajagopal/cube, branch feat/xcube)
packages: []
# wechart calls the package over HTTP and imports nothing from it.
version: 1.7.45+a13b9cff431953d600a27d10f31bd81f0bfa8101
researched: 2026-09-26
sources:
  - https://github.com/senthilkrajagopal/cube/commit/a13b9cff431953d600a27d10f31bd81f0bfa8101
  - https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/Dockerfile
  - https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/README.md
  - https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/package.json
  - docs/inputs/2026-09-26-integration-plan-decisions.md ("Do now" 2)
  - docs/tasks.md T417 (wechart's own runs against the image)
---

# xcube: the introspection package, renamed (a13b9cff43)

A sibling to `introspection-api.md`, which describes the package at `0b6eef90a9` under its old name. Everything that doc says about the HTTP API still holds. This note records what the rename changed and how that was checked.

## What changed

The fork's commit `a13b9cff43` on `feat/xcube` ([commit]) renames the package directory from `cube-introspection/` to `xcube/`. It changes no Cube file.

| | At `0b6eef90a9` (`introspection-api.md`) | At `a13b9cff43` |
|---|---|---|
| Package directory | `cube-introspection/` | `xcube/` ([commit]) |
| npm name | `cube-introspection` | `xcube`, version `1.7.45-1` ([package]) |
| Image's `CMD` | `node /cube/node_modules/cube-introspection/dist/src/bin/server.js` | `node /cube/node_modules/xcube/dist/src/bin/server.js` ([dockerfile]) |
| Build | `docker build -t cube:v1.7.45-introspection-$(git rev-parse --short=10 HEAD) .` | `docker build -t xcube:v1.7.45-$(git rev-parse --short=10 HEAD) .`, from `xcube/` ([dockerfile] header; [readme] "Running it") |
| Base image | `cubejs/cube:v1.7.45` | `cubejs/cube:v1.7.45`, unchanged ([dockerfile]) |

- **Classes.** The commit message lists the renamed classes: `XcubeServerContainer`, `XcubeServer`, `XcubeServerCore` and `XcubeApiGateway`. The entry point is `xcube-server` ([commit]; [package] `bin`).
- **One Cube version.** The package still names Cube 1.7.45 in `peerDependencies`, and "the server refuses to start on any other" ([dockerfile] header; [readme]; [package]).

## What didn't change: the HTTP API

- **The fork's own comparison.** The commit message says: "The HTTP contract is unchanged: side by side with the image built from 0b6eef90a9, against one Postgres and wechart's cube.js, 28 of 28 requests answered byte for byte the same" ([commit]).
- **The fork's CI.** The user relayed that all 132 of the package's tests ran in CI, including the live Postgres, MySQL and Trino suites, with none skipped. The commit adds `.github/workflows/xcube.yml` for that ([commit]). This is the user's report; the CI run itself was not opened here.

## Observed locally (2026-09-26, T417)

- **The build.** It was built from `~/Work/bi/cube/xcube` at `a13b9cff43` as `xcube:v1.7.45-a13b9cff43`. The image's `Cmd` is `["node","/cube/node_modules/xcube/dist/src/bin/server.js"]` (`docker image inspect`).
- **Compose.** Compose's `cube` and `cube-refresh-worker` were recreated from it with no command set. Cube logged "Cube API server (1.7.45) is listening on 4000", and `/readyz` answered 200. Against it, in Chrome:
  - `e2e/generate-cubes.spec.ts`, `cube-scopes.spec.ts` and `data-source.spec.ts` passed, 7 of 7;
  - the API's introspection-related unit tests passed, 37 of 37.
- **The Helm release.** The docker-desktop release was upgraded to it, with sign-in on and wechart's images unchanged (Helm revision 15). Every check in `deploy/helm/verify.sh` passed, including the 830-row count of northwind's `orders`. Both Cube pods run `xcube:v1.7.45-a13b9cff43`.

## Corrections to `introspection-api.md`

Past `a13b9cff43`, read `cube-introspection/` there as `xcube/`, and the image's `CMD` path as `/cube/node_modules/xcube/…`. The routes, the `introspection` scope and the behaviour it describes are unchanged.

[commit]: https://github.com/senthilkrajagopal/cube/commit/a13b9cff431953d600a27d10f31bd81f0bfa8101
[dockerfile]: https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/Dockerfile
[readme]: https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/README.md
[package]: https://github.com/senthilkrajagopal/cube/blob/a13b9cff431953d600a27d10f31bd81f0bfa8101/xcube/package.json
