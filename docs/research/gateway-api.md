---
library: Kubernetes Gateway API (standard channel) with Envoy Gateway as the implementation
packages: ["gateway.networking.k8s.io/v1 GatewayClass", "gateway.networking.k8s.io/v1 Gateway", "gateway.networking.k8s.io/v1 HTTPRoute", "gateway.networking.k8s.io/v1 ListenerSet", "gateway.networking.k8s.io/v1beta1 ReferenceGrant", "gateway.envoyproxy.io/v1alpha1 SecurityPolicy", "gateway.envoyproxy.io/v1alpha1 ClientTrafficPolicy", "gateway.envoyproxy.io/v1alpha1 BackendTrafficPolicy", "gateway.envoyproxy.io/v1alpha1 EnvoyProxy", "oci://docker.io/envoyproxy/gateway-helm", "oci://docker.io/envoyproxy/gateway-crds-helm", "standard-install.yaml (kubernetes-sigs/gateway-api)"]
version: "gateway-api v1.6.3 (standard channel CRDs); envoy-gateway v1.9.2 (chart and controller)"
researched: 2026-10-17
sources: [https://api.github.com/repos/kubernetes-sigs/gateway-api/releases, https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.0, https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.3, https://github.com/kubernetes-sigs/gateway-api/tree/v1.6.3/config/crd/standard, https://gateway-api.sigs.k8s.io/guides/getting-started/, https://gateway-api.sigs.k8s.io/docs/concepts/versioning/, https://gateway-api.sigs.k8s.io/guides/crd-management/, https://gateway-api.sigs.k8s.io/guides/user-guides/tls/, https://gateway-api.sigs.k8s.io/guides/user-guides/http-timeouts/, https://gateway-api.sigs.k8s.io/guides/user-guides/multiple-ns/, https://gateway-api.sigs.k8s.io/guides/user-guides/listener-set/, https://gateway-api.sigs.k8s.io/docs/concepts/security/, https://gateway-api.sigs.k8s.io/reference/api-types/httproute/, https://gateway-api.sigs.k8s.io/reference/api-spec/1.6/spec/, https://gateway-api.sigs.k8s.io/geps/list/, https://gateway-api.sigs.k8s.io/docs/implementations/versions/v1.6/, https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/httproute_types.go, https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/gateway_types.go, https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/listenerset_types.go, https://gateway.envoyproxy.io/docs/install/install-helm/, https://gateway.envoyproxy.io/news/releases/matrix/, https://gateway.envoyproxy.io/news/releases/notes/v1.9.2, https://gateway.envoyproxy.io/docs/tasks/security/restrict-ip-access/, https://gateway.envoyproxy.io/docs/tasks/traffic/client-traffic-policy/, https://gateway.envoyproxy.io/docs/tasks/traffic/http-timeouts/, https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/security-policy/, https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/authorization_types.go, https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/clienttrafficpolicy_types.go, https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/shared_types.go, https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/timeout_types.go, https://www.envoyproxy.io/docs/envoy/latest/faq/configuration/timeouts, https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_conn_man/headers#x-forwarded-for, https://docs.nginx.com/nginx-gateway-fabric/traffic-security/access-policy/, https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.8.0/apis/v1alpha1/accesspolicy_types.go, https://istio.io/latest/docs/tasks/security/authorization/authz-ingress/, https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ipallowlist/, https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gateway-api/]
---
# Kubernetes Gateway API v1.6.3 + Envoy Gateway v1.9.2

## Summary

**Scope.** This doc replaces the ingress-nginx section (§3) of `/Users/srajagopal/Work/wechart/docs/research/mcp-deployment-and-tokens.md` for AC-476, which is being reworded. The requirement is:
- a separate host that serves only `/mcp` over TLS;
- routed straight to the API Service;
- only listed source CIDRs allowed;
- all of it set from Helm values.

It also covers the client IP reaching the API for AC-474's per-IP limits, and SSE-safe timeouts.

The Fastify `trustProxy` semantics, Anthropic's `160.79.104.0/21`, Claude Code connecting from the user's machine, and the IPv4-only connector rule are already sourced in that sibling doc and are not repeated here.

**wechart today.** The chart has no Ingress or Gateway. The web app is a `LoadBalancer` Service (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml:26`). The API is `ClusterIP` on port name `http`, port `api.port` (4100) (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/api.yaml:9-15`).

**Decisive findings**
1. **The current standard channel is Gateway API v1.6.3,** released 2026-10-06. v1.7.0-rc.1 (2026-10-08) is a prerelease ([GH releases API][gw-rel]).
2. **Core Gateway API has no source-IP allow-list.**
   - `gateway_types.go` at v1.6.3 has no CIDR, source-address or authorization field on Gateway, Listener or GatewaySpec ([gateway_types.go][gw-types]).
   - The only related GEPs are GEP-1494 "HTTP Auth" (Experimental) and GEP-3779 "Identity Based Authz for east-west traffic" (Provisional). Neither is an IP allow-list ([GEP list][gw-geps]).
   - So every implementation uses its own policy CRD.
3. **Recommendation: Envoy Gateway v1.9.2.** The allow-list is `SecurityPolicy.spec.authorization` with `principal.clientCIDRs` ([restrict IP][eg-ip]). It has been in the product since v1.1.0, released 2024-07-22 ([EG v1.1.0 notes][eg-110]). Denied clients get `403` with the body `RBAC: access denied` ([restrict IP][eg-ip]).
4. **Envoy's default 15 s route timeout would cut tool calls.** Envoy Gateway says "The default request timeout is set to 15 seconds in Envoy Proxy" ([EG timeouts][eg-timeouts]). The HTTPRoute must set `timeouts.request` (130 s, to match `/api`).
5. **Security: v1.9.2 does not ship the patched Envoy by default.** Its release notes tell users to "Override the Envoy Proxy image to `docker.io/envoyproxy/envoy:distroless-v1.39.3`" for CVE-2026-35189 and two remotely triggerable crashes ([EG v1.9.2 notes][eg-192]).

## Install

**1. Gateway API CRDs (cluster-scoped; owned by the cluster admin, not by wechart's chart).**
- The guide says "either a cluster admin or cluster provider should be responsible for managing the CRDs". Implementations that bundle CRDs must never overwrite newer CRDs or CRDs from a different channel, and must never remove them ([CRD management][gw-crd]). wechart's chart should not ship them (inference from the same guide).
- Install command, from the getting-started page with the version bumped from its v1.6.1 to the current v1.6.3 ([getting started][gw-start], [GH releases API][gw-rel]):
  ```
  kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.3/standard-install.yaml
  ```
- `config/crd/standard` at v1.6.3 contains ([v1.6.3 standard CRDs][gw-crds]):
  - `backendtlspolicies`, `gatewayclasses`, `gateways`, `grpcroutes`, `httproutes`, `listenersets`, `referencegrants`, `tcproutes`, `tlsroutes`, `udproutes`;
  - plus `vap_safeupgrades`, a ValidatingAdmissionPolicy.
- `safe-upgrades.gateway.networking.k8s.io` blocks installing experimental CRDs over standard ones, and blocks CRDs with a bundle version before v1.5.0 ([vap_safeupgrades.yaml][gw-vap]).
- Kubernetes support: the project commits to "support a minimum of the most recent 5 Kubernetes minor versions" ([versioning][gw-ver]).

**2. Envoy Gateway v1.9.2** (latest stable, 2026-09-28; v1.8.5 is the other maintained line) ([EG releases API][eg-rel]).
- **Compatibility.** v1.9 pairs with Envoy `distroless-v1.39.x` and Gateway API v1.6.1, on Kubernetes v1.33–v1.36. End of life is 2027/02/14 ([EG matrix][eg-matrix]).
- **CRDs.** "The default Helm install applies both Gateway API CRDs and Envoy Gateway CRDs" ([EG Helm][eg-helm]). That bundled set is v1.6.1, so on a cluster that already has v1.6.3 it would be a downgrade. The CRD guide says "Never downgrade" ([CRD management][gw-crd]).
- **Install order when the cluster owns v1.6.3.** Install only Envoy Gateway's own CRDs, then the controller without CRDs. Commands follow [EG Helm][eg-helm]. Setting `crds.gatewayAPI.enabled=false` is inferred from that page's `=true` form.
  ```
  helm template eg oci://docker.io/envoyproxy/gateway-crds-helm --version v1.9.2 \
    --set crds.gatewayAPI.enabled=false \
    --set crds.envoyGateway.enabled=true \
    | kubectl apply --server-side -f -
  helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.9.2 \
    -n envoy-gateway-system --create-namespace \
    --set crds.enabled=false \
    --set global.images.envoyProxy.image=docker.io/envoyproxy/envoy:distroless-v1.39.3
  kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available
  ```
  - The `global.images.envoyProxy.image` override is the v1.9.2 security instruction ([EG v1.9.2 notes][eg-192]).
  - The page recommends `helm template … | kubectl apply --server-side` because of "a known Helm limitation related to large CRDs" ([EG Helm][eg-helm]).
- **Images (docker-desktop on Apple silicon).** `envoyproxy/gateway:v1.9.2` is published for linux/amd64 and linux/arm64 ([Docker Hub gateway tag][dh-eg]). So is `envoyproxy/envoy:distroless-v1.39.3`, top-level digest `sha256:7369b033550a14997e5d698677b7b51f0210a80754f5d084c5caa1a78268267b` ([Docker Hub envoy tag][dh-envoy]).
- **GatewayClass.** The Helm chart doesn't create one; the quickstart creates class `eg` from a manifest ([EG Helm][eg-helm]). wechart's install docs must create a cluster-scoped `GatewayClass` with `controllerName: gateway.envoyproxy.io/gatewayclass-controller`. ~~That controllerName is UNVERIFIED: the quickstart manifest wasn't fetched.~~ **Verified 2026-10-18** (lane MCP): v1.9.2's quickstart manifest makes `GatewayClass` `eg` with `spec.controllerName: gateway.envoyproxy.io/gatewayclass-controller` ([EG v1.9.2 quickstart.yaml][eg-qs-yaml]).

**3. No npm packages.** Nothing in `packages/*` imports anything for this.

## Init / auth pattern

### Two attachment modes the chart should support (design inference, grounded in the sources cited)

**Mode A: the chart creates its own Gateway** (`mcp.gateway.create: true`).
- A Gateway in the release namespace, with one HTTPS listener whose `hostname` is the MCP host.
- The TLS Secret sits in the same namespace, so no ReferenceGrant is needed.
- An HTTPRoute in the same namespace attaches without changing `allowedRoutes`, because `RouteNamespaces.From` defaults to `Same` ([gateway_types.go][gw-types]).
- The allow-list can then target the Gateway or the HTTPRoute.
- This is the only mode where the chart can also own the `ClientTrafficPolicy` (client-IP detection), because a CTP targets only `Gateway` or `ListenerSet` ([clienttrafficpolicy_types.go][eg-ctp]) and must sit in the same namespace as its target ([SecurityPolicy concept][eg-sp]). The same-namespace rule is stated for SecurityPolicy; that it also holds for CTP is UNVERIFIED.
- Caveat: the Gateway API security model says "The creation of a new Gateway should be considered as a privileged permission" ([security][gw-sec]). Mode A needs RBAC for `gateways` in the release namespace.

**Mode B: attach to an existing Gateway** (`mcp.gateway.parentRefs: [{name, namespace, sectionName}]`).
- The chart renders only the HTTPRoute (and a SecurityPolicy that targets that HTTPRoute).
- The Gateway owner must allow routes from wechart's namespace, for example `allowedRoutes.namespaces.from: Selector` with a namespace label. Otherwise the route is "ignored by the Gateway because the attachment constraint (Namespace label) was not met" ([multiple-ns][gw-ns]).
- The listener, its certificate and client-IP detection belong to the Gateway owner.
- **Variant B′: a ListenerSet.** It lets the chart contribute its own listener (hostname plus certificate) to a shared Gateway. "A ListenerSet can reference secrets/backends in its own namespace without a ReferenceGrant" ([listenerset_types.go][gw-ls-types]). The Gateway must opt in through `allowedListeners`, which is "Not enabled" by default ([ListenerSet guide][gw-ls]).
- ListenerSet is `v1`, in the standard channel at v1.6.3 ([v1.6.3 standard CRDs][gw-crds]). Envoy Gateway's CTP and SecurityPolicy accept `ListenerSet` targets ([clienttrafficpolicy_types.go][eg-ctp], [SecurityPolicy concept][eg-sp]).
- Envoy Gateway v1.9.0's ListenerSet conformance is UNVERIFIED: two reads of the same v1.6 conformance page returned contradictory cells ([v1.6 conformance][gw-conf]).

### Sketch (Helm; `mcp.*` names are illustrative, not decided)

```yaml
{{- with .Values.mcp }}{{- if .host }}
{{- if .gateway.create }}
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: {{ include "wechart.component" (list $ "mcp") }}
spec:
  gatewayClassName: {{ .gateway.className }}
  listeners:
    - name: mcp-https
      hostname: {{ .host | quote }}
      protocol: HTTPS
      port: {{ .gateway.port | default 443 }}
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            group: ""
            name: {{ .tlsSecretName }}
---
{{- end }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ include "wechart.component" (list $ "mcp") }}
spec:
  parentRefs:
  {{- if .gateway.create }}
    - name: {{ include "wechart.component" (list $ "mcp") }}
      sectionName: mcp-https
  {{- else }}
    {{- toYaml .gateway.parentRefs | nindent 4 }}
  {{- end }}
  hostnames: [{{ .host | quote }}]
  rules:
    - matches:
        - path: { type: Exact, value: /mcp }
      backendRefs:
        - name: {{ include "wechart.component" (list $ "api") }}
          port: {{ $.Values.api.port }}
      timeouts:
        request: {{ .requestTimeout | default "130s" | quote }}
        backendRequest: {{ .requestTimeout | default "130s" | quote }}
---
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: {{ include "wechart.component" (list $ "mcp") }}
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: {{ include "wechart.component" (list $ "mcp") }}
  authorization:
    defaultAction: Deny
    rules:
      - name: allowed-sources
        action: Allow
        principal:
          clientCIDRs:
            {{- toYaml (concat .allowedSourceRanges (ternary (list "160.79.104.0/21") (list) .allowAnthropicEgress)) | nindent 12 }}
{{- end }}{{- end }}
```

Field shapes come from:
- the TLS listener ([TLS guide][gw-tls]);
- `Exact` (Core) and the timeouts ([httproute_types.go][gw-hr-types]);
- the SecurityPolicy ([restrict IP][eg-ip], [authorization_types.go][eg-authz]).

`backendRefs` with no `kind` means a core Service (spec default; UNVERIFIED by quote). The `concat`/`ternary` helper composition is a design inference.

`allowAnthropicEgress` defaults to off, per the caller. Day one is the enterprise CIDRs only.

## API surface we will use

### Gateway (`gateway.networking.k8s.io/v1`)
- **`spec.listeners[].protocol: HTTPS`.** v1.6.0 made TLS mandatory: "TLS must now be configured for listeners using the HTTPS protocol" ([v1.6.0 notes][gw-160]). The types say TLS "is required if the Protocol field is 'HTTPS' or 'TLS'" ([gateway_types.go][gw-types]).
- **`tls.certificateRefs`.**
  - Core support is "A single reference to a Kubernetes Secret of type kubernetes.io/tls". More than one reference, or other kinds, is implementation-specific.
  - "References to a resource in different namespace are invalid UNLESS there is a ReferenceGrant in the target namespace". If refused, the listener's `ResolvedRefs` is `False` with reason `RefNotPermitted` ([gateway_types.go][gw-types]).
- **`listeners[].hostname`.** "When unspecified, all hostnames are matched" ([gateway_types.go][gw-types]). Set it, so that the listener carries only the MCP host.
- **`allowedRoutes.namespaces.from`.** Enum `All`, `Selector`, `Same`; default `Same` ([gateway_types.go][gw-types]).
- **Status.** Address: `kubectl get gateway/<name> -o jsonpath='{.status.addresses[0].value}'` ([EG quickstart][eg-qs]).

### HTTPRoute (`gateway.networking.k8s.io/v1`)
- **`matches[].path.type`.** `Exact` and `PathPrefix` are Core; `RegularExpression` is implementation-specific ([httproute_types.go][gw-hr-types]).
- **Precedence.** "precedence must be given to the match having: 'Exact' path match …" ([httproute_types.go][gw-hr-types]).
- **`hostnames`.** Matched against the Host header ([HTTPRoute reference][gw-hr-ref]).
- **`parentRefs`.** By Gateway name, optionally with `sectionName` (a listener) or `port`. "the target Gateway needs to allow HTTPRoutes from the route's namespace to be attached" ([HTTPRoute reference][gw-hr-ref]).
- **`timeouts.request`.** "the maximum duration for a gateway to respond to an HTTP request … MUST return a timeout error".
  - "Setting a timeout to the zero duration (e.g. "0s") SHOULD disable the timeout completely". Unset is "implementation-specific".
  - Support: Extended ([httproute_types.go][gw-hr-types]).
- **`timeouts.backendRequest`.** "a timeout for an individual request from the gateway to a backend … must be no more than the value of the Request timeout". CEL message: "backendRequest timeout cannot be longer than request timeout". Support: Extended ([httproute_types.go][gw-hr-types]).
- **Conformance.** Envoy Gateway v1.9.0 passes HTTPRoute Request Timeout and Backend Timeout ([v1.6 conformance][gw-conf]).

### ReferenceGrant
- Lives in the target namespace and allows references from other namespaces ([security][gw-sec]).
- At v1.6.3 the CRD serves `v1` (served, not storage) and `v1beta1` (served, storage) ([referencegrants CRD][gw-rg-crd]).
- v1.6.0 breaking change: "ReferenceGrant.spec is now required" ([v1.6.0 notes][gw-160]).
- Example for a Gateway in `infra` reading a Secret in `wechart` (shape from [TLS guide][gw-tls]):
  ```yaml
  apiVersion: gateway.networking.k8s.io/v1beta1
  kind: ReferenceGrant
  metadata: { name: allow-infra-gateway-certs, namespace: wechart }
  spec:
    from: [{ group: gateway.networking.k8s.io, kind: Gateway, namespace: infra }]
    to:   [{ group: "", kind: Secret }]
  ```
- "ReferenceGrants applied to a Gateway are not inherited by child ListenerSets", and the reverse also holds ([listenerset_types.go][gw-ls-types]).

### Envoy Gateway SecurityPolicy (`gateway.envoyproxy.io/v1alpha1`)
- **`authorization.rules`.** "evaluated in order, the first matching rule will be applied".
- **`authorization.defaultAction`.** "If not specified, the default action is Deny" ([authorization_types.go][eg-authz]). Set it explicitly anyway, as the docs example does ([restrict IP][eg-ip]).
- **`rules[].action`.** `Allow` or `Deny`. A rule needs a `principal` or `cel` ([authorization_types.go][eg-authz]).
- **`principal.clientCIDRs`.** IPv4 or IPv6 CIDRs, at least one item, and any one may match. "The client IP is inferred from the X-Forwarded-For header, a custom header, or the proxy protocol. You can use the `ClientIPDetection` or the `ProxyProtocol` field in the `ClientTrafficPolicy` to configure how the client IP is detected" ([authorization_types.go][eg-authz]).
- **Targets.** Gateway, ListenerSet, HTTPRoute, GRPCRoute and TCPRoute, through `targetRefs` or `targetSelectors`.
- **Same namespace.** "A SecurityPolicy can only target resources in the same namespace as the policy itself" ([SecurityPolicy concept][eg-sp]).
- **Precedence.** Route-level beats listener-level, which beats gateway-level. Ties go to the oldest policy. `mergeType` (`StrategicMerge`/`JSONMerge`) is allowed only on child-resource policies ([SecurityPolicy concept][eg-sp]).
- **Denied.** `HTTP/1.1 403 Forbidden`, body `RBAC: access denied` ([restrict IP][eg-ip]).
- **Maturity.** The API is `v1alpha1` ([SecurityPolicy concept][eg-sp]). The authorization feature has shipped since v1.1.0 ([EG v1.1.0 notes][eg-110]).

### Envoy Gateway ClientTrafficPolicy (client IP)
- **`targetRefs`.** Kind `Gateway` or `ListenerSet` only ([clienttrafficpolicy_types.go][eg-ctp]).
- **`clientIPDetection`.** Exactly one of `xForwardedFor` (`numTrustedHops` or `trustedCIDRs`, plus `disableXForwardedForAppend`), `customHeader`, or `directSourceIP` ([clienttrafficpolicy_types.go][eg-ctp]).
  - `numTrustedHops: 2` means "take the IP address that is second from the right end of the X-Forwarded-For header".
  - With `trustedCIDRs`, XFF is evaluated right to left and "the first public non-trusted address is used" ([CTP task][eg-ctp-task], [clienttrafficpolicy_types.go][eg-ctp]).
- **`proxyProtocol: { optional: bool }`.** Replaces the deprecated `enableProxyProtocol`. It "interprets the ProxyProtocol header and adds the Client Address into the X-Forwarded-For header" ([clienttrafficpolicy_types.go][eg-ctp]). Without the header, "connections are rejected with a connection reset error" ([CTP task][eg-ctp-task]).
- **`timeout.http`.**
  - `requestReceivedTimeout` (default unlimited; 408 when exceeded) ([CTP task][eg-ctp-task]).
  - `idleTimeout` (default 1 hour).
  - `streamIdleTimeout` (default 5 minutes) ([timeout_types.go][eg-timeout-types]).

### Envoy Gateway BackendTrafficPolicy
- `timeout.http.requestTimeout`: "the time until which entire response is received from the upstream".
- `maxStreamDuration`: "does not apply to non-streaming requests. When set to '0s', no max duration is applied".
- `connectionIdleTimeout`: default 1 hour.
- ([timeout_types.go][eg-timeout-types]). Not needed if the HTTPRoute sets `timeouts`.

### How the client IP reaches the API (AC-474)
1. **L4 into Envoy.** Envoy Gateway's generated Service defaults to `type: LoadBalancer` and `externalTrafficPolicy: Local`: "traffic will only go to pods on the node receiving the traffic" ([shared_types.go][eg-shared]). `Local` keeps the source IP unless the load balancer SNATs. The Kubernetes source-IP mechanics are in the sibling doc (§3).
2. **Inside Envoy.** With Envoy's defaults (`xff_num_trusted_hops` 0), the trusted client address is "the source IP address of the immediate downstream node's connection to Envoy". Envoy appends it: "XFF is changed to [original values], [downstream IP]". It sets `x-envoy-external-address` to the trusted client address for external requests ([Envoy XFF][envoy-xff]).
   - Envoy Gateway confirms the append ("Envoy automatically appends the downstream client address to `X-Forwarded-For`") and that the backend sees `X-Envoy-External-Address` ([CTP task][eg-ctp-task]).
   - That Envoy Gateway configures `use_remote_address: true` is inferred from this behaviour (UNVERIFIED by a direct quote).
3. **At Fastify.** Set `trustProxy` to the Envoy proxy pods' CIDR, never `true`. `request.ip` is then the rightmost untrusted XFF entry, which is the address Envoy appended. A client-supplied XFF can't override it. Fastify's semantics are sourced in `mcp-deployment-and-tokens.md` §3; applying them to Envoy is an inference.
   - The Envoy pods run in `envoy-gateway-system` by default (the quickstart's Service lookup uses `-n envoy-gateway-system` ([EG quickstart][eg-qs])), not in wechart's namespace.
   - wechart must also set `WECHART_TRUST_PROXY` in every security mode (sibling doc, Finding 4).
4. **An L7 load balancer in front.** Set CTP `xForwardedFor.trustedCIDRs` to that load balancer's addresses so the allow-list sees the real client ([clienttrafficpolicy_types.go][eg-ctp]).
   - Envoy still appends its immediate peer (the load balancer) ([Envoy XFF][envoy-xff]), so Fastify must also trust the load balancer's CIDR, or `request.ip` becomes the load balancer (inference).
   - **PROXY protocol avoids this:** Envoy adds the PROXY-protocol client address to XFF ([clienttrafficpolicy_types.go][eg-ctp]).

## Gotchas

1. **Unmatched paths on the MCP host get 404.**
   - "When no rules matching a request have been successfully attached to the parent a request is coming from, a HTTP 404 status code MUST be returned" ([httproute_types.go][gw-hr-types]). So `/`, `/mcp/` and `/.well-known/…` return 404 and never reach the API.
   - The 1.6 spec page was summarised as "If no rules match a request … 500-series" ([v1.6 spec][gw-spec]). The Go source above is authoritative. A 500 is for invalid backends: "If *all* entries in BackendRefs are invalid … MUST receive a 500" ([httproute_types.go][gw-hr-types]).
   - Envoy Gateway's 404 body is UNVERIFIED.
   - A Host header that matches no route on the listener is expected to get 404 too (UNVERIFIED for Envoy Gateway).
2. **A SecurityPolicy on the HTTPRoute guards only `/mcp`.** Unlisted sources still get a 404 for other paths (inference from route attachment).
   - For a 403 on every path, target the Gateway (mode A) or a ListenerSet.
   - Whether Envoy Gateway applies a Gateway-level authorization to requests that match no route is UNVERIFIED. Test it.
3. **Policy precedence can silently widen access in mode B.** A route-level SecurityPolicy outranks a Gateway-level one ([SecurityPolicy concept][eg-sp]). wechart's route policy would replace an operator's gateway-wide allow-list rather than narrow it, unless `mergeType` is set (inference).
   - NGINX Gateway Fabric differs: its AccessPolicy intersects route-level allows with the Gateway range ([NGF PR #6063][ngf-pr]).
4. **Denied source → 403** `RBAC: access denied` (Envoy Gateway) ([restrict IP][eg-ip]). This reveals the host exists. Whether Envoy Gateway can change the status (Traefik can, with `rejectStatusCode` ([Traefik IPAllowList][traefik-ipal])) is UNVERIFIED.
5. **Envoy's 15 s default route timeout** ([EG timeouts][eg-timeouts], [Envoy timeouts FAQ][envoy-to]).
   - The timeout runs from the end of the request to the end of the upstream response. "This is typically a problem for streaming responses … will need to be disabled by setting to 0, or set to a long enough value" ([Envoy timeouts FAQ][envoy-to]).
   - wechart's MCP is stateless: the 2026-07-28 revision, with legacy GET answered `405` (`mcp-typescript-sdk.md` lines 29, 304). So SSE happens only inside one POST response, and a finite `request: 130s` bounds a tool call the same way `/api` is bounded (design inference).
   - Exceeding it gives `504` "upstream request timeout" ([EG timeouts][eg-timeouts]).
   - Envoy's stream idle timeout (default 5 minutes) also applies ([Envoy timeouts FAQ][envoy-to], [timeout_types.go][eg-timeout-types]).
6. **Buffering.**
   - Request buffering is opt-in: Envoy Gateway's `BackendTrafficPolicy.requestBuffer.limit` "does not work with streaming" ([EG request buffering][eg-buf]). Don't set it.
   - No response-buffering switch was found in Envoy Gateway's API. That Envoy forwards SSE chunks unbuffered by default is UNVERIFIED by a direct quote. Verify with `curl -N` against a tool that streams.
   - `X-Accel-Buffering: no` is an nginx convention (sibling doc). It is harmless through Envoy.
7. **TLS Secret namespace.**
   - Same namespace as the Gateway (or ListenerSet): no grant needed.
   - Cross-namespace: a ReferenceGrant in the Secret's namespace is required. Without it, the listener gets `ResolvedRefs=False` / `RefNotPermitted` ([gateway_types.go][gw-types], [TLS guide][gw-tls]).
8. **CRD version skew.** Envoy Gateway v1.9's default chart installs Gateway API v1.6.1 ([EG matrix][eg-matrix], [EG Helm][eg-helm]). Over a v1.6.3 cluster that is a downgrade, which the guide forbids ([CRD management][gw-crd]). Use `crds.enabled=false`, as under Install.
9. **Security patch is manual.** Override the proxy image to `distroless-v1.39.3` on v1.9.2 ([EG v1.9.2 notes][eg-192]).
10. **Privileged ports.** "When Envoy Gateway sees that its Listener is using a privileged port (<1024), it will map this internally to an unprivileged port" ([EG quickstart][eg-qs]). Port-forward targets the Service port, not the container port.
11. **docker-desktop.**
    - The Envoy Service is a LoadBalancer. On docker-desktop that publishes on the host's localhost, the same way wechart's web Service is published today (`values.yaml:25-26`). Port 443 must not clash with other local LoadBalancers.
    - The source IP Envoy sees for requests from the Mac host is UNVERIFIED (probably the Docker VM's gateway address, not 127.0.0.1). The dev allow-list must contain whatever is observed. Read `X-Envoy-External-Address` in the API log to find it.
    - Use `curl --resolve <mcp-host>:443:127.0.0.1` for the host name.
12. **Claude connectors.** The host needs a public IPv4 `A` record, and there must be no redirect on `/mcp` (sibling doc §1). This setup never redirects: there is only an HTTPS listener and no HTTP→HTTPS filter.

## Alternatives considered

| Implementation (version) | Allow-list resource and fields | Client-IP source | Maturity | Fit for wechart |
|---|---|---|---|---|
| **Envoy Gateway v1.9.2** (recommended) | `SecurityPolicy` `gateway.envoyproxy.io/v1alpha1`: `spec.authorization.{defaultAction, rules[].action, rules[].principal.clientCIDRs}`; targets Gateway / ListenerSet / HTTPRoute ([authorization_types.go][eg-authz], [SecurityPolicy concept][eg-sp]) | `ClientTrafficPolicy.clientIPDetection` (`xForwardedFor.numTrustedHops`/`trustedCIDRs`, `customHeader`, `directSourceIP`), `proxyProtocol` ([clienttrafficpolicy_types.go][eg-ctp]) | API v1alpha1. Feature shipped since v1.1.0 (2024-07) ([EG v1.1.0 notes][eg-110]). Passes the v1.6 timeout conformance tests ([v1.6 conformance][gw-conf]) | Standalone controller with one Envoy per Gateway. Multi-arch images. Needs no CNI or mesh. Explicit trusted-CIDR XFF handling |
| **NGINX Gateway Fabric v2.8.0** (2026-10-14) | `AccessPolicy` `gateway.nginx.org/v1alpha1`: `spec.action` (Allow/Deny), `spec.rules[]` (1–64; `name`, `source.type`, `source.ipAddress.address` CIDR); targets Gateway / HTTPRoute / GRPCRoute ([accesspolicy_types.go][ngf-ap], [NGF access policy][ngf-ap-doc]). Denied: 403 `<h1>403 Forbidden</h1>` ([NGF access policy][ngf-ap-doc]) | `NginxProxy.spec.rewriteClientIP` (`mode: ProxyProtocol \| XForwardedFor`, `trustedAddresses`, `setIPRecursively`) ([nginxproxy_types.go][ngf-np]) | AccessPolicy is new in v2.8.0, three days before this research ([NGF v2.8.0][ngf-280]). Bundles Gateway API v1.6.3 ([NGF v2.8.0][ngf-280]). Buffering: `ProxySettingsPolicy.buffering.disable` ([NGF proxy settings][ngf-ps]) | Gateway∩route intersection semantics are safer for shared Gateways ([NGF PR #6063][ngf-pr]). Rejected because the allow-list feature has no release history yet |
| **Istio 1.31.2** (2026-10-16) | `AuthorizationPolicy` `security.istio.io/v1`: `targetRef{group: gateway.networking.k8s.io, kind: Gateway}`, `action: ALLOW`, `rules[].from[].source.ipBlocks` or `remoteIpBlocks` ([Istio authz-ingress][istio-ingress], [Istio AuthorizationPolicy][istio-ap]). Denied: 403 "RBAC: access denied" ([Istio authz-ingress][istio-ingress]) | `ipBlocks` with `externalTrafficPolicy: Local`; `remoteIpBlocks` with `gatewayTopology.numTrustedProxies` or `proxyProtocol` ([Istio authz-ingress][istio-ingress]) | AuthorizationPolicy v1 is GA as an API. Maturity of `targetRef` to a Gateway API Gateway: UNVERIFIED | Adds istiod, a mesh control plane, for a single edge route. More components and more attack surface than needed |
| **Traefik v3.7.15** (2026-10-15) | `Middleware` `traefik.io/v1alpha1` `spec.ipAllowList.{sourceRange, ipStrategy.{depth, excludedIPs, ipv6Subnet}, rejectStatusCode}` (default 403), attached through an HTTPRoute `ExtensionRef` filter (`group: traefik.io, kind: Middleware`) ([Traefik IPAllowList][traefik-ipal], [Traefik Gateway API][traefik-gw]) | Remote address by default; XFF through `ipStrategy` ([Traefik IPAllowList][traefik-ipal]) | Gateway API provider supports spec v1.6.3 ([Traefik Gateway API][traefik-gw]). Fails v1.6 "HTTPRoute Retry Backend Timeout" conformance ([v1.6 conformance][gw-conf]). ExtensionRef needs the Traefik CRD provider enabled ([Traefik Gateway API][traefik-gw]) | Allow-list lives in a filter inside the route, so it couples to the route. Can return 404 instead of 403 |
| **Cilium 1.20.3** | `CiliumClusterwideNetworkPolicy` `cilium.io/v2` selecting `reserved:ingress` with `ingress[].fromCIDRSet[].cidr`. Denied: 403 "Access denied" ([Cilium ingress policy][cilium-np]) | Traffic arriving at Envoy "for Ingress or Gateway API" gets the `ingress` identity. `externalTrafficPolicy: Local` "is not necessary" for source-IP visibility ([Cilium Gateway API][cilium-gw]) | The example shown is for Ingress only ([Cilium ingress policy][cilium-np]). Gateway API needs `kubeProxyReplacement=true` and `l7Proxy=true` ([Cilium Gateway API][cilium-gw]) | Requires Cilium as the CNI with kube-proxy replacement. Whether docker-desktop's built-in Kubernetes can run that is UNVERIFIED. Cluster-wide policy for one app route |

**Why Envoy Gateway**
- **Correctness:**
  - the allow-list and client-IP detection are separate, explicit resources;
  - `trustedCIDRs` resists XFF spoofing;
  - documented 403 behaviour;
  - passes the v1.6 timeout conformance tests.
- **Maintenance:** releases on two maintained lines; v1.9 is supported to 2027-02-14 ([EG matrix][eg-matrix]).
- **Security:** patches ship quickly. v1.9.2 fixed three remote DoS bugs, though the image override is manual ([EG v1.9.2 notes][eg-192]).
- **Fit:** no CNI or mesh dependency, arm64 images, and it runs on docker-desktop with LoadBalancer Services.

## Open questions / unverified

1. **AC-476 wording.** Should a non-listed source get `403` on `/mcp` only, or on every path of the host? This decides Gateway-level vs route-level targeting (Gotchas 2–3) and mode A vs B.
2. **Mode A vs mode B as the default** in `values.yaml`, and whether the chart may create a `Gateway` (needs a privileged role ([security][gw-sec])).
3. **Who owns the GatewayClass and the Gateway API CRDs** on the target clusters. On docker-desktop, wechart's dev docs install them.
4. **TLS certificate source** (cert-manager, enterprise PKI, or a pre-made Secret). cert-manager's Gateway API integration was not researched.
5. ~~UNVERIFIED: Envoy Gateway's `GatewayClass.controllerName` string; the quickstart manifest wasn't fetched.~~ Verified 2026-10-18: `gateway.envoyproxy.io/gatewayclass-controller` ([EG v1.9.2 quickstart.yaml][eg-qs-yaml]; see Install).
6. UNVERIFIED: Envoy Gateway's 404 body for an unmatched path or host, and whether Gateway-level authorization runs before route matching.
7. UNVERIFIED: Envoy streams SSE responses without buffering, by direct quote. Test with `curl -N`.
8. UNVERIFIED: the source IP Envoy sees on docker-desktop for requests from the Mac, and docker-desktop's pod CIDR, which `WECHART_TRUST_PROXY` needs.
9. UNVERIFIED: Envoy Gateway v1.9.0's ListenerSet conformance. The conformance page gave contradictory readings across two fetches ([v1.6 conformance][gw-conf]).
10. UNVERIFIED: that ClientTrafficPolicy has the same same-namespace rule as SecurityPolicy.
11. Whether to customise the deny status (for example to 404) on Envoy Gateway. Not researched.
12. This session's web-search budget was exhausted (200/200). Every claim above comes from directly fetched pages and APIs.

[gw-rel]: https://api.github.com/repos/kubernetes-sigs/gateway-api/releases
[gw-160]: https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.0
[gw-crds]: https://github.com/kubernetes-sigs/gateway-api/tree/v1.6.3/config/crd/standard
[gw-vap]: https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/config/crd/standard/gateway.networking.k8s.io_vap_safeupgrades.yaml
[gw-rg-crd]: https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/config/crd/standard/gateway.networking.k8s.io_referencegrants.yaml
[gw-start]: https://gateway-api.sigs.k8s.io/guides/getting-started/
[gw-ver]: https://gateway-api.sigs.k8s.io/docs/concepts/versioning/
[gw-crd]: https://gateway-api.sigs.k8s.io/guides/crd-management/
[gw-tls]: https://gateway-api.sigs.k8s.io/guides/user-guides/tls/
[gw-ns]: https://gateway-api.sigs.k8s.io/guides/user-guides/multiple-ns/
[gw-ls]: https://gateway-api.sigs.k8s.io/guides/user-guides/listener-set/
[gw-sec]: https://gateway-api.sigs.k8s.io/docs/concepts/security/
[gw-hr-ref]: https://gateway-api.sigs.k8s.io/reference/api-types/httproute/
[gw-spec]: https://gateway-api.sigs.k8s.io/reference/api-spec/1.6/spec/
[gw-geps]: https://gateway-api.sigs.k8s.io/geps/list/
[gw-conf]: https://gateway-api.sigs.k8s.io/docs/implementations/versions/v1.6/
[gw-hr-types]: https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/httproute_types.go
[gw-types]: https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/gateway_types.go
[gw-ls-types]: https://raw.githubusercontent.com/kubernetes-sigs/gateway-api/v1.6.3/apis/v1/listenerset_types.go
[eg-rel]: https://api.github.com/repos/envoyproxy/gateway/releases
[eg-helm]: https://gateway.envoyproxy.io/docs/install/install-helm/
[eg-matrix]: https://gateway.envoyproxy.io/news/releases/matrix/
[eg-192]: https://gateway.envoyproxy.io/news/releases/notes/v1.9.2
[eg-110]: https://gateway.envoyproxy.io/news/releases/notes/v1.1.0/
[eg-qs]: https://gateway.envoyproxy.io/docs/tasks/quickstart/
[eg-qs-yaml]: https://github.com/envoyproxy/gateway/releases/download/v1.9.2/quickstart.yaml
[eg-ip]: https://gateway.envoyproxy.io/docs/tasks/security/restrict-ip-access/
[eg-ctp-task]: https://gateway.envoyproxy.io/docs/tasks/traffic/client-traffic-policy/
[eg-timeouts]: https://gateway.envoyproxy.io/docs/tasks/traffic/http-timeouts/
[eg-buf]: https://gateway.envoyproxy.io/docs/tasks/traffic/request-buffering/
[eg-sp]: https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/security-policy/
[eg-authz]: https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/authorization_types.go
[eg-ctp]: https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/clienttrafficpolicy_types.go
[eg-shared]: https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/shared_types.go
[eg-timeout-types]: https://raw.githubusercontent.com/envoyproxy/gateway/v1.9.2/api/v1alpha1/timeout_types.go
[dh-eg]: https://hub.docker.com/v2/repositories/envoyproxy/gateway/tags/v1.9.2
[dh-envoy]: https://hub.docker.com/v2/repositories/envoyproxy/envoy/tags/distroless-v1.39.3
[envoy-to]: https://www.envoyproxy.io/docs/envoy/latest/faq/configuration/timeouts
[envoy-xff]: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_conn_man/headers#x-forwarded-for
[ngf-280]: https://github.com/nginx/nginx-gateway-fabric/releases/tag/v2.8.0
[ngf-pr]: https://github.com/nginx/nginx-gateway-fabric/pull/6063
[ngf-ap]: https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.8.0/apis/v1alpha1/accesspolicy_types.go
[ngf-ap-doc]: https://docs.nginx.com/nginx-gateway-fabric/traffic-security/access-policy/
[ngf-np]: https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.8.0/apis/v1alpha2/nginxproxy_types.go
[ngf-ps]: https://docs.nginx.com/nginx-gateway-fabric/traffic-management/proxy-settings/
[istio-ap]: https://istio.io/latest/docs/reference/config/security/authorization-policy/
[istio-ingress]: https://istio.io/latest/docs/tasks/security/authorization/authz-ingress/
[traefik-ipal]: https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ipallowlist/
[traefik-gw]: https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/gateway-api/
[cilium-np]: https://docs.cilium.io/en/stable/network/servicemesh/ingress-and-network-policy/
[cilium-gw]: https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gateway-api/
