# Cube introspection API moved into a standalone package (2026-09-25)

Raw input, written from the Cube fork session at the user's request. It is **input to project-interview**, not requirements. It follows [2026-09-25-cube-introspection-api.md](./2026-09-25-cube-introspection-api.md), and claims here must be verified by component-research before the spec relies on them.

## 1. What changed, and what didn't

The user wanted the fork's changes kept apart from Cube's own code, so that pulling from upstream Cube never conflicts. The introspection API has moved out of Cube's packages into one standalone package:

- **Repository:** https://github.com/senthilkrajagopal/cube, local checkout `~/Work/bi/cube`
- **Branch:** `feat/introspection-package`, commit `0b6eef90a9`. It is cut from upstream `v1.7.45`.
- **Package:** everything is in `cube-introspection/` at the repository root. No file of Cube's own is changed; `git diff v1.7.45 -- . ':!cube-introspection'` is empty.
- **Image:** `cube:v1.7.45-introspection-0b6eef90a9`, built locally and not pushed to a registry. It is the published `cubejs/cube:v1.7.45` with the package added.

**The HTTP API is unchanged.** Paths, the `introspection` scope, request and response shapes, status codes and error messages are all the same.

This was checked by running the new image and wechart's current `cube:v1.7.45-introspection-f6355de982` side by side:
- One Postgres, with wechart's own `infra/cube/cube.js` mounted and a `wechartIntrospection: true` token.
- 28 requests, answered identically byte for byte. They covered:
  - the data source list, schemas and search;
  - tables with type filters and paging;
  - columns, including a materialized view, foreign keys and a time-typed key;
  - scaffolding: same-named tables across schemas, clashing member names, and the `js` format;
  - every 400 and 404, and scope refusals;
  - `CUBEJS_INTROSPECTION_MAX_TABLES`.
- Cube's own routes (`/v1/meta`, `/v1/load`, `/v1/sql`, `/readyz`, `/livez`) answer as stock `cubejs/cube:v1.7.45` does.

**No wechart code needs to change.** Its client, proxy, `cube.js` scope rule, and the scaffolding and clash handling keep working as they are.

## 2. What wechart would change

These are deployment and documentation changes only:

1. **Build the image from the package.** Replace the overlay build in `docs/deploy.md`, which is the line using `packages/cubejs-docker/overlay.Dockerfile`, with:

   ```sh
   cd ~/Work/bi/cube/cube-introspection
   docker build -t cube:v1.7.45-introspection-$(git rev-parse --short=10 HEAD) .
   ```

   `packages/cubejs-docker/overlay.Dockerfile` doesn't exist on the new branch.
2. **Use the new tag.** Change `cube:v1.7.45-introspection-f6355de982` to `cube:v1.7.45-introspection-0b6eef90a9` in:
   - `docker-compose.yml`, the `CUBE_IMAGE` default for `cube` and for `cube-refresh-worker`;
   - `deploy/helm/values/docker-desktop.yaml` (`cube.image`).
3. **Don't override the container command.** The image now starts `node /cube/node_modules/cube-introspection/dist/src/bin/server.js` instead of `cubejs server`. Setting `command:` to `cubejs server` in compose or Helm would start Cube without the introspection routes. Neither sets one today.
4. **Update `docs/research/cube/introspection-api.md`.** It is pinned to `95ea166012` and cites files that are not on the new branch; §3 maps each one. `introspection-api-f6355de982.md` stays accurate for the old image.

## 3. Where the cited code lives now

| Cited in wechart's research (old branch)                                                    | Now (`feat/introspection-package`)                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cubejs-api-gateway/src/gateway.ts` (routes, `introspect`, data source list)       | `cube-introspection/src/gateway.ts`, class `IntrospectionApiGateway`                                                                        |
| `packages/cubejs-api-gateway/src/data-sources.ts` (validation, paging)                      | `cube-introspection/src/requests.ts`                                                                                                          |
| `packages/cubejs-api-gateway/src/types/data-sources.ts` (wire types)                        | `cube-introspection/src/types.ts`                                                                                                             |
| `packages/cubejs-server-core/src/core/DataSourceIntrospection.ts`                           | `cube-introspection/src/introspection.ts`                                                                                                     |
| `packages/cubejs-schema-compiler/src/scaffolding/*`                                         | `cube-introspection/src/scaffolding/*`, a copy of Cube's with the fork's changes (see `NOTICE`)                                               |
| Driver changes (Postgres, MySQL, Redshift, Crate, Materialize, BigQuery, ClickHouse, Presto, DuckDB, Databricks, base driver) | `cube-introspection/src/catalog/views.ts`: the same queries, applied to each driver through a proxy instead of edited into the drivers        |
| Orchestrator `METADATA` fix (`QueryCache.ts`, `QueryOrchestrator.ts`)                        | Not needed: catalog reads go through the package's own queue, `cube-introspection/src/catalog/queue.ts`                                       |
| `CUBEJS_INTROSPECTION_MAX_TABLES` in `packages/cubejs-backend-shared/src/env.ts`             | Read in `cube-introspection/src/requests.ts` (`maxTablesPerRequest`)                                                                          |
| `packages/cubejs-docker/overlay.Dockerfile`                                                 | `cube-introspection/Dockerfile`                                                                                                               |
| API reference in `docs-mintlify/.../rest-api/reference.mdx`                                  | `cube-introspection/README.md`                                                                                                                |
| Tests in the Cube packages                                                                  | `cube-introspection/test/unit/*`, and `test/integration/*` for real Postgres, MySQL, Trino and DuckDB and the whole server in process |

## 4. Behaviour to know

- **Pinned to one Cube version.** The package extends Cube through protected methods that can change in any release. It is pinned to Cube `1.7.45`, and the server refuses to start on any other version. Moving Cube to a new version means moving the package with it; its README lists the steps.
- **Catalog reads use their own queue.** Each data source gets a queue beside Cube's, with the same driver, concurrency and wait timeout. With Cube Store as the queue, only processes running this image take its jobs. wechart's API instance runs the image, so that is covered.
- **Refresh worker.** It can run this image or stock `cubejs/cube:v1.7.45`; it serves no introspection routes either way. wechart runs the same image for both, which is fine.
- **Runs as uid 1000.** The image starts as uid 1000, as the Helm chart runs Cube.
- **Cube's own fixes are gone.** The old branch also fixed bugs inside Cube itself, for example in Cube's Playground scaffolding and in orchestrator methods Cube doesn't call. Those are not in the new image because Cube is unmodified; wechart used none of them. The introspection API's own behaviour, including the Postgres, MySQL and `numeric` fixes, is kept in the package.
- **The old branch stays.** `feat/data-source-introspection-api` and its images remain for reference and rollback.
