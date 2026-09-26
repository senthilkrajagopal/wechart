---
library: Dex
packages: []
version: 2.45.1
researched: 2026-09-25
sources: [https://dexidp.io/docs/, https://github.com/dexidp/dex/tree/v2.45.1, https://github.com/dexidp/dex/releases/tag/v2.45.1, https://github.com/dexidp/dex/releases/tag/v2.45.0, https://github.com/dexidp/helm-charts/tree/dex-0.24.1/charts/dex, https://hub.docker.com/r/dexidp/dex/tags]
---
# Dex 2.45.1

## Summary

**What Dex is.** An "OpenID Connect (OIDC) identity and OAuth 2.0 provider with pluggable connectors" ([repo][repo-api]). It is written in Go and licensed Apache-2.0 ([repo][repo-api]). It has been a CNCF **Sandbox** project since 2020-06-25 ([cncf]).

**Its role here.** Dex is a candidate for the §P2.5 open item "Development OIDC provider". It would run beside wechart in docker-compose and in the Helm release on docker-desktop (AC-257). It would issue the `groups` claim that wechart reads for identity and groups (AC-252), including for a test user in 20 groups (AC-255).

**Decisive finding: yes, local users carry groups in 2.45.x, from config alone.**
- v2.45.0 added `groups`, `preferredUsername`, `name` and `emailVerified` to `staticPasswords` ([v2.45.0 notes][rel-2450], [PR #4456][pr-4456], merged 2026-01-13).
- At the v2.45.1 tag, `storage.Password` has `Groups []string` ([storage.go][storage-go]).
- The password-DB `Login` returns `Groups: p.Groups` ([server.go][server-go]).
- The token code sets `groups` when the `groups` scope is requested ([oauth2.go][oauth2-go]).
- So no LDAP container and no mock connector is needed (details in API §2).
- **Pin v2.45.1 explicitly.** The official Helm chart's newest version, 0.24.1, defaults to v2.44.0. In v2.44.0, `groups` on a static password is silently ignored (Gotcha 1).

**Production broker (for AC-258, checked at phase end).** The same binary could broker production sign-in:
- The `microsoft` connector covers Entra ID. It reads groups from Graph `getMemberGroups`, which is transitive.
- The `ldap` connector covers on-prem AD, and follows nested groups through `recursionGroupAttr`.
- The generic `oidc` connector covers any upstream OIDC provider.
- Details are in API §8.

**Limits that matter:**
- No released Dex has an `end_session_endpoint` or RP-initiated logout. It exists only on master, as an experimental feature.
- The claim name `groups` is fixed.
- Every group goes into the token itself. Dex has no overage mechanism.

## Install

No npm packages. Dex runs as a container.

**Image** (published by the release workflow to both `ghcr.io/dexidp/dex` and `docker.io/dexidp/dex` ([artifacts.yaml][artifacts-wf], [getting started][docs-getting-started])):

| Tag | Base | Notes |
|---|---|---|
| `v2.45.1` = `v2.45.1-alpine` | `alpine:3.23.3` ([Dockerfile][dockerfile]) | Alpine ships BusyBox ([alpine]), so a `wget` healthcheck can run inside the container. |
| `v2.45.1-distroless` | `gcr.io/distroless/static-debian13:nonroot` ([Dockerfile][dockerfile]) | No shell ([distroless]), so no exec healthcheck. |

- **Platforms:** linux/amd64, arm64, arm/v7, ppc64le and s390x ([artifacts.yaml][artifacts-wf], [hub tags][hub-v2451]).
- **Signing:** images are cosign-signed and carry build provenance. SBOM generation is commented out ([artifacts.yaml][artifacts-wf]).
- **User:** the container runs as `USER dex:dex`, UID/GID 1001 ([Dockerfile][dockerfile]).
- **Entrypoint:** `ENTRYPOINT ["/usr/local/bin/docker-entrypoint"]`, `CMD ["dex","serve","/etc/dex/config.docker.yaml"]` ([Dockerfile][dockerfile]).
- **Never use `:latest`.** `latest` has the same digest as `master` (`sha256:5753ac2b…`, pushed 2026-09-24) ([hub latest][hub-latest], [hub master][hub-master]). The workflow tags `latest` from the default branch ([artifacts.yaml][artifacts-wf]).
  - Docker's own Dex guide uses `dexidp/dex:latest` ([docker guide][docker-guide]). Don't copy that.
  - oauth2-proxy's own dev environment pins `ghcr.io/dexidp/dex:v2.45.1` ([o2p compose][o2p-compose]).

**Helm chart:** the official chart is `dex/dex` from `https://charts.dexidp.io` ([chart README][chart-readme]).
```
helm repo add dex https://charts.dexidp.io
helm install ... dex/dex --version 0.24.1 -f dex-values.yaml
```
- **Version:** 0.24.1 (2026-05-28), `appVersion: 2.44.0` ([Chart.yaml][chart-yaml], [index.yaml][chart-index], [chart releases][chart-releases]). Set `image.tag: v2.45.1`, because the chart's `image.tag: ""` defaults to appVersion ([values.yaml][chart-values]).
- **Kubernetes requirement:** `>=1.14.0-0` ([Chart.yaml][chart-yaml]).

**Runtime needs.** With `memory` storage, Dex needs no database and no volumes ([memory.go][memory-go]).

## Init / auth pattern

### 1. Dex config for development and tests (v2.45.1 keys, each sourced below)

```yaml
issuer: http://<ISSUER_HOST>:5556/dex        # see §4: must be identical for the browser and the relying party
storage:
  type: memory                               # in-process maps, no persistence
web:
  http: 0.0.0.0:5556
telemetry:
  http: 0.0.0.0:5558                         # /healthz/live, /healthz/ready, /metrics
oauth2:
  skipApprovalScreen: true                   # but see Gotcha 6 (approval_prompt=force)
  # passwordConnector: local                 # only if API-level tests use the password grant
enablePasswordDB: true                       # required for staticPasswords
staticClients:
- id: wechart
  name: wechart                              # name is required
  secretEnv: WECHART_OIDC_CLIENT_SECRET      # or `secret:`; the two are exclusive
  redirectURIs:                              # exact string match; list the compose and k8s callbacks
  - http://localhost:<compose-port>/<callback-path>
  - http://localhost:8089/<callback-path>
staticPasswords:
- email: "twenty@example.test"               # the login identifier; matched case-insensitively
  hash: "$2a$10$…"                           # bcrypt, cost 10..16
  username: "twenty"
  name: "Twenty Groups"                      # -> `name` claim (profile scope); falls back to username
  preferredUsername: "twenty"                # -> `preferred_username` (profile scope)
  emailVerified: true                        # defaults to true when omitted
  userID: "…stable id…"
  groups: ["g01", "g02", "…", "g20"]         # -> `groups` claim (groups scope)
```

Where each key comes from:
- `issuer`, `storage`, `web`, `telemetry`, `oauth2` and `expiry` shapes: [config.docker.yaml][config-docker], [config.go][config-go].
- `staticPasswords` fields, including `groups`: [config-dev.yaml at v2.45.1][config-dev], [config.go][config-go], [storage.go][storage-go].
- `staticPasswords` require `enablePasswordDB: true` ([config.go Validate][config-go]).
- `staticClients` checks at startup ([serve.go][serve-go]):
  - `name` is required.
  - Exactly one of `id` or `idEnv`.
  - Exactly one of `secret` or `secretEnv`, unless `public: true`.
- Redirect URIs must match exactly. A public client with no registered URIs may use `http://localhost…` ([oauth2.go `validateRedirectURI`][oauth2-go]).
- Name and email fallbacks: `resolvePasswordName` and `resolvePasswordEmailVerified` ([server.go][server-go]).
- Emails are lowercased for lookup ([static.go][static-go]).
- Hash rules:
  - Dex rejects bcrypt cost below `bcrypt.DefaultCost` (10) or above 16 ([api.go `checkCost`][api-go], [bcrypt][go-bcrypt]).
  - `hashFromEnv` reads the hash from an environment variable ([config.go][config-go]).
  - The docs generate a hash with `htpasswd -BinC 10` ([local connector docs][docs-local]).

### 2. docker-compose (illustrative; not run)

```yaml
dex:
  image: ghcr.io/dexidp/dex:v2.45.1
  command: ["dex", "serve", "/etc/dex/config.yaml"]
  ports: ["5556:5556"]
  volumes: ["./deploy/dex/config.yaml:/etc/dex/config.yaml:ro"]
  environment:
    WECHART_OIDC_CLIENT_SECRET: ${WECHART_OIDC_CLIENT_SECRET}
  networks:
    default:
      aliases: ["<ISSUER_HOST>"]     # pattern A in §4
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://127.0.0.1:5558/healthz/ready"]
```

This follows oauth2-proxy's own compose file ([o2p compose][o2p-compose]):
- It runs `dex serve /dex.yaml` with a mounted config.
- It publishes `5556:5556`.
- It gives the Dex service the network alias `dex.localtest.me`.
- Its issuer is `http://dex.localtest.me:5556/dex` ([o2p dex.yaml][o2p-dex]).

The healthcheck path comes from the telemetry handlers in [serve.go][serve-go]. It relies on BusyBox `wget` in the alpine variant ([alpine]); that part is UNVERIFIED in practice.

### 3. Helm on docker-desktop (values for chart 0.24.1)

```yaml
image:
  tag: v2.45.1                  # REQUIRED: the chart default is v2.44.0
rbac:
  create: false                 # memory storage never calls the Kubernetes API
replicaCount: 1                 # memory storage is per process
envVars:
- name: WECHART_OIDC_CLIENT_SECRET
  valueFrom: { secretKeyRef: { name: <secret>, key: <key> } }
service:
  type: ClusterIP               # or LoadBalancer, see §4
  # clusterIP: <fixed IP in the static band>   # pattern A in §4
  ports: { http: { port: 5556 } }
config: { …same as §1… }
```

What the chart does with these values:
- **Config:** `config` is rendered with `toYaml` into a Secret under the key `config.yaml`, mounted read-only at `/etc/dex` ([secret.yaml][chart-secret], [deployment.yaml][chart-deploy]).
- **Rollout:** a `checksum/config` annotation restarts the pod whenever the config changes ([deployment.yaml][chart-deploy]).
- **Args and probes:** the container runs `dex serve --web-http-addr 0.0.0.0:5556 … /etc/dex/config.yaml`. Liveness and readiness probes hit `/healthz/live` and `/healthz/ready` on telemetry port 5558 ([deployment.yaml][chart-deploy]).
- **Service keys:** the Service template reads `service.type`, `service.clusterIP`, `service.loadBalancerIP` and `service.ports.*.nodePort` ([service.yaml][chart-svc]).
- **Defaults:** `rbac.create: true`, `rbac.createClusterScoped: true`, `replicaCount: 1`, `resources: {}` ([values.yaml][chart-values]).
- **RBAC is only for CRD storage:** it grants `*` on `dex.coreos.com` plus `list`/`create` on `customresourcedefinitions` ([rbac.yaml][chart-rbac]). Only `kubernetes` storage needs it ([storage docs][docs-storage]).
- **Memory storage needs no API access:** it is plain Go maps with no persistence ([memory.go][memory-go]). Setting `rbac.create: false` follows from that; I haven't run it.

### 4. Issuer URL consistency (browser vs. in-network relying party)

**The constraint:**
- Dex mounts every handler under the issuer URL's path ([server.go][server-go]).
- Dex puts the issuer in `iss` and in the discovery document ([oauth2.go][oauth2-go], [handlers.go][handlers-go]).
- So the browser must reach Dex at the issuer URL, and the relying party (oauth2-proxy or wechart's API) must accept that same string as `iss`.

Three patterns work with Dex as it is.

**A. One hostname that resolves in both places.**
- **Compose:** a network alias on the Dex service, plus a host-side name for 127.0.0.1, as oauth2-proxy's environment does with `dex.localtest.me` ([o2p compose][o2p-compose], [o2p dex.yaml][o2p-dex]).
  - Host-side resolution of `*.localtest.me` depends on public DNS. That is UNVERIFIED: `readme.localtest.me` did not resolve from my fetch tool.
  - A `/etc/hosts` entry on the developer machine works offline.
- **Kubernetes:** pods get the same name through `hostAliases`, which needs an IP ([k8s hostAliases][k8s-hostaliases]).
  - Pin the Dex Service to a fixed `clusterIP` in the static band ([k8s ClusterIP allocation][k8s-clusterip], [chart service.yaml][chart-svc]).
  - The browser then uses docker-desktop's LoadBalancer on `localhost:<port>`. That publishing behaviour is UNVERIFIED ([wechart helm research][wechart-helm]).
  - The Service port and the host port must be the same (for example 5556).

**B. Split the front channel from the back channel.** The issuer is the browser URL; server-to-server calls go to the in-network name.
- **oauth2-proxy:**
  - `--skip-oidc-discovery`.
  - `--oidc-issuer-url`: the browser URL, which must equal `iss`.
  - `--login-url`: the browser URL.
  - `--redeem-url` and `--oidc-jwks-url`: in-network URLs.
  - Sources: [o2p options][o2p-overview], [o2p manual discovery example][o2p-logingov].
- **openid-client:** a `customFetch` set on the Configuration applies to "all future individual HTTP requests" ([DiscoveryRequestOptions][oc-discovery-opts], [customFetch][oc-customfetch]).
  - It can rewrite the origin of discovery, token and JWKS calls while the issuer string stays the same.
  - I haven't found a worked example of this; it needs a spike (UNVERIFIED).

**C. `host.docker.internal`.**
- Docker Desktop resolves this name inside containers; resolution inside pods is UNVERIFIED ([wechart helm research][wechart-helm]).
- The Mac host needs its own `/etc/hosts` line, which Docker Desktop has not reliably added ([docker/for-mac#4442][for-mac-4442]).

### 5. openid-client 6.8.8 against Dex (sketch)

```ts
const config = await client.discovery(
  new URL(ISSUER), 'wechart', CLIENT_SECRET, undefined,
  { execute: [client.allowInsecureRequests] },     // Dex is plain HTTP in development
)
// authorization URL with scope 'openid profile email groups' (+ 'offline_access' if refresh is wanted), PKCE S256
```

- The current version is 6.8.8 (MIT), and it depends on `jose` and `oauth4webapi` ([npm][oc-npm]).
- By default it allows HTTPS only; `allowInsecureRequests` in `execute` lifts that for development ([allowInsecureRequests][oc-insecure]).
- Discovery keeps the issuer's path: `…/pathname/.well-known/openid-configuration` ([DiscoveryRequestOptions][oc-discovery-opts]). That matches Dex serving discovery under `/dex`.
- What Dex advertises ([handlers.go][handlers-go]):
  - PKCE methods `S256` and `plain`.
  - Token-endpoint auth methods `client_secret_basic` and `client_secret_post`.

## API surface we will use

### 1. Endpoints (under the issuer path, v2.45.1)

- **Main listener** ([server.go][server-go]):
  - `/.well-known/openid-configuration`, `/auth`, `/auth/{connector}`, `/auth/{connector}/login`
  - `/token`, `/keys`, `/userinfo`, `/token/introspect`
  - `/callback`, `/approval`, `/healthz`
  - `/device/*`, `/static`, `/theme`, `/robots.txt`
- **No `/logout` or end-session route** ([server.go][server-go]).
- **Telemetry listener:** `/metrics`, `/healthz`, `/healthz/live`, `/healthz/ready` ([serve.go][serve-go]).
- **Discovery document** ([handlers.go][handlers-go]):
  - Keys: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`, `device_authorization_endpoint`, `introspection_endpoint`, grant and response types, `code_challenge_methods_supported` (S256, plain), `scopes_supported`, `token_endpoint_auth_methods_supported`, `claims_supported`.
  - `scopes_supported`: `openid`, `email`, `groups`, `profile`, `offline_access`.
  - No `end_session_endpoint`.
  - `claims_supported` does not list `groups`, even though Dex emits it.
- **`/userinfo`** returns the claims of the presented token ([handlers.go][handlers-go]).

### 2. Test users with groups: the decisive question, answered from source at v2.45.1

**Static password DB: carries groups.**
- The config type accepts `groups` ([config.go][config-go]).
- `storage.Password.Groups []string` ([storage.go][storage-go]).
- `passwordDB.Login` returns `Groups: p.Groups` ([server.go][server-go]).
- `Refresh` re-reads `identity.Groups = p.Groups` ([server.go][server-go]).
- The example config at the tag shows `groups: ["team-a", "team-a/admins"]` ([config-dev.yaml][config-dev]).

**How static users are stored.**
- They are held in memory in front of the storage backend, and are read-only. Writes return `static passwords: read-only…` ([static.go][static-go]).
- Changing users or groups means changing the config and restarting.

**`mockCallback` connector: not usable for AC-255.** It always returns user "Kilgore Trout" with groups fixed at `["authors"]`, and has no config fields ([connectortest.go][mock-go]).

**`mockPassword` connector: no groups.** Its config is only `username` and `password`, and it returns no groups ([connectortest.go][mock-go]).

**gRPC password API: no groups in v2.45.1.**
- Setting groups through the API merged to master on 2026-09-24 and is unreleased ([PR #4989][pr-4989]).
- That PR confirms config-file groups have worked since #4456 ([PR #4989][pr-4989]).

**`ldap` connector with an OpenLDAP container.**
- It also works, via `groupSearch` (`baseDN`, `filter`, `userMatchers`, `nameAttr`, `recursionGroupAttr`) ([LDAP docs][docs-ldap], [ldap.go][ldap-go]).
- Recursion skips duplicates and stops when no new parents appear ([ldap.go][ldap-go]).
- It is the only development option that exercises **nested** group resolution. Static users list a flat group set.
- It is not needed for AC-255's 20 flat groups.

### 3. Claims and scopes

**`idTokenClaims`** ([oauth2.go][oauth2-go]):
- `iss`, `sub`, `aud`, `exp`, `iat`, `azp`, `nonce`, `at_hash`, `c_hash`
- `email`, `email_verified`
- `groups` (`omitempty`)
- `name`, `preferred_username`
- `federated_claims`

**Scope to claim** ([oauth2.go][oauth2-go], [scopes docs][docs-scopes]):

| Scope | Claims it adds |
|---|---|
| `email` | `email`, `email_verified` |
| `groups` | `groups` |
| `profile` | `name`, `preferred_username` |
| `federated:id` | `federated_claims{connector_id,user_id}` |
| `offline_access` | a refresh token |

**Scope validation:**
- `openid` is required.
- Unknown scopes are rejected with `Unrecognized scope(s)` ([oauth2.go][oauth2-go]).

**`sub` is opaque.** It encodes `{UserId, ConnId}` ([oauth2.go][oauth2-go]). For the raw configured `userID`, request `federated:id`.

**Access tokens are JWTs with the same claims.** `newAccessToken` calls `newIDToken` ([oauth2.go][oauth2-go]), so the access token carries `groups` too.

**The claim name is fixed as `groups`.**
- Dex has no custom or renamed claims ([scopes docs][docs-scopes]).
- The "arbitrary claims" issue has been open since 2018 ([#1182][iss-1182]).
- So against Dex, wechart's configurable groups claim (AC-252) can only be exercised with the value `groups`.

**A user with no groups gets no `groups` claim** (`omitempty`) ([oauth2.go][oauth2-go]).

**Default lifetimes:**
- ID tokens: 24h ([server.go][server-go]).
- Signing-key rotation: 6h in the Docker default config ([config.docker.yaml][config-docker]). `expiry.signingKeys` is deprecated in favour of `signer.config.keysRotationPeriod` ([serve.go][serve-go]).

### 4. Token size with 20 groups (arithmetic, not measured)

- Every group name of *n* characters adds *n*+3 bytes of JSON (quotes and comma). Base64url then multiplies by 4/3.
- For 20 names of 20 characters: about 460 B of JSON, so about 0.6 KB more per JWT.
- Both the ID token and the access token carry it ([oauth2.go][oauth2-go]).
- The total size of a Dex token with 20 groups is UNVERIFIED. Decode one in the spike.
- Relevant if oauth2-proxy stores sessions in cookies: it splits sessions over 4 KB into several cookies and recommends Redis for large sessions ([o2p session storage][o2p-sessions]).

### 5. Login page (for Playwright end-to-end tests)

- **Auto-redirect:** with a single connector and `alwaysShowLoginScreen: false`, `/auth` goes straight to that connector ([handlers.go][handlers-go], [oauth2 docs][docs-oauth2]). With only `enablePasswordDB`, that connector is "local", shown as "Email" ([serve.go][serve-go]).
- **The form** ([password.html][password-html]):
  - Posts to `{{ .PostURL }}`.
  - Inputs `#login` (`name="login"`) and `#password`.
  - Submit button `#submit-login`.
  - On failure it shows `Invalid {{ .UsernamePrompt }} and password.`
- **The login value is the user's email.** `passwordDB.Login` looks users up by email ([server.go][server-go]).

### 6. Password grant (API tests without a browser)

- Set `oauth2.passwordConnector: local`.
- POST to `/token` with `grant_type=password`, `username=<email>`, `password`, `scope=…` and client Basic auth ([local connector docs][docs-local], [oauth2 docs][docs-oauth2]).
- Add `groups` to the scope to get the claim ([oauth2.go][oauth2-go]).
- Dex's docs warn that the password grant is not recommended ([oauth2 docs][docs-oauth2]). Keep it in test configs only.

### 7. oauth2-proxy (v7.15.4, 2026-08-20 ([release][o2p-rel])) with Dex

- **Provider:** `provider="oidc"` with `oidc_issuer_url="http://dex.localtest.me:5556/dex"`, as in oauth2-proxy's own config ([o2p cfg][o2p-cfg]).
- **Groups claim:** `--oidc-groups-claim` defaults to `groups` ([o2p options][o2p-overview]).
- **Groups scope:** `groups` is added to the scope implicitly only when `--allowed-group` is set ([o2p options][o2p-overview]). Otherwise set `--scope "openid email profile groups"`.
- **Passing groups on:** `--set-xauthrequest` passes groups upstream in `X-Auth-Request-Groups`. `--pass-authorization-header` passes the ID token ([o2p options][o2p-overview]).
- **Logout:** `--backend-logout-url` needs an IdP logout URL, which Dex v2.45.1 lacks (API §1).

### 8. Dex as the production broker (for AC-258; not tested now)

**`microsoft` connector (Entra ID).**
- It calls `POST /v1.0/me/getMemberGroups` (with `securityEnabledOnly = onlySecurityGroups`) and pages through `@odata.nextLink` ([microsoft.go][ms-go]).
- Graph documents that call as **transitive**, returning up to 11,000 IDs ([Graph getMemberGroups][graph-gmg]).
- With the default `groupNameFormat: name`, Dex resolves the IDs with **one** `directoryObjects/getByIds` call holding all IDs, without chunking ([microsoft.go][ms-go]). Graph caps `ids` at 1000 per request ([Graph getByIds][graph-getbyids]). So a user in more than 1000 groups would presumably fail name resolution; that is inferred, not tested.
- Requirements: a specific `tenant` plus `Directory.Read.All` with admin consent ([Microsoft connector docs][docs-ms]).

**Group overage.**
- Entra's own tokens drop `groups` above 200 (JWT) and send an overage claim instead ([Entra ID token claims][entra-idtoken]).
- Dex's connector reads Graph directly, so it avoids that limit.
- But Dex then puts **every** group in its own token. Arithmetic: 300 GUID groups is about 11.7 KB of JSON, about 15.6 KB base64url, per token.

**`ldap` connector (on-prem AD).** See the AD example and `recursionGroupAttr` ([LDAP docs][docs-ldap]).

**`oidc` connector (upstream OIDC broker).**
- It needs `insecureEnableGroups`.
- It maps the upstream claim through `claimMapping.groups`.
- Its groups refresh only when the upstream ID token refreshes ([OIDC connector docs][docs-oidc]).

## Gotchas

1. **The chart's default image drops groups silently.**
   - Chart 0.24.1 uses appVersion 2.44.0 ([Chart.yaml][chart-yaml]).
   - v2.44.0's static-password parser only knows `Email, Username, UserID, Hash, HashFromEnv` ([config.go @v2.44.0][config-go-2440]).
   - Go's `encoding/json` ignores unknown keys by default ([encoding/json][go-json]).
   - Result: `groups` is dropped with no error. Always set `image.tag: v2.45.1`.
2. **`latest` is master.** Master has an unpatched High advisory in token exchange (GHSA-7qjx-gp9h-65qj). It affects only master code after 2026-03-11, not v2.45.1 ([advisory][ghsa-7qjx]). Pin the tag, preferably with a digest; the chart supports `image.digest` ([values.yaml][chart-values]).
3. **No logout endpoint, and no Dex session, in any release.**
   - v2.45.1 has no `end_session_endpoint` and no logout route ([handlers.go][handlers-go], [server.go][server-go]).
   - The end-session issue [#1697][iss-1697] (opened 2020) is open.
   - Issue [#4560][iss-4560] says Dex "operates without session support, relying on refresh tokens."
   - What follows for AC-253: ending wechart's own session should be enough, because the next `/auth` shows Dex's login form again. Confirm that in the end-to-end test.
   - openid-client's `buildEndSessionUrl` requires the end-session endpoint to be configured ([buildEndSessionUrl][oc-endsession]), so don't call it against Dex.
   - RP-initiated logout ([PR #4674][pr-4674], merged 2026-04-01) and auth sessions exist on master only, behind `sessions_enabled`, which defaults to false and is "experimental" ([master feature flags][ff-master]). No release includes them. No v2.46 milestone exists ([milestones][milestones]).
4. **Memory storage is volatile.**
   - Keys, clients, auth requests and refresh tokens live in Go maps ([memory.go][memory-go]).
   - On every restart, including the chart's config-checksum rollout ([deployment.yaml][chart-deploy]), Dex makes new signing keys and forgets its refresh tokens.
   - Keep `replicaCount: 1`.
   - For persistence, use `sqlite3` on a volume (the image runs as UID 1001) or `kubernetes` storage.
     - Kubernetes storage creates CRDs at startup (`crdHandling: ensure` by default), which needs a cluster-scoped `create` on CRDs ([kubernetes storage.go][k8s-storage-go], [rbac.yaml][chart-rbac]).
     - Dex's docs call SQLite "not appropriate for real workloads" ([storage docs][docs-storage]).
5. **The entrypoint runs gomplate over the config.**
   - The image entrypoint pipes every `.yaml`, `.tpl` or `.tmpl` argument of `dex serve` through gomplate, into `/tmp/dex.config.yaml-*` ([entrypoint][entrypoint]).
   - Literal `{{` in the config is interpreted.
   - `readOnlyRootFilesystem` needs a writable `/tmp`.
   - v2.45.0 notes two CVEs in the bundled gomplate binary (CVE-2025-68121, CVE-2026-25934). They call gomplate optional, used only for config preprocessing ([v2.45.0 notes][rel-2450]).
6. **oauth2-proxy forces the approval screen by default.**
   - Dex ignores `skipApprovalScreen` when a request carries `approval_prompt=force` ([oauth2 docs][docs-oauth2], [handlers.go][handlers-go]).
   - oauth2-proxy's `--approval-prompt` defaults to `force` and cannot be emptied ([o2p options][o2p-overview], [o2p #3426][o2p-3426]).
   - Dex v2.45.1 only checks `approval_prompt == "force"` ([oauth2.go][oauth2-go]). So `--approval-prompt=auto`, or `--prompt=login` (which makes oauth2-proxy ignore approval-prompt), should skip the screen. Both are inferred, not tested.
7. **v2.45.0 changed failure behaviour.** `ContinueOnConnectorFailure` is now on by default ([v2.45.0 notes][rel-2450], [feature flags @v2.45.1][ff-2451]). A misconfigured LDAP or Microsoft connector no longer stops startup. Set `DEX_CONTINUE_ON_CONNECTOR_FAILURE=false` where that should be a failure.
8. **No login throttling.** I found no rate limiting or lockout on password login ([handlers.go][handlers-go]). Development only.
9. **Env expansion.** `DEX_EXPAND_ENV` defaults to true and expands `$VAR` inside `storage` and connector configs ([feature flags @v2.45.1][ff-2451], [config.go][config-go]). Static-password hashes are not expanded; `hashFromEnv` is explicit ([config.go][config-go]).
10. **CORS.** If a browser single-page app calls the token endpoint directly (public client plus PKCE), set `web.allowedOrigins`, which covers the discovery, token and keys endpoints ([server.go][server-go], [config.go Web][config-go]). This is not needed when wechart's API or oauth2-proxy is the client.
11. **Release pace.** Master is busy (commits on 2026-09-24 ([commits][commits])). But the last release is v2.45.1 of 2026-03-03, and before it v2.45.0 of 2026-02-23 and v2.44.0 of 2025-09-01 ([releases][rel-list]). The chart trails the binary ([Chart.yaml][chart-yaml]). There are 529 open issues ([repo][repo-api]).

## Footprint

- **Image size** (Docker Hub tags API `size` field for v2.45.1 ([hub tags][hub-v2451])):

  | Variant | linux/arm64 | linux/amd64 |
  |---|---|---|
  | alpine | 43,813,675 B | 48,082,348 B |
  | distroless | 40,169,749 B | 44,773,705 B |

  Whether this field is the compressed size is UNVERIFIED.
- **Storage backends:** `memory`, `sqlite3`, `postgres`, `mysql`, `etcd`, `kubernetes` ([config.go storages map][config-go]).
- **Idle memory:** UNVERIFIED. Neither the docs nor the chart give a figure; `resources: {}` ([values.yaml][chart-values]).
  - The one data point: v2.39.1 with `kubernetes` storage was OOM-killed at a 64 MB limit while checking CRDs at startup. It was closed via PR #4027 ([#4019][iss-4019]).
  - Measure with `docker stats` or `kubectl top`.
- **Startup time:** UNVERIFIED. Gate readiness on `/healthz/ready` ([serve.go][serve-go]).

## Observed at T315 and T324 (2026-09-25)

Settled by running it, not by the sources above:
- **The BusyBox `wget` healthcheck works** in compose (T315's review).
- **§4 pattern B works with openid-client 6.8.8.** In the Helm release on docker-desktop, the issuer is `http://localhost:5557/dex` for the browser. The API reaches the same Dex at its Service through `customFetch`, rewriting only the origin (`packages/api/src/auth/oidc.ts`). `deploy/helm/verify.sh` signed `writer` in through Dex's form, and the token's `iss` was accepted.
- **Docker Desktop publishes a LoadBalancer Service on the host's `localhost`** at its port: Dex at `localhost:5557`, beside wechart's web at 8089. A Service may list only ports free on the host: compose's Dex holds 5556, so the Helm Service has one port, 5557.
- **Run as UID 1001, with `readOnlyRootFilesystem` and an `emptyDir` at `/tmp`** for the entrypoint's gomplate output (Gotcha 5): the pod was Ready and served sign-in.
- Still unverified: the in-pod resolution of `host.docker.internal` (pattern C, unused), and the size of a 20-group token.

## Alternatives considered

Not requested; this brief covers one candidate.

## Open questions / unverified

1. **Idle memory and startup time** of v2.45.1 with `memory` storage. Measure them in the spike.
2. **Total ID and access token size** for the 20-group user, and whether an oauth2-proxy cookie session (ID, access and refresh tokens) goes over 4 KB. Decode a real token.
3. **Which issuer pattern (§4 A, B or C) to use.** Every hostname or LoadBalancer step on docker-desktop is UNVERIFIED:
   - `*.localtest.me` resolution;
   - LoadBalancer on `localhost`;
   - `host.docker.internal` inside pods;
   - the service CIDR, needed for a static `clusterIP`.
4. **openid-client `customFetch` rewriting** of back-channel URLs while the Dex issuer is kept (§4 B) has no worked example yet.
5. **AC-252's configurable claim name:** Dex only emits `groups`. Should a non-`groups` claim name be tested against a synthetic token instead? This is the caller's or user's decision.
6. **oauth2-proxy with `--approval-prompt=auto` or `--prompt=login`** skipping Dex's approval screen (Gotcha 6) is inferred from source, not run.
7. **The `rbac.create: false` chart install with memory storage** is inferred from source, not run.
8. **When the master-only session and logout features will ship** in a release: no milestone or date found.

<!-- link references -->
[repo-api]: https://github.com/dexidp/dex
[cncf]: https://www.cncf.io/projects/dex/
[commits]: https://github.com/dexidp/dex/commits/master
[milestones]: https://github.com/dexidp/dex/milestones
[rel-list]: https://github.com/dexidp/dex/releases
[rel-2450]: https://github.com/dexidp/dex/releases/tag/v2.45.0
[hub-v2451]: https://hub.docker.com/v2/repositories/dexidp/dex/tags?page_size=25&name=v2.45.1
[hub-latest]: https://hub.docker.com/v2/repositories/dexidp/dex/tags?page_size=10&name=latest
[hub-master]: https://hub.docker.com/v2/repositories/dexidp/dex/tags?page_size=10&name=master
[artifacts-wf]: https://github.com/dexidp/dex/blob/v2.45.1/.github/workflows/artifacts.yaml
[dockerfile]: https://github.com/dexidp/dex/blob/v2.45.1/Dockerfile
[entrypoint]: https://github.com/dexidp/dex/blob/v2.45.1/cmd/docker-entrypoint/main.go
[config-docker]: https://github.com/dexidp/dex/blob/v2.45.1/config.docker.yaml
[config-dev]: https://github.com/dexidp/dex/blob/v2.45.1/examples/config-dev.yaml
[config-go]: https://github.com/dexidp/dex/blob/v2.45.1/cmd/dex/config.go
[config-go-2440]: https://github.com/dexidp/dex/blob/v2.44.0/cmd/dex/config.go
[serve-go]: https://github.com/dexidp/dex/blob/v2.45.1/cmd/dex/serve.go
[storage-go]: https://github.com/dexidp/dex/blob/v2.45.1/storage/storage.go
[static-go]: https://github.com/dexidp/dex/blob/v2.45.1/storage/static.go
[memory-go]: https://github.com/dexidp/dex/blob/v2.45.1/storage/memory/memory.go
[k8s-storage-go]: https://github.com/dexidp/dex/blob/v2.45.1/storage/kubernetes/storage.go
[server-go]: https://github.com/dexidp/dex/blob/v2.45.1/server/server.go
[handlers-go]: https://github.com/dexidp/dex/blob/v2.45.1/server/handlers.go
[oauth2-go]: https://github.com/dexidp/dex/blob/v2.45.1/server/oauth2.go
[api-go]: https://github.com/dexidp/dex/blob/v2.45.1/server/api.go
[mock-go]: https://github.com/dexidp/dex/blob/v2.45.1/connector/mock/connectortest.go
[ms-go]: https://github.com/dexidp/dex/blob/v2.45.1/connector/microsoft/microsoft.go
[ldap-go]: https://github.com/dexidp/dex/blob/v2.45.1/connector/ldap/ldap.go
[password-html]: https://github.com/dexidp/dex/blob/v2.45.1/web/templates/password.html
[ff-2451]: https://github.com/dexidp/dex/blob/v2.45.1/pkg/featureflags/set.go
[ff-master]: https://github.com/dexidp/dex/blob/master/pkg/featureflags/set.go
[pr-4456]: https://github.com/dexidp/dex/pull/4456
[pr-4989]: https://github.com/dexidp/dex/pull/4989
[pr-4674]: https://github.com/dexidp/dex/pull/4674
[iss-4560]: https://github.com/dexidp/dex/issues/4560
[iss-1697]: https://github.com/dexidp/dex/issues/1697
[iss-1182]: https://github.com/dexidp/dex/issues/1182
[iss-4019]: https://github.com/dexidp/dex/issues/4019
[ghsa-7qjx]: https://github.com/dexidp/dex/security/advisories/GHSA-7qjx-gp9h-65qj
[docs-getting-started]: https://dexidp.io/docs/getting-started/
[docs-local]: https://dexidp.io/docs/connectors/local/
[docs-storage]: https://dexidp.io/docs/configuration/storage/
[docs-oauth2]: https://dexidp.io/docs/configuration/oauth2/
[docs-scopes]: https://dexidp.io/docs/configuration/custom-scopes-claims-clients/
[docs-ms]: https://dexidp.io/docs/connectors/microsoft/
[docs-ldap]: https://dexidp.io/docs/connectors/ldap/
[docs-oidc]: https://dexidp.io/docs/connectors/oidc/
[chart-yaml]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/Chart.yaml
[chart-values]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/values.yaml
[chart-deploy]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/templates/deployment.yaml
[chart-rbac]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/templates/rbac.yaml
[chart-svc]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/templates/service.yaml
[chart-secret]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/templates/secret.yaml
[chart-readme]: https://github.com/dexidp/helm-charts/blob/dex-0.24.1/charts/dex/README.md
[chart-index]: https://charts.dexidp.io/index.yaml
[chart-releases]: https://github.com/dexidp/helm-charts/releases
[docker-guide]: https://docs.docker.com/guides/dex/
[o2p-compose]: https://github.com/oauth2-proxy/oauth2-proxy/blob/master/contrib/local-environment/docker-compose.yaml
[o2p-dex]: https://github.com/oauth2-proxy/oauth2-proxy/blob/master/contrib/local-environment/dex.yaml
[o2p-cfg]: https://github.com/oauth2-proxy/oauth2-proxy/blob/master/contrib/local-environment/oauth2-proxy.cfg
[o2p-overview]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/
[o2p-logingov]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/login_gov
[o2p-sessions]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/session_storage/
[o2p-3426]: https://github.com/oauth2-proxy/oauth2-proxy/issues/3426
[o2p-rel]: https://github.com/oauth2-proxy/oauth2-proxy/releases/tag/v7.15.4
[oc-npm]: https://registry.npmjs.org/openid-client/latest
[oc-insecure]: https://github.com/panva/openid-client/blob/main/docs/functions/allowInsecureRequests.md
[oc-discovery-opts]: https://github.com/panva/openid-client/blob/main/docs/interfaces/DiscoveryRequestOptions.md
[oc-customfetch]: https://github.com/panva/openid-client/blob/main/docs/variables/customFetch.md
[oc-endsession]: https://github.com/panva/openid-client/blob/main/docs/functions/buildEndSessionUrl.md
[graph-gmg]: https://learn.microsoft.com/en-us/graph/api/directoryobject-getmembergroups?view=graph-rest-1.0
[graph-getbyids]: https://learn.microsoft.com/en-us/graph/api/directoryobject-getbyids?view=graph-rest-1.0
[entra-idtoken]: https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
[k8s-hostaliases]: https://kubernetes.io/docs/tasks/network/customize-hosts-file-for-pods/
[k8s-clusterip]: https://kubernetes.io/docs/concepts/services-networking/cluster-ip-allocation/
[go-json]: https://pkg.go.dev/encoding/json
[go-bcrypt]: https://pkg.go.dev/golang.org/x/crypto/bcrypt
[alpine]: https://alpinelinux.org/about/
[distroless]: https://github.com/GoogleContainerTools/distroless
[for-mac-4442]: https://github.com/docker/for-mac/issues/4442
[wechart-helm]: /Users/srajagopal/Work/wechart/docs/research/helm.md
