---
library: MCP TypeScript SDK (v2 line)
packages: ["@modelcontextprotocol/server", "@modelcontextprotocol/fastify", "@modelcontextprotocol/node", "@modelcontextprotocol/client"]
version: 2.3.1
researched: 2026-10-17
sources: [https://modelcontextprotocol.io/specification/2026-07-28, https://modelcontextprotocol.io/specification/2026-07-28/changelog, https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http, https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization, https://modelcontextprotocol.io/specification/2026-07-28/server/tools, https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices, https://ts.sdk.modelcontextprotocol.io/v2/, https://github.com/modelcontextprotocol/typescript-sdk, https://github.com/modelcontextprotocol/typescript-sdk/releases, https://registry.npmjs.org/@modelcontextprotocol/server/latest, https://registry.npmjs.org/@modelcontextprotocol/fastify/latest, https://registry.npmjs.org/@modelcontextprotocol/node/latest, https://registry.npmjs.org/@modelcontextprotocol/client/latest, https://code.claude.com/docs/en/mcp]
---
# MCP TypeScript SDK 2.3.1 (protocol revision 2026-07-28)

## Summary

**What it is.** The official TypeScript SDK for the Model Context Protocol. Its v2 line is split into separate packages:
- `@modelcontextprotocol/server` and `@modelcontextprotocol/client`, the core packages.
- Framework adapters: `@modelcontextprotocol/node`, `/express`, `/fastify` and `/hono` ([repo README][repo]).

**Current spec and v1 status.**
- The v2 `main` branch implements the **2026-07-28** revision, which is the current protocol version ([repo README][repo], [spec versioning][spec-ver]).
- `@modelcontextprotocol/sdk` (v1, latest 1.32.1, [npm][npm-sdk-v1]) is the legacy line. It gets bug and security fixes "for at least six months after v2's release (2026-07-27)" ([repo README][repo]).

**Why wechart would use it.** The user wants an MCP server that "lets claude code or other llms.. manage datasources, dashboards, cubes, approval and review flows and anything else that i missed out" (`docs/inputs/2026-10-17-mcp-server.md`). No feature or AC IDs exist for this yet: R78 is still to be interviewed. These spec features constrain the design:
- folder permissions by AD group (F25, F26);
- private workspaces (F29);
- proposals and approval (F30);
- the audit trail (F32);
- sealed credentials (`docs/research/credential-sealing.md`).

**Decisive findings**

1. **The 2026-07-28 revision is stateless.**
   - It removes the `initialize` handshake, protocol sessions and the `Mcp-Session-Id` header.
   - Every request carries its protocol version and client capabilities in `_meta` ([changelog][spec-changelog] items 1–2).
   - So the HTTP endpoint scales across API replicas with no sticky sessions ([SDK Fastify page][sdk-fastify]).
2. **Older clients still work through the default fallback.** `createMcpHandler` defaults to `legacy: 'stateless'`, which serves 2025-era clients (an `initialize` POST) from a fresh instance per request ([legacy clients][sdk-legacy]).
3. **The SDK has a Fastify adapter.**
   - `@modelcontextprotocol/fastify` 2.0.1 has peers `fastify ^5.2.0` and `@modelcontextprotocol/server ^2.3.0` ([npm][npm-fastify]).
   - wechart's `packages/api` pins `fastify` 5.12.5 (`/Users/srajagopal/Work/wechart/packages/api/package.json`), which satisfies that peer range.
4. **Entra ID cannot be used directly as the MCP authorization server by spec-conformant clients.**
   - Entra's tenant v2.0 discovery document has no `code_challenge_methods_supported`, no `registration_endpoint` and no `client_id_metadata_document_supported` ([Entra tenant metadata][entra-meta-tenant], [common metadata][entra-meta]).
   - The spec says that if `code_challenge_methods_supported` is absent from OIDC metadata, "MCP clients **MUST** refuse to proceed" ([authz security][spec-authz-sec]).
   - See Authorization below for the options.

## Install

Exact pins as of 2026-10-17:

| Package | Version | Node | Notes | Source |
|---|---|---|---|---|
| `@modelcontextprotocol/server` | 2.3.1 | `>=20` | ESM `type: module`; deps `zod ^4.2.0`, `@modelcontextprotocol/core 2.3.1`; Apache-2.0; exports `.`, `./stdio`, `./validators/ajv`, `./validators/cf-worker` | [npm][npm-server] |
| `@modelcontextprotocol/fastify` | 2.0.1 | `>=20` | no deps; peers `fastify ^5.2.0`, `@modelcontextprotocol/server ^2.3.0` | [npm][npm-fastify] |
| `@modelcontextprotocol/node` | 2.1.1 | `>=20` | deps `hono ^4.11.4`, `@hono/node-server ^1.19.9`; peer `@modelcontextprotocol/server ^2.3.0` | [npm][npm-node] |
| `@modelcontextprotocol/client` (tests only) | 2.3.1 | `>=20` | deps include `jose ^6.1.3`, `pkce-challenge`, `cross-spawn`, `eventsource` | [npm][npm-client] |
| `@modelcontextprotocol/inspector` (dev tool, run via `npx`) | 2.11.0 | `>=22.19.0` | built on client/server/core 2.3.1 | [npm][npm-inspector] |

```sh
pnpm --filter @wechart/api add @modelcontextprotocol/server@2.3.1 @modelcontextprotocol/fastify@2.0.1 @modelcontextprotocol/node@2.1.1
pnpm --filter @wechart/api add -D @modelcontextprotocol/client@2.3.1
```

The filter name `@wechart/api` is an assumption; use the real workspace name.

**Runtime notes**
- v2 "requires Node.js 20+". It is ESM-first and also ships a CommonJS build ([migration guide via llms-full][sdk-llms]). Node 26 meets `>=20`, and the published engines field has no upper bound ([npm][npm-server]). No test against Node 26 specifically was found (UNVERIFIED).
- **zod.** Schemas import from `zod/v4` ([migration][sdk-migrate]). The SDK troubleshooting page recommends forcing one zod version with `overrides` when a transitive dependency pins another copy ([troubleshooting][sdk-trouble]).
  - wechart already researched `zod@4.6.5` (`/Users/srajagopal/Work/wechart/docs/research/supporting-utilities.md`), which satisfies `^4.2.0`.
- **hono.** `hono` and `@hono/node-server` arrive transitively through `@modelcontextprotocol/node` ([npm][npm-node]). Both are already covered by `/Users/srajagopal/Work/wechart/docs/research/api-framework.md`.

## Init / auth pattern

### Mounting in the existing Fastify app (`packages/api`)

The documented pattern has three steps ([SDK Fastify][sdk-fastify]):
1. Build a web-standard handler from a **per-request server factory** with `createMcpHandler`.
2. Adapt it to Node with `toNodeHandler`.
3. Route `ALL /mcp` to it, passing Fastify's already-parsed `request.body` as the third argument.

Auth is attached to the raw request as `auth`, and tools read it as `ctx.http.authInfo` ([SDK Fastify][sdk-fastify]).

```ts
import { createMcpHandler, McpServer, verifyBearerToken, bearerAuthChallengeResponse,
         getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server';
import { hostHeaderValidation } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const mcpUrl = new URL(process.env.WECHART_PUBLIC_ORIGIN + '/mcp');
const handler = createMcpHandler(({ authInfo }) => {          // fresh instance per request
  const server = new McpServer({ name: 'wechart', version: APP_VERSION });
  registerWechartTools(server, authInfo);                     // may register per-caller tool set
  return server;
});
const node = toNodeHandler(handler, { onerror: e => app.log.error(e) });

app.addHook('onRequest', hostHeaderValidation([publicHostname])); // scope to the /mcp plugin
app.all('/mcp', async (request, reply) => {
  const auth = await verifyAccessToken(request.headers.authorization); // see Authorization
  reply.hijack();
  return node(Object.assign(request.raw, { auth }), reply.raw, request.body);
});
```

Each element above is sourced as follows. The `reply.hijack()` line is not from the SDK docs; see the Gotchas list.
- The `createMcpHandler(factory, options?)` return value and its mounting through `toNodeHandler` for Fastify come from the [createMcpHandler API][sdk-handler-api].
- The factory receives `era`, `authInfo` and `requestInfo` ([HTTP serving][sdk-http]).
- `toNodeHandler(handler, { onerror })` is documented in the [toNodeHandler API][sdk-tonode].
- `hostHeaderValidation(allowedHostnames)` is a Fastify `onRequest` hook that checks the `Host` hostname, ignoring the port ([hostHeaderValidation API][sdk-hosthdr]).
- `createMcpFastifyApp()` arms that hook automatically, but only when the bind host is localhost. For a non-localhost bind you pass `allowedHosts` ([fastify API][sdk-fastify-api], [SDK Fastify][sdk-fastify]).
- wechart already has its own Fastify instance rather than one from `createMcpFastifyApp`, so it must add the Host check itself.
- "The handler validates no `Host` or `Origin` header and verifies no token — mount both checks in front of it" ([HTTP serving][sdk-http]).
- The spec says servers "**MUST** validate the `Origin` header on all incoming connections" and return 403 when it is present and invalid ([Streamable HTTP][spec-http]). The web-standard helpers are `originValidationResponse` and `hostHeaderValidationResponse` from `@modelcontextprotocol/server` ([createMcpHandler API][sdk-handler-api]). No Fastify-native Origin hook was found in the `@modelcontextprotocol/fastify` reference (UNVERIFIED that none exists).

**Separate process instead.** The same handler can run in its own Fastify app built with `createMcpFastifyApp({ host: '0.0.0.0', allowedHosts: [...] })` ([SDK Fastify][sdk-fastify]). Each request gets a fresh server instance, which "naturally scales horizontally" ([SDK Fastify][sdk-fastify]). Choosing in-process or separate is a design decision for wechart. The SDK supports both.

**Shutdown.** Call `handler.close()` to abort in-flight exchanges ([HTTP serving][sdk-http]).

### Transports and client support

**What the 2026-07-28 Streamable HTTP transport requires** ([Streamable HTTP][spec-http]):
- One MCP endpoint that accepts POST, with one JSON-RPC request per POST.
- The response is either `application/json` or a request-scoped SSE stream.
- GET and DELETE should be answered with `405`.
- Every POST carries `MCP-Protocol-Version`, `Mcp-Method` and, for `tools/call`, `resources/read` and `prompts/get`, `Mcp-Name`. The server must reject header/body mismatches with `400` and `-32020 HeaderMismatch`.
- Servers "**SHOULD** include the `X-Accel-Buffering: no` header" on SSE streams so proxies don't buffer.
- `Last-Event-ID` resumption is gone: a broken stream loses the in-flight request.

**stdio.**
- Spec: stdio implementations "**SHOULD NOT**" follow the HTTP authorization spec and should "retrieve credentials from the environment" instead ([authz][spec-authz]).
- SDK: stdio uses `serveStdio` from `@modelcontextprotocol/server/stdio`, and stdout is the protocol channel, so log with `console.error` ([troubleshooting][sdk-trouble]).

**Remote support by client:**

| Client | Remote transport | Auth options | Source |
|---|---|---|---|
| Claude Code | `--transport http` (recommended for remote); SSE deprecated; stdio for local | OAuth via `/mcp`, with RFC 9728 discovery then RFC 8414 fallback; DCR and CIMD discovered automatically; pre-configured `--client-id` / `--client-secret` / `--callback-port` (redirect `http://localhost:PORT/callback`); `oauth.scopes`; `oauth.authServerMetadataUrl` override (https only); static `--header "Authorization: Bearer …"`; `headersHelper` script | [Claude Code MCP][cc-mcp] |
| Claude Code protocol | Two runtimes: SDK 1.x, and SDK 2.0 (2026-07-28). `MCP_PROTOCOL_NEGOTIATION=auto` is the default from v2.1.232 | | [Claude Code MCP][cc-mcp] |
| Claude.ai / Claude Desktop / Cowork custom connectors | remote MCP, connected **from Anthropic's cloud**; the server "must be reachable over the public internet from Anthropic's IP ranges" | OAuth with "Claude's published identity", "Register automatically", or "Use your own OAuth client"; or "fixed credentials such as API keys that Claude sends on every request" | [Claude connectors][claude-connectors] |
| Cursor | stdio, SSE, Streamable HTTP | `headers`; OAuth via DCR, or static client ID/secret with redirect `http://localhost:8787/callback` (desktop) | [Cursor][cursor-mcp] |
| VS Code | stdio, http, sse | `headers` with `promptString` `password: true` inputs; "When `oauth` is configured, VS Code handles the OAuth flow automatically" (DCR/CIMD details not documented on the page fetched) | [VS Code config ref][vscode-ref], [VS Code MCP][vscode-mcp] |
| ChatGPT (Apps SDK) | Streamable HTTP at a stable, publicly reachable HTTPS URL | OAuth only, via CIMD or DCR; S256 PKCE must be advertised. ChatGPT "can[not] present custom API keys" and supports no client-credentials grant | [OpenAI auth][oai-auth], [OpenAI server][oai-server] |

### Sessions and replicas

- Under 2026-07-28 a "session" exists only in the hand-wired 2025-era transport. The new revision "is per-request and has no `Mcp-Session-Id`" ([sessions][sdk-sessions]).
- The per-request factory needs no shared store for request/response traffic ([SDK Fastify][sdk-fastify]).
- **One exception: `subscriptions/listen`.** These long-lived change-notification streams need a shared `ServerEventBus`, for example Redis pub/sub, passed as `createMcpHandler(buildServer, { bus })` ([sessions][sdk-sessions]). They are only needed if wechart emits `list_changed` or resource-update notifications.
- **Cross-call state.** The spec's guidance is explicit, server-minted handles passed as tool arguments ([spec tools: Stateful Tools][spec-tools]). Servers "**MUST NOT** treat possession of a state handle as authentication" and "**SHOULD** bind handles server-side to the authenticated user" ([security BP][spec-bp]).

## API surface we will use

### `McpServer.registerTool(name, config, cb): RegisteredTool`

Config fields ([McpServer API][sdk-mcp-api]):
- `title`, `description`, `icons`, `_meta`;
- `inputSchema` and `outputSchema`, which accept zod v4, Standard Schema (ArkType, Valibot) or raw JSON Schema through `fromJsonSchema()` ([schema libraries][sdk-schema], [migration][sdk-migrate]);
- `annotations`: `{ title?, readOnlyHint? (default false), destructiveHint? (default true), idempotentHint? (default false), openWorldHint? (default true) }`;
- `scopeChallenge`, a per-tool handler that triggers `403 insufficient_scope` ([McpServer API][sdk-mcp-api], [SDK authz][sdk-auth]).

The raw-shape form (`{ field: z.string() }`) is deprecated; wrap it in `z.object()` ([McpServer API][sdk-mcp-api]).

**Callback.**
- The callback receives `(args, ctx)`. A tool with no input schema receives `(ctx)` only: "v2 passes (ctx), not (extra)" ([migration][sdk-migrate]).
- `ctx.http?.authInfo` holds the verified `AuthInfo`. `ctx.http` is `undefined` over stdio ([SDK authz][sdk-auth]).

**Result handling.**
- Arguments that fail the schema return an `isError: true` tool result and the handler never runs ([tools][sdk-tools]).
- When `outputSchema` is set, the SDK validates `structuredContent` before it is sent ([tools][sdk-tools]).
- The spec says a tool with structured content "SHOULD also return the serialized JSON in a TextContent block" ([spec tools][spec-tools]).
- The `maxToolInputElements` constructor option caps the combined array elements and object members per call. It is unlimited by default and was added in 2.3.0 ([tools][sdk-tools], [releases][rel]).

```ts
server.registerTool('dashboard.archive', {
  title: 'Archive a dashboard',
  description: '…',
  inputSchema: z.object({ dashboardId: z.string() }),
  outputSchema: z.object({ proposalId: z.string() }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ dashboardId }, ctx) => {
  const out = await ops.archive(userFrom(ctx.http?.authInfo), dashboardId);
  return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
});
```

The pattern follows [tools][sdk-tools]. The wechart names in it are placeholders.

**Spec rules for tools** ([spec tools][spec-tools]):
- Tool names should be 1–128 characters of `A-Z a-z 0-9 _ - .`.
- `tools/list` "**MAY** vary by the authorization presented on the request" but "**MUST NOT** vary per-connection".
- Servers "**SHOULD** return tools in a deterministic order".
- The factory receives `authInfo`, "so it can register a different tool set per caller" ([SDK authz via llms-full][sdk-llms]).

### Resources and prompts

- **Resources.** `registerResource(name, uriOrTemplate, config, readCallback)`. Pass a static URI string or a `ResourceTemplate('scheme://{var}', { list, complete })` ([McpServer API][sdk-mcp-api], [resources][sdk-resources]).
- **Prompts.** `registerPrompt(name, { title, argsSchema }, cb)`. Arguments can be wrapped in `completable()` for autocompletion ([completable API][sdk-completable]).
- Whether `readCallback` also receives `ctx` with `authInfo` is not shown in the fetched docs (UNVERIFIED). The factory-level `authInfo` is documented ([HTTP serving][sdk-http]).

### Confirmation inside a tool (multi round-trip requests)

- A handler can return `inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema }) } })`. On the retry it reads the answer with `acceptedContent(ctx.mcpReq.inputResponses, 'confirm', schema)` ([input required][sdk-input]).
- Treat `ctx.mcpReq.inputResponses` as untrusted ([input required][sdk-input] / Context7 excerpt).
- `requestState` is HMAC-SHA256-signed but **not encrypted**. Protect it with `createRequestStateCodec({ key, ttlSeconds })` and `new McpServer(…, { requestState: { verify } })`. Do not put secrets in it ([input required][sdk-input]).
- If the client hasn't declared the elicitation capability, the call is rejected with `-32021` ([input required][sdk-input]).
- Pre-2026 clients are served by a built-in legacy shim, which is on by default ([input required][sdk-input]).
- Claude Code exposes `Elicitation` and `ElicitationResult` hook events "When an MCP server requests user input during a tool call" ([Claude Code hooks][cc-hooks]).
- Cursor lists Elicitation as supported ([Cursor][cursor-mcp]).

### Auth helpers (resource-server side)

From `@modelcontextprotocol/server`, which is runtime-neutral ([migration][sdk-migrate]):
- `verifyBearerToken(header, { verifier, requiredScopes?, resourceMetadataUrl? })` returns `Promise<AuthInfo>`. It rejects tokens without `expiresAt` or past it, and throws `OAuthError` ([bearerAuth API][sdk-bearer-api]).
- `bearerAuthChallengeResponse` turns that error into the 401/403 response with `WWW-Authenticate` ([bearerAuth API][sdk-bearer-api]).
- `expectedResource`, added in 2.3.0, validates the token audience ([releases][rel]).
- `buildOAuthProtectedResourceMetadata(options)` and `oauthMetadataResponse` build and serve the RFC 9728 document. The builder requires an HTTPS issuer outside localhost ([PRM API][sdk-prm-api]). `getOAuthProtectedResourceMetadataUrl(mcpUrl)` gives `/.well-known/oauth-protected-resource/mcp` ([SDK authz][sdk-auth]).
- `OAuthTokenVerifier { verifyAccessToken(token): Promise<AuthInfo> }`. Throw `OAuthError` with `InvalidToken` to reject. It must populate `expiresAt` ([verifier API][sdk-verifier-api]).
- `AuthInfo` fields: `token`, `clientId`, `scopes`, `expiresAt?`, `resource?` (must match the server's resource), `resourceMetadataUrl?`, `extra?` ([AuthInfo][sdk-authinfo]).

The authorization-server helpers (`mcpAuthRouter`, `ProxyOAuthServerProvider` and others) moved to `@modelcontextprotocol/server-legacy/auth`. That package is "deprecated, frozen v1 copy; migrate AS to a dedicated IdP/OAuth library" ([migration][sdk-migrate]).

### Authorization (spec 2026-07-28)

**Resource-server duties** ([authz][spec-authz], [authz security][spec-authz-sec]):
- Implement RFC 9728 protected resource metadata, whose `authorization_servers` lists at least one AS.
- Return `401` with `WWW-Authenticate: Bearer resource_metadata=…` and optionally `scope=…`.
- Validate that tokens "were issued specifically for them as the intended audience".
- Return `403 insufficient_scope` for missing scope.
- Never accept or pass through other tokens.
- Accept tokens only in the `Authorization` header, never in the query string.

**Client duties** ([authz security][spec-authz-sec]):
- PKCE with S256 is mandatory.
- Clients must verify PKCE support from metadata. If `code_challenge_methods_supported` is absent, the client **MUST** refuse.
- The RFC 8707 `resource` parameter is required on authorize and token requests.
- Clients must validate RFC 9207 `iss` when present ([authz][spec-authz]).

**Discovery** ([AS discovery][spec-disc]):
- For an issuer with a path, clients try `/.well-known/oauth-authorization-server/<path>`, then `/.well-known/openid-configuration/<path>`, then `<issuer>/.well-known/openid-configuration`.
- The metadata `issuer` must exactly equal the issuer used to build the URL.

**Client registration priority** ([client registration][spec-reg]):
1. pre-registered client;
2. CIMD, when `client_id_metadata_document_supported` is set;
3. DCR, when `registration_endpoint` is present (DCR is deprecated);
4. prompting the user.

**Dex in development.**
- Dex 2.45.1 advertises `code_challenge_methods_supported` (S256, plain) ([wechart Dex research][dex-doc]).
- Its discovery key list has no `registration_endpoint` ([wechart Dex research][dex-doc]), so clients would need pre-registered static clients.
- Dex allows `http://localhost…` redirects for a public client with no registered URIs ([wechart Dex research][dex-doc]).
- Whether Dex honours the RFC 8707 `resource` parameter, and what `aud` its access tokens carry: UNVERIFIED. Not covered in `docs/research/dex.md` and not fetched.

**Microsoft Entra ID in production.**
- **Metadata.** The tenant metadata lacks `code_challenge_methods_supported`, `registration_endpoint`, `client_id_metadata_document_supported` and `authorization_response_iss_parameter_supported` ([tenant metadata][entra-meta-tenant]).
- **PKCE.** Entra does support PKCE "both `plain` and `S256`"; it just doesn't advertise it ([Entra auth code][entra-authcode]).
- **Audience.** The v2.0 authorize and token parameter tables list `scope` and no `resource` parameter. The audience is chosen by the scope's resource, and token-leg scopes "must all be from a single resource" ([Entra auth code][entra-authcode]).
- **Token validation.** Web APIs "must only accept tokens containing one of their AppId URIs as the `aud` claim" ([Entra access tokens][entra-at]). Use a tenant-specific issuer: `common` metadata has a `{tenantid}` placeholder issuer ([Entra access tokens][entra-at]). wechart's openid-client research already notes this ([openid-client research][oc-doc]).
- **Redirects.** Localhost redirect ports are ignored when matching ([Entra reply URLs][entra-reply]), which suits CLI loopback callbacks.

**Consequences.** Three options follow from the sources. Choosing between them is a design decision for the user.
- **A. Entra (and Dex) as the AS, with pre-registered clients.**
  - Works only with clients that accept pre-registered credentials and don't enforce the `code_challenge_methods_supported` check.
  - For Claude Code, whether it refuses Entra metadata over that field is UNVERIFIED.
  - ChatGPT is excluded, because it needs CIMD or DCR ([OpenAI auth][oai-auth]).
- **B. A wechart-hosted OAuth authorization server as a facade.**
  - It federates sign-in to Dex/Entra (wechart's existing OIDC login), advertises S256 and CIMD and/or DCR, and mints tokens whose `aud` is wechart's `/mcp` URL.
  - The SDK no longer ships a maintained AS ([migration][sdk-migrate]), so this needs its own library research. Candidates such as `oidc-provider` are not researched here.
  - Per the confused-deputy guidance, an MCP server that proxies to a third-party AS with a static client ID "**MUST** implement per-client consent" ([security BP][spec-bp]).
- **C. Personal access tokens minted by wechart for the signed-in user.**
  - Claude Code (`--header`, `headersHelper`), Cursor (`headers`), VS Code (`headers` + password inputs) and Claude.ai connectors ("fixed credentials such as API keys") support them ([cc-mcp][cc-mcp], [Cursor][cursor-mcp], [VS Code ref][vscode-ref], [Claude connectors][claude-connectors]).
  - ChatGPT does not ([OpenAI auth][oai-auth]).
  - Authorization is "**OPTIONAL**" in the spec ([authz][spec-authz]), so a PAT scheme sits outside the spec's OAuth flow rather than violating it.

**Acting strictly as the signed-in user.**
- Map the verified token to a wechart user, for example Entra `oid`/`tid`, and resolve AD groups the same way the web sign-in does.
- Call wechart's existing business operations in-process with that identity. Never forward the inbound token to another service: "The MCP server **MUST NOT** pass through the token it received from the MCP client" ([authz security][spec-authz-sec]).
- `tools/list` may be filtered by the caller's authorization ([spec tools][spec-tools]).

### Testing

**In-process (2026-07-28).** Point the client transport at the handler's `fetch`; no socket is opened ([testing][sdk-testing]):

```ts
const handler = createMcpHandler(createServer);
const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),
  { fetch: (url, init) => handler.fetch(new Request(url, init)) });
const client = new Client({ name: 'test-harness', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(transport);
const r = await client.callTool({ name: 'apply-discount', arguments: { price: 80, percent: 25 } });
// afterEach: await client.close(); await handler.close();
```

- Handler failures come back as `isError: true` results, not as thrown errors ([testing][sdk-testing]).
- To test auth, `handler.fetch(request, { authInfo })` injects `AuthInfo` ([HTTP serving][sdk-http]).
- `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/client` "connects 2025-era instances only". It is useful for testing the legacy fallback path ([testing][sdk-testing]).

**MCP Inspector** ([Inspector docs][inspector-docs]):
- Run `npx @modelcontextprotocol/inspector`. It has web, `--cli` and `--tui` modes and needs Node ≥22.19.0.
- For a remote server: `--server-url https://…/mcp --transport http`.
- CLI example: `--cli <url> --transport http --method tools/call --tool-name … --tool-arg k=v --format json`.
- It negotiates legacy versus 2026-07-28.
- It stores OAuth tokens in the OS keychain, or otherwise in `~/.mcp-inspector/secrets.json` "unencrypted unless you supply a key".

## Gotchas

1. **The spec revision changes everything.** Code samples written for 2025 (`StreamableHTTPServerTransport` + `sessionIdGenerator`, `isInitializeRequest`, GET SSE streams, `Last-Event-ID`) are the legacy path ([changelog][spec-changelog], [sessions][sdk-sessions]).
   - The default `legacy: 'stateless'` answers a legacy GET and DELETE with `405` ([legacy clients][sdk-legacy]).
2. **2.3.0 broke `Server.connect()`.** It "now rejects if already connected", so create the server per request ([releases][rel]). `createMcpHandler`'s factory already does this ([SDK Fastify][sdk-fastify]).
3. **No validation inside the handler.** `createMcpHandler` performs no Host/Origin validation and no token verification ([createMcpHandler API][sdk-handler-api]). `authInfo` "is never derived from request headers" ([createMcpHandler API][sdk-handler-api]).
4. **`createMcpFastifyApp` only protects localhost binds.** Its DNS-rebinding hook is automatic only for a localhost host ([fastify API][sdk-fastify-api]). An existing Fastify app must add `hostHeaderValidation` and an Origin check itself.
5. **Fastify reply handling.** The documented recipe passes `reply.raw` to the Node handler ([SDK Fastify][sdk-fastify]). Whether `reply.hijack()` is needed to stop Fastify sending its own response is not stated in the SDK docs (UNVERIFIED). Check this against Fastify's reply lifecycle.
6. **Don't accept the browser session cookie on `/mcp`.** wechart uses `@fastify/session` (`/Users/srajagopal/Work/wechart/packages/api/package.json`), but the spec requires the bearer `Authorization` header on every request ([authz][spec-authz]). Accepting the cookie on `/mcp` would bypass that model. This is a design inference, not a third-party claim.
7. **Bearer helpers need an expiry.** They reject `AuthInfo` with no `expiresAt` ([verifier API][sdk-verifier-api]).
8. **The audience check is opt-in.** Pass `expectedResource`, available from 2.3.0 ([releases][rel]), or check `aud` in the verifier. The spec makes audience validation a MUST ([authz][spec-authz]).
9. **Rate limiting is not provided by the SDK.**
   - The spec: servers "**MUST** … Rate limit tool invocations" ([spec tools][spec-tools]).
   - The v2 middleware page is client-only ([SDK middleware][sdk-mw]).
   - Server-side rate limiting must come from Fastify. `@fastify/rate-limit` would need its own research doc (not researched here).
10. **The Logging feature is deprecated.**
    - In 2026-07-28 the Logging feature is deprecated: "log to `stderr` (stdio) or use OpenTelemetry" ([changelog][spec-changelog]).
    - Servers "**MUST NOT** emit `notifications/message` for requests that did not include" `io.modelcontextprotocol/logLevel` ([changelog][spec-changelog]).
    - Audit records for F32 therefore belong in wechart's own audit trail, not in MCP logging.
11. **Destructive-tool confirmation is the client's job, and annotations are hints.**
    - Clients "**MUST** consider tool annotations to be untrusted unless they come from trusted servers" ([spec tools][spec-tools]).
    - The SDK says annotations "never change how the SDK runs the tool" ([Context7 tools excerpt][sdk-tools]).
    - The spec asks clients to prompt for confirmation ([spec tools][spec-tools]).
    - Whether Claude Code changes its permission prompts based on `readOnlyHint`/`destructiveHint` is UNVERIFIED: not in the fetched Claude Code docs.
    - ChatGPT says annotations "help ChatGPT and Codex choose appropriate confirmation and safety behavior" ([OpenAI server][oai-server]).
    - Server-side enforcement remains wechart's: proposals and approval (F30) still apply, and MRTR elicitation can add an explicit confirm step ([input required][sdk-input]).
12. **Prompt injection and tool poisoning.** The fetched spec pages have no section using these terms. The relevant normative text says:
    - "descriptions of tool behavior such as annotations should be considered untrusted" ([spec overview][spec-index]);
    - servers "**MUST** … Sanitize tool outputs" ([spec tools][spec-tools]);
    - clients "**SHOULD** … Validate tool results before passing to LLM" ([spec tools][spec-tools]).
    - Dashboard titles, markdown tiles and query results returned by tools are user-authored data that reach the model. A dedicated MCP prompt-injection guidance page was not found (UNVERIFIED; the web-search budget was exhausted).
13. **Output size.** Claude Code warns at 10,000 tokens and caps at 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`) and 50,000 characters. Remote responses are capped at 16 MiB. A per-tool `anthropic/maxResultSizeChars` exists ([Claude Code MCP][cc-mcp]). Large query results should be paged or summarised.
14. **`x-mcp-header`.** Don't put sensitive parameters in `x-mcp-header`: header values are visible to intermediaries ([spec tools][spec-tools]).
15. **Entra multi-tenant metadata.** The `common` issuer is templated `{tenantid}` ([Entra access tokens][entra-at]). The MCP spec requires exact issuer match ([AS discovery][spec-disc]), so use the tenant issuer.
16. **Known open defects** ([open bugs][issues]):
    - **#2605.** Ajv recompiles schemas that have no `$id` on every call, which leaks memory. The client and the server's elicitation path are affected. Workaround: add `$id` to schemas ([#2605][i2605]).
    - **#2464.** `z.date()` anywhere in a tool schema crashes `tools/list`, and output schemas mark `.default()` fields required. Avoid `z.date()`; use ISO strings ([#2464][i2464]).
    - **#2677.** The draft-07 `$schema` problem affects v1 only. "Main branch already uses … 'draft-2020-12'" ([#2677][i2677]).
    - **#2433.** No duplicate in-flight request-id guard in Streamable HTTP ([open bugs][issues]).
    - **#2255.** Step-up `403 insufficient_scope` dead-ends with `SdkHttpError` on the client side ([open bugs][issues]).
    - **#2510.** Mid-session re-auth after refresh-token expiry dead-ends on the client side ([open bugs][issues]).
    - These last two affect any client built on the SDK (Claude Code's v2 runtime is built on SDK 2.0 per [cc-mcp][cc-mcp]). Their effect on Claude Code specifically is UNVERIFIED.
17. **Fixed in 2.2.0.** Stack overflow in `createMcpHandler` with repeated server instances; `Client.listen()` unhandled rejection ([v2.2.0][rel-220]).

## Alternatives considered

Not requested. The only alternative noted is the v1 `@modelcontextprotocol/sdk` 1.32.1 (Node >=18, MIT; [npm][npm-sdk-v1]). It is the legacy line ([repo README][repo]), and Claude Code's v2 runtime speaks 2026-07-28 ([Claude Code MCP][cc-mcp]).

## Open questions / unverified

- **Which authorization model?** Entra direct with pre-registered clients, a wechart-hosted AS facade, PATs, or a combination. This needs the user's decision (option analysis under Authorization). An AS facade or PATs each need further research docs.
- **Which clients must be supported?** ChatGPT requires OAuth with CIMD or DCR. Claude.ai and Desktop connectors connect from Anthropic's cloud, which conflicts with a server reachable only inside the enterprise network.
- UNVERIFIED: whether Claude Code (or Cursor or VS Code) refuses an OIDC AS whose metadata lacks `code_challenge_methods_supported`, as Entra's does. The spec requires refusal ([authz security][spec-authz-sec]).
- UNVERIFIED: Dex access-token `aud` and support for the `resource` parameter. Entra's handling of an RFC 8707 `resource` parameter on v2.0 (not documented in the parameter tables fetched).
- UNVERIFIED: whether `registerResource` and `registerPrompt` callbacks receive `ctx.http.authInfo`. Factory-level `authInfo` is documented.
- UNVERIFIED: whether the SDK sets `X-Accel-Buffering: no` on SSE responses. Ingress buffering and timeouts in Kubernetes need checking.
- UNVERIFIED: whether Claude Code's permission prompts use `readOnlyHint`/`destructiveHint`.
- UNVERIFIED: a spec or SDK page dedicated to prompt injection or tool poisoning. The web-search budget for this session was exhausted, so only known spec pages were fetched.
- UNVERIFIED: whether Fastify needs `reply.hijack()` when handing `reply.raw` to `toNodeHandler`.
- Not researched: `@fastify/rate-limit` (needed for the spec's rate-limit MUST) and any OAuth AS library.

[repo]: https://github.com/modelcontextprotocol/typescript-sdk
[rel]: https://github.com/modelcontextprotocol/typescript-sdk/releases
[rel-220]: https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.2.0
[issues]: https://github.com/modelcontextprotocol/typescript-sdk/issues?q=is%3Aissue+is%3Aopen+label%3Abug
[i2605]: https://github.com/modelcontextprotocol/typescript-sdk/issues/2605
[i2464]: https://github.com/modelcontextprotocol/typescript-sdk/issues/2464
[i2677]: https://github.com/modelcontextprotocol/typescript-sdk/issues/2677
[npm-server]: https://registry.npmjs.org/@modelcontextprotocol/server/latest
[npm-fastify]: https://registry.npmjs.org/@modelcontextprotocol/fastify/latest
[npm-node]: https://registry.npmjs.org/@modelcontextprotocol/node/latest
[npm-client]: https://registry.npmjs.org/@modelcontextprotocol/client/latest
[npm-sdk-v1]: https://registry.npmjs.org/@modelcontextprotocol/sdk/latest
[npm-inspector]: https://registry.npmjs.org/@modelcontextprotocol/inspector/latest
[sdk-tools]: https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html
[sdk-mcp-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/mcp.html
[sdk-fastify]: https://ts.sdk.modelcontextprotocol.io/v2/serving/fastify.html
[sdk-fastify-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/fastify/fastify.html
[sdk-hosthdr]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/fastify/middleware/hostHeaderValidation.html
[sdk-http]: https://ts.sdk.modelcontextprotocol.io/v2/serving/http.md
[sdk-handler-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/createMcpHandler.html
[sdk-tonode]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/node/toNodeHandler.html
[sdk-sessions]: https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.md
[sdk-legacy]: https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.md
[sdk-auth]: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.md
[sdk-bearer-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/middleware/bearerAuth.html
[sdk-prm-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/middleware/oauthMetadata.html
[sdk-verifier-api]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/express/auth/types.html
[sdk-authinfo]: https://ts.sdk.modelcontextprotocol.io/v2/api/index/%40modelcontextprotocol/client
[sdk-migrate]: https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2
[sdk-input]: https://ts.sdk.modelcontextprotocol.io/v2/servers/input-required.md
[sdk-testing]: https://ts.sdk.modelcontextprotocol.io/v2/testing.md
[sdk-schema]: https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries.md
[sdk-resources]: https://ts.sdk.modelcontextprotocol.io/v2/servers/resources.md
[sdk-completable]: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/completable.html
[sdk-trouble]: https://ts.sdk.modelcontextprotocol.io/v2/troubleshooting.md
[sdk-mw]: https://ts.sdk.modelcontextprotocol.io/v2/clients/middleware.md
[sdk-llms]: https://ts.sdk.modelcontextprotocol.io/v2/llms-full.txt
[spec-ver]: https://modelcontextprotocol.io/specification/versioning
[spec-changelog]: https://modelcontextprotocol.io/specification/2026-07-28/changelog
[spec-index]: https://modelcontextprotocol.io/specification/2026-07-28
[spec-tools]: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
[spec-http]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
[spec-authz]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
[spec-authz-sec]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
[spec-reg]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration
[spec-disc]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
[spec-bp]: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
[inspector-docs]: https://modelcontextprotocol.io/docs/tools/inspector
[cc-mcp]: https://code.claude.com/docs/en/mcp
[cc-hooks]: https://code.claude.com/docs/en/hooks
[claude-connectors]: https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
[cursor-mcp]: https://cursor.com/docs/context/mcp
[vscode-mcp]: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
[vscode-ref]: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration
[oai-auth]: https://developers.openai.com/apps-sdk/build/auth
[oai-server]: https://developers.openai.com/apps-sdk/build/mcp-server
[entra-meta]: https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
[entra-meta-tenant]: https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0/.well-known/openid-configuration
[entra-authcode]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
[entra-reply]: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
[entra-at]: https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
[dex-doc]: /Users/srajagopal/Work/wechart/docs/research/dex.md
[oc-doc]: /Users/srajagopal/Work/wechart/docs/research/openid-client.md
