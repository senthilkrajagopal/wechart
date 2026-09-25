---
library: Keycloak
packages: []
version: 26.7.4
researched: 2026-09-25
sources:
  - https://www.keycloak.org/downloads
  - https://github.com/keycloak/keycloak/releases/tag/26.7.4
  - https://quay.io/repository/keycloak/keycloak
  - https://www.keycloak.org/server/containers
  - https://www.keycloak.org/server/configuration
  - https://www.keycloak.org/server/db
  - https://www.keycloak.org/server/importExport
  - https://www.keycloak.org/server/hostname
  - https://www.keycloak.org/server/management-interface
  - https://www.keycloak.org/observability/health
  - https://www.keycloak.org/high-availability/multi-cluster/concepts-memory-and-cpu-sizing
  - https://www.keycloak.org/securing-apps/oidc-layers
  - https://www.keycloak.org/getting-started/getting-started-kube
  - https://www.keycloak.org/docs/latest/upgrading/index.html
  - https://github.com/keycloak/keycloak/tree/26.7.4
  - https://github.com/codecentric/helm-charts/tree/master/charts/keycloakx
  - https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/keycloak_oidc
  - https://github.com/panva/openid-client
---
# Keycloak 26.7.4 (development OIDC provider candidate)

## Summary

Keycloak is an open-source identity and access management server. It speaks OpenID Connect, it has users and hierarchical groups, and it has a "Group Membership" protocol mapper that writes a user's groups into tokens ([gh-repo], [group-mapper]). This document looks at it as **one candidate** for wechart's development and test OIDC provider (§P2.4, §P2.5 "Development OIDC provider"). It assesses the candidate against these criteria:

- **AC-257:** sign-in through the development provider in docker-compose and in the Helm release on docker-desktop, with the provider running beside wechart.
- **AC-255:** a test user in 20 groups is granted access through each of them.
- **AC-252:** identity and groups come from the token, through a configurable issuer, client and groups claim.

Production (Entra ID, or AD through a broker) is out of scope here.

**The answers in brief** (the detail and sources are in the sections below):

| # | Question | Finding |
|---|---|---|
| 1 | Version, image, license, maintenance | **26.7.4**, released 2026-09-16, marked Latest ([gh-rel]). Image `quay.io/keycloak/keycloak:26.7.4` ([kc-dl]). Apache-2.0 ([gh-repo]). CNCF Incubating since 2023-04-10 ([cncf]). About four minor releases a year, and only the latest minor gets patches ([releases-md]). |
| 2 | Footprint | Compressed image about 266 MB (arm64) or 268 MB (amd64) ([quay-arm64], [quay-amd64]). Runs on the JVM (Java 21) ([dockerfile]). The docs ask for a container memory limit of **at least 750 MB** and recommend 2 GB for production ([containers]). Idle memory and startup time for 26.7.4 were **not found in any primary source** (UNVERIFIED; see Open questions). No database container is needed: `dev-file` (H2 on disk) or `dev-mem` (H2 in memory) ([help-db], [db]). |
| 3 | Seeding from files | `start-dev --import-realm` imports `/opt/keycloak/data/import/<realm>-realm.json` at startup ([import], [containers]). One JSON file declares the realm, nested groups, users with passwords and group paths, confidential clients with redirect and post-logout URIs, and the groups mapper ([group-rep], [user-rep], [client-rep], [pm-rep]). Values can come from environment variables through placeholders ([import]). Nothing needs clicking. |
| 4 | Tokens | The claim is always a JSON **array of strings**, either group names or full paths such as `/a/b` ([group-mapper]). Each of the ID token, access token, userinfo and introspection can be switched on separately ([mapper-helper]). Only direct memberships are listed ([group-mapper]). The claim is omitted when the user has no groups ([iss-22340]). No overage or cap mechanism was found in the built-in mapper. With 20 groups the claim adds a few hundred bytes (arithmetic below). |
| 5 | Logout | Discovery advertises the RP-initiated `end_session_endpoint` at `/realms/{realm}/protocol/openid-connect/logout` ([oidc-layers], [wellknown]). `post_logout_redirect_uri` requires `id_token_hint` or `client_id`, and must match the client's `post.logout.redirect.uris` (`+` means "same as the redirect URIs") ([logout-src], [rn-19]). |
| 6 | Compose and Kubernetes | Compose: one container. Kubernetes: a plain Deployment and Service in wechart's chart, based on Keycloak's own quickstart manifest ([kube-yaml]), or the community `keycloakx` chart 7.3.2, whose appVersion is 26.7.4 ([keycloakx-chart]). Issuer consistency: set `KC_HOSTNAME` to the browser URL. Where a client runs **inside** the cluster, add `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` ([hostname]). |
| 7 | oauth2-proxy and openid-client | oauth2-proxy has a dedicated `keycloak-oidc` provider with documented Keycloak setup ([o2p-kc]). openid-client 6.8.8 works through standard discovery, but plain `http://` needs `allowInsecureRequests` ([oc-insecure]). Both need extra care when the browser URL and the in-cluster URL differ (§6, §7). |
| 8 | Gotchas | See Gotchas. The most consequential: the claim holds **direct groups only**; the claim is **absent** for a user with no groups; the realm file must be named `<realm>-realm.json`; declaring `clientScopes` stops the default scopes being created; the issuer differs by request host unless `KC_HOSTNAME` is set; Safari/WebKit cookies over `http://localhost`; `sub` changes on every import unless user `id`s are pinned. |

## Install

Nothing goes into the pnpm workspace (`packages: []`). The provider is a container image.

- **Image:** `quay.io/keycloak/keycloak:26.7.4` ([kc-dl], [quay-tag]).
  - Index digest: `sha256:82a77884f3af238beab1e7afd63b5f530e1b5c0590bd7aa60b40a40463e29b2c`. The tag was last modified 2026-09-16 ([quay-tag]).
  - The index lists linux/amd64 `sha256:3d911baa186f352563854039b95f21a7e2c01c76b527fdc64f24a0885b927bdf`, linux/arm64 `sha256:1f91ac24e8d68b8189d5d53a8381464c1db0fcff479348d5de973a86b63d621c`, and linux/ppc64le, plus attestation manifests ([quay-index]). Apple Silicon is covered.
  - Pin it as `quay.io/keycloak/keycloak:26.7.4@sha256:82a77884…29b2c`.
- **Compressed size:**
  - arm64: 266,403,058 bytes in four layers, the largest 176,328,220 bytes ([quay-arm64]).
  - amd64: 267,934,327 bytes ([quay-amd64]).
- **Contents:**
  - Built on `registry.access.redhat.com/ubi9-micro` with `java-21-openjdk-headless`.
  - Runs as `USER 1000`, exposes 8080, 8443 and 9000, and has the entrypoint `/opt/keycloak/bin/kc.sh` ([dockerfile]).
  - It has "only enough for a bash shell, and to run Keycloak itself". There is no curl and no package manager ([containers]).
- **What 26.7.4 fixes:** six CVEs, among them an unauthenticated DoS through unbounded locale caching and a privilege escalation through impersonation. It also moves to Quarkus 3.33.3.2 ([gh-rel-2674]).
- **Support window:** "The latest minor release receives patch releases… When a new minor release is published, the previous minor release is no longer supported" ([releases-md]).
- **Patch cadence:** 26.7.0 (2026-07-09), 26.7.1 (08-05), 26.7.2 (08-19), 26.7.3 (08-31), 26.7.4 (09-16) ([gh-rel]).
- **No database container:**
  - The `db` option accepts `dev-file, dev-mem, mariadb, mssql, mysql, oracle, postgres, tidb`, and defaults to `dev-file` ([help-db]).
  - `dev-file` writes H2 to `<kc.home>/data/h2/keycloakdb` ([db-src]).
  - "The `dev-file` database is not suitable for production use-cases" ([db]). That doesn't matter for a development provider.
  - If Postgres were wanted, 26.7.4 supports Postgres 14 to 18 and was tested on 18 ([db]).
- **Helm chart (optional, see Init §B):** `codecentric/keycloakx` 7.3.2 has appVersion 26.7.4 ([keycloakx-chart]). Its latest commit, "Update Keycloak to 26.7.4 (#931)", is dated 2026-09-17 ([keycloakx-commits]).

## Init / auth pattern

### Modes and footprint levers

- **Development mode (`start-dev`).** "HTTP is enabled", "Strict hostname resolution is disabled", the cache is local, and theme and template caching are disabled ([configuration]). "This mode should be strictly avoided in production" ([containers]). The only start-dev options are `--help`, `--help-all`, `--import-realm` and `--verbose`. There is no `--optimized` ([help-start-dev]).
- **Production mode (`start`).** HTTP is disabled, and hostname and TLS configuration are expected ([configuration]). `start` accepts `--optimized` ([help-start]).
- **Build at startup.** Both `start` and `start-dev` "run a `build` command under the covers". Running an explicit `build` and then `start --optimized` avoids that at startup ([configuration]). So `start-dev` always pays the build step.
- **The dev-mode trade-off.** For development and tests, `start-dev` plus `dev-mem` gives a fresh, identical realm on every container start, with no DB container. An optimized `start` image would need a custom image build, `http-enabled`, a hostname, and (since dev-file is deprecated in production mode ([help-db])) a real database.
- **Memory settings:**
  - The JVM defaults are `-XX:MaxRAMPercentage=70 -XX:InitialRAMPercentage=50`, overridable with `JAVA_OPTS_KC_HEAP`. The docs set "at least 750 MB" as the minimum limit and recommend 2 GB ([containers]).
  - The sizing guide says Keycloak allocates 70% of the limit to heap and uses "approximately 300 MB of non-heap". It gives 1250 MB as the base for a pod "including caches of Realm data and 10,000 cached sessions" ([sizing]). That is a production figure, not an idle development figure.
- **Data points (other versions, not 26.7.4):**
  - One user reports that 26.5+ forced their max heap from 256m to 512m. That issue is closed and labelled a regression in 26.5.3 and 26.6.0 ([iss-45662]). A related fix skips OpenAPI and Swagger code when they are disabled, targeted at 26.5.2 and 26.6.0 ([iss-45498]).
  - A Quarkus issue log shows Keycloak **25.0.0** starting in about 16.6 s, including the implicit build ([qk-42906]).

### A. docker-compose (sketch; the ports are examples, not decisions)

wechart's API (:4100) and web app (:5273) run **on the host** in development (`/Users/srajagopal/Work/wechart/playwright.config.ts` L66–L105). So the browser and the API reach Keycloak at the same `http://localhost:<port>`, and the issuer is identical for both. Split-horizon only arises when a sign-in component runs *inside* a container (oauth2-proxy as a compose service, for example); see §C.

```yaml
  keycloak:
    image: quay.io/keycloak/keycloak:26.7.4   # pin @sha256 as above
    container_name: wechart-keycloak
    command: ['start-dev', '--import-realm']
    environment:
      KC_DB: dev-mem                      # fresh realm each start ([help-db])
      KC_HOSTNAME: http://localhost:58080 # full URL matching the published port ([containers-custom-port])
      KC_HEALTH_ENABLED: 'true'           # /health/* on :9000 ([health])
      KC_BOOTSTRAP_ADMIN_USERNAME: admin  # optional; the admin console only ([containers])
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      WECHART_OIDC_CLIENT_SECRET: ${WECHART_OIDC_CLIENT_SECRET:-dev-oidc-secret}  # read by a realm placeholder ([import])
    ports:
      - '127.0.0.1:58080:8080'
    volumes:
      - ./infra/keycloak/wechart-realm.json:/opt/keycloak/data/import/wechart-realm.json:ro
    healthcheck:   # the image has no curl; bash /dev/tcp is the documented form ([health])
      test: ['CMD', 'bash', '-c', "{ printf 'HEAD /health/ready HTTP/1.0\\r\\n\\r\\n' >&0; grep 'HTTP/1.0 200'; } 0<>/dev/tcp/localhost/9000"]
      interval: 5s
      retries: 60
```

- **Environment variables.** Each `KC_*` variable is the CLI option in upper case with underscores. For example `--db-url` becomes `KC_DB_URL`. Precedence is CLI, then environment, then `keycloak.conf` ([configuration]).
- **Custom ports.** When the container is published on another port, "--hostname" must be "the full URL matching the mapped port" ([containers-custom-port]).
- **Import timing.** "The server will not fully start until the imports are complete" ([import]). So a ready health check means the realm exists.

### B. Kubernetes on docker-desktop (Helm)

Three ways to run it:

1. **Plain templates in wechart's own chart.** Keycloak's quickstart manifest is the reference ([kube-yaml], linked from [kube-gs]).
   - It already pins `quay.io/keycloak/keycloak:26.7.4`.
   - It uses probes on port 9000: `startupProbe /health/started` (period 1 s, failureThreshold 600), `readinessProbe /health/ready` and `livenessProbe /health/live`.
   - It is a 2-replica production-mode StatefulSet with Postgres and `resources.limits.memory: 2000Mi`. That is more than a development provider needs.
   - The dev equivalent is a 1-replica Deployment running `start-dev --import-realm` with `KC_DB=dev-mem` and `KC_HEALTH_ENABLED=true`. Its memory limit must be at least 750 MB ([containers]), and it mounts the realm JSON from a ConfigMap.
   - Mount the ConfigMap with `subPath` so the file appears as `/opt/keycloak/data/import/wechart-realm.json`. `subPath` mounts don't receive ConfigMap updates ([k8s-cm]). That doesn't matter, because import only happens at startup ([import]).
   - Add a checksum annotation of the ConfigMap to the pod template so that a realm change rolls the pod ([helm-tips]).
2. **`codecentric/keycloakx` 7.3.2 as a dependency** ([keycloakx], [keycloakx-chart]). The defaults matter here ([keycloakx-values], [keycloakx-readme]):
   - It is a StatefulSet, and `command: []` and `args: []` must be set to `start-dev --import-realm`.
   - `http.relativePath: "/auth"` puts `/auth` in the issuer (`…/auth/realms/wechart`) unless overridden.
   - The proxy mode is `forwarded`. The Service is `ClusterIP` on port 80.
   - H2 is the database "by default". `extraEnv`, `extraVolumes` and `extraVolumeMounts` carry the realm file.
3. **The Keycloak Operator.** It is installed with `kubectl apply -k …keycloak-k8s-resources/kubernetes?ref=26.7.4` ([op-install]), and it is not a Helm chart.
   - Its `KeycloakRealmImport` runs a Job and "only supports creation of new realms and does not update or delete those" ([op-realm]).
   - It adds an operator Deployment and CRDs beside Keycloak. That is a larger footprint than options 1 and 2.
4. **Bitnami chart (not recommended for this use).** It deploys Bitnami's own images, not the upstream `quay.io/keycloak/keycloak` ([bitnami]).

**Exposure.** wechart's chart already publishes the web app as a `LoadBalancer` on `localhost:8089`. `values.yaml` L24–L27 relies on Docker Desktop publishing LoadBalancers on the host's localhost; see `./helm.md` §5, which marks the general claim partly UNVERIFIED. Keycloak can be exposed the same way on another port, for example 8180.

### C. Issuer URL consistency: browser vs in-cluster (Q6)

- **Discovery.** The discovery `issuer` is built from the **frontend** URL. `authorization_endpoint` and `end_session_endpoint` also use the frontend URL. `token_endpoint`, `userinfo_endpoint`, `jwks_uri` and the introspection endpoint use the **backend** URL ([wellknown]).
- **Token `iss`.** It is fixed when the authorization request arrives (the browser's request): `authenticationSession.setClientNote(OIDCLoginProtocol.ISSUER, Urls.realmIssuer(session.getContext().getUri().getBaseUri(), …))` ([authz-endpoint]).
- **Without `KC_HOSTNAME`.** In dev mode the hostname is resolved from the request, because hostname-strict is off ([configuration], [hostname]). A client that discovers through `http://keycloak:8080` would then be sent to an `authorization_endpoint` on that internal host, which the browser can't resolve (inference from [wellknown]).
- **Fix, part 1.** Set `KC_HOSTNAME` to the **browser** URL, as a full URL.
- **Fix, part 2.** For clients inside the cluster, or inside compose containers, also set `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`. It "Enables dynamic resolving of backchannel URLs… Set to true if your application accesses Keycloak via a private network", and it requires `hostname` to be a full URL ([hostname]). Backchannel URLs otherwise equal the frontend URLs in hostname v2 ([changes-25]).
- **Result.** Discovery fetched at `http://keycloak.<ns>.svc:8180/realms/wechart/.well-known/openid-configuration` returns:
  - `issuer = http://localhost:8180/realms/wechart`;
  - browser-facing `authorization_endpoint` and `end_session_endpoint` on `localhost:8180`;
  - `token`, `userinfo` and `jwks` on the internal host the request used.

  This is inferred from [wellknown] and [hostname]; confirm it with `--hostname-debug=true` and `/realms/wechart/hostname-debug` ([hostname]).
- **What the client must still handle.** The issuer (browser URL) differs from the URL the discovery document was fetched from. How each sign-in candidate copes:
  - **openid-client 6.8.8** ([npm-oc]):
    - `discovery(server, …)` validates the discovered `issuer` against the `server` passed in. Passing the discovery document's URL instead "is merely a shorthand for using fetch and passing the discovered JSON metadata into the Configuration constructor… it disables the ServerMetadata.issuer validation" ([oc-discovery]).
    - So one documented route is to fetch the metadata from the internal URL and call `new Configuration(serverMetadata, clientId, secret)` ([oc-config]).
    - ID-token `iss` still matches `serverMetadata.issuer`, which is the browser URL. That is inference; spike it.
    - `customFetch`, which replaces fetch "for all HTTP requests", is another route ([oc-discovery]). URL rewriting through it is a design inference, not documented usage.
  - **oauth2-proxy 7.15.4** ([o2p-rel]):
    - `--skip-oidc-discovery` requires `--login-url`, `--redeem-url` and `--oidc-jwks-url`. That lets `--oidc-issuer-url` be the browser URL while redeem and JWKS use the internal URL ([o2p-flags]).
    - `--insecure-oidc-skip-issuer-verification` "allow[s] the OIDC issuer URL to differ from the expected" ([o2p-flags]).
    - Which of these oauth2-proxy needs end to end belongs in the oauth2-proxy research doc (UNVERIFIED here).
- **Other single-URL tricks are UNVERIFIED.** These include `*.localhost` names resolved in-cluster through `hostAliases` plus a fixed ClusterIP, `host.docker.internal` from pods (see `./helm.md` Open questions), and host `/etc/hosts` edits. `KC_HOSTNAME` plus backchannel-dynamic is the mechanism Keycloak documents.

## API surface we will use

### 1. Realm import at startup

- **Flag.** `--import-realm` makes the server "import any realm configuration file from the `data/import` directory. Only regular files using the `.json` extension are read… sub-directories are ignored". The container directory is `/opt/keycloak/data/import` ([import]). The flag resolves `{home}/data/import` and only applies if that directory exists ([import-mixin]).
- **File naming.** "The realm file to be imported must be named `<realm name>-realm.json`", and this applies to "import at startup" ([import]).
- **An existing realm is skipped.** "If a realm already exists in the server, the import operation is skipped… To re-create realms you should explicitly run the `import` command" ([import]). With `dev-mem` the realm never pre-exists, so each start re-imports.
- **Placeholders.** "You are able to use placeholders to resolve values from environment variables for any realm configuration", for example `"realm": "${MY_REALM_NAME}"`. The guide shows no default-value syntax ([import]).
- **Master realm.** Since 26.0, `--import-realm` can import `master` if the import material contains it ([changes-26]). wechart doesn't need that.

**The realm JSON shapes** (fields from the 26.7.4 representations):

- **`GroupRepresentation`** ([group-rep]) has `name`, `path`, `subGroups: List<GroupRepresentation>`, `attributes`, `realmRoles` and `clientRoles`. Subgroups are imported recursively ([rep2model]).
- **`UserRepresentation`** ([user-rep]) has `id`, `username`, `firstName`, `lastName`, `email`, `emailVerified`, `enabled`, `credentials` and `groups: List<String>`.
  - Each entry in `groups` is a **path**, resolved by `KeycloakModelUtils.findGroupByPath`. If the path is unknown, import throws `RuntimeException("Unable to find group specified by path: …")` ([rep2model]).
  - `userRep.getId()` becomes the user's ID ([export-import-mgr]), and `sub` is the user ID (`token.subject(userSession.getUser().getId())`) ([sub-mapper]). Pinning `id` therefore pins `sub` across re-imports.
- **`CredentialRepresentation`** ([cred-rep]) has `type` (`"password"`), `value` and `temporary`.
- **`ClientRepresentation`** ([client-rep]) has `clientId`, `enabled`, `publicClient`, `clientAuthenticatorType`, `secret`, `redirectUris`, `webOrigins`, `standardFlowEnabled`, `directAccessGrantsEnabled`, `protocol`, `attributes: Map<String,String>`, `protocolMappers`, `defaultClientScopes` and `optionalClientScopes`.
- **`ProtocolMapperRepresentation`** ([pm-rep]) has `name`, `protocol`, `protocolMapper` and `config: Map<String,String>`.
- **Client attribute keys:**
  - `post.logout.redirect.uris` and `pkce.code.challenge.method` ([oidc-config-attrs]).
  - Multi-valued attributes are joined with `##` ([constants]).
  - `+` in post-logout URIs means "use the redirect URIs", and `-` means none ([adv-wrapper], [rn-19]).

**Example `infra/keycloak/wechart-realm.json`.** This is a sketch. The group names, users and ports are placeholders for the caller's design, not decided values.

```json
{
  "realm": "wechart",
  "enabled": true,
  "sslRequired": "none",
  "groups": [
    { "name": "wechart-super-admins" },
    { "name": "g01" }, { "name": "g02" }, { "name": "g03" }, { "name": "g04" }, { "name": "g05" },
    { "name": "g06" }, { "name": "g07" }, { "name": "g08" }, { "name": "g09" }, { "name": "g10" },
    { "name": "g11" }, { "name": "g12" }, { "name": "g13" }, { "name": "g14" }, { "name": "g15" },
    { "name": "g16" }, { "name": "g17" }, { "name": "g18" }, { "name": "g19" }, { "name": "g20" },
    { "name": "ad", "subGroups": [ { "name": "finance", "subGroups": [ { "name": "emea" } ] } ] }
  ],
  "users": [
    {
      "id": "00000000-0000-4000-8000-000000000020",
      "username": "user20",
      "enabled": true,
      "email": "user20@example.test",
      "emailVerified": true,
      "firstName": "Twenty",
      "lastName": "Groups",
      "credentials": [ { "type": "password", "value": "user20", "temporary": false } ],
      "groups": ["/g01","/g02","/g03","/g04","/g05","/g06","/g07","/g08","/g09","/g10",
                 "/g11","/g12","/g13","/g14","/g15","/g16","/g17","/g18","/g19","/g20"]
    }
  ],
  "clients": [
    {
      "clientId": "wechart",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "clientAuthenticatorType": "client-secret",
      "secret": "${WECHART_OIDC_CLIENT_SECRET}",
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "redirectUris": ["http://localhost:5273/*", "http://localhost:8089/*"],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "+"
      },
      "defaultClientScopes": ["basic", "profile", "email", "roles", "web-origins"],
      "protocolMappers": [
        {
          "name": "groups",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-group-membership-mapper",
          "config": {
            "claim.name": "groups",
            "full.path": "false",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "introspection.token.claim": "true"
          }
        },
        {
          "name": "audience",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "config": {
            "included.client.audience": "wechart",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        }
      ]
    }
  ]
}
```

- **Why the mappers sit on the client, not in a `clientScopes` block.** If the realm JSON has `clientScopes`, the default client scopes (profile, email, roles, web-origins, basic…) are only created when a special realm attribute is set: `rep.getClientScopes() == null || Boolean.parseBoolean(createDefaultClientScopes)` ([realm-mgr]).
- **Why `defaultClientScopes` is listed explicitly.** `updateClientScopes` only links scopes when the rep lists them ([rep2model]). Whether an unlisted client still gets the realm defaults was not confirmed (Open questions).
  - The built-in defaults are `profile`, `email`, `roles`, `web-origins` and `basic`. `basic` carries `sub` and `auth_time` ([oidc-factory], [rn-25]).
  - `acr` is left out of the example because its default status was not confirmed.
- **`sslRequired`.**
  - `external` (the default mode) allows HTTP only from private or loopback addresses.
  - `none` "applies only in development" ([ssl-doc], [sslreq-src]).
  - `none` removes any dependency on how Docker Desktop's port forwarding presents the source IP. This is a dev-only choice.

### 2. Group Membership mapper (`oidc-group-membership-mapper`)

- **Provider ID and options.** The provider ID is `oidc-group-membership-mapper` ([group-mapper]). Its config options:
  - `claim.name`, which is the configurable groups claim (AC-252).
  - `full.path`, labelled "Full group path", default `"true"`: "Include full path to group i.e. /top/level1/level2, false will just specify the group name. Make sure to enable this setting if your realm has a group hierarchy with duplicated group names" ([group-mapper], [ctx-mapper]).
  - The include-in-token flags.
- **How the value is built.**
  - `userSession.getUser().getGroupsStream()` returns the user's direct memberships.
  - Each group is mapped with `ModelToRepresentation::buildGroupPath` or `GroupModel::getName`.
  - The mapper forces `multivalued = true`, and the list is written with `OIDCAttributeMapperHelper.mapClaim` ([group-mapper]).
- **Include-in-token keys** ([mapper-helper]):
  - `id.token.claim`, `access.token.claim`, `userinfo.token.claim`, `introspection.token.claim` and `lightweight.claim`.
  - **When a key is absent from JSON:** the ID token and access token flags are `false`. Userinfo falls back to the ID-token setting, and introspection falls back to the access-token setting. The lightweight flag is `false`.
  - So set all of them explicitly in the realm file.
  - The admin-UI defaults (true for ID, access, userinfo and introspection) are **not** what an import gets.
- **Claim names with dots create nested JSON objects** (`splitClaimPath`). Dots can be escaped ([mapclaim-src], [rn-4.2]). Keep the configurable claim name free of dots, or escape it.
- **Groups are hierarchical.** "A group can have only one parent. Subgroups inherit the attributes and role mappings from their parent. Users inherit the attributes and role mappings from their parent as well" ([groups-doc]). Inheritance covers roles and attributes. The mapper's claim lists only the groups from `getGroupsStream()`, which does not add parents ([group-mapper]).
- **Slashes in group names are not escaped** by default. Escaping with `~` is opt-in: `--spi-group--jpa--escape-slashes-in-group-path=true` ([groups-doc], [changes-25]).

### 3. Audience mapper (`oidc-audience-mapper`)

- **Config.** `included.client.audience` and `included.custom.audience` ([aud-mapper]).
- **Why it is there.** oauth2-proxy's Keycloak guide requires one "to include the client's name in the `aud` claim" ([o2p-kc]).

### 4. OIDC endpoints (realm `wechart`)

- **Paths.** Authorization `/realms/{realm}/protocol/openid-connect/auth`, token `…/token`, userinfo `…/userinfo`, logout `…/logout`, certs `…/certs`, and introspection `…/token/introspect` ([oidc-layers]). Discovery is at `/realms/{realm}/.well-known/openid-configuration`.
- **PKCE and backchannel logout.** Discovery sets `code_challenge_methods_supported`, `backchannel_logout_supported=true` and `backchannel_logout_session_supported=true` ([wellknown]).
- **Unknown scopes are rejected.** The authorization endpoint answers `invalid_scope` with "Invalid scopes: …" ([authz-checker]).

### 5. Tokens (Q4)

- **Where groups go.** Each token type is controlled by the mapper flags above. For both sign-in candidates, put groups in the ID token, the access token and userinfo.
- **Claim format.** Always a JSON array, even for one group ([group-mapper]):
  - `full.path=false` gives `["g01", …]`;
  - `full.path=true` gives `["/g01", …, "/ad/finance/emea"]`.
- **Identity claims.** `sub` is the user ID ([sub-mapper]). `preferred_username`, `name`, `given_name`, `family_name`, `email` and `email_verified` come from the `profile` and `email` scopes ([oidc-factory]).
- **Size with 20 groups (arithmetic, not a measurement):**
  - `"g01",` is 6 bytes, so 20 entries plus `"groups":[]` come to about 130 bytes of JSON. Base64url adds a third, about 170 bytes per token.
  - With AD-style names of about 40 characters: 20 × 43 ≈ 860 bytes of JSON, about 1.15 KB in the JWT.
  - With 300 such groups: about 12.9 KB of JSON, about 17 KB per token.
  - Compare the RFC 6265 minimum cookie capacity of "4096 bytes per cookie" ([rfc6265-6.1]).
  - No cap or overage mechanism was found in the built-in mapper; it maps every direct group ([group-mapper]).
- **Keeping access tokens small.** "Lightweight access tokens" carry only claims whose mapper has "Add to lightweight access token" on. They are selected per client ("Always use lightweight access token") or by client policy ([rn-24], [protocol-mappers-doc]). The client attribute key for "Always use…" was not confirmed.

### 6. Logout (Q5)

- **Discovery.** It advertises the logout endpoint as `end_session_endpoint`, built from the frontend URL ([wellknown]). `end_session_endpoint` is the OIDC RP-Initiated Logout metadata name ([rp-logout]).
- **Parameters.** `id_token_hint`, `client_id`, `post_logout_redirect_uri`, `state` and `ui_locales` ([logout-src]).
  - `post_logout_redirect_uri` without `id_token_hint` or `client_id` is rejected with "Either the parameter 'client_id' or the parameter 'id_token_hint' is required…".
  - If both are given, they must name the same client.
  - The URI is checked against the client's post-logout redirect URIs ([logout-src]).
  - A valid `id_token_hint` sets `confirmationNeeded = false`. Without it, the user "might be optionally requested to confirm the logout" ([logout-src], [oidc-flows-doc]).
- **Front- and back-channel.** Keycloak sends logout requests to the clients attached to the SSO session, front-channel or back-channel depending on client config ([oidc-flows-doc]). The per-client keys are `backchannel.logout.url`, `frontchannel.logout.url` and `logout.confirmation.enabled` ([oidc-config-attrs]).
- **For AC-253.** The Keycloak SSO session survives the wechart session unless the logout endpoint is called. Redirecting the browser to `end_session_endpoint?id_token_hint=…&post_logout_redirect_uri=…` ends both. Without it, the next authorization request can complete without a credentials prompt. That is inference from standard SSO behaviour; spike it.

### 7. Health (for compose `healthcheck` and k8s probes)

- **Endpoints.** `/health/started`, `/health/live`, `/health/ready` and `/health` on management port **9000** ([health]).
- **Enabling.** `health-enabled` is a build option ([health]). Both start modes build implicitly ([configuration]), so `KC_HEALTH_ENABLED=true` works at runtime with `start-dev`.
- **Scheme.** The management interface follows the main server's TLS unless `http-management-scheme=http` is set ([mgmt]). In `start-dev` without TLS it is plain HTTP; the quickstart probes use HTTP on port 9000 ([kube-yaml]).

### 8. Compatibility with the sign-in candidates (Q7)

**oauth2-proxy 7.15.4** ([o2p-rel], docs 7.15.x):
- **Provider.** `--provider=keycloak-oidc`, with `--oidc-issuer-url=https://<keycloak host>/realms/<realm>`, `--allowed-role`, `--allowed-group` and `--code-challenge-method=S256` ([o2p-kc]).
- **Keycloak setup it documents.** A confidential client, an audience mapper, and a Group Membership mapper. "If the 'Full group path' option is selected, you need to include a '/' separator in the group names defined in the `--allowed-group` option" ([o2p-kc]).
- **Groups claim.** `--oidc-groups-claim` names the claim ([o2p-flags]), matching the configurable `claim.name`.
- **Implicit `groups` scope.** With the *generic* OIDC provider plus `allowed_groups` and no `--scope`, "the scope `groups` gets added implicitly" ([o2p-flags]). Keycloak rejects unknown scopes with `invalid_scope` ([authz-checker]). So either set `--scope` explicitly or define a `groups` client scope, keeping in mind the `clientScopes` trap in §1.
- **Email.** `--insecure-oidc-allow-unverified-email` exists to "not fail if an email address in an id_token is not verified" ([o2p-flags]). Seed `emailVerified: true`.
- **Logout.** `--backend-logout-url` substitutes `{id_token}` ([o2p-flags]), which matches Keycloak's `id_token_hint`. Whether a server-side GET ends Keycloak's SSO session is UNVERIFIED.

**openid-client 6.8.8** ([npm-oc]):
- **Discovery.** `discovery(server, clientId, metadata, clientAuth, options)` ([oc-discovery]).
- **HTTPS-only by default.** "By default the module only allows interactions with HTTPS endpoints". `allowInsecureRequests` removes the restriction, "possibly only for local development" ([oc-insecure]). Keycloak in `start-dev` is HTTP, so development needs it.
- **Logout URL.** `buildEndSessionUrl(config, { post_logout_redirect_uri, id_token_hint })` returns a URL that includes `client_id` ([oc-endsession]). That satisfies Keycloak's `client_id` / `id_token_hint` consistency check ([logout-src]).
- **Browser vs in-cluster URL.** See §C.

## Gotchas

1. **Direct groups only.**
   - The mapper uses `getGroupsStream()`, so a member of `/ad/finance/emea` gets `emea` or `/ad/finance/emea`, never `finance` or `ad` ([group-mapper]).
   - Parent groups only pass on *roles and attributes* ([groups-doc]).
   - To emulate AD's transitive nesting in development, list every group the user should be seen in, parents included, in the user's `groups` array.
2. **No groups means no claim.** Since Keycloak 22 the claim is **omitted**, not `[]`, and the issue was closed as not planned ([iss-22340]). wechart must treat a missing claim as an empty list.
3. **Full path vs name.**
   - The UI default is `full.path=true` ([group-mapper]). In an import, set it explicitly.
   - Names collide across branches; paths don't ([ctx-mapper]).
   - oauth2-proxy's `--allowed-group` then needs the leading `/` ([o2p-kc]).
   - Slashes inside group names are ambiguous unless escaping is enabled ([groups-doc]).
4. **Import-flag semantics.** With `access.token.claim`, `id.token.claim` or `lightweight.claim` absent, the claim is not added ([mapper-helper]). Always write all the flags.
5. **The `microprofile-jwt` optional scope also writes a claim named `groups`,** from *realm roles* (`UserRealmRoleMappingMapper`) ([oidc-factory]). Multi-valued claims merge into the existing collection ([mapclaim-src], [json-utils]). If a client requests that scope, roles such as `offline_access` would appear as groups. Don't assign or request it.
6. **The realm file name must be `<realm>-realm.json`** ([import]).
7. **`--import-realm` skips an existing realm** ([import]). With `dev-file`, or a persisted volume, edits to the realm file silently don't apply. `dev-mem` avoids this ([help-db]).
8. **A bad group path aborts the import.** An unknown path throws `RuntimeException` during import ([rep2model]), and the server "will not fully start until the imports are complete" ([import]). Expect a failed startup rather than a partial realm (inference).
9. **A `clientScopes` block suppresses the default scopes** unless a special realm attribute is set ([realm-mgr]). Without `basic`, tokens lose `sub` and `auth_time` ([rn-25]).
10. **`sub` is unstable unless pinned.** Without a user `id` in the JSON, each fresh import creates a new ID and so a new `sub` ([export-import-mgr], [sub-mapper]). wechart keys workspaces and audit entries by identity (§P2.2), so pin `id` for every seeded user.
11. **Hostname:**
    - Set `KC_HOSTNAME` to the full browser URL, including the published port ([containers-custom-port]). Otherwise the issuer follows whichever host the request used ([configuration], [authz-endpoint]).
    - Hostname v1 options were removed in 26.0 ([rn-26]).
    - Backchannel-dynamic requires `hostname` to be a full URL ([hostname]).
12. **Safari/WebKit over `http://localhost`.**
    - 26.0.0 broke Safari login over plain HTTP localhost with `cookie_not_found`. That issue was closed as not planned ([iss-33926]).
    - PR #33700, merged 2024-10-09, treats unencrypted local origins as an *insecure* context **for Safari**, detected from the user agent. Such contexts get cookies without `Secure` and with `SameSite=Lax` ([pr-33700], [rn-26-cookies]).
    - The Playwright suite runs WebKit as "Desktop Safari" (`playwright.config.ts` L61). Whether Keycloak's UA detection classifies Playwright's WebKit as Safari is UNVERIFIED; spike it.
13. **Cookies are shared across ports on `localhost`.** "Cookies do not provide isolation by port" ([rfc6265-8.5]). Keycloak on `localhost:<port>` and wechart on `localhost:5273` or `:8089` share one cookie jar. Large session cookies from wechart (hundreds of groups) would also be sent to Keycloak. Its request-header limit is UNVERIFIED.
14. **The image has no curl.** Use the documented bash `/dev/tcp` health check in compose ([health], [containers]) and `httpGet` probes on port 9000 in Kubernetes ([kube-yaml]).
15. **Memory.** Set the limit to at least 750 MB ([containers]). The JVM takes 70% of it as heap ([containers], [sizing]).
16. **keycloakx defaults.** `/auth` relative path, a StatefulSet, and proxy headers `forwarded` ([keycloakx-values]). Each changes URLs or behaviour relative to a plain `start-dev`.
17. **openid-client and plain HTTP.** openid-client rejects `http://` endpoints unless `allowInsecureRequests` is applied ([oc-insecure]). That is correct for development only.
18. **Unknown requested scopes fail** with `invalid_scope` ([authz-checker]).
19. **26.7 upgrade notes that touch this use** ([upgrading]):
    - The default shutdown timeout went from 1 s to 10 s.
    - Newly generated client secrets are 86 characters. Irrelevant when the secret is set in JSON.
    - Session cookies now use SHA-384.
    - `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` are the documented bootstrap-admin variables ([containers], [configuration]).
20. **Support window.** Only the latest minor is supported ([releases-md]). 26.7.4 carried six CVE fixes ([gh-rel-2674]). Pin tag plus digest, and re-pin on each patch.

## Alternatives considered

Not in scope for this document: it researches Keycloak only, and other development-provider candidates are covered in sibling research docs. Within Keycloak, the deployment variants are compared in Init §B:
- plain templates;
- the keycloakx chart;
- the Operator (an extra operator Deployment and CRDs; realm import is create-only);
- the Bitnami chart (not the upstream image).

## Open questions / unverified

1. **Idle memory, CPU and startup time for 26.7.4 `start-dev` + `dev-mem` with this realm:** UNVERIFIED. No primary source gives development-mode idle figures. The sizing guide is production-oriented ([sizing]), and the startup data point is from 25.0.0 ([qk-42906]). To measure: `docker stats wechart-keycloak` after ready, and the "started in Xs" log line.
2. **Do imported clients without `defaultClientScopes` get the realm default scopes?** UNVERIFIED. `updateClientScopes` does nothing when the rep lists none ([rep2model]), and the creation-time linking code wasn't found. The example lists the scopes explicitly.
3. **The key string of the `CREATE_DEFAULT_CLIENT_SCOPES` realm attribute:** UNVERIFIED. Only its use was read ([realm-mgr]).
4. **Is `acr` a default or optional client scope in 26.7.4?** UNVERIFIED. The fetched summary of [oidc-factory] listed it as optional and conditional.
5. **Default user-profile required attributes and the `verify-profile` action:** UNVERIFIED which attributes are required. `verify-profile` is enabled by default for new realms and prompts users whose profile doesn't meet the configuration ([changes-24-vp], [req-actions]). Seeding `email`, `emailVerified`, `firstName` and `lastName` avoids a prompt whatever the configuration is.
6. **Playwright WebKit under Keycloak's Safari insecure-context detection over `http://localhost`:** UNVERIFIED ([pr-33700]).
7. **Placeholder with an unset environment variable:** UNVERIFIED. The guide shows `${VAR}` only ([import]).
8. **Order of entries in the groups claim:** UNVERIFIED. `getGroupsStream()` order is not documented. Tests must not depend on it.
9. **Server-side logout.** Does a server-side GET to the logout endpoint with `id_token_hint` (oauth2-proxy `--backend-logout-url`) end the SSO session? UNVERIFIED. Browser-redirect RP-initiated logout is the documented path ([oidc-flows-doc]).
10. **Realm signing keys under `dev-mem`.** They are presumably regenerated on each start, so the JWKS `kid` would change and sessions from before a restart would stop verifying. UNVERIFIED. To check, compare `/realms/wechart/protocol/openid-connect/certs` across two starts.
11. **The client attribute key for "Always use lightweight access token":** UNVERIFIED ([rn-24]).
12. **Keycloak's maximum request-header size**, which matters only for the hundreds-of-groups case with cookies shared on `localhost`: UNVERIFIED.
13. **The split-horizon client handling end to end:** UNVERIFIED until spiked.
    - `new Configuration(metadataFromInternalUrl, …)` in openid-client and ID-token `iss` validation.
    - Which oauth2-proxy flag set works.
    - To check, run `--hostname-debug=true` and read `/realms/wechart/hostname-debug` ([hostname]).
14. **ConfigMap directory mounts.** Are files projected as symlinks accepted by the import directory's "regular files" rule? UNVERIFIED. The `subPath` mount recommended above sidesteps it ([k8s-cm]).
15. **Single-URL options** (`*.localhost` plus `hostAliases`, or `host.docker.internal` from pods): UNVERIFIED. See `./helm.md` Open questions.

[kc-dl]: https://www.keycloak.org/downloads
[gh-rel]: https://github.com/keycloak/keycloak/releases
[gh-rel-2674]: https://github.com/keycloak/keycloak/releases/tag/26.7.4
[gh-repo]: https://github.com/keycloak/keycloak
[releases-md]: https://github.com/keycloak/keycloak/blob/main/RELEASES.md
[cncf]: https://www.cncf.io/projects/keycloak/
[quay-tag]: https://quay.io/api/v1/repository/keycloak/keycloak/tag/?specificTag=26.7.4&onlyActiveTags=true
[quay-index]: https://quay.io/api/v1/repository/keycloak/keycloak/manifest/sha256:82a77884f3af238beab1e7afd63b5f530e1b5c0590bd7aa60b40a40463e29b2c
[quay-arm64]: https://quay.io/api/v1/repository/keycloak/keycloak/manifest/sha256:1f91ac24e8d68b8189d5d53a8381464c1db0fcff479348d5de973a86b63d621c
[quay-amd64]: https://quay.io/api/v1/repository/keycloak/keycloak/manifest/sha256:3d911baa186f352563854039b95f21a7e2c01c76b527fdc64f24a0885b927bdf
[dockerfile]: https://github.com/keycloak/keycloak/blob/26.7.4/quarkus/container/Dockerfile
[containers]: https://www.keycloak.org/server/containers
[containers-custom-port]: https://github.com/keycloak/keycloak/blob/main/docs/guides/server/containers.adoc
[configuration]: https://www.keycloak.org/server/configuration
[db]: https://www.keycloak.org/server/db
[db-src]: https://github.com/keycloak/keycloak/blob/main/quarkus/config-api/src/main/java/org/keycloak/config/database/Database.java
[help-start-dev]: https://github.com/keycloak/keycloak/blob/main/quarkus/tests/integration/src/test/resources/org/keycloak/it/cli/dist/approvals/cli/help/HelpCommandDistTest.testStartDevHelp.approved.txt
[help-start]: https://github.com/keycloak/keycloak/blob/main/quarkus/tests/integration/src/test/resources/org/keycloak/it/cli/dist/approvals/cli/help/HelpCommandDistTest.testStartHelp.approved.txt
[help-db]: https://github.com/keycloak/keycloak/blob/main/quarkus/tests/integration/src/test/resources/org/keycloak/it/cli/dist/approvals/cli/help/HelpCommandDistTest.testBootstrapAdminService.approved.txt
[sizing]: https://www.keycloak.org/high-availability/multi-cluster/concepts-memory-and-cpu-sizing
[iss-45662]: https://github.com/keycloak/keycloak/issues/45662
[iss-45498]: https://github.com/keycloak/keycloak/issues/45498
[qk-42906]: https://github.com/quarkusio/quarkus/issues/42906
[import]: https://www.keycloak.org/server/importExport
[import-mixin]: https://github.com/keycloak/keycloak/blob/26.7.4/quarkus/runtime/src/main/java/org/keycloak/quarkus/runtime/cli/command/ImportRealmMixin.java
[changes-26]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/upgrading/topics/changes/changes-26_0_0.adoc
[rn-26]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/26_0_0.adoc
[rn-26-cookies]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/26_0_0.adoc
[changes-25]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/upgrading/topics/changes/changes-25_0_0.adoc
[changes-24-vp]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/upgrading/topics/changes/changes-24_0_0.adoc
[req-actions]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/users/con-required-actions.adoc
[upgrading]: https://www.keycloak.org/docs/latest/upgrading/index.html
[group-rep]: https://github.com/keycloak/keycloak/blob/26.7.4/core/src/main/java/org/keycloak/representations/idm/GroupRepresentation.java
[user-rep]: https://github.com/keycloak/keycloak/blob/26.7.4/core/src/main/java/org/keycloak/representations/idm/UserRepresentation.java
[cred-rep]: https://github.com/keycloak/keycloak/blob/26.7.4/core/src/main/java/org/keycloak/representations/idm/CredentialRepresentation.java
[client-rep]: https://github.com/keycloak/keycloak/blob/26.7.4/core/src/main/java/org/keycloak/representations/idm/ClientRepresentation.java
[pm-rep]: https://github.com/keycloak/keycloak/blob/26.7.4/core/src/main/java/org/keycloak/representations/idm/ProtocolMapperRepresentation.java
[rep2model]: https://github.com/keycloak/keycloak/blob/26.7.4/server-spi-private/src/main/java/org/keycloak/models/utils/RepresentationToModel.java
[export-import-mgr]: https://github.com/keycloak/keycloak/blob/26.7.4/model/storage-private/src/main/java/org/keycloak/storage/datastore/DefaultExportImportManager.java
[realm-mgr]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/services/managers/RealmManager.java
[oidc-factory]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocolFactory.java
[group-mapper]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/mappers/GroupMembershipMapper.java
[ctx-mapper]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/mappers/GroupMembershipMapper.java
[mapper-helper]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/mappers/OIDCAttributeMapperHelper.java
[mapclaim-src]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/mappers/AbstractUserRoleMappingMapper.java
[json-utils]: https://github.com/keycloak/keycloak/blob/main/server-spi-private/src/main/java/org/keycloak/utils/JsonUtils.java
[rn-4.2]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/4_2_0_final.adoc
[aud-mapper]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/mappers/AudienceProtocolMapper.java
[sub-mapper]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/mappers/SubMapper.java
[groups-doc]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/roles-groups/proc-managing-groups.adoc
[iss-22340]: https://github.com/keycloak/keycloak/issues/22340
[rn-24]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/24_0_0.adoc
[rn-25]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/25_0_0.adoc
[protocol-mappers-doc]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/con-protocol-mappers.adoc
[oidc-layers]: https://www.keycloak.org/securing-apps/oidc-layers
[logout-src]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/endpoints/LogoutEndpoint.java
[oidc-flows-doc]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/sso-protocols/con-oidc-auth-flows.adoc
[rn-19]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/release_notes/topics/19_0_0.adoc
[oidc-config-attrs]: https://github.com/keycloak/keycloak/blob/26.7.4/server-spi-private/src/main/java/org/keycloak/protocol/oidc/OIDCConfigAttributes.java
[adv-wrapper]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/OIDCAdvancedConfigWrapper.java
[constants]: https://github.com/keycloak/keycloak/blob/main/server-spi-private/src/main/java/org/keycloak/models/Constants.java
[rp-logout]: https://openid.net/specs/openid-connect-rpinitiated-1_0.html
[hostname]: https://www.keycloak.org/server/hostname
[wellknown]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/OIDCWellKnownProvider.java
[authz-endpoint]: https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/endpoints/AuthorizationEndpoint.java
[authz-checker]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/endpoints/AuthorizationEndpointChecker.java
[ssl-doc]: https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/realms/ssl.adoc
[sslreq-src]: https://github.com/keycloak/keycloak/blob/main/common/src/main/java/org/keycloak/common/enums/SslRequired.java
[health]: https://www.keycloak.org/observability/health
[mgmt]: https://www.keycloak.org/server/management-interface
[kube-gs]: https://www.keycloak.org/getting-started/getting-started-kube
[kube-yaml]: https://raw.githubusercontent.com/keycloak/keycloak-quickstarts/refs/heads/main/kubernetes/keycloak.yaml
[op-install]: https://www.keycloak.org/operator/installation
[op-realm]: https://www.keycloak.org/operator/realm-import
[keycloakx]: https://github.com/codecentric/helm-charts/tree/master/charts/keycloakx
[keycloakx-chart]: https://github.com/codecentric/helm-charts/blob/master/charts/keycloakx/Chart.yaml
[keycloakx-values]: https://github.com/codecentric/helm-charts/blob/master/charts/keycloakx/values.yaml
[keycloakx-readme]: https://github.com/codecentric/helm-charts/blob/master/charts/keycloakx/README.md
[keycloakx-commits]: https://github.com/codecentric/helm-charts/commits/master/charts/keycloakx
[bitnami]: https://github.com/bitnami/charts/blob/main/bitnami/keycloak/README.md
[k8s-cm]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/
[helm-tips]: https://helm.sh/docs/v3/howto/charts_tips_and_tricks/
[iss-33926]: https://github.com/keycloak/keycloak/issues/33926
[pr-33700]: https://github.com/keycloak/keycloak/pull/33700
[rfc6265-6.1]: https://www.rfc-editor.org/rfc/rfc6265#section-6.1
[rfc6265-8.5]: https://www.rfc-editor.org/rfc/rfc6265#section-8.5
[o2p-kc]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/keycloak_oidc
[o2p-flags]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview
[o2p-rel]: https://github.com/oauth2-proxy/oauth2-proxy/releases
[npm-oc]: https://registry.npmjs.org/openid-client/latest
[oc-discovery]: https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md
[oc-config]: https://github.com/panva/openid-client/blob/main/docs/classes/Configuration.md
[oc-insecure]: https://github.com/panva/openid-client/blob/main/docs/functions/allowInsecureRequests.md
[oc-endsession]: https://github.com/panva/openid-client/blob/main/docs/functions/buildEndSessionUrl.md
