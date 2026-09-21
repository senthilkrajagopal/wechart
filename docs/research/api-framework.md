---
library: Fastify
packages: [fastify, "@fastify/type-provider-typebox", fastify-type-provider-zod, "@fastify/under-pressure", "@fastify/reply-from", close-with-grace, pino-http, hono, "@hono/node-server", "@hono/zod-validator", express]
version: 5.12.5
researched: 2026-09-19
sources:
  [
    https://fastify.dev/docs/latest/Reference/Request/,
    https://fastify.dev/docs/latest/Reference/Server/,
    https://fastify.dev/docs/latest/Reference/Hooks/,
    https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/,
    https://fastify.dev/docs/latest/Reference/Type-Providers/,
    https://fastify.dev/docs/latest/Guides/Testing/,
    https://hono.dev/docs/guides/validation,
    https://hono.dev/docs/helpers/streaming,
    https://expressjs.com/en/guide/migrating-5.html,
  ]
---

# Fastify 5.12.5 (HTTP framework decision: Fastify vs Hono vs Express 5)

## Summary

The wechart API is the only thing that may hold Cube credentials (AC-164) and is the sole data path for the browser (AC-007). It must hold requests open across Cube "Continue wait" polls (AC-010), propagate client disconnect into an upstream cancel (AC-011), and log per-query Cube request/duration/acceleration (AC-016), plus run driver connection tests with real error text (AC-159). Recommendation: **Fastify 5.12.5**. It is the only candidate of the three that ships a documented per-request `AbortSignal`, a per-request structured logger with a request id, response-schema serialization that drops undeclared fields, socket-free request injection, and documented graceful-shutdown semantics — i.e. AC-010/011/016/164 are framework primitives rather than assembly.

## Install

```bash
pnpm add fastify@5.12.5 @fastify/under-pressure@9.2.0 close-with-grace@2.5.0
# schemas + typed routes, pick one:
pnpm add @fastify/type-provider-typebox@6.1.0 @sinclair/typebox   # peer: typebox ^1.0.13
pnpm add fastify-type-provider-zod@7.0.0 zod                      # peers: fastify ^5.5.0, zod >=4.1.5, @fastify/swagger >=9.5.1, openapi-types ^12.1.3
# only if we proxy Cube responses byte-for-byte:
pnpm add @fastify/reply-from@12.6.5
```

All MIT ([fastify](https://registry.npmjs.org/fastify/latest), [type-provider-typebox](https://registry.npmjs.org/@fastify/type-provider-typebox/latest), [fastify-type-provider-zod](https://registry.npmjs.org/fastify-type-provider-zod/latest), [under-pressure](https://registry.npmjs.org/@fastify/under-pressure/latest), [close-with-grace](https://registry.npmjs.org/close-with-grace/latest), [reply-from](https://registry.npmjs.org/@fastify/reply-from/latest)). Fastify 5.12.5 was published 2026-09-16 ([releases API](https://api.github.com/repos/fastify/fastify/releases?per_page=4)); it bundles pino, ajv-compiler, fast-json-stringify and light-my-request as direct deps ([npm](https://registry.npmjs.org/fastify/latest)). No `engines` field at the v5.12.5 tag ([package.json](https://raw.githubusercontent.com/fastify/fastify/v5.12.5/package.json)); its own CI matrix is `node-version: [20, 22, 24, 26]` on macOS/Ubuntu/Windows ([v5.12.5 ci.yml](https://raw.githubusercontent.com/fastify/fastify/v5.12.5/.github/workflows/ci.yml)) — that is the Node 26 evidence.

## Init / auth pattern

```ts
import Fastify from 'fastify';
import closeWithGrace from 'close-with-grace';

const app = Fastify({
  logger: { level: 'info', redact: ['req.headers.authorization', 'cubeApiSecret'] },
  requestIdHeader: 'x-request-id', // default false; set true -> 'request-id'
  genReqId: () => crypto.randomUUID(),
  bodyLimit: 1_048_576, // default 1 MiB
  requestTimeout: 30_000, // default 0 = disabled; docs recommend non-zero
  disableRequestLogging: false,
});
await app.listen({ port: 3000, host: '0.0.0.0' }); // 0.0.0.0 required for k8s probes
closeWithGrace({ delay: 10_000 }, async () => {
  await app.close();
});
```

Option names/defaults: [Server reference](https://fastify.dev/docs/latest/Reference/Server/). `host: '0.0.0.0'` is mandatory under Kubernetes: the default readiness probe uses the pod IP while Fastify binds `127.0.0.1`, so probes are unreachable otherwise ([Recommendations guide](https://fastify.dev/docs/latest/Guides/Recommendations/)). Cube credentials stay in process env / metadata DB and are never placed in a response schema (see AC-164 below).

## API surface we will use

**`request.signal` — AC-011.** Documented as "An `AbortSignal` that aborts when the handler timeout fires or the client disconnects" ([Request reference, v5.12.5 tag](https://raw.githubusercontent.com/fastify/fastify/v5.12.5/docs/Reference/Request.md)). Pass it straight to `undici`/`fetch` for the upstream Cube call:

```ts
app.post('/api/query', async (request, reply) => {
  const res = await fetch(cubeUrl, {
    signal: request.signal,
    headers: { authorization: cubeToken },
  });
  return res.json();
});
```

**`onRequestAbort` hook — AC-011 side effects.** `fastify.addHook('onRequestAbort', async (request) => {...})`, "executed when a client closes the connection before the entire request has been processed"; it runs after disconnect so nothing can be written to the client ([Hooks reference](https://fastify.dev/docs/latest/Reference/Hooks/)). The lower-level fallback is `request.raw.on('close')` + `request.raw.aborted` ([Detecting When Clients Abort](https://fastify.dev/docs/latest/Guides/Detecting-When-Clients-Abort.md)).

**Logging — AC-016.** Logger is pino; each request gets a child logger `request.log` carrying request context, and `request.id` comes from `requestIdHeader` if present else an incremental id, overridable with `genReqId`; pino `redact` masks named paths ([Logging reference](https://fastify.dev/docs/latest/Reference/Logging/)). Duration: `reply.elapsedTime` "invokes the custom response time getter to calculate the amount of time passed since the request was received by Fastify" ([Reply reference](https://fastify.dev/docs/latest/Reference/Reply/)). So the AC-016 record (Cube request body, duration, accelerated flag) is `request.log.info({ reqId: request.id, cubeQuery, ms: reply.elapsedTime, accelerated })` in an `onResponse` hook.

**Validation + typed routes — AC-159/AC-164.** Schemas attach per route for `body`, `querystring`/`query`, `params`, `headers`, validated by Ajv v8 with `coerceTypes: 'array'`, `useDefaults: true`, `removeAdditional: true` ([Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)). Typed inference via `app.withTypeProvider<TypeBoxTypeProvider>()` or `<ZodTypeProvider>` ([Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)).

**Response serialization — AC-164.** With a `response` schema, fast-json-stringify serializes: "If _additionalProperties_ is not present or is set to `false`, every property that is not explicitly listed in the _properties_ and _patternProperties_ objects will be ignored" ([fast-json-stringify README](https://github.com/fastify/fast-json-stringify#readme)), and Fastify states an output schema "can drastically increase throughput and help prevent accidental disclosure of sensitive information" ([Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)). A connection-test route whose response schema omits `password`/`secret` cannot leak it even if the handler returns the whole row.

**Streaming / large payloads — AC-010.** `reply.send(stream)` accepts Node streams and web `ReadableStream`; both are "considered to be pre-serialized, so they will be sent unmodified without response validation" ([Reply reference](https://fastify.dev/docs/latest/Reference/Reply/)). `reply.hijack()` stops Fastify from sending and hands over `reply.raw`. For a straight pass-through of Cube responses, `@fastify/reply-from` "forward[s] your HTTP request to another server" ([npm](https://registry.npmjs.org/@fastify/reply-from/latest)).

**Health / shutdown — k8s.** `@fastify/under-pressure` 9.2.0 exposes a `/status` route via `exposeStatusRoute` returning `{ status: 'ok' }`, runs an async `healthCheck` (periodically or per request), and returns Service Unavailable past `maxEventLoopDelay`/`maxHeapUsedBytes`/`maxRssBytes`/`maxEventLoopUtilization` ([under-pressure README](https://github.com/fastify/under-pressure#readme)). `fastify.close()` marks the server closing (new requests get `Connection: close`), runs `preClose`, drains per `forceCloseConnections` (default `"idle"`), stops accepting connections, then runs `onClose`; `return503OnClosing` defaults `true` so in-flight load balancers back off ([Server reference](https://fastify.dev/docs/latest/Reference/Server/)).

**Testing — Vitest.** `fastify.inject({ method, url, query, payload, headers, cookies })` returns a promise; it is built on light-my-request, which "injects a fake HTTP request/response into a node HTTP server… Does not use a socket connection so can be run against an inactive server (server not in listen mode)" ([Testing guide](https://fastify.dev/docs/latest/Guides/Testing/), [light-my-request README](https://github.com/fastify/light-my-request#readme)). Fastify docs state it "is compatible with most testing frameworks"; examples use the Node test runner ([Testing guide](https://fastify.dev/docs/latest/Guides/Testing/)). Because `inject` is a plain promise-returning call with no port binding, the same assertions run unchanged under Vitest.

## Gotchas

- **Fastify 6 is in alpha** (`v6.0.0-alpha.4`, 2026-09-17) ([releases API](https://api.github.com/repos/fastify/fastify/releases?per_page=4)); the `main`-branch LTS table already lists a v6 row with Node "24, 26" ([main LTS.md](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md)). Pin `fastify@5.12.5` and treat v6 as a later migration.
- **Stale LTS doc at the tag**: `docs/Reference/LTS.md` at v5.12.5 still says v5 supports Node "20, 22" ([v5.12.5 LTS.md](https://raw.githubusercontent.com/fastify/fastify/v5.12.5/docs/Reference/LTS.md)) while the same tag's CI runs Node 26. Trust the CI matrix; re-check when v6 ships.
- **Abort detection is not absolute**: the guide warns detection "will not trigger in the event of internet disruption", `aborted` is deprecated while `destroyed` is ambiguous, and false positives are possible ([Detecting When Clients Abort](https://fastify.dev/docs/latest/Guides/Detecting-When-Clients-Abort.md)). AC-011 must also be enforced client-side (supersede-by-token) and by a server-side query registry, not by disconnect alone.
- **Streams bypass response validation** ([Reply reference](https://fastify.dev/docs/latest/Reference/Reply/)) — so a streamed/proxied Cube response gets no schema redaction. Any route that could carry credentials (AC-164) must return objects with a `response` schema, never a stream.
- **Ajv `removeAdditional: true` is on by default** ([Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)): unknown body fields are silently dropped instead of rejected. Cube query bodies are deeply nested — model them exhaustively or the API will quietly discard members.
- `fastify-type-provider-zod@7.0.0` peers include `@fastify/swagger >=9.5.1` and `openapi-types` ([npm](https://registry.npmjs.org/fastify-type-provider-zod/latest)); TypeBox's provider has only a `typebox ^1.0.13` peer ([npm](https://registry.npmjs.org/@fastify/type-provider-typebox/latest)) and feeds Ajv/fast-json-stringify natively.
- `request.signal` aborts on _handler timeout as well as_ client disconnect ([Request reference](https://fastify.dev/docs/latest/Reference/Request/)) — with AC-010's long Cube waits, distinguish the two before logging a cancel.
- `bodyLimit` defaults to 1 MiB and `keepAliveTimeout` to 72 s; `connectionTimeout` and `requestTimeout` default to 0/disabled ([Server reference](https://fastify.dev/docs/latest/Reference/Server/)). Raise `bodyLimit` only for the routes that need it.
  - **Per route:** the route option `bodyLimit` "prevents the default JSON body parser from parsing request bodies larger than this number of bytes. Must be an integer. You may also set this option globally when first creating the Fastify instance… Defaults to `1048576` (1 MiB)" ([Routes reference](https://fastify.dev/docs/latest/Reference/Routes/), fetched 2026-09-21 for T069).
  - **Over the limit**, the error code is `FST_ERR_CTP_BODY_TOO_LARGE`, "The request body is larger than the provided limit" ([Errors reference](https://fastify.dev/docs/latest/Reference/Errors/)). The docs give no HTTP status for it, so wechart does not rely on one. Its own size checks return their own answer.
- Don't expose Node directly: Fastify "strongly considers" internet-facing Node an anti-pattern and assumes a reverse proxy; capacity guidance is ~2 vCPU per latency-sensitive instance, and multiple replicas rather than in-process cluster ([Recommendations](https://fastify.dev/docs/latest/Guides/Recommendations/)).

## Alternatives considered

**Hono 4.13.8** + `@hono/node-server 2.1.1` (both MIT; hono `engines` >= 16.9.0, node-server >= 20) ([hono npm](https://registry.npmjs.org/hono/latest), [node-server npm](https://registry.npmjs.org/@hono/node-server/latest)); very actively released (4.13.8 on 2026-09-15, [releases API](https://api.github.com/repos/honojs/hono/releases?per_page=4)).

- _Cancellation (AC-011)_: works, and is the cleanest API — `c.req.raw.signal`. The adapter's close handler calls `req[abortRequest]('Client connection prematurely closed.')` when `!outgoing.writableFinished` ([listener.ts](https://github.com/honojs/node-server/blob/main/src/listener.ts)) and `abortRequest` calls `abortController.abort(reason)` ([request.ts](https://github.com/honojs/node-server/blob/main/src/request.ts)). Note this is adapter source, not documented API — the Node adapter README documents no AbortSignal ([README](https://github.com/honojs/node-server#readme)), so it is behaviour we would depend on without a doc contract.
- _Logging (AC-016)_: the built-in logger prints method, path, status and elapsed time as **plain text, not structured JSON** ([logger middleware](https://hono.dev/docs/middleware/builtin/logger)); `hono/request-id` gives `c.get('requestId')` (default header `X-Request-Id`, `crypto.randomUUID()` generator) ([request-id middleware](https://hono.dev/docs/middleware/builtin/request-id)). Structured logs mean wiring pino ourselves.
- _Validation_: "a very thin Validator" over `json|query|param|header|form` with `c.req.valid()`, plus `@hono/zod-validator@0.9.1` (peers `hono >=4.11.2`, `zod ^3.25 || ^4`) ([validation guide](https://hono.dev/docs/guides/validation), [npm](https://registry.npmjs.org/@hono/zod-validator/latest)). **Input only — there is no response-side schema filtering**, so AC-164 gets no framework backstop.
- _Streaming_: `stream`/`streamText`/`streamSSE` with `stream.onAbort()`; note errors thrown mid-stream do not reach Hono's `onError` ([streaming helpers](https://hono.dev/docs/helpers/streaming)). Body size needs the explicit `bodyLimit` middleware ([body-limit](https://hono.dev/docs/middleware/builtin/body-limit)).
- _Node 26_: neither repo's CI includes it — hono core and node-server both test `20.x, 22.x, 24.x` ([hono ci.yml](https://github.com/honojs/hono/blob/main/.github/workflows/ci.yml), [node-server ci.yml](https://github.com/honojs/node-server/blob/main/.github/workflows/ci.yml)).

**Express 5.2.1** (MIT, `engines` >= 18, 30 runtime deps) ([npm](https://registry.npmjs.org/express/latest)). Its `master` CI does cover Node 18–26 ([ci.yml](https://github.com/expressjs/express/blob/master/.github/workflows/ci.yml)). v5 fixed the big one — "rejected promises in handlers/middleware automatically passed to the error handler" — alongside a long breaking-change list ([migration guide](https://expressjs.com/en/guide/migrating-5.html)). Against our ACs it is the weakest fit: no AbortSignal (only raw `req`/`res` `close` events), no built-in logger or request id (needs `pino-http@11.0.0`, which supplies `genReqId` and `responseTime` — [README](https://github.com/pinojs/pino-http#readme)), no validation layer at all, no response filtering, `res.json()` buffers the whole payload via `JSON.stringify()` ([res.json](https://expressjs.com/en/5x/api/response/)) which is poor for tens-of-megabyte Cube results, `express.json()` defaults to a 100 kb limit ([body-parser](https://expressjs.com/en/resources/middleware/body-parser.html)), health checks and graceful shutdown are explicitly left to the developer ([health/shutdown guide](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)), and tests need supertest, which binds "an ephemeral port" ([supertest README](https://github.com/ladjs/supertest#readme)) — a real socket per test. Release cadence on the 5.x line is also slow: 5.2.1 shipped 2025-12-01 while the most recent release overall was 4.22.2 on 2026-05-11 ([releases API](https://api.github.com/repos/expressjs/express/releases?per_page=4)).

**Decision.** Fastify: pinned release tests Node 26; `request.signal` + `onRequestAbort` cover AC-011 as documented API; pino child logger + `request.id` + `reply.elapsedTime` cover AC-016 without extra middleware; response-schema serialization gives AC-164 a structural guarantee that neither Hono nor Express offers; documented close/drain semantics and `under-pressure` cover k8s rollout; socket-free `inject` keeps AC tests hermetic under Vitest. Hono is the runner-up and would be reconsidered if we ever need edge/non-Node runtimes.

## Open questions / unverified

- UNVERIFIED: whether Node's own `server.requestTimeout` (non-zero by default in modern Node) still caps AC-010's long Cube waits when Fastify's `requestTimeout` option is left at 0. Fastify's Server reference documents its own defaults but not the interaction with Node's default; I read Server.md at `main` and the v5.12.5 tag and found no statement. Verify empirically with a >5 min handler on Node 26 before relying on it.
- UNVERIFIED: Hono's documented _default_ body size when `bodyLimit` middleware is absent — the middleware page states `maxSize` explicitly and only notes Bun's 128 MiB default ([body-limit](https://hono.dev/docs/middleware/builtin/body-limit)). Not decision-relevant given the recommendation.
- UNVERIFIED: graceful-shutdown semantics for `@hono/node-server` — its README documents `serve()` options (`port`, `fetch`, `createServer`, `serverOptions`, `overrideGlobalObjects`, `autoCleanupIncoming`, `websocket`) but no drain/close contract ([README](https://github.com/honojs/node-server#readme)).
- Open for the caller: does AC-010 want the wechart API to hold one HTTP request open for the whole Cube poll loop, or to stream progress (SSE) to the tile? Fastify supports both, but the choice changes whether response-schema redaction applies (streams bypass it).
