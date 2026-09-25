---
library: Authelia (OpenID Connect 1.0 provider, file user backend)
packages: []
version: 4.39.28
researched: 2026-09-25
sources:
  - https://github.com/authelia/authelia/releases/tag/v4.39.28
  - https://hub.docker.com/v2/repositories/authelia/authelia/tags/4.39.28
  - https://www.authelia.com/integration/openid-connect/introduction/
  - https://www.authelia.com/integration/openid-connect/openid-connect-1.0-claims/
  - https://www.authelia.com/configuration/identity-providers/openid-connect/provider/
  - https://www.authelia.com/configuration/identity-providers/openid-connect/clients/
  - https://www.authelia.com/roadmap/active/openid-connect-1.0-provider/
  - https://www.authelia.com/configuration/session/introduction/
  - https://www.authelia.com/configuration/first-factor/file/
  - https://www.authelia.com/reference/guides/passwords/
  - https://www.authelia.com/integration/deployment/docker/
  - https://www.authelia.com/integration/kubernetes/chart/
  - https://github.com/authelia/chartrepo/tree/authelia-0.11.22/charts/authelia
  - https://github.com/authelia/authelia/tree/v4.39.28/internal
---
# Authelia 4.39.28

## Summary

Authelia is an Apache-2.0 authentication portal written in Go. It can also act as an OpenID Connect 1.0 provider ([readme]; [oidc-intro]). This doc assesses it as the one **development OIDC provider** that runs beside wechart in docker-compose and in the Helm release on docker-desktop (AC-257). The test user belongs to 20 groups (AC-255), and wechart reads identity and groups from a configurable claim (AC-252). The file user backend supplies the users and groups (requirements §P2.4–P2.5). Findings also touch sign-out (AC-253).

**Fit, in short:**
- **What works for us:**
  - The users file seeds users and a flat list of groups per user.
  - A `groups` claim (array of strings) is emitted, and it can also go out under a second, custom claim name.
  - Clients are declared in YAML, and a client can be `one_factor` with implicit consent, so a scripted Playwright login is one form.
  - The image is small and multi-arch.
- **Hard constraints for localhost development:**
  1. Authelia's own URL must be `https://`.
  2. Its cookie domain must contain a dot and must not be `localhost`.
  3. The issuer comes from each request's Host. The token endpoint rejects a code exchange whose host differs from the one the browser used, so wechart's server must call Authelia at the same `https://host:port` as the browser.
  4. There is no RP-initiated logout (no `end_session_endpoint`).
  5. The OIDC provider is an "open beta" and is excluded from Authelia's versioning guarantees.

| # | Question | Short answer | Section |
|---|---|---|---|
| 1 | Version, image, license, maintenance | 4.39.28 (2026-09-17), `authelia/authelia:4.39.28` / `ghcr.io/authelia/authelia:4.39.28`, Apache-2.0, releases every few days | Install |
| 2 | Footprint | 25.7 MB (arm64) / 28.3 MB (amd64) compressed. Idle about 25–30 MB (vendor claim plus one user report). Storage is SQLite, Postgres or MySQL. 3–5 secrets plus an RSA key | Install, Gotchas |
| 3 | OIDC status, groups, scopes, claims policies | Open beta, OpenID Certified OP profiles. `groups` scope maps to `groups` claim from the users file. Claims policies and custom claims exist | API surface |
| 4 | Seeding and scripted login | Users, groups and clients all come from files. `one_factor` plus `consent_mode: implicit` gives a single login form, and its element IDs are stable (Authelia's own e2e uses them) | Init, API surface |
| 5 | Groups in ID token vs userinfo, logout | Since 4.39, groups are in userinfo only unless a claims policy adds them. No `end_session_endpoint` | API surface, Gotchas |
| 6 | Compose, Helm, domain, issuer | https plus a dotted domain are required. Issuer = request `https://Host`, and the token request must use the same host:port | Init, Gotchas |
| 7 | oauth2-proxy / openid-client | Both work with caveats: client auth method default mismatch, trusting a dev CA, groups location | API surface |
| 8 | Gotchas | 15 items | Gotchas |

## Install

**Version and images**
- The latest stable release is **v4.39.28**, published 2026-09-17. The release notes give the pulls `docker pull authelia/authelia:4.39.28` and `docker pull ghcr.io/authelia/authelia:4.39.28` ([rel], [rel-api]).
- Docker Hub publishes tag `4.39.28` with digest `sha256:bd97cff4fcbf715b5ff1f9ae286afbe6033afce385302520b0368122d43a6f54`. It has linux/amd64 (28,304,259 B compressed), linux/arm64 (25,723,731 B) and linux/arm/v7 (26,146,246 B) images ([hub-tag]).
- arm64 covers Apple-Silicon docker-desktop ([hub-tag]).

**License and maintenance**
- License is Apache-2.0. The repository is not archived, was last pushed 2026-09-25, has about 29k stars and 133 open issues ([gh-api]).
- Recent releases: v4.39.26 (2026-09-12), v4.39.27 (2026-09-15, OIDC consent fixes), v4.39.28 (2026-09-17) ([rel-api-list], [rel-26], [rel-27]).
- The 4.39 line began 2025-03-16 ([rn-439]).
- The next OIDC stage, "Beta 8", is targeted at v4.40.0 and is in progress ([oidc-roadmap]).

**Image facts**
- Built `FROM authelia/base`, `EXPOSE 9091` ([dockerfile]).
- Image HEALTHCHECK is `--interval=30s --timeout=3s --start-period=1m CMD /app/healthcheck.sh` ([dockerfile]).
- The config path defaults to `/config/configuration.yml` through `X_AUTHELIA_CONFIG` ([dockerfile]; [files]).
- The entrypoint runs as UID 0 unless PUID/PGID are set to drop privileges ([docker-docs]).

**CLI, run from the image for secret and hash generation**
- The docs' pattern is `docker run --rm authelia/authelia:<tag> authelia crypto hash generate argon2 --password '…'` ([passwords]).
- `authelia crypto pair rsa generate` makes an RSA key pair, 2048 bits by default ([cli-rsa]).
- `authelia crypto certificate rsa generate` makes an RSA key and certificate. `--common-name`, `--sans`, `--ca` and `--duration` set the details, and without `--ca` or `--path.ca` it is self-signed ([cli-cert]).
- `authelia crypto hash generate pbkdf2|argon2 …` hashes passwords and client secrets ([cli-pbkdf2], [cli-argon2]).
- `authelia config validate --config …` checks a configuration before deploy ([cli-validate]).

**Helm (official chart)**
- Install with `helm repo add authelia https://charts.authelia.com && helm repo update` ([chart-doc]).
- The chart is "currently considered beta status, and as such is subject to breaking changes" ([chart-doc]). Its README says v0.x has "No stability guarantees" ([chart-readme]).
- Latest chart is **0.11.22** (2026-09-11), with **appVersion 4.39.24**, not 4.39.28. `image.tag` overrides the tag, and the default registry is `ghcr.io` ([chart-index], [chart-rel], [chart-values]). The chart repo is Apache-2.0 ([chart-api]).

**Runtime needs**
- No npm packages are involved: this is a container.
- The browser, and wechart's server-side OIDC client, must reach Authelia over **https**; see Init.

## Init / auth pattern

### Mandatory configuration: what the validator enforces at v4.39.28

| Requirement | Detail | Source |
|---|---|---|
| **Session secret** | `session.secret` is required. | [session] |
| **Storage** | `storage.encryption_key` must be at least 20 characters. One of `local` (SQLite), `postgres` or `mysql` is required. | [v-storage]; [storage] |
| **Password-reset JWT secret** | `identity_validation.reset_password.jwt_secret` is required **unless** `authentication_backend.password_reset.disable: true`. | [v-idv] |
| **Notifier** | Exactly one notifier is required, `smtp` or `filesystem`, with no exemption. | [v-notifier] |
| **Access control** | `access_control.default_policy` defaults to `deny`. With no rules, anything other than `one_factor` or `two_factor` is a startup error. This check runs unconditionally, even for an OIDC-only deployment. | [v-acl], [v-conf] |
| **OIDC secrets** | `identity_providers.oidc.hmac_secret` is required. `jwks` is required with at least one RS256 key: an RSA private key of at least 2048 bits, PKCS#8 or PKCS#1. | [oidc-provider] |
| **Session cookie `domain`** | Must contain a period, must not be a wildcard, and must not be on the Public Suffix List. An IP address is accepted without further checks. | [v-session], [v-util] |
| **Session cookie `authelia_url`** | Required. Must be absolute and `https` (or `wss`), and must lie inside `domain`. | [v-session], [u-url] |

The docs add that the cookie domain "Must not be a special use domain like `localhost` as browsers do not allow sites to set the cookies Authelia requires". They also say it must be a domain "a globally trusted Certificate Authority is willing to issue X.509 Certificates for (the use of TLS is a strict requirement)" ([session-raw]). The validator itself checks only dots, characters, IP and PSL ([v-session]).

**Secrets as files.** These settings can be read from files with the `_FILE` suffix ([secrets]):
- `AUTHELIA_SESSION_SECRET_FILE`
- `AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE`
- `AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET_FILE`
- `AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET_FILE`
- `AUTHELIA_STORAGE_POSTGRES_PASSWORD_FILE`

**JWKS key through the template filter.** The JWKS private key can be injected with the `template` config filter (`X_AUTHELIA_CONFIG_FILTERS=template`) and its `secret` function ([files]). Authelia's own OIDC suite does exactly this: `key: {{ secret "/pki/private.oidc.pem" | mindent 10 "|" | msquote }}` ([suite-oidc-conf]). File filters are experimental and outside the versioning policy ([files]; [versioning]).

### Issuer and hostname rules

These rules decide how compose and Kubernetes must be wired, and they come from the source.

**How the issuer is computed**
- `IssuerURL()` builds the issuer from `X-Forwarded-Proto` and `X-Forwarded-Host`, falling back to the request's TLS state and `Host` ([ctx]).
- It returns an error for any scheme other than `https`.
- It then requires a configured session cookie whose `authelia_url` **Host (including port) exactly equals** the request host ([ctx]).

**Where it applies**
- The authorization endpoint calls `IssuerURL()` and fails the request on error ([h-authz]).
- The token endpoint also calls it. It then rejects the exchange when `!session.ValidIssuer(issuer)` with "The original request and the access request occurred at endpoints where the effective issuer did not match." ([h-token]).
- **Consequence (derived from the two handlers above):** wechart's server-side code exchange, and any other server call, must reach Authelia as the same `https://<host>:<port>` the browser used. A plain in-cluster name such as `http://authelia.wechart.svc:9091` fails both the scheme check and the host match.

**Documented fix: make the public name resolve everywhere.** The Authelia FAQ says wrong discovery URLs come from `X-Forwarded-Proto` / `Host` not matching the provider's public URL. It recommends DNS: hosts-file entries, or, for Docker, "add network aliases for the Authelia FQDN" on the shared network ([oidc-faq]).

**Alternative, derived from source and not a documented pattern:**
- Authelia reads `X-Forwarded-Proto` and `X-Forwarded-Host` straight from request headers ([ctx]).
- So a server-side client could call a plain-http in-cluster address while sending `X-Forwarded-Proto: https` and `X-Forwarded-Host: <public host:port>`. openid-client v6 lets you replace `fetch` through `config[client.customFetch]` ([oc-src]).
- This only works if Authelia listens on plain http (TLS terminated elsewhere), and it relies on Authelia trusting forwarded headers from any caller.

### Sketch: `configuration.yml` for OIDC-only development

This sketch is assembled from the option docs cited in this section. It has not been run, so validate it with `authelia config validate` ([cli-validate]). The hostnames, ports and callback path are placeholders; see Open questions.

```yaml
server:
  address: 'tcp://:9091/'
  tls:                                 # Authelia serves TLS itself, as its own OIDC suite does
    key: '/secrets/tls/private.pem'
    certificate: '/secrets/tls/public.crt'
authentication_backend:
  password_reset:
    disable: true                      # removes the reset-password JWT secret requirement
  file:
    path: '/config/users_database.yml'
    watch: false
access_control:
  default_policy: 'one_factor'         # 'deny' with no rules is a startup error
session:
  cookies:
    - domain: '<dev-domain>'           # dotted, not localhost
      authelia_url: 'https://auth.<dev-domain>:9091'
storage:
  local:
    path: '/data/db.sqlite3'
notifier:
  filesystem:
    filename: '/data/notification.txt'
identity_providers:
  oidc:
    jwks:
      - key: {{ secret "/secrets/oidc/private.pem" | mindent 10 "|" | msquote }}
    claims_policies:
      wechart:
        id_token: ['groups', 'preferred_username', 'name', 'email']   # only if groups must be in the ID token
        custom_claims:
          ad_groups:                  # optional second name for the same groups, to exercise AC-252's configurable claim
            attribute: 'groups'
    scopes:
      ad_groups:
        claims: ['ad_groups']
    clients:
      - client_id: 'wechart'
        client_name: 'wechart'
        client_secret: '$pbkdf2-sha512$310000$…'   # digest; wechart holds the plaintext
        public: false
        authorization_policy: 'one_factor'
        consent_mode: 'implicit'
        require_pkce: true
        pkce_challenge_method: 'S256'
        redirect_uris: ['http://localhost:<port>/<callback>']
        scopes: ['openid', 'profile', 'email', 'groups', 'ad_groups']
        claims_policy: 'wechart'
        response_types: ['code']
        grant_types: ['authorization_code']
        token_endpoint_auth_method: 'client_secret_basic'
```

Where each part of the sketch comes from:
- Server TLS keys: [server]; Authelia's own OIDC suite serves TLS directly ([suite-oidc-conf]).
- `password_reset.disable`: [v-idv].
- Session, storage and notifier: [session], [storage], [v-notifier].
- Claims policy, custom claim mapped to `groups`, and custom scope: [oidc-claims]. The same pattern appears in the Technitium example, which maps `roles` to attribute `groups` ([technitium]).
- Client options: [oidc-clients].
- An `http` redirect URI is allowed. The validator requires only an absolute URI with a scheme ([v-idp]), the docs say "must be one of `http` or `https`" ([oidc-clients]), and the NetBird example lists `http://localhost` ([netbird]).
- Secrets come from `_FILE` variables: `AUTHELIA_SESSION_SECRET_FILE`, `AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE` and `AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET_FILE` ([secrets]).

### docker-compose

- Use `image: authelia/authelia:4.39.28`, publish `9091:9091`, and mount `/config` (configuration and users file), `/secrets` and a data volume. The Docker docs show the same shape: `_FILE` secrets plus `/config` and `/secrets` mounts ([docker-docs]).
- **The published host port must equal the port in `authelia_url`**, because the issuer host match includes the port ([ctx]).
- The **browser** must resolve `auth.<dev-domain>` to 127.0.0.1. The documented ways are a hosts file or DNS ([oidc-faq]).
- **Containers** that call Authelia (a containerised wechart API, or oauth2-proxy) need a Compose network alias `auth.<dev-domain>` on the Authelia service ([oidc-faq]). The container port 9091 then equals the published port, so the issuer matches ([ctx]).
- The wechart API **on the host** (dev today, per `/Users/srajagopal/Work/wechart/docker-compose.yml`) resolves through the host's hosts file.
- The image's health check polls every 30 s with a 1 m start period ([dockerfile]). A compose `healthcheck:` can call the same `/app/healthcheck.sh` more often.

### Kubernetes on docker-desktop

**Option A: official chart 0.11.22**
- Set `image.tag: 4.39.28` ([chart-values]).
- `configMap.disabled` / `configMap.existingConfigMap` let you supply your own configuration file instead of the generated one ([chart-values]). That means the same `configuration.yml` can serve compose and Kubernetes.
- Defaults to change:
  - `pod.kind: DaemonSet`
  - `service.type: ClusterIP`
  - `service.port: 80`
  - `ingress.enabled: false`
  ([chart-values]).
- Generated config composes the portal URL as `https://[<subdomain>.]<domain>` ([chart-readme]).
- Secrets it auto-generates when not given: session encryption, storage encryption, reset-password JWT and OIDC HMAC. Each is `randAlphaNum 128`, and it `lookup`s the existing Secret so values survive upgrades ([chart-secrets]).
- Chart validation requires cookie `domain`, a storage provider, a notifier and an authentication backend. Client secrets need a `$plaintext$` or digest prefix ([chart-validate]).

**Option B: plain manifests in wechart's own chart** (Deployment, Service, ConfigMap, Secret) with the same configuration file. This is not an Authelia artefact; it is listed only as the alternative to the beta chart.

**Either way:**
- **`enableServiceLinks: false`** on the Authelia pod. Authelia's docs say its configuration system "conflicts with the `enableServiceLinks` option when it's set to `true`" ([k8s-intro]).
- The browser reaches Authelia through a LoadBalancer Service on `localhost:<port>`. wechart's chart already relies on this for the web app, and `/Users/srajagopal/Work/wechart/docs/research/helm.md` marks that docker-desktop behaviour UNVERIFIED. The Service port must equal the `authelia_url` port ([ctx]).
- The wechart API pod must resolve `auth.<dev-domain>` to the Authelia Service, on the same port:
  - `spec.hostAliases` works but needs an IP ([k8s-hostaliases]).
  - A Service can have a fixed `.spec.clusterIP` inside the service CIDR ([k8s-clusterip]).
  - A CoreDNS rewrite is another option, UNVERIFIED (not researched).

### Trusting the dev certificate

- Playwright: `ignoreHTTPSErrors: true` ("Whether to ignore HTTPS errors when sending network requests") ([pw-https]).
- Node, for openid-client: `NODE_EXTRA_CA_CERTS=/path/ca.pem` extends the trusted roots and is read only at process start ([node-ca-search]; [node-ca]). Whether it covers Node's global `fetch` is not stated on the page fetched: UNVERIFIED.
- oauth2-proxy: `--provider-ca-file` ([o2p-config]).
- Generate a dev CA plus a leaf certificate with `authelia crypto certificate rsa generate --ca …` and then with `--path.ca` ([cli-cert]).

## API surface we will use

### Endpoints

These are the discoverable endpoints. Paths are relative to the issuer ([oidc-intro]; [openapi]).

| Endpoint | Path | Notes |
|---|---|---|
| Discovery | `/.well-known/openid-configuration` | Also serves `/.well-known/oauth-authorization-server`. Issuer is `https://<request host>` ([ctx]) |
| Authorization | `/api/oidc/authorization` | Supports `prompt=login` and `max_age` (0 forces login) ([oidc-util]) |
| Token | `/api/oidc/token` | Same effective issuer as the authorize request ([h-token]) |
| UserInfo | `/api/oidc/userinfo` | Unsigned JSON by default (`userinfo_signed_response_alg: none`) ([oidc-clients]) |
| JWKS | `/jwks.json` | [oidc-intro] |
| Introspection, revocation, PAR, device authorization | `/api/oidc/…` | [oidc-intro] |
| **End session** | none | RP-Initiated, Front-/Back-Channel logout and Session Management are "not started" (Beta 9) ([oidc-roadmap]; [oidc-intro]) |
| Health | `GET\|HEAD /api/health` | [openapi] |
| Portal sign-out | `/logout?rd=<url>` (UI), which POSTs `/api/logout {targetURL}` → `{safeTargetURL}` | The UI follows `rd` only when the server says it is safe ([signout]; [openapi]) |
| First factor (JSON) | `POST /api/firstfactor {username, password, keepMeLoggedIn, flow, flowID, …}` | Used by the portal ([openapi]) |

**Grant types**
- Supported: `authorization_code`, `refresh_token`, `client_credentials`, `implicit` (deprecated) and the device code grant.
- Not supported: **Resource Owner Password (`password`)**. So tests cannot get user tokens without the browser (or `/api/firstfactor`) flow ([oidc-intro-raw]).

### Claims and scopes (file backend)

| Claim | Scope | Default location | Source of value |
|---|---|---|---|
| `sub` | openid | ID token | "A RFC4122 UUID V4 linked to the user" ([oidc-claims]) |
| `iss`, `aud`, `amr` | openid | ID token | [oidc-claims] |
| `preferred_username`, `name` | profile | **UserInfo** | username and `displayname` ([oidc-claims]) |
| `email` | email | **UserInfo** | first email ([oidc-claims]) |
| `groups` (array[string]) | groups | **UserInfo** | "List of user's groups discovered via authentication", which for the file backend is the user's `groups:` list ([oidc-claims]) |

**What changed in 4.39:** "The default claims for ID Tokens now mirrors the standard claims from the specification" ([rn-439]). Groups therefore reach an ID token only in one of two ways:
- a claims policy with `id_token: ['groups', …]`, which the docs call a "break-glass measure" for clients that cannot use UserInfo ([oidc-claims]); or
- the `claims` authorization parameter, which the release notes call "the correct means to request additional claims" ([rn-439]).

**Custom claims and scopes**
- `claims_policies.<name>.custom_claims.<claim>.attribute` maps a claim to any attribute, `groups` included. The claim name can differ from the attribute name ([oidc-claims]; [technitium]).
- `scopes.<name>.claims` publishes a custom scope ([oidc-provider]).
- Client default scopes are `openid, groups, profile, email` ([oidc-clients]).

**Group count:** no documented limit on group count or claim size was found ([oidc-claims]). Twenty groups is just a 20-item YAML list.

### Users file (`users_database.yml`)

```yaml
users:
  <username>:
    disabled: false
    displayname: '…'
    password: '$argon2id$…'        # or $pbkdf2-sha512$, $6$, $2b$, $scrypt$ …
    email: '…'
    groups: ['g01', 'g02', …, 'g20']
```

- **Schema** ([passwords]):
  - Optional fields: `given_name`, `family_name`, `middle_name`, `nickname`, `profile`, `picture`, `website`, `gender`, `birthdate`, `zoneinfo`, `locale`, `phone_number`, `phone_extension`, `address` and `extra`.
  - Plaintext passwords are not supported ("The file contains hashed passwords").
  - Groups are a flat per-user list, with no group objects or nesting in the schema ([passwords]).
- **Accepted hash formats** include `$argon2id$`, `$pbkdf2-sha512$`, `$6$`, `$2b$` and `$scrypt$` ([passwords]). The parameters are encoded in each hash, so "the memory size change in the config will not affect users until they change their password" (maintainer, [disc-5939]).
- **Generating hashes:**
  - `authelia crypto hash generate argon2 --password '…'`. Defaults are m=65536 KiB, t=3, p=4, and `--profile low-memory` is available ([cli-argon2]).
  - `authelia crypto hash generate pbkdf2 --variant sha512 --password '…'` ([cli-pbkdf2]).
- **`watch: true`** reloads the file on change; default is false ([file-backend]).
- **Missing file:** the provider writes a template file and fails startup ([file-provider]).

### OIDC client options that matter to us ([oidc-clients]; [v-idp])

- **`authorization_policy`**: defaults to `two_factor`. Set `one_factor` for password-only login. Authelia's own OIDC suite has a `one_factor` client ([suite-oidc-conf]).
- **`consent_mode`**: `auto` (the default) resolves to `explicit` unless `pre_configured_consent_duration` is set ([v-idp]).
  - `implicit` "Automatically assumes consent for every authorization". The docs discourage it, because it "could be misused … with the public client type or when the client credentials … [are] exposed" ([oidc-clients]).
  - The handler may still force explicit consent "due to requirements requested by the client" ([h-consent]).
- **`token_endpoint_auth_method`**: defaults to `client_secret_basic` for confidential clients. Since 4.38 the configured method restricts how the client may authenticate at the token endpoint ([oidc-clients]; [rn-438]).
- **`require_pkce`** (default false) and **`pkce_challenge_method`** (`S256` recommended). `enforce_pkce` defaults to `public_clients_only` ([oidc-clients]; [oidc-provider]).
- **Client secret:**
  - A digest is recommended.
  - Plaintext (`$plaintext$…` or no leading `$`) still works but is "formally deprecat[ed]" and "will likely be completely unavailable in the future" ([oidc-faq-c7]).
  - The validator warns on plaintext ([v-idp]).
- **Lifespans** default to access 1h, ID token 1h, refresh 90m and authorize code 1m ([oidc-provider]).

### Stable subjects for reproducible tests

- `authelia storage user identifiers add <username> --identifier <uuidv4> [--service openid]` stores a fixed opaque identifier. Without `--identifier`, "a random one will be used" ([cli-id-add]).
- `… identifiers export` and `… identifiers import <file>` move them between databases as YAML ([cli-id-import]; [cli-id-export]).

### Scripted login (Playwright)

- **Login form IDs:** Authelia's own e2e suite fills `#username-textfield` and `#password-textfield`, optionally clicks `#remember-checkbox`, then clicks `#sign-in-button` ([suite-login]).
- **Consent IDs:** `#openid-consent-accept` / `#openid-consent-deny` ([suite-oidc]).
- **What the suite asserts:** `groups` "admins, dev", `preferred_username`, `name`, `email`, and `iss` "https://login.example.com:8080". So the issuer carries the port ([suite-oidc]).
- **Flow for our client:** with `one_factor` plus `implicit` consent, a Playwright login goes: navigate to wechart → redirect to Authelia → fill two fields → click → back at wechart's callback.
- **Repeat logins:** the portal also exposes the JSON `POST /api/firstfactor` ([openapi]). A browserless login built on it is UNVERIFIED.
- **Rate limiting:** failed logins trigger regulation. Defaults are `max_retries: 3`, `find_time: 2m`, `ban_time: 5m`, modes `user` and `ip`. `max_retries: 0` disables it ([regulation]).

### Compatibility

**openid-client (panva, v6)**
- **Auth method default.** Its default client authentication is `ClientSecretPost` when a secret is present ([oc-clientauth]). Authelia's default is `client_secret_basic` ([oidc-clients]). Pass `client.ClientSecretBasic(secret)` to `discovery()` ([oc-basic]), or register `token_endpoint_auth_method: client_secret_post`.
- **Groups location.** Groups arrive through UserInfo unless a claims policy adds them to the ID token ([oidc-claims]).
- **Replacing fetch.** `customFetch` can replace `fetch` for all requests ([oc-src]).
- **Precedent.** Authelia documents an Express integration using `express-openid-connect`, tested on 4.38.0. It uses `client_secret_basic` with PKCE S256 and PAR, and reads claims from both the ID token and `fetchUserInfo()` ([expressjs]).

**oauth2-proxy (docs 7.15.x)**
- Groups come from `--oidc-groups-claim` (default `groups`) ([o2p-config]).
- When a claim is missing from the ID token, its claim extractor falls back to the Profile URL (userinfo), unless `--skip-claims-from-profile-url` ([o2p-config]; [o2p-claims], master branch).
- To trust the dev CA: `--provider-ca-file` ([o2p-config]).
- Logout: there is no `end_session_endpoint` for an RP logout to call ([oidc-roadmap]).

## Gotchas

1. **HTTPS and a dotted non-localhost domain are mandatory.**
   - `authelia_url` must be `https`, and the cookie domain needs a dot and must not be on the PSL ([v-session], [u-url], [v-util]).
   - The docs forbid `localhost` ([session-raw]).
   - The Public Suffix List fetch showed no entry for `test`, `localhost`, `nip.io`, `sslip.io`, `localtest.me` or `lvh.me`, while `home.arpa` **is** listed ([psl]). The list is large and the fetch may have been truncated, so treat the absences as UNVERIFIED.
2. **The effective issuer must be identical for browser and server calls**, as `https://host:port`.
   - The authorize and token handlers both derive it from the request, and the token handler rejects a mismatch ([ctx], [h-authz], [h-token]).
   - The port is part of it ([ctx]; [suite-oidc]). Compose's published port, the Kubernetes Service port and `authelia_url` must therefore agree.
   - If both environments run at once they need distinct `authelia_url`s. `session.cookies` is a list ([session]), so one config can carry several.
3. **No RP-initiated logout (AC-253 impact).**
   - There is no `end_session_endpoint` ([oidc-roadmap]; [oidc-intro]).
   - After wechart ends its own session, Authelia's portal session lives on. The documented example values are `expiration: 1h`, `inactivity: 5m` ([session]).
   - While that session lives, the next authorize round-trip can finish without a password. That is inferred from `RequestFormRequiresLogin`, which forces a login only for `prompt=login` or `max_age` ([oidc-util]).
   - wechart can send `prompt=login` (or `max_age=0`) to force credentials.
   - Authelia's `/logout?rd=` follows `rd` only when the server calls it safe ([signout]). `IsURISafeRedirection` requires `https` and a cookie-domain suffix ([u-url]), so an `http://localhost` target would not qualify. That the logout handler uses that function is UNVERIFIED.
4. **Groups are not in the ID token by default since 4.39**, only in UserInfo ([rn-439]; [oidc-claims]). Clients reading only the ID token (oauth2-proxy with `--skip-claims-from-profile-url`, for example) need a claims policy.
5. **OIDC is an open beta and outside the versioning policy.** "Features which are described in a way which indicates they are not ready for use do not have the same guarantees", and OpenID Connect and File Filters are named examples ([versioning]; [oidc-intro]).
   - 4.38 changed the token-endpoint auth default under that exemption ([rn-438]).
   - 4.40 ("Beta 8", in-storage configuration and dynamic registration) is in progress ([oidc-roadmap]).
   - The `expand-env` filter "will be removed in v4.40.0 and will result in a startup error". Use `template` ([files]).
6. **`access_control` with `deny` and no rules fails startup**, even for OIDC-only use ([v-acl]; [v-conf]).
7. **A notifier is always required.** `filesystem` is fine for development ([v-notifier]).
8. **NTP startup check.**
   - The docs say Authelia "will fail to start" if it cannot contact the NTP server, which defaults to `udp://time.cloudflare.com:123` ([ntp]).
   - The source at v4.39.28 only **warns** on a contact failure, and fails only when the desync exceeds `max_desync` (3s) ([ntp-src]).
   - `ntp.disable_startup_check: true` exists but is "not a supported configuration" ([ntp]).
9. **Argon2 memory.**
   - Password checks use each hash's own parameters ([disc-5939]).
   - The Kubernetes guide warns argon2id "will by default use 1GB of RAM" ([k8s-intro]). That conflicts with the file-backend and CLI default of `memory: 65536` KiB ([file-backend]; [cli-argon2]); the guide's figure looks stale, UNVERIFIED.
   - A user reported spikes needing a 512 MB limit on an otherwise ~25 MB process, and the maintainer attributed them to argon2 ([disc-5939]).
   - Seeding with low-cost hashes (`--profile low-memory`, or pbkdf2) avoids the spikes.
10. **`enableServiceLinks` must be false** on the Kubernetes pod ([k8s-intro]).
11. **Official chart lag and beta status.**
    - Chart 0.11.22 ships appVersion 4.39.24 ([chart-index]).
    - v0.x has no stability guarantees ([chart-readme]).
    - Defaults are a DaemonSet with a ClusterIP Service on port 80 ([chart-values]).
12. **Container runs as root** unless PUID/PGID are set ([docker-docs]).
13. **`sub` is an opaque UUID**, not the username ([oidc-claims]). A fresh storage database gives new values unless they are seeded with `identifiers add` or `import` ([cli-id-add]); that fresh values are generated on first sign-in is inferred, UNVERIFIED.
14. **Security advisories** ([ghsa]):
    - GHSA-j748-h363-wqj8 and GHSA-hjj4-hfjm-fmrj, fixed in 4.39.20.
    - GHSA-gmfg-3v4q-9qr4 (XSS), fixed in 4.39.16.
    - GHSA-x883-2vmg-xwf7, "Group Changes may not have the expected results (YAML file backend)", fixed in 4.38.0.
    - 4.39.28 is past all of them.
15. **Footprint claims.** The homepage says "compressed container size smaller than 20 megabytes and observed memory usage normally under 30 megabytes" ([home]). Docker Hub shows 25.7–28.3 MB compressed for 4.39.28 ([hub-tag]), so the size claim is out of date. Idle RSS of about 25 MB comes from one user report ([disc-5939]).

## Alternatives considered

None. The caller asked for this one candidate.

## Open questions / unverified

- **Development hostname and domain (needs a decision).** It must be dotted, not `localhost`, not on the PSL, and served over https ([v-session]; [session-raw]).
  - Authelia's own suites use `*.example.com` names mapped in a hosts file, with self-signed PKI ([docker-docs]; [suite-oidc-conf]).
  - A `.test` or `*.localhost` name passes the validator's code path (dots, characters, PSL) as read from source, but not the docs' "CA would issue a certificate" wording. Untested: UNVERIFIED.
  - Wildcard public-DNS names (`nip.io`, `localtest.me`) add an external DNS dependency.
- **How in-cluster calls reach the public hostname** (hostAliases with a pinned ClusterIP, a CoreDNS rewrite, or forwarded headers through `customFetch`). Each follows from the issuer rules; none is tested. The CoreDNS rewrite is UNVERIFIED.
- **docker-desktop LoadBalancer on `localhost:<port>`** is UNVERIFIED, carried from `/Users/srajagopal/Work/wechart/docs/research/helm.md`.
- **Startup time**: UNVERIFIED. No figure was found in the docs, and the tools in this session could not measure it. The image health check's start period is 1 m ([dockerfile]).
- **Running with a read-only `/config` mount** (ConfigMap): UNVERIFIED. The file provider writes only when the users file is missing or a password changes ([file-provider]).
- **Whether `NODE_EXTRA_CA_CERTS` applies to Node's global `fetch`** (which openid-client uses): UNVERIFIED ([node-ca]).
- **Group-name characters** (AD-style `CN=…,OU=…` or `DOMAIN\group`): no documented restriction found. UNVERIFIED.
- **Nested groups**: the file backend's schema has none ([passwords]). How the LDAP backend handles nesting was not researched.
- **Browserless login through `/api/firstfactor` with `flow`/`flowID`**: UNVERIFIED end-to-end.
- **Idle memory** figures are a vendor claim plus one user report, not measured here.

[rel]: https://github.com/authelia/authelia/releases/tag/v4.39.28
[rel-api]: https://api.github.com/repos/authelia/authelia/releases/latest
[rel-api-list]: https://api.github.com/repos/authelia/authelia/releases?per_page=12
[rel-26]: https://github.com/authelia/authelia/releases/tag/v4.39.26
[rel-27]: https://github.com/authelia/authelia/releases/tag/v4.39.27
[hub-tag]: https://hub.docker.com/v2/repositories/authelia/authelia/tags/4.39.28
[gh-api]: https://api.github.com/repos/authelia/authelia
[readme]: https://github.com/authelia/authelia/blob/v4.39.28/README.md
[home]: https://www.authelia.com/
[disc-5939]: https://github.com/authelia/authelia/discussions/5939
[dockerfile]: https://github.com/authelia/authelia/blob/v4.39.28/Dockerfile
[docker-docs]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/integration/deployment/docker.md
[k8s-intro]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/integration/kubernetes/introduction.md
[oidc-intro]: https://www.authelia.com/integration/openid-connect/introduction/
[oidc-intro-raw]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/integration/openid-connect/introduction.md
[oidc-roadmap]: https://www.authelia.com/roadmap/active/openid-connect-1.0-provider/
[oidc-claims]: https://www.authelia.com/integration/openid-connect/openid-connect-1.0-claims/
[oidc-provider]: https://www.authelia.com/configuration/identity-providers/openid-connect/provider/
[oidc-clients]: https://www.authelia.com/configuration/identity-providers/openid-connect/clients/
[oidc-faq]: https://www.authelia.com/integration/openid-connect/frequently-asked-questions/
[oidc-faq-c7]: https://github.com/authelia/authelia/blob/master/docs/content/integration/openid-connect/frequently-asked-questions.md
[rn-439]: https://www.authelia.com/blog/4.39-release-notes/
[rn-438]: https://github.com/authelia/authelia/blob/master/docs/content/blog/release-notes-4.38/index.md
[versioning]: https://www.authelia.com/policies/versioning/
[session]: https://www.authelia.com/configuration/session/introduction/
[session-raw]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/configuration/session/introduction.md
[v-session]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/session.go
[v-util]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/util.go
[v-idp]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/identity_providers.go
[v-acl]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/access_control.go
[v-conf]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/configuration.go
[v-notifier]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/notifier.go
[v-storage]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/storage.go
[v-idv]: https://github.com/authelia/authelia/blob/v4.39.28/internal/configuration/validator/identity_validation.go
[u-url]: https://github.com/authelia/authelia/blob/v4.39.28/internal/utils/url.go
[ctx]: https://github.com/authelia/authelia/blob/v4.39.28/internal/middlewares/authelia_context.go
[h-token]: https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_oauth2_token.go
[h-authz]: https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_oauth2_authorization.go
[h-consent]: https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_oauth2_authorization_consent_core.go
[oidc-util]: https://github.com/authelia/authelia/blob/v4.39.28/internal/oidc/util.go
[file-backend]: https://www.authelia.com/configuration/first-factor/file/
[file-provider]: https://github.com/authelia/authelia/blob/v4.39.28/internal/authentication/file_user_provider.go
[passwords]: https://www.authelia.com/reference/guides/passwords/
[storage]: https://www.authelia.com/configuration/storage/introduction/
[secrets]: https://www.authelia.com/configuration/methods/secrets/
[files]: https://www.authelia.com/configuration/methods/files/
[server]: https://www.authelia.com/configuration/miscellaneous/server/
[ntp]: https://www.authelia.com/configuration/miscellaneous/ntp/
[ntp-src]: https://github.com/authelia/authelia/blob/v4.39.28/internal/ntp/ntp.go
[regulation]: https://www.authelia.com/configuration/security/regulation/
[openapi]: https://github.com/authelia/authelia/blob/v4.39.28/api/openapi.yml
[signout]: https://github.com/authelia/authelia/blob/master/web/src/views/LoginPortal/SignOut/SignOut.tsx
[suite-login]: https://github.com/authelia/authelia/blob/v4.39.28/internal/suites/action_login.go
[suite-oidc]: https://github.com/authelia/authelia/blob/v4.39.28/internal/suites/scenario_oidc_test.go
[suite-oidc-conf]: https://github.com/authelia/authelia/blob/v4.39.28/internal/suites/OIDC/configuration.yml
[cli-id-add]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_storage_user_identifiers_add.md
[cli-id-import]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_storage_user_identifiers_import.md
[cli-id-export]: https://github.com/authelia/authelia/blob/master/docs/content/reference/cli/authelia/authelia_storage_user_identifiers_export.md
[cli-rsa]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_crypto_pair_rsa_generate.md
[cli-cert]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_crypto_certificate_rsa_generate.md
[cli-validate]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_config_validate.md
[cli-argon2]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_crypto_hash_generate_argon2.md
[cli-pbkdf2]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/reference/cli/authelia/authelia_crypto_hash_generate_pbkdf2.md
[technitium]: https://github.com/authelia/authelia/blob/master/docs/content/integration/openid-connect/clients/technitium/index.md
[netbird]: https://github.com/authelia/authelia/blob/master/docs/content/integration/openid-connect/clients/netbird/index.md
[expressjs]: https://github.com/authelia/authelia/blob/v4.39.28/docs/content/integration/openid-connect/clients/expressjs/index.md
[ghsa]: https://github.com/authelia/authelia/security/advisories
[chart-doc]: https://www.authelia.com/integration/kubernetes/chart/
[chart-index]: https://charts.authelia.com/index.yaml
[chart-rel]: https://github.com/authelia/chartrepo/releases/tag/authelia-0.11.22
[chart-api]: https://api.github.com/repos/authelia/chartrepo
[chart-values]: https://github.com/authelia/chartrepo/blob/authelia-0.11.22/charts/authelia/values.yaml
[chart-readme]: https://github.com/authelia/chartrepo/blob/authelia-0.11.22/charts/authelia/README.md
[chart-secrets]: https://github.com/authelia/chartrepo/blob/authelia-0.11.22/charts/authelia/templates/_secrets.tpl
[chart-validate]: https://github.com/authelia/chartrepo/blob/authelia-0.11.22/charts/authelia/templates/validations.configMap.check.yaml
[o2p-config]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview
[o2p-claims]: https://github.com/oauth2-proxy/oauth2-proxy/blob/master/pkg/providers/util/claim_extractor.go
[oc-clientauth]: https://github.com/panva/openid-client/blob/main/docs/type-aliases/ClientAuth.md
[oc-basic]: https://github.com/panva/openid-client/blob/main/docs/functions/ClientSecretBasic.md
[oc-src]: https://github.com/panva/openid-client/blob/main/src/index.ts
[node-ca]: https://nodejs.org/learn/http/enterprise-network-configuration
[node-ca-search]: https://nodejs.org/docs/latest-v16.x/api/cli.html
[pw-https]: https://playwright.dev/docs/api/class-browser#browser-new-context-option-ignore-https-errors
[k8s-hostaliases]: https://kubernetes.io/docs/tasks/network/customize-hosts-file-for-pods/
[k8s-clusterip]: https://kubernetes.io/docs/concepts/services-networking/cluster-ip-allocation/
[psl]: https://publicsuffix.org/list/public_suffix_list.dat
