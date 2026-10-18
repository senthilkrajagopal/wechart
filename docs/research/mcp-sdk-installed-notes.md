---
library: MCP TypeScript SDK (v2 line), as installed
packages: ["@modelcontextprotocol/server", "@modelcontextprotocol/fastify"]
version: 2.3.1 (server), 2.0.1 (fastify)
researched: 2026-10-17
sources: [packages/api/node_modules/@modelcontextprotocol/fastify/dist/index.d.mts, packages/api/node_modules/@modelcontextprotocol/fastify/dist/index.mjs, packages/api/node_modules/@modelcontextprotocol/server/dist/index.mjs]
---
# MCP SDK: notes and corrections from the installed packages

Corrections to `mcp-typescript-sdk.md`, read from the published packages as pnpm installed them (lane MCP, T775 on). Each note names the file it was read from.

## `@modelcontextprotocol/fastify` 2.0.1

1. **An Origin hook exists.** `mcp-typescript-sdk.md` says "No Fastify-native Origin hook was found … (UNVERIFIED that none exists)". The package exports `originValidation(allowedOriginHostnames: string[])` and `localhostOriginValidation()` (`dist/index.d.mts`, "src/middleware/originValidation.d.ts").
   - A request with no `Origin` passes. A present `Origin` whose hostname isn't listed, or that can't be parsed, is answered `403` (the declaration's comment, and `dist/index.mjs`).
   - It compares the hostname alone: "port-agnostic, hostnames only — the same convention as `allowedHosts`" (`CreateMcpFastifyAppOptions.allowedOrigins`). The scheme isn't compared for `http:` and `https:`; an empty `Origin` passes as a missing one does (`validateOriginHeader` in `@modelcontextprotocol/server`'s `dist/index.mjs`).
2. **Both hooks answer the same way.** `hostHeaderValidation` and `originValidation` are `onRequest` hooks that, on a refusal, `await reply.code(403).send({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })` (`dist/index.mjs`). The checks themselves are `validateHostHeader` and `validateOriginHeader` from `@modelcontextprotocol/server`.
3. **`hostHeaderValidation` compares the `Host` hostname, port left out** (`dist/index.d.mts`: "Validates `Host` header hostname (port-agnostic) against an allowed list").
