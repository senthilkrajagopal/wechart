---
library: MCP TypeScript SDK (v2 line), as installed
packages: ["@modelcontextprotocol/server", "@modelcontextprotocol/fastify", "@modelcontextprotocol/node", "@modelcontextprotocol/client"]
version: 2.3.1 (server, client), 2.0.1 (fastify), 2.1.1 (node)
researched: 2026-10-17
sources: [packages/api/node_modules/@modelcontextprotocol/fastify/dist/index.d.mts, packages/api/node_modules/@modelcontextprotocol/fastify/dist/index.mjs, packages/api/node_modules/@modelcontextprotocol/server/dist/index.mjs, packages/api/node_modules/@modelcontextprotocol/server/dist/mcp-DIH4cS6P.mjs]
---
# MCP SDK: notes and corrections from the installed packages

Corrections to `mcp-typescript-sdk.md`, read from the published packages as pnpm installed them (lane MCP, T775 on). Each note names the file it was read from.

## `@modelcontextprotocol/fastify` 2.0.1

1. **An Origin hook exists.** `mcp-typescript-sdk.md` says "No Fastify-native Origin hook was found … (UNVERIFIED that none exists)". The package exports `originValidation(allowedOriginHostnames: string[])` and `localhostOriginValidation()` (`dist/index.d.mts`, "src/middleware/originValidation.d.ts").
   - A request with no `Origin` passes. A present `Origin` whose hostname isn't listed, or that can't be parsed, is answered `403` (the declaration's comment, and `dist/index.mjs`).
   - It compares the hostname alone: "port-agnostic, hostnames only — the same convention as `allowedHosts`" (`CreateMcpFastifyAppOptions.allowedOrigins`). The scheme isn't compared for `http:` and `https:`; an empty `Origin` passes as a missing one does (`validateOriginHeader` in `@modelcontextprotocol/server`'s `dist/index.mjs`).
2. **Both hooks answer the same way.** `hostHeaderValidation` and `originValidation` are `onRequest` hooks that, on a refusal, `await reply.code(403).send({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })` (`dist/index.mjs`). The checks themselves are `validateHostHeader` and `validateOriginHeader` from `@modelcontextprotocol/server`.
3. **`hostHeaderValidation` compares the `Host` hostname, port left out** (`dist/index.d.mts`: "Validates `Host` header hostname (port-agnostic) against an allowed list").

## `@modelcontextprotocol/server` 2.3.1: the bearer helpers (T776)

Read from `dist/mcp-DIH4cS6P.mjs` (`verifyBearerToken`, `bearerAuthChallengeResponse`, `buildWwwAuthenticateHeader`) and `dist/createMcpHandler-D4NN8WsG.d.mts` (`AuthInfo`).

4. **`verifyBearerToken(header, { verifier })`**, in order:
   - no header: `OAuthError(invalid_token, "Missing Authorization header")`;
   - `header.split(" ")` whose first part isn't `bearer` (any case), or with no second part: `invalid_token`, "Invalid Authorization header format, expected 'Bearer TOKEN'";
   - then `verifier.verifyAccessToken(token)`, then `expectedResource` and `requiredScopes` if given;
   - then `expiresAt` must be a number (seconds) and not before `Date.now() / 1000`, or `invalid_token` ("Token has no expiration time", "Token has expired"). The clock is the real one, not an injected one.
5. **`bearerAuthChallengeResponse(error)`** returns a web `Response`: 401 with `WWW-Authenticate: Bearer error="invalid_token", error_description="‹message›"` for `invalid_token`; 403 with the same shape for `insufficient_scope`; 500 for `server_error` or any value that isn't an `OAuthError`; 400 otherwise. `, scope="…"` and `, resource_metadata="…"` are added when given. The body is the OAuth error JSON (`{ error, error_description }`).
6. **`AuthInfo`** is `{ token, clientId, scopes, expiresAt?, resource?, resourceMetadataUrl?, extra? }`, with `extra: Record<string, unknown>`.
7. **Exports:** `OAuthError`, `OAuthErrorCode`, `OAuthTokenVerifier` (a type), `AuthInfo` (a type), `verifyBearerToken` and `bearerAuthChallengeResponse` all come from the package's root (`dist/index.d.mts`).

## Serving and the client, `@modelcontextprotocol/server` 2.3.1, `/node` 2.1.1 and `/client` 2.3.1 (T778)

8. **`createMcpHandler(factory, { legacy?, onerror?, … })`.** The factory gets `{ era: 'legacy' | 'modern', authInfo?, requestInfo? }`. `legacy` defaults to `'stateless'`, which serves 2025-era requests from a fresh instance and answers their GET and DELETE with 405. `'reject'` serves 2026-07-28 alone (`dist/createMcpHandler-D4NN8WsG.d.mts`, `McpRequestContext` and `CreateMcpHandlerOptions`).
9. **`toNodeHandler(handler, { onerror })(req, res, parsedBody)`** passes `req.auth` to the handler as `authInfo` when it isn't `undefined`, and passes `parsedBody` when given (`@modelcontextprotocol/node`, `dist/index.mjs`, `toNodeHandler`).
   - **`reply.hijack()` works in front of it.** This was the research's open question. Fastify's own reply is hijacked, and the adapter writes to `reply.raw`. The SDK's client then completes a 2026-07-28 exchange and a 2025 `initialize` exchange through Fastify's `inject` (`packages/api/src/mcp/transport.test.ts`, observed 2026-10-17).
10. **`McpServer` options** take `instructions` and `capabilities`. A server with no tool registered, but `capabilities: { tools: {} }` declared, answers `tools/list` with an empty list for both eras (observed in the same test).
11. **The client (`@modelcontextprotocol/client`).** `new Client(info, { versionNegotiation: { mode: 'auto' } })` probes with `server/discover` and falls back to `initialize`. With no `versionNegotiation`, it runs the plain 2025 sequence. `getNegotiatedProtocolVersion()` and `getInstructions()` say what was agreed. `StreamableHTTPClientTransport(url, { fetch, requestInit })` takes a custom `fetch` and default request headers (`dist/index.d.mts`, the `ClientOptions` and transport options).

## `@modelcontextprotocol/server` 2.3.1: scope challenges (T785)

12. **A tool's `scopeChallenge`.** `registerTool`'s config takes `scopeChallenge: ScopeChallengeHandler`, `({ request, authInfo? }) => ScopeChallenge | undefined` (maybe a promise), where `ScopeChallenge` is `{ scopes: [string, ...string[]], errorDescription? }` (`dist/createMcpHandler-D4NN8WsG.d.mts`, "src/server/scopeChallenge.d.ts"). Read from `dist/mcp-DIH4cS6P.mjs` and `dist/index.mjs`:
   - For a `tools/call`, `McpServer.resolveScopeChallenge` calls the named, enabled tool's handler with the request's `authInfo`. A challenge returned is validated: at least one scope, each in OAuth's scope-token grammar, and `errorDescription` in RFC 6750's grammar (printable ASCII without `"` or `\`), or the handler's call throws `TypeError` (`validateScopeChallenge`).
   - The answer is `createScopeChallengeResponse`, which is `bearerAuthChallengeResponse(new OAuthError(insufficient_scope, errorDescription ?? "Insufficient scope"), { requiredScopes })`: 403 with `WWW-Authenticate: Bearer error="insufficient_scope", error_description="…", scope="…"` and the OAuth error JSON as its body (note 5). It is checked before the tool runs, on both the 2026-07-28 route (`createMcpHandler`'s per-request path) and the 2025 stateless fallback (`_checkScopeChallenge` in the HTTP transport).
   - The SDK's client then throws from `callTool`; the 403 is seen only on the HTTP answer (observed in `mcp/tools/workspace.test.ts`, 2026-10-18).
