---
library: cube
packages: []
version: 1.7.42
researched: 2026-09-22
sources: [https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/graphql.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/user-error.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/cubejs-handler-error.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server/src/server.ts, https://github.com/graphql/express-graphql/blob/v0.12.0/src/index.ts, https://github.com/pillarjs/finalhandler/blob/v1.3.1/index.js, https://github.com/expressjs/body-parser/blob/1.20.3/lib/read.js, https://github.com/hapijs/joi/blob/v17.13.3/lib/types/array.js]
---
# Cube 1.7.42: API scope probes

> **Historical in one place, 2026-09-25** (architecture decisions 1 and 12, [docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)): the token "naming a draft" (:112) no longer exists. Drafts become overlays, and wechart's own calls use the service credential.

## Summary

This doc covers AC-170: show which API scopes wechart's configured context has, and mark a screen unavailable when its scope is missing. Cube has no endpoint that lists scopes. So wechart's API server sends one minimal request per scope with its own token and reads the answer.

**Main finding.** On all seven endpoints, the scope assertion is the first statement of the handler. It runs before any query parsing or validation, before the data model is compiled (`getCompilerApi`), and before the orchestrator or data source is reached. So an empty or malformed `query` with the scope missing always returns 403 `API scope is missing: <scope>`. Only these run earlier:
- auth;
- `extendContext`;
- body-parser, for a malformed JSON body.

Details are in the table and Gotchas.

**How the line numbers were derived.** The researcher had no shell, so it could not read the tag's files with line numbers directly.
- It read a local clone at `8368f2af` (2026-09-11, which reports package version 1.7.37), at `/Users/srajagopal/Work/bi/cube`.
- It applied the two later commits that touch `gateway.ts` before the tag: [e8c04fcc](https://github.com/cube-js/cube/commit/e8c04fcc7f64948c43f4f59df7d53897102e115b) (+9 blank lines) and [99cceac7](https://github.com/cube-js/cube/commit/99cceac77f00c8c0a13c0f2c0f4b237b4d97460f) (log redaction).
- It checked the shifted numbers against four hunk headers of those commits: −1055→+1058, −569→+572, −2499→+2503, −2552→+2578.
- `graphql.ts` got +1 line after line 477 (e8c04fcc). `env.ts` got +11 lines near line 208 (99cceac7).
- `query.js`, `user-error.ts` and `cubejs-handler-error.ts` have no commits between `8368f2af` and the tag.

## Install

Nothing to install. The probes are plain HTTP calls from wechart's Node 26 API server to `{CUBE}/cubejs-api/...`. How the token is sent (the `Authorization` header) is in `access-control.md`.

## Init / auth pattern

- **Middleware order.** Every probed route runs `checkAuth → requestContextMiddleware (extendContext) → contextRejectionMiddleware → logNetworkUsage → requestLogger` before its handler ([g316]). POST `/v1/load`, `/v1/sql` and `/v1/dry-run` also run a route-level `jsonParser` first ([g406], [g447], [g487]).
- **Global JSON parser.** `@cubejs-backend/server` installs `bodyParser.json` on the whole app before the gateway routes ([srv96]).
- **Content type.** Send `Content-Type: application/json` and a well-formed JSON body on the POST probes. Send `Accept: application/json` to `/graphql` (see Gotchas).

## API surface we will use

### Probe table (questions 1 and 2)

A missing scope always returns **403** `{"error":"API scope is missing: <scope>"}`. The status and body are covered under question 3.

| Endpoint (route source) | Scope asserted | Where the assert sits | Cheapest "granted" probe and its answer (production mode) |
|---|---|---|---|
| `GET /v1/meta` ([g523]) | `meta` | First statement in `meta()`'s `try`, before `getCompilerApi` and `metaConfig` ([g780]). `?extended` goes to `metaExtended`, which also asserts `meta` first ([g830]). | `GET /v1/meta` → 200 `{ cubes, viewGroups? }`. The route reads only `onlyViews` and `extended`, so no cheaper form exists ([g523]). It compiles the model (or reuses the compiled one). The gateway sends no data-source query on this path ([g780]). |
| `GET\|POST /v1/load` ([g406]) | `data` | First statement in `load()`'s `try`. It runs before `parseQueryParam`, `getNormalizedQueries` (which compiles) and `metaConfig` ([g2116]). | `GET /v1/load` with no `query` → **400** `{"error":"Query param is required"}` ([g2457]). This error is thrown before `getCompilerApi` ([g2116]). An unparsable `?query=` → 400 `Unable to decode query param as JSON, error: …` ([g2461]). |
| `GET\|POST /v1/sql` ([g447]) | `sql`. `format=sql` goes to `sql4sql`, which also asserts `sql` ([g1541]). | First statement in `sql()`'s `try`, before `getNormalizedQueries` ([g1570]). `parseQueryParam` is the first line of `getNormalizedQueries` and runs before `getCompilerApi` ([g1413]). | `GET /v1/sql` with no `query` → **400** `{"error":"Query param is required"}` ([g1413], [g2457]). Don't probe with `format=sql` and no query. That path goes straight into the native `sql4sql` ([g1541]), and its error is UNVERIFIED. |
| `POST /graphql` (`app.use`, any method, [g365]) | `graphql` | First statement of the handler, before `getCompilerApi` and schema build ([g369]). It is **outside any `try`**, so the error goes through the error middleware ([g125], [g2495]). | `POST {"query":"{ __typename }"}`: the handler builds or reuses the schema ([g365]), then express-graphql runs the query. `__typename` on the root type calls no resolver, and the root type is `Query` ([gql630]). The `extensions` callback returns `res.extensions \|\| {}` ([g394]), and express-graphql attaches any non-null extensions ([eg]). Expected: **200** `{"data":{"__typename":"Query"},"extensions":{}}`. This is derived from source, not observed. |
| `POST /v1/pre-aggregations/jobs` (POST only, [g609]) | `jobs` | First statement in the `try`, before the empty-body check and the Joi validation ([g1066]). The refresh scheduler is reached only after validation ([g1091]). | Option 1: body `{}` → **400** `{"error":"No job description provided"}` ([g1066]). Option 2: `{"action":"get","tokens":[]}` → **400** `{"error":"Invalid Job query format: \"tokens\" must contain at least 1 items"}`. This is built from `tokens: Joi.array()…min(1)` ([q250]), Joi's `array.min` template ([joi-array]), its default label quoting `"` ([joi-common]), and the handler prefix ([g1066]). Neither body touches the cache or queue. |
| `POST /v1/cubesql` ([g548]) | `data` | First statement in the `try`. It runs before `cubeSqlRequestSchema.validate` and `sqlServer.execSql` ([g548]). | Body `{}` → **400** `{"error":"Invalid query format: \"query\" is required"}`. This comes from `query: Joi.string().required()` ([q214]) and Joi's `any.required` template ([joi-any]). The handler sets `Transfer-Encoding: chunked` and removes it again in the `catch` ([g548], [g564]). |
| `GET\|POST /v1/dry-run` ([g487]) | `data` | First statement in `dryRun()`'s `try`, before `getNormalizedQueries` and `getSql` ([g1822]). | `GET /v1/dry-run` with no `query` → **400** `{"error":"Query param is required"}` ([g1822], [g1413], [g2457]). |

**Why the 400s look like that.** Validation errors are `UserError`. `UserError` is `CubejsHandlerError(400, 'User Error', msg)` ([ue], [che]). `handleError` sends `CubejsHandlerError` as `{ error, stack, requestId, plainError }` with `e.status` ([g2536]). `stack` is set only in dev mode, `requestId` only in dev mode or for playground-signed requests, and `plainError` is undefined here ([g2527]). `res.json` drops undefined fields ([g2441]). So production bodies are exactly `{"error":"…"}`.

### Question 3: the missing-scope response, checked on every request

- **The throw.** `assertApiScope` throws `new CubejsHandlerError(403, 'Forbidden', \`API scope is missing: ${scope}\`)` ([g2842]).
- **Status and body.** `handleError` sends it with status **403** and body `{"error":"API scope is missing: jobs"}` ([g2536]). In dev mode the body also carries `stack` and `requestId`. Playground-signed requests also get `requestId` ([g2527]). Read only the `error` field.
- **Per request.**
  - `assertApiScope` calls `contextToApiScopesFn(securityContext || {}, CUBEJS_DEFAULT_API_SCOPES || ['graphql','meta','data','sql'])` on every call ([g2842], [g240], [env1962]).
  - The wrapper around the user's `contextToApiScopes` validates the result but doesn't memoize it ([g2807]).
  - `securityContext` comes from that request's own `checkAuth` ([g2745]).
  - So a new token takes effect on the next request. Changing the function inside `cube.js` needs Cube to reload its config (UNVERIFIED; not in `gateway.ts`).

### Classifying probe answers (wechart design inference, not Cube behavior)

- **Missing:** status 403 and `error === "API scope is missing: <scope>"`.
- **Granted:** the expected answer from the table (200 for meta/graphql; 400 with the listed message for the others).
- **Unknown:** anything else, including other 403s, 5xx, a network error or a timeout.

## Gotchas

- **No dev-mode or playground bypass of scopes.** `assertApiScope` has no `devMode` or `signedWithPlaygroundAuthSecret` branch ([g2842]).
  - Playground-secret tokens only set `signedWithPlaygroundAuthSecret` ([g2742]), and only when the JWT carries `scope: ['dev-token']` ([g198]). That JWT claim has nothing to do with API scopes.
  - The flag only widens meta visibility and error detail ([g723], [g2527]).
- **Outside production, a bad token is silently replaced by `{}`.**
  - When `enforceSecurityChecks` is false, an invalid or missing token isn't rejected ([g2745]). It is false unless `NODE_ENV=production` or the option is set ([g288]).
  - `contextToApiScopes` then gets `{}` ([g2842]). The probe then reports the scopes of an empty context, not wechart's.
  - The compose Cube runs in production mode: `access-control.md`, "Observed locally", records 403 for missing or invalid tokens.
- **403 alone is ambiguous.** Auth failures are also 403 (`Invalid token`, `Authorization header isn't set`) ([g2745], [g2885]). Match the exact `error` string.
- **A broken `contextToApiScopes` gives 500, not 403.** A non-array result or an unknown scope name throws a plain `Error` ([g2817]). `handleError` turns it into **500** `{"error":"Error: A user-defined contextToApiScopes function returns …"}` ([g2577]). Show "unknown", not "missing".
- **`/graphql` (and `/v1/pre-aggregations/can-use`, scope `meta`, [g589]) fail through the error middleware.**
  - The assert sits outside a `try`, so the rejection goes to `next(err)` ([g125]).
  - `handleErrorMiddleware` writes the 403 and then calls `next(e)` ([g2495]).
  - Express 4.22.2 (pinned `^4.22.2` in [pkg]) uses `finalhandler ~1.3.1` ([npm-express]). When headers are already sent, `finalhandler` calls `req.socket.destroy()` ([fh]).
  - UNVERIFIED: whether a Node 26 `fetch` client always gets the full 403 body before the connection closes. Treat a network error from the graphql probe as "unknown".
- **GraphQL screens need `graphql` and `data`.**
  - The `cube` query field's resolver calls `apiGateway.load` ([gql648]), which asserts `data` ([g2116]).
  - With `graphql` granted and `data` missing, the resolver rejects with `Error('API scope is missing: data')` ([gql648]).
  - express-graphql then turns a 200 with `data == null` into **500** ([eg]). The message is in `errors[]` and is not a 403.
  - So mark GraphQL screens unavailable when either scope is missing.
- **A malformed JSON body fails before auth and scope, and it returns 500.**
  - The global `bodyParser.json` runs first ([srv96]). A parse error is passed on as an http-errors error with `type: 'entity.parse.failed'` ([bp-read]).
  - That error is neither a `CubejsHandlerError` nor `UserError`-typed, so `handleError` sends **500** ([g2577]).
  - The error middleware then calls `next(e)` too ([g2495]).
  - Strict mode rejects bodies that don't start with `{` or `[` ([bp-json]). Only well-formed JSON probes are reliable.
  - The tag pins body-parser `^1.20.8` ([pkg]). The researcher read the 1.20.3 source; whether 1.20.8 matches is UNVERIFIED.
- **`/v1/cubesql` and log redaction.** The `catch` computes `redactedSqlForLog(query)` ([g564]). That calls the native `redactSqlLiterals` only when `query` is a string and `logRedaction` is on ([g2511]). `logRedaction` defaults to on in production ([env218]). The source comment says that on a platform without the native module, a scope error "raised before the statement ran" becomes a 500 ([g2511]). Probing with `{}` (no `query` string) avoids that path.
- **GraphiQL outside production.** GraphiQL is enabled when `NODE_ENV !== 'production'` ([g394]). express-graphql serves the HTML page when the request prefers HTML ([eg]). Probe with POST and `Accept: application/json`.
- **The jobs route is POST-only** ([g609]). A GET falls through to Express's 404, not a scope answer.
- **Meta and graphql probes compile the model.** A compile error returns a non-403 (500), so read it as "unknown". The gateway path runs no data-source query ([g780], [g365]). Whether user hooks that run during compile (`repositoryFactory`, dynamic models) touch a database is outside this doc (UNVERIFIED).
- **Routes with no scope check can't serve as probes:** `/v1/graphql-to-json` ([g339]) and `DELETE /v1/running-query/:id` ([g511]).
- **Correction for `data-apis.md`.** Its open question "Scopes of two routes" can now be answered:
  - `/v1/convert-query` asserts `sql` ([g1791]).
  - `/v1/running-query` asserts none ([g511]).
  - `/v1/subscribe` goes through `load()` and so needs `data` ([g427], [g2116]).
- **Scopes are per token.** `contextToApiScopes` receives each token's own security context ([g2842]). A "view as" (impersonated) token can have different scopes from wechart's configured context.

## Observed locally (2026-09-22, compose Cube 1.7.42, production mode)

Each probe was sent with a token signed as wechart signs its own (context `{}`), then with one naming a draft (`wechartDraft`). For a draft, `infra/cube/cube.js` `contextToApiScopes` leaves out `jobs`.

| Probe | wechart's token | Draft token (no `jobs`) |
|---|---|---|
| `GET /v1/meta` | 200 `{"cubes":[…]}` | 200 |
| `GET /v1/load` | 400 `{"error":"Query param is required"}` | same |
| `GET /v1/sql` | 400 `{"error":"Query param is required"}` | same |
| `POST /graphql` `{"query":"{ __typename }"}`, `Accept: application/json` | 200 `{"data":{"__typename":"Query"},"extensions":{}}` | same |
| `POST /v1/pre-aggregations/jobs` `{}` | 400 `{"error":"No job description provided"}` | **403** `{"error":"API scope is missing: jobs"}` |

This confirms the table's granted answers for these five probes, the `/graphql` success body, and the missing-scope status and body.

## Alternatives considered

Not requested.

## Open questions / unverified

- **Runtime confirmation: partly done.** The researcher had no shell. "Observed locally" above confirms these against the compose Cube, with a token that has each scope and, for `jobs`, one that doesn't:
  - `GET /v1/meta`
  - `GET /v1/load`
  - `GET /v1/sql`
  - `POST /graphql` (its success body included)
  - `POST /v1/pre-aggregations/jobs` with `{}`

  Still not run:
  - `GET /v1/dry-run`, `POST /v1/cubesql` with `{}`, and jobs with `{"action":"get","tokens":[]}`.
  - A missing `meta`, `data`, `sql` or `graphql` scope. The compose `contextToApiScopes` only ever withholds `jobs`.
- UNVERIFIED: the Joi message wording, derived from source templates, not observed.
- UNVERIFIED: whether the client sees the full 403 on `/graphql` before `finalhandler` destroys the socket.
- UNVERIFIED: the line numbers were derived from local `8368f2af` plus the commit patches (method in Summary), not read off the tag file. The anchors could be off if a commit slipped past that check, though none was found.
- UNVERIFIED: whether editing `cube.js` takes effect without restarting Cube.

[g125]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L125-L129
[g198]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L198-L206
[g240]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L240-L241
[g288]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L288
[g316]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L316-L322
[g339]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L339-L363
[g365]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L365-L400
[g369]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L369-L374
[g394]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L394-L397
[g406]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L406-L425
[g427]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L427-L445
[g447]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L447-L485
[g487]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L487-L501
[g511]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L511-L517
[g523]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L523-L542
[g548]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L548-L563
[g564]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L564-L579
[g589]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L589-L592
[g609]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L609-L613
[g723]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L723
[g780]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L779-L786
[g830]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L830
[g1066]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1066-L1076
[g1091]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1091-L1097
[g1413]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1413-L1442
[g1541]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1541-L1543
[g1570]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1569-L1576
[g1791]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1791
[g1822]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1822-L1827
[g2116]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2115-L2148
[g2441]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2441-L2454
[g2457]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2457-L2459
[g2461]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2461-L2466
[g2495]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2495-L2504
[g2511]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2511-L2522
[g2527]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2527-L2528
[g2536]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2536-L2543
[g2577]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2577-L2585
[g2742]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2742-L2743
[g2745]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2738-L2757
[g2807]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2807-L2840
[g2817]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2817-L2828
[g2842]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2842-L2859
[g2885]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2876-L2908
[gql630]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/graphql.ts#L630-L631
[gql648]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/graphql.ts#L648-L660
[q214]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js#L214-L219
[q250]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js#L232-L260
[ue]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/user-error.ts#L3-L7
[che]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/cubejs-handler-error.ts#L1-L10
[env1962]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts#L1962-L1963
[env218]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts#L218-L226
[srv96]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server/src/server.ts#L94-L102
[pkg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/package.json
[npm-express]: https://registry.npmjs.org/express/4.22.2
[fh]: https://github.com/pillarjs/finalhandler/blob/v1.3.1/index.js
[eg]: https://github.com/graphql/express-graphql/blob/v0.12.0/src/index.ts
[bp-read]: https://github.com/expressjs/body-parser/blob/1.20.3/lib/read.js
[bp-json]: https://github.com/expressjs/body-parser/blob/1.20.3/lib/types/json.js
[joi-array]: https://github.com/hapijs/joi/blob/v17.13.3/lib/types/array.js
[joi-any]: https://github.com/hapijs/joi/blob/v17.13.3/lib/types/any.js
[joi-common]: https://github.com/hapijs/joi/blob/v17.13.3/lib/common.js
