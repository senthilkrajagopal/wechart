---
library: oauth2-proxy
packages: []
version: 7.15.4
researched: 2026-09-25
sources: [
  https://github.com/oauth2-proxy/oauth2-proxy/releases,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/CHANGELOG.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/overview.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/alpha_config.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/sessions.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/features/endpoints.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/integrations/nginx.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/ms_entra_id.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/keycloak_oidc.md,
  https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/openid_connect.md,
  https://github.com/oauth2-proxy/oauth2-proxy/tree/v7.15.4 (source: oauthproxy.go, providers/, pkg/),
  https://github.com/oauth2-proxy/oauth2-proxy/security/advisories,
  https://github.com/oauth2-proxy/manifests/tree/oauth2-proxy-10.7.0/helm/oauth2-proxy,
  https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims,
  https://learn.microsoft.com/en-us/graph/api/user-list-transitivememberof?view=graph-rest-1.0,
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc,
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
]
---
# oauth2-proxy 7.15.4

> **Stale in one place, 2026-09-25** (architecture decision 1, [docs/inputs/2026-09-25-architecture-decisions.md](../inputs/2026-09-25-architecture-decisions.md)): "Cube reads the model from the API Service" (:228) no longer holds. Cube never calls wechart.

## Summary

oauth2-proxy is an MIT-licensed Go reverse proxy. It runs the OIDC authorization-code flow against a provider, keeps a session (an encrypted cookie or Redis), and passes the user's identity to the upstream in request headers ([repo][repo-api], [overview][ov]). wechart would run it as a container in front of the nginx-served SPA and the Fastify API. It can sit there as the edge reverse proxy, or behind nginx through `auth_request`. It is one of the two candidates in `docs/requirements.md` §P2.5 ("oauth2-proxy in front of wechart, or wechart's API as its own OIDC client"). This document covers only oauth2-proxy.

How it maps to the criteria (details and sources in the sections below):

| Criterion | What oauth2-proxy 7.15.4 does | Caveat |
|---|---|---|
| AC-251 (page → provider sign-in, API → 401, health exempt) | With `--skip-provider-button`, an unauthenticated page request gets a 302 to the provider. An `--api-route` path, or a request with `Accept: application/json`, gets `401 {}`. Health can be exempted with `--skip-auth-route`, or by never routing it through the proxy. | Without `--skip-provider-button`, pages get oauth2-proxy's own sign-in page with status 403. Skip-auth routes combined with `--reverse-proxy` have an open bypass (#3506). See Gotchas. |
| AC-252 (identity + groups from token; issuer, client, groups claim configurable) | `--oidc-issuer-url`, `--client-id`, and `--oidc-groups-claim` (dotted paths allowed). Groups reach the upstream as `X-Forwarded-Groups`, one header line per group. The user's display name is not a standard header. | `name` needs alpha-config `additionalClaims`, or the API reading the forwarded ID token. |
| AC-253 (sign out ends the session) | `/oauth2/sign_out` clears the cookie. With Redis it also deletes the server-side session. It can then redirect to the provider's `end_session_endpoint`, with the `{id_token}` placeholder (≥7.15.0). | With the cookie store, a copied cookie stays valid until it expires. There is no back-channel logout receiver (#1224, open). |
| AC-254 (security off) | A deployment runs without the container. Helm: a condition or `if` around it. Compose: a profile. | wechart's API must then ignore identity headers entirely. That is wechart's code, not oauth2-proxy's. |
| AC-255 (20 groups; production hundreds, nested) | Groups are whatever the token or userinfo claim holds, so 20 is trivial. Nesting is the provider's job. | Hundreds of groups inflate the cookie (use Redis) and the upstream headers. Node's 16 KiB default header limit is reachable at a few hundred GUIDs. |
| AC-258 (Entra ID / broker) | Dedicated `entra-id` provider. It detects overage (`_claim_names.groups`) and pages Microsoft Graph `/me/transitiveMemberOf` for group IDs. | Graph groups are only fetched at sign-in and are lost on a refresh. A Graph failure silently yields no groups (fix PR #3535 is open, not released). Graph returns object IDs only. |
| AC-008 (groups into Cube's security context) | Not oauth2-proxy's concern. The API receives groups in headers and signs Cube JWTs itself. | The API must trust those headers only from the proxy. See §"How the API can trust the headers". |

Question index: Q1 → Install. Q2 → Init / auth pattern and API surface (headers, trust). Q3 → API surface "Groups", Gotchas 1–5. Q4 → API surface "Sessions and logout". Q5 → API surface "SPA behaviour". Q6 → Init "Switching it off". Q7 → Install and Init. Q8 → Gotchas.

## Install

**Version.** The latest stable release is **v7.15.4**, published 2026-08-20. It upgrades Go to 1.26.7 and all dependencies, and fixes 11 dependency CVEs. It has no breaking changes ([release v7.15.4][rel-7154], [CHANGELOG][cl]). The previous releases were v7.15.3 (2026-06-09), v7.15.2 (2026-04-14, several critical auth-bypass fixes), v7.15.1 (2026-03-23) and v7.15.0 (2026-03-18) ([releases][rel]).

**License and maintenance.** The license is MIT. The repository is not archived, was last pushed 2026-09-25, and has about 15k stars and 290 open issues ([GitHub API][repo-api]). Seven security advisories were published between 2025-07 and 2026-04, each with a patched release ([advisories][ghsa-list]).

**Images.** They are published on quay.io ([installation.md][install]). The Makefile builds two variants ([Makefile][mk]):
- **default:** `gcr.io/distroless/static:nonroot` base, for linux/amd64, arm64, ppc64le, arm/v7 and s390x;
- **`-alpine`:** `alpine:3.24.1` base.

Tags and multi-arch manifest-list digests for 7.15.4 ([quay tag API][quay]):
- `quay.io/oauth2-proxy/oauth2-proxy:v7.15.4@sha256:b1b2021fe8f4004573e8d690dec6c7bb29cc44364572cf8510a05bf3a0ae2ded` (distroless; no shell)
- `quay.io/oauth2-proxy/oauth2-proxy:v7.15.4-alpine@sha256:77a608f6da587bda7fe1371c503dc89b39d0fb9d78dc3d47c1ef253abfc9d2bd`

The entrypoint is `/bin/oauth2-proxy` ([Dockerfile][dockerfile]). The default listen address is `127.0.0.1:4180`, so a container must set `--http-address=0.0.0.0:4180` ([overview][ov]). The upstream compose example does exactly this ([local-environment cfg][le-cfg]).

**Helm chart (optional).** The latest `oauth2-proxy/manifests` chart is **10.7.0**, with `appVersion: 7.15.3` ([Chart.yaml][chart], [chart releases][chart-rel]), so `image.tag: v7.15.4` must be set explicitly. Its details:
- The image defaults to the `quay.io` registry. Probes are `/ping` (liveness) and `/ready` (readiness) ([deployment.yaml][chart-deploy]).
- Values include `config.existingSecret`, `extraArgs`, `extraEnv`, `alphaConfig.enabled`, `sessionStorage.type: cookie|redis`, an optional `redis-ha` subchart (off by default), `service.type: ClusterIP`, and `securityContext.runAsUser: 2000` ([values.yaml][chart-values]).

**Runtime requirements.**
- An OIDC provider reachable at the same issuer URL from the browser and from the container (see Gotcha 12).
- A 16/24/32-byte cookie secret. The documented generator is `openssl rand -base64 32 | tr -- '+/' '-_'` ([overview][ov]).
- For the Redis session store, a Redis endpoint. The store is validated at startup by a SET/GET/DEL test key ([pkg/validation/sessions.go][src-valsess]).

No npm packages are involved.

## Init / auth pattern

### Two topologies

**A. Full reverse proxy: oauth2-proxy is the edge.**
- Traffic flows browser → oauth2-proxy → upstream. In Helm the upstream is the web nginx Service, which already proxies `/api/` to the API. In compose dev it is the Vite dev server on the host, which proxies `/api` to the API on the host (`packages/web/vite.config.ts`).
- oauth2-proxy injects `X-Forwarded-User`/`-Email`/`-Groups`/`-Preferred-Username` into every proxied request (`--pass-user-headers`, default true). It strips client-supplied copies of any header it would set (`--skip-auth-strip-headers`, default true; each injected header has `PreserveRequestValue=false`) ([overview][ov], [legacy_options.go][src-legacy]).
- nginx copies each client header line to its upstream individually, skipping only names it sets itself with `proxy_set_header` ([ngx_http_proxy_module.c loop][nginx-src-proxy]). So the API still sees one `X-Forwarded-Groups` line per group.

**B. nginx `auth_request`: nginx stays the edge.**
- nginx sends a subrequest to `/oauth2/auth`. On success that returns `202` with `X-Auth-Request-*` response headers (`--set-xauthrequest`). Without a session it returns `401`, and on failed authorization `403` ([oauthproxy.go AuthOnly][src-op], [endpoints][ep]).
- nginx copies values into request headers via `auth_request_set` / `proxy_set_header` ([nginx integration doc][nginx-int]).
- The nginx.org packages that `nginxinc/nginx-unprivileged:1.30.5-alpine-slim` installs are built with `--with-http_auth_request_module` ([pkg-oss alpine Makefile][pkgoss], [unprivileged alpine-slim Dockerfile][du-slim]). The module is not in a default source build ([auth_request docs][nginx-authreq]).

Technical differences that bear on the ACs:

| Point | A. Full proxy | B. auth_request |
|---|---|---|
| Group list fidelity | One header line per group, from `header.Add` per value ([injector.go][src-injector]). Node's `req.headersDistinct` gives an exact array (Node ≥18.3/16.17) ([Node http.md][node-http]). | nginx ≥1.23 combines repeated `X-Auth-Request-Groups` lines into one `$upstream_http_…` value ([nginx CHANGES-1.24][nginx-ch124]). A group name containing the separator becomes ambiguous. The exact separator is UNVERIFIED in nginx prose docs. |
| `--reverse-proxy` needed | No, if oauth2-proxy is the edge. | Yes ([nginx integration doc][nginx-int]). `--trusted-proxy-ip` is then mandatory in practice (Gotcha 7). |
| Same header contract in compose and Helm | Yes: dev has no nginx, and oauth2-proxy can front Vite directly. | Dev would need its own nginx container, or a different topology. |
| Long API calls | oauth2-proxy's `--upstream-timeout` defaults to 30s ([overview][ov]). Raise it above wechart's longest API request. | Not in the data path after the subrequest. |
| Refresh cookie propagation | Automatic: oauth2-proxy writes `Set-Cookie` on the proxied response. | nginx must copy `Set-Cookie` from the subrequest, including split `_oauth2_proxy_1` cookies. The doc example handles only two parts ([nginx integration doc][nginx-int]). |
| Upstream response header buffer | Not applicable. | The `/oauth2/auth` response carries all groups. nginx's `proxy_buffer_size` defaults to 4k or 8k, and a bigger header makes the response "invalid" ([proxy module][nginx-proxy]). It must be raised for users with many groups. |

### Minimal configuration (environment-variable form)

Every flag maps to `OAUTH2_PROXY_<FLAG>`, and list flags use the plural with commas ([overview][ov]).

Common to both topologies, for the development provider (Keycloak, via the generic `oidc` or `keycloak-oidc` provider):

```sh
OAUTH2_PROXY_HTTP_ADDRESS=0.0.0.0:4180
OAUTH2_PROXY_PROVIDER=oidc                      # or keycloak-oidc
OAUTH2_PROXY_OIDC_ISSUER_URL=<issuer>           # AC-252 "issuer"
OAUTH2_PROXY_CLIENT_ID=<client>                 # AC-252 "client"
OAUTH2_PROXY_CLIENT_SECRET_FILE=/secrets/client-secret
OAUTH2_PROXY_OIDC_GROUPS_CLAIM=groups           # AC-252 "groups claim"; dotted paths allowed
OAUTH2_PROXY_OIDC_EMAIL_CLAIM=email             # must be a claim EVERY user has (Gotcha 9)
OAUTH2_PROXY_EMAIL_DOMAINS=*                    # wechart authorizes by group itself
OAUTH2_PROXY_CODE_CHALLENGE_METHOD=S256
OAUTH2_PROXY_COOKIE_SECRET_FILE / OAUTH2_PROXY_COOKIE_SECRET=<32 random bytes, base64url>
OAUTH2_PROXY_COOKIE_SAMESITE=lax
OAUTH2_PROXY_COOKIE_SECURE=false                # dev over http only; default is true
OAUTH2_PROXY_SKIP_PROVIDER_BUTTON=true          # AC-251: page → provider, not an oauth2-proxy page
OAUTH2_PROXY_WHITELIST_DOMAINS=<idp-host:port>  # so sign_out?rd=<end_session_endpoint> is honoured
OAUTH2_PROXY_SESSION_STORE_TYPE=redis           # see Gotchas 3, 4, 6
OAUTH2_PROXY_REDIS_CONNECTION_URL=redis://<host>:6379
```

Sources for the flags above:
- all flag names, types and defaults, including `--cookie-secret-file` (added 7.11.0 per the [CHANGELOG][cl]): [overview][ov];
- `--code-challenge-method` in the Keycloak example: [keycloak_oidc.md][kc-doc];
- the dotted claim paths: [claim_extractor.go `getClaimFrom`][src-claims].

Full-proxy additions (topology A):

```sh
OAUTH2_PROXY_UPSTREAMS=http://<web-service>:8089/   # Helm: nginx web Service; compose: http://host.docker.internal:<vite-port>/
OAUTH2_PROXY_API_ROUTES=^/api/                      # AC-251: 401, never a redirect, for /api/*
OAUTH2_PROXY_SKIP_AUTH_ROUTES=GET=^/healthz$,GET=^/api/health$   # AC-251 health exemption; see Gotcha 7
OAUTH2_PROXY_UPSTREAM_TIMEOUT=<above wechart's longest API request>
# do NOT set --reverse-proxy when oauth2-proxy is the edge
```

The `method=path_regex` form of `--skip-auth-route` matches the normalized path only, since 7.11.0 and 7.15.2 ([overview][ov], [CHANGELOG][cl]). `--api-route` returns 401 with no redirect ([overview][ov], [oauthproxy.go Proxy][src-op]).

auth_request additions (topology B): `--reverse-proxy=true`, `--set-xauthrequest=true`, `--trusted-proxy-ip=<nginx pod CIDR>` ([overview][ov], [nginx integration doc][nginx-int]). Here is a sketch of wechart's `web-config.yaml` with security on, adapted from the upstream nginx doc ([nginx integration doc][nginx-int]):

```nginx
location /oauth2/ { proxy_pass http://<oauth2-proxy>:4180; proxy_set_header X-Auth-Request-Redirect $request_uri; }
location = /oauth2/auth {
    internal;
    proxy_pass http://<oauth2-proxy>:4180;
    proxy_set_header X-Forwarded-Uri $request_uri;   # always overwrite: GHSA-7x63 mitigation
    proxy_set_header Content-Length ""; proxy_pass_request_body off;
    proxy_buffer_size 32k;                            # groups in response headers (Gotcha 5)
}
location = /healthz { ... }                           # no auth_request: AC-251 exemption
location = /api/health { proxy_pass http://<api>; }   # no auth_request
location /api/ {
    auth_request /oauth2/auth;                        # 401 passes through as 401
    auth_request_set $wc_user   $upstream_http_x_auth_request_user;
    auth_request_set $wc_groups $upstream_http_x_auth_request_groups;
    auth_request_set $wc_cookie $upstream_http_set_cookie;
    add_header Set-Cookie $wc_cookie;
    proxy_set_header X-Forwarded-User   $wc_user;     # proxy_set_header suppresses the client's copy
    proxy_set_header X-Forwarded-Groups $wc_groups;
    proxy_pass http://<api>;
}
location / { auth_request /oauth2/auth; error_page 401 = @signin; try_files $uri /index.html; }
location @signin { return 302 /oauth2/start?rd=$request_uri; }
```

Two facts behind this sketch:
- A client header with a name set by `proxy_set_header` is not forwarded ([ngx_http_proxy_module.c][nginx-src-proxy]).
- `/oauth2/start` begins the provider redirect directly ([oauthproxy.go OAuthStart][src-op]).

### Provider-specific configuration

- **Keycloak (development).**
  - Create a client scope "groups" with a *Group Membership* mapper whose Token Claim Name matches `--oidc-groups-claim`. With "Full group path" on, groups look like `/parent/child`.
  - Add an audience mapper so `aud` contains the client ID, or list the audience in `--oidc-extra-audience`.
  - Test users need a verified email ([keycloak_oidc.md][kc-doc]). The `email_verified` rule is enforced in code ([provider_data.go buildSessionFromClaims][src-pd]).
  - The upstream compose example pins `keycloak/keycloak:26.7` and `quay.io/oauth2-proxy/oauth2-proxy:v7.15.4`. It gives Keycloak the network alias `keycloak.localtest.me`, so the issuer `http://keycloak.localtest.me:9080/realms/oauth2-proxy` is the same from the browser and the container ([docker-compose-keycloak.yaml][le-compose], [oauth2-proxy-keycloak.cfg][le-cfg]).
- **Generic OIDC.** `provider=oidc`. The default scope is `openid email profile`, plus `groups` when `--allowed-group` is set and `--scope` is not ([oidc.go][src-oidc], [overview][ov]).
- **Microsoft Entra ID (AC-258).**
  - Settings: `provider="entra-id"`, `oidc_issuer_url="https://login.microsoftonline.com/<tenant-id>/v2.0"`, and `scope="openid User.Read"` when users can exceed 200 groups ([ms_entra_id docs page][entra-site]).
  - Groups must be enabled in the app registration's token configuration ([ms_entra_id.md][entra-doc]).
  - Refresh tokens are issued only if `offline_access` is requested ([MS auth-code flow][ms-authcode]). That choice interacts with overage (Gotcha 1).
  - Workload-identity auth (`--entra-id-federated-token-auth`) and multi-tenant (`--entra-id-allowed-tenant` + `insecure_oidc_skip_issuer_verification`) are supported ([ms_entra_id.md][entra-doc]).
- **On-prem AD through a broker.** Use `provider=oidc` against the broker (Keycloak with LDAP federation, Dex, ADFS). A dedicated `adfs` provider also exists ([adfs.md][adfs-doc]). Nested-group expansion and the groups claim format are the broker's responsibility. oauth2-proxy only reads the claim ([claim_extractor.go][src-claims]).

### Switching it off (AC-254)

oauth2-proxy has no "off" switch. A deployment in single-user mode simply doesn't run it.
- **Helm.** Wrap wechart's own oauth2-proxy Deployment and Service in `{{- if .Values.security.enabled }}`. Or add the upstream chart as a dependency with `condition: security.enabled` ("If this path exists in the top parent's values and resolves to a boolean value, the chart will be enabled or disabled") ([Helm v3 charts][helm-deps]). A chart dependency runs through `helm dependency update`. The Helm pinned in `/Users/srajagopal/Work/wechart/docs/research/helm.md` (3.17.2) is affected by CVE-2025-53547 on that path, fixed in 3.17.4 (helm.md Gotcha 14).
  - Topology A: the public Service points at oauth2-proxy when security is on and at nginx when it is off.
  - Topology B: the nginx ConfigMap renders the `auth_request` lines only when security is on.
- **Compose.** Put `oauth2-proxy`, the dev IdP and Redis under `profiles: [security]`. "Services without a `profiles` attribute are always enabled". Enable the profile with `--profile security` or `COMPOSE_PROFILES=security`. Dependencies must share the profile or have none ([Compose profiles][compose-profiles]).
- In both, the API needs a mode flag. Security on: refuse any request that lacks proxy-authenticated identity. Security off: ignore identity headers and act as the single Super-Admin user. This is wechart logic.

## API surface we will use

### Endpoints (default `--proxy-prefix=/oauth2`) ([endpoints.md][ep], [oauthproxy.go buildServeMux][src-op])

| Path | Behaviour |
|---|---|
| `/oauth2/start?rd=<path>` | Sets a CSRF cookie and returns a 302 to the provider's authorize URL, with PKCE if configured ([oauthproxy.go doOAuthStart][src-op]). |
| `/oauth2/callback` | Redeems the code, then calls `EnrichSession` (this is where the Entra Graph lookup runs), validates, saves the session, and redirects to `rd` ([oauthproxy.go OAuthCallback][src-op]). |
| `/oauth2/sign_in` | With `--skip-provider-button`, runs `OAuthStart`. Otherwise it renders oauth2-proxy's sign-in page ([oauthproxy.go SignIn][src-op]). |
| `/oauth2/sign_out[?rd=<url>]` | Registered for any HTTP method. It calls `--backend-logout-url` (server-side GET), clears the session, then 302s to `rd` or `X-Auth-Request-Redirect`. That target must be in `--whitelist-domain`, and `{id_token}` in it is replaced ([oauthproxy.go SignOut][src-op], [endpoints.md][ep]). |
| `/oauth2/userinfo` | JSON `{"user","email","groups","preferredUsername","additionalClaims"}`, or 401 ([oauthproxy.go UserInfo][src-op]). The SPA can call it to show the user (AC-252). `user` is the `sub` claim, not configurable ([provider_data.go][src-pd]). |
| `/oauth2/auth` | For auth_request: 202 with headers, 401 with no session, 403 on failed authorization. Query `allowed_groups=` is supported ([endpoints.md][ep], [oauthproxy.go AuthOnly][src-op]). |
| `/ping`, `/ready` | Liveness, and readiness including Redis ([endpoints.md][ep]). |

### Headers the API receives ([legacy_options.go][src-legacy], [overview][ov])

| Flag | Request header to the upstream (topology A) | Response header on `/oauth2/auth` (topology B) |
|---|---|---|
| `--pass-user-headers` (default true) | `X-Forwarded-User` (sub), `X-Forwarded-Email`, `X-Forwarded-Groups` (one line per group), `X-Forwarded-Preferred-Username` | — |
| `--set-xauthrequest` | — | `X-Auth-Request-User`/`-Email`/`-Groups`/`-Preferred-Username` |
| `--pass-authorization-header` / `--set-authorization-header` | `Authorization: Bearer <id_token>` | same, on the response |
| `--pass-access-token` | `X-Forwarded-Access-Token` | with `--set-xauthrequest`: `X-Auth-Request-Access-Token` |
| `--pass-basic-auth` + `--basic-auth-password` | `Authorization: Basic base64(<user>:<password>)`, added only when a password is set | `--set-basic-auth` |
| `--prefer-email-to-user` | puts the email in `X-Forwarded-User` | — |

- A display name (`name`) or any other claim needs alpha config `providers[].additionalClaims` (added 7.15.0, [PR #2685][pr2685]). Such claims appear in `/oauth2/userinfo` `additionalClaims` and can be injected as headers, but only through alpha config ([alpha_config.md][alpha]). Alpha config "reserve[s] the right to make breaking changes… with no notice", and 7.14.0 broke its header-injection format ([alpha_config.md][alpha], [CHANGELOG][cl]).
- A groups claim that is a single string becomes a one-element list, and non-string entries are JSON-encoded ([util.go CoerceClaim][src-util]).
- A claim missing from the ID token is looked up from the provider's userinfo (profile) URL, unless `--skip-claims-from-profile-url` is set ([claim_extractor.go][src-claims], [overview][ov]).

### How the API can trust the headers (Q2)

Findings:
- In topology A, oauth2-proxy strips client copies of the headers it injects, so a request that passes through it is clean ([overview][ov]). Since 7.13.0, header names are normalized for stripping, so `X_Forwarded_Groups` counts too ([GHSA-vjrc][ghsa-vjrc]).
- The API is not reachable only through the proxy. Cube reads the model from the API Service (`WECHART_CUBE_STORE_URL`), any in-cluster pod can reach the ClusterIP, and in dev the API listens on host port 4100 (`deploy/helm/wechart/templates/api.yaml`, `docker-compose.yml`). Headers alone are therefore spoofable by anything that bypasses the proxy.
- **NetworkPolicy** only works when the cluster's network plugin enforces it: "Creating a NetworkPolicy resource without a controller that implements it will have no effect" ([Kubernetes docs][k8s-np]). Whether Docker Desktop's Kubernetes enforces it is UNVERIFIED. A 2020 report says it did not ([docker/for-mac#4626][dfm-4626]).

Mechanisms oauth2-proxy offers for the API to authenticate the hop:
1. **A shared secret via basic auth** (legacy flags, not alpha): `--basic-auth-password=<secret>`. oauth2-proxy then adds `Authorization: Basic base64(<sub>:<secret>)` to every proxied request, or with `--set-basic-auth` to the auth_request response ([legacy_options.go][src-legacy], [overview][ov]). The API compares the password in constant time. This conflicts with `--pass-authorization-header`, because Node discards duplicate `authorization` headers ([Node http.md][node-http]). The secret is sent in clear on the in-cluster hop unless that hop uses TLS.
2. **A shared-secret custom header via alpha config** `injectRequestHeaders` with `values: [{fromEnv: …}]`, the `HeaderValue` fields `value`/`fromEnv`/`fromFile` ([alpha_config.md][alpha]). This has the alpha stability caveat above.
3. **Verifying the forwarded ID token** (`--pass-authorization-header`) against the issuer's JWKS in the API. This is cryptographic, and it gives `name` and the groups claim directly. Limits:
   - Entra overage groups come from Graph, not the token, so they are not in it.
   - The ID token expires. oauth2-proxy only refreshes when `--cookie-refresh` > 0, and it keeps the old ID token when the provider's refresh response has none ([oidc.go redeemRefreshToken][src-oidc], [stored_session.go][src-stored]).
   - A large token can exceed nginx's 8k single-header buffer (Gotcha 5).
   - Tokens for APIs you don't own must not be validated. With `scope=openid User.Read` on Entra, the *access* token is a Graph token ([MS OIDC doc][ms-oidc]). `--pass-access-token` is therefore not a verification path on Entra.

## Gotchas

1. **Entra overage groups are fetched only at sign-in and replaced on refresh.**
   - `EnrichSession`, which holds the overage check and the Graph call, runs only in `OAuthCallback` ([oauthproxy.go][src-op], [ms_entra_id.go][src-entra]).
   - The refresh path calls `provider.RefreshSession` → `redeemRefreshToken`, which sets `s.Groups = newSession.Groups` whenever the refresh response has an ID token. `EnrichSession` is not called again ([oidc.go][src-oidc], [ms_entra_id.go][src-entra], [stored_session.go][src-stored]).
   - An overage ID token has no `groups` claim ([MS group claims][ms-groups]). So after the first refresh, an overage user's groups become empty.
   - Refresh only happens with `--cookie-refresh` > 0 and a refresh token, and Entra issues refresh tokens only for `offline_access` ([MS auth-code flow][ms-authcode]).
   - This is derived from source; no issue was found tracking it. Consequence: with Entra and >200 groups, either don't request `offline_access` / don't set `--cookie-refresh` (then groups and access stay frozen until `--cookie-expire`, see Gotcha 4), or keep every user under 200 groups.
2. **A Graph failure yields a signed-in user with no overage groups.** `addGraphGroupsToSession` logs and `return nil` on a failed Graph call ([ms_entra_id.go][src-entra]). The docs say "Without proper scope, user with 200+ groups will authenticate with 0 groups" ([ms_entra_id.md][entra-doc]). The fix, [PR #3535][pr3535], is **open** and unreleased as of 2026-09-25. Consent problems with `User.Read` vs `Group.Read.All` are reported in [#2984][i2984].
3. **Group identifiers differ by Entra configuration, and the Graph fallback is IDs only.**
   - oauth2-proxy requests `transitiveMemberOf?$select=id&$top=100`, follows `@odata.nextLink`, and appends each `id` ([ms_entra_id.go][src-entra]).
   - `transitiveMemberOf` also returns directory roles and administrative units ([Graph docs][ms-graph-tmo]), and oauth2-proxy doesn't filter them out.
   - In tokens, groups are ObjectIds by default. `sAMAccountName`/SID formats exist only for groups synced from on-prem AD. Cloud display names exist only with "Groups assigned to the application" ([MS group claims][ms-groups]).
   - So a tenant emitting `sAMAccountName` gives names below 200 groups and GUIDs above it. wechart's folder permissions (F26) must use one format consistently.
   - "Groups assigned to the application" avoids overage but excludes nested groups ("the user must be a direct member") ([MS group claims][ms-groups]). R12 requires nested groups.
   - Group filtering only applies up to 1,000 memberships ([MS group claims][ms-groups]).
4. **Without `--cookie-refresh`, the provider is never consulted after sign-in.** `needsRefresh` is false when the refresh period is 0. `getValidatedSession` then returns the stored session without validating it ([stored_session.go][src-stored]). A user removed from a group or disabled keeps their token's groups until `--cookie-expire`, which defaults to 168h ([overview][ov]). The docs recommend cookie_refresh = access-token lifetime minus 1 minute, and cookie_expire = refresh-token lifetime ([sessions.md][sessions]).
5. **Header and cookie sizes with hundreds of groups.**
   - **Cookie store.** The whole session (ID, access and refresh tokens, groups) is packed into the cookie. It is split into `_oauth2_proxy_N` parts above 4000 bytes, with the logged warning "Please use server side session storage (eg. Redis) instead" ([cookie session_store.go][src-cookie], [session_state.go][src-ss]).
   - **Redis store.** The cookie is a short ticket, and the session is encrypted per ticket in Redis ([sessions.md][sessions]).
   - **Upstream headers.** Each group is a separate header line ([injector.go][src-injector]).
     - Derived arithmetic: an Entra GUID line `X-Forwarded-Groups: <36 chars>\r\n` is about 58 bytes, so 300 groups is about 17 KB.
     - That exceeds Node's default `--max-http-header-size` of 16 KiB (16384 bytes) ([Node CLI][node-cli]; also `/Users/srajagopal/Work/wechart/docs/research/router.md`, 431 on overflow).
     - A reported case: 152 Azure groups with long names caused 431s even with Redis sessions ([#1902][i1902], closed stale).
     - In topology A through nginx, the headers from oauth2-proxy count against `large_client_header_buffers` (default `4 8k`), and any single header line must fit in 8k or nginx returns 400 ([core module][nginx-core]). A `Bearer <id_token>` holding 200 GUIDs is likely over 8k (derived).
     - In topology B, the `/oauth2/auth` response headers must fit `proxy_buffer_size` (default 4k|8k) ([proxy module][nginx-proxy]).
     - Whether oauth2-proxy strips its own session cookie before proxying is UNVERIFIED ([#388][i388], closed; resolution not visible).
6. **Cookie store and concurrent requests.** "Concurrent requests can create session conflicts requiring re-authentication, since this implementation cannot lock sessions during updates and refreshes" ([sessions.md][sessions]). A dashboard with 10 tiles makes parallel `/api` calls. The Redis store takes a refresh lock, with a 5s obtain timeout and 2s lock duration ([stored_session.go][src-stored]).
7. **Skip-auth routes combined with `--reverse-proxy`.**
   - GHSA-7x63 (critical): `X-Forwarded-Uri` spoofing bypasses auth when `--reverse-proxy` and skip-auth rules are both set. 7.15.2 added `--trusted-proxy-ip`, which still defaults to trusting all ([GHSA-7x63][ghsa-7x63], [overview][ov]).
   - Issue [#3506][i3506] (open, 2026-08-17) says ≤7.15.3 remains bypassable with `--reverse-proxy`, no `--trusted-proxy-ip`, and skip-auth routes. The fix, [PR #3509][pr3509] ("no proxies are trusted by default"), is open, and 7.15.4 is a dependency-only release ([CHANGELOG][cl]).
   - Therefore do one of the following:
     - Topology A: don't set `--reverse-proxy`.
     - Topology B: set `--trusted-proxy-ip`, overwrite `X-Forwarded-Uri` in nginx, and exempt health routes in nginx rather than with skip-auth routes.
   - Older route bypasses were fixed in 7.11.0 (query string, [GHSA-7rh7][ghsa-list]) and 7.15.2 (fragment, and health-check User-Agent in auth_request mode) ([GHSA-5hvv][ghsa-5hvv]). Pin ≥7.15.2. 7.15.4 is current.
8. **SPA fetches.** Without `--api-route`, an unauthenticated `fetch('/api/…')` is treated as AJAX only if `Accept` lists exactly `application/json` ([oauthproxy.go isAjax][src-op]). Otherwise it gets a 302 to the provider, which a cross-origin `fetch` cannot follow usefully. The 401 body is `{}` with `Content-Type: application/json` ([oauthproxy.go errorJSON][src-op]). The SPA should do a full-page navigation (for example reload) on 401 to start sign-in. Since 7.14.2, `/oauth2/auth` returns 401 again, not 302; 7.14.1 changed it and 7.14.2 reverted ([CHANGELOG][cl]).
9. **An email is mandatory by default.**
   - The OIDC `EnrichSession` fails with "neither the id_token nor the profileURL set an email" ([oidc.go][src-oidc]).
   - If `--oidc-email-claim` is `email`, an `email_verified: false` claim rejects the user unless `--insecure-oidc-allow-unverified-email` is set ([provider_data.go][src-pd]).
   - The Entra single-tenant examples request only `openid` / `openid User.Read` ([entra docs page][entra-site]). Whether their email then comes from the Graph userinfo profile-URL fallback is UNVERIFIED.
   - For brokers or users without mail, point `--oidc-email-claim` at a claim every user has (for example `preferred_username` or `upn`).
10. **Logout.**
    - `/oauth2/sign_out` "only removes oauth2-proxy's own cookies… the user is still logged in with the authentication provider and may automatically re-login" ([endpoints.md][ep]). To make the next request need a real sign-in, redirect to the provider's `end_session_endpoint` through `rd`, with `id_token_hint={id_token}` for providers that take it ([endpoints.md][ep]). The `{id_token}` substitution in redirects arrived in 7.15.0 ([CHANGELOG][cl]).
    - Backend logout (`--backend-logout-url`) never fired before 7.15.0, because the session was cleared first ([PR #3352][pr3352]).
    - Entra's logout is a browser redirect to `/oauth2/v2.0/logout?post_logout_redirect_uri=…`. The documented parameters are `post_logout_redirect_uri` and `logout_hint` ([MS OIDC][ms-oidc]).
    - Single sign-out from other apps needs the RP to receive front- or back-channel logout. oauth2-proxy has no back-channel endpoint ([#1224][i1224], open since 2021). Whether `/oauth2/sign_out` works as an Entra front-channel logout URL (iframe, SameSite cookies) is UNVERIFIED.
    - `sign_out` accepts GET, so a cross-site link can sign a user out ([oauthproxy.go buildProxySubrouter][src-op]).
11. **The page status without `--skip-provider-button`.** An unauthenticated page gets oauth2-proxy's sign-in page with HTTP 403, not a redirect ([oauthproxy.go Proxy][src-op]). This satisfies "no wechart content" but not "send … to the provider's sign-in".
12. **The issuer URL must match in the browser and the container.** Discovery, and `iss` verification unless `--insecure-oidc-skip-issuer-verification`, use `--oidc-issuer-url` ([providers.go][src-providers], [overview][ov]). The upstream compose example solves this with a `*.localtest.me` alias ([local env][le-compose]). The alternative is `--skip-oidc-discovery` with `--login-url` (browser-facing), `--redeem-url` and `--oidc-jwks-url` (internal) ([overview][ov]).
13. **Other smaller points.**
    - `--cookie-secure` defaults to true, and plain-http dev needs `false` ([overview][ov], [openid_connect.md][oidc-doc]).
    - `--cookie-csrf-per-request` can pile up cookies into 431s ([#2163][i2163]). 7.11.0 added `--cookie-csrf-per-request-limit` ([CHANGELOG][cl]).
    - `--session-cookie-minimal` cannot be combined with `--cookie-refresh` or with id/access token headers ([validation/sessions.go][src-valsess]).
    - 7.15.3 prints "undefined" for `--version` ([#3451][i3451], open).
    - The proxied response carries a `GAP-Auth: <email>` header to the browser ([oauthproxy.go addHeadersForProxying][src-op]).
14. **AC-008 downstream (not oauth2-proxy).** wechart's Cube JWT will carry all the user's groups. Cube's API is a Node server too, and the Node 16 KiB default header limit applies unless Cube raises it. That is UNVERIFIED for Cube v1.7.45 and belongs in the Cube research.

## Alternatives considered

Not requested. The other candidate named in §P2.5, wechart's API as its own OIDC client, is to be researched separately.

## Open questions / unverified

- UNVERIFIED: whether Docker Desktop's Kubernetes enforces NetworkPolicy. The only source is a 2020 issue saying it did not ([#4626][dfm-4626]). This decides whether network isolation can be part of the trust model on docker-desktop. Check by applying a deny policy and curling.
- UNVERIFIED: the separator nginx uses when it combines repeated `X-Auth-Request-Groups` lines into `$upstream_http_x_auth_request_groups` (topology B). CHANGES-1.24 says only that they are "combine[d]" ([nginx CHANGES-1.24][nginx-ch124]).
- UNVERIFIED: whether oauth2-proxy 7.15.4 removes its `_oauth2_proxy*` cookies from requests it proxies upstream ([#388][i388] resolution not visible). This matters for header size with the cookie store.
- UNVERIFIED: whether Entra returns a *signed* ID token on refresh. The MS page calls the refresh-response `id_token` "An unsigned JSON Web Token" ([MS auth-code flow][ms-authcode]). oauth2-proxy verifies any ID token present on refresh and errors if verification fails ([oidc.go createSession][src-oidc]). 7.9.0 fixed an Entra refresh bug for workload identity ([CHANGELOG][cl]). To be checked at the phase-2 end check (AC-258).
- UNVERIFIED: how the Entra examples that request only `openid` satisfy the mandatory email (Gotcha 9).
- UNVERIFIED: Keycloak's behaviour when `--backend-logout-url=<end_session>?id_token_hint={id_token}` is called server-side without browser cookies. There is a support thread with no maintainer answer ([#2613][i2613]). The front-channel `rd` redirect is the documented path. This belongs in the dev-provider research.
- UNVERIFIED: whether the Vite dev server passes the injected `X-Forwarded-*` headers through its `/api` proxy unchanged (topology A in compose). This belongs in a Vite / http-proxy check.
- Decision inputs for the caller, which are design choices and not oauth2-proxy facts:
  - which trust mechanism the API uses (basic-auth secret, alpha header secret, ID-token verification, network policy);
  - topology A or B;
  - whether to show `preferred_username`/email or fetch `name` (alpha `additionalClaims` or ID-token decoding) for AC-252;
  - the group identifier format that F26 stores (Entra GUIDs vs names; Keycloak full path vs name);
  - whether Entra production can guarantee under 200 groups, given Gotcha 1;
  - which Redis image and version to use, which needs its own research doc.

[repo-api]: https://api.github.com/repos/oauth2-proxy/oauth2-proxy
[rel]: https://github.com/oauth2-proxy/oauth2-proxy/releases
[rel-7154]: https://github.com/oauth2-proxy/oauth2-proxy/releases/tag/v7.15.4
[cl]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/CHANGELOG.md
[quay]: https://quay.io/api/v1/repository/oauth2-proxy/oauth2-proxy/tag/?onlyActiveTags=true&filter_tag_name=like:v7.15.4
[install]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/installation.md
[mk]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/Makefile
[dockerfile]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/Dockerfile
[ov]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/overview.md
[alpha]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/alpha_config.md
[sessions]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/sessions.md
[ep]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/features/endpoints.md
[nginx-int]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/integrations/nginx.md
[entra-doc]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/ms_entra_id.md
[entra-site]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/ms_entra_id/
[kc-doc]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/keycloak_oidc.md
[oidc-doc]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/openid_connect.md
[adfs-doc]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/docs/docs/configuration/providers/adfs.md
[src-op]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/oauthproxy.go
[src-entra]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/providers/ms_entra_id.go
[src-oidc]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/providers/oidc.go
[src-pd]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/providers/provider_data.go
[src-providers]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/providers/providers.go
[src-stored]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/middleware/stored_session.go
[src-legacy]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/apis/options/legacy_options.go
[src-injector]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/header/injector.go
[src-ss]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/apis/sessions/session_state.go
[src-cookie]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/sessions/cookie/session_store.go
[src-valsess]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/validation/sessions.go
[src-claims]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/providers/util/claim_extractor.go
[src-util]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/pkg/util/util.go
[le-compose]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/contrib/local-environment/docker-compose-keycloak.yaml
[le-cfg]: https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/contrib/local-environment/oauth2-proxy-keycloak.cfg
[ghsa-list]: https://github.com/oauth2-proxy/oauth2-proxy/security/advisories
[ghsa-7x63]: https://github.com/oauth2-proxy/oauth2-proxy/security/advisories/GHSA-7x63-xv5r-3p2x
[ghsa-5hvv]: https://github.com/oauth2-proxy/oauth2-proxy/security/advisories/GHSA-5hvv-m4w4-gf6v
[ghsa-vjrc]: https://github.com/oauth2-proxy/oauth2-proxy/security/advisories/GHSA-vjrc-mh2v-45x6
[i3506]: https://github.com/oauth2-proxy/oauth2-proxy/issues/3506
[pr3509]: https://github.com/oauth2-proxy/oauth2-proxy/pull/3509
[pr3535]: https://github.com/oauth2-proxy/oauth2-proxy/pull/3535
[pr3352]: https://github.com/oauth2-proxy/oauth2-proxy/pull/3352
[pr2685]: https://github.com/oauth2-proxy/oauth2-proxy/pull/2685
[i2984]: https://github.com/oauth2-proxy/oauth2-proxy/issues/2984
[i1902]: https://github.com/oauth2-proxy/oauth2-proxy/issues/1902
[i1224]: https://github.com/oauth2-proxy/oauth2-proxy/issues/1224
[i388]: https://github.com/oauth2-proxy/oauth2-proxy/issues/388
[i2163]: https://github.com/oauth2-proxy/oauth2-proxy/issues/2163
[i2613]: https://github.com/oauth2-proxy/oauth2-proxy/issues/2613
[i3451]: https://github.com/oauth2-proxy/oauth2-proxy/issues/3451
[chart]: https://github.com/oauth2-proxy/manifests/blob/oauth2-proxy-10.7.0/helm/oauth2-proxy/Chart.yaml
[chart-values]: https://github.com/oauth2-proxy/manifests/blob/oauth2-proxy-10.7.0/helm/oauth2-proxy/values.yaml
[chart-deploy]: https://github.com/oauth2-proxy/manifests/blob/oauth2-proxy-10.7.0/helm/oauth2-proxy/templates/deployment.yaml
[chart-rel]: https://github.com/oauth2-proxy/manifests/releases
[ms-groups]: https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims
[ms-graph-tmo]: https://learn.microsoft.com/en-us/graph/api/user-list-transitivememberof?view=graph-rest-1.0
[ms-oidc]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
[ms-authcode]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
[nginx-authreq]: https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
[nginx-core]: https://nginx.org/en/docs/http/ngx_http_core_module.html#large_client_header_buffers
[nginx-proxy]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffer_size
[nginx-ch124]: https://nginx.org/en/CHANGES-1.24
[nginx-src-proxy]: https://github.com/nginx/nginx/blob/release-1.30.5/src/http/modules/ngx_http_proxy_module.c
[pkgoss]: https://github.com/nginx/pkg-oss/blob/1.30.5-1/alpine/Makefile
[du-slim]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine-slim/Dockerfile
[node-cli]: https://nodejs.org/api/cli.html#--max-http-header-sizesize
[node-http]: https://github.com/nodejs/node/blob/v26.x/doc/api/http.md
[k8s-np]: https://kubernetes.io/docs/concepts/services-networking/network-policies/
[dfm-4626]: https://github.com/docker/for-mac/issues/4626
[helm-deps]: https://helm.sh/docs/v3/topics/charts/
[compose-profiles]: https://docs.docker.com/compose/how-tos/profiles/
