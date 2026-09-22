---
library: Cube (Cube.js), security and access control
packages: [@cubejs-client/core]
version: 1.7.42
researched: 2026-09-19
sources: [https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/context.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/member-level-security.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/row-level-security.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/data-access-policies.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-policies-viewer.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/data-access-policies.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/context-variables.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/security.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/authentication/jwt.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/multitenancy.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/core-data-api/cloud-groups-and-user-attributes.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/roles-and-permissions.mdx, https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/index.mdx, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/types.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/types/auth.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts]
---

# Cube (Cube.js) 1.7.42: security and access control

## Summary

Cube splits access control into two parts. **Authentication** decides whether a caller can reach Cube at all. **Authorization** decides which data the caller can see. [doc-ac-index]

- **Core authentication:** HTTP APIs verify a JWT through `checkAuth` and `jwt` options. The SQL API checks a username and password through `checkSqlAuth`. [ref-config] [ref-sqlsec]
- **Core authorization:** access policies (`access_policy`) in the data model do the work. Groups come from the `context_to_groups` config function. `query_rewrite`, `public`, and `COMPILE_CONTEXT` cover advanced cases. [doc-ac-index] [doc-dap] [doc-ctx]
- **Cloud extras:** Cube Cloud adds automatic user-to-group mapping, user attributes, SSO/SCIM, platform roles, and a read-only Access Policies viewer. [doc-dap] [adm-sso] [doc-apv]

**Why wechart needs this:** the product-direction input names security as a Cube capability to surface in the UI (section 1 of `/Users/srajagopal/Work/wechart/docs/inputs/2026-09-19-product-direction.md`). `docs/spec.md` doesn't exist yet, so there are no AC or feature IDs to cite.

**Main finding for wechart:** on Cube Core, none of the Cloud identity features exist: users, groups, user attributes, SSO/SCIM, and the policy viewer. So wechart must play those roles itself:

- act as the identity, group, and attribute source (its own metadata DB);
- mint the JWT carrying that context;
- have Cube's `contextToGroups` read groups out of it;
- author `access_policy` blocks in model files;
- rebuild the "viewer" and "view as" features from Core primitives (`/v1/meta`, `/v1/sql`, `/v1/load`, `/v1/cubesql` called with an impersonated token).

Details are in the Capability inventory below.

## Install

- **Web app (Vite + React):** `pnpm add @cubejs-client/core@1.7.42`.
  - 1.7.42 is the npm `latest`. The package is MIT, `"type": "module"`, and ships ESM, CJS, and bundled types (`dist/src/index.d.ts`). [npm-client]
  - This doc covers only its auth surface: passing the token. Querying APIs belong in a separate client research doc.
- **Cube server:** wechart installs no npm package for server-side security.
  - Security config lives in the Cube container's `cube.js` or `cube.py`. "A `cube.ts` configuration file is no longer supported — use `cube.js` or `cube.py` instead." [ref-config]
  - `@cubejs-backend/server-core@1.7.42` declares `"node": ">=20.0.0"`. [npm-server]
  - The v1.7.42 Docker release upgraded Node.js to 24.21.0. [rel-1742] So `cube.js` runs on Node 24 inside the container, not on wechart's Node 26.
- **JWT minting on the wechart backend:** this needs a signing library, which this doc does not select. Cube's docs use `jsonwebtoken` in examples. [emb-jwt] It needs its own research doc (see Open questions).
- **Environment variables** (all in [ref-env]):
  - `CUBEJS_API_SECRET`, or `CUBEJS_API_SECRETS` for rotation.
  - For JWKS: `CUBEJS_JWK_URL`, `CUBEJS_JWT_ALGS`, `CUBEJS_JWT_AUDIENCE`, `CUBEJS_JWT_ISSUER`, `CUBEJS_JWT_SUBJECT`, `CUBEJS_JWT_CLAIMS_NAMESPACE`, `CUBEJS_JWT_KEY`.
  - `CUBEJS_DEFAULT_API_SCOPES`.
  - SQL API: `CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_USER`, `CUBEJS_SQL_PASSWORD`, `CUBEJS_SQL_SUPER_USER`.
  - `CUBEJS_DEV_MODE`.
  - The Core SQL API "is disabled by default"; setting `CUBEJS_PG_SQL_PORT` enables it. [ref-sqlapi]
- **`NODE_ENV=production` matters.** The default token check rejects missing or invalid tokens only when `NODE_ENV === 'production'`, unless a custom `checkAuth` throws (see Gotchas). [src-gateway] [emb-jwt]

## Init / auth pattern

**Flow:**

1. A user signs in to wechart.
2. The wechart backend loads the user's groups and attributes from its metadata DB and signs a short-lived JWT with them.
3. The browser passes that JWT to Cube through `@cubejs-client/core`.
4. Cube verifies it and uses the payload as `securityContext`. [doc-ctx] [ref-config]
5. `contextToGroups` turns that context into groups, and the access policies match against those groups. [doc-dap]

Minting details:

- Cube's docs show a backend route that signs the logged-in user object with `CUBEJS_API_SECRET` and returns `{ token }`. The payload "must contain an object". [emb-jwt]
- Setting an `exp` claim "is considered best practice". [emb-jwt]
- The payload has to be a JSON object. Otherwise the error is "Cannot create proxy with a non-object as target or handler". [doc-ctx]

Cube side, assembled from the documented signatures. The claim names `groups` and `is_wechart_admin` are illustrative, not decided:

```js
// cube.js, inside the Cube API container (CommonJS; cube.ts is unsupported)
module.exports = {
  // Option A: HS256 with CUBEJS_API_SECRET (default verifier, no code needed).
  // Option B: asymmetric keys via JWKS published by wechart:
  // jwt: { jwkUrl: process.env.CUBEJS_JWK_URL, algorithms: ['RS256'], issuer: ['wechart'], audience: 'cube' },

  // Core has no automatic group mapping; policies only match groups returned here.
  contextToGroups: ({ securityContext }) => securityContext?.groups ?? [],

  // REST scopes per user; 'jobs' is not in the defaults.
  contextToApiScopes: async (securityContext, defaultScopes) =>
    securityContext?.is_wechart_admin ? [...defaultScopes, 'jobs'] : defaultScopes,
};
```

Sources for this block:

- `contextToGroups` example: [ref-config]
- `contextToApiScopes` signature: [src-auth]
- `jwt.issuer` must be a string array (Joi `issuer: Joi.array().items(Joi.string())`): [src-optsvalidate]
- JWKS example with `issuer: ["<ISSUER…>"]`: [emb-jwt]

React side. `cube()` accepts a string or `() => Promise<string>`. [src-client] The HTTP transport sends it as `Authorization: <token>` without a `Bearer` prefix. [src-transport] The default base path is `/cubejs-api`. [src-optshandler]

```ts
import cube from '@cubejs-client/core';

export const cubeApi = cube(
  async () => {
    const res = await fetch('/api/cube-token', { credentials: 'include' });
    return (await res.json()).token as string;
  },
  { apiUrl: import.meta.env.VITE_CUBE_API_URL }, // e.g. http://localhost:4000/cubejs-api/v1
);
```

## API surface we will use

### HTTP authentication (REST, GraphQL, `/v1/cubesql`)

- **Header:**
  - The docs specify `Authorization: <JWT>`. [doc-ctx] [ref-rest]
  - The gateway reads `x-cube-authorization` first, then `authorization`.
  - It accepts a bare token or `<scheme> <token>`: it splits on a space and takes the second part. [src-gateway]
- **Errors:**
  - 403 "Authorization header isn't set".
  - 403 "Invalid token", which covers expired tokens and bad signatures. [ref-rest]
- **Dev mode:** "In the development environment the token is not required for authorization, but you can still use it to pass a security context." [ref-rest]

### `checkAuth(ctx, token)` / `check_auth`

- **Type:** `(ctx: any, authorization?: string) => Promise<void | CheckAuthResponse> | CheckAuthResponse | void`, where `CheckAuthResponse = { security_context?: unknown }`. [src-auth]
- **Behavior:**
  - The default "parses the JSON Web Token in the `Authorization` header, verifies it, and sets its payload to the `securityContext`". It is called on each request. [ref-config]
  - Return `{ security_context }` to customize the context. An empty function disables built-in security. Throwing fails authentication. [ref-config]
  - A throw returns HTTP 500 on Core and 403 on Cloud. [ref-config]

### `jwt` options

| Key                                                | Env var                       | Notes                                                                                                                                                   |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jwkUrl`                                           | `CUBEJS_JWK_URL`              | String, or `(payload) => string \| Promise<string>` [src-auth]. Cube caches the JWKS response "and update[s] if a key rotation has occurred" [emb-jwt]. |
| `key`                                              | `CUBEJS_JWT_KEY`              | JWK as a JSON string [ref-config]                                                                                                                       |
| `algorithms`                                       | `CUBEJS_JWT_ALGS`             | e.g. `HS256`, `RS256` [ref-env]                                                                                                                         |
| `issuer`                                           | `CUBEJS_JWT_ISSUER`           | Enforces `iss`. Type `string[]` [src-auth] [src-optsvalidate].                                                                                          |
| `audience`                                         | `CUBEJS_JWT_AUDIENCE`         | Enforces `aud` [ref-config]                                                                                                                             |
| `subject`                                          | `CUBEJS_JWT_SUBJECT`          | Enforces `sub` [ref-config]                                                                                                                             |
| `claimsNamespace`                                  | `CUBEJS_JWT_CLAIMS_NAMESPACE` | Namespace holding custom claims [ref-config]                                                                                                            |
| `jwkRetry`, `jwkDefaultExpire`, `jwkRefetchWindow` | none                          | Exist in the type and Joi schema [src-auth] [src-optsvalidate]. Undocumented in the config reference.                                                   |

- **Secret rotation:** `CUBEJS_API_SECRETS` is "A comma-separated list of secret keys accepted when verifying JWTs … list the outgoing and incoming secrets together until every client has re-signed". [ref-env]
- The verifier tries each candidate secret in turn and stops immediately on `TokenExpiredError` or `NotBeforeError`. [src-gateway]

### `extendContext(req)` / `extend_context`

- **Type:** `(req: ExpressRequest) => Promise<RequestExtension> | RequestExtension`. [src-request]
- It returns an object that "gets appended to the request context". It is called on each request. [ref-config]
- If you define it, "you should also define `context_to_app_id` so that all possible values of the extended context are reflected in the app id". [ref-config]
- It "isn't applied to refresh worker execution". [ref-config]

### `contextToGroups(context)` / `context_to_groups`

- **Type:** `(context: RequestContext) => string[] | Promise<string[]>`, where `RequestContext = { securityContext, requestId, authInfo? }`. [src-types]
- Access policies match against these groups. [ref-config]
- If the option isn't set, the user's group set is empty, so only `group: "*"` policies apply. [src-compilerapi]
- `context_to_roles` / `contextToRoles` was removed in v1.7.0: "Use context_to_groups (contextToGroups) instead." [rel-170]

### `contextToApiScopes(securityContext, defaultScopes)` / `context_to_api_scopes`

- **Type:** `(securityContext?, scopes?: ApiScopes[]) => Promise<ApiScopes[]>`, with `ApiScopes = 'graphql' | 'meta' | 'data' | 'sql' | 'jobs'`. [src-auth] [src-strings]
- Returning anything other than an array, or an unknown scope name, throws. [src-gateway]
- A missing scope returns 403 "API scope is missing: <scope>". [src-gateway]

| Scope     | Endpoints                                                               | Default |
| --------- | ----------------------------------------------------------------------- | ------- |
| `meta`    | `/v1/meta`, Metadata API                                                | yes     |
| `data`    | `/v1/load`, `/v1/cubesql` (and `/v1/dry-run`, per source [src-gateway]) | yes     |
| `graphql` | `/graphql`                                                              | yes     |
| `sql`     | `/v1/sql`                                                               | yes     |
| `jobs`    | `/v1/pre-aggregations/jobs`                                             | **no**  |
| none      | `/livez`, `/readyz`                                                     | yes     |

Table source: [ref-rest]. `CUBEJS_DEFAULT_API_SCOPES` defaults to `meta,data,graphql,sql` in both dev and prod. [ref-env]

### `queryRewrite(query, context)` / `query_rewrite`

- **Type:** `(query: Query, context: RequestContext) => Promise<Query>`. [src-request]
- "a security hook to check your query just before it gets processed". It is called on each request, and throwing blocks the query. [ref-config]
- Policy row filters and `query_rewrite` filters are combined, and "Both will apply". [doc-dap]
- The gateway runs `applyRowLevelSecurity` first and skips `queryRewrite` when the policy result is `denied`. [src-gateway]
- "there's no built-in way to access the data model metadata in `query_rewrite`". [ref-config]

### Multitenancy hooks

- **`contextToAppId`:**
  - Returns the cache key "for the compiled data model". "On its own, it leaves querying and caching shared across app ids." [ref-config]
  - `COMPILE_CONTEXT` "is evaluated only once per each key generated by `context_to_app_id`". [ref-ctxvars]
- **`contextToOrchestratorId`:**
  - Gives each id its own "database connections, execution queues, pre-aggregation table caches". [ref-config]
  - You must also override `pre_aggregations_schema` "Otherwise, you end up with table name clashes". [ref-config]
- **`contextToCubeStoreRouterId`:** routes to separate Cube Store routers and "requires `context_to_orchestrator_id`". [ref-config]
- **`preAggregationsSchema`:** a string, or a function of the security context. [ref-config]
- **`scheduledRefreshContexts`:**
  - Returns `[{ securityContext }]` entries.
  - Without it, "the security context will be `undefined`" for the refresh of multitenant pre-aggregations. [ref-config] [emb-mt]
  - The default is `async () => [null]`, and Cube logs a warning when `contextToAppId` is set without it. [src-optshandler]

### SQL API authentication

- **`checkSqlAuth(req, user, password)`:**
  - Type: `(ctx, user: string | null, password: string | null) => CheckSQLAuthSuccessResponse | Promise<…>`, with `{ password: string | null, superuser?: boolean, securityContext?: any, skipPasswordCheck?: boolean }`. [src-auth]
  - "If password returned from this function matches provided in connection string user will be authenticated with provided security context." [ref-sqlsec]
  - `req.protocol` / `req.method` identify XMLA/NTLM (DAX API) connections. [ref-config]
- **Default `checkSqlAuth`:**
  - Accepts `CUBEJS_SQL_USER` / `CUBEJS_SQL_PASSWORD` and returns `securityContext: {}`.
  - Outside dev mode, the user defaults to `cube` and the password to random bytes. [src-sqlserver]
- **`canSwitchSqlUser(current, newUser)`:**
  - Type: `=> boolean | Promise<boolean>`. [src-auth]
  - The default allows a switch only when `current === CUBEJS_SQL_SUPER_USER`. [src-sqlserver]
  - Switch per query with the virtual filter `WHERE __user = 'anotheruser'`. [ref-sqlsec]

### Data model: `access_policy` on cubes and views

- **Policy keys:** `group` (string, `"*"` = any group) or `groups` (string[]), never both and at least one. [ref-dap] [src-validator]
  - Also: `conditions: [{ if }]`, `member_level`, `member_masking`, `row_level`. [ref-dap] [src-validator]
- **`member_level`:** `includes` / `excludes`, each `"*"` or a list of members. [ref-dap] [src-validator]
- **`member_masking`:** same shape as `member_level`. It "requires `member_level` to be defined in the same policy" (Joi `.with('memberMasking','memberLevel')`). [ref-dap] [src-validator]
- **`row_level`:** either `filters` (REST filter format, with nested `and` / `or`) or `allow_all: true`. They are mutually exclusive (Joi `.xor`). [ref-dap] [src-validator]
- **`conditions`:** all must be true for the policy to apply. [ref-dap]
  - In YAML, `if` supports only `and`, `or`, `not`, `.`, and `.includes(…)`.
  - In JavaScript it also supports comparisons, arithmetic, `?:`, and `?.`. [ref-dap]
- **Values from context:**
  - In YAML, `"{ securityContext.x }"`. [ref-dap]
  - `userAttributes` is documented as "only available in Cube Cloud platform". [ref-dap]
- **Evaluation:**
  - "Members are unioned. A member is accessible if any matching policy grants it."
  - "Rows are intersected across the queried members", where each member's rows are the union of row filters from the policies that grant it.
  - Access is denied (an empty result) "only when a queried member is granted by no matching policy at all."
  - "A policy without a `row_level` filter defaults to all rows."
  - Sources: [doc-dap]
- **Default deny:** "When you define access policies for specific groups, access is automatically denied to all other groups." [doc-mls]
- **Cubes and views without `access_policy`** "are considered fully open". [doc-apv] RBAC is evaluated per cube where `accessPolicy?.length` is truthy. [src-evaluator]
- **Views:**
  - Member-level: "only the ones from the view will apply". [doc-dap]
  - Row-level: view and cube filters are "combined together … Both will apply". [doc-dap]
- **`public`:** policy member-level rules are combined with `public` using AND semantics. [doc-dap]
- **Masking:**
  - `mask` on a dimension or measure is a static value or `{ sql }`. The default mask is `NULL`. [ref-dims] [doc-dap]
  - "full access wins over masking". [doc-dap]
  - Conditional masking on measures applies only when the row-filter members are in the GROUP BY; otherwise the measure is fully masked. [doc-dap]
  - "SQL masks … on measures are not applied in ungrouped queries." [doc-dap]

Example from [doc-dap]:

```yaml
access_policy:
  - group: manager
    member_level:
      includes: '*'
    row_level:
      filters:
        - member: country
          operator: equals
          values: ['{ securityContext.country }']
```

### Observed locally (2026-09-22, compose Cube 1.7.42, the seed view `secured_orders`)

The seed view `infra/cube/model/views/secured_orders.yml` declares three policies:
- `managers`: all members, `allow_all`;
- `sales`: all but `total_amount`, rows where status is shipped, and a condition on `securityContext.is_employee`;
- `auditors`/`finance`: `count`, `status` and `ordered_at`, with `total_amount` masked.

`contextToGroups` in `infra/cube/cube.js` returns the context's `groups`. `/v1/load` was asked for `secured_orders.count` by status under each context:
- **`{}`, no groups:** HTTP **500**, `"Error: You requested hidden member: 'secured_orders.count'. Please make it visible using \`public: true\`. …"`. The policies' default deny reads as a hidden member, not a 403.
- **`{ groups: ["managers"] }`:** all three statuses.
- **`{ groups: ["sales"], is_employee: true }`:** only `shipped`, the row-level filter.
- **`{ groups: ["sales"] }`:** the same 500 hidden-member error. The condition fails, so no policy grants anything.
- **`total_amount` for `auditors`:** 200, with the value masked to `null`.
- **`total_amount` for `sales`:** the same hidden-member 500, since the member is excluded.
- **The hidden-member message names one member.** `secured_orders.count` by `secured_orders.status` under `{ groups: ["sales"] }`, where both are hidden, answers "You requested hidden member: 'secured_orders.count'" only (T173's e2e test).

### Member visibility: `public`

- `public: false` on a cube, view, dimension, measure, segment, or hierarchy means it "cannot be queried through the API". The default is `true`. [ref-cube] [ref-dims] [doc-mls]
- `public` can be dynamic through `COMPILE_CONTEXT`, e.g. `public: "{{ is_accessible_by_team('marketing', COMPILE_CONTEXT) }}"`. [doc-ctx]

### Context variables

- **`COMPILE_CONTEXT`:** holds `securityContext` plus `extendContext` output. Use Jinja `{{ }}` in YAML. [ref-ctxvars]
- **`SECURITY_CONTEXT`:** "is deprecated and can be removed without further notice. Use `query_rewrite` instead". Its `unsafeValue()` "entails SQL injection security risk". [ref-ctxvars]
- **`cubeCloud` in the security context:** "reserved and should not be used for other purposes." [doc-ctx]
- **Cloud shorthands:** Cloud groups and attributes travel in the JWT as `{ "cubeCloud": { "groups": [...], "userAttributes": {...} } }`. [recipe-cloud]
  - At the source level, the Core 1.7.42 compiler rewrites the bare identifiers `userAttributes`, `user_attributes`, and `groups` in `sql`, `mask`, and `access_policy`. [src-transpiler]
  - Inside `access_policy` they become `securityContext.cubeCloud.<prop>`; elsewhere they become `SECURITY_CONTEXT.cubeCloud.<prop>`. [src-transpiler]
  - Core's smoke tests exercise this ("SECURITY_CONTEXT.cubeCloud features via REST API"). [test-rbac]

### REST endpoints used for inspection and testing

- **`GET /v1/meta`** (scope `meta`):
  - "Information about cubes and views with `public: false` will not be returned." [ref-rest-ref]
  - Per-context visibility is patched from access policies: members are hidden unless a matching policy grants them through `member_level` or `member_masking`. [src-compilerapi]
  - Dev mode is an exception. [src-gateway]
- **`GET /v1/meta?extended`:** adds each member's `sql` and the cube's `fileName`. It does **not** return `access_policy` or `mask`. [src-metaext]
- **`GET|POST /v1/sql`** (scope `sql`): "returns the SQL query … generated by Cube", built after the policies and `queryRewrite` are applied. [ref-rest-ref] [src-gateway]
- **`POST /v1/dry-run`** (scope `data`): returns the normalized queries from _before_ RLS and `queryRewrite`. [src-gateway]
- **`/v1/load`** (scope `data`): executes the query. [ref-rest]
- **`POST /v1/cubesql`** (scope `data`): runs SQL API queries over HTTP with the JWT. [ref-rest] [ref-rest-ref]

## Capability inventory

| Capability                                                                           | Core or Cloud-only                                                                                | API/config surface to drive it                                                                                                 | Candidate wechart UI surface                                                                  | Source                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| JWT verification with a shared secret (HS256)                                        | Core                                                                                              | `CUBEJS_API_SECRET`; `jwt.key` / `CUBEJS_JWT_KEY`                                                                              | Read-only "Cube auth mode" status; wechart backend mints tokens                               | [ref-env] [emb-jwt]                         |
| Secret rotation                                                                      | Core                                                                                              | `CUBEJS_API_SECRETS`                                                                                                           | Ops runbook or status only (env var, not runtime API)                                         | [ref-env]                                   |
| JWKS / asymmetric verification, claim checks (`iss`, `aud`, `sub`), claims namespace | Core                                                                                              | `jwt.{jwkUrl,algorithms,issuer,audience,subject,claimsNamespace}` and matching env vars                                        | Auth settings view (read-only; values live in `cube.js` / env)                                | [ref-config] [emb-jwt]                      |
| Custom authentication                                                                | Core                                                                                              | `checkAuth`                                                                                                                    | None; code in `cube.js`. UI can only show that it is configured if wechart generates the file | [ref-config]                                |
| Auth enforcement mode                                                                | Core                                                                                              | `NODE_ENV=production`, or a custom `checkAuth` that throws                                                                     | Health banner when Cube accepts unauthenticated requests                                      | [src-gateway] [emb-jwt]                     |
| REST API scopes (meta, data, graphql, sql, jobs)                                     | Core                                                                                              | `contextToApiScopes`; `CUBEJS_DEFAULT_API_SCOPES`                                                                              | Per-group API-scope matrix, if wechart carries scope claims in the JWT                        | [ref-rest] [src-auth]                       |
| Security context content                                                             | Core                                                                                              | JWT payload; `extendContext`                                                                                                   | Security-context inspector and "view as" editor (JSON)                                        | [doc-ctx] [ref-config]                      |
| Query rewrite (programmatic RLS)                                                     | Core                                                                                              | `queryRewrite`                                                                                                                 | Explain only; effects visible in `/v1/sql` preview                                            | [ref-config] [src-gateway]                  |
| Dynamic models per tenant or team (`COMPILE_CONTEXT`, dynamic `public`)              | Core                                                                                              | `contextToAppId` + `COMPILE_CONTEXT` in the model                                                                              | Tenant/team preview; model-editor lint when `contextToAppId` is missing                       | [doc-ctx] [ref-ctxvars]                     |
| `SECURITY_CONTEXT` in model SQL (deprecated)                                         | Core                                                                                              | Model JS/YAML                                                                                                                  | Model-editor deprecation and SQL-injection warning                                            | [ref-ctxvars]                               |
| Member visibility (`public`)                                                         | Core                                                                                              | `public` on cube, view, dimension, measure, segment, hierarchy                                                                 | Visibility toggle in the model editor                                                         | [doc-mls] [ref-cube] [ref-dims]             |
| Access policies: member-level                                                        | Core                                                                                              | `access_policy[].member_level.{includes,excludes}`                                                                             | Policy editor: per group, a member allow/deny picker                                          | [ref-dap] [doc-dap]                         |
| Access policies: row-level                                                           | Core                                                                                              | `access_policy[].row_level.{filters \| allow_all}`                                                                             | Policy editor: filter builder bound to `securityContext.*` values                             | [ref-dap]                                   |
| Access policies: conditions                                                          | Core                                                                                              | `access_policy[].conditions[].if` (YAML operator subset)                                                                       | Condition builder limited to `and` / `or` / `not` / `.includes` for YAML                      | [ref-dap] [gh-11117]                        |
| Data masking                                                                         | Core                                                                                              | `member_masking`, `mask` on members                                                                                            | Policy editor masking column; `mask` field in the member editor                               | [ref-dap] [ref-dims]                        |
| Group resolution                                                                     | Core: `contextToGroups` (manual). Cloud: automatic                                                | `contextToGroups`                                                                                                              | wechart groups admin (metadata DB), emitted as a JWT claim                                    | [doc-dap] [src-compilerapi]                 |
| User attributes                                                                      | Cloud (documented); Core resolves the `cubeCloud.userAttributes` shorthand at source level        | JWT `cubeCloud.userAttributes`, or plain `securityContext.*`                                                                   | wechart user-attributes admin, emitted as JWT claims                                          | [ref-dap] [src-transpiler] [recipe-cloud]   |
| Access Policies viewer                                                               | Cloud-only, read-only, no API                                                                     | none                                                                                                                           | Rebuild in wechart from parsed model files and `/v1/meta`                                     | [doc-apv] [src-metaext]                     |
| "View as" policy testing                                                             | Core (by composing APIs)                                                                          | Impersonated JWT with `/v1/meta`, `/v1/sql`, `/v1/load`, `/v1/cubesql`                                                         | "Preview as user/group" panel                                                                 | [src-gateway] [doc-apv]                     |
| SQL API credentials                                                                  | Core                                                                                              | `CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_USER` / `CUBEJS_SQL_PASSWORD`, `checkSqlAuth`                                                | SQL-access settings; per-user SQL credentials if wechart implements `checkSqlAuth`            | [ref-sqlapi] [ref-config]                   |
| SQL API user switching                                                               | Core                                                                                              | `CUBEJS_SQL_SUPER_USER`, `canSwitchSqlUser`, `WHERE __user = '…'`                                                              | SQL runner "run as" for admins                                                                | [ref-sqlsec] [src-sqlserver]                |
| Multitenancy isolation                                                               | Core                                                                                              | `contextToAppId`, `contextToOrchestratorId`, `contextToCubeStoreRouterId`, `preAggregationsSchema`, `scheduledRefreshContexts` | Tenant admin; warnings when isolation is partial                                              | [ref-config] [emb-mt]                       |
| Pre-aggregation jobs per security context                                            | Core                                                                                              | `/v1/pre-aggregations/jobs` (scope `jobs`, `selector.contexts`)                                                                | Jobs UI (admin-only scope)                                                                    | [ref-rest] [ref-rest-ref]                   |
| Cloud platform roles (Admin, Developer, Explorer, Viewer)                            | Cloud-only                                                                                        | Cloud UI                                                                                                                       | wechart's own app roles                                                                       | [adm-roles]                                 |
| Custom roles                                                                         | Cloud-only (Enterprise)                                                                           | Cloud UI                                                                                                                       | wechart's own app roles                                                                       | [adm-custom]                                |
| User groups admin                                                                    | Cloud-only                                                                                        | Cloud UI "Admin → User Groups"                                                                                                 | wechart groups admin                                                                          | [adm-groups]                                |
| User-attributes admin                                                                | Cloud-only                                                                                        | Cloud UI "Admin → Attributes"                                                                                                  | wechart attributes admin                                                                      | [adm-attrs]                                 |
| SSO (SAML: Okta, Entra ID, Google Workspace)                                         | Cloud-only (Enterprise)                                                                           | Cloud UI                                                                                                                       | wechart login (separate decision)                                                             | [adm-sso] [adm-okta-saml]                   |
| SCIM provisioning (users, groups, Entra custom attributes)                           | Cloud-only (Enterprise)                                                                           | Cloud SCIM `/scim/v2/*`                                                                                                        | wechart user sync (separate decision)                                                         | [adm-okta-scim] [adm-entra-scim] [docs-nav] |
| Cloud Auth Integration (enriches context with the Cloud user)                        | Cloud-only                                                                                        | "Enable Cloud Auth Integration" toggle                                                                                         | n/a                                                                                           | [doc-ctx]                                   |
| Personal Core Data API token                                                         | Cloud (the token is generated in the product UI under Preferences; Core has no equivalent option) | Product UI                                                                                                                     | n/a                                                                                           | [ref-cda]                                   |
| Org API keys and Control Plane API (users, embed tenants and groups)                 | Cloud-only                                                                                        | Cloud Control Plane API                                                                                                        | n/a                                                                                           | [adm-apikeys] [docs-nav]                    |

### How a UI can test a policy

1. **Impersonated token.**
   - wechart's backend signs a JWT carrying the target user's or group's claims, with a short `exp`, using the same secret or key Cube verifies with. [emb-jwt]
   - Anyone who can mint such tokens can act as any user, so gate this endpoint behind wechart admin rights and audit it. (Design inference from the JWT model [doc-ctx].)
2. **Visible members.** Call `GET /v1/meta` with that token.
   - Outside dev mode, members the context can't see are left out. [src-gateway] [src-compilerapi]
   - In dev mode (`CUBEJS_DEV_MODE=true`) every member is returned. [src-gateway] See Gotchas.
3. **Row filters, denials, and masking, without running data.** Call `POST /v1/sql` with that token.
   - The SQL is generated after `applyRowLevelSecurity` and `queryRewrite`. [src-gateway]
   - A denied member adds a `1 = 0` segment (`rlsAccessDenied`). [src-compilerapi]
   - `/v1/sql?format=sql` does the same for SQL API queries. [ref-rest-ref]
4. **Actual rows.** Call `/v1/load` (REST JSON) or `/v1/cubesql` (SQL over HTTP) with that token. [ref-rest] [ref-rest-ref]
5. **SQL API session.** A superuser connection can use `WHERE __user = '<user>'`. [ref-sqlsec]
6. **Do not use `/v1/dry-run` for policy testing.** Its `normalizedQueries` come from before RLS and `queryRewrite`. [src-gateway]
7. **Drafts.** Cube evaluates only the compiled model it has loaded. The viewer docs likewise say "To verify behavior end-to-end, switch the security context and issue queries against your development API." [doc-apv] Previewing an unsaved policy needs a Cube instance that has loaded the draft (see Open questions).

### What is only knowable server-side

- **Config logic** (`checkAuth`, `extendContext`, `contextToGroups`, `queryRewrite`, `contextToApiScopes`, `checkSqlAuth`, `canSwitchSqlUser`) runs as code in `cube.js`. No endpoint exposes it. Only its effects are observable through the APIs above. [ref-config]
- **Policy definitions** are not returned by any API. `/v1/meta?extended` omits `access_policy` and `mask` but gives `fileName`, so wechart must parse model files. [src-metaext]
- **Resolved groups and condition results** for a context are computed internally and never returned. [src-compilerapi]
- **Complete member lists including `public: false`:** outside dev mode no normal token gets them. Requests signed with the playground auth secret and carrying a dev token scope bypass the visibility filter, but that path is undocumented. [src-gateway] Model files are the reliable source.
- **Whether a member is masked** for a context: the meta visibility logic treats masked members as visible. [src-compilerapi] Whether meta flags them as masked is UNVERIFIED; the generated SQL from `/v1/sql` shows it.

## Gotchas

- **Auth is not enforced outside `NODE_ENV=production`.**
  - The default verifier throws 403 only if `enforceSecurityChecks`, which is `options.enforceSecurityChecks || NODE_ENV === 'production'`. Otherwise invalid or missing tokens leave `securityContext` undefined. [src-gateway]
  - "A custom `check_auth` that rejects unauthenticated requests enforces it whatever `NODE_ENV` is." [emb-jwt]
  - `contextToGroups` must therefore tolerate an undefined context.
- **`checkAuth` throws become HTTP 500 on Core** (403 on Cloud). [ref-config]
- **Dev mode `/v1/meta` returns every member** (`isDevMode || signedWithPlaygroundAuthSecret || item.isVisible`). [src-gateway]
  - A "view as" members preview is only trustworthy against a non-dev-mode Cube.
  - Or read each member's `isVisible` flag, which `metaConfig` still patches per context. [src-compilerapi] [src-meta]
- **`/v1/dry-run` shows pre-policy queries.** [src-gateway]
- **REST member-level denial returns HTTP 500** "You requested hidden member … make it visible using `public: true`" instead of 403.
  - Reported on v1.7.23; issue open. The fix PR #11836 (403 "Access to the following members is denied by an access policy") is open, not merged. [gh-11769] [gh-11836]
  - The SQL API returns an empty result for the same case. [test-rbac] [doc-dap]
- **`member_level: {}` is treated as `includes: '*'`.** Paired with `member_masking`, it silently returns unmasked values.
  - The PR that would make it a compile error is open. [gh-11934]
  - wechart's policy editor should never emit an empty `member_level`.
- **Views:** when querying a view, only the view's member-level rules apply, not the cube's. [doc-dap]
  - Inference, verify with a test: a view without `access_policy` is "fully open" [doc-apv], so cube member-level policies don't restrict it. Row-level filters from cubes still apply. [doc-dap]
- **Schema constraints** [src-validator]:
  - `group` and `groups` are mutually exclusive, and one is required.
  - `member_masking` requires `member_level`.
  - `row_level` takes exactly one of `filters` / `allow_all`.
  - There is no `role` key.
  - `context_to_roles` was removed in v1.7.0. [rel-170]
- **YAML conditions can't compare values** (`==` fails with "Unsupported Python multiple children node"). Issue open; use JS models or boolean claims. [gh-11117] [ref-dap]
- **Array-valued security-context values in YAML `row_level.values`** failed in #9248 ("Unexpected input during yaml transpiling: null"). The issue is closed, but its resolution is UNVERIFIED. [gh-9248]
  - The JS shorthand `values: groups` with an array produces an IN clause in Core tests. [fx-sc] [test-rbac]
- **`userAttributes` is documented as Cloud-only** [ref-dap], and `cubeCloud` is "reserved". [doc-ctx]
  - Core 1.7.42 maps the shorthands to `securityContext.cubeCloud.*`. [src-transpiler]
  - Using that wrapper in Core relies on source behavior the docs don't promise for Core.
  - Plain `securityContext.*` is the documented Core path. [ref-dap]
  - Even with `cubeCloud.groups`, policy matching in Core still needs `contextToGroups`. [src-compilerapi]
- **`COMPILE_CONTEXT` is evaluated once per `contextToAppId` key.** [ref-ctxvars]
  - If `public` or SQL depends on per-user context that `contextToAppId` does not encode, users share the first compiled model.
  - `extendContext` also needs `contextToAppId`. [ref-config]
- **`extendContext` is not applied to the refresh worker.** [ref-config] Missing `scheduledRefreshContexts` gives an undefined security context during refresh. [ref-config]
- **`contextToAppId` alone does not isolate query caches or connections.** Add `contextToOrchestratorId` and `preAggregationsSchema`. [ref-config] [emb-mt]
- **Default SQL API auth gives every SQL user `securityContext: {}`.** Per-user row-level security over the SQL API requires a custom `checkSqlAuth`. [src-sqlserver]
- **Custom `contextToApiScopes` results are validated:** returning a non-array or unknown scope throws. `jobs` is off by default. [src-gateway] [ref-rest]
- **Config parse rules:** `jwt.issuer` is a `string[]` under strict Joi. [src-optsvalidate] `cube.ts` configs are unsupported. [ref-config]
- **Masking edge cases:**
  - Measure SQL masks are not applied in ungrouped queries.
  - Conditional masking on measures becomes full masking when the row-filter members aren't grouped. [doc-dap]
- **History:** CVE-2022-23510 (RLS bypass via `/v1/sql-runner`) affected only 0.31.23. [ghsa] It is not relevant to 1.7.42 but shows RLS depends on every endpoint going through the gateway.

## Alternatives considered

Not requested.

## Open questions / unverified

- **Identity source and SSO for wechart** is a product decision. Cloud SSO, SCIM, and groups don't exist in Core, so wechart must provide them or integrate an IdP. Needs the user's input.
- **JWT signing on the wechart backend** needs its own research doc:
  - a JWT library (Cube's docs show `jsonwebtoken` [emb-jwt]);
  - HS256 with a shared `CUBEJS_API_SECRET` versus asymmetric keys published as JWKS (`CUBEJS_JWK_URL`).
- **Claim convention** needs a decision: plain claims (e.g. `groups`, `attrs`), which are documented for Core [ref-dap], versus the `cubeCloud` wrapper, which Core honors at source level [src-transpiler] but the docs call reserved [doc-ctx].
- UNVERIFIED: which API scope, if any, the Postgres-wire SQL API checks. `contextToApiScopes` is registered with the SQL interface [src-sqlserver], but I found no doc stating the scope name.
- UNVERIFIED: the exact effect of `superuser: true` returned from `checkSqlAuth`. It is in the type and Core RBAC fixtures [src-auth] [fx-rbac-cfg], but no doc describes it.
- UNVERIFIED: whether `/v1/meta` marks masked members. Visibility logic treats masked as visible [src-compilerapi]; I found no documented masked flag.
- UNVERIFIED: whether a `role:` key now fails compilation with a specific error. It is absent from `GroupPolicySchema` [src-validator]; I did not confirm Joi's unknown-key setting.
- UNVERIFIED: how to preview draft (uncommitted) policies. Options include a separate dev-mode Cube instance reading a draft model directory, or `repositoryFactory` / `schemaVersion` [ref-config]. Needs a design decision and a test.
- UNVERIFIED: whether DAX/MDX API (Kerberos/NTLM) auth is available on Core. The `check_sql_auth` docs show an XMLA/NTLM branch [ref-config]; availability belongs to the Core Data APIs research doc.
- UNVERIFIED: whether Core 1.7.42 still ships the Developer Playground security-context editor. It is referenced in [doc-ctx]; I didn't check the Core playground build.
- Pre-aggregation matching with policy row filters is not described in `matching-pre-aggregations.mdx` (no mention of access policies). The changelog notes "tesseract: keep pre-aggregations for RBAC access-denied 1=0 segment (#11123)" in 1.6.61; I read it only through a summarized changelog fetch.

[doc-ac-index]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/index.mdx
[doc-ctx]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/context.mdx
[doc-mls]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/member-level-security.mdx
[doc-rls]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-control/row-level-security.mdx
[doc-dap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/data-access-policies.mdx
[doc-apv]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs/data-modeling/access-policies-viewer.mdx
[ref-dap]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/data-access-policies.mdx
[ref-ctxvars]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/context-variables.mdx
[ref-cube]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[ref-dims]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[ref-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[ref-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[ref-cda]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/index.mdx
[ref-rest]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[ref-rest-ref]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[ref-sqlapi]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[ref-sqlsec]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/security.mdx
[emb-jwt]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/authentication/jwt.mdx
[emb-mt]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/embedding/multitenancy.mdx
[recipe-cloud]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/recipes/core-data-api/cloud-groups-and-user-attributes.mdx
[adm-roles]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/roles-and-permissions.mdx
[adm-custom]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/custom-roles.mdx
[adm-groups]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/user-groups.mdx
[adm-attrs]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/users-and-permissions/user-attributes.mdx
[adm-sso]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/index.mdx
[adm-okta-saml]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/okta/saml.mdx
[adm-okta-scim]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/okta/scim.mdx
[adm-entra-scim]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/sso/microsoft-entra-id/scim.mdx
[adm-apikeys]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/admin/account-billing/api-keys.mdx
[docs-nav]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/docs.json
[src-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/types.ts
[src-optshandler]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts
[src-optsvalidate]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/optionsValidate.ts
[src-compilerapi]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts
[src-auth]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/types/auth.ts
[src-request]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/types/request.ts
[src-strings]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/types/strings.ts
[src-gateway]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-sqlserver]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/sql-server.ts
[src-metaext]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts
[src-validator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[src-evaluator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[src-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[src-transpiler]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts
[src-client]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[src-transport]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/HttpTransport.ts
[test-rbac]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-testing/test/smoke-rbac.test.ts
[fx-rbac-cfg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-testing/birdbox-fixtures/rbac/cube.js
[fx-sc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-testing/birdbox-fixtures/rbac/model/cubes/security_context_test.js
[rel-170]: https://github.com/cube-js/cube/releases/tag/v1.7.0
[rel-1742]: https://github.com/cube-js/cube/releases/tag/v1.7.42
[npm-client]: https://registry.npmjs.org/@cubejs-client/core/latest
[npm-server]: https://registry.npmjs.org/@cubejs-backend/server-core/latest
[gh-11769]: https://github.com/cube-js/cube/issues/11769
[gh-11836]: https://github.com/cube-js/cube/pull/11836
[gh-11934]: https://github.com/cube-js/cube/pull/11934
[gh-9248]: https://github.com/cube-js/cube/issues/9248
[gh-11117]: https://github.com/cube-js/cube/issues/11117
[ghsa]: https://github.com/cube-js/cube/security/advisories/GHSA-6jqm-3c9g-pch7
