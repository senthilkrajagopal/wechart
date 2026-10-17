---
library: MCP deployment and personal access tokens (Node built-ins, Claude connectors, Kubernetes ingress, Postgres counter)
packages: ["node:crypto", "node:zlib"]
version: 26.12.0
researched: 2026-10-17
sources: [https://claude.com/docs/connectors/custom/add-unlisted, https://claude.com/docs/connectors/building/authentication, https://claude.com/docs/connectors/building/troubleshooting, https://claude.com/docs/connectors/building/testing, https://claude.com/docs/connectors/mcp-tunnels/overview, https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp, https://platform.claude.com/docs/en/api/ip-addresses, https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/, https://github.com/kubernetes/ingress-nginx/releases, https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md, https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/, https://kubernetes.github.io/ingress-nginx/user-guide/miscellaneous/, https://kubernetes.io/docs/concepts/services-networking/ingress/, https://kubernetes.io/docs/tutorials/services/source-ip/, https://nginx.org/en/docs/http/ngx_http_proxy_module.html, https://fastify.dev/docs/latest/Reference/Server/, https://fastify.dev/docs/latest/Reference/Request/, https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/, https://pages.nist.gov/800-63-4/sp800-63b.html, https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html, https://nodejs.org/docs/latest-v26.x/api/crypto.html, https://nodejs.org/docs/latest-v26.x/api/zlib.html, https://www.postgresql.org/docs/18/sql-insert.html, https://raw.githubusercontent.com/fastify/fastify-rate-limit/v11.2.1/index.js, https://raw.githubusercontent.com/fastify/fastify-rate-limit/v11.2.1/types/index.d.ts]
---
# MCP deployment and personal access tokens (Node 26.12.0 built-ins; ingress-nginx controller-v1.15.1; PostgreSQL 18)

## Summary

**Scope.** This doc covers what wechart's MCP server (spec F41) needs in order to be reached and authenticated. It covers AC-430 … AC-445 and AC-468 … AC-479, focusing on AC-435, AC-445, AC-468, AC-472, AC-474 and AC-476. It does not repeat `docs/research/mcp-typescript-sdk.md` (the SDK, transports and spec auth) or `docs/research/fastify-rate-limit.md` (the plugin's options). It adds four things:
- what Claude's custom connectors actually send;
- Anthropic's egress ranges;
- the ingress, client-IP and TLS settings;
- the token format, storage and Postgres counter that the plugin's custom `store` needs.

**Versions pinned here**
- **Node.** The `node:crypto` and `node:zlib` docs are for Node v26.12.0 ([Node crypto][node-crypto]).
- **ingress-nginx.** controller-v1.15.1 (2026-03-19) is the last release. The repository "was archived by the owner on Mar 24, 2026" ([ingress-nginx releases][ingn-rel]).
- **PostgreSQL.** wechart's metadata DB image is `postgres:18.6-alpine3.24` (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml:51`). PostgreSQL 18 docs are cited.

**Decisive findings**
1. **The connector can send `Authorization: Bearer <token>` (AC-435, AC-445), but only through a beta feature, and on Team/Enterprise plans the credential is shared by the whole organisation.**
   - Claude sends the header value "exactly as you enter it" and adds no scheme. So the user must type `Bearer <token>` ([add-unlisted][cc-add]).
   - The feature ("Request headers", type `static_headers`) is "in beta and available to a limited set of organizations" ([add-unlisted][cc-add], [connector auth][cc-auth]).
   - On Team/Enterprise, "an organization Owner enters an API key or bearer token once … and Claude sends it in a request header on every call from anyone in that organization". Anthropic's own advice is "Treat it as the organization's credential, not a person's … If your tools need to act as the individual user, use OAuth instead" ([connector auth][cc-auth]).
   - This conflicts with AC-432 / AC-445's "as the token's owner" for any Team/Enterprise org. See Open questions.
   - It also corrects option C in `mcp-typescript-sdk.md`, which listed Claude.ai connectors as plainly supporting PATs.
2. **Anthropic's connector egress is one IPv4 /21, and connectors are IPv4-only.**
   - Outbound traffic comes from `160.79.104.0/21` ([IP addresses][anth-ip], [connector auth][cc-auth]).
   - "Connectors are IPv4-only, so a hostname that only publishes `AAAA` records can't be reached" ([troubleshooting][cc-trouble]).
   - No machine-readable feed was found.
3. **ingress-nginx is retired.**
   - "after March 2026 … No further releases, No bugfixes, No updates to resolve security vulnerabilities" ([k8s retirement blog][k8s-retire]).
   - The Ingress API itself "has been frozen", and Gateway API is recommended ([k8s Ingress][k8s-ingress]).
   - wechart's Helm chart has **no Ingress at all today**. A grep for `kind: Ingress|ingressClass|ingress-nginx` under `/Users/srajagopal/Work/wechart/deploy` finds nothing. The web app is a `LoadBalancer` Service (`deploy/helm/wechart/templates/web.yaml:11`, `values.yaml:26`), and the API is `ClusterIP` (`templates/api.yaml:9`).
   - Which controller AC-476 is built on is therefore a decision for the user. The ingress-nginx settings below are documented because they were asked for.
4. **wechart never sets `trustProxy` when sign-in is off, and the chart never sets it at all.**
   - `WECHART_TRUST_PROXY` is read only inside `signInOf()`, which runs only when `security === 'oidc'` (`/Users/srajagopal/Work/wechart/packages/api/src/config.ts:214`, `:324`).
   - `templates/api.yaml` sets no `WECHART_TRUST_PROXY`.
   - Without it, `request.ip` is the socket peer ([Fastify Request][fy-req]): the ingress pod, not the client. Every bad-token request would then share one per-IP key, which breaks AC-474. With sign-in off it also breaks AC-479's "every other F41 criterion".

## Install

Nothing to install. The parts used here are all Node built-ins:
- `node:crypto`: `randomBytes`, `createHash`, `createHmac`, `timingSafeEqual` ([Node crypto][node-crypto]);
- `node:zlib`: `crc32`, needed only if a checksum is adopted ([Node zlib][node-zlib]).

The Postgres counter runs on the existing `wechart-meta` through `kysely` 0.29.6 / `pg` 8.23.0, which are already dependencies (`/Users/srajagopal/Work/wechart/packages/api/package.json`). `@fastify/rate-limit` 11.2.1 is covered by `docs/research/fastify-rate-limit.md`.

Cluster side (not npm): an ingress controller with an `IngressClass`. "Each Ingress must specify an `ingressClassName` … If omitted, a default IngressClass should be defined" ([k8s Ingress][k8s-ingress]).

## Init / auth pattern

### 1. Claude.ai / Claude Desktop custom connector with a fixed credential (AC-435, AC-445)

**Who can set it up**
- **Team/Enterprise.** "An Owner adds the connector for the organization." On Enterprise, members whose custom role includes managing the organisation's libraries can add one too. Other members "can't add a custom connector yourself" ([add-unlisted][cc-add]).
- **Free/Pro/Max.** "You add custom connectors to your own account. On the Free plan, you can add one custom connector" ([add-unlisted][cc-add]).
- The Pro/Max steps in the support article include "Under **Request headers**, add fixed credentials such as API keys" ([support article][cc-support]).
- The developer page describes `static_headers` as "entered by an organization Owner" ([connector auth][cc-auth]). Whether individual Pro/Max accounts see Request headers depends on the beta rollout (UNVERIFIED for any given account).

**Dialog settings for a PAT**
- **Authentication:** "If the server uses an API key, choose **No sign-in** and add the key under **Request headers**. Claude stores the key as the connector's credential" ([add-unlisted][cc-add]).
- **Header name:** choose from a list that "offers standard authentication and routing header names such as `authorization`, `x-api-key`, and `x-auth-token`, which every connector can use". Other names need Anthropic's approval ([add-unlisted][cc-add]).
- **Value:** sent exactly as entered.

  | You enter | Claude sends |
  |---|---|
  | `Bearer your-token` | `Authorization: Bearer your-token` |
  | `your-token` | `Authorization: your-token` |

  ([add-unlisted][cc-add]). A user who pastes the bare token sends a header without the `Bearer` scheme, and AC-435 rejects it. wechart's token page should show the exact value to paste (design inference).
- **Storage and limits:** "Claude stores each header value securely, doesn't show it again after you save, and sends it on every request". Up to four headers ([add-unlisted][cc-add]).
- **Changing the token:** not possible in place. "You can't change authentication settings after you add a connector … remove the connector and add it again". So replacing an expired PAT (AC-468: 90 days at most) means re-adding the connector ([add-unlisted][cc-add]).
- **On an OAuth connection,** `Authorization` cannot be a custom header ([add-unlisted][cc-add]). This doesn't apply to wechart's PAT design.

**Per user or per organisation**
- On Team/Enterprise: "everyone who uses the connector reaches the service with that same credential, so use one limited to what members should access" ([support article][cc-support]).
- Anthropic: "every member's requests carry the same key, so don't use it to identify which user is calling" ([connector auth][cc-auth]).

**Server rules Anthropic states**
- "Never accept it in the URL" ([connector auth][cc-auth]). This matches AC-435.
- A cross-host redirect drops the credential: "Claude drops the `Authorization` header on the redirect" ([troubleshooting][cc-trouble]). Register the exact `https://<mcp-host>/mcp` URL, with no apex→www, trailing-slash or http→https redirect in the path.

**Which Claude surfaces call from Anthropic's cloud**
- "claude.ai connectors run on Anthropic's infrastructure and reach your server over the public internet" ([troubleshooting][cc-trouble]).
- The "hosted Claude apps, which are claude.ai on the web, Desktop, mobile, and Cowork" share one OAuth client and callback ([connector auth][cc-auth]). That Desktop's remote-connector traffic also leaves from Anthropic's egress, rather than the user's machine, is inferred from this grouping and from the existing research's "connected from Anthropic's cloud" (UNVERIFIED by a direct statement).
- **Claude Code (AC-444) connects from the user's own machine:** "the CLI and `curl` connect from your machine, while claude.ai connects from Anthropic's servers" ([troubleshooting][cc-trouble]). Its source address is the enterprise network's, so AC-476's allow-list must include both.

**DNS**
- Claude rejects hostnames that resolve to RFC 1918, CGNAT (`100.64.0.0/10`), loopback or link-local addresses, or to a mix of public and non-public addresses ([troubleshooting][cc-trouble]).
- Split-horizon DNS can break claude.ai while Claude Code works ([troubleshooting][cc-trouble]).

**Origin header.** Anthropic lists "Strict `Origin`-header validation: an overly strict check rejects Anthropic's requests" as a cause of `initialize` timeouts ([testing][cc-test]). Which `Origin`, if any, the connector sends is not documented (UNVERIFIED). This matters for AC-436. The MCP spec's rule applies only when `Origin` is present (`mcp-typescript-sdk.md`).

**Private-network alternative (not requested, noted for completeness).**
- MCP tunnels are a "research preview … available to organizations on the Claude Enterprise plan by request".
- An outbound-only `cloudflared` plus `mcp-proxy` stack is deployable with Helm, so no inbound allow-list is needed.
- The proxy forwards only to RFC 1918 IPv4 addresses by default.
- "The tunnel carries traffic to your MCP servers but does not authenticate to them" ([MCP tunnels][cc-tunnels]).

### 2. Anthropic's IP ranges (AC-476)

**Where they're published**
- The "IP addresses" page lists outbound IPv4 `160.79.104.0/21`: "the stable IP addresses that Anthropic uses for outbound requests (for example, when making MCP tool calls to external servers)" ([IP addresses][anth-ip]).
- No outbound IPv6 range is listed ([IP addresses][anth-ip]). Inbound ranges are `160.79.104.0/23` and `2607:6bc0::/48`; they are for traffic to Anthropic and not relevant to the allow-list.
- The connector docs repeat the range: "Anthropic's outbound traffic to your server originates from `160.79.104.0/21`" ([connector auth][cc-auth]).
- The page notes that outbound MCP connector calls from Claude Platform on AWS also "originate from the Anthropic ranges listed on this page" ([IP addresses][anth-ip]).

**How often they change**
- The page says "These addresses will not change without notice" ([IP addresses][anth-ip]). No cadence or notice channel is given.
- It lists five phased-out `/32`s (`34.162.46.92`, `34.162.102.82`, `34.162.136.91`, `34.162.142.92`, `34.162.183.95`) to be removed from firewalls ([IP addresses][anth-ip]), so the range has changed at least once.
- The dates of past changes and the channel used for notice are UNVERIFIED.

**Machine-readable source.** None was found on the page or in `https://claude.com/docs/llms.txt`. UNVERIFIED that none exists: the session's web-search budget was exhausted, so only known pages were fetched. Keep the CIDR in Helm values, as AC-476 already says.

**What the allow-list can and cannot do.** The /21 is Anthropic's shared egress for every Claude customer's connectors ([IP addresses][anth-ip]). Allowing it admits any Claude user's connector, not just this enterprise's. The allow-list narrows exposure but cannot replace the token check (inference from the page's description).

### 3. Kubernetes ingress for a separate MCP host (AC-476, AC-436, AC-474)

**wechart today.** There is no Ingress. Today `/mcp` on the web host would fall into nginx's `location /` → `try_files $uri /index.html`. With sign-in on, `auth_request` redirects to sign-in instead (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/web-config.yaml:116-122`). Only `/api/` and two sign-in pages are proxied to the API (`:64`, `:83`). AC-476 says "`/mcp` answers on the web app's host" fails. Whether serving the SPA shell at `/mcp` counts as answering is the spec's call. An explicit `location = /mcp { return 404; }` in `web-config.yaml` would remove the ambiguity (design inference).

**A host serving one path over TLS (Kubernetes Ingress API)**
- `pathType: Exact` "Matches the URL path exactly and completely". `Prefix` matches by `/`-separated prefix ([k8s Ingress][k8s-ingress]).
- TLS needs a Secret with `tls.crt` / `tls.key`. The TLS `hosts` must match the rule hosts, and "TLS is only available on port 443" ([k8s Ingress][k8s-ingress]).
- Requests matching no rule go to `defaultBackend` if one is set, and "Behavior is otherwise controller-specific" ([k8s Ingress][k8s-ingress]). What ingress-nginx returns for an unmatched path on a matched host is not quoted here (UNVERIFIED). Test that `/`, `/mcp/` and `/.well-known/...` on the MCP host don't reach the API.

**ingress-nginx annotations (controller-v1.15.1), prefix `nginx.ingress.kubernetes.io`** ([annotations][ingn-ann])

| Need | Annotation / ConfigMap key | Behaviour (source) |
|---|---|---|
| Source-IP allow-list | `nginx.ingress.kubernetes.io/whitelist-source-range: "160.79.104.0/21,<enterprise CIDRs>"` | "You can specify allowed client IP source ranges through the `nginx.ingress.kubernetes.io/whitelist-source-range` annotation"; comma-separated CIDRs ([annotations][ingn-ann]). In the v1.15.1 docs the name is still `whitelist-source-range`; no `allowlist-source-range` was found there. The ConfigMap `whitelist-source-range` "Sets the default whitelisted IPs for each `server` block. This can be overwritten by an annotation" ([configmap][ingn-cm]). |
| Response buffering off for SSE | `nginx.ingress.kubernetes.io/proxy-buffering: "off"` | "By default proxy buffering is disabled in the NGINX config" ([annotations][ingn-ann]); ConfigMap `proxy-buffering` default `"off"` ([configmap][ingn-cm]). Plain nginx's own default is `on`, and nginx honours `X-Accel-Buffering: yes/no` from the upstream unless `proxy_ignore_headers` disables it ([nginx proxy][nginx-proxy]). The MCP spec asks servers to send `X-Accel-Buffering: no` on SSE (`mcp-typescript-sdk.md`). |
| Timeouts | `proxy-read-timeout`, `proxy-send-timeout`, `proxy-connect-timeout` | "unitless and in seconds" ([annotations][ingn-ann]); read and send default 60 ([configmap][ingn-cm]). `proxy_read_timeout` is "set only between two successive read operations, not for the transmission of the whole response" ([nginx proxy][nginx-proxy]). wechart's web nginx uses 130 s for `/api/` because of 2×30 s connection tests and xcube's 120 s compile wait (`web-config.yaml:69-72`). The longest MCP tool call is a design question. |
| HTTPS only | `ssl-redirect` | "By default the controller redirects (308) to HTTPS if TLS is enabled" ([annotations][ingn-ann]); ConfigMap `ssl-redirect` and `hsts` default `true` ([configmap][ingn-cm]). The 308 is same-host, so the Authorization header isn't dropped by Claude's cross-host rule ([troubleshooting][cc-trouble]). Registering the `https://` URL avoids the redirect entirely. |
| Don't use regex | `use-regex` | "the case insensitive regular expression … will be enforced on ALL paths for a given host" ([annotations][ingn-ann]). Not needed for one `Exact` path. |
| Snippets | `server-snippet` / `configuration-snippet` | "can be dangerous in multi-tenant clusters" ([annotations][ingn-ann]); `allow-snippet-annotations` default `"false"` ([configmap][ingn-cm]). Not needed. |

**Preserving the client IP**
- **L4 in front of the controller.** With a `LoadBalancer`/`NodePort` Service at the default `externalTrafficPolicy: Cluster`, the source IP is SNAT'd to the node's. `Local` preserves it, but "kube-proxy only proxies requests to local endpoints … If there are no local endpoints, packets sent to the node are dropped" ([k8s source IP][k8s-srcip]).
  - Otherwise use PROXY protocol: `use-proxy-protocol` (default `false`) for "proxy servers and load balancers such as HAProxy and Amazon Elastic Load Balancer" ([configmap][ingn-cm], [misc][ingn-misc]).
  - The allow-list matches whatever address nginx ends up with. If the peer is SNAT'd, the allow-list sees node IPs (inference from the two sources).
- **The controller's own X-Forwarded-For handling.**
  - `use-forwarded-headers` (default `false`): "If true, NGINX passes the incoming `X-Forwarded-*` headers to upstreams. Use this option when NGINX is behind another L7 proxy" ([configmap][ingn-cm]).
  - `compute-full-forwarded-for` (default `false`): "Append the remote address to the X-Forwarded-For header instead of replacing it" ([configmap][ingn-cm]). So by default the controller *replaces* `X-Forwarded-For` with the peer address, and a client cannot inject a value.
  - `proxy-real-ip-cidr` (default `0.0.0.0/0`) names the trusted L7 load balancer when forwarded headers or PROXY protocol are used ([configmap][ingn-cm]). Leaving it at `0.0.0.0/0` with `use-forwarded-headers: true` would let any client choose its own address and so bypass the allow-list (inference).
- **Fastify side (`trustProxy`).**
  - It accepts `true`, an IP/CIDR string or list, an array, or a function `(address, hop)` ([Fastify Server][fy-server]).
  - "Hop-count-only trust is disabled because it cannot validate the immediate peer and lets direct clients spoof `X-Forwarded-*` values" ([Fastify Server][fy-server]).
  - `request.ip` is "taken from `socket.remoteAddress` (or from `X-Forwarded-For` when `trustProxy` is enabled)", and `request.ips` is "ordered from closest to furthest" ([Fastify Request][fy-req]).
  - Fastify warns these values "should also be treated as untrusted input" ([Fastify Request][fy-req]).
  - **wechart today:** `trustProxy` is passed to `Fastify()` only when the config has it (`/Users/srajagopal/Work/wechart/packages/api/src/server.ts:518-523`), and the config has it only with sign-in on (Finding 4).
  - For AC-474 and AC-479, set it to the controller pods' CIDR (not `true`) on every security mode. `true` trusts any in-cluster caller's `X-Forwarded-For` (inference from [Fastify Server][fy-server]).
- **Route the MCP Ingress straight to the API Service, not through the web nginx.** The web nginx appends with `$proxy_add_x_forwarded_for` (`web-config.yaml:75`), which would add a second trusted hop (design inference).

**Sketch (Helm template; names are placeholders; values come from Helm per AC-476)**

```yaml
{{- with .Values.mcp }}{{- if .host }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "wechart.component" (list $ "mcp") }}
  annotations:
    nginx.ingress.kubernetes.io/whitelist-source-range: {{ join "," .allowedSourceRanges | quote }}
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: {{ .readTimeoutSeconds | quote }}
    nginx.ingress.kubernetes.io/proxy-send-timeout: {{ .readTimeoutSeconds | quote }}
spec:
  ingressClassName: {{ .ingressClassName }}
  tls:
    - hosts: [{{ .host | quote }}]
      secretName: {{ .tlsSecretName }}
  rules:
    - host: {{ .host | quote }}
      http:
        paths:
          - path: /mcp
            pathType: Exact
            backend:
              service:
                name: {{ include "wechart.component" (list $ "api") }}
                port: { name: http }
{{- end }}{{- end }}
```

The fields follow [k8s Ingress][k8s-ingress] and [annotations][ingn-ann]. The `mcp.*` value names are illustrative, not decided.

### 4. Personal access token format and storage (AC-430, AC-431, AC-468, AC-470)

**Format guidance (GitHub's published design)**
- **Prefix.** "specific 3 letter prefixes … starting with a company signifier, `gh`, and the first letter of the token type", for example `ghp_` for PATs ([GitHub blog][gh-fmt], [GitHub changelog][gh-chg]). "With this prefix alone, we anticipate the false positive rate for secret scanning will be down to 0.5%" ([GitHub blog][gh-fmt]).
- **Separator.** "An underscore is not a Base64 character which helps ensure that our tokens cannot be accidentally duplicated by randomly generated strings like SHAs". It also keeps double-click selection whole ([GitHub blog][gh-fmt]).
- **Checksum.** "A 32 bit checksum in the last 6 digits", CRC32 in base62. "A checksum virtually eliminates false positives for secret scanning offline. We can check the token input matches the checksum and eliminate fake tokens without having to hit our database" ([GitHub blog][gh-fmt]).
- **Length and charset.** The charset is `[A-Za-z0-9_]`; "plan to support tokens up to 255 characters" ([GitHub changelog][gh-chg]).
- **GitHub secret scanning.** The partner program asks for "A uniquely defined prefix," "High entropy random strings," and "A 32-bit checksum" ([GitHub partner program][gh-partner]). Joining it requires GitHub's agreement ([GitHub partner program][gh-partner]). An enterprise can instead define a **custom pattern** (repo, org or enterprise level) and turn on push protection for it ([GitHub custom patterns][gh-custom]). A fixed prefix makes that regex precise.

**Building one from Node built-ins** (illustrative; the prefix text is a design choice):
- `randomBytes(32)` gives 256 bits ([Node crypto][node-crypto]).
- Encode as `'hex'` ("each byte as two hexadecimal characters") or `'base64url'` ([Node Buffer][node-buffer]). Hex stays inside GitHub's `[A-Za-z0-9_]` set. Base64url adds `-`, which breaks GitHub's double-click rationale (inference from [GitHub blog][gh-fmt]).
- Optional checksum: `zlib.crc32(data[, value])` returns an integer ([Node zlib][node-zlib]). Base62 has no built-in encoder, so a hex or decimal rendering of the CRC is the built-in option.

**Hash, not bcrypt or argon2**
- **NIST SP 800-63B-4 §3.1.2.2 (look-up secrets, the closest analogue).**
  - "All look-up secrets **SHALL** be stored in a hashed form using an approved hashing function."
  - Only secrets "shorter than … 112 bits … **SHALL** be stored in a salted and hashed form using a suitable password hashing scheme" ([NIST 800-63B-4][nist]).
  - A 256-bit random token is above that threshold. That PATs fall under this clause is an analogy, not a NIST statement.
- **Why slow hashes exist.** "Fast hashing algorithms such as SHA-256 are not suitable for password storage because they allow attackers to perform large numbers of guesses quickly" ([OWASP][owasp]). That threat assumes guessable inputs, and a 256-bit random token is not guessable (inference).
- **bcrypt's limit.** "bcrypt has a maximum length input length of 72 bytes for most implementations" ([OWASP][owasp]). A prefixed 64-hex token plus checksum exceeds 72 bytes and would be silently truncated (inference).
- **Salted slow hashes also cost lookups and CPU.** They prevent an indexed lookup by digest, so a token id is needed to find the row. They also put a deliberately slow KDF on every `/mcp` request (60 a minute per token by default, AC-472). This is a performance inference.
- **SHA-256 versus HMAC-SHA-256 with a server pepper.**
  - **SHA-256** (`createHash('sha256')`) meets the NIST clause above.
  - **HMAC** (`createHmac('sha256', pepper)`, [Node crypto][node-crypto]) matches NIST's password guidance to "perform an additional iteration of a keyed hashing … using a secret key known only to the verifier", stored separately ([NIST 800-63B-4][nist]). OWASP describes the HMAC post-hash pepper and says peppers belong "in 'secrets vaults' or HSMs", separate from the database ([OWASP][owasp]).
  - **Trade-off (technical):** HMAC means a metadata-DB dump alone gives no way even to test candidate tokens. But the pepper becomes a new Helm-generated secret, like `session-secret` in `templates/api.yaml:151-155`. Rotating or losing it invalidates every token, because the stored digests can't be recomputed without the plaintext (inference from OWASP's note that peppers "cannot be changed without knowledge of a user's password").
  - The choice is for the user. Either satisfies AC-430's "no copy … from which the token could be used".

**Constant-time comparison.**
- `crypto.timingSafeEqual(a, b)` takes Buffer, TypedArray or DataView inputs, returns a boolean, and throws if the lengths differ ([Node crypto][node-crypto]). The docs warn that the surrounding code must not leak timing either ([Node crypto][node-crypto]).
- Compare fixed-length 32-byte digests, never the raw strings. Then the length check can't throw on attacker input.
- If rows are found by an indexed `WHERE digest = $1`, any timing signal concerns the digest of the presented token, not the stored secret (inference).
- If the token embeds a lookup id (`<prefix>_<id>_<secret>`), fetch the row by id and then `timingSafeEqual` the digests (inference).
- The one-shot `crypto.hash()` is marked "Stability: 1 - Experimental" in the v26.12.0 docs ([Node crypto][node-crypto]), so prefer `createHash` / `createHmac`.

**Show once (AC-430).**
- GitLab's wording: "Save the personal access token somewhere safe. After you leave or refresh the page, you cannot view it again" ([GitLab PAT][gitlab-pat]). GitHub: "Treat your access tokens like passwords" ([GitHub PAT][gh-pat]).
- Return the plaintext only in the create response. Send `Cache-Control: no-store` ("any caches of any kind (private or shared) should not store this response", [MDN][mdn-cc]).
- Never log the token. Key the limiter by token id, not text (`fastify-rate-limit.md` Gotcha 13).

**Last used (AC-430, AC-470).** GitLab updates usage "every 10 minutes" ([GitLab PAT][gitlab-pat]), which avoids a write per request. The precision wechart needs is not stated in AC-430 (Open questions).

**Expiry (AC-468).** GitLab defaults to 365 days with an admin-set maximum ([GitLab PAT][gitlab-pat]). wechart's 7/30/90 days are already decided in AC-468. Enforce the 90-day cap on the server: AC-468 says "by the page or the API". Also make the verifier set `AuthInfo.expiresAt`, which the SDK's bearer helpers require (`mcp-typescript-sdk.md` Gotcha 7).

## API surface we will use

### `node:crypto` (v26.12.0) ([Node crypto][node-crypto])

| Function | Signature | Use |
|---|---|---|
| `randomBytes` | `randomBytes(size[, callback]) → Buffer` | Token secret, 32 bytes |
| `createHash` | `createHash(algorithm[, options]) → Hash` | `createHash('sha256').update(token).digest()` |
| `createHmac` | `createHmac(algorithm, key[, options]) → Hmac` | Pepper variant |
| `timingSafeEqual` | `timingSafeEqual(a, b) → boolean`; throws on unequal length | Digest comparison |

### `node:zlib` ([Node zlib][node-zlib])

`crc32(data[, value]) → integer`. `data` is a string, Buffer, TypedArray or DataView; `value` is the starting value, default `0`. Only needed if a checksum is adopted.

```ts
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { crc32 } from 'node:zlib';

const PREFIX = 'wcp_';                                  // illustrative, not decided
export function mintToken(): { text: string; digest: Buffer } {
  const secret = randomBytes(32).toString('hex');       // 256 bits
  const body = PREFIX + secret;
  const text = body + '_' + crc32(body).toString(16).padStart(8, '0');
  return { text, digest: createHash('sha256').update(text).digest() };
}
export function sameDigest(stored: Buffer, presented: string): boolean {
  return timingSafeEqual(stored, createHash('sha256').update(presented).digest()); // both 32 bytes
}
```

### Postgres fixed-window counter (AC-472, AC-473, AC-474)

**Guarantees used** ([PG INSERT][pg-insert])
- "ON CONFLICT DO UPDATE guarantees an atomic INSERT or UPDATE outcome; provided there is no independent error, one of those two outcomes is guaranteed, even under high concurrency."
- "For ON CONFLICT DO UPDATE, a conflict_target must be provided", so a unique key is required.
- SET and WHERE see the existing row by table name or alias, and the proposed row as `excluded`.
- RETURNING returns "rows that were successfully inserted or updated". A row skipped by a `DO UPDATE … WHERE` is not returned, so put no WHERE on it.
- One statement may not affect a row twice (cardinality violation).
- In UPDATE's SET, an expression "can use the old values of this and other columns in the table" ([PG UPDATE][pg-update]). The two `CASE`s below therefore both read the pre-update row.
- `now()` returns "the start time of the current transaction"; `clock_timestamp()` "changes even within a single SQL statement" ([PG datetime][pg-dt]). Using the database's clock avoids skew between the two API replicas (inference).

**Variant A: one row per key, window starting at the first hit.** This matches `LocalStore` and `RedisStore` semantics (`fastify-rate-limit.md` Gotcha 11).

```sql
CREATE TABLE mcp_rate_limit (
  key          text        PRIMARY KEY,          -- 'tok:<tokenId>' or 'ip:<normalized>'
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL
);
CREATE INDEX mcp_rate_limit_window ON mcp_rate_limit (window_start);

-- $1 key, $2 window in ms
INSERT INTO mcp_rate_limit AS c (key, window_start, hits)
VALUES ($1, now(), 1)
ON CONFLICT (key) DO UPDATE SET
  window_start = CASE WHEN c.window_start + $2 * interval '1 millisecond' <= now()
                      THEN now() ELSE c.window_start END,
  hits         = CASE WHEN c.window_start + $2 * interval '1 millisecond' <= now()
                      THEN 1 ELSE c.hits + 1 END
RETURNING hits AS current,
  GREATEST(0, (extract(epoch FROM window_start + $2 * interval '1 millisecond' - now()) * 1000))::bigint AS ttl;
```

**Variant B: buckets aligned to the clock**, primary key `(key, window_start)`, with `window_start = date_bin($2 * interval '1 millisecond', now(), timestamptz 'epoch')`.
- `date_bin(stride, source, origin)` accepts `timestamp with time zone`.
- The stride "cannot contain units of month or larger" ([PG datetime][pg-dt]).
- This leaves one row per key per window, so cleanup matters more.

AC-472's "each further request in that minute" doesn't say which window semantics; both are fixed windows.

**Cleanup.**
- Use `DELETE FROM mcp_rate_limit WHERE window_start < now() - <longest window> * interval '1 millisecond'` on an interval.
- wechart already runs this pattern: `startAuditRetention` (`/Users/srajagopal/Work/wechart/packages/api/src/audit/retention.ts:28-52`) runs at once and then on an `unref()`'d `setInterval`, logging failures.
- Two replicas running the same idempotent DELETE is harmless. A row deleted concurrently with an upsert still gives an insert or an update, per the atomicity guarantee above (inference).

**UNLOGGED?** "not written to the write-ahead log … considerably faster", but "automatically truncated after a crash or unclean shutdown" and "not replicated to standby servers" ([PG CREATE TABLE][pg-create]). A crash would reset every counter. That is technically acceptable for a rate limit, but a failover to a standby would also start from empty. The choice is for the user.

### Wiring as an `@fastify/rate-limit` store (v11.2.1)

**Interface** ([types][rl-types]):

```ts
interface FastifyRateLimitStoreCtor { new (options: FastifyRateLimitOptions): FastifyRateLimitStore }
interface FastifyRateLimitStore {
  incr(key: string, callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
       timeWindow: number, max: number): void;
  child(routeOptions: RouteOptions & { path: string; prefix: string }): FastifyRateLimitStore;
}
```

**How the plugin uses it** ([index.js][rl-index])
- It constructs the store as `new Store(globalParams)`.
- It wraps `incr` in a Promise: `(err, res) => err ? reject(err) : resolve(res)`.
- On rejection: `if (!params.skipOnError) throw err`.
- It computes `isExceeded: current > max`, `remaining: Math.max(0, max - current)` and `ttlInSeconds = Math.ceil(res.ttl / 1000)`.
- `timeWindow` and `max` are already-resolved numbers in ms when `incr` is called (a string `timeWindow` is parsed earlier with `@lukeed/ms`).
- When exceeded, it sets `x-ratelimit-limit`, `-remaining`, `-reset` and `retry-after`, then `throw params.errorResponseBuilder(req, respCtx)`.
- A per-route config calls `store.child(mergedRateLimitParams)`.
- `allowList` is checked before `incr`.

**Mapping to the ACs**
- **AC-473 (fail closed, 503).** Keep `skipOnError: false`, the default. The store error is rethrown as-is ([index.js][rl-index]). Reject with a dedicated error class and map it to 503 in the `/mcp` scope's `setErrorHandler`. The global handler turns unknown errors into 500 (`fastify-rate-limit.md` Gotcha 1).
- **AC-474 (/64).** `normalizeIP(ip: string, ipv6Subnet?: number): string` is exported and typed ([types][rl-types], [index.js][rl-index]), so a custom `keyGenerator` can produce `ip:${normalizeIP(request.ip, 64)}` for bad or missing tokens. Claude.ai's traffic is IPv4-only ([troubleshooting][cc-trouble]); the /64 rule matters for the enterprise network and Claude Code.
- **A shared egress means two budgets.** All claude.ai connector traffic shares `160.79.104.0/21` ([IP addresses][anth-ip]). If the IP limiter counted valid-token requests too, one Claude user's bad-token flood could throttle every other Claude user's valid requests. Count valid-token requests only under `tok:<id>` and bad ones only under `ip:<…>`. AC-472 and AC-474 already separate them (design inference).

```ts
import type { FastifyRateLimitStore } from '@fastify/rate-limit';

export class RateLimitStoreUnavailable extends Error {}

export function pgRateLimitStore(hit: (key: string, windowMs: number) => Promise<{ current: number; ttl: number }>) {
  return class PgStore implements FastifyRateLimitStore {
    constructor(_options: unknown) {}
    incr(key: string, cb: (e: Error | null, r?: { current: number; ttl: number }) => void, timeWindow: number) {
      hit(key, timeWindow).then(
        (r) => cb(null, { current: Number(r.current), ttl: Number(r.ttl) }),   // bigint/strings from pg → number
        (e) => cb(new RateLimitStoreUnavailable('rate-limit store', { cause: e })),
      );
    }
    child() { return this; }   // one shared table; per-route keys would need a key prefix here
  };
}
```

`hit` runs Variant A through Kysely's `sql` template, as `packages/api/src/repos/*` already do for raw SQL. How `pg` returns a `bigint` column is not verified here; the sketch converts with `Number()` (UNVERIFIED type mapping).

**Hook order.** This comes from `fastify-rate-limit.md`, "Order relative to the auth hook", and is not repeated here. It is: Host/Origin check (403, AC-436) → token resolution that doesn't throw → route-level limiter → 401 for a missing or bad token (AC-435). The limiter therefore counts bad-token requests under the IP key before the 401.

## Gotchas

1. **Shared org credential on Team/Enterprise.** A PAT entered by an Owner makes every member act as that token's owner ([connector auth][cc-auth]), which is contrary to AC-432's intent. AC-470's Super-Admin list would show one owner for the whole organisation's traffic.
2. **Request headers are beta and limited.** "If you don't see the **Request headers** section … your organization doesn't have access yet" ([add-unlisted][cc-add]). AC-445 may be untestable on an account without the beta.
3. **The `Bearer ` scheme is the user's to type** ([add-unlisted][cc-add]).
4. **Token rotation means re-adding the connector** ([add-unlisted][cc-add]). With a 90-day maximum (AC-468), this recurs at least every 90 days.
5. **A 401 without `resource_metadata` makes Claude probe** `/.well-known/oauth-protected-resource/<path>` and then `/.well-known/oauth-protected-resource` on the MCP origin ([connector auth][cc-auth]). With an `Exact` `/mcp` ingress, those paths don't reach the API. How a "No sign-in" connector reacts to a 401 (expired or revoked token, AC-431) is UNVERIFIED. The setup dialog "Review[s] the authentication settings Claude detected" ([support article][cc-support]), so a `WWW-Authenticate: Bearer` 401 at setup may pre-select OAuth (UNVERIFIED); the user then chooses "No sign-in".
6. **No AAAA-only names, no private DNS answers** ([troubleshooting][cc-trouble]).
7. **WAF/edge 403/429 look like connection failures** ([troubleshooting][cc-trouble]). An allow-list that omits `160.79.104.0/21` fails silently from the user's point of view.
8. **ingress-nginx gets no security fixes after March 2026** ([k8s retirement blog][k8s-retire]). Shipping a new internet-facing Ingress on it is a security decision for the user.
9. **`trustProxy` is unset with sign-in off and unset by the chart** (Finding 4). Fix this before AC-474 and AC-479 can pass.
10. **`externalTrafficPolicy: Cluster` hides client IPs** from the allow-list and from Fastify ([k8s source IP][k8s-srcip]).
11. **`use-forwarded-headers: true` with the default `proxy-real-ip-cidr: 0.0.0.0/0`** trusts any client's `X-Forwarded-For` ([configmap][ingn-cm]). That defeats the allow-list (inference).
12. **SSE through any nginx layer.** ingress-nginx defaults to buffering off ([annotations][ingn-ann]), but stock nginx defaults to on ([nginx proxy][nginx-proxy]). Whether the MCP SDK sends `X-Accel-Buffering: no` is still UNVERIFIED (`mcp-typescript-sdk.md`). Setting it on `/mcp` responses covers both.
13. **The 60 s default read timeout** ([configmap][ingn-cm]) is shorter than wechart's existing 130 s `/api/` budget (`web-config.yaml:72`).
14. **`timingSafeEqual` throws on unequal lengths** ([Node crypto][node-crypto]). Compare digests, never raw input.
15. **The ON CONFLICT row is a hot row per key.** Each increment for a key takes that row's lock in turn (inference from "all rows will be locked when the ON CONFLICT DO UPDATE action is taken", [PG INSERT][pg-insert]). At 60 a minute per token this is negligible. The IP key for Anthropic's egress could see more traffic.
16. **Hijacked MCP replies may lose `x-ratelimit-*` headers on allowed requests** (`fastify-rate-limit.md` Gotcha 7). The 429 path is unaffected.

## Alternatives considered

Not requested. These are noted only because the requested controller is retired, and are not researched:
- Gateway API, which the Kubernetes project recommends ([k8s Ingress][k8s-ingress], [k8s retirement blog][k8s-retire]);
- F5's separately maintained NGINX Ingress Controller (`nginx.org/*` annotations, Policy resources). Its docs index page was fetched, but the access-control policy page was not.

Whether Gateway API has a portable source-IP allow-list is UNVERIFIED.

## Open questions / unverified

- **For the user: AC-445 versus the shared credential.** On Team/Enterprise, Claude's fixed credential is organisation-wide ([connector auth][cc-auth]). Options:
  - accept that every member acts as one token's owner (contrary to AC-432's intent);
  - limit AC-445 to individual Pro/Max accounts;
  - add OAuth for hosted Claude apps (see `mcp-typescript-sdk.md` options A and B);
  - use MCP tunnels (Enterprise, research preview, and they still need server auth, [MCP tunnels][cc-tunnels]).
- **For the user: which ingress controller.** ingress-nginx is archived ([releases][ingn-rel]), and wechart's chart has none today.
- **For the user:** SHA-256 or HMAC-with-pepper for token digests. The token prefix text, whether to add a CRC32 checksum, and the token's internal id.
- **For the user:** the per-IP limit value for AC-474 (no default is stated in the spec); variant A or B window semantics; UNLOGGED or logged counter table.
- **For the user:** the precision of "last used" (AC-430, AC-470), since a write on every request is the alternative to GitLab-style batching ([GitLab PAT][gitlab-pat]).
- **For the user:** whether `/mcp` on the web host serving the SPA shell violates AC-476. An explicit 404 location removes the question.
- UNVERIFIED: which `Origin`, if any, Claude's connectors send (relevant to AC-436; [testing][cc-test] warns against strict checks).
- UNVERIFIED: whether Claude Desktop's remote connectors egress from Anthropic or from the user's machine. A direct statement was found only for claude.ai and for Claude Code.
- UNVERIFIED: a machine-readable feed of Anthropic's IP ranges, and the channel and history of change notices. The web-search budget was exhausted, so only known pages were fetched.
- UNVERIFIED: ingress-nginx's status code for a denied source IP, and for unmatched paths on a matched host.
- UNVERIFIED: a connector's behaviour on a 401 under "No sign-in", and the auth mode the setup dialog detects from a `WWW-Authenticate: Bearer` 401.
- UNVERIFIED: `pg`'s JavaScript type for a `bigint` RETURNING column through Kysely.
- UNVERIFIED: RFC 6749 §5.1's `Cache-Control: no-store` wording for token responses; the fetches were truncated, so MDN's definition is cited instead.

[cc-add]: https://claude.com/docs/connectors/custom/add-unlisted
[cc-auth]: https://claude.com/docs/connectors/building/authentication
[cc-trouble]: https://claude.com/docs/connectors/building/troubleshooting
[cc-test]: https://claude.com/docs/connectors/building/testing
[cc-tunnels]: https://claude.com/docs/connectors/mcp-tunnels/overview
[cc-support]: https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
[anth-ip]: https://platform.claude.com/docs/en/api/ip-addresses
[k8s-retire]: https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
[ingn-rel]: https://github.com/kubernetes/ingress-nginx/releases
[ingn-ann]: https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md
[ingn-cm]: https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/
[ingn-misc]: https://kubernetes.github.io/ingress-nginx/user-guide/miscellaneous/
[k8s-ingress]: https://kubernetes.io/docs/concepts/services-networking/ingress/
[k8s-srcip]: https://kubernetes.io/docs/tutorials/services/source-ip/
[nginx-proxy]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
[fy-server]: https://fastify.dev/docs/latest/Reference/Server/
[fy-req]: https://fastify.dev/docs/latest/Reference/Request/
[gh-fmt]: https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/
[gh-chg]: https://github.blog/changelog/2021-03-31-authentication-token-format-updates-are-generally-available/
[gh-partner]: https://docs.github.com/en/code-security/secret-scanning/secret-scanning-partnership-program/secret-scanning-partner-program
[gh-custom]: https://docs.github.com/en/code-security/secret-scanning/using-advanced-secret-scanning-and-push-protection-features/custom-patterns/defining-custom-patterns-for-secret-scanning
[gh-pat]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
[gitlab-pat]: https://docs.gitlab.com/user/profile/personal_access_tokens/
[nist]: https://pages.nist.gov/800-63-4/sp800-63b.html
[owasp]: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
[node-crypto]: https://nodejs.org/docs/latest-v26.x/api/crypto.html
[node-zlib]: https://nodejs.org/docs/latest-v26.x/api/zlib.html
[node-buffer]: https://nodejs.org/docs/latest-v26.x/api/buffer.html
[mdn-cc]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
[pg-insert]: https://www.postgresql.org/docs/18/sql-insert.html
[pg-update]: https://www.postgresql.org/docs/18/sql-update.html
[pg-dt]: https://www.postgresql.org/docs/18/functions-datetime.html
[pg-create]: https://www.postgresql.org/docs/18/sql-createtable.html
[rl-index]: https://raw.githubusercontent.com/fastify/fastify-rate-limit/v11.2.1/index.js
[rl-types]: https://raw.githubusercontent.com/fastify/fastify-rate-limit/v11.2.1/types/index.d.ts
