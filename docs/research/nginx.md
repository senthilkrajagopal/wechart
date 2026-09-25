---
library: nginx
packages: []
version: "nginx 1.30.5 (stable), image nginxinc/nginx-unprivileged:1.30.5-alpine-slim@sha256:307ca0bded4dda86dade6f5bd2a2551601bec9bac3fd73a21613fabcd9eca66a"
researched: 2026-09-25
sources:
  [
    https://nginx.org/en/download.html,
    https://nginx.org/en/CHANGES-1.30,
    https://nginx.org/en/CHANGES,
    https://nginx.org/en/docs/http/ngx_http_core_module.html,
    https://nginx.org/en/docs/http/ngx_http_proxy_module.html,
    https://nginx.org/en/docs/http/ngx_http_upstream_module.html,
    https://nginx.org/en/docs/http/ngx_http_headers_module.html,
    https://nginx.org/en/docs/http/ngx_http_gzip_module.html,
    https://nginx.org/en/docs/http/ngx_http_index_module.html,
    https://nginx.org/en/docs/http/ngx_http_rewrite_module.html,
    https://nginx.org/en/docs/http/ngx_http_map_module.html,
    https://nginx.org/en/docs/ngx_core_module.html,
    https://hub.docker.com/_/nginx,
    https://hub.docker.com/r/nginxinc/nginx-unprivileged,
    https://github.com/nginx/docker-nginx,
    https://github.com/nginx/docker-nginx-unprivileged,
    https://github.com/docker-library/docs/blob/master/nginx/content.md,
    https://github.com/nginx/pkg-oss/tree/1.30.5-1,
  ]
---

# nginx 1.30.5 (container `nginxinc/nginx-unprivileged:1.30.5-alpine-slim`)

## Summary

nginx serves the built Vite + React SPA and reverse-proxies `/api/` to the Fastify API Service inside the Helm release. It covers F24 / AC-248: "SHALL serve the web app at the address the values name", which fails when "the web app's address does not load, or a query from the web app does not reach the data source" (`docs/spec.md` L827–828).

**Version.** The current stable release is **nginx-1.30.5**. The current mainline is 1.31.6 ([download page][dl]). Both were released on 2026-09-15 with a fix for an HTTP/3 buffer overflow (CVE-2026-90439) ([nginx.org news][news], [CHANGES-1.30][ch130]). The 1.30.x branch started at 1.30.0 on 2026-04-14 ([CHANGES-1.30][ch130]), after mainline 1.29.8 (2026-04-07) ([CHANGES][ch]). So 1.29.x features, such as `add_header_inherit` (1.29.3) and the HTTP/1.1 + keepalive proxy defaults (1.29.7), are in 1.30.5 ([CHANGES][ch]).

**Recommendation: `nginxinc/nginx-unprivileged`, not `nginx`.** Pin `nginxinc/nginx-unprivileged:1.30.5-alpine-slim@sha256:307ca0bded4dda86dade6f5bd2a2551601bec9bac3fd73a21613fabcd9eca66a` ([Hub tag API][hub-u-slim]). The comparison is under "Alternatives considered". Why:
- It runs as numeric UID 101, listens on 8080, and keeps its pid and temp files in `/tmp` ([unprivileged alpine-slim Dockerfile][du-slim]).
- Under `readOnlyRootFilesystem: true`, `/tmp` is the only path that must be writable, unless the envsubst templates are used.
- The official image starts as root on port 80. It needs a replacement `nginx.conf` before it can run non-root or read-only ([docker-library docs][dn-docs]).
- `-alpine-slim` is chosen over `-alpine` because `-alpine` adds dynamic modules that this job doesn't use: xslt, geoip, image-filter and njs ([unprivileged alpine Dockerfile][du-alpine]). `-alpine` compresses to 23,067,257 bytes on amd64 against 5,739,300 for `-alpine-slim` ([`-alpine` tag][hub-u-alpine], [`-alpine-slim` tag][hub-u-slim]).
- Slim still has `gettext-envsubst` and the same entrypoint scripts ([du-slim]).
- If you'd rather pin the exact variant you asked me to compare, use `nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5` ([hub-u-alpine]).

**arm64 (Apple silicon): yes, for every candidate.**

| Image | Index digest | arm64 digest |
| --- | --- | --- |
| `nginxinc/nginx-unprivileged:1.30.5-alpine-slim` | as above | `sha256:086b50cf2889ad86d4439d2d310ad2889f4d96030696a2a5885db40de2e10900` ([hub-u-slim]) |
| `nginxinc/nginx-unprivileged:1.30.5-alpine` | as above | `sha256:98ae898055c08d3f2738a27d23fe3cbb3e256aa6060239cbaa17b4cd7f3f31ac` ([hub-u-alpine]) |
| `nginx:1.30.5-alpine` | `sha256:bf3201ab56f23e5954646379c775d511fc466e9f11376d9725361064ad07ed35` | arm64/v8 `sha256:3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83` ([hub-n-alpine]) |

All three are built on Alpine 3.24: `1.30.5-alpine` and `1.30.5-alpine3.24` resolve to the same digest ([hub-u-a324], [hub-n-a324]).

## Install

A container image, not an npm package. The web image builds FROM the pinned base and copies Vite's `dist/` into the docroot that the stock config uses, `/usr/share/nginx/html` ([pkg-oss default.conf 1.30.5-1][pkg-default]):

```dockerfile
FROM nginxinc/nginx-unprivileged:1.30.5-alpine-slim@sha256:307ca0bded4dda86dade6f5bd2a2551601bec9bac3fd73a21613fabcd9eca66a
COPY packages/web/dist/ /usr/share/nginx/html/
# no USER line needed: the base already ends with `USER 101`, EXPOSE 8080, STOPSIGNAL SIGQUIT
```

Base image facts, all from the [unprivileged alpine-slim Dockerfile][du-slim]:
- `ARG UID=101`, `ARG GID=101` and `USER $UID`.
- `EXPOSE 8080`, `STOPSIGNAL SIGQUIT`, `ENTRYPOINT ["/docker-entrypoint.sh"]`, `CMD ["nginx", "-g", "daemon off;"]`.

The web app uses Vite's defaults: no `base` or `build` override in `packages/web/vite.config.ts`, so output goes to `dist` with assets under `assets/` ([Vite build options][vite-build]). Tags are mutable and digests are not, which is why the pin includes the digest ([docker pull by digest][docker-pull]).

## Init / auth pattern

No auth. Everything is configured through one server file that replaces the image's `/etc/nginx/conf.d/default.conf`.

**The image's `nginx.conf`.**
- In the 1.30.5-1 package it is `user nginx; worker_processes auto; pid /run/nginx.pid; … http { include /etc/nginx/mime.types; default_type application/octet-stream; … sendfile on; keepalive_timeout 65; #gzip on; include /etc/nginx/conf.d/*.conf; }` ([pkg-oss nginx.conf 1.30.5-1][pkg-conf]).
- The unprivileged image then edits it with `sed` ([du-slim]):
  - deletes `user  nginx;`
  - rewrites the pid path to `/tmp/nginx.pid`
  - inserts `proxy_temp_path /tmp/proxy_temp; client_body_temp_path /tmp/client_temp; fastcgi_temp_path /tmp/fastcgi_temp; uwsgi_temp_path /tmp/uwsgi_temp; scgi_temp_path /tmp/scgi_temp;` after `http {`
  - rewrites `listen 80;` to `listen 8080;` in `default.conf`
- Files in `conf.d/` are included **inside `http {}`**, so the file below can hold `map`, `gzip` and `server_tokens` at http level.

**Recommended `/etc/nginx/conf.d/default.conf`.** Helm renders it into a ConfigMap. `<…>` marks values that are still decisions; see "Open questions".

```nginx
server_tokens off;

gzip on;
gzip_vary on;
gzip_types text/css application/javascript application/json image/svg+xml text/plain;

map $http_x_forwarded_proto $wechart_forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}

server {
    listen 8080;
    root  /usr/share/nginx/html;
    index index.html;

    absolute_redirect off;

    add_header_inherit merge;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "frame-ancestors <SOURCES>" always;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location /api/ {
        proxy_pass http://<release>-api:4100;          # no URI part: /api/load arrives as /api/load
        client_max_body_size <SIZE above 3m>;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $wechart_forwarded_proto;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Request-Id      $request_id;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri /index.html;
    }
}
```

**Kubernetes container fragment.** Each field is justified in "API surface" §9.

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 101
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: [ALL] }
  seccompProfile: { type: RuntimeDefault }
ports: [{ name: http, containerPort: 8080 }]
volumeMounts:
  - { name: tmp,        mountPath: /tmp }
  - { name: nginx-conf, mountPath: /etc/nginx/conf.d, readOnly: true }
readinessProbe: { httpGet: { path: /healthz, port: http } }
livenessProbe:  { httpGet: { path: /healthz, port: http } }
# volumes: tmp -> emptyDir: {}; nginx-conf -> configMap: <release>-web-nginx
# pod template annotation: checksum/config: {{ include (print $.Template.BasePath "/<web-nginx-configmap>.yaml") . | sha256sum }}
```

## API surface we will use

### 1. SPA fallback: `root`, `index`, `try_files`, location matching

- **`root path;`** (default `root html;`; context http/server/location). "A path to the file is constructed by merely adding a URI to the value of the `root` directive" ([core#root][core-root]).
- **`index file ...;`** (default `index index.html;`). "Using an index file causes an internal redirect, and the request can be processed in a different location" ([index][index]).
- **`try_files file ... uri;` / `try_files file ... =code;`** (context server, location). It "checks the existence of files in the specified order and uses the first found file". "It is possible to check directory's existence by specifying a slash at the end of a name, e.g. "`$uri/`"". "If none of the files were found, an internal redirect to the `uri` specified in the last parameter is made". The last parameter can be `=code` (0.7.51) ([core#try_files][core-tf]).
- **Location selection.** nginx first selects the longest matching prefix location. It then checks regex locations in order, and the first regex match wins. `=` is an exact match and "the search terminates". `^~` on the longest prefix skips the regex checks ([core#location][core-loc]).

How it fits together for wechart:
- **Deep links.** `/explore/…`, `/model/files/…` and `/dashboards/…` match `location /`. `try_files $uri /index.html` finds no file and internally redirects to `/index.html` ([core-tf]). The redirected request is matched again, lands in `location = /index.html` and gets `Cache-Control: no-cache`.
- **No `$uri/` needed.** The only directory that needs an index is `/`. For `/`, `$uri` without a slash is not a file, so it falls back to `/index.html` (inference from [core-tf]). Dropping `$uri/` also avoids directory handling for `/assets`.
- **Missing hashed assets return 404, not `index.html`.** `location /assets/ { try_files $uri =404; }` returns 404 when a chunk is missing, instead of HTML with `200`. Vite's production asset URLs have the form `/assets/img.2d8efhg.png` ([Vite assets][vite-assets]) under `build.assetsDir` (default `'assets'`) ([vite-build]).
- **Why the exact `location = /index.html` matters.** Without it, a missing `index.html` would re-enter `location /`, and `try_files` would redirect to `/index.html` again. nginx caps internal redirects at 10 per request and then returns 500 "rewrite or internal redirection cycle" ([core#internal][core-int]). With the exact location, a missing `index.html` is a plain 404 (inference from [core-loc] + [core-int]).
- **`public/` files.** Files in Vite's `public/` are "copied to the root of the dist directory as-is", without hashes ([vite-assets]). They are served by `location /` without immutable caching. `packages/web` has no `public/` directory today (repo glob).

### 2. Cache headers

- **`add_header name value [always];`** It applies only when the status is 200, 201, 204, 206, 301, 302, 303, 304, 307 or 308. `always` (1.7.5) adds the header for every status ([headers#add_header][headers]).
  - So the immutable `Cache-Control` on `/assets/` is deliberately **not** `always`. A 404 for a missing chunk must not be cached for a year (inference from the status list).
- **Hashed assets.** MDN's cache-busting pattern is `Cache-Control: max-age=31536000, immutable`: "the content will never change". `immutable` means "the response will not be updated while it's fresh" ([MDN Cache-Control][mdn-cc]).
- **`index.html`.** `no-cache` means the response "must be validated with the origin server before each reuse" ([mdn-cc]). nginx emits `ETag` by default (`etag on;`) ([core#etag][core-etag]), so revalidation can answer 304.
- **`add_header Cache-Control` rather than `expires`.** `expires` also adds or modifies `Cache-Control`: negative → `no-cache`, positive → `max-age=t`, `max` → 10 years ([headers#expires][headers]). Using both would emit two `Cache-Control` fields (inference from both descriptions).

### 3. gzip

- `gzip on|off;` defaults to `off` ([gzip][gzip]). The stock `nginx.conf` leaves `#gzip  on;` commented out ([pkg-conf]).
- `gzip_types` (default `text/html`) adds MIME types. "Responses with the "text/html" type are always compressed" ([gzip]).
- `gzip_vary on` inserts `Vary: Accept-Encoding` ([gzip]).
- In the 1.30.5 `mime.types`, `.js` → `application/javascript`, `.css` → `text/css`, `.json` → `application/json` and `.svg` → `image/svg+xml`. There is **no `.map` or `.mjs` entry** ([mime.types @ release-1.30.5][mime]), so those would get `default_type application/octet-stream` ([pkg-conf]).
- `gzip_proxied` (default `off`) controls compression when the **client request** carries a `Via` header, i.e. when it arrives through another proxy ([gzip]). If a Via-adding proxy sits in front of this pod, set `gzip_proxied any` or nothing will be compressed.

### 4. Reverse proxy of `/api/`

**`proxy_pass URL;`** (context location, `if in location`, `limit_except`) ([proxy#proxy_pass][proxy-pass]). The exact rules:
- "If the `proxy_pass` directive is specified with a URI, then when a request is passed to the server, the part of a normalized request URI matching the location is replaced by a URI specified in the directive."
- "If `proxy_pass` is specified without a URI, the request URI is passed to the server in the same form as sent by a client when the original request is processed, or the full normalized request URI is passed when processing the changed URI."
- Regex locations and named locations must use no URI. With `rewrite … break` the URI in `proxy_pass` is ignored. With variables, a URI in the directive "is passed to the server as is, replacing the original request URI."

What that means here:
- The Fastify routes are registered with the `/api` prefix, e.g. `'/api/dashboards/:dashboardId/images'` (`packages/api/src/server.ts` L792). So use **`proxy_pass http://<release>-api:4100;` with no URI**, and `/api/load` stays `/api/load`.
- `proxy_pass http://…:4100/;` would strip `/api/` and send `/load`.
- No URI also preserves percent-encoding exactly as the client sent it. That matters for `/api/running-query/${encodeURIComponent(requestId)}` (`packages/web/src/query/loadTile.ts` L76). "Normalized" includes "decoding the text encoded in the "%XX" form" ([core-loc]).

**Proxy directives:**
- **`proxy_http_version 1.0 | 1.1 | 2;`** "Since 1.29.7, version 1.1 is used by default. Before 1.29.7, version 1.0 was used by default" ([proxy#proxy_http_version][proxy-hv]). The 1.29.7 CHANGES entry: "now ngx_http_proxy_module supports keepalive by default; the default value for "proxy_http_version" is "1.1"; the "Connection" proxy header is not sent by default anymore." It also says "now the "keepalive" directive in the "upstream" block is enabled by default" ([CHANGES][ch]). `keepalive` now defaults to `keepalive 32 local;` ([upstream#keepalive][up-ka]).
  - **Doc inconsistency:** the `proxy_set_header` page still lists `proxy_set_header Connection close;` as a default ([proxy#proxy_set_header][proxy-sh]). Setting `proxy_http_version 1.1;` and `proxy_set_header Connection "";` explicitly is correct either way. An empty value means the field "will not be passed" ([proxy-sh]), and clearing Connection is the documented keepalive requirement ([up-ka]).
- **`proxy_set_header field value;`**
  - Defaults are `Host $proxy_host` plus Connection.
  - "These directives are inherited from the previous configuration level if and only if there are no `proxy_set_header` directives defined on the current level" ([proxy-sh]).
  - `$host` resolves to "host name from the request line, or host name from the "Host" request header field, or the server name matching a request" ([core vars][core-vars]).
  - `$proxy_add_x_forwarded_for` is the client's `X-Forwarded-For` with `$remote_addr` appended, or just `$remote_addr` ([proxy vars][proxy-vars]).
  - `$request_id` is a "unique request identifier generated from 16 random bytes, in hexadecimal (1.11.0)" ([core-vars]).
  - `$scheme` is `http` or `https` ([core-vars]). Behind a TLS-terminating ingress it will read `http`, which is why the `map` above prefers an incoming `X-Forwarded-Proto`. `map`'s `default` applies when nothing matches ([map][map]).
- **Host header.** Leaving `Host` at its default (`$proxy_host`) matches the Vite dev/preview proxy's `changeOrigin: true` (`packages/web/vite.config.ts` L21–24), which the browser suite already exercises. Send the original host as `X-Forwarded-Host` instead. Set `proxy_set_header Host $host;` only if the API needs the public host.
- **`proxy_read_timeout`** (default 60s) is "between two successive read operations, not for the transmission of the whole response". **`proxy_send_timeout`** (default 60s) applies the same rule to writes. **`proxy_connect_timeout`** (default 60s) "cannot usually exceed 75 seconds" ([proxy-rt], [proxy-st], [proxy-ct]).
  - The web client polls `/api/load` with a separate request per "Continue wait" (`loadTile.ts` L100–150), so no single request is held open by the poll.
- **`proxy_buffering on|off;`** (default on). When on, a response that doesn't fit the buffers "can be saved to a temporary file"; `proxy_max_temp_file_size` defaults to 1024m. An upstream `X-Accel-Buffering: no` turns buffering off per response ([proxy-buf], [proxy-mtfs]).
- **`proxy_request_buffering`** (default on): "the entire request body is read from the client before sending the request to a proxied server" ([proxy-rb]).
  - Bodies spill to `client_body_temp_path` ([core#client_body_temp_path][core-cbtp]). That is `/tmp/client_temp` in the unprivileged image ([du-slim]).
- **`client_max_body_size size;`** (default `1m`; context http/server/location). Over the limit, "the 413 (Request Entity Too Large) error is returned to the client"; `0` disables the check ([core#client_max_body_size][core-cmbs]).
  - The API's image route sets `bodyLimit: 3 * 1024 * 1024` and returns its own JSON 413, "Images can be at most 2 MB." (`server.ts` L791–793, L924–929).
  - So nginx's limit on `/api/` must be **above** 3 MiB, or nginx's HTML 413 pre-empts the API's JSON answer.

### 5. When the upstream hostname is resolved (and Kubernetes DNS)

- **Literal hostname in `proxy_pass`** (no variables): "NGINX caches the DNS records until the next restart or configuration reload, ignoring the records' TTL values", and "If the domain name can't be resolved, NGINX fails to start or reload its configuration". This is an F5/NGINX vendor blog post from 2016 ([F5 blog][f5-dns]). If the name resolves to several addresses, "all of them will be used in a round-robin fashion" ([proxy-pass]).
- **Variables in `proxy_pass`:** "the name is searched among the described server groups, and, if not found, is determined using a resolver" ([proxy-pass]).
  - `resolver address ... [valid=time] [ipv4=on|off] [ipv6=on|off]` has no default. It caches answers by TTL unless `valid=` overrides it ([core#resolver][core-res]).
  - Downside of this form: "you can't specify the load‑balancing algorithm or other parameters to the `server` directive" ([f5-dns]).
- **Open-source `server … resolve` in an `upstream` block** (since 1.27.3). It re-resolves without restart, but "the server group must reside in the shared memory" (`zone`) and needs a `resolver` ([upstream#server][up], [CHANGES][ch]).
- **The image's resolver helper.** Setting `NGINX_ENTRYPOINT_LOCAL_RESOLVERS` makes `15-local-resolvers.envsh` export `NGINX_LOCAL_RESOLVERS` from the `nameserver` lines of `/etc/resolv.conf`, for use in envsubst templates ([script][dn-resolv], [PR #786][pr786]).
- **Kubernetes facts.**
  - A normal (non-headless) Service gets an A/AAAA record `my-svc.my-namespace.svc.cluster-domain.example` that "resolves to the cluster IP of the Service" ([k8s DNS][k8s-dns]).
  - The kubelet writes `search <namespace>.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5` into the pod's resolv.conf, so a short name expands within the namespace ([k8s-dns]).
  - `clusterIP` "may not be changed through updates" except for ExternalName type changes ([Service API][k8s-svc-api]).
  - Helm installs every `Service` before any `Deployment` (`InstallOrder`: … `Service`, `DaemonSet`, `Pod`, …, `Deployment` …) ([helm kind_sorter][helm-order]).
- **Recommendation (inference from the above).** A literal `proxy_pass http://<release>-api:4100;` suits this chart:
  - The API Service exists before the web pod starts.
  - Its ClusterIP is stable while the Service object exists.
  - Pod churn behind it doesn't change the IP nginx cached.
  - The residual risk is deleting and recreating the API Service, e.g. an uninstall/reinstall of only part of the release. That changes the IP while nginx holds the old one until it restarts.
  - The API Service **must not be headless** (`clusterIP: None`), because then the name resolves to pod IPs, which nginx would freeze at startup.

### 6. Envsubst templates (`/etc/nginx/templates/*.template`)

Both images ship `20-envsubst-on-templates.sh`, and the unprivileged copy is identical in these parts ([official script][dn-envsubst], [unprivileged script][du-envsubst]).

**When it runs.** `/docker-entrypoint.sh` runs `*.sh` files in `/docker-entrypoint.d/` in `sort -V` order, and only if they are executable. It sources `*.envsh` files. It does this **only when the command is `nginx` or `nginx-debug`** ([entrypoint][dn-ep]).

**Settings** ([docker-library docs][dn-docs], [dn-envsubst]):

| Variable | Default | Notes |
| --- | --- | --- |
| `NGINX_ENVSUBST_TEMPLATE_DIR` | `/etc/nginx/templates` | "When this directory doesn't exist, this function will do nothing" |
| `NGINX_ENVSUBST_TEMPLATE_SUFFIX` | `.template` | |
| `NGINX_ENVSUBST_OUTPUT_DIR` | `/etc/nginx/conf.d` | "must be writable by the user running a container". The output name is the template name minus the suffix, and subdirectories are preserved |
| `NGINX_ENVSUBST_FILTER` | empty | a regex; "only variables whose names match this pattern are available for substitution" |

Stream templates also exist: `.stream-template` → `/etc/nginx/stream-conf.d`.

**Only defined variables are substituted.** The script builds `defined_envs` from the names in `ENVIRON`, filtered by the regex, and runs `envsubst "$defined_envs"` ([dn-envsubst]). GNU envsubst with a SHELL-FORMAT argument substitutes "only those environment variables that are referenced in shell-format", in both `$VARIABLE` and `${VARIABLE}` form ([GNU envsubst][gnu-envsubst]). So nginx's `$uri` and `$host` survive unless an environment variable with that exact name exists.

**Read-only root filesystem.** If the template dir exists but the output dir isn't writable, the script logs `ERROR: … is not writable` and **returns 0**. nginx then starts with whatever is already in `conf.d` ([dn-envsubst]). This is issue #88 in the unprivileged repo, "Templating does not work if only /tmp is writable", still open ([issue #88][du-88]).
- Pointing `NGINX_ENVSUBST_OUTPUT_DIR` at `/tmp` renders the file, but nginx keeps using `conf.d` ([issue #76][du-76]), because `nginx.conf` includes only `/etc/nginx/conf.d/*.conf` ([pkg-conf]).
- To use templates read-only, mount an `emptyDir` at `/etc/nginx/conf.d` (inference from the above).

**Other entrypoint scripts under read-only.**
- `10-listen-on-ipv6-by-default.sh` exits 0 when it can't modify `default.conf`, or when `default.conf` differs from the packaged checksum. The unprivileged variant edits `listen 8080;` ([official][dn-ipv6], [unprivileged][du-ipv6]).
- `30-tune-worker-processes.sh` runs only when `NGINX_ENTRYPOINT_WORKER_PROCESSES_AUTOTUNE` is set, and exits 0 if `nginx.conf` is read-only ([dn-tune]).

**Recommendation for wechart.** Helm already templates the release-specific upstream name, so render the whole server file into a ConfigMap and **don't use envsubst**. With `/etc/nginx/conf.d` mounted from the ConfigMap, `/tmp` is the only writable path needed (inference from the scripts above).

### 7. Health endpoint

- `return code [text];` "Stops processing and returns the specified code". Its body type comes from `default_type`, whose default is `text/plain`, but the stock `nginx.conf` sets `application/octet-stream`, hence `default_type text/plain;` in the location ([rewrite#return][ret], [core#default_type][core-dt], [pkg-conf]).
- `access_log off;` "cancels all access_log directives on the current level" ([log][log]).
- Kubernetes httpGet probes treat "any code greater than or equal to 200 and less than 400" as success, default to the pod IP, and don't follow redirects to other hosts ([k8s probes][k8s-probes]).
- `location = /healthz` answers without touching disk or the API. Probing `/` would also return 200, since `index.html` is a file, but it reads the docroot and logs every probe (inference).
- Don't point nginx's liveness at `/api/health`. An API outage would then restart healthy web pods (inference).

### 8. Security headers and `server_tokens`

- **`server_tokens on | off | build | string;`** (default `on`) "Enables or disables emitting nginx version on error pages and in the "Server" response header field". The string form is commercial-only ([core#server_tokens][core-st]). `off` hides the version, not the word `nginx`.
- **OWASP recommendations** ([OWASP HTTP headers][owasp]):
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY` or preferably CSP `frame-ancestors`
  - remove `X-Powered-By`
  - `X-XSS-Protection: 0`
  - Its nginx example uses `add_header … always;`.
- **`nosniff`** blocks `script` destinations whose MIME type isn't JavaScript and `style` destinations that aren't `text/css` ([MDN X-Content-Type-Options][mdn-xcto]).
- **`strict-origin-when-cross-origin`** is already the browser default "if no policy is specified" ([MDN Referrer-Policy][mdn-rp]). Setting it is explicit, not a behaviour change.
- **`frame-ancestors`** "specifies valid parents that may embed a page". `'none'` is similar to `X-Frame-Options: deny`, and it is "not supported in the `<meta>` element", so it must be a response header ([MDN frame-ancestors][mdn-fa]).
- **HSTS** is only meaningful at the TLS terminator: "Browsers ignore the header if sent over HTTP" ([MDN HSTS][mdn-hsts]).
- **Pass `always`** so the security headers also reach 4xx/5xx responses ([headers]).

### 9. Kubernetes security fit (unprivileged image)

**Writable paths with `readOnlyRootFilesystem: true`:**
- `/tmp` holds the pid file `/tmp/nginx.pid` and the temp dirs `/tmp/{client_temp,proxy_temp,fastcgi_temp,uwsgi_temp,scgi_temp}` ([du-slim]). Mount an `emptyDir` there.
- The unprivileged README pins the `mkdir() "/var/cache/nginx/client_temp" failed` error on unset temp paths. Once they point to `/tmp`, **`/var/cache/nginx` needn't be writable** ([unprivileged README][du-readme]).
- `/run` and `/var/run` aren't needed: the pid file moved, and `lock_file` "is ignored" on systems where "the locks are implemented using atomic operations" ([core#lock_file][lock]).
- Logs: `/var/log/nginx/access.log` and `error.log` are symlinks to `/dev/stdout` and `/dev/stderr` ([du-slim]).
- `/etc/nginx/conf.d` must be writable only if envsubst templates are used (§6).

**Non-root.**
- The image ends with `USER $UID` (101, numeric) ([du-slim]). `runAsNonRoot: true` makes the kubelet "validate the image at runtime to ensure that it does not run as UID 0 (root)" ([Pod API][k8s-pod-api]).
- Port 8080 needs no `NET_BIND_SERVICE`, so `capabilities.drop: [ALL]` with nothing added is enough.
- The Restricted Pod Security Standard requires `allowPrivilegeEscalation: false`, `runAsNonRoot: true`, a `RuntimeDefault` or `Localhost` seccomp profile and dropping `ALL`, and permits `emptyDir` and `configMap` volumes ([PSS][k8s-pss]). `readOnlyRootFilesystem` "Default is false" ([k8s-pod-api]), so it has to be set explicitly.

**Config delivery.**
- A ConfigMap mounted as a whole directory is updated in place, eventually. A `subPath` mount "will not receive ConfigMap updates" ([ConfigMap][k8s-cm]).
- nginx re-reads config only on HUP or reload ([control][control], [switches][switches]). Roll pods on change with Helm's `checksum/config` annotation ([Helm tips][helm-roll]).

**Shutdown.**
- `QUIT` is "graceful shutdown", while `TERM` and `INT` are "fast shutdown" ([control]). The image sets `STOPSIGNAL SIGQUIT` ([du-slim]).
- Kubernetes uses the image's STOPSIGNAL when no custom stop signal is set, and the runtime default (SIGTERM) otherwise. That comes from a Kubernetes blog post, via the search snippet only; the full fetch was truncated ([k8s v1.33 blog][k8s-stop]).

## Gotchas

- **`add_header` inheritance.** "These directives are inherited from the previous configuration level if and only if there are no `add_header` directives defined on the current level" ([headers]). With plain inheritance, `/assets/` and `= /index.html` (which set `Cache-Control`) would **silently drop** the server-level security headers.
  - `add_header_inherit on | off | merge;` (1.29.3, so present in 1.30.5): "The `merge` parameter enables appending values from the previous level", and the rule itself "will be inherited in all nested levels recursively" ([headers]). The config above sets `add_header_inherit merge;` at server level.
  - The version-portable alternative is an `include` snippet with the security headers repeated in every location that has its own `add_header`.
- **`proxy_set_header` has the same all-or-nothing inheritance** ([proxy-sh]). Keep every `proxy_set_header` in the `/api/` location.
- **`add_header` skips 404/5xx without `always`** ([headers]). That is wanted for the immutable Cache-Control and unwanted for security headers.
- **Trailing slash on a `proxy_pass` location.** For `location /api/` handled by `proxy_pass`, a request for exactly `/api` gets a **301** to `/api/` ([core-loc]).
  - With `absolute_redirect on` (the default), nginx's redirects are absolute and include the port when `port_in_redirect on` (default) ([core#absolute_redirect][core-ar], [core#port_in_redirect][core-pir]). Behind a Service or ingress that would leak `:8080` into `Location`.
  - `absolute_redirect off;` makes nginx's own redirects relative ([core-ar]).
- **URI in `proxy_pass`.** `proxy_pass http://api:4100/;` (with a slash) rewrites `/api/x` → `/x` and forwards the *normalized* URI. Without a URI, the client's original URI goes through unchanged ([proxy-pass]). wechart's routes need the no-URI form.
- **`try_files` with `proxy_pass`.**
  - 1.29.4 fixed "a segmentation fault … if the "try_files" directive and "proxy_pass" with a URI were used" ([CHANGES][ch]), so 1.30.5 has the fix.
  - Keep `try_files` out of `/api/` anyway. A missing file would otherwise internally redirect API calls to `/index.html` (inference from [core-tf]).
  - Whether a server-level `try_files` is inherited into locations: UNVERIFIED (see Open questions). Keep it only in `location /` and `location /assets/`.
- **Replace the shipped `default.conf`.** In 1.30.5-1 it has only `location / { root …; index index.html index.htm; }` plus `error_page 500 502 503 504 /50x.html` ([pkg-default]). It has **no SPA fallback**, so deep links 404, and it has no `/api/`. The unprivileged image changes only its `listen` to 8080 ([du-slim]).
  - If our config is added beside it instead of replacing it, two `server` blocks listen on 8080. Which one wins isn't researched here. Replace it via a whole-directory ConfigMap mount, or by COPYing over `/etc/nginx/conf.d/default.conf`.
- **No IPv6 listen by default.** The IPv6 helper edits only the packaged `default.conf` (checksum match) ([du-ipv6]). Our replacement listens on IPv4 unless we add `listen [::]:8080;`.
- **Startup DNS failure.** A literal upstream name that doesn't resolve stops nginx from starting or reloading ([f5-dns]). `nginx -t` "tries to open files referred in the configuration" ([switches]).
  - Whether `-t` also fails on an unresolvable `proxy_pass` host outside the cluster: UNVERIFIED. The blog says only "start or reload". Test the rendered config where `<release>-api` resolves.
- **`client_max_body_size` 1m default** ([core-cmbs]). It is below the API's 3 MiB image-route limit (`server.ts` L793). It must be raised on `/api/`. The error page nginx returns is HTML, not the API's JSON.
- **Envsubst fails open under read-only root** ([dn-envsubst], [du-88]). The container starts with the image's stock `default.conf`: port 8080, no SPA fallback, no proxy. Kubernetes still reports it Ready if the probe path is `/`, which argues for probing `/healthz`, which exists only in our config.
- **Official image under the non-root and read-only docs.** The docker-library page still says the default config writes to `/var/cache/nginx` and `/var/run` ([dn-docs]). The 1.30.5 package's pid path is **`/run/nginx.pid`** ([pkg-conf], [pkg-mk]), and the unprivileged README records the move from `/var/run` to `/run` at 1.27.5 ([du-readme]).
- **Upstream keepalive timeouts.** nginx's upstream `keepalive_timeout` defaults to 60s ([upstream#keepalive_timeout][up-kt]). Fastify's `keepAliveTimeout` defaults to 72 s ([docs/research/api-framework.md](/Users/srajagopal/Work/wechart/docs/research/api-framework.md) L98). So nginx closes idle upstream connections before Fastify does (inference).
  - Whether the 1.29.7 default keepalive applies to a bare `proxy_pass host:port` with no `upstream` block: UNVERIFIED; the upstream docs don't say ([up-kt]).
- **The docs site describes mainline 1.31.x.** `location $variable` predicate locations are marked "(1.31.5)" ([core-loc]), and the Alpine packaging on pkg-oss `master` adds `--with-control-api` and `--with-http_json_module`. The `1.30.5-1` tag has neither ([pkg-mk]). Check the version note on every directive before using it.
- **GitHub releases lag Docker Hub tags** for the unprivileged image ([issue #415][du-415]). Use Hub digests and nginx.org CHANGES as the record, not GitHub releases.
- **Scanner findings are open against the official image.** Issue #1054 reports CVE-2026-45447 in `libcrypto3 3.5.6-r0` from Alpine 3.23.4 ([issue #1054][dn-1054]). The pinned images are on Alpine 3.24 ([hub-u-a324]). Whether 3.24's `libcrypto3` is affected is UNVERIFIED; scan the pinned digest.
- **Writable config if the root filesystem isn't read-only.** The unprivileged image does `chown -R $UID:0 /etc/nginx` and `chmod -R g+w /etc/nginx` ([du-slim]). Without `readOnlyRootFilesystem`, the nginx process can rewrite its own config (inference).

## Alternatives considered

Requested comparison: `nginx:1.30.5-alpine` vs `nginxinc/nginx-unprivileged:1.30.5-alpine` (plus `-alpine-slim`).

| Criterion | `nginx:1.30.5-alpine` (Docker Official Image) | `nginxinc/nginx-unprivileged:1.30.5-alpine[-slim]` |
| --- | --- | --- |
| Process user | No `USER`: master starts as root; workers drop to `nginx` (101) via `user nginx;` ([dn-slim], [pkg-conf]) | `USER 101`; `user` directive removed ([du-slim]) |
| `runAsNonRoot: true` | Kubelet rejects the root default unless `runAsUser: 101` is set, and then pid and temp paths fail until `nginx.conf` is replaced ([k8s-pod-api], [dn-docs]) | Passes as-is: numeric UID 101 ([du-slim], [k8s-pod-api]) |
| Listen port | `EXPOSE 80`, `listen 80` ([dn-slim], [pkg-default]). Non-root needs a port ≥ 1024 or `NET_BIND_SERVICE`, the only capability Restricted allows adding ([k8s-pss]) | `EXPOSE 8080`, `listen 8080` ([du-slim]) |
| pid file | `/run/nginx.pid` ([pkg-conf]) | `/tmp/nginx.pid` ([du-slim]) |
| Temp paths | `/var/cache/nginx/*_temp` ([pkg-mk]) | `/tmp/*_temp` ([du-slim]) |
| Writable under read-only root | `/var/cache/nginx` and the pid dir (`/run`), or a replacement `nginx.conf` ([dn-docs], [pkg-conf]) | `/tmp` only (+ `/etc/nginx/conf.d` if templates) ([du-readme], [du-slim]) |
| Envsubst templates | Yes (same script) ([dn-envsubst]) | Yes (same script); needs writable `conf.d` ([du-envsubst], [du-88]) |
| arm64 | arm64/v8 ([hub-n-alpine]) | arm64 ([hub-u-alpine], [hub-u-slim]) |
| Compressed size (amd64) | 26,073,522 B ([hub-n-a324]) | 23,067,257 B `-alpine`; 5,739,300 B `-alpine-slim` ([hub-u-alpine], [hub-u-slim]) |
| Maintainer / source | Docker Official Image, `nginx/docker-nginx` ([hub-nginx]) | NGINX, `nginx/docker-nginx-unprivileged` (Apache-2.0), also published to ECR, GHCR and Quay ([du-readme]) |

**Verdict:** the unprivileged image. It meets the Restricted profile and read-only root with one `emptyDir`, without replacing `nginx.conf`. `-alpine-slim` is preferred over `-alpine` because we use none of the extra modules; the stock `nginx.conf` has no `load_module` lines ([pkg-conf]).

## Open questions / unverified

- **`frame-ancestors` value.** Will wechart dashboards ever be embedded in another origin? That decides `'none'`, `'self'` or a list. It is a requirement question; I haven't assumed an answer.
- **`client_max_body_size` value for `/api/`.** It must exceed 3 MiB, the API's largest route `bodyLimit`. The exact figure is a plan decision. nginx's docs don't say whether `m` means 2^20 bytes ([syntax][syntax]), so a value strictly above `3m` avoids ambiguity. UNVERIFIED: the multiplier.
- **Longest single API request.** Any `/api/` route that can go 60 s without sending bytes (model publish, driver tests, pre-aggregation jobs?) will get a 504 from nginx unless `proxy_read_timeout` is raised on that path ([proxy-rt]). Not checked in the API code.
- **`X-Request-Id` is not consumed yet.** The API is created as `Fastify({ logger })` with no `requestIdHeader` (`server.ts` L160), so nginx's value isn't used as the request id. Fastify's `trustProxy` isn't set either, so `X-Forwarded-*` won't change `request.ip` (per [docs/research/api-framework.md](/Users/srajagopal/Work/wechart/docs/research/api-framework.md)). Decide whether to adopt them. Also decide whether to overwrite a client-supplied `X-Request-Id` (as written above) or pass it through.
- **UNVERIFIED: server-level `try_files` inheritance.** Whether it is inherited into nested locations: nginx.org doesn't say, and the trac search only covered `if` blocks ([trac #86][trac86]).
- **UNVERIFIED: startup resolution and the search list.** Whether startup resolution of a literal `proxy_pass` host goes through libc and so honours the pod's `search` list, which short names like `<release>-api` need. nginx.org doesn't document it. Tried the proxy, core and upstream module pages and the F5 blog. Whether nginx's own `resolver` applies search domains is also undocumented, so use a fully qualified name with the variable/`resolver` form. The cluster domain would then have to come from values.
- **UNVERIFIED: Kubernetes and image STOPSIGNAL.** Only the kubernetes.io blog search snippet supports it; the pod-lifecycle page fetch had no STOPSIGNAL text.
- **UNVERIFIED: `nginx -t` offline.** Whether it fails on an unresolvable upstream host outside the cluster.
- **UNVERIFIED: 1.29.7 keepalive for implicit upstreams.** Whether it covers `proxy_pass host:port` with no `upstream` block ([up-kt]).
- **UNVERIFIED: the `$uri/` directory case.** What a request for a directory without an index file returns (e.g. `/assets/` with `$uri/` in `try_files`). The recommended config avoids `$uri/`.
- **UNVERIFIED: libcrypto3 on Alpine 3.24.** Whether it is affected by CVE-2026-45447 ([dn-1054]).
- **Sizing `/tmp`.** The `emptyDir` holds request bodies and response spill (up to `proxy_max_temp_file_size` 1024m per response) ([proxy-mtfs]). An `emptyDir` `sizeLimit` wasn't researched here.

[dl]: https://nginx.org/en/download.html
[news]: https://nginx.org/
[ch130]: https://nginx.org/en/CHANGES-1.30
[ch]: https://nginx.org/en/CHANGES
[core-root]: https://nginx.org/en/docs/http/ngx_http_core_module.html#root
[core-tf]: https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files
[core-loc]: https://nginx.org/en/docs/http/ngx_http_core_module.html#location
[core-int]: https://nginx.org/en/docs/http/ngx_http_core_module.html#internal
[core-etag]: https://nginx.org/en/docs/http/ngx_http_core_module.html#etag
[core-cmbs]: https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size
[core-cbtp]: https://nginx.org/en/docs/http/ngx_http_core_module.html#client_body_temp_path
[core-st]: https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens
[core-ar]: https://nginx.org/en/docs/http/ngx_http_core_module.html#absolute_redirect
[core-pir]: https://nginx.org/en/docs/http/ngx_http_core_module.html#port_in_redirect
[core-res]: https://nginx.org/en/docs/http/ngx_http_core_module.html#resolver
[core-dt]: https://nginx.org/en/docs/http/ngx_http_core_module.html#default_type
[core-vars]: https://nginx.org/en/docs/http/ngx_http_core_module.html#variables
[index]: https://nginx.org/en/docs/http/ngx_http_index_module.html
[proxy-pass]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass
[proxy-hv]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_http_version
[proxy-sh]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header
[proxy-rt]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout
[proxy-st]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_send_timeout
[proxy-ct]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_connect_timeout
[proxy-buf]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering
[proxy-rb]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering
[proxy-mtfs]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_max_temp_file_size
[proxy-vars]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#variables
[up]: https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server
[up-ka]: https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive
[up-kt]: https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive_timeout
[headers]: https://nginx.org/en/docs/http/ngx_http_headers_module.html
[gzip]: https://nginx.org/en/docs/http/ngx_http_gzip_module.html
[ret]: https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return
[map]: https://nginx.org/en/docs/http/ngx_http_map_module.html
[log]: https://nginx.org/en/docs/http/ngx_http_log_module.html#access_log
[lock]: https://nginx.org/en/docs/ngx_core_module.html#lock_file
[control]: https://nginx.org/en/docs/control.html
[switches]: https://nginx.org/en/docs/switches.html
[syntax]: https://nginx.org/en/docs/syntax.html
[mime]: https://raw.githubusercontent.com/nginx/nginx/release-1.30.5/conf/mime.types
[pkg-conf]: https://raw.githubusercontent.com/nginx/pkg-oss/1.30.5-1/alpine/alpine/nginx.conf
[pkg-default]: https://raw.githubusercontent.com/nginx/pkg-oss/1.30.5-1/alpine/alpine/nginx.default.conf
[pkg-mk]: https://raw.githubusercontent.com/nginx/pkg-oss/1.30.5-1/alpine/Makefile
[hub-nginx]: https://hub.docker.com/_/nginx
[hub-n-alpine]: https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.5-alpine
[hub-n-a324]: https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.5-alpine3.24
[hub-u-alpine]: https://hub.docker.com/v2/repositories/nginxinc/nginx-unprivileged/tags/1.30.5-alpine
[hub-u-a324]: https://hub.docker.com/v2/repositories/nginxinc/nginx-unprivileged/tags/1.30.5-alpine3.24
[hub-u-slim]: https://hub.docker.com/v2/repositories/nginxinc/nginx-unprivileged/tags/1.30.5-alpine-slim
[dn-slim]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/Dockerfile
[dn-ep]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/docker-entrypoint.sh
[dn-envsubst]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/20-envsubst-on-templates.sh
[dn-ipv6]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/10-listen-on-ipv6-by-default.sh
[dn-resolv]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/15-local-resolvers.envsh
[dn-tune]: https://github.com/nginx/docker-nginx/blob/master/stable/alpine-slim/30-tune-worker-processes.sh
[dn-docs]: https://github.com/docker-library/docs/blob/master/nginx/content.md
[dn-1054]: https://github.com/nginx/docker-nginx/issues/1054
[pr786]: https://github.com/nginx/docker-nginx/pull/786
[du-readme]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/README.md
[du-slim]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine-slim/Dockerfile
[du-alpine]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine/Dockerfile
[du-ipv6]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine-slim/10-listen-on-ipv6-by-default.sh
[du-envsubst]: https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine-slim/20-envsubst-on-templates.sh
[du-76]: https://github.com/nginx/docker-nginx-unprivileged/issues/76
[du-88]: https://github.com/nginx/docker-nginx-unprivileged/issues/88
[du-415]: https://github.com/nginx/docker-nginx-unprivileged/issues/415
[f5-dns]: https://www.f5.com/company/blog/nginx/dns-service-discovery-nginx-plus
[trac86]: https://trac.nginx.org/nginx/ticket/86
[gnu-envsubst]: https://www.gnu.org/software/gettext/manual/html_node/envsubst-Invocation.html
[k8s-dns]: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
[k8s-svc-api]: https://kubernetes.io/docs/reference/kubernetes-api/service-resources/service-v1/
[k8s-probes]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
[k8s-pss]: https://kubernetes.io/docs/concepts/security/pod-security-standards/
[k8s-pod-api]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
[k8s-cm]: https://kubernetes.io/docs/concepts/configuration/configmap/
[k8s-stop]: https://kubernetes.io/blog/2025/05/14/kubernetes-v1-33-updates-to-container-lifecycle/
[helm-order]: https://github.com/helm/helm/blob/main/pkg/release/v1/util/kind_sorter.go
[helm-roll]: https://helm.sh/docs/howto/charts_tips_and_tricks/
[docker-pull]: https://docs.docker.com/reference/cli/docker/image/pull/
[vite-build]: https://vite.dev/config/build-options
[vite-assets]: https://vite.dev/guide/assets
[mdn-cc]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
[mdn-xcto]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options
[mdn-rp]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
[mdn-fa]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
[mdn-hsts]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
[owasp]: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
