---
library: xcube's introspection of a workspace overlay's own data source (the user's Cube fork)
packages: []
# Nothing is imported: wechart's server asks Cube's introspection routes over HTTP, under xcube's service credential.
version: 'xcube feat/xcube 93a5f7a73b; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-93a5f7a73b@sha256:3b8530173a367ae2c41cb22dc9430bd651f7cb5ae909f86a3912c6b84e86f9cd (amd64, arm64)'
researched: 2026-10-04
---

# xcube 93a5f7a73b: introspection of an overlay's own data source (T547)

An addition beside [`cube/introspection-api.md`](./cube/introspection-api.md), [`xcube-slice-6.md`](./xcube-slice-6.md) ("Serving") and [`xcube-6d9673ccda.md`](./xcube-6d9673ccda.md).

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-02-1100-introspection-overlay.md`, to wechart's request `~/Work/xcube-exchange/to-xcube/2026-10-02-1000-introspection-overlay.md`;
- the fork at `93a5f7a73b`, the one commit after `6d9673ccda` (`git log 6d9673ccda..93a5f7a73b`): `xcube/src/gateway.ts` (`overlayParam`, `dataSourceIntrospection`, `introspect`), `src/runtime/runtime.ts` (`overlaySourceContext`, `OverlaySourceError`), README "Introspection API", and `test/integration/sql-runner.test.ts` ("introspection browses an overlay's own data source");
- compose's running image, checked by T547 (below).

## Before this image

An overlay's data sources couldn't be introspected [answer, "Your research was right"]:
- the service credential names no overlay, so `{ds}` resolved only among the model's landed connections and the data sources its compiled model names;
- an overlay's own connections were reached only by a preview, through the overlay claim in a user's token.

## The routes as built

[answer, "The routes as built"; `gateway.ts` `overlayParam`, `dataSourceIntrospection`]

Under the service credential, four routes take `?overlay=<id>`:
- `GET /v1/introspection/data-sources/{ds}/schemas?overlay=<id>`;
- `GET …/{ds}/tables?overlay=<id>&schema=…`;
- `POST …/{ds}/columns?overlay=<id>`;
- `POST …/{ds}/scaffold?overlay=<id>`.

With an overlay named:
- **`{ds}` is one of that overlay's own data sources,** named as its previews and the SQL route name it: `<folderId>__<name>`, or a root one by its short name.
- **The request is pinned to the overlay's version,** as a preview of it is. The catalog is read on the overlay's own orchestrator, with its driver for the data source.
- **It never falls back** to a landed connection of the same name, nor to a data source the model names. xcube tested an overlay bringing its own root `default`, aimed at another database: it lists that database's tables, and the published `default` still lists its own.
- **The answers are the routes' own:** `{ schemas }`, the page of `{ tables }`, `{ tables: [{ …, columns }] }`, `{ cubes }`.
- **The first request for an overlay version may wait** while the instance compiles that version, if no preview has yet.
- **The list route** (`GET …/data-sources`) takes no `?overlay=`.

## The refusals

[answer, "The refusals"; `gateway.ts` `overlayParam`, `introspect`]

`{ "error": "…", "code": "…" }`, as the SQL route's:

| Status | `code` | When |
|---|---|---|
| 404 | `unknown_overlay` | No such overlay for the token's model: expired, dropped, or never was |
| 404 | `unknown_connection` | The overlay brings no data source of that name |
| 400 | `invalid_overlay_id` | Not 1 to 64 of `A-Z a-z 0-9 _ -` |
| 400 | `bad_request` | The service token names no model |
| 403 | `forbidden` | Not the service credential |

- Errors from the catalog itself are answered as before, in Cube's format (`{ "error": … }`, `Continue wait` as `200`).
- Without `?overlay=`, the routes are unchanged: an overlay-only name answers Cube's `404 Unknown data source`.
- **No migration:** the latest is still 12 [answer].

## Checked against compose's running image (T547, 2026-10-04)

T547 recreated compose's `wechart-cube` and `wechart-cube-refresh-worker` on the image.
- It used the main checkout's `docker-compose.yml` and project directory with only `CUBE_IMAGE` set. Each container's `com.docker.compose.config-hash` equals that of `docker compose config --hash` for it.
- Both came up healthy, revision label `93a5f7a73b1ba951126e83e051cac74046fa1f76`.

Probed under the service credential, model `e2e-security`, with T547's scratch probes, which aren't kept:
- **The refusals as answered:**
  - `GET …/default/schemas?overlay=ws-nonesuch`: `404 unknown_overlay`, "No overlay "ws-nonesuch": it expired, was dropped, or never was";
  - `?overlay=bad%20id`: `400 invalid_overlay_id`;
  - a service token naming no model: `400 bad_request`, "Browsing an overlay's data source takes a service token naming its model".
- **Without `?overlay=`,** `…/default/schemas` answers the landed root's schemas, as before.
- **An overlay's own data source, end to end** (`e2e/security/sql-runner.spec.ts`, Chrome). A data source made new in a writer's My workspace, under its target folder, exists in no landed form. Read through its workspace's overlay, it lists the sample database's `public` tables and `orders`' six columns.
- **6d9673ccda's stopped rows hold** (`xcube-6d9673ccda.md`): a time cap answers 3 rows, a stop before any row `rows: []`, and a cancel 2 rows, each `truncated: "stopped"`.
- **`GET /v1/semantic/credential-keys`** with the dev service token answers 200 with the active key.

**A 401 at the API's start, seen against these containers, came from the clock, not the image.**
- On 2026-10-02 the approval agent's API stopped at start with "xcube answered 401 when asked for its credential keys", against compose's `6d9673ccda` containers.
- Those containers' config was the main checkout's exactly (the same config-hash check).
- Cube's log has "Invalid token: The token was issued in the future" from 18:22 to 18:40 UTC that day: the Docker Desktop VM's clock behind the host's.
- xcube's admin auth answers 401 to a service token it can't verify (`xcube/src/admin/auth.ts`), and its verifier checks `iat`/`exp` with a clock tolerance (`src/security/verifier.ts`). wechart's start check takes any non-5xx refusal as fatal (`packages/api/src/secrets/xcube-key.ts`).
- The clocks agreed again when T547 checked (`date -u +%s` on the host and in `wechart-cube`).

## What it means for wechart

- **The schema browser** (T539) reads a workspace data source in its workspace's overlay, as its SQL runs (`?overlay=` on both): a copy, a copy pointed elsewhere, and one made new there, each its own catalog. A landed one is read as before.
- **wechart's service token names the model** (`ServiceCredential.token`), so `bad_request` doesn't arise.
- **Only wechart may name an overlay.** Under the service credential, `?overlay=` reads any overlay of the model. Overlay ids are derived from workspace ids (`workspaceOverlayIdOf`, a sha256 of the id). wechart forwarded the browser's query string to introspection (Generate cubes' routes, T145, and the schema browser's, T539). Before this image xcube refused an unknown parameter (`400`, `introspection-api.md`). From it, a browser's `?overlay=` would have read another workspace's data source.
  - It could also be smuggled past a filter on the literal key. xcube runs Express 4, whose default "extended" query parser (qs) reads `[overlay]=`, `%5Boverlay%5D=` and `ov%65rlay=` each as `overlay`; T547's review probed this with Express's own options.
  - So T547 passes on only the catalog routes' own parameters, named as written: `schema`, `search`, `type`, `limit`, `offset`. wechart names its own overlay, first in the query, so no padding of parameters after it can push it past qs's limit of 1000.
- **Generate cubes** could scaffold a workspace data source the same way; nothing asks for it yet.
