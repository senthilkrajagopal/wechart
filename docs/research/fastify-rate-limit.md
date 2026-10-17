---
library: "@fastify/rate-limit"
packages: ["@fastify/rate-limit"]
version: 11.2.1
researched: 2026-10-17
sources:
  - https://registry.npmjs.org/@fastify/rate-limit/latest
  - https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/README.md
  - https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/index.js
  - https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/types/index.d.ts
  - https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/store/RedisStore.js
  - https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/store/LocalStore.js
  - https://github.com/fastify/fastify-rate-limit/releases
  - https://fastify.dev/docs/latest/Reference/Hooks/
  - https://fastify.dev/docs/latest/Reference/Reply/
---
# @fastify/rate-limit 11.2.1

## Summary

`@fastify/rate-limit` is the Fastify organisation's request rate-limiting plugin. It counts requests per key in a time window. Once a key goes over `max`, it throws an error with status 429, or 403 when `ban` is configured ([README][readme], [index.js][index]).

Why wechart needs it:
- **MCP server.** The MCP spec says servers "MUST … Rate limit tool invocations", and the MCP SDK provides no server-side limiter (`docs/research/mcp-typescript-sdk.md`, Gotcha 9). Callers are identified by a personal access token, so limits must be keyed per token or per user, not per IP.
- **SQL runner (`docs/spec.md` F40).** It may also use this plugin, keyed by the signed-in user.

**Facts about wechart's own repo (checked 2026-10-17):**
- **No Redis runs anywhere.** There is no Redis, Valkey or ioredis in `/Users/srajagopal/Work/wechart/docker-compose.yml` or anywhere under `/Users/srajagopal/Work/wechart/deploy/` (grep for `redis|valkey|ioredis`, case-insensitive, found nothing).
  - The compose services are `wechart-meta`, `sample-db`, `xcube-db-init`, `cubestore`, `cube`, `cube-refresh-worker` and `dex`.
  - The Helm chart's templates are `api`, `web`, `meta`, `cube`, `cubestore`, `dex`, `xcube-bootstrap`, `seed-default`, plus config and secrets.
- **The API runs 2 replicas.** `api.replicas: 2` is set at `/Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml:44`.
- **`packages/api` pins `fastify` 5.12.5** and has no ioredis dependency (`/Users/srajagopal/Work/wechart/packages/api/package.json`).

## Install

```
pnpm --filter @wechart/api add @fastify/rate-limit@11.2.1
# only if a Redis store is chosen (needs the user's approval: Redis is not in the decided stack)
pnpm --filter @wechart/api add ioredis@<pin after its own research>
```

- **Latest version:** `latest` is 11.2.1, released 2026-10-08 ([npm][npm], [release v11.2.1][rel1121]).
- **License:** MIT ([npm][npm]).
- **Dependencies:** `@lukeed/ms` ^2.0.2, `fastify-plugin` ^6.0.0, `ip-address` ^10.2.0 and `toad-cache` ^3.7.0 ([package.json][pkg]).
- **No `peerDependencies` and no `engines` field** ([package.json][pkg]).
- **Node 26:** not stated anywhere. The package declares no engines constraint, and its dev dependencies include `@types/node` ^26.0.1 ([package.json][pkg]). Runtime compatibility with Node 26 is therefore UNVERIFIED beyond that.
- **Fastify compatibility.**
  - The compatibility table maps plugin `>=10.x` to Fastify `^5.x` ([README][readme]).
  - The plugin is wrapped as `fp(fastifyRateLimit, { fastify: '5.x', name: '@fastify/rate-limit' })` ([index.js][index]).
  - Fastify 5.12.5 satisfies both.
- **Module format:** CommonJS (`"main": "index.js"`, `"type": "commonjs"`), with types in `types/index.d.ts` using `export = fastifyRateLimit` ([package.json][pkg], [types][types]). Default-importing it from wechart's ESM TypeScript (`import rateLimit from '@fastify/rate-limit'`) relies on TypeScript's CJS interop settings, which are UNVERIFIED against wechart's tsconfig. Confirm with `pnpm typecheck`.
- **ioredis is not a dependency.** It is a dev dependency only (^6.0.0, bumped from 5.11.1 in 11.2.1) ([package.json][pkg], [release v11.2.1][rel1121]). The README says the Redis option "requires the use of `ioredis`" ([README][readme]).

## Init / auth pattern

### Scoping to `/mcp` only

The plugin is wrapped with `fastify-plugin`, which "breaks encapsulation and exposes decorators and hooks to the registering scope" ([fastify-plugin][fp]). The plugin then:
- installs an `onRoute` hook ([index.js][index]);
- for every route registered afterwards in that scope, pushes its checker into the route's own hook array, unless the route sets `config.rateLimit: false` ([index.js][index]).

Fastify's `onRoute` hook "is encapsulated", and "Except for onClose, all hooks are encapsulated" ([Fastify Hooks][hooks]). So registering the plugin inside an encapsulated child plugin (with or without `prefix: '/mcp'`) limits only the routes declared in that child.

`global` is described as "apply rate limiting to all routes within the encapsulation scope" ([README][readme]).

Alternatively, register with `global: false` and opt routes in with `config: { rateLimit: {...} }` ([README][readme], [index.js][index]).

### Order relative to the auth hook

- **The limiter is a route-level hook.** The plugin adds its check through `routeOptions[hook].push(hookHandler)`, not through `addHook` ([index.js][index], `addRouteRateHook`).
- **Route-level hooks run last.** Fastify says route-level hooks "are always executed as the last hook in their category" ([Fastify Hooks][hooks]).
- **So the limiter runs after auth.** With the default `hook: 'onRequest'`, an auth hook added through `addHook('onRequest', …)` in the same or a parent scope runs first. `keyGenerator` can then read the authenticated caller.
- **If the auth hook throws, the limiter never runs.** Fastify stops the lifecycle when a hook throws or replies ([Fastify Hooks][hooks]). Rejected (401) requests are therefore not counted by a token-keyed limiter. See Gotcha 5.

### Sketch (TypeScript)

Values for `max` and `timeWindow` are requirements and are not decided here.

```ts
import rateLimit from '@fastify/rate-limit';

class RateLimited extends Error {
  constructor(readonly statusCode: number, after: string) {
    super(`Rate limit exceeded, retry in ${after}`);
  }
}

await app.register(async (mcp) => {
  // PAT verification must move out of the handler (mcp-typescript-sdk.md sketch) into a hook,
  // so the key is known before the limiter runs.
  mcp.decorateRequest('mcpCaller', null);
  mcp.addHook('onRequest', async (request) => {
    request.mcpCaller = await verifyPersonalToken(request.headers.authorization); // throws Unauthenticated
  });

  await mcp.register(rateLimit, {            // await: routes declared before this get no limiter
    hook: 'onRequest',                        // route-level, so it runs after the onRequest above
    keyGenerator: (request) => `tok:${request.mcpCaller!.tokenId}`,   // or `user:${userKey}`; never the raw token
    max: MAX_FROM_REQUIREMENTS,
    timeWindow: WINDOW_FROM_REQUIREMENTS,
    errorResponseBuilder: (_req, ctx) => new RateLimited(ctx.statusCode, ctx.after),
  });

  mcp.all('/mcp', mcpHandler);
});
```

Sources for the sketch: the options and `errorResponseBuilder` context are from the [README][readme] and [types][types]. The "routes registered before the plugin get no limiter" rule follows from the plugin acting only through `onRoute` ([index.js][index]), which fires "when a new route is registered" ([Fastify Hooks][hooks]).

### SQL runner (session-cookie routes)

wechart sets `request.wechartUser` in different hooks depending on the security mode (`/Users/srajagopal/Work/wechart/packages/api/src/auth/user.ts:76-102`):
- with security **on**, in a **`preParsing`** hook;
- with security **off**, in `onRequest`.

With the default `hook: 'onRequest'`, `wechartUser` is still `null` when `keyGenerator` runs in security-on mode. Use `hook: 'preParsing'`, `'preValidation'` or `'preHandler'` for user-keyed limits on those routes. The allowed values are `'onRequest' | 'preParsing' | 'preValidation' | 'preHandler'` ([types][types]). The README documents `'preHandler'` for limiting after authentication ([README][readme]).

## API surface we will use

### Plugin options (`RateLimitPluginOptions` extends `RateLimitOptions`)

| Option | Type / default | Behaviour | Source |
|---|---|---|---|
| `global` | `boolean`, default `true` | Applies to every route in the encapsulation scope. With `false`, only routes with `config.rateLimit` are limited. | [README][readme], [index.js][index] |
| `max` | `number \| (req, key) => number \| Promise<number>`, default `1000` | Per-key ceiling. The function form allows per-user or per-tier limits. | [README][readme], [types][types] |
| `timeWindow` | ms number, `ms`-format string, or function; default `60000` | Window length | [README][readme] |
| `hook` | `'onRequest' \| 'preParsing' \| 'preValidation' \| 'preHandler'`, default `'onRequest'` | Lifecycle stage the check runs in, as a route-level hook | [types][types], [index.js][index] |
| `keyGenerator` | `(req) => string \| number \| Promise<…>` | Default is `normalizeIP(req.ip, ipv6Subnet)`. If `groupId` is set, it is appended to the key. | [types][types], [index.js][index] |
| `ipv6Subnet` | `number`, default `64` | Prefix mask used only by the default IP key | [README][readme], [GHSA][ghsa] |
| `allowList` | `string[]` or `(req, key) => boolean \| Promise<boolean>` | An array is matched against the **key** (`indexOf(key)`), not necessarily the IP. A match returns `isAllowed: true`: no counting and no headers. | [index.js][index], [README][readme] |
| `ban` | `number`, default `-1` (off) | `isBanned = ban !== -1 && current - max > ban`, giving status 403 and calling `onBanReach`. `ban: 0` gives 403 on the first request over the limit. | [index.js][index], [README][readme] |
| `cache` | `number`, default `5000` | LRU size for the in-memory store | [README][readme], [LocalStore][local] |
| `redis` | ioredis client | Selects `RedisStore` | [README][readme], [index.js][index] |
| `nameSpace` | `string`, default `'fastify-rate-limit-'` | Redis key prefix | [README][readme] |
| `store` | constructor with `incr` and `child` (and `read` for peeks) | Custom store; takes precedence over `redis` | [README][readme], [types][types], [index.js][index] |
| `skipOnError` | `boolean`, default `false` | When `true`, store errors let the request through. When `false`, the store error is rethrown. | [README][readme], [Context7 redis-store][c7redis] |
| `continueExceeding` | `boolean`, default `false` | Each request made while limited renews the window | [README][readme] |
| `exponentialBackoff` | `boolean` | Renews exponentially while limited (Redis: `timeWindow * 2^n`, capped) | [README][readme], [RedisStore][redisstore] |
| `groupId` | `string` | Meant to share one limit across routes; **broken in 11.2.x** (Gotcha 8) | [README][readme], [#463][i463] |
| `errorResponseBuilder` | `(req, ctx: { statusCode, ban, after, max, ttl }) => object` | Its return value is **thrown** | [types][types], [index.js][index] |
| `addHeaders` / `addHeadersOnExceeding` | per-header boolean maps; default all on | Choose which headers are sent | [README][readme], [types][types] |
| `enableDraftSpec` | `boolean`, default `false` | Uses the `ratelimit-*` header names | [README][readme] |
| `onExceeding` / `onExceeded` / `onBanReach` | `(req, key) => void` | Callbacks that run before the response | [README][readme], [types][types] |

### Per-route config

`config: { rateLimit: { …RateLimitOptions } | false }` augments `FastifyContextConfig` ([types][types]).
- An object creates a child store for that route: `pluginComponent.store.child(merged)` ([index.js][index]).
  - `RedisStore.child` namespaces keys by `${method}${url}-` ([RedisStore][redisstore]).
  - `LocalStore.child` creates a fresh LRU ([LocalStore][local]).
- Without per-route config, every route in the scope shares the plugin's single store. One key therefore has one counter across all of the scope's routes ([index.js][index]).

### Decorators

- **`fastify.rateLimit(options?)`** returns a `preHandlerAsyncHookHandler`. Use it, for example, as `setNotFoundHandler({ preHandler: fastify.rateLimit() }, …)` to limit 404 probing ([README][readme], [types][types]).
- **`fastify.createRateLimit(options?)`** returns `(req, { increment?: boolean }) => Promise<…>` ([types][types], [README][readme]). Available since 10.3.0; `increment` was added in 11.1.0 ([releases][releases]).
  - The result is `{ isAllowed: true, key }` or `{ isAllowed: false, key, max, timeWindow, remaining, ttl, ttlInSeconds, isExceeded, isBanned }`.
  - It sends nothing: the caller answers 429 itself ([README][readme]).
  - With `{ increment: false }` it peeks without counting. A custom store must then implement `read(key, cb, timeWindow, max)` ([README][readme]).

### Response when the limit is exceeded

- **Headers** (default names), set before the error is thrown ([index.js][index], `rateLimitRequestHandler`):
  - `x-ratelimit-limit`
  - `x-ratelimit-remaining` (`0`)
  - `x-ratelimit-reset`
  - `retry-after`
- **Values:** `retry-after` and `x-ratelimit-reset` are both `ttlInSeconds`, which is `Math.ceil(ttl / 1000)` ([index.js][index]).
- **Draft names:** with `enableDraftSpec`, the names are `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset` and `retry-after` ([README][readme]).
- **Requests under the limit** get `limit`, `remaining` and `reset`, with no `retry-after`, controlled by `addHeadersOnExceeding` ([index.js][index]).
- **Status:** 429, or 403 when `ban` is reached ([index.js][index]).
- **Default error:** `new Error(\`Rate limit exceeded, retry in ${context.after}\`)` with `err.statusCode = context.statusCode` ([index.js][index]). With Fastify's default error handler, the README documents the body `{ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded, retry in 1 minute' }` ([README][readme]).
- **Shaping the body.** Either:
  - return a custom object or Error from `errorResponseBuilder` (it is thrown, so it goes through the scope's error handler); or
  - branch on `error.statusCode === 429` in `setErrorHandler` ([README][readme], [index.js][index]).

## Gotchas

1. **wechart's error handler turns the limiter's error into a 500.**
   - The global `setErrorHandler` at `/Users/srajagopal/Work/wechart/packages/api/src/server.ts:6439-6479` handles only `FST_ERR_CTP_BODY_TOO_LARGE`, `CubeError`, `BadRequest`, `Unauthenticated` and `Forbidden`. It logs everything else and replies `500 { error: 'Internal error' }`.
   - The limiter throws a plain `Error` with `statusCode` 429 or 403 ([index.js][index]), so today it would come out as 500.
   - Fix: add a branch for it, for example a `RateLimited` class returned from `errorResponseBuilder`. Note that `setErrorHandler` is itself encapsulated, so a `/mcp` scope may set its own.
   - UNVERIFIED: whether headers set with `reply.header()` before the throw (`retry-after` and others) survive into a reply sent by a custom error handler. Not found in the fetched Fastify docs. Cover it with a test.
2. **Two replicas with the in-memory store gives two independent counters.**
   - The default `LocalStore` is a per-process `toad-cache` `LruMap` ([LocalStore][local]).
   - The README: "if an application runs on multiple servers, an external store will be needed" ([README][readme]).
   - With 2 API replicas, a key can be allowed up to about 2 × `max` per window, depending on how requests spread across pods. Kubernetes Service balancing behaviour was not researched (UNVERIFIED).
   - Rolling restarts reset the counters (inference: in-process memory).
   - LRU eviction past `cache` (default 5000 keys) also resets the evicted keys ([LocalStore][local]).
3. **Redis store details.**
   - **How it counts.** `RedisStore` runs a Lua script: `INCR`, sets the expiry on the first hit (or on every hit with `continueExceeding`), otherwise reads `PTTL` ([RedisStore][redisstore]).
   - **Atomicity.** Redis "guarantees the script's atomic execution" ([Redis Lua][redislua]), so both replicas share one exact counter.
   - **Client.** The client must be ioredis, or something compatible with `defineCommand` ([Context7 redis-store][c7redis]). The README recommends setting `connectTimeout` and `maxRetriesPerRequest` ([README][readme]).
   - **Valkey and node-redis.** Native Valkey-client support (#436) and node-redis support (#368) are open feature requests ([open issues][issues], [#436][i436]). Whether ioredis 6 works against a Valkey server is UNVERIFIED.
   - **Stack change.** Adding Redis changes the decided stack, so it needs the user's approval (CLAUDE.md, "Stack").
   - **Outages.** With `skipOnError: false` (the default), a Redis outage fails every limited request. With `true`, requests are let through unlimited ([README][readme]). Fail-open versus fail-closed is a requirement for the user to decide.
4. **The other store option is a custom store on the existing Postgres (`wechart-meta`).**
   - **Interface.** The `store` option takes any class with `incr(key, cb(err, {current, ttl}), timeWindow, max)` and `child(routeOptions)`, plus `read` for `createRateLimit` peeks ([types][types], [README][readme]).
   - **The bundled example is not a supported store.** The repo ships a Knex example ([example-knex.js][knex]), but it is example code; it does a read-then-write in a transaction. Its concurrency safety is UNVERIFIED.
   - **Atomic increment.** A Postgres `INSERT … ON CONFLICT DO UPDATE … RETURNING` "guarantees an atomic INSERT or UPDATE outcome … even under high concurrency" ([Postgres INSERT][pginsert]). That gives an exact shared counter without adding Redis.
   - **Unchecked:** whether a maintained Postgres store package exists on npm. The web-search budget for this session was exhausted.
5. **Unauthenticated floods are not counted by a token-keyed limiter.**
   - If the PAT `onRequest` hook throws 401, the route-level limiter never runs ([Fastify Hooks][hooks], [index.js][index]).
   - If invalid-token traffic must be limited too, the options are:
     - an auth hook that does not throw and leaves the caller `null`, with a `keyGenerator` that falls back to an IP key; or
     - a second limiter keyed by IP.
   - Which to use is a design decision. The IP key needs a correct `trustProxy`, which wechart already supports in config (`packages/api/src/config.ts:65`, `server.ts:512-516`).
6. **The HTTP layer counts every MCP POST, not only `tools/call`.**
   - Each JSON-RPC request is one POST, and every POST carries an `Mcp-Method` header (`docs/research/mcp-typescript-sdk.md`, "Transports").
   - To count only tool calls, either:
     - use an `allowList: (req) => req.headers['mcp-method'] !== 'tools/call'` (an allowListed request is not counted; [index.js][index]); or
     - call `createRateLimit()` inside the tool path ([README][readme]).
   - The header option is only safe if header/body mismatches are rejected before the handler. Whether the SDK enforces that rejection is UNVERIFIED. A client that lies in the header would otherwise bypass the limit.
7. **Hijacked replies may lose the headers on allowed requests.**
   - The planned MCP route calls `reply.hijack()` and writes to `reply.raw` (`docs/research/mcp-typescript-sdk.md`, sketch).
   - Fastify says using `reply.raw` means "skipping all the Fastify logic of handling the HTTP response" ([Fastify Reply][reply]).
   - The `x-ratelimit-*` headers set through `reply.header()` on allowed requests are therefore probably not written (inference, UNVERIFIED).
   - The 429 path is unaffected, because it throws before the handler runs ([index.js][index]).
8. **`groupId` is broken in 11.2.x.**
   - Issue #463 (opened 2026-09-16, reported against 11.2.0): routes sharing a `groupId` each get the full `max`, in both LocalStore and RedisStore ([#463][i463]).
   - Fix PR #464 is open and not released ([PR #464][pr464]).
   - Don't use `groupId`. For one budget across several routes, use a single scope-wide (non-per-route) config, which shares one store ([index.js][index]).
9. **Security fix in 11.2.0.**
   - GHSA-grpc-p53c-r64v (CVE-2026-15144, High): before 11.2.0, IPv6 address rotation bypassed IP-keyed limits ([GHSA][ghsa]).
   - The fix normalises IPv6 and adds `ipv6Subnet` (default `/64`).
   - This is irrelevant to token keys, but any IP fallback key should go through the default generator, or apply the same normalisation.
10. **Register before declaring routes.** The plugin acts only through `onRoute`, so `await` the registration before declaring the scope's routes ([index.js][index], [Fastify Hooks][hooks]).
11. **The algorithm is a fixed window, not a sliding one.**
    - LocalStore resets when `iterationStartMs + timeWindow <= now` ([LocalStore][local]).
    - Redis sets the expiry on the first `INCR` ([RedisStore][redisstore]).
    - Inference: a key can make up to about 2 × `max` requests across a window boundary.
12. **`ban` lasts only for the window.** `isBanned` is computed from the same window counter ([index.js][index]). Inference: the 403 lasts only until the window resets, unless `continueExceeding` keeps renewing it.
13. **Don't use the raw token as the key.**
    - Keys are stored in memory or, with Redis, as `nameSpace + key` ([RedisStore][redisstore]).
    - Use a token id or a hash instead (design inference, not a third-party claim).
14. **There is no double counting.** A per-request symbol guard stops the limiter running twice on one request, for example the global hook plus `fastify.rateLimit()` ([index.js][index]).

## Alternatives considered

Not requested.

## Open questions / unverified

- **Store choice, for the user:**
  - in-memory, accepting roughly N × `max` across replicas;
  - Redis/Valkey, a stack change that needs approval;
  - a custom Postgres store on `wechart-meta`.
- **Limit values, for the user:** `max`, `timeWindow`, and per token versus per user (per token allows one user N × `max` across N tokens). Also fail-open versus fail-closed when the store fails (`skipOnError`), and whether 401 traffic is IP-limited.
- **Limit scope for MCP, for the user:** every MCP POST, or only `tools/call`.
- UNVERIFIED: Node 26 runtime compatibility. There is no engines field, and it was not tested.
- UNVERIFIED: whether TypeScript default-import interop matches wechart's tsconfig.
- UNVERIFIED: whether headers set before the throw survive wechart's custom `setErrorHandler`.
- UNVERIFIED: whether `x-ratelimit-*` headers are lost on hijacked MCP replies.
- UNVERIFIED: whether the MCP SDK rejects an `Mcp-Method` header/body mismatch before the handler runs.
- UNVERIFIED: whether ioredis 6 works against Valkey.
- UNVERIFIED: whether a maintained Postgres store package exists. Web search was unavailable: the session budget was exhausted.
- UNVERIFIED: how the Kubernetes Service distributes requests between the 2 API pods.

[npm]: https://registry.npmjs.org/@fastify/rate-limit/latest
[pkg]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/package.json
[readme]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/README.md
[index]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/index.js
[types]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/types/index.d.ts
[redisstore]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/store/RedisStore.js
[local]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/store/LocalStore.js
[knex]: https://github.com/fastify/fastify-rate-limit/blob/v11.2.1/example/example-knex.js
[c7redis]: https://github.com/fastify/fastify-rate-limit/blob/main/_autodocs/api-reference/redis-store.md
[releases]: https://github.com/fastify/fastify-rate-limit/releases
[rel1121]: https://github.com/fastify/fastify-rate-limit/releases/tag/v11.2.1
[ghsa]: https://github.com/fastify/fastify-rate-limit/security/advisories/GHSA-grpc-p53c-r64v
[issues]: https://github.com/fastify/fastify-rate-limit/issues?q=is%3Aissue+is%3Aopen
[i463]: https://github.com/fastify/fastify-rate-limit/issues/463
[pr464]: https://github.com/fastify/fastify-rate-limit/pull/464
[i436]: https://github.com/fastify/fastify-rate-limit/issues/436
[hooks]: https://fastify.dev/docs/latest/Reference/Hooks/
[reply]: https://fastify.dev/docs/latest/Reference/Reply/
[fp]: https://github.com/fastify/fastify-plugin
[redislua]: https://redis.io/docs/latest/develop/programmability/eval-intro/
[pginsert]: https://www.postgresql.org/docs/18/sql-insert.html
