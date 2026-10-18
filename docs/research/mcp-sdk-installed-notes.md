---
library: MCP TypeScript SDK (v2 line), as installed
packages: ["@modelcontextprotocol/server", "@modelcontextprotocol/fastify"]
version: 2.3.1 (server), 2.0.1 (fastify)
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
